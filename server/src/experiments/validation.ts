import { randomBytes } from 'node:crypto'
import {
  BEACON_EVENT_TYPES,
  DEFAULT_MAX_DAYS,
  DEFAULT_MIN_DAYS,
  DEFAULT_MIN_VISITORS_PER_ARM,
  PRIMARY_METRICS,
  STATUS_ACTIONS,
  type AuditAction,
  type BeaconEventType,
  type Experiment,
  type ExperimentLimits,
  type ExperimentPatch,
  type ExperimentPrLink,
  type ExperimentVariant,
  type FunnelEventKind,
  type StatusAction,
} from './types.js'

/** Regexes from docs/EXPERIMENTS_CONTRACT.md. */
export const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
export const EXPERIMENT_KEY_RE = /^[a-z0-9][a-z0-9-]{1,47}$/
export const VARIANT_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/
/** Beacon event ids are client UUIDs; accept any short url-safe token. */
export const EVENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
export const EXPERIMENTS_ATTR_MAX = 500
export const MAX_EVENTS_PER_BEACON = 20
export const MAX_BEACON_BYTES = 32_000

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export function isVisitorId(value: unknown): value is string {
  return typeof value === 'string' && VISITOR_ID_RE.test(value)
}

/**
 * `home-banner:b|other:control` → `{ "home-banner": "b", other: "control" }`.
 * Malformed pairs are dropped; null when nothing valid remains or the string is too long.
 */
export function parseExperimentsAttr(value: unknown): Record<string, string> | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > EXPERIMENTS_ATTR_MAX) return null
  const out: Record<string, string> = {}
  for (const pair of text.split('|')) {
    const [key, arm, ...rest] = pair.trim().split(':')
    if (rest.length || !key || !arm) continue
    if (!EXPERIMENT_KEY_RE.test(key) || !VARIANT_KEY_RE.test(arm)) continue
    if (!(key in out)) out[key] = arm
  }
  return Object.keys(out).length ? out : null
}

/** Strict form for request bodies: the whole string must be valid. */
export function parseExperimentsField(value: unknown): Result<Record<string, string> | null> {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  if (typeof value !== 'string' || value.length > EXPERIMENTS_ATTR_MAX) {
    return { ok: false, error: 'Invalid experiments' }
  }
  const pairs = value.split('|')
  const parsed = parseExperimentsAttr(value)
  if (!parsed || Object.keys(parsed).length !== pairs.length) return { ok: false, error: 'Invalid experiments' }
  return { ok: true, value: parsed }
}

export function newSeed(): string {
  return randomBytes(9).toString('base64url')
}

// ---------- Beacon ----------

export type BeaconExposure = {
  id: string
  type: 'exposure'
  experiment: string
  variant: string
  forced: boolean
  path: string | null
  device: string | null
  source: string | null
  at: number | null
}

export type BeaconFunnelEvent = {
  id: string
  type: FunnelEventKind
  value: number | null
  at: number | null
}

export type BeaconEvent = BeaconExposure | BeaconFunnelEvent

export type ParsedBeacon = { vid: string; events: BeaconEvent[]; rejected: number }

/** Validates the beacon envelope; individual malformed events are dropped (counted in `rejected`). */
export function parseBeacon(body: unknown): Result<ParsedBeacon> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Expected JSON object' }
  const record = body as Record<string, unknown>
  if (!isVisitorId(record.vid)) return { ok: false, error: 'Invalid vid' }
  if (!Array.isArray(record.events)) return { ok: false, error: 'events must be an array' }
  if (record.events.length > MAX_EVENTS_PER_BEACON) {
    return { ok: false, error: `At most ${MAX_EVENTS_PER_BEACON} events per request` }
  }
  const events: BeaconEvent[] = []
  let rejected = 0
  for (const raw of record.events) {
    const event = parseBeaconEvent(raw)
    if (event) events.push(event)
    else rejected += 1
  }
  return { ok: true, value: { vid: record.vid, events, rejected } }
}

function parseBeaconEvent(raw: unknown): BeaconEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || !EVENT_ID_RE.test(e.id)) return null
  if (typeof e.type !== 'string' || !(BEACON_EVENT_TYPES as readonly string[]).includes(e.type)) return null
  const at = typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : null
  const type = e.type as BeaconEventType
  if (type === 'exposure') {
    if (typeof e.experiment !== 'string' || !EXPERIMENT_KEY_RE.test(e.experiment)) return null
    if (typeof e.variant !== 'string' || !VARIANT_KEY_RE.test(e.variant)) return null
    return {
      id: e.id,
      type,
      experiment: e.experiment,
      variant: e.variant,
      forced: e.forced === true,
      path: shortString(e.path, 300, (s) => s.startsWith('/')),
      device: shortString(e.device, 16, (s) => /^[a-z]+$/.test(s)),
      source: shortString(e.source, 200),
      at,
    }
  }
  let value: number | null = null
  if (e.value !== undefined && e.value !== null) {
    if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value < 0 || e.value > 1_000_000) return null
    value = Math.round(e.value * 100) / 100
  }
  return { id: e.id, type, value, at }
}

function shortString(value: unknown, max: number, check: (s: string) => boolean = () => true): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s || s.length > max || !check(s)) return null
  return s
}

/**
 * When the event happened. Client clocks are trusted within a day back and not into the future,
 * so exposures and funnel events (both client-stamped) stay in order; anything else is "now".
 */
export function eventTime(at: number | null, now: number): string {
  if (at === null || at < now - 24 * 60 * 60_000) return new Date(now).toISOString()
  return new Date(Math.min(at, now)).toISOString()
}

// ---------- Dashboard: create ----------

export type CreateExperimentInput = {
  key: string
  name: string
  hypothesis: string | null
  primaryMetric: string
  trafficPct: number
  variants: ExperimentVariant[]
} & ExperimentLimits &
  ExperimentPrLink

export const MAX_PATHS = 10
export const MAX_PATH_LENGTH = 300
export const MAX_DAYS_LIMIT = 365
export const MAX_MIN_VISITORS = 10_000_000
const SHA_RE = /^[0-9a-f]{7,64}$/i
const BRANCH_RE = /^[^\s~^:?*\[\\]{1,255}$/

/**
 * Also the registry-file rules (`src/experiments/<key>.json`, CI `upsert`): the registry carries no
 * `trafficPct`, so it defaults to 100.
 */
export function parseCreateExperiment(body: unknown): Result<CreateExperimentInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Expected JSON object' }
  const r = body as Record<string, unknown>
  const key = typeof r.key === 'string' ? r.key.trim() : ''
  if (!EXPERIMENT_KEY_RE.test(key)) {
    return { ok: false, error: 'Key must be 2–48 characters: lowercase letters, digits and dashes' }
  }
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name || name.length > 200) return { ok: false, error: 'Name is required (max 200 characters)' }
  let hypothesis: string | null = null
  if (r.hypothesis !== undefined && r.hypothesis !== null) {
    if (typeof r.hypothesis !== 'string' || r.hypothesis.length > 2000) {
      return { ok: false, error: 'Hypothesis must be text (max 2000 characters)' }
    }
    hypothesis = r.hypothesis.trim() || null
  }
  const primaryMetric = r.primaryMetric === undefined ? 'add_to_cart' : r.primaryMetric
  if (typeof primaryMetric !== 'string' || !(PRIMARY_METRICS as readonly string[]).includes(primaryMetric)) {
    return { ok: false, error: `primaryMetric must be one of ${PRIMARY_METRICS.join(', ')}` }
  }
  const traffic = parseTrafficPct(r.trafficPct === undefined ? 100 : r.trafficPct)
  if (!traffic.ok) return traffic
  const variants = parseVariants(r.variants)
  if (!variants.ok) return variants
  const limits = parseLimits(r)
  if (!limits.ok) return limits
  const pr = parsePrLink(r)
  if (!pr.ok) return pr
  return {
    ok: true,
    value: {
      key,
      name,
      hypothesis,
      primaryMetric,
      trafficPct: traffic.value,
      variants: variants.value,
      ...limits.value,
      ...pr.value,
    },
  }
}

/** `paths` (each starts with `/`, at most 10; a trailing slash is dropped) and the sample gate limits. */
export function parseLimits(r: Record<string, unknown>): Result<ExperimentLimits> {
  const paths = parsePaths(r.paths)
  if (!paths.ok) return paths
  const minVisitors = intField(r.minVisitorsPerArm, DEFAULT_MIN_VISITORS_PER_ARM, 1, MAX_MIN_VISITORS)
  if (minVisitors === null) return { ok: false, error: `minVisitorsPerArm must be an integer from 1 to ${MAX_MIN_VISITORS}` }
  const minDays = intField(r.minDays, DEFAULT_MIN_DAYS, 0, MAX_DAYS_LIMIT)
  if (minDays === null) return { ok: false, error: `minDays must be an integer from 0 to ${MAX_DAYS_LIMIT}` }
  const maxDays = intField(r.maxDays, Math.max(DEFAULT_MAX_DAYS, minDays), 1, MAX_DAYS_LIMIT)
  if (maxDays === null || maxDays < minDays) {
    return { ok: false, error: `maxDays must be an integer from minDays to ${MAX_DAYS_LIMIT}` }
  }
  return { ok: true, value: { paths: paths.value, minVisitorsPerArm: minVisitors, minDays, maxDays } }
}

export function parsePaths(value: unknown): Result<string[]> {
  if (value === undefined || value === null) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.length > MAX_PATHS) {
    return { ok: false, error: `paths must be a list of at most ${MAX_PATHS} paths` }
  }
  const out: string[] = []
  for (const raw of value) {
    const path = typeof raw === 'string' ? normalizePath(raw.trim()) : ''
    if (!path.startsWith('/') || path.length > MAX_PATH_LENGTH || /[\s?#]/.test(path)) {
      return { ok: false, error: `Invalid path "${String(raw)}": paths start with / and have no query or spaces` }
    }
    if (!out.includes(path)) out.push(path)
  }
  return { ok: true, value: out }
}

function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path
}

function intField(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return null
  return value
}

/** Optional `prNumber`, `prUrl`, `branch`, `mergeSha` (dashboard create). */
export function parsePrLink(r: Record<string, unknown>): Result<ExperimentPrLink> {
  const prNumber = r.prNumber === undefined || r.prNumber === null ? null : r.prNumber
  if (prNumber !== null && (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber < 1)) {
    return { ok: false, error: 'prNumber must be a positive integer' }
  }
  const prUrl = optionalString(r.prUrl, 500, (s) => /^https:\/\/\S+$/.test(s))
  if (prUrl === false) return { ok: false, error: 'prUrl must be an https URL' }
  const branch = optionalString(r.branch, 255, (s) => BRANCH_RE.test(s))
  if (branch === false) return { ok: false, error: 'Invalid branch name' }
  const mergeSha = optionalString(r.mergeSha, 64, (s) => SHA_RE.test(s))
  if (mergeSha === false) return { ok: false, error: 'mergeSha must be a git commit hash' }
  return { ok: true, value: { prNumber: prNumber as number | null, prUrl, branch, mergeSha } }
}

/** null when absent/empty, false when present but invalid. */
function optionalString(value: unknown, max: number, check: (s: string) => boolean): string | null | false {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s || s.length > max || !check(s)) return false
  return s
}

// ---------- Overlap rule ----------

/**
 * Keys of other `running` experiments that share a targeted path with `exp`.
 * A site-wide experiment (no paths) conflicts with every other running one.
 */
export function findPathConflicts(exp: Pick<Experiment, 'id' | 'paths'>, others: Experiment[]): string[] {
  return others
    .filter((o) => o.id !== exp.id && o.status === 'running')
    .filter((o) => !exp.paths.length || !o.paths.length || o.paths.some((p) => exp.paths.includes(p)))
    .map((o) => o.key)
    .sort()
}

// ---------- CI (GitHub Actions) ----------

export const CI_ACTIONS = ['upsert', 'merged', 'closed'] as const
export type CiAction = (typeof CI_ACTIONS)[number]
export const MAX_CI_EXPERIMENTS = 50

export type CiRequest = {
  action: CiAction
  pr: { number: number; url: string | null; branch: string | null; mergeSha: string | null }
  experiments: CreateExperimentInput[]
}

/** `POST /experiments/ci` body. Registry objects follow the dashboard create rules. */
export function parseCiRequest(body: unknown): Result<CiRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Expected JSON object' }
  const r = body as Record<string, unknown>
  if (typeof r.action !== 'string' || !(CI_ACTIONS as readonly string[]).includes(r.action)) {
    return { ok: false, error: `action must be one of ${CI_ACTIONS.join(', ')}` }
  }
  const action = r.action as CiAction
  if (!r.pr || typeof r.pr !== 'object' || Array.isArray(r.pr)) return { ok: false, error: 'pr is required' }
  const rawPr = r.pr as Record<string, unknown>
  const link = parsePrLink({ prNumber: rawPr.number, prUrl: rawPr.url, branch: rawPr.branch, mergeSha: rawPr.mergeSha })
  if (!link.ok) return { ok: false, error: link.error.replace(/^prNumber/, 'pr.number').replace(/^prUrl/, 'pr.url') }
  if (link.value.prNumber === null) return { ok: false, error: 'pr.number is required' }
  if (action === 'merged' && !link.value.mergeSha) return { ok: false, error: 'pr.mergeSha is required when merged' }
  const list = r.experiments === undefined ? [] : r.experiments
  if (!Array.isArray(list) || list.length > MAX_CI_EXPERIMENTS) {
    return { ok: false, error: `experiments must be a list of at most ${MAX_CI_EXPERIMENTS} registry objects` }
  }
  if (action === 'upsert' && !list.length) return { ok: false, error: 'upsert needs at least one experiment' }
  const experiments: CreateExperimentInput[] = []
  const keys = new Set<string>()
  for (const [index, raw] of list.entries()) {
    const parsed = parseCreateExperiment(raw)
    const label = raw && typeof raw === 'object' && typeof (raw as { key?: unknown }).key === 'string'
      ? (raw as { key: string }).key
      : `#${index}`
    if (!parsed.ok) return { ok: false, error: `experiments[${index}] (${label}): ${parsed.error}` }
    if (keys.has(parsed.value.key)) return { ok: false, error: `Duplicate experiment key "${parsed.value.key}"` }
    keys.add(parsed.value.key)
    experiments.push(parsed.value)
  }
  return {
    ok: true,
    value: {
      action,
      pr: { number: link.value.prNumber, url: link.value.prUrl, branch: link.value.branch, mergeSha: link.value.mergeSha },
      experiments,
    },
  }
}

export function parseTrafficPct(value: unknown): Result<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    return { ok: false, error: 'trafficPct must be an integer from 0 to 100' }
  }
  return { ok: true, value }
}

function parseVariants(value: unknown): Result<ExperimentVariant[]> {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    return { ok: false, error: 'variants must list 2–8 arms' }
  }
  const seen = new Set<string>()
  const out: ExperimentVariant[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each variant needs a key and weight' }
    const v = raw as Record<string, unknown>
    const key = typeof v.key === 'string' ? v.key.trim() : ''
    if (!VARIANT_KEY_RE.test(key)) return { ok: false, error: `Invalid variant key "${key}"` }
    if (seen.has(key)) return { ok: false, error: `Duplicate variant key "${key}"` }
    seen.add(key)
    if (typeof v.weight !== 'number' || !Number.isInteger(v.weight) || v.weight < 1 || v.weight > 99) {
      return { ok: false, error: 'Variant weights must be integers from 1 to 99' }
    }
    const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 100) : key
    out.push({ key, name, weight: v.weight, isControl: key === 'control' })
  }
  if (!seen.has('control')) return { ok: false, error: 'One variant must be "control"' }
  if (out.reduce((s, v) => s + v.weight, 0) !== 100) return { ok: false, error: 'Variant weights must sum to 100' }
  return { ok: true, value: out }
}

// ---------- Dashboard: status transitions ----------

export function isStatusAction(value: unknown): value is StatusAction {
  return typeof value === 'string' && (STATUS_ACTIONS as readonly string[]).includes(value)
}

export type Transition = { patch: ExperimentPatch; audit: AuditAction; detail: Record<string, unknown> }

/**
 * draft → running (start) · running ⇄ paused · running|paused → stopped ·
 * running|paused|stopped → promoted (with a winner) · draft|stopped|promoted → archived.
 */
export function planTransition(
  exp: Experiment,
  action: StatusAction,
  variant: unknown,
  now: Date,
): { ok: true; value: Transition } | { ok: false; error: string; status: 400 | 409 } {
  const at = now.toISOString()
  const from = exp.status
  const bad = () => ({ ok: false as const, error: `Cannot ${action} an experiment that is ${from}`, status: 409 as const })
  const base = { from }
  switch (action) {
    case 'start':
      if (from !== 'draft') return bad()
      return {
        ok: true,
        value: { patch: { status: 'running', startedAt: at, pausedAt: null }, audit: 'started', detail: { ...base, to: 'running' } },
      }
    case 'pause':
      if (from !== 'running') return bad()
      return { ok: true, value: { patch: { status: 'paused', pausedAt: at }, audit: 'paused', detail: { ...base, to: 'paused' } } }
    case 'resume':
      if (from !== 'paused') return bad()
      return { ok: true, value: { patch: { status: 'running', pausedAt: null }, audit: 'resumed', detail: { ...base, to: 'running' } } }
    case 'stop':
      if (from !== 'running' && from !== 'paused') return bad()
      return {
        ok: true,
        value: { patch: { status: 'stopped', endedAt: at, pausedAt: null }, audit: 'stopped', detail: { ...base, to: 'stopped' } },
      }
    case 'promote': {
      if (from !== 'running' && from !== 'paused' && from !== 'stopped') return bad()
      if (typeof variant !== 'string' || !exp.variants.some((v) => v.key === variant)) {
        return { ok: false, error: 'promote needs a variant that belongs to this experiment', status: 400 }
      }
      return {
        ok: true,
        value: {
          patch: { status: 'promoted', winnerVariant: variant, endedAt: exp.endedAt ?? at, pausedAt: null },
          audit: 'promoted',
          detail: { ...base, to: 'promoted', variant },
        },
      }
    }
    case 'archive':
      if (from !== 'draft' && from !== 'stopped' && from !== 'promoted') return bad()
      return { ok: true, value: { patch: { status: 'archived' }, audit: 'archived', detail: { ...base, to: 'archived' } } }
  }
}

export function canChangeTraffic(exp: Experiment): boolean {
  return exp.status === 'draft' || exp.status === 'running' || exp.status === 'paused'
}
