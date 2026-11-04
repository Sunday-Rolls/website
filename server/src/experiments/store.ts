import { randomUUID } from 'node:crypto'
import {
  FUNNEL_EVENT_KINDS,
  type ArmExposureCounts,
  type ArmResults,
  type AuditAction,
  type AuditEntry,
  type Experiment,
  type ExperimentOrderRow,
  type ExperimentPatch,
  type ExperimentResults,
  type ExperimentStatus,
  type ExposureRow,
  type FunnelEventKind,
  type FunnelEventRow,
  type NewExperiment,
} from './types.js'

/** What the Shopify order sync needs: optional, so the sync works without experiments. */
export interface ExperimentOrderSink {
  upsertOrders(rows: ExperimentOrderRow[]): Promise<number>
  deleteOrders(channel: string, externalIds: string[]): Promise<number>
}

export interface ExperimentStore extends ExperimentOrderSink {
  migrate(): Promise<void>
  list(): Promise<Experiment[]>
  /** Only `running` and `promoted`, for the public config. */
  listLive(): Promise<Experiment[]>
  getByKey(key: string): Promise<Experiment | null>
  /** Throws `ExperimentKeyTakenError` when the key exists. */
  create(input: NewExperiment): Promise<Experiment>
  update(id: string, patch: ExperimentPatch): Promise<Experiment>
  addAudit(entry: { experimentId: string; actor: string; action: AuditAction; detail?: Record<string, unknown> | null }): Promise<void>
  listAudit(experimentId: string): Promise<AuditEntry[]>
  /** experimentId → variant → counts. */
  exposureCounts(): Promise<Map<string, Record<string, ArmExposureCounts>>>
  /**
   * First exposure wins per (experiment, visitor). A real exposure replaces an earlier forced (QA) one,
   * so previewing an arm never locks a visitor out of the test. Returns rows written.
   */
  recordExposures(rows: ExposureRow[]): Promise<number>
  /** Deduped by `dedupeKey`. Returns rows written. */
  recordEvents(rows: FunnelEventRow[]): Promise<number>
  results(exp: Experiment): Promise<ExperimentResults>
}

export class ExperimentKeyTakenError extends Error {
  constructor(key: string) {
    super(`An experiment with key "${key}" already exists`)
  }
}

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>
}

export const EXPERIMENTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  hypothesis text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','running','paused','stopped','promoted','archived')),
  seed text NOT NULL,
  traffic_pct smallint NOT NULL DEFAULT 100 CHECK (traffic_pct BETWEEN 0 AND 100),
  targeting jsonb NOT NULL DEFAULT '{}',
  primary_metric text NOT NULL DEFAULT 'add_to_cart',
  guardrail_metrics text[] NOT NULL DEFAULT '{purchase,revenue_per_visitor}',
  min_visitors_per_arm integer NOT NULL DEFAULT 1000,
  min_days smallint NOT NULL DEFAULT 14,
  winner_variant text,
  pr_number integer,
  pr_url text,
  branch text,
  merge_sha text,
  started_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment_variants (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  weight smallint NOT NULL,
  is_control boolean NOT NULL DEFAULT false,
  position smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (experiment_id, key)
);

CREATE TABLE IF NOT EXISTS experiment_exposures (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  variant_key text NOT NULL,
  first_exposed_at timestamptz NOT NULL,
  landing_path text,
  device text,
  source text,
  forced boolean NOT NULL DEFAULT false,
  PRIMARY KEY (experiment_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS experiment_exposures_variant_idx
  ON experiment_exposures (experiment_id, variant_key, first_exposed_at);
CREATE INDEX IF NOT EXISTS experiment_exposures_visitor_idx ON experiment_exposures (visitor_id);

CREATE TABLE IF NOT EXISTS experiment_events (
  id bigserial PRIMARY KEY,
  visitor_id text NOT NULL,
  kind text NOT NULL,
  value numeric(12,2),
  occurred_at timestamptz NOT NULL,
  dedupe_key text UNIQUE
);
CREATE INDEX IF NOT EXISTS experiment_events_visitor_idx ON experiment_events (visitor_id, occurred_at);

CREATE TABLE IF NOT EXISTS experiment_orders (
  channel text NOT NULL,
  external_id text NOT NULL,
  ordered_at timestamptz NOT NULL,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  visitor_id text,
  experiments jsonb NOT NULL DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, external_id)
);
CREATE INDEX IF NOT EXISTS experiment_orders_visitor_idx ON experiment_orders (visitor_id, ordered_at);

CREATE TABLE IF NOT EXISTS experiment_audit (
  id bigserial PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiment_audit_experiment_idx ON experiment_audit (experiment_id, at DESC);
`

const EXPERIMENT_COLUMNS = `id, key, name, hypothesis, status, seed, traffic_pct, primary_metric, winner_variant,
  started_at, paused_at, ended_at, created_by, created_at, updated_at`

const PATCH_COLUMNS: Record<keyof ExperimentPatch, string> = {
  status: 'status',
  trafficPct: 'traffic_pct',
  winnerVariant: 'winner_variant',
  startedAt: 'started_at',
  pausedAt: 'paused_at',
  endedAt: 'ended_at',
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function emptyEvents(): Record<FunnelEventKind, number> {
  return Object.fromEntries(FUNNEL_EVENT_KINDS.map((k) => [k, 0])) as Record<FunnelEventKind, number>
}

function emptyArm(variant: string): ArmResults {
  return {
    variant,
    visitors: 0,
    forcedVisitors: 0,
    events: emptyEvents(),
    orders: 0,
    purchasers: 0,
    revenue: 0,
    taggedOrders: 0,
    beaconMissingOrders: 0,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function createPgExperimentStore(db: Queryable): ExperimentStore {
  async function loadVariants(ids: string[]) {
    const byExperiment = new Map<string, Experiment['variants']>()
    if (!ids.length) return byExperiment
    const { rows } = await db.query(
      `SELECT experiment_id, key, name, weight, is_control FROM experiment_variants
       WHERE experiment_id = ANY($1::uuid[]) ORDER BY experiment_id, position, key`,
      [ids],
    )
    for (const row of rows) {
      const id = String(row.experiment_id)
      const list = byExperiment.get(id) ?? []
      list.push({ key: String(row.key), name: String(row.name), weight: Number(row.weight), isControl: Boolean(row.is_control) })
      byExperiment.set(id, list)
    }
    return byExperiment
  }

  async function hydrate(rows: Record<string, unknown>[]): Promise<Experiment[]> {
    const variants = await loadVariants(rows.map((r) => String(r.id)))
    return rows.map((row) => ({
      id: String(row.id),
      key: String(row.key),
      name: String(row.name),
      hypothesis: row.hypothesis == null ? null : String(row.hypothesis),
      status: String(row.status) as ExperimentStatus,
      seed: String(row.seed),
      trafficPct: Number(row.traffic_pct),
      primaryMetric: String(row.primary_metric),
      winnerVariant: row.winner_variant == null ? null : String(row.winner_variant),
      startedAt: iso(row.started_at),
      pausedAt: iso(row.paused_at),
      endedAt: iso(row.ended_at),
      createdBy: row.created_by == null ? null : String(row.created_by),
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
      variants: variants.get(String(row.id)) ?? [],
    }))
  }

  async function getByKey(key: string): Promise<Experiment | null> {
    const { rows } = await db.query(`SELECT ${EXPERIMENT_COLUMNS} FROM experiments WHERE key = $1`, [key])
    return rows.length ? (await hydrate(rows))[0]! : null
  }

  return {
    async migrate() {
      await db.query(EXPERIMENTS_SCHEMA_SQL)
    },

    async list() {
      const { rows } = await db.query(`SELECT ${EXPERIMENT_COLUMNS} FROM experiments ORDER BY created_at DESC`)
      return hydrate(rows)
    },

    async listLive() {
      const { rows } = await db.query(
        `SELECT ${EXPERIMENT_COLUMNS} FROM experiments WHERE status IN ('running','promoted') ORDER BY key`,
      )
      return hydrate(rows)
    },

    getByKey,

    async create(input) {
      const id = randomUUID()
      // One statement (the pool hands each query its own client, so no BEGIN/COMMIT).
      const { rows } = await db.query(
        `WITH e AS (
           INSERT INTO experiments (id, key, name, hypothesis, seed, traffic_pct, primary_metric, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (key) DO NOTHING RETURNING id
         )
         INSERT INTO experiment_variants (experiment_id, key, name, weight, is_control, position)
         SELECT e.id, v.key, v.name, v.weight, v.is_control, v.position - 1
         FROM e, unnest($9::text[], $10::text[], $11::int[], $12::boolean[])
           WITH ORDINALITY AS v(key, name, weight, is_control, position)
         RETURNING experiment_id`,
        [
          id,
          input.key,
          input.name,
          input.hypothesis,
          input.seed,
          input.trafficPct,
          input.primaryMetric,
          input.createdBy,
          input.variants.map((v) => v.key),
          input.variants.map((v) => v.name),
          input.variants.map((v) => v.weight),
          input.variants.map((v) => v.isControl),
        ],
      )
      if (!rows.length) throw new ExperimentKeyTakenError(input.key)
      return (await getByKey(input.key))!
    },

    async update(id, patch) {
      const sets: string[] = []
      const params: unknown[] = [id]
      for (const [field, column] of Object.entries(PATCH_COLUMNS) as [keyof ExperimentPatch, string][]) {
        if (!(field in patch)) continue
        params.push(patch[field])
        sets.push(`${column} = $${params.length}`)
      }
      sets.push('updated_at = now()')
      const { rows } = await db.query(
        `UPDATE experiments SET ${sets.join(', ')} WHERE id = $1 RETURNING ${EXPERIMENT_COLUMNS}`,
        params,
      )
      if (!rows.length) throw new Error('Experiment not found')
      return (await hydrate(rows))[0]!
    },

    async addAudit({ experimentId, actor, action, detail }) {
      await db.query(`INSERT INTO experiment_audit (experiment_id, actor, action, detail) VALUES ($1, $2, $3, $4)`, [
        experimentId,
        actor,
        action,
        detail ? JSON.stringify(detail) : null,
      ])
    },

    async listAudit(experimentId) {
      const { rows } = await db.query(
        `SELECT id, experiment_id, actor, action, detail, at FROM experiment_audit
         WHERE experiment_id = $1 ORDER BY at DESC, id DESC`,
        [experimentId],
      )
      return rows.map((row) => ({
        id: Number(row.id),
        experimentId: String(row.experiment_id),
        actor: String(row.actor),
        action: String(row.action) as AuditAction,
        detail: (row.detail as Record<string, unknown> | null) ?? null,
        at: iso(row.at)!,
      }))
    },

    async exposureCounts() {
      const { rows } = await db.query(
        `SELECT experiment_id, variant_key,
                COUNT(*) FILTER (WHERE NOT forced)::int AS visitors,
                COUNT(*) FILTER (WHERE forced)::int AS forced
         FROM experiment_exposures GROUP BY 1, 2`,
      )
      const out = new Map<string, Record<string, ArmExposureCounts>>()
      for (const row of rows) {
        const id = String(row.experiment_id)
        const arms = out.get(id) ?? {}
        arms[String(row.variant_key)] = { visitors: Number(row.visitors), forced: Number(row.forced) }
        out.set(id, arms)
      }
      return out
    },

    async recordExposures(rows) {
      let written = 0
      for (const r of rows) {
        const result = await db.query(
          `INSERT INTO experiment_exposures
             (experiment_id, visitor_id, variant_key, first_exposed_at, landing_path, device, source, forced)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (experiment_id, visitor_id) DO UPDATE SET
             variant_key = EXCLUDED.variant_key, first_exposed_at = EXCLUDED.first_exposed_at,
             landing_path = EXCLUDED.landing_path, device = EXCLUDED.device, source = EXCLUDED.source,
             forced = false
           WHERE experiment_exposures.forced AND NOT EXCLUDED.forced
           RETURNING visitor_id`,
          [r.experimentId, r.visitorId, r.variantKey, r.firstExposedAt, r.landingPath, r.device, r.source, r.forced],
        )
        written += result.rows.length
      }
      return written
    },

    async recordEvents(rows) {
      let written = 0
      for (const r of rows) {
        const result = await db.query(
          `INSERT INTO experiment_events (visitor_id, kind, value, occurred_at, dedupe_key)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
          [r.visitorId, r.kind, r.value, r.occurredAt, r.dedupeKey],
        )
        written += result.rows.length
      }
      return written
    },

    async upsertOrders(rows) {
      for (const r of rows) {
        await db.query(
          `INSERT INTO experiment_orders (channel, external_id, ordered_at, revenue, visitor_id, experiments)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (channel, external_id) DO UPDATE SET
             ordered_at = EXCLUDED.ordered_at, revenue = EXCLUDED.revenue, visitor_id = EXCLUDED.visitor_id,
             experiments = EXCLUDED.experiments, synced_at = now()`,
          [r.channel, r.externalId, r.orderedAt, r.revenue, r.visitorId, JSON.stringify(r.experiments)],
        )
      }
      return rows.length
    },

    async deleteOrders(channel, externalIds) {
      if (!externalIds.length) return 0
      const { rows } = await db.query(
        `DELETE FROM experiment_orders WHERE channel = $1 AND external_id = ANY($2::text[]) RETURNING external_id`,
        [channel, externalIds],
      )
      return rows.length
    },

    async results(exp) {
      const arms = new Map(exp.variants.map((v) => [v.key, emptyArm(v.key)]))
      const arm = (key: string) => {
        let a = arms.get(key)
        if (!a) arms.set(key, (a = emptyArm(key)))
        return a
      }
      const id = exp.id
      const endedAt = exp.endedAt

      const visitors = await db.query(
        `SELECT variant_key, COUNT(*) FILTER (WHERE NOT forced)::int AS visitors,
                COUNT(*) FILTER (WHERE forced)::int AS forced
         FROM experiment_exposures WHERE experiment_id = $1 GROUP BY 1`,
        [id],
      )
      for (const row of visitors.rows) {
        const a = arm(String(row.variant_key))
        a.visitors = Number(row.visitors)
        a.forcedVisitors = Number(row.forced)
      }

      const events = await db.query(
        `SELECT x.variant_key, e.kind, COUNT(DISTINCT e.visitor_id)::int AS n
         FROM experiment_exposures x
         JOIN experiment_events e ON e.visitor_id = x.visitor_id
           AND e.occurred_at >= x.first_exposed_at
           AND ($2::timestamptz IS NULL OR e.occurred_at <= $2::timestamptz)
         WHERE x.experiment_id = $1 AND NOT x.forced
         GROUP BY 1, 2`,
        [id, endedAt],
      )
      for (const row of events.rows) {
        const kind = String(row.kind) as FunnelEventKind
        if ((FUNNEL_EVENT_KINDS as readonly string[]).includes(kind)) arm(String(row.variant_key)).events[kind] = Number(row.n)
      }

      const orders = await db.query(
        `SELECT x.variant_key, COUNT(*)::int AS orders, COUNT(DISTINCT o.visitor_id)::int AS purchasers,
                COALESCE(SUM(o.revenue), 0)::float8 AS revenue
         FROM experiment_exposures x
         JOIN experiment_orders o ON o.visitor_id = x.visitor_id
           AND o.ordered_at >= x.first_exposed_at
           AND ($2::timestamptz IS NULL OR o.ordered_at <= $2::timestamptz)
         WHERE x.experiment_id = $1 AND NOT x.forced
         GROUP BY 1`,
        [id, endedAt],
      )
      for (const row of orders.rows) {
        const a = arm(String(row.variant_key))
        a.orders = Number(row.orders)
        a.purchasers = Number(row.purchasers)
        a.revenue = round2(Number(row.revenue))
      }

      const tagged = await db.query(
        `SELECT o.experiments ->> $3::text AS variant_key, COUNT(*)::int AS tagged,
                COUNT(*) FILTER (WHERE x.visitor_id IS NULL)::int AS missing
         FROM experiment_orders o
         LEFT JOIN experiment_exposures x ON x.experiment_id = $1 AND x.visitor_id = o.visitor_id
         WHERE o.experiments ? $3::text
           AND ($4::timestamptz IS NULL OR o.ordered_at >= $4::timestamptz)
           AND ($2::timestamptz IS NULL OR o.ordered_at <= $2::timestamptz)
         GROUP BY 1`,
        [id, endedAt, exp.key, exp.startedAt],
      )
      for (const row of tagged.rows) {
        const a = arm(String(row.variant_key))
        a.taggedOrders = Number(row.tagged)
        a.beaconMissingOrders = Number(row.missing)
      }

      return { key: exp.key, status: exp.status, startedAt: exp.startedAt, endedAt, arms: [...arms.values()] }
    },
  }
}

/** In-memory store for tests and local dev. Same semantics as the Postgres store. */
export function createMemoryExperimentStore(): ExperimentStore & {
  /** Test hook: the raw rows. */
  _rows: { exposures: ExposureRow[]; events: FunnelEventRow[]; orders: ExperimentOrderRow[] }
} {
  const experiments: Experiment[] = []
  const audit: AuditEntry[] = []
  const exposures: ExposureRow[] = []
  const events: FunnelEventRow[] = []
  const orders: ExperimentOrderRow[] = []
  let auditSeq = 0
  const clone = (e: Experiment): Experiment => ({ ...e, variants: e.variants.map((v) => ({ ...v })) })

  return {
    _rows: { exposures, events, orders },

    async migrate() {},

    async list() {
      return [...experiments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone)
    },

    async listLive() {
      return experiments
        .filter((e) => e.status === 'running' || e.status === 'promoted')
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(clone)
    },

    async getByKey(key) {
      const found = experiments.find((e) => e.key === key)
      return found ? clone(found) : null
    },

    async create(input) {
      if (experiments.some((e) => e.key === input.key)) throw new ExperimentKeyTakenError(input.key)
      const now = new Date().toISOString()
      const exp: Experiment = {
        id: randomUUID(),
        key: input.key,
        name: input.name,
        hypothesis: input.hypothesis,
        status: 'draft',
        seed: input.seed,
        trafficPct: input.trafficPct,
        primaryMetric: input.primaryMetric,
        winnerVariant: null,
        startedAt: null,
        pausedAt: null,
        endedAt: null,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        variants: input.variants.map((v) => ({ ...v })),
      }
      experiments.push(exp)
      return clone(exp)
    },

    async update(id, patch) {
      const exp = experiments.find((e) => e.id === id)
      if (!exp) throw new Error('Experiment not found')
      Object.assign(exp, patch, { updatedAt: new Date().toISOString() })
      return clone(exp)
    },

    async addAudit({ experimentId, actor, action, detail }) {
      audit.push({ id: ++auditSeq, experimentId, actor, action, detail: detail ?? null, at: new Date().toISOString() })
    },

    async listAudit(experimentId) {
      return audit.filter((a) => a.experimentId === experimentId).sort((a, b) => b.id - a.id)
    },

    async exposureCounts() {
      const out = new Map<string, Record<string, ArmExposureCounts>>()
      for (const x of exposures) {
        const arms = out.get(x.experimentId) ?? {}
        const counts = (arms[x.variantKey] ??= { visitors: 0, forced: 0 })
        if (x.forced) counts.forced += 1
        else counts.visitors += 1
        out.set(x.experimentId, arms)
      }
      return out
    },

    async recordExposures(rows) {
      let written = 0
      for (const r of rows) {
        const index = exposures.findIndex((x) => x.experimentId === r.experimentId && x.visitorId === r.visitorId)
        if (index === -1) {
          exposures.push({ ...r })
          written += 1
        } else if (exposures[index]!.forced && !r.forced) {
          exposures[index] = { ...r }
          written += 1
        }
      }
      return written
    },

    async recordEvents(rows) {
      let written = 0
      for (const r of rows) {
        if (events.some((e) => e.dedupeKey === r.dedupeKey)) continue
        events.push({ ...r })
        written += 1
      }
      return written
    },

    async upsertOrders(rows) {
      for (const r of rows) {
        const index = orders.findIndex((o) => o.channel === r.channel && o.externalId === r.externalId)
        if (index === -1) orders.push({ ...r })
        else orders[index] = { ...r }
      }
      return rows.length
    },

    async deleteOrders(channel, externalIds) {
      let removed = 0
      for (let i = orders.length - 1; i >= 0; i--) {
        if (orders[i]!.channel === channel && externalIds.includes(orders[i]!.externalId)) {
          orders.splice(i, 1)
          removed += 1
        }
      }
      return removed
    },

    async results(exp) {
      const arms = new Map(exp.variants.map((v) => [v.key, emptyArm(v.key)]))
      const arm = (key: string) => {
        let a = arms.get(key)
        if (!a) arms.set(key, (a = emptyArm(key)))
        return a
      }
      const endMs = exp.endedAt ? Date.parse(exp.endedAt) : Infinity
      const startMs = exp.startedAt ? Date.parse(exp.startedAt) : -Infinity
      const mine = exposures.filter((x) => x.experimentId === exp.id)
      const byVisitor = new Map(mine.map((x) => [x.visitorId, x]))

      for (const x of mine) {
        const a = arm(x.variantKey)
        if (x.forced) {
          a.forcedVisitors += 1
          continue
        }
        a.visitors += 1
        const from = Date.parse(x.firstExposedAt)
        const inWindow = (at: string) => {
          const t = Date.parse(at)
          return t >= from && t <= endMs
        }
        for (const kind of FUNNEL_EVENT_KINDS) {
          if (events.some((e) => e.visitorId === x.visitorId && e.kind === kind && inWindow(e.occurredAt))) a.events[kind] += 1
        }
        const matched = orders.filter((o) => o.visitorId === x.visitorId && inWindow(o.orderedAt))
        a.orders += matched.length
        if (matched.length) a.purchasers += 1
        a.revenue = round2(a.revenue + matched.reduce((s, o) => s + o.revenue, 0))
      }

      for (const o of orders) {
        const variant = o.experiments[exp.key]
        if (!variant) continue
        const t = Date.parse(o.orderedAt)
        if (t < startMs || t > endMs) continue
        const a = arm(variant)
        a.taggedOrders += 1
        if (!o.visitorId || !byVisitor.has(o.visitorId)) a.beaconMissingOrders += 1
      }

      return { key: exp.key, status: exp.status, startedAt: exp.startedAt, endedAt: exp.endedAt, arms: [...arms.values()] }
    },
  }
}
