import { describe, expect, it } from 'vitest'
import {
  averageRating,
  createSiteReview,
  inferProductHandleFromListing,
  mergeReviews,
  productReviewUrl,
  ratingHistogram,
  reviewsForProduct,
  sortReviewsForProduct,
  withInferredProductHandle,
} from '@/lib/reviews'
import type { ProductReview } from '@/types/content'

describe('inferProductHandleFromListing', () => {
  it('maps clear listing titles to handles', () => {
    expect(
      inferProductHandleFromListing(
        'Yellow Retro Gaming Golf Putter Cover | LAB DF3 Center Shaft Mallet Headcover',
      ),
    ).toBe('retro-roller-yellow')

    expect(
      inferProductHandleFromListing(
        'PRE-ORDER*** Sunday Strips Golf Putter Cover - Center Shaft L.A.B. Mallet Headcover, Magnetic Closure',
      ),
    ).toBe('sunday-stripes')

    expect(
      inferProductHandleFromListing(
        'Center-Shafted Mallet Golf Putter Headcover. L.A.B. Putter Headcover - DF3. Compatible w/ Spider ZT. Birdie Machine',
      ),
    ).toBe('the-birdie-machine')

    expect(
      inferProductHandleFromListing(
        'Mallet Putter Headcover. Heel Shaft - Golf Putter cover. Vintage Gameboy.',
      ),
    ).toBe('mallet-retro-roller-grey')
  })

  it('leaves multi-color listings unscoped', () => {
    expect(
      inferProductHandleFromListing(
        'Retro Gaming Golf Center shaft Putter Cover – L.A.B. Mallet Headcover, Magnetic Closure. Grey, Purple, Yellow',
      ),
    ).toBeUndefined()
  })
})

describe('sortReviewsForProduct', () => {
  it('puts matching productHandle reviews first', () => {
    const reviews: ProductReview[] = [
      { author: 'A', rating: 5, text: 'other', productHandle: 'sunday-stripes' },
      { author: 'B', rating: 5, text: 'match', productHandle: 'retro-roller-grey' },
      { author: 'C', rating: 4, text: 'also match', productHandle: 'retro-roller-grey' },
      { author: 'D', rating: 5, text: 'untagged' },
    ]

    expect(sortReviewsForProduct(reviews, 'retro-roller-grey').map((r) => r.author)).toEqual([
      'B',
      'C',
      'A',
      'D',
    ])
  })
})

describe('mergeReviews', () => {
  it('prefers local reviews and dedupes', () => {
    const curated: ProductReview[] = [
      withInferredProductHandle({
        author: 'Naveen',
        rating: 5,
        text: 'great',
        listing: 'Yellow Retro Gaming Golf Putter Cover',
        source: 'etsy',
      }),
    ]
    const local = [
      createSiteReview({
        author: 'Local',
        rating: 5,
        text: 'just bought it',
        productHandle: 'retro-roller-yellow',
      }),
    ]

    const merged = mergeReviews(curated, local)
    expect(merged[0]?.author).toBe('Local')
    expect(merged[1]?.productHandle).toBe('retro-roller-yellow')
  })
})

describe('productReviewUrl', () => {
  it('builds QR landing URLs with review query', () => {
    expect(productReviewUrl('https://sunday-rolls.github.io/website', 'retro-roller-grey', '/website')).toBe(
      'https://sunday-rolls.github.io/website/products/retro-roller-grey?review=1',
    )
    expect(productReviewUrl('https://www.sundayrollsgolf.com', 'the-doodle', '/')).toBe(
      'https://www.sundayrollsgolf.com/products/the-doodle?review=1',
    )
  })
})

describe('reviewsForProduct', () => {
  it('keeps only matching product reviews', () => {
    const reviews: ProductReview[] = [
      { author: 'A', rating: 5, text: 'other', productHandle: 'sunday-stripes' },
      { author: 'B', rating: 5, text: 'match', productHandle: 'retro-roller-grey' },
      { author: 'C', rating: 4, text: 'untagged' },
    ]

    expect(reviewsForProduct(reviews, 'retro-roller-grey').map((r) => r.author)).toEqual(['B'])
  })
})

describe('averageRating and ratingHistogram', () => {
  it('summarizes star ratings', () => {
    const reviews: ProductReview[] = [
      { author: 'A', rating: 5, text: 'a' },
      { author: 'B', rating: 4, text: 'b' },
      { author: 'C', rating: 5, text: 'c' },
    ]

    expect(averageRating(reviews)).toBe(4.7)
    expect(ratingHistogram(reviews)).toEqual([0, 0, 0, 1, 2])
  })
})
