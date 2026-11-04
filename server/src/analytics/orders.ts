import { storeDay } from './period.js'
import type { Order } from './types.js'

/**
 * Prefer authoritative channel sources over Sales Tracker history so the same
 * sale is never counted twice after cutover / CSV backfill.
 * - Shopify Admin (`source: shopify`) beats tracker Shopify rows
 * - Manual Squarespace CSV backfill beats tracker Squarespace rows, but only through the last day
 *   the backfill covers; later tracker rows are the only record of those sales and stay
 * Etsy / eBay / other tracker rows stay unless a stronger source exists.
 */
export function preferLiveOrders(orders: Order[]): Order[] {
  const hasLiveShopify = orders.some((o) => o.channel === 'shopify' && o.source === 'shopify')
  let manualSquarespaceThrough: string | null = null
  for (const o of orders) {
    if (o.channel !== 'squarespace' || o.source !== 'manual') continue
    const day = storeDay(o.orderedAt)
    if (!manualSquarespaceThrough || day > manualSquarespaceThrough) manualSquarespaceThrough = day
  }
  return orders.filter((o) => {
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
