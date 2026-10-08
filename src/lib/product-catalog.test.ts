import { describe, expect, it } from 'vitest'
import catalogData from '@/data/product-catalog.json'
import {
  getCatalogProducts,
  getPublishedCatalogProducts,
  slugifyProductTitle,
  validateProductsAgainstCatalog,
} from '@/lib/product-catalog'
import { placeholderProducts } from '@/lib/shopify'

describe('product catalog', () => {
  it('loads all products from the Excel template', () => {
    expect(getCatalogProducts()).toHaveLength(23)
    expect(getPublishedCatalogProducts()).toHaveLength(23)
  })

  it('generates stable handles from product titles', () => {
    expect(slugifyProductTitle('Retro Roller - Grey')).toBe('retro-roller-grey')
    expect(slugifyProductTitle("Mallet - Retro Roller White")).toBe('mallet-retro-roller-white')
  })

  it('matches catalog titles in the imported JSON', () => {
    const titles = catalogData.map((product) => product.title)
    expect(titles).toContain('Retro Roller - Grey')
    expect(titles).toContain('The Doodle')
    expect(titles).toContain('Morning Dew')
    expect(titles).toContain('Golf Towel - Green Stripe')
    expect(titles).not.toContain('Hat')
  })
})

describe('validateProductsAgainstCatalog', () => {
  it('passes when site placeholders mirror the catalog template', () => {
    const result = validateProductsAgainstCatalog(placeholderProducts)

    expect(result.valid).toBe(true)
    expect(result.catalogOnly).toHaveLength(0)
    expect(result.siteOnly).toHaveLength(0)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)
  })

  it('flags products missing from the catalog', () => {
    const result = validateProductsAgainstCatalog([
      ...placeholderProducts,
      {
        id: 'extra',
        handle: 'not-in-template',
        title: 'Not In Template',
        description: 'Extra product',
        price: '$10.00',
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.siteOnly).toHaveLength(1)
    expect(result.issues.some((issue) => issue.handle === 'not-in-template')).toBe(true)
  })

  it('flags title mismatches against the catalog', () => {
    const [first, ...rest] = placeholderProducts
    const result = validateProductsAgainstCatalog([
      { ...first, title: 'Wrong Title' },
      ...rest,
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.field === 'title')).toBe(true)
  })
})
