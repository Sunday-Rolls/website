import { randomUUID } from 'node:crypto'
import { addUtcDays, formatUtcDate, parseUtcDate } from './period.js'
import type { AnalyticsStore } from './store.js'
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

  return { orders, traffic, keywords, productViews: productViewsDaily, abandoned, adSpend, expenses, cashForecast }
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
    await store.finishSync(sync.id, 'ok', 'Loaded mockup-shaped demo data', data.orders.length)
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'seed failed', 0)
    throw error
  }
}
