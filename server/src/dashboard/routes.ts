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
import { buildOverview, buildPnL, buildRoas } from '../analytics/metrics.js'
import { rangeForPeriod } from '../analytics/period.js'
import { seedDemoStore } from '../analytics/seed.js'
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

    const period = parsePeriod(c.req.query('period'))
    const asOf = c.req.query('asOf') ?? undefined
    const range = rangeForPeriod(period, asOf)
    const [orders, traffic, keywords, abandoned] = await Promise.all([
      store.listOrders(),
      store.listTraffic(),
      store.listKeywords(),
      store.getAbandoned(range.start, range.end),
    ])
    return c.json({
      ok: true,
      data: buildOverview({ range, orders, traffic, keywords, abandoned }),
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
    const period = parsePeriod(c.req.query('period') ?? '30d')
    const range = rangeForPeriod(period, c.req.query('asOf') ?? undefined)
    const [orders, adSpend] = await Promise.all([store.listOrders(), store.listAdSpend()])
    return c.json({ ok: true, data: { range, platforms: buildRoas({ range, orders, adSpend }) } })
  })

  app.get('/api/sync-status', async (c) => {
    const user = await currentUser(c, store)
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    return c.json({ ok: true, data: await store.latestSyncs(), cutoverAt: deps.cutoverAt })
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

async function file(c: Context, name: string, contentType: string) {
  try {
    const body = await readFile(join(UI_DIR, name), 'utf8')
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
