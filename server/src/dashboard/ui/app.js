const state = {
  user: null,
  period: '30d',
  series: 'revenue',
  overview: null,
  pnl: null,
}

const $ = (sel) => document.querySelector(sel)
const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0)
const moneyExact = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)
const num = (n) => new Intl.NumberFormat('en-US').format(Math.round(n ?? 0))
const pct = (n, digits = 1) => `${(n ?? 0).toFixed(digits)}%`

async function api(path, options = {}) {
  const res = await fetch(`/dashboard/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data })
  return data
}

function show(view) {
  $('#login-view').classList.toggle('hidden', view !== 'login')
  $('#dash-view').classList.toggle('hidden', view !== 'dash')
}

function deltaHtml(metric, asPts = false) {
  if (!metric) return ''
  const change = asPts ? metric.changePts : metric.changePct
  if (change == null) return `<span class="delta">vs ${asPts ? pct(metric.previous, 2) : money(metric.previous)}</span>`
  const up = change >= 0
  const label = asPts
    ? `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(1)} pt`
    : `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}% vs ${money(metric.previous)}`
  return `<span class="delta ${up ? 'up' : 'down'}">${label}</span>`
}

function renderKpis(kpis) {
  const items = [
    { label: 'Revenue', value: money(kpis.revenue.value), delta: deltaHtml(kpis.revenue) },
    { label: 'Orders', value: num(kpis.orders.value), delta: deltaHtml(kpis.orders) },
    { label: 'Average order value', value: moneyExact(kpis.aov.value), delta: deltaHtml(kpis.aov) },
    {
      label: 'Conversion rate',
      value: pct(kpis.conversionRate.value, 2),
      delta: deltaHtml(kpis.conversionRate, true) + ' <span class="muted">orders ÷ visits</span>',
    },
    {
      label: 'Visits',
      value: num(kpis.visits.value),
      delta: `${deltaHtml(kpis.visits)} · ${num(kpis.uniqueVisitors)} unique`,
    },
  ]
  $('#kpi-row').innerHTML = items
    .map(
      (item) => `<div class="kpi"><div class="label">${item.label}</div><div class="value">${item.value}</div><div>${item.delta}</div></div>`,
    )
    .join('')
}

function renderBars(rows, key) {
  const max = Math.max(...rows.map((r) => r[key]), 1)
  $('#revenue-chart').innerHTML = rows
    .map((r) => {
      const h = Math.max(4, Math.round((r[key] / max) * 160))
      const label = r.date.slice(5)
      return `<div class="bar" style="height:${h}px" title="${r.date}: ${r[key]}"><span>${label}</span></div>`
    })
    .join('')
}

function renderOverview(data) {
  state.overview = data
  $('#range-label').textContent = `${data.range.label} · compared with previous period`
  renderKpis(data.kpis)
  renderBars(data.revenueByDay, state.series)

  $('#funnel').innerHTML = data.funnel
    .map(
      (step, i) => `<div class="funnel-step">
        <div class="row"><strong>${step.step}</strong><span>${num(step.count)} · ${pct(step.pctOfStart)}</span></div>
        <div class="meter"><i style="width:${Math.min(100, step.pctOfStart)}%"></i></div>
        <div class="meta">${i === 0 ? 'Starting point' : `${pct(step.pctOfPrevious ?? 0)} of previous step`}</div>
      </div>`,
    )
    .join('')

  const tbody = $('#products-table tbody')
  tbody.innerHTML = data.products
    .slice(0, 8)
    .map(
      (p) => `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="muted">${escapeHtml(p.category || '')}</div></td><td>${num(p.units)}</td><td>${money(p.revenue)}</td><td>${pct(p.share)}</td></tr>`,
    )
    .join('')

  $('#sources').innerHTML = data.trafficSources
    .map(
      (s) => `<div><div class="row"><span>${escapeHtml(s.source)}</span><strong>${num(s.visits)} · ${pct(s.share, 0)}</strong></div><div class="meter"><i style="width:${s.share}%"></i></div></div>`,
    )
    .join('')

  const states = data.ordersByState.slice(0, 5)
  const other = data.ordersByState.slice(5)
  const otherOrders = other.reduce((a, b) => a + b.orders, 0)
  const stateRows = [...states]
  if (otherOrders) stateRows.push({ state: 'All other states', orders: otherOrders, share: other.reduce((a, b) => a + b.share, 0) })
  $('#states').innerHTML = stateRows
    .map((s) => `<div class="row"><span>${escapeHtml(s.state)}</span><strong>${num(s.orders)} · ${pct(s.share, 0)}</strong></div>`)
    .join('')

  $('#keywords').innerHTML = data.searchKeywords
    .map((k) => `<div class="row"><span>${escapeHtml(k.query)}</span><strong>${num(k.visits)} visits</strong></div>`)
    .join('')

  const a = data.abandonedCarts
  $('#abandoned').innerHTML = `
    <div class="stat"><div class="label">Carts abandoned</div><div class="value">${num(a.abandoned)}</div></div>
    <div class="stat"><div class="label">Recovered by email</div><div class="value">${num(a.recovered)}</div></div>
    <div class="stat"><div class="label">Recovered revenue</div><div class="value">${money(a.recoveredRevenue)}</div></div>
    <div class="stat"><div class="label">Orders from returning</div><div class="value">${pct(a.returningCustomerShare, 0)}</div></div>`
}

function renderPnL(data) {
  state.pnl = data
  $('#pnl-kpis').innerHTML = [
    { label: 'Revenue, YTD', value: money(data.kpis.revenueYtd.value), delta: deltaHtml(data.kpis.revenueYtd) },
    { label: 'Gross margin, YTD', value: pct(data.kpis.grossMarginYtd.value), delta: deltaHtml(data.kpis.grossMarginYtd, true) },
    { label: 'Net income, YTD', value: money(data.kpis.netIncomeYtd.value), delta: deltaHtml(data.kpis.netIncomeYtd) },
    { label: 'Cash on hand', value: money(data.kpis.cashOnHand), delta: '<span class="muted">from forecast</span>' },
  ]
    .map((item) => `<div class="kpi"><div class="label">${item.label}</div><div class="value">${item.value}</div><div>${item.delta}</div></div>`)
    .join('')

  let lastSection = ''
  const body = []
  for (const row of data.incomeStatement) {
    if (row.section !== lastSection) {
      body.push(`<tr class="section"><td colspan="5">${escapeHtml(row.section)}</td></tr>`)
      lastSection = row.section
    }
    body.push(`<tr class="${row.emphasize ? 'emphasize' : ''}">
      <td>${escapeHtml(row.label)}</td>
      <td>${moneyExact(row.monthAmount)}</td>
      <td>${row.monthPct == null ? '—' : pct(row.monthPct)}</td>
      <td>${moneyExact(row.ytdAmount)}</td>
      <td>${row.ytdPct == null ? '—' : pct(row.ytdPct)}</td>
    </tr>`)
  }
  $('#pnl-table tbody').innerHTML = body.join('')

  $('#channel-rev').innerHTML = data.revenueByChannel
    .map(
      (c) => `<div><div class="row"><span>${escapeHtml(c.channel)}</span><strong>${money(c.revenue)} · ${pct(c.share)}</strong></div>
      <div class="muted">$${c.revenuePerUnit.toFixed(0)}/unit</div>
      <div class="meter"><i style="width:${c.share}%"></i></div></div>`,
    )
    .join('')

  $('#unit-profit').innerHTML = data.revenueByChannel
    .map(
      (c) => `<div class="row"><span>${escapeHtml(c.channel)}</span><strong>$${c.revenuePerUnit.toFixed(0)} sale · $${c.profitPerUnit.toFixed(2)} profit</strong></div>`,
    )
    .join('')

  const months = data.monthlyRevenueByChannel
  const max = Math.max(...months.map((m) => m.total), 1)
  const colors = { etsy: '#c45c26', squarespace: '#2f6b45', shopify: '#95bf47', ebay: '#0064d2', other: '#6b7280' }
  $('#monthly-channels').innerHTML = months
    .map((m) => {
      const parts = ['etsy', 'squarespace', 'shopify', 'ebay', 'other']
        .map((k) => {
          const h = Math.round((m[k] / max) * 180)
          return h ? `<i style="height:${h}px;background:${colors[k]}" title="${k}: ${m[k]}"></i>` : ''
        })
        .join('')
      return `<div class="stack" title="${m.month}: ${money(m.total)}">${parts}</div>`
    })
    .join('')

  $('#cash-table tbody').innerHTML = data.cashForecast
    .map(
      (r) => `<tr>
        <td>${r.monthEnd}</td><td>${moneyExact(r.beginningBalance)}</td><td>${moneyExact(r.collections)}</td>
        <td>${moneyExact(r.freightAndFees)}</td><td>${moneyExact(r.marketing)}</td>
        <td>${moneyExact(r.website)}</td><td>${moneyExact(r.manufacturing)}</td><td>${moneyExact(r.endingBalance)}</td>
      </tr>`,
    )
    .join('')
}

function renderRoas(payload, syncs) {
  $('#roas-table tbody').innerHTML = payload.platforms
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.platform)}</td>
        <td>${moneyExact(p.spend)}</td>
        <td>${moneyExact(p.platformReportedSales)}</td>
        <td>${p.platformRoas == null ? '—' : `${p.platformRoas.toFixed(1)}x`}</td>
        <td>${moneyExact(p.siteObservedSales)}</td>
        <td>${p.siteRoas == null ? '—' : `${p.siteRoas.toFixed(1)}x`}</td>
      </tr>`,
    )
    .join('') || `<tr><td colspan="6">No ad spend synced yet.</td></tr>`

  $('#sync-status').innerHTML =
    syncs.length === 0
      ? `<p class="muted">No sync runs yet. Seed demo data or import the Sales Tracker sheet.</p>`
      : syncs
          .map(
            (s) => `<div class="row"><span>${escapeHtml(s.source)}</span><strong>${escapeHtml(s.status)}${s.finishedAt ? ` · ${new Date(s.finishedAt).toLocaleString()}` : ''}</strong></div>
            <div class="muted">${escapeHtml(s.message || '')} · ${num(s.rowsTouched)} rows</div>`,
          )
          .join('')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function loadOverview() {
  const { data } = await api(`/overview?period=${state.period}`)
  renderOverview(data)
}

async function loadPnL() {
  const year = $('#pnl-year').value
  const month = $('#pnl-month').value
  const { data } = await api(`/pnl?year=${year}&month=${encodeURIComponent(month)}`)
  renderPnL(data)
}

async function loadRoas() {
  const [{ data }, sync] = await Promise.all([api('/roas?period=30d'), api('/sync-status')])
  renderRoas(data, sync.data || [])
}

function setPage(page) {
  for (const btn of document.querySelectorAll('#nav button')) {
    btn.classList.toggle('active', btn.dataset.page === page)
  }
  $('#overview-page').classList.toggle('hidden', page !== 'overview')
  $('#pnl-page').classList.toggle('hidden', page !== 'pnl')
  $('#roas-page').classList.toggle('hidden', page !== 'roas')
  $('#page-subtitle').textContent =
    page === 'pnl' ? 'Profit & loss · all sales channels' : page === 'roas' ? 'Ad efficiency' : 'Store analytics · sundayrollsgolf.com'
  if (page === 'overview') loadOverview().catch(showError)
  if (page === 'pnl') loadPnL().catch(showError)
  if (page === 'roas') loadRoas().catch(showError)
}

function showError(err) {
  console.error(err)
  if (err.status === 401) {
    state.user = null
    show('login')
  }
}

function bind() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const error = $('#login-error')
    error.hidden = true
    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#login-email').value,
          password: $('#login-password').value,
        }),
      })
      state.user = data.user
      $('#user-name').textContent = data.user.name
      show('dash')
      setPage('overview')
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
    }
  })

  $('#logout-btn').addEventListener('click', async () => {
    await api('/logout', { method: 'POST' })
    show('login')
  })

  for (const btn of document.querySelectorAll('#nav button')) {
    btn.addEventListener('click', () => setPage(btn.dataset.page))
  }
  for (const btn of document.querySelectorAll('#period-pills button')) {
    btn.addEventListener('click', () => {
      state.period = btn.dataset.period
      for (const b of document.querySelectorAll('#period-pills button')) b.classList.toggle('active', b === btn)
      loadOverview().catch(showError)
    })
  }
  for (const btn of document.querySelectorAll('#chart-series button')) {
    btn.addEventListener('click', () => {
      state.series = btn.dataset.series
      for (const b of document.querySelectorAll('#chart-series button')) b.classList.toggle('active', b === btn)
      if (state.overview) renderBars(state.overview.revenueByDay, state.series)
    })
  }
  $('#pnl-refresh').addEventListener('click', () => loadPnL().catch(showError))
  $('#export-pnl').addEventListener('click', () => {
    if (!state.pnl) return
    const lines = [['section', 'label', 'month', 'month_pct', 'ytd', 'ytd_pct']]
    for (const row of state.pnl.incomeStatement) {
      lines.push([row.section, row.label, row.monthAmount, row.monthPct, row.ytdAmount, row.ytdPct])
    }
    const csv = lines.map((r) => r.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sunday-rolls-pnl-${state.pnl.month || state.pnl.year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  })
}

async function boot() {
  bind()
  try {
    const me = await api('/me')
    state.user = me.user
    $('#user-name').textContent = me.user.name
    show('dash')
    setPage('overview')
  } catch {
    show('login')
  }
}

boot()
