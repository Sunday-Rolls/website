import { describe, expect, it } from 'vitest'
import { buildOverview, buildPnL } from './metrics.js'
import { rangeForPeriod } from './period.js'
import { buildDemoDataset } from './seed.js'

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
    expect(overview.revenueByDay).toHaveLength(30)
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
    })

    expect(pnl.incomeStatement.some((r) => r.label === 'Total revenue')).toBe(true)
    expect(pnl.incomeStatement.some((r) => r.label === 'Net income')).toBe(true)
    expect(pnl.cashForecast).toHaveLength(5)
    expect(pnl.kpis.cashOnHand).toBe(30760)
    expect(pnl.revenueByChannel.length).toBeGreaterThan(0)
  })
})
