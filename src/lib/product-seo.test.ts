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

describe('productMetaDescription', () => {
  it('differs for color versions that share copy', async () => {
    const { productMetaDescription } = await import('@/lib/product-seo.mjs')
    const description = 'The Retro Roller brings nostalgic gaming energy straight to the course.'
    const grey = productMetaDescription({ title: 'Retro Roller - Grey', category: 'headcovers', subcategory: 'center-shafted', description })
    const purple = productMetaDescription({ title: 'Retro Roller - Purple', category: 'headcovers', subcategory: 'center-shafted', description })
    expect(grey).toBe('Retro Roller Grey L.A.B. DF3 Putter Cover by Sunday Rolls Golf. ' + description)
    expect(purple).not.toBe(grey)
  })

  it('stays under 160 characters', async () => {
    const { productMetaDescription } = await import('@/lib/product-seo.mjs')
    const description = 'word '.repeat(80)
    expect(productMetaDescription({ title: 'Morning Dew', category: 'headcovers', subcategory: 'center-shafted', description }).length).toBeLessThanOrEqual(158)
  })
})
