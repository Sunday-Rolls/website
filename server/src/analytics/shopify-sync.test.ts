import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { hashPassword } from './auth.js'
import { inRange, monthKey, storeDay, storeMidnightUtc } from './period.js'
import { syncShopifyToStore } from './shopify-sync.js'
import type { ShopifyOrderRaw } from './shopify.js'
import { createMemoryAnalyticsStore } from './store.js'

const shopify = { shop: 'chrgrk-ff', clientId: 'id', clientSecret: 'secret' }

function rawOrder(id: number, extra: Partial<ShopifyOrderRaw> = {}): ShopifyOrderRaw {
  return {
    id,
    name: `#${id}`,
    created_at: '2026-11-02T17:08:26-06:00',
    financial_status: 'paid',
    total_price: '87.27',
    line_items: [{ name: 'Retro Roller - Grey', quantity: 1, price: '79.00' }],
    ...extra,
  }
}

/** Fake Shopify Admin: token exchange, REST orders, GraphQL abandoned checkouts. Returns the orders.json URLs hit. */
function stubShopify(orders: () => ShopifyOrderRaw[]) {
  const orderUrls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
      if (url.includes('/oauth/access_token')) return json({ access_token: 't', expires_in: 3600, scope: '' })
      if (url.includes('/orders.json')) {
        orderUrls.push(url)
        return json({ orders: orders() })
      }
      return json({ data: { abandonedCheckouts: { pageInfo: { hasNextPage: false }, edges: [] } } })
    }),
  )
  return orderUrls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('syncShopifyToStore', () => {
  it('imports paid orders and is idempotent', async () => {
    const store = createMemoryAnalyticsStore()
    stubShopify(() => [rawOrder(1005), rawOrder(1006)])
    await syncShopifyToStore(store, shopify)
    await syncShopifyToStore(store, shopify)
    const ids = (await store.listOrders()).map((o) => o.externalId).sort()
    expect(ids).toEqual(['shopify:1005', 'shopify:1006'])
  })

  it('removes an order that was cancelled or tagged as a test after it was imported', async () => {
    const store = createMemoryAnalyticsStore()
    let orders = [rawOrder(1005), rawOrder(1006), rawOrder(1007)]
    stubShopify(() => orders)
    await syncShopifyToStore(store, shopify)
    orders = [
      rawOrder(1005, { cancelled_at: '2026-11-03T10:00:00Z' }),
      rawOrder(1006, { tags: 'analytics-test' }),
      rawOrder(1007),
    ]
    await syncShopifyToStore(store, shopify)
    expect((await store.listOrders()).map((o) => o.externalId)).toEqual(['shopify:1007'])
    const [run] = (await store.latestSyncs()).filter((s) => s.source === 'shopify')
    expect(run?.message).toContain('removed 2 cancelled/test orders')
  })

  it('asks Shopify for Central-time day boundaries', async () => {
    const urls = stubShopify(() => [])
    await syncShopifyToStore(createMemoryAnalyticsStore(), shopify, { start: '2026-11-02', end: '2026-11-02' })
    const params = new URL(urls[0]!).searchParams
    expect(params.get('created_at_min')).toBe('2026-11-02T06:00:00.000Z')
    expect(params.get('created_at_max')).toBe('2026-11-03T05:59:59.000Z')
  })
})

describe('store-timezone days', () => {
  it('puts an evening Central order on its local day, not the next UTC day', () => {
    // #1006: 6:25pm CT on Nov 2 is 00:25 UTC on Nov 3.
    expect(storeDay('2026-11-03T00:25:47.000Z')).toBe('2026-11-02')
    expect(inRange('2026-11-03T00:25:47.000Z', '2026-11-02', '2026-11-02')).toBe(true)
    expect(monthKey('2026-11-01T03:00:00.000Z')).toBe('2026-10')
  })

  it('leaves date-only imports (stored at UTC midnight) on their own day', () => {
    expect(storeDay('2026-09-29T00:00:00.000Z')).toBe('2026-09-29')
    expect(storeDay('2026-09-29')).toBe('2026-09-29')
  })

  it('finds Central midnight across daylight saving', () => {
    expect(storeMidnightUtc('2026-07-01')).toBe('2026-07-01T05:00:00.000Z')
    expect(storeMidnightUtc('2026-12-01')).toBe('2026-12-01T06:00:00.000Z')
  })
})

describe('POST /dashboard/api/sync/auto/shopify', () => {
  async function setup() {
    vi.stubEnv('SHOPIFY_SHOP', 'chrgrk-ff')
    vi.stubEnv('SHOPIFY_CLIENT_ID', 'id')
    vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'secret')
    const store = createMemoryAnalyticsStore()
    await store.upsertUser({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'sam@example.com',
      name: 'Sam',
      passwordHash: await hashPassword('test-password-123'),
      isAdmin: true,
    })
    const app = createApp({
      config: { corsOrigins: [], requireBrowserOrigin: false, contactApiKey: '' },
      sendContactEmail: async () => {},
      analytics: store,
    })
    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    const autoSync = () =>
      app.request('/dashboard/api/sync/auto/shopify', { method: 'POST', headers: { Cookie: cookie } })
    return { store, autoSync }
  }

  it('syncs on open, then skips while the last sync is fresh', async () => {
    const { store, autoSync } = await setup()
    const urls = stubShopify(() => [rawOrder(1005)])
    const first = await (await autoSync()).json()
    expect(first.data).toEqual({ status: 'synced', summary: '1 orders' })
    expect((await store.listOrders()).map((o) => o.externalId)).toEqual(['shopify:1005'])
    const second = await (await autoSync()).json()
    expect(second.data.status).toBe('fresh')
    expect(urls).toHaveLength(1)
  })

  it('shares one run between tabs that open at the same time', async () => {
    const { autoSync } = await setup()
    const urls = stubShopify(() => [rawOrder(1005)])
    const [a, b] = await Promise.all([autoSync(), autoSync()])
    expect((await a.json()).data.status).toBe('synced')
    expect((await b.json()).data.status).toBe('synced')
    expect(urls).toHaveLength(1)
  })
})
