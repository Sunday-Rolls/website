import { orderSourceCounts, preferLiveOrders } from './orders.js'
import { OFFSITE_CAMPAIGN } from './etsy-ads.js'
import { inRange, isWebsiteChannel, monthKey, storeDay, type DateRange } from './period.js'
import type {
  AbandonedCartStats,
  CashForecastRow,
  DailyAdSpend,
  DailyProductView,
  DailyTraffic,
  Expense,
  Order,
  SearchKeyword,
} from './types.js'

export type MetricDelta = {
  value: number
  previous: number
  changePct: number | null
  changePts: number | null
}

export type OverviewResponse = {
  range: DateRange
  kpis: {
    revenue: MetricDelta
    orders: MetricDelta
    aov: MetricDelta
    conversionRate: MetricDelta
    visits: MetricDelta
    uniqueVisitors: number
  }
  revenueByDay: Array<{ date: string; revenue: number; orders: number; visits: number }>
  funnel: Array<{ step: string; count: number; pctOfStart: number; pctOfPrevious: number | null }>
  /** Product page views for the selected range (drills under “Viewed a product”). */
  productViewsByProduct: Array<{
    name: string
    category: string | null
    views: number
    share: number
  }>
  products: Array<{
    name: string
    category: string | null
    units: number
    revenue: number
    share: number
  }>
  trafficSources: Array<{ source: string; visits: number; share: number }>
  /**
   * Geographic breakdown. Uses order shipping state when enough orders have it;
   * otherwise falls back to GA4 US region sessions (Sales Tracker has no state).
   */
  ordersByState: Array<{ state: string; orders: number; share: number }>
  stateBreakdownMode: 'orders' | 'visitors'
  searchKeywords: Array<{ query: string; visits: number }>
  abandonedCarts: {
    abandoned: number
    recovered: number
    recoveredRevenue: number
    returningCustomerShare: number
    /** True when a Shopify abandoned-checkout sync has written a stats row. */
    synced: boolean
    source: 'shopify' | 'none'
  }
  /** Provenance counts after Shopify-preferred dedupe (for UI notes). */
  orderSources: {
    salesTracker: number
    shopify: number
    manual: number
    note: string
  }
  /**
   * How “Placed order” in the funnel was derived:
   * - ga4: ecommerce purchases from GA4
   * - orders: fallback to counted orders (tracker/Shopify/manual) when GA4 purchases are 0
   */
  funnelOrderSource: 'ga4' | 'orders'
}

export type PnLResponse = {
  year: number
  month: string | null
  kpis: {
    revenueYtd: MetricDelta
    grossMarginYtd: MetricDelta
    netIncomeYtd: MetricDelta
    cashOnHand: number
    /** Month end of the forecast row cash comes from (latest one already past). */
    cashAsOf: string | null
    /** Last day of the previous-year window the YTD deltas compare against. */
    comparedThrough: string
    /** True when the year has no Manufacturing expenses, so COGS is units × unit cost. */
    cogsEstimated: boolean
  }
  incomeStatement: Array<{
    section: string
    label: string
    monthAmount: number
    monthPct: number | null
    ytdAmount: number
    ytdPct: number | null
    emphasize?: boolean
  }>
  revenueByChannel: Array<{
    channel: string
    revenue: number
    share: number
    revenuePerUnit: number
    profitPerUnit: number
  }>
  monthlyRevenueByChannel: Array<{
    month: string
    etsy: number
    squarespace: number
    shopify: number
    ebay: number
    other: number
    total: number
  }>
  cashForecast: CashForecastRow[]
}

function delta(value: number, previous: number, asPoints = false): MetricDelta {
  if (asPoints) {
    return {
      value,
      previous,
      changePct: null,
      changePts: Number((value - previous).toFixed(4)),
    }
  }
  if (previous === 0) {
    return { value, previous, changePct: value === 0 ? 0 : null, changePts: null }
  }
  return {
    value,
    previous,
    changePct: Number((((value - previous) / previous) * 100).toFixed(2)),
    changePts: null,
  }
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

function ordersIn(orders: Order[], start: string, end: string): Order[] {
  return orders.filter((o) => inRange(o.orderedAt, start, end))
}

function trafficIn(rows: DailyTraffic[], start: string, end: string): DailyTraffic[] {
  return rows.filter((r) => r.date >= start && r.date <= end)
}

/** Product page views in the range, keyed by product name (GA4 item name). */
export function productViewsByName(
  rows: DailyProductView[],
  range: { start: string; end: string },
): Map<string, { name: string; category: string | null; views: number }> {
  const viewMap = new Map<string, { name: string; category: string | null; views: number }>()
  for (const row of rows) {
    if (row.date < range.start || row.date > range.end) continue
    const existing = viewMap.get(row.productName) ?? {
      name: row.productName,
      category: row.category,
      views: 0,
    }
    existing.views += row.views
    if (!existing.category && row.category) existing.category = row.category
    viewMap.set(row.productName, existing)
  }
  return viewMap
}

/** Visits by traffic source, summed over already range-filtered traffic rows. */
export function trafficSourceBreakdown(
  traffic: DailyTraffic[],
): Array<{ source: string; visits: number; share: number }> {
  const sourceMap = new Map<string, number>()
  for (const t of traffic) {
    for (const [source, count] of Object.entries(t.sourceBreakdown)) {
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + count)
    }
  }
  const sourceVisits = sum([...sourceMap.values()]) || sum(traffic.map((t) => t.visits))
  return [...sourceMap.entries()]
    .map(([source, v]) => ({ source, visits: v, share: sourceVisits ? (v / sourceVisits) * 100 : 0 }))
    .sort((a, b) => b.visits - a.visits)
}

/** Top 10 Search Console queries whose period overlaps the range. */
export function topSearchKeywords(
  keywords: SearchKeyword[],
  range: { start: string; end: string },
): Array<{ query: string; visits: number }> {
  return keywords
    .filter((k) => k.periodEnd >= range.start && k.periodStart <= range.end)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10)
    .map((k) => ({ query: k.query, visits: k.visits }))
}

export function buildOverview(input: {
  range: DateRange
  orders: Order[]
  traffic: DailyTraffic[]
  keywords: SearchKeyword[]
  abandoned: AbandonedCartStats | null
  productViews?: DailyProductView[]
}): OverviewResponse {
  const { range, traffic, keywords, abandoned, productViews: productViewRows = [] } = input
  const orders = preferLiveOrders(input.orders)
  const curOrders = ordersIn(orders, range.start, range.end)
  const prevOrders = ordersIn(orders, range.prevStart, range.prevEnd)
  const curTraffic = trafficIn(traffic, range.start, range.end)
  const prevTraffic = trafficIn(traffic, range.prevStart, range.prevEnd)

  const revenue = sum(curOrders.map((o) => o.revenue))
  const prevRevenue = sum(prevOrders.map((o) => o.revenue))
  const orderCount = curOrders.length
  const prevOrderCount = prevOrders.length
  const aov = orderCount ? revenue / orderCount : 0
  const prevAov = prevOrderCount ? prevRevenue / prevOrderCount : 0

  const visits = sum(curTraffic.map((t) => t.visits))
  const prevVisits = sum(prevTraffic.map((t) => t.visits))
  const uniqueVisitors = sum(curTraffic.map((t) => t.uniqueVisitors))
  // Conversion is website orders over website visits: Etsy/eBay/in-person buyers never visit the site.
  const webCount = curOrders.filter((o) => isWebsiteChannel(o.channel)).length
  const prevWebCount = prevOrders.filter((o) => isWebsiteChannel(o.channel)).length
  const conversionRate = visits ? (webCount / visits) * 100 : 0
  const prevConversion = prevVisits ? (prevWebCount / prevVisits) * 100 : 0

  const dayMap = new Map<string, { revenue: number; orders: number; visits: number }>()
  for (let d = range.start; d <= range.end; ) {
    dayMap.set(d, { revenue: 0, orders: 0, visits: 0 })
    const next = new Date(`${d}T00:00:00.000Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    d = next.toISOString().slice(0, 10)
  }
  for (const o of curOrders) {
    const day = storeDay(o.orderedAt)
    const row = dayMap.get(day)
    if (!row) continue
    row.revenue += o.revenue
    row.orders += 1
  }
  for (const t of curTraffic) {
    const row = dayMap.get(t.date)
    if (row) row.visits += t.visits
  }

  const productViews = sum(curTraffic.map((t) => t.productViews))
  const addToCarts = sum(curTraffic.map((t) => t.addToCarts))
  const checkouts = sum(curTraffic.map((t) => t.checkouts))
  const ga4Purchases = sum(curTraffic.map((t) => t.purchases))
  const funnelOrderSource: OverviewResponse['funnelOrderSource'] = ga4Purchases > 0 ? 'ga4' : 'orders'
  const purchases = ga4Purchases || webCount
  const sourceCounts = orderSourceCounts(curOrders)
  const orderSources = {
    salesTracker: sourceCounts['sales-tracker'] ?? 0,
    shopify: sourceCounts.shopify ?? 0,
    manual: sourceCounts.manual ?? 0,
    note:
      (sourceCounts.shopify ?? 0) > 0
        ? 'Shopify Admin is the live order source. Sales Tracker history is kept for other channels; sheet Shopify rows are ignored when live Shopify data exists.'
        : 'Orders are from Sales Tracker history and/or manual uploads. Sync Shopify to take over the shopify channel.',
  }
  const funnelSteps = [
    { step: 'Site visits', count: visits },
    { step: 'Viewed a product', count: productViews },
    { step: 'Added to cart', count: addToCarts },
    { step: 'Started checkout', count: checkouts },
    { step: 'Placed order', count: purchases },
  ]
  const funnel = funnelSteps.map((step, i) => ({
    ...step,
    pctOfStart: visits ? (step.count / visits) * 100 : 0,
    pctOfPrevious: i === 0 || funnelSteps[i - 1].count === 0 ? null : (step.count / funnelSteps[i - 1].count) * 100,
  }))

  const productMap = new Map<string, { name: string; category: string | null; units: number; revenue: number }>()
  for (const o of curOrders) {
    for (const line of o.lines) {
      const key = line.productName
      const existing = productMap.get(key) ?? {
        name: line.productName,
        category: line.category,
        units: 0,
        revenue: 0,
      }
      existing.units += line.quantity
      existing.revenue += line.lineRevenue
      productMap.set(key, existing)
    }
  }
  const products = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => ({ ...p, share: revenue ? (p.revenue / revenue) * 100 : 0 }))

  const viewMap = productViewsByName(productViewRows, range)
  const viewsTotal = sum([...viewMap.values()].map((p) => p.views)) || productViews
  const productViewsByProduct = [...viewMap.values()]
    .sort((a, b) => b.views - a.views)
    .map((p) => ({
      ...p,
      share: viewsTotal ? (p.views / viewsTotal) * 100 : 0,
    }))

  const trafficSources = trafficSourceBreakdown(curTraffic)

  const ordersWithState = curOrders.filter((o) => o.state?.trim())
  // Prefer real ship-to states whenever we have any (Shopify). Sales Tracker rows stay out of this chart.
  const useOrderStates = ordersWithState.length > 0
  let stateBreakdownMode: 'orders' | 'visitors' = 'orders'
  let ordersByState: Array<{ state: string; orders: number; share: number }>

  if (useOrderStates) {
    const stateMap = new Map<string, number>()
    for (const o of ordersWithState) {
      const state = o.state!.trim()
      stateMap.set(state, (stateMap.get(state) ?? 0) + 1)
    }
    const statedCount = ordersWithState.length
    ordersByState = [...stateMap.entries()]
      .map(([state, n]) => ({ state, orders: n, share: statedCount ? (n / statedCount) * 100 : 0 }))
      .sort((a, b) => b.orders - a.orders)
  } else {
    stateBreakdownMode = 'visitors'
    const regionMap = new Map<string, number>()
    for (const t of curTraffic) {
      for (const [region, count] of Object.entries(t.regionBreakdown || {})) {
        regionMap.set(region, (regionMap.get(region) ?? 0) + count)
      }
    }
    const regionTotal = sum([...regionMap.values()])
    ordersByState = [...regionMap.entries()]
      .map(([state, n]) => ({
        state,
        orders: n,
        share: regionTotal ? (n / regionTotal) * 100 : 0,
      }))
      .sort((a, b) => b.orders - a.orders)
  }

  const returning = curOrders.filter((o) => o.isReturning).length

  return {
    range,
    kpis: {
      revenue: delta(revenue, prevRevenue),
      orders: delta(orderCount, prevOrderCount),
      aov: delta(aov, prevAov),
      conversionRate: delta(conversionRate, prevConversion, true),
      visits: delta(visits, prevVisits),
      uniqueVisitors,
    },
    revenueByDay: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })),
    funnel,
    productViewsByProduct,
    products,
    trafficSources,
    ordersByState,
    stateBreakdownMode,
    searchKeywords: topSearchKeywords(keywords, range),
    abandonedCarts: {
      abandoned: abandoned?.abandoned ?? 0,
      recovered: abandoned?.recovered ?? 0,
      recoveredRevenue: abandoned?.recoveredRevenue ?? 0,
      returningCustomerShare: orderCount ? (returning / orderCount) * 100 : 0,
      synced: Boolean(abandoned),
      source: abandoned ? 'shopify' : 'none',
    },
    orderSources,
    funnelOrderSource,
  }
}

function channelLabel(channel: string): string {
  switch (channel) {
    case 'etsy':
      return 'Etsy'
    case 'squarespace':
      return 'Squarespace'
    case 'shopify':
      return 'Shopify'
    case 'ebay':
      return 'eBay'
    case 'other':
      return 'In person & other'
    default:
      return channel
  }
}

/** Expense categories each P&L line draws from; anything else lands in "Legal & other". */
const PNL_CATEGORIES = {
  packaging: [['cogs', 'Shipping Boxes'], ['cogs', 'Stickers'], ['cogs', 'Cards']],
  fees: [['cogs', 'Fees']],
  freight: [['cogs', 'Freight']],
  ads: [['sga', 'Ads'], ['sga', 'Marketing']],
  website: [['sga', 'Website']],
  design: [['cogs', 'Vector File'], ['cogs', 'Prototype'], ['sga', 'Other Expenses']],
  manufacturing: [['cogs', 'Manufacturing']],
} as const

const MAPPED = new Set(Object.values(PNL_CATEGORIES).flat().map(([b, c]) => `${b}:${c}`))

type Statement = {
  revenue: number
  manufacturing: number
  packaging: number
  gross: number
  fees: number
  ship: number
  ads: number
  website: number
  design: number
  other: number
  opex: number
  net: number
  units: number
}

/**
 * One income statement for a set of orders and expenses. Manufacturing is the booked
 * Manufacturing expense when `estimateCogs` is false, otherwise units × unitCogs (used only
 * when the whole year has no Manufacturing expense, so months always add up to the year).
 */
function statementFor(orders: Order[], expenses: Expense[], estimateCogs: boolean, unitCogs: number): Statement {
  const pick = (pairs: ReadonlyArray<readonly [string, string]>) =>
    sum(expenses.filter((e) => pairs.some(([b, c]) => e.bucket === b && e.category === c)).map((e) => e.amount))
  const units = sum(orders.flatMap((o) => o.lines.map((l) => l.quantity)))
  const revenue = sum(orders.map((o) => o.revenue))
  const manufacturing = estimateCogs ? units * unitCogs : pick(PNL_CATEGORIES.manufacturing)
  const packaging = pick(PNL_CATEGORIES.packaging)
  const gross = revenue - manufacturing - packaging
  const fees = sum(orders.map((o) => o.fees)) + pick(PNL_CATEGORIES.fees)
  const ship = sum(orders.map((o) => o.shippingCost)) + pick(PNL_CATEGORIES.freight)
  const ads = sum(orders.map((o) => o.marketingCost)) + pick(PNL_CATEGORIES.ads)
  const website = pick(PNL_CATEGORIES.website)
  const design = pick(PNL_CATEGORIES.design)
  const other = sum(expenses.filter((e) => !MAPPED.has(`${e.bucket}:${e.category}`)).map((e) => e.amount))
  const opex = fees + ship + ads + website + design + other
  return { revenue, manufacturing, packaging, gross, fees, ship, ads, website, design, other, opex, net: gross - opex, units }
}

export function buildPnL(input: {
  year: number
  month: string | null
  orders: Order[]
  expenses: Expense[]
  cashForecast: CashForecastRow[]
  /** Store-local YYYY-MM-DD. YTD comparisons run Jan 1 → this day of the previous year; cash is as of it. */
  today?: string
  /** Unit manufacturing cost, used only when a year has no Manufacturing expenses at all. */
  unitCogs?: number
}): PnLResponse {
  const { month, expenses, cashForecast } = input
  const orders = preferLiveOrders(input.orders)
  const unitCogs = input.unitCogs ?? 15
  const today = input.today ?? new Date().toISOString().slice(0, 10)

  // Prefer year from YYYY-MM so a mismatched year query can't zero out the Month column.
  const year =
    month && /^\d{4}-\d{2}$/.test(month) ? Number(month.slice(0, 4)) : input.year

  // The current year runs through today; a past year is compared in full.
  const throughMd = String(year) === today.slice(0, 4) ? today.slice(5) : '12-31'
  const inYear = (day: string, y: number) => day >= `${y}-01-01` && day <= `${y}-${throughMd}`
  const ytdOrders = orders.filter((o) => storeDay(o.orderedAt).startsWith(String(year)))
  const ytdExpenses = expenses.filter((e) => e.spentAt.startsWith(String(year)))
  const prevOrders = orders.filter((o) => inYear(storeDay(o.orderedAt), year - 1))
  const prevExpenses = expenses.filter((e) => inYear(e.spentAt.slice(0, 10), year - 1))
  const monthOrders = month ? orders.filter((o) => monthKey(o.orderedAt) === month) : []
  const monthExpenses = month ? expenses.filter((e) => e.spentAt.startsWith(month)) : []

  const hasMfg = (list: Expense[]) => list.some((e) => e.bucket === 'cogs' && e.category === 'Manufacturing')
  const estimateThisYear = !hasMfg(ytdExpenses)
  const ytd = statementFor(ytdOrders, ytdExpenses, estimateThisYear, unitCogs)
  const mon = statementFor(monthOrders, monthExpenses, estimateThisYear, unitCogs)
  const prev = statementFor(
    prevOrders,
    prevExpenses,
    !hasMfg(expenses.filter((e) => e.spentAt.startsWith(String(year - 1)))),
    unitCogs,
  )

  const pct = (amount: number, base: number) => (base ? (amount / base) * 100 : null)
  const line = (section: string, label: string, m: number, y: number, emphasize = false) => ({
    section,
    label,
    monthAmount: m,
    monthPct: pct(Math.abs(m), mon.revenue),
    ytdAmount: y,
    ytdPct: pct(Math.abs(y), ytd.revenue),
    ...(emphasize ? { emphasize: true } : {}),
  })
  const signed = (m: number, y: number) => [m, y] as const
  const byChannel = (list: Order[], channel: string) => sum(list.filter((o) => o.channel === channel).map((o) => o.revenue))
  const channels = [
    ['Etsy', 'etsy'],
    ['Squarespace', 'squarespace'],
    ['Shopify', 'shopify'],
    ['eBay', 'ebay'],
    ['In person & other', 'other'],
  ] as const

  const incomeStatement: PnLResponse['incomeStatement'] = [
    ...channels.map(([label, ch]) => ({
      section: 'REVENUE',
      label,
      monthAmount: byChannel(monthOrders, ch),
      monthPct: pct(byChannel(monthOrders, ch), mon.revenue),
      ytdAmount: byChannel(ytdOrders, ch),
      ytdPct: pct(byChannel(ytdOrders, ch), ytd.revenue),
    })),
    { section: 'REVENUE', label: 'Total revenue', monthAmount: mon.revenue, monthPct: 100, ytdAmount: ytd.revenue, ytdPct: 100, emphasize: true },
    line('COST OF GOODS SOLD', 'Product manufacturing', ...signed(-mon.manufacturing, -ytd.manufacturing)),
    line('COST OF GOODS SOLD', 'Packaging', ...signed(-mon.packaging, -ytd.packaging)),
    { ...line('COST OF GOODS SOLD', 'Gross profit', mon.gross, ytd.gross, true), monthPct: pct(mon.gross, mon.revenue), ytdPct: pct(ytd.gross, ytd.revenue) },
    line('OPERATING EXPENSES', 'Platform & payment fees', -mon.fees, -ytd.fees),
    line('OPERATING EXPENSES', 'Shipping & freight', -mon.ship, -ytd.ship),
    line('OPERATING EXPENSES', 'Marketing & ads', -mon.ads, -ytd.ads),
    line('OPERATING EXPENSES', 'Website & software', -mon.website, -ytd.website),
    line('OPERATING EXPENSES', 'Design & prototypes', -mon.design, -ytd.design),
    line('OPERATING EXPENSES', 'Legal & other', -mon.other, -ytd.other),
    line('OPERATING EXPENSES', 'Total operating expenses', -mon.opex, -ytd.opex, true),
    { ...line('NET', 'Net income', mon.net, ytd.net, true), monthPct: pct(mon.net, mon.revenue), ytdPct: pct(ytd.net, ytd.revenue) },
  ]

  const channelStats = (['etsy', 'squarespace', 'shopify', 'ebay', 'other'] as const).map((channel) => {
    const list = ytdOrders.filter((o) => o.channel === channel)
    const rev = sum(list.map((o) => o.revenue))
    const u = sum(list.flatMap((o) => o.lines.map((l) => l.quantity))) || 1
    const profit =
      rev - u * unitCogs - sum(list.map((o) => o.fees)) - sum(list.map((o) => o.shippingCost)) - sum(list.map((o) => o.marketingCost))
    return {
      channel: channelLabel(channel),
      revenue: rev,
      share: ytd.revenue ? (rev / ytd.revenue) * 100 : 0,
      revenuePerUnit: rev / u,
      profitPerUnit: profit / u,
    }
  }).filter((c) => c.revenue > 0 || ['Etsy', 'Squarespace', 'eBay', 'In person & other'].includes(c.channel))

  const monthMap = new Map<string, { etsy: number; squarespace: number; shopify: number; ebay: number; other: number; total: number }>()
  for (const o of orders) {
    const m = monthKey(o.orderedAt)
    const row = monthMap.get(m) ?? { etsy: 0, squarespace: 0, shopify: 0, ebay: 0, other: 0, total: 0 }
    if (o.channel in row) {
      row[o.channel as 'etsy'] += o.revenue
    }
    row.total += o.revenue
    monthMap.set(m, row)
  }

  // Cash on hand is the latest month that has ended, not a future forecast month.
  const sortedCash = [...cashForecast].sort((a, b) => a.monthEnd.localeCompare(b.monthEnd))
  const cashRow = sortedCash.filter((r) => r.monthEnd.slice(0, 10) <= today).at(-1) ?? null

  const margin = (st: Statement) => (st.revenue ? (st.gross / st.revenue) * 100 : 0)

  return {
    year,
    month,
    kpis: {
      revenueYtd: delta(ytd.revenue, prev.revenue),
      grossMarginYtd: delta(margin(ytd), margin(prev), true),
      netIncomeYtd: delta(ytd.net, prev.net),
      cashOnHand: cashRow ? cashRow.endingBalance : 0,
      cashAsOf: cashRow ? cashRow.monthEnd.slice(0, 10) : null,
      comparedThrough: `${year - 1}-${throughMd}`,
      cogsEstimated: estimateThisYear,
    },
    incomeStatement,
    revenueByChannel: channelStats,
    monthlyRevenueByChannel: [...monthMap.entries()]
      .filter(([m]) => m.startsWith(String(year)))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => ({ month: m, ...v })),
    cashForecast: sortedCash,
  }
}

export type RoasCampaign = {
  campaign: string
  spend: number
  platformReportedSales: number
  platformRoas: number | null
  platformReportedOrders: number
  shareOfPlatformSpend: number
  /** Website sales linked to this campaign: exact (tagged orders) plus estimated. */
  siteSales: number
  siteSalesEstimated: number
  siteTaggedOrders: number
  siteRoas: number | null
}

export type RoasPlatform = {
  platform: string
  spend: number
  platformReportedSales: number
  platformRoas: number | null
  siteObservedSales: number
  /** Part of siteObservedSales credited by share of visits rather than from a tagged order. */
  siteSalesEstimated: number
  siteTaggedOrders: number
  siteRoas: number | null
  campaigns: RoasCampaign[]
  /** True when this platform has a live spend sync configured. */
  connected: boolean
  /**
   * How site sales were found:
   * - ok: from orders tagged with this platform's click / UTM (or the marketplace's own sales)
   * - estimated: some or all credited by the platform's share of each day's website visits
   * - unattributed: spend, but no website sales linked to it in this range
   * - not_connected: platform token/sync missing
   */
  salesStatus: 'ok' | 'estimated' | 'unattributed' | 'not_connected'
  note: string | null
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

const GOOGLE_PAID = /^google \/ (cpc|ppc|paid)/i
const META_PAID = /^(facebook|fb|ig|instagram|meta)[^/]* \/ (paid|cpc|ppc)/i

/** Campaign named in an attribution string ("source / medium / campaign"), if any. */
function taggedCampaign(trafficSource: string): string {
  return trafficSource.split(' / ').slice(2).join(' / ').trim().toLowerCase()
}

/**
 * Link website orders to ad campaigns:
 * - an order tagged with the platform's click/UTM counts in full (to its named campaign, else split
 *   across that day's campaigns by their visits);
 * - an untagged order (older orders, other devices) is credited by each campaign's share of that
 *   day's website visits, and counted as estimated;
 * - an order tagged with some other source counts for nothing here.
 */
function linkSiteSales(input: {
  orders: Order[]
  isPaid: RegExp
  campaignSessions: Map<string, Map<string, number>>
  campaignSpend: Map<string, Map<string, number>>
  visitsByDay: Map<string, number>
}): { byCampaign: Map<string, { exact: number; estimated: number; tagged: number }>; exact: number; estimated: number; tagged: number } {
  const byCampaign = new Map<string, { exact: number; estimated: number; tagged: number }>()
  const credit = (campaign: string, amount: number, kind: 'exact' | 'estimated', tagged = 0) => {
    const c = byCampaign.get(campaign) ?? { exact: 0, estimated: 0, tagged: 0 }
    c[kind] += amount
    c.tagged += tagged
    byCampaign.set(campaign, c)
  }
  let exact = 0
  let estimated = 0
  let tagged = 0
  for (const o of input.orders) {
    const day = storeDay(o.orderedAt)
    const sessions = input.campaignSessions.get(day) ?? new Map<string, number>()
    const daySessions = sum([...sessions.values()])
    const source = o.trafficSource?.trim() ?? ''
    if (source.includes(' / ')) {
      if (!input.isPaid.test(source)) continue
      exact += o.revenue
      tagged += 1
      const named = taggedCampaign(source)
      const match = [...(input.campaignSpend.get(day)?.keys() ?? []), ...sessions.keys()].find(
        (c) => named && c.toLowerCase() === named,
      )
      if (match) {
        credit(match, o.revenue, 'exact', 1)
        continue
      }
      // Auto-tagged clicks carry no campaign name: split by that day's visits, else spend.
      const weights = daySessions > 0 ? sessions : (input.campaignSpend.get(day) ?? new Map<string, number>())
      const total = sum([...weights.values()])
      if (total <= 0) {
        credit('Unassigned', o.revenue, 'exact', 1)
        continue
      }
      // The order counts once, against the campaign with the biggest share of it.
      const top = [...weights.entries()].sort((x, y) => y[1] - x[1])[0][0]
      for (const [c, w] of weights) credit(c, (o.revenue * w) / total, 'exact', c === top ? 1 : 0)
      continue
    }
    if (source) continue // tagged in an older format we can't read: don't guess
    const visits = input.visitsByDay.get(day) ?? 0
    if (visits <= 0 || daySessions <= 0) continue
    for (const [c, n] of sessions) {
      const amount = o.revenue * Math.min(1, n / visits)
      estimated += amount
      credit(c, amount, 'estimated')
    }
  }
  return { byCampaign, exact, estimated, tagged }
}

export function buildRoas(input: {
  range: DateRange
  adSpend: DailyAdSpend[]
  orders: Order[]
  /** GA4 daily website visits; needed to estimate sales for untagged orders. */
  traffic?: DailyTraffic[]
}): RoasPlatform[] {
  const orders = preferLiveOrders(input.orders)
  const inRangeOrders = ordersIn(orders, input.range.start, input.range.end)
  const websiteOrders = inRangeOrders.filter((o) => isWebsiteChannel(o.channel))
  const spendRows = input.adSpend.filter((r) => r.date >= input.range.start && r.date <= input.range.end)
  const visitsByDay = new Map(
    (input.traffic ?? [])
      .filter((t) => t.date >= input.range.start && t.date <= input.range.end)
      .map((t) => [t.date, t.visits] as const),
  )

  type Acc = {
    spend: number
    reported: number
    campaigns: Map<string, { spend: number; reported: number; orders: number }>
    sessions: Map<string, Map<string, number>>
    spendByDay: Map<string, Map<string, number>>
  }
  const platforms = new Map<string, Acc>()
  for (const row of spendRows) {
    const cur: Acc = platforms.get(row.platform) ?? {
      spend: 0,
      reported: 0,
      campaigns: new Map(),
      sessions: new Map(),
      spendByDay: new Map(),
    }
    cur.spend += row.spend
    cur.reported += row.platformReportedSales
    const campaignName = row.campaign?.trim() || 'Unassigned'
    const camp = cur.campaigns.get(campaignName) ?? { spend: 0, reported: 0, orders: 0 }
    camp.spend += row.spend
    camp.reported += row.platformReportedSales
    camp.orders += row.platformReportedOrders
    cur.campaigns.set(campaignName, camp)
    const add = (m: Map<string, Map<string, number>>, v: number) => {
      if (v <= 0) return
      const day = m.get(row.date) ?? new Map<string, number>()
      day.set(campaignName, (day.get(campaignName) ?? 0) + v)
      m.set(row.date, day)
    }
    add(cur.sessions, row.sessions ?? 0)
    add(cur.spendByDay, row.spend)
    platforms.set(row.platform, cur)
  }

  const channelSales = (channel: string) =>
    sum(inRangeOrders.filter((o) => o.channel === channel).map((o) => o.revenue))

  const rows: RoasPlatform[] = [...platforms.entries()]
    .map(([platform, v]): RoasPlatform => {
      const p = platform.toLowerCase()
      const isGoogle = p.includes('google')
      const isMeta = p.includes('meta') || p.includes('facebook')
      const isEtsy = p.includes('etsy')
      let linked: ReturnType<typeof linkSiteSales> | null = null
      let marketplaceSales = 0
      if (isGoogle || isMeta) {
        linked = linkSiteSales({
          orders: websiteOrders,
          isPaid: isGoogle ? GOOGLE_PAID : META_PAID,
          // Visit-share estimates need per-campaign visits, which GA4 gives for Google Ads only.
          campaignSessions: isGoogle ? v.sessions : new Map(),
          campaignSpend: v.spendByDay,
          visitsByDay,
        })
      } else if (isEtsy) marketplaceSales = channelSales('etsy')
      else if (p.includes('ebay')) marketplaceSales = channelSales('ebay')
      else marketplaceSales = sum(websiteOrders.map((o) => o.revenue))

      const siteSales = linked ? linked.exact + linked.estimated : marketplaceSales
      const estimated = linked?.estimated ?? 0
      let salesStatus: RoasPlatform['salesStatus'] = 'ok'
      let note: string | null = null
      if (v.spend > 0 && siteSales <= 0) {
        salesStatus = 'unattributed'
        note = isGoogle
          ? 'No website sales linked to these ads in this range yet.'
          : isEtsy
            ? 'No Etsy sales in this range yet.'
            : 'No website orders tagged with this platform’s ads in this range yet.'
      } else if (isEtsy) {
        const hasOffsite = v.campaigns.has(OFFSITE_CAMPAIGN)
        const hasOther = [...v.campaigns.keys()].some((name) => name !== OFFSITE_CAMPAIGN)
        note =
          'Etsy’s ads only show on Etsy, so ROAS here is Etsy sales in this range ÷ Etsy ad spend.' +
          (hasOffsite && hasOther
            ? ' Offsite Ads gets the orders Etsy charged an Offsite Ads fee on; the other campaigns get the rest.'
            : hasOffsite
              ? ' The Offsite Ads row shows only the orders Etsy charged an Offsite Ads fee on.'
              : '')
      } else if (linked && estimated > 0) {
        salesStatus = 'estimated'
        const share = (() => {
          let paid = 0
          let total = 0
          for (const [day, visits] of visitsByDay) {
            total += visits
            paid += sum([...(v.sessions.get(day)?.values() ?? [])])
          }
          return total > 0 ? (paid / total) * 100 : 0
        })()
        note =
          `${linked.tagged ? `${money(linked.exact)} from ${linked.tagged} order${linked.tagged === 1 ? '' : 's'} tagged with an ad click, plus ` : ''}` +
          `${money(estimated)} estimated: website orders without an ad tag are credited by these campaigns’ share of each day’s visits (${share.toFixed(0)}% over this range).`
      }

      // Etsy: Offsite Ads keep the sales Etsy credits them; the other campaigns split the rest by spend.
      const etsyOffsite = isEtsy ? v.campaigns.get(OFFSITE_CAMPAIGN) : undefined
      const etsyOffsiteSales = Math.min(etsyOffsite?.reported ?? 0, marketplaceSales)
      const etsyOtherSpend = isEtsy
        ? sum([...v.campaigns.entries()].filter(([name]) => name !== OFFSITE_CAMPAIGN).map(([, c]) => c.spend))
        : 0
      const etsyCampaignSales = (campaign: string, spend: number) => {
        if (campaign === OFFSITE_CAMPAIGN) return etsyOffsiteSales
        const rest = Math.max(0, marketplaceSales - etsyOffsiteSales)
        return etsyOtherSpend > 0 ? (rest * spend) / etsyOtherSpend : 0
      }

      const campaigns = [...v.campaigns.entries()]
        .map(([campaign, c]) => {
          const l = linked?.byCampaign.get(campaign)
          const siteSalesC = isEtsy ? etsyCampaignSales(campaign, c.spend) : l ? l.exact + l.estimated : 0
          return {
            campaign,
            spend: c.spend,
            platformReportedSales: c.reported,
            platformRoas: c.spend > 0 && c.reported > 0 ? c.reported / c.spend : null,
            platformReportedOrders: c.orders,
            shareOfPlatformSpend: v.spend ? (c.spend / v.spend) * 100 : 0,
            siteSales: siteSalesC,
            siteSalesEstimated: l?.estimated ?? 0,
            siteTaggedOrders: isEtsy && campaign === OFFSITE_CAMPAIGN ? c.orders : (l?.tagged ?? 0),
            siteRoas: c.spend > 0 && siteSalesC > 0 ? siteSalesC / c.spend : null,
          }
        })
        .sort((a, b) => b.spend - a.spend)
      return {
        platform,
        spend: v.spend,
        platformReportedSales: v.reported,
        platformRoas: v.spend > 0 && v.reported > 0 ? v.reported / v.spend : null,
        siteObservedSales: siteSales,
        siteSalesEstimated: estimated,
        siteTaggedOrders: linked?.tagged ?? 0,
        siteRoas: v.spend > 0 && siteSales > 0 ? siteSales / v.spend : null,
        campaigns,
        connected: true,
        salesStatus,
        note,
      }
    })
    .sort((a, b) => b.spend - a.spend)

  const hasMeta = rows.some((r) => /meta|facebook/i.test(r.platform))
  if (!hasMeta) {
    rows.push({
      platform: 'Meta',
      spend: 0,
      platformReportedSales: 0,
      platformRoas: null,
      siteObservedSales: 0,
      siteSalesEstimated: 0,
      siteTaggedOrders: 0,
      siteRoas: null,
      campaigns: [],
      connected: false,
      salesStatus: 'not_connected',
      note: 'Not connected — add META_ACCESS_TOKEN to sync Meta ad spend.',
    })
  }

  return rows
}
