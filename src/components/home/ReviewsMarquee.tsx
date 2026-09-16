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

        <div className="home-marquee flex w-max gap-5">
          {loopItems.map((review, index) => (
            <article
              key={`${review.author}-${index}`}
              className="w-[min(85vw,22rem)] shrink-0 border border-cream/15 bg-forest-green/50 p-6 backdrop-blur-sm"
            >
              <StarRating rating={review.rating} />
              <p className="mt-4 font-body text-body text-cream/90">“{review.text}”</p>
              <div className="mt-5 space-y-0.5">
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
