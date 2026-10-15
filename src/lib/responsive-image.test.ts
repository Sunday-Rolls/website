import { describe, expect, it } from 'vitest'
import { productImageSrcSet, sizedImageUrl } from '@/lib/responsive-image'

describe('sizedImageUrl', () => {
  it('adds width for Shopify CDN URLs', () => {
    const url = 'https://cdn.shopify.com/s/files/1/x/product.jpg?v=1'
    expect(sizedImageUrl(url, 640)).toContain('width=640')
  })

  it('leaves local asset URLs unchanged', () => {
    expect(sizedImageUrl('/assets/products/the-doodle.jpg', 640)).toBe(
      '/assets/products/the-doodle.jpg',
    )
  })
})

describe('productImageSrcSet', () => {
  it('builds a srcset for Shopify images', () => {
    const srcset = productImageSrcSet('https://cdn.shopify.com/s/files/1/x/p.jpg')
    expect(srcset).toContain('320w')
    expect(srcset).toContain('640w')
  })
})
