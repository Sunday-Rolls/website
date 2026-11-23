import { describe, expect, it } from 'vitest'
import { productSizeOptions } from '@/lib/product-sizes'
import { displayVariantTitle, findVariantForSize } from '@/lib/shopify'

const variants = [
  { id: 'gid://shopify/ProductVariant/1', title: 'L', availableForSale: true },
  { id: 'gid://shopify/ProductVariant/2', title: 'XL', availableForSale: false },
]

describe('apparel sizes', () => {
  it('uses Shopify variants once loaded, with sold-out state', () => {
    expect(productSizeOptions({ variants, sizes: ['L', 'XL'] })).toEqual([
      { size: 'L', available: true },
      { size: 'XL', available: false },
    ])
  })

  it('falls back to catalog sizes before Shopify answers', () => {
    expect(productSizeOptions({ sizes: ['L', 'XL'] })).toEqual([
      { size: 'L', available: true },
      { size: 'XL', available: true },
    ])
  })

  it('has no sizes for single-variant products', () => {
    expect(
      productSizeOptions({ variants: [{ id: 'v', title: 'Default Title', availableForSale: true }] }),
    ).toEqual([])
  })

  it('matches a size to its variant, including long names', () => {
    expect(findVariantForSize(variants, 'XL')?.id).toBe('gid://shopify/ProductVariant/2')
    expect(
      findVariantForSize([{ id: 'large', title: 'Large', availableForSale: true }], 'L')?.id,
    ).toBe('large')
    expect(findVariantForSize(variants, 'S')).toBeUndefined()
  })

  it('hides the Default Title variant name in the cart', () => {
    expect(displayVariantTitle('Default Title')).toBeUndefined()
    expect(displayVariantTitle('XL')).toBe('XL')
  })
})
