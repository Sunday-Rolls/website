import { describe, expect, it, vi } from 'vitest'

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'tok' }) }
    }
  },
}))

import {
  buildReportTables,
  reportsSheetMissingEnv,
  safeCell,
  writeReportTables,
  DATA_TAB_PREFIX,
} from './reports-sheet.js'
import type { Order } from './types.js'

const order = (over: Partial<Order>): Order => ({
  id: 'id',
  externalId: '1001',
  channel: 'shopify',
  source: 'shopify',
  orderedAt: '2026-11-05T18:00:00Z',
  revenue: 110,
  fees: 4,
  shippingCost: 6,
  marketingCost: 0,
  state: 'MN',
  customerEmail: 'a@example.com',
  isReturning: false,
  trafficSource: 'google / cpc',
  lines: [{ productName: 'Retro Roller – Grey', productSku: 'RR-G', category: 'Headcovers', quantity: 1, unitPrice: 80, lineRevenue: 80 }],
  ...over,
})

describe('buildReportTables', () => {
  const tables = buildReportTables({
    orders: [
      order({}),
      // Sales Tracker copy of a Shopify order: dropped in favour of the live one.
      order({ id: 'dup', source: 'sales-tracker', externalId: 'T1' }),
      order({
        id: 'e1',
        externalId: '555',
        channel: 'etsy',
        source: 'sales-tracker',
        orderedAt: '2026-10-20',
        revenue: 68,
        lines: [{ productName: 'Headcover', productSku: null, category: null, quantity: 1, unitPrice: 68, lineRevenue: 68 }],
      }),
    ],
    adSpend: [
      { date: '2026-11-01', platform: 'Meta Ads', campaign: 'Prospecting', spend: 12.345, platformReportedSales: 0, platformReportedOrders: 0 },
    ],
    traffic: [
      {
        date: '2026-11-01',
        channel: 'website',
        visits: 50,
        uniqueVisitors: 40,
        productViews: 30,
        addToCarts: 3,
        checkouts: 2,
        purchases: 1,
        sourceBreakdown: { 'google / cpc': 20, 'direct / (none)': 30, 'x / y': 0 },
      },
    ],
    generatedAt: '2026-11-13T19:00:00.000Z',
  })
  const byTitle = Object.fromEntries(tables.map((t) => [t.title.replace(DATA_TAB_PREFIX, ''), t]))

  it('prefixes every tab so Railway only owns its own tabs', () => {
    expect(tables.every((t) => t.title.startsWith(DATA_TAB_PREFIX))).toBe(true)
  })

  it('dedupes orders like the dashboard and computes net', () => {
    const rows = byTitle.Orders.rows
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(expect.arrayContaining(['2026-10-20', 'Etsy', 'Etsy sale (design not recorded)']))
    const shop = rows[1]
    expect(shop[2]).toBe('Website (Shopify)')
    expect(shop[5]).toBe('Retro Roller - Grey')
    expect(shop[11]).toBe(100)
  })

  it('rolls products up by month', () => {
    expect(byTitle['Products by month'].rows).toEqual([
      ['2026-10-01', 'Etsy sale (design not recorded)', 'Design not recorded', 1, 68, 1],
      ['2026-11-01', 'Retro Roller - Grey', 'Headcovers', 1, 80, 1],
    ])
  })

  it('keeps ad spend and traffic sources', () => {
    expect(byTitle['Ad spend'].rows[0]).toEqual(['2026-11-01', '2026-11-01', 'Meta Ads', 'Prospecting', 12.35, 0, 0, 0])
    expect(byTitle['Traffic sources'].rows).toEqual([
      ['2026-11-01', '2026-11-01', 'direct / (none)', 30],
      ['2026-11-01', '2026-11-01', 'google / cpc', 20],
    ])
  })

  it('leaves customer emails out of the sheet', () => {
    expect(JSON.stringify(tables)).not.toContain('a@example.com')
  })
})

describe('reportsSheetMissingEnv / safeCell', () => {
  it('names what is missing', () => {
    expect(reportsSheetMissingEnv({})).toBe('GOOGLE_SERVICE_ACCOUNT_JSON, REPORTS_SHEET_ID')
    expect(
      reportsSheetMissingEnv({
        GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
        REPORTS_SHEET_ID: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
      }),
    ).toBeNull()
  })

  it('stops text from being read as a formula', () => {
    expect(safeCell('=IMPORTXML("x")')).toBe(`'=IMPORTXML("x")`)
    expect(safeCell('-')).toBe(`'-`)
    expect(safeCell(-5)).toBe(-5)
    expect(safeCell(null)).toBe('')
  })
})

describe('writeReportTables', () => {
  const creds = { serviceAccountJson: JSON.stringify({ client_email: 'bot@proj.iam.gserviceaccount.com' }), spreadsheetId: 'sheet1' }
  const tables = [{ title: `${DATA_TAB_PREFIX}Orders`, header: ['A'], rows: [[1], [2]] }]

  it('adds missing tabs, sizes them, clears and writes', async () => {
    const calls: Array<{ url: string; body?: unknown }> = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.includes('?fields=')) return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 0, title: 'Mine' } }] }))
      if (url.endsWith(':batchUpdate') && calls.filter((c) => c.url.endsWith(':batchUpdate')).length === 1) {
        return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 7, title: `${DATA_TAB_PREFIX}Orders` } } }] }))
      }
      return new Response('{}')
    }) as unknown as typeof fetch
    expect(await writeReportTables(creds, tables, fetchImpl)).toBe(2)
    expect(calls.map((c) => c.url.replace('https://sheets.googleapis.com/v4/spreadsheets/sheet1', ''))).toEqual([
      '?fields=sheets.properties(sheetId,title)',
      ':batchUpdate',
      ':batchUpdate',
      '/values:batchClear',
      '/values:batchUpdate',
    ])
    expect(JSON.stringify(calls[2].body)).toContain('"sheetId":7')
    expect(calls[3].body).toEqual({ ranges: [`'${DATA_TAB_PREFIX}Orders'`] })
    expect(calls[4].body).toMatchObject({ data: [{ values: [['A'], [1], [2]] }] })
  })

  it('explains a permission error', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'denied' } }), { status: 403 })) as unknown as typeof fetch
    await expect(writeReportTables(creds, tables, fetchImpl)).rejects.toThrow(/share the reports sheet with bot@proj\.iam\.gserviceaccount\.com as Editor/)
  })
})
