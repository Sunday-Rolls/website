import { describe, expect, it } from 'vitest'
import { optimizedImageUrl, productImageSrcSet, sizedImageUrl } from '@/lib/responsive-image'

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
    expect(srcset).toContain('480w')
    expect(srcset).toContain('800w')
  })

  it('skips a srcset when the file cannot be resized', () => {
    expect(productImageSrcSet('/assets/products/the-doodle.jpg')).toBeUndefined()
  })
})

describe('optimizedImageUrl', () => {
  it('points local product photos at the 800px file', () => {
    expect(optimizedImageUrl('/assets/products/golf-towel-solid-black.jpg')).toBe(
      '/assets/products/w800/golf-towel-solid-black.jpg',
    )
  })

  it('adds a Shopify width near the gallery slot', () => {
    const url = 'https://cdn.shopify.com/s/files/1/x/golf-towel-solid-black.jpg'
    expect(optimizedImageUrl(url)).toContain('width=800')
  })
})
