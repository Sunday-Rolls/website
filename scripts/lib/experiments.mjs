/**
 * Server-side A/B assignment for the Railway SPA server (scripts/serve-spa.mjs).
 * Binding spec: docs/EXPERIMENTS_CONTRACT.md. Zero dependencies.
 */
import { randomBytes } from 'node:crypto'

export const VID_COOKIE = 'sr_vid'
export const VID_MAX_AGE = 15552000 // 180 days
export const VID_RE = /^[A-Za-z0-9_-]{8,64}$/
export const EXPERIMENT_KEY_RE = /^[a-z0-9][a-z0-9-]{1,47}$/
export const VARIANT_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/
export const BOT_RE =
  /bot|crawl|spider|slurp|lighthouse|headlesschrome|playwright|facebookexternalhit|bingpreview|embedly|pinterest|vkshare|w3c_validator|preview/i

const encoder = new TextEncoder()

/** FNV-1a 32-bit over the UTF-8 bytes of `str`. */
export function fnv1a32(str) {
  let h = 2166136261
  for (const b of encoder.encode(String(str))) {
    h ^= b
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Uniform number in [0, 1) derived from `str`. */
export function unit(str) {
  return fnv1a32(str) / 2 ** 32
}

/** Arm for this visitor, or null when they are outside the test's traffic (renders control, no exposure). */
export function assign(exp, vid) {
  if (exp.status === 'promoted') return exp.winner ?? null
  if (unit(`${exp.seed}:traffic:${vid}`) * 100 >= exp.trafficPct) return null
  const u = unit(`${exp.seed}:${vid}`)
  let cum = 0
  for (const v of exp.variants) {
    cum += v.weight / 100
    if (u < cum) return v.key
  }
  return exp.variants[exp.variants.length - 1].key
}

/**
 * True for crawlers and automation. With `{ allowAutomation: true }` (E2E_EXPERIMENTS=1),
 * Playwright / HeadlessChrome are treated as people so tests can exercise arms.
 */
export function isBot(ua, { allowAutomation = false } = {}) {
  if (!ua) return false
  let text = String(ua)
  if (allowAutomation) text = text.replace(/playwright|headlesschrome/gi, '')
  return BOT_RE.test(text)
}

export function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (!name || Object.hasOwn(out, name)) continue
    let value = part.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1)
    try {
      value = decodeURIComponent(value)
    } catch {
      // keep the raw value
    }
    out[name] = value
  }
  return out
}

export function isValidVid(vid) {
  return typeof vid === 'string' && VID_RE.test(vid)
}

/** 22-char base64url of 16 random bytes. */
export function newVisitorId() {
  return randomBytes(16).toString('base64url')
}

export function vidCookie(vid, { secure = false } = {}) {
  return `${VID_COOKIE}=${vid}; Path=/; Max-Age=${VID_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`
}

function validExperiment(exp) {
  if (!exp || typeof exp !== 'object') return null
  const { key, seed, status, trafficPct, variants, winner } = exp
  if (typeof key !== 'string' || !EXPERIMENT_KEY_RE.test(key)) return null
  if (typeof seed !== 'string' || !seed) return null
  if (status !== 'running' && status !== 'promoted') return null
  if (typeof trafficPct !== 'number' || !Number.isFinite(trafficPct) || trafficPct < 0 || trafficPct > 100) return null
  if (!Array.isArray(variants) || variants.length < 2) return null
  const keys = new Set()
  let sum = 0
  for (const v of variants) {
    if (!v || typeof v.key !== 'string' || !VARIANT_KEY_RE.test(v.key) || keys.has(v.key)) return null
    if (!Number.isInteger(v.weight) || v.weight < 0) return null
    keys.add(v.key)
    sum += v.weight
  }
  if (sum !== 100 || !keys.has('control')) return null
  if (status === 'promoted' && (typeof winner !== 'string' || !keys.has(winner))) return null
  return {
    key,
    seed,
    status,
    trafficPct,
    variants: variants.map((v) => ({ key: v.key, weight: v.weight })),
    winner: status === 'promoted' ? winner : null,
  }
}

/** Valid experiments from a config payload; bad or duplicate entries are skipped. Never throws. */
export function validateConfig(config) {
  const list = config && typeof config === 'object' && Array.isArray(config.experiments) ? config.experiments : []
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const exp = validExperiment(raw)
    if (!exp || seen.has(exp.key)) continue
    seen.add(exp.key)
    out.push(exp)
  }
  return out
}

/** The `window.__SR_EXP__` object. `config` is a validated experiment list or a raw payload. */
export function buildState({ config, vid, bot }) {
  if (bot || !isValidVid(vid)) {
    return { vid: null, assignments: {}, tracked: [], bot: Boolean(bot) }
  }
  const experiments = Array.isArray(config) ? config : validateConfig(config)
  const assignments = {}
  const tracked = []
  for (const exp of experiments) {
    let arm = null
    try {
      arm = assign(exp, vid)
    } catch {
      arm = null
    }
    if (arm == null) continue
    assignments[exp.key] = arm
    // Only visitors actually in a running test log exposures; promoted ones just render the winner.
    if (exp.status === 'running') tracked.push(exp.key)
  }
  return { vid, assignments, tracked, bot: false }
}

export function serializeState(state) {
  return JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Inserts the state script before the first `</head>` (or at the very start when there is none). */
export function injectState(html, state) {
  const tag = `<script>window.__SR_EXP__=${serializeState(state)}</script>`
  const idx = html.search(/<\/head\s*>/i)
  if (idx < 0) return tag + html
  return html.slice(0, idx) + tag + html.slice(idx)
}

/**
 * Polls the experiments config. `current()` returns the last good experiment list,
 * or [] when nothing has loaded or the last success is older than `maxStaleMs`.
 */
export function createConfigPoller({
  url,
  fetch: fetchImpl = globalThis.fetch,
  intervalMs = 30000,
  timeoutMs = 2000,
  maxStaleMs = 600000,
  now = Date.now,
  onError = () => {},
} = {}) {
  let experiments = null
  let lastOkAt = 0
  let timer = null
  let inFlight = null

  async function refresh() {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const controller = new AbortController()
      // Not unref'd: it is short-lived and cleared in `finally`; only the poll interval is unref'd.
      const abort = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } })
        if (!res || !res.ok) throw new Error(`experiments config HTTP ${res?.status}`)
        const body = await res.json()
        if (!body || typeof body !== 'object' || !Array.isArray(body.experiments)) {
          throw new Error('experiments config: bad payload')
        }
        experiments = validateConfig(body)
        lastOkAt = now()
        return true
      } catch (error) {
        onError(error)
        return false
      } finally {
        clearTimeout(abort)
        inFlight = null
      }
    })()
    return inFlight
  }

  function current() {
    if (!experiments) return []
    if (now() - lastOkAt > maxStaleMs) return []
    return experiments
  }

  function start() {
    if (timer) return
    void refresh()
    timer = setInterval(() => void refresh(), intervalMs)
    timer.unref?.()
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  return { start, stop, refresh, current }
}
