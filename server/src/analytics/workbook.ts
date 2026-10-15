import ExcelJS from 'exceljs'
import { parseCashRows, parseExpenseRows, parseSalesRows, type SheetImportResult } from './sheet-import.js'
import type { CashForecastRow, Expense, Order } from './types.js'

export type ParseWorkbookOptions = {
  /** Default true — live Shopify sync owns shopify channel after cutover. */
  skipShopifyChannel?: boolean
}

export async function parseWorkbookBuffer(
  buffer: Buffer,
  options: ParseWorkbookOptions = {},
): Promise<SheetImportResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)

  function sheetRows(name: string): unknown[][] {
    const sheet = workbook.getWorksheet(name)
    if (!sheet) return []
    const rows: unknown[][] = []
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[]
      const dense: unknown[] = []
      const last = Math.max(values.length - 1, 0)
      for (let i = 1; i <= last; i++) dense.push(values[i] ?? null)
      rows.push(dense)
    })
    return rows
  }

  const warnings: string[] = []
  const orders = parseSalesRows(sheetRows('Sales') as never, warnings, {
    skipShopifyChannel: options.skipShopifyChannel,
  })
  const expenses = parseExpenseRows(sheetRows('Expense Tracker.') as never, warnings)
  if (!workbook.getWorksheet('Sales')) warnings.push('Missing "Sales" tab')
  if (!workbook.getWorksheet('Expense Tracker.')) warnings.push('Missing "Expense Tracker." tab')
  const cashForecast = parseCashRows(sheetRows('Cash') as never)
  return { orders, expenses, cashForecast, warnings }
}

export function filterOrdersByDate(orders: Order[], start?: string | null, end?: string | null): Order[] {
  if (!start && !end) return orders
  return orders.filter((o) => {
    const day = o.orderedAt.slice(0, 10)
    if (start && day < start) return false
    if (end && day > end) return false
    return true
  })
}

export function filterExpensesByDate(expenses: Expense[], start?: string | null, end?: string | null): Expense[] {
  if (!start && !end) return expenses
  return expenses.filter((e) => {
    if (start && e.spentAt < start) return false
    if (end && e.spentAt > end) return false
    return true
  })
}

export function filterCashByDate(
  rows: CashForecastRow[],
  start?: string | null,
  end?: string | null,
): CashForecastRow[] {
  if (!start && !end) return rows
  return rows.filter((r) => {
    if (start && r.monthEnd < start) return false
    if (end && r.monthEnd > end) return false
    return true
  })
}
