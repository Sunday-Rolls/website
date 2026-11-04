import { describe, expect, it } from 'vitest'
import { buildOverview, buildPnL, buildRoas } from './metrics.js'
import { rangeForPeriod } from './period.js'
import { buildDemoDataset } from './seed.js'
import type { DailyAdSpend, DailyTraffic, Order } from './types.js'

describe('buildOverview', () => {
  it('computes KPIs and funnel from demo data', () => {
    const demo = buildDemoDataset('2026-10-11')
    const range = rangeForPeriod('30d', '2026-10-11')
    const overview = buildOverview({
      range,
      orders: demo.orders,
      traffic: demo.traffic,
      keywords: demo.keywords,
      abandoned: demo.abandoned,
      productViews: demo.productViews,
    })

    expect(overview.kpis.orders.value).toBeGreaterThan(100)
    expect(overview.kpis.revenue.value).toBeGreaterThan(5000)
    expect(overview.funnel).toHaveLength(5)
    expect(overview.funnel[0].step).toBe('Site visits')
    expect(overview.products.length).toBeGreaterThan(0)
    expect(overview.productViewsByProduct.length).toBeGreaterThan(1)
    expect(overview.productViewsByProduct[0].views).toBeGreaterThan(0)
    expect(overview.abandonedCarts.abandoned).toBe(117)
    expect(overview.abandonedCarts.synced).toBe(true)
    expect(overview.abandonedCarts.source).toBe('shopify')
    expect(overview.orderSources.salesTracker).toBeGreaterThan(0)
    expect(overview.funnelOrderSource).toMatch(/ga4|orders/)
    expect(overview.revenueByDay).toHaveLength(30)
  })
})

describe('buildRoas site sales', () => {
  const range = { start: '2026-11-01', end: '2026-11-02' }
  const spendRow = (date: string, campaign: string, spend: number, sessions: number): DailyAdSpend => ({
    date, platform: 'Google Ads', campaign, spend, platformReportedSales: 0, platformReportedOrders: 0, sessions,
  })
  const order = (orderedAt: string, revenue: number, trafficSource: string | null): Order => ({
    id: `${orderedAt}-${revenue}`, externalId: `x-${orderedAt}-${revenue}`, channel: 'shopify', source: 'shopify',
    orderedAt, revenue, fees: 0, shippingCost: 0, marketingCost: 0, state: null, customerEmail: null,
    isReturning: false, trafficSource, lines: [],
  })
  const traffic = (date: string, visits: number): DailyTraffic => ({
    date, channel: 'website', visits, uniqueVisitors: visits, productViews: 0, addToCarts: 0, checkouts: 0,
    purchases: 0, sourceBreakdown: {},
  })

  it('counts tagged orders in full and credits untagged ones by visit share', () => {
    const platforms = buildRoas({
      range,
      adSpend: [spendRow('2026-11-01', 'PMax', 50, 30), spendRow('2026-11-01', 'Brand', 10, 10), spendRow('2026-11-02', 'PMax', 40, 25)],
      traffic: [traffic('2026-11-01', 100), traffic('2026-11-02', 100)],
      orders: [
        // Tagged with its campaign: all of it to PMax.
        order('2026-11-01T18:00:00.000Z', 100, 'google / cpc / pmax'),
        // gclid only, no campaign: split 30:10 by that day's visits, counted once (PMax).
        order('2026-11-01T19:00:00.000Z', 80, 'google / cpc'),
        // Untagged: 40% of visits on Nov 1 came from these campaigns → $40 estimated (30 PMax, 10 Brand).
        order('2026-11-01T20:00:00.000Z', 100, null),
        // Tagged with another source: not Google's.
        order('2026-11-02T18:00:00.000Z', 90, 'instagram / paid'),
        // Untagged on Nov 2: 25% → $25 estimated to PMax.
        order('2026-11-02T19:00:00.000Z', 100, null),
      ],
    })
    const google = platforms.find((p) => p.platform === 'Google Ads')!
    expect(google.siteTaggedOrders).toBe(2)
    expect(google.siteSalesEstimated).toBeCloseTo(65)
    expect(google.siteObservedSales).toBeCloseTo(245)
    expect(google.siteRoas).toBeCloseTo(245 / 100)
    expect(google.salesStatus).toBe('estimated')
    expect(google.note).toContain('$180 from 2 orders tagged')
    const pmax = google.campaigns.find((c) => c.campaign === 'PMax')!
    expect(pmax.siteSales).toBeCloseTo(100 + 60 + 30 + 25)
    expect(pmax.siteTaggedOrders).toBe(2)
    const brand = google.campaigns.find((c) => c.campaign === 'Brand')!
    expect(brand.siteSales).toBeCloseTo(20 + 10)
    expect(brand.siteSalesEstimated).toBeCloseTo(10)
  })

  it('is exact (ok) when every linked sale is tagged', () => {
    const platforms = buildRoas({
      range,
      adSpend: [spendRow('2026-11-01', 'PMax', 50, 30)],
      traffic: [],
      orders: [order('2026-11-01T18:00:00.000Z', 100, 'google / cpc'), order('2026-11-01T19:00:00.000Z', 70, null)],
    })
    const google = platforms.find((p) => p.platform === 'Google Ads')!
    expect(google.salesStatus).toBe('ok')
    expect(google.siteObservedSales).toBe(100)
    expect(google.note).toBeNull()
  })
})

describe('buildRoas', () => {
  it('leaves ROAS blank when spend exists but no website sales link to it', () => {
    const range = rangeForPeriod('7d', '2026-10-11')
    const adSpend: DailyAdSpend[] = [
      {
        date: '2026-10-10',
        platform: 'Google Ads',
        campaign: 'Brand Search',
        spend: 100,
        platformReportedSales: 0,
        platformReportedOrders: 0,
      },
    ]
    const platforms = buildRoas({ range, adSpend, orders: [] })
    const google = platforms.find((p) => p.platform === 'Google Ads')
    expect(google?.connected).toBe(true)
    expect(google?.spend).toBe(100)
    expect(google?.platformRoas).toBeNull()
    expect(google?.siteRoas).toBeNull()
    expect(google?.salesStatus).toBe('unattributed')
    const meta = platforms.find((p) => p.platform === 'Meta')
    expect(meta?.connected).toBe(false)
    expect(meta?.salesStatus).toBe('not_connected')
  })
})

describe('buildPnL', () => {
  it('builds an income statement for a month and YTD', () => {
    const demo = buildDemoDataset('2026-10-11')
    const pnl = buildPnL({
      year: 2026,
      month: '2026-09',
      orders: demo.orders,
      expenses: demo.expenses,
      cashForecast: demo.cashForecast,
      today: '2026-11-03',
    })

    expect(pnl.incomeStatement.some((r) => r.label === 'Total revenue')).toBe(true)
    expect(pnl.incomeStatement.some((r) => r.label === 'Net income')).toBe(true)
    expect(pnl.cashForecast).toHaveLength(5)
    // Latest month already ended (Oct 31), not the Jan 2027 forecast.
    expect(pnl.kpis.cashOnHand).toBe(15280)
    expect(pnl.kpis.cashAsOf).toBe('2026-10-31')
    expect(pnl.revenueByChannel.length).toBeGreaterThan(0)
    expect(pnl.monthlyRevenueByChannel.every((m) => m.month.startsWith('2026'))).toBe(true)
  })

  it('uses the month year when year query disagrees so the Month column is not empty', () => {
    const demo = buildDemoDataset('2026-10-11')
    const matched = buildPnL({
      year: 2026,
      month: '2026-09',
      orders: demo.orders,
      expenses: demo.expenses,
      cashForecast: demo.cashForecast,
    })
    const mismatched = buildPnL({
      year: 2025,
      month: '2026-09',
      orders: demo.orders,
      expenses: demo.expenses,
      cashForecast: demo.cashForecast,
    })

    const total = (pnl: typeof matched) =>
      pnl.incomeStatement.find((r) => r.label === 'Total revenue')!.monthAmount

    expect(mismatched.year).toBe(2026)
    expect(total(mismatched)).toBe(total(matched))
    expect(total(mismatched)).toBeGreaterThan(0)
  })
})

describe('buildPnL statement math', () => {
  const o = (day: string, revenue: number, qty = 1) => ({
    id: day + revenue, externalId: day + revenue, channel: 'etsy', source: 'sales-tracker', orderedAt: day, revenue,
    fees: 2, shippingCost: 3, marketingCost: 0, state: null, customerEmail: null, isReturning: false, trafficSource: null,
    lines: [{ productName: 'Roller', productSku: null, category: null, quantity: qty, unitPrice: revenue, lineRevenue: revenue }],
  })
  const e = (day: string, category: string, amount: number, bucket: 'cogs' | 'sga' = 'sga') => ({
    id: day + category, spentAt: day, category, explanation: '', amount, bucket, productLine: null,
  })
  const orders = [o('2025-02-01', 100), o('2025-12-01', 900), o('2026-02-01', 200), o('2026-03-01', 300)]
  const expenses = [
    e('2026-02-10', 'Manufacturing', 50, 'cogs'),
    e('2026-03-10', 'Legal Fees', 40),
    e('2025-02-10', 'Manufacturing', 10, 'cogs'),
  ]
  const pnl = (month: string) => buildPnL({ year: 2026, month, orders, expenses, cashForecast: [], today: '2026-06-15' })
  const row = (p: ReturnType<typeof pnl>, label: string) => p.incomeStatement.find((r) => r.label === label)!

  it('compares YTD with the same window last year, not the whole year', () => {
    const p = pnl('2026-03')
    expect(p.kpis.revenueYtd).toMatchObject({ value: 500, previous: 100 })
    expect(p.kpis.comparedThrough).toBe('2025-06-15')
    // 2025 through Jun 15: 100 revenue - 10 manufacturing - 2 fees - 3 shipping.
    expect(p.kpis.netIncomeYtd.previous).toBe(85)
  })

  it('counts every expense and makes the months add up to the year', () => {
    const months = Array.from({ length: 12 }, (_, i) => pnl(`2026-${String(i + 1).padStart(2, '0')}`))
    const ytdNet = row(months[0], 'Net income').ytdAmount
    expect(months.reduce((t, p) => t + row(p, 'Net income').monthAmount, 0)).toBeCloseTo(ytdNet)
    // 500 - 50 manufacturing - 4 fees - 6 shipping - 40 legal.
    expect(ytdNet).toBe(400)
    expect(row(months[2], 'Legal & other').monthAmount).toBe(-40)
    expect(months[0].kpis.cogsEstimated).toBe(false)
  })
})
