import { describe, expect, it } from 'vitest'
import { preferLiveOrders, withEbayApiOrders } from './orders.js'
import type { EbayOrderDetail, Order } from './types.js'

const apiOrder = (over: Partial<EbayOrderDetail> = {}): EbayOrderDetail => ({
  orderId: '25-14080-59937',
  orderedAt: '2026-03-10T15:00:00.000Z',
  fulfillmentStatus: 'fulfilled',
  paymentStatus: 'paid',
  cancelState: 'none_requested',
  state: 'OH',
  itemSubtotal: 80,
  shippingCharged: 7.17,
  discount: 0,
  tax: 5,
  total: 92.17,
  refunded: 0,
  marketplaceFees: 13.18,
  labelCost: 7.17,
  adFees: 11.28,
  lines: [{ lineItemId: 'l1', itemId: 'i1', title: 'LAB DF3 Putter Headcover Retro Roller', sku: 'SR-RR-DF3', quantity: 1, unitPrice: 80, lineRevenue: 80 }],
  ...over,
})

const trackerEbay = (day: string, id: string): Order => ({
  id,
  externalId: `ebay:${id}`,
  channel: 'ebay',
  source: 'sales-tracker',
  orderedAt: `${day}T00:00:00.000Z`,
  revenue: 80,
  fees: 12,
  shippingCost: 7,
  marketingCost: 9,
  state: null,
  customerEmail: null,
  isReturning: false,
  trafficSource: null,
  lines: [{ productName: 'Headcover', productSku: null, category: 'Headcover', quantity: 1, unitPrice: 80, lineRevenue: 80 }],
})

describe('eBay API orders on the dashboard', () => {
  it('adds counted API orders with eBay figures and item titles', () => {
    const out = withEbayApiOrders([], [apiOrder(), apiOrder({ orderId: 'x', cancelState: 'canceled' })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      channel: 'ebay',
      source: 'ebay',
      externalId: 'ebay:25-14080-59937',
      revenue: 87.17,
      fees: 13.18,
      shippingCost: 7.17,
      marketingCost: 11.28,
      state: 'OH',
    })
    expect(out[0].lines[0].productName).toBe('LAB DF3 Putter Headcover Retro Roller')
  })

  it('drops tracker eBay rows from the first API day on, and keeps older ones', () => {
    const orders = withEbayApiOrders([trackerEbay('2025-12-20', 'E1'), trackerEbay('2026-03-12', 'E2')], [apiOrder()])
    const kept = preferLiveOrders(orders).filter((o) => o.channel === 'ebay')
    expect(kept.map((o) => o.externalId).sort()).toEqual(['ebay:25-14080-59937', 'ebay:E1'])
  })

  it('leaves tracker eBay rows alone when there is no API data', () => {
    const kept = preferLiveOrders(withEbayApiOrders([trackerEbay('2026-03-12', 'E2')], []))
    expect(kept).toHaveLength(1)
  })

  it('does not add an API order twice if the orders table already has it', () => {
    const first = withEbayApiOrders([], [apiOrder()])
    expect(withEbayApiOrders(first, [apiOrder()])).toHaveLength(1)
  })
})
