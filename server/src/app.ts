import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import type { AnalyticsStore } from './analytics/store.js'
import { createDashboardRoutes } from './dashboard/routes.js'
import type { Config } from './env.js'
import type { ContactStore } from './contact-store.js'
import type { ContactPayload } from './mail.js'
import { createRateLimiter } from './rate-limit.js'
import { isValidHandle, parseReviewBody, REVIEW_LIMITS, type ReviewStore } from './reviews.js'

export type AppDeps = {
  config: Pick<Config, 'corsOrigins' | 'requireBrowserOrigin' | 'contactApiKey'> & {
    dashboardSecureCookies?: boolean
    websiteCutoverAt?: string | null
  }
  sendContactEmail: (payload: ContactPayload) => Promise<void>
  /** Persists contact form submissions (Postgres). Preferred path on Railway Hobby. */
  contacts?: ContactStore
  /** Omitted when DATABASE_URL is not set; review routes then answer 503. */
  reviews?: ReviewStore
  analytics?: AnalyticsStore
}

export function createApp({ config, sendContactEmail, contacts, reviews, analytics }: AppDeps) {
  const app = new Hono()
  const checkRateLimit = createRateLimiter()
  const allowlist = new Set(config.corsOrigins)

  function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return false
    return allowlist.has(origin)
  }

  function hasAllowedBrowserOrigin(c: Context): boolean {
    if (!config.requireBrowserOrigin) return true
    const referer = c.req.header('referer')
    const refererOrigin = referer ? safeOrigin(referer) : undefined
    return isAllowedOrigin(c.req.header('origin')) || isAllowedOrigin(refererOrigin)
  }

  app.use(
    '*',
    cors({
      origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Contact-Key'],
      maxAge: 86400,
    }),
  )

  app.get('/health', (c) => c.json({ ok: true }))

  if (analytics) {
    app.route(
      '/dashboard',
      createDashboardRoutes({
        store: analytics,
        checkRateLimit,
        secureCookies: config.dashboardSecureCookies ?? false,
        cutoverAt: config.websiteCutoverAt ?? null,
      }),
    )
    app.get('/dashboard/', (c) => c.redirect('/dashboard', 302))
  }

  app.post('/contact', async (c) => {
    if (!hasAllowedBrowserOrigin(c)) {
      return c.json({ ok: false, error: 'Forbidden origin' }, 403)
    }

    if (config.contactApiKey) {
      const key = c.req.header('x-contact-key')
      if (key !== config.contactApiKey) {
        return c.json({ ok: false, error: 'Unauthorized' }, 401)
      }
    }

    const rate = checkRateLimit(`contact:${clientIp(c)}`)
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

    const parsed = parseContactBody(body)
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }

    let emailDelivered = false
    try {
      await sendContactEmail(parsed.value)
      emailDelivered = true
    } catch (error) {
      console.error('Failed to send contact email', error)
    }

    if (contacts) {
      try {
        await contacts.create(parsed.value, emailDelivered)
        return c.json({ ok: true, emailed: emailDelivered })
      } catch (error) {
        console.error('Failed to store contact message', error)
        if (emailDelivered) return c.json({ ok: true, emailed: true })
        return c.json({ ok: false, error: 'Failed to send message' }, 502)
      }
    }

    if (emailDelivered) {
      return c.json({ ok: true, emailed: true })
    }

    return c.json({ ok: false, error: 'Failed to send message' }, 502)
  })

  app.get('/reviews', async (c) => {
    if (!reviews) {
      return c.json({ ok: false, error: 'Reviews are not available' }, 503)
    }

    const handle = c.req.query('handle')
    if (!isValidHandle(handle)) {
      return c.json({ ok: false, error: 'Unknown product' }, 400)
    }

    const rate = checkRateLimit(`reviews-read:${clientIp(c)}`, { limit: 120 })
    if (!rate.ok) {
      c.header('Retry-After', String(rate.retryAfterSec))
      return c.json({ ok: false, error: 'Too many requests' }, 429)
    }

    try {
      const items = await reviews.listByHandle(handle, REVIEW_LIMITS.list)
      return c.json({ ok: true, reviews: items })
    } catch (error) {
      console.error('Failed to list reviews', error)
      return c.json({ ok: false, error: 'Failed to load reviews' }, 502)
    }
  })

  app.post('/reviews', async (c) => {
    if (!reviews) {
      return c.json({ ok: false, error: 'Reviews are not available' }, 503)
    }

    if (!hasAllowedBrowserOrigin(c)) {
      return c.json({ ok: false, error: 'Forbidden origin' }, 403)
    }

    const rate = checkRateLimit(`reviews-write:${clientIp(c)}`, {
      limit: 3,
      windowMs: 10 * 60_000,
    })
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

    const parsed = parseReviewBody(body)
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, 400)
    }

    if (parsed.spam) {
      return c.json({ ok: true }, 201)
    }

    try {
      const review = await reviews.create(parsed.value)
      return c.json({ ok: true, review }, 201)
    } catch (error) {
      console.error('Failed to save review', error)
      return c.json({ ok: false, error: 'Failed to save review' }, 502)
    }
  })

  return app
}

export function clientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  )
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

export function parseContactBody(
  body: unknown,
): { ok: true; value: ContactPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Expected JSON object' }
  }

  const record = body as Record<string, unknown>
  const name = asTrimmedString(record.name)
  const email = asTrimmedString(record.email)
  const subject = asTrimmedString(record.subject)
  const message = asTrimmedString(record.message)

  if (!name || !email || !subject || !message) {
    return { ok: false, error: 'Name, email, subject, and message are required' }
  }

  if (name.length > 200 || subject.length > 200 || email.length > 320) {
    return { ok: false, error: 'Field too long' }
  }

  if (message.length > 5000) {
    return { ok: false, error: 'Message too long' }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Invalid email' }
  }

  return { ok: true, value: { name, email, subject, message } }
}

export function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}
