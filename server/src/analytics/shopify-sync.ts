import { randomUUID } from 'node:crypto'
import type { AbandonedCartStats, Order } from './types.js'
import {
  fetchShopifyAbandonedCheckouts,
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
  abandoned: number
  recovered: number
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
      // Prefer `name` (includes variant, e.g. "Retro Roller Grey - DF3") over bare product title.
      productName: (line.name || line.title || 'Product').trim() || 'Product',
      productSku: line.sku?.trim() || null,
      category: line.title?.trim() || null,
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
    source: 'shopify',
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

/** Pull Shopify orders + abandoned checkouts into analytics. */
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
    const mapped = raw
      .filter((o) => !o.cancelled_at && o.financial_status !== 'voided')
      .filter((o) => !(o.tags || '').toLowerCase().includes('analytics-test'))
      .map(mapShopifyOrder)
    const count = await store.upsertOrders(mapped)
    // Drop any Sales Tracker Shopify rows so history cannot double-count live Admin orders.
    const removedTracker = await store.deleteOrders({
      channel: 'shopify',
      source: 'sales-tracker',
      start,
      end,
    })

    const checkouts = await fetchShopifyAbandonedCheckouts(creds, {
      createdAtMin: start ?? undefined,
      createdAtMax: end ?? undefined,
    })
    const recovered = checkouts.filter((c) => c.completedAt)
    const abandonedOnly = checkouts.filter((c) => !c.completedAt)
    const periodStart = start ?? minDate(checkouts.map((c) => c.createdAt.slice(0, 10))) ?? new Date().toISOString().slice(0, 10)
    const periodEnd = end ?? maxDate(checkouts.map((c) => c.createdAt.slice(0, 10))) ?? periodStart
    const abandonedStats: AbandonedCartStats = {
      periodStart,
      periodEnd,
      abandoned: abandonedOnly.length,
      recovered: recovered.length,
      recoveredRevenue: recovered.reduce((s, c) => s + c.total, 0),
    }
    await store.replaceAbandoned(abandonedStats)

    const message = `Shopify ${start ?? '…'}→${end ?? '…'}: ${count} orders, ${abandonedOnly.length} abandoned, ${recovered.length} recovered${
      removedTracker ? `, removed ${removedTracker} tracker Shopify rows` : ''
    }`
    await store.finishSync(sync.id, 'ok', message, count + checkouts.length + removedTracker)
    return {
      start,
      end,
      orders: count,
      abandoned: abandonedOnly.length,
      recovered: recovered.length,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shopify sync failed'
    await store.finishSync(sync.id, 'error', message, 0)
    throw error
  }
}

function minDate(values: string[]): string | null {
  const sorted = values.filter(Boolean).sort()
  return sorted[0] ?? null
}

function maxDate(values: string[]): string | null {
  const sorted = values.filter(Boolean).sort()
  return sorted[sorted.length - 1] ?? null
}

export { loadShopifyCredentialsFromEnv }
