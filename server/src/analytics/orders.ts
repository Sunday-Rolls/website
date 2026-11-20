import { ebayOrderToOrder, isCountedEbayOrder } from './ebay.js'
import { etsyCostModel, etsyExternalId } from './etsy-sync.js'
import { storeDay } from './period.js'
import type { AnalyticsStore } from './store.js'
import type { EbayOrderDetail, EtsyReceiptDetail, Order } from './types.js'

/**
 * Orders as the dashboard and reports see them: the orders table plus counted eBay API orders
 * (analytics_ebay_orders). Pass the result through preferLiveOrders, which drops the Sales
 * Tracker's eBay rows that the API covers. Edits and imports keep using store.listOrders().
 */
export async function listDashboardOrders(store: AnalyticsStore): Promise<Order[]> {
  const [orders, ebay, etsy] = await Promise.all([
    store.listOrders(),
    store.listEbayOrders().catch(() => []),
    store.listEtsyReceipts().catch(() => []),
  ])
  return withEbayApiOrders(withEtsyApiOrders(orders, etsy), ebay)
}

const round2 = (n: number) => Math.round(n * 100) / 100

function etsyReceiptCounted(status: string): boolean {
  const s = status.trim().toLowerCase()
  return s !== 'canceled' && s !== 'cancelled' && s !== 'fully refunded'
}

/**
 * Etsy's API copy of each receipt replaces the Sales Tracker's copy of the same receipt (both are
 * keyed `etsy:<receipt id>`), so every Etsy order carries its real items and SKUs. Receipts Etsy
 * marks cancelled or fully refunded are removed even if the tracker counts them. Fees, label cost
 * and Offsite Ads come from Etsy when known; otherwise the tracker row's figures for the same
 * receipt are kept, and failing that the tracker-learned estimate. Tracker rows with no matching
 * receipt (older than the API window) stay as they are.
 */
export function withEtsyApiOrders(orders: Order[], receipts: EtsyReceiptDetail[]): Order[] {
  if (!receipts.length) return orders
  const estimate = etsyCostModel(orders)
  const byKey = new Map(orders.map((o) => [`${o.channel}|${o.externalId}`, o]))
  for (const r of receipts) {
    const externalId = etsyExternalId(r.receiptId)
    const key = `etsy|${externalId}`
    const existing = byKey.get(key)
    if (!etsyReceiptCounted(r.status)) {
      byKey.delete(key)
      continue
    }
    const revenue = round2(Math.max(0, r.grandtotal - r.refunded))
    if (revenue <= 0) {
      byKey.delete(key)
      continue
    }
    const lines = (r.lines ?? [])
      .filter((l) => l.quantity > 0)
      .map((l) => ({
        productName: (l.title || 'Etsy item').trim() || 'Etsy item',
        productSku: l.sku?.trim() || null,
        category: /towel/i.test(l.title) ? 'Towel' : 'Headcover',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineRevenue: l.lineRevenue,
      }))
    const fallbackLines = existing?.source === 'etsy' && existing.lines.length ? existing.lines : null
    byKey.set(key, {
      id: existing?.id ?? `etsy-api:${r.receiptId}`,
      externalId,
      channel: 'etsy',
      source: 'etsy',
      orderedAt: r.orderedAt,
      revenue,
      fees: round2(r.actualFees ?? existing?.fees ?? revenue * estimate.feeRate),
      shippingCost: round2(r.labelCost ?? existing?.shippingCost ?? estimate.shippingPerOrder),
      marketingCost: round2(existing && existing.source !== 'etsy' ? existing.marketingCost : (r.offsiteAdsFee ?? existing?.marketingCost ?? 0)),
      state: existing?.state ?? null,
      customerEmail: existing?.customerEmail ?? null,
      isReturning: existing?.isReturning ?? false,
      trafficSource: existing?.trafficSource ?? null,
      lines: lines.length
        ? lines
        : (fallbackLines ?? [{ productName: 'Etsy order', productSku: null, category: 'Headcover', quantity: 1, unitPrice: revenue, lineRevenue: revenue }]),
    })
  }
  return [...byKey.values()]
}

export function withEbayApiOrders(orders: Order[], ebay: EbayOrderDetail[]): Order[] {
  const have = new Set(orders.map((o) => `${o.channel}|${o.externalId}`))
  // Older sales of a listing were made before it had a SKU; borrow the SKU from a newer sale.
  const skuByItem = new Map<string, string>()
  for (const o of [...ebay].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))) {
    for (const l of o.lines) if (l.itemId && l.sku && !skuByItem.has(l.itemId)) skuByItem.set(l.itemId, l.sku)
  }
  const extra = ebay
    .filter(isCountedEbayOrder)
    .map((o) => ebayOrderToOrder(o, skuByItem))
    .filter((o) => o.revenue > 0 && !have.has(`${o.channel}|${o.externalId}`))
  return [...orders, ...extra]
}

/**
 * Prefer authoritative channel sources over Sales Tracker history so the same
 * sale is never counted twice after cutover / CSV backfill.
 * - Shopify Admin (`source: shopify`) beats tracker Shopify rows
 * - Manual Squarespace CSV backfill beats tracker Squarespace rows, but only through the last day
 *   the backfill covers; later tracker rows are the only record of those sales and stay
 * - eBay API orders (`source: ebay`) beat tracker eBay rows from the first day the API has an order
 * Etsy / other tracker rows stay unless a stronger source exists.
 */
export function preferLiveOrders(orders: Order[]): Order[] {
  const hasLiveShopify = orders.some((o) => o.channel === 'shopify' && o.source === 'shopify')
  let manualSquarespaceThrough: string | null = null
  for (const o of orders) {
    if (o.channel !== 'squarespace' || o.source !== 'manual') continue
    const day = storeDay(o.orderedAt)
    if (!manualSquarespaceThrough || day > manualSquarespaceThrough) manualSquarespaceThrough = day
  }
  let ebayApiFrom: string | null = null
  for (const o of orders) {
    if (o.channel !== 'ebay' || o.source !== 'ebay') continue
    const day = storeDay(o.orderedAt)
    if (!ebayApiFrom || day < ebayApiFrom) ebayApiFrom = day
  }
  return orders.filter((o) => {
    if (
      ebayApiFrom &&
      o.channel === 'ebay' &&
      (o.source || 'sales-tracker') === 'sales-tracker' &&
      storeDay(o.orderedAt) >= ebayApiFrom
    ) {
      return false
    }
    if (hasLiveShopify && o.channel === 'shopify' && o.source === 'sales-tracker') return false
    if (
      manualSquarespaceThrough &&
      o.channel === 'squarespace' &&
      o.source === 'sales-tracker' &&
      storeDay(o.orderedAt) <= manualSquarespaceThrough
    ) {
      return false
    }
    return true
  })
}

export function orderSourceCounts(orders: Order[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const o of orders) {
    const key = o.source || 'sales-tracker'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
