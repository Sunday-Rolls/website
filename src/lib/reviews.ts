import type { ProductReview } from '@/types/content'

export const REVIEW_QUERY_PARAM = 'review'
export const LOCAL_REVIEWS_STORAGE_KEY = 'sunday-rolls.product-reviews'

/** Map an Etsy listing title to a Shopify product handle when confident. */
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
    text.includes('heel shaft') ||
    (text.includes('mallet') && !text.includes('center'))

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

  // Multi-color listings ("Grey, Purple, Yellow") stay unscoped.
  if (text.includes('purple') || text.includes('yellow')) return undefined

  if (isMallet) return 'mallet-retro-roller-grey'

  // Generic center-shaft Retro Roller listings map to the grey SKU (most common).
  if (text.includes('center') || text.includes('retro gaming') || text.includes('gameboy') || text.includes('game boy')) {
    return 'retro-roller-grey'
  }

  return undefined
}

export function withInferredProductHandle(review: ProductReview): ProductReview {
  if (review.productHandle) return review
  const productHandle = inferProductHandleFromListing(review.listing)
  return productHandle ? { ...review, productHandle } : review
}

export function isReviewForProduct(review: ProductReview, handle: string): boolean {
  return review.productHandle === handle
}

/** Product-specific reviews first; relative order within each group preserved. */
export function sortReviewsForProduct(
  reviews: ProductReview[],
  handle: string,
): ProductReview[] {
  const matching: ProductReview[] = []
  const others: ProductReview[] = []

  for (const review of reviews) {
    if (isReviewForProduct(review, handle)) matching.push(review)
    else others.push(review)
  }

  return [...matching, ...others]
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readLocalReviews(): ProductReview[] {
  if (!canUseLocalStorage()) return []

  try {
    const raw = window.localStorage.getItem(LOCAL_REVIEWS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidReview)
  } catch {
    return []
  }
}

function isValidReview(value: unknown): value is ProductReview {
  if (!value || typeof value !== 'object') return false
  const review = value as ProductReview
  return (
    typeof review.author === 'string' &&
    typeof review.rating === 'number' &&
    review.rating >= 1 &&
    review.rating <= 5 &&
    typeof review.text === 'string'
  )
}

export function saveLocalReview(review: ProductReview): ProductReview[] {
  const next = [review, ...readLocalReviews()]
  if (canUseLocalStorage()) {
    window.localStorage.setItem(LOCAL_REVIEWS_STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

export function mergeReviews(
  curated: ProductReview[],
  local: ProductReview[] = readLocalReviews(),
): ProductReview[] {
  const seen = new Set<string>()
  const merged: ProductReview[] = []

  for (const review of [...local, ...curated]) {
    const key = reviewKey(review)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(withInferredProductHandle(review))
  }

  return merged
}

export function reviewKey(review: ProductReview): string {
  if (review.id) return review.id
  return [
    review.productHandle ?? '',
    review.author,
    review.rating,
    review.text.slice(0, 48),
    review.listing ?? '',
  ].join('|')
}

export function createSiteReview(input: {
  author: string
  rating: number
  text: string
  productHandle: string
  location?: string
}): ProductReview {
  return {
    id: `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author: input.author.trim(),
    rating: input.rating,
    text: input.text.trim(),
    productHandle: input.productHandle,
    location: input.location?.trim() || undefined,
    source: 'site',
    createdAt: new Date().toISOString(),
  }
}

export function productReviewUrl(siteOrigin: string, handle: string, basePath = '/'): string {
  const origin = siteOrigin.replace(/\/$/, '')
  const base = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  if (base && (origin.endsWith(base) || origin.endsWith(`${base}/`))) {
    return `${origin}/products/${encodeURIComponent(handle)}?${REVIEW_QUERY_PARAM}=1`
  }
  return `${origin}${base}/products/${encodeURIComponent(handle)}?${REVIEW_QUERY_PARAM}=1`
}
