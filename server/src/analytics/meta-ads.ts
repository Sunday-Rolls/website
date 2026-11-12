/**
 * Meta (Facebook + Instagram) ad spend from the Marketing API insights endpoint, per campaign per
 * day, into analytics_daily_ad_spend under platform "Meta Ads". That feeds Marketing (spend, MER,
 * Meta campaigns), the same way GA4 feeds Google Ads spend. See docs/META_ADS_SYNC.md.
 */
import { addUtcDays, formatUtcDate, parseUtcDate, resolveAsOf } from './period.js'
import type { AnalyticsStore } from './store.js'
import type { DailyAdSpend } from './types.js'

export const META_ADS_PLATFORM = 'Meta Ads'
export const DEFAULT_META_GRAPH_VERSION = 'v24.0'

export type MetaAdsCredentials = {
  accessToken: string
  /** digits only, without act_ */
  adAccountId: string
  graphVersion: string
}

export function metaAdsMissingEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = [
    !env.META_ACCESS_TOKEN?.trim() && 'META_ACCESS_TOKEN',
    !(env.META_AD_ACCOUNT_ID ?? '').replace(/\D/g, '') && 'META_AD_ACCOUNT_ID',
  ].filter(Boolean)
  return missing.length ? missing.join(', ') : null
}

export function loadMetaAdsCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): MetaAdsCredentials | null {
  if (metaAdsMissingEnv(env)) return null
  return {
    accessToken: env.META_ACCESS_TOKEN!.trim(),
    adAccountId: env.META_AD_ACCOUNT_ID!.replace(/\D/g, ''),
    graphVersion: env.META_GRAPH_VERSION?.trim() || DEFAULT_META_GRAPH_VERSION,
  }
}

type Action = { action_type?: string; value?: string }
type InsightRow = {
  date_start?: string
  campaign_id?: string
  campaign_name?: string
  spend?: string
  actions?: Action[]
  action_values?: Action[]
}

// Meta reports one purchase under several action types; take the first present so it counts once.
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase']

function purchaseValue(list: Action[] | undefined): number {
  for (const type of PURCHASE_TYPES) {
    const hit = list?.find((a) => a.action_type === type)
    if (hit) return Number(hit.value ?? 0) || 0
  }
  return 0
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function metaDailyAdSpend(rows: InsightRow[]): DailyAdSpend[] {
  return rows
    .map((r) => ({
      date: String(r.date_start ?? ''),
      platform: META_ADS_PLATFORM,
      campaign: String(r.campaign_name ?? '').trim() || `Campaign ${r.campaign_id ?? ''}`.trim(),
      spend: round2(Number(r.spend ?? 0) || 0),
      platformReportedSales: round2(purchaseValue(r.action_values)),
      platformReportedOrders: Math.round(purchaseValue(r.actions)),
    }))
    .filter((r) => r.date && (r.spend > 0 || r.platformReportedSales > 0))
    .sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign))
}

export async function fetchMetaInsights(
  creds: MetaAdsCredentials,
  start: string,
  end: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InsightRow[]> {
  const params = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    time_range: JSON.stringify({ since: start, until: end }),
    fields: 'campaign_id,campaign_name,spend,actions,action_values',
    limit: '500',
  })
  let url: string | null =
    `https://graph.facebook.com/${creds.graphVersion}/act_${creds.adAccountId}/insights?${params}`
  const rows: InsightRow[] = []
  for (let page = 0; url && page < 50; page++) {
    const res: Response = await fetchImpl(url, { headers: { Authorization: `Bearer ${creds.accessToken}` } })
    const data = (await res.json().catch(() => ({}))) as {
      data?: InsightRow[]
      paging?: { next?: string }
      error?: { message?: string; code?: number }
    }
    if (!res.ok || data.error) {
      throw new Error(`Meta insights failed (${res.status}): ${data.error?.message ?? 'unknown error'}`)
    }
    rows.push(...(data.data ?? []))
    url = data.paging?.next ?? null
  }
  return rows
}

export type MetaAdsSyncResult = { start: string; end: string; rows: number; spend: number }

export async function syncMetaAdsToStore(
  store: AnalyticsStore,
  creds: MetaAdsCredentials,
  options?: { days?: number; asOf?: string; fetchImpl?: typeof fetch },
): Promise<MetaAdsSyncResult> {
  const days = Math.max(1, Math.min(options?.days ?? 90, 365))
  const end = resolveAsOf(options?.asOf)
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(days - 1)))
  const sync = await store.startSync('meta-ads')
  try {
    const rows = metaDailyAdSpend(await fetchMetaInsights(creds, start, end, options?.fetchImpl))
    const written = await store.upsertAdSpend(rows)
    const spend = round2(rows.reduce((a, r) => a + r.spend, 0))
    await store.finishSync(sync.id, 'ok', `Meta Ads ${start}→${end}: ${written} campaign-days, $${spend.toFixed(2)} spend`, written)
    return { start, end, rows: written, spend }
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Meta Ads sync failed', 0)
    throw error
  }
}
