import { GoogleAuth } from 'google-auth-library'

export type Ga4Credentials = {
  /** Full service-account JSON string or already-parsed object. */
  serviceAccountJson: string | Record<string, unknown>
  /** e.g. properties/513898453 */
  property: string
}

export type Ga4DailyTrafficRow = {
  date: string
  sessions: number
  totalUsers: number
  screenPageViews: number
  productPageViews: number
  addToCarts: number
  checkouts: number
  purchases: number
  sourceBreakdown: Record<string, number>
}

export type Ga4ProductViewRow = {
  date: string
  productName: string
  category: string | null
  views: number
  path: string
}

export type Ga4AdSpendRow = {
  date: string
  platform: string
  campaign: string
  spend: number
  platformReportedSales: number
  platformReportedOrders: number
}

type RunReportBody = Record<string, unknown>

function parseServiceAccount(json: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof json === 'string') return JSON.parse(json) as Record<string, unknown>
  return json
}

function normalizeProperty(property: string): string {
  const trimmed = property.trim()
  if (trimmed.startsWith('properties/')) return trimmed
  if (/^\d+$/.test(trimmed)) return `properties/${trimmed}`
  throw new Error(`GA4 property must be properties/123… (got ${property})`)
}

function gaDateToIso(value: string): string {
  // GA4 returns YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  return value
}

function num(value: string | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Map Squarespace product URLs to a readable product name. */
export function productFromPath(path: string): { name: string; category: string | null } | null {
  const clean = path.split('?')[0].replace(/\/+$/, '')
  const match = /^\/shop\/p\/([^/]+)$/i.exec(clean)
  if (!match) return null
  return { name: titleFromSlug(match[1]), category: 'Product page' }
}

export function friendlySource(source: string): string {
  const s = source.trim().toLowerCase()
  if (!s || s === '(direct)' || s === '(none)') return 'Direct'
  if (s === 'ig' || s.includes('instagram')) return 'Instagram'
  if (s === 'fb' || s.includes('facebook') || s.includes('m.facebook')) return 'Facebook'
  if (s === 'google') return 'Google'
  if (s.includes('bing')) return 'Bing'
  if (s.includes('yahoo')) return 'Yahoo'
  if (s.includes('email') || s.includes('customer_notification')) return 'Email'
  if (s === '(not set)') return 'Unassigned'
  return source
}

export async function createGa4AccessToken(serviceAccountJson: string | Record<string, unknown>): Promise<string> {
  const credentials = parseServiceAccount(serviceAccountJson)
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('Failed to obtain GA4 access token')
  return token.token
}

export async function runGa4Report(
  accessToken: string,
  property: string,
  body: RunReportBody,
): Promise<{ rows: Array<{ dims: string[]; metrics: string[] }> }> {
  const prop = normalizeProperty(property)
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as {
    error?: { message?: string }
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `GA4 runReport failed (${res.status})`)
  }
  return {
    rows: (data.rows ?? []).map((row) => ({
      dims: (row.dimensionValues ?? []).map((d) => d.value ?? ''),
      metrics: (row.metricValues ?? []).map((m) => m.value ?? '0'),
    })),
  }
}

export async function fetchGa4TrafficBundle(
  creds: Ga4Credentials,
  startDate: string,
  endDate: string,
): Promise<{
  traffic: Ga4DailyTrafficRow[]
  productViews: Ga4ProductViewRow[]
  adSpend: Ga4AdSpendRow[]
}> {
  const property = normalizeProperty(creds.property)
  const token = await createGa4AccessToken(creds.serviceAccountJson)
  const range = { startDate, endDate }

  const [daily, sources, productPages, ads] = await Promise.all([
    runGa4Report(token, property, {
      dateRanges: [range],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'addToCarts' },
        { name: 'checkouts' },
        { name: 'ecommercePurchases' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 10_000,
    }),
    runGa4Report(token, property, {
      dateRanges: [range],
      dimensions: [{ name: 'date' }, { name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      limit: 50_000,
    }),
    runGa4Report(token, property, {
      dateRanges: [range],
      dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { matchType: 'BEGINS_WITH', value: '/shop/p/' },
        },
      },
      limit: 50_000,
    }),
    runGa4Report(token, property, {
      dateRanges: [range],
      dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }],
      metrics: [{ name: 'advertiserAdCost' }, { name: 'sessions' }],
      limit: 50_000,
    }),
  ])

  const byDate = new Map<string, Ga4DailyTrafficRow>()
  for (const row of daily.rows) {
    const date = gaDateToIso(row.dims[0])
    byDate.set(date, {
      date,
      sessions: num(row.metrics[0]),
      totalUsers: num(row.metrics[1]),
      screenPageViews: num(row.metrics[2]),
      productPageViews: 0,
      addToCarts: num(row.metrics[3]),
      checkouts: num(row.metrics[4]),
      purchases: num(row.metrics[5]),
      sourceBreakdown: {},
    })
  }

  for (const row of sources.rows) {
    const date = gaDateToIso(row.dims[0])
    const source = friendlySource(row.dims[1] || '(direct)')
    const sessions = num(row.metrics[0])
    const cur = byDate.get(date)
    if (!cur || sessions <= 0) continue
    cur.sourceBreakdown[source] = (cur.sourceBreakdown[source] ?? 0) + sessions
  }

  const productViews: Ga4ProductViewRow[] = []
  const productViewsByDay = new Map<string, number>()
  for (const row of productPages.rows) {
    const date = gaDateToIso(row.dims[0])
    const path = row.dims[1] || ''
    const views = num(row.metrics[0])
    const product = productFromPath(path)
    if (!product || views <= 0) continue
    productViews.push({
      date,
      productName: product.name,
      category: product.category,
      views,
      path,
    })
    productViewsByDay.set(date, (productViewsByDay.get(date) ?? 0) + views)
  }

  for (const [date, views] of productViewsByDay) {
    const cur = byDate.get(date)
    if (cur) cur.productPageViews = views
  }

  const adSpend: Ga4AdSpendRow[] = []
  for (const row of ads.rows) {
    const date = gaDateToIso(row.dims[0])
    const campaign = (row.dims[1] || 'Unassigned').trim() || 'Unassigned'
    const spend = num(row.metrics[0])
    if (spend <= 0) continue
    // Skip placeholder campaign names that aren't real Ads campaigns
    if (campaign.startsWith('(') && campaign.endsWith(')')) continue
    adSpend.push({
      date,
      platform: 'Google Ads',
      campaign,
      spend: Math.round(spend * 100) / 100,
      platformReportedSales: 0,
      platformReportedOrders: 0,
    })
  }

  return {
    traffic: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    productViews,
    adSpend,
  }
}
