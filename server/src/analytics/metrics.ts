import { inRange, isWebsiteChannel, monthKey, type DateRange } from './period.js'
import type {
  AbandonedCartStats,
  CashForecastRow,
  DailyAdSpend,
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
  products: Array<{
    name: string
    category: string | null
    units: number
    revenue: number
    share: number
  }>
  trafficSources: Array<{ source: string; visits: number; share: number }>
  ordersByState: Array<{ state: string; orders: number; share: number }>
  searchKeywords: Array<{ query: string; visits: number }>
  abandonedCarts: {
    abandoned: number
    recovered: number
    recoveredRevenue: number
    returningCustomerShare: number
  }
}

export type PnLResponse = {
  year: number
  month: string | null
  kpis: {
    revenueYtd: MetricDelta
    grossMarginYtd: MetricDelta
    netIncomeYtd: MetricDelta
    cashOnHand: number
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

export function buildOverview(input: {
  range: DateRange
  orders: Order[]
  traffic: DailyTraffic[]
  keywords: SearchKeyword[]
  abandoned: AbandonedCartStats | null
}): OverviewResponse {
  const { range, orders, traffic, keywords, abandoned } = input
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
  const conversionRate = visits ? (orderCount / visits) * 100 : 0
  const prevConversion = prevVisits ? (prevOrderCount / prevVisits) * 100 : 0

  const dayMap = new Map<string, { revenue: number; orders: number; visits: number }>()
  for (let d = range.start; d <= range.end; ) {
    dayMap.set(d, { revenue: 0, orders: 0, visits: 0 })
    const next = new Date(`${d}T00:00:00.000Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    d = next.toISOString().slice(0, 10)
  }
  for (const o of curOrders) {
    const day = o.orderedAt.slice(0, 10)
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
  const purchases = sum(curTraffic.map((t) => t.purchases)) || orderCount
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

  const sourceMap = new Map<string, number>()
  for (const t of curTraffic) {
    for (const [source, count] of Object.entries(t.sourceBreakdown)) {
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + count)
    }
  }
  const sourceVisits = sum([...sourceMap.values()]) || visits
  const trafficSources = [...sourceMap.entries()]
    .map(([source, v]) => ({ source, visits: v, share: sourceVisits ? (v / sourceVisits) * 100 : 0 }))
    .sort((a, b) => b.visits - a.visits)

  const stateMap = new Map<string, number>()
  for (const o of curOrders) {
    const state = o.state?.trim() || 'Unknown'
    stateMap.set(state, (stateMap.get(state) ?? 0) + 1)
  }
  const ordersByState = [...stateMap.entries()]
    .map(([state, n]) => ({ state, orders: n, share: orderCount ? (n / orderCount) * 100 : 0 }))
    .sort((a, b) => b.orders - a.orders)

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
    products,
    trafficSources,
    ordersByState,
    searchKeywords: keywords
      .filter((k) => k.periodEnd >= range.start && k.periodStart <= range.end)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10)
      .map((k) => ({ query: k.query, visits: k.visits })),
    abandonedCarts: {
      abandoned: abandoned?.abandoned ?? 0,
      recovered: abandoned?.recovered ?? 0,
      recoveredRevenue: abandoned?.recoveredRevenue ?? 0,
      returningCustomerShare: orderCount ? (returning / orderCount) * 100 : 0,
    },
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

export function buildPnL(input: {
  year: number
  month: string | null
  orders: Order[]
  expenses: Expense[]
  cashForecast: CashForecastRow[]
  /** Unit manufacturing cost used for per-unit profit when line COGS unavailable. */
  unitCogs?: number
}): PnLResponse {
  const { year, month, orders, expenses, cashForecast } = input
  const unitCogs = input.unitCogs ?? 15

  const ytdOrders = orders.filter((o) => o.orderedAt.startsWith(String(year)))
  const monthOrders = month ? ytdOrders.filter((o) => monthKey(o.orderedAt) === month) : []

  const ytdPrevOrders = orders.filter((o) => o.orderedAt.startsWith(String(year - 1)))
  // Compare selected month vs previous calendar month for net income sparkline-style KPI
  const prevMonth = month
    ? (() => {
        const [y, m] = month.split('-').map(Number)
        const d = new Date(Date.UTC(y, m - 2, 1))
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      })()
    : null
  const prevMonthOrders = prevMonth ? orders.filter((o) => monthKey(o.orderedAt) === prevMonth) : []

  const sumRev = (list: Order[]) => sum(list.map((o) => o.revenue))
  const sumFees = (list: Order[]) => sum(list.map((o) => o.fees))
  const sumShip = (list: Order[]) => sum(list.map((o) => o.shippingCost))
  const sumMkt = (list: Order[]) => sum(list.map((o) => o.marketingCost))
  const units = (list: Order[]) => sum(list.flatMap((o) => o.lines.map((l) => l.quantity)))

  const ytdExpenses = expenses.filter((e) => e.spentAt.startsWith(String(year)))
  const monthExpenses = month ? ytdExpenses.filter((e) => e.spentAt.startsWith(month)) : []

  const expenseTotal = (list: Expense[], bucket: 'cogs' | 'sga', category?: string) =>
    sum(
      list
        .filter((e) => e.bucket === bucket && (!category || e.category === category))
        .map((e) => e.amount),
    )

  const manufacturingYtd = expenseTotal(ytdExpenses, 'cogs', 'Manufacturing') || units(ytdOrders) * unitCogs
  const packagingYtd =
    expenseTotal(ytdExpenses, 'cogs', 'Shipping Boxes') +
    expenseTotal(ytdExpenses, 'cogs', 'Stickers') +
    expenseTotal(ytdExpenses, 'cogs', 'Cards')
  const manufacturingMonth =
    expenseTotal(monthExpenses, 'cogs', 'Manufacturing') || units(monthOrders) * unitCogs
  const packagingMonth =
    expenseTotal(monthExpenses, 'cogs', 'Shipping Boxes') +
    expenseTotal(monthExpenses, 'cogs', 'Stickers') +
    expenseTotal(monthExpenses, 'cogs', 'Cards')

  const revenueYtd = sumRev(ytdOrders)
  const revenueMonth = sumRev(monthOrders)
  const cogsYtd = manufacturingYtd + packagingYtd
  const cogsMonth = manufacturingMonth + packagingMonth
  const grossYtd = revenueYtd - cogsYtd
  const grossMonth = revenueMonth - cogsMonth

  const feesYtd = sumFees(ytdOrders) + expenseTotal(ytdExpenses, 'cogs', 'Fees')
  const shipYtd = sumShip(ytdOrders) + expenseTotal(ytdExpenses, 'cogs', 'Freight')
  const adsYtd = sumMkt(ytdOrders) + expenseTotal(ytdExpenses, 'sga', 'Ads') + expenseTotal(ytdExpenses, 'sga', 'Marketing')
  const websiteYtd = expenseTotal(ytdExpenses, 'sga', 'Website')
  const designYtd =
    expenseTotal(ytdExpenses, 'cogs', 'Vector File') +
    expenseTotal(ytdExpenses, 'cogs', 'Prototype') +
    expenseTotal(ytdExpenses, 'sga', 'Other Expenses')

  const feesMonth = sumFees(monthOrders) + expenseTotal(monthExpenses, 'cogs', 'Fees')
  const shipMonth = sumShip(monthOrders) + expenseTotal(monthExpenses, 'cogs', 'Freight')
  const adsMonth =
    sumMkt(monthOrders) + expenseTotal(monthExpenses, 'sga', 'Ads') + expenseTotal(monthExpenses, 'sga', 'Marketing')
  const websiteMonth = expenseTotal(monthExpenses, 'sga', 'Website')
  const designMonth =
    expenseTotal(monthExpenses, 'cogs', 'Vector File') +
    expenseTotal(monthExpenses, 'cogs', 'Prototype') +
    expenseTotal(monthExpenses, 'sga', 'Other Expenses')

  const opexYtd = feesYtd + shipYtd + adsYtd + websiteYtd + designYtd
  const opexMonth = feesMonth + shipMonth + adsMonth + websiteMonth + designMonth
  const netYtd = grossYtd - opexYtd
  const netMonth = grossMonth - opexMonth
  const prevNetMonth = (() => {
    const rev = sumRev(prevMonthOrders)
    const cogs = units(prevMonthOrders) * unitCogs
    const opex =
      sumFees(prevMonthOrders) + sumShip(prevMonthOrders) + sumMkt(prevMonthOrders)
    return rev - cogs - opex
  })()

  const pct = (amount: number, base: number) => (base ? (amount / base) * 100 : null)

  const incomeStatement: PnLResponse['incomeStatement'] = [
    { section: 'REVENUE', label: 'Etsy', monthAmount: sumRev(monthOrders.filter((o) => o.channel === 'etsy')), monthPct: null, ytdAmount: sumRev(ytdOrders.filter((o) => o.channel === 'etsy')), ytdPct: null },
    { section: 'REVENUE', label: 'Squarespace', monthAmount: sumRev(monthOrders.filter((o) => o.channel === 'squarespace')), monthPct: null, ytdAmount: sumRev(ytdOrders.filter((o) => o.channel === 'squarespace')), ytdPct: null },
    { section: 'REVENUE', label: 'Shopify', monthAmount: sumRev(monthOrders.filter((o) => o.channel === 'shopify')), monthPct: null, ytdAmount: sumRev(ytdOrders.filter((o) => o.channel === 'shopify')), ytdPct: null },
    { section: 'REVENUE', label: 'eBay', monthAmount: sumRev(monthOrders.filter((o) => o.channel === 'ebay')), monthPct: null, ytdAmount: sumRev(ytdOrders.filter((o) => o.channel === 'ebay')), ytdPct: null },
    { section: 'REVENUE', label: 'In person & other', monthAmount: sumRev(monthOrders.filter((o) => o.channel === 'other')), monthPct: null, ytdAmount: sumRev(ytdOrders.filter((o) => o.channel === 'other')), ytdPct: null },
    { section: 'REVENUE', label: 'Total revenue', monthAmount: revenueMonth, monthPct: 100, ytdAmount: revenueYtd, ytdPct: 100, emphasize: true },
    { section: 'COST OF GOODS SOLD', label: 'Product manufacturing', monthAmount: -manufacturingMonth, monthPct: pct(manufacturingMonth, revenueMonth), ytdAmount: -manufacturingYtd, ytdPct: pct(manufacturingYtd, revenueYtd) },
    { section: 'COST OF GOODS SOLD', label: 'Packaging', monthAmount: -packagingMonth, monthPct: pct(packagingMonth, revenueMonth), ytdAmount: -packagingYtd, ytdPct: pct(packagingYtd, revenueYtd) },
    { section: 'COST OF GOODS SOLD', label: 'Gross profit', monthAmount: grossMonth, monthPct: pct(grossMonth, revenueMonth), ytdAmount: grossYtd, ytdPct: pct(grossYtd, revenueYtd), emphasize: true },
    { section: 'OPERATING EXPENSES', label: 'Platform & payment fees', monthAmount: -feesMonth, monthPct: pct(feesMonth, revenueMonth), ytdAmount: -feesYtd, ytdPct: pct(feesYtd, revenueYtd) },
    { section: 'OPERATING EXPENSES', label: 'Shipping & freight', monthAmount: -shipMonth, monthPct: pct(shipMonth, revenueMonth), ytdAmount: -shipYtd, ytdPct: pct(shipYtd, revenueYtd) },
    { section: 'OPERATING EXPENSES', label: 'Marketing & ads', monthAmount: -adsMonth, monthPct: pct(adsMonth, revenueMonth), ytdAmount: -adsYtd, ytdPct: pct(adsYtd, revenueYtd) },
    { section: 'OPERATING EXPENSES', label: 'Website & software', monthAmount: -websiteMonth, monthPct: pct(websiteMonth, revenueMonth), ytdAmount: -websiteYtd, ytdPct: pct(websiteYtd, revenueYtd) },
    { section: 'OPERATING EXPENSES', label: 'Design & prototypes', monthAmount: -designMonth, monthPct: pct(designMonth, revenueMonth), ytdAmount: -designYtd, ytdPct: pct(designYtd, revenueYtd) },
    { section: 'OPERATING EXPENSES', label: 'Total operating expenses', monthAmount: -opexMonth, monthPct: pct(opexMonth, revenueMonth), ytdAmount: -opexYtd, ytdPct: pct(opexYtd, revenueYtd), emphasize: true },
    { section: 'NET', label: 'Net income', monthAmount: netMonth, monthPct: pct(netMonth, revenueMonth), ytdAmount: netYtd, ytdPct: pct(netYtd, revenueYtd), emphasize: true },
  ]

  for (const row of incomeStatement) {
    if (row.section === 'REVENUE' && row.label !== 'Total revenue') {
      row.monthPct = pct(row.monthAmount, revenueMonth)
      row.ytdPct = pct(row.ytdAmount, revenueYtd)
    }
  }

  const channelStats = (['etsy', 'squarespace', 'shopify', 'ebay', 'other'] as const).map((channel) => {
    const list = ytdOrders.filter((o) => o.channel === channel)
    const rev = sumRev(list)
    const u = units(list) || 1
    const profit = rev - u * unitCogs - sumFees(list) - sumShip(list) - sumMkt(list)
    return {
      channel: channelLabel(channel),
      revenue: rev,
      share: revenueYtd ? (rev / revenueYtd) * 100 : 0,
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

  const cashOnHand = cashForecast.length
    ? [...cashForecast].sort((a, b) => a.monthEnd.localeCompare(b.monthEnd)).at(-1)!.endingBalance
    : 0

  const grossMarginYtd = revenueYtd ? (grossYtd / revenueYtd) * 100 : 0
  const prevGrossMargin = (() => {
    const rev = sumRev(ytdPrevOrders)
    if (!rev) return 0
    const cogs = units(ytdPrevOrders) * unitCogs
    return ((rev - cogs) / rev) * 100
  })()

  return {
    year,
    month,
    kpis: {
      revenueYtd: delta(revenueYtd, sumRev(ytdPrevOrders)),
      grossMarginYtd: delta(grossMarginYtd, prevGrossMargin, true),
      netIncomeYtd: delta(netYtd, prevNetMonth),
      cashOnHand,
    },
    incomeStatement,
    revenueByChannel: channelStats,
    monthlyRevenueByChannel: [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-13)
      .map(([m, v]) => ({ month: m, ...v })),
    cashForecast: [...cashForecast].sort((a, b) => a.monthEnd.localeCompare(b.monthEnd)),
  }
}

export type RoasCampaign = {
  campaign: string
  spend: number
  platformReportedSales: number
  platformRoas: number | null
  platformReportedOrders: number
  shareOfPlatformSpend: number
}

export type RoasPlatform = {
  platform: string
  spend: number
  platformReportedSales: number
  platformRoas: number | null
  siteObservedSales: number
  siteRoas: number | null
  campaigns: RoasCampaign[]
}

export function buildRoas(input: {
  range: DateRange
  adSpend: DailyAdSpend[]
  orders: Order[]
}): RoasPlatform[] {
  const spendRows = input.adSpend.filter((r) => r.date >= input.range.start && r.date <= input.range.end)
  const platforms = new Map<
    string,
    { spend: number; reported: number; campaigns: Map<string, { spend: number; reported: number; orders: number }> }
  >()
  for (const row of spendRows) {
    const cur = platforms.get(row.platform) ?? {
      spend: 0,
      reported: 0,
      campaigns: new Map(),
    }
    cur.spend += row.spend
    cur.reported += row.platformReportedSales
    const campaignName = row.campaign?.trim() || 'Unassigned'
    const camp = cur.campaigns.get(campaignName) ?? { spend: 0, reported: 0, orders: 0 }
    camp.spend += row.spend
    camp.reported += row.platformReportedSales
    camp.orders += row.platformReportedOrders
    cur.campaigns.set(campaignName, camp)
    platforms.set(row.platform, cur)
  }

  const websiteSales = sum(
    ordersIn(input.orders, input.range.start, input.range.end)
      .filter((o) => isWebsiteChannel(o.channel))
      .map((o) => o.revenue),
  )
  const etsySales = sum(
    ordersIn(input.orders, input.range.start, input.range.end)
      .filter((o) => o.channel === 'etsy')
      .map((o) => o.revenue),
  )
  const ebaySales = sum(
    ordersIn(input.orders, input.range.start, input.range.end)
      .filter((o) => o.channel === 'ebay')
      .map((o) => o.revenue),
  )

  const siteFor = (platform: string): number => {
    const p = platform.toLowerCase()
    if (p.includes('google')) {
      return sum(
        ordersIn(input.orders, input.range.start, input.range.end)
          .filter((o) => isWebsiteChannel(o.channel) && /google\s*ads/i.test(o.trafficSource ?? ''))
          .map((o) => o.revenue),
      )
    }
    if (p.includes('meta') || p.includes('facebook')) {
      return sum(
        ordersIn(input.orders, input.range.start, input.range.end)
          .filter((o) => isWebsiteChannel(o.channel) && /social|instagram|facebook|meta/i.test(o.trafficSource ?? ''))
          .map((o) => o.revenue),
      )
    }
    if (p.includes('etsy')) return etsySales
    if (p.includes('ebay')) return ebaySales
    return websiteSales
  }

  return [...platforms.entries()]
    .map(([platform, v]) => {
      const siteObservedSales = siteFor(platform)
      const campaigns = [...v.campaigns.entries()]
        .map(([campaign, c]) => ({
          campaign,
          spend: c.spend,
          platformReportedSales: c.reported,
          platformRoas: c.spend ? c.reported / c.spend : null,
          platformReportedOrders: c.orders,
          shareOfPlatformSpend: v.spend ? (c.spend / v.spend) * 100 : 0,
        }))
        .sort((a, b) => b.spend - a.spend)
      return {
        platform,
        spend: v.spend,
        platformReportedSales: v.reported,
        platformRoas: v.spend ? v.reported / v.spend : null,
        siteObservedSales,
        siteRoas: v.spend ? siteObservedSales / v.spend : null,
        campaigns,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}
