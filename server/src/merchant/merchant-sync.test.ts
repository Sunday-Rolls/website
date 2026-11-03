import { describe, expect, it } from 'vitest'
import {
  dataSourceName,
  shopifyProductToMerchantInputs,
  toMicros,
  type ShopifyProductNode,
} from './merchant-sync.js'

const config = {
  siteOrigin: 'https://www.sundayrollsgolf.com',
  feedLabel: 'US',
  contentLanguage: 'en',
  currency: 'USD',
  offerIdPrefix: 'shopify_',
}

function product(overrides: Partial<ShopifyProductNode> = {}): ShopifyProductNode {
  return {
    id: 'gid://shopify/Product/8879169110174',
    handle: 'retro-roller-grey',
    title: 'Retro Roller - Grey',
    description: 'The Retro Roller brings   nostalgic\n gaming energy.',
    vendor: 'Sunday Rolls',
    productType: 'Sporting Accessories',
    status: 'ACTIVE',
    media: {
      nodes: [{ image: { url: 'https://cdn.shopify.com/a.png' } }, { image: { url: 'https://cdn.shopify.com/b.png' } }, {}],
    },
    variants: {
      nodes: [
        {
          id: 'gid://shopify/ProductVariant/48257257308318',
          title: 'Default Title',
          sku: null,
          barcode: null,
          price: '80.00',
          compareAtPrice: null,
          availableForSale: true,
          selectedOptions: [{ name: 'Title', value: 'Default Title' }],
        },
      ],
    },
    ...overrides,
  }
}

describe('merchant sync mapping', () => {
  it('converts prices to micros exactly', () => {
    expect(toMicros('80.00')).toBe('80000000')
    expect(toMicros('29.99')).toBe('29990000')
    expect(toMicros('5')).toBe('5000000')
  })

  it('maps a single-variant product onto the storefront domain', () => {
    const [input] = shopifyProductToMerchantInputs(product(), config)
    expect(input.offerId).toBe('shopify_8879169110174_48257257308318')
    expect(input.feedLabel).toBe('US')
    const a = input.productAttributes
    expect(a.link).toBe('https://www.sundayrollsgolf.com/products/retro-roller-grey/')
    expect(a.title).toBe('Retro Roller - Grey')
    expect(a.description).toBe('The Retro Roller brings nostalgic gaming energy.')
    expect(a.price).toEqual({ amountMicros: '80000000', currencyCode: 'USD' })
    expect(a.availability).toBe('IN_STOCK')
    expect(a.imageLink).toBe('https://cdn.shopify.com/a.png')
    expect(a.additionalImageLinks).toEqual(['https://cdn.shopify.com/b.png'])
    expect(a.brand).toBe('Sunday Rolls')
    expect(a.identifierExists).toBe(false)
    expect(a.itemGroupId).toBeUndefined()
    expect(a.salePrice).toBeUndefined()
  })

  it('handles sale prices, GTINs and out-of-stock', () => {
    const p = product()
    p.variants.nodes[0] = {
      ...p.variants.nodes[0],
      price: '60.00',
      compareAtPrice: '80.00',
      barcode: '012345678905',
      availableForSale: false,
    }
    const a = shopifyProductToMerchantInputs(p, config)[0].productAttributes
    expect(a.price.amountMicros).toBe('80000000')
    expect(a.salePrice?.amountMicros).toBe('60000000')
    expect(a.gtins).toEqual(['012345678905'])
    expect(a.identifierExists).toBeUndefined()
    expect(a.availability).toBe('OUT_OF_STOCK')
  })

  it('groups multi-variant products and adds variant links', () => {
    const base = product().variants.nodes[0]
    const p = product({
      variants: {
        nodes: [
          { ...base, id: 'gid://shopify/ProductVariant/1', selectedOptions: [{ name: 'Color', value: 'Green' }] },
          { ...base, id: 'gid://shopify/ProductVariant/2', selectedOptions: [{ name: 'Color', value: 'Blue' }] },
        ],
      },
    })
    const inputs = shopifyProductToMerchantInputs(p, config)
    expect(inputs).toHaveLength(2)
    expect(inputs[1].offerId).toBe('shopify_8879169110174_2')
    expect(inputs[1].productAttributes.title).toBe('Retro Roller - Grey - Blue')
    expect(inputs[1].productAttributes.color).toBe('Blue')
    expect(inputs[1].productAttributes.itemGroupId).toBe('shopify_8879169110174')
    expect(inputs[1].productAttributes.link).toBe(
      'https://www.sundayrollsgolf.com/products/retro-roller-grey/?variant=2',
    )
  })

  it('builds data source names', () => {
    expect(dataSourceName('5685591896', '123')).toBe('accounts/5685591896/dataSources/123')
    expect(dataSourceName('5685591896', 'accounts/1/dataSources/2')).toBe('accounts/1/dataSources/2')
  })
})
