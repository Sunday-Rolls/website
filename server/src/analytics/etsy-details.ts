/**
 * Mapping Etsy API objects to the detail tables (receipts, listings, reviews, shop snapshot).
 * Money is converted to dollars here.
 */
import { createHash } from 'node:crypto'
import type { EtsyReceiptLedger } from './etsy-fees.js'
import { etsyMoney, type EtsyListingRaw, type EtsyPaymentRaw, type EtsyReceiptRaw, type EtsyReviewRaw, type EtsyShopRaw } from './etsy.js'
import { storeDay } from './period.js'
import type { EtsyListing, EtsyReceiptDetail, EtsyReview, EtsyShopDaily } from './types.js'

const round2 = (n: number) => Math.round(n * 100) / 100
const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

function minPositive(values: Array<number | null | undefined>): number | null {
  const ok = values.filter((v): v is number => typeof v === 'number' && v > 0)
  return ok.length ? Math.min(...ok) : null
}

/**
 * One receipt's detail row.
 * - `payments`: this run's Etsy Payments read for the receipt (undefined = not read this run).
 * - `ledger`: the receipt's ledger costs when this run's ledger window covers the receipt's whole
 *   life (undefined = not covered, or the ledger couldn't be read). An empty object means
 *   "covered, nothing found".
 * - `previous`: the stored row, whose values are kept for anything not re-read this run.
 *
 * actualFees is only set when both the processing fee and at least one other sale-fee entry
 * (normally the transaction fee) are known; otherwise it stays null and orders fall back to estimates.
 */
export function mapEtsyReceiptDetail(
  raw: EtsyReceiptRaw,
  options: { payments?: EtsyPaymentRaw[]; ledger?: Partial<EtsyReceiptLedger>; previous?: EtsyReceiptDetail | null } = {},
): EtsyReceiptDetail {
  const { payments, previous } = options
  const transactions = raw.transactions ?? []
  const created = raw.created_timestamp ?? raw.create_timestamp ?? 0
  const shippedTs =
    minPositive(transactions.map((t) => t.shipped_timestamp)) ??
    minPositive((raw.shipments ?? []).map((s) => s.shipment_notification_timestamp))
  const buyer = raw.buyer_user_id ?? transactions.find((t) => t.buyer_user_id)?.buyer_user_id ?? payments?.find((p) => p.buyer_user_id)?.buyer_user_id

  // Etsy Payments: adjusted_* replace amount_* once a refund changes them.
  let paymentSynced = previous?.paymentSynced ?? false
  let paymentProcessing: number | null = previous?.paymentSynced ? previous.processingFees : null
  let net = previous?.net ?? null
  if (payments) {
    paymentSynced = true
    if (payments.length) {
      paymentProcessing = round2(payments.reduce((s, p) => s + etsyMoney(p.adjusted_fees ?? p.amount_fees), 0))
      net = round2(payments.reduce((s, p) => s + etsyMoney(p.adjusted_net ?? p.amount_net), 0))
    } else {
      paymentProcessing = null
      net = null
    }
  }

  let processingFees: number | null
  let actualFees: number | null
  let labelCost: number | null
  let offsiteAdsFee: number | null
  const ledger = options.ledger
  if (ledger) {
    processingFees = paymentProcessing ?? (ledger.processingEntries ? round2(ledger.processing ?? 0) : null)
    actualFees = processingFees != null && ledger.saleFeeEntries ? round2(processingFees + (ledger.saleFees ?? 0)) : null
    labelCost = ledger.labelEntries ? round2(ledger.label ?? 0) : null
    offsiteAdsFee = ledger.offsiteEntries ? round2(ledger.offsite ?? 0) : null
  } else {
    processingFees = paymentProcessing ?? previous?.processingFees ?? null
    actualFees = previous?.actualFees ?? null
    labelCost = previous?.labelCost ?? null
    offsiteAdsFee = previous?.offsiteAdsFee ?? null
  }

  return {
    receiptId: String(raw.receipt_id),
    orderedAt: iso(created),
    status: (raw.status ?? '').trim().toLowerCase(),
    buyerUserId: buyer ? String(buyer) : null,
    grandtotal: etsyMoney(raw.grandtotal),
    subtotal: etsyMoney(raw.subtotal),
    shippingCharged: etsyMoney(raw.total_shipping_cost),
    tax: etsyMoney(raw.total_tax_cost),
    discount: etsyMoney(raw.discount_amt),
    refunded: round2((raw.refunds ?? []).reduce((s, r) => s + etsyMoney(r.amount), 0)),
    shopCoupon: round2(transactions.reduce((s, t) => s + (Number(t.shop_coupon) || 0), 0)),
    buyerCoupon: round2(transactions.reduce((s, t) => s + (Number(t.buyer_coupon) || 0), 0)),
    units: transactions.reduce((s, t) => s + (t.quantity ?? 1), 0),
    isShipped: raw.is_shipped ?? shippedTs != null,
    shippedAt: shippedTs ? iso(shippedTs) : null,
    processingFees,
    actualFees,
    labelCost,
    offsiteAdsFee,
    net,
    paymentSynced,
  }
}

export function mapEtsyListing(raw: EtsyListingRaw, nowIso: string): EtsyListing {
  const modified = raw.last_modified_timestamp ?? raw.updated_timestamp
  return {
    listingId: String(raw.listing_id),
    title: (raw.title ?? '').trim(),
    url: raw.url?.trim() || null,
    state: (raw.state ?? '').trim().toLowerCase(),
    price: etsyMoney(raw.price),
    quantity: raw.quantity ?? 0,
    favorites: raw.num_favorers ?? 0,
    views: raw.views ?? 0,
    tags: (raw.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
    updatedAt: modified ? iso(modified) : nowIso,
  }
}

/** Reviews key on Etsy's transaction id; without one, a hash of what identifies the review. */
export function etsyReviewKey(raw: EtsyReviewRaw): string {
  if (raw.transaction_id) return `t:${raw.transaction_id}`
  const created = raw.created_timestamp ?? raw.create_timestamp ?? 0
  const text = `${raw.listing_id ?? ''}|${created}|${raw.rating ?? ''}|${raw.review ?? ''}`
  return `h:${createHash('sha1').update(text).digest('hex')}`
}

export function mapEtsyReview(raw: EtsyReviewRaw): EtsyReview {
  const created = raw.created_timestamp ?? raw.create_timestamp ?? 0
  return {
    reviewKey: etsyReviewKey(raw),
    listingId: raw.listing_id ? String(raw.listing_id) : null,
    transactionId: raw.transaction_id ? String(raw.transaction_id) : null,
    rating: Math.round(Number(raw.rating) || 0),
    review: raw.review?.trim() || null,
    createdAt: iso(created),
  }
}

export function mapEtsyShop(raw: EtsyShopRaw, nowIso: string): EtsyShopDaily {
  return {
    date: storeDay(nowIso),
    shopName: (raw.shop_name ?? '').trim(),
    url: raw.url?.trim() || null,
    favorites: raw.num_favorers ?? 0,
    reviewCount: raw.review_count ?? 0,
    reviewAverage: raw.review_average == null ? null : Math.round(Number(raw.review_average) * 100) / 100,
    totalSold: raw.transaction_sold_count ?? 0,
    activeListings: raw.listing_active_count ?? 0,
  }
}
