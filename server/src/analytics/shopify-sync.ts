import { randomUUID } from 'node:crypto'
import type { AbandonedCartStats, Order } from './types.js'
import {
  fetchShopifyAbandonedCheckouts,
  fetchShopifyOrders,
  loadShopifyCredentialsFromEnv,
  type ShopifyCredentials,
  type ShopifyOrderRaw,
} from './shopify.js'
import { addUtcDays, formatUtcDate, parseUtcDate, storeMidnightUtc } from './period.js'
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

/** Cart attributes the storefront sets from the visitor's landing URL (see src/lib/attribution.ts). */
const ATTR = { source: '_sr_source', medium: '_sr_medium', campaign: '_sr_campaign', click: '_sr_click' }

/** Which ad network a click ID belongs to. */
const CLICK_IDS: Record<string, { source: string; medium: string }> = {
  gclid: { source: 'google', medium: 'cpc' },
  gbraid: { source: 'google', medium: 'cpc' },
  wbraid: { source: 'google', medium: 'cpc' },
  fbclid: { source: 'facebook', medium: 'paid' },
}

/**
 * Where the order came from, as "source / medium" plus " / campaign" when known
 * (e.g. "google / cpc / Sales-Performance Max-NEW"). Order of preference: the storefront's
 * cart attributes, then UTM / click IDs on Shopify's landing URL, then the referring site.
 * Null when nothing says (direct visits, or orders from before tagging).
 */
export function orderAttribution(raw: ShopifyOrderRaw): string | null {
  const attrs = new Map(
    (raw.note_attributes ?? []).map((a) => [(a.name ?? '').trim(), (a.value ?? '').trim()] as const),
  )
  let source = attrs.get(ATTR.source) || ''
  let medium = attrs.get(ATTR.medium) || ''
  let campaign = attrs.get(ATTR.campaign) || ''
  const click = CLICK_IDS[attrs.get(ATTR.click) || '']

  if (!source && raw.landing_site) {
    try {
      const params = new URL(raw.landing_site, 'https://shop.invalid').searchParams
      source = params.get('utm_source')?.trim() || ''
      medium = params.get('utm_medium')?.trim() || ''
      campaign = params.get('utm_campaign')?.trim() || ''
      const id = Object.keys(CLICK_IDS).find((k) => params.has(k))
      if (!source && id) ({ source, medium } = CLICK_IDS[id])
    } catch {
      // Unparseable landing URL: fall through to the referrer.
    }
  }
  if (!source && click) ({ source, medium } = click)
  if (!source && raw.referring_site) {
    try {
      const host = new URL(raw.referring_site).hostname.replace(/^www\./, '')
      if (host && !/sundayrollsgolf\.com$|myshopify\.com$/.test(host)) {
        source = host
        medium = 'referral'
      }
    } catch {
      // Not a URL: ignore.
    }
  }
  if (!source) return null
  return [source.toLowerCase(), (medium || '(none)').toLowerCase(), campaign].filter(Boolean).join(' / ')
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
  // source_name is Shopify's sales channel id (e.g. "channel:21037214"), not where the buyer came from.
  const trafficSource = orderAttribution(raw)

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

/** Orders that count toward revenue: not cancelled, not voided, not tagged `analytics-test`. */
export function isCountedOrder(raw: ShopifyOrderRaw): boolean {
  if (raw.cancelled_at || raw.financial_status === 'voided') return false
  return !(raw.tags || '').toLowerCase().includes('analytics-test')
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
    // Dashboard days are store-timezone days, so the window runs Central midnight to midnight.
    const createdAtMin = start ? storeMidnightUtc(start) : undefined
    const createdAtMax = end
      ? new Date(Date.parse(storeMidnightUtc(formatUtcDate(addUtcDays(parseUtcDate(end), 1)))) - 1000).toISOString()
      : undefined
    const raw = await fetchShopifyOrders(creds, { createdAtMin, createdAtMax })
    const count = await store.upsertOrders(raw.filter(isCountedOrder).map(mapShopifyOrder))
    // An order cancelled, voided or tagged as a test after an earlier sync must leave the dashboard too.
    const excludedIds = raw.filter((o) => !isCountedOrder(o)).map((o) => `shopify:${o.id}`)
    const removedExcluded = excludedIds.length
      ? await store.deleteOrders({ channel: 'shopify', source: 'shopify', externalIds: excludedIds })
      : 0
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
    }${removedExcluded ? `, removed ${removedExcluded} cancelled/test orders` : ''}`
    await store.finishSync(sync.id, 'ok', message, count + checkouts.length + removedTracker + removedExcluded)
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
