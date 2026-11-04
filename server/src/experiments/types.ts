/** Experiments (A/B tests). Shapes shared with the browser are in docs/EXPERIMENTS_CONTRACT.md. */

export const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'stopped', 'promoted', 'archived'] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

/** Browser-reported funnel steps (everything the beacon sends except `exposure`). */
export const FUNNEL_EVENT_KINDS = ['add_to_cart', 'begin_checkout', 'contact_submit', 'newsletter_subscribe'] as const
export type FunnelEventKind = (typeof FUNNEL_EVENT_KINDS)[number]

export const BEACON_EVENT_TYPES = ['exposure', ...FUNNEL_EVENT_KINDS] as const
export type BeaconEventType = (typeof BEACON_EVENT_TYPES)[number]

/** Metrics an experiment can be judged on. Purchases and revenue come from Shopify orders. */
export const PRIMARY_METRICS = [...FUNNEL_EVENT_KINDS, 'purchase', 'revenue_per_visitor'] as const
export type PrimaryMetric = (typeof PRIMARY_METRICS)[number]

export const STATUS_ACTIONS = ['start', 'pause', 'resume', 'stop', 'promote', 'archive'] as const
export type StatusAction = (typeof STATUS_ACTIONS)[number]

/** Metrics with a per-visitor rate (`rates` in results, one comparison each). */
export const RATE_METRICS = [...FUNNEL_EVENT_KINDS, 'purchase'] as const
export type RateMetric = (typeof RATE_METRICS)[number]

export const EXPERIMENT_SOURCES = ['dashboard', 'github'] as const
export type ExperimentSource = (typeof EXPERIMENT_SOURCES)[number]

export const DEFAULT_MIN_VISITORS_PER_ARM = 1000
export const DEFAULT_MIN_DAYS = 14
export const DEFAULT_MAX_DAYS = 42

export type ExperimentVariant = {
  key: string
  name: string
  /** Integer percentage; an experiment's weights sum to 100. */
  weight: number
  isControl: boolean
}

export type Experiment = {
  id: string
  key: string
  name: string
  hypothesis: string | null
  status: ExperimentStatus
  seed: string
  trafficPct: number
  primaryMetric: string
  winnerVariant: string | null
  startedAt: string | null
  pausedAt: string | null
  endedAt: string | null
  /** Dashboard user email. */
  createdBy: string | null
  createdAt: string
  updatedAt: string
  /** In assignment order (the hash walks cumulative weights in this order). */
  variants: ExperimentVariant[]
  /** Targeted paths such as `["/"]`; empty means site-wide. */
  paths: string[]
  minVisitorsPerArm: number
  minDays: number
  maxDays: number
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  mergeSha: string | null
  source: ExperimentSource
}

/** Experiment fields set from the dashboard form or a registry file (`src/experiments/<key>.json`). */
export type ExperimentLimits = Pick<Experiment, 'paths' | 'minVisitorsPerArm' | 'minDays' | 'maxDays'>
export type ExperimentPrLink = Pick<Experiment, 'prNumber' | 'prUrl' | 'branch' | 'mergeSha'>

export type NewExperiment = {
  key: string
  name: string
  hypothesis: string | null
  seed: string
  trafficPct: number
  primaryMetric: string
  variants: ExperimentVariant[]
  createdBy: string | null
} & Partial<ExperimentLimits & ExperimentPrLink & { source: ExperimentSource }>

export type ExperimentPatch = Partial<
  Pick<
    Experiment,
    | 'status'
    | 'trafficPct'
    | 'winnerVariant'
    | 'startedAt'
    | 'pausedAt'
    | 'endedAt'
    | 'name'
    | 'hypothesis'
    | 'primaryMetric'
    | 'variants'
    | 'paths'
    | 'minVisitorsPerArm'
    | 'minDays'
    | 'maxDays'
    | 'prNumber'
    | 'prUrl'
    | 'branch'
    | 'mergeSha'
  >
>

export type ExposureRow = {
  experimentId: string
  visitorId: string
  variantKey: string
  firstExposedAt: string
  landingPath: string | null
  device: string | null
  source: string | null
  forced: boolean
}

export type FunnelEventRow = {
  dedupeKey: string
  visitorId: string
  kind: FunnelEventKind
  value: number | null
  occurredAt: string
}

/** A Shopify (or other channel) order carrying `_sr_vid` / `_sr_exp` cart attributes. */
export type ExperimentOrderRow = {
  channel: string
  externalId: string
  orderedAt: string
  revenue: number
  visitorId: string | null
  /** `{ "home-banner": "b" }`, parsed from `_sr_exp`. */
  experiments: Record<string, string>
}

export type AuditAction =
  | 'created'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'promoted'
  | 'archived'
  | 'traffic_changed'
  /** Draft fields changed from a registry file (CI `upsert`). */
  | 'updated'
  /** The linked PR merged (CI `merged`). */
  | 'merged'
  /** The conclusion `repository_dispatch` to GitHub failed. */
  | 'dispatch_failed'

export type AuditEntry = {
  id: number
  experimentId: string
  actor: string
  action: AuditAction
  detail: Record<string, unknown> | null
  at: string
}

export type ArmExposureCounts = { visitors: number; forced: number }

/** Raw per-arm numbers. No statistics yet (Phase 2). */
export type ArmResults = {
  variant: string
  /** Non-forced exposures. */
  visitors: number
  /** Forced (QA) exposures, never counted elsewhere. */
  forcedVisitors: number
  /** Distinct exposed visitors with that event after first exposure (and before ended_at). */
  events: Record<FunnelEventKind, number>
  /** Orders matched by visitor id after first exposure (and before ended_at). */
  orders: number
  purchasers: number
  revenue: number
  /** Orders whose `_sr_exp` names this arm, matched or not (started_at..ended_at). */
  taggedOrders: number
  /** Tagged orders with no exposure row for their visitor: a measure of beacon loss. */
  beaconMissingOrders: number
}

export type ExperimentResults = {
  key: string
  status: ExperimentStatus
  startedAt: string | null
  endedAt: string | null
  arms: ArmResults[]
}

/** Per-arm revenue of each exposed visitor who bought (visitors without orders are implied zeros). */
export type VisitorRevenue = Record<string, number[]>

/** New (not cumulative) counts for one arm on one UTC day. */
export type DailyCountRow = { date: string; variant: string; visitors: number; conversions: number }
