import { downloadDriveWorkbook } from './drive.js'
import type { AnalyticsStore } from './store.js'
import {
  filterCashByDate,
  filterExpensesByDate,
  filterOrdersByDate,
  parseWorkbookBuffer,
} from './workbook.js'

export type SalesTrackerSyncOptions = {
  /** Inclusive YYYY-MM-DD. Omit both for full workbook. */
  start?: string | null
  end?: string | null
  /** When true, replace all orders/expenses/cash instead of upserting the filtered set. */
  replaceAll?: boolean
  /** Include cash forecast rows (default true when no date filter). */
  includeCash?: boolean
}

export type SalesTrackerSyncResult = {
  sourceLabel: string
  start: string | null
  end: string | null
  orders: number
  expenses: number
  cashRows: number
  warnings: string[]
}

export async function syncSalesTrackerFromBuffer(
  store: AnalyticsStore,
  buffer: Buffer,
  sourceLabel: string,
  options: SalesTrackerSyncOptions = {},
): Promise<SalesTrackerSyncResult> {
  const sync = await store.startSync('sales-tracker')
  try {
    const parsed = await parseWorkbookBuffer(buffer)
    const start = options.start || null
    const end = options.end || null
    const orders = filterOrdersByDate(parsed.orders, start, end)
    const expenses = filterExpensesByDate(parsed.expenses, start, end)
    const includeCash = options.includeCash ?? !(start || end)
    const cashForecast = includeCash ? filterCashByDate(parsed.cashForecast, start, end) : []

    let nOrders: number
    let nExpenses: number
    let nCash = 0

    if (options.replaceAll) {
      nOrders = await store.replaceOrders(orders)
      nExpenses = await store.replaceExpenses(expenses)
      if (includeCash) nCash = await store.replaceCashForecast(cashForecast)
    } else {
      nOrders = await store.upsertOrders(orders)
      nExpenses = await store.upsertExpenses(expenses)
      if (includeCash && cashForecast.length) nCash = await store.upsertCashForecast(cashForecast)
    }

    const message = `${sourceLabel}: ${nOrders} orders, ${nExpenses} expenses, ${nCash} cash rows${
      start || end ? ` (${start ?? '…'}→${end ?? '…'})` : ''
    }`
    await store.finishSync(sync.id, 'ok', message, nOrders + nExpenses + nCash)
    return {
      sourceLabel,
      start,
      end,
      orders: nOrders,
      expenses: nExpenses,
      cashRows: nCash,
      warnings: parsed.warnings,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sales Tracker sync failed'
    await store.finishSync(sync.id, 'error', message, 0)
    throw error
  }
}

export async function syncSalesTrackerFromDrive(
  store: AnalyticsStore,
  serviceAccountJson: string,
  fileId: string,
  options: SalesTrackerSyncOptions = {},
): Promise<SalesTrackerSyncResult> {
  const file = await downloadDriveWorkbook(serviceAccountJson, fileId)
  return syncSalesTrackerFromBuffer(store, file.buffer, file.name, options)
}
