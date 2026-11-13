import { describe, expect, it } from 'vitest'
import { productSeoTitle } from '@/lib/product-seo.mjs'

describe('productSeoTitle', () => {
  it('names the fit people search for', () => {
    expect(productSeoTitle({ title: 'Coin Collector', category: 'headcovers', subcategory: 'oz-mezz' })).toBe(
      'Coin Collector — L.A.B. Oz & Mezz Putter Cover | Sunday Rolls Golf',
    )
    expect(productSeoTitle({ title: 'Retro Roller - Grey', category: 'headcovers', subcategory: 'center-shafted' })).toBe(
      'Retro Roller Grey — L.A.B. DF3 Putter Cover | Sunday Rolls Golf',
    )
    expect(productSeoTitle({ title: 'Mallet - The Corduroy', category: 'headcovers', subcategory: 'mallet' })).toBe(
      'The Corduroy — Spider Mallet Putter Cover | Sunday Rolls Golf',
    )
  })

  it('reads naturally for towels', () => {
    expect(productSeoTitle({ title: 'Golf Towel - Green Stripe', category: 'towels' })).toBe(
      'Green Stripe Waffle Golf Towel | Sunday Rolls Golf',
    )
  })
})
