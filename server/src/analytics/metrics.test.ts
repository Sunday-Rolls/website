import { describe, expect, it } from 'vitest'
import { buildOverview, buildPnL, buildRoas } from './metrics.js'
import { rangeForPeriod } from './period.js'
import { buildDemoDataset } from './seed.js'
import type { DailyAdSpend } from './types.js'

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

describe('buildRoas', () => {
  it('leaves ROAS blank when spend exists but conversion value is missing', () => {
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
    expect(google?.salesStatus).toBe('no_conversion_value')
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
