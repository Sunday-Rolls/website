/**
 * Builder for the dashboard's Etsy page (/dashboard/api/etsy). Pure: plain arrays plus a range.
 *
 * Orders and revenue come from the orders table (Etsy channel, through preferLiveOrders like the
 * other views). Discounts and shipping speed come from Etsy receipt detail; fees from the daily
 * payment-ledger totals; reviews, listings and shop stats from their own Etsy tables.
 */
import { preferLiveOrders } from './orders.js'
import { inRange, storeDay, type DateRange } from './period.js'
import type {
  CustomerOrder,
  EtsyFeesDaily,
  EtsyListing,
  EtsyReceiptDetail,
  EtsyReview,
  EtsyShopDaily,
  Order,
  SyncRun,
} from './types.js'

type Range = Pick<DateRange, 'start' | 'end'>

export type EtsyFeeGroup = 'selling' | 'ads' | 'shipping' | 'listing' | 'tax' | 'other'

export type EtsyView = {
  range: Range
  connected: boolean
  lastSync: { at: string; status: SyncRun['status']; message: string | null } | null
  shop: {
    name: string
    url: string | null
    favorites: number
    reviewAverage: number | null
    reviewCount: number
    totalSold: number
    activeListings: number
  } | null
  shopTrend: Array<{
    date: string
    favorites: number
    reviewCount: number
    reviewAverage: number | null
    totalSold: number
    activeListings: number
  }>
  orders: {
    count: number
    revenue: number
    avgOrder: number | null
    newBuyers: number
    returningBuyers: number
    unknownBuyers: number
    discountTotal: number
    discountedOrders: number
    avgDaysToShip: number | null
    shippedOrders: number
  }
  coupons: Array<{ code: string; orders: number; discount: number }>
  fees: {
    total: number
    shareOfRevenue: number | null
    perOrder: number | null
    actualFeeOrders: number
    estimatedFeeOrders: number
    byType: Array<{ type: string; label: string; group: EtsyFeeGroup; amount: number; entries: number }>
  }
  feeTrend: Array<{ date: string; amount: number }>
  reviews: {
    average: number | null
    count: number
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>
    recent: Array<{ date: string; rating: number; text: string | null; listingId: string | null; listingTitle: string | null }>
  }
  listings: Array<{
    listingId: string
    title: string
    url: string | null
    state: string
    price: number
    quantity: number
    favorites: number
    unitsSold: number
    revenue: number
    reviewCount: number
    reviewAverage: number | null
  }>
}

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0)

/** Fee categories from etsy-fees.ts → page label and group. Unknown categories fall back to `other`. */
const FEE_TYPES: Record<string, { label: string; group: EtsyFeeGroup }> = {
  transaction_fee: { label: 'Transaction fees', group: 'selling' },
  processing_fee: { label: 'Payment processing', group: 'selling' },
  regulatory_fee: { label: 'Regulatory operating fees', group: 'selling' },
  currency_conversion: { label: 'Currency conversion', group: 'selling' },
  etsy_ads: { label: 'Etsy Ads', group: 'ads' },
  offsite_ads: { label: 'Offsite Ads', group: 'ads' },
  shipping_label: { label: 'Shipping labels', group: 'shipping' },
  listing_fee: { label: 'Listing fees', group: 'listing' },
  subscription: { label: 'Subscription', group: 'listing' },
  vat: { label: 'VAT on fees', group: 'tax' },
  sales_tax: { label: 'Sales tax', group: 'tax' },
  other: { label: 'Other fees', group: 'other' },
}

function feeType(category: string): { label: string; group: EtsyFeeGroup } {
  return FEE_TYPES[category] ?? { label: category.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), group: 'other' }
}

/** Same rule as isCountedReceipt in etsy-sync.ts: cancelled and fully refunded receipts are not sales. */
export function isCountedEtsyStatus(status: string): boolean {
  const s = (status || '').trim().toLowerCase()
  return s !== 'canceled' && s !== 'cancelled' && s !== 'fully refunded'
}

/** Listing titles and order-line product names compared case- and whitespace-insensitively. */
function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

const ETSY_BUYER_PREFIX = 'etsy-buyer:'

export function buildEtsyView(input: {
  range: DateRange
  orders: Order[]
  customerOrders: CustomerOrder[]
  receipts: EtsyReceiptDetail[]
  fees: EtsyFeesDaily[]
  listings: EtsyListing[]
  reviews: EtsyReview[]
  shopDaily: EtsyShopDaily[]
  /** Latest sync runs (store.latestSyncs()); only the `etsy` one is used. */
  syncs: SyncRun[]
  connected: boolean
}): EtsyView {
  const { range } = input
  const dayIn = (day: string) => day >= range.start && day <= range.end

  // ---- orders
  const etsyOrders = preferLiveOrders(input.orders).filter((o) => o.channel === 'etsy' && inRange(o.orderedAt, range.start, range.end))
  const count = etsyOrders.length
  const revenue = round2(sum(etsyOrders.map((o) => o.revenue)))

  // ---- new vs returning, by Etsy buyer id
  const buyerRows = input.customerOrders.filter((c) => c.channel === 'etsy' && c.email.toLowerCase().startsWith(ETSY_BUYER_PREFIX))
  const firstDay = new Map<string, string>()
  const buyersInRange = new Set<string>()
  for (const row of buyerRows) {
    const key = row.email.trim().toLowerCase()
    const day = storeDay(row.orderedAt)
    if (!firstDay.has(key) || day < firstDay.get(key)!) firstDay.set(key, day)
    if (dayIn(day)) buyersInRange.add(key)
  }
  let newBuyers = 0
  for (const key of buyersInRange) if (firstDay.get(key)! >= range.start) newBuyers += 1
  const matched = new Set(buyerRows.map((c) => c.externalId))
  const unknownBuyers = etsyOrders.filter((o) => !matched.has(o.externalId)).length

  // ---- receipts: discounts, shipping speed, fee coverage
  const receipts = input.receipts.filter((r) => isCountedEtsyStatus(r.status) && inRange(r.orderedAt, range.start, range.end))
  const discounted = receipts.filter((r) => r.discount > 0)
  const shipped = receipts.filter((r) => r.shippedAt)
  const shipDays = shipped
    .map((r) => (Date.parse(r.shippedAt!) - Date.parse(r.orderedAt)) / 86_400_000)
    .filter((d) => Number.isFinite(d))
    .map((d) => Math.max(0, d))
  const couponRow = (code: string, rows: EtsyReceiptDetail[], pick: (r: EtsyReceiptDetail) => number) => {
    const used = rows.filter((r) => pick(r) > 0)
    return { code, orders: used.length, discount: round2(sum(used.map(pick))) }
  }
  const coupons = [
    couponRow('Shop coupons', receipts, (r) => r.shopCoupon),
    couponRow('Etsy-funded discounts', receipts, (r) => r.buyerCoupon),
  ].filter((c) => c.orders > 0)

  // ---- fees
  const feeRows = input.fees.filter((f) => dayIn(f.date))
  const byCategory = new Map<string, { amount: number; entries: number }>()
  const trend = new Map<string, number>()
  for (const f of feeRows) {
    const row = byCategory.get(f.category) ?? { amount: 0, entries: 0 }
    row.amount += f.amount
    row.entries += f.entries
    byCategory.set(f.category, row)
    if (feeType(f.category).group !== 'tax') trend.set(f.date, (trend.get(f.date) ?? 0) + f.amount)
  }
  const byType = [...byCategory.entries()]
    .map(([type, r]) => ({ type, ...feeType(type), amount: round2(r.amount), entries: r.entries }))
    .filter((t) => t.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
  // Taxes are listed but are not Etsy's cut, so they stay out of the total.
  const feeTotal = round2(sum(byType.filter((t) => t.group !== 'tax').map((t) => t.amount)))
  const feeTrend = [...trend.entries()]
    .map(([date, amount]) => ({ date, amount: round2(amount) }))
    .filter((p) => p.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  // ---- reviews
  const listingTitle = new Map(input.listings.map((l) => [l.listingId, l.title]))
  const rangeReviews = input.reviews.filter((r) => inRange(r.createdAt, range.start, range.end))
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as EtsyView['reviews']['distribution']
  for (const r of rangeReviews) {
    const star = String(Math.min(5, Math.max(1, Math.round(r.rating)))) as keyof typeof distribution
    distribution[star] += 1
  }
  const recent = [...rangeReviews]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((r) => ({
      date: storeDay(r.createdAt),
      rating: r.rating,
      text: r.review?.trim() || null,
      listingId: r.listingId,
      listingTitle: (r.listingId && listingTitle.get(r.listingId)) || null,
    }))

  // ---- listings
  const sales = new Map<string, { units: number; revenue: number }>()
  for (const o of etsyOrders) {
    for (const line of o.lines) {
      const key = titleKey(line.productName)
      const row = sales.get(key) ?? { units: 0, revenue: 0 }
      row.units += line.quantity
      row.revenue += line.lineRevenue
      sales.set(key, row)
    }
  }
  const reviewStats = new Map<string, { count: number; total: number }>()
  for (const r of input.reviews) {
    if (!r.listingId) continue
    const row = reviewStats.get(r.listingId) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += r.rating
    reviewStats.set(r.listingId, row)
  }
  const listings = input.listings
    .map((l) => {
      const s = sales.get(titleKey(l.title))
      const rs = reviewStats.get(l.listingId)
      return {
        listingId: l.listingId,
        title: l.title,
        url: l.url,
        state: l.state,
        price: l.price,
        quantity: l.quantity,
        favorites: l.favorites,
        unitsSold: s?.units ?? 0,
        revenue: round2(s?.revenue ?? 0),
        reviewCount: rs?.count ?? 0,
        reviewAverage: rs ? round2(rs.total / rs.count) : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue || a.title.localeCompare(b.title))

  // ---- shop
  const shopRows = [...input.shopDaily].sort((a, b) => a.date.localeCompare(b.date))
  const latest = shopRows[shopRows.length - 1]
  const shopTrend = shopRows
    .filter((s) => dayIn(s.date))
    .map((s) => ({
      date: s.date,
      favorites: s.favorites,
      reviewCount: s.reviewCount,
      reviewAverage: s.reviewAverage,
      totalSold: s.totalSold,
      activeListings: s.activeListings,
    }))

  const sync = input.syncs.find((s) => s.source === 'etsy')

  return {
    range: { start: range.start, end: range.end },
    connected: input.connected,
    lastSync: sync ? { at: sync.finishedAt ?? sync.startedAt, status: sync.status, message: sync.message } : null,
    shop: latest
      ? {
          name: latest.shopName,
          url: latest.url,
          favorites: latest.favorites,
          reviewAverage: latest.reviewAverage,
          reviewCount: latest.reviewCount,
          totalSold: latest.totalSold,
          activeListings: latest.activeListings,
        }
      : null,
    shopTrend,
    orders: {
      count,
      revenue,
      avgOrder: count > 0 ? round2(revenue / count) : null,
      newBuyers,
      returningBuyers: buyersInRange.size - newBuyers,
      unknownBuyers,
      discountTotal: round2(sum(receipts.map((r) => r.discount))),
      discountedOrders: discounted.length,
      avgDaysToShip: shipDays.length ? Math.round((sum(shipDays) / shipDays.length) * 10) / 10 : null,
      shippedOrders: shipped.length,
    },
    coupons,
    fees: {
      total: feeTotal,
      shareOfRevenue: revenue > 0 ? feeTotal / revenue : null,
      perOrder: count > 0 ? round2(feeTotal / count) : null,
      actualFeeOrders: receipts.filter((r) => r.actualFees != null).length,
      estimatedFeeOrders: receipts.filter((r) => r.actualFees == null).length,
      byType,
    },
    feeTrend,
    reviews: {
      average: rangeReviews.length ? round2(sum(rangeReviews.map((r) => r.rating)) / rangeReviews.length) : null,
      count: rangeReviews.length,
      distribution,
      recent,
    },
    listings,
  }
}
