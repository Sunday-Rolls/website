import { describe, expect, it } from 'vitest'
import type { EtsyReceiptRaw } from './etsy.js'
import { etsyReviewKey, mapEtsyListing, mapEtsyReceiptDetail, mapEtsyReview, mapEtsyShop } from './etsy-details.js'

const usd = (amount: number) => ({ amount, divisor: 100, currency_code: 'USD' })

const raw: EtsyReceiptRaw = {
  receipt_id: 3811712513,
  status: 'Completed',
  buyer_user_id: 98765,
  is_shipped: true,
  created_timestamp: 1_793_000_000,
  grandtotal: usd(8625),
  subtotal: usd(7200),
  total_shipping_cost: usd(480),
  total_tax_cost: usd(945),
  discount_amt: usd(800),
  refunds: [{ amount: usd(500) }],
  shipments: [{ shipment_notification_timestamp: 1_793_200_000, carrier_name: 'USPS' }],
  transactions: [
    { transaction_id: 1, quantity: 2, price: usd(4000), shop_coupon: 8, buyer_coupon: 0, shipped_timestamp: 1_793_100_000 },
    { transaction_id: 2, quantity: 1, price: usd(0), shop_coupon: 0, buyer_coupon: 1.5, shipped_timestamp: null },
  ],
}

describe('mapEtsyReceiptDetail', () => {
  it('maps money to dollars, coupons, discount and the ship time', () => {
    expect(mapEtsyReceiptDetail(raw)).toEqual({
      receiptId: '3811712513',
      orderedAt: new Date(1_793_000_000_000).toISOString(),
      status: 'completed',
      buyerUserId: '98765',
      grandtotal: 86.25,
      subtotal: 72,
      shippingCharged: 4.8,
      tax: 9.45,
      discount: 8,
      refunded: 5,
      shopCoupon: 8,
      buyerCoupon: 1.5,
      units: 3,
      isShipped: true,
      // The earliest transaction ship time beats the shipment notification.
      shippedAt: new Date(1_793_100_000_000).toISOString(),
      processingFees: null,
      actualFees: null,
      labelCost: null,
      offsiteAdsFee: null,
      net: null,
      paymentSynced: false,
    })
    const noTxShip = { ...raw, transactions: [{ transaction_id: 1, quantity: 1 }] }
    expect(mapEtsyReceiptDetail(noTxShip).shippedAt).toBe(new Date(1_793_200_000_000).toISOString())
    expect(mapEtsyReceiptDetail({ receipt_id: 1, transactions: [] })).toMatchObject({ isShipped: false, shippedAt: null, buyerUserId: null })
  })

  it('takes adjusted payment fees over the originals and adds ledger sale fees', () => {
    const detail = mapEtsyReceiptDetail(raw, {
      payments: [{ payment_id: 7, amount_fees: usd(295), amount_net: usd(8330), adjusted_fees: usd(278), adjusted_net: usd(7847) }],
      ledger: { saleFees: 5.63, saleFeeEntries: 2, label: 6.51, labelEntries: 1, offsite: 0, offsiteEntries: 0 },
    })
    expect(detail).toMatchObject({ processingFees: 2.78, actualFees: 8.41, labelCost: 6.51, offsiteAdsFee: null, net: 78.47, paymentSynced: true })
  })

  it('needs both a processing fee and a sale-fee entry for actual fees', () => {
    expect(mapEtsyReceiptDetail(raw, { payments: [{ payment_id: 7, amount_fees: usd(295) }], ledger: {} })).toMatchObject({
      processingFees: 2.95,
      actualFees: null,
    })
    // No Etsy Payments record: the ledger's processing fee stands in.
    expect(
      mapEtsyReceiptDetail(raw, { payments: [], ledger: { processing: 2.5, processingEntries: 1, saleFees: 5, saleFeeEntries: 1 } }),
    ).toMatchObject({ processingFees: 2.5, actualFees: 7.5, paymentSynced: true, net: null })
  })

  it('keeps stored values for anything not re-read this run', () => {
    const previous = mapEtsyReceiptDetail(raw, {
      payments: [{ payment_id: 7, amount_fees: usd(295), amount_net: usd(8330) }],
      ledger: { saleFees: 5.63, saleFeeEntries: 2, label: 6.51, labelEntries: 1 },
    })
    expect(mapEtsyReceiptDetail(raw, { previous })).toMatchObject({
      processingFees: 2.95,
      actualFees: 8.58,
      labelCost: 6.51,
      net: 83.3,
      paymentSynced: true,
    })
  })
})

describe('listing, review and shop mapping', () => {
  it('maps listings', () => {
    expect(
      mapEtsyListing(
        { listing_id: 55, title: ' Retro Roller ', url: 'https://etsy.com/listing/55', state: 'active', price: usd(8000), quantity: 4, num_favorers: 12, views: 300, tags: ['golf', ' putter '], last_modified_timestamp: 1_793_000_000 },
        '2026-11-06T00:00:00.000Z',
      ),
    ).toEqual({
      listingId: '55',
      title: 'Retro Roller',
      url: 'https://etsy.com/listing/55',
      state: 'active',
      price: 80,
      quantity: 4,
      favorites: 12,
      views: 300,
      tags: ['golf', 'putter'],
      updatedAt: new Date(1_793_000_000_000).toISOString(),
    })
  })

  it('keys reviews by transaction, else by a stable hash', () => {
    const review = { listing_id: 55, rating: 5, review: 'Love it', created_timestamp: 1_793_000_000 }
    expect(mapEtsyReview({ ...review, transaction_id: 4400001 })).toEqual({
      reviewKey: 't:4400001',
      listingId: '55',
      transactionId: '4400001',
      rating: 5,
      review: 'Love it',
      createdAt: new Date(1_793_000_000_000).toISOString(),
    })
    const key = etsyReviewKey(review)
    expect(key).toMatch(/^h:[0-9a-f]{40}$/)
    expect(etsyReviewKey({ ...review })).toBe(key)
    expect(etsyReviewKey({ ...review, rating: 4 })).not.toBe(key)
    expect(mapEtsyReview({ ...review, review: '  ' }).review).toBeNull()
  })

  it('snapshots the shop on the store day', () => {
    expect(
      mapEtsyShop(
        { shop_id: 555, shop_name: 'SundayRolls', url: 'https://etsy.com/shop/SundayRolls', num_favorers: 210, review_count: 48, review_average: 4.9583, transaction_sold_count: 612, listing_active_count: 18 },
        // 03:00 UTC on Nov 6 is still Nov 5 in Chicago.
        '2026-11-06T03:00:00.000Z',
      ),
    ).toEqual({
      date: '2026-11-05',
      shopName: 'SundayRolls',
      url: 'https://etsy.com/shop/SundayRolls',
      favorites: 210,
      reviewCount: 48,
      reviewAverage: 4.96,
      totalSold: 612,
      activeListings: 18,
    })
  })
})
