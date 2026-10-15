import { randomUUID } from 'node:crypto'
import type { CashForecastRow, Expense, Order, SalesChannel } from './types.js'

export type SheetImportResult = {
  orders: Order[]
  expenses: Expense[]
  cashForecast: CashForecastRow[]
  warnings: string[]
}

type Cell = string | number | boolean | Date | null | undefined | { result?: unknown; text?: string; richText?: unknown; formula?: string }

/** Pure parsers used by the CLI importer and tests (no exceljs dependency here). */
export function parseSalesRows(rows: Cell[][], warnings: string[] = []): Order[] {
  if (rows.length < 2) return []
  const header = normalizeHeader(rows[0])
  const idx = {
    order: findCol(header, ['order numbers', 'order number', 'unique formual', 'unique formula']),
    platform: findCol(header, ['plateform', 'platform']),
    date: findCol(header, ['date']),
    price: findCol(header, ['price']),
    fee: findCol(header, ['fee']),
    shipping: findCol(header, ['shipping']),
    marketing: findCol(header, ['marketing']),
    product: findCol(header, ['product category', 'product']),
  }
  if (idx.platform < 0 || idx.date < 0 || idx.price < 0) {
    warnings.push('Sales sheet missing Platform/Date/Price columns')
    return []
  }

  const orders: Order[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => unwrapCell(c) == null || unwrapCell(c) === '')) continue
    const platform = String(unwrapCell(row[idx.platform]) ?? '').trim()
    if (!platform) continue
    const channel = mapChannel(platform)
    if (!channel) {
      warnings.push(`Unknown platform "${platform}" on Sales row ${r + 1}`)
      continue
    }
    const orderedAt = toIsoDate(unwrapCell(row[idx.date]) as Cell)
    if (!orderedAt) continue
    const revenue = toNumber(unwrapCell(row[idx.price]) as Cell)
    if (!revenue) continue
    const externalId = String(unwrapCell(row[idx.order]) ?? `sales-row-${r}`).trim()
    const productName = String(unwrapCell(row[idx.product]) ?? 'Headcover').trim() || 'Headcover'
    orders.push({
      id: randomUUID(),
      externalId: `${channel}:${externalId}`,
      channel,
      orderedAt,
      revenue,
      fees: Math.abs(toNumber(unwrapCell(row[idx.fee]) as Cell)),
      shippingCost: Math.abs(toNumber(unwrapCell(row[idx.shipping]) as Cell)),
      marketingCost: Math.abs(toNumber(unwrapCell(row[idx.marketing]) as Cell)),
      state: null,
      customerEmail: null,
      isReturning: false,
      trafficSource: null,
      lines: [
        {
          productName,
          productSku: null,
          category: productName,
          quantity: 1,
          unitPrice: revenue,
          lineRevenue: revenue,
        },
      ],
    })
  }
  return orders
}

export function parseExpenseRows(rows: Cell[][], warnings: string[] = []): Expense[] {
  if (rows.length < 2) return []
  // Find header row (sheet has blank lead-in)
  let headerRow = 0
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = rows[i].map((c) => String(c ?? '').toLowerCase()).join(' ')
    if (joined.includes('expense category') || joined.includes('categoy')) {
      headerRow = i
      break
    }
  }
  const header = normalizeHeader(rows[headerRow])
  const idx = {
    productLine: findCol(header, ['categoy', 'category']),
    category: findCol(header, ['expense category']),
    explanation: findCol(header, ['explanation']),
    cost: findCol(header, ['cost']),
    date: findCol(header, ['date']),
    bucket: findCol(header, ['check']),
  }
  if (idx.category < 0 || idx.cost < 0) {
    warnings.push('Expense Tracker missing category/cost columns')
    return []
  }

  const expenses: Expense[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => c == null || c === '')) continue
    const amount = Math.abs(toNumber(unwrapCell(row[idx.cost]) as Cell))
    if (!amount) continue
    const spentAt = toIsoDate(unwrapCell(row[idx.date]) as Cell) ?? '2025-01-01'
    const check = String(unwrapCell(row[idx.bucket]) ?? '').toUpperCase()
    const bucket: Expense['bucket'] = check.includes('SG') ? 'sga' : 'cogs'
    expenses.push({
      id: randomUUID(),
      spentAt: spentAt.slice(0, 10),
      category: String(unwrapCell(row[idx.category]) ?? 'Other').trim() || 'Other',
      explanation: String(unwrapCell(row[idx.explanation]) ?? '').trim(),
      amount,
      bucket,
      productLine: optional(unwrapCell(row[idx.productLine]) as Cell),
    })
  }
  return expenses
}

export function parseCashRows(rows: Cell[][]): CashForecastRow[] {
  if (rows.length < 4) return []
  // Row with month-end dates (often row index 1 in exported sheet)
  let dateRowIdx = -1
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some((c) => {
      const v = unwrapCell(c)
      return v instanceof Date || looksLikeDate(v as Cell)
    })) {
      dateRowIdx = i
      break
    }
  }
  if (dateRowIdx < 0) return []

  const dates = rows[dateRowIdx]
    .map((c, col) => ({ col, date: toIsoDate(unwrapCell(c) as Cell)?.slice(0, 10) }))
    .filter((d): d is { col: number; date: string } => Boolean(d.date))

  const findRow = (label: string) =>
    rows.findIndex((row) =>
      row.some((c) => String(unwrapCell(c) ?? '').trim().toLowerCase() === label.toLowerCase()),
    )

  const beginning = findRow('Beginning Balance')
  const collections = findRow('Collections')
  const freight = findRow('Freight and Fees')
  const marketing = findRow('Marketing')
  const website = findRow('Website')
  const manufacturing = findRow('Manufacturing')
  const ending = findRow('Ending Balance')

  return dates.map(({ col, date }) => ({
    monthEnd: date,
    beginningBalance: toNumber(unwrapCell(rows[beginning]?.[col]) as Cell),
    collections: toNumber(unwrapCell(rows[collections]?.[col]) as Cell),
    freightAndFees: toNumber(unwrapCell(rows[freight]?.[col]) as Cell),
    marketing: toNumber(unwrapCell(rows[marketing]?.[col]) as Cell),
    website: toNumber(unwrapCell(rows[website]?.[col]) as Cell),
    manufacturing: toNumber(unwrapCell(rows[manufacturing]?.[col]) as Cell),
    endingBalance: toNumber(unwrapCell(rows[ending]?.[col]) as Cell),
  }))
}

/** exceljs returns `{ formula, result }` for calculated cells — use the result. */
export function unwrapCell(value: Cell): string | number | boolean | Date | null | undefined {
  if (value == null) return value
  if (typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value) return unwrapCell(value.result as Cell)
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: string }) => part.text ?? '').join('')
    }
    return null
  }
  return value
}

export function mapChannel(platform: string): SalesChannel | null {
  const p = platform.trim().toLowerCase()
  if (!p) return null
  if (p.includes('etsy')) return 'etsy'
  if (p.includes('square')) return 'squarespace'
  if (p.includes('shopify')) return 'shopify'
  if (p.includes('ebay') || p.includes('e bay')) return 'ebay'
  if (p.includes('other') || p.includes('instagram') || p.includes('person') || p.includes('in person')) {
    return 'other'
  }
  return 'other'
}

function normalizeHeader(row: Cell[] | undefined): string[] {
  if (!row) return []
  const max = Math.max(row.length, 0)
  const out: string[] = []
  for (let i = 0; i < max; i++) {
    out.push(String(unwrapCell(row[i]) ?? '').trim().toLowerCase())
  }
  return out
}

function findCol(header: string[], names: string[]): number {
  for (const name of names) {
    const i = header.findIndex((h) => h === name || (h?.includes(name) ?? false))
    if (i >= 0) return i
  }
  return -1
}

function toNumber(value: Cell): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value.replace(/[$,]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toIsoDate(value: Cell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'number') {
    // Excel serial date
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return utc.toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

function looksLikeDate(value: Cell): boolean {
  return toIsoDate(value) != null
}

function optional(value: Cell): string | null {
  if (value == null || value === '') return null
  return String(value).trim() || null
}
