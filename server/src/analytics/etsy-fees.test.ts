import { describe, expect, it } from 'vitest'
import type { EtsyReceiptRaw } from './etsy.js'
import { etsyDailyFees, etsyEntryReceiptId, etsyFeeCategory, etsyLedgerByReceipt, etsyLedgerTypeKey } from './etsy-fees.js'

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('etsyFeeCategory', () => {
  it('buckets fee types in any casing', () => {
    const cat = (ledger_type: string) => etsyFeeCategory({ ledger_type })
    expect(cat('TRANSACTION')).toBe('transaction_fee')
    expect(cat('transaction')).toBe('transaction_fee')
    expect(cat('shipping_transaction')).toBe('transaction_fee')
    expect(cat('PAYMENT_PROCESSING_FEE')).toBe('processing_fee')
    expect(cat('listing')).toBe('listing_fee')
    expect(cat('renew_sold_auto')).toBe('listing_fee')
    expect(cat('shipping_labels')).toBe('shipping_label')
    expect(cat('shipping_label_refund')).toBe('shipping_label')
    expect(cat('prolist')).toBe('etsy_ads')
    expect(cat('offsite_ads_fee')).toBe('offsite_ads')
    expect(cat('regulatory_operating_fee')).toBe('regulatory_fee')
    expect(cat('currency_conversion_fee')).toBe('currency_conversion')
    expect(cat('vat_seller_services')).toBe('vat')
    expect(cat('sales_tax')).toBe('sales_tax')
    expect(cat('etsy_plus_subscription')).toBe('subscription')
    expect(cat('share_save_credit')).toBe('other')
  })

  it('leaves out sales, refunds, deposits and payment credits', () => {
    for (const ledger_type of ['Payment', 'PAYMENT', 'REFUND', 'PAYMENT_ADJUSTMENT', 'DISBURSE2', 'disbursement', 'RESERVE', 'recoupment', 'BILL_PAYMENT']) {
      expect(etsyFeeCategory({ ledger_type }), ledger_type).toBeNull()
    }
  })

  it('falls back to the reference type when the ledger type is blank', () => {
    expect(etsyFeeCategory({ ledger_type: '', reference_type: 'transaction' })).toBe('transaction_fee')
    expect(etsyLedgerTypeKey({ ledger_type: ' Shipping Labels ', reference_type: 'x' })).toBe('shipping_labels')
    expect(etsyLedgerTypeKey({ ledger_type: null, reference_type: null })).toBe('unknown')
  })
})

describe('etsyDailyFees', () => {
  it('totals each store day and ledger type, nets credits and skips non-fees', () => {
    const rows = etsyDailyFees(
      [
        { entry_id: 1, amount: -520, ledger_type: 'TRANSACTION', created_timestamp: at('2026-11-03T15:00:00Z') },
        { entry_id: 2, amount: -310, ledger_type: 'transaction', created_timestamp: at('2026-11-03T16:00:00Z') },
        { entry_id: 3, amount: 100, ledger_type: 'transaction', created_timestamp: at('2026-11-03T17:00:00Z') },
        { entry_id: 4, amount: -651, ledger_type: 'shipping_labels', created_timestamp: at('2026-11-03T18:00:00Z') },
        { entry_id: 5, amount: 9345, ledger_type: 'Payment', created_timestamp: at('2026-11-03T15:00:00Z') },
        { entry_id: 6, amount: -50000, ledger_type: 'DISBURSE2', created_timestamp: at('2026-11-03T15:00:00Z') },
        // 03:00 UTC on Nov 3 is still Nov 2 in Chicago; before fromDay, so skipped.
        { entry_id: 7, amount: -500, ledger_type: 'prolist', created_timestamp: at('2026-11-03T03:00:00Z') },
      ],
      { fromDay: '2026-11-03' },
    )
    expect(rows).toEqual([
      { date: '2026-11-03', ledgerType: 'shipping_labels', category: 'shipping_label', amount: 6.51, entries: 1 },
      { date: '2026-11-03', ledgerType: 'transaction', category: 'transaction_fee', amount: 7.3, entries: 3 },
    ])
  })
})

describe('etsyLedgerByReceipt', () => {
  const receipts: EtsyReceiptRaw[] = [
    { receipt_id: 3811712513, transactions: [{ transaction_id: 4400001 }, { transaction_id: 4400002 }] },
    { receipt_id: 3811712999, transactions: [{ transaction_id: 4400009 }] },
  ]

  it('ties fees to receipts through receipt, transaction, payment, description and parent entry', () => {
    const ledger = etsyLedgerByReceipt(
      [
        { entry_id: 1, amount: -520, ledger_type: 'transaction', reference_type: 'transaction', reference_id: '4400001' },
        { entry_id: 2, amount: -31, ledger_type: 'shipping_transaction', reference_type: 'transaction', reference_id: 4400002 },
        { entry_id: 3, amount: -295, ledger_type: 'PAYMENT_PROCESSING_FEE', reference_type: 'payment', reference_id: 777 },
        { entry_id: 4, amount: -651, ledger_type: 'shipping_labels', reference_type: 'shipping_label', reference_id: 1, description: 'USPS label for order #3811712513' },
        { entry_id: 5, amount: -12, ledger_type: 'vat_seller_services', parent_entry_id: 1 },
        { entry_id: 6, amount: -1402, ledger_type: 'offsite_ads_fee', reference_type: 'receipt', reference_id: 3811712513 },
        // Not tied to anything we know.
        { entry_id: 7, amount: -20, ledger_type: 'renew_sold_auto', reference_type: 'listing', reference_id: 99 },
        // Sale proceeds are never fees.
        { entry_id: 8, amount: 9345, ledger_type: 'Payment', reference_type: 'receipt', reference_id: 3811712513 },
        { entry_id: 9, amount: -400, ledger_type: 'transaction', reference_type: 'transaction', reference_id: 4400009 },
      ],
      receipts,
      new Map([['777', '3811712513']]),
    )
    expect(ledger.get('3811712513')).toEqual({
      processing: 2.95,
      processingEntries: 1,
      saleFees: 5.63,
      saleFeeEntries: 3,
      label: 6.51,
      labelEntries: 1,
      offsite: 14.02,
      offsiteEntries: 1,
    })
    expect(ledger.get('3811712999')).toMatchObject({ saleFees: 4, saleFeeEntries: 1, processingEntries: 0 })
    expect(ledger.size).toBe(2)
  })

  it('ignores receipt ids outside the known set', () => {
    const ctx = { receiptIds: new Set(['1234567']), transactionToReceipt: new Map(), paymentToReceipt: new Map() }
    expect(etsyEntryReceiptId({ entry_id: 1, amount: 0, description: 'Label for order 7654321' }, ctx)).toBeNull()
    expect(etsyEntryReceiptId({ entry_id: 1, amount: 0, description: 'Label for order 1234567' }, ctx)).toBe('1234567')
  })
})
