import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../analytics/auth.js'
import { seedDemoStore } from '../analytics/seed.js'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { createApp } from '../app.js'

async function setup() {
  const store = createMemoryAnalyticsStore()
  await seedDemoStore(store)
  await store.upsertUser({
    id: '00000000-0000-4000-8000-000000000001',
    email: 'sam@example.com',
    name: 'Sam',
    passwordHash: await hashPassword('test-password-123'),
    isAdmin: true,
  })
  const app = createApp({
    config: {
      corsOrigins: ['http://localhost:5173'],
      requireBrowserOrigin: false,
      contactApiKey: '',
      dashboardSecureCookies: false,
    },
    sendContactEmail: async () => {},
    analytics: store,
  })
  const login = await app.request('/dashboard/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
  })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]
  return { app, store, cookie }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

const RANGE = 'period=30d&asOf=2026-10-11'

describe('redesign dashboard endpoints', () => {
  it.each(['/api/orders', '/api/products', '/api/marketing', '/api/funnel', '/api/health'])(
    '%s requires a session',
    async (path) => {
      const { app } = await setup()
      expect((await app.request(`/dashboard${path}`)).status).toBe(401)
    },
  )

  it.each(['/api/orders', '/api/products', '/api/marketing', '/api/funnel'])('%s rejects an invalid range', async (path) => {
    const { app, cookie } = await setup()
    const res = await app.request(`/dashboard${path}?start=2026-10-10&end=2026-10-01`, { headers: { Cookie: cookie } })
    expect(res.status).toBe(400)
  })

  it('overview adds mer, pace and attention', async () => {
    const { app, cookie } = await setup()
    const res = await app.request(`/dashboard/api/overview?${RANGE}`, { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.kpis.revenue.value).toBeGreaterThan(0)
    expect(data.mer.revenue).toBe(data.kpis.revenue.value)
    expect(typeof data.mer.adSpend).toBe('number')
    expect(data.pace).toMatchObject({ daysElapsed: 11, daysInMonth: 31 })
    expect(Array.isArray(data.attention.failedSyncs)).toBe(true)
    expect(data.attention).not.toHaveProperty('newMessages')
  })

  it('orders filters by channel and keeps totals for all channels', async () => {
    const { app, cookie } = await setup()
    const res = await app.request(`/dashboard/api/orders?${RANGE}&channel=etsy`, { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const { ok, data } = await res.json()
    expect(ok).toBe(true)
    expect(data.range.end).toBe('2026-10-11')
    expect(data.orders.every((o: { channel: string }) => o.channel === 'etsy')).toBe(true)
    expect(data.totals.length).toBeGreaterThan(1)
  })

  it('products, marketing and funnel return their views', async () => {
    const { app, cookie } = await setup()
    const get = async (path: string) => {
      const res = await app.request(`/dashboard${path}?${RANGE}`, { headers: { Cookie: cookie } })
      expect(res.status).toBe(200)
      return (await res.json()).data
    }
    const products = await get('/api/products')
    expect(products.products.length).toBeGreaterThan(0)
    expect(products.trend).toHaveLength(30)
    const marketing = await get('/api/marketing')
    expect(marketing.connected).toHaveProperty('googleAds')
    expect(Array.isArray(marketing.platforms)).toBe(true)
    const funnel = await get('/api/funnel')
    expect(funnel.funnel).toHaveProperty('visits')
    expect(funnel.customers).toHaveProperty('new')
  })

  it('health lists every source with its configuration', async () => {
    for (const key of [
      'SHOPIFY_CLIENT_ID',
      'SHOPIFY_CLIENT_SECRET',
      'GOOGLE_SERVICE_ACCOUNT_JSON',
      'MERCHANT_SERVICE_ACCOUNT_JSON',
      'MERCHANT_CENTER_ID',
      'MERCHANT_DATA_SOURCE_ID',
      'MERCHANT_SYNC_ENABLED',
    ]) {
      vi.stubEnv(key, '')
    }
    const { app, store, cookie } = await setup()
    const run = await store.startSync('merchant-center')
    await store.finishSync(run.id, 'error', 'Merchant 403', 0)
    const res = await app.request('/dashboard/api/health', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.sources.map((s: { source: string }) => s.source)).toEqual([
      'shopify',
      'sales-tracker',
      'ga4',
      'search-console',
      'merchant',
    ])
    const merchant = data.sources.at(-1)
    expect(merchant).toMatchObject({ label: 'Google Merchant Center', configured: false })
    expect(merchant.missing).toContain('MERCHANT_CENTER_ID')
    expect(merchant.lastSync).toMatchObject({ status: 'error', message: 'Merchant 403' })
    expect(data.sources[0]).toMatchObject({ configured: false, freshMinutes: 5 })
  })

  it('forced auto-sync still answers for an unconfigured source', async () => {
    vi.stubEnv('SEARCH_CONSOLE_SITE_URL', '')
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '')
    const { app, cookie } = await setup()
    const res = await app.request('/dashboard/api/sync/auto/search-console?force=1', {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.status).toBe('unconfigured')
  })
})

describe('POST /api/import/customer-orders', () => {
  const csv = `"Order ID","Email","Financial Status","Paid at","Subtotal","Shipping","Created at","Lineitem quantity","Lineitem name","Lineitem price"
"1001","A@x.test","PAID","2026-10-02 10:00:00 -0500","80.00","7.50","2026-10-02 10:00:00 -0500","1","Headcover","80.00"
"1002","b@x.test","PAID","2026-10-03 10:00:00 -0500","80.00","7.50","2026-10-03 10:00:00 -0500","1","Headcover","80.00"`

  it('stores customer history without touching orders', async () => {
    const { app, store, cookie } = await setup()
    const ordersBefore = (await store.listOrders()).length
    const body = new FormData()
    body.append('file', new Blob([csv], { type: 'text/csv' }), 'orders.csv')
    const res = await app.request('/dashboard/api/import/customer-orders', { method: 'POST', body, headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ rows: 2, customers: 2 })
    expect((await store.listCustomerOrders()).map((o) => o.email).sort()).toEqual(['a@x.test', 'b@x.test'])
    expect((await store.listOrders()).length).toBe(ordersBefore)
  })

  it('requires a session', async () => {
    const { app } = await setup()
    expect((await app.request('/dashboard/api/import/customer-orders', { method: 'POST' })).status).toBe(401)
  })
})
