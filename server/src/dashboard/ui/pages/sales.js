// Sales: revenue/orders KPIs, channel filter, revenue by day per channel, channel mix and the orders list.
import { barChart, donutChart } from '../lib/charts.js'
import {
  badge,
  card,
  emptyState,
  escapeHtml,
  icon,
  kpiCard,
  money,
  moneyExact,
  num,
  segmented,
  table,
} from '../lib/ui.js'

const STORE_TZ = 'America/Chicago'
const PAGE_SIZE = 25
const ORDERS_CAP = 500

const CHANNEL_LABELS = {
  shopify: 'Website',
  website: 'Website',
  etsy: 'Etsy',
  ebay: 'eBay',
  squarespace: 'Squarespace',
  other: 'In person & other',
}

const channelLabel = (c) => CHANNEL_LABELS[c] ?? (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other')

// Survives re-renders (range change, refresh) so the filter sticks.
let channelFilter = 'all'

// ---------- Dates ----------

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Store-timezone day (YYYY-MM-DD), matching the server's storeDay(). */
function storeDay(iso) {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00:00)$/.test(iso)) return iso.slice(0, 10)
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : dayFmt.format(d)
}

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const fmtDay = (iso, opts = { month: 'short', day: 'numeric' }) => parseDay(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })

function daysBetween(start, end) {
  const out = []
  if (!start || !end) return out
  for (let d = parseDay(start); d <= parseDay(end); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10))
  return out
}

function mondayOf(iso) {
  const dt = parseDay(iso)
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() || 7) - 1))
  return dt.toISOString().slice(0, 10)
}

// ---------- Data shaping ----------

function orderId(externalId) {
  const s = String(externalId ?? '')
  const parts = s.split(/[:/]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : s
}

function itemsText(o) {
  const lines = o.lines ?? []
  if (!lines.length) return '—'
  const first = lines[0].productName || 'Item'
  return lines.length > 1 ? `${first} +${lines.length - 1} more` : first
}

/** Revenue per store day (or Monday-start week beyond 60 days) per channel. */
function revenueByDay(orders, range) {
  const days = daysBetween(range?.start, range?.end)
  const weekly = days.length > 60
  const keys = weekly ? [...new Set(days.map(mondayOf))] : days
  const index = new Map(keys.map((k, i) => [k, i]))
  const byChannel = new Map()
  for (const o of orders) {
    const day = storeDay(o.orderedAt)
    const key = weekly ? mondayOf(day) : day
    const i = index.get(key)
    if (i == null) continue
    const label = channelLabel(o.channel)
    const arr = byChannel.get(label) ?? new Array(keys.length).fill(0)
    arr[i] += o.revenue ?? 0
    byChannel.set(label, arr)
  }
  const series = [...byChannel.entries()]
    .map(([name, data]) => ({ name, data: data.map((v) => Math.round(v * 100) / 100) }))
    .sort((a, b) => b.data.reduce((s, v) => s + v, 0) - a.data.reduce((s, v) => s + v, 0))
  const categories = keys.map((k) => fmtDay(weekly && k < range.start ? range.start : k))
  return { weekly, series, categories }
}

function matchesFilter(channel, filter) {
  if (filter === 'all') return true
  if (filter === 'website') return channel === 'shopify' || channel === 'squarespace' || channel === 'website'
  return channel === filter
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(orders, range) {
  const header = ['Date', 'Order', 'Channel', 'Items', 'Units', 'Revenue', 'Fees', 'Shipping cost', 'Customer email', 'Customer']
  const rows = orders.map((o) => [
    storeDay(o.orderedAt),
    orderId(o.externalId),
    channelLabel(o.channel),
    (o.lines ?? []).map((l) => `${l.qty} x ${l.productName}`).join('; '),
    o.units ?? 0,
    (o.revenue ?? 0).toFixed(2),
    (o.fees ?? 0).toFixed(2),
    (o.shippingCost ?? 0).toFixed(2),
    o.customerEmail ?? '',
    o.isReturning ? 'Returning' : 'New',
  ])
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sunday-rolls-orders-${range?.start ?? 'start'}-to-${range?.end ?? 'end'}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- Styles ----------

function injectStyles() {
  if (document.getElementById('style-sales')) return
  const style = document.createElement('style')
  style.id = 'style-sales'
  style.textContent = `
.sales-filter { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sales-filter-label { font-size: 14px; font-weight: 500; color: var(--muted); }
.sales-filter .segmented { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.sales-filter .segmented::-webkit-scrollbar { display: none; }
.sales-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sales-search { position: relative; display: flex; align-items: center; }
.sales-search .icon { position: absolute; left: 12px; color: var(--faint); pointer-events: none; }
.sales-search input {
  height: 40px; width: 280px; max-width: 100%; padding: 8px 12px 8px 36px;
  border-radius: 8px; border: 1px solid var(--border); background: transparent;
  font: inherit; font-size: 14px; color: var(--ink); box-shadow: var(--shadow-xs);
}
.sales-search input::placeholder { color: var(--faint); }
.sales-search input:focus { outline: none; border-color: var(--brand-300); box-shadow: var(--ring); }
.sales-tools .btn { padding: 8px 14px; }
.sales-orders .table td, .sales-orders .table th { white-space: nowrap; }
.sales-orders .table td + td, .sales-orders .table th + th { padding-left: 16px; }
.sales-orders .table td.items-cell { white-space: normal; min-width: 180px; max-width: 320px; }
.sales-more { display: flex; justify-content: center; align-items: center; gap: 12px; padding-top: 16px; font-size: 13px; color: var(--muted); }
.sales-more:empty { display: none; }
.sales-channel-table .table td:first-child { white-space: nowrap; }
@media (max-width: 767.98px) {
  .sales-orders .card-actions { flex: 1 1 100%; min-width: 0; }
  .sales-tools, .sales-search { width: 100%; }
  .sales-search input { width: 100%; box-sizing: border-box; }
}
`
  document.head.appendChild(style)
}

// ---------- Sections ----------

function kpis(totals, filter) {
  const rows = totals.filter((t) => matchesFilter(t.channel, filter))
  const sum = (k) => rows.reduce((s, t) => s + (t[k] ?? 0), 0)
  const revenue = sum('revenue')
  const orders = sum('orders')
  const units = sum('units')
  const scope = filter === 'all' ? 'All channels' : `${channelLabel(filter)} only`
  return [
    kpiCard({ icon: 'coins', label: 'Revenue', value: money(revenue), hint: scope, className: 'col-3' }),
    kpiCard({ icon: 'cart', label: 'Orders', value: num(orders), hint: scope, className: 'col-3' }),
    kpiCard({ icon: 'package', label: 'Units', value: num(units), hint: 'Items sold across those orders', className: 'col-3' }),
    kpiCard({
      icon: 'receipt',
      label: 'Avg order value',
      value: orders ? moneyExact(revenue / orders) : '—',
      hint: 'Revenue ÷ orders',
      className: 'col-3',
    }),
  ].join('')
}

function filterBar(totals) {
  const options = [{ value: 'all', label: 'All' }, ...totals.map((t) => ({ value: t.channel, label: channelLabel(t.channel) }))]
  return `<div class="sales-filter col-12">
  <span class="sales-filter-label">Channel</span>
  ${segmented({ name: 'sales-channel', options, value: channelFilter })}
</div>`
}

function channelTable(totals) {
  return table({
    columns: [
      { key: 'channel', label: 'Channel', format: (v) => escapeHtml(channelLabel(v)) },
      { key: 'orders', label: 'Orders', align: 'right', format: (v) => num(v) },
      { key: 'revenue', label: 'Revenue', align: 'right', format: (v) => money(v) },
      { key: 'units', label: 'Units', align: 'right', format: (v) => num(v) },
      { key: 'aov', label: 'AOV', align: 'right', format: (v) => moneyExact(v) },
    ],
    rows: totals,
    empty: 'No sales in this range.',
  })
}

const ORDER_COLUMNS = [
  { key: 'orderedAt', label: 'Date', format: (v) => escapeHtml(fmtDay(storeDay(v))) },
  { key: 'externalId', label: 'Order', format: (v) => escapeHtml(orderId(v)) },
  { key: 'channel', label: 'Channel', format: (v) => badge(channelLabel(v), v === 'shopify' ? 'brand' : 'neutral') },
  { key: 'lines', label: 'Items', format: (_v, r) => escapeHtml(itemsText(r)) },
  { key: 'units', label: 'Units', align: 'right', format: (v) => num(v) },
  { key: 'revenue', label: 'Revenue', align: 'right', format: (v) => moneyExact(v) },
  { key: 'isReturning', label: 'Customer', format: (v) => (v ? badge('Returning', 'success') : badge('New', 'neutral')) },
]

// ---------- Render ----------

export async function render(root, ctx) {
  injectStyles()
  const query = ctx.rangeQuery()
  const fetchOrders = (filter) =>
    ctx.api(`/orders?${query}${filter && filter !== 'all' ? `&channel=${encodeURIComponent(filter)}` : ''}`).then((r) => r.data)

  let data = await fetchOrders(channelFilter)
  const totals = data.totals ?? []
  // Drop a remembered channel that has no sales in the new range.
  if (channelFilter !== 'all' && !totals.some((t) => t.channel === channelFilter)) {
    channelFilter = 'all'
    data = await fetchOrders('all')
  }
  ctx.setRangeLabel?.(data.range)
  const orders = data.orders ?? []
  const hasAnyOrders = totals.some((t) => t.orders > 0)

  if (!hasAnyOrders) {
    root.innerHTML = [
      kpis(totals, 'all'),
      card({
        title: 'Orders',
        subtitle: 'Every order in the selected range',
        className: 'col-12',
        body: emptyState('No orders in this date range. Pick a longer range, like 90 days or Year to date, to see sales.'),
      }),
    ].join('')
    return
  }

  const trend = revenueByDay(orders, data.range)
  const capped = orders.length >= ORDERS_CAP
  const mixTotals = totals.filter((t) => t.revenue > 0)
  const scopeText = channelFilter === 'all' ? 'every channel' : channelLabel(channelFilter)

  root.innerHTML = [
    filterBar(totals),
    kpis(totals, channelFilter),
    card({
      title: trend.weekly ? 'Revenue by week' : 'Revenue by day',
      subtitle: `${trend.weekly ? 'Weekly' : 'Daily'} revenue for ${scopeText}, stacked by channel${
        capped ? ` · based on the latest ${ORDERS_CAP} orders` : ''
      }`,
      className: 'col-12',
      body: trend.series.length ? '<div id="sales-trend" class="chart-box"></div>' : emptyState('No orders for this channel in this range.'),
    }),
    card({
      title: 'Channel mix',
      subtitle: 'Share of revenue by channel',
      className: 'col-5',
      body: mixTotals.length ? '<div id="sales-mix" class="chart-box"></div>' : emptyState('No revenue in this range.'),
    }),
    card({
      title: 'By channel',
      subtitle: 'Orders, revenue, units and average order value',
      className: 'col-7 sales-channel-table',
      body: channelTable(totals),
    }),
    card({
      title: 'Orders',
      subtitle: `${num(orders.length)}${capped ? ' most recent' : ''} order${orders.length === 1 ? '' : 's'} for ${scopeText}, newest first`,
      className: 'col-12 sales-orders',
      actions: `<div class="sales-tools">
  <label class="sales-search">${icon('filter', { size: 16 })}<input type="search" placeholder="Search product, email or order" aria-label="Search orders" /></label>
  <button type="button" class="btn btn-outline" data-action="csv">${icon('download', { size: 16 })}Download CSV</button>
</div>`,
      body: '<div class="sales-orders-table"></div><div class="sales-more"></div>',
    }),
  ].join('')

  // Channel filter → refetch and re-render the whole page.
  root.querySelector('.segmented[data-name="sales-channel"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]')
    if (!btn || btn.dataset.value === channelFilter) return
    channelFilter = btn.dataset.value
    ctx.refresh()
  })

  if (trend.series.length) {
    barChart(root.querySelector('#sales-trend'), {
      series: trend.series,
      categories: trend.categories,
      stacked: true,
      format: 'money',
    })
  }
  if (mixTotals.length) {
    donutChart(root.querySelector('#sales-mix'), {
      series: mixTotals.map((t) => Math.round(t.revenue * 100) / 100),
      labels: mixTotals.map((t) => channelLabel(t.channel)),
      format: 'money',
    })
  }

  // Orders table: search, show more, CSV.
  const tableEl = root.querySelector('.sales-orders-table')
  const moreEl = root.querySelector('.sales-more')
  const searchEl = root.querySelector('.sales-search input')
  let filtered = orders
  let shown = PAGE_SIZE

  const drawTable = () => {
    const rows = filtered.slice(0, shown)
    tableEl.innerHTML = table({
      columns: ORDER_COLUMNS,
      rows,
      empty: orders.length ? 'No orders match your search.' : 'No orders for this channel in this range.',
    })
    // Let the item cell wrap (the table helper gives no per-column class).
    for (const tr of tableEl.querySelectorAll('tbody tr')) tr.children[3]?.classList.add('items-cell')
    moreEl.innerHTML =
      filtered.length > shown
        ? `<span>Showing ${num(rows.length)} of ${num(filtered.length)}</span><button type="button" class="btn btn-outline" data-action="more">Show more</button>`
        : ''
  }

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase()
    filtered = q
      ? orders.filter(
          (o) =>
            orderId(o.externalId).toLowerCase().includes(q) ||
            String(o.externalId ?? '').toLowerCase().includes(q) ||
            String(o.customerEmail ?? '').toLowerCase().includes(q) ||
            (o.lines ?? []).some((l) => String(l.productName ?? '').toLowerCase().includes(q)),
        )
      : orders
    shown = PAGE_SIZE
    drawTable()
  })
  moreEl.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="more"]')) return
    shown += PAGE_SIZE
    drawTable()
  })
  root.querySelector('[data-action="csv"]').addEventListener('click', () => downloadCsv(filtered, data.range))

  drawTable()
}
