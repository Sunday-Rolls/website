import { describe, expect, it } from 'vitest'
import {
  buildInventoryView,
  etsyListedBySku,
  mergeEtsySales,
  parseInventorySheets,
  sheetDate,
  shopifyInventory,
  type SheetInventory,
} from './inventory.js'
import type { EtsyReceiptRaw } from './etsy.js'
import type { Order } from './types.js'

const NOW = new Date('2026-11-20T18:00:00Z')

function tabs(map: Record<string, unknown[][]>) {
  return (name: string) => map[name] ?? []
}

const SHEET_TABS = tabs({
  SKUs: [
    ['SKU', 'Product', 'Style', 'Category'],
    ['SR-DOODLE-DF3', 'The Doodle', 'DF3', 'Headcover'],
    ['SR-CORD-MAL', 'The Corduroy (Mallet)', 'Mallet', 'Headcover'],
    ['SR-TOWEL-BLK', 'Golf Towel - Solid Black', '', 'Towel'],
    ['SR-SUNNY-OZ', 'Sunny Side Up', 'OZ1i / Mezz.1', 'Headcover'],
  ],
  'Inventory In': [
    ['Date', 'SKU', 'Product', 'Qty', 'Type', 'Notes'],
    [new Date('2026-11-09T00:00:00Z'), 'SR-DOODLE-DF3', { formula: 'VLOOKUP', result: 'The Doodle' }, 20, 'Starting count', null],
    ['11/9/2026', 'SR-CORD-MAL', null, 3, 'Starting count', null],
    ['2026-11-09', 'SR-TOWEL-BLK', null, 15, 'Starting count', null],
    ['2026-11-15', 'SR-DOODLE-DF3', null, 10, 'Shipment', 'Batch 5'],
    [null, 'SR-SUNNY-OZ', null, 12, 'Starting count', null],
  ],
  eBay: [
    ['', '', '', '', '', 'Sales'],
    ['', 'Order ID', 'Submitted On', 'Canceled', 'Fulfilled On', 'Gross Sales', 'Product', 'Order Number', 'SKU'],
    ['', 1, '11/10/2026', 'FALSE', '', 80, 'Headcover', 'E300', 'SR-CORD-MAL'],
    ['', 2, '11/11/2026', 'TRUE', '', 80, 'Headcover', 'E301', 'SR-CORD-MAL'],
    ['', 3, '11/12/2026', 'FALSE', '', 80, 'Headcover', 'E302', ''],
    ['', 4, '10/01/2026', 'FALSE', '', 80, 'Headcover', 'E100', 'SR-DOODLE-DF3'],
  ],
  Other: [
    [],
    ['', '', 'Order ID', 'Plateform', 'Date Ordered', 'Net Sales', 'Product', 'SKU'],
    ['A', 1, 'A70', 'In Person', '11/14/2026', 30, 'Towel', 'SR-TOWEL-BLK'],
  ],
})

function shopifyOrder(id: string, orderedAt: string, lines: Array<{ name: string; sku: string | null; qty: number }>): Order {
  return {
    id,
    externalId: `shopify:${id}`,
    channel: 'shopify',
    source: 'shopify',
    orderedAt,
    revenue: 80,
    fees: 0,
    shippingCost: 0,
    marketingCost: 0,
    state: null,
    customerEmail: null,
    isReturning: false,
    trafficSource: null,
    lines: lines.map((l) => ({ productName: l.name, productSku: l.sku, category: 'Headcover', quantity: l.qty, unitPrice: 80, lineRevenue: 80 * l.qty })),
  }
}

describe('sheetDate', () => {
  it('reads Date cells, ISO text, m/d/yyyy and serial days', () => {
    expect(sheetDate(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-09')
    expect(sheetDate('2026-11-09')).toBe('2026-11-09')
    expect(sheetDate('11/9/2026')).toBe('2026-11-09')
    expect(sheetDate(46000)).toBe('2025-12-09')
    expect(sheetDate('')).toBeNull()
  })
})

describe('parseInventorySheets', () => {
  const parsed = parseInventorySheets(SHEET_TABS, '2026-11-20T00:00:00Z')

  it('reads SKUs and dated Inventory In rows, and warns about undated ones', () => {
    expect(parsed.skus.map((s) => s.sku)).toEqual(['SR-DOODLE-DF3', 'SR-CORD-MAL', 'SR-TOWEL-BLK', 'SR-SUNNY-OZ'])
    expect(parsed.received).toHaveLength(4)
    expect(parsed.received[0]).toMatchObject({ date: '2026-11-09', sku: 'SR-DOODLE-DF3', qty: 20, type: 'Starting count' })
    expect(parsed.warnings.join(' ')).toContain('no date')
  })

  it('reads eBay and Other sales as one unit each, skipping cancelled eBay orders', () => {
    const refs = parsed.sales.map((s) => `${s.channel}:${s.ref}:${s.sku}`)
    expect(refs).toEqual(['ebay:E300:SR-CORD-MAL', 'ebay:E302:null', 'ebay:E100:SR-DOODLE-DF3', 'other:A70:SR-TOWEL-BLK'])
  })
})

describe('Etsy helpers', () => {
  it('sums enabled offerings per SKU', () => {
    expect(
      etsyListedBySku([
        { products: [{ sku: 'A', offerings: [{ quantity: 5 }] }, { sku: 'B', offerings: [{ quantity: 3, is_enabled: false }] }] },
        { products: [{ sku: 'A', offerings: [{ quantity: 2 }] }, { sku: '', offerings: [{ quantity: 9 }] }] },
      ]),
    ).toEqual({ A: 7, B: 0 })
  })

  it('merges receipts, drops cancelled ones and fills a SKU from a single-SKU listing', () => {
    const counted = (r: EtsyReceiptRaw) => r.status !== 'Canceled'
    const previous = { '1': [{ key: 'etsy:1:1', channel: 'etsy' as const, sku: 'X', product: 'x', quantity: 1, soldAt: '2026-01-01T00:00:00Z', ref: 'receipt 1' }], '2': [] }
    const next = mergeEtsySales(
      previous,
      [
        { receipt_id: 2, status: 'Canceled' },
        { receipt_id: 3, status: 'Paid', created_timestamp: 1763400000, transactions: [{ transaction_id: 9, title: 'Doodle', listing_id: 55, quantity: 2 }] },
      ],
      counted,
      new Map([['55', ['SR-DOODLE-DF3']]]),
    )
    expect(Object.keys(next).sort()).toEqual(['1', '3'])
    expect(next['3'][0]).toMatchObject({ sku: 'SR-DOODLE-DF3', quantity: 2, channel: 'etsy' })
  })
})

describe('buildInventoryView', () => {
  const sheet: SheetInventory = parseInventorySheets(SHEET_TABS, '2026-11-20T00:00:00Z')
  const shopify = shopifyInventory([
    { sku: 'SR-DOODLE-DF3', productTitle: 'The Doodle', variantTitle: 'Default Title', quantity: 25, active: true },
    { sku: 'SR-CORD-MAL', productTitle: 'Mallet - The Corduroy', variantTitle: 'Default Title', quantity: 1, active: true },
  ])
  const orders = [
    shopifyOrder('1', '2026-11-16T15:00:00Z', [{ name: 'The Doodle', sku: 'SR-DOODLE-DF3', qty: 2 }]),
    // No SKU on the line: matched by product title.
    shopifyOrder('2', '2026-11-17T15:00:00Z', [{ name: 'The Doodle', sku: null, qty: 1 }]),
    // Before the count: not subtracted, but counts toward the weekly pace.
    shopifyOrder('3', '2026-11-01T15:00:00Z', [{ name: 'The Doodle', sku: 'SR-DOODLE-DF3', qty: 1 }]),
  ]
  const etsy = {
    sales: { '7': [{ key: 'etsy:7:1', channel: 'etsy' as const, sku: 'SR-DOODLE-DF3', product: 'Doodle', quantity: 1, soldAt: '2026-11-18T15:00:00Z', ref: 'receipt 7' }] },
    listed: { 'SR-DOODLE-DF3': 26 },
    syncedAt: '2026-11-20T00:00:00Z',
  }
  const view = buildInventoryView({ sheet, etsy, shopify, orders, now: NOW })
  const row = (sku: string) => view.rows.find((r) => r.sku === sku)!

  it('subtracts every channel since the count from starting count plus shipments', () => {
    const doodle = row('SR-DOODLE-DF3')
    expect(doodle.received).toBe(30)
    expect(doodle.soldBy).toEqual({ shopify: 3, etsy: 1, ebay: 0, other: 0 })
    expect(doodle.onHand).toBe(26)
    expect(doodle.status).toBe('ok')
  })

  it('uses the last 4 weeks for weeks left, including sales before the count', () => {
    const doodle = row('SR-DOODLE-DF3')
    expect(doodle.weeklyPace).toBe(1.3)
    expect(doodle.weeksLeft).toBe(20)
  })

  it('flags listings whose quantity differs from on hand', () => {
    expect(row('SR-DOODLE-DF3').mismatch).toBe(true)
    expect(row('SR-CORD-MAL')).toMatchObject({ onHand: 2, status: 'low', mismatch: true })
    expect(row('SR-TOWEL-BLK')).toMatchObject({ onHand: 14, mismatch: false })
  })

  it('leaves SKUs without a dated count uncounted and lists sales without a SKU', () => {
    expect(row('SR-SUNNY-OZ')).toMatchObject({ counted: false, onHand: null, status: 'not-counted' })
    expect(view.kpis).toMatchObject({ headcovers: 28, towels: 14, low: 1, out: 0, mismatched: 2, notCounted: 1 })
    expect(view.unmatched.map((u) => u.ref)).toEqual(['E302'])
    expect(view.countDate).toBe('2026-11-09')
    expect(view.movements[0]).toMatchObject({ sku: 'SR-DOODLE-DF3', qty: -1, source: 'Etsy' })
  })

  it('is not ready before any count is entered', () => {
    const empty = buildInventoryView({ sheet: null, etsy: null, shopify: null, orders: [], now: NOW })
    expect(empty.ready).toBe(false)
    expect(empty.rows).toEqual([])
  })
})
