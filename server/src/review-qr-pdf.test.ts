import { describe, expect, it } from 'vitest'
import {
  buildReviewQrPdf,
  listCatalogReviewQrProducts,
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

  it('includes towels and headcovers in the catalog fallback', () => {
    const products = listCatalogReviewQrProducts()
    expect(products.length).toBeGreaterThanOrEqual(20)
    expect(products.some((p) => p.handle === 'retro-roller-grey')).toBe(true)
    expect(products.some((p) => p.handle.includes('towel') || p.title.toLowerCase().includes('towel'))).toBe(
      true,
    )
  })

  it('builds a PDF with one page per product', async () => {
    const { pdf, count, source, pages } = await buildReviewQrPdf('pages')
    expect(source).toBe('catalog')
    expect(count).toBe(listCatalogReviewQrProducts().length)
    expect(pages).toBe(count)
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  })
})
