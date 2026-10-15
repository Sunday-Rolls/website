import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  hashPassword,
  isValidEmail,
  newSessionId,
  normalizeEmail,
  SESSION_COOKIE,
  sessionExpiry,
  verifyPassword,
} from '../analytics/auth.js'
import { buildDataAudit } from '../analytics/data-audit.js'
import { extractDriveFileId, listDriveWorkbooks } from '../analytics/drive.js'
import { loadGa4CredentialsFromEnv, syncGa4ToStore } from '../analytics/ga4-sync.js'
import { buildOverview, buildPnL, buildRoas } from '../analytics/metrics.js'
import { rangeForCustom, rangeForPeriod } from '../analytics/period.js'
import { seedDemoStore } from '../analytics/seed.js'
import { syncSalesTrackerFromBuffer, syncSalesTrackerFromDrive } from '../analytics/sales-tracker-sync.js'
import { loadShopifyCredentialsFromEnv, syncShopifyToStore } from '../analytics/shopify-sync.js'
import { pingShopifyShop } from '../analytics/shopify.js'
import type { AnalyticsStore } from '../analytics/store.js'
import type { PeriodKey } from '../analytics/types.js'
import { clientIp } from '../app.js'
import type { RateLimiter } from '../rate-limit.js'

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), 'ui')

export type DashboardDeps = {
  store: AnalyticsStore
  checkRateLimit: RateLimiter
  /** When true, cookie Secure flag is set. */
  secureCookies: boolean
  cutoverAt: string | null
}

export function createDashboardRoutes(deps: DashboardDeps) {
  const app = new Hono()
  const { store, checkRateLimit, secureCookies } = deps

  app.get('/', async (c) => file(c, 'index.html', 'text/html; charset=utf-8'))
  app.get('/styles.css', async (c) => file(c, 'styles.css', 'text/css; charset=utf-8'))
  app.get('/app.js', async (c) => file(c, 'app.js', 'text/javascript; charset=utf-8'))
  app.get('/logo.svg', async (c) => file(c, 'logo.svg', 'image/svg+xml'))
  app.get('/mark.svg', async (c) => file(c, 'mark.svg', 'image/svg+xml'))
  app.get('/favicon.svg', async (c) => file(c, 'favicon.svg', 'image/svg+xml'))
  app.get('/favicon.png', async (c) => file(c, 'favicon.png', 'image/png'))

  app.get('/api/me', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    return c.json({ ok: true, user })
  })

  app.post('/api/login', async (c) => {
    const rate = checkRateLimit(`dashboard-login:${clientIp(c)}`, { limit: 10, windowMs: 15 * 60_000 })
    if (!rate.ok) {
      c.header('Retry-After', String(rate.retryAfterSec))
      return c.json({ ok: false, error: 'Too many requests' }, 429)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const email = typeof record.email === 'string' ? normalizeEmail(record.email) : ''
    const password = typeof record.password === 'string' ? record.password : ''
    if (!isValidEmail(email) || !password) {
      return c.json({ ok: false, error: 'Email and password are required' }, 400)
    }

    const user = await store.getUserByEmail(email)
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ ok: false, error: 'Invalid email or password' }, 401)
    }

    const sessionId = newSessionId()
    await store.createSession({
      id: sessionId,
      userId: user.id,
      expiresAt: sessionExpiry().toISOString(),
    })
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: secureCookies,
      path: '/dashboard',
      maxAge: 14 * 24 * 60 * 60,
    })
    return c.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } })
  })

  app.post('/api/logout', async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE)
    if (sessionId) await store.deleteSession(sessionId)
    deleteCookie(c, SESSION_COOKIE, { path: '/dashboard' })
    return c.json({ ok: true })
  })

  app.get('/api/overview', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)

    let range
    try {
      range = resolveRange(c.req.query('period'), c.req.query('start'), c.req.query('end'), c.req.query('asOf'))
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : 'Invalid date range' }, 400)
    }
    const [orders, traffic, keywords, productViews, abandoned] = await Promise.all([
      store.listOrders(),
      store.listTraffic(),
      store.listKeywords(),
      store.listProductViews(),
      store.getAbandoned(range.start, range.end),
    ])
    return c.json({
      ok: true,
      data: buildOverview({ range, orders, traffic, keywords, abandoned, productViews }),
    })
  })

  app.get('/api/pnl', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)

    const year = Number(c.req.query('year') ?? new Date().getUTCFullYear())
    const month = c.req.query('month') || null
    const [orders, expenses, cashForecast] = await Promise.all([
      store.listOrders(),
      store.listExpenses(),
      store.listCashForecast(),
    ])
    return c.json({
      ok: true,
      data: buildPnL({ year, month, orders, expenses, cashForecast }),
    })
  })

  app.get('/api/roas', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    let range
    try {
      range = resolveRange(
        c.req.query('period') ?? '30d',
        c.req.query('start'),
        c.req.query('end'),
        c.req.query('asOf'),
      )
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : 'Invalid date range' }, 400)
    }
    const [orders, adSpend] = await Promise.all([store.listOrders(), store.listAdSpend()])
    return c.json({ ok: true, data: { range, platforms: buildRoas({ range, orders, adSpend }) } })
  })

  app.get('/api/sync-status', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    return c.json({ ok: true, data: await store.latestSyncs(), cutoverAt: deps.cutoverAt })
  })

  /** Wipe all analytics metrics (keeps login users). Then re-sync live sources as needed. */
  app.post('/api/reset-analytics', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    await store.clearAnalyticsData()
    return c.json({ ok: true, message: 'Cleared orders, traffic, ads, expenses, cash, sync history' })
  })

  app.get('/api/data-audit', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    return c.json({ ok: true, data: await buildDataAudit(store) })
  })

  /** Dev/demo helper — disabled unless ANALYTICS_ALLOW_DEMO_SEED=true */
  app.post('/api/seed-demo', async (c) => {
    if (process.env.ANALYTICS_ALLOW_DEMO_SEED !== 'true') {
      return c.json({ ok: false, error: 'Demo seed disabled' }, 403)
    }
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    await seedDemoStore(store)
    return c.json({ ok: true })
  })

  /** Pull live GA4 traffic / product pageviews / Google Ads cost into Postgres. */
  app.post('/api/sync-ga4', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const creds = loadGa4CredentialsFromEnv()
    if (!creds) {
      return c.json(
        {
          ok: false,
          error: 'GA4 not configured (need GOOGLE_SERVICE_ACCOUNT_JSON + GA4_PROPERTY_RESOURCE)',
        },
        503,
      )
    }
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
    const days = Math.max(
      1,
      Math.min(Number(body.days ?? c.req.query('days') ?? 90) || 90, 365),
    )
    try {
      const result = await syncGa4ToStore(store, creds, { days })
      return c.json({ ok: true, data: result })
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : 'GA4 sync failed' }, 502)
    }
  })

  app.get('/api/drive/files', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
    if (!sa) {
      return c.json({ ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, 503)
    }
    const folderId = (c.req.query('folderId') || process.env.SALES_TRACKER_DRIVE_FOLDER_ID || '').trim() || null
    const defaultFileId = (process.env.SALES_TRACKER_DRIVE_FILE_ID || '').trim() || null
    try {
      const files = await listDriveWorkbooks(sa, { folderId })
      return c.json({
        ok: true,
        data: {
          files,
          defaultFileId,
          folderId,
        },
      })
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Drive list failed' },
        502,
      )
    }
  })

  app.post('/api/sync/sales-tracker', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
    if (!sa) {
      return c.json({ ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, 503)
    }
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
    const rawId = String(body.fileId || body.fileUrl || process.env.SALES_TRACKER_DRIVE_FILE_ID || '').trim()
    const fileId = extractDriveFileId(rawId)
    if (!fileId) {
      return c.json({ ok: false, error: 'Provide a Drive file id or spreadsheet URL' }, 400)
    }
    const start = typeof body.start === 'string' && body.start ? body.start : null
    const end = typeof body.end === 'string' && body.end ? body.end : null
    if (start && end && end < start) {
      return c.json({ ok: false, error: 'End date must be on or after start date' }, 400)
    }
    try {
      const result = await syncSalesTrackerFromDrive(store, sa, fileId, {
        start,
        end,
        replaceAll: body.replaceAll === true,
        includeCash: body.includeCash !== false,
      })
      return c.json({ ok: true, data: result })
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Sales Tracker sync failed' },
        502,
      )
    }
  })

  app.post('/api/sync/shopify', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const creds = loadShopifyCredentialsFromEnv()
    if (!creds) {
      return c.json(
        {
          ok: false,
          error: 'Shopify not configured (need SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)',
        },
        503,
      )
    }
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
    const start = typeof body.start === 'string' && body.start ? body.start : null
    const end = typeof body.end === 'string' && body.end ? body.end : null
    if (start && end && end < start) {
      return c.json({ ok: false, error: 'End date must be on or after start date' }, 400)
    }
    try {
      const result = await syncShopifyToStore(store, creds, { start, end })
      return c.json({ ok: true, data: result })
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Shopify sync failed' },
        502,
      )
    }
  })

  app.get('/api/shopify/status', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const creds = loadShopifyCredentialsFromEnv()
    if (!creds) return c.json({ ok: true, data: { configured: false } })
    try {
      const shop = await pingShopifyShop(creds)
      return c.json({ ok: true, data: { configured: true, shop } })
    } catch (error) {
      return c.json({
        ok: true,
        data: {
          configured: true,
          error: error instanceof Error ? error.message : 'Shopify ping failed',
        },
      })
    }
  })

  app.post('/api/sync/sales-tracker/upload', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const body = await c.req.parseBody()
    const file = body.file
    if (!file || typeof file === 'string') {
      return c.json({ ok: false, error: 'Upload an .xlsx file as field "file"' }, 400)
    }
    const start = typeof body.start === 'string' && body.start ? body.start : null
    const end = typeof body.end === 'string' && body.end ? body.end : null
    if (start && end && end < start) {
      return c.json({ ok: false, error: 'End date must be on or after start date' }, 400)
    }
    try {
      const ab = await file.arrayBuffer()
      const result = await syncSalesTrackerFromBuffer(store, Buffer.from(ab), file.name || 'upload.xlsx', {
        start,
        end,
        replaceAll: body.replaceAll === 'true',
        includeCash: body.includeCash !== 'false',
      })
      return c.json({ ok: true, data: result })
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : 'Upload import failed' },
        502,
      )
    }
  })

  return app
}

async function currentUser(c: Context, store: AnalyticsStore) {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) return null
  const session = await store.getSession(sessionId)
  return session?.user ?? null
}

function parsePeriod(value: string | undefined): PeriodKey {
  if (value === '7d' || value === '90d' || value === 'year') return value
  return '30d'
}

function resolveRange(
  period: string | undefined,
  start: string | undefined,
  end: string | undefined,
  asOf: string | undefined,
) {
  if (start && end) return rangeForCustom(start, end)
  return rangeForPeriod(parsePeriod(period), asOf ?? undefined)
}

async function file(c: Context, name: string, contentType: string) {
  try {
    const body = await readFile(join(UI_DIR, name))
    return c.body(body, 200, { 'Content-Type': contentType })
  } catch {
    return c.text('Not found', 404)
  }
}

export async function ensureBootstrapUsers(
  store: AnalyticsStore,
  users: Array<{ email: string; name: string; password: string }>,
): Promise<void> {
  for (const user of users) {
    const email = normalizeEmail(user.email)
    const existing = await store.getUserByEmail(email)
    if (existing) continue
    await store.upsertUser({
      id: randomUUID(),
      email,
      name: user.name,
      passwordHash: await hashPassword(user.password),
    })
  }
}
