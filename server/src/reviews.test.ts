import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import {
  createMemoryReviewStore,
  createPgReviewStore,
  parseReviewBody,
  type ReviewStore,
} from './reviews.js'

const SITE = 'https://sunday-rolls.github.io'

const validReview = {
  productHandle: 'retro-roller-grey',
  author: 'Pat Golfer',
  rating: 5,
  text: 'Fits my putter perfectly.',
  location: 'Minneapolis, MN',
}

function setup(reviews: ReviewStore | undefined = createMemoryReviewStore()) {
  const app = createApp({
    config: { corsOrigins: [SITE], requireBrowserOrigin: true, contactApiKey: '' },
    sendContactEmail: vi.fn().mockResolvedValue(undefined),
    reviews,
  })
  return { app, reviews }
}

function postReview(
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request('/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, ...headers },
    body: JSON.stringify(body),
  })
}

async function listReviews(app: ReturnType<typeof createApp>, handle: string) {
  const response = await app.request(`/reviews?handle=${encodeURIComponent(handle)}`, {
    headers: { Origin: SITE },
  })
  return { response, data: (await response.json()) as { ok: boolean; reviews?: unknown[] } }
}

describe('POST /reviews', () => {
  it('saves a review and returns it', async () => {
    const { app } = setup()

    const response = await postReview(app, validReview)

    expect(response.status).toBe(201)
    const data = (await response.json()) as { ok: boolean; review: Record<string, unknown> }
    expect(data.ok).toBe(true)
    expect(data.review).toMatchObject(validReview)
    expect(data.review.id).toEqual(expect.any(String))
    expect(data.review.createdAt).toEqual(expect.any(String))
  })

  it('strips HTML from text fields', async () => {
    const { app } = setup()

    const response = await postReview(app, {
      ...validReview,
      author: '<b>Pat</b>',
      text: 'Great <script>alert(1)</script>cover',
    })

    const data = (await response.json()) as { review: { author: string; text: string } }
    expect(data.review.author).toBe('Pat')
    expect(data.review.text).toBe('Great alert(1)cover')
  })

  it('accepts honeypot submissions without saving them', async () => {
    const { app } = setup()

    const response = await postReview(app, { ...validReview, website: 'https://spam.example' })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
    expect((await listReviews(app, validReview.productHandle)).data.reviews).toEqual([])
  })

  it.each([
    ['missing name', { ...validReview, author: '   ' }, 'Name and review are required'],
    ['missing text', { ...validReview, text: '' }, 'Name and review are required'],
    ['rating of 0', { ...validReview, rating: 0 }, 'Rating must be a whole number from 1 to 5'],
    ['rating of 6', { ...validReview, rating: 6 }, 'Rating must be a whole number from 1 to 5'],
    ['fractional rating', { ...validReview, rating: 4.5 }, 'Rating must be a whole number from 1 to 5'],
    ['rating as text', { ...validReview, rating: '5' }, 'Rating must be a whole number from 1 to 5'],
    ['bad handle', { ...validReview, productHandle: "x'; DROP TABLE" }, 'Unknown product'],
    ['long name', { ...validReview, author: 'x'.repeat(81) }, 'Field too long'],
    ['long review', { ...validReview, text: 'x'.repeat(2001) }, 'Review too long'],
  ])('rejects %s', async (_label, body, error) => {
    const { app } = setup()

    const response = await postReview(app, body)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error })
  })

  it('rejects origins outside the allowlist', async () => {
    const { app } = setup()

    const response = await postReview(app, validReview, { Origin: 'https://evil.example' })

    expect(response.status).toBe(403)
  })

  it('limits each IP to three reviews per ten minutes', async () => {
    const { app } = setup()
    const headers = { 'X-Forwarded-For': '198.51.100.4' }

    for (let i = 0; i < 3; i += 1) {
      expect((await postReview(app, validReview, headers)).status).toBe(201)
    }
    expect((await postReview(app, validReview, headers)).status).toBe(429)
  })

  it('answers 503 when no database is configured', async () => {
    const noStore = createApp({
      config: { corsOrigins: [SITE], requireBrowserOrigin: true, contactApiKey: '' },
      sendContactEmail: vi.fn(),
    })

    expect((await postReview(noStore, validReview)).status).toBe(503)
    expect((await listReviews(noStore, validReview.productHandle)).response.status).toBe(503)
  })
})

describe('GET /reviews', () => {
  it('returns only the requested product, newest first', async () => {
    const { app } = setup()
    await postReview(app, { ...validReview, text: 'First' })
    await postReview(app, { ...validReview, productHandle: 'the-birdie-machine', text: 'Other' })
    await postReview(app, { ...validReview, text: 'Second' }, { 'X-Forwarded-For': '10.0.0.2' })

    const { response, data } = await listReviews(app, validReview.productHandle)

    expect(response.status).toBe(200)
    expect(data.reviews?.map((review) => (review as { text: string }).text)).toEqual([
      'Second',
      'First',
    ])
  })

  it('rejects a malformed handle', async () => {
    const { app } = setup()

    expect((await listReviews(app, '../etc/passwd')).response.status).toBe(400)
  })

  it('lists every review when no handle is provided', async () => {
    const { app } = setup()
    await postReview(app, { ...validReview, text: 'Grey' })
    await postReview(app, {
      ...validReview,
      productHandle: 'the-birdie-machine',
      text: 'Birdie',
    }, { 'X-Forwarded-For': '10.0.0.3' })

    const response = await app.request('/reviews', { headers: { Origin: SITE } })
    const data = (await response.json()) as { ok: boolean; reviews: { text: string }[] }

    expect(response.status).toBe(200)
    expect(data.reviews.map((review) => review.text)).toEqual(['Birdie', 'Grey'])
  })

  it('returns 502 when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = setup({
      listByHandle: vi.fn().mockRejectedValue(new Error('db down')),
      listAll: vi.fn().mockRejectedValue(new Error('db down')),
      create: vi.fn(),
      deleteById: vi.fn(),
    })

    expect((await listReviews(app, validReview.productHandle)).response.status).toBe(502)
  })
})

describe('parseReviewBody', () => {
  it('treats a blank location as missing', () => {
    const parsed = parseReviewBody({ ...validReview, location: '   ' })

    expect(parsed).toMatchObject({ ok: true, spam: false, value: { location: null } })
  })
})

describe('createPgReviewStore', () => {
  it('passes every user value as a query parameter', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'abc',
          product_handle: validReview.productHandle,
          author: validReview.author,
          rating: 5,
          body: validReview.text,
          location: null,
          listing: null,
          source: null,
          created_at: new Date('2026-10-08T12:00:00Z'),
        },
      ],
    })
    const store = createPgReviewStore({ query })

    const saved = await store.create({ ...validReview, location: null })
    await store.listByHandle(validReview.productHandle, 100)

    const [insertSql, insertParams] = query.mock.calls[0]
    expect(insertSql).not.toContain(validReview.author)
    expect(insertParams).toEqual([
      expect.any(String),
      validReview.productHandle,
      validReview.author,
      5,
      validReview.text,
      null,
      null,
      'site',
    ])
    const [selectSql, selectParams] = query.mock.calls[1]
    expect(selectSql).not.toContain(validReview.productHandle)
    expect(selectParams).toEqual([validReview.productHandle, 100])
    expect(saved).toEqual({
      id: 'abc',
      productHandle: validReview.productHandle,
      author: validReview.author,
      rating: 5,
      text: validReview.text,
      location: null,
      listing: null,
      source: null,
      createdAt: '2026-10-08T12:00:00.000Z',
    })
  })
})
