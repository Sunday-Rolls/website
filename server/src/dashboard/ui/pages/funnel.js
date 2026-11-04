// Funnel: shopping funnel, abandoned checkouts, new vs returning customers, top states and regions.
import { barChart, donutChart } from '../lib/charts.js'
import { badge, card, emptyState, escapeHtml, money, notConnected, num, table } from '../lib/ui.js'

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

const STEPS = [
  { key: 'visits', label: 'Visits', noun: 'visits' },
  { key: 'productViews', label: 'Product views', noun: 'product views' },
  { key: 'addToCarts', label: 'Add to cart', noun: 'add-to-carts' },
  { key: 'checkouts', label: 'Checkout', noun: 'checkouts' },
  { key: 'purchases', label: 'Purchase', noun: 'purchases' },
]

const STYLE = `
.fun-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; }
.fun-step-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; margin-bottom: 8px; }
.fun-step-name { font-size: 14px; font-weight: 500; color: var(--ink); display: inline-flex; align-items: center; gap: 8px; }
.fun-step-nums { font-size: 13px; color: var(--muted); }
.fun-step-nums strong { font-size: 16px; font-weight: 600; color: var(--ink); margin-right: 8px; }
.fun-track { height: 12px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.fun-fill { height: 100%; min-width: 4px; border-radius: 99px; background: linear-gradient(90deg, var(--chart-1), var(--chart-1-light)); }
.fun-step.is-drop .fun-fill { background: var(--warn); }
.fun-sentence { margin: 20px 0 0; padding: 12px 14px; border-radius: 10px; background: var(--warn-bg); color: var(--warn); font-size: 14px; }
.fun-stats { display: flex; flex-direction: column; gap: 16px; margin: 0; }
.fun-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--border-soft); }
.fun-stat dt { font-size: 14px; color: var(--muted); }
.fun-stat dd { margin: 0; font-size: 20px; font-weight: 600; color: var(--ink); }
.fun-hint { margin: 16px 0 0; font-size: 13px; color: var(--muted); }
`

function injectStyle() {
  if (document.getElementById('style-funnel')) return
  const el = document.createElement('style')
  el.id = 'style-funnel'
  el.textContent = STYLE
  document.head.appendChild(el)
}

/** "42 of 70 checkouts" when the previous step is small, otherwise "56% of visits". */
function stepConversion(count, prev, prevNoun) {
  if (!(prev > 0)) return ''
  if (prev < 100) return `${num(count)} of ${num(prev)} ${prevNoun}`
  const p = (count / prev) * 100
  return `${p.toFixed(p < 10 ? 1 : 0)}% of ${prevNoun}`
}

// ---------- Funnel ----------

function funnelCard(f) {
  if (!f || !(f.visits > 0)) {
    return notConnected({
      title: 'Shopping funnel',
      detail: 'Google Analytics (GA4) isn’t reporting visits for this range yet. Once it is, this shows how many shoppers make it from visit to purchase.',
      className: 'col-8',
    })
  }
  const counts = STEPS.map((s) => (isNum(f[s.key]) ? f[s.key] : 0))

  // Biggest drop-off: the step that keeps the smallest share of the step before it.
  let drop = -1
  let worst = Infinity
  for (let i = 1; i < counts.length; i++) {
    if (!(counts[i - 1] > 0)) continue
    const rate = counts[i] / counts[i - 1]
    if (rate < worst) {
      worst = rate
      drop = i
    }
  }

  const items = STEPS.map((s, i) => {
    const count = counts[i]
    const width = Math.max(0, Math.min(100, (count / counts[0]) * 100))
    const conv = i ? stepConversion(count, counts[i - 1], STEPS[i - 1].noun) : 'Everyone who reached the site'
    const isDrop = i === drop
    return `<li class="fun-step${isDrop ? ' is-drop' : ''}">
  <div class="fun-step-top">
    <span class="fun-step-name">${escapeHtml(s.label)}${isDrop ? badge('Biggest drop-off', 'warning') : ''}</span>
    <span class="fun-step-nums"><strong>${num(count)}</strong>${escapeHtml(conv)}</span>
  </div>
  <div class="fun-track"><div class="fun-fill" style="width:${width.toFixed(1)}%"></div></div>
</li>`
  }).join('')

  const sentence =
    drop > 0
      ? `<p class="fun-sentence">Most people leave between ${escapeHtml(STEPS[drop - 1].label)} and ${escapeHtml(STEPS[drop].label)}: ${escapeHtml(
          stepConversion(counts[drop], counts[drop - 1], STEPS[drop - 1].noun),
        )} move on.</p>`
      : ''

  const overall = counts[4] > 0 ? `${num(counts[4])} purchase${counts[4] === 1 ? '' : 's'} from ${num(counts[0])} visits` : `${num(counts[0])} visits, no purchases yet`
  return card({
    title: 'Shopping funnel',
    subtitle: `How far shoppers get · ${overall}`,
    className: 'col-8',
    body: `<ol class="fun-steps">${items}</ol>${sentence}`,
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
    subtitle: 'Checkouts started on the website but not finished',
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
    funnelCard(data.funnel),
    abandonedCard(data.abandoned),
    card({
      title: 'New vs returning',
      subtitle: 'Customers who ordered in this range',
      className: 'col-4',
      body: hasCustomers ? '<div id="fun-customers-chart" class="chart-box"></div>' : emptyState('No orders in this range yet.'),
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
