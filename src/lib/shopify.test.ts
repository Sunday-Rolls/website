import { describe, expect, it } from 'vitest'
import {
  filterProductsByCategory,
  moveFrontImageFirst,
  placeholderProducts,
} from '@/lib/shopify'
import { validateProductsAgainstCatalog } from '@/lib/product-catalog'

const subcategoryOrder = ['center-shafted', 'mallet', 'oz-mezz']

describe('filterProductsByCategory', () => {
  it('returns all products for the all filter', () => {
    expect(filterProductsByCategory(placeholderProducts, 'all')).toHaveLength(23)
  })

  it('sorts all products center shafted, then mallet, then OZ like the home page', () => {
    const shuffled = [...placeholderProducts].reverse()

    for (const filter of ['all', 'headcovers']) {
      const ranks = filterProductsByCategory(shuffled, filter).map((product) => {
        const rank = subcategoryOrder.indexOf(product.subcategory ?? '')
        return rank === -1 ? subcategoryOrder.length : rank
      })
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }

    const doodleIndex = filterProductsByCategory(placeholderProducts, 'all').findIndex(
      (product) => product.handle === 'the-doodle',
    )
    expect(doodleIndex).toBeLessThan(9)
  })

  it('returns only headcovers for the headcovers filter', () => {
    const results = filterProductsByCategory(placeholderProducts, 'headcovers')
    expect(results).toHaveLength(16)
    expect(results.every((product) => product.category === 'headcovers')).toBe(true)
  })

  it('filters headcovers by homepage-aligned subcategory', () => {
    const centerShafted = filterProductsByCategory(placeholderProducts, 'center-shafted')
    const mallet = filterProductsByCategory(placeholderProducts, 'mallet')
    const ozMezz = filterProductsByCategory(placeholderProducts, 'oz-mezz')

    expect(centerShafted).toHaveLength(10)
    expect(mallet).toHaveLength(4)
    expect(ozMezz).toHaveLength(2)
    expect(centerShafted.every((product) => product.subcategory === 'center-shafted')).toBe(true)
  })

  it('returns towels in catalog order', () => {
    const towels = filterProductsByCategory(placeholderProducts, 'towels')
    expect(towels.map((product) => product.handle)).toEqual([
      'golf-towel-green-stripe',
      'golf-towel-blue-stripe',
      'golf-towel-red-stripe',
      'golf-towel-black-stripe',
      'golf-towel-red-blue-stripe',
      'golf-towel-solid-blue',
      'golf-towel-solid-black',
    ])
    expect(towels.every((product) => product.category === 'towels')).toBe(true)
    expect(towels[0]?.price).toBe('$30.00')
  })

  it('returns an empty list for categories not in the catalog', () => {
    expect(filterProductsByCategory(placeholderProducts, 'bags')).toHaveLength(0)
    expect(filterProductsByCategory(placeholderProducts, 'accessories')).toHaveLength(0)
    expect(filterProductsByCategory(placeholderProducts, 'nonexistent')).toHaveLength(0)
  })
})

describe('moveFrontImageFirst', () => {
  const images = ['dual', 'back', 'front', 'open'].map((url) => ({ url }))

  it('moves the front-only shot to the start of the gallery', () => {
    expect(moveFrontImageFirst(images, 2).map((image) => image.url)).toEqual([
      'front',
      'dual',
      'back',
      'open',
    ])
  })

  it('keeps the original order when no front index is set or it is out of range', () => {
    expect(moveFrontImageFirst(images)).toBe(images)
    expect(moveFrontImageFirst(images, 9)).toBe(images)
  })
})

describe('placeholderProducts', () => {
  it('stays in sync with the product catalog template', () => {
    const result = validateProductsAgainstCatalog(placeholderProducts)
    expect(result.valid).toBe(true)
  })

  it('keeps each product gallery to that product’s own photos', () => {
    const grey = placeholderProducts.find((entry) => entry.handle === 'retro-roller-grey')
    const birdie = placeholderProducts.find((entry) => entry.handle === 'the-birdie-machine')

    expect(grey?.images?.map((image) => image.url)).toEqual([
      '/assets/products/retro-roller-grey.jpg',
    ])
    expect(birdie?.images?.map((image) => image.url)).toEqual([
      '/assets/products/the-birdie-machine.jpg',
      '/assets/products/the-birdie-machine-pair.jpg',
      '/assets/products/the-birdie-machine-open.jpg',
      '/assets/products/the-birdie-machine-back.jpg',
    ])
  })

  it('includes key features and dimensions for product detail pages', () => {
    const product = placeholderProducts.find((entry) => entry.handle === 'the-doodle')

    expect(product?.description.length).toBeGreaterThan(40)
    expect(product?.keyFeatures?.length).toBeGreaterThan(0)
    expect(product?.dimensionsDisplay).toMatch(/4\.625/)
  })
})
