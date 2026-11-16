/**
 * Squarespace order history from the Squarespace *accounting* export (Commerce → Orders →
 * Download → Accounting), which has what the plain orders CSV lacks: processing fees, every
 * refund, and per-line discounts. Squarespace is closed, so this is applied once.
 *
 * src/data/squarespace-accounting-orders.json holds the export reduced to what the dashboard
 * needs (no customer names, emails or addresses). On boot, if that file's version hasn't been
 * applied yet, the Squarespace orders (channel squarespace, source manual, key
 * squarespace:<order id>) are replaced from it. Existing rows keep their customer email,
 * returning flag and traffic source.
 */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { AnalyticsStore } from './store.js'
import type { Order } from './types.js'

export type SquarespaceHistoryLine = {
  name: string
  sku: string | null
  quantity: number
  unitPrice: number
  discount: number
  netSales: number
}

export type SquarespaceHistoryOrder = {
  orderId: string
  orderedAt: string
  canceled: boolean
  grossSales: number
  /** Items after discounts. */
  netSales: number
  /** Shipping the customer paid. */
  shipping: number
  tax: number
  total: number
  refunded: number
  /** Squarespace Payments / PayPal processing fees, net of fee refunds. */
  fees: number
  state: string | null
  lines: SquarespaceHistoryLine[]
}

export type SquarespaceHistoryFile = { source: string; orders: SquarespaceHistoryOrder[] }

export const SQUARESPACE_HISTORY_KEY = 'squarespace-accounting-history'
export const SQUARESPACE_HISTORY_SYNC_SOURCE = 'squarespace-history'
/** Bump when the data file is replaced, so the next boot applies it again. */
export const SQUARESPACE_HISTORY_VERSION = '2026-11-16'

const round2 = (n: number) => Math.round(n * 100) / 100

export function squarespaceExternalId(orderId: string): string {
  return `squarespace:${orderId}`
}

/**
 * Revenue matches the Shopify and Etsy rows: what the customer paid for goods and shipping,
 * less refunds (tax left out). Shipping cost is the shipping charged: Squarespace labels were
 * bought in batches, so the real per-order label cost isn't known (the reports sheet uses the
 * bank's label charges instead).
 */
export function squarespaceHistoryRevenue(o: SquarespaceHistoryOrder): number {
  if (o.canceled) return 0
  return round2(Math.max(0, o.netSales + o.shipping - o.refunded))
}

/** Orders to upsert and external ids to delete (cancelled, fully refunded or $0 orders). */
export function squarespaceHistoryChanges(
  history: SquarespaceHistoryOrder[],
  existing: Order[],
): { upserts: Order[]; deleteIds: string[] } {
  const current = new Map(existing.filter((o) => o.channel === 'squarespace').map((o) => [o.externalId, o]))
  const upserts: Order[] = []
  const deleteIds: string[] = []
  for (const h of history) {
    const externalId = squarespaceExternalId(h.orderId)
    const revenue = squarespaceHistoryRevenue(h)
    if (revenue <= 0) {
      if (current.has(externalId)) deleteIds.push(externalId)
      continue
    }
    const prev = current.get(externalId)
    const lines = h.lines.length
      ? h.lines.map((l) => ({
          productName: l.name,
          productSku: l.sku,
          category: l.name,
          quantity: l.quantity,
          unitPrice: l.quantity > 0 ? round2(l.netSales / l.quantity) : l.netSales,
          lineRevenue: round2(l.netSales),
        }))
      : [{ productName: 'Squarespace order', productSku: null, category: 'Squarespace order', quantity: 1, unitPrice: revenue, lineRevenue: revenue }]
    upserts.push({
      id: prev?.id ?? randomUUID(),
      externalId,
      channel: 'squarespace',
      source: 'manual',
      orderedAt: h.orderedAt,
      revenue,
      fees: round2(Math.max(0, h.fees)),
      shippingCost: round2(h.canceled ? 0 : h.shipping),
      marketingCost: 0,
      state: h.state,
      customerEmail: prev?.customerEmail ?? null,
      isReturning: prev?.isReturning ?? false,
      trafficSource: prev?.trafficSource ?? null,
      lines,
    })
  }
  return { upserts, deleteIds }
}

export function loadSquarespaceHistoryFile(): SquarespaceHistoryFile {
  const require = createRequire(import.meta.url)
  return require('../data/squarespace-accounting-orders.json') as SquarespaceHistoryFile
}

export type SquarespaceHistoryResult =
  | { status: 'applied'; upserted: number; deleted: number }
  | { status: 'already-applied' }

/** Apply the history once per version. */
export async function applySquarespaceHistory(
  store: AnalyticsStore,
  file: SquarespaceHistoryFile = loadSquarespaceHistoryFile(),
  version = SQUARESPACE_HISTORY_VERSION,
): Promise<SquarespaceHistoryResult> {
  const state = await store.getIntegrationState(SQUARESPACE_HISTORY_KEY)
  if (state?.version === version) return { status: 'already-applied' }
  const sync = await store.startSync(SQUARESPACE_HISTORY_SYNC_SOURCE)
  try {
    const { upserts, deleteIds } = squarespaceHistoryChanges(file.orders, await store.listOrders())
    const upserted = await store.upsertOrders(upserts)
    const deleted = deleteIds.length
      ? await store.deleteOrders({ channel: 'squarespace', source: 'manual', externalIds: deleteIds })
      : 0
    await store.setIntegrationState(SQUARESPACE_HISTORY_KEY, { version, upserted, deleted, appliedAt: new Date().toISOString() })
    await store.finishSync(
      sync.id,
      'ok',
      `Squarespace history (${file.source}): ${upserted} orders with fees, shipping and refunds; removed ${deleted} refunded or $0 orders`,
      upserted + deleted,
    )
    return { status: 'applied', upserted, deleted }
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Squarespace history failed', 0)
    throw error
  }
}
