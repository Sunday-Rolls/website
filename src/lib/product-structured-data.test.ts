import { afterEach, describe, expect, it } from 'vitest'
import {
  PRODUCT_JSONLD_ID,
  applyProductJsonLd,
  buildProductJsonLd,
  clearProductJsonLd,
} from '@/lib/product-structured-data'
import type { ShopifyProduct } from '@/lib/shopify'
import type { ProductReview } from '@/types/content'

const product: ShopifyProduct = {
  id: 'gid://shopify/Product/1',
  handle: 'sunny-side-up',
  title: 'Sunny Side Up',
  description: 'Embroidered fried egg cover for the L.A.B. OZ1i.',
  price: '$80.00',
  priceAmount: '80.0',
  currencyCode: 'USD',
  availableForSale: true,
  images: [{ url: 'https://cdn.shopify.com/a.png', alt: 'front' }, { url: '/assets/b.png', alt: 'back' }],
  category: 'headcovers',
}

const url = 'https://www.sundayrollsgolf.com/products/sunny-side-up/'

describe('buildProductJsonLd', () => {
  it('describes the product with price, stock and absolute images', () => {
    const data = buildProductJsonLd(product, [], url)
    expect(data['@type']).toBe('Product')
    expect(data.name).toBe('Sunny Side Up')
    expect(data.image).toEqual([
      'https://cdn.shopify.com/a.png',
      'https://www.sundayrollsgolf.com/assets/b.png',
    ])
    expect(data.offers).toMatchObject({
      price: '80.00',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url,
    })
    expect(data.aggregateRating).toBeUndefined()
  })

  it('marks sold-out products and skips offers without a real price', () => {
    expect(buildProductJsonLd({ ...product, availableForSale: false }, [], url).offers).toMatchObject({
      availability: 'https://schema.org/OutOfStock',
    })
    expect(buildProductJsonLd({ ...product, priceAmount: undefined }, [], url).offers).toBeUndefined()
  })

  it('rates the product only from reviews left on this site', () => {
    const reviews: ProductReview[] = [
      { author: 'Ann', rating: 5, text: 'Fits my OZ perfectly', source: 'site' },
      { author: 'Bo', rating: 4, text: '', source: 'site' },
      { author: 'Cy', rating: 1, text: 'Imported from Etsy', source: 'etsy' },
    ]
    const data = buildProductJsonLd(product, reviews, url)
    expect(data.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 2 })
    expect(data.review).toHaveLength(1)
  })

  it('leaves out ratings when every review was imported from another site', () => {
    const reviews: ProductReview[] = [{ author: 'Dee', rating: 5, text: 'Great', source: 'etsy' }]
    expect(buildProductJsonLd(product, reviews, url).aggregateRating).toBeUndefined()
  })
})

describe('applyProductJsonLd', () => {
  afterEach(() => clearProductJsonLd())

  it('writes one script tag and removes it again', () => {
    applyProductJsonLd({ a: 1 })
    applyProductJsonLd({ a: 2 })
    const tags = document.querySelectorAll(`#${PRODUCT_JSONLD_ID}`)
    expect(tags).toHaveLength(1)
    expect(JSON.parse(tags[0].textContent ?? '')).toEqual({ a: 2 })
    clearProductJsonLd()
    expect(document.getElementById(PRODUCT_JSONLD_ID)).toBeNull()
  })
})
