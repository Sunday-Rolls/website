import { describe, expect, it } from 'vitest'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { redditAdsPerformance } from './reddit-ads-tools.js'

const NOW = Date.parse('2026-11-24T15:00:00Z')

async function seeded() {
  const store = createMemoryAnalyticsStore()
  await store.upsertAdSpend([
    { date: '2026-11-20', platform: 'Reddit Ads', campaign: 'Golf subs', spend: 40, platformReportedSales: 160, platformReportedOrders: 2 },
    { date: '2026-11-21', platform: 'Reddit Ads', campaign: 'Golf subs', spend: 10, platformReportedSales: 0, platformReportedOrders: 0 },
    { date: '2026-11-21', platform: 'Reddit Ads', campaign: 'Putters', spend: 25, platformReportedSales: 80, platformReportedOrders: 1 },
    { date: '2026-11-21', platform: 'Meta Ads', campaign: 'Not Reddit', spend: 99, platformReportedSales: 0, platformReportedOrders: 0 },
    { date: '2026-09-01', platform: 'Reddit Ads', campaign: 'Too old', spend: 5, platformReportedSales: 0, platformReportedOrders: 0 },
  ])
  return store
}

describe('reddit_ads_performance', () => {
  it('returns stored Reddit rows in the window with totals and per-campaign ROAS', async () => {
    const store = await seeded()
    const r = await redditAdsPerformance({ days: 30 }, { store, env: {}, now: () => NOW })
    expect(r.connected).toBe(false)
    expect(r.sync_note).toMatch(/REDDIT_ADS_CLIENT_ID/)
    expect(r.daily).toHaveLength(3)
    expect(r.daily.every((d) => d.campaign !== 'Not Reddit' && d.campaign !== 'Too old')).toBe(true)
    expect(r.totals).toMatchObject({ spend: 75, purchases: 3, purchase_value: 240, roas: 3.2, cost_per_purchase: 25 })
    expect(r.campaigns[0]).toMatchObject({ campaign: 'Golf subs', spend: 50, roas: 3.2 })
  })

  it('rejects a bad window', async () => {
    const store = await seeded()
    await expect(redditAdsPerformance({ days: 0 }, { store, env: {}, now: () => NOW })).rejects.toThrow(/days/)
  })

  it('keeps stored data and explains when the refresh from Reddit fails', async () => {
    const store = await seeded()
    const env = {
      REDDIT_ADS_CLIENT_ID: 'id',
      REDDIT_ADS_CLIENT_SECRET: 'secret',
      REDDIT_ADS_REFRESH_TOKEN: 'refresh',
      REDDIT_ADS_ACCOUNT_ID: 'a2_test',
    }
    const fetchImpl = (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch
    const r = await redditAdsPerformance({ days: 30 }, { store, env, fetchImpl, now: () => NOW })
    expect(r.connected).toBe(true)
    expect(r.sync_note).toMatch(/invalid_grant/)
    expect(r.totals.spend).toBe(75)
  })
})
