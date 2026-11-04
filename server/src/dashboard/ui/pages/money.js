// Money: profit and loss for a chosen month and the year to date, revenue by channel, unit
// economics, monthly revenue by channel and the cash forecast. Data: GET /api/pnl?year=&month=.
// This page has its own year/month picker; the global date range does not apply here.
import { areaChart, barChart } from '../lib/charts.js'
import { card, emptyState, escapeHtml, icon, kpiCard, money, moneyExact, pct, segmented } from '../lib/ui.js'

const STORE_TZ = 'America/Chicago'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const CHANNELS = [
  { key: 'etsy', label: 'Etsy' },
  { key: 'squarespace', label: 'Squarespace' },
  { key: 'shopify', label: 'Website (Shopify)' },
  { key: 'ebay', label: 'eBay' },
  { key: 'other', label: 'In person & other' },
]

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

function storeToday() {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number)
  return { year: y, month: m }
}

// Kept between renders so Refresh and navigation keep the chosen month.
let selected = null

function currentSelection() {
  if (!selected) selected = storeToday()
  return selected
}

const monthKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`

function monthLabel(key, { short = false } = {}) {
  const [y, m] = key.split('-').map(Number)
  const name = MONTHS[m - 1] ?? key
  return short ? `${name.slice(0, 3)} ’${String(y).slice(2)}` : `${name} ${y}`
}

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

function titleCase(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

function injectStyles() {
  if (document.getElementById('style-money')) return
  const style = document.createElement('style')
  style.id = 'style-money'
  style.textContent = `
.money-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.money-picker select {
  height: 40px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--card); color: var(--ink); font-size: 14px; box-shadow: var(--shadow-xs);
}
.money-picker select:focus { outline: none; border-color: var(--brand-300); box-shadow: var(--ring); }
.money-note { font-size: 14px; line-height: 22px; color: var(--muted); }
.money-note a { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 500; white-space: nowrap; }
.money-note a:hover { text-decoration: underline; }
.money-statement tr.is-section td {
  padding-top: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--faint);
}
.money-statement tbody tr.is-section:first-child td { padding-top: 12px; }
.money-statement tr.is-total td { color: var(--ink); font-weight: 600; background: var(--surface-2); }
.money-statement tr.is-total td:first-child { border-radius: 8px 0 0 8px; padding-left: 12px; }
.money-statement tr.is-total td:last-child { border-radius: 0 8px 8px 0; padding-right: 12px; }
.money-statement td:first-child { font-weight: 400; }
.money-statement .neg { color: var(--down); }
.money-statement tr.is-total .neg { color: var(--down); }
.money-units { list-style: none; margin: 0; padding: 0; }
.money-units li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-soft); }
.money-units li:last-child { border-bottom: 0; }
.money-units .u-name { font-size: 14px; font-weight: 500; color: var(--ink); }
.money-units .u-sub { display: block; font-size: 12px; color: var(--muted); }
.money-units .u-vals { text-align: right; font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.money-units .u-vals strong { display: block; color: var(--ink); font-weight: 600; }
.money-table-note { margin-top: 16px; font-size: 12px; color: var(--muted); }
.money-cash-table { margin-top: 16px; }
[data-page="money"] .table td { white-space: nowrap; }
`
  document.head.appendChild(style)
}

// ---------- Pieces ----------

function picker(sel) {
  const today = storeToday()
  const years = []
  for (let y = today.year; y >= today.year - 3; y -= 1) years.push(y)
  if (!years.includes(sel.year)) years.push(sel.year)
  const yearOpts = years
    .sort((a, b) => b - a)
    .map((y) => `<option value="${y}"${y === sel.year ? ' selected' : ''}>${y}</option>`)
    .join('')
  const monthOpts = MONTHS.map((name, i) => {
    const m = i + 1
    const future = sel.year === today.year && m > today.month
    return `<option value="${m}"${m === sel.month ? ' selected' : ''}${future ? ' disabled' : ''}>${name}</option>`
  }).join('')
  return `<div class="money-picker">
  <select id="money-month" aria-label="Month">${monthOpts}</select>
  <select id="money-year" aria-label="Year">${yearOpts}</select>
</div>`
}

function statementRow(rows, label) {
  return rows.find((r) => r.label === label)
}

function kpis(data, monthName) {
  const k = data.kpis ?? {}
  const rows = data.incomeStatement ?? []
  const revenue = statementRow(rows, 'Total revenue')
  const gross = statementRow(rows, 'Gross profit')
  const opex = statementRow(rows, 'Total operating expenses')
  const net = statementRow(rows, 'Net income')
  const lastYear = data.year - 1
  const cashAsOf = k.cashAsOf
  const through = k.comparedThrough ? `${lastYear} through ${dayLabel(k.comparedThrough)}` : `${lastYear}`
  return [
    kpiCard({
      icon: 'coins',
      label: `Revenue, ${data.year} so far`,
      value: money(k.revenueYtd?.value),
      delta: k.revenueYtd,
      className: 'col-3',
      hint: [
        revenue ? `${monthName}: ${money(revenue.monthAmount)}` : '',
        isNum(k.revenueYtd?.previous) && k.revenueYtd.previous > 0 ? `${money(k.revenueYtd.previous)} in ${through}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    kpiCard({
      icon: 'trend',
      label: 'Gross margin, year to date',
      value: pct(k.grossMarginYtd?.value),
      delta: k.grossMarginYtd,
      deltaFormat: 'pts',
      className: 'col-3',
      hint: gross
        ? `${money(gross.ytdAmount)} gross profit · ${monthName}: ${money(gross.monthAmount)}${k.cogsEstimated ? ' · product cost estimated at $15/unit' : ''}`
        : 'Revenue minus the cost of making the product',
    }),
    kpiCard({
      icon: 'wallet',
      label: 'Net profit, year to date',
      value: money(k.netIncomeYtd?.value),
      delta: k.netIncomeYtd,
      className: 'col-3',
      hint: [
        opex ? `After ${money(Math.abs(opex.ytdAmount))} of operating expenses` : '',
        net ? `${monthName}: ${money(net.monthAmount)}` : '',
        isNum(k.netIncomeYtd?.previous) ? `${money(k.netIncomeYtd.previous)} in ${through}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    kpiCard({
      icon: 'receipt',
      label: 'Cash on hand',
      value: money(k.cashOnHand),
      className: 'col-3',
      hint: cashAsOf ? `Cash forecast balance at the end of ${dayLabel(cashAsOf)}` : 'No completed month in the cash forecast yet',
    }),
  ].join('')
}

function amountCell(n) {
  if (!isNum(n)) return '—'
  return n < 0 ? `<span class="neg">${escapeHtml(moneyExact(n))}</span>` : escapeHtml(moneyExact(n))
}

function statementTable(data, monthName) {
  const rows = data.incomeStatement ?? []
  if (!rows.length) return emptyState('No income statement for this year yet.')
  let lastSection = ''
  const body = []
  for (const row of rows) {
    if (row.section !== lastSection) {
      body.push(`<tr class="is-section"><td colspan="5">${escapeHtml(titleCase(row.section))}</td></tr>`)
      lastSection = row.section
    }
    body.push(`<tr class="${row.emphasize ? 'is-total' : ''}">
  <td>${escapeHtml(row.label)}</td>
  <td class="align-right">${data.month ? amountCell(row.monthAmount) : '—'}</td>
  <td class="align-right">${row.monthPct == null || !data.month ? '—' : pct(row.monthPct)}</td>
  <td class="align-right">${amountCell(row.ytdAmount)}</td>
  <td class="align-right">${row.ytdPct == null ? '—' : pct(row.ytdPct)}</td>
</tr>`)
  }
  return `<div class="table-wrap"><table class="table money-statement">
  <thead><tr>
    <th>Line item</th>
    <th class="align-right">${escapeHtml(monthName)}</th>
    <th class="align-right">% of revenue</th>
    <th class="align-right">${escapeHtml(String(data.year))} to date</th>
    <th class="align-right">% of revenue</th>
  </tr></thead>
  <tbody>${body.join('')}</tbody>
</table></div>
<p class="money-table-note">Cost of goods and operating expenses come from the Expenses sheet in the dashboard workbook.</p>`
}

function channelTable(data) {
  const rows = data.revenueByChannel ?? []
  if (!rows.length) return emptyState(`No sales recorded in ${data.year} yet.`)
  const body = rows
    .map(
      (c) => `<tr>
  <td>${escapeHtml(c.channel)}</td>
  <td class="align-right">${escapeHtml(money(c.revenue))}</td>
  <td class="align-right"><span class="share-bar"><span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, c.share ?? 0)).toFixed(1)}%"></span></span>${escapeHtml(pct(c.share))}</span></td>
  <td class="align-right">${escapeHtml(money(c.revenuePerUnit))}</td>
</tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="table">
  <thead><tr><th>Channel</th><th class="align-right">Revenue</th><th class="align-right">Share</th><th class="align-right">Per unit</th></tr></thead>
  <tbody>${body}</tbody>
</table></div>`
}

function unitList(data) {
  const rows = data.revenueByChannel ?? []
  if (!rows.length) return emptyState('No unit sales yet.')
  return `<ul class="money-units">${rows
    .map((c) => {
      const keep = c.revenuePerUnit > 0 ? (c.profitPerUnit / c.revenuePerUnit) * 100 : null
      return `<li>
  <span><span class="u-name">${escapeHtml(c.channel)}</span><span class="u-sub">${escapeHtml(money(c.revenuePerUnit))} average sale</span></span>
  <span class="u-vals"><strong>${escapeHtml(moneyExact(c.profitPerUnit))} profit</strong>${keep == null ? '' : `${escapeHtml(pct(keep, 0))} kept`}</span>
</li>`
    })
    .join('')}</ul>`
}

function monthlyTable(months, channels) {
  const head = channels.map((c) => `<th class="align-right">${escapeHtml(c.label)}</th>`).join('')
  const body = months
    .map(
      (m) => `<tr><td>${escapeHtml(monthLabel(m.month))}</td>${channels
        .map((c) => `<td class="align-right">${escapeHtml(money(m[c.key]))}</td>`)
        .join('')}<td class="align-right"><strong>${escapeHtml(money(m.total))}</strong></td></tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="table">
  <thead><tr><th>Month</th>${head}<th class="align-right">Total</th></tr></thead>
  <tbody>${body}</tbody>
</table></div>`
}

function cashTable(rows) {
  const cols = [
    ['beginningBalance', 'Beginning'],
    ['collections', 'Collections'],
    ['freightAndFees', 'Freight & fees'],
    ['marketing', 'Marketing'],
    ['website', 'Website'],
    ['manufacturing', 'Manufacturing'],
    ['endingBalance', 'Ending'],
  ]
  const body = rows
    .map(
      (r) => `<tr><td>${escapeHtml(dayLabel(r.monthEnd))}</td>${cols
        .map(([key]) => `<td class="align-right">${key === 'endingBalance' ? `<strong>${escapeHtml(moneyExact(r[key]))}</strong>` : escapeHtml(moneyExact(r[key]))}</td>`)
        .join('')}</tr>`,
    )
    .join('')
  return `<div class="table-wrap money-cash-table"><table class="table">
  <thead><tr><th>Month ending</th>${cols.map(([, label]) => `<th class="align-right">${escapeHtml(label)}</th>`).join('')}</tr></thead>
  <tbody>${body}</tbody>
</table></div>`
}

function downloadStatementCsv(data) {
  const lines = [['section', 'label', 'month', 'month_pct', 'ytd', 'ytd_pct']]
  for (const row of data.incomeStatement ?? []) {
    lines.push([row.section, row.label, row.monthAmount, row.monthPct, row.ytdAmount, row.ytdPct])
  }
  const csv = lines.map((r) => r.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `sunday-rolls-pnl-${data.month || data.year}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- Render ----------

export async function render(root, ctx) {
  injectStyles()
  const sel = currentSelection()
  const key = monthKey(sel)
  const { data } = await ctx.api(`/pnl?year=${sel.year}&month=${encodeURIComponent(key)}`)
  const monthName = monthLabel(data.month || key)
  const months = data.monthlyRevenueByChannel ?? []
  const activeChannels = CHANNELS.filter((c) => months.some((m) => (m[c.key] ?? 0) !== 0))
  const cash = data.cashForecast ?? []

  root.innerHTML = [
    card({
      title: 'Profit and loss',
      subtitle: `${monthName} and ${data.year} to date. Pick the month here: the date range at the top doesn’t apply to this page.`,
      actions: picker(sel),
      className: 'col-12',
      body: `<p class="money-note">Website sales sync from Shopify on their own. Etsy, eBay and in-person sales, expenses and month-end cash come from the dashboard workbook. <a href="#/tools">Add an expense or cash entry ${icon('arrow-right', { size: 16 })} Tools</a></p>`,
    }),
    kpis(data, monthName),
    card({
      title: 'Income statement',
      subtitle: `${monthName} next to ${data.year} so far, with each line as a share of revenue`,
      actions: (data.incomeStatement ?? []).length
        ? `<button type="button" class="btn btn-outline" id="money-statement-csv">${icon('download', { size: 18 })}Download CSV</button>`
        : '',
      className: 'col-12',
      body: statementTable(data, monthName),
    }),
    card({
      title: 'Revenue by channel',
      subtitle: `Where ${data.year}’s sales came from, year to date`,
      className: 'col-7',
      body: channelTable(data),
    }),
    card({
      title: 'Where a headcover sale goes',
      subtitle: 'Average sale and profit per unit, by channel',
      className: 'col-5',
      body: unitList(data),
    }),
    card({
      title: 'Monthly revenue by channel',
      subtitle: `Each month of ${data.year}, split by sales channel`,
      actions: months.length
        ? segmented({
            name: 'monthly-view',
            options: [
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ],
            value: 'chart',
          })
        : '',
      className: 'col-12',
      body: months.length
        ? `<div id="money-monthly-chart" class="chart-box"></div><div id="money-monthly-table" hidden>${monthlyTable(months, activeChannels.length ? activeChannels : CHANNELS)}</div>`
        : emptyState(`No monthly sales in ${data.year} yet.`),
    }),
    card({
      title: 'Cash forecast',
      subtitle: 'Month-end cash balance. Edit it in the Cash sheet of the dashboard workbook.',
      className: 'col-12',
      body: cash.length ? `<div id="money-cash-chart" class="chart-box"></div>${cashTable(cash)}` : emptyState('No cash forecast yet. Add month-end cash on the Tools page.'),
    }),
  ].join('')

  // Year / month picker: remember the choice, then re-render the page.
  const onPick = () => {
    const year = Number(root.querySelector('#money-year').value)
    let month = Number(root.querySelector('#money-month').value)
    const today = storeToday()
    if (year === today.year && month > today.month) month = today.month
    selected = { year, month }
    ctx.refresh()
  }
  root.querySelector('#money-year')?.addEventListener('change', onPick)
  root.querySelector('#money-month')?.addEventListener('change', onPick)

  root.querySelector('#money-statement-csv')?.addEventListener('click', () => downloadStatementCsv(data))

  if (months.length) {
    const chartEl = root.querySelector('#money-monthly-chart')
    const tableEl = root.querySelector('#money-monthly-table')
    const series = (activeChannels.length ? activeChannels : CHANNELS).map((c) => ({
      name: c.label,
      data: months.map((m) => Math.round((m[c.key] ?? 0) * 100) / 100),
    }))
    barChart(chartEl, {
      series,
      categories: months.map((m) => monthLabel(m.month, { short: true })),
      stacked: true,
      format: 'money',
    })
    root.querySelector('.segmented[data-name="monthly-view"]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]')
      if (!btn || btn.classList.contains('active')) return
      for (const b of btn.parentElement.children) {
        const on = b === btn
        b.classList.toggle('active', on)
        b.setAttribute('aria-pressed', String(on))
      }
      const table = btn.dataset.value === 'table'
      chartEl.hidden = table
      tableEl.hidden = !table
    })
  }

  if (cash.length) {
    areaChart(root.querySelector('#money-cash-chart'), {
      series: [{ name: 'Cash at month end', data: cash.map((r) => Math.round((r.endingBalance ?? 0) * 100) / 100) }],
      categories: cash.map((r) => monthLabel(r.monthEnd.slice(0, 7), { short: true })),
      format: 'money',
    })
  }
}
