import { describe, expect, it } from 'vitest'
import { mapChannel, parseCashRows, parseExpenseRows, parseSalesRows } from './sheet-import.js'

describe('mapChannel', () => {
  it('maps marketplace names', () => {
    expect(mapChannel('Etsy')).toBe('etsy')
    expect(mapChannel('Squarespace')).toBe('squarespace')
    expect(mapChannel('Shopify')).toBe('shopify')
    expect(mapChannel('Ebay')).toBe('ebay')
    expect(mapChannel('In Person')).toBe('other')
  })
})

describe('parseSalesRows', () => {
  it('parses Sales tracker rows', () => {
    const rows = [
      ['Order Numbers', 'Plateform', 'Date', 'Price', 'Fee', 'Shipping', 'Marketing', 'Product Category'],
      ['3811712513', 'Etsy', new Date('2025-09-26T00:00:00Z'), 93.45, 17.21, 5.7, 14.1, 'Headcover'],
      ['SS-1', 'Squarespace', new Date('2026-09-01T00:00:00Z'), 80, 4.5, 5, 10, 'Headcover'],
    ]
    const orders = parseSalesRows(rows)
    expect(orders).toHaveLength(2)
    expect(orders[0].channel).toBe('etsy')
    expect(orders[0].revenue).toBe(93.45)
    expect(orders[1].channel).toBe('squarespace')
    expect(orders[0].source).toBe('sales-tracker')
    expect(orders[0].lines[0].productName).toBe('Headcover')
  })
})

describe('parseExpenseRows', () => {
  it('classifies COGS vs SG&A from Check column', () => {
    const rows = [
      [],
      [],
      ['Categoy', 'Expense Category', 'Explanation', 'Cost', 'Purchased', 'Date', 'Month', 'Year', 'Check'],
      ['Headcover', 'Manufacturing', 'Alibaba', 577.32, 'Sam', new Date('2025-10-24'), , , 'COGS'],
      ['N/A', 'Website', 'Rebuild', 5000, 'Sam', new Date('2026-09-01'), , , 'SG&A'],
    ]
    const expenses = parseExpenseRows(rows)
    expect(expenses).toHaveLength(2)
    expect(expenses[0].bucket).toBe('cogs')
    expect(expenses[1].bucket).toBe('sga')
    expect(expenses[1].amount).toBe(5000)
  })
})

describe('parseCashRows', () => {
  it('reads month columns from the Cash tab shape', () => {
    const rows = [
      [],
      [null, null, new Date('2026-09-30'), new Date('2026-10-31')],
      [null, 'Beginning Balance', 9924, 9390],
      [null, 'Collections', 7682, 7682],
      [null, 'Freight and Fees', -1997, -1997],
      [null, 'Marketing', -1218, -1218],
      [null, 'Website', -5000, 0],
      [null, 'Manufacturing', 0, -1547],
      [null, 'Ending Balance', 9390, 12309],
    ]
    const cash = parseCashRows(rows)
    expect(cash).toHaveLength(2)
    expect(cash[0].monthEnd).toBe('2026-09-30')
    expect(cash[0].website).toBe(-5000)
    expect(cash[1].manufacturing).toBe(-1547)
  })
})
