import { describe, expect, it } from 'vitest'
import {
  inferProductHandleFromListing,
  loadProductReviewsSeed,
  seedReviewId,
} from './review-seed.js'

describe('review seed', () => {
  it('loads curated Etsy reviews with stable ids', () => {
    const rows = loadProductReviewsSeed()

    expect(rows.length).toBeGreaterThan(40)
    expect(rows.every((row) => row.id && row.author && row.rating >= 1 && row.rating <= 5)).toBe(
      true,
    )
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    expect(rows.some((row) => row.productHandle === 'retro-roller-grey')).toBe(true)
  })

  it('keeps seed ids stable across loads', () => {
    const first = loadProductReviewsSeed()
    const second = loadProductReviewsSeed()
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id))
  })

  it('infers product handles from listing titles', () => {
    expect(inferProductHandleFromListing('Yellow Retro Gaming Golf Putter Cover')).toBe(
      'retro-roller-yellow',
    )
    expect(seedReviewId(['a', 'b'])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
