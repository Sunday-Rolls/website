import { describe, expect, it } from 'vitest'
import { buildEtsyView } from './etsy-view.js'
import { rangeForCustom } from './period.js'
import type { CustomerOrder, EtsyFeesDaily, EtsyListing, EtsyReceiptDetail, EtsyReview, EtsyShopDaily, Order, SyncRun } from './types.js'

const RANGE = rangeForCustom('2026-10-01', '2026-10-31')

function order(externalId: string, orderedAt: string, revenue: number, extra: Partial<Order> = {}): Order {
  return {
    id: externalId,
    externalId,
    channel: 'etsy',
    source: 'etsy',
    orderedAt,
    revenue,
    fees: 0,
    shippingCost: 0,
    marketingCost: 0,
    state: null,
    customerEmail: null,
    isReturning: false,
    trafficSource: null,
    lines: [{ productName: 'Birdie Machine', productSku: null, category: 'Headcover', quantity: 1, unitPrice: revenue, lineRevenue: revenue }],
    ...extra,
  }
}

function receipt(receiptId: string, orderedAt: string, extra: Partial<EtsyReceiptDetail> = {}): EtsyReceiptDetail {
  return {
    receiptId,
    orderedAt,
    status: 'completed',
    buyerUserId: null,
    grandtotal: 80,
    subtotal: 80,
    shippingCharged: 0,
    tax: 0,
    discount: 0,
    refunded: 0,
    shopCoupon: 0,
    buyerCoupon: 0,
    units: 1,
    isShipped: false,
    shippedAt: null,
    processingFees: null,
    actualFees: null,
    labelCost: null,
    offsiteAdsFee: null,
    net: null,
    paymentSynced: false,
    ...extra,
  }
}

function customer(externalId: string, orderedAt: string, buyer: string): CustomerOrder {
  return { channel: 'etsy', externalId, orderedAt, email: `etsy-buyer:${buyer}`, revenue: 80, units: 1 }
}

function fee(date: string, category: string, amount: number, entries = 1): EtsyFeesDaily {
  return { date, ledgerType: category, category, amount, entries }
}

function listing(listingId: string, title: string, extra: Partial<EtsyListing> = {}): EtsyListing {
  return { listingId, title, url: null, state: 'active', price: 80, quantity: 5, favorites: 3, views: 0, tags: [], updatedAt: '2026-10-01T00:00:00Z', ...extra }
}

function review(key: string, createdAt: string, rating: number, listingId: string | null = 'L1', text: string | null = 'Great'): EtsyReview {
  return { reviewKey: key, listingId, transactionId: null, rating, review: text, createdAt }
}

function shop(date: string, favorites: number): EtsyShopDaily {
  return { date, shopName: 'SundayRolls', url: 'https://www.etsy.com/shop/SundayRolls', favorites, reviewCount: 40, reviewAverage: 4.9, totalSold: 300, activeListings: 8 }
}

function view(input: Partial<Parameters<typeof buildEtsyView>[0]> = {}) {
  return buildEtsyView({
    range: RANGE,
    orders: [],
    customerOrders: [],
    receipts: [],
    fees: [],
    listings: [],
    reviews: [],
    shopDaily: [],
    syncs: [],
    connected: true,
    ...input,
  })
}

describe('buildEtsyView', () => {
  it('counts only Etsy orders in range', () => {
    const v = view({
      orders: [
        order('etsy:1', '2026-10-05T18:00:00Z', 80),
        order('etsy:2', '2026-10-06T18:00:00Z', 40),
        order('etsy:3', '2026-09-20T18:00:00Z', 99),
        order('shop-1', '2026-10-05T18:00:00Z', 500, { channel: 'shopify', source: 'shopify' }),
      ],
    })
    expect(v.orders).toMatchObject({ count: 2, revenue: 120, avgOrder: 60 })
    expect(view().orders.avgOrder).toBeNull()
  })

  it('splits new, returning and unmatched Etsy buyers', () => {
    const v = view({
      orders: [order('etsy:1', '2026-10-05T18:00:00Z', 80), order('etsy:2', '2026-10-06T18:00:00Z', 80), order('etsy:3', '2026-10-07T18:00:00Z', 80)],
      customerOrders: [
        customer('etsy:0', '2026-08-01T18:00:00Z', 'A'),
        customer('etsy:1', '2026-10-05T18:00:00Z', 'A'),
        customer('etsy:2', '2026-10-06T18:00:00Z', 'B'),
        { channel: 'squarespace', externalId: 'etsy:3', orderedAt: '2026-10-07T18:00:00Z', email: 'x@example.com', revenue: 80, units: 1 },
      ],
    })
    expect(v.orders).toMatchObject({ newBuyers: 1, returningBuyers: 1, unknownBuyers: 1 })
  })

  it('sums discounts and coupon types from counted receipts in range', () => {
    const v = view({
      receipts: [
        receipt('1', '2026-10-05T18:00:00Z', { discount: 8, shopCoupon: 8 }),
        receipt('2', '2026-10-06T18:00:00Z', { discount: 5, buyerCoupon: 5 }),
        receipt('3', '2026-10-07T18:00:00Z', { discount: 4, shopCoupon: 4, status: 'canceled' }),
        receipt('4', '2026-09-07T18:00:00Z', { discount: 4, shopCoupon: 4 }),
        receipt('5', '2026-10-08T18:00:00Z'),
      ],
    })
    expect(v.orders).toMatchObject({ discountTotal: 13, discountedOrders: 2 })
    expect(v.coupons).toEqual([
      { code: 'Shop coupons', orders: 1, discount: 8 },
      { code: 'Etsy-funded discounts', orders: 1, discount: 5 },
    ])
    expect(view({ receipts: [receipt('5', '2026-10-08T18:00:00Z')] }).coupons).toEqual([])
  })

  it('averages days to ship over shipped receipts', () => {
    const v = view({
      receipts: [
        receipt('1', '2026-10-05T12:00:00Z', { shippedAt: '2026-10-06T12:00:00Z', isShipped: true }),
        receipt('2', '2026-10-05T12:00:00Z', { shippedAt: '2026-10-08T12:00:00Z', isShipped: true }),
        receipt('3', '2026-10-05T12:00:00Z'),
      ],
    })
    expect(v.orders).toMatchObject({ avgDaysToShip: 2, shippedOrders: 2 })
    expect(view().orders.avgDaysToShip).toBeNull()
  })

  it('groups fees by type, keeps taxes out of the total and trend', () => {
    const v = view({
      orders: [order('etsy:1', '2026-10-05T18:00:00Z', 100), order('etsy:2', '2026-10-06T18:00:00Z', 100)],
      receipts: [receipt('1', '2026-10-05T18:00:00Z', { actualFees: 9 }), receipt('2', '2026-10-06T18:00:00Z')],
      fees: [
        fee('2026-10-05', 'transaction_fee', 6.5, 1),
        fee('2026-10-06', 'transaction_fee', 6.5, 1),
        fee('2026-10-05', 'processing_fee', 3.2, 1),
        fee('2026-10-06', 'etsy_ads', 10, 3),
        fee('2026-10-06', 'sales_tax', 2, 1),
        fee('2026-10-07', 'listing_fee', 0, 1),
        fee('2026-09-30', 'transaction_fee', 50, 1),
      ],
    })
    expect(v.fees.byType.map((t) => [t.type, t.label, t.group, t.amount, t.entries])).toEqual([
      ['transaction_fee', 'Transaction fees', 'selling', 13, 2],
      ['etsy_ads', 'Etsy Ads', 'ads', 10, 3],
      ['processing_fee', 'Payment processing', 'selling', 3.2, 1],
      ['sales_tax', 'Sales tax', 'tax', 2, 1],
    ])
    expect(v.fees.total).toBe(26.2)
    expect(v.fees.shareOfRevenue).toBeCloseTo(0.131)
    expect(v.fees.perOrder).toBe(13.1)
    expect(v.fees).toMatchObject({ actualFeeOrders: 1, estimatedFeeOrders: 1 })
    expect(v.feeTrend).toEqual([
      { date: '2026-10-05', amount: 9.7 },
      { date: '2026-10-06', amount: 16.5 },
    ])
    expect(view({ fees: [fee('2026-10-05', 'transaction_fee', 1)] }).fees.shareOfRevenue).toBeNull()
  })

  it('summarises reviews in range with listing titles, newest first', () => {
    const reviews = [
      review('a', '2026-10-02T18:00:00Z', 5),
      review('b', '2026-10-09T18:00:00Z', 4, 'L2', null),
      review('c', '2026-10-05T18:00:00Z', 5, 'gone'),
      review('d', '2026-08-01T18:00:00Z', 1),
    ]
    const v = view({ reviews, listings: [listing('L1', 'Birdie Machine'), listing('L2', 'Morning Dew')] })
    expect(v.reviews.count).toBe(3)
    expect(v.reviews.average).toBe(4.67)
    expect(v.reviews.distribution).toEqual({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 })
    expect(v.reviews.recent.map((r) => [r.date, r.listingTitle, r.text])).toEqual([
      ['2026-10-09', 'Morning Dew', null],
      ['2026-10-05', null, 'Great'],
      ['2026-10-02', 'Birdie Machine', 'Great'],
    ])
    expect(view().reviews.average).toBeNull()
  })

  it('joins listings to Etsy sales by normalised title and all-time reviews', () => {
    const v = view({
      orders: [
        order('etsy:1', '2026-10-05T18:00:00Z', 160, {
          lines: [{ productName: '  birdie   MACHINE ', productSku: null, category: null, quantity: 2, unitPrice: 80, lineRevenue: 160 }],
        }),
        order('etsy:2', '2026-09-05T18:00:00Z', 80),
      ],
      listings: [listing('L2', 'Alpha Cover'), listing('L1', 'Birdie Machine'), listing('L3', 'Zulu Cover')],
      reviews: [review('a', '2026-08-02T18:00:00Z', 5), review('b', '2026-10-02T18:00:00Z', 4)],
    })
    expect(v.listings.map((l) => [l.listingId, l.unitsSold, l.revenue, l.reviewCount, l.reviewAverage])).toEqual([
      ['L1', 2, 160, 2, 4.5],
      ['L2', 0, 0, 0, null],
      ['L3', 0, 0, 0, null],
    ])
  })

  it('takes the latest shop snapshot overall and the trend in range', () => {
    const v = view({ shopDaily: [shop('2026-11-02', 130), shop('2026-10-01', 100), shop('2026-10-15', 110), shop('2026-09-01', 90)] })
    expect(v.shop).toMatchObject({ name: 'SundayRolls', favorites: 130 })
    expect(v.shopTrend.map((s) => [s.date, s.favorites])).toEqual([
      ['2026-10-01', 100],
      ['2026-10-15', 110],
    ])
    expect(view().shop).toBeNull()
  })

  it('reports the Etsy sync and connection', () => {
    const syncs: SyncRun[] = [
      { id: '1', source: 'shopify', startedAt: '2026-10-01T00:00:00Z', finishedAt: '2026-10-01T00:01:00Z', status: 'ok', message: null, rowsTouched: 1 },
      { id: '2', source: 'etsy', startedAt: '2026-10-02T00:00:00Z', finishedAt: '2026-10-02T00:01:00Z', status: 'error', message: 'boom', rowsTouched: 0 },
    ]
    expect(view({ syncs }).lastSync).toEqual({ at: '2026-10-02T00:01:00Z', status: 'error', message: 'boom' })
    expect(view({ connected: false }).lastSync).toBeNull()
    expect(view({ connected: false }).connected).toBe(false)
  })
})
