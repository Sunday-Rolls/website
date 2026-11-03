import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { createShopifyOrderSyncRunnerFromEnv, loadOrderSyncScheduleFromEnv } from './shopify-order-scheduler.js'
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

/** Fake Shopify Admin: token exchange, REST orders, GraphQL abandoned checkouts. */
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

describe('syncShopifyToStore', () => {
  afterEach(() => vi.unstubAllGlobals())

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
})

describe('createShopifyOrderSyncRunnerFromEnv', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('defaults to every 15 minutes with a 10s webhook debounce', () => {
    expect(loadOrderSyncScheduleFromEnv({})).toEqual({ intervalMs: 15 * 60_000, debounceMs: 10_000 })
  })

  it('stays off and says why without Shopify creds, a store, or when disabled', () => {
    const analytics = createMemoryAnalyticsStore()
    const noCreds = createShopifyOrderSyncRunnerFromEnv({ shopify: null, analytics, env: {} })
    expect('reason' in noCreds && noCreds.reason).toBe('missing SHOPIFY_CLIENT_ID/SECRET')
    expect(createShopifyOrderSyncRunnerFromEnv({ shopify, env: {} }).runner).toBeNull()
    const off = createShopifyOrderSyncRunnerFromEnv({
      shopify,
      analytics,
      env: { SHOPIFY_ORDER_SYNC_ENABLED: 'false' },
    })
    expect(off.runner).toBeNull()
  })

  it('syncs on boot, on the timer, and once after a burst of order webhooks', async () => {
    const sync = vi.fn(async () => ({ start: null, end: null, orders: 2, abandoned: 0, recovered: 0 }))
    const { runner } = createShopifyOrderSyncRunnerFromEnv({
      shopify,
      analytics: createMemoryAnalyticsStore(),
      env: {},
      log: () => {},
      sync,
    })
    runner!.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sync).toHaveBeenCalledTimes(1)

    runner!.trigger('orders/create')
    runner!.trigger('orders/updated')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sync).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(sync).toHaveBeenCalledTimes(3)
    runner!.stop()
  })
})

describe('POST /webhooks/shopify (orders)', () => {
  const secret = 'shpss_test'
  const body = JSON.stringify({ id: 1008 })
  const headers = (topic: string) => ({
    'X-Shopify-Hmac-Sha256': createHmac('sha256', secret).update(body).digest('base64'),
    'X-Shopify-Topic': topic,
  })
  const config = { corsOrigins: [], requireBrowserOrigin: true, contactApiKey: '' }

  it('routes order topics to the order sync and product topics to Merchant', async () => {
    const onOrderChange = vi.fn()
    const onProductChange = vi.fn()
    const app = createApp({ config, sendContactEmail: vi.fn(), shopifyWebhooks: { secret, onOrderChange, onProductChange } })
    for (const topic of ['orders/create', 'orders/updated', 'orders/cancelled', 'products/update']) {
      const res = await app.request('/webhooks/shopify', { method: 'POST', body, headers: headers(topic) })
      expect(res.status).toBe(200)
    }
    expect(onOrderChange.mock.calls.map((c) => c[0])).toEqual(['orders/create', 'orders/updated', 'orders/cancelled'])
    expect(onProductChange.mock.calls.map((c) => c[0])).toEqual(['products/update'])
  })

  it('accepts order webhooks when only the order sync is configured', async () => {
    const onOrderChange = vi.fn()
    const app = createApp({ config, sendContactEmail: vi.fn(), shopifyWebhooks: { secret, onOrderChange } })
    const product = await app.request('/webhooks/shopify', { method: 'POST', body, headers: headers('products/update') })
    expect(product.status).toBe(200)
    const order = await app.request('/webhooks/shopify', { method: 'POST', body, headers: headers('orders/create') })
    expect(order.status).toBe(200)
    expect(onOrderChange).toHaveBeenCalledWith('orders/create')
  })
})
