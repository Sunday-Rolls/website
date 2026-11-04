// Funnel: website conversion, abandoned checkouts, new vs returning customers, top states and regions.
import { barChart, comboChart, donutChart } from '../lib/charts.js'
import { card, emptyState, escapeHtml, money, notConnected, num, table } from '../lib/ui.js'

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

const STEPS = [
  { key: 'visits', label: 'Visits', noun: 'visits' },
  { key: 'productViews', label: 'Product views', noun: 'product views' },
  { key: 'addToCarts', label: 'Added to cart', noun: 'add-to-carts' },
  { key: 'checkouts', label: 'Started checkout', noun: 'checkouts' },
  { key: 'purchases', label: 'Website orders', noun: 'orders' },
]

const STYLE = `
.fun-flow { display: flex; align-items: stretch; gap: 0; margin: 0 0 22px; padding: 0; list-style: none; flex-wrap: wrap; row-gap: 12px; }
.fun-flow > li:not(.fun-link) { flex: 1 1 140px; min-width: 120px; display: flex; }
.fun-node { flex: 1; margin: 0; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--border-soft); }
.fun-node dt { font-size: 12px; color: var(--muted); margin: 0 0 4px; }
.fun-node dd { margin: 0; font-size: 24px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
.fun-node.is-goal { background: color-mix(in srgb, var(--chart-1) 14%, var(--surface-2)); border-color: color-mix(in srgb, var(--chart-1) 35%, transparent); }
.fun-link { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 10px; gap: 2px; }
.fun-rate { font-size: 13px; font-weight: 600; color: var(--ink); padding: 3px 9px; border-radius: 99px; background: var(--card); border: 1px solid var(--border); white-space: nowrap; }
.fun-rate.is-low { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); background: var(--warn-bg); }
.fun-arrow { color: var(--faint); font-size: 14px; line-height: 1; }
.fun-chart-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0 0 4px; }
.fun-chart-head h4 { margin: 0; font-size: 14px; font-weight: 500; color: var(--ink); }
.fun-chart-head span { font-size: 13px; color: var(--muted); }
.fun-note { margin: 14px 0 0; padding: 10px 14px; border-radius: 10px; background: var(--surface-2); color: var(--muted); font-size: 13px; line-height: 1.5; }
.fun-stats { display: flex; flex-direction: column; gap: 16px; margin: 0; }
.fun-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--border-soft); }
.fun-stat dt { font-size: 14px; color: var(--muted); }
.fun-stat dd { margin: 0; font-size: 20px; font-weight: 600; color: var(--ink); }
.fun-hint { margin: 16px 0 0; font-size: 13px; color: var(--muted); }
@media (max-width: 640px) { .fun-link { flex-direction: row; width: 100%; padding: 2px 0; } .fun-arrow { transform: rotate(90deg); } }
`

function injectStyle() {
  if (document.getElementById('style-funnel')) return
  const el = document.createElement('style')
  el.id = 'style-funnel'
  el.textContent = STYLE
  document.head.appendChild(el)
}

const rateText = (count, prev) => {
  if (!(prev > 0)) return '—'
  const p = (count / prev) * 100
  return `${p.toFixed(p < 1 ? 2 : p < 10 ? 1 : 0)}%`
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dayLabel = (iso) => DAY.format(new Date(`${iso}T00:00:00Z`))

// ---------- Funnel ----------

/**
 * Website conversion: the measured steps as a flow (counts with the step-to-step rate between them),
 * then visits vs conversion over time. Steps GA4 doesn't measure are named in a note, not drawn.
 */
function funnelCard(f, tracked = {}, purchasesFrom = 'ga4', trend = []) {
  if (!f || !(f.visits > 0)) {
    return notConnected({
      title: 'Website conversion',
      detail: 'Google Analytics (GA4) isn’t reporting visits for this range yet. Once it is, this shows how many website visitors go on to order.',
      className: 'col-8',
    })
  }
  const steps = STEPS.filter((s) => tracked[s.key] !== false && isNum(f[s.key]))
  const missing = STEPS.filter((s) => tracked[s.key] === false).map((s) => s.label.toLowerCase())

  // The weakest step-to-step rate gets the warning colour.
  const rates = steps.slice(1).map((s, i) => (steps[i] && f[steps[i].key] > 0 ? f[s.key] / f[steps[i].key] : Infinity))
  const weakest = rates.length > 1 ? rates.indexOf(Math.min(...rates)) : -1

  const flow = steps
    .map((s, i) => {
      const node = `<li><dl class="fun-node${s.key === 'purchases' ? ' is-goal' : ''}"><dt>${escapeHtml(s.label)}</dt><dd>${num(f[s.key])}</dd></dl></li>`
      if (i === 0) return node
      const prev = steps[i - 1]
      const link = `<li class="fun-link" aria-label="${escapeHtml(`${rateText(f[s.key], f[prev.key])} of ${prev.noun}`)}">
  <span class="fun-rate${i - 1 === weakest ? ' is-low' : ''}">${rateText(f[s.key], f[prev.key])}</span><span class="fun-arrow" aria-hidden="true">→</span></li>`
      return link + node
    })
    .join('')

  const overall = rateText(f.purchases, f.visits)
  const bucketLabel = trend.length && trend[0].start !== trend[0].end ? 'per week' : 'per day'
  const notes = []
  if (missing.length) {
    notes.push(`Add-to-cart and checkout steps will appear once Google Analytics receives ${escapeHtml(missing.join(' and '))} events from the site.`)
  }
  if (purchasesFrom === 'orders') notes.push('Orders are website orders from Shopify; Etsy, eBay and in-person sales aren’t counted here.')

  return card({
    title: 'Website conversion',
    subtitle: `${overall} of website visits ended in an order`,
    className: 'col-8',
    body: `<ol class="fun-flow">${flow}</ol>
<div class="fun-chart-head"><h4>Visits and conversion rate</h4><span>${bucketLabel}</span></div>
${trend.length ? '<div id="fun-trend-chart" class="chart-box"></div>' : emptyState('No daily data for this range.')}
${notes.length ? `<p class="fun-note">${notes.join(' ')}</p>` : ''}`,
  })
}

function drawTrend(root, trend) {
  const el = root.querySelector('#fun-trend-chart')
  if (!el) return
  const weekly = trend.length && trend[0].start !== trend[0].end
  comboChart(el, {
    categories: trend.map((t) => (weekly ? `${dayLabel(t.start)}–${dayLabel(t.end)}` : dayLabel(t.start))),
    bar: { name: 'Visits', data: trend.map((t) => t.visits), format: 'num' },
    line: {
      name: 'Conversion',
      data: trend.map((t) => (t.visits > 0 ? Number(((t.orders / t.visits) * 100).toFixed(2)) : 0)),
      format: (v) => `${Number(v).toFixed(2)}%`,
    },
    height: 260,
  })
}

// ---------- Abandoned checkouts ----------

function abandonedCard(a) {
  if (!a) {
    return card({
      title: 'Abandoned checkouts',
      subtitle: 'Checkouts started but not finished',
      className: 'col-4',
      body: emptyState('Shopify hasn’t reported abandoned checkouts for this range yet.'),
    })
  }
  // The API passes Shopify's stats through: `abandoned` is the count (`count` in the overview shape).
  const count = isNum(a.count) ? a.count : a.abandoned
  const stats = [
    ['Abandoned', num(count)],
    ['Recovered', num(a.recovered)],
    ['Recovered revenue', money(a.recoveredRevenue)],
  ]
  return card({
    title: 'Abandoned checkouts',
    subtitle: a.periodStart
      ? `Website checkouts not finished, ${dayLabel(a.periodStart)}${a.periodEnd && a.periodEnd !== a.periodStart ? ` – ${dayLabel(a.periodEnd)}` : ''} (Shopify)`
      : 'Checkouts started on the website but not finished',
    className: 'col-4',
    body: `<dl class="fun-stats">${stats
      .map(([k, v]) => `<div class="fun-stat"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join('')}</dl>
<p class="fun-hint">Shopify’s abandoned-checkout emails remind these shoppers to finish buying and can win some of them back.</p>`,
  })
}

// ---------- Render ----------

export async function render(root, ctx) {
  injectStyle()
  const { data } = await ctx.api(`/funnel?${ctx.rangeQuery()}`)
  ctx.setRangeLabel?.(data.range)

  const cust = data.customers ?? { new: 0, returning: 0 }
  const hasCustomers = (cust.new ?? 0) + (cust.returning ?? 0) > 0
  const states = (data.states ?? []).slice(0, 10)
  const regions = (data.regions ?? []).filter((r) => r.sessions > 0).slice(0, 8)

  root.innerHTML = [
    funnelCard(data.funnel, data.tracked, data.purchasesFrom, data.trend ?? []),
    abandonedCard(data.abandoned),
    card({
      title: 'New vs returning',
      subtitle: cust.unknownOrders > 0
        ? `Customers matched by email · ${num(cust.unknownOrders)} orders had no email`
        : 'Customers who ordered in this range, matched by email',
      className: 'col-4',
      body: hasCustomers ? '<div id="fun-customers-chart" class="chart-box"></div>' : emptyState('No orders with a customer email in this range.'),
    }),
    card({
      title: 'Top states',
      subtitle: 'Where orders shipped',
      className: 'col-4',
      body: table({
        columns: [
          { key: 'state', label: 'State' },
          { key: 'orders', label: 'Orders', align: 'right', format: (v) => num(v) },
          { key: 'revenue', label: 'Revenue', align: 'right', format: (v) => money(v) },
        ],
        rows: states,
        empty: 'No orders with a shipping state in this range.',
      }),
    }),
    card({
      title: 'Top regions',
      subtitle: 'Site visits by region (Google Analytics)',
      className: 'col-4',
      body: regions.length ? '<div id="fun-regions-chart" class="chart-box"></div>' : emptyState('No region data from Google Analytics in this range.'),
    }),
  ].join('')

  drawTrend(root, data.trend ?? [])

  if (hasCustomers) {
    donutChart(root.querySelector('#fun-customers-chart'), {
      series: [cust.new ?? 0, cust.returning ?? 0],
      labels: ['New', 'Returning'],
      format: 'num',
    })
  }

  if (regions.length) {
    barChart(root.querySelector('#fun-regions-chart'), {
      series: [{ name: 'Sessions', data: regions.map((r) => r.sessions) }],
      categories: regions.map((r) => r.region),
      horizontal: true,
      format: 'num',
    })
  }
}
