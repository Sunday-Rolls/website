import type { ProductReview } from '@/types/content'

type ApiReview = {
  id: string
  productHandle: string
  author: string
  rating: number
  text: string
  location: string | null
  createdAt: string
}

function reviewsBaseUrl(): string | null {
  const baseUrl = import.meta.env.VITE_CONTACT_API_URL?.replace(/\/$/, '')
  return baseUrl || null
}

function toProductReview(review: ApiReview): ProductReview {
  return {
    id: review.id,
    productHandle: review.productHandle,
    author: review.author,
    rating: review.rating,
    text: review.text,
    location: review.location ?? undefined,
    source: 'site',
    createdAt: review.createdAt,
  }
}

export async function fetchProductReviews(handle: string): Promise<ProductReview[]> {
  const baseUrl = reviewsBaseUrl()
  if (!baseUrl) return []

  const response = await fetch(
    `${baseUrl}/reviews?handle=${encodeURIComponent(handle)}`,
    { headers: { Accept: 'application/json' } },
  )

  let data: { ok?: boolean; reviews?: ApiReview[]; error?: string } | null = null
  try {
    data = (await response.json()) as typeof data
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok || !Array.isArray(data.reviews)) {
    throw new Error(data?.error || 'Failed to load reviews')
  }

  return data.reviews.map(toProductReview)
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

  let data: { ok?: boolean; review?: ApiReview; error?: string } | null = null
  try {
    data = (await response.json()) as typeof data
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok || !data.review) {
    throw new Error(data?.error || 'Failed to save review')
  }

  return toProductReview(data.review)
}
