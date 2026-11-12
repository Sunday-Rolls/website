/**
 * Sunday Rolls Google Ads connector: a remote MCP server (Streamable HTTP, JSON responses) at
 * /mcp, plus the OAuth endpoints Claude uses to sign in. Add it in Claude as a custom connector
 * with the URL https://dashboard.sundayrollsgolf.com/mcp. See docs/GOOGLE_ADS_CONNECTOR.md.
 */
import { Hono, type Context } from 'hono'
import { normalizeEmail, verifyPassword } from '../analytics/auth.js'
import { googleAdsMissingEnv, loadGoogleAdsCredentialsFromEnv, type GoogleAdsCredentials } from '../analytics/google-ads.js'
import type { AnalyticsStore } from '../analytics/store.js'
import type { RateLimiter } from '../rate-limit.js'
import { GOOGLE_ADS_TOOLS, ToolInputError, type ToolContext } from './google-ads-tools.js'
import {
  ACCESS_TTL_S,
  CODE_TTL_S,
  findClient,
  oauthSecret,
  pkceMatches,
  redirectUriAllowed,
  REFRESH_TTL_S,
  registerClient,
  signToken,
  verifyToken,
} from './oauth.js'

export type McpDeps = {
  store: AnalyticsStore
  checkRateLimit: RateLimiter
  env?: NodeJS.ProcessEnv
  /** Tests: stub Google Ads. */
  fetchImpl?: typeof fetch
  getToken?: (creds: GoogleAdsCredentials) => Promise<string>
}

const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'sunday-rolls-google-ads', title: 'Sunday Rolls Google Ads', version: '1.0.0' }
const INSTRUCTIONS =
  'Google Ads for Sunday Rolls Golf (account 299-697-4701). Read tools query the live account. Change tools are two-step: ' +
  'call without confirm_token to get a validated preview, show the user exactly what will change and get an explicit yes, ' +
  'then call again with the same arguments and the confirm_token. Never apply a change the user has not approved. ' +
  'Google Ads conversions can differ from real Shopify orders, so say so when using them to judge performance.'

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

export function createMcpRoutes(deps: McpDeps) {
  const app = new Hono()
  const { store, checkRateLimit } = deps
  const env = deps.env ?? process.env
  const usedCodes = new Map<string, number>()

  function baseUrl(c: Context): string {
    const configured = env.MCP_PUBLIC_URL?.trim()
    if (configured) return configured.replace(/\/$/, '')
    const url = new URL(c.req.url)
    const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '')
    const host = c.req.header('x-forwarded-host') || c.req.header('host') || url.host
    return `${proto}://${host}`
  }

  // ---------- discovery ----------

  const protectedResource = (c: Context) =>
    c.json({
      resource: `${baseUrl(c)}/mcp`,
      authorization_servers: [baseUrl(c)],
      bearer_methods_supported: ['header'],
      resource_name: SERVER_INFO.title,
    })
  app.get('/.well-known/oauth-protected-resource', protectedResource)
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResource)

  const authServer = (c: Context) => {
    const base = baseUrl(c)
    return c.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: ['google-ads'],
    })
  }
  app.get('/.well-known/oauth-authorization-server', authServer)
  app.get('/.well-known/oauth-authorization-server/mcp', authServer)

  // ---------- registration ----------

  app.post('/oauth/register', async (c) => {
    const rate = checkRateLimit(`mcp-register:${clientIp(c)}`, { limit: 20, windowMs: 60 * 60_000 })
    if (!rate.ok) return c.json({ error: 'slow_down' }, 429)
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'invalid_client_metadata', error_description: 'JSON body required' }, 400)
    }
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : []
    if (!uris.length || uris.length > 5 || !uris.every(redirectUriAllowed)) {
      return c.json(
        { error: 'invalid_redirect_uri', error_description: 'Only Claude (claude.ai / claude.com) or loopback redirect URIs are allowed' },
        400,
      )
    }
    const client = await registerClient(store, { redirectUris: uris, name: String(body.client_name ?? '') })
    return c.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      201,
    )
  })

  // ---------- authorize ----------

  type AuthorizeParams = {
    client_id: string
    redirect_uri: string
    state: string
    code_challenge: string
    code_challenge_method: string
    response_type: string
  }

  const readParams = (get: (k: string) => string | undefined): AuthorizeParams => ({
    client_id: get('client_id') ?? '',
    redirect_uri: get('redirect_uri') ?? '',
    state: get('state') ?? '',
    code_challenge: get('code_challenge') ?? '',
    code_challenge_method: get('code_challenge_method') ?? '',
    response_type: get('response_type') ?? '',
  })

  /** null when the request is acceptable, else a message (shown on the page, never redirected). */
  async function checkAuthorize(p: AuthorizeParams): Promise<string | null> {
    if (p.response_type !== 'code') return 'Unsupported response_type.'
    if (!p.code_challenge || p.code_challenge_method !== 'S256') return 'PKCE (S256) is required.'
    const client = await findClient(store, p.client_id)
    if (!client) return 'Unknown client. Remove and re-add the connector in Claude.'
    if (!client.redirectUris.includes(p.redirect_uri)) return 'redirect_uri doesn’t match this client.'
    return null
  }

  function page(c: Context, p: AuthorizeParams, opts: { error?: string; fatal?: boolean } = {}, status: 200 | 400 | 401 | 429 = 200) {
    const hidden = Object.entries(p)
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
      .join('')
    const form = opts.fatal
      ? ''
      : `<form method="post" action="/oauth/authorize">${hidden}
  <label>Dashboard email<input name="email" type="email" autocomplete="username" required></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Allow access</button>
</form>`
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Claude to Sunday Rolls Google Ads</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f3ec;color:#1d2a1f;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;max-width:380px;width:calc(100% - 32px);padding:28px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#4a564c}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 0}
input[type=email],input[type=password]{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px 12px;border:1px solid #cfd6cf;border-radius:8px;font-size:15px}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:8px;background:#1f5c3a;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{background:#fdecec;color:#9b1c1c;padding:10px 12px;border-radius:8px;font-size:13px}
</style></head><body><main>
<h1>Connect Claude to Google Ads</h1>
<p>Claude will be able to read the Sunday Rolls Google Ads account and, after you approve each change in the chat, edit negative keywords, target ROAS, budgets and campaign status.</p>
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ''}
${form}
<p style="font-size:12px;margin-top:16px">Sign in with your Sunday Rolls dashboard login. Admins only.</p>
</main></body></html>`,
      status,
    )
  }

  app.get('/oauth/authorize', async (c) => {
    const p = readParams((k) => c.req.query(k))
    const problem = await checkAuthorize(p)
    if (problem) return page(c, p, { error: problem, fatal: true }, 400)
    return page(c, p)
  })

  app.post('/oauth/authorize', async (c) => {
    const form = await c.req.parseBody()
    const p = readParams((k) => (typeof form[k] === 'string' ? (form[k] as string) : undefined))
    const problem = await checkAuthorize(p)
    if (problem) return page(c, p, { error: problem, fatal: true }, 400)
    const rate = checkRateLimit(`mcp-login:${clientIp(c)}`, { limit: 10, windowMs: 15 * 60_000 })
    if (!rate.ok) return page(c, p, { error: 'Too many attempts. Try again in a few minutes.' }, 429)

    const email = normalizeEmail(String(form.email ?? ''))
    const password = String(form.password ?? '')
    const user = email ? await store.getUserByEmail(email) : null
    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
      return page(c, p, { error: 'Wrong email or password.' }, 401)
    }
    if (!user.isAdmin) return page(c, p, { error: 'Only dashboard admins can connect Google Ads.' }, 401)

    const secret = await oauthSecret(store, env)
    const code = signToken(secret, {
      k: 'code',
      u: user.id,
      c: p.client_id,
      r: p.redirect_uri,
      p: p.code_challenge,
      e: Math.floor(Date.now() / 1000) + CODE_TTL_S,
    })
    const target = new URL(p.redirect_uri)
    target.searchParams.set('code', code)
    if (p.state) target.searchParams.set('state', p.state)
    return c.redirect(target.toString(), 302)
  })

  // ---------- token ----------

  app.post('/oauth/token', async (c) => {
    const type = c.req.header('content-type') ?? ''
    let form: Record<string, string> = {}
    if (type.includes('application/json')) {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      form = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
    } else {
      const body = await c.req.parseBody()
      form = Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    }
    const basic = c.req.header('authorization')
    if (!form.client_id && basic?.startsWith('Basic ')) {
      form.client_id = decodeURIComponent(Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':')[0] ?? '')
    }
    const fail = (error: string, description: string, status: 400 | 401 = 400) =>
      c.json({ error, error_description: description }, status, { 'Cache-Control': 'no-store' })

    const secret = await oauthSecret(store, env)
    const nowS = Math.floor(Date.now() / 1000)

    let userId: string
    let clientId: string
    if (form.grant_type === 'authorization_code') {
      const code = verifyToken(secret, form.code ?? '', 'code', nowS)
      if (!code) return fail('invalid_grant', 'Code is invalid or expired')
      for (const [k, exp] of usedCodes) if (exp < nowS) usedCodes.delete(k)
      if (usedCodes.has(code.j)) return fail('invalid_grant', 'Code already used')
      if (form.client_id && form.client_id !== code.c) return fail('invalid_grant', 'Client mismatch')
      if ((form.redirect_uri ?? '') !== code.r) return fail('invalid_grant', 'redirect_uri mismatch')
      if (!pkceMatches(form.code_verifier ?? '', code.p ?? '')) return fail('invalid_grant', 'PKCE verification failed')
      usedCodes.set(code.j, code.e)
      userId = code.u
      clientId = code.c
    } else if (form.grant_type === 'refresh_token') {
      const refresh = verifyToken(secret, form.refresh_token ?? '', 'refresh', nowS)
      if (!refresh) return fail('invalid_grant', 'Refresh token is invalid or expired')
      if (form.client_id && form.client_id !== refresh.c) return fail('invalid_grant', 'Client mismatch')
      userId = refresh.u
      clientId = refresh.c
    } else {
      return fail('unsupported_grant_type', 'Use authorization_code or refresh_token')
    }

    const user = await store.getUserById(userId)
    if (!user?.isAdmin) return fail('invalid_grant', 'User is no longer a dashboard admin')

    return c.json(
      {
        access_token: signToken(secret, { k: 'access', u: userId, c: clientId, e: nowS + ACCESS_TTL_S }),
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_S,
        refresh_token: signToken(secret, { k: 'refresh', u: userId, c: clientId, e: nowS + REFRESH_TTL_S }),
        scope: 'google-ads',
      },
      200,
      { 'Cache-Control': 'no-store' },
    )
  })

  // ---------- MCP ----------

  app.get('/mcp', (c) => c.json({ error: 'Use POST (Streamable HTTP, JSON responses)' }, 405, { Allow: 'POST' }))
  app.delete('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }))

  app.post('/mcp', async (c) => {
    const unauthorized = (description: string) =>
      c.json({ error: 'invalid_token', error_description: description }, 401, {
        'WWW-Authenticate': `Bearer resource_metadata="${baseUrl(c)}/.well-known/oauth-protected-resource", error="invalid_token"`,
      })
    const auth = c.req.header('authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return unauthorized('Sign in required')
    const secret = await oauthSecret(store, env)
    const access = verifyToken(secret, auth.slice(7).trim(), 'access')
    if (!access) return unauthorized('Token is invalid or expired')
    const user = await store.getUserById(access.u)
    if (!user?.isAdmin) return unauthorized('User is no longer a dashboard admin')

    let message: unknown
    try {
      message = await c.req.json()
    } catch {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
    }

    const ctx = (): ToolContext | null => {
      const creds = loadGoogleAdsCredentialsFromEnv(env)
      if (!creds) return null
      return { creds, store, secret, user: { id: user.id, email: user.email }, fetchImpl: deps.fetchImpl, getToken: deps.getToken }
    }

    const handle = async (req: unknown): Promise<Record<string, unknown> | null> => {
      const r = (req ?? {}) as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
      const isNotification = r.id === undefined
      const ok = (result: unknown) => ({ jsonrpc: '2.0', id: r.id ?? null, result })
      const err = (code: number, msg: string) => ({ jsonrpc: '2.0', id: r.id ?? null, error: { code, message: msg } })
      if (r.jsonrpc !== '2.0' || typeof r.method !== 'string') return isNotification ? null : err(-32600, 'Invalid request')

      switch (r.method) {
        case 'initialize': {
          const asked = String(r.params?.protocolVersion ?? '')
          return ok({
            protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS,
          })
        }
        case 'ping':
          return isNotification ? null : ok({})
        case 'tools/list':
          return ok({
            tools: GOOGLE_ADS_TOOLS.map((t) => ({
              name: t.name,
              title: t.title,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: { title: t.title, ...t.annotations },
            })),
          })
        case 'tools/call': {
          const name = String(r.params?.name ?? '')
          const tool = GOOGLE_ADS_TOOLS.find((t) => t.name === name)
          if (!tool) return err(-32602, `Unknown tool: ${name}`)
          const context = ctx()
          if (!context) {
            return ok({
              isError: true,
              content: [{ type: 'text', text: `Google Ads isn’t configured on the server (missing ${googleAdsMissingEnv(env)}).` }],
            })
          }
          const args = (r.params?.arguments ?? {}) as Record<string, unknown>
          try {
            const result = await tool.run(args, context)
            return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result })
          } catch (error) {
            const text = error instanceof Error ? error.message : 'Tool failed'
            if (!(error instanceof ToolInputError)) console.error(`MCP ${name} failed:`, text)
            return ok({ isError: true, content: [{ type: 'text', text }] })
          }
        }
        default:
          if (isNotification) return null
          return err(-32601, `Method not found: ${r.method}`)
      }
    }

    if (Array.isArray(message)) {
      const results = (await Promise.all(message.map(handle))).filter(Boolean)
      return results.length ? c.json(results) : c.body(null, 202)
    }
    const result = await handle(message)
    return result ? c.json(result) : c.body(null, 202)
  })

  return app
}
