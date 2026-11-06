// Etsy: shop snapshot, Etsy orders/fees/coupons in range, reviews and a sortable listings table.
import { areaChart, barChart } from '../lib/charts.js'
import { badge, card, emptyState, escapeHtml, icon, kpiCard, money, moneyExact, notConnected, num, pct, table } from '../lib/ui.js'

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const round2 = (n) => Math.round(n * 100) / 100

// Survives re-renders so the chosen sort sticks across range changes.
let sortState = { key: 'revenue', dir: 'desc' }

const STYLE = `
.etsy-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 24px; }
@media (max-width: 1279.98px) { .etsy-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 767.98px) { .etsy-kpis { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
.etsy-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 0; font-size: 13px; color: var(--muted); }
.etsy-note a { color: var(--accent); font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.etsy-note a:hover { text-decoration: underline; }
.etsy-note .etsy-note-error { color: var(--down); }
.etsy-foot { margin: 12px 0 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
.etsy-summary { margin: 0 0 12px; font-size: 13px; color: var(--muted); }
.etsy-rating { display: flex; align-items: baseline; gap: 10px; margin: 0 0 16px; }
.etsy-rating strong { font-size: 32px; line-height: 40px; font-weight: 600; color: var(--ink); }
.etsy-rating span { font-size: 13px; color: var(--muted); }
.etsy-stars { color: var(--gold); letter-spacing: 1px; white-space: nowrap; }
.etsy-dist { display: grid; gap: 8px; margin: 0 0 20px; }
.etsy-dist-row { display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
.etsy-dist-track { display: block; height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.etsy-dist-fill { display: block; height: 100%; border-radius: 99px; background: var(--chart-1); }
.etsy-dist-count { min-width: 84px; text-align: right; font-variant-numeric: tabular-nums; }
.etsy-reviews { list-style: none; margin: 0; padding: 0; }
.etsy-reviews li { padding: 12px 0; border-top: 1px solid var(--border-soft); }
.etsy-reviews-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 13px; color: var(--muted); }
.etsy-reviews-head .etsy-listing { overflow-wrap: anywhere; }
.etsy-reviews p { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: var(--ink); overflow-wrap: anywhere; }
.etsy-reviews p.is-empty { color: var(--muted); font-style: italic; }
.etsy-listings .table th { padding: 0; }
.etsy-listings .sort-btn {
  display: inline-flex; align-items: center; gap: 4px; width: 100%;
  padding: 12px 4px; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--muted); white-space: nowrap;
}
.etsy-listings .align-right .sort-btn { justify-content: flex-end; }
.etsy-listings .sort-btn:hover, .etsy-listings .sort-btn.active { color: var(--ink); }
.etsy-listings .sort-btn:focus-visible { outline: none; box-shadow: var(--ring); border-radius: 6px; }
.etsy-listings .sort-btn .icon { opacity: 0; }
.etsy-listings .sort-btn.active .icon { opacity: 1; }
.etsy-listings .table td { white-space: nowrap; }
.etsy-listings .table td:first-child { white-space: normal; min-width: 200px; }
.etsy-listings .table td:first-child a { color: var(--ink); text-decoration: none; }
.etsy-listings .table td:first-child a:hover { color: var(--accent); text-decoration: underline; }
`

function injectStyle() {
  if (document.getElementById('style-etsy')) return
  const el = document.createElement('style')
  el.id = 'style-etsy'
  el.textContent = STYLE
  document.head.appendChild(el)
}

/** Only http(s) links from the API are rendered as links. */
function safeUrl(url) {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

// ---------- Dates ----------

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const fmtDay = (iso, opts = { month: 'short', day: 'numeric' }) => parseDay(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })

/** Daily fees, grouped into Monday-start weeks when the range is longer than 60 days. */
function bucketFees(rows) {
  if (!rows.length) return { weekly: false, points: [] }
  const span = (parseDay(rows[rows.length - 1].date) - parseDay(rows[0].date)) / 86400000 + 1
  if (span <= 60) return { weekly: false, points: rows.map((r) => ({ label: fmtDay(r.date), amount: r.amount ?? 0 })) }
  const weeks = new Map()
  for (const r of rows) {
    const dt = parseDay(r.date)
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() || 7) - 1))
    const key = dt.toISOString().slice(0, 10)
    weeks.set(key, (weeks.get(key) ?? 0) + (r.amount ?? 0))
  }
  const points = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => ({ label: `Wk of ${fmtDay(date)}`, amount }))
  return { weekly: true, points }
}

// ---------- Header note ----------

const SYNC_TONE = { ok: ['OK', 'success'], error: ['Error', 'danger'], running: ['Syncing', 'warning'] }

function headerNote(lastSync, shop) {
  const parts = []
  if (lastSync?.at) {
    const at = new Date(lastSync.at)
    const when = Number.isNaN(at.getTime())
      ? '—'
      : at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const [label, tone] = SYNC_TONE[lastSync.status] ?? [lastSync.status ?? 'Unknown', 'neutral']
    parts.push(`<span>Last synced ${escapeHtml(when)}</span>${badge(label, tone)}`)
    if (lastSync.status === 'error' && lastSync.message) parts.push(`<span class="etsy-note-error">${escapeHtml(lastSync.message)}</span>`)
  } else {
    parts.push('<span>Not synced yet</span>')
  }
  const url = safeUrl(shop?.url)
  if (url) parts.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open shop${icon('arrow-right', { size: 14 })}</a>`)
  return `<p class="etsy-note col-12">${parts.join('')}</p>`
}

// ---------- KPIs ----------

function rangeKpis(orders = {}, fees = {}) {
  const known = (orders.newBuyers ?? 0) + (orders.returningBuyers ?? 0)
  const returningPct = known > 0 ? ((orders.returningBuyers ?? 0) / known) * 100 : null
  let buyersHint = `${num(orders.newBuyers ?? 0)} new · ${num(orders.returningBuyers ?? 0)} returning`
  if ((orders.unknownBuyers ?? 0) > 0) buyersHint += ` · ${num(orders.unknownBuyers)} unmatched`
  const share = isNum(fees.shareOfRevenue) ? fees.shareOfRevenue * 100 : null
  // Five range KPIs: a 5-column sub-grid, since the 12-column page grid has no fifth.
  return `<div class="etsy-kpis col-12">${[
    kpiCard({ icon: 'coins', label: 'Etsy revenue', value: money(orders.revenue), hint: `${num(orders.count ?? 0)} orders`, className: '' }),
    kpiCard({ icon: 'receipt', label: 'Avg order', value: moneyExact(orders.avgOrder), hint: 'Etsy revenue ÷ orders', className: '' }),
    kpiCard({ icon: 'users', label: 'Returning buyers', value: pct(returningPct, 0), hint: buyersHint, className: '' }),
    kpiCard({
      icon: 'wallet',
      label: 'Etsy fees',
      value: money(fees.total),
      hint: share == null ? 'No revenue in this range' : `${pct(share)} of revenue`,
      className: '',
    }),
    kpiCard({
      icon: 'truck',
      label: 'Days to ship',
      value: isNum(orders.avgDaysToShip) ? orders.avgDaysToShip.toFixed(1) : '—',
      hint: `${num(orders.shippedOrders ?? 0)} shipped`,
      className: '',
    }),
  ].join('')}</div>`
}

/** % change from the first snapshot in range, as a deltaPill-compatible number (or null). */
function snapshotDelta(trend, key, current) {
  if (trend.length < 2 || !isNum(current)) return null
  const first = trend[0]?.[key]
  if (!isNum(first) || first === 0) return null
  return ((current - first) / first) * 100
}

function shopKpis(shop, trend) {
  const avg = isNum(shop.reviewAverage) ? `★ ${shop.reviewAverage.toFixed(2)}` : '—'
  return [
    kpiCard({ icon: 'star', label: 'Favorites', value: num(shop.favorites), delta: snapshotDelta(trend, 'favorites', shop.favorites), hint: 'Shop favorites', className: 'col-3' }),
    kpiCard({
      icon: 'check-circle',
      label: 'Review average',
      value: avg,
      delta: snapshotDelta(trend, 'reviewAverage', shop.reviewAverage),
      hint: `${num(shop.reviewCount ?? 0)} reviews`,
      className: 'col-3',
    }),
    kpiCard({ icon: 'package', label: 'Total sold', value: num(shop.totalSold), delta: snapshotDelta(trend, 'totalSold', shop.totalSold), hint: 'All-time Etsy sales', className: 'col-3' }),
    kpiCard({
      icon: 'dashboard',
      label: 'Active listings',
      value: num(shop.activeListings),
      delta: snapshotDelta(trend, 'activeListings', shop.activeListings),
      hint: 'Live on Etsy now',
      className: 'col-3',
    }),
  ].join('')
}

// ---------- Fees ----------

/** Top 6 fee types plus an "Other" rollup of the rest. */
function feeSlices(byType) {
  const rows = byType.filter((t) => isNum(t.amount) && t.amount > 0)
  if (rows.length <= 7) return rows.map((t) => ({ label: t.label || t.type, amount: t.amount }))
  const top = rows.slice(0, 6).map((t) => ({ label: t.label || t.type, amount: t.amount }))
  const rest = rows.slice(6)
  return [...top, { label: `Other (${rest.length})`, amount: rest.reduce((a, t) => a + t.amount, 0) }]
}

function feesCard(fees, slices) {
  const total = isNum(fees.total) ? fees.total : 0
  const est = fees.estimatedFeeOrders ?? 0
  const actual = fees.actualFeeOrders ?? 0
  const foot =
    est > 0
      ? `<p class="etsy-foot">${escapeHtml(`${num(actual)} of ${num(actual + est)} orders use Etsy’s actual fees; the rest are estimates until Etsy reports them.`)}</p>`
      : ''
  const body = slices.length
    ? `<div id="etsy-fees-chart" class="chart-box"></div>${table({
        columns: [
          { key: 'label', label: 'Fee' },
          { key: 'amount', label: 'Amount', align: 'right', format: (v) => moneyExact(v) },
          {
            key: 'amount',
            label: '% of fees',
            align: 'right',
            format: (v) => {
              const share = total > 0 ? (v / total) * 100 : null
              return `<span class="share-bar"><span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, share ?? 0)).toFixed(1)}%"></span></span>${pct(share)}</span>`
            },
          },
        ],
        rows: slices,
      })}${foot}`
    : emptyState('No Etsy fees in this range.')
  return card({
    title: 'Where the fees go',
    subtitle: isNum(fees.perOrder) ? `${moneyExact(fees.perOrder)} in fees per order` : 'Etsy fees by type',
    className: 'col-6',
    body,
  })
}

// ---------- Reviews ----------

function stars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)))
  return `<span class="etsy-stars" aria-label="${r} out of 5 stars">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`
}

function reviewsCard(reviews = {}) {
  const count = reviews.count ?? 0
  if (!count) {
    return card({ title: 'Reviews', subtitle: 'Reviews left in this range', className: 'col-6', body: emptyState('No reviews in this range.') })
  }
  const dist = reviews.distribution ?? {}
  const distRows = [5, 4, 3, 2, 1]
    .map((n) => {
      const c = dist[String(n)] ?? 0
      const share = count > 0 ? (c / count) * 100 : 0
      return `<div class="etsy-dist-row"><span>${n} ★</span><span class="etsy-dist-track"><span class="etsy-dist-fill" style="width:${share.toFixed(1)}%"></span></span><span class="etsy-dist-count">${num(c)} · ${pct(share, 0)}</span></div>`
    })
    .join('')
  const recent = (reviews.recent ?? [])
    .map(
      (r) => `<li>
  <div class="etsy-reviews-head">${stars(r.rating)}<span>${r.date ? escapeHtml(fmtDay(r.date, { month: 'short', day: 'numeric', year: 'numeric' })) : '—'}</span><span class="etsy-listing">${escapeHtml(r.listingTitle ?? '—')}</span></div>
  ${r.text ? `<p>${escapeHtml(r.text)}</p>` : '<p class="is-empty">No written review</p>'}
</li>`,
    )
    .join('')
  return card({
    title: 'Reviews',
    subtitle: 'Reviews left in this range',
    className: 'col-6',
    body: `<div class="etsy-rating"><strong>${isNum(reviews.average) ? `★ ${reviews.average.toFixed(2)}` : '—'}</strong><span>${escapeHtml(`${num(count)} review${count === 1 ? '' : 's'}`)}</span></div>
<div class="etsy-dist">${distRows}</div>
${recent ? `<ul class="etsy-reviews">${recent}</ul>` : ''}`,
  })
}

// ---------- Coupons ----------

function couponsCard(coupons, orders = {}) {
  const summary = `<p class="etsy-summary">${escapeHtml(`${num(orders.discountedOrders ?? 0)} discounted orders · ${moneyExact(orders.discountTotal ?? 0)} off`)}</p>`
  return card({
    title: 'Coupons',
    subtitle: 'Shop coupons and Etsy-funded discounts in this range',
    className: 'col-6',
    body: coupons.length
      ? summary +
        table({
          columns: [
            { key: 'code', label: 'Discount type' },
            { key: 'orders', label: 'Orders', align: 'right', format: (v) => num(v) },
            { key: 'discount', label: 'Discount', align: 'right', format: (v) => moneyExact(v) },
          ],
          rows: coupons,
        })
      : emptyState('No discounted orders in this range'),
  })
}

// ---------- Listings ----------

const COLUMNS = [
  { key: 'title', label: 'Listing', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'quantity', label: 'Stock', align: 'right' },
  { key: 'favorites', label: 'Favorites', align: 'right' },
  { key: 'unitsSold', label: 'Units sold', align: 'right' },
  { key: 'revenue', label: 'Revenue', align: 'right' },
  { key: 'reviewAverage', label: 'Reviews', align: 'right' },
]

const STATE_TONE = { active: 'success', sold_out: 'warning', inactive: 'neutral', expired: 'neutral' }

function stateBadge(state) {
  if (!state) return '—'
  const label = String(state).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  return badge(label, STATE_TONE[state] ?? 'neutral')
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

function listingsTable(listings) {
  if (!listings.length) return emptyState('No Etsy listings synced yet.')
  const rows = sortRows(listings, sortState)
  const head = COLUMNS.map((c) => {
    const active = c.key === sortState.key
    const arrow = icon(active && sortState.dir === 'asc' ? 'arrow-up' : 'arrow-down', { size: 12 })
    const aria = active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none'
    return `<th${c.align ? ` class="align-${c.align}"` : ''} aria-sort="${aria}"><button type="button" class="sort-btn${active ? ' active' : ''}" data-sort="${c.key}">${escapeHtml(c.label)}${arrow}</button></th>`
  }).join('')
  const body = rows
    .map((l) => {
      const url = safeUrl(l.url)
      const title = escapeHtml(l.title ?? '—')
      const reviews = (l.reviewCount ?? 0) > 0
        ? `${isNum(l.reviewAverage) ? `★ ${l.reviewAverage.toFixed(1)}` : '—'}<span class="cell-sub">${num(l.reviewCount)} review${l.reviewCount === 1 ? '' : 's'}</span>`
        : '—'
      return `<tr>
  <td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</td>
  <td>${stateBadge(l.state)}</td>
  <td class="align-right">${moneyExact(l.price)}</td>
  <td class="align-right">${num(l.quantity)}</td>
  <td class="align-right">${num(l.favorites)}</td>
  <td class="align-right">${num(l.unitsSold)}</td>
  <td class="align-right">${money(l.revenue)}</td>
  <td class="align-right">${reviews}</td>
</tr>`
    })
    .join('')
  return `<div class="table-wrap"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

// ---------- Render ----------

function renderNotConnected(root) {
  root.innerHTML = notConnected({
    title: 'Etsy isn’t connected',
    detail: 'Set up Etsy in Tools → Connections to see shop stats, Etsy orders, fees, reviews and listings here.',
    className: 'col-12',
  })
}

export async function render(root, ctx) {
  injectStyle()
  let data
  try {
    ;({ data } = await ctx.api(`/etsy?${ctx.rangeQuery()}`))
  } catch (err) {
    // No Etsy endpoint on this server yet: treat it like an unconnected source.
    if (err?.status === 404) return renderNotConnected(root)
    throw err
  }
  if (data?.range) ctx.setRangeLabel?.(data.range)
  if (!data?.connected) return renderNotConnected(root)

  const orders = data.orders ?? {}
  const fees = data.fees ?? {}
  const shopTrend = data.shopTrend ?? []
  const slices = feeSlices(fees.byType ?? [])
  const { weekly, points } = bucketFees(data.feeTrend ?? [])
  const hasFeeTrend = points.some((p) => p.amount > 0)
  const listings = data.listings ?? []

  root.innerHTML = [
    headerNote(data.lastSync, data.shop),
    rangeKpis(orders, fees),
    data.shop ? shopKpis(data.shop, shopTrend) : '',
    feesCard(fees, slices),
    card({
      title: 'Fees over time',
      subtitle: weekly ? 'Weekly totals (weeks start Monday) for the selected range' : 'Daily Etsy fees for the selected range',
      className: 'col-6',
      body: hasFeeTrend ? '<div id="etsy-fee-trend" class="chart-box"></div>' : emptyState('No Etsy fees in this range.'),
    }),
    reviewsCard(data.reviews),
    couponsCard(data.coupons ?? [], orders),
    card({
      title: 'Listings',
      subtitle: 'Click a column to sort. Units sold and revenue are for the selected range.',
      className: 'col-12 etsy-listings',
      body: `<div class="etsy-listings-body">${listingsTable(listings)}</div>`,
    }),
  ].join('')

  if (slices.length) {
    barChart(root.querySelector('#etsy-fees-chart'), {
      series: [{ name: 'Fees', data: slices.map((s) => round2(s.amount)) }],
      categories: slices.map((s) => s.label),
      horizontal: true,
      format: 'moneyExact',
      height: Math.max(180, slices.length * 44),
    })
  }
  if (hasFeeTrend) {
    areaChart(root.querySelector('#etsy-fee-trend'), {
      series: [{ name: 'Fees', data: points.map((p) => round2(p.amount)) }],
      categories: points.map((p) => p.label),
      format: 'moneyExact',
    })
  }

  const tableBody = root.querySelector('.etsy-listings-body')
  tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sort]')
    if (!btn) return
    const key = btn.dataset.sort
    const col = COLUMNS.find((c) => c.key === key)
    sortState =
      key === sortState.key
        ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: col?.type === 'text' ? 'asc' : 'desc' }
    tableBody.innerHTML = listingsTable(listings)
    tableBody.querySelector(`button[data-sort="${key}"]`)?.focus()
  })
}
