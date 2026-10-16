import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import { mapChannel } from './sheet-import.js'
import type { AnalyticsStore } from './store.js'
import type { CashForecastRow, Expense, Order, OrderSource, SalesChannel } from './types.js'

const REVENUE_HEADERS = [
  'date',
  'channel',
  'source',
  'revenue',
  'fees',
  'shipping',
  'marketing',
  'product',
  'external_id',
] as const

const EXPENSE_HEADERS = [
  'id',
  'date',
  'category',
  'amount',
  'bucket',
  'explanation',
  'product_line',
] as const

const CASH_HEADERS = [
  'month_end',
  'beginning_balance',
  'collections',
  'freight_and_fees',
  'marketing',
  'website',
  'manufacturing',
  'ending_balance',
] as const

export type ManualWorkbookParseResult = {
  orders: Order[]
  expenses: Expense[]
  cash: CashForecastRow[]
  warnings: string[]
  sheets: { revenue: boolean; expenses: boolean; cash: boolean }
}

export type ManualWorkbookApplyResult = {
  deletedManualOrders: number
  deletedTrackerOrders: number
  upsertedOrders: number
  expenses: number
  cash: number
  warnings: string[]
}

/** Orders editable via the workbook (Shopify stays on live sync). */
export function isWorkbookEditableOrder(order: Order): boolean {
  return order.source === 'manual' || order.source === 'sales-tracker'
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return String(value).trim()
}

function toDate(value: unknown): string | null {
  const raw = cellText(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = cellText(value).replace(/[$,]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function headerIndex(header: string[], aliases: string[]): number {
  const normalized = header.map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  for (const alias of aliases) {
    const i = normalized.indexOf(alias.toLowerCase().replace(/\s+/g, '_'))
    if (i >= 0) return i
  }
  return -1
}

function sheetMatrix(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]
    const dense: string[] = []
    const last = Math.max(values.length - 1, 0)
    for (let i = 1; i <= last; i++) dense.push(cellText(values[i]))
    if (dense.some((c) => c !== '')) rows.push(dense)
  })
  return rows
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7DECE' },
  }
}

export async function buildManualWorkbook(store: AnalyticsStore): Promise<Buffer> {
  const [orders, expenses, cash] = await Promise.all([
    store.listOrders(),
    store.listExpenses(),
    store.listCashForecast(),
  ])

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Sunday Rolls Dashboard'
  workbook.created = new Date()

  const instructions = workbook.addWorksheet('Instructions')
  instructions.getColumn(1).width = 100
  const lines = [
    'Sunday Rolls — dashboard data workbook',
    '',
    'Workflow',
    '1. Download this file from the dashboard (P&L → Download data workbook).',
    '2. Edit any sheet: add rows, change numbers, or delete rows you no longer want.',
    '3. Upload the same file back (P&L → Upload workbook).',
    '4. Upload REPLACES editable data from the file — deleted rows are removed from the database.',
    '',
    'Sheets',
    '• Revenue — Etsy / eBay / Squarespace / other / Sales Tracker history (NOT live Shopify).',
    '• Expenses — all expense lines (full replace on upload).',
    '• Cash — month-end cash forecast (full replace on upload).',
    '',
    'Rules',
    '• Leave the header row in place.',
    '• Revenue.source should be "manual" or "sales-tracker".',
    '• external_id keeps rows stable across uploads; leave blank only for brand-new rows.',
    '• Shopify website sales are NOT in this file — use Data → Sync Shopify.',
    '• Removing a row and re-uploading deletes that row from the dashboard.',
  ]
  lines.forEach((line, i) => {
    instructions.getCell(i + 1, 1).value = line
  })
  instructions.getCell(1, 1).font = { bold: true, size: 14 }

  const revenueSheet = workbook.addWorksheet('Revenue')
  revenueSheet.addRow([...REVENUE_HEADERS])
  styleHeader(revenueSheet.getRow(1))
  const editable = orders
    .filter(isWorkbookEditableOrder)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
  for (const order of editable) {
    revenueSheet.addRow([
      order.orderedAt.slice(0, 10),
      order.channel,
      order.source,
      order.revenue,
      order.fees,
      order.shippingCost,
      order.marketingCost,
      order.lines[0]?.productName ?? '',
      order.externalId,
    ])
  }
  REVENUE_HEADERS.forEach((_, i) => {
    revenueSheet.getColumn(i + 1).width = i === 7 || i === 8 ? 28 : 14
  })

  const expenseSheet = workbook.addWorksheet('Expenses')
  expenseSheet.addRow([...EXPENSE_HEADERS])
  styleHeader(expenseSheet.getRow(1))
  const sortedExpenses = [...expenses].sort((a, b) => b.spentAt.localeCompare(a.spentAt))
  for (const row of sortedExpenses) {
    expenseSheet.addRow([
      row.id,
      row.spentAt,
      row.category,
      row.amount,
      row.bucket,
      row.explanation,
      row.productLine ?? '',
    ])
  }
  EXPENSE_HEADERS.forEach((_, i) => {
    expenseSheet.getColumn(i + 1).width = i === 0 || i === 5 ? 28 : 14
  })

  const cashSheet = workbook.addWorksheet('Cash')
  cashSheet.addRow([...CASH_HEADERS])
  styleHeader(cashSheet.getRow(1))
  const sortedCash = [...cash].sort((a, b) => a.monthEnd.localeCompare(b.monthEnd))
  for (const row of sortedCash) {
    cashSheet.addRow([
      row.monthEnd,
      row.beginningBalance,
      row.collections,
      row.freightAndFees,
      row.marketing,
      row.website,
      row.manufacturing,
      row.endingBalance,
    ])
  }
  CASH_HEADERS.forEach((_, i) => {
    cashSheet.getColumn(i + 1).width = 16
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function parseManualWorkbook(buffer: Buffer): Promise<ManualWorkbookParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)

  const warnings: string[] = []
  const orders: Order[] = []
  const expenses: Expense[] = []
  const cash: CashForecastRow[] = []
  const sheets = { revenue: false, expenses: false, cash: false }

  const revenue = workbook.getWorksheet('Revenue')
  if (!revenue) {
    warnings.push('Missing "Revenue" sheet — no order changes applied from workbook')
  } else {
    sheets.revenue = true
    const table = sheetMatrix(revenue)
    if (table.length >= 2) {
      const header = table[0]!
      const idx = {
        date: headerIndex(header, ['date', 'ordered_at']),
        channel: headerIndex(header, ['channel', 'platform']),
        source: headerIndex(header, ['source']),
        revenue: headerIndex(header, ['revenue', 'amount', 'total']),
        fees: headerIndex(header, ['fees', 'fee']),
        shipping: headerIndex(header, ['shipping', 'shipping_cost']),
        marketing: headerIndex(header, ['marketing', 'marketing_cost']),
        product: headerIndex(header, ['product', 'product_name']),
        externalId: headerIndex(header, ['external_id', 'order_id', 'id']),
      }
      if (idx.date < 0 || idx.channel < 0 || idx.revenue < 0) {
        warnings.push('Revenue sheet needs columns: date, channel, revenue')
      } else {
        for (let r = 1; r < table.length; r++) {
          const line = table[r]!
          const day = toDate(line[idx.date])
          if (!day) {
            warnings.push(`Revenue row ${r + 1}: bad date`)
            continue
          }
          const channel = mapChannel(line[idx.channel] ?? '') as SalesChannel | null
          if (!channel) {
            warnings.push(`Revenue row ${r + 1}: unknown channel "${line[idx.channel]}"`)
            continue
          }
          const revenueAmt = toNumber(line[idx.revenue])
          if (!revenueAmt) {
            warnings.push(`Revenue row ${r + 1}: missing revenue`)
            continue
          }
          let source = (idx.source >= 0 ? cellText(line[idx.source]).toLowerCase() : 'manual') as OrderSource
          if (source !== 'manual' && source !== 'sales-tracker') {
            if (source === 'shopify') {
              warnings.push(`Revenue row ${r + 1}: skipped Shopify row (use Data → Sync Shopify)`)
              continue
            }
            source = 'manual'
          }
          const product =
            (idx.product >= 0 ? cellText(line[idx.product]) : '') ||
            (channel === 'etsy' ? 'Headcover' : 'Sale')
          let externalId =
            idx.externalId >= 0 ? cellText(line[idx.externalId]) : ''
          if (!externalId) {
            externalId =
              source === 'manual'
                ? `manual:${channel}:${day}-${r}-${Math.abs(revenueAmt)}`
                : `${channel}:${day}-${r}`
          } else if (source === 'manual' && !externalId.startsWith('manual:')) {
            externalId = `manual:${channel}:${externalId}`
          }
          orders.push({
            id: randomUUID(),
            externalId,
            channel,
            source,
            orderedAt: `${day}T12:00:00.000Z`,
            revenue: revenueAmt,
            fees: idx.fees >= 0 ? Math.abs(toNumber(line[idx.fees])) : 0,
            shippingCost: idx.shipping >= 0 ? Math.abs(toNumber(line[idx.shipping])) : 0,
            marketingCost: idx.marketing >= 0 ? Math.abs(toNumber(line[idx.marketing])) : 0,
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
                unitPrice: revenueAmt,
                lineRevenue: revenueAmt,
              },
            ],
          })
        }
      }
    }
  }

  const expenseSheet = workbook.getWorksheet('Expenses')
  if (!expenseSheet) {
    warnings.push('Missing "Expenses" sheet — expenses left unchanged')
  } else {
    sheets.expenses = true
    const table = sheetMatrix(expenseSheet)
    if (table.length >= 2) {
      const header = table[0]!
      const idx = {
        id: headerIndex(header, ['id']),
        date: headerIndex(header, ['date', 'spent_at']),
        category: headerIndex(header, ['category']),
        amount: headerIndex(header, ['amount', 'cost']),
        bucket: headerIndex(header, ['bucket', 'type']),
        explanation: headerIndex(header, ['explanation', 'notes', 'description']),
        productLine: headerIndex(header, ['product_line', 'product']),
      }
      if (idx.date < 0 || idx.category < 0 || idx.amount < 0) {
        warnings.push('Expenses sheet needs columns: date, category, amount')
      } else {
        for (let r = 1; r < table.length; r++) {
          const line = table[r]!
          const day = toDate(line[idx.date])
          if (!day) {
            warnings.push(`Expenses row ${r + 1}: bad date`)
            continue
          }
          const category = cellText(line[idx.category])
          const amount = toNumber(line[idx.amount])
          if (!category || !amount) {
            warnings.push(`Expenses row ${r + 1}: needs category and amount`)
            continue
          }
          const bucketRaw = idx.bucket >= 0 ? cellText(line[idx.bucket]).toLowerCase() : 'cogs'
          const bucket = bucketRaw.startsWith('sg') ? 'sga' : 'cogs'
          const id = idx.id >= 0 && cellText(line[idx.id]) ? cellText(line[idx.id]) : randomUUID()
          expenses.push({
            id,
            spentAt: day,
            category,
            amount: Math.abs(amount),
            bucket,
            explanation: idx.explanation >= 0 ? cellText(line[idx.explanation]) : '',
            productLine: idx.productLine >= 0 ? cellText(line[idx.productLine]) || null : null,
          })
        }
      }
    }
  }

  const cashSheet = workbook.getWorksheet('Cash')
  if (!cashSheet) {
    warnings.push('Missing "Cash" sheet — cash forecast left unchanged')
  } else {
    sheets.cash = true
    const table = sheetMatrix(cashSheet)
    if (table.length >= 2) {
      const header = table[0]!
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
        warnings.push('Cash sheet needs columns: month_end, ending_balance')
      } else {
        for (let r = 1; r < table.length; r++) {
          const line = table[r]!
          const monthEnd = toDate(line[idx.monthEnd])
          if (!monthEnd) {
            warnings.push(`Cash row ${r + 1}: bad month_end`)
            continue
          }
          cash.push({
            monthEnd,
            beginningBalance: idx.beginning >= 0 ? toNumber(line[idx.beginning]) : 0,
            collections: idx.collections >= 0 ? toNumber(line[idx.collections]) : 0,
            freightAndFees: idx.freight >= 0 ? toNumber(line[idx.freight]) : 0,
            marketing: idx.marketing >= 0 ? toNumber(line[idx.marketing]) : 0,
            website: idx.website >= 0 ? toNumber(line[idx.website]) : 0,
            manufacturing: idx.manufacturing >= 0 ? toNumber(line[idx.manufacturing]) : 0,
            endingBalance: toNumber(line[idx.ending]),
          })
        }
      }
    }
  }

  return { orders, expenses, cash, warnings, sheets }
}

export async function applyManualWorkbook(
  store: AnalyticsStore,
  parsed: ManualWorkbookParseResult,
): Promise<ManualWorkbookApplyResult> {
  let deletedManualOrders = 0
  let deletedTrackerOrders = 0
  let upsertedOrders = 0
  let expenses = 0
  let cash = 0

  if (parsed.sheets.revenue) {
    deletedManualOrders = await store.deleteOrders({ source: 'manual' })
    deletedTrackerOrders = await store.deleteOrders({ source: 'sales-tracker' })
    upsertedOrders = await store.upsertOrders(parsed.orders)
  }
  if (parsed.sheets.expenses) {
    expenses = await store.replaceExpenses(parsed.expenses)
  }
  if (parsed.sheets.cash) {
    cash = await store.replaceCashForecast(parsed.cash)
  }

  return {
    deletedManualOrders,
    deletedTrackerOrders,
    upsertedOrders,
    expenses,
    cash,
    warnings: parsed.warnings,
  }
}
