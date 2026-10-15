import { addUtcDays, formatUtcDate, parseUtcDate, resolveAsOf } from './period.js'
import { fetchSearchConsoleKeywords, loadGscCredentialsFromEnv, type GscCredentials } from './gsc.js'
import type { AnalyticsStore } from './store.js'

export type GscSyncResult = {
  start: string
  end: string
  keywords: number
  siteUrl: string
}

/** Pull Search Console top queries (by clicks) into analytics_search_keywords. */
export async function syncGscToStore(
  store: AnalyticsStore,
  creds: GscCredentials,
  options?: { days?: number; asOf?: string },
): Promise<GscSyncResult> {
  const days = Math.max(1, Math.min(options?.days ?? 90, 365))
  // Search Console data lags ~2–3 days
  const asOf = resolveAsOf(options?.asOf)
  const end = formatUtcDate(addUtcDays(parseUtcDate(asOf), -3))
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(days - 1)))

  const sync = await store.startSync('search-console')
  try {
    const keywords = await fetchSearchConsoleKeywords(creds, start, end, 50)
    await store.replaceKeywords(keywords)
    const message = `Search Console ${start}→${end}: ${keywords.length} queries (${creds.siteUrl})`
    await store.finishSync(sync.id, 'ok', message, keywords.length)
    return { start, end, keywords: keywords.length, siteUrl: creds.siteUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search Console sync failed'
    await store.finishSync(sync.id, 'error', message, 0)
    throw error
  }
}

export { loadGscCredentialsFromEnv }
