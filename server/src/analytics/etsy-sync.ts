/**
 * Live Etsy orders for the dashboard.
 *
 * The Sales Tracker sheet stays the record for Etsy: its rows carry Etsy's real fees, label
 * cost and offsite-ads charges. Both use the same key (`etsy:<receipt id>`, channel `etsy`),
 * so this sync only adds receipts the sheet doesn't have yet (source `etsy`). When the next
 * Sales Tracker sync brings a row in, its upsert replaces the live row, so nothing counts twice.
 *
 * Etsy's receipts API doesn't report fees, so live rows carry estimates from the sheet's own
 * Etsy history (fee share of revenue, average shipping cost) until the sheet catches up.
 */
import { randomUUID } from 'node:crypto'
import {
  etsyMoney,
  fetchEtsyReceipts,
  getEtsyAccessToken,
  resolveEtsyShopId,
  type EtsyCredentials,
  type EtsyReceiptRaw,
} from './etsy.js'
import type { AnalyticsStore } from './store.js'
import type { Order } from './types.js'

export type EtsyCostModel = {
  /** Fees as a share of order revenue. */
  feeRate: number
  /** Shipping label cost per order. */
  shippingPerOrder: number
}

export type EtsySyncResult = {
  receipts: number
  /** Live rows added or updated. */
  orders: number
  /** Receipts already in the Sales Tracker (left alone). */
  inTracker: number
  /** Live rows removed because the order was cancelled or fully refunded. */
  removed: number
}

const DAY_SECONDS = 86_400
const round2 = (n: number) => Math.round(n * 100) / 100

export function etsyExternalId(receiptId: number | string): string {
  return `etsy:${receiptId}`
}

/** Cancelled and fully refunded receipts are not sales. */
export function isCountedReceipt(raw: EtsyReceiptRaw): boolean {
  const status = (raw.status || '').trim().toLowerCase()
  return status !== 'canceled' && status !== 'cancelled' && status !== 'fully refunded'
}

/** Fee share and shipping cost from the sheet's Etsy rows; zeros when there's no history. */
export function etsyCostModel(orders: Order[]): EtsyCostModel {
  const history = orders.filter((o) => o.channel === 'etsy' && o.source !== 'etsy' && o.revenue > 0)
  const revenue = history.reduce((s, o) => s + o.revenue, 0)
  if (!history.length || revenue <= 0) return { feeRate: 0, shippingPerOrder: 0 }
  return {
    feeRate: history.reduce((s, o) => s + o.fees, 0) / revenue,
    shippingPerOrder: history.reduce((s, o) => s + o.shippingCost, 0) / history.length,
  }
}

export function mapEtsyReceipt(raw: EtsyReceiptRaw, costs: EtsyCostModel = { feeRate: 0, shippingPerOrder: 0 }): Order {
  const refunded = (raw.refunds ?? []).reduce((s, r) => s + etsyMoney(r.amount), 0)
  // Same as the sheet's Price column: what the buyer paid (items + shipping + tax), less refunds.
  const revenue = round2(Math.max(0, etsyMoney(raw.grandtotal) - refunded))
  const created = raw.created_timestamp ?? raw.create_timestamp ?? 0
  const lines = (raw.transactions ?? []).map((t) => {
    const quantity = t.quantity ?? 1
    const unitPrice = etsyMoney(t.price)
    return {
      productName: (t.title || 'Etsy item').trim() || 'Etsy item',
      productSku: t.sku?.trim() || null,
      category: 'Headcover',
      quantity,
      unitPrice,
      lineRevenue: round2(unitPrice * quantity),
    }
  })
  const country = (raw.country_iso || '').trim().toUpperCase()
  return {
    id: randomUUID(),
    externalId: etsyExternalId(raw.receipt_id),
    channel: 'etsy',
    source: 'etsy',
    orderedAt: new Date(created * 1000).toISOString(),
    revenue,
    fees: round2(revenue * costs.feeRate),
    shippingCost: round2(costs.shippingPerOrder),
    marketingCost: 0,
    state: country === 'US' ? raw.state?.trim() || null : null,
    // The buyer's email needs Etsy's email_r scope, which this app doesn't request.
    customerEmail: null,
    isReturning: false,
    trafficSource: null,
    lines: lines.length
      ? lines
      : [{ productName: 'Etsy order', productSku: null, category: 'Headcover', quantity: 1, unitPrice: revenue, lineRevenue: revenue }],
  }
}

/** Pull recent Etsy receipts and fill in the ones the Sales Tracker doesn't have yet. */
export async function syncEtsyToStore(
  store: AnalyticsStore,
  creds: EtsyCredentials,
  options: { days?: number; now?: () => number } = {},
): Promise<EtsySyncResult> {
  const now = options.now ?? Date.now
  const days = Math.max(1, options.days ?? 365)
  const sync = await store.startSync('etsy')
  try {
    const { accessToken, state } = await getEtsyAccessToken(store, creds, now)
    const shopId = await resolveEtsyShopId(store, creds, accessToken, state)
    const minCreated = Math.floor(now() / 1000) - days * DAY_SECONDS
    const receipts = await fetchEtsyReceipts(creds, accessToken, shopId, { minCreated })

    const existing = (await store.listOrders()).filter((o) => o.channel === 'etsy')
    const fromTracker = new Set(existing.filter((o) => o.source !== 'etsy').map((o) => o.externalId))
    const costs = etsyCostModel(existing)

    const counted = receipts.filter(isCountedReceipt)
    const fresh = counted.filter((r) => !fromTracker.has(etsyExternalId(r.receipt_id)))
    // onlyReplaceSource: a Sales Tracker sync landing mid-run still wins.
    const orders = await store.upsertOrders(fresh.map((r) => mapEtsyReceipt(r, costs)), { onlyReplaceSource: 'etsy' })
    // A receipt cancelled or refunded after an earlier sync must leave the dashboard too.
    // Only live rows: the sheet decides what to do with its own.
    const cancelledIds = receipts.filter((r) => !isCountedReceipt(r)).map((r) => etsyExternalId(r.receipt_id))
    const removed = cancelledIds.length
      ? await store.deleteOrders({ channel: 'etsy', source: 'etsy', externalIds: cancelledIds })
      : 0

    const result = { receipts: receipts.length, orders, inTracker: counted.length - fresh.length, removed }
    const message = `Etsy last ${days}d: ${receipts.length} receipts, ${orders} live orders not yet in the Sales Tracker, ${result.inTracker} already in it${
      removed ? `, removed ${removed} cancelled` : ''
    }`
    await store.finishSync(sync.id, 'ok', message, orders + removed)
    return result
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Etsy sync failed', 0)
    throw error
  }
}
