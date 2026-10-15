import { randomUUID } from 'node:crypto'
import type { Order } from './types.js'
import {
  fetchShopifyOrders,
  loadShopifyCredentialsFromEnv,
  type ShopifyCredentials,
  type ShopifyOrderRaw,
} from './shopify.js'
import type { AnalyticsStore } from './store.js'

export type ShopifySyncResult = {
  start: string | null
  end: string | null
  orders: number
}

function num(value: string | undefined | null): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function mapShopifyOrder(raw: ShopifyOrderRaw): Order {
  const revenue = num(raw.total_price)
  const shipping = num(raw.total_shipping_price_set?.shop_money?.amount)
  const lines = (raw.line_items ?? []).map((line) => {
    const quantity = line.quantity ?? 1
    const unitPrice = num(line.price)
    return {
      productName: (line.title || line.name || 'Product').trim() || 'Product',
      productSku: line.sku?.trim() || null,
      category: null,
      quantity,
      unitPrice,
      lineRevenue: Math.round(unitPrice * quantity * 100) / 100,
    }
  })
  const state =
    raw.shipping_address?.province_code?.trim() ||
    raw.shipping_address?.province?.trim() ||
    null
  const email = raw.email?.trim() || raw.customer?.email?.trim() || null
  const trafficSource =
    raw.source_name?.trim() ||
    raw.referring_site?.trim() ||
    raw.landing_site?.trim() ||
    null

  return {
    id: randomUUID(),
    externalId: `shopify:${raw.id}`,
    channel: 'shopify',
    orderedAt: new Date(raw.created_at).toISOString(),
    revenue,
    fees: 0,
    shippingCost: shipping,
    marketingCost: 0,
    state,
    customerEmail: email,
    isReturning: false,
    trafficSource,
    lines:
      lines.length > 0
        ? lines
        : [
            {
              productName: 'Order',
              productSku: null,
              category: null,
              quantity: 1,
              unitPrice: revenue,
              lineRevenue: revenue,
            },
          ],
  }
}

/** Pull Shopify orders into analytics (upsert by channel + external id). */
export async function syncShopifyToStore(
  store: AnalyticsStore,
  creds: ShopifyCredentials,
  options?: { start?: string | null; end?: string | null },
): Promise<ShopifySyncResult> {
  const start = options?.start || null
  const end = options?.end || null
  const sync = await store.startSync('shopify')
  try {
    const createdAtMin = start ? `${start}T00:00:00Z` : undefined
    const createdAtMax = end ? `${end}T23:59:59Z` : undefined
    const raw = await fetchShopifyOrders(creds, { createdAtMin, createdAtMax })
    // Prefer paid / partially_paid / authorized / pending test checkouts; skip voided/refunded-only later if needed
    const mapped = raw
      .filter((o) => o.financial_status !== 'voided')
      .map(mapShopifyOrder)
    const count = await store.upsertOrders(mapped)
    const message = `Shopify ${start ?? '…'}→${end ?? '…'}: ${count} orders (${raw.length} fetched)`
    await store.finishSync(sync.id, 'ok', message, count)
    return { start, end, orders: count }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shopify sync failed'
    await store.finishSync(sync.id, 'error', message, 0)
    throw error
  }
}

export { loadShopifyCredentialsFromEnv }
