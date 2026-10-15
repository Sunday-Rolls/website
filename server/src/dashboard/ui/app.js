const state = {
  user: null,
  period: '30d',
  start: null,
  end: null,
  series: 'revenue',
  overview: null,
  pnl: null,
}

const BREAK_EVEN_ROAS = 1.25

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

function overviewQuery() {
  if (state.start && state.end) {
    return `?start=${encodeURIComponent(state.start)}&end=${encodeURIComponent(state.end)}`
  }
  return `?period=${state.period}`
}

function syncRangeInputs(range) {
  if (!range?.start || !range?.end) return
  const startEl = $('#range-start')
  const endEl = $('#range-end')
  if (startEl) startEl.value = range.start
  if (endEl) endEl.value = range.end
}

function setPeriodPills(activePeriod) {
  for (const btn of document.querySelectorAll('#period-pills button')) {
    btn.classList.toggle('active', activePeriod != null && btn.dataset.period === activePeriod)
  }
}

function deltaHtml(metric, asPts = false) {
  if (!metric) return ''
  const change = asPts ? metric.changePts : metric.changePct
  if (change == null) {
    return `<span class="delta">vs ${asPts ? pct(metric.previous, 2) : money(metric.previous)}</span>`
  }
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
      (item) =>
        `<div class="kpi"><div class="label">${item.label}</div><div class="value">${item.value}</div><div>${item.delta}</div></div>`,
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
  syncRangeInputs(data.range)
  renderKpis(data.kpis)
  renderBars(data.revenueByDay, state.series)

  const productViews = data.productViewsByProduct || []
  $('#funnel').innerHTML = data.funnel
    .map((step, i) => {
      const isProductViews = step.step === 'Viewed a product'
      const meta = i === 0 ? 'Starting point' : `${pct(step.pctOfPrevious ?? 0)} of previous step`
      const detail =
        isProductViews && productViews.length > 0
          ? `<details class="funnel-detail" open>
              <summary>Views by product</summary>
              <div class="funnel-products">
                ${productViews
                  .map(
                    (p) => `<div>
                      <div class="row"><span><strong>${escapeHtml(p.name)}</strong><div class="muted">${escapeHtml(p.category || '')}</div></span><strong>${num(p.views)} · ${pct(p.share, 0)}</strong></div>
                      <div class="meter"><i style="width:${Math.min(100, p.share)}%"></i></div>
                    </div>`,
                  )
                  .join('')}
              </div>
            </details>`
          : isProductViews
            ? `<div class="meta">No per-product view data for this range yet.</div>`
            : ''
      return `<div class="funnel-step${isProductViews ? ' has-detail' : ''}">
        <div class="row"><strong>${escapeHtml(step.step)}</strong><span>${num(step.count)} · ${pct(step.pctOfStart)}</span></div>
        <div class="meter"><i style="width:${Math.min(100, step.pctOfStart)}%"></i></div>
        <div class="meta">${meta}</div>
        ${detail}
      </div>`
    })
    .join('')

  const tbody = $('#products-table tbody')
  tbody.innerHTML = data.products
    .slice(0, 8)
    .map(
      (p) =>
        `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="muted">${escapeHtml(p.category || '')}</div></td><td>${num(p.units)}</td><td>${money(p.revenue)}</td><td>${pct(p.share)}</td></tr>`,
    )
    .join('')

  $('#sources').innerHTML = data.trafficSources
    .map(
      (s) =>
        `<div><div class="row"><span>${escapeHtml(s.source)}</span><strong>${num(s.visits)} · ${pct(s.share, 0)}</strong></div><div class="meter"><i style="width:${s.share}%"></i></div></div>`,
    )
    .join('')

  const geoMode = data.stateBreakdownMode || 'orders'
  const statesTitle = $('#states-title')
  const statesNote = $('#states-note')
  if (statesTitle) {
    statesTitle.textContent = geoMode === 'visitors' ? 'Visitors by state' : 'Orders by state'
  }
  if (statesNote) {
    statesNote.textContent =
      geoMode === 'visitors'
        ? 'GA4 US sessions by region (Sales Tracker has no ship-to state). Switches to order states when Shopify fills them in.'
        : 'Ship-to state from orders that include an address (e.g. Shopify).'
  }
  const states = data.ordersByState.slice(0, 5)
  const other = data.ordersByState.slice(5)
  const otherOrders = other.reduce((a, b) => a + b.orders, 0)
  const stateRows = [...states]
  if (otherOrders) {
    stateRows.push({
      state: 'All other states',
      orders: otherOrders,
      share: other.reduce((a, b) => a + b.share, 0),
    })
  }
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
    .map(
      (item) =>
        `<div class="kpi"><div class="label">${item.label}</div><div class="value">${item.value}</div><div>${item.delta}</div></div>`,
    )
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
      (c) =>
        `<div class="row"><span>${escapeHtml(c.channel)}</span><strong>$${c.revenuePerUnit.toFixed(0)} sale · $${c.profitPerUnit.toFixed(2)} profit</strong></div>`,
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

function campaignBlurb(platform, campaign) {
  const name = campaign.toLowerCase()
  const p = platform.toLowerCase()
  if (name.includes('brand')) return 'Captures people already searching for Sunday Rolls.'
  if (name.includes('shopping')) return 'Product-feed ads on Google Shopping and partner sites.'
  if (name.includes('performance max') || name.includes('pmax')) return 'Google automated placements across Search, Shopping, YouTube, and Display.'
  if (name.includes('lookalike') || name.includes('prospect')) return 'Finds new buyers similar to past purchasers.'
  if (name.includes('retarget') || name.includes('remarket')) return 'Reaches people who visited the site but did not buy.'
  if (name.includes('offsite')) return 'Etsy promotes listings outside the marketplace.'
  if (p.includes('meta')) return 'Paid social on Instagram and Facebook.'
  if (p.includes('google')) return 'Paid search and shopping traffic.'
  return 'Paid acquisition for this channel.'
}

function roasTone(roas) {
  if (roas == null) return { cls: '', label: 'No sales reported' }
  if (roas >= BREAK_EVEN_ROAS * 1.4) return { cls: 'up', label: 'Strong vs break-even' }
  if (roas >= BREAK_EVEN_ROAS) return { cls: 'up', label: 'Above break-even' }
  if (roas >= 1) return { cls: 'warn', label: 'Above 1x, below break-even' }
  return { cls: 'down', label: 'Below 1x' }
}

function renderCampaigns(platforms) {
  const root = $('#roas-campaigns')
  const withCampaigns = platforms.filter((p) => (p.campaigns || []).length > 0)
  if (withCampaigns.length === 0) {
    root.innerHTML = `<p class="muted">No campaign-level spend yet. Platform totals still appear above when available.</p>`
    return
  }

  root.innerHTML = withCampaigns
    .map((p) => {
      const rows = (p.campaigns || [])
        .map((c) => {
          const tone = roasTone(c.platformRoas)
          const cpa = c.platformReportedOrders > 0 ? c.spend / c.platformReportedOrders : null
          const roasLabel = c.platformRoas == null ? '—' : `${c.platformRoas.toFixed(2)}x`
          return `<div class="campaign-row">
            <div class="campaign-name">
              <strong>${escapeHtml(c.campaign)}</strong>
              <div class="muted campaign-blurb">${escapeHtml(campaignBlurb(p.platform, c.campaign))}</div>
              <div class="bar-wrap"><div class="meter"><i style="width:${Math.min(100, c.shareOfPlatformSpend)}%"></i></div></div>
            </div>
            <div>
              <div>${moneyExact(c.spend)}</div>
              <div class="muted">${pct(c.shareOfPlatformSpend, 0)} of platform</div>
            </div>
            <div>
              <div>${moneyExact(c.platformReportedSales)}</div>
              <div class="muted">${num(c.platformReportedOrders)} orders</div>
            </div>
            <div>
              <div><strong>${roasLabel}</strong></div>
              <div class="muted ${tone.cls}">${escapeHtml(tone.label)}</div>
            </div>
            <div>
              <div>${cpa == null ? '—' : moneyExact(cpa)}</div>
              <div class="muted">cost / order</div>
            </div>
          </div>`
        })
        .join('')

      return `<div class="campaign-block">
        <h3>${escapeHtml(p.platform)}</h3>
        <div class="campaign-row head">
          <div>Campaign</div><div>Spend</div><div>Platform sales</div><div>ROAS</div><div>CPA</div>
        </div>
        ${rows}
      </div>`
    })
    .join('')
}

function renderRoas(payload, syncs) {
  $('#roas-table tbody').innerHTML =
    payload.platforms
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

  renderCampaigns(payload.platforms || [])

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
  const { data } = await api(`/overview${overviewQuery()}`)
  renderOverview(data)
}

async function loadPnL() {
  const year = $('#pnl-year').value
  const month = $('#pnl-month').value
  const { data } = await api(`/pnl?year=${year}&month=${encodeURIComponent(month)}`)
  renderPnL(data)
}

async function loadRoas() {
  const [{ data }, sync] = await Promise.all([api(`/roas${overviewQuery()}`), api('/sync-status')])
  renderRoas(data, sync.data || [])
}

function syncPayload() {
  const start = $('#sync-start')?.value || null
  const end = $('#sync-end')?.value || null
  return { start: start || undefined, end: end || undefined }
}

function setSyncFeedback(message, isError = false) {
  const el = $('#sync-feedback')
  if (!el) return
  el.textContent = message
  el.classList.toggle('error', isError)
}

function renderSyncList(target, syncs) {
  const el = $(target)
  if (!el) return
  el.innerHTML =
    !syncs.length
      ? `<p class="muted">No sync runs yet.</p>`
      : syncs
          .map(
            (s) => `<div class="row"><span>${escapeHtml(s.source)}</span><strong>${escapeHtml(s.status)}${s.finishedAt ? ` · ${new Date(s.finishedAt).toLocaleString()}` : ''}</strong></div>
            <div class="muted">${escapeHtml(s.message || '')} · ${num(s.rowsTouched)} rows</div>`,
          )
          .join('')
}

function renderDriveFiles(files, defaultFileId) {
  const el = $('#drive-files')
  if (!el) return
  if (!files.length) {
    el.innerHTML = `<p class="muted">No spreadsheets visible to the service account yet. Share the Sales Tracker as Viewer with the analytics service account, or paste a file URL below.</p>`
    return
  }
  el.innerHTML = files
    .map((f) => {
      const selected = f.id === defaultFileId || f.id === $('#drive-file-id')?.value
      return `<button type="button" class="file-item ${selected ? 'active' : ''}" data-file-id="${escapeHtml(f.id)}">
        <strong>${escapeHtml(f.name)}</strong>
        <span class="muted">${f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : ''}</span>
      </button>`
    })
    .join('')
  for (const btn of el.querySelectorAll('.file-item')) {
    btn.addEventListener('click', () => {
      $('#drive-file-id').value = btn.dataset.fileId
      for (const b of el.querySelectorAll('.file-item')) b.classList.toggle('active', b === btn)
    })
  }
}

async function loadDriveFiles() {
  try {
    const { data } = await api('/drive/files')
    if (data.defaultFileId && !$('#drive-file-id').value) {
      $('#drive-file-id').value = data.defaultFileId
    }
    renderDriveFiles(data.files || [], data.defaultFileId)
  } catch (err) {
    $('#drive-files').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`
  }
}

async function loadShopifyStatus() {
  const el = $('#shopify-status')
  if (!el) return
  try {
    const { data } = await api('/shopify/status')
    if (!data.configured) {
      el.textContent = 'Not configured on the server yet.'
      return
    }
    if (data.error) {
      el.textContent = `Configured, but ping failed: ${data.error}`
      return
    }
    el.textContent = `Connected to ${data.shop?.name || 'Shopify'} (${data.shop?.myshopifyDomain || ''})`
  } catch (err) {
    el.textContent = err.message
  }
}

async function loadDataPage() {
  const sync = await api('/sync-status')
  renderSyncList('#data-sync-status', sync.data || [])
  await Promise.all([loadDriveFiles(), loadShopifyStatus()])
}

function setPage(page) {
  for (const btn of document.querySelectorAll('#nav button')) {
    btn.classList.toggle('active', btn.dataset.page === page)
  }
  $('#overview-page').classList.toggle('hidden', page !== 'overview')
  $('#pnl-page').classList.toggle('hidden', page !== 'pnl')
  $('#roas-page').classList.toggle('hidden', page !== 'roas')
  $('#data-page')?.classList.toggle('hidden', page !== 'data')
  if (page === 'overview') loadOverview().catch(showError)
  if (page === 'pnl') loadPnL().catch(showError)
  if (page === 'roas') loadRoas().catch(showError)
  if (page === 'data') loadDataPage().catch(showError)
}

function showError(err) {
  console.error(err)
  if (err.status === 401) {
    state.user = null
    show('login')
  }
}

function applyCustomRange() {
  const start = $('#range-start').value
  const end = $('#range-end').value
  if (!start || !end) return
  if (end < start) {
    $('#range-label').textContent = 'End date must be on or after start date'
    return
  }
  state.start = start
  state.end = end
  state.period = 'custom'
  setPeriodPills(null)
  loadOverview().catch(showError)
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
      state.start = null
      state.end = null
      setPeriodPills(state.period)
      loadOverview().catch(showError)
    })
  }
  $('#range-apply')?.addEventListener('click', applyCustomRange)
  for (const id of ['range-start', 'range-end']) {
    $(`#${id}`)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        applyCustomRange()
      }
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

  $('#sync-ga4-btn')?.addEventListener('click', async () => {
    setSyncFeedback('Syncing GA4…')
    try {
      const days =
        $('#sync-start').value && $('#sync-end').value
          ? Math.max(
              1,
              Math.round(
                (new Date($('#sync-end').value) - new Date($('#sync-start').value)) / 86400000,
              ) + 1,
            )
          : 90
      const { data } = await api('/sync-ga4', { method: 'POST', body: JSON.stringify({ days }) })
      const gsc = data.searchConsole
        ? ` · GSC ${data.searchConsole.keywords} keywords`
        : ''
      setSyncFeedback(
        `GA4 synced: ${data.trafficRows} traffic days, ${data.productViewRows} product rows, ${data.adSpendRows} ad spend rows${gsc}`,
      )
      loadDataPage().catch(showError)
    } catch (err) {
      setSyncFeedback(err.message, true)
    }
  })

  $('#sync-shopify-btn')?.addEventListener('click', async () => {
    setSyncFeedback('Syncing Shopify orders…')
    try {
      const { data } = await api('/sync/shopify', {
        method: 'POST',
        body: JSON.stringify(syncPayload()),
      })
      setSyncFeedback(
        `Shopify synced: ${data.orders} orders · ${data.abandoned ?? 0} abandoned · ${data.recovered ?? 0} recovered`,
      )
      loadDataPage().catch(showError)
    } catch (err) {
      setSyncFeedback(err.message, true)
    }
  })

  $('#drive-refresh-btn')?.addEventListener('click', () => loadDriveFiles().catch(showError))

  $('#sync-tracker-btn')?.addEventListener('click', async () => {
    setSyncFeedback('Importing Sales Tracker from Drive…')
    try {
      const { data } = await api('/sync/sales-tracker', {
        method: 'POST',
        body: JSON.stringify({
          fileId: $('#drive-file-id').value,
          ...syncPayload(),
          includeCash: true,
        }),
      })
      setSyncFeedback(
        `Sales Tracker: ${data.orders} orders, ${data.expenses} expenses, ${data.cashRows} cash rows${
          data.warnings?.length ? ` · ${data.warnings.length} warnings` : ''
        }`,
      )
      loadDataPage().catch(showError)
    } catch (err) {
      setSyncFeedback(err.message, true)
    }
  })

  $('#upload-tracker-btn')?.addEventListener('click', async () => {
    const file = $('#tracker-upload')?.files?.[0]
    if (!file) {
      setSyncFeedback('Choose an .xlsx file first', true)
      return
    }
    setSyncFeedback(`Uploading ${file.name}…`)
    try {
      const body = new FormData()
      body.append('file', file)
      const { start, end } = syncPayload()
      if (start) body.append('start', start)
      if (end) body.append('end', end)
      const res = await fetch('/dashboard/api/sync/sales-tracker/upload', {
        method: 'POST',
        credentials: 'same-origin',
        body,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      const data = json.data
      setSyncFeedback(
        `Uploaded: ${data.orders} orders, ${data.expenses} expenses, ${data.cashRows} cash rows`,
      )
      loadDataPage().catch(showError)
    } catch (err) {
      setSyncFeedback(err.message, true)
    }
  })

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
