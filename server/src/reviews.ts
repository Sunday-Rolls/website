import { randomUUID } from 'node:crypto'
import { loadProductReviewsSeed, type SeedReviewRow } from './review-seed.js'

export type Review = {
  id: string
  productHandle: string | null
  author: string
  rating: number
  text: string
  location: string | null
  listing: string | null
  source: string | null
  createdAt: string
}

export type NewReview = {
  productHandle: string | null
  author: string
  rating: number
  text: string
  location: string | null
  listing?: string | null
  source?: string | null
}

export interface ReviewStore {
  listByHandle(handle: string, limit: number): Promise<Review[]>
  listAll(limit: number): Promise<Review[]>
  create(review: NewReview): Promise<Review>
  deleteById(id: string): Promise<boolean>
}

export const REVIEW_LIMITS = {
  author: 80,
  location: 80,
  text: 2000,
  handle: 120,
  list: 100,
  listAll: 200,
} as const

/** Bots fill every input; people never see this one. */
export const REVIEW_HONEYPOT_FIELD = 'website'

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidHandle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= REVIEW_LIMITS.handle &&
    HANDLE_PATTERN.test(value)
  )
}

export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  return cleaned || null
}

export type ParsedReviewBody =
  | { ok: true; spam: false; value: NewReview }
  | { ok: true; spam: true }
  | { ok: false; error: string }

export function parseReviewBody(body: unknown): ParsedReviewBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Expected JSON object' }
  }

  const record = body as Record<string, unknown>

  const honeypot = record[REVIEW_HONEYPOT_FIELD]
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { ok: true, spam: true }
  }

  if (!isValidHandle(record.productHandle)) {
    return { ok: false, error: 'Unknown product' }
  }

  const author = cleanText(record.author)
  const text = cleanText(record.text)
  const location = cleanText(record.location)
  const rating = record.rating

  if (!author || !text) {
    return { ok: false, error: 'Name and review are required' }
  }

  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Rating must be a whole number from 1 to 5' }
  }

  if (author.length > REVIEW_LIMITS.author || (location?.length ?? 0) > REVIEW_LIMITS.location) {
    return { ok: false, error: 'Field too long' }
  }

  if (text.length > REVIEW_LIMITS.text) {
    return { ok: false, error: 'Review too long' }
  }

  return {
    ok: true,
    spam: false,
    value: {
      productHandle: record.productHandle,
      author,
      rating,
      text,
      location,
      listing: null,
      source: 'site',
    },
  }
}

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export const REVIEWS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS product_reviews (
  id uuid PRIMARY KEY,
  product_handle text,
  author text NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL,
  location text,
  listing text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS listing text;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE product_reviews ALTER COLUMN product_handle DROP NOT NULL;
CREATE INDEX IF NOT EXISTS product_reviews_handle_created_idx
  ON product_reviews (product_handle, created_at DESC);
CREATE INDEX IF NOT EXISTS product_reviews_created_idx
  ON product_reviews (created_at DESC);
`

function rowToReview(row: Record<string, unknown>): Review {
  const createdAt = row.created_at
  return {
    id: String(row.id),
    productHandle: row.product_handle == null ? null : String(row.product_handle),
    author: String(row.author),
    rating: Number(row.rating),
    text: String(row.body),
    location: row.location == null ? null : String(row.location),
    listing: row.listing == null ? null : String(row.listing),
    source: row.source == null ? null : String(row.source),
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
  }
}

const REVIEW_SELECT = `id, product_handle, author, rating, body, location, listing, source, created_at`

export function createPgReviewStore(db: Queryable): ReviewStore & {
  migrate(): Promise<void>
  seedCatalog(rows?: SeedReviewRow[]): Promise<number>
} {
  return {
    async migrate() {
      await db.query(REVIEWS_SCHEMA_SQL)
    },

    async seedCatalog(rows = loadProductReviewsSeed()) {
      let inserted = 0
      for (const row of rows) {
        const result = await db.query(
          `INSERT INTO product_reviews
             (id, product_handle, author, rating, body, location, listing, source, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            row.id,
            row.productHandle,
            row.author,
            row.rating,
            row.text,
            row.location,
            row.listing ?? null,
            row.source ?? 'etsy',
            row.createdAt,
          ],
        )
        if (result.rows.length > 0) inserted += 1
      }
      return inserted
    },

    async listByHandle(handle, limit) {
      const { rows } = await db.query(
        `SELECT ${REVIEW_SELECT}
         FROM product_reviews
         WHERE product_handle = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [handle, limit],
      )
      return rows.map(rowToReview)
    },

    async listAll(limit) {
      const { rows } = await db.query(
        `SELECT ${REVIEW_SELECT}
         FROM product_reviews
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      )
      return rows.map(rowToReview)
    },

    async create(review) {
      const { rows } = await db.query(
        `INSERT INTO product_reviews
           (id, product_handle, author, rating, body, location, listing, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${REVIEW_SELECT}`,
        [
          randomUUID(),
          review.productHandle,
          review.author,
          review.rating,
          review.text,
          review.location,
          review.listing ?? null,
          review.source ?? 'site',
        ],
      )
      return rowToReview(rows[0])
    },

    async deleteById(id) {
      const { rows } = await db.query(`DELETE FROM product_reviews WHERE id = $1 RETURNING id`, [id])
      return rows.length > 0
    },
  }
}

export function createMemoryReviewStore(initial: Review[] = []): ReviewStore {
  const reviews: Review[] = [...initial]

  return {
    async listByHandle(handle, limit) {
      return reviews.filter((review) => review.productHandle === handle).slice(0, limit)
    },

    async listAll(limit) {
      return reviews.slice(0, limit)
    },

    async create(review) {
      const saved: Review = {
        ...review,
        listing: review.listing ?? null,
        source: review.source ?? 'site',
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      }
      reviews.unshift(saved)
      return saved
    },

    async deleteById(id) {
      const index = reviews.findIndex((review) => review.id === id)
      if (index === -1) return false
      reviews.splice(index, 1)
      return true
    },
  }
}
