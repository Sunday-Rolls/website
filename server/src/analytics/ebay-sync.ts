/**
 * eBay orders into analytics_ebay_orders. The reports sheet reads them directly, and the
 * dashboard adds the counted ones to its order list (orders.ts listDashboardOrders), replacing
 * the Sales Tracker's eBay rows. Nothing here touches analytics_orders.
 *
 * Each run reads the last `days` of orders (Fulfillment API) and the same window of Finances
 * transactions for real sale fees, shipping labels and Promoted Listings fees. If Finances can't
 * be read (e.g. the refresh token lacks the sell.finances scope), orders are still stored, with
 * eBay's per-order marketplace fee and any costs saved by an earlier run.
 */
import {
  ebayCostsByOrder,
  fetchEbayOrders,
  fetchEbayTransactions,
  getEbayAccessToken,
  mapEbayOrder,
  type EbayCredentials,
  type EbayOrderCosts,
} from './ebay.js'
import type { AnalyticsStore } from './store.js'

export const EBAY_SYNC_SOURCE = 'ebay'

export type EbaySyncResult = {
  orders: number
  /** Orders whose fees/labels came from the Finances API this run. */
  withFinances: number
  /** Sections that failed this run (orders still synced). */
  skipped: string[]
}

const DAY_MS = 86_400_000

function short(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

export async function syncEbayToStore(
  store: AnalyticsStore,
  creds: EbayCredentials,
  options: { days?: number; now?: () => number; fetchImpl?: typeof fetch } = {},
): Promise<EbaySyncResult> {
  const now = options.now ?? Date.now
  const fetchImpl = options.fetchImpl ?? fetch
  const days = Math.max(1, Math.min(options.days ?? 365, 730))
  const sync = await store.startSync(EBAY_SYNC_SOURCE)
  try {
    const token = await getEbayAccessToken(creds, fetchImpl)
    const toMs = now()
    const fromMs = toMs - days * DAY_MS
    const raw = await fetchEbayOrders(token, { fromMs, fetchImpl })

    const skipped: string[] = []
    let costs: Map<string, EbayOrderCosts> | null = null
    let financesNote = ''
    try {
      costs = ebayCostsByOrder(await fetchEbayTransactions(token, { fromMs, toMs, fetchImpl }))
    } catch (error) {
      skipped.push('finances')
      financesNote = ` Finances skipped (${short(error)}).`
    }

    const previous = new Map((await store.listEbayOrders()).map((o) => [o.orderId, o]))
    let withFinances = 0
    const rows = raw.map((r) => {
      const found = costs?.get(r.orderId)
      if (found) withFinances += 1
      const prev = previous.get(r.orderId)
      // Without this run's Finances read, keep what an earlier run found.
      const merged: EbayOrderCosts | null = costs
        ? (found ?? null)
        : prev
          ? { fees: prev.marketplaceFees, label: prev.labelCost, ads: prev.adFees }
          : null
      return mapEbayOrder(r, merged)
    })
    const orders = await store.upsertEbayOrders(rows)
    const message = `eBay last ${days}d: ${orders} orders, Finances costs on ${withFinances}.${financesNote}`
    await store.finishSync(sync.id, 'ok', message, orders)
    return { orders, withFinances, skipped }
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'eBay sync failed', 0)
    throw error
  }
}
