import { describe, expect, it } from 'vitest'
import { loadMetaAdsCredentialsFromEnv, metaAdsMissingEnv, metaDailyAdSpend, syncMetaAdsToStore } from './meta-ads.js'
import { createMemoryAnalyticsStore } from './store.js'

describe('meta ads', () => {
  it('reads env and strips act_', () => {
    expect(metaAdsMissingEnv({})).toBe('META_ACCESS_TOKEN, META_AD_ACCOUNT_ID')
    expect(loadMetaAdsCredentialsFromEnv({ META_ACCESS_TOKEN: 't', META_AD_ACCOUNT_ID: 'act_2001554000739418' })).toMatchObject({
      adAccountId: '2001554000739418',
      graphVersion: 'v24.0',
    })
  })

  it('counts a purchase once even when Meta reports it under several types', () => {
    const rows = metaDailyAdSpend([
      {
        date_start: '2026-11-10',
        campaign_id: '1',
        campaign_name: 'Headcovers',
        spend: '12.345',
        actions: [
          { action_type: 'omni_purchase', value: '2' },
          { action_type: 'purchase', value: '2' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' },
        ],
        action_values: [
          { action_type: 'omni_purchase', value: '160' },
          { action_type: 'purchase', value: '160' },
        ],
      },
      { date_start: '2026-11-10', campaign_id: '2', campaign_name: 'Off', spend: '0' },
    ])
    expect(rows).toEqual([
      { date: '2026-11-10', platform: 'Meta Ads', campaign: 'Headcovers', spend: 12.35, platformReportedSales: 160, platformReportedOrders: 2 },
    ])
  })

  it('pages through insights and stores spend', async () => {
    const store = createMemoryAnalyticsStore()
    const urls: string[] = []
    const fakeFetch = (async (url: string) => {
      urls.push(url)
      const body = urls.length === 1
        ? { data: [{ date_start: '2026-11-09', campaign_name: 'A', spend: '5' }], paging: { next: 'https://graph.facebook.com/next' } }
        : { data: [{ date_start: '2026-11-10', campaign_name: 'A', spend: '7' }] }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as unknown as typeof fetch
    const r = await syncMetaAdsToStore(store, { accessToken: 't', adAccountId: '1', graphVersion: 'v24.0' }, {
      days: 7,
      asOf: '2026-11-10',
      fetchImpl: fakeFetch,
    })
    expect(r).toMatchObject({ rows: 2, spend: 12 })
    expect(urls[0]).toContain('/v24.0/act_1/insights?')
    expect(urls[0]).toContain('time_increment=1')
    expect((await store.listAdSpend()).map((x) => x.platform)).toEqual(['Meta Ads', 'Meta Ads'])
  })

  it('surfaces Meta errors and records the failed sync', async () => {
    const store = createMemoryAnalyticsStore()
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 })) as unknown as typeof fetch
    await expect(
      syncMetaAdsToStore(store, { accessToken: 't', adAccountId: '1', graphVersion: 'v24.0' }, { fetchImpl: fakeFetch }),
    ).rejects.toThrow('Invalid OAuth access token')
    expect((await store.latestSyncs()).find((s) => s.source === 'meta-ads')?.status).toBe('error')
  })
})
