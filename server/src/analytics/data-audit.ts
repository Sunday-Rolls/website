import type { AnalyticsStore } from './store.js'

export type DataAudit = {
  generatedAt: string
  counts: Record<string, number>
  ordersByChannel: Record<string, number>
  traffic: {
    days: number
    dateMin: string | null
    dateMax: string | null
    visits: number
    productViews: number
    addToCarts: number
    checkouts: number
    purchases: number
    sources: Record<string, number>
  }
  adSpend: {
    rows: number
    platforms: Record<string, number>
    totalSpend: number
    dateMin: string | null
    dateMax: string | null
  }
  productViews: {
    rows: number
    distinctProducts: number
    totalViews: number
  }
  expenses: { rows: number; total: number }
  cashRows: number
  keywords: number
  abandoned: boolean
  demoOrders: number
  holes: Array<{ area: string; severity: 'critical' | 'gap' | 'ok'; detail: string }>
  latestSyncs: Array<{ source: string; status: string; message: string | null; finishedAt: string | null }>
}

export async function buildDataAudit(store: AnalyticsStore): Promise<DataAudit> {
  const [orders, traffic, adSpend, productViews, expenses, cash, keywords, abandoned, syncs] =
    await Promise.all([
      store.listOrders(),
      store.listTraffic(),
      store.listAdSpend(),
      store.listProductViews(),
      store.listExpenses(),
      store.listCashForecast(),
      store.listKeywords(),
      store.getAbandoned('2000-01-01', '2100-01-01'),
      store.latestSyncs(),
    ])

  const ordersByChannel: Record<string, number> = {}
  for (const o of orders) {
    ordersByChannel[o.channel] = (ordersByChannel[o.channel] ?? 0) + 1
  }
  const demoOrders = orders.filter((o) => o.externalId.includes('demo-')).length

  const sources: Record<string, number> = {}
  let visits = 0
  let productViewSum = 0
  let addToCarts = 0
  let checkouts = 0
  let purchases = 0
  for (const row of traffic) {
    visits += row.visits
    productViewSum += row.productViews
    addToCarts += row.addToCarts
    checkouts += row.checkouts
    purchases += row.purchases
    for (const [k, v] of Object.entries(row.sourceBreakdown || {})) {
      sources[k] = (sources[k] ?? 0) + v
    }
  }
  const trafficDates = traffic.map((t) => t.date).sort()

  const platforms: Record<string, number> = {}
  let totalSpend = 0
  for (const row of adSpend) {
    platforms[row.platform] = (platforms[row.platform] ?? 0) + row.spend
    totalSpend += row.spend
  }
  const adDates = adSpend.map((a) => a.date).sort()

  const distinctProducts = new Set(productViews.map((p) => p.productName)).size
  const totalProductViews = productViews.reduce((s, p) => s + p.views, 0)
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)

  const holes: DataAudit['holes'] = []

  if (orders.length === 0) {
    holes.push({
      area: 'Orders / revenue',
      severity: 'critical',
      detail: 'No orders in Postgres. Import Sales Tracker and/or sync Shopify after real checkouts.',
    })
  } else if (demoOrders > 0) {
    holes.push({
      area: 'Orders / revenue',
      severity: 'critical',
      detail: `${demoOrders} demo-* orders still present — clear analytics data.`,
    })
  } else {
    holes.push({
      area: 'Orders / revenue',
      severity: 'ok',
      detail: `${orders.length} orders across ${Object.keys(ordersByChannel).join(', ') || '—'}.`,
    })
  }

  if (!(ordersByChannel.shopify > 0)) {
    holes.push({
      area: 'Shopify orders',
      severity: 'gap',
      detail: 'No Shopify-channel orders yet (store empty or sync not run after a real checkout).',
    })
  }

  if (traffic.length === 0) {
    holes.push({
      area: 'GA4 traffic',
      severity: 'critical',
      detail: 'No daily traffic rows. Run GA4 sync.',
    })
  } else {
    holes.push({
      area: 'GA4 traffic',
      severity: 'ok',
      detail: `${traffic.length} days · ${visits} sessions · ${productViewSum} product page views.`,
    })
  }

  if (addToCarts === 0 && checkouts === 0 && purchases === 0) {
    holes.push({
      area: 'Funnel ecommerce events',
      severity: 'gap',
      detail:
        'GA4 add_to_cart / checkout / purchase are all 0. Squarespace never sent them; need Shopify pixel / customer events into GA4.',
    })
  }

  if (totalSpend <= 0) {
    holes.push({
      area: 'Ad spend',
      severity: 'gap',
      detail: 'No ad spend rows. Google Ads cost via GA4 may be missing; Meta needs META_ACCESS_TOKEN.',
    })
  } else {
    const platformList = Object.keys(platforms).join(', ')
    holes.push({
      area: 'Ad spend',
      severity: platforms.Meta || platforms.Facebook ? 'ok' : 'gap',
      detail: `$${totalSpend.toFixed(2)} across ${platformList}. Meta spend still missing until Marketing API token.`,
    })
  }

  if (productViews.length === 0) {
    holes.push({
      area: 'Product page views',
      severity: 'gap',
      detail: 'No per-product view rows (expected from /shop/p/* in GA4).',
    })
  } else {
    holes.push({
      area: 'Product page views',
      severity: 'ok',
      detail: `${distinctProducts} products · ${totalProductViews} views.`,
    })
  }

  if (keywords.length === 0) {
    holes.push({
      area: 'Search keywords',
      severity: 'gap',
      detail: 'Empty — run Search Console sync (or GA4 sync, which pulls GSC too).',
    })
  } else {
    holes.push({
      area: 'Search keywords',
      severity: 'ok',
      detail: `${keywords.length} queries from Search Console.`,
    })
  }

  if (!abandoned) {
    holes.push({
      area: 'Abandoned carts',
      severity: 'gap',
      detail: 'No abandoned-cart stats. Run Shopify sync.',
    })
  } else {
    holes.push({
      area: 'Abandoned carts',
      severity: 'ok',
      detail: `${abandoned.abandoned} abandoned · ${abandoned.recovered} recovered (Shopify).`,
    })
  }

  if (expenses.length === 0) {
    holes.push({
      area: 'Expenses (P&L)',
      severity: 'gap',
      detail: 'No expenses — import Sales Tracker Expense Tracker tab.',
    })
  } else {
    holes.push({
      area: 'Expenses (P&L)',
      severity: 'ok',
      detail: `${expenses.length} rows · $${expenseTotal.toFixed(2)}.`,
    })
  }

  if (cash.length === 0) {
    holes.push({
      area: 'Cash forecast',
      severity: 'gap',
      detail: 'No cash rows — import Sales Tracker Cash tab.',
    })
  }

  const ordersWithState = orders.filter((o) => o.state).length
  const regionSessions = traffic.reduce(
    (s, t) => s + Object.values(t.regionBreakdown || {}).reduce((a, b) => a + b, 0),
    0,
  )
  if (orders.length && ordersWithState / orders.length >= 0.2) {
    holes.push({
      area: 'Geo by state',
      severity: 'ok',
      detail: `${ordersWithState}/${orders.length} orders have ship-to state.`,
    })
  } else if (regionSessions > 0) {
    holes.push({
      area: 'Geo by state',
      severity: 'ok',
      detail: `Using GA4 US region sessions (${regionSessions}) — Sales Tracker has no state column; Shopify orders will switch this to ship-to state.`,
    })
  } else {
    holes.push({
      area: 'Geo by state',
      severity: 'gap',
      detail: 'No order states and no GA4 region breakdown yet — re-run GA4 sync.',
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      orders: orders.length,
      trafficDays: traffic.length,
      adSpendRows: adSpend.length,
      productViewRows: productViews.length,
      expenses: expenses.length,
      cashRows: cash.length,
      keywords: keywords.length,
    },
    ordersByChannel,
    traffic: {
      days: traffic.length,
      dateMin: trafficDates[0] ?? null,
      dateMax: trafficDates[trafficDates.length - 1] ?? null,
      visits,
      productViews: productViewSum,
      addToCarts,
      checkouts,
      purchases,
      sources,
    },
    adSpend: {
      rows: adSpend.length,
      platforms,
      totalSpend,
      dateMin: adDates[0] ?? null,
      dateMax: adDates[adDates.length - 1] ?? null,
    },
    productViews: {
      rows: productViews.length,
      distinctProducts,
      totalViews: totalProductViews,
    },
    expenses: { rows: expenses.length, total: expenseTotal },
    cashRows: cash.length,
    keywords: keywords.length,
    abandoned: Boolean(abandoned),
    demoOrders,
    holes,
    latestSyncs: syncs.map((s) => ({
      source: s.source,
      status: s.status,
      message: s.message,
      finishedAt: s.finishedAt,
    })),
  }
}
