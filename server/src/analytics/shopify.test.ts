import { describe, expect, it } from 'vitest'
import { mapShopifyOrder, orderAttribution } from './shopify-sync.js'
import type { ShopifyOrderRaw } from './shopify.js'
import { extractDriveFileId } from './drive.js'

describe('mapShopifyOrder', () => {
  it('maps Admin order payload into analytics Order', () => {
    const order = mapShopifyOrder({
      id: 5678,
      name: '#1001',
      created_at: '2026-10-15T18:00:00Z',
      financial_status: 'paid',
      total_price: '89.00',
      total_shipping_price_set: { shop_money: { amount: '5.00' } },
      email: 'buyer@example.com',
      shipping_address: { province_code: 'MN' },
      source_name: 'web',
      line_items: [
        { title: 'Morning Dew', name: 'Morning Dew - Center Shafted', sku: 'MD-1', quantity: 2, price: '42.00' },
      ],
    })
    expect(order.channel).toBe('shopify')
    expect(order.externalId).toBe('shopify:5678')
    expect(order.revenue).toBe(89)
    expect(order.shippingCost).toBe(5)
    expect(order.state).toBe('MN')
    expect(order.source).toBe('shopify')
    expect(order.lines[0]).toMatchObject({
      productName: 'Morning Dew - Center Shafted',
      category: 'Morning Dew',
      quantity: 2,
      unitPrice: 42,
      lineRevenue: 84,
    })
  })
})

describe('extractDriveFileId', () => {
  it('parses spreadsheet URLs and raw ids', () => {
    expect(
      extractDriveFileId('https://docs.google.com/spreadsheets/d/1v18ftrLt5jcyGJsKFq37CwIYYY04aKIDeeEp0F5_XMU/edit'),
    ).toBe('1v18ftrLt5jcyGJsKFq37CwIYYY04aKIDeeEp0F5_XMU')
    expect(extractDriveFileId('1abc_DEF-123')).toBe('1abc_DEF-123')
  })
})

describe('orderAttribution', () => {
  const base = { id: 1, created_at: '2026-11-03T18:00:00Z', total_price: '80' } as unknown as ShopifyOrderRaw
  it('reads the storefront cart attributes first', () => {
    expect(
      orderAttribution({
        ...base,
        source_name: 'channel:21037214',
        note_attributes: [
          { name: '_sr_source', value: 'google' },
          { name: '_sr_medium', value: 'cpc' },
          { name: '_sr_campaign', value: 'Sales-Performance Max-NEW' },
          { name: '_sr_click', value: 'gclid' },
        ],
      }),
    ).toBe('google / cpc / Sales-Performance Max-NEW')
  })
  it('maps a bare click id to its network', () => {
    expect(orderAttribution({ ...base, note_attributes: [{ name: '_sr_click', value: 'fbclid' }] })).toBe('facebook / paid')
  })
  it('falls back to UTM tags on the landing URL, then the referrer', () => {
    expect(orderAttribution({ ...base, landing_site: '/products/x?utm_source=IG&utm_medium=paid' })).toBe('ig / paid')
    expect(orderAttribution({ ...base, landing_site: '/?gclid=abc' })).toBe('google / cpc')
    expect(orderAttribution({ ...base, referring_site: 'https://www.pluggedingolf.com/review' })).toBe('pluggedingolf.com / referral')
  })
  it('is null with nothing to go on, ignoring our own domains and the sales channel id', () => {
    expect(orderAttribution({ ...base, source_name: 'channel:21037214', referring_site: 'https://sundayrollsgolf.com/' })).toBeNull()
  })
})
