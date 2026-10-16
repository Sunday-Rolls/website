import { describe, expect, it } from 'vitest'
import {
  applyManualWorkbook,
  buildManualWorkbook,
  isWorkbookEditableOrder,
  parseManualWorkbook,
} from './manual-workbook.js'
import { seedDemoStore } from './seed.js'
import { createMemoryAnalyticsStore } from './store.js'
import type { Order } from './types.js'

describe('manual workbook', () => {
  it('treats only manual and sales-tracker orders as editable', () => {
    expect(isWorkbookEditableOrder({ source: 'manual' } as Order)).toBe(true)
    expect(isWorkbookEditableOrder({ source: 'sales-tracker' } as Order)).toBe(true)
    expect(isWorkbookEditableOrder({ source: 'shopify' } as Order)).toBe(false)
  })

  it('exports Revenue, Expenses, and Cash sheets from store data', async () => {
    const store = createMemoryAnalyticsStore()
    await seedDemoStore(store)

    const xlsx = await buildManualWorkbook(store)
    expect(xlsx.byteLength).toBeGreaterThan(1000)

    const parsed = await parseManualWorkbook(xlsx)
    expect(parsed.sheets).toEqual({ revenue: true, expenses: true, cash: true })
    expect(parsed.orders.length).toBeGreaterThan(0)
    expect(parsed.orders.every((o) => o.source === 'manual' || o.source === 'sales-tracker')).toBe(
      true,
    )
    expect(parsed.expenses.length).toBeGreaterThan(0)
    expect(parsed.cash.length).toBeGreaterThan(0)
    expect(parsed.warnings).toHaveLength(0)
  })

  it('replaces editable orders on upload so deleted rows disappear', async () => {
    const store = createMemoryAnalyticsStore()
    await seedDemoStore(store)
    const before = await store.listOrders()
    const editableBefore = before.filter(isWorkbookEditableOrder)
    expect(editableBefore.length).toBeGreaterThan(2)

    const xlsx = await buildManualWorkbook(store)
    const parsed = await parseManualWorkbook(xlsx)
    const kept = parsed.orders.slice(0, 2)
    const result = await applyManualWorkbook(store, {
      ...parsed,
      orders: kept,
    })

    expect(result.deletedTrackerOrders + result.deletedManualOrders).toBe(editableBefore.length)
    expect(result.upsertedOrders).toBe(2)

    const after = (await store.listOrders()).filter(isWorkbookEditableOrder)
    expect(after).toHaveLength(2)
    expect(after.map((o) => o.externalId).sort()).toEqual(
      kept.map((o) => o.externalId).sort(),
    )
  })

  it('leaves sheets unchanged when missing from the workbook', async () => {
    const store = createMemoryAnalyticsStore()
    await seedDemoStore(store)
    const expensesBefore = await store.listExpenses()
    const cashBefore = await store.listCashForecast()
    const ordersBefore = (await store.listOrders()).filter(isWorkbookEditableOrder)

    const result = await applyManualWorkbook(store, {
      orders: [],
      expenses: [],
      cash: [],
      warnings: ['Missing "Revenue" sheet'],
      sheets: { revenue: false, expenses: false, cash: false },
    })

    expect(result.upsertedOrders).toBe(0)
    expect(result.expenses).toBe(0)
    expect(result.cash).toBe(0)
    expect(await store.listExpenses()).toHaveLength(expensesBefore.length)
    expect(await store.listCashForecast()).toHaveLength(cashBefore.length)
    expect((await store.listOrders()).filter(isWorkbookEditableOrder)).toHaveLength(
      ordersBefore.length,
    )
  })
})
