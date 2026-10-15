export type SalesChannel = 'etsy' | 'squarespace' | 'shopify' | 'ebay' | 'other'

/** Website rollup: Squarespace before cutover, Shopify after. */
export type WebsiteChannel = 'website'

export type OrderChannel = SalesChannel | WebsiteChannel

/** Where an order row came from — used to prefer live Shopify over sheet history. */
export type OrderSource = 'sales-tracker' | 'shopify' | 'manual'

export type DashboardUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
}

export type DashboardSession = {
  id: string
  userId: string
  expiresAt: string
}

export type OrderLine = {
  productName: string
  productSku: string | null
  category: string | null
  quantity: number
  unitPrice: number
  lineRevenue: number
}

export type Order = {
  id: string
  externalId: string
  channel: SalesChannel
  /** Provenance for cutover / dedupe. Defaults to sales-tracker for legacy rows. */
  source: OrderSource
  orderedAt: string
  revenue: number
  fees: number
  shippingCost: number
  marketingCost: number
  state: string | null
  customerEmail: string | null
  isReturning: boolean
  trafficSource: string | null
  lines: OrderLine[]
}

export type DailyTraffic = {
  date: string
  channel: 'website'
  visits: number
  uniqueVisitors: number
  productViews: number
  addToCarts: number
  checkouts: number
  purchases: number
  sourceBreakdown: Record<string, number>
  /** GA4 region (US state / territory) → sessions for the day. */
  regionBreakdown?: Record<string, number>
}

/** Per-product page views for a single UTC day (GA4 item views, etc.). */
export type DailyProductView = {
  date: string
  productName: string
  category: string | null
  views: number
}

export type DailyAdSpend = {
  date: string
  platform: string
  /** Campaign / ad set name when available; empty string for platform rollups. */
  campaign: string
  spend: number
  platformReportedSales: number
  platformReportedOrders: number
}

export type SearchKeyword = {
  query: string
  visits: number
  periodStart: string
  periodEnd: string
}

export type Expense = {
  id: string
  spentAt: string
  category: string
  explanation: string
  amount: number
  bucket: 'cogs' | 'sga'
  productLine: string | null
}

export type CashForecastRow = {
  monthEnd: string
  beginningBalance: number
  collections: number
  freightAndFees: number
  marketing: number
  website: number
  manufacturing: number
  endingBalance: number
}

export type AbandonedCartStats = {
  periodStart: string
  periodEnd: string
  abandoned: number
  recovered: number
  recoveredRevenue: number
}

export type SyncRun = {
  id: string
  source: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'ok' | 'error'
  message: string | null
  rowsTouched: number
}

export type PeriodKey = '7d' | '30d' | '90d' | 'year'

export type OverviewQuery = {
  period: PeriodKey
  /** Inclusive end date YYYY-MM-DD; defaults to today UTC. */
  asOf?: string
}

export type PublicUser = {
  id: string
  email: string
  name: string
}
