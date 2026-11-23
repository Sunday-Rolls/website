// Experiments (A/B tests): list, create, detail with results, stats and actions.
// API (all under /dashboard/api): GET /experiments, POST /experiments, GET /experiments/:key,
// POST /experiments/:key/status { action, variant? }, POST /experiments/:key/traffic { trafficPct },
// GET /experiments/:key/results. Shapes: docs/EXPERIMENTS_CONTRACT.md ("Phase 2 and 3 additions").
// Detail view: #/experiments?key=<key> (ctx.params). Ignores the global date range.
import { areaChart } from '../lib/charts.js'
import { badge, card, emptyState, escapeHtml, icon, money, moneyExact, notConnected, num, pct, table } from '../lib/ui.js'

const PAGES_PREVIEW = 'https://sunday-rolls.github.io/website/previews'
const LIVE_SITE = 'https://www.sundayrollsgolf.com'
const GITHUB_REPO = 'https://github.com/Sunday-Rolls/website'

// Mirrors server/src/experiments/validation.ts.
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,47}$/
const VARIANT_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/

const METRICS = [
  { value: 'add_to_cart', label: 'Add to cart' },
  { value: 'begin_checkout', label: 'Started checkout' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'contact_submit', label: 'Contact form' },
  { value: 'newsletter_subscribe', label: 'Newsletter sign-up' },
  { value: 'revenue_per_visitor', label: 'Revenue per visitor' },
]
const metricLabel = (m) => METRICS.find((x) => x.value === m)?.label ?? m ?? '—'

const STATUS = {
  draft: ['Draft', 'neutral'],
  running: ['Running', 'success'],
  paused: ['Paused', 'warning'],
  stopped: ['Stopped', 'neutral'],
  promoted: ['Promoted', 'brand'],
  archived: ['Archived', 'neutral'],
}
const WITH_RESULTS = new Set(['running', 'paused', 'stopped', 'promoted'])

const AUDIT_LABELS = {
  created: 'Created',
  started: 'Started',
  paused: 'Paused',
  resumed: 'Resumed',
  stopped: 'Stopped',
  promoted: 'Promoted',
  archived: 'Archived',
  traffic_changed: 'Traffic changed',
  dispatch_failed: 'GitHub cleanup dispatch failed',
  updated: 'Updated',
}

// Survives one re-render so a success message shows after ctx.refresh().
let flash = null
let showArchived = false

// ---------- Formatting ----------

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const rate = (r) => (isNum(r) ? pct(r * 100, r < 0.1 ? 2 : 1) : '—')
const signedPct = (x, digits = 1) => (isNum(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits)}%` : '—')
const chance = (p) => (isNum(p) ? `${Math.round(p * 100)}%` : '—')
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`

function statusPill(status) {
  const [label, tone] = STATUS[status] ?? [status ?? 'Unknown', 'neutral']
  return badge(label, tone)
}

function when(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function daysRunning(exp, res) {
  if (isNum(res?.stats?.gate?.days)) return res.stats.gate.days
  const start = Date.parse(exp.startedAt)
  if (!Number.isFinite(start)) return null
  const end = Date.parse(exp.endedAt) || Date.now()
  return Math.max(0, Math.floor((end - start) / 86_400_000))
}

const minDaysOf = (exp, res) => res?.stats?.gate?.minDays ?? exp.minDays ?? 14
const minVisitorsOf = (exp, res) => res?.stats?.gate?.minVisitorsPerArm ?? exp.minVisitorsPerArm ?? 1000

function armName(exp, key) {
  const v = exp?.variants?.find((x) => x.key === key)
  return v?.name && v.name !== key ? `${v.name} (${key})` : key
}

function prLink(exp) {
  if (!exp.prNumber) return ''
  const url = exp.prUrl || `${GITHUB_REPO}/pull/${exp.prNumber}`
  return `<a class="exp-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">PR #${escapeHtml(exp.prNumber)}</a>`
}

/** Per-arm rate for a metric: `rates` from Phase 2 results, else computed from the raw counts. */
function armRate(arm, metric) {
  if (!arm) return null
  if (isNum(arm.rates?.[metric])) return arm.rates[metric]
  if (!(arm.visitors > 0)) return null
  if (metric === 'purchase') return (arm.purchasers ?? 0) / arm.visitors
  if (metric === 'revenue_per_visitor') return isNum(arm.revenuePerVisitor) ? arm.revenuePerVisitor : (arm.revenue ?? 0) / arm.visitors
  const count = arm.events?.[metric]
  return isNum(count) ? count / arm.visitors : null
}

const metricValue = (metric, v) => (metric === 'revenue_per_visitor' ? moneyExact(v) : rate(v))

/** Non-control arms compared with control on the primary metric, in one shape for RPV and rates. */
function primaryComparisons(res) {
  const stats = res?.stats
  if (!stats) return []
  if (res.primaryMetric === 'revenue_per_visitor') {
    return (stats.rpv ?? []).map((r) => ({
      variant: r.variant,
      control: r.controlRpv,
      value: r.variantRpv,
      lift: r.lift,
      interval: r.liftInterval,
      prob: r.probBeatsControl,
      loss: null,
      pValue: null,
    }))
  }
  return (stats.comparisons ?? [])
    .filter((c) => c.metric === res.primaryMetric)
    .map((c) => ({
      variant: c.variant,
      control: c.controlRate,
      value: c.variantRate,
      lift: c.lift,
      interval: c.liftInterval,
      prob: c.probBeatsControl,
      loss: c.expectedLoss,
      pValue: c.pValue,
    }))
}

function bestComparison(res) {
  const rows = primaryComparisons(res)
  if (!rows.length) return null
  const winner = res.stats?.winner
  return rows.find((r) => r.variant === winner) ?? rows.reduce((a, b) => ((b.prob ?? -1) > (a.prob ?? -1) ? b : a))
}

function healthBadges(exp, res) {
  const out = []
  if (res?.stats?.srm && res.stats.srm.ok === false) out.push(badge('Traffic split off (SRM)', 'danger'))
  const missing = (res?.arms ?? []).reduce((s, a) => s + (a.beaconMissingOrders ?? 0), 0)
  if (missing > 0) out.push(badge(`${plural(missing, 'order')} without tracking`, 'warning'))
  if (res?.stats?.gate?.overMaxDays) out.push(badge(`Over ${exp.maxDays ?? 42} days`, 'warning'))
  return out.join(' ')
}

/** Plain-language message for an API error (409 overlap conflicts, 503 no database, …). */
function errorText(err) {
  const conflicts = err?.data?.conflicts
  if (err?.status === 409 && Array.isArray(conflicts) && conflicts.length) {
    return `Another running experiment already targets the same page: ${conflicts.join(', ')}. Pause or stop it first, then try again.`
  }
  if (err?.status === 503) return 'Experiments aren’t available on this server (it needs the Postgres database).'
  if (err?.status === 404) return 'That experiment no longer exists.'
  if (err?.status === 409) return `${err.message}. Someone may have changed it already; refresh to see its current state.`
  if (err?.status === 400) return err.message || 'The server rejected that request.'
  return err?.message ? `Something went wrong: ${err.message}` : 'Something went wrong. Try again.'
}

function flashHtml() {
  if (!flash) return ''
  const html = `<div class="exp-flash col-12" data-tone="${escapeHtml(flash.tone)}" role="status">${icon(flash.tone === 'error' ? 'alert' : 'check-circle', { size: 18 })}<span>${escapeHtml(flash.text)}</span></div>`
  flash = null
  return html
}

function setStatus(el, text, tone = '') {
  if (!el) return
  el.textContent = text
  if (tone) el.dataset.tone = tone
  else delete el.dataset.tone
}

function unavailableCard() {
  return notConnected({
    title: 'Experiments aren’t available here',
    detail:
      'A/B tests are stored in the Postgres database, and this server is running without one (no DATABASE_URL). On Railway they work automatically. Locally, start the API with DATABASE_URL set to use them.',
    className: 'col-12',
  })
}

// ---------- Confirm dialog ----------

/**
 * Modal confirm. `body` is HTML (may contain form fields). Resolves with the dialog's FormData on
 * confirm, or null on cancel / Escape.
 */
function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'exp-dialog'
    dialog.innerHTML = `<form method="dialog" class="exp-dialog-form">
  <h3 class="card-title">${escapeHtml(title)}</h3>
  <div class="exp-dialog-body">${body}</div>
  <div class="exp-dialog-actions">
    <button type="button" class="btn btn-outline" value="cancel" data-cancel>Cancel</button>
    <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${escapeHtml(confirmLabel)}</button>
  </div>
</form>`
    document.body.appendChild(dialog)
    const form = dialog.querySelector('form')
    let result = null
    form.addEventListener('submit', () => {
      result = new FormData(form)
    })
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close())
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(result)
    })
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else {
      dialog.remove()
      resolve(window.confirm(title) ? new FormData() : null)
    }
  })
}

// ---------- List view ----------

function listTable(rows) {
  return table({
    columns: [
      {
        key: 'name',
        label: 'Experiment',
        format: (_, { exp }) =>
          `<a class="exp-name" href="#/experiments?key=${encodeURIComponent(exp.key)}">${escapeHtml(exp.name)}</a><span class="exp-key">${escapeHtml(exp.key)}${exp.prNumber ? ` · ${prLink(exp)}` : ''}</span>`,
      },
      { key: 'status', label: 'Status', format: (_, { exp }) => statusPill(exp.status) },
      {
        key: 'days',
        label: 'Running for',
        format: (_, { exp, res }) => {
          const d = daysRunning(exp, res)
          if (d == null) return '<span class="exp-muted">—</span>'
          const min = minDaysOf(exp, res)
          return `${plural(d, 'day')} <span class="exp-muted">/ min ${num(min)}</span>${d >= min ? ` ${icon('check', { size: 14, className: 'exp-ok' })}` : ''}`
        },
      },
      {
        key: 'visitors',
        label: 'Visitors',
        format: (_, { exp, res }) => {
          const arms = res?.arms?.length ? res.arms.map((a) => a.visitors) : (exp.variants ?? []).map((v) => v.visitors ?? 0)
          return `<span title="${escapeHtml((exp.variants ?? []).map((v) => v.key).join(' / '))}">${arms.map((n) => num(n)).join(' / ')}</span>`
        },
      },
      {
        key: 'primary',
        label: 'Primary metric',
        format: (_, { exp, res }) => {
          const best = bestComparison(res)
          const label = `<span class="exp-muted exp-block">${escapeHtml(metricLabel(exp.primaryMetric))}</span>`
          if (!best) return `${label}—`
          const m = res.primaryMetric
          return `${label}${metricValue(m, best.control)} → ${metricValue(m, best.value)} <span class="exp-muted">(${escapeHtml(best.variant)})</span> <span class="${best.lift >= 0 ? 'exp-up' : 'exp-down'}">${signedPct(best.lift)}</span>`
        },
      },
      {
        key: 'prob',
        label: 'Chance to beat control',
        align: 'right',
        format: (_, { res }) => {
          const best = bestComparison(res)
          if (!best || !isNum(best.prob)) return '<span class="exp-muted">—</span>'
          const ready = res.stats?.gate?.ready
          return ready
            ? `<strong class="${best.prob >= 0.95 ? 'exp-up' : ''}">${chance(best.prob)}</strong>`
            : `<span class="exp-muted" title="Early: the sample gate isn’t met yet, so don’t act on this">${chance(best.prob)}</span>`
        },
      },
      {
        key: 'health',
        label: 'Health',
        format: (_, { exp, res, resError }) =>
          resError ? badge('Results unavailable', 'neutral') : healthBadges(exp, res) || '<span class="exp-muted">OK</span>',
      },
    ],
    rows,
    empty: 'No experiments yet. Create one, or open a PR with the ab-test label.',
  })
}

function createForm() {
  const metricOpts = METRICS.map((m) => `<option value="${m.value}">${escapeHtml(m.label)}</option>`).join('')
  return `<form id="exp-create" class="exp-form" novalidate>
  <label class="field">Key <input name="key" type="text" required placeholder="home-banner" autocomplete="off" title="2–48 lowercase letters, digits and dashes" /></label>
  <label class="field">Name <input name="name" type="text" required maxlength="200" placeholder="Retro Roller banner" /></label>
  <label class="field exp-span-2">Hypothesis <textarea name="hypothesis" rows="2" maxlength="2000" placeholder="Showing the banner will lift add-to-cart because…"></textarea></label>
  <fieldset class="exp-variants">
    <legend>Arms <span class="field-hint">weights are whole numbers that add up to 100</span></legend>
    <div id="exp-variant-rows">${variantRow({ key: 'control', name: 'Current site', weight: 50, locked: true })}${variantRow({ key: 'b', name: '', weight: 50 })}</div>
    <div class="exp-variant-foot">
      <button type="button" class="btn btn-outline" id="exp-add-variant">${icon('plus', { size: 16 })}Add arm</button>
      <span class="exp-muted" id="exp-weight-sum" aria-live="polite"></span>
    </div>
  </fieldset>
  <label class="field">Primary metric <select name="primaryMetric">${metricOpts}</select></label>
  <label class="field">Pages <input name="paths" type="text" placeholder="/, /shop (blank = whole site)" value="/" title="Comma-separated paths; leave blank to test the whole site" /></label>
  <label class="field">Traffic in test (%) <input name="trafficPct" type="number" min="0" max="100" step="1" value="100" /></label>
  <label class="field">Min visitors per arm <input name="minVisitorsPerArm" type="number" min="1" step="1" value="1000" /></label>
  <label class="field">Min days <input name="minDays" type="number" min="0" step="1" value="14" /></label>
  <div class="exp-form-actions">
    <button type="submit" class="btn btn-primary">${icon('plus', { size: 18 })}Create as draft</button>
    <button type="button" class="btn btn-outline" id="exp-create-cancel">Cancel</button>
    <p class="exp-status" id="exp-create-status" aria-live="polite"></p>
  </div>
</form>`
}

function variantRow({ key = '', name = '', weight = '', locked = false } = {}) {
  return `<div class="exp-variant-row">
  <label class="field">Arm key<input name="vkey" type="text" value="${escapeHtml(key)}" ${locked ? 'readonly' : ''} required autocomplete="off" /></label>
  <label class="field">Label<input name="vname" type="text" value="${escapeHtml(name)}" maxlength="100" placeholder="${locked ? 'Current site' : 'What changes'}" /></label>
  <label class="field">Weight<input name="vweight" type="number" min="1" max="99" step="1" value="${escapeHtml(weight)}" required /></label>
  ${locked ? '<span class="exp-variant-remove"></span>' : `<button type="button" class="btn-square exp-variant-remove" data-remove-variant aria-label="Remove arm">${icon('x', { size: 18 })}</button>`}
</div>`
}

const intOf = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))

/** Client-side copy of parseCreateExperiment (plus Phase 2 fields). Returns { body } or { error }. */
function readCreateForm(form) {
  const fd = new FormData(form)
  const key = String(fd.get('key') ?? '').trim()
  if (!KEY_RE.test(key)) return { error: 'Key must be 2–48 characters: lowercase letters, digits and dashes, starting with a letter or digit.' }
  const name = String(fd.get('name') ?? '').trim()
  if (!name || name.length > 200) return { error: 'Give the experiment a name (up to 200 characters).' }
  const hypothesis = String(fd.get('hypothesis') ?? '').trim()
  if (hypothesis.length > 2000) return { error: 'Keep the hypothesis under 2,000 characters.' }

  const keys = fd.getAll('vkey').map((k) => String(k).trim())
  const names = fd.getAll('vname').map((k) => String(k).trim())
  const weights = fd.getAll('vweight').map(intOf)
  if (keys.length < 2 || keys.length > 8) return { error: 'An experiment needs 2 to 8 arms (control plus at least one change).' }
  const seen = new Set()
  const variants = []
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    if (!VARIANT_KEY_RE.test(k)) return { error: `Arm key “${k || '(blank)'}” isn’t valid: up to 24 lowercase letters, digits, dashes or underscores.` }
    if (seen.has(k)) return { error: `Two arms are both called “${k}”.` }
    seen.add(k)
    const w = weights[i]
    if (!Number.isInteger(w) || w < 1 || w > 99) return { error: `Arm “${k}” needs a whole-number weight from 1 to 99.` }
    variants.push({ key: k, name: names[i] || k, weight: w })
  }
  if (!seen.has('control')) return { error: 'One arm must be called “control” (the current site).' }
  const sum = variants.reduce((s, v) => s + v.weight, 0)
  if (sum !== 100) return { error: `Arm weights add up to ${sum}; they must add up to 100.` }

  const metric = String(fd.get('primaryMetric') ?? 'add_to_cart')
  const paths = String(fd.get('paths') ?? '')
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const badPath = paths.find((p) => !p.startsWith('/') || p.length > 300)
  if (badPath) return { error: `Page “${badPath}” must start with “/”, e.g. / or /shop.` }
  if (new Set(paths).size > 10) return { error: 'List at most 10 pages, or leave it blank for the whole site.' }
  const trafficPct = intOf(fd.get('trafficPct'))
  if (!Number.isInteger(trafficPct) || trafficPct < 0 || trafficPct > 100) return { error: 'Traffic must be a whole number from 0 to 100.' }
  const minVisitorsPerArm = intOf(fd.get('minVisitorsPerArm'))
  if (!Number.isInteger(minVisitorsPerArm) || minVisitorsPerArm < 1) return { error: 'Min visitors per arm must be a whole number above 0.' }
  const minDays = intOf(fd.get('minDays'))
  if (!Number.isInteger(minDays) || minDays < 0) return { error: 'Min days must be a whole number (0 or more).' }

  return {
    body: {
      key,
      name,
      hypothesis: hypothesis || null,
      variants,
      primaryMetric: metric,
      paths: [...new Set(paths)],
      trafficPct,
      minVisitorsPerArm,
      minDays,
    },
  }
}

async function renderList(root, ctx) {
  let list
  try {
    list = await ctx.api('/experiments')
  } catch (err) {
    if (err?.status === 503) {
      root.innerHTML = unavailableCard()
      return
    }
    throw err
  }
  const all = list.experiments ?? list.data ?? []
  const visible = all.filter((e) => showArchived || e.status !== 'archived')
  const archivedCount = all.length - all.filter((e) => e.status !== 'archived').length

  const settled = await Promise.allSettled(
    visible.map((exp) => (WITH_RESULTS.has(exp.status) ? ctx.api(`/experiments/${encodeURIComponent(exp.key)}/results`) : Promise.resolve(null))),
  )
  const rows = visible.map((exp, i) => {
    const s = settled[i]
    return { exp, res: s.status === 'fulfilled' ? (s.value?.data ?? null) : null, resError: s.status === 'rejected' }
  })

  const running = all.filter((e) => e.status === 'running').length
  const actions = `${
    archivedCount
      ? `<label class="exp-toggle"><input type="checkbox" id="exp-show-archived"${showArchived ? ' checked' : ''} /> Show archived (${num(archivedCount)})</label>`
      : ''
  }<button type="button" class="btn btn-primary" id="exp-new">${icon('plus', { size: 18 })}New experiment</button>`

  root.innerHTML = `${flashHtml()}
${card({
  title: 'New experiment',
  subtitle: 'Saved as a draft. Nothing changes on the site until you press Start on its page.',
  className: 'col-12 exp-create-card',
  body: createForm(),
})}
${card({
  title: 'Experiments',
  subtitle: `${plural(running, 'test')} running. Numbers stay grey until each test has run long enough and seen enough visitors.`,
  actions,
  className: 'col-12',
  body: listTable(rows),
})}`

  const createCard = root.querySelector('.exp-create-card')
  createCard.hidden = true
  bindCreateForm(root, ctx, createCard)
  root.querySelector('#exp-show-archived')?.addEventListener('change', (e) => {
    showArchived = e.target.checked
    ctx.refresh()
  })
}

function bindCreateForm(root, ctx, createCard) {
  const form = root.querySelector('#exp-create')
  const rowsEl = root.querySelector('#exp-variant-rows')
  const sumEl = root.querySelector('#exp-weight-sum')
  const status = root.querySelector('#exp-create-status')

  const updateSum = () => {
    const sum = [...form.querySelectorAll('input[name="vweight"]')].reduce((s, i) => s + (Number(i.value) || 0), 0)
    sumEl.textContent = `Weights add up to ${sum}${sum === 100 ? '' : ' (needs 100)'}`
    sumEl.dataset.tone = sum === 100 ? 'ok' : 'error'
  }
  updateSum()

  root.querySelector('#exp-new').addEventListener('click', () => {
    createCard.hidden = false
    createCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
    form.querySelector('input[name="key"]').focus({ preventScroll: true })
  })
  root.querySelector('#exp-create-cancel').addEventListener('click', () => {
    createCard.hidden = true
    setStatus(status, '')
  })
  root.querySelector('#exp-add-variant').addEventListener('click', () => {
    const count = rowsEl.children.length
    if (count >= 8) return setStatus(status, 'At most 8 arms.', 'error')
    const nextKey = String.fromCharCode(97 + count) // b, c, d…
    rowsEl.insertAdjacentHTML('beforeend', variantRow({ key: nextKey, weight: '' }))
    updateSum()
  })
  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-variant]')
    if (!btn) return
    btn.closest('.exp-variant-row').remove()
    updateSum()
  })
  form.addEventListener('input', (e) => {
    if (e.target.name === 'vweight') updateSum()
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const parsed = readCreateForm(form)
    if (parsed.error) return setStatus(status, parsed.error, 'error')
    const submit = form.querySelector('button[type="submit"]')
    submit.disabled = true
    setStatus(status, 'Creating…')
    try {
      await ctx.api('/experiments', { method: 'POST', body: JSON.stringify(parsed.body) })
      flash = { tone: 'ok', text: `Created “${parsed.body.name}” as a draft. Check the preview links, then press Start.` }
      ctx.navigate(`experiments?key=${encodeURIComponent(parsed.body.key)}`)
    } catch (err) {
      const text = err?.status === 409 ? `The key “${parsed.body.key}” is already taken. Pick another.` : errorText(err)
      setStatus(status, text, 'error')
    } finally {
      submit.disabled = false
    }
  })
}

// ---------- Detail view ----------

function verdictBanner(exp, res) {
  const stats = res?.stats
  if (exp.status === 'draft') {
    return banner('neutral', 'Not started', 'This is a draft. Check each arm with the preview links, then press Start. Visitors only see the change once it’s running.')
  }
  if (exp.status === 'archived') return banner('neutral', 'Archived', 'This experiment is hidden from the list. Its data is kept.')
  if (exp.status === 'promoted') {
    return banner(
      'success',
      `Promoted: everyone sees ${armName(exp, exp.winnerVariant ?? res?.stats?.winner ?? '—')}`,
      'Once the cleanup PR that bakes this in has merged, archive the experiment.',
    )
  }
  if (!stats) return banner('neutral', 'No statistics yet', 'Results will appear here once visitors start seeing the test.')
  const gate = stats.gate ?? {}
  const metric = metricLabel(res.primaryMetric)
  switch (stats.verdict) {
    case 'srm_fail':
      return banner(
        'danger',
        'Don’t trust these numbers: the traffic split is off',
        `The arms got a different share of visitors than their weights say (SRM check p = ${isNum(stats.srm?.pValue) ? stats.srm.pValue.toPrecision(2) : '—'}). This usually means bots, caching or an assignment bug. Fix that before reading anything into the results.`,
      )
    case 'early':
      return banner(
        'warning',
        'Too early — don’t act yet',
        `Day ${num(gate.days)} of ${num(gate.minDays)}, smallest arm ${num(gate.smallestArm)} of ${num(gate.minVisitorsPerArm)} visitors. The numbers below will swing around until both are met.`,
      )
    case 'winner': {
      const best = bestComparison(res)
      return banner(
        'success',
        `${armName(exp, stats.winner)} is the winner`,
        `It has a ${chance(best?.prob)} chance of beating control on ${metric.toLowerCase()}${isNum(best?.lift) ? ` (${signedPct(best.lift)})` : ''}, and the purchase and revenue guardrails look fine. You can promote it.`,
      )
    }
    case 'guardrail_fail':
      return banner(
        'danger',
        'An arm is likely hurting sales',
        'At least one arm has an 80%+ chance of a lower purchase rate or revenue per visitor than control. Don’t promote it; stopping keeps everyone on control.',
      )
    case 'no_difference':
      return banner(
        'neutral',
        'No clear difference',
        `The test has enough data, and no arm reached a 95% chance of beating control on ${metric.toLowerCase()}. Stopping keeps the current site; promote an arm only if you prefer it for other reasons.`,
      )
    default:
      return banner('neutral', 'Results', 'Statistics are being calculated.')
  }
}

function banner(tone, title, text) {
  return `<section class="exp-verdict col-12" data-tone="${tone}">
  <div class="icon-chip">${icon(tone === 'success' ? 'check-circle' : tone === 'neutral' ? 'chart' : 'alert')}</div>
  <div><h3 class="card-title">${escapeHtml(title)}</h3><p class="card-sub">${escapeHtml(text)}</p></div>
</section>`
}

function headerCard(exp) {
  const paths = exp.paths?.length ? exp.paths : null
  const firstPath = paths?.[0] ?? '/'
  const arms = exp.variants ?? []
  const force = (arm) => `sr_force=${encodeURIComponent(exp.key)}:${encodeURIComponent(arm)}`
  const pagesUrl = (arm) => `${PAGES_PREVIEW}/pr-${encodeURIComponent(exp.prNumber)}${firstPath}?${force(arm)}`
  const liveUrl = (arm) => `${LIVE_SITE}${firstPath}?${force(arm)}`
  const link = (href, text) => `<a class="exp-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`

  const qa = arms
    .map(
      (v) => `<li><span class="exp-arm-label">${escapeHtml(armName(exp, v.key))} <span class="exp-muted">${num(v.weight)}%</span></span>
  <span class="exp-arm-links">${exp.prNumber ? link(pagesUrl(v.key), 'PR preview') : ''}${link(liveUrl(v.key), 'Live site')}</span></li>`,
    )
    .join('')

  const facts = [
    ['Status', statusPill(exp.status)],
    ['Primary metric', escapeHtml(metricLabel(exp.primaryMetric))],
    ['Pages', paths ? paths.map((p) => `<code>${escapeHtml(p)}</code>`).join(' ') : 'Whole site'],
    ['Traffic in test', `${num(exp.trafficPct)}%`],
    ['Gate', `${num(exp.minVisitorsPerArm ?? 1000)} visitors per arm and ${num(exp.minDays ?? 14)} days`],
    ['Started', exp.startedAt ? escapeHtml(when(exp.startedAt)) : '—'],
    ...(exp.endedAt ? [['Ended', escapeHtml(when(exp.endedAt))]] : []),
    ...(exp.prNumber ? [['Pull request', `${prLink(exp)}${exp.branch ? ` <span class="exp-muted">${escapeHtml(exp.branch)}</span>` : ''}`]] : []),
  ]
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`)
    .join('')

  return card({
    title: exp.name,
    subtitle: exp.key,
    actions: `<a class="btn btn-outline" href="#/experiments">${icon('arrow-right', { size: 16, className: 'exp-back-icon' })}All experiments</a>`,
    className: 'col-12',
    body: `${exp.hypothesis ? `<p class="exp-hypothesis">${escapeHtml(exp.hypothesis)}</p>` : ''}
<dl class="exp-facts">${facts}</dl>
<h4 class="exp-subhead">Check each arm</h4>
<p class="exp-muted exp-small">These links force one arm for your browser tab only. Forced visits are never counted.</p>
<ul class="exp-arms">${qa}</ul>`,
  })
}

function armCards(exp, res) {
  const arms = res?.arms ?? []
  if (!arms.length) return ''
  const cls = arms.length >= 3 ? 'col-4' : 'col-6'
  return arms
    .map((a) => {
      const isControl = a.variant === 'control'
      const stats = [
        ['Visitors', num(a.visitors)],
        ['Add-to-cart rate', rate(armRate(a, 'add_to_cart'))],
        ['Checkout rate', rate(armRate(a, 'begin_checkout'))],
        ['Orders', num(a.orders)],
        ['Conversion', rate(armRate(a, 'purchase'))],
        ['Revenue', money(a.revenue)],
        ['Revenue / visitor', moneyExact(armRate(a, 'revenue_per_visitor'))],
        ['Avg order', moneyExact(isNum(a.aov) ? a.aov : a.orders > 0 ? a.revenue / a.orders : null)],
        ['Contacts', num(a.events?.contact_submit)],
      ]
        .map(([k, v]) => `<div class="exp-stat"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
        .join('')
      const extra = [
        a.forcedVisitors ? `${plural(a.forcedVisitors, 'forced QA visit')} not counted` : '',
        a.beaconMissingOrders ? `${plural(a.beaconMissingOrders, 'tagged order')} with no exposure (tracking loss)` : '',
      ].filter(Boolean)
      return card({
        title: armName(exp, a.variant),
        subtitle: isControl ? 'Control (current site)' : res.stats?.winner === a.variant ? 'Leading arm' : 'Variant',
        className: cls,
        body: `<div class="exp-stats">${stats}</div>${extra.length ? `<p class="exp-muted exp-small exp-arm-note">${escapeHtml(extra.join(' · '))}</p>` : ''}`,
      })
    })
    .join('')
}

function chartCard(exp, res) {
  const daily = res?.daily ?? []
  // The server charts the purchase rate when the primary metric is revenue per visitor.
  const m = res?.primaryMetric ?? exp.primaryMetric
  const subtitle = `${metricLabel(m === 'revenue_per_visitor' ? 'purchase' : m)} rate, cumulative since the start, per arm`
  if (daily.length < 2) {
    return card({ title: 'Over time', subtitle, className: 'col-7', body: emptyState('The chart appears after two days of data.') })
  }
  return card({ title: 'Over time', subtitle, className: 'col-7', body: '<div id="exp-chart"></div>' })
}

function drawChart(root, exp, res) {
  const el = root.querySelector('#exp-chart')
  if (!el) return
  const daily = res.daily
  const keys = (exp.variants ?? []).map((v) => v.key)
  const series = keys.map((k) => ({
    name: k,
    data: daily.map((d) => {
      const a = d.arms?.[k]
      if (!a || !(a.visitors > 0)) return null
      return Math.round((a.conversions / a.visitors) * 10000) / 100
    }),
  }))
  const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  areaChart(el, {
    series,
    categories: daily.map((d) => DAY.format(new Date(`${d.date}T00:00:00Z`))),
    format: (v) => pct(v, 2),
    height: 300,
  })
}

function progressBar(label, value, target) {
  const share = target > 0 ? Math.min(1, (value ?? 0) / target) : 0
  return `<div class="exp-progress-row">
  <div class="exp-progress-text"><span>${escapeHtml(label)}</span><span>${num(value)} / ${num(target)}</span></div>
  <div class="exp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${escapeHtml(target)}" aria-valuenow="${escapeHtml(value ?? 0)}"><span style="width:${Math.round(share * 100)}%"${share >= 1 ? ' data-done' : ''}></span></div>
</div>`
}

function statsCard(exp, res) {
  const stats = res?.stats
  if (!stats) {
    return card({
      title: 'Statistics',
      className: 'col-5',
      body: emptyState(exp.status === 'draft' ? 'Start the test to collect results.' : 'No statistics yet.'),
    })
  }
  const gate = stats.gate ?? {}
  const ready = Boolean(gate.ready)
  const metric = res.primaryMetric
  const rows = primaryComparisons(res)
    .map(
      (r) => `<li class="exp-compare${ready ? '' : ' is-early'}">
  <div class="exp-compare-head"><strong>${escapeHtml(armName(exp, r.variant))}</strong><span class="${r.lift >= 0 ? 'exp-up' : 'exp-down'}">${signedPct(r.lift)}</span></div>
  <p class="exp-small">${metricValue(metric, r.control)} control → ${metricValue(metric, r.value)}${
    Array.isArray(r.interval) ? ` · 95% range ${signedPct(r.interval[0], 0)} to ${signedPct(r.interval[1], 0)}` : ''
  }</p>
  <dl class="exp-mini">
    <div><dt>Chance to beat control</dt><dd>${chance(r.prob)}</dd></div>
    ${isNum(r.loss) ? `<div><dt title="Conversion given up if we pick this arm and it’s actually worse">Expected loss</dt><dd>${(r.loss * 100).toFixed(3)} pt</dd></div>` : ''}
  </dl>
  ${isNum(r.pValue) ? `<details class="exp-details"><summary>Classic test</summary><p class="exp-small">Two-proportion z-test p = ${r.pValue.toPrecision(2)} (below 0.05 is the usual “significant” line).</p></details>` : ''}
</li>`,
    )
    .join('')

  const rpv =
    metric !== 'revenue_per_visitor' && stats.rpv?.length
      ? `<h4 class="exp-subhead">Revenue per visitor <span class="exp-muted">(guardrail)</span></h4><ul class="exp-plain">${stats.rpv
          .map(
            (r) =>
              `<li><span>${escapeHtml(r.variant)}: ${moneyExact(r.controlRpv)} → ${moneyExact(r.variantRpv)} <span class="${r.lift >= 0 ? 'exp-up' : 'exp-down'}">${signedPct(r.lift)}</span></span><span class="exp-muted">${chance(r.probBeatsControl)} chance it’s higher</span></li>`,
          )
          .join('')}</ul>`
      : ''

  const srm = stats.srm
  const srmLine = srm
    ? `<p class="exp-small exp-srm">${badge(srm.ok ? 'Split OK' : 'Split off', srm.ok ? 'success' : 'danger')} Traffic split check (SRM) p = ${isNum(srm.pValue) ? srm.pValue.toPrecision(2) : '—'}</p>`
    : ''

  return card({
    title: 'Statistics',
    subtitle: ready ? `Primary metric: ${metricLabel(metric)}` : 'Early: greyed until the sample gate is met',
    className: 'col-5',
    body: `<ul class="exp-compares">${rows || `<li>${emptyState('No comparison yet.')}</li>`}</ul>
${rpv}
<h4 class="exp-subhead">Sample gate</h4>
${progressBar('Days running', gate.days, gate.minDays ?? exp.minDays ?? 14)}
${progressBar('Smallest arm (visitors)', gate.smallestArm, gate.minVisitorsPerArm ?? exp.minVisitorsPerArm ?? 1000)}
${gate.overMaxDays ? `<p class="exp-small exp-down">Past the ${num(exp.maxDays ?? 42)}-day limit. Decide now: promote, or stop.</p>` : ''}
${srmLine}`,
  })
}

function actionsCard(exp, res) {
  const s = exp.status
  const btn = (action, label, tone = 'outline', iconName = '') =>
    `<button type="button" class="btn btn-${tone}" data-action="${action}">${iconName ? icon(iconName, { size: 18 }) : ''}${escapeHtml(label)}</button>`
  const buttons = []
  if (s === 'draft') buttons.push(btn('start', 'Start test', 'primary', 'check-circle'))
  if (s === 'running') buttons.push(btn('pause', 'Pause'))
  if (s === 'paused') buttons.push(btn('resume', 'Resume', 'primary'))
  if (s === 'running' || s === 'paused') buttons.push(btn('stop', 'Stop (no winner)'))
  if (s === 'running' || s === 'paused' || s === 'stopped') {
    const winner = res?.stats?.winner
    buttons.push(btn('promote', winner ? `Promote ${winner}` : 'Promote an arm…', winner ? 'primary' : 'outline', 'star'))
  }
  if (s === 'draft' || s === 'stopped' || s === 'promoted') buttons.push(btn('archive', 'Archive'))

  const traffic =
    s === 'draft' || s === 'running' || s === 'paused'
      ? `<div class="exp-traffic">
  <label class="field" for="exp-traffic-range">Traffic in test <span class="field-hint">visitors outside the test see control and aren’t counted</span></label>
  <div class="exp-traffic-row">
    <input type="range" id="exp-traffic-range" min="0" max="100" step="5" value="${escapeHtml(exp.trafficPct)}" aria-label="Traffic percentage slider" />
    <input type="number" id="exp-traffic-input" min="0" max="100" step="1" value="${escapeHtml(exp.trafficPct)}" aria-label="Traffic percentage" />
    <span>%</span>
    <button type="button" class="btn btn-outline" data-action="traffic" disabled>Save</button>
  </div>
</div>`
      : ''

  if (!buttons.length && !traffic) return ''
  return card({
    title: 'Actions',
    subtitle: 'Every action asks first and is recorded in the history below.',
    className: 'col-12',
    body: `<div class="exp-actions">${buttons.join('')}</div>${traffic}<p class="exp-status" id="exp-action-status" aria-live="polite"></p>`,
  })
}

function auditCard(audit) {
  const items = (audit ?? [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .map((a) => {
      const d = a.detail ?? {}
      const extra =
        a.action === 'traffic_changed' && d.to != null
          ? `${d.from ?? '—'}% → ${d.to}%`
          : a.action === 'promoted' && d.variant
            ? `winner: ${d.variant}`
            : a.action === 'created' && Array.isArray(d.variants)
              ? d.variants.join(', ')
              : a.action === 'dispatch_failed' && d.error
                ? String(d.error)
                : ''
      return `<li><span class="exp-audit-when">${escapeHtml(when(a.at))}</span><span><strong>${escapeHtml(AUDIT_LABELS[a.action] ?? a.action)}</strong>${extra ? ` <span class="exp-muted">${escapeHtml(extra)}</span>` : ''}<span class="exp-muted exp-block">${escapeHtml(a.actor ?? '')}</span></span></li>`
    })
    .join('')
  return card({
    title: 'History',
    subtitle: 'Who changed what, newest first.',
    className: 'col-12',
    body: items ? `<ul class="exp-audit">${items}</ul>` : emptyState('No changes recorded yet.'),
  })
}

const ACTION_COPY = {
  start: {
    title: 'Start this test?',
    text: 'Visitors to the targeted pages start being split between the arms right away, and results begin counting.',
    confirm: 'Start test',
  },
  pause: {
    title: 'Pause this test?',
    text: 'Everyone sees control and counting freezes. Resuming brings each visitor back to the same arm.',
    confirm: 'Pause',
  },
  resume: { title: 'Resume this test?', text: 'Visitors go back to their arms and counting continues.', confirm: 'Resume' },
  stop: {
    title: 'Stop without a winner?',
    text: 'The test ends and everyone sees control. If GitHub is connected, an issue is opened to remove the test code. This can’t be undone.',
    confirm: 'Stop test',
    danger: true,
  },
  archive: {
    title: 'Archive this experiment?',
    text: 'It’s hidden from the list. Its data and history are kept.',
    confirm: 'Archive',
  },
}

function bindActions(root, ctx, exp, res) {
  const status = root.querySelector('#exp-action-status')
  const range = root.querySelector('#exp-traffic-range')
  const input = root.querySelector('#exp-traffic-input')
  const saveTraffic = root.querySelector('[data-action="traffic"]')
  if (range && input && saveTraffic) {
    const sync = (v) => {
      range.value = v
      input.value = v
      saveTraffic.disabled = Number(v) === exp.trafficPct
    }
    range.addEventListener('input', () => sync(range.value))
    input.addEventListener('input', () => {
      range.value = input.value
      saveTraffic.disabled = Number(input.value) === exp.trafficPct
    })
  }

  const run = async (btn, path, body, done) => {
    btn.disabled = true
    btn.setAttribute('aria-busy', 'true')
    setStatus(status, 'Saving…')
    try {
      await ctx.api(path, { method: 'POST', body: JSON.stringify(body) })
      flash = { tone: 'ok', text: done }
      ctx.refresh()
    } catch (err) {
      setStatus(status, errorText(err), 'error')
      btn.disabled = false
      btn.removeAttribute('aria-busy')
    }
  }
  const base = `/experiments/${encodeURIComponent(exp.key)}`

  root.querySelector('.exp-actions')?.parentElement.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]')
    if (!btn || btn.disabled) return
    const action = btn.dataset.action
    setStatus(status, '')

    if (action === 'traffic') {
      const value = Number(input.value)
      if (!Number.isInteger(value) || value < 0 || value > 100) return setStatus(status, 'Traffic must be a whole number from 0 to 100.', 'error')
      const ok = await confirmDialog({
        title: `Change traffic to ${value}%?`,
        body: `<p class="card-sub">From ${num(exp.trafficPct)}% to ${num(value)}% of visitors on the targeted pages. Arm weights stay the same.</p>`,
        confirmLabel: 'Change traffic',
      })
      if (ok) run(btn, `${base}/traffic`, { trafficPct: value }, `Traffic set to ${value}%.`)
      return
    }

    if (action === 'promote') {
      const arms = exp.variants ?? []
      const preferred = res?.stats?.winner ?? arms.find((v) => v.key !== 'control')?.key ?? arms[0]?.key
      const verdict = res?.stats?.verdict
      const caution =
        verdict && verdict !== 'winner'
          ? `<p class="exp-dialog-warn">${icon('alert', { size: 16 })}<span>The statistics haven’t picked a winner${verdict === 'early' ? ' yet (it’s too early)' : ''}. Promote only if you’re sure.</span></p>`
          : ''
      const options = arms
        .map(
          (v) =>
            `<label class="exp-radio"><input type="radio" name="variant" value="${escapeHtml(v.key)}"${v.key === preferred ? ' checked' : ''} /> ${escapeHtml(armName(exp, v.key))}${v.key === res?.stats?.winner ? ` ${badge('Winner', 'success')}` : ''}</label>`,
        )
        .join('')
      const fd = await confirmDialog({
        title: 'Promote an arm',
        body: `<p class="card-sub">Everyone sees the chosen arm right away and the test stops counting. If GitHub is connected, an issue is opened to bake it into the code.</p>${caution}<div class="exp-radios">${options}</div>`,
        confirmLabel: 'Promote',
      })
      const variant = fd?.get('variant')
      if (variant) run(btn, `${base}/status`, { action: 'promote', variant }, `Promoted ${variant}. Everyone now sees it.`)
      return
    }

    const copy = ACTION_COPY[action]
    if (!copy) return
    const ok = await confirmDialog({
      title: copy.title,
      body: `<p class="card-sub">${escapeHtml(copy.text)}</p>`,
      confirmLabel: copy.confirm,
      danger: copy.danger,
    })
    if (!ok) return
    const done = { start: 'Test started.', pause: 'Test paused.', resume: 'Test resumed.', stop: 'Test stopped.', archive: 'Experiment archived.' }[action]
    if (action === 'archive') {
      flash = null
      try {
        btn.disabled = true
        await ctx.api(`${base}/status`, { method: 'POST', body: JSON.stringify({ action }) })
        flash = { tone: 'ok', text: `Archived “${exp.name}”.` }
        ctx.navigate('experiments')
      } catch (err) {
        setStatus(status, errorText(err), 'error')
        btn.disabled = false
      }
      return
    }
    run(btn, `${base}/status`, { action }, done)
  })
}

async function renderDetail(root, ctx, key) {
  let detail
  try {
    detail = await ctx.api(`/experiments/${encodeURIComponent(key)}`)
  } catch (err) {
    if (err?.status === 503) {
      root.innerHTML = unavailableCard()
      return
    }
    if (err?.status === 404) {
      root.innerHTML = card({
        className: 'col-12',
        title: 'Experiment not found',
        subtitle: `There’s no experiment with the key “${key}”.`,
        body: '<a class="btn btn-outline" href="#/experiments">Back to all experiments</a>',
      })
      return
    }
    throw err
  }
  const exp = detail.experiment ?? detail.data?.experiment ?? detail.data
  const audit = detail.audit ?? detail.data?.audit ?? []

  let res = null
  let resError = null
  if (WITH_RESULTS.has(exp.status) || exp.status === 'archived') {
    try {
      res = (await ctx.api(`/experiments/${encodeURIComponent(exp.key)}/results`)).data ?? null
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) throw err
      resError = err
    }
  }

  root.innerHTML = `${flashHtml()}
${headerCard(exp)}
${verdictBanner(exp, res)}
${resError ? `<div class="exp-flash col-12" data-tone="error">${icon('alert', { size: 18 })}<span>Results couldn’t load: ${escapeHtml(errorText(resError))}</span></div>` : ''}
${actionsCard(exp, res)}
${armCards(exp, res)}
${res ? chartCard(exp, res) : ''}
${res ? statsCard(exp, res) : ''}
${auditCard(audit)}`

  if (res) drawChart(root, exp, res)
  bindActions(root, ctx, exp, res)
}

// ---------- Entry ----------

export async function render(root, ctx) {
  const key = ctx.params?.get('key') ?? new URLSearchParams(location.hash.split('?')[1] ?? '').get('key')
  if (key) return renderDetail(root, ctx, key)
  return renderList(root, ctx)
}
