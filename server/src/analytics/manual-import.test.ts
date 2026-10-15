import { describe, expect, it } from 'vitest'
import {
  CSV_TEMPLATES,
  orderFromManualRevenue,
  parseCashCsv,
  parseExpenseCsv,
  parseRevenueCsv,
} from './manual-import.js'
import { preferLiveOrders } from './orders.js'
import type { Order } from './types.js'

describe('manual CSV import', () => {
  it('parses revenue rows as manual source', () => {
    const csv = `date,channel,revenue,product,external_id
2026-10-01,Etsy,90.50,Headcover,E-1
2026-10-02,other,40,In person,IP-1`
    const { rows, warnings } = parseRevenueCsv(csv)
    expect(warnings).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      channel: 'etsy',
      source: 'manual',
      revenue: 90.5,
      externalId: 'manual:etsy:E-1',
    })
    expect(rows[0].lines[0].productName).toBe('Headcover')
  })

  it('parses expense and cash CSVs', () => {
    const expenses = parseExpenseCsv(`date,category,amount,bucket,explanation
2026-10-01,Manufacturing,500,cogs,Alibaba`)
    expect(expenses.rows[0]).toMatchObject({
      category: 'Manufacturing',
      amount: 500,
      bucket: 'cogs',
    })
    const cash = parseCashCsv(`month_end,beginning_balance,collections,ending_balance
2026-10-31,10000,2000,12000`)
    expect(cash.rows[0]).toMatchObject({
      monthEnd: '2026-10-31',
      beginningBalance: 10000,
      endingBalance: 12000,
    })
  })
})

describe('CSV templates', () => {
  it('parses the shipped revenue template', () => {
    const { rows, warnings } = parseRevenueCsv(CSV_TEMPLATES.revenue.body)
    expect(warnings).toHaveLength(0)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.every((r) => r.source === 'manual')).toBe(true)
  })

  it('builds a single manual order for the quick-add form', () => {
    const order = orderFromManualRevenue({
      date: '2026-10-01',
      channel: 'Etsy',
      revenue: 92.5,
      product: 'Headcover',
      externalId: 'etsy-1',
    })
    expect(order).toMatchObject({
      source: 'manual',
      channel: 'etsy',
      externalId: 'manual:etsy:etsy-1',
      revenue: 92.5,
    })
  })
})

describe('preferLiveOrders', () => {
  it('drops sales-tracker shopify rows when live Shopify exists', () => {
    const orders: Order[] = [
      {
        id: '1',
        externalId: 'shopify:sheet-1',
        channel: 'shopify',
        source: 'sales-tracker',
        orderedAt: '2026-10-01T00:00:00.000Z',
        revenue: 80,
        fees: 0,
        shippingCost: 0,
        marketingCost: 0,
        state: null,
        customerEmail: null,
        isReturning: false,
        trafficSource: null,
        lines: [],
      },
      {
        id: '2',
        externalId: 'shopify:99',
        channel: 'shopify',
        source: 'shopify',
        orderedAt: '2026-10-02T00:00:00.000Z',
        revenue: 80,
        fees: 0,
        shippingCost: 0,
        marketingCost: 0,
        state: null,
        customerEmail: null,
        isReturning: false,
        trafficSource: null,
        lines: [],
      },
      {
        id: '3',
        externalId: 'etsy:1',
        channel: 'etsy',
        source: 'sales-tracker',
        orderedAt: '2026-10-01T00:00:00.000Z',
        revenue: 90,
        fees: 0,
        shippingCost: 0,
        marketingCost: 0,
        state: null,
        customerEmail: null,
        isReturning: false,
        trafficSource: null,
        lines: [],
      },
    ]
    const preferred = preferLiveOrders(orders)
    expect(preferred.map((o) => o.id).sort()).toEqual(['2', '3'])
  })

  it('drops sales-tracker squarespace rows when manual Squarespace CSV exists', () => {
    const orders: Order[] = [
      {
        id: 't1',
        externalId: 'squarespace:sheet-1',
        channel: 'squarespace',
        source: 'sales-tracker',
        orderedAt: '2026-10-01T00:00:00.000Z',
        revenue: 80,
        fees: 0,
        shippingCost: 0,
        marketingCost: 0,
        state: null,
        customerEmail: null,
        isReturning: false,
        trafficSource: null,
        lines: [],
      },
      {
        id: 'm1',
        externalId: 'squarespace:00457',
        channel: 'squarespace',
        source: 'manual',
        orderedAt: '2026-10-02T00:00:00.000Z',
        revenue: 80,
        fees: 0,
        shippingCost: 12,
        marketingCost: 0,
        state: 'NY',
        customerEmail: 'b@example.com',
        isReturning: false,
        trafficSource: null,
        lines: [],
      },
      {
        id: 'e1',
        externalId: 'etsy:1',
        channel: 'etsy',
        source: 'sales-tracker',
        orderedAt: '2026-10-01T00:00:00.000Z',
        revenue: 90,
        fees: 0,
        shippingCost: 0,
        marketingCost: 0,
        state: null,
        customerEmail: null,
        isReturning: false,
        trafficSource: null,
        lines: [],
      },
    ]
    const preferred = preferLiveOrders(orders)
    expect(preferred.map((o) => o.id).sort()).toEqual(['e1', 'm1'])
  })
})
