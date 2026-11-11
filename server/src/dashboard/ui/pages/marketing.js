// Marketing: ad spend, MER, new-customer cost, spend vs revenue, campaigns, Google Ads (API), traffic sources, search keywords.
import { areaChart, barChart } from '../lib/charts.js'
import { badge, card, emptyState, escapeHtml, icon, kpiCard, money, moneyExact, notConnected, num, pct, table } from '../lib/ui.js'

// Platform ROAS needed to cover product cost (same threshold the old ROAS page used).
const BREAK_EVEN_ROAS = 1.25

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

const STYLE = `
.mkt-note { margin: 0 0 16px; font-size: 13px; color: var(--muted); }
.mkt-platform + .mkt-platform { margin-top: 24px; }
.mkt-platform-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; margin: 0 0 8px; }
.mkt-platform-head h4 { margin: 0; font-size: 15px; font-weight: 600; color: var(--ink); }
.mkt-platform-head span { font-size: 13px; color: var(--muted); }
.mkt-platform-note { margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.mkt-platform-note.is-warn { color: var(--warn); }
.mkt-platform .table { table-layout: fixed; min-width: 560px; }
.mkt-platform .table th:first-child { width: 40%; }
.mkt-roas { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.mkt-roas .badge { white-space: normal; text-align: right; }
.mkt-roas strong { font-weight: 600; color: var(--ink); }
.mkt-badge-slot { margin-left: auto; }
@media (max-width: 767.98px) {
  .mkt-platform .table { table-layout: auto; min-width: 0; }
  .mkt-platform .table th:first-child { width: auto; }
  .mkt-platform .mkt-hide-sm { display: none; }
}
`

function injectStyle() {
  if (document.getElementById('style-marketing')) return
  const el = document.createElement('style')
  el.id = 'style-marketing'
  el.textContent = STYLE
  document.head.appendChild(el)
}

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const fmtDay = (iso) => parseDay(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

/** Daily spend/revenue, grouped into Monday-start weeks when the range is longer than 60 days. */
function bucketSpend(rows) {
  if (!rows.length) return { weekly: false, points: [] }
  const span = (parseDay(rows[rows.length - 1].date) - parseDay(rows[0].date)) / 86400000 + 1
  if (span <= 60) {
    return { weekly: false, points: rows.map((r) => ({ label: fmtDay(r.date), spend: r.spend ?? 0, revenue: r.revenue ?? 0 })) }
  }
  const weeks = new Map()
  for (const r of rows) {
    const dt = parseDay(r.date)
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() || 7) - 1))
    const key = dt.toISOString().slice(0, 10)
    const w = weeks.get(key) ?? { date: key, spend: 0, revenue: 0 }
    w.spend += r.spend ?? 0
    w.revenue += r.revenue ?? 0
    weeks.set(key, w)
  }
  const points = [...weeks.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({ label: `Wk of ${fmtDay(w.date)}`, spend: w.spend, revenue: w.revenue }))
  return { weekly: true, points }
}

const round2 = (n) => Math.round(n * 100) / 100

// ---------- KPIs ----------

function merTone(mer) {
  if (!isNum(mer)) return null
  if (mer >= 3) return { tone: 'success', label: 'Healthy' }
  if (mer < 2) return { tone: 'warning', label: 'Low' }
  return { tone: 'neutral', label: 'OK' }
}

function kpis(data) {
  const hasSpend = isNum(data.adSpend) && data.adSpend > 0
  return [
    kpiCard({
      icon: 'wallet',
      label: 'Ad spend',
      value: money(data.adSpend),
      hint: hasSpend ? 'Every ad platform we have spend for' : 'No ad spend recorded in this range',
      className: 'col-3',
    }),
    kpiCard({
      icon: 'megaphone',
      label: 'MER',
      value: isNum(data.mer) ? `${data.mer.toFixed(1)}x` : '—',
      hint: 'Total revenue ÷ total ad spend',
      className: 'col-3 mkt-kpi-mer',
    }),
    kpiCard({
      icon: 'users',
      label: 'New customers',
      value: num(data.newCustomers),
      hint: data.unknownCustomerOrders > 0
        ? `First-time buyers by email · ${num(data.unknownCustomerOrders)} Etsy/eBay/in-person orders have no email yet`
        : 'First-time buyers by email in this range',
      className: 'col-3',
    }),
    kpiCard({
      icon: 'target',
      label: 'New-customer cost',
      value: isNum(data.newCustomerCac) ? moneyExact(data.newCustomerCac) : '—',
      hint: data.websiteOrdersWithoutEmail > 0
        ? `Needs customer emails: ${num(data.websiteOrdersWithoutEmail)} website orders in this range have none`
        : 'Ad spend ÷ new customers',
      className: 'col-3',
    }),
  ].join('')
}

// ---------- Campaigns ----------

function campaignBlurb(platform, campaign) {
  const name = campaign.toLowerCase()
  const p = platform.toLowerCase()
  if (name.includes('brand')) return 'Captures people already searching for Sunday Rolls.'
  if (name.includes('shopping')) return 'Product-feed ads on Google Shopping and partner sites.'
  if (name.includes('performance max') || name.includes('pmax')) return 'Google’s automated ads across Search, Shopping, YouTube and Display.'
  if (name.includes('lookalike') || name.includes('prospect')) return 'Finds new buyers similar to past purchasers.'
  if (name.includes('retarget') || name.includes('remarket')) return 'Reaches people who visited the site but didn’t buy.'
  if (name.includes('offsite')) return 'Etsy promotes listings outside the marketplace.'
  if (p.includes('meta')) return 'Paid social on Instagram and Facebook.'
  if (p.includes('google')) return 'Paid search and shopping traffic.'
  return 'Paid ads for this channel.'
}

function roasTone(roas, status) {
  if (status === 'not_connected') return { tone: 'warning', label: 'Not connected' }
  if (status === 'unattributed') return { tone: 'warning', label: 'No sales linked yet' }
  if (roas == null) return { tone: 'neutral', label: 'No sales yet' }
  if (roas >= BREAK_EVEN_ROAS * 1.4) return { tone: 'success', label: 'Strong' }
  if (roas >= BREAK_EVEN_ROAS) return { tone: 'success', label: 'Above break-even' }
  if (roas >= 1) return { tone: 'warning', label: 'Below break-even' }
  return { tone: 'danger', label: 'Losing money' }
}

function platformTable(p) {
  const rows = (p.campaigns ?? []).map((c) => ({ ...c, platform: p.platform, salesStatus: p.salesStatus }))
  const est = p.salesStatus === 'estimated' ? ' (est.)' : ''
  const roasText = isNum(p.siteRoas) ? ` · ${money(p.siteObservedSales)} sales · ${p.siteRoas.toFixed(2)}x ROAS${est}` : ''
  return `<div class="mkt-platform">
  <div class="mkt-platform-head"><h4>${escapeHtml(p.platform)}</h4><span>${escapeHtml(`${money(p.spend)} spent${roasText}`)}</span></div>
  ${p.note ? `<p class="mkt-platform-note${p.salesStatus === 'unattributed' ? ' is-warn' : ''}">${escapeHtml(p.note)}</p>` : ''}
  ${table({
    columns: [
      {
        key: 'campaign',
        label: 'Campaign',
        format: (v, r) => `${escapeHtml(v)}<span class="cell-sub mkt-hide-sm">${escapeHtml(campaignBlurb(r.platform, v))}</span>`,
      },
      {
        key: 'spend',
        label: 'Spend',
        align: 'right',
        format: (v, r) => `${money(v)}<span class="cell-sub mkt-hide-sm">${pct(r.shareOfPlatformSpend, 0)} of ${escapeHtml(r.platform)}</span>`,
      },
      {
        key: 'siteSales',
        label: 'Sales',
        align: 'right',
        format: (v, r) => {
          if (!(v > 0)) return `—<span class="cell-sub">None linked</span>`
          const n = r.siteTaggedOrders ?? 0
          const parts = []
          if (n) parts.push(`${num(n)} tagged order${n === 1 ? '' : 's'}`)
          if (r.siteSalesEstimated > 0) parts.push(`${money(r.siteSalesEstimated)} est.`)
          return `${money(v)}<span class="cell-sub">${escapeHtml(parts.join(' · '))}</span>`
        },
      },
      {
        key: 'siteRoas',
        label: 'ROAS',
        align: 'right',
        format: (v, r) => {
          const t = roasTone(v, v == null && r.spend > 0 ? 'unattributed' : 'ok')
          return `<span class="mkt-roas"><strong>${isNum(v) ? `${v.toFixed(2)}x` : '—'}</strong>${badge(t.label, t.tone)}</span>`
        },
      },
    ],
    rows,
    empty: `No campaign-level spend for ${p.platform} in this range.`,
  })}
</div>`
}

const ETSY_ADS_URL = 'https://www.etsy.com/your/shops/me/advertising'

/** Etsy doesn't say which sales its ads drove, so show spend and send people to Etsy's own ad stats. */
function etsyAdsBlock(p) {
  const campaigns = (p.campaigns ?? []).filter((c) => c.spend > 0)
  const split = campaigns.length > 1 ? ` (${campaigns.map((c) => `${c.campaign} ${money(c.spend)}`).join(' · ')})` : ''
  return `<div class="mkt-platform">
  <div class="mkt-platform-head"><h4>${escapeHtml(p.platform)}</h4><span>${escapeHtml(`${money(p.spend)} spent${split}`)}</span></div>
  <p class="mkt-platform-note">Etsy doesn’t report which sales its ads drove, so there’s no ROAS for it here. The spend still counts toward MER above. <a href="${ETSY_ADS_URL}" target="_blank" rel="noopener noreferrer">See ad performance in Etsy${icon('arrow-right', { size: 14 })}</a></p>
</div>`
}

function campaignsCard(platforms) {
  const live = platforms.filter((p) => p.connected && (p.campaigns ?? []).length)
  const note = `<p class="mkt-note">Sales are website orders linked to each campaign: in full when the order carries the ad’s click or UTM tag, otherwise estimated from the campaign’s share of that day’s visits. ROAS = sales ÷ spend; break-even is about ${BREAK_EVEN_ROAS}x. MER above covers every channel.</p>`
  return card({
    title: 'Campaigns',
    subtitle: 'Spend and the website sales linked to each campaign',
    className: 'col-12',
    body: live.length
      ? note + live.map((p) => (/etsy/i.test(p.platform) ? etsyAdsBlock(p) : platformTable(p))).join('')
      : emptyState('No campaign spend in this range.'),
  })
}

function notConnectedCards(connected = {}) {
  const missing = [
    ['googleAds', 'Google Ads'],
    ['meta', 'Meta Ads'],
    ['etsyAds', 'Etsy Ads'],
  ].filter(([key]) => connected[key] === false)
  if (!missing.length) return ''
  const cls = missing.length === 1 ? 'col-12' : missing.length === 2 ? 'col-6' : 'col-4'
  return missing
    .map(([, name]) =>
      notConnected({
        title: `${name} isn’t connected`,
        detail: `The dashboard has no ${name} spend yet. Add it to the Sales Tracker sheet, or connect ${name}, so MER includes it.`,
        className: cls,
      }),
    )
    .join('')
}

// ---------- Keywords ----------

const SHORT_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const shortDay = (iso) => SHORT_DAY.format(new Date(`${iso}T00:00:00Z`))

function keywordsCard(keywords, period) {
  if (!keywords.length) {
    return notConnected({
      title: 'Search keywords',
      detail: 'Search Console isn’t returning data yet. Once it does, the searches that bring people to the site show here.',
      className: 'col-6',
    })
  }
  return card({
    title: 'Search keywords',
    subtitle: period
      ? `Google searches that led to the site, ${shortDay(period.start)} – ${shortDay(period.end)} (Search Console)`
      : 'Google searches that led to the site (Search Console)',
    className: 'col-6',
    body: table({
      columns: [
        { key: 'query', label: 'Search' },
        { key: 'visits', label: 'Clicks', align: 'right', format: (v) => num(v) },
      ],
      rows: [...keywords].sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0)).slice(0, 15),
    }),
  })
}

// ---------- Google Ads (API) ----------

function googleAdsCards(g) {
  if (!g || !g.connected || !(g.campaigns ?? []).length && !(g.searchTerms ?? []).length) return ''
  const t = g.totals ?? {}
  const summary = [
    `${money(t.cost)} cost`,
    `${num(t.clicks)} clicks`,
    isNum(t.cpc) ? `${moneyExact(t.cpc)} CPC` : null,
    `${num(t.conversions)} conversions`,
    isNum(t.roas) ? `${t.roas.toFixed(2)}x conv. value ÷ cost` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const campaigns = card({
    title: 'Google Ads campaigns',
    subtitle: `Straight from Google Ads: ${summary}. Conversions are Google Ads’ own count, so compare them with real orders.`,
    className: 'col-12',
    body: table({
      columns: [
        { key: 'campaign', label: 'Campaign' },
        { key: 'impressions', label: 'Impr.', align: 'right', format: (v) => num(v) },
        {
          key: 'clicks',
          label: 'Clicks',
          align: 'right',
          format: (v, r) => `${num(v)}<span class="cell-sub mkt-hide-sm">${isNum(r.ctr) ? `${pct(r.ctr * 100, 1)} CTR` : ''}</span>`,
        },
        {
          key: 'cost',
          label: 'Cost',
          align: 'right',
          format: (v, r) => `${money(v)}<span class="cell-sub mkt-hide-sm">${isNum(r.cpc) ? `${moneyExact(r.cpc)} CPC` : ''}</span>`,
        },
        {
          key: 'conversions',
          label: 'Conv.',
          align: 'right',
          format: (v, r) =>
            `${num(v)}<span class="cell-sub mkt-hide-sm">${isNum(r.costPerConversion) ? `${moneyExact(r.costPerConversion)} each` : ''}</span>`,
        },
        { key: 'roas', label: 'Value ÷ cost', align: 'right', format: (v) => (isNum(v) ? `${v.toFixed(2)}x` : '—') },
      ],
      rows: g.campaigns ?? [],
      empty: 'No Google Ads activity in this range.',
    }),
  })
  const period = g.searchTermsPeriod
  const terms = card({
    title: 'Google Ads search terms',
    subtitle: period
      ? `What people searched before clicking an ad, ${shortDay(period.start)} – ${shortDay(period.end)}, highest cost first`
      : 'What people searched before clicking an ad, highest cost first',
    className: 'col-12',
    body: table({
      columns: [
        { key: 'term', label: 'Search term', format: (v, r) => `${escapeHtml(v)}<span class="cell-sub mkt-hide-sm">${escapeHtml(r.campaign)}</span>` },
        { key: 'clicks', label: 'Clicks', align: 'right', format: (v) => num(v) },
        { key: 'cost', label: 'Cost', align: 'right', format: (v) => moneyExact(v) },
        { key: 'conversions', label: 'Conv.', align: 'right', format: (v) => num(v) },
      ],
      rows: (g.searchTerms ?? []).slice(0, 20),
      empty: 'No search terms yet.',
    }),
  })
  return campaigns + terms
}

// ---------- Render ----------

export async function render(root, ctx) {
  injectStyle()
  const [{ data }, googleAds] = await Promise.all([
    ctx.api(`/marketing?${ctx.rangeQuery()}`),
    // Optional: an older server or a failed call just leaves the Google Ads cards out.
    ctx.api(`/google-ads?${ctx.rangeQuery()}`).then((r) => r.data).catch(() => null),
  ])
  ctx.setRangeLabel?.(data.range)

  const { weekly, points } = bucketSpend(data.spendTrend ?? [])
  const hasTrend = points.some((p) => p.spend > 0 || p.revenue > 0)
  const sources = (data.sources ?? []).filter((s) => s.visits > 0).slice(0, 8)
  const totalVisits = sources.reduce((a, s) => a + s.visits, 0)

  root.innerHTML = [
    kpis(data),
    card({
      title: 'Spend vs revenue',
      subtitle: `${weekly ? 'Weekly totals' : 'Daily'}: ad spend against all-channel revenue`,
      className: 'col-12',
      body: hasTrend ? '<div id="mkt-spend-chart" class="chart-box"></div>' : emptyState('No spend or sales in this range yet.'),
    }),
    campaignsCard(data.platforms ?? []),
    googleAdsCards(googleAds),
    notConnectedCards(data.connected),
    card({
      title: 'Traffic sources',
      subtitle: totalVisits ? `Where ${num(totalVisits)} site visits came from` : 'Where site visits came from',
      className: 'col-6',
      body: sources.length ? '<div id="mkt-sources-chart" class="chart-box"></div>' : emptyState('No traffic data from Google Analytics in this range.'),
    }),
    keywordsCard(data.keywords ?? [], data.keywordsPeriod),
  ].join('')

  // MER tone badge next to the value (kpiCard has no badge slot of its own).
  const tone = merTone(data.mer)
  const merFoot = root.querySelector('.mkt-kpi-mer .kpi-foot')
  if (tone && merFoot) merFoot.insertAdjacentHTML('beforeend', badge(tone.label, tone.tone).replace('class="badge', 'class="mkt-badge-slot badge'))

  if (hasTrend) {
    areaChart(root.querySelector('#mkt-spend-chart'), {
      series: [
        { name: 'Revenue', data: points.map((p) => round2(p.revenue)) },
        { name: 'Ad spend', data: points.map((p) => round2(p.spend)) },
      ],
      categories: points.map((p) => p.label),
      format: 'money',
    })
  }

  if (sources.length) {
    barChart(root.querySelector('#mkt-sources-chart'), {
      series: [{ name: 'Visits', data: sources.map((s) => s.visits) }],
      categories: sources.map((s) => s.source),
      horizontal: true,
      format: 'num',
    })
  }
}
