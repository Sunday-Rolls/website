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
import { ETSY_ADS_PLATFORM, etsyDailyAdSpend, etsyOffsiteFeesByReceipt, unknownAdLikeTypes } from './etsy-ads.js'
import {
  etsyMoney,
  fetchEtsyLedgerEntries,
  fetchEtsyReceipts,
  getEtsyAccessToken,
  resolveEtsyShopId,
  type EtsyCredentials,
  type EtsyReceiptRaw,
} from './etsy.js'
import { storeDay } from './period.js'
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
  /** Daily Etsy ad spend rows written (0 when the ledger couldn't be read). */
  adSpendRows: number
  /** Etsy ad spend in the ledger window, or null when the ledger couldn't be read. */
  adSpend: number | null
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

export function mapEtsyReceipt(
  raw: EtsyReceiptRaw,
  costs: EtsyCostModel = { feeRate: 0, shippingPerOrder: 0 },
  /** This order's Offsite Ads fee from the ledger, when an Etsy ad elsewhere made the sale. */
  offsiteAdsFee = 0,
): Order {
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
    marketingCost: round2(Math.max(0, offsiteAdsFee)),
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
  options: { days?: number; adDays?: number; now?: () => number } = {},
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

    // Ad spend from the payment ledger. A failure here (e.g. a missing scope) shouldn't stop orders.
    const ads = await syncEtsyAdSpend(store, creds, accessToken, shopId, {
      now,
      // Backfill the whole order window once; after that a shorter window keeps runs quick.
      adDays: options.adDays ?? ((await store.listAdSpend()).some((r) => r.platform === ETSY_ADS_PLATFORM) ? 45 : days),
      receiptTotals: new Map(counted.map((r) => [String(r.receipt_id), mapEtsyReceipt(r).revenue])),
    })

    // onlyReplaceSource: a Sales Tracker sync landing mid-run still wins.
    const orders = await store.upsertOrders(
      fresh.map((r) => mapEtsyReceipt(r, costs, ads.offsiteFees.get(String(r.receipt_id)) ?? 0)),
      { onlyReplaceSource: 'etsy' },
    )
    // A receipt cancelled or refunded after an earlier sync must leave the dashboard too.
    // Only live rows: the sheet decides what to do with its own.
    const cancelledIds = receipts.filter((r) => !isCountedReceipt(r)).map((r) => etsyExternalId(r.receipt_id))
    const removed = cancelledIds.length
      ? await store.deleteOrders({ channel: 'etsy', source: 'etsy', externalIds: cancelledIds })
      : 0

    const result: EtsySyncResult = {
      receipts: receipts.length,
      orders,
      inTracker: counted.length - fresh.length,
      removed,
      adSpendRows: ads.rows,
      adSpend: ads.spend,
    }
    const message = `Etsy last ${days}d: ${receipts.length} receipts, ${orders} live orders not yet in the Sales Tracker, ${result.inTracker} already in it${
      removed ? `, removed ${removed} cancelled` : ''
    }. ${ads.note}`
    await store.finishSync(sync.id, 'ok', message, orders + removed)
    return result
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Etsy sync failed', 0)
    throw error
  }
}

/** Read the ledger window and upsert daily Etsy ad spend. Never throws; the note says what happened. */
async function syncEtsyAdSpend(
  store: AnalyticsStore,
  creds: EtsyCredentials,
  token: string,
  shopId: string,
  options: { now: () => number; adDays: number; receiptTotals: Map<string, number> },
): Promise<{ rows: number; spend: number | null; offsiteFees: Map<string, number>; note: string }> {
  const nowSec = Math.floor(options.now() / 1000)
  const adDays = Math.max(1, options.adDays)
  // Fetch two extra days so the first day written is complete in store time.
  const fromDay = storeDay(new Date((nowSec - adDays * DAY_SECONDS) * 1000).toISOString())
  try {
    const entries = await fetchEtsyLedgerEntries(creds, token, shopId, {
      minCreated: nowSec - (adDays + 2) * DAY_SECONDS,
      maxCreated: nowSec,
    })
    const daily = etsyDailyAdSpend(entries, { fromDay, receiptTotals: options.receiptTotals })
    const rows = daily.length ? await store.upsertAdSpend(daily) : 0
    const spend = Math.round(daily.reduce((s, r) => s + r.spend, 0) * 100) / 100
    const unknown = unknownAdLikeTypes(entries)
    const note = `Ad spend since ${fromDay}: $${spend.toFixed(2)} across ${rows} day-rows${
      unknown.length ? ` (unrecognised ledger types: ${unknown.join(', ')})` : ''
    }`
    return { rows, spend, offsiteFees: etsyOffsiteFeesByReceipt(entries), note }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { rows: 0, spend: null, offsiteFees: new Map(), note: `Ad spend skipped: ${reason}` }
  }
}
