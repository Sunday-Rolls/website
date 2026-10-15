#!/usr/bin/env node
/**
 * Usage: npm run analytics:import-sheet -- /path/to/Sunday\ Rolls\ Sales\ Tracker.xlsx
 */
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import pg from 'pg'
import { parseCashRows, parseExpenseRows, parseSalesRows } from '../analytics/sheet-import.js'
import { createMemoryAnalyticsStore, createPgAnalyticsStore, type AnalyticsStore } from '../analytics/store.js'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npm run analytics:import-sheet -- <path-to-xlsx>')
  process.exit(1)
}

const workbook = new ExcelJS.Workbook()
const bytes = await readFile(filePath)
await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)

function sheetRows(name: string): unknown[][] {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) return []
  const rows: unknown[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[]
    // exceljs uses 1-based sparse arrays; densify so header.findIndex is safe
    const dense: unknown[] = []
    const last = Math.max(values.length - 1, 0)
    for (let i = 1; i <= last; i++) dense.push(values[i] ?? null)
    rows.push(dense)
  })
  return rows
}

const warnings: string[] = []
const orders = parseSalesRows(sheetRows('Sales') as never, warnings)
const expenses = parseExpenseRows(sheetRows('Expense Tracker.') as never, warnings)
const cashForecast = parseCashRows(sheetRows('Cash') as never)

console.log(`Parsed ${orders.length} orders, ${expenses.length} expenses, ${cashForecast.length} cash rows`)
for (const warning of warnings.slice(0, 20)) console.warn('warn:', warning)

const databaseUrl = process.env.DATABASE_URL?.trim()
let pool: pg.Pool | undefined
let store: AnalyticsStore

if (databaseUrl) {
  pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
  store = createPgAnalyticsStore(pool)
  await store.migrate()
} else {
  store = createMemoryAnalyticsStore()
  console.warn('DATABASE_URL unset — parsed only, not persisted')
}

const sync = await store.startSync('sales-tracker-sheet')
try {
  const nOrders = await store.replaceOrders(orders)
  const nExpenses = await store.replaceExpenses(expenses)
  const nCash = await store.replaceCashForecast(cashForecast)
  await store.finishSync(sync.id, 'ok', `Imported from ${filePath}`, nOrders + nExpenses + nCash)
  console.log('Import complete', { nOrders, nExpenses, nCash, persisted: Boolean(databaseUrl) })
} catch (error) {
  await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'import failed', 0)
  throw error
} finally {
  await pool?.end()
}
