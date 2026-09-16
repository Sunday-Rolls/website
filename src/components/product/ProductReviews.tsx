import { useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
import {
  REVIEW_QUERY_PARAM,
  createSiteReview,
  mergeReviews,
  readLocalReviews,
  saveLocalReview,
  sortReviewsForProduct,
} from '@/lib/reviews'
import type { ShopifyProduct } from '@/lib/shopify'
import type { ProductReview } from '@/types/content'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

interface ProductReviewsProps {
  product: ShopifyProduct
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < rating

        return (
          <span
            key={index}
            aria-hidden="true"
            className={filled ? 'text-soft-gold' : 'text-sand'}
          >
            ★
          </span>
        )
      })}
    </div>
  )
}

async function postReviewWebhook(review: ProductReview): Promise<void> {
  const endpoint = import.meta.env.VITE_REVIEW_WEBHOOK_URL
  if (!endpoint) return

  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(review),
  })
}

export function ProductReviews({ product }: ProductReviewsProps) {
  const content = usePageContent('product')
  const reviews = content.reviews
  const formId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const [localReviews, setLocalReviews] = useState<ProductReview[]>(() => readLocalReviews())
  const [manualFormOpen, setManualFormOpen] = useState(false)
  const [author, setAuthor] = useState('')
  const [location, setLocation] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [submitting, setSubmitting] = useState(false)

  const formOpen = manualFormOpen || searchParams.get(REVIEW_QUERY_PARAM) === '1'

  const items = useMemo(() => {
    if (!reviews) return []
    return sortReviewsForProduct(mergeReviews(reviews.items, localReviews), product.handle)
  }, [localReviews, product.handle, reviews])

  if (!reviews || product.category !== 'headcovers') return null

  function clearReviewQuery() {
    if (!searchParams.get(REVIEW_QUERY_PARAM)) return
    const next = new URLSearchParams(searchParams)
    next.delete(REVIEW_QUERY_PARAM)
    setSearchParams(next, { replace: true })
  }

  function closeForm() {
    setManualFormOpen(false)
    setStatus('idle')
    clearReviewQuery()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!author.trim() || !text.trim() || rating < 1 || rating > 5) {
      setStatus('error')
      return
    }

    setSubmitting(true)
    const review = createSiteReview({
      author,
      rating,
      text,
      productHandle: product.handle,
      location,
    })

    try {
      await postReviewWebhook(review)
    } catch {
      // Still show locally even if the optional webhook fails.
    }

    setLocalReviews(saveLocalReview(review))
    setAuthor('')
    setLocation('')
    setRating(5)
    setText('')
    setStatus('success')
    setSubmitting(false)
    setManualFormOpen(false)
    clearReviewQuery()
  }

  return (
    <section className="border-t border-sand py-12 md:py-16" aria-labelledby="product-reviews-heading">
      <Container className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h2
              id="product-reviews-heading"
              className="font-display text-section-title text-heritage-green"
            >
              {reviews.heading}
            </h2>
            <p className="font-body text-body-small text-leather">{product.title}</p>
          </div>
          {!formOpen ? (
            <Button type="button" variant="secondary" onClick={() => setManualFormOpen(true)}>
              {reviews.leaveCta}
            </Button>
          ) : null}
        </div>

        {status === 'success' ? (
          <p className="font-body text-body text-heritage-green" role="status">
            {reviews.form.success}
          </p>
        ) : null}

        {formOpen ? (
          <form
            className="max-w-xl space-y-5 border border-sand bg-canvas-tan/30 p-6"
            onSubmit={handleSubmit}
            aria-labelledby={`${formId}-title`}
          >
            <h3 id={`${formId}-title`} className="font-display text-card-title text-heritage-green">
              {reviews.form.title}
            </h3>

            <div className="space-y-2">
              <label className="font-body text-body-small text-leather" htmlFor={`${formId}-name`}>
                {reviews.form.nameLabel}
              </label>
              <input
                id={`${formId}-name`}
                name="author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder={reviews.form.namePlaceholder}
                className="w-full border border-sand bg-white px-3 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none"
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-2">
              <label
                className="font-body text-body-small text-leather"
                htmlFor={`${formId}-location`}
              >
                {reviews.form.locationLabel}
              </label>
              <input
                id={`${formId}-location`}
                name="location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder={reviews.form.locationPlaceholder}
                className="w-full border border-sand bg-white px-3 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none"
                autoComplete="address-level2"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="font-body text-body-small text-leather">{reviews.form.ratingLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label
                    key={value}
                    className={`cursor-pointer border px-3 py-2 font-body text-body-small ${
                      rating === value
                        ? 'border-heritage-green bg-heritage-green text-white'
                        : 'border-sand bg-white text-matte-black'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rating"
                      value={value}
                      checked={rating === value}
                      onChange={() => setRating(value)}
                      className="sr-only"
                    />
                    {value} ★
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <label className="font-body text-body-small text-leather" htmlFor={`${formId}-text`}>
                {reviews.form.reviewLabel}
              </label>
              <textarea
                id={`${formId}-text`}
                name="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={reviews.form.reviewPlaceholder}
                rows={4}
                required
                className="w-full resize-y border border-sand bg-white px-3 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none"
              />
            </div>

            {status === 'error' ? (
              <p className="font-body text-body-small text-leather" role="alert">
                {reviews.form.error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={submitting}>
                {reviews.form.submitLabel}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                {reviews.form.cancelLabel}
              </Button>
            </div>
          </form>
        ) : null}

        {items.length === 0 ? (
          <p className="font-body text-body text-matte-black/70">{reviews.empty}</p>
        ) : (
          <ul className="grid gap-6 md:grid-cols-3">
            {items.map((review) => (
              <li
                key={review.id ?? `${review.author}-${review.rating}-${review.text.slice(0, 24) || review.listing?.slice(0, 24) || 'stars'}`}
                className="space-y-3 border-t border-sand pt-5"
              >
                <StarRating rating={review.rating} />
                {review.text ? (
                  <p className="font-body text-body text-matte-black/80">“{review.text}”</p>
                ) : null}
                <div className="space-y-0.5">
                  <p className="font-body text-body-small font-semibold text-heritage-green">
                    {review.author}
                  </p>
                  {review.location ? (
                    <p className="font-body text-body-small text-leather">{review.location}</p>
                  ) : review.listing ? (
                    <p className="font-body text-body-small text-leather">{review.listing}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  )
}
