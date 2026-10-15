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
    })

    expect(pnl.incomeStatement.some((r) => r.label === 'Total revenue')).toBe(true)
    expect(pnl.incomeStatement.some((r) => r.label === 'Net income')).toBe(true)
    expect(pnl.cashForecast).toHaveLength(5)
    expect(pnl.kpis.cashOnHand).toBe(30760)
    expect(pnl.revenueByChannel.length).toBeGreaterThan(0)
  })
})
