/**
 * Reddit ad spend from the Reddit Ads API v3 reports endpoint, per campaign per day, into
 * analytics_daily_ad_spend under platform "Reddit Ads". That feeds Marketing (spend, MER, the
 * Reddit campaigns table), the same way meta-ads.ts does for Meta. See docs/REDDIT_ADS_SYNC.md.
 *
 * Auth: a Reddit developer app (client id + secret) and a permanent refresh token with the
 * `adsread` and `adsedit` scopes, made once from the dashboard (GET /dashboard/api/reddit/connect).
 * The sync only reads; `adsedit` is for the connector's change tools (mcp/reddit-ads-manage-tools.ts).
 */
import { addUtcDays, formatUtcDate, parseUtcDate, resolveAsOf } from './period.js'
import type { AnalyticsStore } from './store.js'
import type { DailyAdSpend } from './types.js'

export const REDDIT_ADS_PLATFORM = 'Reddit Ads'
export const REDDIT_ADS_API = 'https://ads-api.reddit.com/api/v3'
export const REDDIT_AUTHORIZE_URL = 'https://www.reddit.com/api/v1/authorize'
export const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'
/** Space-separated. `adsedit` lets the Claude connector change ads after a confirmed preview. */
export const REDDIT_SCOPES = 'adsread adsedit'
/** Reddit rejects requests without a descriptive User-Agent. */
export const REDDIT_USER_AGENT = 'server:sunday-rolls-dashboard:1.0 (by Sunday Rolls Golf)'
/** Days per report request; keeps each response small. */
const WINDOW_DAYS = 14

export type RedditAdsCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  /** As shown in Reddit Ads Manager, e.g. a2_abc123 or t2_abc123. */
  adAccountId: string
}

export function redditAdsMissingEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = [
    !env.REDDIT_ADS_CLIENT_ID?.trim() && 'REDDIT_ADS_CLIENT_ID',
    !env.REDDIT_ADS_CLIENT_SECRET?.trim() && 'REDDIT_ADS_CLIENT_SECRET',
    !env.REDDIT_ADS_REFRESH_TOKEN?.trim() && 'REDDIT_ADS_REFRESH_TOKEN',
    !env.REDDIT_ADS_ACCOUNT_ID?.trim() && 'REDDIT_ADS_ACCOUNT_ID',
  ].filter(Boolean)
  return missing.length ? missing.join(', ') : null
}

export function loadRedditAdsCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): RedditAdsCredentials | null {
  if (redditAdsMissingEnv(env)) return null
  return {
    clientId: env.REDDIT_ADS_CLIENT_ID!.trim(),
    clientSecret: env.REDDIT_ADS_CLIENT_SECRET!.trim(),
    refreshToken: env.REDDIT_ADS_REFRESH_TOKEN!.trim(),
    adAccountId: env.REDDIT_ADS_ACCOUNT_ID!.trim(),
  }
}

const basicAuth = (clientId: string, clientSecret: string) =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`

export type TokenResponse = { access_token?: string; refresh_token?: string; scope?: string; error?: string; message?: string }

async function tokenRequest(
  clientId: string,
  clientSecret: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  const res = await fetchImpl(REDDIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: new URLSearchParams(params).toString(),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(`Reddit sign-in failed (${res.status}): ${data.error ?? data.message ?? 'no access token returned'}`)
  }
  return data
}

/** The sign-in link for the one-time connect step (duration=permanent → a refresh token). */
export function redditAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    state,
    redirect_uri: redirectUri,
    duration: 'permanent',
    scope: REDDIT_SCOPES,
  })
  return `${REDDIT_AUTHORIZE_URL}?${params}`
}

/** Swap the code Reddit sends back for tokens. */
export async function exchangeRedditCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const data = await tokenRequest(
    clientId,
    clientSecret,
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    fetchImpl,
  )
  if (!data.refresh_token) throw new Error('Reddit returned no refresh token (sign-in must use duration=permanent).')
  return { accessToken: data.access_token!, refreshToken: data.refresh_token, scope: data.scope ?? '' }
}

export async function redditAccessToken(creds: RedditAdsCredentials, fetchImpl: typeof fetch = fetch): Promise<string> {
  const data = await tokenRequest(
    creds.clientId,
    creds.clientSecret,
    { grant_type: 'refresh_token', refresh_token: creds.refreshToken },
    fetchImpl,
  )
  return data.access_token!
}

export type Page<T> = { data?: T; pagination?: { next_url?: string | null } }

export async function redditApi<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<Page<T>> {
  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': REDDIT_USER_AGENT,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text.slice(0, 200) }
  }
  if (!res.ok) {
    const err = data as { error?: { message?: string } | string; message?: string }
    const message =
      (typeof err.error === 'object' ? err.error?.message : err.error) ?? err.message ?? JSON.stringify(data).slice(0, 200)
    throw new Error(`Reddit Ads API ${res.status} on ${new URL(url).pathname}: ${message}`)
  }
  return data as Page<T>
}

/** GET/POST and follow pagination.next_url (at most 50 pages). */
export async function collect<T>(
  accessToken: string,
  method: 'GET' | 'POST',
  url: string,
  body: unknown,
  pick: (page: Page<unknown>) => T[] | undefined,
  fetchImpl: typeof fetch,
): Promise<T[]> {
  const out: T[] = []
  let next: string | null = url
  for (let i = 0; next && i < 50; i++) {
    const page: Page<unknown> = await redditApi<unknown>(accessToken, method, next, body, fetchImpl)
    out.push(...(pick(page) ?? []))
    next = page.pagination?.next_url ?? null
  }
  return out
}

export type RedditReportRow = {
  date?: string
  campaign_id?: string
  /** micro-currency (÷ 1,000,000) */
  spend?: number | string
  conversion_purchase_clicks?: number | string
  conversion_purchase_views?: number | string
  /** cents (÷ 100) */
  conversion_purchase_total_value?: number | string
}

const REPORT_FIELDS = ['SPEND', 'CONVERSION_PURCHASE_CLICKS', 'CONVERSION_PURCHASE_VIEWS', 'CONVERSION_PURCHASE_TOTAL_VALUE']

/** Daily campaign report, start..end inclusive (UTC days), in WINDOW_DAYS chunks. */
export async function fetchRedditReport(
  accessToken: string,
  adAccountId: string,
  start: string,
  end: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditReportRow[]> {
  const url = `${REDDIT_ADS_API}/ad_accounts/${encodeURIComponent(adAccountId)}/reports?page.size=1000`
  const rows: RedditReportRow[] = []
  for (let from = start; from <= end; ) {
    const lastDay = formatUtcDate(addUtcDays(parseUtcDate(from), WINDOW_DAYS - 1))
    const to = lastDay < end ? lastDay : end
    const body = {
      data: {
        starts_at: `${from}T00:00:00Z`,
        // ends_at is exclusive: midnight after the last day.
        ends_at: `${formatUtcDate(addUtcDays(parseUtcDate(to), 1))}T00:00:00Z`,
        fields: REPORT_FIELDS,
        breakdowns: ['DATE', 'CAMPAIGN_ID'],
      },
    }
    rows.push(
      ...(await collect<RedditReportRow>(
        accessToken,
        'POST',
        url,
        body,
        (p) => {
          const d = p.data as { metrics?: RedditReportRow[] } | RedditReportRow[] | undefined
          return Array.isArray(d) ? d : d?.metrics
        },
        fetchImpl,
      )),
    )
    from = formatUtcDate(addUtcDays(parseUtcDate(to), 1))
  }
  return rows
}

/** campaign id → name, for labelling report rows. */
export async function fetchRedditCampaignNames(
  accessToken: string,
  adAccountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const url = `${REDDIT_ADS_API}/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns?page.size=1000`
  const list = await collect<{ id?: string; name?: string }>(
    accessToken,
    'GET',
    url,
    undefined,
    (p) => (Array.isArray(p.data) ? (p.data as Array<{ id?: string; name?: string }>) : undefined),
    fetchImpl,
  )
  return new Map(list.filter((c) => c.id).map((c) => [String(c.id), String(c.name ?? '').trim()]))
}

const round2 = (x: number) => Math.round(x * 100) / 100
const n = (v: number | string | undefined) => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

export function redditDailyAdSpend(rows: RedditReportRow[], names: Map<string, string> = new Map()): DailyAdSpend[] {
  // Merge rows that land on the same day + campaign (pages / windows can split them).
  const merged = new Map<string, DailyAdSpend>()
  for (const r of rows) {
    const date = String(r.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const id = String(r.campaign_id ?? '')
    const campaign = names.get(id) || (id ? `Campaign ${id}` : 'Unassigned')
    const key = `${date}|${campaign}`
    const cur = merged.get(key) ?? {
      date,
      platform: REDDIT_ADS_PLATFORM,
      campaign,
      spend: 0,
      platformReportedSales: 0,
      platformReportedOrders: 0,
    }
    cur.spend += n(r.spend) / 1_000_000
    cur.platformReportedSales += n(r.conversion_purchase_total_value) / 100
    cur.platformReportedOrders += n(r.conversion_purchase_clicks) + n(r.conversion_purchase_views)
    merged.set(key, cur)
  }
  return [...merged.values()]
    .map((r) => ({
      ...r,
      spend: round2(r.spend),
      platformReportedSales: round2(r.platformReportedSales),
      platformReportedOrders: Math.round(r.platformReportedOrders),
    }))
    .filter((r) => r.spend > 0 || r.platformReportedSales > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign))
}

export type RedditAdsSyncResult = { start: string; end: string; rows: number; spend: number }

export async function syncRedditAdsToStore(
  store: AnalyticsStore,
  creds: RedditAdsCredentials,
  options?: { days?: number; asOf?: string; fetchImpl?: typeof fetch },
): Promise<RedditAdsSyncResult> {
  const days = Math.max(1, Math.min(options?.days ?? 90, 365))
  const end = resolveAsOf(options?.asOf)
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(days - 1)))
  const fetchImpl = options?.fetchImpl ?? fetch
  const sync = await store.startSync('reddit-ads')
  try {
    const token = await redditAccessToken(creds, fetchImpl)
    const report = await fetchRedditReport(token, creds.adAccountId, start, end, fetchImpl)
    // Names are a nicety: if the campaigns call fails, keep the spend under campaign ids.
    const names = await fetchRedditCampaignNames(token, creds.adAccountId, fetchImpl).catch(() => new Map<string, string>())
    const rows = redditDailyAdSpend(report, names)
    const written = await store.upsertAdSpend(rows)
    const spend = round2(rows.reduce((a, r) => a + r.spend, 0))
    await store.finishSync(sync.id, 'ok', `Reddit Ads ${start}→${end}: ${written} campaign-days, $${spend.toFixed(2)} spend`, written)
    return { start, end, rows: written, spend }
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Reddit Ads sync failed', 0)
    throw error
  }
}

/** Ad accounts the signed-in Reddit user can see, to show after connecting. Best effort. */
export async function listRedditAdAccounts(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ id: string; name: string; business: string }>> {
  const businesses = await collect<{ id?: string; name?: string }>(
    accessToken,
    'GET',
    `${REDDIT_ADS_API}/me/businesses`,
    undefined,
    (p) => (Array.isArray(p.data) ? (p.data as Array<{ id?: string; name?: string }>) : undefined),
    fetchImpl,
  )
  const out: Array<{ id: string; name: string; business: string }> = []
  for (const b of businesses) {
    if (!b.id) continue
    const accounts = await collect<{ id?: string; name?: string }>(
      accessToken,
      'GET',
      `${REDDIT_ADS_API}/businesses/${encodeURIComponent(b.id)}/ad_accounts`,
      undefined,
      (p) => (Array.isArray(p.data) ? (p.data as Array<{ id?: string; name?: string }>) : undefined),
      fetchImpl,
    )
    for (const a of accounts) if (a.id) out.push({ id: a.id, name: a.name ?? '', business: b.name ?? '' })
  }
  return out
}
