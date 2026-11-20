import { describe, expect, it } from 'vitest'
import { preferLiveOrders, withEtsyApiOrders } from './orders.js'
import type { EtsyReceiptDetail, Order } from './types.js'

const receipt = (id: string, over: Partial<EtsyReceiptDetail> = {}): EtsyReceiptDetail => ({
  receiptId: id,
  orderedAt: '2026-03-10T15:00:00.000Z',
  status: 'completed',
  buyerUserId: null,
  grandtotal: 92.5,
  subtotal: 80,
  shippingCharged: 6,
  tax: 6.5,
  discount: 0,
  refunded: 0,
  shopCoupon: 0,
  buyerCoupon: 0,
  units: 1,
  isShipped: true,
  shippedAt: null,
  processingFees: null,
  actualFees: null,
  labelCost: null,
  offsiteAdsFee: null,
  net: null,
  paymentSynced: false,
  lines: [{ transactionId: 't1', listingId: 'l1', title: 'LAB DF3 Putter Cover | Retro Gaming, Grey', sku: 'SR-RETRO-DF3-GRY', quantity: 1, unitPrice: 80, lineRevenue: 80 }],
  ...over,
})

const tracker = (id: string, over: Partial<Order> = {}): Order => ({
  id: `t-${id}`,
  externalId: `etsy:${id}`,
  channel: 'etsy',
  source: 'sales-tracker',
  orderedAt: '2026-03-10T00:00:00.000Z',
  revenue: 92.5,
  fees: 15,
  shippingCost: 6,
  marketingCost: 14,
  state: null,
  customerEmail: null,
  isReturning: false,
  trafficSource: null,
  lines: [{ productName: 'Headcover', productSku: null, category: 'Headcover', quantity: 1, unitPrice: 92.5, lineRevenue: 92.5 }],
  ...over,
})

describe('Etsy API orders on the dashboard', () => {
  it('replaces the tracker copy, keeping its costs when Etsy has none', () => {
    const [o] = withEtsyApiOrders([tracker('1')], [receipt('1')])
    expect(o).toMatchObject({ source: 'etsy', externalId: 'etsy:1', revenue: 92.5, fees: 15, shippingCost: 6, marketingCost: 14 })
    expect(o.lines[0]).toMatchObject({ productName: 'LAB DF3 Putter Cover | Retro Gaming, Grey', productSku: 'SR-RETRO-DF3-GRY' })
  })

  it("uses Etsy's own fees and label cost when known", () => {
    const [o] = withEtsyApiOrders([tracker('1')], [receipt('1', { actualFees: 11.2, labelCost: 5.1 })])
    expect(o).toMatchObject({ fees: 11.2, shippingCost: 5.1 })
  })

  it('drops orders Etsy cancelled even if the tracker counts them', () => {
    const out = withEtsyApiOrders([tracker('1'), tracker('2')], [receipt('1', { status: 'canceled' }), receipt('2')])
    expect(out.map((o) => o.externalId)).toEqual(['etsy:2'])
  })

  it('keeps tracker rows the API has no receipt for, and adds API-only receipts', () => {
    const out = preferLiveOrders(withEtsyApiOrders([tracker('old', { orderedAt: '2025-10-01T00:00:00.000Z' })], [receipt('new')]))
    expect(out.map((o) => `${o.externalId}/${o.source}`).sort()).toEqual(['etsy:new/etsy', 'etsy:old/sales-tracker'])
  })
})
