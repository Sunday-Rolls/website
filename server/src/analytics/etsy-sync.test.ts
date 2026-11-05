import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  etsyMissingEnv,
  getEtsyAccessToken,
  loadEtsyCredentialsFromEnv,
  type EtsyLedgerEntryRaw,
  type EtsyReceiptRaw,
} from './etsy.js'
import { etsyCostModel, isCountedReceipt, mapEtsyReceipt, syncEtsyToStore } from './etsy-sync.js'
import { createMemoryAnalyticsStore } from './store.js'
import type { Order } from './types.js'

const creds = { keystring: 'key', sharedSecret: 'secret', refreshToken: 'seed-refresh' }
const usd = (amount: number) => ({ amount, divisor: 100, currency_code: 'USD' })

function receipt(id: number, extra: Partial<EtsyReceiptRaw> = {}): EtsyReceiptRaw {
  return {
    receipt_id: id,
    status: 'Paid',
    created_timestamp: 1_793_000_000,
    country_iso: 'US',
    state: 'TX',
    grandtotal: usd(9345),
    subtotal: usd(8000),
    total_shipping_cost: usd(480),
    total_tax_cost: usd(865),
    transactions: [{ transaction_id: id * 10, title: 'Retro Roller Putter Cover', quantity: 1, price: usd(8000) }],
    ...extra,
  }
}

function trackerOrder(receiptId: number, revenue: number, fees: number, shipping: number): Order {
  return {
    id: `t-${receiptId}`,
    externalId: `etsy:${receiptId}`,
    channel: 'etsy',
    source: 'sales-tracker',
    orderedAt: '2026-10-01T00:00:00.000Z',
    revenue,
    fees,
    shippingCost: shipping,
    marketingCost: 14.7,
    state: null,
    customerEmail: null,
    isReturning: false,
    trafficSource: null,
    lines: [{ productName: 'Headcover', productSku: null, category: 'Headcover', quantity: 1, unitPrice: revenue, lineRevenue: revenue }],
  }
}

type Call = { url: string; headers: Record<string, string>; body?: string }

/** Fake Etsy: token refresh (rotating refresh tokens), /users/me and paged receipts. */
function stubEtsy(receipts: () => EtsyReceiptRaw[], pageSize = 100, ledger: () => EtsyLedgerEntryRaw[] = () => []) {
  const calls: Call[] = []
  let issued = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined })
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      if (url.includes('/oauth/token')) {
        issued += 1
        return json({ access_token: `123.access-${issued}`, refresh_token: `rotated-${issued}`, expires_in: 3600 })
      }
      if (url.endsWith('/users/me')) return json({ user_id: 123, shop_id: 555 })
      if (url.includes('/shops/555/payment-account/ledger-entries')) {
        const offset = Number(new URL(url).searchParams.get('offset') ?? 0)
        const all = ledger()
        return json({ count: all.length, results: all.slice(offset, offset + pageSize) })
      }
      if (url.includes('/shops/555/receipts')) {
        const offset = Number(new URL(url).searchParams.get('offset') ?? 0)
        const all = receipts()
        return json({ count: all.length, results: all.slice(offset, offset + pageSize) })
      }
      return json({ error: 'not found' }, 404)
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('mapEtsyReceipt', () => {
  it('uses what the buyer paid less refunds, keyed like the Sales Tracker', () => {
    const order = mapEtsyReceipt(receipt(3811712513, { refunds: [{ amount: usd(1000) }] }), { feeRate: 0.2, shippingPerOrder: 5.83 })
    expect(order).toMatchObject({
      externalId: 'etsy:3811712513',
      channel: 'etsy',
      source: 'etsy',
      revenue: 83.45,
      fees: 16.69,
      shippingCost: 5.83,
      state: 'TX',
      orderedAt: new Date(1_793_000_000 * 1000).toISOString(),
    })
    expect(order.lines).toEqual([
      { productName: 'Retro Roller Putter Cover', productSku: null, category: 'Headcover', quantity: 1, unitPrice: 80, lineRevenue: 80 },
    ])
  })

  it('drops the state outside the US and skips cancelled or fully refunded receipts', () => {
    expect(mapEtsyReceipt(receipt(1, { country_iso: 'CA', state: 'ON' })).state).toBeNull()
    expect(isCountedReceipt(receipt(1, { status: 'Canceled' }))).toBe(false)
    expect(isCountedReceipt(receipt(1, { status: 'Fully Refunded' }))).toBe(false)
    expect(isCountedReceipt(receipt(1, { status: 'Partially Refunded' }))).toBe(true)
    expect(isCountedReceipt(receipt(1, { status: 'Completed' }))).toBe(true)
  })
})

describe('etsyCostModel', () => {
  it('learns fee share and shipping from Sales Tracker Etsy rows only', () => {
    const live = { ...trackerOrder(9, 100, 99, 99), source: 'etsy' as const }
    const model = etsyCostModel([trackerOrder(1, 100, 20, 6), trackerOrder(2, 100, 10, 4), live])
    expect(model.feeRate).toBeCloseTo(0.15)
    expect(model.shippingPerOrder).toBeCloseTo(5)
    expect(etsyCostModel([])).toEqual({ feeRate: 0, shippingPerOrder: 0 })
  })
})

describe('syncEtsyToStore', () => {
  it('adds only receipts the Sales Tracker lacks, and leaves sheet rows alone', async () => {
    const store = createMemoryAnalyticsStore()
    await store.upsertOrders([trackerOrder(1, 93.45, 17.21, 5.83)])
    const calls = stubEtsy(() => [receipt(1), receipt(2), receipt(3, { status: 'Canceled' })])

    const r = await syncEtsyToStore(store, creds, { days: 30 })
    expect(r).toMatchObject({ receipts: 3, orders: 1, inTracker: 1, removed: 0, adSpendRows: 0, adSpend: 0 })

    const orders = await store.listOrders()
    expect(orders.find((o) => o.externalId === 'etsy:1')).toMatchObject({ source: 'sales-tracker', fees: 17.21 })
    const live = orders.find((o) => o.externalId === 'etsy:2')!
    expect(live.source).toBe('etsy')
    expect(live.fees).toBeCloseTo(17.21) // same fee share as the sheet's history
    expect(orders.some((o) => o.externalId === 'etsy:3')).toBe(false)

    // Etsy requires keystring:secret on every call, and receipts come with a min_created window.
    expect(calls.every((c) => c.headers['x-api-key'] === 'key:secret')).toBe(true)
    const receiptsUrl = new URL(calls.find((c) => c.url.includes('/receipts'))!.url)
    expect(Number(receiptsUrl.searchParams.get('min_created'))).toBeGreaterThan(0)

    const syncs = await store.latestSyncs()
    expect(syncs.find((s) => s.source === 'etsy')).toMatchObject({ status: 'ok' })
  })

  it('lets the Sales Tracker replace a live row, and removes live rows that get cancelled', async () => {
    const store = createMemoryAnalyticsStore()
    let status = 'Paid'
    stubEtsy(() => [receipt(2, { status }), receipt(4)])
    await syncEtsyToStore(store, creds)

    // The sheet catches up on #4: its row wins and the next Etsy sync leaves it be.
    await store.upsertOrders([trackerOrder(4, 93.45, 17.21, 5.83)])
    status = 'Canceled'
    const r = await syncEtsyToStore(store, creds)
    expect(r).toMatchObject({ orders: 0, inTracker: 1, removed: 1 })
    const orders = await store.listOrders()
    expect(orders.map((o) => [o.externalId, o.source])).toEqual([['etsy:4', 'sales-tracker']])
  })

  it('pages through every receipt', async () => {
    const store = createMemoryAnalyticsStore()
    stubEtsy(() => Array.from({ length: 5 }, (_, i) => receipt(100 + i)), 2)
    const r = await syncEtsyToStore(store, creds)
    expect(r.orders).toBe(5)
  })

  it('records the failure in sync history', async () => {
    const store = createMemoryAnalyticsStore()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }), { status: 400 })))
    await expect(syncEtsyToStore(store, creds)).rejects.toThrow(/expired/)
    expect((await store.latestSyncs())[0]).toMatchObject({ source: 'etsy', status: 'error' })
  })
})

describe('getEtsyAccessToken', () => {
  it('saves the rotated refresh token and reuses the access token until it expires', async () => {
    const store = createMemoryAnalyticsStore()
    const calls = stubEtsy(() => [])
    let now = 1_000_000
    const first = await getEtsyAccessToken(store, creds, () => now)
    expect(first.accessToken).toBe('123.access-1')
    expect(new URLSearchParams(calls[0].body).get('refresh_token')).toBe('seed-refresh')

    now += 30 * 60_000
    expect((await getEtsyAccessToken(store, creds, () => now)).accessToken).toBe('123.access-1')
    expect(calls).toHaveLength(1)

    now += 60 * 60_000
    expect((await getEtsyAccessToken(store, creds, () => now)).accessToken).toBe('123.access-2')
    expect(new URLSearchParams(calls[1].body).get('refresh_token')).toBe('rotated-1')
  })

  it('starts over from a new ETSY_REFRESH_TOKEN after someone signs in again', async () => {
    const store = createMemoryAnalyticsStore()
    const calls = stubEtsy(() => [])
    await getEtsyAccessToken(store, creds)
    await getEtsyAccessToken(store, { ...creds, refreshToken: 'new-seed' })
    expect(new URLSearchParams(calls[1].body).get('refresh_token')).toBe('new-seed')
  })
})

describe('Etsy env', () => {
  it('needs the keystring, shared secret and refresh token', () => {
    expect(loadEtsyCredentialsFromEnv({})).toBeNull()
    expect(etsyMissingEnv({ ETSY_KEYSTRING: 'k' })).toBe('ETSY_SHARED_SECRET, ETSY_REFRESH_TOKEN')
    expect(loadEtsyCredentialsFromEnv({ ETSY_KEYSTRING: 'k', ETSY_SHARED_SECRET: 's', ETSY_REFRESH_TOKEN: 'r' })).toEqual({
      keystring: 'k',
      sharedSecret: 's',
      refreshToken: 'r',
      shopId: null,
    })
  })
})

describe('Etsy ad spend in the sync', () => {
  const NOW = Date.parse('2026-11-04T18:00:00Z')
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)

  it('writes daily Etsy Ads spend and gives live orders their Offsite Ads fee', async () => {
    const store = createMemoryAnalyticsStore()
    stubEtsy(
      () => [receipt(2, { created_timestamp: at('2026-11-03T15:00:00Z') })],
      100,
      () => [
        { entry_id: 1, amount: -500, ledger_type: 'prolist', created_timestamp: at('2026-11-03T15:00:00Z') },
        { entry_id: 2, amount: -500, ledger_type: 'PROLIST', created_timestamp: at('2026-11-03T20:00:00Z') },
        { entry_id: 3, amount: -1402, ledger_type: 'offsite_ads_fee', reference_type: 'receipt', reference_id: 2, created_timestamp: at('2026-11-03T16:00:00Z') },
        { entry_id: 4, amount: -1600, ledger_type: 'TRANSACTION', created_timestamp: at('2026-11-03T16:00:00Z') },
      ],
    )
    const r = await syncEtsyToStore(store, creds, { now: () => NOW })
    expect(r).toMatchObject({ orders: 1, adSpendRows: 2, adSpend: 24.02 })
    expect(await store.listAdSpend()).toEqual([
      { date: '2026-11-03', platform: 'Etsy Ads', campaign: 'Etsy Ads', spend: 10, platformReportedSales: 0, platformReportedOrders: 0 },
      { date: '2026-11-03', platform: 'Etsy Ads', campaign: 'Offsite Ads', spend: 14.02, platformReportedSales: 93.45, platformReportedOrders: 1 },
    ])
    expect((await store.listOrders())[0]).toMatchObject({ externalId: 'etsy:2', marketingCost: 14.02 })
    expect((await store.latestSyncs())[0].message).toMatch(/Ad spend since .*\$24\.02/)
  })

  it('still syncs orders when the ledger is off limits', async () => {
    const store = createMemoryAnalyticsStore()
    const calls = stubEtsy(() => [receipt(2)])
    const fetchMock = vi.mocked(fetch)
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, init) =>
      String(url).includes('ledger-entries') ? new Response(JSON.stringify({ error: 'insufficient scope' }), { status: 403 }) : original(url, init),
    )
    const r = await syncEtsyToStore(store, creds, { now: () => NOW })
    expect(r).toMatchObject({ orders: 1, adSpendRows: 0, adSpend: null })
    expect((await store.latestSyncs())[0]).toMatchObject({ status: 'ok' })
    expect((await store.latestSyncs())[0].message).toMatch(/Ad spend skipped: .*insufficient scope/)
    expect(calls.length).toBeGreaterThan(0)
  })

  it('backfills the full window once, then looks back 45 days', async () => {
    const store = createMemoryAnalyticsStore()
    const calls = stubEtsy(() => [], 100, () => [
      { entry_id: 1, amount: -300, ledger_type: 'prolist', created_timestamp: at('2026-11-02T15:00:00Z') },
    ])
    // Earliest min_created among the ledger calls of the latest run, in days before now.
    const ledgerFrom = (since: number) => {
      const mins = calls.slice(since).filter((c) => c.url.includes('ledger-entries')).map((c) => Number(new URL(c.url).searchParams.get('min_created')))
      return Math.round((NOW / 1000 - Math.min(...mins)) / 86_400)
    }
    await syncEtsyToStore(store, creds, { days: 365, now: () => NOW })
    expect(ledgerFrom(0)).toBe(367)
    // 367 days in 30-day slices.
    expect(calls.filter((c) => c.url.includes('ledger-entries'))).toHaveLength(13)
    const before = calls.length
    await syncEtsyToStore(store, creds, { days: 365, now: () => NOW })
    expect(ledgerFrom(before)).toBe(47)
    // The ledger entry falls in one slice only, so it's counted once.
    expect((await store.listAdSpend()).map((r) => r.spend)).toEqual([3])
  })
})
