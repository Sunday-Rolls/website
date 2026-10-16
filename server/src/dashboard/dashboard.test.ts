import { describe, expect, it } from 'vitest'
import { hashPassword, SESSION_COOKIE, sessionExpiry } from '../analytics/auth.js'
import { seedDemoStore } from '../analytics/seed.js'
import { createMemoryAnalyticsStore } from '../analytics/store.js'
import { createApp } from '../app.js'
import { createMemoryReviewStore } from '../reviews.js'

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
  return { app, store }
}

describe('dashboard auth + overview', () => {
  it('rejects overview without a session', async () => {
    const { app } = await setup()
    const res = await app.request('/dashboard/api/overview')
    expect(res.status).toBe(401)
  })

  it('logs in and returns overview KPIs', async () => {
    const { app } = await setup()
    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
    })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')
    expect(cookie).toContain('sr_dashboard_session=')

    const overview = await app.request('/dashboard/api/overview?period=30d&asOf=2026-10-11', {
      headers: { Cookie: cookie!.split(';')[0] },
    })
    expect(overview.status).toBe(200)
    const body = await overview.json()
    expect(body.ok).toBe(true)
    expect(body.data.kpis.orders.value).toBeGreaterThan(0)
    expect(body.data.funnel).toHaveLength(5)
    expect(body.data.productViewsByProduct.length).toBeGreaterThan(1)
    expect(body.data.productViewsByProduct[0].name).toBeTruthy()
  })

  it('returns P&L income statement rows', async () => {
    const { app } = await setup()
    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const pnl = await app.request('/dashboard/api/pnl?year=2026&month=2026-09', {
      headers: { Cookie: cookie },
    })
    expect(pnl.status).toBe(200)
    const body = await pnl.json()
    expect(body.data.incomeStatement.some((r: { label: string }) => r.label === 'Net income')).toBe(true)
  })

  it('supports custom overview range and ROAS campaigns', async () => {
    const { app } = await setup()
    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]

    const overview = await app.request('/dashboard/api/overview?start=2026-09-01&end=2026-09-30', {
      headers: { Cookie: cookie },
    })
    expect(overview.status).toBe(200)
    const overviewBody = await overview.json()
    expect(overviewBody.data.range.start).toBe('2026-09-01')
    expect(overviewBody.data.range.end).toBe('2026-09-30')

    const roas = await app.request('/dashboard/api/roas?period=30d&asOf=2026-10-11', {
      headers: { Cookie: cookie },
    })
    expect(roas.status).toBe(200)
    const roasBody = await roas.json()
    const google = roasBody.data.platforms.find((p: { platform: string }) => p.platform === 'Google Ads')
    expect(google?.campaigns?.length).toBeGreaterThan(1)
    expect(google.campaigns.some((c: { campaign: string }) => c.campaign === 'Brand Search')).toBe(true)
  })

  it('downloads and re-uploads the editable data workbook', async () => {
    const { app } = await setup()
    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]

    const download = await app.request('/dashboard/api/workbook', {
      headers: { Cookie: cookie },
    })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    const bytes = Buffer.from(await download.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(1000)

    const form = new FormData()
    form.append('file', new Blob([bytes], { type: download.headers.get('content-type')! }), 'dash.xlsx')
    const upload = await app.request('/dashboard/api/workbook', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(upload.status).toBe(200)
    const body = await upload.json()
    expect(body.ok).toBe(true)
    expect(body.data.upsertedOrders).toBeGreaterThan(0)
    expect(body.data.expenses).toBeGreaterThan(0)
  })

  it('rejects a non-admin login and hides reports from a non-admin session', async () => {
    const { app, store } = await setup()
    await store.upsertUser({
      id: '00000000-0000-4000-8000-000000000002',
      email: 'guest@example.com',
      name: 'Guest',
      passwordHash: await hashPassword('test-password-123'),
      isAdmin: false,
    })

    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'guest@example.com', password: 'test-password-123' }),
    })
    expect(login.status).toBe(403)
    expect(login.headers.get('set-cookie')).toBeNull()
    const loginBody = await login.json()
    expect(loginBody.error).toBe('Admin access required')

    const sessionId = '00000000-0000-4000-8000-000000000099'
    await store.createSession({
      id: sessionId,
      userId: '00000000-0000-4000-8000-000000000002',
      expiresAt: sessionExpiry().toISOString(),
    })
    const cookie = `${SESSION_COOKIE}=${sessionId}`

    const overview = await app.request('/dashboard/api/overview', { headers: { Cookie: cookie } })
    expect(overview.status).toBe(403)

    const workflow = await app.request('/dashboard/api/workflows/reviews', {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(workflow.status).toBe(403)
    const workflowBody = await workflow.json()
    expect(workflowBody.error).toBe('Admin access required')
  })

  it('runs the review workflow for an admin and rejects signed-out callers', async () => {
    const store = createMemoryAnalyticsStore()
    await store.upsertUser({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'sam@example.com',
      name: 'Sam',
      passwordHash: await hashPassword('test-password-123'),
      isAdmin: true,
    })
    const reviews = createMemoryReviewStore()
    const app = createApp({
      config: {
        corsOrigins: ['http://localhost:5173'],
        requireBrowserOrigin: false,
        contactApiKey: '',
        dashboardSecureCookies: false,
      },
      sendContactEmail: async () => {},
      analytics: store,
      reviews,
    })

    const signedOut = await app.request('/dashboard/api/workflows/reviews', { method: 'POST' })
    expect(signedOut.status).toBe(401)

    const login = await app.request('/dashboard/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.com', password: 'test-password-123' }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const me = await app.request('/dashboard/api/me', { headers: { Cookie: cookie } })
    expect((await me.json()).user.isAdmin).toBe(true)

    const run = await app.request('/dashboard/api/workflows/reviews', {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(run.status).toBe(200)
    const body = await run.json()
    expect(body.ok).toBe(true)
    expect(body.data.steps.map((step: { name: string }) => step.name)).toEqual([
      'Post review',
      'Show on site',
      'Delete review',
    ])
    expect(await reviews.listByHandle('retro-roller-grey', 10)).toEqual([])

    const unknown = await app.request('/dashboard/api/workflows/nope', {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(unknown.status).toBe(404)
  })
})
