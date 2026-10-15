import type { Order } from './types.js'

/**
 * Prefer live Shopify Admin rows over Sales Tracker shopify channel history
 * so the same sale is never counted twice after cutover.
 * Etsy / Squarespace / eBay / other tracker rows are kept for history.
 * Manual uploads always win for their own external ids (separate upsert key).
 */
export function preferLiveOrders(orders: Order[]): Order[] {
  const hasLiveShopify = orders.some((o) => o.channel === 'shopify' && o.source === 'shopify')
  if (!hasLiveShopify) return orders
  return orders.filter((o) => !(o.channel === 'shopify' && o.source === 'sales-tracker'))
}

export function orderSourceCounts(orders: Order[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const o of orders) {
    const key = o.source || 'sales-tracker'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
