// Products: units KPIs, top products, categories, units over time and a sortable performance table.
import { areaChart, barChart, donutChart } from '../lib/charts.js'
import { badge, card, emptyState, escapeHtml, icon, kpiCard, money, notConnected, num, pct } from '../lib/ui.js'

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

// Survives re-renders so the chosen sort sticks across range changes.
let sortState = { key: 'revenue', dir: 'desc' }

// ---------- Dates ----------

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const fmtDay = (iso, opts = { month: 'short', day: 'numeric' }) => parseDay(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })

function mondayOf(iso) {
  const dt = parseDay(iso)
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() || 7) - 1))
  return dt.toISOString().slice(0, 10)
}

/** Daily units, or Monday-start weekly totals beyond 60 days. */
function bucketTrend(rows) {
  if (rows.length <= 60) return { weekly: false, points: rows.map((r) => ({ label: fmtDay(r.date), units: r.units ?? 0 })) }
  const buckets = new Map()
  for (const r of rows) {
    const key = mondayOf(r.date)
    buckets.set(key, (buckets.get(key) ?? 0) + (r.units ?? 0))
  }
  return {
    weekly: true,
    points: [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, units]) => ({ label: fmtDay(date < rows[0].date ? rows[0].date : date), units })),
  }
}

// ---------- Styles ----------

function injectStyles() {
  if (document.getElementById('style-products')) return
  const style = document.createElement('style')
  style.id = 'style-products'
  style.textContent = `
.products-table .table th { padding: 0; }
.products-table .sort-btn {
  display: inline-flex; align-items: center; gap: 4px; width: 100%;
  padding: 12px 4px; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--muted); white-space: nowrap;
}
.products-table .align-right .sort-btn { justify-content: flex-end; }
.products-table .sort-btn:hover, .products-table .sort-btn.active { color: var(--ink); }
.products-table .sort-btn:focus-visible { outline: none; box-shadow: var(--ring); border-radius: 6px; }
.products-table .sort-btn .icon { opacity: 0; }
.products-table .sort-btn.active .icon { opacity: 1; }
.products-table .table td { white-space: nowrap; }
.products-table .table td:first-child { white-space: normal; min-width: 180px; }
.products-table .rate-cell { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; }
.kpi-card .kpi-value.kpi-value-text { font-size: 20px; line-height: 28px; overflow-wrap: anywhere; }
`
  document.head.appendChild(style)
}

// ---------- Sections ----------

function kpis(products) {
  const units = products.reduce((s, p) => s + (p.units ?? 0), 0)
  const sold = products.filter((p) => (p.units ?? 0) > 0).length
  const best = products.reduce((top, p) => ((p.revenue ?? 0) > (top?.revenue ?? 0) ? p : top), null)
  const viewed = products.filter((p) => isNum(p.views) && p.views > 0)
  const views = viewed.reduce((s, p) => s + p.views, 0)
  const viewOrders = viewed.reduce((s, p) => s + (p.orders ?? 0), 0)
  const rate = views > 0 ? (viewOrders / views) * 100 : null

  const bestCard = kpiCard({
    icon: 'star',
    label: 'Best seller',
    value: best ? best.name : '—',
    hint: best ? `${money(best.revenue)} in revenue` : 'No sales in this range',
    className: 'col-3 kpi-best',
  })
  return [
    kpiCard({ icon: 'package', label: 'Units sold', value: num(units), hint: 'Every channel', className: 'col-3' }),
    kpiCard({ icon: 'dashboard', label: 'Products sold', value: num(sold), hint: 'Products with at least one sale', className: 'col-3' }),
    // The best seller value is a name, so don't count it up and let it wrap.
    bestCard.replace('class="kpi-value" data-countup', 'class="kpi-value kpi-value-text"'),
    kpiCard({
      icon: 'target',
      label: 'View-to-order rate',
      value: rate == null ? '—' : pct(rate),
      hint: rate == null ? 'Needs GA4 product views' : `Orders per 100 product views (${num(views)} views)`,
      className: 'col-3',
    }),
  ].join('')
}

const COLUMNS = [
  { key: 'name', label: 'Product', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'units', label: 'Units', align: 'right' },
  { key: 'revenue', label: 'Revenue', align: 'right' },
  { key: 'orders', label: 'Orders', align: 'right' },
  { key: 'views', label: 'Views', align: 'right' },
  { key: 'viewToOrderRate', label: 'View-to-order', align: 'right' },
]

function rateBadge(p) {
  const views = p.views ?? 0
  if (isNum(p.viewToOrderRate) && p.viewToOrderRate >= 5 && views >= 20) return badge('Hot', 'success')
  if (views >= 50 && (p.orders ?? 0) === 0) return badge('Check listing', 'warning')
  return ''
}

function sortRows(rows, { key, dir }) {
  const col = COLUMNS.find((c) => c.key === key)
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    // Missing values always sink to the bottom.
    const aMissing = av == null || av === ''
    const bMissing = bv == null || bv === ''
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1
    const cmp = col?.type === 'text' ? String(av).localeCompare(String(bv)) : av - bv
    return cmp * mul || (b.revenue ?? 0) - (a.revenue ?? 0)
  })
}

function performanceTable(products) {
  if (!products.length) return emptyState('No product sales or views in this range.')
  const rows = sortRows(products, sortState)
  const head = COLUMNS.map((c) => {
    const active = c.key === sortState.key
    const arrow = icon(active && sortState.dir === 'asc' ? 'arrow-up' : 'arrow-down', { size: 12 })
    const aria = active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none'
    return `<th${c.align ? ` class="align-${c.align}"` : ''} aria-sort="${aria}"><button type="button" class="sort-btn${active ? ' active' : ''}" data-sort="${c.key}">${escapeHtml(c.label)}${arrow}</button></th>`
  }).join('')
  const body = rows
    .map(
      (p) => `<tr>
  <td>${escapeHtml(p.name)}</td>
  <td>${escapeHtml(p.category ?? '—')}</td>
  <td class="align-right">${num(p.units)}</td>
  <td class="align-right">${money(p.revenue)}</td>
  <td class="align-right">${num(p.orders)}</td>
  <td class="align-right">${isNum(p.views) ? num(p.views) : '—'}</td>
  <td class="align-right"><span class="rate-cell">${rateBadge(p)}${isNum(p.viewToOrderRate) ? pct(p.viewToOrderRate) : '—'}</span></td>
</tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

// ---------- Render ----------

export async function render(root, ctx) {
  injectStyles()
  const { data } = await ctx.api(`/products?${ctx.rangeQuery()}`)
  ctx.setRangeLabel?.(data.range)

  const products = data.products ?? []
  const categories = (data.categories ?? []).filter((c) => c.revenue > 0)
  const top = products.filter((p) => p.revenue > 0).slice().sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  const trend = bucketTrend(data.trend ?? [])
  const hasUnits = trend.points.some((p) => p.units > 0)

  root.innerHTML = [
    kpis(products),
    card({
      title: 'Top products',
      subtitle: 'Best sellers by revenue in this range',
      className: 'col-7',
      body: top.length ? '<div id="products-top" class="chart-box"></div>' : emptyState('No product sales in this range. Try a longer range.'),
    }),
    card({
      title: 'Categories',
      subtitle: 'Share of revenue by category',
      className: 'col-5',
      body: categories.length ? '<div id="products-categories" class="chart-box"></div>' : emptyState('No category sales in this range.'),
    }),
    card({
      title: 'Units sold over time',
      subtitle: trend.weekly ? 'Weekly totals (weeks start Monday) for the selected range' : 'Daily units for the selected range',
      className: 'col-12',
      body: hasUnits ? '<div id="products-trend" class="chart-box"></div>' : emptyState('No units sold in this range. Try a longer range.'),
    }),
    card({
      title: 'Product performance',
      subtitle: 'Click a column to sort. “Hot” converts well; “Check listing” gets views but no orders.',
      className: 'col-12 products-table',
      body: `<div class="products-table-body">${performanceTable(products)}</div>`,
    }),
    notConnected({
      title: 'Stock levels',
      detail: 'Connect Shopify inventory to see units on hand and days of cover.',
      className: 'col-12',
    }),
  ].join('')

  if (top.length) {
    barChart(root.querySelector('#products-top'), {
      series: [{ name: 'Revenue', data: top.map((p) => Math.round(p.revenue * 100) / 100) }],
      categories: top.map((p) => p.name),
      horizontal: true,
      format: 'money',
    })
  }
  if (categories.length) {
    donutChart(root.querySelector('#products-categories'), {
      series: categories.map((c) => Math.round(c.revenue * 100) / 100),
      labels: categories.map((c) => c.category),
      format: 'money',
    })
  }
  if (hasUnits) {
    areaChart(root.querySelector('#products-trend'), {
      series: [{ name: 'Units', data: trend.points.map((p) => p.units) }],
      categories: trend.points.map((p) => p.label),
      format: 'num',
    })
  }

  const tableBody = root.querySelector('.products-table-body')
  tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sort]')
    if (!btn) return
    const key = btn.dataset.sort
    const col = COLUMNS.find((c) => c.key === key)
    sortState =
      key === sortState.key
        ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: col?.type === 'text' ? 'asc' : 'desc' }
    tableBody.innerHTML = performanceTable(products)
    tableBody.querySelector(`button[data-sort="${key}"]`)?.focus()
  })
}
