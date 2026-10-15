import { describe, expect, it } from 'vitest'
import {
  buildReviewQrPdf,
  listReviewQrProducts,
  parseReviewQrTarget,
  reviewQrLandingUrl,
} from './review-qr-pdf.js'

describe('review QR PDF helpers', () => {
  it('defaults unknown targets to GitHub Pages', () => {
    expect(parseReviewQrTarget(undefined)).toBe('pages')
    expect(parseReviewQrTarget('live')).toBe('live')
  })

  it('builds pages and live landing URLs', () => {
    expect(reviewQrLandingUrl('pages', 'retro-roller-grey')).toBe(
      'https://sunday-rolls.github.io/website/products/retro-roller-grey?review=1',
    )
    expect(reviewQrLandingUrl('live', 'the-doodle')).toBe(
      'https://www.sundayrollsgolf.com/products/the-doodle?review=1',
    )
  })

  it('lists catalog headcovers', () => {
    const products = listReviewQrProducts()
    expect(products.length).toBeGreaterThan(0)
    expect(products.some((p) => p.handle === 'retro-roller-grey')).toBe(true)
  })

  it('builds a PDF buffer', async () => {
    const pdf = await buildReviewQrPdf('pages')
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  })
})
