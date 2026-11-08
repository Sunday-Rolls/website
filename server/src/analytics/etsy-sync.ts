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
import { mapEtsyListing, mapEtsyReceiptDetail, mapEtsyReview, mapEtsyShop } from './etsy-details.js'
import { etsyDailyFees, etsyLedgerByReceipt } from './etsy-fees.js'
import {
  etsyMoney,
  fetchEtsyLedgerEntries,
  fetchEtsyListingInventory,
  fetchEtsyListings,
  fetchEtsyPaymentsForReceipts,
  fetchEtsyReceipts,
  fetchEtsyReviews,
  fetchEtsyShop,
  getEtsyAccessToken,
  resolveEtsyShopId,
  type EtsyCredentials,
  type EtsyLedgerEntryRaw,
  type EtsyPaymentRaw,
  type EtsyReceiptRaw,
} from './etsy.js'
import { storeDay } from './period.js'
import { INVENTORY_ETSY_KEY, etsyListedBySku, mergeEtsySales, type EtsyInventory } from './inventory.js'
import type { AnalyticsStore } from './store.js'
import type { CustomerOrder, EtsyReceiptDetail, Order } from './types.js'

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
  /** Receipt detail rows written to analytics_etsy_receipts (all receipts in the window, sheet ones too). */
  receiptDetails: number
  /** Receipts whose Etsy Payments record was read this run. */
  payments: number
  /** Live orders written with real Etsy fees instead of the estimate. */
  actualFeeOrders: number
  /** Live orders written with a real shipping label cost instead of the estimate. */
  actualLabelOrders: number
  /** analytics_etsy_fees_daily rows written. */
  feeRows: number
  /** Customer-history rows written (counted receipts with a buyer id). */
  customerOrders: number
  /** Listings stored (replace-all), or null when listings couldn't be read. */
  listings: number | null
  /** Reviews fetched and upserted this run, or null when reviews couldn't be read. */
  reviews: number | null
  /** True when today's shop snapshot was written. */
  shopSnapshot: boolean
  /** Sections that failed this run (orders still synced): payments, ledger, receipts, fees, customers, listings, reviews, shop. */
  skipped: string[]
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
  /** Real Etsy numbers when known (from the receipt detail); null/undefined falls back to the estimate. */
  actual: { fees?: number | null; shippingCost?: number | null } = {},
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
    fees: actual.fees != null ? round2(actual.fees) : round2(revenue * costs.feeRate),
    shippingCost: actual.shippingCost != null ? round2(actual.shippingCost) : round2(costs.shippingPerOrder),
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

/** Receipts created within this many days get their payment re-read each run (refunds adjust fees). */
const PAYMENT_REFRESH_DAYS = 45
/** Re-read reviews from this long before the newest stored one. */
const REVIEW_OVERLAP_DAYS = 30

function short(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}

function createdOf(raw: EtsyReceiptRaw): number {
  return raw.created_timestamp ?? raw.create_timestamp ?? 0
}

/** Customer-history row for a counted receipt; null without a buyer id. Keyed like the order. */
export function etsyCustomerOrder(raw: EtsyReceiptRaw, detail?: Pick<EtsyReceiptDetail, 'buyerUserId'> | null): CustomerOrder | null {
  const buyer = detail?.buyerUserId ?? (raw.buyer_user_id ? String(raw.buyer_user_id) : null)
  if (!buyer) return null
  const order = mapEtsyReceipt(raw)
  return {
    channel: 'etsy',
    externalId: etsyExternalId(raw.receipt_id),
    orderedAt: order.orderedAt,
    email: `etsy-buyer:${buyer}`,
    revenue: order.revenue,
    units: (raw.transactions ?? []).reduce((s, t) => s + (t.quantity ?? 1), 0),
  }
}

/** Pull recent Etsy receipts and fill in the ones the Sales Tracker doesn't have yet, plus Etsy detail data. */
export async function syncEtsyToStore(
  store: AnalyticsStore,
  creds: EtsyCredentials,
  options: { days?: number; adDays?: number; now?: () => number; paymentIntervalMs?: number } = {},
): Promise<EtsySyncResult> {
  const now = options.now ?? Date.now
  const days = Math.max(1, options.days ?? 365)
  const sync = await store.startSync('etsy')
  try {
    const { accessToken, state } = await getEtsyAccessToken(store, creds, now)
    const shopId = await resolveEtsyShopId(store, creds, accessToken, state)
    const nowSec = Math.floor(now() / 1000)
    const minCreated = nowSec - days * DAY_SECONDS
    const receipts = await fetchEtsyReceipts(creds, accessToken, shopId, { minCreated })

    const existing = (await store.listOrders()).filter((o) => o.channel === 'etsy')
    const fromTracker = new Set(existing.filter((o) => o.source !== 'etsy').map((o) => o.externalId))
    const costs = etsyCostModel(existing)

    const counted = receipts.filter(isCountedReceipt)
    const fresh = counted.filter((r) => !fromTracker.has(etsyExternalId(r.receipt_id)))
    const skipped: Array<{ section: string; reason: string }> = []
    const skip = (section: string, error: unknown) => skipped.push({ section, reason: short(error) })

    // Payment ledger: one read feeds ad spend, daily fees and per-receipt fees.
    const adDays = Math.max(
      1,
      // Backfill the whole order window once; after that a shorter window keeps runs quick.
      options.adDays ?? ((await store.listAdSpend()).some((r) => r.platform === ETSY_ADS_PLATFORM) ? 45 : days),
    )
    // Fetch two extra days so the first day written is complete in store time.
    const ledgerFrom = nowSec - (adDays + 2) * DAY_SECONDS
    const fromDay = storeDay(new Date((nowSec - adDays * DAY_SECONDS) * 1000).toISOString())
    let entries: EtsyLedgerEntryRaw[] | null = null
    let ledgerError: string | null = null
    try {
      entries = await fetchEtsyLedgerEntries(creds, accessToken, shopId, { minCreated: ledgerFrom, maxCreated: nowSec })
    } catch (error) {
      ledgerError = error instanceof Error ? error.message : String(error)
    }

    // Ad spend from the ledger. A failure here (e.g. a missing scope) shouldn't stop orders.
    const ads = await syncEtsyAdSpend(store, entries, ledgerError, {
      fromDay,
      receiptTotals: new Map(counted.map((r) => [String(r.receipt_id), mapEtsyReceipt(r).revenue])),
    })

    // Daily fees by ledger type (the re-read window replaces its days).
    let feeRows = 0
    if (entries) {
      try {
        const rows = etsyDailyFees(entries, { fromDay })
        feeRows = await store.upsertEtsyFeesDaily(rows, { replaceFromDay: fromDay })
      } catch (error) {
        skip('fees', error)
      }
    }

    // Stored receipt details: which payments we already have, and values to keep outside the ledger window.
    let previous = new Map<string, EtsyReceiptDetail>()
    try {
      previous = new Map((await store.listEtsyReceipts()).map((r) => [r.receiptId, r]))
    } catch (error) {
      skip('receipts', error)
    }

    // Etsy Payments (processing fee, net): receipts never read, plus recent ones whose refunds may adjust fees.
    let payments = new Map<string, EtsyPaymentRaw[]>()
    try {
      const refreshFrom = nowSec - PAYMENT_REFRESH_DAYS * DAY_SECONDS
      const wanted = counted
        .filter((r) => !previous.get(String(r.receipt_id))?.paymentSynced || createdOf(r) >= refreshFrom)
        .map((r) => r.receipt_id)
      const read = await fetchEtsyPaymentsForReceipts(creds, accessToken, shopId, wanted, {
        concurrency: 4,
        minIntervalMs: options.paymentIntervalMs,
      })
      payments = read.payments
      if (read.failed) skip('payments', `${read.failed} of ${wanted.length} failed: ${read.firstError}`)
    } catch (error) {
      skip('payments', error)
    }
    const paymentToReceipt = new Map<string, string>()
    for (const [receiptId, list] of payments) for (const p of list) paymentToReceipt.set(String(p.payment_id), String(p.receipt_id ?? receiptId))

    // Per-receipt detail rows, with real fees where the ledger window covers the receipt.
    const ledgerByReceipt = entries ? etsyLedgerByReceipt(entries, receipts, paymentToReceipt) : null
    const details = new Map<string, EtsyReceiptDetail>()
    for (const r of receipts) {
      const id = String(r.receipt_id)
      const covered = ledgerByReceipt && createdOf(r) >= ledgerFrom
      details.set(
        id,
        mapEtsyReceiptDetail(r, {
          payments: payments.get(id),
          ledger: covered ? (ledgerByReceipt.get(id) ?? {}) : undefined,
          previous: previous.get(id) ?? null,
        }),
      )
    }
    let receiptDetails = 0
    try {
      receiptDetails = await store.upsertEtsyReceipts([...details.values()])
    } catch (error) {
      skip('receipts', error)
    }

    // Live orders: real fees and label cost when known, else the sheet-learned estimate.
    let actualFeeOrders = 0
    let actualLabelOrders = 0
    const liveOrders = fresh.map((r) => {
      const detail = details.get(String(r.receipt_id))
      if (detail?.actualFees != null) actualFeeOrders += 1
      if (detail?.labelCost != null) actualLabelOrders += 1
      return mapEtsyReceipt(r, costs, ads.offsiteFees.get(String(r.receipt_id)) ?? detail?.offsiteAdsFee ?? 0, {
        fees: detail?.actualFees,
        shippingCost: detail?.labelCost,
      })
    })
    // onlyReplaceSource: a Sales Tracker sync landing mid-run still wins.
    const orders = await store.upsertOrders(liveOrders, { onlyReplaceSource: 'etsy' })
    // A receipt cancelled or refunded after an earlier sync must leave the dashboard too.
    // Only live rows: the sheet decides what to do with its own.
    const cancelledIds = receipts.filter((r) => !isCountedReceipt(r)).map((r) => etsyExternalId(r.receipt_id))
    const removed = cancelledIds.length
      ? await store.deleteOrders({ channel: 'etsy', source: 'etsy', externalIds: cancelledIds })
      : 0

    // Customer history (new vs returning) keyed by Etsy buyer id, for every counted receipt.
    let customerOrders = 0
    try {
      const rows = counted
        .map((r) => etsyCustomerOrder(r, details.get(String(r.receipt_id))))
        .filter((r): r is CustomerOrder => r !== null)
      customerOrders = rows.length ? await store.upsertCustomerOrders(rows) : 0
      if (cancelledIds.length) await store.deleteCustomerOrders({ channel: 'etsy', externalIds: cancelledIds })
    } catch (error) {
      skip('customers', error)
    }

    const nowIso = new Date(now()).toISOString()
    let listings: number | null = null
    let rawListings: Awaited<ReturnType<typeof fetchEtsyListings>> | null = null
    try {
      rawListings = await fetchEtsyListings(creds, accessToken, shopId)
      listings = await store.replaceEtsyListings(rawListings.map((l) => mapEtsyListing(l, nowIso)))
    } catch (error) {
      skip('listings', error)
    }

    // Inventory page: Etsy sales by receipt (kept after the sheet replaces the live order) and stock per SKU.
    try {
      const listingSkus = new Map<string, string[]>()
      let listed: Record<string, number> | null = null
      if (rawListings) {
        const active = rawListings.filter((l) => (l.state ?? 'active') === 'active')
        const inventories = []
        for (const l of active) {
          const inv = await fetchEtsyListingInventory(creds, accessToken, l.listing_id)
          inventories.push(inv)
          const skus = [...new Set((inv.products ?? []).filter((p) => !p.is_deleted).map((p) => (p.sku || '').trim()).filter(Boolean))]
          listingSkus.set(String(l.listing_id), skus)
        }
        listed = etsyListedBySku(inventories)
      }
      const previous = (await store.getIntegrationState(INVENTORY_ETSY_KEY)) as EtsyInventory | null
      const next: EtsyInventory = {
        sales: mergeEtsySales(previous?.sales ?? {}, receipts, isCountedReceipt, listingSkus),
        listed: listed ?? previous?.listed ?? null,
        syncedAt: nowIso,
      }
      await store.setIntegrationState(INVENTORY_ETSY_KEY, next as unknown as Record<string, unknown>)
    } catch (error) {
      skip('inventory', error)
    }

    let reviews: number | null = null
    try {
      const stored = await store.listEtsyReviews()
      const newest = stored.length ? Date.parse(stored[stored.length - 1].createdAt) / 1000 : 0
      const raw = await fetchEtsyReviews(creds, accessToken, shopId, {
        minCreated: newest ? newest - REVIEW_OVERLAP_DAYS * DAY_SECONDS : undefined,
      })
      reviews = raw.length ? await store.upsertEtsyReviews(raw.map(mapEtsyReview)) : 0
    } catch (error) {
      skip('reviews', error)
    }

    let shopSnapshot = false
    try {
      await store.upsertEtsyShopDaily([mapEtsyShop(await fetchEtsyShop(creds, accessToken, shopId), nowIso)])
      shopSnapshot = true
    } catch (error) {
      skip('shop', error)
    }

    const result: EtsySyncResult = {
      receipts: receipts.length,
      orders,
      inTracker: counted.length - fresh.length,
      removed,
      adSpendRows: ads.rows,
      adSpend: ads.spend,
      receiptDetails,
      payments: payments.size,
      actualFeeOrders,
      actualLabelOrders,
      feeRows,
      customerOrders,
      listings,
      reviews,
      shopSnapshot,
      skipped: [...new Set([...(ledgerError ? ['ledger'] : []), ...skipped.map((s) => s.section)])],
    }
    const extras = [
      fresh.length ? `real fees on ${actualFeeOrders}/${fresh.length} live orders` : null,
      listings != null ? `${listings} listings` : null,
      reviews != null ? `${reviews} reviews` : null,
    ].filter(Boolean)
    const message = `Etsy last ${days}d: ${receipts.length} receipts, ${orders} live orders not yet in the Sales Tracker, ${result.inTracker} already in it${
      removed ? `, removed ${removed} cancelled` : ''
    }. ${ads.note}.${extras.length ? ` ${extras.join(', ')}.` : ''}${
      skipped.length ? ` Skipped ${skipped.map((s) => `${s.section} (${s.reason})`).join('; ')}.` : ''
    }`
    await store.finishSync(sync.id, 'ok', message, orders + removed)
    return result
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Etsy sync failed', 0)
    throw error
  }
}

/** Upsert daily Etsy ad spend from the ledger entries. Never throws; the note says what happened. */
async function syncEtsyAdSpend(
  store: AnalyticsStore,
  entries: EtsyLedgerEntryRaw[] | null,
  ledgerError: string | null,
  options: { fromDay: string; receiptTotals: Map<string, number> },
): Promise<{ rows: number; spend: number | null; offsiteFees: Map<string, number>; note: string }> {
  if (!entries) return { rows: 0, spend: null, offsiteFees: new Map(), note: `Ad spend skipped: ${ledgerError ?? 'ledger unavailable'}` }
  try {
    const daily = etsyDailyAdSpend(entries, { fromDay: options.fromDay, receiptTotals: options.receiptTotals })
    const rows = daily.length ? await store.upsertAdSpend(daily) : 0
    const spend = Math.round(daily.reduce((s, r) => s + r.spend, 0) * 100) / 100
    const unknown = unknownAdLikeTypes(entries)
    const note = `Ad spend since ${options.fromDay}: $${spend.toFixed(2)} across ${rows} day-rows${
      unknown.length ? ` (unrecognised ledger types: ${unknown.join(', ')})` : ''
    }`
    return { rows, spend, offsiteFees: etsyOffsiteFeesByReceipt(entries), note }
  } catch (error) {
    return { rows: 0, spend: null, offsiteFees: new Map(), note: `Ad spend skipped: ${short(error)}` }
  }
}
