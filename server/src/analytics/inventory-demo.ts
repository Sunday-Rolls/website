// Example inventory for demo mode (ANALYTICS_SEED_DEMO_ON_BOOT) and local development. Not real counts.
import { addUtcDays, formatUtcDate, parseUtcDate } from './period.js'
import type { EtsyInventory, InventorySale, InventorySku, SheetInventory, ShopifyInventory } from './inventory.js'

const SKUS: Array<[string, string, string, string, number]> = [
  ['SR-RETRO-DF3-GRY', 'Retro Roller - Grey', 'DF3', 'Headcover', 40],
  ['SR-RETRO-DF3-PUR', 'Retro Roller - Purple', 'DF3', 'Headcover', 30],
  ['SR-RETRO-DF3-YEL', 'Retro Roller - Yellow', 'DF3', 'Headcover', 25],
  ['SR-RETRO-MAL-GRY', 'Retro Roller - Grey (Mallet)', 'Mallet', 'Headcover', 12],
  ['SR-RETRO-MAL-WHT', 'Retro Roller - White (Mallet)', 'Mallet', 'Headcover', 10],
  ['SR-DOODLE-DF3', 'The Doodle', 'DF3', 'Headcover', 44],
  ['SR-DEW-DF3', 'Morning Dew', 'DF3', 'Headcover', 47],
  ['SR-FUEL-DF3', 'Flagstick Fuel', 'DF3', 'Headcover', 47],
  ['SR-BIRDIE-DF3', 'The Birdie Machine', 'DF3', 'Headcover', 39],
  ['SR-BREAKFAST-DF3', 'The Breakfast Roller', 'DF3', 'Headcover', 8],
  ['SR-CORD-DF3', 'The Corduroy', 'DF3', 'Headcover', 49],
  ['SR-CORD-MAL', 'The Corduroy (Mallet)', 'Mallet', 'Headcover', 3],
  ['SR-STRIPES-DF3', 'Sunday Stripes', 'DF3', 'Headcover', 43],
  ['SR-STRIPES-MAL', 'Sunday Stripes (Mallet)', 'Mallet', 'Headcover', 43],
  ['SR-SUNNY-OZ', 'Sunny Side Up', 'OZ1i / Mezz.1', 'Headcover', 45],
  ['SR-COIN-OZ', 'Coin Collector', 'OZ1i / Mezz.1', 'Headcover', 42],
  ['SR-TOWEL-BLKSTR', 'Golf Towel - Black Stripe', '', 'Towel', 20],
  ['SR-TOWEL-BLUSTR', 'Golf Towel - Blue Stripe', '', 'Towel', 20],
  ['SR-TOWEL-GRNSTR', 'Golf Towel - Green Stripe', '', 'Towel', 20],
  ['SR-TOWEL-REDSTR', 'Golf Towel - Red Stripe', '', 'Towel', 20],
  ['SR-TOWEL-REDBLU', 'Golf Towel - Red & Blue Stripe', '', 'Towel', 20],
  ['SR-TOWEL-BLK', 'Golf Towel - Solid Black', '', 'Towel', 20],
  ['SR-TOWEL-BLU', 'Golf Towel - Solid Blue', '', 'Towel', 20],
]

/** Units sold per SKU index since the count, as [channel, quantity] pairs spread over the days after it. */
const SOLD: Record<number, Array<['etsy' | 'ebay' | 'other', number]>> = {
  0: [['etsy', 2], ['ebay', 1]],
  1: [['etsy', 3], ['ebay', 1]],
  2: [['etsy', 3], ['ebay', 2], ['other', 1]],
  3: [['etsy', 2], ['ebay', 1]],
  4: [['etsy', 3], ['ebay', 1]],
  5: [['etsy', 2], ['ebay', 1], ['other', 1]],
  6: [['etsy', 1], ['ebay', 1]],
  8: [['etsy', 2], ['other', 1]],
  9: [['ebay', 1]],
  11: [['ebay', 3]],
  13: [['ebay', 1]],
  16: [['etsy', 1], ['other', 1]],
}

export function demoInventory(asOf: string): { sheet: SheetInventory; etsy: EtsyInventory; shopify: ShopifyInventory } {
  const end = parseUtcDate(asOf)
  const day = (offset: number) => formatUtcDate(addUtcDays(end, offset))
  const countDate = day(-20)
  const syncedAt = `${asOf}T12:00:00.000Z`

  const skus: InventorySku[] = SKUS.map(([sku, product, style, category]) => ({ sku, product, style, category }))
  const received = SKUS.map(([sku, , , , qty]) => ({ date: countDate, sku, qty, type: 'Starting count', notes: '' }))
  received.push({ date: day(-6), sku: 'SR-FUEL-DF3', qty: 12, type: 'Shipment', notes: 'Example shipment' })

  const sheetSales: InventorySale[] = []
  const etsySales: Record<string, InventorySale[]> = {}
  let n = 0
  for (const [index, entries] of Object.entries(SOLD)) {
    const [sku, product] = SKUS[Number(index)]
    for (const [channel, qty] of entries) {
      for (let i = 0; i < qty; i++) {
        n++
        const soldAt = day(-((n * 7) % 19))
        if (channel === 'etsy') {
          const id = String(4100 + n)
          etsySales[id] = [{ key: `etsy:${id}:1`, channel, sku, product, quantity: 1, soldAt: `${soldAt}T16:00:00.000Z`, ref: `receipt ${id}` }]
        } else {
          const ref = channel === 'ebay' ? `E${200 + n}` : `A${60 + n}`
          sheetSales.push({ key: `${channel}:${ref}`, channel, sku, product, quantity: 1, soldAt, ref })
        }
      }
    }
  }
  // One eBay sale without a SKU, to show the "Sales without a SKU" list.
  sheetSales.push({ key: 'ebay:E299', channel: 'ebay', sku: null, product: 'Headcover', quantity: 1, soldAt: day(-1), ref: 'E299' })

  // Listed quantities: mostly in step with on hand, a few out of date.
  const onHand = new Map(SKUS.map(([sku, , , , qty]) => [sku, qty]))
  onHand.set('SR-FUEL-DF3', (onHand.get('SR-FUEL-DF3') ?? 0) + 12)
  for (const s of [...sheetSales, ...Object.values(etsySales).flat()]) {
    if (s.sku) onHand.set(s.sku, (onHand.get(s.sku) ?? 0) - s.quantity)
  }
  const shopifyListed: Record<string, number> = {}
  const etsyListed: Record<string, number> = {}
  for (const [sku, qty] of onHand) {
    shopifyListed[sku] = qty
    if (!['SR-BREAKFAST-DF3', 'SR-CORD-MAL'].includes(sku)) etsyListed[sku] = qty
  }
  shopifyListed['SR-DOODLE-DF3'] = 50
  shopifyListed['SR-CORD-MAL'] = 1
  etsyListed['SR-RETRO-MAL-GRY'] = 13

  return {
    sheet: { skus, received, sales: sheetSales, warnings: [], syncedAt },
    etsy: { sales: etsySales, listed: etsyListed, syncedAt },
    shopify: { listed: shopifyListed, titleToSku: {}, syncedAt },
  }
}
