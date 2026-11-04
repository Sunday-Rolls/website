// Overview: headline KPIs, revenue trend, month pace, sales by channel, what needs attention, top products.
import { areaChart, barChart, donutChart, gaugeChart } from '../lib/charts.js'
import {
  badge,
  card,
  deltaPill,
  emptyState,
  escapeHtml,
  icon,
  kpiCard,
  money,
  moneyExact,
  num,
  pct,
  segmented,
  table,
} from '../lib/ui.js'

const STORE_TZ = 'America/Chicago'

const CHANNEL_LABELS = {
  shopify: 'Website',
  etsy: 'Etsy',
  ebay: 'eBay',
  squarespace: 'Squarespace',
  other: 'In person & other',
}

const SYNC_LABELS = {
  shopify: 'Shopify',
  etsy: 'Etsy',
  'sales-tracker': 'Sales Tracker',
  ga4: 'Google Analytics',
  'search-console': 'Search Console',
  'merchant-center': 'Merchant Center',
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

function storeToday() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
}

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const fmtDay = (iso, opts) => parseDay(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })

/** Bucket daily rows (day / week / month) so long ranges stay readable. */
function bucketTrend(rows) {
  if (!rows.length) return { grain: 'day', points: [] }
  const span = (parseDay(rows[rows.length - 1].date) - parseDay(rows[0].date)) / 86400000 + 1
  const grain = span > 120 ? 'month' : span > 45 ? 'week' : 'day'
  if (grain === 'day') {
    return {
      grain,
      points: rows.map((r) => ({ label: fmtDay(r.date, { month: 'short', day: 'numeric' }), revenue: r.revenue ?? 0, orders: r.orders ?? 0 })),
    }
  }
  const buckets = new Map()
  for (const r of rows) {
    const dt = parseDay(r.date)
    let key
    if (grain === 'month') key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
    else {
      const monday = new Date(dt)
      monday.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() || 7) - 1))
      key = monday.toISOString().slice(0, 10)
    }
    const b = buckets.get(key) ?? { date: key, revenue: 0, orders: 0 }
    b.revenue += r.revenue ?? 0
    b.orders += r.orders ?? 0
    buckets.set(key, b)
  }
  const points = [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({
      label: grain === 'month' ? fmtDay(b.date, { month: 'short', year: '2-digit' }) : `Wk of ${fmtDay(b.date, { month: 'short', day: 'numeric' })}`,
      revenue: b.revenue,
      orders: b.orders,
    }))
  return { grain, points }
}

// ---------- KPIs ----------

function kpis(data) {
  const k = data.kpis ?? {}
  const mer = data.mer
  const merValue = isNum(mer?.mer) ? `${mer.mer.toFixed(1)}x` : '—'
  let merHint = 'Revenue ÷ ad spend'
  if (mer && isNum(mer.adSpend)) {
    merHint = mer.adSpend > 0 ? `Revenue ÷ ad spend (${money(mer.adSpend)} spent)` : 'Revenue ÷ ad spend · no ad spend recorded'
  }
  return [
    kpiCard({
      icon: 'coins',
      label: 'Revenue',
      className: 'col-3',
      value: money(k.revenue?.value),
      delta: k.revenue,
      hint: isNum(k.revenue?.previous) ? `Every channel · ${money(k.revenue.previous)} the period before` : 'Every channel',
    }),
    kpiCard({
      icon: 'cart',
      label: 'Orders',
      className: 'col-3',
      value: num(k.orders?.value),
      delta: k.orders,
      hint: isNum(k.orders?.previous) ? `${num(k.orders.previous)} the period before` : '',
    }),
    kpiCard({
      icon: 'receipt',
      label: 'Avg order value',
      className: 'col-3',
      value: moneyExact(k.aov?.value),
      delta: k.aov,
      hint: 'Revenue ÷ orders',
    }),
    kpiCard({ icon: 'megaphone', label: 'MER', value: merValue, hint: merHint, className: 'col-3' }),
  ].join('')
}

// ---------- Month pace ----------

function monthNames(range) {
  const today = storeToday()
  const asOf = range?.end && range.end < today ? range.end : today
  const d = parseDay(asOf)
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  const name = (dt) => dt.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  return { current: name(d), previous: name(prev), asOf }
}

function paceCard(data) {
  const pace = data.pace
  const names = monthNames(data.range)
  if (!pace || !isNum(pace.monthToDate)) {
    return card({
      title: 'Month pace',
      subtitle: 'This month against last month',
      className: 'col-4',
      body: emptyState('Month pace isn’t available yet.'),
    })
  }
  const vsPoint = pace.lastMonthToDate > 0 ? ((pace.monthToDate - pace.lastMonthToDate) / pace.lastMonthToDate) * 100 : null
  const ofLast = pace.lastMonthTotal > 0 ? (pace.monthToDate / pace.lastMonthTotal) * 100 : null

  let sentence = `${money(pace.monthToDate)} so far this month.`
  if (vsPoint != null) {
    const rounded = Math.round(Math.abs(vsPoint))
    sentence =
      rounded === 0
        ? `${money(pace.monthToDate)} so far this month — level with this point last month.`
        : `${money(pace.monthToDate)} so far this month — ${rounded}% ${vsPoint >= 0 ? 'ahead of' : 'behind'} this point last month.`
  } else if (pace.lastMonthTotal === 0) {
    sentence = `${money(pace.monthToDate)} so far this month. No sales last month to compare with.`
  }

  // Today's revenue, when the trend covers today.
  const today = storeToday()
  const todayRow = (data.revenueByDay ?? []).find((r) => r.date === today)
  const stats = [
    { label: 'Last month', value: money(pace.lastMonthTotal) },
    {
      label: 'This month',
      value: money(pace.monthToDate),
      arrow: vsPoint == null ? null : vsPoint >= 0 ? 'up' : 'down',
    },
  ]
  if (todayRow) stats.push({ label: 'Today', value: money(todayRow.revenue) })

  const statsHtml = stats
    .map(
      (s, i) => `${i ? '<div class="pace-sep"></div>' : ''}<div class="pace-stat">
  <span class="pace-stat-label">${escapeHtml(s.label)}</span>
  <span class="pace-stat-value">${escapeHtml(s.value)}${
    s.arrow ? `<span style="color:var(--${s.arrow === 'up' ? 'up' : 'down'})">${icon(s.arrow === 'up' ? 'arrow-up' : 'arrow-down', { size: 16 })}</span>` : ''
  }</span>
</div>`,
    )
    .join('')

  const gauge =
    ofLast == null
      ? emptyState('No sales last month to measure against.')
      : `<div class="pace-gauge"><div id="pace-gauge" class="gauge-box"></div>${deltaPill(vsPoint).replace('class="badge', 'class="pace-pill badge')}</div>`

  return {
    html: `<section class="card pace-card col-4">
  <div class="pace-inner">
    <header class="card-head">
      <div class="card-head-text">
        <h3 class="card-title">Month pace</h3>
        <p class="card-sub">${escapeHtml(names.current)} so far vs all of ${escapeHtml(names.previous)}</p>
      </div>
    </header>
    ${gauge}
    <p class="pace-sentence">${escapeHtml(sentence)}</p>
  </div>
  <div class="pace-stats">${statsHtml}</div>
</section>`,
    gaugeValue: ofLast,
  }
}

// ---------- Needs attention ----------

function attentionCard(data) {
  const a = data.attention
  if (!a) {
    return card({
      title: 'Needs attention',
      subtitle: 'Things worth a look today',
      className: 'col-6',
      body: emptyState('Nothing to report yet.'),
    })
  }
  const rows = []
  const abandonedCount = a.abandoned?.count ?? 0
  if (abandonedCount > 0) {
    const recovered = a.abandoned?.recovered ?? 0
    rows.push({
      href: '#/funnel',
      icon: 'cart',
      tone: 'warning',
      title: `${num(abandonedCount)} abandoned checkout${abandonedCount === 1 ? '' : 's'}`,
      detail:
        recovered > 0
          ? `${num(recovered)} recovered (${money(a.abandoned.recoveredRevenue)}) in this date range`
          : 'In this date range · none recovered yet',
    })
  }
  for (const f of a.failedSyncs ?? []) {
    const when = f.at ? new Date(f.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
    rows.push({
      href: '#/tools',
      icon: 'alert',
      tone: 'danger',
      title: `${SYNC_LABELS[f.source] ?? f.source} sync failed`,
      detail: [f.message || 'No details recorded', when].filter(Boolean).join(' · '),
    })
  }
  const needsAttention = rows.length > 0
  if (isNum(a.cashOnHand)) {
    rows.push({
      href: '#/money',
      icon: 'wallet',
      tone: 'brand',
      title: 'Cash on hand',
      detail: a.cashAsOf ? `Month ending ${fmtDay(a.cashAsOf, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Latest month-end',
      value: money(a.cashOnHand),
    })
  }

  const list = rows.length
    ? `<ul class="attention-list">${rows
        .map(
          (r) => `<li><a class="attention-item tone-${r.tone}" href="${r.href}">
  <span class="icon-chip">${icon(r.icon, { size: 20 })}</span>
  <span class="attention-text"><span class="attention-title">${escapeHtml(r.title)}</span><span class="attention-detail" title="${escapeHtml(r.detail)}">${escapeHtml(r.detail)}</span></span>
  ${r.value ? `<span class="attention-value">${escapeHtml(r.value)}</span>` : ''}
  <span class="attention-chevron">${icon('chevron-right', { size: 18 })}</span>
</a></li>`,
        )
        .join('')}</ul>`
    : ''
  const clear = needsAttention
    ? ''
    : `<div class="all-clear"><span class="icon-chip">${icon('check-circle')}</span><p><strong>All clear.</strong> No abandoned checkouts or failed syncs.</p></div>`

  return card({
    title: 'Needs attention',
    subtitle: needsAttention ? 'Things worth a look today' : 'Nothing needs you right now',
    actions: needsAttention ? badge(`${rows.filter((r) => r.tone !== 'brand').length} open`, 'warning') : badge('All clear', 'success'),
    className: 'col-6',
    body: clear + list,
  })
}

// ---------- Sales by channel ----------

function channelData(ordersView, overview) {
  const totals = ordersView?.totals?.filter((t) => t.revenue > 0) ?? []
  if (totals.length) {
    const sorted = [...totals].sort((a, b) => b.revenue - a.revenue)
    return {
      subtitle: 'Revenue by sales channel in this range',
      series: sorted.map((t) => Math.round(t.revenue * 100) / 100),
      labels: sorted.map((t) => CHANNEL_LABELS[t.channel] ?? t.channel),
      format: 'money',
    }
  }
  const s = overview.orderSources
  const parts = s
    ? [
        ['Shopify', s.shopify],
        ['Sales Tracker', s.salesTracker],
        ['Manual', s.manual],
      ].filter(([, n]) => n > 0)
    : []
  if (!parts.length) return null
  return {
    subtitle: 'Orders by data source in this range',
    series: parts.map(([, n]) => n),
    labels: parts.map(([l]) => l),
    format: 'num',
  }
}

// ---------- Top products ----------

function productsCard(data) {
  const rows = (data.products ?? []).slice(0, 6)
  return card({
    title: 'Top products',
    subtitle: 'Best sellers by revenue in this range',
    actions: `<a class="card-link" href="#/products">See all ${icon('arrow-right', { size: 16 })}</a>`,
    className: 'col-12',
    body: table({
      columns: [
        {
          key: 'name',
          label: 'Product',
          format: (v, r) =>
            `${escapeHtml(v)}${r.category && r.category !== v ? `<span class="cell-sub">${escapeHtml(r.category)}</span>` : ''}`,
        },
        { key: 'units', label: 'Units', align: 'right', format: (v) => num(v) },
        { key: 'revenue', label: 'Revenue', align: 'right', format: (v) => money(v) },
        {
          key: 'share',
          label: 'Share of revenue',
          align: 'right',
          format: (v) =>
            `<span class="share-bar"><span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, v ?? 0)).toFixed(1)}%"></span></span>${pct(v)}</span>`,
        },
      ],
      rows,
      empty: 'No product sales in this range.',
    }),
  })
}

// ---------- Render ----------

export async function render(root, ctx) {
  const query = ctx.rangeQuery()
  const [{ data }, ordersView] = await Promise.all([
    ctx.api(`/overview?${query}`),
    ctx.api(`/orders?${query}`).then((r) => r.data).catch((err) => {
      if (err?.status === 401 || err?.status === 403) throw err
      return null
    }),
  ])
  ctx.setRangeLabel?.(data.range)

  const trendRows = data.revenueByDay ?? []
  const { grain, points } = bucketTrend(trendRows)
  const hasOrders = trendRows.some((r) => isNum(r.orders))
  const grainLabel = { day: 'Daily', week: 'Weekly totals', month: 'Monthly totals' }[grain]
  const pace = paceCard(data)
  const channels = channelData(ordersView, data)

  root.innerHTML = [
    kpis(data),
    card({
      title: 'Revenue trend',
      subtitle: `${grainLabel} for the selected range`,
      actions: hasOrders
        ? segmented({
            name: 'trend',
            options: [
              { value: 'revenue', label: 'Revenue' },
              { value: 'orders', label: 'Orders' },
            ],
            value: 'revenue',
          })
        : '',
      className: 'col-8',
      body: points.length ? '<div id="trend-chart" class="chart-box"></div>' : emptyState('No sales in this range yet.'),
    }),
    typeof pace === 'string' ? pace : pace.html,
    card({
      title: 'Sales by channel',
      subtitle: channels?.subtitle ?? 'Where sales came from in this range',
      className: 'col-6',
      body: channels ? '<div id="channel-chart" class="chart-box"></div>' : emptyState('No sales in this range yet.'),
    }),
    attentionCard(data),
    productsCard(data),
  ].join('')

  if (points.length) {
    const el = root.querySelector('#trend-chart')
    const draw = (key) =>
      key === 'orders'
        ? barChart(el, {
            series: [{ name: 'Orders', data: points.map((p) => p.orders) }],
            categories: points.map((p) => p.label),
            format: 'num',
          })
        : areaChart(el, {
            series: [{ name: 'Revenue', data: points.map((p) => Math.round(p.revenue * 100) / 100) }],
            categories: points.map((p) => p.label),
            format: 'money',
          })
    draw('revenue')
    root.querySelector('.segmented[data-name="trend"]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]')
      if (!btn || btn.classList.contains('active')) return
      for (const b of btn.parentElement.children) {
        const on = b === btn
        b.classList.toggle('active', on)
        b.setAttribute('aria-pressed', String(on))
      }
      draw(btn.dataset.value)
    })
  }

  if (typeof pace !== 'string' && pace.gaugeValue != null) {
    gaugeChart(root.querySelector('#pace-gauge'), { value: pace.gaugeValue })
  }

  if (channels) {
    donutChart(root.querySelector('#channel-chart'), {
      series: channels.series,
      labels: channels.labels,
      format: channels.format,
    })
  }
}
