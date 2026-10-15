import { addUtcDays, formatUtcDate, parseUtcDate, resolveAsOf } from './period.js'
import { fetchGa4TrafficBundle, type Ga4Credentials } from './ga4.js'
import type { AnalyticsStore } from './store.js'
import type { DailyAdSpend, DailyProductView, DailyTraffic } from './types.js'

export type Ga4SyncResult = {
  start: string
  end: string
  trafficRows: number
  productViewRows: number
  adSpendRows: number
}

/** Pull GA4 traffic / product pageviews / Google Ads cost into the analytics store. */
export async function syncGa4ToStore(
  store: AnalyticsStore,
  creds: Ga4Credentials,
  options?: { days?: number; asOf?: string },
): Promise<Ga4SyncResult> {
  const days = Math.max(1, Math.min(options?.days ?? 90, 365))
  const end = resolveAsOf(options?.asOf)
  const start = formatUtcDate(addUtcDays(parseUtcDate(end), -(days - 1)))

  const sync = await store.startSync('ga4')
  try {
    const bundle = await fetchGa4TrafficBundle(creds, start, end)

    const traffic: DailyTraffic[] = bundle.traffic.map((row) => ({
      date: row.date,
      channel: 'website',
      visits: row.sessions,
      uniqueVisitors: row.totalUsers,
      productViews: row.productPageViews,
      addToCarts: row.addToCarts,
      checkouts: row.checkouts,
      purchases: row.purchases,
      sourceBreakdown: row.sourceBreakdown,
      regionBreakdown: row.regionBreakdown,
    }))

    // Aggregate same product/day (multiple path variants)
    const productMap = new Map<string, DailyProductView>()
    for (const row of bundle.productViews) {
      const key = `${row.date}::${row.productName}`
      const cur = productMap.get(key) ?? {
        date: row.date,
        productName: row.productName,
        category: row.category,
        views: 0,
      }
      cur.views += row.views
      productMap.set(key, cur)
    }
    const productViews = [...productMap.values()]

    const adSpend: DailyAdSpend[] = bundle.adSpend

    const trafficRows = await store.upsertTraffic(traffic)
    const productViewRows = await store.upsertProductViews(productViews)
    const adSpendRows = await store.upsertAdSpend(adSpend)

    const message = `GA4 ${start}→${end}: ${trafficRows} traffic days, ${productViewRows} product rows, ${adSpendRows} ad spend rows`
    await store.finishSync(sync.id, 'ok', message, trafficRows + productViewRows + adSpendRows)
    return { start, end, trafficRows, productViewRows, adSpendRows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GA4 sync failed'
    await store.finishSync(sync.id, 'error', message, 0)
    throw error
  }
}

export function loadGa4CredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Ga4Credentials | null {
  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  const property = (env.GA4_PROPERTY_RESOURCE || env.GA4_PROPERTY_ID || '').trim()
  if (!serviceAccountJson || !property) return null
  // Measurement IDs (G-…) need the numeric properties/… resource
  if (property.startsWith('G-') && !env.GA4_PROPERTY_RESOURCE) {
    return null
  }
  return { serviceAccountJson, property }
}
