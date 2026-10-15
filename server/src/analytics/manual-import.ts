import { randomUUID } from 'node:crypto'
import { mapChannel } from './sheet-import.js'
import type { CashForecastRow, Expense, Order, SalesChannel } from './types.js'

export type CsvImportResult<T> = {
  rows: T[]
  warnings: string[]
}

export type ManualImportKind = 'revenue' | 'expenses' | 'cash'

/** Downloadable starter CSVs — same columns the parsers accept. */
export const CSV_TEMPLATES: Record<ManualImportKind, { filename: string; body: string }> = {
  revenue: {
    filename: 'sunday-rolls-revenue-template.csv',
    body: [
      'date,channel,revenue,fees,shipping,marketing,product,external_id',
      '2026-10-01,etsy,92.50,15.20,5.70,0,Headcover,etsy-3811712513',
      '2026-10-02,ebay,80.00,12.00,7.50,0,Headcover,ebay-E42',
      '2026-10-03,other,80.00,0,0,0,In person,ip-2026-10-03',
      '',
    ].join('\n'),
  },
  expenses: {
    filename: 'sunday-rolls-expenses-template.csv',
    body: [
      'date,category,amount,bucket,explanation,product_line',
      '2026-10-01,Manufacturing,500,cogs,Alibaba batch,Headcover',
      '2026-10-05,Ads,250,sga,Meta boost,',
      '2026-10-08,Website,49,sga,Software,',
      '',
    ].join('\n'),
  },
  cash: {
    filename: 'sunday-rolls-cash-template.csv',
    body: [
      'month_end,beginning_balance,collections,freight_and_fees,marketing,website,manufacturing,ending_balance',
      '2026-10-31,10000,5200,-800,-400,-50,-1000,12950',
      '',
    ].join('\n'),
  },
}

export type ManualRevenueInput = {
  date: string
  channel: string
  revenue: number
  fees?: number
  shipping?: number
  marketing?: number
  product?: string
  externalId?: string
}

/** Build one manual order row (upsert key: channel + manual:channel:externalId). */
export function orderFromManualRevenue(input: ManualRevenueInput): Order | null {
  const day = toDate(input.date)
  if (!day) return null
  const channel = mapChannel(input.channel) as SalesChannel | null
  if (!channel) return null
  const revenue = Number(input.revenue)
  if (!Number.isFinite(revenue) || revenue === 0) return null
  const product = (input.product || '').trim() || (channel === 'etsy' ? 'Headcover' : 'Manual sale')
  const externalRaw = (input.externalId || '').trim() || `row-${day}-${Math.abs(revenue)}`
  return {
    id: randomUUID(),
    externalId: `manual:${channel}:${externalRaw}`,
    channel,
    source: 'manual',
    orderedAt: `${day}T12:00:00.000Z`,
    revenue,
    fees: Math.abs(Number(input.fees) || 0),
    shippingCost: Math.abs(Number(input.shipping) || 0),
    marketingCost: Math.abs(Number(input.marketing) || 0),
    state: null,
    customerEmail: null,
    isReturning: false,
    trafficSource: null,
    lines: [
      {
        productName: product,
        productSku: null,
        category: product,
        quantity: 1,
        unitPrice: revenue,
        lineRevenue: revenue,
      },
    ],
  }
}

/** Split a CSV line on commas, respecting simple double quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

export function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(splitCsvLine)
}

function headerIndex(header: string[], names: string[]): number {
  const normalized = header.map((h) => h.trim().toLowerCase())
  for (const name of names) {
    const i = normalized.findIndex((h) => h === name || h.includes(name))
    if (i >= 0) return i
  }
  return -1
}

function toNumber(value: string): number {
  const n = Number(String(value ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function toDate(value: string): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Manual revenue CSV columns (header required):
 * date, channel, revenue [, fees, shipping, marketing, product, external_id]
 */
export function parseRevenueCsv(text: string): CsvImportResult<Order> {
  const warnings: string[] = []
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], warnings: ['CSV needs a header row and at least one data row'] }
  const header = table[0]
  const idx = {
    date: headerIndex(header, ['date', 'ordered_at', 'order date']),
    channel: headerIndex(header, ['channel', 'platform', 'plateform']),
    revenue: headerIndex(header, ['revenue', 'amount', 'price', 'total']),
    fees: headerIndex(header, ['fees', 'fee']),
    shipping: headerIndex(header, ['shipping', 'shipping_cost']),
    marketing: headerIndex(header, ['marketing', 'marketing_cost', 'ads']),
    product: headerIndex(header, ['product', 'product_name', 'product category']),
    externalId: headerIndex(header, ['external_id', 'order_id', 'order number', 'id']),
  }
  if (idx.date < 0 || idx.channel < 0 || idx.revenue < 0) {
    return {
      rows: [],
      warnings: ['Revenue CSV requires columns: date, channel, revenue'],
    }
  }

  const rows: Order[] = []
  for (let r = 1; r < table.length; r++) {
    const line = table[r]
    const day = toDate(line[idx.date] ?? '')
    if (!day) {
      warnings.push(`Row ${r + 1}: bad date`)
      continue
    }
    const channel = mapChannel(line[idx.channel] ?? '') as SalesChannel | null
    if (!channel) {
      warnings.push(`Row ${r + 1}: unknown channel "${line[idx.channel]}"`)
      continue
    }
    const revenue = toNumber(line[idx.revenue] ?? '')
    if (!revenue) {
      warnings.push(`Row ${r + 1}: missing revenue`)
      continue
    }
    const product =
      (idx.product >= 0 ? String(line[idx.product] ?? '').trim() : '') ||
      (channel === 'shopify' ? 'Shopify order' : 'Manual sale')
    const externalRaw =
      (idx.externalId >= 0 ? String(line[idx.externalId] ?? '').trim() : '') || `manual-${day}-${r}`
    const fees = idx.fees >= 0 ? Math.abs(toNumber(line[idx.fees] ?? '')) : 0
    const shipping = idx.shipping >= 0 ? Math.abs(toNumber(line[idx.shipping] ?? '')) : 0
    const marketing = idx.marketing >= 0 ? Math.abs(toNumber(line[idx.marketing] ?? '')) : 0
    rows.push({
      id: randomUUID(),
      externalId: `manual:${channel}:${externalRaw}`,
      channel,
      source: 'manual',
      orderedAt: `${day}T12:00:00.000Z`,
      revenue,
      fees,
      shippingCost: shipping,
      marketingCost: marketing,
      state: null,
      customerEmail: null,
      isReturning: false,
      trafficSource: null,
      lines: [
        {
          productName: product,
          productSku: null,
          category: product,
          quantity: 1,
          unitPrice: revenue,
          lineRevenue: revenue,
        },
      ],
    })
  }
  return { rows, warnings }
}

/**
 * Expense CSV: date, category, amount, bucket [, explanation, product_line]
 * bucket = cogs | sga
 */
export function parseExpenseCsv(text: string): CsvImportResult<Expense> {
  const warnings: string[] = []
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], warnings: ['CSV needs a header row and at least one data row'] }
  const header = table[0]
  const idx = {
    date: headerIndex(header, ['date', 'spent_at']),
    category: headerIndex(header, ['category', 'expense category']),
    amount: headerIndex(header, ['amount', 'cost']),
    bucket: headerIndex(header, ['bucket', 'check', 'type']),
    explanation: headerIndex(header, ['explanation', 'notes', 'description']),
    productLine: headerIndex(header, ['product_line', 'product', 'product line']),
  }
  if (idx.date < 0 || idx.category < 0 || idx.amount < 0) {
    return { rows: [], warnings: ['Expense CSV requires columns: date, category, amount'] }
  }

  const rows: Expense[] = []
  for (let r = 1; r < table.length; r++) {
    const line = table[r]
    const spentAt = toDate(line[idx.date] ?? '')
    if (!spentAt) {
      warnings.push(`Row ${r + 1}: bad date`)
      continue
    }
    const amount = Math.abs(toNumber(line[idx.amount] ?? ''))
    if (!amount) {
      warnings.push(`Row ${r + 1}: missing amount`)
      continue
    }
    const bucketRaw = (idx.bucket >= 0 ? String(line[idx.bucket] ?? '') : 'cogs').toLowerCase()
    const bucket: Expense['bucket'] = bucketRaw.includes('sg') ? 'sga' : 'cogs'
    rows.push({
      id: randomUUID(),
      spentAt,
      category: String(line[idx.category] ?? 'Other').trim() || 'Other',
      explanation: idx.explanation >= 0 ? String(line[idx.explanation] ?? '').trim() : '',
      amount,
      bucket,
      productLine:
        idx.productLine >= 0 ? String(line[idx.productLine] ?? '').trim() || null : null,
    })
  }
  return { rows, warnings }
}

/**
 * Cash CSV: month_end, beginning_balance, collections, freight_and_fees, marketing, website, manufacturing, ending_balance
 */
export function parseCashCsv(text: string): CsvImportResult<CashForecastRow> {
  const warnings: string[] = []
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], warnings: ['CSV needs a header row and at least one data row'] }
  const header = table[0]
  const idx = {
    monthEnd: headerIndex(header, ['month_end', 'month', 'date']),
    beginning: headerIndex(header, ['beginning_balance', 'beginning']),
    collections: headerIndex(header, ['collections']),
    freight: headerIndex(header, ['freight_and_fees', 'freight']),
    marketing: headerIndex(header, ['marketing']),
    website: headerIndex(header, ['website']),
    manufacturing: headerIndex(header, ['manufacturing']),
    ending: headerIndex(header, ['ending_balance', 'ending']),
  }
  if (idx.monthEnd < 0 || idx.ending < 0) {
    return {
      rows: [],
      warnings: ['Cash CSV requires at least month_end and ending_balance'],
    }
  }

  const rows: CashForecastRow[] = []
  for (let r = 1; r < table.length; r++) {
    const line = table[r]
    const monthEnd = toDate(line[idx.monthEnd] ?? '')
    if (!monthEnd) {
      warnings.push(`Row ${r + 1}: bad month_end`)
      continue
    }
    rows.push({
      monthEnd,
      beginningBalance: idx.beginning >= 0 ? toNumber(line[idx.beginning] ?? '') : 0,
      collections: idx.collections >= 0 ? toNumber(line[idx.collections] ?? '') : 0,
      freightAndFees: idx.freight >= 0 ? toNumber(line[idx.freight] ?? '') : 0,
      marketing: idx.marketing >= 0 ? toNumber(line[idx.marketing] ?? '') : 0,
      website: idx.website >= 0 ? toNumber(line[idx.website] ?? '') : 0,
      manufacturing: idx.manufacturing >= 0 ? toNumber(line[idx.manufacturing] ?? '') : 0,
      endingBalance: toNumber(line[idx.ending] ?? ''),
    })
  }
  return { rows, warnings }
}
