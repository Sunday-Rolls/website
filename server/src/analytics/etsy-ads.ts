/**
 * Etsy ad spend from the shop's payment-account ledger.
 *
 * Two kinds of charge show up there:
 * - Etsy Ads (on-site promoted listings, ledger type `prolist`): a shop-level daily budget.
 * - Offsite Ads fees (`offsite_ads_fee`): charged per order when an Etsy ad elsewhere made the
 *   sale, with reference_id pointing at the receipt.
 *
 * Both go into analytics_daily_ad_spend under platform "Etsy Ads" (campaigns "Etsy Ads" and
 * "Offsite Ads"), so Marketing, MER and ROAS include them alongside Google and Meta. That table
 * doesn't feed the P&L, which takes marketing from each order, so nothing double counts with the
 * Sales Tracker's Marketing column. Live Etsy orders get their own Offsite Ads fee as
 * marketingCost (see etsy-sync.ts).
 */
import type { EtsyLedgerEntryRaw } from './etsy.js'
import { storeDay } from './period.js'
import type { DailyAdSpend } from './types.js'

export const ETSY_ADS_PLATFORM = 'Etsy Ads'
export const ONSITE_CAMPAIGN = 'Etsy Ads'
export const OFFSITE_CAMPAIGN = 'Offsite Ads'

export type EtsyAdKind = 'onsite' | 'offsite'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Which ad charge a ledger entry is, if any. Etsy's ledger_type casing varies between shops. */
export function etsyAdKind(entry: Pick<EtsyLedgerEntryRaw, 'ledger_type' | 'description'>): EtsyAdKind | null {
  const type = `${entry.ledger_type ?? ''} ${entry.description ?? ''}`.toLowerCase()
  if (/offsite[_\s-]?ads?/.test(type)) return 'offsite'
  if (/prolist|promoted[_\s-]?listing|etsy[_\s-]?ads/.test(type)) return 'onsite'
  return null
}

/** Ledger amounts are cents with debits negative; spend is the positive charge (credits reduce it). */
function spendOf(entry: EtsyLedgerEntryRaw): number {
  return -(Number(entry.amount) || 0) / 100
}

function dayOf(entry: EtsyLedgerEntryRaw): string | null {
  const ts = entry.created_timestamp ?? entry.create_date
  return ts ? storeDay(new Date(ts * 1000).toISOString()) : null
}

/**
 * Daily rows for days on or after `fromDay`. Offsite rows also report the sales those ads made
 * (receipt totals from `receiptTotals`), since Etsy only charges the fee on a sale.
 */
export function etsyDailyAdSpend(
  entries: EtsyLedgerEntryRaw[],
  options: { fromDay: string; receiptTotals?: Map<string, number> },
): DailyAdSpend[] {
  const rows = new Map<string, DailyAdSpend & { receipts: Set<string> }>()
  for (const entry of entries) {
    const kind = etsyAdKind(entry)
    const day = dayOf(entry)
    if (!kind || !day || day < options.fromDay) continue
    const campaign = kind === 'offsite' ? OFFSITE_CAMPAIGN : ONSITE_CAMPAIGN
    const key = `${day}|${campaign}`
    const row = rows.get(key) ?? {
      date: day,
      platform: ETSY_ADS_PLATFORM,
      campaign,
      spend: 0,
      platformReportedSales: 0,
      platformReportedOrders: 0,
      receipts: new Set<string>(),
    }
    row.spend += spendOf(entry)
    const receipt = kind === 'offsite' && entry.reference_id ? String(entry.reference_id) : null
    // A refunded fee credits the same receipt; count the sale once, and only while it's charged.
    if (receipt && spendOf(entry) > 0 && !row.receipts.has(receipt)) {
      row.receipts.add(receipt)
      row.platformReportedOrders += 1
      row.platformReportedSales += options.receiptTotals?.get(receipt) ?? 0
    }
    rows.set(key, row)
  }
  return [...rows.values()]
    .map(({ receipts: _receipts, ...r }) => ({
      ...r,
      spend: round2(r.spend),
      platformReportedSales: round2(r.platformReportedSales),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign))
}

/** Net Offsite Ads fee per receipt id, for the live orders' marketing cost. */
export function etsyOffsiteFeesByReceipt(entries: EtsyLedgerEntryRaw[]): Map<string, number> {
  const fees = new Map<string, number>()
  for (const entry of entries) {
    if (etsyAdKind(entry) !== 'offsite' || !entry.reference_id) continue
    const id = String(entry.reference_id)
    fees.set(id, round2((fees.get(id) ?? 0) + spendOf(entry)))
  }
  return fees
}

/** Ledger types that look ad-related but aren't recognised, so a new Etsy type gets noticed. */
export function unknownAdLikeTypes(entries: EtsyLedgerEntryRaw[]): string[] {
  const seen = new Set<string>()
  for (const e of entries) {
    const t = (e.ledger_type ?? '').trim()
    if (t && !etsyAdKind(e) && /ad|market|promot/i.test(t) && !/adjust|payment|tax/i.test(t)) seen.add(t)
  }
  return [...seen].sort()
}
