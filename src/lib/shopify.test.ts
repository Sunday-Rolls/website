import { describe, expect, it } from 'vitest'
import { filterProductsByCategory, placeholderProducts } from '@/lib/shopify'
import { validateProductsAgainstCatalog } from '@/lib/product-catalog'

describe('filterProductsByCategory', () => {
  it('returns all products for the all filter', () => {
    expect(filterProductsByCategory(placeholderProducts, 'all')).toHaveLength(15)
  })

  it('returns only headcovers for the headcovers filter', () => {
    const results = filterProductsByCategory(placeholderProducts, 'headcovers')
    expect(results).toHaveLength(15)
    expect(results.every((product) => product.category === 'headcovers')).toBe(true)
  })

  it('filters headcovers by homepage-aligned subcategory', () => {
    const centerShafted = filterProductsByCategory(placeholderProducts, 'center-shafted')
    const mallet = filterProductsByCategory(placeholderProducts, 'mallet')
    const ozMezz = filterProductsByCategory(placeholderProducts, 'oz-mezz')

    expect(centerShafted).toHaveLength(9)
    expect(mallet).toHaveLength(4)
    expect(ozMezz).toHaveLength(2)
    expect(centerShafted.every((product) => product.subcategory === 'center-shafted')).toBe(true)
  })

  it('returns an empty list for categories not in the catalog', () => {
    expect(filterProductsByCategory(placeholderProducts, 'bags')).toHaveLength(0)
    expect(filterProductsByCategory(placeholderProducts, 'towels')).toHaveLength(0)
    expect(filterProductsByCategory(placeholderProducts, 'accessories')).toHaveLength(0)
    expect(filterProductsByCategory(placeholderProducts, 'nonexistent')).toHaveLength(0)
  })
})

describe('placeholderProducts', () => {
  it('stays in sync with the product catalog template', () => {
    const result = validateProductsAgainstCatalog(placeholderProducts)
    expect(result.valid).toBe(true)
  })

  it('includes key features and dimensions for product detail pages', () => {
    const product = placeholderProducts.find((entry) => entry.handle === 'the-doodle')

    expect(product?.description.length).toBeGreaterThan(40)
    expect(product?.keyFeatures?.length).toBeGreaterThan(0)
    expect(product?.dimensionsDisplay).toMatch(/4\.625/)
  })
})
