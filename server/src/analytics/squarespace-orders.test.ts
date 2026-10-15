import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSquarespaceOrdersCsv } from './squarespace-orders.js'

const sample = `"Order ID","Email","Financial Status","Paid at","Fulfillment Status","Fulfilled at","Currency","Subtotal","Shipping","Taxes","Amount Refunded","Total","Discount Code","Discount Amount","Shipping Method","Created at","Lineitem quantity","Lineitem name","Lineitem price","Lineitem sku","Lineitem variant","Lineitem requires shipping","Lineitem taxable","Lineitem fulfillment status","Billing Name","Billing Address1","Billing Address2","Billing City","Billing Zip","Billing Province","Billing Country","Billing Phone","Shipping Name","Shipping Address1","Shipping Address2","Shipping City","Shipping Zip","Shipping Province","Shipping Country","Shipping Phone","Cancelled at","Private Notes","Channel Type","Channel Name","Channel Order Number"
"00458","a@example.com","refunded","2026-10-15 16:38:39 -0500","","","USD","60.00","20.50","6.54","87.04","87.04","","0.00","","2026-10-15 16:38:39 -0500","1","Towel Blue","30.00","SQ1","","true","true","","A","1","","City","55044","MN","United States","","A","1","","City","55044","MN","United States","","2026-10-15 17:09:40 -0500","","ONLINE","Squarespace","00458"
"00458","","","","","","","","","","","","","","","","1","Towel Black","30.00","SQ2","","true","true","","","","","","","","","","","","","","","","","","","","","","",""
"00457","b@example.com","PAID","2026-10-15 15:27:25 -0500","pending","","USD","80.00","12.34","0.00","0.00","92.34","","0.00","","2026-10-15 15:27:25 -0500","1","Mallet - Retro Roller - White","80.00","SQ3","White","true","true","pending","B","2","","Brooklyn","11201","NY","United States","","B","2","","Brooklyn","11201","NY","United States","","","","ONLINE","Squarespace","00457"
"00451","c@example.com","PAID","2026-10-13 17:46:27 -0500","FULFILLED","2026-10-13 19:12:00 -0500","USD","510.00","25.00","0.00","0.00","535.00","","0.00","","2026-10-13 17:46:27 -0500","1","Sunday Stripes","80.00","SQ4","","true","true","FULFILLED","C","3","","Antrim","BT41","Northern Ireland","United Kingdom","","C","3","","Ballymena","BT42","Antrim","United Kingdom","","","","ONLINE","Squarespace","00451"
"00451","","","","","","","","","","","","","","","","1","Flagstick Fuel","80.00","SQ5","","true","true","FULFILLED","","","","","","","","","","","","","","","","","","","","","","",""
"00451","","","","","","","","","","","","","","","","1","The Birdie Machine","80.00","SQ6","","true","true","FULFILLED","","","","","","","","","","","","","","","","","","","","","","",""
`

describe('parseSquarespaceOrdersCsv', () => {
  it('groups line items, skips refunded/cancelled, keeps paid revenue', () => {
    const { rows, skipped, warnings } = parseSquarespaceOrdersCsv(sample)
    expect(warnings.filter((w) => !w.includes('unexpected')).length).toBe(0)
    expect(skipped).toBe(1) // 00458 refunded+cancelled
    expect(rows).toHaveLength(2)

    const multi = rows.find((r) => r.externalId === 'squarespace:00451')
    expect(multi).toMatchObject({
      channel: 'squarespace',
      source: 'manual',
      revenue: 510,
      shippingCost: 25,
      customerEmail: 'c@example.com',
    })
    expect(multi?.lines).toHaveLength(3)

    const single = rows.find((r) => r.externalId === 'squarespace:00457')
    expect(single?.revenue).toBe(80)
    expect(single?.state).toBe('NY')
    expect(single?.lines[0].productName).toContain('Retro Roller')
  })

  it('parses the uploaded Squarespace export without throwing', () => {
    const path =
      process.env.SQUARESPACE_ORDERS_CSV ||
      '/Users/ethanbett/.cursor/projects/Users-ethanbett-Documents-Sunday-Rolls-app/uploads/orders_0a2e.csv'
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      return
    }
    const { rows, skipped, warnings } = parseSquarespaceOrdersCsv(text)
    expect(rows.length).toBeGreaterThan(50)
    expect(skipped).toBeGreaterThanOrEqual(0)
    expect(rows.every((r) => r.channel === 'squarespace')).toBe(true)
    expect(rows.every((r) => r.externalId.startsWith('squarespace:'))).toBe(true)
    const revenue = rows.reduce((s, r) => s + r.revenue, 0)
    expect(revenue).toBeGreaterThan(1000)
    // smoke: no duplicate external ids
    expect(new Set(rows.map((r) => r.externalId)).size).toBe(rows.length)
    void warnings
  })
})
