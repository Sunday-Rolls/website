/**
 * Pushes the dashboard's combined data into a Google Sheet so the team can build their own
 * reports (pivots, charts, formulas) on top of it. Railway owns only the "Data · …" tabs and
 * rewrites them in full on every run; any other tab in the sheet is left alone.
 *
 * Setup: share the sheet as Editor with the GOOGLE_SERVICE_ACCOUNT_JSON client_email and set
 * REPORTS_SHEET_ID. Runbook: docs/REPORTS_SHEET.md.
 */
import { GoogleAuth } from 'google-auth-library'
import { extractDriveFileId } from './drive.js'
import { preferLiveOrders } from './orders.js'
import { storeDay } from './period.js'
import type { AnalyticsStore } from './store.js'
import type { DailyAdSpend, DailyTraffic, Order } from './types.js'
import { productLabel } from './views.js'

export const REPORTS_SHEET_SYNC_SOURCE = 'reports-sheet'
export const DATA_TAB_PREFIX = 'Data · '

export type ReportsSheetCredentials = {
  serviceAccountJson: string
  spreadsheetId: string
}

export function reportsSheetMissingEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = [
    !env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && 'GOOGLE_SERVICE_ACCOUNT_JSON',
    !extractDriveFileId(env.REPORTS_SHEET_ID?.trim() || '') && 'REPORTS_SHEET_ID',
  ].filter(Boolean)
  return missing.length ? missing.join(', ') : null
}

export function loadReportsSheetCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): ReportsSheetCredentials | null {
  if (reportsSheetMissingEnv(env)) return null
  return {
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON!.trim(),
    spreadsheetId: extractDriveFileId(env.REPORTS_SHEET_ID!.trim())!,
  }
}

type Cell = string | number | boolean | null
export type ReportTable = { title: string; header: string[]; rows: Cell[][] }

const CHANNEL_LABEL: Record<string, string> = {
  shopify: 'Website (Shopify)',
  squarespace: 'Website (Squarespace)',
  etsy: 'Etsy',
  ebay: 'eBay',
  other: 'Other',
}

const round2 = (x: number) => Math.round(x * 100) / 100
const monthOf = (day: string) => `${day.slice(0, 7)}-01`

/** Build every Data tab from what the dashboard has stored. Pure, so it can be tested. */
export function buildReportTables(input: {
  orders: Order[]
  adSpend: DailyAdSpend[]
  traffic: DailyTraffic[]
  generatedAt: string
}): ReportTable[] {
  // Same dedupe as the dashboard: live Shopify / Squarespace CSV beat Sales Tracker copies.
  const orders = preferLiveOrders(input.orders).sort((a, b) => a.orderedAt.localeCompare(b.orderedAt))

  const orderRows: Cell[][] = []
  const lineRows: Cell[][] = []
  const productMonths = new Map<string, { month: string; product: string; category: string; units: number; revenue: number; orders: Set<string> }>()

  for (const o of orders) {
    const day = storeDay(o.orderedAt)
    const channel = CHANNEL_LABEL[o.channel] ?? o.channel
    const orderId = o.externalId || o.id
    const units = o.lines.reduce((a, l) => a + l.quantity, 0)
    const products = o.lines.map((l) => productLabel(o, l).name).join(', ')
    const net = round2(o.revenue - o.fees - o.shippingCost - o.marketingCost)
    orderRows.push([
      day,
      monthOf(day),
      channel,
      o.source,
      orderId,
      products,
      units,
      round2(o.revenue),
      round2(o.fees),
      round2(o.shippingCost),
      round2(o.marketingCost),
      net,
      o.isReturning ? 'Returning' : 'New',
      o.state ?? '',
      o.trafficSource ?? '',
    ])
    for (const line of o.lines) {
      const label = productLabel(o, line)
      lineRows.push([
        day,
        monthOf(day),
        channel,
        orderId,
        label.name,
        label.category ?? '',
        line.productSku ?? '',
        line.quantity,
        round2(line.unitPrice),
        round2(line.lineRevenue),
      ])
      const key = `${monthOf(day)}|${label.name}`
      const pm = productMonths.get(key) ?? {
        month: monthOf(day),
        product: label.name,
        category: label.category ?? '',
        units: 0,
        revenue: 0,
        orders: new Set<string>(),
      }
      pm.units += line.quantity
      pm.revenue += line.lineRevenue
      pm.orders.add(`${o.channel}:${orderId}`)
      productMonths.set(key, pm)
    }
  }

  const productRows: Cell[][] = [...productMonths.values()]
    .sort((a, b) => a.month.localeCompare(b.month) || b.revenue - a.revenue)
    .map((p) => [p.month, p.product, p.category, p.units, round2(p.revenue), p.orders.size])

  const adRows: Cell[][] = [...input.adSpend]
    .sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform) || a.campaign.localeCompare(b.campaign))
    .map((r) => [
      r.date,
      monthOf(r.date),
      r.platform,
      r.campaign,
      round2(r.spend),
      round2(r.platformReportedSales),
      r.platformReportedOrders,
      r.sessions ?? 0,
    ])

  const traffic = [...input.traffic].sort((a, b) => a.date.localeCompare(b.date))
  const trafficRows: Cell[][] = traffic.map((t) => [
    t.date,
    monthOf(t.date),
    t.visits,
    t.uniqueVisitors,
    t.productViews,
    t.addToCarts,
    t.checkouts,
    t.purchases,
  ])
  const sourceRows: Cell[][] = []
  for (const t of traffic) {
    for (const [source, sessions] of Object.entries(t.sourceBreakdown ?? {}).sort((a, b) => b[1] - a[1])) {
      if (sessions > 0) sourceRows.push([t.date, monthOf(t.date), source, sessions])
    }
  }

  const tab = (name: string) => `${DATA_TAB_PREFIX}${name}`
  return [
    {
      title: tab('About'),
      header: ['Field', 'Value'],
      rows: [
        ['Last updated', input.generatedAt],
        ['Written by', 'Sunday Rolls dashboard (Railway contact-api)'],
        ['Note', 'Data · tabs are rewritten on every sync. Build reports in your own tabs; edits here are overwritten.'],
        ['Orders', orderRows.length],
        ['Ad spend rows', adRows.length],
        ['Traffic days', trafficRows.length],
      ],
    },
    {
      title: tab('Orders'),
      header: ['Date', 'Month', 'Channel', 'Source', 'Order', 'Products', 'Units', 'Revenue', 'Fees', 'Shipping', 'Marketing', 'Net', 'Customer', 'State', 'Traffic source'],
      rows: orderRows,
    },
    {
      title: tab('Order lines'),
      header: ['Date', 'Month', 'Channel', 'Order', 'Product', 'Category', 'SKU', 'Quantity', 'Unit price', 'Line revenue'],
      rows: lineRows,
    },
    {
      title: tab('Products by month'),
      header: ['Month', 'Product', 'Category', 'Units', 'Revenue', 'Orders'],
      rows: productRows,
    },
    {
      title: tab('Ad spend'),
      header: ['Date', 'Month', 'Platform', 'Campaign', 'Spend', 'Platform-reported sales', 'Platform-reported orders', 'Sessions'],
      rows: adRows,
    },
    {
      title: tab('Traffic'),
      header: ['Date', 'Month', 'Visits', 'Unique visitors', 'Product views', 'Add to carts', 'Checkouts', 'Purchases'],
      rows: trafficRows,
    },
    {
      title: tab('Traffic sources'),
      header: ['Date', 'Month', 'Source / medium', 'Sessions'],
      rows: sourceRows,
    },
  ]
}

/** Text that Sheets would read as a formula is written as plain text. */
export function safeCell(value: Cell): Cell {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return `'${value}`
  return value ?? ''
}

async function sheetsToken(serviceAccountJson: string): Promise<{ token: string; clientEmail: string }> {
  const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const token = await (await auth.getClient()).getAccessToken()
  if (!token.token) throw new Error('Failed to obtain a Google Sheets access token')
  return { token: token.token, clientEmail: String(credentials.client_email ?? 'the service account') }
}

type SheetMeta = { properties: { sheetId: number; title: string } }

/** Create missing Data tabs, size them, then replace their contents. */
export async function writeReportTables(
  creds: ReportsSheetCredentials,
  tables: ReportTable[],
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const { token, clientEmail } = await sheetsToken(creds.serviceAccountJson)
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(creds.spreadsheetId)}`
  const call = async (url: string, init?: RequestInit) => {
    const res = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
    if (!res.ok) {
      const hint =
        res.status === 403 || res.status === 404
          ? ` — share the reports sheet with ${clientEmail} as Editor and check REPORTS_SHEET_ID`
          : ''
      throw new Error(`Google Sheets ${res.status}: ${data.error?.message ?? 'request failed'}${hint}`)
    }
    return data
  }

  const meta = (await call(`${base}?fields=sheets.properties(sheetId,title)`)) as { sheets?: SheetMeta[] }
  const existing = new Map((meta.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]))

  const missing = tables.filter((t) => !existing.has(t.title))
  if (missing.length) {
    const added = (await call(`${base}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((t) => ({ addSheet: { properties: { title: t.title } } })) }),
    })) as { replies?: Array<{ addSheet?: SheetMeta }> }
    for (const r of added.replies ?? []) if (r.addSheet) existing.set(r.addSheet.properties.title, r.addSheet.properties.sheetId)
  }

  // Grow each grid to fit (values writes don't add rows), freeze and bold the header.
  await call(`${base}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: tables.flatMap((t) => {
        const sheetId = existing.get(t.title)!
        return [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { rowCount: Math.max(t.rows.length + 1, 100), columnCount: Math.max(t.header.length, 2), frozenRowCount: 1 },
              },
              fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
        ]
      }),
    }),
  })

  const quoted = (title: string) => `'${title.replace(/'/g, "''")}'`
  await call(`${base}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: tables.map((t) => quoted(t.title)) }),
  })
  await call(`${base}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: tables.map((t) => ({
        range: `${quoted(t.title)}!A1`,
        values: [t.header, ...t.rows.map((row) => row.map(safeCell))],
      })),
    }),
  })
  return tables.reduce((a, t) => a + t.rows.length, 0)
}

export type ReportsSheetSyncResult = { tabs: number; rows: number }

export async function syncReportsSheet(
  store: AnalyticsStore,
  creds: ReportsSheetCredentials,
  options?: { fetchImpl?: typeof fetch; now?: () => Date },
): Promise<ReportsSheetSyncResult> {
  const sync = await store.startSync(REPORTS_SHEET_SYNC_SOURCE)
  try {
    const [orders, adSpend, traffic] = await Promise.all([store.listOrders(), store.listAdSpend(), store.listTraffic()])
    const generatedAt = (options?.now?.() ?? new Date()).toISOString()
    const tables = buildReportTables({ orders, adSpend, traffic, generatedAt })
    const rows = await writeReportTables(creds, tables, options?.fetchImpl)
    await store.finishSync(sync.id, 'ok', `${tables.length} tabs · ${rows} rows`, rows)
    return { tabs: tables.length, rows }
  } catch (error) {
    await store.finishSync(sync.id, 'error', error instanceof Error ? error.message : 'Reports sheet export failed', 0)
    throw error
  }
}
