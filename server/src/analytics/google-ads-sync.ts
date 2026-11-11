import { addUtcDays, formatUtcDate, parseUtcDate, resolveAsOf } from './period.js'
import { fetchGoogleAdsBundle, type GoogleAdsCredentials } from './google-ads.js'
import type { AnalyticsStore } from './store.js'

export type GoogleAdsSyncResult = {
  start: string
  end: string
  dailyRows: number
  searchTerms: number
  cost: number
}

/**
 * Pull Google Ads campaign metrics (per day) and search terms (summed over the window) into
 * analytics_google_ads_daily / analytics_google_ads_search_terms. This doesn't touch
 * analytics_daily_ad_spend: GA4 still supplies Google Ads spend for MER/ROAS there.
 */
export async function syncGoogleAdsToStore(
  store: AnalyticsStore,
  creds: GoogleAdsCredentials,
  options?: {
    days?: number
    asOf?: string
    fetchImpl?: typeof fetch
    getToken?: (creds: GoogleAdsCredentials) => Promise<string>
  },
): Promise<GoogleAdsSyncResult> {
  const days = Math.max(1, Math.min(options?.days ?? 90, 365))
  const end = resolveAsOf(options?.asOf)
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(days - 1)))

  const sync = await store.startSync('google-ads')
  try {
    const { daily, searchTerms } = await fetchGoogleAdsBundle(creds, start, end, options?.fetchImpl, options?.getToken)
    const dailyRows = await store.upsertGoogleAdsDaily(daily, { replaceFromDay: start })
    await store.replaceGoogleAdsSearchTerms(searchTerms)
    const cost = Math.round(daily.reduce((a, r) => a + r.cost, 0) * 100) / 100
    const message = `Google Ads ${start}→${end}: ${dailyRows} campaign-days, ${searchTerms.length} search terms, $${cost.toFixed(2)} cost`
    await store.finishSync(sync.id, 'ok', message, dailyRows + searchTerms.length)
    return { start, end, dailyRows, searchTerms: searchTerms.length, cost }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Ads sync failed'
    await store.finishSync(sync.id, 'error', message, 0)
    throw error
  }
}
