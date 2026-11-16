import { describe, expect, it } from 'vitest'
import {
  SQUARESPACE_HISTORY_SYNC_SOURCE,
  applySquarespaceHistory,
  loadSquarespaceHistoryFile,
  squarespaceHistoryChanges,
  squarespaceHistoryRevenue,
  type SquarespaceHistoryOrder,
} from './squarespace-history.js'
import { createMemoryAnalyticsStore } from './store.js'
import type { Order } from './types.js'

const h = (over: Partial<SquarespaceHistoryOrder> = {}): SquarespaceHistoryOrder => ({
  orderId: '00438',
  orderedAt: '2026-10-06T15:00:00.000Z',
  canceled: false,
  grossSales: 80,
  netSales: 80,
  shipping: 50.08,
  tax: 0,
  total: 130.08,
  refunded: 50,
  fees: 4.08,
  state: 'MN',
  lines: [{ name: 'Retro Roller - Grey', sku: 'SQ6360452', quantity: 1, unitPrice: 80, discount: 0, netSales: 80 }],
  ...over,
})

const oldRow = (over: Partial<Order> = {}): Order => ({
  id: '11111111-1111-4111-8111-111111111111',
  externalId: 'squarespace:00438',
  channel: 'squarespace',
  source: 'manual',
  orderedAt: '2026-10-06T15:00:00.000Z',
  revenue: 80,
  fees: 0,
  shippingCost: 50.08,
  marketingCost: 0,
  state: 'MN',
  customerEmail: 'buyer@example.com',
  isReturning: true,
  trafficSource: 'google / cpc',
  lines: [{ productName: 'Retro Roller - Grey', productSku: 'SQ6360452', category: 'Retro Roller - Grey', quantity: 1, unitPrice: 80, lineRevenue: 80 }],
  ...over,
})

describe('squarespaceHistoryRevenue', () => {
  it('is items + shipping − refunds, and 0 when cancelled', () => {
    expect(squarespaceHistoryRevenue(h())).toBe(80.08)
    expect(squarespaceHistoryRevenue(h({ canceled: true }))).toBe(0)
    expect(squarespaceHistoryRevenue(h({ refunded: 130.08 }))).toBe(0)
  })
})

describe('squarespaceHistoryChanges', () => {
  it('adds fees and refunds, keeps the customer fields, and removes refunded orders', () => {
    const { upserts, deleteIds } = squarespaceHistoryChanges(
      [h(), h({ orderId: '00083', refunded: 95.56, netSales: 80, shipping: 7.65 }), h({ orderId: '00999' })],
      [oldRow(), oldRow({ id: '22222222-2222-4222-8222-222222222222', externalId: 'squarespace:00083' })],
    )
    expect(deleteIds).toEqual(['squarespace:00083'])
    expect(upserts).toHaveLength(2)
    expect(upserts[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      revenue: 80.08,
      fees: 4.08,
      shippingCost: 50.08,
      customerEmail: 'buyer@example.com',
      isReturning: true,
      trafficSource: 'google / cpc',
    })
    // A new order gets a fresh uuid and no customer fields.
    expect(upserts[1].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(upserts[1].customerEmail).toBeNull()
  })

  it('uses net sales per line (after discounts)', () => {
    const { upserts } = squarespaceHistoryChanges(
      [h({ refunded: 0, lines: [{ name: 'The Tee', sku: null, quantity: 2, unitPrice: 32, discount: 16, netSales: 48 }] })],
      [],
    )
    expect(upserts[0].lines[0]).toMatchObject({ quantity: 2, unitPrice: 24, lineRevenue: 48 })
  })
})

describe('applySquarespaceHistory', () => {
  it('applies once per version', async () => {
    const store = createMemoryAnalyticsStore()
    await store.upsertOrders([oldRow()])
    const file = { source: 'test', orders: [h()] }
    expect(await applySquarespaceHistory(store, file, 'v1')).toEqual({ status: 'applied', upserted: 1, deleted: 0 })
    expect(await applySquarespaceHistory(store, file, 'v1')).toEqual({ status: 'already-applied' })
    const [o] = await store.listOrders()
    expect(o).toMatchObject({ revenue: 80.08, fees: 4.08 })
    expect((await store.latestSyncs()).find((s) => s.source === SQUARESPACE_HISTORY_SYNC_SOURCE)?.status).toBe('ok')
  })

  it('ships a data file without customer details', () => {
    const file = loadSquarespaceHistoryFile()
    expect(file.orders.length).toBe(488)
    expect(JSON.stringify(file)).not.toMatch(/@|Address|First Name/)
    const revenue = file.orders.reduce((s, o) => s + squarespaceHistoryRevenue(o), 0)
    expect(Math.round(revenue * 100) / 100).toBe(42818.55)
  })
})
