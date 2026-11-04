import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderExperimentAttribution, syncShopifyToStore } from '../analytics/shopify-sync.js'
import type { ShopifyOrderRaw } from '../analytics/shopify.js'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { createMemoryExperimentStore } from './store.js'

const shopify = { shop: 'chrgrk-ff', clientId: 'id', clientSecret: 'secret' }
const VID = 'AbCdEfGhIjKlMnOpQrStUv'

function rawOrder(id: number, attrs: Record<string, string> = {}, extra: Partial<ShopifyOrderRaw> = {}): ShopifyOrderRaw {
  return {
    id,
    name: `#${id}`,
    created_at: '2026-11-02T17:08:26-06:00',
    financial_status: 'paid',
    total_price: '87.27',
    line_items: [{ name: 'Retro Roller - Grey', quantity: 1, price: '79.00' }],
    note_attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    ...extra,
  }
}

function stubShopify(orders: () => ShopifyOrderRaw[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
      if (url.includes('/oauth/access_token')) return json({ access_token: 't', expires_in: 3600, scope: '' })
      if (url.includes('/orders.json')) return json({ orders: orders() })
      return json({ data: { abandonedCheckouts: { pageInfo: { hasNextPage: false }, edges: [] } } })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('orderExperimentAttribution', () => {
  it('reads _sr_vid and _sr_exp from note_attributes', () => {
    expect(
      orderExperimentAttribution(rawOrder(1, { _sr_vid: ` ${VID} `, _sr_exp: 'home-banner:b|other:control', _sr_source: 'google' })),
    ).toEqual({ visitorId: VID, experiments: { 'home-banner': 'b', other: 'control' } })
  })

  it('drops an invalid vid or malformed pairs, and is null with nothing usable', () => {
    expect(orderExperimentAttribution(rawOrder(1, { _sr_vid: 'bad id', _sr_exp: 'home-banner:b|Nope' }))).toEqual({
      visitorId: null,
      experiments: { 'home-banner': 'b' },
    })
    expect(orderExperimentAttribution(rawOrder(1, { _sr_vid: VID }))).toEqual({ visitorId: VID, experiments: {} })
    expect(orderExperimentAttribution(rawOrder(1, { _sr_source: 'google' }))).toBeNull()
    expect(orderExperimentAttribution(rawOrder(1, { _sr_vid: '!', _sr_exp: '' }))).toBeNull()
  })
})

describe('syncShopifyToStore with experiments', () => {
  it('upserts tagged orders into experiment_orders and removes ones later cancelled', async () => {
    const analytics = createMemoryAnalyticsStore()
    const experiments = createMemoryExperimentStore()
    let orders = [rawOrder(1005, { _sr_vid: VID, _sr_exp: 'home-banner:b' }), rawOrder(1006), rawOrder(1007, { _sr_exp: 'home-banner:control' })]
    stubShopify(() => orders)

    await syncShopifyToStore(analytics, shopify, { experiments })
    await syncShopifyToStore(analytics, shopify, { experiments })
    expect(experiments._rows.orders).toEqual([
      {
        channel: 'shopify',
        externalId: 'shopify:1005',
        orderedAt: '2026-11-02T23:08:26.000Z',
        revenue: 87.27,
        visitorId: VID,
        experiments: { 'home-banner': 'b' },
      },
      expect.objectContaining({ externalId: 'shopify:1007', visitorId: null, experiments: { 'home-banner': 'control' } }),
    ])
    // Analytics orders are unchanged by the hook.
    expect((await analytics.listOrders()).map((o) => o.externalId).sort()).toEqual(['shopify:1005', 'shopify:1006', 'shopify:1007'])

    orders = [rawOrder(1005, { _sr_vid: VID, _sr_exp: 'home-banner:b' }, { cancelled_at: '2026-11-03T10:00:00Z' })]
    await syncShopifyToStore(analytics, shopify, { experiments })
    expect(experiments._rows.orders.map((o) => o.externalId)).toEqual(['shopify:1007'])
  })

  it('never fails the analytics sync when the experiments store fails', async () => {
    const analytics = createMemoryAnalyticsStore()
    const experiments = createMemoryExperimentStore()
    vi.spyOn(experiments, 'upsertOrders').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubShopify(() => [rawOrder(1005, { _sr_vid: VID })])

    const result = await syncShopifyToStore(analytics, shopify, { experiments })
    expect(result.orders).toBe(1)
  })

  it('works unchanged without an experiments store', async () => {
    const analytics = createMemoryAnalyticsStore()
    stubShopify(() => [rawOrder(1005, { _sr_vid: VID })])
    expect((await syncShopifyToStore(analytics, shopify)).orders).toBe(1)
  })
})
