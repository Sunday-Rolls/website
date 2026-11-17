import { describe, expect, it } from 'vitest'
import {
  loadRedditAdsCredentialsFromEnv,
  redditAdsMissingEnv,
  redditAuthorizeUrl,
  redditDailyAdSpend,
  syncRedditAdsToStore,
} from './reddit-ads.js'
import { buildRoas } from './metrics.js'
import { createMemoryAnalyticsStore } from './store.js'

const creds = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', adAccountId: 'a2_abc' }

describe('reddit ads', () => {
  it('reads env', () => {
    expect(redditAdsMissingEnv({})).toBe(
      'REDDIT_ADS_CLIENT_ID, REDDIT_ADS_CLIENT_SECRET, REDDIT_ADS_REFRESH_TOKEN, REDDIT_ADS_ACCOUNT_ID',
    )
    expect(
      loadRedditAdsCredentialsFromEnv({
        REDDIT_ADS_CLIENT_ID: ' id ',
        REDDIT_ADS_CLIENT_SECRET: 's',
        REDDIT_ADS_REFRESH_TOKEN: 'r',
        REDDIT_ADS_ACCOUNT_ID: 'a2_abc',
      }),
    ).toEqual({ clientId: 'id', clientSecret: 's', refreshToken: 'r', adAccountId: 'a2_abc' })
  })

  it('asks for a permanent, read-only token', () => {
    const url = new URL(redditAuthorizeUrl('id', 'https://x.test/cb', 'st'))
    expect(url.searchParams.get('duration')).toBe('permanent')
    expect(url.searchParams.get('scope')).toBe('adsread')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.test/cb')
  })

  it('converts micro-currency spend and cents value, merging split rows', () => {
    const rows = redditDailyAdSpend(
      [
        { date: '2026-11-10T00:00:00Z', campaign_id: 'c1', spend: 12_345_000, conversion_purchase_clicks: 1, conversion_purchase_views: 1, conversion_purchase_total_value: 16000 },
        { date: '2026-11-10', campaign_id: 'c1', spend: 655_000 },
        { date: '2026-11-10', campaign_id: 'c2', spend: 0 },
        { date: '2026-11-11', campaign_id: 'c3', spend: '2000000' },
      ],
      new Map([['c1', 'Putter covers']]),
    )
    expect(rows).toEqual([
      { date: '2026-11-10', platform: 'Reddit Ads', campaign: 'Putter covers', spend: 13, platformReportedSales: 160, platformReportedOrders: 2 },
      { date: '2026-11-11', platform: 'Reddit Ads', campaign: 'Campaign c3', spend: 2, platformReportedSales: 0, platformReportedOrders: 0 },
    ])
  })

  it('refreshes the token, requests daily campaign reports in windows and stores spend', async () => {
    const store = createMemoryAnalyticsStore()
    const calls: Array<{ url: string; body?: string }> = []
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined })
      if (url.includes('/access_token')) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 })
      if (url.includes('/campaigns')) return new Response(JSON.stringify({ data: [{ id: 'c1', name: 'Putters' }] }), { status: 200 })
      const body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({ data: { metrics: [{ date: body.data.starts_at.slice(0, 10), campaign_id: 'c1', spend: 5_000_000 }] } }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const r = await syncRedditAdsToStore(store, creds, { days: 20, asOf: '2026-11-10', fetchImpl: fakeFetch })
    const reports = calls.filter((c) => c.url.includes('/reports'))
    expect(reports).toHaveLength(2) // 20 days → 14 + 6
    const first = JSON.parse(reports[0].body!)
    expect(first.data).toMatchObject({
      starts_at: '2026-10-22T00:00:00Z',
      ends_at: '2026-11-05T00:00:00Z',
      breakdowns: ['DATE', 'CAMPAIGN_ID'],
    })
    expect(JSON.parse(reports[1].body!).data.ends_at).toBe('2026-11-11T00:00:00Z')
    expect(reports[0].url).toContain('/ad_accounts/a2_abc/reports')
    expect(r).toMatchObject({ rows: 2, spend: 10 })
    expect((await store.listAdSpend()).map((x) => [x.platform, x.campaign])).toEqual([
      ['Reddit Ads', 'Putters'],
      ['Reddit Ads', 'Putters'],
    ])
  })

  it('records a failed sync with the Reddit error', async () => {
    const store = createMemoryAnalyticsStore()
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch
    await expect(syncRedditAdsToStore(store, creds, { fetchImpl: fakeFetch })).rejects.toThrow('invalid_grant')
    expect((await store.latestSyncs()).find((s) => s.source === 'reddit-ads')?.status).toBe('error')
  })

  it('credits only Reddit-tagged website orders to Reddit spend', () => {
    const base = { channel: 'shopify', customerEmail: null, items: [] }
    const roas = buildRoas({
      range: { start: '2026-11-10', end: '2026-11-10' } as never,
      adSpend: [{ date: '2026-11-10', platform: 'Reddit Ads', campaign: 'Putters', spend: 20, platformReportedSales: 0, platformReportedOrders: 0 }],
      orders: [
        { ...base, id: '1', orderedAt: '2026-11-10T18:00:00Z', revenue: 80, trafficSource: 'reddit / paid' },
        { ...base, id: '2', orderedAt: '2026-11-10T18:00:00Z', revenue: 80, trafficSource: 'google / cpc' },
        { ...base, id: '3', orderedAt: '2026-11-10T18:00:00Z', revenue: 80, trafficSource: null },
      ] as never,
    })
    const reddit = roas.find((p) => p.platform === 'Reddit Ads')!
    expect(reddit.siteObservedSales).toBe(80)
    expect(reddit.siteTaggedOrders).toBe(1)
  })
})
