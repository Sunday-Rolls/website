import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../analytics/auth.js'
import { createMemoryAnalyticsStore, type AnalyticsStore } from '../analytics/store.js'
import { createRateLimiter } from '../rate-limit.js'
import { redirectUriAllowed, signToken, verifyToken } from './oauth.js'
import { createMcpRoutes } from './routes.js'

const ENV = {
  GOOGLE_ADS_CLIENT_ID: 'id',
  GOOGLE_ADS_CLIENT_SECRET: 'secret',
  GOOGLE_ADS_REFRESH_TOKEN: 'refresh',
  GOOGLE_ADS_CUSTOMER_ID: '299-697-4701',
  MCP_OAUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  MCP_PUBLIC_URL: 'https://dashboard.example.com',
}
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'a'.repeat(43) + 'verifier'
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

type Call = { url: string; body: Record<string, unknown> }

/** Fake Google Ads: one Max-conversion-value campaign, one negative keyword. */
function fakeAds(calls: Call[]) {
  return (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    calls.push({ url, body })
    if (url.endsWith(':searchStream')) {
      const q = String(body.query)
      let results: unknown[] = []
      if (q.includes('FROM campaign_criterion')) {
        results = [
          {
            campaign: { id: '111', name: 'Headcovers' },
            campaignCriterion: {
              resourceName: 'customers/2996974701/campaignCriteria/111~555',
              keyword: { text: 'mallet putter', matchType: 'PHRASE' },
            },
          },
        ]
      } else if (q.includes('FROM ad_group_criterion') || q.includes('FROM shared_criterion')) {
        results = []
      } else if (q.includes('FROM campaign')) {
        results = [
          {
            campaign: {
              id: '111',
              name: 'Headcovers',
              status: 'ENABLED',
              advertisingChannelType: 'PERFORMANCE_MAX',
              biddingStrategyType: 'MAXIMIZE_CONVERSION_VALUE',
              maximizeConversionValue: { targetRoas: 2.4 },
            },
            campaignBudget: { resourceName: 'customers/2996974701/campaignBudgets/9', amountMicros: '20000000', explicitlyShared: false },
          },
        ]
      }
      return new Response(JSON.stringify([{ results }]), { status: 200 })
    }
    const ops = body.operations as unknown[]
    return new Response(JSON.stringify({ results: ops.map((_, i) => ({ resourceName: `customers/2996974701/x/${i}` })) }), { status: 200 })
  }) as unknown as typeof fetch
}

async function setup(calls: Call[] = []) {
  const store = createMemoryAnalyticsStore()
  await store.upsertUser({
    id: 'u1',
    email: 'sam@example.com',
    name: 'Sam',
    passwordHash: await hashPassword('pw-123456'),
    isAdmin: true,
  })
  const app = new Hono().route(
    '/',
    createMcpRoutes({
      store,
      checkRateLimit: createRateLimiter(),
      env: ENV,
      fetchImpl: fakeAds(calls),
      getToken: async () => 'ads-token',
    }),
  )
  return { app, store }
}

async function signIn(app: Hono) {
  const reg = await app.request('/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude' }),
  })
  expect(reg.status).toBe(201)
  const { client_id } = (await reg.json()) as { client_id: string }
  const params = {
    response_type: 'code',
    client_id,
    redirect_uri: REDIRECT,
    state: 'st',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
  }
  const page = await app.request(`/oauth/authorize?${new URLSearchParams(params)}`)
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('Connect Claude to Google Ads')
  const auth = await app.request('/oauth/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, email: 'Sam@example.com', password: 'pw-123456' }).toString(),
  })
  expect(auth.status).toBe(302)
  const location = new URL(auth.headers.get('location')!)
  expect(location.origin + location.pathname).toBe(REDIRECT)
  expect(location.searchParams.get('state')).toBe('st')
  const code = location.searchParams.get('code')!
  const token = await app.request('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: VERIFIER, redirect_uri: REDIRECT, client_id }).toString(),
  })
  expect(token.status).toBe(200)
  const tokens = (await token.json()) as { access_token: string; refresh_token: string }
  return { client_id, code, ...tokens }
}

async function rpc(app: Hono, access: string, method: string, params?: Record<string, unknown>) {
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${access}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return { status: res.status, body: (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } } }
}

const toolResult = (body: { result?: Record<string, unknown> }) =>
  body.result!.structuredContent as Record<string, unknown> & { confirm_token?: string }

describe('oauth helpers', () => {
  it('only allows Claude and loopback redirects', () => {
    expect(redirectUriAllowed(REDIRECT)).toBe(true)
    expect(redirectUriAllowed('https://claude.com/api/mcp/auth_callback')).toBe(true)
    expect(redirectUriAllowed('http://localhost:33418/callback')).toBe(true)
    expect(redirectUriAllowed('https://evil.example/cb')).toBe(false)
    expect(redirectUriAllowed('http://claude.ai/cb')).toBe(false)
  })

  it('rejects tampered, wrong-kind and expired tokens', () => {
    const t = signToken('s'.repeat(40), { k: 'access', u: 'u1', c: 'c', e: 2_000_000_000 })
    expect(verifyToken('s'.repeat(40), t, 'access')?.u).toBe('u1')
    expect(verifyToken('s'.repeat(40), t, 'refresh')).toBeNull()
    expect(verifyToken('x'.repeat(40), t, 'access')).toBeNull()
    expect(verifyToken('s'.repeat(40), t, 'access', 2_000_000_001)).toBeNull()
  })
})

describe('MCP connector', () => {
  let calls: Call[]
  let app: Hono
  let store: AnalyticsStore
  beforeEach(async () => {
    calls = []
    ;({ app, store } = await setup(calls))
  })

  it('publishes discovery metadata and asks for sign-in', async () => {
    const meta = await (await app.request('/.well-known/oauth-authorization-server')).json()
    expect(meta).toMatchObject({ token_endpoint: 'https://dashboard.example.com/oauth/token', code_challenge_methods_supported: ['S256'] })
    const pr = await (await app.request('/.well-known/oauth-protected-resource')).json()
    expect(pr).toMatchObject({ resource: 'https://dashboard.example.com/mcp' })
    const res = await app.request('/mcp', { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource')
  })

  it('refuses bad passwords, non-Claude redirects, reused codes and bad PKCE', async () => {
    const reg = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }),
    })
    expect(reg.status).toBe(400)

    const { client_id, code } = await signIn(app)
    const reuse = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: VERIFIER, redirect_uri: REDIRECT }).toString(),
    })
    expect(reuse.status).toBe(400)

    const bad = await app.request('/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        response_type: 'code',
        client_id,
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
        email: 'sam@example.com',
        password: 'wrong',
      }).toString(),
    })
    expect(bad.status).toBe(401)
  })

  it('refreshes tokens', async () => {
    const { refresh_token } = await signIn(app)
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }).toString(),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { access_token: string }).access_token).toBeTruthy()
  })

  it('initializes, lists tools and reads campaigns', async () => {
    const { access_token } = await signIn(app)
    const init = await rpc(app, access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } })
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'sunday-rolls-google-ads' } })
    const list = await rpc(app, access_token, 'tools/list')
    const names = (list.body.result!.tools as Array<{ name: string }>).map((t) => t.name)
    expect(names).toContain('google_ads_set_target_roas')
    expect(names).toContain('google_ads_add_negative_keywords')
    const read = await rpc(app, access_token, 'tools/call', { name: 'google_ads_campaigns', arguments: {} })
    expect(toolResult(read.body).campaigns).toMatchObject([
      { id: '111', targetRoas: 2.4, budget: { dailyAmount: 20, shared: false } },
    ])
    expect(calls[0].url).toBe('https://googleads.googleapis.com/v26/customers/2996974701/googleAds:searchStream')
  })

  it('previews, then applies a target ROAS change only with the confirm token, and logs it', async () => {
    const { access_token } = await signIn(app)
    const args = { campaign_id: '111', target_roas: 1.8 }
    const preview = await rpc(app, access_token, 'tools/call', { name: 'google_ads_set_target_roas', arguments: args })
    const p = toolResult(preview.body)
    expect(p).toMatchObject({ status: 'preview', applied: false, before: { target_roas: 2.4 }, after: { target_roas: 1.8 } })
    const mutateCalls = calls.filter((c) => c.url.endsWith('campaigns:mutate'))
    expect(mutateCalls).toHaveLength(1)
    expect(mutateCalls[0].body).toMatchObject({
      validateOnly: true,
      operations: [{ update: { maximizeConversionValue: { targetRoas: 1.8 } }, updateMask: 'maximize_conversion_value.target_roas' }],
    })

    const tampered = await rpc(app, access_token, 'tools/call', {
      name: 'google_ads_set_target_roas',
      arguments: { ...args, target_roas: 3, confirm_token: p.confirm_token },
    })
    expect(tampered.body.result).toMatchObject({ isError: true })

    const applied = await rpc(app, access_token, 'tools/call', {
      name: 'google_ads_set_target_roas',
      arguments: { ...args, confirm_token: p.confirm_token },
    })
    expect(toolResult(applied.body)).toMatchObject({ status: 'applied', applied: true })
    expect(calls.filter((c) => c.url.endsWith('campaigns:mutate')).at(-1)!.body.validateOnly).toBe(false)

    const log = await rpc(app, access_token, 'tools/call', { name: 'google_ads_change_log', arguments: {} })
    expect(toolResult(log.body).entries).toMatchObject([{ user: 'sam@example.com', tool: 'google_ads_set_target_roas' }])
    expect(await store.getIntegrationState('google-ads-change-log')).toBeTruthy()
  })

  it('adds and removes negative keywords through the right services', async () => {
    const { access_token } = await signIn(app)
    const add = await rpc(app, access_token, 'tools/call', {
      name: 'google_ads_add_negative_keywords',
      arguments: { campaign_id: '111', keywords: ['free', 'cheap'], match_type: 'EXACT' },
    })
    expect(toolResult(add.body).summary).toContain('Add 2 exact negative keywords to "Headcovers"')
    expect(calls.find((c) => c.url.endsWith('campaignCriteria:mutate'))!.body.operations).toEqual([
      { create: { campaign: 'customers/2996974701/campaigns/111', negative: true, keyword: { text: 'free', matchType: 'EXACT' } } },
      { create: { campaign: 'customers/2996974701/campaigns/111', negative: true, keyword: { text: 'cheap', matchType: 'EXACT' } } },
    ])

    const remove = await rpc(app, access_token, 'tools/call', {
      name: 'google_ads_remove_negative_keywords',
      arguments: { resource_names: ['customers/2996974701/campaignCriteria/111~555'] },
    })
    expect(toolResult(remove.body)).toMatchObject({ status: 'preview', before: [{ keyword: 'mallet putter' }] })

    const foreign = await rpc(app, access_token, 'tools/call', {
      name: 'google_ads_remove_negative_keywords',
      arguments: { resource_names: ['customers/1111111111/campaignCriteria/1~2'] },
    })
    expect(foreign.body.result).toMatchObject({ isError: true })
  })

  it('caps budgets and blocks non-SELECT queries', async () => {
    const { access_token } = await signIn(app)
    const big = await rpc(app, access_token, 'tools/call', {
      name: 'google_ads_set_daily_budget',
      arguments: { campaign_id: '111', daily_budget: 5000 },
    })
    expect(big.body.result).toMatchObject({ isError: true })
    const q = await rpc(app, access_token, 'tools/call', { name: 'google_ads_query', arguments: { query: 'DELETE campaign' } })
    expect(q.body.result).toMatchObject({ isError: true })
  })
})
