export type SalesChannel = 'etsy' | 'squarespace' | 'shopify' | 'ebay' | 'other'

/** Website rollup: Squarespace before cutover, Shopify after. */
export type WebsiteChannel = 'website'

export type OrderChannel = SalesChannel | WebsiteChannel

/** Where an order row came from — used to prefer live Shopify over sheet history. */
export type OrderSource = 'sales-tracker' | 'shopify' | 'manual' | 'etsy'

export type DashboardUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  isAdmin: boolean
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
  /** Website sessions GA4 credits to this campaign that day (0 when unknown). */
  sessions?: number
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
  isAdmin: boolean
}

/**
 * One order from a platform export that carries the buyer's email (Squarespace, Etsy).
 * Used only to tell new from returning customers; revenue and P&L stay on the Sales Tracker.
 */
export type CustomerOrder = {
  channel: string
  externalId: string
  orderedAt: string
  email: string
  /** What the customer paid for goods and shipping. */
  revenue: number
  units: number
}

/**
 * One Etsy receipt as Etsy reports it (detail data, not an order: Sales Tracker receipts are
 * stored here too). Money in dollars. Fee/label/net fields are null until known.
 */
export type EtsyReceiptDetail = {
  receiptId: string
  orderedAt: string
  /** Etsy status, lowercased: paid, completed, open, payment processing, canceled, fully refunded, partially refunded. */
  status: string
  buyerUserId: string | null
  /** What the buyer paid: items − discount + shipping + tax. */
  grandtotal: number
  /** Items less coupon discounts (no shipping or tax). */
  subtotal: number
  shippingCharged: number
  tax: number
  /** Percent/fixed coupon discount (free-shipping coupons not included). */
  discount: number
  /** Sum of Etsy refunds on the receipt. */
  refunded: number
  /** Sum of transactions' shop_coupon (shop-funded coupons). Etsy's API doesn't expose coupon codes. */
  shopCoupon: number
  /** Sum of transactions' buyer_coupon (Etsy-funded coupons). */
  buyerCoupon: number
  units: number
  isShipped: boolean
  /** Earliest transaction ship time, else the first shipment notification; null when not shipped. */
  shippedAt: string | null
  /** Card processing fee from Etsy Payments (adjusted after refunds), null when unknown. */
  processingFees: number | null
  /** Processing + transaction (and other sale) fees attributable to this receipt; null when not fully known. Excludes Offsite Ads. */
  actualFees: number | null
  /** Etsy shipping labels bought for this receipt (net of label refunds); null when none found. */
  labelCost: number | null
  /** Offsite Ads fee charged on this receipt (net); null when none. */
  offsiteAdsFee: number | null
  /** Etsy Payments net (gross − processing fees, after refunds); null when unknown. */
  net: number | null
  /** True once the receipt's Etsy Payments record has been read. */
  paymentSynced: boolean
}

/** Etsy payment-account ledger totals per store day and ledger type (sales, deposits and refunds excluded). */
export type EtsyFeesDaily = {
  date: string
  /** Etsy ledger_type, lowercased. */
  ledgerType: string
  /** Classifier bucket (see etsyFeeCategory in etsy-fees.ts). */
  category: string
  /** Dollars; positive = cost to the shop, credits reduce it. */
  amount: number
  entries: number
}

export type EtsyListing = {
  listingId: string
  title: string
  url: string | null
  /** active, sold_out, inactive or expired. */
  state: string
  price: number
  quantity: number
  favorites: number
  /** Etsy's daily-tabulated view count (active listings only; 0 when unknown). */
  views: number
  tags: string[]
  /** Etsy's last-modified time for the listing (ISO), or the sync time when Etsy gives none. */
  updatedAt: string
}

export type EtsyReview = {
  /** `t:<transaction_id>` when Etsy gives one, else `h:<sha1 of listing|created|rating|text>`. */
  reviewKey: string
  listingId: string | null
  transactionId: string | null
  /** 1–5. */
  rating: number
  review: string | null
  createdAt: string
}

/** One snapshot of the Etsy shop per store day (last write wins). */
export type EtsyShopDaily = {
  date: string
  shopName: string
  url: string | null
  favorites: number
  /** Reviews in the past year, per Etsy. */
  reviewCount: number
  reviewAverage: number | null
  totalSold: number
  activeListings: number
}
