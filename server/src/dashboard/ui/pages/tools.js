// Tools: review QR codes, adding data by hand, the dashboard workbook, connection status, checks.
// Endpoints (unchanged from the old P&L / Data / Tests views): /review-qrs, /review-qrs.pdf,
// /import/manual-orders, /import/revenue|expenses|cash, /import/templates/:kind,
// /sync/sales-tracker/upload, /workbook (GET + POST), /health, /data-audit, /workflows/:name.
import { badge, card, emptyState, escapeHtml, icon, moneyExact, num, table } from '../lib/ui.js'

const CHANNELS = [
  { value: 'etsy', label: 'Etsy' },
  { value: 'ebay', label: 'eBay' },
  { value: 'squarespace', label: 'Squarespace' },
  { value: 'other', label: 'Other / in person' },
  { value: 'shopify', label: 'Shopify (only if it didn’t sync)' },
]
const CHANNEL_LABELS = { etsy: 'Etsy', ebay: 'eBay', squarespace: 'Squarespace', other: 'In person & other', shopify: 'Shopify' }

const CSV_KINDS = [
  { kind: 'revenue', endpoint: '/import/revenue', title: 'Sales', detail: 'Many Etsy, eBay, Squarespace or in-person sales at once' },
  { kind: 'expenses', endpoint: '/import/expenses', title: 'Expenses', detail: 'Costs like manufacturing, ads and software' },
  { kind: 'cash', endpoint: '/import/cash', title: 'Month-end cash', detail: 'Cash balance and money in and out for each month' },
  {
    kind: 'customers',
    endpoint: '/import/customer-orders',
    title: 'Customer history',
    detail: 'Squarespace orders export (Orders → Download CSV). Adds customer emails for new vs returning; revenue is unchanged',
    noTemplate: true,
  },
]

const WORKFLOWS = [
  {
    name: 'reviews',
    title: 'Reviews',
    detail: 'Posts a review, checks the product list the site reads, then deletes it.',
    button: 'Run review test',
  },
  {
    name: 'contact',
    title: 'Contact us',
    detail: 'Sends a contact email through Resend, then deletes the saved message. The email stays in the inbox.',
    button: 'Run contact test',
  },
  {
    name: 'mailing-list',
    title: 'Mailing list',
    detail: 'Subscribes a unique test address, confirms it is on the Shopify list, then deletes that customer.',
    button: 'Run mailing list test',
  },
  {
    name: 'orders',
    title: 'Orders',
    detail: 'Creates a $0 Shopify test order, reads it back, then deletes it. Inventory is left alone.',
    button: 'Run order test',
  },
]

const SEVERITY = { critical: ['Problem', 'danger'], gap: ['Gap', 'warning'], ok: ['OK', 'success'] }

const XLSX_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Kept between renders so Refresh keeps the chosen landing site.
let qrTarget = 'pages'

// ---------- Helpers ----------

function relTime(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** fetch for uploads/downloads (ctx.api forces a JSON body). 401/403 hand over to the shell's login. */
async function rawFetch(ctx, path, options = {}) {
  const res = await fetch(`/dashboard/api${path}`, { credentials: 'same-origin', ...options })
  if (res.status === 401 || res.status === 403) {
    ctx.api('/me').catch(() => {})
    throw Object.assign(new Error('Please sign in again.'), { status: res.status })
  }
  return res
}

async function readJson(res, fallback) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || fallback), { status: res.status })
  return json
}

/** Same approach as the old dashboard: fetch → blob → temporary link → click. */
async function download(ctx, path, fallbackName, fallbackError) {
  const res = await rawFetch(ctx, path)
  if (!res.ok) await readJson(res, fallbackError)
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const name = disposition.match(/filename="?([^";]+)"?/)?.[1] || fallbackName
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
  return name
}

function setStatus(el, text, tone = '') {
  if (!el) return
  el.textContent = text
  if (tone) el.dataset.tone = tone
  else delete el.dataset.tone
}

async function busy(btn, fn) {
  if (btn) {
    btn.disabled = true
    btn.setAttribute('aria-busy', 'true')
  }
  try {
    return await fn()
  } finally {
    if (btn) {
      btn.disabled = false
      btn.removeAttribute('aria-busy')
    }
  }
}

const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`

const warningText = (warnings) => (warnings?.length ? ` · Note: ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}` : '')

function injectStyles() {
  if (document.getElementById('style-tools')) return
  const style = document.createElement('style')
  style.id = 'style-tools'
  style.textContent = `
[data-page="tools"] .btn:disabled { opacity: 0.6; cursor: progress; }
.tools-text { font-size: 14px; line-height: 22px; color: var(--muted); }
.tools-meta { margin-top: 12px; font-size: 13px; line-height: 20px; color: var(--muted); }
.tools-meta[data-tone="error"] { color: var(--down); }
.tools-status { font-size: 14px; line-height: 20px; color: var(--muted); }
.tools-status:empty { display: none; }
.tools-status[data-tone="ok"] { color: var(--up); }
.tools-status[data-tone="error"] { color: var(--down); }
.tools-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px; margin-top: 16px; }
.tools-row .tools-field-grow { flex: 1 1 260px; max-width: 480px; }
.tools-row + .tools-status, .tools-actions + .tools-status { margin-top: 12px; }
.tools-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.tools-block + .tools-block { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-soft); }
.tools-block-title { font-size: 16px; line-height: 24px; font-weight: 600; color: var(--ink); }
.tools-block-sub { margin: 2px 0 16px; font-size: 14px; line-height: 20px; color: var(--muted); }
.tools-block-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; margin-bottom: 16px; }
.tools-block-head .tools-block-sub { margin-bottom: 0; }
.tools-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.tools-form .tools-span-2 { grid-column: span 2; }
.tools-form-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
.field .field-hint { font-weight: 400; color: var(--muted); }
.field input[type="file"] { height: auto; padding: 9px 12px; }
.tools-list { list-style: none; margin: 0; padding: 0; }
.tools-list li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; padding: 12px 0; border-bottom: 1px solid var(--border-soft); }
.tools-list li:first-child { padding-top: 0; }
.tools-list li:last-child { border-bottom: 0; }
.tools-list-text strong { display: block; font-size: 14px; font-weight: 500; color: var(--ink); }
.tools-list-text span { display: block; font-size: 13px; color: var(--muted); }
.tools-list-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tools-list + .tools-status { margin-top: 12px; }
.tools-howto { margin: 0 0 12px; padding-left: 20px; font-size: 14px; line-height: 24px; color: var(--ink); }
.tools-details summary { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; list-style: none; font-size: 14px; font-weight: 500; color: var(--accent); }
.tools-details summary::-webkit-details-marker { display: none; }
.tools-details summary .icon { transition: transform 0.15s var(--ease); }
.tools-details[open] summary .icon { transform: rotate(90deg); }
.tools-details > .table-wrap, .tools-details > .empty-state { margin-top: 12px; }
.tools-conn { list-style: none; margin: 0; padding: 0; }
.tools-conn li { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border-soft); }
.tools-conn li:first-child { padding-top: 0; }
.tools-conn li:last-child { border-bottom: 0; }
.tools-conn .conn-main { min-width: 0; }
.tools-conn .conn-label { display: block; font-size: 14px; font-weight: 500; color: var(--ink); }
.tools-conn .conn-detail { display: block; margin-top: 2px; font-size: 13px; line-height: 18px; color: var(--muted); overflow-wrap: break-word; }
.tools-conn .conn-detail.is-error { color: var(--down); }
.tools-conn .conn-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.tools-conn .conn-when { font-size: 12px; color: var(--muted); white-space: nowrap; }
.tools-note { display: flex; align-items: flex-start; gap: 10px; margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); font-size: 13px; line-height: 20px; color: var(--muted); }
.tools-note .icon { flex: none; color: var(--accent); }
.tools-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
.tools-stat { padding: 12px 14px; border-radius: 12px; background: var(--surface-2); }
.tools-stat span { display: block; font-size: 12px; color: var(--muted); }
.tools-stat strong { display: block; margin-top: 2px; font-size: 18px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.tools-audit { list-style: none; margin: 0; padding: 0; }
.tools-audit li { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border-soft); font-size: 14px; color: var(--muted); }
.tools-audit li:last-child { border-bottom: 0; }
.tools-audit .badge { min-width: 68px; margin-top: 1px; }
.tools-audit strong { display: block; font-weight: 500; color: var(--ink); }
.tools-tests { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.tools-test { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: 12px; }
.tools-test strong { font-size: 14px; font-weight: 600; color: var(--ink); }
.tools-test p { margin-top: 2px; font-size: 13px; line-height: 20px; color: var(--muted); }
.tools-test .btn { align-self: flex-start; }
.tools-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tools-steps:empty { display: none; }
.tools-steps li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 20px; color: var(--muted); }
.tools-steps li .icon { flex: none; margin-top: 1px; }
.tools-steps li.ok .icon { color: var(--up); }
.tools-steps li.fail { color: var(--ink); }
.tools-steps li.fail .icon { color: var(--down); }
.tools-steps li strong { font-weight: 600; color: var(--ink); }
@media (max-width: 1023.98px) {
  .tools-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767.98px) {
  .tools-tests { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 575.98px) {
  .tools-form { grid-template-columns: minmax(0, 1fr); }
  .tools-form .tools-span-2 { grid-column: 1 / -1; }
}
`
  document.head.appendChild(style)
}

// ---------- Sections ----------

function qrMetaText(qr) {
  if (!qr) return ''
  if (qr.error) return qr.error
  return `${num(qr.count)} products (from ${qr.source || 'catalog'}) · ${qr.label} · ${qr.siteUrl}`
}

function qrCard(qr) {
  return card({
    title: 'Review QR codes',
    subtitle: 'Print a review QR card for every product to drop in the box.',
    className: 'col-12',
    body: `<p class="tools-text">A printable PDF for every active product on the site, one product per page. Each cutout has the Sunday Rolls logo, “Leave a Review!” and a QR code that opens that product’s review form. Cut along the dashed lines. Uses live Shopify products, or the catalog if Shopify isn’t reachable.</p>
<div class="tools-row">
  <label class="field tools-field-grow">Which site should the codes open?
    <select id="qr-target">
      <option value="pages"${qrTarget === 'pages' ? ' selected' : ''}>GitHub Pages (sunday-rolls.github.io/website)</option>
      <option value="live"${qrTarget === 'live' ? ' selected' : ''}>Live site (www.sundayrollsgolf.com)</option>
    </select>
  </label>
  <button type="button" class="btn btn-primary" id="qr-download">${icon('download', { size: 18 })}Download QR code PDF</button>
</div>
<p class="tools-meta" id="qr-meta" aria-live="polite"${qr?.error ? ' data-tone="error"' : ''}>${escapeHtml(qrMetaText(qr))}</p>
<p class="tools-status" id="qr-status" aria-live="polite"></p>`,
  })
}

function manualTable(manual) {
  if (manual?.error) return `<p class="tools-status" data-tone="error">${escapeHtml(manual.error)}</p>`
  return table({
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'channel', label: 'Channel', format: (v) => escapeHtml(CHANNEL_LABELS[v] ?? v ?? '—') },
      { key: 'product', label: 'Product', format: (v) => escapeHtml(v || '—') },
      { key: 'revenue', label: 'Revenue', align: 'right', format: (v) => escapeHtml(moneyExact(v)) },
      {
        key: 'externalId',
        label: 'Order number',
        format: (v) => escapeHtml(String(v ?? '').replace(/^manual:[^:]+:/, '') || '—'),
      },
    ],
    rows: manual?.recent ?? [],
    empty: 'No sales added by hand yet.',
  })
}

function manualSummary(manual) {
  const count = manual?.count ?? 0
  return count ? `Show the latest ${Math.min(count, 25)} (${num(count)} in total)` : 'Show the list'
}

function addDataCard(manual) {
  const channelOptions = CHANNELS.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join('')
  const csvRows = CSV_KINDS.map(
    (k) => `<li>
  <span class="tools-list-text"><strong>${escapeHtml(k.title)}</strong><span>${escapeHtml(k.detail)}</span></span>
  <span class="tools-list-actions">
    ${k.noTemplate ? '' : `<button type="button" class="btn btn-outline" data-template="${k.kind}">${icon('download', { size: 18 })}Get the template</button>`}
    <button type="button" class="btn btn-outline" data-upload-csv="${k.kind}">${icon('upload', { size: 18 })}Upload CSV</button>
    <input type="file" accept=".csv,text/csv" hidden data-csv-input="${k.kind}" />
  </span>
</li>`,
  ).join('')

  return card({
    title: 'Add data by hand',
    subtitle: 'Record sales, expenses and cash that don’t come in from Shopify on their own.',
    className: 'col-12',
    body: `<section class="tools-block">
  <h4 class="tools-block-title">Add one sale</h4>
  <p class="tools-block-sub">For an Etsy, eBay, Squarespace or in-person sale. Website sales come in from Shopify automatically.</p>
  <form id="sale-form" class="tools-form">
    <label class="field">Date <input name="date" type="date" required /></label>
    <label class="field">Channel <select name="channel" required>${channelOptions}</select></label>
    <label class="field">Revenue ($) <input name="revenue" type="number" min="0.01" step="0.01" required /></label>
    <label class="field">Product <input name="product" type="text" placeholder="Headcover" /></label>
    <label class="field">Fees ($) <input name="fees" type="number" min="0" step="0.01" value="0" /></label>
    <label class="field">Shipping ($) <input name="shipping" type="number" min="0" step="0.01" value="0" /></label>
    <label class="field">Marketing ($) <input name="marketing" type="number" min="0" step="0.01" value="0" /></label>
    <label class="field">Order number <input name="externalId" type="text" placeholder="Optional, e.g. Etsy order #" title="Saving again with the same order number updates that sale instead of adding a second one." /></label>
    <div class="tools-form-actions">
      <button type="submit" class="btn btn-primary">${icon('plus', { size: 18 })}Save sale</button>
      <p class="tools-status" id="sale-status" aria-live="polite"></p>
    </div>
  </form>
</section>
<section class="tools-block">
  <h4 class="tools-block-title">Sales added by hand</h4>
  <p class="tools-block-sub">The most recent sales entered here, by CSV or from the workbook.</p>
  <details class="tools-details" id="manual-details">
    <summary>${icon('chevron-right', { size: 16 })}<span id="manual-summary">${escapeHtml(manualSummary(manual))}</span></summary>
    <div id="manual-orders">${manualTable(manual)}</div>
  </details>
</section>
<section class="tools-block">
  <h4 class="tools-block-title">Upload a spreadsheet (CSV)</h4>
  <p class="tools-block-sub">Add many rows at once. Get the template so the columns match, fill it in, then upload it.</p>
  <ul class="tools-list">${csvRows}</ul>
  <p class="tools-status" id="csv-status" aria-live="polite"></p>
</section>
<section class="tools-block">
  <h4 class="tools-block-title">Import the Sales Tracker workbook</h4>
  <p class="tools-block-sub">Bring in Etsy, Squarespace, eBay, expense and cash history from the Sales Tracker .xlsx. Website (Shopify) rows are skipped because Shopify syncs live.</p>
  <form id="tracker-form" class="tools-form">
    <label class="field tools-span-2">Sales Tracker file (.xlsx) <input name="file" type="file" accept="${XLSX_ACCEPT}" required /></label>
    <label class="field"><span>From <span class="field-hint">(optional)</span></span><input name="start" type="date" /></label>
    <label class="field"><span>To <span class="field-hint">(optional)</span></span><input name="end" type="date" /></label>
    <div class="tools-form-actions">
      <button type="submit" class="btn btn-primary">${icon('upload', { size: 18 })}Upload and import</button>
      <p class="tools-status" id="tracker-status" aria-live="polite"></p>
    </div>
  </form>
</section>`,
  })
}

function workbookCard() {
  return card({
    title: 'Dashboard workbook',
    subtitle: 'Edit sales, expenses and cash together in one Excel file.',
    className: 'col-6',
    body: `<ol class="tools-howto">
  <li>Download the workbook.</li>
  <li>Change, add or delete rows on the Revenue, Expenses and Cash sheets.</li>
  <li>Upload it again.</li>
</ol>
<p class="tools-text">Uploading replaces the editable data with what’s in the file, so rows you delete are removed. Website (Shopify) sales sync live and aren’t in this file.</p>
<div class="tools-actions">
  <button type="button" class="btn btn-primary" id="wb-download">${icon('download', { size: 18 })}Download workbook</button>
  <button type="button" class="btn btn-outline" id="wb-upload-btn">${icon('upload', { size: 18 })}Upload workbook</button>
  <input type="file" id="wb-upload" accept="${XLSX_ACCEPT}" hidden />
</div>
<p class="tools-status" id="wb-status" aria-live="polite"></p>`,
  })
}

function connectionsCard(health) {
  let body
  if (health?.error) {
    body = `<p class="tools-status" data-tone="error">${escapeHtml(health.error)}</p>`
  } else if (!health?.sources?.length) {
    body = emptyState('No data sources to show.')
  } else {
    body = `<ul class="tools-conn">${health.sources
      .map((s) => {
        let status
        let detail = ''
        let detailClass = ''
        if (!s.configured) {
          status = badge('Not set up', 'neutral')
          detail = s.missing ? `Missing: ${s.missing}` : ''
        } else if (s.lastSync?.status === 'error') {
          status = badge('Error', 'danger')
          detail = s.lastSync.message || 'The last sync failed.'
          detailClass = ' is-error'
        } else {
          status = badge('Connected', 'success')
        }
        const when = !s.lastSync
          ? 'Never synced'
          : s.lastSync.status === 'running'
            ? 'Syncing now'
            : `Last sync ${relTime(s.lastSync.at)}`
        return `<li>
  <span class="conn-main"><span class="conn-label">${escapeHtml(s.label)}</span>${detail ? `<span class="conn-detail${detailClass}">${escapeHtml(detail)}</span>` : ''}</span>
  <span class="conn-side">${status}<span class="conn-when">${escapeHtml(when)}</span></span>
</li>`
      })
      .join('')}</ul>`
  }
  return card({
    title: 'Connections',
    subtitle: 'Where the dashboard’s numbers come from, and when each last synced.',
    className: 'col-6',
    body: `${body}<p class="tools-note">${icon('refresh', { size: 18 })}<span>The dashboard syncs on its own each time you open it. Press Refresh at the top to sync right now.</span></p>`,
  })
}

function checksCard() {
  const tests = WORKFLOWS.map(
    (w) => `<div class="tools-test">
  <div><strong>${escapeHtml(w.title)}</strong><p>${escapeHtml(w.detail)}</p></div>
  <button type="button" class="btn btn-outline" data-workflow="${w.name}">${icon('check-circle', { size: 18 })}${escapeHtml(w.button)}</button>
  <ol class="tools-steps" id="wf-${w.name}" aria-live="polite"></ol>
</div>`,
  ).join('')
  return card({
    title: 'Checks',
    subtitle: 'Make sure the data looks right and the website’s forms still work.',
    className: 'col-12',
    body: `<section class="tools-block">
  <div class="tools-block-head">
    <div>
      <h4 class="tools-block-title">Data check</h4>
      <p class="tools-block-sub">Counts what the dashboard has stored and points out gaps, like a source with no data yet.</p>
    </div>
    <button type="button" class="btn btn-outline" id="audit-run">${icon('chart', { size: 18 })}Run data check</button>
  </div>
  <div id="audit-out" aria-live="polite"></div>
</section>
<section class="tools-block">
  <h4 class="tools-block-title">Website tests</h4>
  <p class="tools-block-sub">Each test runs the real thing end to end, then cleans up after itself.</p>
  <div class="tools-tests">${tests}</div>
</section>`,
  })
}

function auditHtml(audit) {
  const c = audit.counts ?? {}
  const stats = [
    ['Orders', c.orders],
    ['Days of traffic', c.trafficDays],
    ['Ad spend rows', c.adSpendRows],
    ['Product view rows', c.productViewRows],
    ['Expenses', c.expenses],
    ['Cash months', c.cashRows],
    ['Search keywords', c.keywords],
  ]
  const holes = audit.holes ?? []
  const checked = audit.generatedAt
    ? new Date(audit.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
  return `<div class="tools-stats">${stats
    .map(([label, v]) => `<div class="tools-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(num(v))}</strong></div>`)
    .join('')}</div>
${
  holes.length
    ? `<ul class="tools-audit">${holes
        .map((h) => {
          const [text, tone] = SEVERITY[h.severity] ?? ['Note', 'neutral']
          return `<li>${badge(text, tone)}<span><strong>${escapeHtml(h.area)}</strong>${escapeHtml(h.detail)}</span></li>`
        })
        .join('')}</ul>`
    : emptyState('No gaps found.')
}
${checked ? `<p class="tools-meta">Checked ${escapeHtml(checked)}</p>` : ''}`
}

function stepsHtml(steps) {
  return (steps ?? [])
    .map(
      (s) =>
        `<li class="${s.ok ? 'ok' : 'fail'}">${icon(s.ok ? 'check-circle' : 'alert', { size: 18 })}<span><strong>${s.ok ? 'Passed' : 'Failed'}:</strong> ${escapeHtml(s.name)}. ${escapeHtml(s.detail ?? '')}</span></li>`,
    )
    .join('')
}

// ---------- Render ----------

export async function render(root, ctx) {
  injectStyles()
  const soft = (promise) =>
    promise
      .then((r) => r.data)
      .catch((err) => {
        if (err?.status === 401 || err?.status === 403) throw err
        return { error: err?.message || 'Couldn’t load this.' }
      })
  const [qr, manual, health] = await Promise.all([
    soft(ctx.api(`/review-qrs?target=${encodeURIComponent(qrTarget)}`)),
    soft(ctx.api('/import/manual-orders')),
    soft(ctx.api('/health')),
  ])

  root.innerHTML = [qrCard(qr), addDataCard(manual), workbookCard(), connectionsCard(health), checksCard()].join('')

  const $ = (sel) => root.querySelector(sel)

  async function reloadManual() {
    const fresh = await soft(ctx.api('/import/manual-orders'))
    const list = $('#manual-orders')
    const summary = $('#manual-summary')
    if (list) list.innerHTML = manualTable(fresh)
    if (summary) summary.textContent = manualSummary(fresh)
  }

  // --- Review QR codes ---
  $('#qr-target')?.addEventListener('change', async (e) => {
    qrTarget = e.currentTarget.value === 'live' ? 'live' : 'pages'
    const meta = $('#qr-meta')
    setStatus(meta, 'Checking products…')
    const fresh = await soft(ctx.api(`/review-qrs?target=${encodeURIComponent(qrTarget)}`))
    setStatus(meta, qrMetaText(fresh), fresh?.error ? 'error' : '')
  })
  $('#qr-download')?.addEventListener('click', (e) => {
    const btn = e.currentTarget
    const status = $('#qr-status')
    const target = qrTarget
    busy(btn, async () => {
      setStatus(status, 'Building the PDF. This can take a few seconds…')
      try {
        const fallback = target === 'live' ? 'sunday-rolls-review-qrs-live.pdf' : 'sunday-rolls-review-qrs-pages.pdf'
        const name = await download(ctx, `/review-qrs.pdf?target=${encodeURIComponent(target)}`, fallback, 'Couldn’t build the QR code PDF.')
        setStatus(status, `Downloaded ${name}`, 'ok')
      } catch (err) {
        setStatus(status, err.message || 'Couldn’t build the QR code PDF.', 'error')
      }
    })
  })

  // --- Add one sale ---
  $('#sale-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const status = $('#sale-status')
    busy(form.querySelector('button[type="submit"]'), async () => {
      setStatus(status, 'Saving…')
      try {
        const { data } = await ctx.api('/import/revenue', {
          method: 'POST',
          body: JSON.stringify({
            date: fd.get('date'),
            channel: fd.get('channel'),
            revenue: Number(fd.get('revenue')),
            fees: Number(fd.get('fees') || 0),
            shipping: Number(fd.get('shipping') || 0),
            marketing: Number(fd.get('marketing') || 0),
            product: String(fd.get('product') || '').trim() || undefined,
            externalId: String(fd.get('externalId') || '').trim() || undefined,
          }),
        })
        setStatus(status, `Saved ${plural(data?.rows ?? 1, 'sale')}. It’s on the Money page now.`, 'ok')
        form.reset()
        await reloadManual()
      } catch (err) {
        setStatus(status, err.message || 'Couldn’t save the sale.', 'error')
      }
    })
  })

  // --- CSV templates and uploads ---
  root.addEventListener('click', (e) => {
    const tpl = e.target.closest('[data-template]')
    if (tpl) {
      const kind = tpl.dataset.template
      const status = $('#csv-status')
      busy(tpl, async () => {
        try {
          const name = await download(ctx, `/import/templates/${kind}`, `sunday-rolls-${kind}-template.csv`, 'Couldn’t download the template.')
          setStatus(status, `Downloaded ${name}. Fill it in, then use Upload CSV.`, 'ok')
        } catch (err) {
          setStatus(status, err.message || 'Couldn’t download the template.', 'error')
        }
      })
      return
    }
    const up = e.target.closest('[data-upload-csv]')
    if (up) root.querySelector(`[data-csv-input="${up.dataset.uploadCsv}"]`)?.click()
  })
  root.addEventListener('change', (e) => {
    const input = e.target.closest('[data-csv-input]')
    if (!input) return
    const meta = CSV_KINDS.find((k) => k.kind === input.dataset.csvInput)
    const file = input.files?.[0]
    if (!meta || !file) return
    const status = $('#csv-status')
    busy(root.querySelector(`[data-upload-csv="${meta.kind}"]`), async () => {
      setStatus(status, `Uploading ${file.name}…`)
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await rawFetch(ctx, meta.endpoint, { method: 'POST', body })
        const json = await readJson(res, `${meta.title} upload failed.`)
        const saved = meta.kind === 'customers'
          ? `${plural(json.data?.rows ?? 0, 'order')} from ${plural(json.data?.customers ?? 0, 'customer')}`
          : plural(json.data?.rows ?? 0, 'row')
        setStatus(status, `${meta.title}: saved ${saved} from ${file.name}${warningText(json.data?.warnings)}`, 'ok')
        if (meta.kind === 'revenue') await reloadManual()
      } catch (err) {
        setStatus(status, err.message || `${meta.title} upload failed.`, 'error')
      } finally {
        input.value = ''
      }
    })
  })

  // --- Sales Tracker upload ---
  $('#tracker-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const status = $('#tracker-status')
    const file = form.elements.file?.files?.[0]
    if (!file) {
      setStatus(status, 'Choose the Sales Tracker .xlsx file first.', 'error')
      return
    }
    busy(form.querySelector('button[type="submit"]'), async () => {
      setStatus(status, `Uploading ${file.name}…`)
      try {
        const body = new FormData()
        body.append('file', file)
        const start = form.elements.start.value
        const end = form.elements.end.value
        if (start) body.append('start', start)
        if (end) body.append('end', end)
        const res = await rawFetch(ctx, '/sync/sales-tracker/upload', { method: 'POST', body })
        const json = await readJson(res, 'Upload failed.')
        const d = json.data ?? {}
        setStatus(
          status,
          `Imported ${plural(d.orders ?? 0, 'order')}, ${plural(d.expenses ?? 0, 'expense')} and ${plural(d.cashRows ?? 0, 'cash row')}${warningText(d.warnings)}`,
          'ok',
        )
        form.reset()
      } catch (err) {
        setStatus(status, err.message || 'Upload failed.', 'error')
      }
    })
  })

  // --- Workbook ---
  $('#wb-download')?.addEventListener('click', (e) => {
    const status = $('#wb-status')
    busy(e.currentTarget, async () => {
      setStatus(status, 'Building the workbook…')
      try {
        const stamp = new Date().toISOString().slice(0, 10)
        const name = await download(ctx, '/workbook', `sunday-rolls-dashboard-${stamp}.xlsx`, 'Couldn’t download the workbook.')
        setStatus(status, `Downloaded ${name}. Edit the sheets, then upload it here.`, 'ok')
      } catch (err) {
        setStatus(status, err.message || 'Couldn’t download the workbook.', 'error')
      }
    })
  })
  $('#wb-upload-btn')?.addEventListener('click', () => $('#wb-upload')?.click())
  $('#wb-upload')?.addEventListener('change', (e) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    const status = $('#wb-status')
    if (!file) return
    busy($('#wb-upload-btn'), async () => {
      setStatus(status, `Uploading ${file.name}…`)
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await rawFetch(ctx, '/workbook', { method: 'POST', body })
        const json = await readJson(res, 'Workbook upload failed.')
        const d = json.data ?? {}
        setStatus(
          status,
          `Workbook saved: ${plural(d.upsertedOrders ?? 0, 'sale')}, ${plural(d.expenses ?? 0, 'expense')}, ${plural(d.cash ?? 0, 'cash month')}${warningText(d.warnings)}`,
          'ok',
        )
        await reloadManual()
      } catch (err) {
        setStatus(status, err.message || 'Workbook upload failed.', 'error')
      } finally {
        input.value = ''
      }
    })
  })

  // --- Data check ---
  $('#audit-run')?.addEventListener('click', (e) => {
    const out = $('#audit-out')
    busy(e.currentTarget, async () => {
      out.innerHTML = '<p class="tools-status">Checking…</p>'
      try {
        const { data } = await ctx.api('/data-audit')
        out.innerHTML = auditHtml(data ?? {})
      } catch (err) {
        out.innerHTML = `<p class="tools-status" data-tone="error">${escapeHtml(err.message || 'The data check failed.')}</p>`
      }
    })
  })

  // --- Website tests ---
  for (const btn of root.querySelectorAll('[data-workflow]')) {
    btn.addEventListener('click', () => {
      const name = btn.dataset.workflow
      const list = $(`#wf-${name}`)
      busy(btn, async () => {
        list.innerHTML = '<li>Running…</li>'
        try {
          const body = await ctx.api(`/workflows/${name}`, { method: 'POST', body: '{}' })
          list.innerHTML = stepsHtml(body.data?.steps) || '<li>No steps reported.</li>'
        } catch (err) {
          list.innerHTML = stepsHtml([{ ok: false, name: 'Run', detail: err.message || 'Request failed' }])
        }
      })
    })
  }
}
