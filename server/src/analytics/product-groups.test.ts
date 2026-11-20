import { describe, expect, it } from 'vitest'
import { shopifyInventory } from './inventory.js'
import { resolveSku, skuCatalog } from './product-groups.js'
import { buildProductsView } from './views.js'
import type { Order } from './types.js'

const catalog = skuCatalog(
  shopifyInventory([
    { sku: 'SR-RETRO-DF3-GRY', productTitle: 'Retro Roller', variantTitle: 'Grey', quantity: 5, active: true },
    { sku: 'SR-RETRO-MAL-GRY', productTitle: 'Mallet - Retro Roller', variantTitle: 'Grey', quantity: 3, active: true },
    { sku: 'SR-DOODLE-DF3', productTitle: 'The Doodle', variantTitle: 'Default Title', quantity: 2, active: true },
  ]),
)

const order = (channel: Order['channel'], source: Order['source'], lines: Array<[string, string | null, number]>, id: string): Order => ({
  id,
  externalId: `${channel}:${id}`,
  channel,
  source,
  orderedAt: '2026-11-10T15:00:00.000Z',
  revenue: lines.reduce((s, l) => s + l[2], 0),
  fees: 0,
  shippingCost: 0,
  marketingCost: 0,
  state: null,
  customerEmail: null,
  isReturning: false,
  trafficSource: null,
  lines: lines.map(([productName, productSku, lineRevenue]) => ({ productName, productSku, category: 'Headcover', quantity: 1, unitPrice: lineRevenue, lineRevenue })),
})

describe('Products grouped by SKU', () => {
  it('resolves a SKU from the line, then from the website name', () => {
    expect(resolveSku({ productName: 'anything', productSku: 'SR-DOODLE-DF3' }, catalog)).toBe('SR-DOODLE-DF3')
    expect(resolveSku({ productName: 'Mallet - Retro Roller Grey', productSku: null }, catalog)).toBe('SR-RETRO-MAL-GRY')
    expect(resolveSku({ productName: 'Mallet – Retro Roller - Grey', productSku: 'SQ6617356' }, catalog)).toBe('SR-RETRO-MAL-GRY')
    expect(resolveSku({ productName: 'Mystery cover', productSku: 'OLD-1' }, catalog)).toBe('OLD-1')
    expect(resolveSku({ productName: 'Mystery cover', productSku: null }, catalog)).toBeNull()
  })

  it('merges different channel titles into one row named like the website', () => {
    const orders = [
      order('etsy', 'etsy', [['LAB DF3 Putter Cover – Center Shaft Mallet Headcover | Retro Gaming, Grey', 'SR-RETRO-DF3-GRY', 80]], 'a'),
      order('ebay', 'ebay', [['Putter Cover for LAB DF3 DF3i Center Shaft Mallet Headcover Retro Gamer Gray', 'SR-RETRO-DF3-GRY', 80]], 'b'),
      order('shopify', 'shopify', [['Retro Roller - Grey', null, 80]], 'c'),
      order('squarespace', 'manual', [['Retro Roller - Grey', 'SQ6360452', 80]], 'd'),
      order('shopify', 'shopify', [['Mystery cover', null, 50]], 'e'),
    ]
    const view = buildProductsView({
      range: { start: '2026-11-01', end: '2026-11-30' } as never,
      orders,
      productViews: [],
      catalog,
    })
    const retro = view.products.find((p) => p.sku === 'SR-RETRO-DF3-GRY')
    expect(retro).toMatchObject({ name: 'Retro Roller - Grey', units: 4, revenue: 320, orders: 4 })
    expect(view.products.find((p) => p.name === 'Mystery cover')).toMatchObject({ sku: null, units: 1 })
    expect(view.products.filter((p) => p.units > 0)).toHaveLength(2)
  })
})
