// Dashboard shell: login, sidebar + header, hash router, global date range, theme, and data refresh.
// Pages live in ./pages/<name>.js and follow the contract documented at the top of ./lib/ui.js.
import { destroyCharts, rethemeCharts } from './lib/charts.js'
import { animateIn, card, countUp, escapeHtml, icon } from './lib/ui.js'

const ROUTES = [
  { name: 'overview', label: 'Overview', icon: 'dashboard', group: 'MENU' },
  { name: 'sales', label: 'Sales', icon: 'cart', group: 'MENU' },
  { name: 'products', label: 'Products', icon: 'package', group: 'MENU' },
  { name: 'marketing', label: 'Marketing', icon: 'megaphone', group: 'MENU' },
  { name: 'funnel', label: 'Funnel', icon: 'filter', group: 'MENU' },
  { name: 'money', label: 'Money', icon: 'coins', group: 'MENU', ownRange: true },
  { name: 'tools', label: 'Tools', icon: 'tool', group: 'OTHERS', ownRange: true },
]
const DEFAULT_ROUTE = 'overview'
const PERIODS = ['7d', '30d', '90d', 'year']
const SYNC_SOURCES = [
  { key: 'shopify', label: 'Shopify' },
  { key: 'sales-tracker', label: 'Sales Tracker' },
  { key: 'ga4', label: 'GA4' },
  { key: 'search-console', label: 'Search Console' },
]
const STORE = { theme: 'sr-dashboard-theme', sidebar: 'sr-dashboard-sidebar', range: 'sr-dashboard-range' }

const $ = (sel) => document.querySelector(sel)

const store = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* storage unavailable */
    }
  },
}

const state = {
  user: null,
  route: null,
  range: loadRange(),
  renderToken: 0,
  syncing: false,
}

// ---------- API ----------

async function api(path, options = {}) {
  const res = await fetch(`/dashboard/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data })
    if (res.status === 401 || res.status === 403) handleAuthError(err)
    throw err
  }
  return data
}

function handleAuthError(err) {
  if (!state.user) return
  state.user = null
  showLogin(err.status === 403 ? err.message || 'Admin access required' : '')
}

// ---------- Range ----------

function loadRange() {
  try {
    const saved = JSON.parse(store.get(STORE.range) || 'null')
    if (saved?.start && saved?.end && /^\d{4}-\d{2}-\d{2}$/.test(saved.start) && /^\d{4}-\d{2}-\d{2}$/.test(saved.end)) {
      return { period: null, start: saved.start, end: saved.end }
    }
    if (PERIODS.includes(saved?.period)) return { period: saved.period, start: null, end: null }
  } catch {
    /* ignore */
  }
  return { period: '30d', start: null, end: null }
}

function rangeQuery() {
  const r = state.range
  if (r.start && r.end) return `start=${encodeURIComponent(r.start)}&end=${encodeURIComponent(r.end)}`
  return `period=${encodeURIComponent(r.period || '30d')}`
}

function setRange(next) {
  state.range = next
  store.set(STORE.range, JSON.stringify(next))
  syncRangeUi()
  renderRoute()
}

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function syncRangeUi() {
  const r = state.range
  const custom = Boolean(r.start && r.end)
  for (const btn of document.querySelectorAll('#range-pills button')) {
    const active = custom ? btn.dataset.period === 'custom' : btn.dataset.period === r.period
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-pressed', String(active))
  }
  const labels = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', year: 'Year to date' }
  $('#range-label').textContent = custom
    ? `${shortDate(r.start)} – ${shortDate(r.end)} · compared with the period before`
    : `${labels[r.period] ?? 'Last 30 days'} · compared with the period before`
}

function setRangeLabelFromData(range) {
  // Pages may call ctx.range-independent APIs; the overview response tells us the exact dates.
  if (!range?.start || !range?.end) return
  const prefix = state.range.start
    ? ''
    : `${{ '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', year: 'Year to date' }[state.range.period] ?? ''} · `
  $('#range-label').textContent = `${prefix}${shortDate(range.start)} – ${shortDate(range.end)}`
}

function openRangePopover(open) {
  const pop = $('#range-popover')
  const btn = $('#range-custom-btn')
  pop.classList.toggle('open', open)
  btn.setAttribute('aria-expanded', String(open))
  if (open) {
    const r = state.range
    const today = new Date().toISOString().slice(0, 10)
    $('#range-start').value = r.start || ''
    $('#range-end').value = r.end || today
    $('#range-error').hidden = true
    $('#range-start').focus()
  }
}

// ---------- Theme & sidebar ----------

function setTheme(mode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  store.set(STORE.theme, mode)
  rethemeCharts()
}

// Kept at module scope so the MediaQueryList (and its change listeners) stay alive.
const desktopQuery = window.matchMedia('(min-width: 1024px)')
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
const isDesktop = () => desktopQuery.matches

function toggleSidebar() {
  const root = document.documentElement
  if (isDesktop()) {
    const collapsed = !root.classList.contains('sidebar-collapsed')
    root.classList.toggle('sidebar-collapsed', collapsed)
    store.set(STORE.sidebar, collapsed ? 'collapsed' : 'expanded')
  } else {
    root.classList.toggle('sidebar-open')
  }
}

function closeDrawer() {
  document.documentElement.classList.remove('sidebar-open')
}

function renderSidebar() {
  const groups = [...new Set(ROUTES.map((r) => r.group))]
  $('#sidebar-nav').innerHTML = groups
    .map(
      (group) => `<div class="nav-group">
  <h2 class="nav-group-label"><span class="nav-group-text">${escapeHtml(group)}</span><span class="nav-group-dots">${icon('dots')}</span></h2>
  <ul class="nav-list">${ROUTES.filter((r) => r.group === group)
    .map(
      (r) =>
        `<li><a class="nav-item" href="#/${r.name}" data-route="${r.name}"><span class="nav-icon">${icon(r.icon)}</span><span class="nav-label">${escapeHtml(r.label)}</span></a></li>`,
    )
    .join('')}</ul>
</div>`,
    )
    .join('')
}

function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon, { size: el.dataset.iconSize ? Number(el.dataset.iconSize) : 20 })
  }
}

// ---------- Views ----------

function showLogin(message = '') {
  destroyCharts()
  $('#shell').classList.add('hidden')
  $('#login-view').classList.remove('hidden')
  const error = $('#login-error')
  error.textContent = message
  error.hidden = !message
}

function showShell() {
  $('#login-view').classList.add('hidden')
  $('#shell').classList.remove('hidden')
  const name = state.user?.name || state.user?.email || 'Team'
  $('#user-name').textContent = name
  $('#user-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'S'
  $('#dropdown-name').textContent = name
  $('#dropdown-email').textContent = state.user?.email || ''
}

function setUserMenu(open) {
  $('#user-dropdown').classList.toggle('open', open)
  $('#user-btn').setAttribute('aria-expanded', String(open))
}

// ---------- Router ----------

function currentRoute() {
  const name = (location.hash.replace(/^#\/?/, '').split('?')[0] || '').toLowerCase()
  return ROUTES.some((r) => r.name === name) ? name : DEFAULT_ROUTE
}

function loadingSkeleton() {
  return `${'<div class="skeleton col-3" style="height:180px"></div>'.repeat(4)}
  <div class="skeleton col-8" style="height:380px"></div>
  <div class="skeleton col-4" style="height:380px"></div>`
}

async function renderRoute() {
  if (!state.user) return
  const name = currentRoute()
  const meta = ROUTES.find((r) => r.name === name)
  if (location.hash !== `#/${name}`) history.replaceState(null, '', `#/${name}`)
  state.route = name
  const token = ++state.renderToken

  for (const a of document.querySelectorAll('.nav-item')) {
    const active = a.dataset.route === name
    a.classList.toggle('active', active)
    if (active) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
  $('#page-title').textContent = meta.label
  // Money picks its own month/year and Tools has no range, so the global range bar is hidden there.
  document.querySelector('.content-bar').hidden = Boolean(meta.ownRange)
  document.title = `${meta.label} · Sunday Rolls Analytics`
  closeDrawer()

  destroyCharts()
  const host = $('#page-root')
  // The page root is live in the DOM (charts need layout) and shows a skeleton until the page
  // replaces its contents.
  const root = document.createElement('div')
  root.className = 'page-grid'
  root.dataset.page = name
  root.setAttribute('aria-busy', 'true')
  root.innerHTML = loadingSkeleton()
  host.replaceChildren(root)
  const ctx = {
    api,
    rangeQuery,
    range: { ...state.range },
    navigate: (to) => {
      location.hash = `#/${to}`
    },
    refresh: () => renderRoute(),
    setRangeLabel: setRangeLabelFromData,
  }

  try {
    const mod = await import(`./pages/${name}.js`)
    if (token !== state.renderToken) return
    await mod.render(root, ctx)
    if (token !== state.renderToken) return
    root.removeAttribute('aria-busy')
    animateIn(root)
    countUp(root)
  } catch (err) {
    if (token !== state.renderToken) return
    if (err?.status === 401 || err?.status === 403) return
    console.error(err)
    destroyCharts()
    root.removeAttribute('aria-busy')
    root.innerHTML = card({
      className: 'col-12',
      body: `<div class="page-error"><div class="icon-chip">${icon('alert')}</div><div><h3 class="card-title">This page couldn’t load</h3><p class="card-sub">${escapeHtml(err?.message || 'Something went wrong.')} Try Refresh, or reload the page.</p></div></div>`,
    })
  }
}

// ---------- Refresh / auto-sync ----------

let progressTimer = null

function progress(fraction, { error = false, done = false } = {}) {
  const bar = $('#progress')
  const fill = bar.querySelector('.progress-fill')
  clearTimeout(progressTimer)
  bar.classList.add('active')
  bar.classList.toggle('error', error)
  fill.style.width = `${Math.max(4, Math.round(fraction * 100))}%`
  if (done) {
    progressTimer = setTimeout(() => {
      bar.classList.remove('active')
      progressTimer = setTimeout(() => {
        fill.style.width = '0'
        bar.classList.remove('error')
      }, 320)
    }, 850) // width transition (~450ms) + ~400ms hold
  }
}

/** Run every source's quiet sync in parallel, driving the top bar. `force` re-syncs fresh sources. */
async function syncAll({ force = false } = {}) {
  if (state.syncing || !state.user) return
  state.syncing = true
  const btn = $('#refresh-btn')
  btn.setAttribute('aria-busy', 'true')
  btn.disabled = true

  const total = SYNC_SOURCES.length
  let finished = 0
  let changed = false
  const failures = []
  progress(0)

  await Promise.all(
    SYNC_SOURCES.map(async (source) => {
      try {
        const { data } = await api(`/sync/auto/${source.key}${force ? '?force=1' : ''}`, { method: 'POST' })
        if (data?.status === 'synced') changed = true
      } catch (err) {
        if (err.status !== 401 && err.status !== 403) failures.push({ source: source.label, message: err.message })
      }
      finished += 1
      progress(finished / total, { error: failures.length > 0 })
    }),
  )

  progress(1, { error: failures.length > 0, done: true })
  state.syncing = false
  btn.removeAttribute('aria-busy')
  btn.disabled = false
  const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (failures.length) {
    btn.classList.add('has-error')
    btn.title = `Refresh data — last run at ${time} had problems:\n${failures.map((f) => `• ${f.source}: ${f.message}`).join('\n')}`
  } else {
    btn.classList.remove('has-error')
    btn.title = `Refresh data (last refreshed ${time})`
  }
  if (changed && state.user) renderRoute()
}

// ---------- Boot ----------

function enterDashboard(user) {
  state.user = user
  showShell()
  syncRangeUi()
  renderRoute()
  syncAll()
}

function bind() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const error = $('#login-error')
    const submit = e.target.querySelector('button[type="submit"]')
    error.hidden = true
    submit.disabled = true
    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }),
      })
      if (!data.user?.isAdmin) {
        error.textContent = 'Admin access required'
        error.hidden = false
        return
      }
      $('#login-password').value = ''
      enterDashboard(data.user)
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
    } finally {
      submit.disabled = false
    }
  })

  $('#logout-btn').addEventListener('click', async () => {
    setUserMenu(false)
    await api('/logout', { method: 'POST' }).catch(() => {})
    state.user = null
    showLogin()
  })

  $('#user-btn').addEventListener('click', (e) => {
    e.stopPropagation()
    setUserMenu(!$('#user-dropdown').classList.contains('open'))
  })

  $('#sidebar-toggle').addEventListener('click', toggleSidebar)
  $('#backdrop').addEventListener('click', closeDrawer)
  $('#theme-toggle').addEventListener('click', () =>
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'),
  )
  $('#refresh-btn').addEventListener('click', () => syncAll({ force: true }))

  $('#range-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-period]')
    if (!btn) return
    const period = btn.dataset.period
    if (period === 'custom') {
      e.stopPropagation()
      openRangePopover(!$('#range-popover').classList.contains('open'))
      return
    }
    openRangePopover(false)
    if (state.range.period === period && !state.range.start) return
    setRange({ period, start: null, end: null })
  })

  $('#range-popover').addEventListener('click', (e) => e.stopPropagation())
  $('#range-cancel').addEventListener('click', () => openRangePopover(false))
  $('#range-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const start = $('#range-start').value
    const end = $('#range-end').value
    const error = $('#range-error')
    if (!start || !end) return
    if (end < start) {
      error.textContent = 'The end date must be on or after the start date.'
      error.hidden = false
      return
    }
    openRangePopover(false)
    setRange({ period: null, start, end })
  })

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) setUserMenu(false)
    if (!e.target.closest('.range-controls')) openRangePopover(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    setUserMenu(false)
    openRangePopover(false)
    closeDrawer()
  })

  window.addEventListener('hashchange', () => renderRoute())

  // Follow the OS theme until the user picks one.
  darkQuery?.addEventListener?.('change', (e) => {
    if (store.get(STORE.theme)) return
    document.documentElement.classList.toggle('dark', e.matches)
    rethemeCharts()
  })

  // Leaving the mobile breakpoint closes the drawer.
  desktopQuery.addEventListener?.('change', () => closeDrawer())
}

async function boot() {
  renderSidebar()
  fillIcons()
  bind()
  try {
    const me = await api('/me')
    if (!me.user?.isAdmin) {
      await api('/logout', { method: 'POST' }).catch(() => {})
      showLogin('Admin access required')
      return
    }
    enterDashboard(me.user)
  } catch {
    showLogin()
  }
}

boot()
