import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NewReview } from './reviews.js'

type SeedItem = {
  author: string
  rating: number
  text: string
  listing?: string
  productHandle?: string
  location?: string
  source?: string
}

type SeedFile = {
  scrapedAt?: string
  items?: SeedItem[]
}

/** Map an Etsy listing title to a Shopify handle (mirrors storefront inference). */
export function inferProductHandleFromListing(listing?: string): string | undefined {
  if (!listing) return undefined

  const text = listing.toLowerCase()

  if (text.includes('birdie machine')) return 'the-birdie-machine'
  if (text.includes('sunday strip')) return 'sunday-stripes'
  if (text.includes('corduroy')) {
    return text.includes('heel') || text.includes('mallet putter')
      ? 'mallet-the-corduroy'
      : 'the-corduroy'
  }
  if (text.includes('breakfast')) return 'the-breakfast-roller'
  if (text.includes('sunny side') || text.includes('sunny-side')) return 'sunny-side-up'
  if (text.includes('coin collector')) return 'coin-collector'
  if (text.includes('doodle')) return 'the-doodle'
  if (text.includes('flagstick')) return 'flagstick-fuel'

  const isMallet =
    text.includes('heel shaft') || (text.includes('mallet') && !text.includes('center'))

  if (text.includes('yellow') && !text.includes('purple') && !text.includes('grey') && !text.includes('gray')) {
    return isMallet ? 'mallet-retro-roller-white' : 'retro-roller-yellow'
  }

  if (text.includes('purple') && !text.includes('yellow') && !text.includes('grey') && !text.includes('gray')) {
    return 'retro-roller-purple'
  }

  if (
    (text.includes('grey') || text.includes('gray')) &&
    !text.includes('purple') &&
    !text.includes('yellow')
  ) {
    return isMallet ? 'mallet-retro-roller-grey' : 'retro-roller-grey'
  }

  if (text.includes('white') && isMallet) return 'mallet-retro-roller-white'
  if (text.includes('purple') || text.includes('yellow')) return undefined
  if (isMallet) return 'mallet-retro-roller-grey'
  if (
    text.includes('center') ||
    text.includes('retro gaming') ||
    text.includes('gameboy') ||
    text.includes('game boy')
  ) {
    return 'retro-roller-grey'
  }

  return undefined
}

/** Deterministic UUID so re-seeding is idempotent (ON CONFLICT DO NOTHING). */
export function seedReviewId(parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('\0')).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export type SeedReviewRow = NewReview & {
  id: string
  createdAt: string
}

export function loadProductReviewsSeed(
  seedPath = join(dirname(fileURLToPath(import.meta.url)), 'data', 'product-reviews-seed.json'),
): SeedReviewRow[] {
  const raw = readFileSync(seedPath, 'utf8')
  const data = JSON.parse(raw) as SeedFile
  const scrapedAt = data.scrapedAt && !Number.isNaN(Date.parse(data.scrapedAt))
    ? new Date(data.scrapedAt).toISOString()
    : new Date().toISOString()

  const rows: SeedReviewRow[] = []
  for (const item of data.items ?? []) {
    if (!item?.author || typeof item.rating !== 'number' || typeof item.text !== 'string') continue
    if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5) continue

    const listing = item.listing?.trim() || null
    const productHandle =
      item.productHandle?.trim() || inferProductHandleFromListing(listing ?? undefined) || null
    const location = item.location?.trim() || null
    const source = item.source?.trim() || 'etsy'
    const id = seedReviewId([
      productHandle ?? '',
      item.author,
      String(item.rating),
      item.text,
      listing ?? '',
    ])

    rows.push({
      id,
      productHandle,
      author: item.author.trim(),
      rating: item.rating,
      text: item.text,
      location,
      listing,
      source,
      createdAt: scrapedAt,
    })
  }

  return rows
}
