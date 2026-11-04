/**
 * Experiments runtime (Phase 1). Contract: docs/EXPERIMENTS_CONTRACT.md.
 *
 * Boot order (`bootExperiments()`, called from main.tsx before render):
 *  1. `?sr_force=key:arm,...` → sessionStorage.sr_force (QA override for the tab).
 *  2. `window.__SR_EXP__` from the Railway SPA server, when present: ready immediately.
 *  3. Otherwise (Pages, previews, dev): visitor id from cookie → localStorage → new (both written),
 *     then fetch the config and assign in the browser. Until it arrives everything is control
 *     and nothing is logged.
 *
 * The store is a tiny external store for React's useSyncExternalStore. It never throws: storage,
 * network and beacon failures all degrade to "control, nothing logged".
 */
import { useSyncExternalStore } from 'react'
import { contactApiBaseUrl } from '@/lib/api-base'
import { currentTouch } from '@/lib/attribution'
import {
  BOT_UA_PATTERN,
  assignAll,
  formatExpString,
  isValidVid,
  parseForce,
  type ExperimentsConfigResponse,
  type InjectedExperimentState,
} from '@/lib/experiments-core'

declare global {
  interface Window {
    __SR_EXP__?: InjectedExperimentState
  }
}

export type ExperimentsSnapshot = {
  vid: string | null
  /** Experiment key → arm, for experiments where the visitor is in the test (or promoted). */
  assignments: Readonly<Record<string, string>>
  /** Keys with status `running`: the only ones that log exposures. */
  tracked: readonly string[]
  /** sessionStorage `sr_force` overrides for this tab. */
  forced: Readonly<Record<string, string>>
  bot: boolean
  /** False while the fallback config is still loading (everything renders control). */
  ready: boolean
  /** Non-forced exposures so far (`localStorage.sr_exp_seen`). */
  seen: Readonly<Record<string, string>>
}

export type ExperimentEventType =
  | 'add_to_cart'
  | 'begin_checkout'
  | 'contact_submit'
  | 'newsletter_subscribe'

type BeaconEvent = {
  id: string
  type: 'exposure' | ExperimentEventType
  at: number
  experiment?: string
  variant?: string
  forced?: boolean
  path?: string
  device?: 'mobile' | 'tablet' | 'desktop'
  source?: string
  value?: number
}

const VID_KEY = 'sr_vid'
const SEEN_KEY = 'sr_exp_seen'
const FORCE_KEY = 'sr_force'
const VID_MAX_AGE_S = 15552000
const MAX_EVENTS_PER_REQUEST = 20

const EMPTY: ExperimentsSnapshot = {
  vid: null,
  assignments: {},
  tracked: [],
  forced: {},
  bot: false,
  ready: false,
  seen: {},
}

let state: ExperimentsSnapshot = EMPTY
let booted = false
const listeners = new Set<() => void>()
let queue: BeaconEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
/** Forced exposures are deduped per page load only (they never touch sr_exp_seen). */
const forcedExposed = new Set<string>()

function setState(patch: Partial<ExperimentsSnapshot>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

// ---------- storage helpers (all best-effort) ----------

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value)
  } catch {
    // private mode / quota: best-effort
  }
}

const local = () => window.localStorage
const session = () => window.sessionStorage

function readCookie(name: string): string | null {
  try {
    const match = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null
  } catch {
    return null
  }
}

function writeCookie(name: string, value: string): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${VID_MAX_AGE_S}; SameSite=Lax${secure}`
  } catch {
    // ignore
  }
}

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  try {
    crypto.getRandomValues(bytes)
  } catch {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

/** 22-char base64url of 16 random bytes (contract). */
export function newVisitorId(): string {
  return base64url(randomBytes(16))
}

function uuid(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // fall through
  }
  const b = randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readSeen(): Record<string, string> {
  try {
    const raw = safeGet(local, SEEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, arm] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof arm === 'string') out[key] = arm
    }
    return out
  } catch {
    return {}
  }
}

function readForce(search: string): Record<string, string> {
  try {
    const param = new URLSearchParams(search).get(FORCE_KEY)
    if (param !== null) {
      // `?sr_force=` (empty) or `?sr_force=clear` clears the tab's override.
      if (param === '' || param === 'clear') {
        try {
          session().removeItem(FORCE_KEY)
        } catch {
          // ignore
        }
        return {}
      }
      const parsed = parseForce(param)
      safeSet(session, FORCE_KEY, formatForce(parsed))
      return parsed
    }
  } catch {
    // ignore malformed URL
  }
  return parseForce(safeGet(session, FORCE_KEY))
}

function formatForce(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
}

function isInjected(value: unknown): value is InjectedExperimentState {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<InjectedExperimentState>
  return typeof v.assignments === 'object' && v.assignments !== null && Array.isArray(v.tracked)
}

function isBotUa(): boolean {
  try {
    return BOT_UA_PATTERN.test(navigator.userAgent)
  } catch {
    return false
  }
}

// ---------- config ----------

export function experimentsConfigUrl(): string | null {
  const configured = (import.meta.env.VITE_EXPERIMENTS_CONFIG_URL as string | undefined)?.trim()
  if (configured) return configured
  const base = contactApiBaseUrl()
  return base ? `${base}/experiments/config` : null
}

export function experimentsEventsUrl(): string | null {
  const base = contactApiBaseUrl()
  if (base) return `${base}/experiments/events`
  const config = experimentsConfigUrl()
  if (config && /\/experiments\/config\/?$/.test(config)) {
    return config.replace(/\/experiments\/config\/?$/, '/experiments/events')
  }
  return null
}

async function loadFallbackConfig(vid: string): Promise<void> {
  const url = experimentsConfigUrl()
  if (!url) return
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) return
    const body = (await response.json()) as ExperimentsConfigResponse
    if (!body || !Array.isArray(body.experiments)) return
    const { assignments, tracked } = assignAll(body.experiments, vid)
    setState({ assignments, tracked, ready: true })
  } catch {
    // Config unreachable: everyone stays control, nothing is logged.
  }
}

// ---------- boot ----------

export type BootOptions = {
  /** Defaults to window.location.search. */
  search?: string
  /** Skip the fallback config fetch (tests). */
  fetchConfig?: boolean
}

/** Idempotent. Synchronous when `__SR_EXP__` is injected; the fallback config arrives later. */
export function bootExperiments(options: BootOptions = {}): void {
  if (booted || typeof window === 'undefined') return
  booted = true

  const forced = readForce(options.search ?? window.location.search)
  const seen = readSeen()
  const injected = window.__SR_EXP__

  if (isInjected(injected)) {
    const bot = Boolean(injected.bot)
    state = {
      vid: !bot && isValidVid(injected.vid) ? injected.vid : null,
      assignments: { ...injected.assignments },
      tracked: injected.tracked.filter((k): k is string => typeof k === 'string'),
      forced,
      bot,
      ready: true,
      seen,
    }
  } else {
    const bot = isBotUa()
    let vid: string | null = null
    if (!bot) {
      const fromCookie = readCookie(VID_KEY)
      const fromStorage = safeGet(local, VID_KEY)
      vid = isValidVid(fromCookie) ? fromCookie : isValidVid(fromStorage) ? fromStorage : newVisitorId()
      writeCookie(VID_KEY, vid)
      safeSet(local, VID_KEY, vid)
    }
    state = { ...EMPTY, vid, forced, bot, seen }
    if (vid && options.fetchConfig !== false) void loadFallbackConfig(vid)
  }

  pushExperimentContext()
  try {
    window.addEventListener('pagehide', () => flushExperimentEvents())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushExperimentEvents()
    })
  } catch {
    // ignore
  }
  for (const listener of listeners) listener()
}

// ---------- reads ----------

export function getExperimentsSnapshot(): ExperimentsSnapshot {
  return state
}

export function subscribeExperiments(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The arm to render: forced → assigned (once ready) → `control`. */
export function variantFrom(snapshot: ExperimentsSnapshot, key: string): string {
  return snapshot.forced[key] ?? (snapshot.ready ? snapshot.assignments[key] : undefined) ?? 'control'
}

export function getVariant(key: string): string {
  return variantFrom(state, key)
}

/** Whether rendering this experiment should log an exposure. */
export function shouldRecordExposure(snapshot: ExperimentsSnapshot, key: string): boolean {
  if (snapshot.bot || !snapshot.vid) return false
  if (snapshot.forced[key]) return true
  return snapshot.ready && snapshot.tracked.includes(key) && snapshot.assignments[key] != null
}

export function visitorId(): string | null {
  return state.vid
}

/** `_sr_exp` / `exp_variants`: non-forced exposures, keys sorted. Empty string when none. */
export function experimentString(): string {
  return formatExpString(state.seen)
}

/** React: re-renders when assignments, the config or exposures change. */
export function useExperimentsSnapshot(): ExperimentsSnapshot {
  return useSyncExternalStore(subscribeExperiments, getExperimentsSnapshot, getExperimentsSnapshot)
}

// ---------- logging ----------

function deviceType(): 'mobile' | 'tablet' | 'desktop' {
  try {
    const ua = navigator.userAgent
    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
    if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile'
    if (window.matchMedia?.('(max-width: 767px)').matches) return 'mobile'
  } catch {
    // ignore
  }
  return 'desktop'
}

function trafficSource(): string | undefined {
  try {
    const touch = currentTouch()
    if (!touch) return undefined
    return touch.medium ? `${touch.source} / ${touch.medium}` : touch.source
  } catch {
    return undefined
  }
}

function pushDataLayer(entry: Record<string, unknown>): void {
  try {
    window.dataLayer = window.dataLayer ?? []
    window.dataLayer.push(entry)
  } catch {
    // ignore
  }
}

/** Persistent dataLayer vars for GTM (`sr_experiments`, `sr_vid`); no `event`, so no trigger fires. */
function pushExperimentContext(): void {
  const experiments = experimentString()
  if (!experiments && !state.vid) return
  pushDataLayer({ sr_experiments: experiments || undefined, sr_vid: state.vid ?? undefined })
}

function enqueue(event: BeaconEvent): void {
  queue.push(event)
  if (flushTimer != null) return
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushExperimentEvents()
    }, 0)
  } catch {
    flushExperimentEvents()
  }
}

function send(url: string, body: string): void {
  try {
    if (typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return
    }
  } catch {
    // fall back to fetch
  }
  try {
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' },
    }).catch(() => undefined)
  } catch {
    // never throw
  }
}

/** Sends any queued events now (also runs on pagehide / tab hidden). */
export function flushExperimentEvents(): void {
  if (flushTimer != null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!queue.length) return
  const vid = state.vid
  const url = experimentsEventsUrl()
  const events = queue
  queue = []
  if (!vid || !url || state.bot) return
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
    send(url, JSON.stringify({ vid, events: events.slice(i, i + MAX_EVENTS_PER_REQUEST) }))
  }
}

/**
 * Log that the visitor saw `key`. Once per experiment per visitor (sr_exp_seen) for real
 * assignments, once per page load for forced arms. No-op when not eligible.
 */
export function recordExposure(key: string): void {
  if (typeof window === 'undefined' || !shouldRecordExposure(state, key)) return
  const forced = Boolean(state.forced[key])
  const variant = variantFrom(state, key)

  if (forced) {
    if (forcedExposed.has(key)) return
    forcedExposed.add(key)
  } else {
    const seen = readSeen()
    if (seen[key] || state.seen[key]) {
      if (!state.seen[key]) setState({ seen: { ...state.seen, ...seen } })
      return
    }
    const nextSeen = { ...state.seen, ...seen, [key]: variant }
    safeSet(local, SEEN_KEY, JSON.stringify(nextSeen))
    setState({ seen: nextSeen })
  }

  enqueue({
    id: uuid(),
    type: 'exposure',
    experiment: key,
    variant,
    forced,
    path: window.location.pathname,
    device: deviceType(),
    source: trafficSource(),
    at: Date.now(),
  })

  if (!forced) {
    pushExperimentContext()
    const expVariants = experimentString()
    pushDataLayer({
      event: 'experiment_exposure',
      experiment_id: key,
      variant_id: variant,
      ...(expVariants ? { exp_variants: expVariants } : {}),
    })
  }
}

const FUNNEL_EVENTS = new Set<string>(['add_to_cart', 'begin_checkout', 'contact_submit', 'newsletter_subscribe'])

export function isExperimentFunnelEvent(event: string): event is ExperimentEventType {
  return FUNNEL_EVENTS.has(event)
}

/** Funnel step for experiment results. Ignored for bots and when there is no visitor id. */
export function trackExperimentEvent(type: ExperimentEventType, value?: number): void {
  if (typeof window === 'undefined' || state.bot || !state.vid) return
  enqueue({
    id: uuid(),
    type,
    at: Date.now(),
    ...(typeof value === 'number' && Number.isFinite(value) ? { value } : {}),
  })
}

/** Test-only: forget everything so the next boot starts fresh. */
export function __resetExperimentsForTests(): void {
  state = EMPTY
  booted = false
  queue = []
  if (flushTimer != null) clearTimeout(flushTimer)
  flushTimer = null
  forcedExposed.clear()
  listeners.clear()
}
