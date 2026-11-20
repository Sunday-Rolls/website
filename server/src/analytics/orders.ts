import { ebayOrderToOrder, isCountedEbayOrder } from './ebay.js'
import { storeDay } from './period.js'
import type { AnalyticsStore } from './store.js'
import type { EbayOrderDetail, Order } from './types.js'

/**
 * Orders as the dashboard and reports see them: the orders table plus counted eBay API orders
 * (analytics_ebay_orders). Pass the result through preferLiveOrders, which drops the Sales
 * Tracker's eBay rows that the API covers. Edits and imports keep using store.listOrders().
 */
export async function listDashboardOrders(store: AnalyticsStore): Promise<Order[]> {
  const [orders, ebay] = await Promise.all([store.listOrders(), store.listEbayOrders().catch(() => [])])
  return withEbayApiOrders(orders, ebay)
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
