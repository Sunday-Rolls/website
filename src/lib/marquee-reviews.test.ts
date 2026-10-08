import { describe, expect, it } from 'vitest'
import reviewsData from '@/data/reviews.json'
import { fitsMarqueeCard, marqueeQuoteLineCount, selectMarqueeReviews } from '@/lib/marquee-reviews'

describe('marquee reviews', () => {
  it('keeps a short quote and drops one that wraps past two lines', () => {
    expect(fitsMarqueeCard('awesome product and very well made')).toBe(true)
    expect(marqueeQuoteLineCount('awesome product and very well made')).toBeLessThanOrEqual(2)

    const longest = [...reviewsData.items].sort((a, b) => b.text.length - a.text.length)[0]
    expect(fitsMarqueeCard(longest.text)).toBe(false)
    expect(marqueeQuoteLineCount(longest.text)).toBeGreaterThan(2)
  })

  it('drops blank reviews', () => {
    expect(fitsMarqueeCard('   ')).toBe(false)
    expect(selectMarqueeReviews([{ text: '' }, { text: 'Looks great!' }])).toEqual([
      { text: 'Looks great!' },
    ])
  })
})