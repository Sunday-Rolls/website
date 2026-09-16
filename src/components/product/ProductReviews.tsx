import { usePageContent } from '@/lib/content'
import type { ShopifyProduct } from '@/lib/shopify'
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

export function ProductReviews({ product }: ProductReviewsProps) {
  const content = usePageContent('product')
  const reviews = content.reviews

  if (!reviews || product.category !== 'headcovers') return null

  return (
    <section className="border-t border-sand py-12 md:py-16" aria-labelledby="product-reviews-heading">
      <Container className="space-y-8">
        <div className="space-y-2">
          <h2
            id="product-reviews-heading"
            className="font-display text-section-title text-heritage-green"
          >
            {reviews.heading}
          </h2>
          <p className="font-body text-body-small text-leather">{product.title}</p>
        </div>

        {reviews.items.length === 0 ? (
          <p className="font-body text-body text-matte-black/70">{reviews.empty}</p>
        ) : (
          <ul className="grid gap-6 md:grid-cols-3">
            {reviews.items.map((review) => (
              <li
                key={`${review.author}-${review.rating}-${review.text.slice(0, 24) || review.listing?.slice(0, 24) || 'stars'}`}
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
