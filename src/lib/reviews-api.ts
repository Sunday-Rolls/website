import type { ProductReview } from '@/types/content'

type ApiReview = {
  id: string
  productHandle: string | null
  author: string
  rating: number
  text: string
  location: string | null
  listing?: string | null
  source?: string | null
  createdAt: string
}

const DEFAULT_API_URL = 'https://contact-api-production-9af6.up.railway.app'

function reviewsBaseUrl(): string | null {
  const configured = import.meta.env.VITE_CONTACT_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.PROD) return DEFAULT_API_URL
  return null
}

function toProductReview(review: ApiReview): ProductReview {
  const source =
    review.source === 'etsy' || review.source === 'site' ? review.source : undefined

  return {
    id: review.id,
    productHandle: review.productHandle ?? undefined,
    author: review.author,
    rating: review.rating,
    text: review.text,
    location: review.location ?? undefined,
    listing: review.listing ?? undefined,
    source,
    createdAt: review.createdAt,
  }
}

async function parseReviewsResponse(response: Response): Promise<ProductReview[]> {
  type ListResponse = { ok?: boolean; reviews?: ApiReview[]; error?: string }
  let data: ListResponse | null = null
  try {
    data = (await response.json()) as ListResponse
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok || !Array.isArray(data.reviews)) {
    throw new Error(data?.error || 'Failed to load reviews')
  }

  return data.reviews.map(toProductReview)
}

/** Live reviews for one product. Throws when the API is unreachable or unconfigured. */
export async function fetchProductReviews(handle: string): Promise<ProductReview[]> {
  const baseUrl = reviewsBaseUrl()
  if (!baseUrl) {
    throw new Error('Reviews API is not configured')
  }

  const response = await fetch(
    `${baseUrl}/reviews?handle=${encodeURIComponent(handle)}`,
    { headers: { Accept: 'application/json' } },
  )

  return parseReviewsResponse(response)
}

/** All live reviews (marquee + similar-product sections). */
export async function fetchAllReviews(): Promise<ProductReview[]> {
  const baseUrl = reviewsBaseUrl()
  if (!baseUrl) {
    throw new Error('Reviews API is not configured')
  }

  const response = await fetch(`${baseUrl}/reviews`, {
    headers: { Accept: 'application/json' },
  })

  return parseReviewsResponse(response)
}

export async function submitProductReview(input: {
  productHandle: string
  author: string
  rating: number
  text: string
  location?: string
}): Promise<ProductReview> {
  const baseUrl = reviewsBaseUrl()
  if (!baseUrl) {
    throw new Error('Reviews are not configured')
  }

  const response = await fetch(`${baseUrl}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      productHandle: input.productHandle,
      author: input.author,
      rating: input.rating,
      text: input.text,
      location: input.location || undefined,
      // Honeypot — must stay empty for real users.
      website: '',
    }),
  })

  type SubmitResponse = { ok?: boolean; review?: ApiReview; error?: string }
  let data: SubmitResponse | null = null
  try {
    data = (await response.json()) as SubmitResponse
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok || !data.review) {
    throw new Error(data?.error || 'Failed to save review')
  }

  return toProductReview(data.review)
}
