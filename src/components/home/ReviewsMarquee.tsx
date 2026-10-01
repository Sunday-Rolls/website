import { usePageContent } from '@/lib/content'

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={index < rating ? 'text-soft-gold' : 'text-cream/30'}
        >
          ★
        </span>
      ))}
    </div>
  )
}

/** Longer reviews get wider cards so every card shows its full text at a similar height. */
function cardWidthRem(text: string) {
  if (text.length > 450) return 40
  if (text.length > 320) return 34
  if (text.length > 220) return 28
  return 22
}

export function ReviewsMarquee() {
  const { reviews } = usePageContent('home')
  const writtenReviews = reviews.items.filter((review) => review.text.trim().length > 0)
  const loopItems = [...writtenReviews, ...writtenReviews]

  if (writtenReviews.length === 0) return null

  return (
    <section className="overflow-hidden bg-heritage-green py-section-y text-cream" aria-labelledby="home-reviews-heading">
      <div className="mx-auto mb-10 w-full max-w-container px-container-x">
        <h2 id="home-reviews-heading" className="font-display text-section-title text-white">
          {reviews.title}
        </h2>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-heritage-green to-transparent md:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-heritage-green to-transparent md:w-24" />

        <div className="home-marquee flex w-max items-start gap-5 md:items-stretch">
          {loopItems.map((review, index) => (
            <article
              key={`${review.author}-${index}`}
              className="flex shrink-0 flex-col border border-cream/15 bg-forest-green/50 p-5 backdrop-blur-sm"
              style={{ width: `min(85vw, ${cardWidthRem(review.text)}rem)` }}
            >
              <StarRating rating={review.rating} />
              <p className="mt-3 font-body text-body text-cream/90">
                “{review.text}”
              </p>
              <div className="mt-auto space-y-0.5 pt-3">
                <p className="font-body text-body-small font-semibold text-white">{review.author}</p>
                {review.location ? (
                  <p className="font-body text-body-small text-soft-gold/90">{review.location}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
