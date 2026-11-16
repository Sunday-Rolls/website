import { describe, expect, it } from 'vitest'
import {
  ebayCostsByOrder,
  ebayMissingEnv,
  ebayRevenue,
  fetchEbayOrders,
  getEbayAccessToken,
  loadEbayCredentialsFromEnv,
  mapEbayOrder,
  type EbayOrderRaw,
} from './ebay.js'
import { syncEbayToStore } from './ebay-sync.js'
import { createMemoryAnalyticsStore } from './store.js'

const raw = (over: Partial<EbayOrderRaw> = {}): EbayOrderRaw => ({
  orderId: '12-34567-89012',
  creationDate: '2026-10-05T15:30:00.000Z',
  orderFulfillmentStatus: 'FULFILLED',
  orderPaymentStatus: 'PAID',
  cancelStatus: { cancelState: 'NONE_REQUESTED' },
  pricingSummary: {
    priceSubtotal: { value: '60.00', currency: 'USD' },
    deliveryCost: { value: '5.99', currency: 'USD' },
    priceDiscount: { value: '-6.00', currency: 'USD' },
    tax: { value: '4.20', currency: 'USD' },
    total: { value: '64.19', currency: 'USD' },
  },
  totalMarketplaceFee: { value: '8.45', currency: 'USD' },
  fulfillmentStartInstructions: [{ shippingStep: { shipTo: { contactAddress: { stateOrProvince: 'MN', countryCode: 'US' } } } }],
  lineItems: [
    { lineItemId: 'L1', legacyItemId: '1234', sku: 'GB-01', title: 'Gameboy Golf Headcover', quantity: 2, lineItemCost: { value: '60.00' } },
  ],
  ...over,
})

describe('eBay env', () => {
  it('is off until all three keys are set', () => {
    expect(ebayMissingEnv({})).toBe('EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN')
    const env = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'secret', EBAY_REFRESH_TOKEN: 'v^1.1#r' }
    expect(ebayMissingEnv(env)).toBeNull()
    expect(loadEbayCredentialsFromEnv(env)).toMatchObject({ clientId: 'id', clientSecret: 'secret', refreshToken: 'v^1.1#r' })
  })
})

describe('mapEbayOrder', () => {
  it('maps money, lines and status', () => {
    const o = mapEbayOrder(raw())
    expect(o).toMatchObject({
      orderId: '12-34567-89012',
      paymentStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      state: 'MN',
      itemSubtotal: 60,
      shippingCharged: 5.99,
      discount: 6,
      tax: 4.2,
      marketplaceFees: 8.45,
      labelCost: null,
    })
    expect(o.lines).toEqual([
      { lineItemId: 'L1', itemId: '1234', title: 'Gameboy Golf Headcover', sku: 'GB-01', quantity: 2, unitPrice: 30, lineRevenue: 60 },
    ])
    // Items − discount + shipping, no tax.
    expect(ebayRevenue(o)).toBe(59.99)
  })

  it('takes Finances costs over the order fee, and zeroes cancelled orders', () => {
    const o = mapEbayOrder(raw(), { fees: 9.1, label: 4.35, ads: 1.2 })
    expect(o).toMatchObject({ marketplaceFees: 9.1, labelCost: 4.35, adFees: 1.2 })
    expect(ebayRevenue(mapEbayOrder(raw({ cancelStatus: { cancelState: 'CANCELED' } })))).toBe(0)
    expect(ebayRevenue(mapEbayOrder(raw({ paymentSummary: { refunds: [{ amount: { value: '10' } }] } })))).toBe(49.99)
  })
})

describe('ebayCostsByOrder', () => {
  it('adds sale fees, labels (less label refunds) and ad fees per order', () => {
    const costs = ebayCostsByOrder([
      { transactionType: 'SALE', orderId: 'A', amount: { value: '50' }, totalFeeAmount: { value: '7.10' }, bookingEntry: 'CREDIT' },
      { transactionType: 'SHIPPING_LABEL', orderId: 'A', amount: { value: '5.20' }, bookingEntry: 'DEBIT' },
      { transactionType: 'SHIPPING_LABEL', orderId: 'A', amount: { value: '1.00' }, bookingEntry: 'CREDIT' },
      { transactionType: 'NON_SALE_CHARGE', feeType: 'AD_FEE', amount: { value: '2.50' }, bookingEntry: 'DEBIT', references: [{ referenceId: 'A', referenceType: 'ORDER_ID' }] },
      { transactionType: 'NON_SALE_CHARGE', feeType: 'STORE_SUBSCRIPTION_FEE', amount: { value: '20' }, bookingEntry: 'DEBIT' },
    ])
    expect(costs.get('A')).toEqual({ fees: 7.1, label: 4.2, ads: 2.5 })
    expect(costs.size).toBe(1)
  })
})

/** A fetch stub that answers by URL. */
function stubFetch(routes: Array<[RegExp, unknown, number?]>) {
  const calls: string[] = []
  const impl = (async (url: string | URL) => {
    const u = String(url)
    calls.push(u)
    const hit = routes.find(([re]) => re.test(u))
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('eBay HTTP', () => {
  it('mints a token and pages through orders', async () => {
    const { impl, calls } = stubFetch([
      [/oauth2\/token/, { access_token: 'AT' }],
      [/offset=0/, { orders: [raw({ orderId: 'A' })], total: 201 }],
      [/offset=200/, { orders: [raw({ orderId: 'B' })], total: 201 }],
    ])
    expect(await getEbayAccessToken({ clientId: 'a', clientSecret: 'b', refreshToken: 'r' }, impl)).toBe('AT')
    const orders = await fetchEbayOrders('AT', { fromMs: Date.parse('2026-01-01T00:00:00Z'), fetchImpl: impl })
    expect(orders.map((o) => o.orderId)).toEqual(['A', 'B'])
    expect(calls[1]).toContain('creationdate%3A%5B2026-01-01T00%3A00%3A00.000Z..%5D')
  })

  it('reports a token error with eBay’s message', async () => {
    const { impl } = stubFetch([[/oauth2\/token/, { error: 'invalid_grant', error_description: 'the provided authorization refresh token is invalid' }, 400]])
    await expect(getEbayAccessToken({ clientId: 'a', clientSecret: 'b', refreshToken: 'r' }, impl)).rejects.toThrow(/refresh token is invalid/)
  })
})

describe('syncEbayToStore', () => {
  const creds = { clientId: 'a', clientSecret: 'b', refreshToken: 'r' }
  const now = () => Date.parse('2026-11-16T12:00:00Z')

  it('stores orders with Finances costs and leaves dashboard orders alone', async () => {
    const store = createMemoryAnalyticsStore()
    const { impl } = stubFetch([
      [/oauth2\/token/, { access_token: 'AT' }],
      [/fulfillment\/v1\/order/, { orders: [raw({ orderId: 'A' })], total: 1 }],
      [/finances\/v1\/transaction/, { transactions: [{ transactionType: 'SHIPPING_LABEL', orderId: 'A', amount: { value: '4.10' }, bookingEntry: 'DEBIT' }], total: 1 }],
    ])
    const r = await syncEbayToStore(store, creds, { days: 30, now, fetchImpl: impl })
    expect(r).toEqual({ orders: 1, withFinances: 1, skipped: [] })
    const [stored] = await store.listEbayOrders()
    // No SALE row this run, so eBay's per-order fee stands in.
    expect(stored).toMatchObject({ orderId: 'A', labelCost: 4.1, marketplaceFees: 8.45 })
    expect(await store.listOrders()).toEqual([])
    expect((await store.latestSyncs()).find((s) => s.source === 'ebay')?.status).toBe('ok')
  })

  it('still stores orders when Finances fails, keeping earlier costs', async () => {
    const store = createMemoryAnalyticsStore()
    await store.upsertEbayOrders([mapEbayOrder(raw({ orderId: 'A' }), { fees: 7, label: 4, ads: null })])
    const { impl } = stubFetch([
      [/oauth2\/token/, { access_token: 'AT' }],
      [/fulfillment\/v1\/order/, { orders: [raw({ orderId: 'A' })], total: 1 }],
      [/finances\/v1\/transaction/, { errors: [{ message: 'Insufficient permissions' }] }, 403],
    ])
    const r = await syncEbayToStore(store, creds, { days: 30, now, fetchImpl: impl })
    expect(r.skipped).toEqual(['finances'])
    expect((await store.listEbayOrders())[0]).toMatchObject({ marketplaceFees: 7, labelCost: 4 })
  })
})
