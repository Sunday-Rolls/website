/**
 * Etsy Open API v3 client for the shop's own orders (receipts).
 *
 * Auth: every request sends `x-api-key: <keystring>:<shared secret>` (required since Feb 2026)
 * plus a user OAuth access token. Access tokens last an hour; refreshing returns a new
 * refresh token, so the latest one is saved in analytics_integration_state and the
 * ETSY_REFRESH_TOKEN env var is only the seed (or a manual re-authorisation).
 */
import type { AnalyticsStore } from './store.js'

export const ETSY_API = 'https://api.etsy.com/v3/application'
export const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'
const STATE_KEY = 'etsy'
const PAGE_LIMIT = 100

export type EtsyCredentials = {
  keystring: string
  sharedSecret: string
  /** Seed refresh token from a one-time sign-in (see docs/ETSY_SYNC.md). */
  refreshToken: string
  /** Optional; looked up from /users/me when blank. */
  shopId?: string | null
}

export type EtsyMoney = { amount: number; divisor: number; currency_code?: string }

export type EtsyTransactionRaw = {
  transaction_id: number
  title?: string | null
  sku?: string | null
  quantity?: number | null
  price?: EtsyMoney | null
  listing_id?: number | null
}

export type EtsyReceiptRaw = {
  receipt_id: number
  status?: string | null
  created_timestamp?: number | null
  create_timestamp?: number | null
  country_iso?: string | null
  state?: string | null
  grandtotal?: EtsyMoney | null
  subtotal?: EtsyMoney | null
  total_shipping_cost?: EtsyMoney | null
  total_tax_cost?: EtsyMoney | null
  discount_amt?: EtsyMoney | null
  refunds?: Array<{ amount?: EtsyMoney | null }> | null
  transactions?: EtsyTransactionRaw[] | null
}

type EtsyState = {
  refreshToken?: string
  accessToken?: string
  expiresAt?: number
  /** The env seed this chain started from; a different env value means someone re-authorised. */
  seededFrom?: string
  shopId?: string
}

export function loadEtsyCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): EtsyCredentials | null {
  const keystring = env.ETSY_KEYSTRING?.trim() || ''
  const sharedSecret = env.ETSY_SHARED_SECRET?.trim() || ''
  const refreshToken = env.ETSY_REFRESH_TOKEN?.trim() || ''
  if (!keystring || !sharedSecret || !refreshToken) return null
  return { keystring, sharedSecret, refreshToken, shopId: env.ETSY_SHOP_ID?.trim() || null }
}

export function etsyMissingEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_REFRESH_TOKEN'].filter((k) => !env[k]?.trim())
  return missing.length ? missing.join(', ') : null
}

export function etsyMoney(m: EtsyMoney | null | undefined): number {
  if (!m || typeof m.amount !== 'number') return 0
  const divisor = m.divisor || 100
  return Math.round((m.amount / divisor) * 100) / 100
}

function apiKey(creds: EtsyCredentials): string {
  return `${creds.keystring}:${creds.sharedSecret}`
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: string; error_description?: string }
    return body.error_description || body.error || text.slice(0, 200)
  } catch {
    return text.slice(0, 200)
  }
}

/** A valid access token, refreshing (and saving the rotated refresh token) when needed. */
export async function getEtsyAccessToken(
  store: AnalyticsStore,
  creds: EtsyCredentials,
  now: () => number = Date.now,
): Promise<{ accessToken: string; state: EtsyState }> {
  let state = ((await store.getIntegrationState(STATE_KEY)) ?? {}) as EtsyState
  if (state.seededFrom !== creds.refreshToken) {
    // First run, or ETSY_REFRESH_TOKEN was replaced after a fresh sign-in: start the chain over.
    state = { seededFrom: creds.refreshToken, refreshToken: creds.refreshToken, shopId: state.shopId }
  }
  if (state.accessToken && state.expiresAt && now() < state.expiresAt) {
    return { accessToken: state.accessToken, state }
  }
  const res = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-key': apiKey(creds) },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.keystring,
      refresh_token: state.refreshToken || creds.refreshToken,
    }).toString(),
  })
  if (!res.ok) {
    throw new Error(
      `Etsy token refresh failed (${res.status}): ${await readError(res)}. Re-run the sign-in in docs/ETSY_SYNC.md and update ETSY_REFRESH_TOKEN.`,
    )
  }
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  state = {
    ...state,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || state.refreshToken,
    // Refresh a minute early.
    expiresAt: now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
  }
  await store.setIntegrationState(STATE_KEY, state as Record<string, unknown>)
  return { accessToken: body.access_token, state }
}

async function etsyGet<T>(creds: EtsyCredentials, token: string, path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(ETSY_API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { 'x-api-key': apiKey(creds), Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (res.ok) return (await res.json()) as T
    // Etsy allows 10 requests/second; back off briefly on 429/5xx.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      continue
    }
    throw new Error(`Etsy ${path} failed (${res.status}): ${await readError(res)}`)
  }
}

/** The shop id: ETSY_SHOP_ID, else the saved one, else /users/me (saved for next time). */
export async function resolveEtsyShopId(
  store: AnalyticsStore,
  creds: EtsyCredentials,
  token: string,
  state: EtsyState,
): Promise<string> {
  if (creds.shopId) return creds.shopId
  if (state.shopId) return state.shopId
  const me = await etsyGet<{ user_id: number; shop_id?: number | null }>(creds, token, '/users/me')
  if (!me.shop_id) throw new Error('This Etsy account has no shop')
  const shopId = String(me.shop_id)
  await store.setIntegrationState(STATE_KEY, { ...state, shopId } as Record<string, unknown>)
  return shopId
}

/** All receipts created at or after `minCreated` (unix seconds), newest first, with their transactions. */
export async function fetchEtsyReceipts(
  creds: EtsyCredentials,
  token: string,
  shopId: string,
  options: { minCreated?: number } = {},
): Promise<EtsyReceiptRaw[]> {
  const out: EtsyReceiptRaw[] = []
  for (;;) {
    const params: Record<string, string | number> = { limit: PAGE_LIMIT, offset: out.length, sort_on: 'created', sort_order: 'desc' }
    if (options.minCreated) params.min_created = options.minCreated
    const page = await etsyGet<{ count: number; results: EtsyReceiptRaw[] }>(creds, token, `/shops/${shopId}/receipts`, params)
    out.push(...(page.results ?? []))
    if (!page.results?.length || out.length >= (page.count ?? 0)) break
  }
  return out
}

export type EtsyLedgerEntryRaw = {
  entry_id: number
  /** Minor units (cents); debits are negative. */
  amount: number
  currency?: string | null
  created_timestamp?: number | null
  create_date?: number | null
  ledger_type?: string | null
  description?: string | null
  reference_type?: string | null
  reference_id?: number | string | null
}

/** Payment-account ledger entries created in [minCreated, maxCreated] (unix seconds). */
export async function fetchEtsyLedgerEntries(
  creds: EtsyCredentials,
  token: string,
  shopId: string,
  options: { minCreated: number; maxCreated: number },
): Promise<EtsyLedgerEntryRaw[]> {
  const out: EtsyLedgerEntryRaw[] = []
  // 30-day slices keep each request inside any window limit Etsy applies to the ledger.
  const SLICE = 30 * 86_400
  for (let start = options.minCreated; start < options.maxCreated; start += SLICE) {
    const end = Math.min(options.maxCreated, start + SLICE - 1)
    const slice: EtsyLedgerEntryRaw[] = []
    for (;;) {
      const page = await etsyGet<{ count: number; results: EtsyLedgerEntryRaw[] }>(
        creds,
        token,
        `/shops/${shopId}/payment-account/ledger-entries`,
        { min_created: start, max_created: end, limit: PAGE_LIMIT, offset: slice.length },
      )
      slice.push(...(page.results ?? []))
      if (!page.results?.length || slice.length >= (page.count ?? 0)) break
    }
    out.push(...slice)
  }
  // Slices don't overlap, but dedupe by entry id in case Etsy's boundaries are inclusive.
  return [...new Map(out.map((e) => [e.entry_id, e])).values()]
}
