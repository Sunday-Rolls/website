/**
 * Etsy fees from the shop's payment-account ledger.
 *
 * Every ledger entry that is a cost (or a credit against one) gets a category; sale proceeds,
 * buyer refunds, deposits/disbursements, reserves and payment credits are not fees and return
 * null. Ledger amounts are cents with debits negative, so a fee is `-amount / 100` dollars
 * (credits, e.g. a fee refunded with an order, come out negative and reduce the total).
 *
 * Etsy documents ledger_type only as "the original reference type", and its casing varies
 * between shops, so the classifier matches loose patterns and falls back to `other`.
 */
import { etsyAdKind } from './etsy-ads.js'
import type { EtsyLedgerEntryRaw, EtsyReceiptRaw } from './etsy.js'
import { storeDay } from './period.js'
import type { EtsyFeesDaily } from './types.js'

export type EtsyFeeCategory =
  | 'transaction_fee'
  | 'processing_fee'
  | 'listing_fee'
  | 'shipping_label'
  | 'etsy_ads'
  | 'offsite_ads'
  | 'regulatory_fee'
  | 'currency_conversion'
  | 'vat'
  | 'sales_tax'
  | 'subscription'
  | 'other'

/** Fee categories that belong to a single sale (the receipt's "actual fees"). Labels and Offsite Ads are kept apart. */
export const ETSY_SALE_FEE_CATEGORIES: ReadonlySet<EtsyFeeCategory> = new Set([
  'transaction_fee',
  'processing_fee',
  'listing_fee',
  'regulatory_fee',
  'currency_conversion',
  'vat',
])

const round2 = (n: number) => Math.round(n * 100) / 100

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/** The ledger type as stored in analytics_etsy_fees_daily (lowercased; reference type when blank). */
export function etsyLedgerTypeKey(entry: Pick<EtsyLedgerEntryRaw, 'ledger_type' | 'reference_type'>): string {
  return norm(entry.ledger_type) || norm(entry.reference_type) || 'unknown'
}

/**
 * Which fee an entry is, or null when it isn't a cost: sales (`payment`), buyer refunds,
 * deposits (`disburse*`), reserves, recoupments and bill payments.
 */
export function etsyFeeCategory(
  entry: Pick<EtsyLedgerEntryRaw, 'ledger_type' | 'reference_type' | 'description'>,
): EtsyFeeCategory | null {
  const ad = etsyAdKind(entry)
  if (ad === 'offsite') return 'offsite_ads'
  if (ad === 'onsite') return 'etsy_ads'
  const t = norm(entry.ledger_type) || norm(entry.reference_type) || norm(entry.description)
  if (!t) return 'other'
  // Fee patterns first: "payment_processing_fee" and "shipping_label_refund" must not hit the exclusions below.
  if (/process|payment_fee|card_fee|cc_fee/.test(t)) return 'processing_fee'
  if (/label|postage/.test(t)) return 'shipping_label'
  if (/regulatory|operating_fee/.test(t)) return 'regulatory_fee'
  if (/currency|conversion|exchange/.test(t)) return 'currency_conversion'
  if (/(^|_)(vat|gst|hst)(_|$)/.test(t)) return 'vat'
  if (/(^|_)(sales_)?tax(es)?(_|$)/.test(t)) return 'sales_tax'
  if (/subscription|etsy_plus|pattern/.test(t)) return 'subscription'
  if (/transaction/.test(t)) return 'transaction_fee'
  if (/listing|renew/.test(t)) return 'listing_fee'
  // Not costs: sale proceeds, buyer refunds and adjustments, deposits, reserves, credits paying the bill.
  if (/^payment|^sale|refund|adjust|disburse|deposit|payout|reserve|recoup|bill_payment/.test(t)) return null
  return 'other'
}

/** Fee in dollars: positive = cost, negative = credit. */
export function etsyFeeAmount(entry: Pick<EtsyLedgerEntryRaw, 'amount'>): number {
  return -(Number(entry.amount) || 0) / 100
}

function entryDay(entry: EtsyLedgerEntryRaw): string | null {
  const ts = entry.created_timestamp ?? entry.create_date
  return ts ? storeDay(new Date(ts * 1000).toISOString()) : null
}

/** Daily fee totals per ledger type for store days on or after `fromDay`. */
export function etsyDailyFees(entries: EtsyLedgerEntryRaw[], options: { fromDay: string }): EtsyFeesDaily[] {
  const rows = new Map<string, EtsyFeesDaily>()
  for (const entry of entries) {
    const category = etsyFeeCategory(entry)
    const day = entryDay(entry)
    if (!category || !day || day < options.fromDay) continue
    const ledgerType = etsyLedgerTypeKey(entry)
    const key = `${day}|${ledgerType}`
    const row = rows.get(key) ?? { date: day, ledgerType, category, amount: 0, entries: 0 }
    row.amount += etsyFeeAmount(entry)
    row.entries += 1
    rows.set(key, row)
  }
  return [...rows.values()]
    .map((r) => ({ ...r, amount: round2(r.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ledgerType.localeCompare(b.ledgerType))
}

/** Ledger costs tied to one receipt. `*Entries` count how many entries were found (0 = none seen). */
export type EtsyReceiptLedger = {
  processing: number
  processingEntries: number
  /** Sale fees other than processing (transaction, listing renewals, regulatory, ...). */
  saleFees: number
  saleFeeEntries: number
  label: number
  labelEntries: number
  offsite: number
  offsiteEntries: number
}

const emptyLedger = (): EtsyReceiptLedger => ({
  processing: 0,
  processingEntries: 0,
  saleFees: 0,
  saleFeeEntries: 0,
  label: 0,
  labelEntries: 0,
  offsite: 0,
  offsiteEntries: 0,
})

/**
 * Which receipt an entry belongs to: reference_type receipt → reference_id; transaction → the
 * receipt holding that transaction; payment → the payment's receipt; else a known receipt id as
 * reference_id or in the description; else the parent entry's receipt (e.g. VAT on a fee).
 */
export function etsyEntryReceiptId(
  entry: EtsyLedgerEntryRaw,
  ctx: {
    receiptIds: ReadonlySet<string>
    transactionToReceipt: ReadonlyMap<string, string>
    paymentToReceipt: ReadonlyMap<string, string>
    entryToReceipt?: ReadonlyMap<number, string>
  },
): string | null {
  const ref = entry.reference_id == null ? '' : String(entry.reference_id).trim()
  const type = norm(entry.reference_type)
  if (ref) {
    if (type.includes('receipt')) return ref
    if (type.includes('transaction') && ctx.transactionToReceipt.has(ref)) return ctx.transactionToReceipt.get(ref)!
    if (type.includes('payment') && ctx.paymentToReceipt.has(ref)) return ctx.paymentToReceipt.get(ref)!
    if (ctx.receiptIds.has(ref)) return ref
  }
  for (const match of (entry.description ?? '').matchAll(/\d{6,}/g)) {
    if (ctx.receiptIds.has(match[0])) return match[0]
  }
  if (entry.parent_entry_id != null && ctx.entryToReceipt?.has(entry.parent_entry_id)) return ctx.entryToReceipt.get(entry.parent_entry_id)!
  return null
}

/** Sum each receipt's processing, sale fees, labels and Offsite Ads from the ledger. */
export function etsyLedgerByReceipt(
  entries: EtsyLedgerEntryRaw[],
  receipts: EtsyReceiptRaw[],
  paymentToReceipt: ReadonlyMap<string, string> = new Map(),
): Map<string, EtsyReceiptLedger> {
  const receiptIds = new Set(receipts.map((r) => String(r.receipt_id)))
  const transactionToReceipt = new Map<string, string>()
  for (const r of receipts) for (const t of r.transactions ?? []) transactionToReceipt.set(String(t.transaction_id), String(r.receipt_id))
  const entryToReceipt = new Map<number, string>()
  const ctx = { receiptIds, transactionToReceipt, paymentToReceipt, entryToReceipt }
  // Two passes so a child entry (parent_entry_id) can follow its parent wherever it sits in the list.
  const pending: EtsyLedgerEntryRaw[] = []
  for (const entry of entries) {
    const id = etsyEntryReceiptId(entry, { ...ctx, entryToReceipt: undefined })
    if (id) entryToReceipt.set(entry.entry_id, id)
    else pending.push(entry)
  }
  for (const entry of pending) {
    const id = etsyEntryReceiptId(entry, ctx)
    if (id) entryToReceipt.set(entry.entry_id, id)
  }

  const out = new Map<string, EtsyReceiptLedger>()
  for (const entry of entries) {
    const receiptId = entryToReceipt.get(entry.entry_id)
    const category = etsyFeeCategory(entry)
    if (!receiptId || !category || !receiptIds.has(receiptId)) continue
    const row = out.get(receiptId) ?? emptyLedger()
    const amount = etsyFeeAmount(entry)
    if (category === 'processing_fee') {
      row.processing += amount
      row.processingEntries += 1
    } else if (category === 'shipping_label') {
      row.label += amount
      row.labelEntries += 1
    } else if (category === 'offsite_ads') {
      row.offsite += amount
      row.offsiteEntries += 1
    } else if (ETSY_SALE_FEE_CATEGORIES.has(category)) {
      row.saleFees += amount
      row.saleFeeEntries += 1
    }
    out.set(receiptId, row)
  }
  for (const row of out.values()) {
    row.processing = round2(row.processing)
    row.saleFees = round2(row.saleFees)
    row.label = round2(row.label)
    row.offsite = round2(row.offsite)
  }
  return out
}
