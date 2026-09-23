import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { loadConfig } from './env.js'
import { createMailer } from './mail.js'
import { checkRateLimit } from './rate-limit.js'

const config = loadConfig()
const { sendContactEmail } = createMailer(config)

const app = new Hono()

const allowlist = new Set(config.corsOrigins)

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return allowlist.has(origin)
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

app.post('/contact', async (c) => {
  const origin = c.req.header('origin')
  const referer = c.req.header('referer')

  if (config.requireBrowserOrigin) {
    const refererOrigin = referer ? safeOrigin(referer) : undefined
    if (!isAllowedOrigin(origin) && !isAllowedOrigin(refererOrigin)) {
      return c.json({ ok: false, error: 'Forbidden origin' }, 403)
    }
  }

  if (config.contactApiKey) {
    const key = c.req.header('x-contact-key')
    if (key !== config.contactApiKey) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }
  }

  const clientIp =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'

  const rate = checkRateLimit(`contact:${clientIp}`)
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

  try {
    await sendContactEmail(parsed.value)
  } catch (error) {
    console.error('Failed to send contact email', error)
    return c.json({ ok: false, error: 'Failed to send message' }, 502)
  }

  return c.json({ ok: true })
})

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

function parseContactBody(
  body: unknown,
):
  | { ok: true; value: { name: string; email: string; subject: string; message: string } }
  | { ok: false; error: string } {
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

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Contact API listening on :${info.port}`)
  console.log(`CORS allowlist: ${[...allowlist].join(', ') || '(empty)'}`)
})
