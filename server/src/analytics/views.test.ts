import { describe, expect, it } from 'vitest'
import { rangeForCustom } from './period.js'
import type { DailyAdSpend, DailyProductView, DailyTraffic, Order, SyncRun } from './types.js'
import {
  buildAttention,
  buildFunnelView,
  buildHealth,
  buildMarketingView,
  buildMer,
  buildOrdersView,
  buildPace,
  buildProductsView,
} from './views.js'

let seq = 0
function order(orderedAt: string, revenue: number, extra: Partial<Order> = {}): Order {
  seq += 1
  return {
    id: `o${seq}`,
    externalId: `ext-${seq}`,
    channel: 'shopify',
    source: 'shopify',
    orderedAt,
    revenue,
    fees: 1,
    shippingCost: 2,
    marketingCost: 0,
    state: null,
    customerEmail: null,
    isReturning: false,
    trafficSource: null,
    lines: [{ productName: 'Retro Roller', productSku: 'RR', category: 'Rollers', quantity: 1, unitPrice: revenue, lineRevenue: revenue }],
    ...extra,
  }
}

function spend(date: string, platform: string, amount: number): DailyAdSpend {
  return { date, platform, campaign: '', spend: amount, platformReportedSales: 0, platformReportedOrders: 0 }
}

function traffic(date: string, extra: Partial<DailyTraffic> = {}): DailyTraffic {
  return {
    date,
    channel: 'website',
    visits: 100,
    uniqueVisitors: 80,
    productViews: 50,
    addToCarts: 10,
    checkouts: 5,
    purchases: 0,
    sourceBreakdown: { google: 60, direct: 40 },
    regionBreakdown: { Texas: 30, Ohio: 10 },
    ...extra,
  }
}

const range = rangeForCustom('2026-10-01', '2026-10-31')

describe('buildMer', () => {
  it('is null without ad spend', () => {
    expect(buildMer({ range, orders: [order('2026-10-05', 100)], adSpend: [] })).toEqual({
      revenue: 100,
      adSpend: 0,
      mer: null,
    })
  })

  it('divides all-channel revenue by spend across platforms, inside the range only', () => {
    const orders = [order('2026-10-05', 100), order('2026-10-06', 100, { channel: 'etsy', source: 'sales-tracker' })]
    const adSpend = [spend('2026-10-05', 'Google Ads', 30), spend('2026-10-06', 'Meta Ads', 20), spend('2026-11-01', 'Google Ads', 999)]
    expect(buildMer({ range, orders, adSpend })).toEqual({ revenue: 200, adSpend: 50, mer: 4 })
  })
})

describe('buildPace', () => {
  it('compares month to date with last month through the same day, across a year boundary', () => {
    const orders = [
      order('2027-01-02', 10),
      order('2027-01-03', 20),
      order('2027-01-04', 999), // after asOf
      order('2026-12-01', 5),
      order('2026-12-03', 7),
      order('2026-12-20', 100),
    ]
    expect(buildPace({ orders, asOf: '2027-01-03' })).toEqual({
      monthToDate: 30,
      lastMonthTotal: 112,
      lastMonthToDate: 12,
      daysElapsed: 3,
      daysInMonth: 31,
    })
  })

  it('clamps last month-to-date to a shorter previous month', () => {
    const orders = [order('2026-02-28', 40), order('2026-03-30', 5), order('2026-03-31', 6)]
    expect(buildPace({ orders, asOf: '2026-03-31' })).toMatchObject({
      monthToDate: 11,
      lastMonthTotal: 40,
      lastMonthToDate: 40,
      daysInMonth: 31,
    })
  })

  it('uses store-local days (late evening Central is still that day)', () => {
    // 2026-10-31 23:30 Central = 2026-11-01T04:30Z
    const pace = buildPace({ orders: [order('2026-11-01T04:30:00Z', 50)], asOf: '2026-11-01' })
    expect(pace.monthToDate).toBe(0)
    expect(pace.lastMonthTotal).toBe(50)
  })
})

describe('buildAttention', () => {
  it('lists failed syncs and the latest cash month not after today', () => {
    const syncs: SyncRun[] = [
      { id: '1', source: 'ga4', startedAt: '2026-11-01T00:00:00Z', finishedAt: '2026-11-01T00:01:00Z', status: 'error', message: 'quota', rowsTouched: 0 },
      { id: '2', source: 'shopify', startedAt: '2026-11-01T00:00:00Z', finishedAt: '2026-11-01T00:01:00Z', status: 'ok', message: null, rowsTouched: 3 },
    ]
    const row = (monthEnd: string, endingBalance: number) => ({
      monthEnd, beginningBalance: 0, collections: 0, freightAndFees: 0, marketing: 0, website: 0, manufacturing: 0, endingBalance,
    })
    const out = buildAttention({
      abandoned: { periodStart: '2026-10-01', periodEnd: '2026-10-31', abandoned: 4, recovered: 1, recoveredRevenue: 80 },
      syncs,
      cashForecast: [row('2026-09-30', 1000), row('2026-10-31', 1500), row('2026-11-30', 9999)],
      today: '2026-11-03',
    })
    expect(out.failedSyncs).toEqual([{ source: 'ga4', message: 'quota', at: '2026-11-01T00:01:00Z' }])
    expect(out.cashOnHand).toBe(1500)
    expect(out.cashAsOf).toBe('2026-10-31')
    expect(out.abandoned.count).toBe(4)
  })

  it('is empty without data', () => {
    expect(buildAttention({ abandoned: null, syncs: [], cashForecast: [], today: '2026-11-03' })).toMatchObject({
      failedSyncs: [],
      cashOnHand: null,
      cashAsOf: null,
      abandoned: { count: 0, value: 0 },
    })
  })
})

describe('buildOrdersView', () => {
  const orders = [
    order('2026-10-02T15:00:00Z', 50, { channel: 'etsy', source: 'sales-tracker' }),
    order('2026-10-03T15:00:00Z', 100),
    order('2026-10-04T15:00:00Z', 60, { lines: [{ productName: 'A', productSku: null, category: null, quantity: 3, unitPrice: 20, lineRevenue: 60 }] }),
    order('2026-09-30T15:00:00Z', 999),
  ]

  it('filters by channel, newest first, while totals cover every channel', () => {
    const view = buildOrdersView({ range, orders, channel: 'shopify' })
    expect(view.orders.map((o) => o.revenue)).toEqual([60, 100])
    expect(view.orders[0]).toMatchObject({ units: 3, lines: [{ productName: 'A', sku: null, qty: 3, lineRevenue: 60 }] })
    expect(view.totals).toEqual([
      { channel: 'shopify', orders: 2, revenue: 160, units: 4, aov: 80 },
      { channel: 'etsy', orders: 1, revenue: 50, units: 1, aov: 50 },
    ])
  })

  it('returns every channel without a filter, and caps at 500', () => {
    expect(buildOrdersView({ range, orders }).orders).toHaveLength(3)
    const many = Array.from({ length: 520 }, (_, i) => order(`2026-10-10T${String(i % 24).padStart(2, '0')}:00:00Z`, 1))
    expect(buildOrdersView({ range, orders: many }).orders).toHaveLength(500)
  })
})

describe('buildProductsView', () => {
  it('joins views by product name and rolls up categories and a daily trend', () => {
    const views: DailyProductView[] = [
      { date: '2026-10-02', productName: 'Retro Roller', category: 'Rollers', views: 40 },
      { date: '2026-10-02', productName: 'Hat', category: 'Apparel', views: 10 },
      { date: '2026-11-02', productName: 'Retro Roller', category: 'Rollers', views: 500 },
    ]
    const view = buildProductsView({
      range,
      orders: [order('2026-10-02', 80), order('2026-10-02', 80)],
      productViews: views,
    })
    expect(view.products[0]).toEqual({
      name: 'Retro Roller', category: 'Rollers', units: 2, revenue: 160, orders: 2, views: 40, viewToOrderRate: 5,
    })
    expect(view.products.find((p) => p.name === 'Hat')).toMatchObject({ units: 0, views: 10, viewToOrderRate: 0 })
    expect(view.categories).toEqual([{ category: 'Rollers', units: 2, revenue: 160 }])
    expect(view.trend).toHaveLength(31)
    expect(view.trend.find((t) => t.date === '2026-10-02')!.units).toBe(2)
  })
})

describe('buildMarketingView', () => {
  it('computes new-customer CAC and connection flags', () => {
    const orders = [
      order('2026-10-02', 100),
      order('2026-10-03', 100),
      order('2026-10-04', 100, { isReturning: true }),
    ]
    const view = buildMarketingView({
      range,
      orders,
      adSpend: [spend('2026-10-02', 'Google Ads', 60), spend('2026-08-01', 'Etsy Ads', 5)],
      traffic: [traffic('2026-10-02')],
      keywords: [{ query: 'golf roller', visits: 9, periodStart: '2026-10-01', periodEnd: '2026-10-31' }],
    })
    expect(view).toMatchObject({ revenue: 300, adSpend: 60, mer: 5, newCustomers: 2, newCustomerCac: 30 })
    expect(view.connected).toEqual({ googleAds: true, meta: false, etsyAds: true })
    expect(view.spendTrend.find((d) => d.date === '2026-10-02')).toEqual({ date: '2026-10-02', spend: 60, revenue: 100 })
    expect(view.sources[0]).toMatchObject({ source: 'google', visits: 60 })
    expect(view.keywords).toEqual([{ query: 'golf roller', visits: 9 }])
    expect(view.platforms.some((p) => p.platform === 'Google Ads')).toBe(true)
  })

  it('has a null CAC without new customers', () => {
    const view = buildMarketingView({
      range,
      orders: [order('2026-10-04', 100, { isReturning: true })],
      adSpend: [spend('2026-10-02', 'Google Ads', 60)],
      traffic: [],
      keywords: [],
    })
    expect(view.newCustomers).toBe(0)
    expect(view.newCustomerCac).toBeNull()
  })
})

describe('buildFunnelView', () => {
  it('sums the funnel, falls back to order count for purchases, and groups states and regions', () => {
    const view = buildFunnelView({
      range,
      orders: [order('2026-10-02', 50, { state: 'TX' }), order('2026-10-03', 70, { state: 'TX', isReturning: true })],
      traffic: [traffic('2026-10-02'), traffic('2026-10-03')],
      abandoned: null,
    })
    expect(view.funnel).toEqual({ visits: 200, productViews: 100, addToCarts: 20, checkouts: 10, purchases: 2 })
    expect(view.customers).toEqual({ new: 1, returning: 1 })
    expect(view.states).toEqual([{ state: 'TX', orders: 2, revenue: 120 }])
    expect(view.regions).toEqual([{ region: 'Texas', sessions: 60 }, { region: 'Ohio', sessions: 20 }])
  })
})

describe('buildHealth', () => {
  it('pairs each source with its latest run', () => {
    const out = buildHealth(
      [
        { source: 'ga4', label: 'GA4', missing: null, freshMs: 30 * 60_000 },
        { source: 'merchant', label: 'Merchant', missing: 'MERCHANT_CENTER_ID', freshMs: null, syncSource: 'merchant-center' },
      ],
      [{ id: '1', source: 'merchant-center', startedAt: 's', finishedAt: 'f', status: 'ok', message: 'm', rowsTouched: 1 }],
    )
    expect(out.sources).toEqual([
      { source: 'ga4', label: 'GA4', configured: true, missing: null, freshMinutes: 30, lastSync: null },
      {
        source: 'merchant', label: 'Merchant', configured: false, missing: 'MERCHANT_CENTER_ID', freshMinutes: null,
        lastSync: { status: 'ok', at: 'f', message: 'm' },
      },
    ])
  })
})
