import { describe, expect, it, vi } from 'vitest'
import { createApp, type AppDeps } from './app.js'
import { createMemoryContactStore } from './contact-store.js'

const SITE = 'https://sunday-rolls.github.io'

const validBody = {
  name: 'Pat Golfer',
  email: 'pat@example.com',
  subject: 'Headcover question',
  message: 'Do you ship to Canada?',
}

function setup(
  overrides: Partial<AppDeps['config']> = {},
  options: { withContactStore?: boolean } = {},
) {
  const sendContactEmail = vi.fn<AppDeps['sendContactEmail']>().mockResolvedValue(undefined)
  const contacts = options.withContactStore ? createMemoryContactStore() : undefined
  const app = createApp({
    config: {
      corsOrigins: [SITE],
      requireBrowserOrigin: true,
      contactApiKey: '',
      ...overrides,
    },
    sendContactEmail,
    contacts,
  })
  return { app, sendContactEmail, contacts }
}

function postContact(
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request('/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /contact', () => {
  it('emails the team with the trimmed submission', async () => {
    const { app, sendContactEmail } = setup()

    const response = await postContact(app, { ...validBody, name: '  Pat Golfer  ' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, emailed: true })
    expect(sendContactEmail).toHaveBeenCalledWith(validBody)
  })

  it('returns 502 when the mailer fails and there is no contact store', async () => {
    const { app, sendContactEmail } = setup()
    sendContactEmail.mockRejectedValueOnce(new Error('SMTP down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await postContact(app, validBody)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'Failed to send message' })
  })

  it('still accepts the message when email fails but Postgres store succeeds', async () => {
    const { app, sendContactEmail } = setup({}, { withContactStore: true })
    sendContactEmail.mockRejectedValueOnce(new Error('SMTP blocked on Hobby'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await postContact(app, validBody)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, emailed: false })
  })

  it.each([
    ['missing fields', { name: 'Pat' }, 'Name, email, subject, and message are required'],
    ['bad email', { ...validBody, email: 'not-an-email' }, 'Invalid email'],
    ['long message', { ...validBody, message: 'x'.repeat(5001) }, 'Message too long'],
    ['long subject', { ...validBody, subject: 'x'.repeat(201) }, 'Field too long'],
    ['non-object body', '"hello"', 'Expected JSON object'],
  ])('rejects %s without sending email', async (_label, body, error) => {
    const { app, sendContactEmail } = setup()

    const response = await postContact(app, body)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error })
    expect(sendContactEmail).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON', async () => {
    const { app } = setup()

    const response = await postContact(app, '{not json')

    expect(response.status).toBe(400)
  })

  it('rejects requests from origins outside the allowlist', async () => {
    const { app, sendContactEmail } = setup()

    const response = await postContact(app, validBody, { Origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(sendContactEmail).not.toHaveBeenCalled()
  })

  it('accepts an allowlisted referer when Origin is missing', async () => {
    const { app } = setup()

    const response = await app.request('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: `${SITE}/website/contact` },
      body: JSON.stringify(validBody),
    })

    expect(response.status).toBe(200)
  })

  it('requires the shared key when one is configured', async () => {
    const { app } = setup({ contactApiKey: 'secret' })

    expect((await postContact(app, validBody)).status).toBe(401)
    expect(
      (await postContact(app, validBody, { 'X-Contact-Key': 'secret' })).status,
    ).toBe(200)
  })

  it('rate limits after five messages per minute from one IP', async () => {
    const { app } = setup()
    const headers = { 'X-Forwarded-For': '203.0.113.7' }

    for (let i = 0; i < 5; i += 1) {
      expect((await postContact(app, validBody, headers)).status).toBe(200)
    }

    const limited = await postContact(app, validBody, headers)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
  })
})

describe('GET /health', () => {
  it('reports ok', async () => {
    const { app } = setup()

    const response = await app.request('/health')

    expect(await response.json()).toEqual({ ok: true })
  })
})
