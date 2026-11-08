import { randomUUID } from 'node:crypto'
import { addUtcDays, formatUtcDate, parseUtcDate } from './period.js'
import type { AnalyticsStore } from './store.js'
import { INVENTORY_ETSY_KEY, INVENTORY_SHEET_KEY, INVENTORY_SHOPIFY_KEY } from './inventory.js'
import { demoInventory } from './inventory-demo.js'
import type {
  AbandonedCartStats,
  CashForecastRow,
  CustomerOrder,
  DailyAdSpend,
  DailyProductView,
  DailyTraffic,
  EtsyFeesDaily,
  EtsyListing,
  EtsyReceiptDetail,
  EtsyReview,
  EtsyShopDaily,
  Expense,
  Order,
  SearchKeyword,
} from './types.js'

/** Demo dataset shaped like Sam's mockup (sample numbers, not live financials). */
export function buildDemoDataset(asOf = '2026-10-11') {
  const end = parseUtcDate(asOf)
  const orders: Order[] = []
  const products = [
    { name: 'The Birdie Machine', category: 'Mallet headcover', price: 80 },
    { name: 'Retro Roller – Grey', category: 'Mallet headcover', price: 80 },
    { name: 'Morning Dew', category: 'Mallet headcover', price: 80 },
    { name: 'Striped Golf Towel', category: 'Towel', price: 30 },
    { name: 'Solid Golf Towel', category: 'Towel', price: 30 },
  ]
  const states = ['Minnesota', 'Texas', 'Florida', 'California', 'Arizona', 'Other']
  const stateWeights = [31, 19, 17, 15, 12, 78]
  const channels: Array<Order['channel']> = ['squarespace', 'etsy', 'ebay', 'other']

  let orderIndex = 0
  for (let i = 0; i < 60; i++) {
    const day = addUtcDays(end, -i)
    const date = formatUtcDate(day)
    const dayOrders = i < 30 ? 3 + (i % 4) : 2 + (i % 3)
    for (let j = 0; j < dayOrders; j++) {
      const product = products[(orderIndex + j) % products.length]
      const channel = channels[orderIndex % channels.length]
      const state = weightedPick(states, stateWeights, orderIndex)
      const revenue = product.price
      orders.push({
        id: randomUUID(),
        externalId: `demo-${orderIndex}`,
        channel,
        source: 'sales-tracker',
        orderedAt: `${date}T15:00:00.000Z`,
        revenue,
        fees: channel === 'etsy' ? 15 : channel === 'ebay' ? 13 : 4.5,
        shippingCost: 5.7,
        marketingCost: channel === 'squarespace' ? 14 : 8,
        state: state === 'Other' ? 'Wisconsin' : state,
        customerEmail: `buyer${orderIndex}@example.com`,
        isReturning: orderIndex % 5 === 0,
        trafficSource:
          channel === 'squarespace'
            ? ['Instagram', 'Google search', 'Direct', 'Email', 'Google Ads', 'Referral'][orderIndex % 6]
            : null,
        lines: [
          {
            productName: product.name,
            productSku: null,
            category: product.category,
            quantity: 1,
            unitPrice: revenue,
            lineRevenue: revenue,
          },
        ],
      })
      orderIndex += 1
    }
  }

  // Scale last 30 days toward mockup totals (~172 orders / $14.3k) by cloning recent Squarespace-heavy days
  while (orders.filter((o) => o.orderedAt >= formatUtcDate(addUtcDays(end, -29))).length < 172) {
    const base = orders[orders.length % 80]
    orders.push({
      ...base,
      id: randomUUID(),
      externalId: `demo-extra-${orders.length}`,
      orderedAt: formatUtcDate(addUtcDays(end, -(orders.length % 30))) + 'T16:00:00.000Z',
      channel: 'squarespace',
      isReturning: orders.length % 3 === 0,
    })
  }

  const traffic: DailyTraffic[] = []
  const sources = {
    Instagram: 2430,
    'Google search': 1790,
    Direct: 1290,
    Email: 715,
    'Google Ads': 572,
    Referral: 353,
  }
  const sourceTotal = Object.values(sources).reduce((a, b) => a + b, 0)
  for (let i = 0; i < 30; i++) {
    const date = formatUtcDate(addUtcDays(end, -i))
    const dayShare = 1 / 30
    const visits = Math.round(7150 * dayShare)
    traffic.push({
      date,
      channel: 'website',
      visits,
      uniqueVisitors: Math.round(5480 * dayShare),
      productViews: Math.round(3980 * dayShare),
      addToCarts: Math.round(612 * dayShare),
      checkouts: Math.round(289 * dayShare),
      purchases: Math.round(172 * dayShare),
      sourceBreakdown: Object.fromEntries(
        Object.entries(sources).map(([k, v]) => [k, Math.round(v * dayShare)]),
      ),
    })
  }
  // Fix rounding drift on first day
  traffic[0].visits += 7150 - traffic.reduce((a, t) => a + t.visits, 0)
  void sourceTotal

  // Distribute daily product views across catalog (browse interest ≠ sales mix)
  const viewWeights = [34, 22, 18, 14, 12]
  const weightTotal = viewWeights.reduce((a, b) => a + b, 0)
  const productViewsDaily: DailyProductView[] = []
  for (const day of traffic) {
    let assigned = 0
    products.forEach((product, idx) => {
      const views =
        idx === products.length - 1
          ? day.productViews - assigned
          : Math.round((day.productViews * viewWeights[idx]) / weightTotal)
      assigned += views
      productViewsDaily.push({
        date: day.date,
        productName: product.name,
        category: product.category,
        views: Math.max(0, views),
      })
    })
  }

  const keywords: SearchKeyword[] = [
    { query: 'lab df3 headcover', visits: 214, periodStart: formatUtcDate(addUtcDays(end, -29)), periodEnd: asOf },
    { query: 'mallet putter cover magnetic', visits: 167, periodStart: formatUtcDate(addUtcDays(end, -29)), periodEnd: asOf },
    { query: 'sunday rolls golf', visits: 142, periodStart: formatUtcDate(addUtcDays(end, -29)), periodEnd: asOf },
    { query: 'spider zt headcover', visits: 96, periodStart: formatUtcDate(addUtcDays(end, -29)), periodEnd: asOf },
    { query: 'embroidered golf towel', visits: 71, periodStart: formatUtcDate(addUtcDays(end, -29)), periodEnd: asOf },
  ]

  const abandoned: AbandonedCartStats = {
    periodStart: formatUtcDate(addUtcDays(end, -29)),
    periodEnd: asOf,
    abandoned: 117,
    recovered: 14,
    recoveredRevenue: 1120,
  }

  const adSpend: DailyAdSpend[] = []
  for (let i = 0; i < 28; i++) {
    const date = formatUtcDate(addUtcDays(end, -i))
    adSpend.push(
      {
        date,
        platform: 'Google Ads',
        campaign: 'Brand Search',
        spend: 18,
        platformReportedSales: 52,
        platformReportedOrders: 1,
      },
      {
        date,
        platform: 'Google Ads',
        campaign: 'Shopping · Headcovers',
        spend: 22,
        platformReportedSales: 28,
        platformReportedOrders: 0,
      },
      {
        date,
        platform: 'Google Ads',
        campaign: 'Performance Max',
        spend: 13,
        platformReportedSales: 11,
        platformReportedOrders: 0,
      },
      {
        date,
        platform: 'Meta Ads',
        campaign: 'Prospecting · Lookalike',
        spend: i < 7 ? 16 : 0,
        platformReportedSales: i < 7 ? 40 : 0,
        platformReportedOrders: i < 7 ? 1 : 0,
      },
      {
        date,
        platform: 'Meta Ads',
        campaign: 'Retargeting · Site visitors',
        spend: i < 7 ? 12 : 0,
        platformReportedSales: i < 7 ? 37 : 0,
        platformReportedOrders: 0,
      },
      {
        date,
        platform: 'Etsy Ads',
        campaign: 'Offsite Ads',
        spend: 10,
        platformReportedSales: 8,
        platformReportedOrders: 0,
      },
    )
  }

  const expenses: Expense[] = [
    { id: randomUUID(), spentAt: '2026-09-15', category: 'Manufacturing', explanation: 'Alibaba batch', amount: 1547, bucket: 'cogs', productLine: 'Headcover' },
    { id: randomUUID(), spentAt: '2026-09-10', category: 'Shipping Boxes', explanation: 'Boxes', amount: 188, bucket: 'cogs', productLine: 'Headcover' },
    { id: randomUUID(), spentAt: '2026-09-01', category: 'Website', explanation: 'Rebuild deposit', amount: 4800, bucket: 'sga', productLine: null },
    { id: randomUUID(), spentAt: '2026-09-20', category: 'Ads', explanation: 'Google + Meta', amount: 1010, bucket: 'sga', productLine: null },
    { id: randomUUID(), spentAt: '2026-08-15', category: 'Manufacturing', explanation: 'Prior batch', amount: 12000, bucket: 'cogs', productLine: 'Headcover' },
    { id: randomUUID(), spentAt: '2026-07-01', category: 'Website', explanation: 'Software', amount: 210, bucket: 'sga', productLine: null },
  ]

  // Seed monthly channel revenue across 2026 via synthetic orders already created;
  // add Sep-focused Etsy/SS/eBay orders for P&L month view.
  for (let i = 0; i < 40; i++) {
    orders.push({
      id: randomUUID(),
      externalId: `demo-sep-${i}`,
      channel: i % 3 === 0 ? 'etsy' : i % 3 === 1 ? 'squarespace' : 'ebay',
      source: 'sales-tracker',
      orderedAt: `2026-09-${String(10 + (i % 18)).padStart(2, '0')}T12:00:00.000Z`,
      revenue: 80,
      fees: 12,
      shippingCost: 6,
      marketingCost: 10,
      state: 'Minnesota',
      customerEmail: null,
      isReturning: false,
      trafficSource: null,
      lines: [
        {
          productName: products[i % products.length].name,
          productSku: null,
          category: products[i % products.length].category,
          quantity: 1,
          unitPrice: 80,
          lineRevenue: 80,
        },
      ],
    })
  }

  const cashForecast: CashForecastRow[] = [
    { monthEnd: '2026-09-30', beginningBalance: 10250, collections: 8100, freightAndFees: -2050, marketing: -1250, website: -4800, manufacturing: 0, endingBalance: 10250 },
    { monthEnd: '2026-10-31', beginningBalance: 10250, collections: 8400, freightAndFees: -2120, marketing: -1250, website: 0, manufacturing: 0, endingBalance: 15280 },
    { monthEnd: '2026-11-30', beginningBalance: 15280, collections: 9200, freightAndFees: -2330, marketing: -1400, website: 0, manufacturing: 0, endingBalance: 20750 },
    { monthEnd: '2026-12-31', beginningBalance: 20750, collections: 9600, freightAndFees: -2440, marketing: -1500, website: 0, manufacturing: 0, endingBalance: 26410 },
    { monthEnd: '2027-01-31', beginningBalance: 26410, collections: 7300, freightAndFees: -1850, marketing: -1100, website: 0, manufacturing: 0, endingBalance: 30760 },
  ]

  const etsy = buildDemoEtsy(orders, asOf)

  return { orders, traffic, keywords, productViews: productViewsDaily, abandoned, adSpend, expenses, cashForecast, etsy }
}

const round2 = (n: number) => Math.round(n * 100) / 100

const ETSY_DEMO_LISTINGS: Array<Omit<EtsyListing, 'url' | 'tags' | 'updatedAt'>> = [
  { listingId: '1580000001', title: 'The Birdie Machine', state: 'active', price: 80, quantity: 14, favorites: 212, views: 31 },
  { listingId: '1580000002', title: 'Retro Roller – Grey', state: 'active', price: 80, quantity: 9, favorites: 168, views: 24 },
  { listingId: '1580000003', title: 'Morning Dew', state: 'active', price: 80, quantity: 11, favorites: 143, views: 19 },
  { listingId: '1580000004', title: 'Striped Golf Towel', state: 'active', price: 30, quantity: 25, favorites: 61, views: 9 },
  { listingId: '1580000005', title: 'Solid Golf Towel', state: 'active', price: 30, quantity: 30, favorites: 44, views: 7 },
  { listingId: '1580000006', title: 'Retro Roller – Navy', state: 'sold_out', price: 80, quantity: 0, favorites: 97, views: 0 },
  { listingId: '1580000007', title: 'Blade Putter Cover – Cream', state: 'active', price: 70, quantity: 6, favorites: 38, views: 5 },
  { listingId: '1580000008', title: 'Ball Marker Gift Set', state: 'inactive', price: 25, quantity: 0, favorites: 12, views: 0 },
]

const ETSY_DEMO_REVIEWS = [
  'Even better in person. The magnet closure is perfect.',
  'Fast shipping and beautiful stitching. Bought a second for my dad.',
  'Fits my mallet putter snugly. Love it.',
  null,
  'Great quality, gets compliments every round.',
  'Arrived in two days, packaged really nicely.',
  null,
  'Colors are a little brighter than the photos but still great.',
]

/**
 * Etsy detail tables for the demo: a receipt (plus buyer id) for each seeded Etsy order, daily
 * fee totals, listings, reviews and shop snapshots over the 120 days ending `asOf`. Deterministic.
 */
function buildDemoEtsy(orders: Order[], asOf: string) {
  const end = parseUtcDate(asOf)
  const etsyOrders = orders.filter((o) => o.channel === 'etsy').sort((a, b) => a.orderedAt.localeCompare(b.orderedAt) || a.externalId.localeCompare(b.externalId))
  const buyerPool = Math.max(1, Math.ceil(etsyOrders.length * 0.8))
  const asOfMs = Date.parse(`${asOf}T23:59:59.000Z`)

  const receipts: EtsyReceiptDetail[] = []
  const customerOrders: CustomerOrder[] = []
  etsyOrders.forEach((o, i) => {
    const shopCoupon = i % 5 === 0 ? round2(o.revenue * 0.1) : 0
    const buyerCoupon = i % 11 === 3 ? 4 : 0
    const shippedMs = Date.parse(o.orderedAt) + (1 + (i % 4)) * 86_400_000 - 3 * 3_600_000
    const shipped = shippedMs <= asOfMs
    const transactionFee = round2(o.revenue * 0.065)
    const processingFee = round2(o.revenue * 0.03 + 0.25)
    const buyer = String(70_000 + (i % buyerPool))
    receipts.push({
      receiptId: String(3_300_000_000 + i),
      orderedAt: o.orderedAt,
      status: shipped ? 'completed' : 'paid',
      buyerUserId: buyer,
      grandtotal: o.revenue,
      subtotal: round2(o.revenue - shopCoupon - buyerCoupon),
      shippingCharged: 0,
      tax: 0,
      discount: round2(shopCoupon + buyerCoupon),
      refunded: 0,
      shopCoupon,
      buyerCoupon,
      units: o.lines.reduce((s, l) => s + l.quantity, 0),
      isShipped: shipped,
      shippedAt: shipped ? new Date(shippedMs).toISOString() : null,
      // Every sixth receipt is still waiting on Etsy's payment record, so its fees are estimates.
      processingFees: i % 6 === 5 ? null : processingFee,
      actualFees: i % 6 === 5 ? null : round2(transactionFee + processingFee),
      labelCost: 5.7,
      offsiteAdsFee: null,
      net: i % 6 === 5 ? null : round2(o.revenue - processingFee),
      paymentSynced: i % 6 !== 5,
    })
    // Every seventh order has no buyer id on file, so it shows as unmatched.
    if (i % 7 !== 6) {
      customerOrders.push({
        channel: 'etsy',
        externalId: o.externalId,
        orderedAt: o.orderedAt,
        email: `etsy-buyer:${buyer}`,
        revenue: o.revenue,
        units: o.lines.reduce((s, l) => s + l.quantity, 0),
      })
    }
  })

  const byDay = new Map<string, Order[]>()
  for (const o of etsyOrders) {
    const day = o.orderedAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), o])
  }
  const fees: EtsyFeesDaily[] = []
  const shopDaily: EtsyShopDaily[] = []
  const firstDay = formatUtcDate(addUtcDays(end, -119))
  let sold = 612
  let favorites = 418
  for (let i = 119; i >= 0; i--) {
    const date = formatUtcDate(addUtcDays(end, -i))
    const dayOrders = byDay.get(date) ?? []
    const revenue = dayOrders.reduce((s, o) => s + o.revenue, 0)
    const push = (ledgerType: string, category: string, amount: number, entries: number) => {
      if (amount !== 0) fees.push({ date, ledgerType, category, amount: round2(amount), entries })
    }
    push('transaction', 'transaction_fee', revenue * 0.065, dayOrders.length)
    push('payment_processing_fee', 'processing_fee', revenue * 0.03 + dayOrders.length * 0.25, dayOrders.length)
    push('shipping_labels', 'shipping_label', dayOrders.length * 5.7, dayOrders.length)
    push('listing', 'listing_fee', (dayOrders.length + (i % 4 === 0 ? 1 : 0)) * 0.2, dayOrders.length + (i % 4 === 0 ? 1 : 0))
    push('prolist', 'etsy_ads', 3 + (i % 3), 1)
    if (i % 9 === 4) push('offsite_ads_fee', 'offsite_ads', 12, 1)
    sold += dayOrders.length
    favorites += i % 3 === 0 ? 1 : 0
    shopDaily.push({
      date,
      shopName: 'SundayRollsGolf',
      url: 'https://www.etsy.com/shop/SundayRollsGolf',
      favorites,
      reviewCount: 0,
      reviewAverage: null,
      totalSold: sold,
      activeListings: 6,
    })
  }

  const listingIdByTitle = new Map(ETSY_DEMO_LISTINGS.map((l) => [l.title, l.listingId]))
  const reviews: EtsyReview[] = []
  // Older reviews from before the order history, then roughly every third order reviewed a week later.
  for (let i = 0; i < 6; i++) {
    const listing = ETSY_DEMO_LISTINGS[i % 3]
    reviews.push({
      reviewKey: `t:demo-old-${i}`,
      listingId: listing.listingId,
      transactionId: null,
      rating: 5,
      review: ETSY_DEMO_REVIEWS[(i + 2) % ETSY_DEMO_REVIEWS.length],
      createdAt: `${formatUtcDate(addUtcDays(end, -(118 - i * 9)))}T20:00:00.000Z`,
    })
  }
  etsyOrders.forEach((o, i) => {
    if (i % 3 !== 0) return
    const createdMs = Date.parse(o.orderedAt) + 7 * 86_400_000
    if (createdMs > asOfMs) return
    reviews.push({
      reviewKey: `t:${4_100_000_000 + i}`,
      listingId: listingIdByTitle.get(o.lines[0]?.productName ?? '') ?? null,
      transactionId: String(4_100_000_000 + i),
      rating: i % 23 === 9 ? 3 : i % 15 === 6 ? 4 : 5,
      review: ETSY_DEMO_REVIEWS[i % ETSY_DEMO_REVIEWS.length],
      createdAt: new Date(createdMs).toISOString(),
    })
  })
  // Shop snapshots carry the running review count and average.
  for (const snap of shopDaily) {
    const upTo = reviews.filter((r) => r.createdAt.slice(0, 10) <= snap.date)
    snap.reviewCount = 140 + upTo.length
    snap.reviewAverage = round2((140 * 4.9 + upTo.reduce((s, r) => s + r.rating, 0)) / snap.reviewCount)
  }

  const listings: EtsyListing[] = ETSY_DEMO_LISTINGS.map((l) => ({
    ...l,
    url: `https://www.etsy.com/listing/${l.listingId}`,
    tags: ['golf headcover', 'putter cover'],
    updatedAt: `${asOf}T12:00:00.000Z`,
  }))

  return { receipts, customerOrders, fees, feesFromDay: firstDay, listings, reviews, shopDaily }
}

function weightedPick(items: string[], weights: number[], salt: number): string {
  const total = weights.reduce((a, b) => a + b, 0)
  let cursor = salt % total
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i]
    if (cursor < 0) return items[i]
  }
  return items[0]
}

export async function seedDemoStore(store: AnalyticsStore, asOf = '2026-10-11'): Promise<void> {
  const data = buildDemoDataset(asOf)
  const sync = await store.startSync('demo-seed')
  try {
    await store.replaceOrders(data.orders)
    await store.replaceTraffic(data.traffic)
    await store.replaceKeywords(data.keywords)
    await store.replaceProductViews(data.productViews)
    await store.replaceAbandoned(data.abandoned)
    await store.replaceAdSpend(data.adSpend)
    await store.replaceExpenses(data.expenses)
    await store.replaceCashForecast(data.cashForecast)
    await store.upsertEtsyReceipts(data.etsy.receipts)
    await store.upsertCustomerOrders(data.etsy.customerOrders)
    await store.upsertEtsyFeesDaily(data.etsy.fees, { replaceFromDay: data.etsy.feesFromDay })
    await store.replaceEtsyListings(data.etsy.listings)
    await store.upsertEtsyReviews(data.etsy.reviews)
    await store.upsertEtsyShopDaily(data.etsy.shopDaily)
    const inventory = demoInventory(asOf)
    await store.setIntegrationState(INVENTORY_SHEET_KEY, inventory.sheet as unknown as Record<string, unknown>)
    await store.setIntegrationState(INVENTORY_ETSY_KEY, inventory.etsy as unknown as Record<string, unknown>)
    await store.setIntegrationState(INVENTORY_SHOPIFY_KEY, inventory.shopify as unknown as Record<string, unknown>)
    await store.finishSync(sync.id, 'ok', 'Loaded mockup-shaped demo data', data.orders.length)
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'seed failed', 0)
    throw error
  }
}
