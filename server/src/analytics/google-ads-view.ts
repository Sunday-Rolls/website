/** Google Ads card data for the Marketing page, from the Google Ads API tables. */
import type { DateRange } from './period.js'
import type { GoogleAdsDaily, GoogleAdsSearchTerm } from './types.js'

type Range = Pick<DateRange, 'start' | 'end'>

export type GoogleAdsTotals = {
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionValue: number
  /** clicks ÷ impressions, null without impressions */
  ctr: number | null
  /** cost ÷ clicks, null without clicks */
  cpc: number | null
  /** cost ÷ conversions, null without conversions */
  costPerConversion: number | null
  /** conversion value ÷ cost, null without cost */
  roas: number | null
}

export type GoogleAdsView = {
  connected: boolean
  range: Range
  /** Latest day with data, so the UI can say how fresh it is. */
  lastDay: string | null
  totals: GoogleAdsTotals
  campaigns: Array<GoogleAdsTotals & { campaign: string }>
  searchTerms: GoogleAdsSearchTerm[]
  searchTermsPeriod: { start: string; end: string } | null
}

const round2 = (x: number) => Math.round(x * 100) / 100
const ratio = (a: number, b: number, digits = 2) => (b > 0 ? Math.round((a / b) * 10 ** digits) / 10 ** digits : null)

function totalsOf(rows: GoogleAdsDaily[]): GoogleAdsTotals {
  const t = rows.reduce(
    (acc, r) => {
      acc.impressions += r.impressions
      acc.clicks += r.clicks
      acc.cost += r.cost
      acc.conversions += r.conversions
      acc.conversionValue += r.conversionValue
      return acc
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
  )
  const cost = round2(t.cost)
  return {
    impressions: t.impressions,
    clicks: t.clicks,
    cost,
    conversions: round2(t.conversions),
    conversionValue: round2(t.conversionValue),
    ctr: ratio(t.clicks, t.impressions, 4),
    cpc: ratio(cost, t.clicks),
    costPerConversion: ratio(cost, t.conversions),
    roas: ratio(t.conversionValue, cost),
  }
}

export function buildGoogleAdsView(input: {
  range: Range
  daily: GoogleAdsDaily[]
  searchTerms: GoogleAdsSearchTerm[]
  connected: boolean
}): GoogleAdsView {
  const { range } = input
  const inRange = input.daily.filter((r) => r.date >= range.start && r.date <= range.end)
  const byCampaign = new Map<string, GoogleAdsDaily[]>()
  for (const r of inRange) byCampaign.set(r.campaign, [...(byCampaign.get(r.campaign) ?? []), r])
  const campaigns = [...byCampaign.entries()]
    .map(([campaign, rows]) => ({ campaign, ...totalsOf(rows) }))
    .sort((a, b) => b.cost - a.cost)
  const first = input.searchTerms[0]
  return {
    connected: input.connected,
    range: { start: range.start, end: range.end },
    lastDay: input.daily.length ? input.daily[input.daily.length - 1].date : null,
    totals: totalsOf(inRange),
    campaigns,
    // Search terms cover the last sync window, not the selected range (the API sums them per window).
    searchTerms: input.searchTerms.slice(0, 50),
    searchTermsPeriod: first ? { start: first.periodStart, end: first.periodEnd } : null,
  }
}
