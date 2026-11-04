import type { ExperimentStore } from './store.js'
import { analyzeExperiment, conversionsFor, cumulativeDaily, isRateMetric, type DailyPoint, type ExperimentStats } from './stats.js'
import { RATE_METRICS, type ArmResults, type Experiment, type ExperimentStatus, type RateMetric } from './types.js'

export type ArmResultsWithRates = ArmResults & {
  revenuePerVisitor: number
  aov: number
  rates: Record<RateMetric, number>
}

/** `GET /dashboard/api/experiments/:key/results` data (docs/EXPERIMENTS_CONTRACT.md, Phase 2 and 3). */
export type ExperimentResultsResponse = {
  key: string
  status: ExperimentStatus
  startedAt: string | null
  endedAt: string | null
  primaryMetric: string
  arms: ArmResultsWithRates[]
  stats: ExperimentStats
  daily: DailyPoint[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function withRates(arm: ArmResults): ArmResultsWithRates {
  const rate = (n: number) => (arm.visitors ? n / arm.visitors : 0)
  return {
    ...arm,
    revenuePerVisitor: round2(rate(arm.revenue)),
    aov: arm.orders ? round2(arm.revenue / arm.orders) : 0,
    rates: Object.fromEntries(RATE_METRICS.map((m) => [m, rate(conversionsFor(arm, m))])) as Record<RateMetric, number>,
  }
}

/** Three store reads in parallel, then pure stats (seeded by the experiment, so deterministic). */
export async function buildExperimentResults(
  store: ExperimentStore,
  exp: Experiment,
  now: Date = new Date(),
): Promise<ExperimentResultsResponse> {
  // Revenue per visitor as the primary metric charts buyers over time.
  const dailyMetric: RateMetric = isRateMetric(exp.primaryMetric) ? exp.primaryMetric : 'purchase'
  const [base, revenue, daily] = await Promise.all([
    store.results(exp),
    store.visitorRevenue(exp),
    store.dailyCounts(exp, dailyMetric),
  ])
  const stats = analyzeExperiment({
    seed: exp.seed,
    primaryMetric: exp.primaryMetric,
    variants: exp.variants,
    arms: base.arms,
    revenue,
    startedAt: exp.startedAt,
    endedAt: exp.endedAt,
    minDays: exp.minDays,
    maxDays: exp.maxDays,
    minVisitorsPerArm: exp.minVisitorsPerArm,
    now,
  })
  return {
    key: base.key,
    status: base.status,
    startedAt: base.startedAt,
    endedAt: base.endedAt,
    primaryMetric: exp.primaryMetric,
    arms: base.arms.map(withRates),
    stats,
    daily: cumulativeDaily(
      daily,
      exp.variants.map((v) => v.key),
      exp.startedAt,
      exp.endedAt,
      now,
    ),
  }
}
