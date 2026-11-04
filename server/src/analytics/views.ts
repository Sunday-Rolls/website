/**
 * Pure builders for the redesigned dashboard's pages (/dashboard/api/orders, products,
 * marketing, funnel, health and the extra /api/overview fields). Each takes plain
 * arrays plus a range so it can be unit-tested without a store.
 *
 * Days are America/Chicago store days (storeDay / inRange). Orders go through
 * preferLiveOrders first, like buildOverview, so a sale is never counted twice.
 */
import { buildRoas, productViewsByName, topSearchKeywords, trafficSourceBreakdown, type RoasPlatform } from './metrics.js'
import { preferLiveOrders } from './orders.js'
import { inRange, isWebsiteChannel, storeDay, type DateRange } from './period.js'
import type {
  AbandonedCartStats,
  CashForecastRow,
  DailyAdSpend,
  DailyProductView,
  DailyTraffic,
  Order,
  SearchKeyword,
  SyncRun,
} from './types.js'

type Range = Pick<DateRange, 'start' | 'end'>

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

function liveOrdersIn(orders: Order[], range: Range): Order[] {
  return preferLiveOrders(orders).filter((o) => inRange(o.orderedAt, range.start, range.end))
}

function adSpendIn(rows: DailyAdSpend[], range: Range): DailyAdSpend[] {
  return rows.filter((r) => r.date >= range.start && r.date <= range.end)
}

function unitsOf(order: Order): number {
  return sum(order.lines.map((l) => l.quantity))
}

/** Every YYYY-MM-DD from start to end inclusive. */
function daysOf(range: Range): string[] {
  const days: string[] = []
  for (let d = range.start; d <= range.end; ) {
    days.push(d)
    const next = new Date(`${d}T00:00:00.000Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    d = next.toISOString().slice(0, 10)
  }
  return days
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

// ---------------------------------------------------------------- overview extras

export type MerView = { revenue: number; adSpend: number; mer: number | null }

/** Marketing efficiency ratio: all-channel revenue / all-platform ad spend. */
export function buildMer(input: { range: Range; orders: Order[]; adSpend: DailyAdSpend[] }): MerView {
  const revenue = sum(liveOrdersIn(input.orders, input.range).map((o) => o.revenue))
  const adSpend = sum(adSpendIn(input.adSpend, input.range).map((r) => r.spend))
  return { revenue, adSpend, mer: adSpend > 0 ? revenue / adSpend : null }
}

export type PaceView = {
  monthToDate: number
  lastMonthTotal: number
  lastMonthToDate: number
  daysElapsed: number
  daysInMonth: number
}

/**
 * Revenue pace for the store-local month containing `asOf` (YYYY-MM-DD), compared with
 * the previous month through the same day number (clamped to that month's length).
 */
export function buildPace(input: { orders: Order[]; asOf: string }): PaceView {
  const [year, month, day] = input.asOf.split('-').map(Number)
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthPrefix = `${year}-${pad(month)}`
  const prevPrefix = `${prevYear}-${pad(prevMonth)}`
  const prevDays = daysInMonth(prevYear, prevMonth)
  const prevToDateEnd = `${prevPrefix}-${pad(Math.min(day, prevDays))}`

  let monthToDate = 0
  let lastMonthTotal = 0
  let lastMonthToDate = 0
  for (const o of preferLiveOrders(input.orders)) {
    const d = storeDay(o.orderedAt)
    if (d.startsWith(monthPrefix) && d <= input.asOf) monthToDate += o.revenue
    if (d.startsWith(prevPrefix)) {
      lastMonthTotal += o.revenue
      if (d <= prevToDateEnd) lastMonthToDate += o.revenue
    }
  }
  return { monthToDate, lastMonthTotal, lastMonthToDate, daysElapsed: day, daysInMonth: daysInMonth(year, month) }
}

export type AttentionView = {
  abandoned: { count: number; value: number; recovered: number; recoveredRevenue: number }
  failedSyncs: Array<{ source: string; message: string; at: string }>
  cashOnHand: number | null
  cashAsOf: string | null
}

/**
 * Things to look at today. `abandoned.value` is 0: Shopify sync stores only counts and
 * recovered revenue for abandoned checkouts, not their cart value.
 * Cash is the `endingBalance` of the latest forecast month ending on or before `today`.
 */
export function buildAttention(input: {
  abandoned: AbandonedCartStats | null
  syncs: SyncRun[]
  cashForecast: CashForecastRow[]
  today: string
}): AttentionView {
  const cashRow = input.cashForecast
    .filter((r) => r.monthEnd.slice(0, 10) <= input.today)
    .sort((a, b) => b.monthEnd.localeCompare(a.monthEnd))[0]
  return {
    abandoned: {
      count: input.abandoned?.abandoned ?? 0,
      value: 0,
      recovered: input.abandoned?.recovered ?? 0,
      recoveredRevenue: input.abandoned?.recoveredRevenue ?? 0,
    },
    failedSyncs: input.syncs
      .filter((s) => s.status === 'error')
      .map((s) => ({ source: s.source, message: s.message ?? '', at: s.finishedAt ?? s.startedAt })),
    cashOnHand: cashRow ? cashRow.endingBalance : null,
    cashAsOf: cashRow ? cashRow.monthEnd.slice(0, 10) : null,
  }
}

// ---------------------------------------------------------------- orders

export type OrdersView = {
  range: DateRange
  totals: Array<{ channel: string; orders: number; revenue: number; units: number; aov: number }>
  orders: Array<{
    externalId: string
    channel: string
    source: string
    orderedAt: string
    revenue: number
    fees: number
    shippingCost: number
    state: string | null
    customerEmail: string | null
    isReturning: boolean
    units: number
    lines: Array<{ productName: string; sku: string | null; qty: number; lineRevenue: number }>
  }>
}

export const ORDERS_LIMIT = 500

function matchesChannel(order: Order, channel: string): boolean {
  if (channel === 'website') return isWebsiteChannel(order.channel)
  return order.channel === channel
}

/** Orders in range, newest first (capped). `totals` always cover every channel in the range. */
export function buildOrdersView(input: { range: DateRange; orders: Order[]; channel?: string | null }): OrdersView {
  const inRangeOrders = liveOrdersIn(input.orders, input.range)
  const totalsMap = new Map<string, { orders: number; revenue: number; units: number }>()
  for (const o of inRangeOrders) {
    const t = totalsMap.get(o.channel) ?? { orders: 0, revenue: 0, units: 0 }
    t.orders += 1
    t.revenue += o.revenue
    t.units += unitsOf(o)
    totalsMap.set(o.channel, t)
  }
  const totals = [...totalsMap.entries()]
    .map(([channel, t]) => ({ channel, ...t, aov: t.orders ? t.revenue / t.orders : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  const channel = input.channel?.trim()
  const orders = inRangeOrders
    .filter((o) => !channel || matchesChannel(o, channel))
    .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.orderedAt.localeCompare(a.orderedAt))
    .slice(0, ORDERS_LIMIT)
    .map((o) => ({
      externalId: o.externalId,
      channel: o.channel,
      source: o.source,
      orderedAt: o.orderedAt,
      revenue: o.revenue,
      fees: o.fees,
      shippingCost: o.shippingCost,
      state: o.state,
      customerEmail: o.customerEmail,
      isReturning: o.isReturning,
      units: unitsOf(o),
      lines: o.lines.map((l) => ({
        productName: l.productName,
        sku: l.productSku,
        qty: l.quantity,
        lineRevenue: l.lineRevenue,
      })),
    }))
  return { range: input.range, totals, orders }
}

// ---------------------------------------------------------------- products

export type ProductsView = {
  range: DateRange
  products: Array<{
    name: string
    category: string | null
    units: number
    revenue: number
    orders: number
    views: number | null
    /** Orders containing the product per 100 product views (percent); null without views. */
    viewToOrderRate: number | null
  }>
  categories: Array<{ category: string; units: number; revenue: number }>
  trend: Array<{ date: string; units: number }>
}

/**
 * Sales by product, joined to GA4 product views by exact product name (as the overview
 * keys them). Products that were viewed but not sold are included with zero units.
 */
export function buildProductsView(input: {
  range: DateRange
  orders: Order[]
  productViews: DailyProductView[]
}): ProductsView {
  const orders = liveOrdersIn(input.orders, input.range)
  const sales = new Map<string, { name: string; category: string | null; units: number; revenue: number; orders: Set<string> }>()
  const trend = new Map(daysOf(input.range).map((d) => [d, 0]))
  for (const o of orders) {
    const day = storeDay(o.orderedAt)
    for (const line of o.lines) {
      const p = sales.get(line.productName) ?? {
        name: line.productName,
        category: line.category,
        units: 0,
        revenue: 0,
        orders: new Set<string>(),
      }
      p.units += line.quantity
      p.revenue += line.lineRevenue
      p.orders.add(o.id || `${o.channel}:${o.externalId}`)
      if (!p.category && line.category) p.category = line.category
      sales.set(line.productName, p)
      if (trend.has(day)) trend.set(day, trend.get(day)! + line.quantity)
    }
  }

  const views = productViewsByName(input.productViews, input.range)
  const names = new Set([...sales.keys(), ...views.keys()])
  const products = [...names]
    .map((name) => {
      const s = sales.get(name)
      const v = views.get(name)
      const orderCount = s?.orders.size ?? 0
      const viewCount = v ? v.views : null
      return {
        name,
        category: s?.category ?? v?.category ?? null,
        units: s?.units ?? 0,
        revenue: s?.revenue ?? 0,
        orders: orderCount,
        views: viewCount,
        viewToOrderRate: viewCount ? (orderCount / viewCount) * 100 : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue || (b.views ?? 0) - (a.views ?? 0) || a.name.localeCompare(b.name))

  const categoryMap = new Map<string, { units: number; revenue: number }>()
  for (const p of products) {
    if (!p.units && !p.revenue) continue
    const key = p.category ?? 'Uncategorized'
    const c = categoryMap.get(key) ?? { units: 0, revenue: 0 }
    c.units += p.units
    c.revenue += p.revenue
    categoryMap.set(key, c)
  }
  const categories = [...categoryMap.entries()]
    .map(([category, c]) => ({ category, ...c }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    range: input.range,
    products,
    categories,
    trend: [...trend.entries()].map(([date, units]) => ({ date, units })),
  }
}

// ---------------------------------------------------------------- marketing

export type MarketingView = {
  range: DateRange
  revenue: number
  adSpend: number
  mer: number | null
  newCustomers: number
  newCustomerCac: number | null
  platforms: RoasPlatform[]
  spendTrend: Array<{ date: string; spend: number; revenue: number }>
  sources: Array<{ source: string; visits: number; share: number }>
  keywords: Array<{ query: string; visits: number }>
  connected: { googleAds: boolean; meta: boolean; etsyAds: boolean }
}

export function buildMarketingView(input: {
  range: DateRange
  orders: Order[]
  adSpend: DailyAdSpend[]
  traffic: DailyTraffic[]
  keywords: SearchKeyword[]
}): MarketingView {
  const { range } = input
  const { revenue, adSpend, mer } = buildMer(input)
  const orders = liveOrdersIn(input.orders, range)
  const newCustomers = orders.filter((o) => o.isReturning === false).length

  const trend = new Map(daysOf(range).map((d) => [d, { spend: 0, revenue: 0 }]))
  for (const r of adSpendIn(input.adSpend, range)) {
    const row = trend.get(r.date)
    if (row) row.spend += r.spend
  }
  for (const o of orders) {
    const row = trend.get(storeDay(o.orderedAt))
    if (row) row.revenue += o.revenue
  }

  const platformsSeen = input.adSpend.map((r) => r.platform)
  return {
    range,
    revenue,
    adSpend,
    mer,
    newCustomers,
    newCustomerCac: newCustomers > 0 ? adSpend / newCustomers : null,
    platforms: buildRoas({ range, orders: input.orders, adSpend: input.adSpend }),
    spendTrend: [...trend.entries()].map(([date, v]) => ({ date, ...v })),
    sources: trafficSourceBreakdown(input.traffic.filter((t) => t.date >= range.start && t.date <= range.end)),
    keywords: topSearchKeywords(input.keywords, range),
    connected: {
      googleAds: platformsSeen.some((p) => /google/i.test(p)),
      meta: platformsSeen.some((p) => /meta|facebook|instagram/i.test(p)),
      etsyAds: platformsSeen.some((p) => /etsy/i.test(p)),
    },
  }
}

// ---------------------------------------------------------------- funnel

export type FunnelView = {
  range: DateRange
  funnel: { visits: number; productViews: number; addToCarts: number; checkouts: number; purchases: number }
  /**
   * Whether each step's count is real. A step reads 0 while a later step has activity only when
   * GA4 isn't receiving that event (e.g. add_to_cart), so it is "not tracked", not a drop-off.
   */
  tracked: { visits: boolean; productViews: boolean; addToCarts: boolean; checkouts: boolean; purchases: boolean }
  /** Where `purchases` came from: GA4 purchase events, or website orders when GA4 has none. */
  purchasesFrom: 'ga4' | 'orders'
  abandoned: AbandonedCartStats | null
  customers: { new: number; returning: number }
  states: Array<{ state: string; orders: number; revenue: number }>
  regions: Array<{ region: string; sessions: number }>
}

/** `purchases` falls back to website orders (not Etsy/eBay/in person) when GA4 has no purchase events. */
export function buildFunnelView(input: {
  range: DateRange
  orders: Order[]
  traffic: DailyTraffic[]
  abandoned: AbandonedCartStats | null
}): FunnelView {
  const { range } = input
  const traffic = input.traffic.filter((t) => t.date >= range.start && t.date <= range.end)
  const orders = liveOrdersIn(input.orders, range)
  const total = (key: 'visits' | 'productViews' | 'addToCarts' | 'checkouts' | 'purchases') =>
    sum(traffic.map((t) => t[key]))

  const stateMap = new Map<string, { orders: number; revenue: number }>()
  for (const o of orders) {
    const state = o.state?.trim()
    if (!state) continue
    const s = stateMap.get(state) ?? { orders: 0, revenue: 0 }
    s.orders += 1
    s.revenue += o.revenue
    stateMap.set(state, s)
  }
  const regionMap = new Map<string, number>()
  for (const t of traffic) {
    for (const [region, n] of Object.entries(t.regionBreakdown ?? {})) {
      regionMap.set(region, (regionMap.get(region) ?? 0) + n)
    }
  }
  const returning = orders.filter((o) => o.isReturning).length

  const ga4Purchases = total('purchases')
  const funnel = {
    visits: total('visits'),
    productViews: total('productViews'),
    addToCarts: total('addToCarts'),
    checkouts: total('checkouts'),
    purchases: ga4Purchases || orders.filter((o) => isWebsiteChannel(o.channel)).length,
  }
  const steps = ['visits', 'productViews', 'addToCarts', 'checkouts', 'purchases'] as const
  const tracked = Object.fromEntries(
    steps.map((key, i) => [key, funnel[key] > 0 || !steps.slice(i + 1).some((later) => funnel[later] > 0)]),
  ) as FunnelView['tracked']

  return {
    range,
    funnel,
    tracked,
    purchasesFrom: ga4Purchases > 0 ? 'ga4' : 'orders',
    abandoned: input.abandoned,
    customers: { new: orders.length - returning, returning },
    states: [...stateMap.entries()]
      .map(([state, s]) => ({ state, ...s }))
      .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue),
    regions: [...regionMap.entries()]
      .map(([region, sessions]) => ({ region, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
  }
}

// ---------------------------------------------------------------- health

export type HealthSource = {
  source: string
  label: string
  configured: boolean
  missing: string | null
  freshMinutes: number | null
  lastSync: { status: SyncRun['status']; at: string; message: string | null } | null
}

/** One entry per data source; `syncSource` is the name its runs are recorded under in sync history. */
export function buildHealth(
  defs: Array<{ source: string; label: string; missing: string | null; freshMs: number | null; syncSource?: string }>,
  syncs: SyncRun[],
): { sources: HealthSource[] } {
  return {
    sources: defs.map((d) => {
      const last = syncs.find((s) => s.source === (d.syncSource ?? d.source))
      return {
        source: d.source,
        label: d.label,
        configured: d.missing === null,
        missing: d.missing,
        freshMinutes: d.freshMs == null ? null : Math.round(d.freshMs / 60_000),
        lastSync: last ? { status: last.status, at: last.finishedAt ?? last.startedAt, message: last.message } : null,
      }
    }),
  }
}
