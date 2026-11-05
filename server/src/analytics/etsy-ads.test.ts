import { describe, expect, it } from 'vitest'
import { etsyAdKind, etsyDailyAdSpend, etsyOffsiteFeesByReceipt, unknownAdLikeTypes } from './etsy-ads.js'

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('etsyAdKind', () => {
  it('recognises Etsy Ads and Offsite Ads in either casing', () => {
    expect(etsyAdKind({ ledger_type: 'prolist' })).toBe('onsite')
    expect(etsyAdKind({ ledger_type: 'PROLIST' })).toBe('onsite')
    expect(etsyAdKind({ ledger_type: 'offsite_ads_fee' })).toBe('offsite')
    expect(etsyAdKind({ ledger_type: 'OFFSITE_ADS_FEE' })).toBe('offsite')
    expect(etsyAdKind({ ledger_type: 'TRANSACTION' })).toBeNull()
    expect(etsyAdKind({ ledger_type: 'PAYMENT_PROCESSING_FEE' })).toBeNull()
    expect(etsyAdKind({ ledger_type: 'DISBURSE2' })).toBeNull()
  })
})

describe('etsyDailyAdSpend', () => {
  it('groups by store day (Central), nets refunds, and counts each offsite sale once', () => {
    const rows = etsyDailyAdSpend(
      [
        // 03:00 UTC on Nov 3 is still Nov 2 in Chicago.
        { entry_id: 1, amount: -250, ledger_type: 'prolist', created_timestamp: at('2026-11-03T03:00:00Z') },
        { entry_id: 2, amount: -1200, ledger_type: 'offsite_ads_fee', reference_id: 7, created_timestamp: at('2026-11-03T15:00:00Z') },
        { entry_id: 3, amount: 1200, ledger_type: 'offsite_ads_fee', reference_id: 7, created_timestamp: at('2026-11-03T18:00:00Z') },
        { entry_id: 4, amount: -900, ledger_type: 'offsite_ads_fee', reference_id: 8, created_timestamp: at('2026-11-03T19:00:00Z') },
        // Before the window: ignored.
        { entry_id: 5, amount: -999, ledger_type: 'prolist', created_timestamp: at('2026-10-20T15:00:00Z') },
      ],
      { fromDay: '2026-11-01', receiptTotals: new Map([['7', 90], ['8', 75.5]]) },
    )
    expect(rows).toEqual([
      { date: '2026-11-02', platform: 'Etsy Ads', campaign: 'Etsy Ads', spend: 2.5, platformReportedSales: 0, platformReportedOrders: 0 },
      { date: '2026-11-03', platform: 'Etsy Ads', campaign: 'Offsite Ads', spend: 9, platformReportedSales: 165.5, platformReportedOrders: 2 },
    ])
  })
})

describe('etsyOffsiteFeesByReceipt', () => {
  it('nets each receipt’s offsite fee', () => {
    const fees = etsyOffsiteFeesByReceipt([
      { entry_id: 1, amount: -1402, ledger_type: 'offsite_ads_fee', reference_id: 2 },
      { entry_id: 2, amount: 402, ledger_type: 'offsite_ads_fee', reference_id: 2 },
      { entry_id: 3, amount: -500, ledger_type: 'prolist' },
    ])
    expect(fees).toEqual(new Map([['2', 10]]))
  })
})

describe('unknownAdLikeTypes', () => {
  it('flags ad-looking ledger types it doesn’t handle', () => {
    expect(
      unknownAdLikeTypes([
        { entry_id: 1, amount: -1, ledger_type: 'etsy_plus_ad_credit' },
        { entry_id: 2, amount: -1, ledger_type: 'prolist' },
        { entry_id: 3, amount: -1, ledger_type: 'PAYMENT_ADJUSTMENT' },
        { entry_id: 4, amount: -1, ledger_type: 'marketing_fee' },
      ]),
    ).toEqual(['etsy_plus_ad_credit', 'marketing_fee'])
  })
})
