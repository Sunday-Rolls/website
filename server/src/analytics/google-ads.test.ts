import { describe, expect, it } from 'vitest'
import {
  campaignDailyFromRows,
  googleAdsMissingEnv,
  googleAdsQuery,
  loadGoogleAdsCredentialsFromEnv,
  searchTermsFromRows,
  type GoogleAdsCredentials,
} from './google-ads.js'
import { syncGoogleAdsToStore } from './google-ads-sync.js'
import { buildGoogleAdsView } from './google-ads-view.js'
import { createMemoryAnalyticsStore } from './store.js'

const creds: GoogleAdsCredentials = {
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'refresh',
  customerId: '2996974701',
  apiVersion: 'v26',
}

const campaignRow = (date: string, id: string, name: string, impressions: number, clicks: number, costMicros: number, conv = 0, value = 0) => ({
  segments: { date },
  campaign: { id, name },
  metrics: {
    impressions: String(impressions),
    clicks: String(clicks),
    costMicros: String(costMicros),
    conversions: conv,
    conversionsValue: value,
  },
})

const termRow = (term: string, campaign: string, clicks: number, costMicros: number, conv = 0) => ({
  searchTermView: { searchTerm: term },
  campaign: { name: campaign },
  metrics: { impressions: String(clicks * 10), clicks: String(clicks), costMicros: String(costMicros), conversions: conv },
})

describe('google ads env', () => {
  it('lists missing vars and strips dashes from the customer id', () => {
    expect(googleAdsMissingEnv({})).toBe(
      'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID',
    )
    const env = {
      GOOGLE_ADS_CLIENT_ID: 'a',
      GOOGLE_ADS_CLIENT_SECRET: 'b',
      GOOGLE_ADS_REFRESH_TOKEN: 'c',
      GOOGLE_ADS_CUSTOMER_ID: '299-697-4701',
    }
    expect(googleAdsMissingEnv(env)).toBeNull()
    expect(loadGoogleAdsCredentialsFromEnv(env)).toMatchObject({ customerId: '2996974701', apiVersion: 'v26' })
    expect(loadGoogleAdsCredentialsFromEnv(env)?.developerToken).toBeUndefined()
  })
})

describe('google ads parsing', () => {
  it('turns micros into dollars and drops empty days', () => {
    const rows = campaignDailyFromRows([
      campaignRow('2026-11-02', '1', 'Headcovers', 500, 20, 12_340_000, 1.5, 80),
      campaignRow('2026-11-01', '1', 'Headcovers', 0, 0, 0),
    ])
    expect(rows).toEqual([
      {
        date: '2026-11-02',
        campaignId: '1',
        campaign: 'Headcovers',
        impressions: 500,
        clicks: 20,
        cost: 12.34,
        conversions: 1.5,
        conversionValue: 80,
      },
    ])
  })

  it('sums search terms across days and sorts by cost', () => {
    const terms = searchTermsFromRows(
      [
        termRow('lab df3 headcover', 'Headcovers', 2, 1_000_000),
        termRow('lab df3 headcover', 'Headcovers', 3, 1_500_000, 1),
        termRow('putter cover', 'Headcovers', 1, 4_000_000),
      ],
      '2026-10-01',
      '2026-11-01',
    )
    expect(terms.map((t) => [t.term, t.clicks, t.cost, t.conversions])).toEqual([
      ['putter cover', 1, 4, 0],
      ['lab df3 headcover', 5, 2.5, 1],
    ])
  })
})

describe('googleAdsQuery', () => {
  it('posts GAQL to searchStream and flattens batches', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify([{ results: [{ a: 1 }] }, { results: [{ a: 2 }] }]), { status: 200 })
    }) as unknown as typeof fetch
    const rows = await googleAdsQuery(creds, 'SELECT campaign.id FROM campaign', fakeFetch, 'tok')
    expect(rows).toHaveLength(2)
    expect(calls[0].url).toBe('https://googleads.googleapis.com/v26/customers/2996974701/googleAds:searchStream')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['developer-token']).toBeUndefined()
  })

  it('surfaces the API error message', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify([{ error: { message: 'PERMISSION_DENIED: no access' } }]), {
        status: 403,
      })) as unknown as typeof fetch
    await expect(googleAdsQuery(creds, 'SELECT 1', fakeFetch, 'tok')).rejects.toThrow('PERMISSION_DENIED: no access')
  })
})

describe('syncGoogleAdsToStore + view', () => {
  it('stores campaign days and search terms, and builds range totals', async () => {
    const store = createMemoryAnalyticsStore()
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const query = JSON.parse(String(init.body)).query as string
      const results = query.includes('search_term_view')
        ? [termRow('lab df3 headcover', 'Headcovers', 4, 3_000_000, 1)]
        : [
            campaignRow('2026-11-09', '1', 'Headcovers', 1000, 40, 30_000_000, 2, 160),
            campaignRow('2026-11-10', '1', 'Headcovers', 1000, 10, 10_000_000, 0, 0),
            campaignRow('2026-11-10', '2', 'Towels', 100, 0, 0),
          ]
      return new Response(JSON.stringify([{ results }]), { status: 200 })
    }) as unknown as typeof fetch

    const result = await syncGoogleAdsToStore(store, creds, {
      days: 7,
      asOf: '2026-11-10',
      fetchImpl: fakeFetch,
      getToken: async () => 'tok',
    })
    expect(result).toMatchObject({ start: '2026-11-04', end: '2026-11-10', dailyRows: 3, searchTerms: 1, cost: 40 })
    expect((await store.latestSyncs()).find((s) => s.source === 'google-ads')?.status).toBe('ok')

    const view = buildGoogleAdsView({
      range: { start: '2026-11-04', end: '2026-11-10' },
      daily: await store.listGoogleAdsDaily(),
      searchTerms: await store.listGoogleAdsSearchTerms(),
      connected: true,
    })
    expect(view.totals).toMatchObject({ impressions: 2100, clicks: 50, cost: 40, conversions: 2, cpc: 0.8, costPerConversion: 20, roas: 4 })
    expect(view.campaigns.map((c) => c.campaign)).toEqual(['Headcovers', 'Towels'])
    expect(view.lastDay).toBe('2026-11-10')
    expect(view.searchTermsPeriod).toEqual({ start: '2026-11-04', end: '2026-11-10' })
  })

  it('records a failed sync', async () => {
    const store = createMemoryAnalyticsStore()
    const fakeFetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    await expect(
      syncGoogleAdsToStore(store, creds, { asOf: '2026-11-10', fetchImpl: fakeFetch, getToken: async () => 'tok' }),
    ).rejects.toThrow('Google Ads query failed (500)')
    expect((await store.latestSyncs()).find((s) => s.source === 'google-ads')?.status).toBe('error')
  })
})
