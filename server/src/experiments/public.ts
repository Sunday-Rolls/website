import type { ExperimentStore } from './store.js'
import type { Experiment, ExposureRow, FunnelEventRow } from './types.js'
import { eventTime, type ParsedBeacon } from './validation.js'

export type PublicExperiment = {
  key: string
  seed: string
  status: 'running' | 'promoted'
  trafficPct: number
  variants: Array<{ key: string; weight: number }>
  winner: string | null
}

/** `GET /experiments/config` body (docs/EXPERIMENTS_CONTRACT.md). */
export async function buildPublicConfig(store: ExperimentStore) {
  const live = await store.listLive()
  const updatedAt = live.reduce<string | null>((max, e) => (!max || e.updatedAt > max ? e.updatedAt : max), null)
  return {
    ok: true as const,
    updatedAt: updatedAt ?? new Date(0).toISOString(),
    experiments: live.map(toPublic),
  }
}

function toPublic(e: Experiment): PublicExperiment {
  return {
    key: e.key,
    seed: e.seed,
    status: e.status as 'running' | 'promoted',
    trafficPct: e.trafficPct,
    variants: e.variants.map((v) => ({ key: v.key, weight: v.weight })),
    winner: e.status === 'promoted' ? e.winnerVariant : null,
  }
}

/**
 * Stores a validated beacon. Exposures count only for running experiments and arms that exist;
 * funnel events are deduped by id. Returns how many rows were newly written.
 */
export async function ingestBeacon(store: ExperimentStore, beacon: ParsedBeacon, now = Date.now()): Promise<number> {
  const exposures: ExposureRow[] = []
  const funnel: FunnelEventRow[] = []
  let running: Map<string, Experiment> | null = null

  for (const event of beacon.events) {
    if (event.type === 'exposure') {
      running ??= new Map((await store.listLive()).filter((e) => e.status === 'running').map((e) => [e.key, e]))
      const exp = running.get(event.experiment)
      if (!exp || !exp.variants.some((v) => v.key === event.variant)) continue
      exposures.push({
        experimentId: exp.id,
        visitorId: beacon.vid,
        variantKey: event.variant,
        firstExposedAt: eventTime(event.at, now),
        landingPath: event.path,
        device: event.device,
        source: event.source,
        forced: event.forced,
      })
    } else {
      funnel.push({
        dedupeKey: event.id,
        visitorId: beacon.vid,
        kind: event.type,
        value: event.value,
        occurredAt: eventTime(event.at, now),
      })
    }
  }

  let accepted = 0
  if (exposures.length) accepted += await store.recordExposures(exposures)
  if (funnel.length) accepted += await store.recordEvents(funnel)
  return accepted
}
