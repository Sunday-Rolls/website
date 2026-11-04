import { describe, expect, it } from 'vitest'
import { adSpendFromRows, friendlySource, productFromPath } from './ga4.js'

describe('ga4 helpers', () => {
  it('maps product paths to names', () => {
    expect(productFromPath('/shop/p/morning-dew')).toEqual({
      name: 'Morning Dew',
      category: 'Product page',
    })
    expect(productFromPath('/shop/p/retro-roller-mallet-grey?foo=1')).toEqual({
      name: 'Retro Roller Mallet Grey',
      category: 'Product page',
    })
    expect(productFromPath('/products/golf-towel-green-stripe/')).toEqual({
      name: 'Golf Towel Green Stripe',
      category: 'Product page',
    })
    expect(productFromPath('/shop')).toBeNull()
    expect(productFromPath('/products/')).toBeNull()
  })

  it('normalizes common traffic sources', () => {
    expect(friendlySource('ig')).toBe('Instagram')
    expect(friendlySource('google')).toBe('Google')
    expect(friendlySource('(direct)')).toBe('Direct')
    expect(friendlySource('m.facebook.com')).toBe('Facebook')
  })
})

describe('adSpendFromRows', () => {
  const row = (date: string, campaign: string, cost: number, revenue = 0, purchases = 0) => ({
    dims: [date, campaign],
    metrics: [String(cost), '10', String(revenue), String(purchases)],
  })

  it('carries GA4 purchase revenue and orders onto Google Ads campaign days', () => {
    expect(
      adSpendFromRows([
        row('20261104', 'Sales-Performance Max-NEW', 34.814, 94.7, 1),
        row('20261105', 'Sales-Performance Max-NEW', 0, 86.68, 1),
        row('20261104', 'Shopping Free Listings', 0, 120, 1),
        row('20261104', '120252526421000565', 0, 80, 1),
        row('20261104', '(organic)', 0, 200, 2),
      ]),
    ).toEqual([
      { date: '2026-11-04', platform: 'Google Ads', campaign: 'Sales-Performance Max-NEW', spend: 34.81, platformReportedSales: 94.7, platformReportedOrders: 1, sessions: 10 },
      { date: '2026-11-05', platform: 'Google Ads', campaign: 'Sales-Performance Max-NEW', spend: 0, platformReportedSales: 86.68, platformReportedOrders: 1, sessions: 10 },
    ])
  })
})
