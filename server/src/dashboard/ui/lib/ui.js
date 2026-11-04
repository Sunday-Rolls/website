/**
 * Shared UI helpers for the Sunday Rolls dashboard (TailAdmin-style, Sunday Rolls palette).
 *
 * PAGE-MODULE CONTRACT
 * --------------------
 * Each page lives in `ui/pages/<name>.js` (served at /dashboard/pages/<name>.js) and exports:
 *
 *   export async function render(root, ctx) { ... }
 *
 * - `root` is a <div class="page-grid"> already in the DOM (a 12-column grid; children use `.col-12`,
 *   `.col-8`, `.col-7`, `.col-6`, `.col-5`, `.col-4`, `.col-3`, which collapse to one column on
 *   mobile). It shows a loading skeleton until you replace it: fetch your data first, then set
 *   `root.innerHTML = ...` using the helpers below, then attach charts from `./charts.js` to
 *   elements inside it (charts need the element to be in the DOM).
 * - If `render` throws, the shell shows an error card (401/403 go to the login screen instead).
 * - `ctx` is:
 *     ctx.api(path, options?)  fetch `/dashboard/api${path}` → parsed JSON ({ ok, data }); throws
 *                              Error with `.status` on non-2xx. 401/403 send the user to login.
 *     ctx.rangeQuery()         'period=30d' | 'period=year' | 'start=YYYY-MM-DD&end=YYYY-MM-DD'
 *     ctx.range                { period: '7d'|'30d'|'90d'|'year'|null, start: string|null, end: string|null }
 *     ctx.navigate(name)       go to another page, e.g. ctx.navigate('products')
 *     ctx.refresh()            re-render the current page (no sync)
 *     ctx.setRangeLabel(range) optional: show the API's resolved { start, end } in the range bar
 * - The shell calls `destroyCharts()` and clears `root` before every render (route change, range
 *   change, data refresh). It runs `animateIn(root)` and `countUp(root)` after `render` resolves,
 *   so pages need not call them unless they add cards later.
 * - Every colour comes from CSS variables (styles.css); never hard-code hex in pages.
 * - All helpers return HTML strings (except `animateIn` / `countUp`, which act on the DOM).
 *   Escape user/API text with `escapeHtml` before interpolating it into your own markup.
 * - Links between pages are plain hashes: `<a href="#/products">`.
 */

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const int = new Intl.NumberFormat('en-US')

const finite = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null)

/** $1,240 (no cents). Missing → "—". */
export function money(n) {
  const v = finite(n)
  return v == null ? '—' : usd0.format(v)
}

/** $1,240.50. Missing → "—". */
export function moneyExact(n) {
  const v = finite(n)
  return v == null ? '—' : usd2.format(v)
}

/** 1,240 (rounded). Missing → "—". */
export function num(n) {
  const v = finite(n)
  return v == null ? '—' : int.format(Math.round(v))
}

/** 12.5% (`n` is already a percentage, e.g. 12.5). Missing → "—". */
export function pct(n, digits = 1) {
  const v = finite(n)
  return v == null ? '—' : `${v.toFixed(digits)}%`
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ICONS = {
  dashboard:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  receipt:
    '<path d="M5.5 20.5v-16a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16l-2.5-1.6-2.25 1.6L12 18.9l-1.75 1.6L8 18.9z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  package:
    '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.25l8 4.5"/>',
  megaphone:
    '<path d="M3.5 10v4a1 1 0 0 0 1 1H7l9 4.5v-15L7 9H4.5a1 1 0 0 0-1 1z"/><path d="M7 15l1.2 4.5h2.6L9.8 15.6M19 9.5a3.5 3.5 0 0 1 0 5"/>',
  filter: '<path d="M4 4.5h16l-6.2 7.6v5.6L10.2 19.5v-7.4z"/>',
  coins:
    '<ellipse cx="9.5" cy="7" rx="6" ry="2.75"/><path d="M3.5 7v4c0 1.5 2.7 2.75 6 2.75s6-1.25 6-2.75V7"/><path d="M8.5 13.7V17c0 1.5 2.7 2.75 6 2.75s6-1.25 6-2.75v-4c0-1.4-2.3-2.6-5.3-2.73"/>',
  inbox:
    '<path d="M3.5 13 6 5h12l2.5 8v5.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13h5l1 2.5h5l1-2.5h5"/>',
  tool:
    '<path d="M14.5 3.6a5 5 0 0 0-5.4 6.6l-5.4 5.4a1.8 1.8 0 0 0 0 2.6l2.1 2.1a1.8 1.8 0 0 0 2.6 0l5.4-5.4a5 5 0 0 0 6.6-5.4l-3 3-3.2-.6-.6-3.2z"/>',
  refresh:
    '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.4L4.5 8"/><path d="M4.5 4v4h4"/><path d="M4.5 13A7.5 7.5 0 0 0 18 17.6l1.5-1.6"/><path d="M19.5 20v-4h-4"/>',
  moon: '<path d="M20 14.6A8 8 0 0 1 9.4 4 8 8 0 1 0 20 14.6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  menu: '<path d="M4 6.5h16M4 12h11M4 17.5h16"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  cart:
    '<circle cx="9" cy="20" r="1.25"/><circle cx="18" cy="20" r="1.25"/><path d="M2.5 3.5h2.6l2.3 11.4a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.2L20.7 7.5H5.9"/>',
  alert: '<path d="M12 3.8 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17v.1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  truck:
    '<path d="M2.5 6.5h11v10h-11zM13.5 9.5h4l3 3.5v3.5h-7"/><circle cx="6.5" cy="17.5" r="1.75"/><circle cx="17" cy="17.5" r="1.75"/>',
  plug: '<path d="M9 3v4.5M15 3v4.5M6 7.5h12V11a6 6 0 0 1-12 0zM12 17v4"/>',
  dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  logout: '<path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="m10 16.5-4.5-4.5L10 7.5M5.5 12h10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M4.5 20h15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chart: '<path d="M4 20.5h16M7 17v-5M12 17V7M17 17v-8"/>',
  trend: '<path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  wallet:
    '<path d="M4 7.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-8.5A1.5 1.5 0 0 0 18.5 8H5.5A1.5 1.5 0 0 1 4 6.5 1.5 1.5 0 0 1 5.5 5H17"/><path d="M16 13.75h.1"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".75" fill="currentColor"/>',
}

/** Inline outline SVG icon (24×24, stroke = currentColor). Unknown names render an empty box. */
export function icon(name, { size = 24, className = '' } = {}) {
  const body = ICONS[name] ?? ''
  return `<svg class="icon ${escapeHtml(className)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
}

/** Names available to `icon()`. */
export const ICON_NAMES = Object.keys(ICONS)

/**
 * Delta pill from a MetricDelta ({ value, previous, changePct, changePts }).
 * `format`: 'pct' (default, uses changePct → "12.5%") or 'pts' (uses changePts → "0.4 pt").
 * A bare number is treated as a % change. Returns '' when there is no comparable change.
 */
export function deltaPill(delta, format = 'pct') {
  if (delta == null) return ''
  const change = typeof delta === 'number' ? delta : format === 'pts' ? delta.changePts : delta.changePct
  if (change == null || !Number.isFinite(change)) return ''
  const up = change >= 0
  const magnitude = Math.abs(change)
  const text = format === 'pts' ? `${magnitude.toFixed(1)} pt` : `${magnitude.toFixed(magnitude < 10 ? 1 : 0)}%`
  return `<span class="badge badge-${up ? 'success' : 'danger'} delta">${icon(up ? 'arrow-up' : 'arrow-down', { size: 12 })}${text}</span>`
}

/**
 * TailAdmin KPI card. `value` is the display string (already formatted); numeric parts count up.
 * `delta` is a MetricDelta (or a % number); `deltaFormat` is 'pct' | 'pts'. `hint` is plain text.
 * `className` adds classes, e.g. 'col-3' for grid placement.
 */
export function kpiCard({ icon: iconName = 'chart', label, value, delta, deltaFormat = 'pct', hint, className = '' } = {}) {
  const display = value == null || value === '' ? '—' : String(value)
  return `<article class="card kpi-card ${escapeHtml(className)}">
  <div class="icon-chip">${icon(iconName)}</div>
  <div class="kpi-foot">
    <div class="kpi-main">
      <span class="kpi-label">${escapeHtml(label)}</span>
      <h4 class="kpi-value" data-countup>${escapeHtml(display)}</h4>
    </div>
    ${deltaPill(delta, deltaFormat)}
  </div>
  ${hint ? `<p class="kpi-hint">${escapeHtml(hint)}</p>` : ''}
</article>`
}

/**
 * Section card. `title`/`subtitle` are plain text; `actions` and `body` are HTML.
 * `className` adds classes, e.g. 'col-8' for grid placement.
 */
export function card({ title, subtitle, actions = '', body = '', className = '' } = {}) {
  const head =
    title || subtitle || actions
      ? `<header class="card-head">
    <div class="card-head-text">
      ${title ? `<h3 class="card-title">${escapeHtml(title)}</h3>` : ''}
      ${subtitle ? `<p class="card-sub">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="card-actions">${actions}</div>` : ''}
  </header>`
      : ''
  return `<section class="card section-card ${escapeHtml(className)}">${head}<div class="card-body">${body}</div></section>`
}

/**
 * Compact table. columns: [{ key, label, align: 'left'|'right'|'center', format(value, row) → HTML }].
 * Without `format`, cell values are escaped. `empty` is shown when there are no rows.
 */
export function table({ columns = [], rows = [], empty = 'Nothing to show yet.' } = {}) {
  if (!rows.length) return emptyState(empty)
  const align = (c) => (c.align && c.align !== 'left' ? ` class="align-${c.align}"` : '')
  const head = columns.map((c) => `<th${align(c)}>${escapeHtml(c.label ?? c.key)}</th>`).join('')
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => {
            const raw = row?.[c.key]
            const cell = c.format ? c.format(raw, row) : escapeHtml(raw ?? '—')
            return `<td${align(c)}>${cell}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

/** Small rounded label. tone: 'success' | 'warning' | 'danger' | 'neutral' | 'brand'. */
export function badge(text, tone = 'neutral') {
  const t = ['success', 'warning', 'danger', 'neutral', 'brand'].includes(tone) ? tone : 'neutral'
  return `<span class="badge badge-${t}">${escapeHtml(text)}</span>`
}

/** Dashed empty-state card for a data source that isn't connected. Plain-text title/detail. */
export function notConnected({ title = 'Not connected', detail = '', className = '' } = {}) {
  return `<section class="card card-dashed not-connected ${escapeHtml(className)}">
  <div class="icon-chip icon-chip-muted">${icon('plug')}</div>
  <h3 class="card-title">${escapeHtml(title)}</h3>
  ${detail ? `<p class="card-sub">${escapeHtml(detail)}</p>` : ''}
</section>`
}

/** Muted centred message for an empty list/chart. */
export function emptyState(text = 'Nothing to show yet.') {
  return `<div class="empty-state">${escapeHtml(text)}</div>`
}

/**
 * TailAdmin segmented control. options: [{ value, label }]. Buttons carry `data-value`;
 * listen for clicks on the returned `.segmented` element (`data-name` = name).
 */
export function segmented({ name = '', options = [], value } = {}) {
  return `<div class="segmented" role="group" data-name="${escapeHtml(name)}">${options
    .map(
      (o) =>
        `<button type="button" data-value="${escapeHtml(o.value)}" class="${o.value === value ? 'active' : ''}" aria-pressed="${o.value === value}">${escapeHtml(o.label)}</button>`,
    )
    .join('')}</div>`
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Staggered fade-and-rise of every `.card` inside `root` (about 300ms each, 45ms apart). */
export function animateIn(root) {
  if (!root) return
  const cards = root.matches?.('.card') ? [root] : [...root.querySelectorAll('.card')]
  if (reducedMotion()) return
  cards.forEach((el, i) => {
    el.style.setProperty('--stagger', `${Math.min(i, 12) * 45}ms`)
    el.classList.remove('anim-in')
    void el.offsetWidth
    el.classList.add('anim-in')
    el.addEventListener('animationend', () => el.classList.remove('anim-in'), { once: true })
  })
}

/**
 * Count the first number in an element's text up from 0, keeping its prefix, suffix, commas and
 * decimals ("$1,240" / "4.1x" / "12.5%"). Pass an element or a root containing `[data-countup]`.
 */
export function countUp(el, duration = 900) {
  if (!el) return
  const targets = el.matches?.('[data-countup]') ? [el] : [...el.querySelectorAll('[data-countup]')]
  if (reducedMotion()) return
  for (const target of targets) {
    const text = target.textContent ?? ''
    const match = text.match(/-?[\d,]*\.?\d+/)
    if (!match) continue
    const raw = match[0]
    const final = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(final) || final === 0) continue
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0
    const commas = raw.includes(',')
    const before = text.slice(0, match.index)
    const after = text.slice(match.index + raw.length)
    const fmt = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: commas,
    })
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      target.textContent = t >= 1 ? text : `${before}${fmt.format(final * eased)}${after}`
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
