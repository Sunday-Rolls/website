import { describe, expect, it } from 'vitest'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { cleanTargeting, REDDIT_MANAGE_TOOLS, type RedditManageContext } from './reddit-ads-manage-tools.js'

const NOW = Date.parse('2026-11-24T15:00:00Z')
const API = 'https://ads-api.reddit.com/api/v3'
const ENV = {
  REDDIT_ADS_CLIENT_ID: 'id',
  REDDIT_ADS_CLIENT_SECRET: 'secret',
  REDDIT_ADS_REFRESH_TOKEN: 'refresh',
  REDDIT_ADS_ACCOUNT_ID: 'a2_acct',
}

type Call = { method: string; url: string; body: unknown }

const campaign = { id: 'c1', name: 'Golf', ad_account_id: 'a2_acct', configured_status: 'ACTIVE', is_campaign_budget_optimization: false }
const cboCampaign = { ...campaign, id: 'c2', name: 'CBO', is_campaign_budget_optimization: true, goal_type: 'DAILY_SPEND', goal_value: 20_000_000 }
const group = {
  id: 'g1',
  name: 'Putter people',
  campaign_id: 'c1',
  ad_account_id: 'a2_acct',
  configured_status: 'ACTIVE',
  goal_type: 'DAILY_SPEND',
  goal_value: 10_000_000,
  bid_strategy: 'MAXIMIZE_VOLUME',
  bid_type: 'CPC',
  bid_value: 500_000,
  optimization_goal: 'PURCHASE',
  conversion_pixel_id: 'a2_acct',
  start_time: '2026-11-01T00:00:00Z',
  targeting: { keywords: ['putter cover'], communities: ['golf', 'GolfGear'], interests: ['sports'], geolocations: ['US'], gender: null, not_a_field: 1 },
}
const cboGroup = { ...group, id: 'g2', campaign_id: 'c2', goal_value: null, bid_value: null }
const ad = {
  id: 'ad1',
  name: 'Retro cover',
  ad_group_id: 'g1',
  ad_account_id: 'a2_acct',
  configured_status: 'ACTIVE',
  post_id: 't3_abc',
  click_url: 'https://www.sundayrollsgolf.com/products/retro?ref=x',
}

function fake() {
  const calls: Call[] = []
  const entities: Record<string, unknown> = {
    '/campaigns/c1': campaign,
    '/campaigns/c2': cboCampaign,
    '/ad_groups/g1': group,
    '/ad_groups/g2': cboGroup,
    '/ads/ad1': ad,
  }
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body).startsWith('{') ? String(init.body) : '{}') : undefined
    calls.push({ method, url, body })
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
    if (url.includes('/api/v1/access_token')) return json({ access_token: 'tok', scope: 'adsread adsedit' })
    const path = new URL(url).pathname.replace('/api/v3', '')
    if (method === 'GET' && entities[path]) return json({ data: entities[path] })
    if (method === 'GET' && path === '/ad_accounts/a2_acct/campaigns') return json({ data: [campaign, cboCampaign], pagination: {} })
    if (method === 'GET' && path === '/ad_accounts/a2_acct/ad_groups') return json({ data: [group, cboGroup], pagination: {} })
    if (method === 'GET' && path === '/ad_accounts/a2_acct/ads') return json({ data: [ad], pagination: {} })
    if (method === 'PATCH') return json({ data: { ...(entities[path] as object), ...(body as { data: object }).data } })
    if (method === 'POST' && path === '/ad_accounts/a2_acct/ad_groups') return json({ data: { id: 'g9', configured_status: 'PAUSED' } })
    if (method === 'POST' && path === '/ad_accounts/a2_acct/ads') return json({ data: { id: 'ad9' } })
    return json({ error: { message: `unexpected ${method} ${path}` } }, 404)
  }) as typeof fetch
  return { calls, fetchImpl }
}

function setup() {
  const store = createMemoryAnalyticsStore()
  const { calls, fetchImpl } = fake()
  const ctx: RedditManageContext = { store, env: ENV, secret: 's3cret', user: { id: 'u1', email: 'sam@example.com' }, fetchImpl, now: () => NOW }
  const tool = (name: string) => {
    const t = REDDIT_MANAGE_TOOLS.find((x) => x.name === name)
    if (!t) throw new Error(`no tool ${name}`)
    return (args: Record<string, unknown>) => t.run(args, ctx) as Promise<Record<string, unknown>>
  }
  const writes = () => calls.filter((c) => c.method !== 'GET' && !c.url.includes('access_token'))
  return { store, calls, writes, tool }
}

describe('reddit ads change tools', () => {
  it('previews a URL change without writing, then applies it with the token and logs it', async () => {
    const { tool, writes, store } = setup()
    const args = { ad_id: 'ad1', set_query_params: { utm_source: 'reddit', utm_medium: 'paid' } }
    const preview = await tool('reddit_ads_set_ad_url')(args)
    expect(preview.status).toBe('preview')
    expect(writes()).toHaveLength(0)
    expect(preview.after).toEqual({
      click_url: 'https://www.sundayrollsgolf.com/products/retro?ref=x&utm_source=reddit&utm_medium=paid',
    })

    const applied = await tool('reddit_ads_set_ad_url')({ ...args, confirm_token: preview.confirm_token })
    expect(applied.status).toBe('applied')
    expect(writes()).toEqual([
      {
        method: 'PATCH',
        url: `${API}/ads/ad1`,
        body: { data: { click_url: 'https://www.sundayrollsgolf.com/products/retro?ref=x&utm_source=reddit&utm_medium=paid' } },
      },
    ])
    const log = await tool('reddit_ads_change_log')({})
    expect((log.entries as Array<{ tool: string; user: string }>)[0]).toMatchObject({ tool: 'reddit_ads_set_ad_url', user: 'sam@example.com' })
    expect(await store.getIntegrationState('reddit-ads-change-log')).toBeTruthy()
  })

  it('refuses a token for different arguments, and links off the site', async () => {
    const { tool, writes } = setup()
    const preview = await tool('reddit_ads_set_ad_url')({ ad_id: 'ad1', set_query_params: { utm_source: 'reddit' } })
    await expect(
      tool('reddit_ads_set_ad_url')({ ad_id: 'ad1', set_query_params: { utm_source: 'other' }, confirm_token: preview.confirm_token }),
    ).rejects.toThrow(/confirm_token/)
    await expect(tool('reddit_ads_set_ad_url')({ ad_id: 'ad1', click_url: 'https://evil.example.com/' })).rejects.toThrow(/sundayrollsgolf/)
    expect(writes()).toHaveLength(0)
  })

  it('edits keywords and communities while keeping the rest of the targeting', async () => {
    const { tool, writes } = setup()
    const args = { ad_group_id: 'g1', add_keywords: ['DF3 headcover', 'putter cover'], remove_communities: ['r/golfgear'], add_excluded_keywords: ['free'] }
    const preview = await tool('reddit_ads_update_targeting')(args)
    expect(preview.before).toEqual({ keywords: ['putter cover'], excluded_keywords: [], communities: ['golf', 'GolfGear'] })
    expect(preview.after).toEqual({ keywords: ['putter cover', 'DF3 headcover'], excluded_keywords: ['free'], communities: ['golf'] })
    await tool('reddit_ads_update_targeting')({ ...args, confirm_token: preview.confirm_token })
    const [w] = writes()
    expect(w.url).toBe(`${API}/ad_groups/g1`)
    expect((w.body as { data: { targeting: unknown } }).data.targeting).toEqual({
      keywords: ['putter cover', 'DF3 headcover'],
      excluded_keywords: ['free'],
      communities: ['golf'],
      interests: ['sports'],
      geolocations: ['US'],
    })
  })

  it('pauses an ad and refuses a no-op', async () => {
    const { tool, writes } = setup()
    const preview = await tool('reddit_ads_set_status')({ level: 'ad', id: 'ad1', status: 'PAUSED' })
    await tool('reddit_ads_set_status')({ level: 'ad', id: 'ad1', status: 'PAUSED', confirm_token: preview.confirm_token })
    expect(writes()[0]).toMatchObject({ method: 'PATCH', url: `${API}/ads/ad1`, body: { data: { configured_status: 'PAUSED' } } })
    await expect(tool('reddit_ads_set_status')({ level: 'ad', id: 'ad1', status: 'PAUSED', confirm_token: 'bad' })).rejects.toThrow(/confirm_token/)
    await expect(tool('reddit_ads_set_status')({ level: 'campaign', id: 'c1', status: 'ACTIVE' })).rejects.toThrow(/already/)
  })

  it('changes the ad group budget, or the campaign budget under CBO', async () => {
    const { tool, writes } = setup()
    const p1 = await tool('reddit_ads_set_daily_budget')({ ad_group_id: 'g1', daily_budget: 15 })
    expect(p1.before).toEqual({ daily_budget: 10 })
    await tool('reddit_ads_set_daily_budget')({ ad_group_id: 'g1', daily_budget: 15, confirm_token: p1.confirm_token })
    const p2 = await tool('reddit_ads_set_daily_budget')({ ad_group_id: 'g2', daily_budget: 25 })
    expect(p2.summary).toMatch(/campaign "CBO"/)
    await tool('reddit_ads_set_daily_budget')({ ad_group_id: 'g2', daily_budget: 25, confirm_token: p2.confirm_token })
    expect(writes().map((w) => [w.url, w.body])).toEqual([
      [`${API}/ad_groups/g1`, { data: { goal_value: 15_000_000 } }],
      [`${API}/campaigns/c2`, { data: { goal_value: 25_000_000 } }],
    ])
    await expect(tool('reddit_ads_set_daily_budget')({ ad_group_id: 'g1', daily_budget: 900 })).rejects.toThrow(/between/)
  })

  it('adds a paused ad group copied from another, with its own keywords and paused ad copies', async () => {
    const { tool, writes } = setup()
    const args = { source_ad_group_id: 'g1', name: 'DF3 owners', keywords: ['lab df3'], daily_budget: 8 }
    const preview = await tool('reddit_ads_create_ad_group')(args)
    expect(writes()).toHaveLength(0)
    expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/PAUSED/)]))
    const applied = await tool('reddit_ads_create_ad_group')({ ...args, confirm_token: preview.confirm_token })
    expect(applied.result).toEqual({ ad_group_id: 'g9', configured_status: 'PAUSED', ads: [{ source_ad_id: 'ad1', ok: true, new_ad_id: 'ad9' }] })
    const [g, a] = writes()
    expect(g.url).toBe(`${API}/ad_accounts/a2_acct/ad_groups`)
    expect((g.body as { data: Record<string, unknown> }).data).toEqual({
      campaign_id: 'c1',
      name: 'DF3 owners',
      configured_status: 'PAUSED',
      targeting: { keywords: ['lab df3'], communities: ['golf', 'GolfGear'], interests: ['sports'], geolocations: ['US'] },
      conversion_pixel_id: 'a2_acct',
      bid_strategy: 'MAXIMIZE_VOLUME',
      bid_type: 'CPC',
      optimization_goal: 'PURCHASE',
      bid_value: 500_000,
      goal_type: 'DAILY_SPEND',
      goal_value: 8_000_000,
    })
    expect((a.body as { data: Record<string, unknown> }).data).toEqual({
      ad_group_id: 'g9',
      name: 'Retro cover',
      configured_status: 'PAUSED',
      post_id: 't3_abc',
      click_url: ad.click_url,
    })
  })

  it('lists the account structure with ads under their ad groups', async () => {
    const { tool } = setup()
    const r = (await tool('reddit_ads_structure')({})) as { campaigns: Array<{ id: string; ad_groups: Array<{ id: string; budget: number | null; ads: unknown[]; targeting: { keywords: string[] } }> }> }
    expect(r.campaigns[0].ad_groups[0]).toMatchObject({ id: 'g1', budget: 10, targeting: { keywords: ['putter cover'] } })
    expect(r.campaigns[0].ad_groups[0].ads).toHaveLength(1)
    expect(r.campaigns[1].ad_groups[0].ads).toHaveLength(0)
  })

  it('says what is missing when Reddit is not connected', async () => {
    const t = REDDIT_MANAGE_TOOLS.find((x) => x.name === 'reddit_ads_structure')!
    const ctx = { store: createMemoryAnalyticsStore(), env: {}, secret: 's', user: { id: 'u', email: 'e' } }
    await expect(t.run({}, ctx)).rejects.toThrow(/REDDIT_ADS_CLIENT_ID/)
  })

  it('drops targeting keys Reddit would reject', () => {
    expect(cleanTargeting({ keywords: ['a'], gender: null, bogus: true })).toEqual({ keywords: ['a'] })
  })
})
