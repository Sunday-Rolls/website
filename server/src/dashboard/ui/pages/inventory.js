// Inventory: on hand per SKU = received (Inventory In tab) − units sold on every platform since the count.
// Not range-based (ownRange): it always shows stock right now. Math lives in server/src/analytics/inventory.ts.
import { badge, card, emptyState, escapeHtml, kpiCard, num } from '../lib/ui.js'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'headcover', label: 'Headcovers' },
  { value: 'towel', label: 'Towels' },
  { value: 'attention', label: 'Low / out' },
  { value: 'mismatch', label: 'Listings to fix' },
]

const STATUS = {
  ok: ['In stock', 'success'],
  low: ['Low stock', 'warning'],
  out: ['Out of stock', 'danger'],
  'not-counted': ['Not counted', 'neutral'],
}

// Survives re-renders so the chosen filter and search stick after a refresh.
const view = { filter: 'all', query: '' }

function injectStyles() {
  if (document.getElementById('style-inventory')) return
  const style = document.createElement('style')
  style.id = 'style-inventory'
  style.textContent = `
.inv-note { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin: 0; color: var(--muted); font-size: 14px; }
.inv-note a { color: var(--accent); }
.inv-callout { margin: 0; padding: 12px 16px; border-radius: 12px; background: var(--warn-bg); color: var(--warn); font-size: 14px; }
.inv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.inv-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.inv-toolbar .segmented { flex-wrap: wrap; height: auto; }
.inv-search input { font: inherit; font-size: 14px; padding: 10px 12px; min-height: 44px; min-width: 220px; box-sizing: border-box;
  border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--ink); }
.inv-search input:focus-visible { outline: none; box-shadow: var(--ring); }
.inv-table .table { min-width: 960px; }
.inv-table .table td { white-space: nowrap; }
.inv-table .table td:first-child { white-space: normal; min-width: 190px; }
.inv-table th.grp { text-align: center; padding-bottom: 0; border-bottom: 0; }
.inv-sku { font-size: 12px; color: var(--muted); font-family: ui-monospace, Menlo, monospace; }
.inv-onhand { font-weight: 600; }
.inv-flag { display: inline-block; padding: 2px 8px; border-radius: 6px; background: var(--down-bg); color: var(--down); font-weight: 600; }
.inv-muted { color: var(--faint); }
.inv-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13px; color: var(--muted); margin-top: 12px; }
.inv-list { list-style: none; margin: 0; padding: 0; }
.inv-list li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border-soft); font-size: 14px; }
.inv-list li:last-child { border-bottom: 0; }
.inv-when { font-size: 12px; color: var(--muted); }
.inv-qty { font-weight: 600; white-space: nowrap; }
.inv-qty.in { color: var(--up); }
.inv-qty.out { color: var(--down); }
.inv-how { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 640px) { .inv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .inv-search, .inv-search input { width: 100%; min-width: 0; } }
`
  document.head.appendChild(style)
}

const fmtDay = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtWhen = (iso) => {
  if (!iso) return 'never'
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function listedCell(qty, row) {
  if (qty == null) return '<span class="inv-muted">—</span>'
  if (row.counted && qty !== Math.max(0, row.onHand)) return `<span class="inv-flag" title="Listed ${qty}, on hand ${row.onHand}">${num(qty)}</span>`
  return num(qty)
}

function matches(row) {
  const q = view.query.trim().toLowerCase()
  if (q && !`${row.sku} ${row.product} ${row.style}`.toLowerCase().includes(q)) return false
  const category = (row.category || '').toLowerCase()
  if (view.filter === 'headcover') return category === 'headcover'
  if (view.filter === 'towel') return category === 'towel'
  if (view.filter === 'attention') return row.status === 'low' || row.status === 'out'
  if (view.filter === 'mismatch') return row.mismatch
  return true
}

function tableHtml(rows) {
  const shown = rows.filter(matches)
  if (!shown.length) return emptyState('No SKUs match this filter.')
  const body = shown
    .map((r) => {
      const [label, tone] = STATUS[r.status] ?? STATUS['not-counted']
      return `<tr>
  <td><div>${escapeHtml(r.product)}</div><div class="inv-sku">${escapeHtml(r.sku)}</div></td>
  <td>${escapeHtml(r.style || '—')}</td>
  <td class="align-right">${r.counted ? num(r.received) : '—'}</td>
  <td class="align-right" title="Shopify ${r.soldBy.shopify} · Etsy ${r.soldBy.etsy} · eBay ${r.soldBy.ebay} · In person ${r.soldBy.other}">${r.counted ? num(r.sold) : '—'}</td>
  <td class="align-right inv-onhand">${r.counted ? num(r.onHand) : '—'}</td>
  <td class="align-right">${r.weeksLeft == null ? '—' : num(r.weeksLeft)}</td>
  <td class="align-right">${listedCell(r.listed.shopify, r)}</td>
  <td class="align-right">${listedCell(r.listed.etsy, r)}</td>
  <td class="align-right">${listedCell(r.listed.ebay, r)}</td>
  <td>${badge(label, tone)}</td>
</tr>`
    })
    .join('')
  return `<div class="table-wrap"><table class="table">
<thead>
  <tr><th colspan="6"></th><th class="grp" colspan="3">Listed quantity</th><th></th></tr>
  <tr><th>Product</th><th>Style</th><th class="align-right">Received</th><th class="align-right">Sold</th>
  <th class="align-right">On hand</th><th class="align-right">Weeks left</th>
  <th class="align-right">Shopify</th><th class="align-right">Etsy</th><th class="align-right">eBay</th><th>Status</th></tr>
</thead>
<tbody>${body}</tbody></table></div>`
}

function movementsHtml(moves) {
  if (!moves.length) return emptyState('No stock movements since the count yet.')
  return `<ul class="inv-list">${moves
    .map(
      (m) => `<li><div><div>${escapeHtml(m.product)} · ${escapeHtml(m.source)}</div><div class="inv-when">${escapeHtml(fmtDay(m.date))} · ${escapeHtml(m.ref)}</div></div>
<span class="inv-qty ${m.qty >= 0 ? 'in' : 'out'}">${m.qty >= 0 ? '+' : '−'}${num(Math.abs(m.qty))}</span></li>`,
    )
    .join('')}</ul>`
}

const CHANNEL = { shopify: 'Shopify', etsy: 'Etsy', ebay: 'eBay', other: 'In person' }
const FIX = { shopify: 'Add the SKU to the product in Shopify', etsy: 'Add the SKU to the Etsy listing', ebay: 'Pick a SKU on the eBay tab', other: 'Pick a SKU on the Other tab' }

function unmatchedHtml(list) {
  if (!list.length) return emptyState('Every sale since the count has a SKU.')
  return `<ul class="inv-list">${list
    .slice(0, 12)
    .map(
      (u) => `<li><div><div>${escapeHtml(CHANNEL[u.channel] ?? u.channel)} ${escapeHtml(u.ref)}${u.product ? ` · ${escapeHtml(u.product)}` : ''}</div>
<div class="inv-when">${escapeHtml(fmtDay(u.date))} · ${u.sku ? `unknown SKU "${escapeHtml(u.sku)}"` : 'no SKU'} · ${escapeHtml(FIX[u.channel] ?? '')}</div></div></li>`,
    )
    .join('')}</ul>${list.length > 12 ? `<p class="inv-when">and ${list.length - 12} more</p>` : ''}`
}

export async function render(root, ctx) {
  injectStyles()
  const { data } = await ctx.api('/inventory')
  const k = data.kpis
  const s = data.sources

  const note = `<p class="inv-note col-12">
  <span>${data.countDate ? `Counted ${escapeHtml(fmtDay(data.countDate))}` : 'No count yet'}</span>
  <span>Sheet synced ${escapeHtml(fmtWhen(s.sheet))} · Etsy ${escapeHtml(fmtWhen(s.etsy))} · Shopify ${escapeHtml(fmtWhen(s.shopify))}</span>
  ${data.sheetUrl && /^https:\/\//.test(data.sheetUrl) ? `<a href="${escapeHtml(data.sheetUrl)}" target="_blank" rel="noopener noreferrer">Open the Sales Tracker</a>` : ''}
</p>`

  const callouts = []
  if (!data.ready) {
    callouts.push('Enter a date and quantity for each SKU on the Inventory In tab of the Sales Tracker, then press Refresh. On-hand counts start from that count.')
  } else if (k.notCounted) {
    callouts.push(`${k.notCounted} SKU${k.notCounted === 1 ? ' has' : 's have'} no starting count yet, so ${k.notCounted === 1 ? 'it shows' : 'they show'} “Not counted”.`)
  }
  for (const w of data.warnings ?? []) callouts.push(w)

  root.innerHTML = [
    note,
    callouts.length ? `<div class="col-12" style="display: flex; flex-direction: column; gap: 8px">${callouts.map((c) => `<p class="inv-callout">${escapeHtml(c)}</p>`).join('')}</div>` : '',
    `<div class="inv-kpis col-12">
      ${kpiCard({ icon: 'package', label: 'Headcovers on hand', value: num(k.headcovers) })}
      ${kpiCard({ icon: 'package', label: 'Towels on hand', value: num(k.towels) })}
      ${kpiCard({ icon: 'alert', label: 'Low stock', value: num(k.low), hint: `${data.lowStock} or fewer left` })}
      ${kpiCard({ icon: 'x', label: 'Out of stock', value: num(k.out) })}
      ${kpiCard({ icon: 'tool', label: 'Listings to fix', value: num(k.mismatched), hint: 'Listed quantity ≠ on hand' })}
    </div>`,
    card({
      title: 'Stock by SKU',
      subtitle: 'On hand = starting count + shipments − units sold on every platform since the count.',
      className: 'col-12 inv-table',
      body: `<div class="inv-toolbar">
  <div class="segmented" role="group" aria-label="Filter SKUs">${FILTERS.map(
    (f) => `<button type="button" data-value="${f.value}" class="${f.value === view.filter ? 'active' : ''}" aria-pressed="${f.value === view.filter}">${escapeHtml(f.label)}</button>`,
  ).join('')}</div>
  <label class="inv-search"><span class="vh">Search SKU or product</span><input type="search" placeholder="Search SKU or product" value="${escapeHtml(view.query)}"></label>
</div>
<div class="inv-table-body">${tableHtml(data.rows)}</div>
<div class="inv-legend"><span><span class="inv-flag">37</span> listed quantity doesn’t match on hand</span><span>— not listed, or not connected (eBay)</span><span>Weeks left uses the last 4 weeks of sales</span></div>`,
    }),
    card({ title: 'Recent stock movements', className: 'col-4', body: movementsHtml(data.movements) }),
    card({ title: 'Sales without a SKU', subtitle: 'Not subtracted until they’re matched to a product.', className: 'col-4', body: unmatchedHtml(data.unmatched) }),
    card({
      title: 'How the count works',
      className: 'col-4',
      body: `<ol class="inv-how">
  <li>Starting counts and new shipments are rows on the Inventory In tab.</li>
  <li>Shopify and Etsy sales are subtracted automatically by SKU.</li>
  <li>eBay and in-person sales are subtracted from the SKU column on those tabs.</li>
</ol>`,
    }),
  ].join('')

  const body = root.querySelector('.inv-table-body')
  const redraw = () => {
    body.innerHTML = tableHtml(data.rows)
  }
  root.querySelector('.inv-toolbar .segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]')
    if (!btn) return
    view.filter = btn.dataset.value
    for (const b of btn.parentElement.querySelectorAll('button')) {
      const on = b === btn
      b.classList.toggle('active', on)
      b.setAttribute('aria-pressed', String(on))
    }
    redraw()
  })
  root.querySelector('.inv-search input').addEventListener('input', (e) => {
    view.query = e.target.value
    redraw()
  })
}
