/**
 * Minimal OAuth 2.1 authorization server for the Google Ads connector, so Claude can add it as a
 * custom connector: dynamic client registration, authorization code + PKCE (S256), refresh tokens.
 *
 * Sign-in is the dashboard's own email/password, admins only. Codes and tokens are HMAC-signed
 * (stateless); the signing secret is MCP_OAUTH_SECRET or one generated once and kept in
 * analytics_integration_state. Rotating the secret signs everyone out of the connector.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AnalyticsStore } from '../analytics/store.js'

const SECRET_KEY = 'mcp-oauth-secret'
const CLIENTS_KEY = 'mcp-oauth-clients'
const MAX_CLIENTS = 50

export const ACCESS_TTL_S = 60 * 60
export const REFRESH_TTL_S = 30 * 24 * 60 * 60
export const CODE_TTL_S = 5 * 60

export type TokenKind = 'code' | 'access' | 'refresh'

export type TokenPayload = {
  k: TokenKind
  /** dashboard user id */
  u: string
  /** client id */
  c: string
  /** expiry, seconds since epoch */
  e: number
  /** code only: redirect_uri and PKCE challenge */
  r?: string
  p?: string
  /** random id, so equal payloads still differ */
  j: string
}

export type OAuthClient = { clientId: string; redirectUris: string[]; name: string; createdAt: string }

export async function oauthSecret(store: AnalyticsStore, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const fromEnv = env.MCP_OAUTH_SECRET?.trim()
  if (fromEnv) return fromEnv
  const state = await store.getIntegrationState(SECRET_KEY)
  if (typeof state?.secret === 'string' && state.secret.length >= 32) return state.secret
  const secret = randomBytes(32).toString('base64url')
  await store.setIntegrationState(SECRET_KEY, { secret, createdAt: new Date().toISOString() })
  return secret
}

const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64url')

export function signToken(secret: string, payload: Omit<TokenPayload, 'j'>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, j: randomBytes(8).toString('base64url') })).toString('base64url')
  return `${body}.${hmac(secret, body)}`
}

export function verifyToken(secret: string, token: string, kind: TokenKind, nowS = Math.floor(Date.now() / 1000)): TokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(hmac(secret, body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
  } catch {
    return null
  }
  if (payload.k !== kind || typeof payload.e !== 'number' || payload.e < nowS) return null
  return payload
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const given = Buffer.from(challenge)
  return computed.length === given.length && timingSafeEqual(computed, given)
}

/**
 * Only Claude's own callbacks and loopback addresses (Claude Code, local testing) may receive
 * codes, so a registered client can't send someone's sign-in elsewhere.
 */
export function redirectUriAllowed(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.hash) return false
  if (url.protocol === 'https:' && ['claude.ai', 'claude.com'].includes(url.hostname)) return true
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true
  return false
}

async function readClients(store: AnalyticsStore): Promise<OAuthClient[]> {
  const state = await store.getIntegrationState(CLIENTS_KEY)
  return Array.isArray(state?.clients) ? (state!.clients as OAuthClient[]) : []
}

export async function registerClient(store: AnalyticsStore, input: { redirectUris: string[]; name: string }): Promise<OAuthClient> {
  const client: OAuthClient = {
    clientId: `src_${randomBytes(12).toString('base64url')}`,
    redirectUris: input.redirectUris,
    name: input.name.slice(0, 100) || 'MCP client',
    createdAt: new Date().toISOString(),
  }
  const clients = [client, ...(await readClients(store))].slice(0, MAX_CLIENTS)
  await store.setIntegrationState(CLIENTS_KEY, { clients })
  return client
}

export async function findClient(store: AnalyticsStore, clientId: string): Promise<OAuthClient | null> {
  return (await readClients(store)).find((c) => c.clientId === clientId) ?? null
}
