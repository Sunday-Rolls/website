/**
 * Google Ads API (REST) for the dashboard: daily campaign metrics and search terms, read with
 * an OAuth refresh token from the "Sunday Rolls Ads" Google Cloud project.
 *
 * Access level lives on that Cloud project (Explorer: 2,880 ops/day on live accounts). Google
 * retired developer tokens in Sept 2026, so none is sent unless GOOGLE_ADS_DEVELOPER_TOKEN is set.
 * See docs/GOOGLE_ADS_API.md for how the env values are created.
 */
import { OAuth2Client } from 'google-auth-library'
import type { GoogleAdsDaily, GoogleAdsSearchTerm } from './types.js'

export const DEFAULT_GOOGLE_ADS_API_VERSION = 'v26'

export type GoogleAdsCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  /** Ads account to read, digits only (e.g. 2996974701). */
  customerId: string
  /** Manager account id when access goes through one, digits only. */
  loginCustomerId?: string
  developerToken?: string
  apiVersion: string
}

const digits = (value: string | undefined) => (value ?? '').replace(/\D/g, '')

/** Names of the env vars still missing, or null when the sync can run. */
export function googleAdsMissingEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = [
    !env.GOOGLE_ADS_CLIENT_ID?.trim() && 'GOOGLE_ADS_CLIENT_ID',
    !env.GOOGLE_ADS_CLIENT_SECRET?.trim() && 'GOOGLE_ADS_CLIENT_SECRET',
    !env.GOOGLE_ADS_REFRESH_TOKEN?.trim() && 'GOOGLE_ADS_REFRESH_TOKEN',
    !digits(env.GOOGLE_ADS_CUSTOMER_ID) && 'GOOGLE_ADS_CUSTOMER_ID',
  ].filter(Boolean)
  return missing.length ? missing.join(', ') : null
}

export function loadGoogleAdsCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): GoogleAdsCredentials | null {
  if (googleAdsMissingEnv(env)) return null
  return {
    clientId: env.GOOGLE_ADS_CLIENT_ID!.trim(),
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!.trim(),
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN!.trim(),
    customerId: digits(env.GOOGLE_ADS_CUSTOMER_ID),
    loginCustomerId: digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || undefined,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || undefined,
    apiVersion: env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_GOOGLE_ADS_API_VERSION,
  }
}

async function accessToken(creds: GoogleAdsCredentials): Promise<string> {
  const client = new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret })
  client.setCredentials({ refresh_token: creds.refreshToken })
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Google Ads: could not get an access token from the refresh token')
  return token
}

type Row = Record<string, Record<string, unknown> | undefined>

/** Run one GAQL query through searchStream and return every result row. */
export async function googleAdsQuery(
  creds: GoogleAdsCredentials,
  query: string,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<Row[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token ?? (await accessToken(creds))}`,
    'Content-Type': 'application/json',
  }
  if (creds.loginCustomerId) headers['login-customer-id'] = creds.loginCustomerId
  if (creds.developerToken) headers['developer-token'] = creds.developerToken
  const url = `https://googleads.googleapis.com/${creds.apiVersion}/customers/${creds.customerId}/googleAds:searchStream`
  const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ query }) })
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : []
  } catch {
    throw new Error(`Google Ads query failed (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const err = (Array.isArray(data) ? data[0] : data) as { error?: { message?: string } } | undefined
    throw new Error(`Google Ads query failed (${res.status}): ${err?.error?.message ?? text.slice(0, 200)}`)
  }
  // searchStream answers with an array of batches, each holding `results`.
  const batches = (Array.isArray(data) ? data : [data]) as Array<{ results?: Row[] }>
  return batches.flatMap((b) => b.results ?? [])
}

const n = (v: unknown) => Number(v ?? 0) || 0
const round2 = (x: number) => Math.round(x * 100) / 100
const micros = (v: unknown) => round2(n(v) / 1_000_000)

export function campaignDailyQuery(start: string, end: string): string {
  return `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks,
  metrics.cost_micros, metrics.conversions, metrics.conversions_value
FROM campaign
WHERE segments.date BETWEEN '${start}' AND '${end}'`
}

export function searchTermsQuery(start: string, end: string): string {
  return `SELECT search_term_view.search_term, campaign.name, metrics.impressions, metrics.clicks,
  metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE segments.date BETWEEN '${start}' AND '${end}'`
}

/** Daily campaign rows; days with no impressions and no cost are dropped. */
export function campaignDailyFromRows(rows: Row[]): GoogleAdsDaily[] {
  return rows
    .map((r) => ({
      date: String(r.segments?.date ?? ''),
      campaignId: String(r.campaign?.id ?? ''),
      campaign: String(r.campaign?.name ?? '').trim() || 'Unnamed campaign',
      impressions: n(r.metrics?.impressions),
      clicks: n(r.metrics?.clicks),
      cost: micros(r.metrics?.costMicros),
      conversions: round2(n(r.metrics?.conversions)),
      conversionValue: round2(n(r.metrics?.conversionsValue)),
    }))
    .filter((r) => r.date && (r.impressions > 0 || r.cost > 0))
    .sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign))
}

/** Search terms summed over the period (the API returns one row per term, ad group and day). */
export function searchTermsFromRows(rows: Row[], periodStart: string, periodEnd: string): GoogleAdsSearchTerm[] {
  const map = new Map<string, GoogleAdsSearchTerm>()
  for (const r of rows) {
    const term = String(r.searchTermView?.searchTerm ?? '').trim()
    if (!term) continue
    const campaign = String(r.campaign?.name ?? '').trim()
    const key = `${term}|${campaign}`
    const cur = map.get(key) ?? {
      term,
      campaign,
      periodStart,
      periodEnd,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    }
    cur.impressions += n(r.metrics?.impressions)
    cur.clicks += n(r.metrics?.clicks)
    cur.cost += n(r.metrics?.costMicros) / 1_000_000
    cur.conversions += n(r.metrics?.conversions)
    map.set(key, cur)
  }
  return [...map.values()]
    .map((t) => ({ ...t, cost: round2(t.cost), conversions: round2(t.conversions) }))
    .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
}

export async function fetchGoogleAdsBundle(
  creds: GoogleAdsCredentials,
  start: string,
  end: string,
  fetchImpl: typeof fetch = fetch,
  getToken: (creds: GoogleAdsCredentials) => Promise<string> = accessToken,
): Promise<{ daily: GoogleAdsDaily[]; searchTerms: GoogleAdsSearchTerm[] }> {
  const token = await getToken(creds)
  const [dailyRows, termRows] = await Promise.all([
    googleAdsQuery(creds, campaignDailyQuery(start, end), fetchImpl, token),
    googleAdsQuery(creds, searchTermsQuery(start, end), fetchImpl, token),
  ])
  return { daily: campaignDailyFromRows(dailyRows), searchTerms: searchTermsFromRows(termRows, start, end) }
}
