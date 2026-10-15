import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
import { fetchProductReviews, submitProductReview } from '@/lib/reviews-api'
import {
  REVIEW_QUERY_PARAM,
  averageRating,
  formatReviewDate,
  mergeReviews,
  ratingHistogram,
  reviewsForProduct,
} from '@/lib/reviews'
import type { ShopifyProduct } from '@/lib/shopify'
import type { ProductReview } from '@/types/content'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

interface ProductReviewsProps {
  product: ShopifyProduct
}

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <div className={`flex gap-0.5 ${sizeClass}`} aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < Math.round(rating)

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

export function ProductReviews({ product }: ProductReviewsProps) {
  const content = usePageContent('product')
  const reviews = content.reviews
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [remoteReviews, setRemoteReviews] = useState<ProductReview[]>([])
  const [manualFormOpen, setManualFormOpen] = useState(false)
  const [author, setAuthor] = useState('')
  const [location, setLocation] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'submit-error'>('idle')
  const [submitting, setSubmitting] = useState(false)

  const formOpen = manualFormOpen || searchParams.get(REVIEW_QUERY_PARAM) === '1'

  const curatedForProduct = reviewsForProduct(reviews?.items ?? [], product.handle)
  const items = reviewsForProduct(mergeReviews(curatedForProduct, remoteReviews), product.handle)
  const avg = averageRating(items)
  const histogram = ratingHistogram(items)
  const maxBucket = Math.max(...histogram, 1)

  useEffect(() => {
    let cancelled = false

    fetchProductReviews(product.handle)
      .then((loaded) => {
        if (!cancelled) setRemoteReviews(loaded)
      })
      .catch(() => {
        // Curated reviews still render if the API is unreachable.
      })

    return () => {
      cancelled = true
    }
  }, [product.handle])

  useEffect(() => {
    if (!formOpen) return
    const form = formRef.current
    if (form && typeof form.scrollIntoView === 'function') {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [formOpen])

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

  function reviewCountLabel(count: number): string {
    if (count === 1) return reviews!.summary.countOne
    return reviews!.summary.countMany.replace('{count}', String(count))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!author.trim() || !text.trim() || rating < 1 || rating > 5) {
      setStatus('error')
      return
    }

    setSubmitting(true)
    setStatus('idle')

    try {
      const saved = await submitProductReview({
        author,
        rating,
        text,
        productHandle: product.handle,
        location,
      })
      setRemoteReviews((current) => mergeReviews(current, [saved]))
      setAuthor('')
      setLocation('')
      setRating(5)
      setText('')
      setStatus('success')
      setManualFormOpen(false)
      clearReviewQuery()
    } catch {
      setStatus('submit-error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="border-t border-sand py-12 md:py-16" aria-labelledby="product-reviews-heading">
      <Container className="max-w-3xl space-y-10">
        <div className="space-y-6">
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

          {items.length > 0 ? (
            <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="space-y-1">
                <p className="font-display text-4xl text-heritage-green tabular-nums">
                  {avg.toFixed(1)}
                </p>
                <StarRating rating={avg} size="lg" />
                <p className="font-body text-body-small text-leather">
                  {avg.toFixed(1)} {reviews.summary.outOf} · {reviewCountLabel(items.length)}
                </p>
              </div>

              <ul className="space-y-2" aria-label="Rating breakdown">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = histogram[stars - 1] ?? 0
                  const width = `${Math.round((count / maxBucket) * 100)}%`

                  return (
                    <li key={stars} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3">
                      <span className="font-body text-body-small text-leather">
                        {reviews.summary.histogramLabel.replace('{stars}', String(stars))}
                      </span>
                      <div className="h-2 overflow-hidden bg-sand/70">
                        <div
                          className="h-full bg-soft-gold transition-[width] duration-500"
                          style={{ width }}
                        />
                      </div>
                      <span className="text-right font-body text-body-small text-matte-black/70 tabular-nums">
                        {count}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>

        {status === 'success' ? (
          <p className="font-body text-body text-heritage-green" role="status">
            {reviews.form.success}
          </p>
        ) : null}

        {formOpen ? (
          <form
            ref={formRef}
            id={`${formId}-form`}
            className="scroll-mt-24 space-y-5 border-t border-b border-sand py-8"
            onSubmit={handleSubmit}
            aria-labelledby={`${formId}-title`}
          >
            <h3 id={`${formId}-title`} className="font-display text-xl text-heritage-green">
              {reviews.form.title}
            </h3>

            {/* Honeypot — hidden from people, filled by bots */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
              aria-hidden="true"
            />

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
                className="w-full border-0 border-b border-sand bg-transparent px-0 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none"
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
                className="w-full border-0 border-b border-sand bg-transparent px-0 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none"
                autoComplete="address-level2"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="font-body text-body-small text-leather">{reviews.form.ratingLabel}</legend>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label
                    key={value}
                    className={`cursor-pointer px-2 py-1 font-body text-xl ${
                      value <= rating ? 'text-soft-gold' : 'text-sand'
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
                    <span aria-hidden="true">★</span>
                    <span className="sr-only">{value} stars</span>
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
                className="w-full resize-y border border-sand bg-transparent px-3 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none"
              />
            </div>

            {status === 'error' ? (
              <p className="font-body text-body-small text-leather" role="alert">
                {reviews.form.error}
              </p>
            ) : null}

            {status === 'submit-error' ? (
              <p className="font-body text-body-small text-leather" role="alert">
                {reviews.form.submitError}
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
          <ul className="divide-y divide-sand">
            {items.map((review) => {
              const dateLabel = formatReviewDate(review.createdAt)

              return (
                <li
                  key={
                    review.id ??
                    `${review.author}-${review.rating}-${review.text.slice(0, 24) || review.listing?.slice(0, 24) || 'stars'}`
                  }
                  className="space-y-3 py-6 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating rating={review.rating} />
                    {dateLabel ? (
                      <time
                        dateTime={review.createdAt}
                        className="font-body text-body-small text-leather"
                      >
                        {dateLabel}
                      </time>
                    ) : null}
                  </div>
                  {review.text ? (
                    <p className="font-body text-body text-matte-black/85">{review.text}</p>
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
              )
            })}
          </ul>
        )}
      </Container>
    </section>
  )
}
