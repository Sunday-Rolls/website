/**
 * Experiment statistics (docs/AB_TESTING_PLAN.md §9, verdict rules in docs/EXPERIMENTS_CONTRACT.md).
 * Pure functions: every random draw comes from a seeded PRNG, so a request is deterministic.
 */
import { RATE_METRICS, type ArmResults, type RateMetric } from './types.js'

export type Rng = () => number

export const MONTE_CARLO_DRAWS = 20_000
export const BOOTSTRAP_RESAMPLES = 2_000
export const SRM_ALPHA = 0.001
export const WINNER_PROB = 0.95
export const GUARDRAIL_PROB_WORSE = 0.8
const DAY_MS = 86_400_000

// ---------- Random numbers ----------

/** mulberry32: small, fast, good enough for Monte Carlo. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a over UTF-8 (same as the assignment hash), used to derive PRNG seeds from strings. */
export function fnv1a32(text: string): number {
  let h = 2166136261
  for (const b of new TextEncoder().encode(text)) {
    h ^= b
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rngFor(text: string): Rng {
  return mulberry32(fnv1a32(text))
}

/** Standard normal (Box–Muller). */
export function sampleNormal(rng: Rng): number {
  const u1 = 1 - rng() // (0, 1]
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** Gamma(shape, 1) by Marsaglia–Tsang; shape < 1 uses the u^(1/shape) boost. */
export function sampleGamma(rng: Rng, shape: number): number {
  if (!(shape > 0)) throw new RangeError('Gamma shape must be positive')
  if (shape < 1) {
    const u = 1 - rng()
    return sampleGamma(rng, shape + 1) * Math.pow(u, 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = sampleNormal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = 1 - rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function sampleBeta(rng: Rng, a: number, b: number): number {
  const x = sampleGamma(rng, a)
  const y = sampleGamma(rng, b)
  return x / (x + y)
}

/** Binomial(n, p): exact for small n or small mean, normal approximation otherwise. */
export function sampleBinomial(rng: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0
  if (p >= 1) return n
  if (p > 0.5) return n - sampleBinomial(rng, n, 1 - p)
  if (n < 64) {
    let k = 0
    for (let i = 0; i < n; i++) if (rng() < p) k++
    return k
  }
  const mean = n * p
  if (mean < 30) {
    // Sequential inversion of the pmf.
    const q = 1 - p
    const s = p / q
    const a = (n + 1) * s
    let r = Math.pow(q, n)
    let u = rng()
    let x = 0
    while (u > r && x < n) {
      u -= r
      x++
      r *= a / x - s
    }
    return x
  }
  const k = Math.round(mean + Math.sqrt(mean * (1 - p)) * sampleNormal(rng))
  return Math.min(n, Math.max(0, k))
}

// ---------- Distributions ----------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  x -= 1
  let a = LANCZOS[0]!
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Regularized upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1
  if (x < a + 1) return 1 - gammaPSeries(a, x)
  return gammaQContinuedFraction(a, x)
}

function gammaPSeries(a: number, x: number): number {
  let sum = 1 / a
  let term = sum
  for (let n = 1; n < 1000; n++) {
    term *= x / (a + n)
    sum += term
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a))
}

/** Lentz's method (Numerical Recipes `gcf`). */
function gammaQContinuedFraction(a: number, x: number): number {
  const tiny = 1e-300
  let b = x + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-15) break
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h
}

/** P(X ≥ x) for X ~ χ²(df). */
export function chiSquareSurvival(x: number, df: number): number {
  if (df <= 0) return 1
  return gammaQ(df / 2, x / 2)
}

/** Two-sided p-value of a standard normal statistic (z² ~ χ²(1)). */
export function normalTwoSidedP(z: number): number {
  if (!Number.isFinite(z)) return 0
  return chiSquareSurvival(z * z, 1)
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (!n) return NaN
  const pos = (n - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.min(n - 1, lo + 1)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

// ---------- Tests ----------

export type Proportion = { conversions: number; visitors: number }

/** Pooled two-proportion z-test, two-sided. 1 when there is nothing to compare. */
export function twoProportionPValue(a: Proportion, b: Proportion): number {
  const n1 = a.visitors
  const n2 = b.visitors
  if (n1 <= 0 || n2 <= 0) return 1
  const x1 = clampCount(a)
  const x2 = clampCount(b)
  const pooled = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  if (!(se > 0)) return 1
  return normalTwoSidedP((x2 / n2 - x1 / n1) / se)
}

/** Chi-square goodness of fit of observed arm sizes against the configured weights. */
export function srmTest(observed: number[], weights: number[]): { pValue: number; ok: boolean } {
  const total = observed.reduce((s, n) => s + n, 0)
  const weightSum = weights.reduce((s, w) => s + w, 0)
  if (total <= 0 || weightSum <= 0 || observed.length < 2) return { pValue: 1, ok: true }
  let chi2 = 0
  for (let i = 0; i < observed.length; i++) {
    const expected = (total * (weights[i] ?? 0)) / weightSum
    if (expected > 0) chi2 += (observed[i]! - expected) ** 2 / expected
  }
  const pValue = chiSquareSurvival(chi2, observed.length - 1)
  return { pValue, ok: pValue >= SRM_ALPHA }
}

export type BinaryComparison = {
  controlRate: number
  variantRate: number
  /** Observed relative lift; null when the control rate is 0. */
  lift: number | null
  /** 95% credible interval of the relative lift (posterior). */
  liftInterval: [number, number]
  probBeatsControl: number
  /** E[max(control − variant, 0)]: conversion rate given up by choosing the variant. */
  expectedLoss: number
  pValue: number
}

/** Beta-Binomial with Beta(1, 1) priors per arm. */
export function compareBinary(control: Proportion, variant: Proportion, rng: Rng, draws = MONTE_CARLO_DRAWS): BinaryComparison {
  const cx = clampCount(control)
  const vx = clampCount(variant)
  const cn = Math.max(0, control.visitors)
  const vn = Math.max(0, variant.visitors)
  const lifts = new Float64Array(draws)
  let wins = 0
  let loss = 0
  for (let i = 0; i < draws; i++) {
    const pc = sampleBeta(rng, 1 + cx, 1 + cn - cx)
    const pv = sampleBeta(rng, 1 + vx, 1 + vn - vx)
    if (pv > pc) wins++
    else loss += pc - pv
    lifts[i] = pv / pc - 1
  }
  lifts.sort()
  const controlRate = cn ? cx / cn : 0
  const variantRate = vn ? vx / vn : 0
  return {
    controlRate,
    variantRate,
    lift: controlRate > 0 ? variantRate / controlRate - 1 : null,
    liftInterval: [quantileSorted(lifts, 0.025), quantileSorted(lifts, 0.975)],
    probBeatsControl: wins / draws,
    expectedLoss: loss / draws,
    pValue: twoProportionPValue(control, variant),
  }
}

export type RevenueArm = {
  visitors: number
  /** Per-visitor revenue of the visitors who bought; everyone else is an implied 0. */
  revenues: number[]
}

export type RpvComparison = {
  controlRpv: number
  variantRpv: number
  lift: number | null
  liftInterval: [number, number] | null
  probBeatsControl: number
}

/**
 * p99 of the buyers' per-visitor revenue across all arms (Infinity with no buyers). Lower-rank,
 * not interpolated, so one huge order among a few dozen buyers can't lift its own cap.
 */
export function revenueCap(arms: RevenueArm[]): number {
  const all = arms.flatMap((a) => a.revenues).filter((r) => r > 0)
  if (!all.length) return Infinity
  all.sort((a, b) => a - b)
  return all[Math.floor((all.length - 1) * 0.99)]!
}

/**
 * Bootstrap of revenue per visitor (non-buyers count as 0, revenue capped). Each resample draws
 * the number of buyers from Binomial(n, buyers / n), then that many buyers with replacement,
 * which equals resampling all n visitors without touching the zeros one by one.
 */
export function bootstrapRpv(
  control: RevenueArm,
  variant: RevenueArm,
  cap: number,
  rng: Rng,
  resamples = BOOTSTRAP_RESAMPLES,
): RpvComparison {
  const c = cappedArm(control, cap)
  const v = cappedArm(variant, cap)
  let wins = 0
  const lifts: number[] = []
  for (let i = 0; i < resamples; i++) {
    const mc = resampleMean(c, rng)
    const mv = resampleMean(v, rng)
    if (mv > mc) wins += 1
    else if (mv === mc) wins += 0.5
    if (mc > 0) lifts.push(mv / mc - 1)
  }
  lifts.sort((a, b) => a - b)
  const controlRpv = c.mean
  const variantRpv = v.mean
  return {
    controlRpv,
    variantRpv,
    lift: controlRpv > 0 ? variantRpv / controlRpv - 1 : null,
    liftInterval: lifts.length >= resamples / 2 ? [quantileSorted(lifts, 0.025), quantileSorted(lifts, 0.975)] : null,
    probBeatsControl: wins / resamples,
  }
}

function cappedArm(arm: RevenueArm, cap: number) {
  const n = Math.max(0, arm.visitors)
  const values = arm.revenues.filter((r) => r > 0).slice(0, n).map((r) => Math.min(r, cap))
  const sum = values.reduce((s, r) => s + r, 0)
  return { n, values, mean: n ? sum / n : 0 }
}

function resampleMean(arm: { n: number; values: number[] }, rng: Rng): number {
  if (!arm.n || !arm.values.length) return 0
  const k = sampleBinomial(rng, arm.n, arm.values.length / arm.n)
  let sum = 0
  for (let i = 0; i < k; i++) sum += arm.values[Math.floor(rng() * arm.values.length)]!
  return sum / arm.n
}

function clampCount(p: Proportion): number {
  return Math.max(0, Math.min(p.conversions, p.visitors))
}

// ---------- Experiment analysis ----------

export type Verdict = 'early' | 'winner' | 'no_difference' | 'guardrail_fail' | 'srm_fail'

export type Gate = {
  days: number
  minDays: number
  maxDays: number
  minVisitorsPerArm: number
  smallestArm: number
  ready: boolean
  overMaxDays: boolean
}

export type ExperimentStats = {
  comparisons: Array<BinaryComparison & { variant: string; metric: RateMetric }>
  rpv: Array<RpvComparison & { variant: string }>
  srm: { pValue: number; ok: boolean }
  gate: Gate
  verdict: Verdict
  winner: string | null
}

export type AnalysisInput = {
  seed: string
  primaryMetric: string
  /** In assignment order, with weights. */
  variants: Array<{ key: string; weight: number; isControl: boolean }>
  arms: ArmResults[]
  revenue: Record<string, number[]>
  startedAt: string | null
  endedAt: string | null
  minDays: number
  maxDays: number
  minVisitorsPerArm: number
  now: Date
}

export function conversionsFor(arm: ArmResults, metric: RateMetric): number {
  return metric === 'purchase' ? arm.purchasers : arm.events[metric]
}

export function isRateMetric(metric: string): metric is RateMetric {
  return (RATE_METRICS as readonly string[]).includes(metric)
}

export function computeGate(input: Pick<AnalysisInput, 'startedAt' | 'endedAt' | 'minDays' | 'maxDays' | 'minVisitorsPerArm' | 'now'>, smallestArm: number): Gate {
  const start = input.startedAt ? Date.parse(input.startedAt) : NaN
  const end = Math.min(input.endedAt ? Date.parse(input.endedAt) : Infinity, input.now.getTime())
  const days = Number.isFinite(start) ? Math.max(0, Math.floor((end - start) / DAY_MS)) : 0
  return {
    days,
    minDays: input.minDays,
    maxDays: input.maxDays,
    minVisitorsPerArm: input.minVisitorsPerArm,
    smallestArm,
    ready: days >= input.minDays && smallestArm >= input.minVisitorsPerArm,
    overMaxDays: days >= input.maxDays,
  }
}

/** Comparisons, RPV, SRM, the sample gate and the verdict for one experiment. */
export function analyzeExperiment(input: AnalysisInput): ExperimentStats {
  const armByKey = new Map(input.arms.map((a) => [a.variant, a]))
  const variants = input.variants.filter((v) => armByKey.has(v.key))
  const control = variants.find((v) => v.isControl) ?? variants[0]
  const controlArm = control ? armByKey.get(control.key)! : undefined
  const challengers = variants.filter((v) => v !== control)

  const metrics: RateMetric[] = isRateMetric(input.primaryMetric)
    ? [input.primaryMetric, ...RATE_METRICS.filter((m) => m !== input.primaryMetric)]
    : [...RATE_METRICS]

  const comparisons: ExperimentStats['comparisons'] = []
  const rpv: ExperimentStats['rpv'] = []
  const revenueArm = (key: string): RevenueArm => ({ visitors: armByKey.get(key)?.visitors ?? 0, revenues: input.revenue[key] ?? [] })
  const cap = revenueCap(variants.map((v) => revenueArm(v.key)))

  if (control && controlArm) {
    for (const v of challengers) {
      const arm = armByKey.get(v.key)!
      for (const metric of metrics) {
        const result = compareBinary(
          { conversions: conversionsFor(controlArm, metric), visitors: controlArm.visitors },
          { conversions: conversionsFor(arm, metric), visitors: arm.visitors },
          rngFor(`${input.seed}:stats:${v.key}:${metric}`),
        )
        comparisons.push({ variant: v.key, metric, ...result })
      }
      rpv.push({
        variant: v.key,
        ...bootstrapRpv(revenueArm(control.key), revenueArm(v.key), cap, rngFor(`${input.seed}:stats:${v.key}:rpv`)),
      })
    }
  }

  const srm = srmTest(
    variants.map((v) => armByKey.get(v.key)!.visitors),
    variants.map((v) => v.weight),
  )
  const smallestArm = variants.length ? Math.min(...variants.map((v) => armByKey.get(v.key)!.visitors)) : 0
  const gate = computeGate(input, smallestArm)

  let verdict: Verdict
  let winner: string | null = null
  if (!srm.ok) verdict = 'srm_fail'
  else if (!gate.ready) verdict = 'early'
  else {
    const guardrailFail = challengers.some((v) => {
      const purchase = comparisons.find((c) => c.variant === v.key && c.metric === 'purchase')
      const revenue = rpv.find((r) => r.variant === v.key)
      return (
        (purchase !== undefined && 1 - purchase.probBeatsControl >= GUARDRAIL_PROB_WORSE) ||
        (revenue !== undefined && 1 - revenue.probBeatsControl >= GUARDRAIL_PROB_WORSE)
      )
    })
    if (guardrailFail) verdict = 'guardrail_fail'
    else {
      const primary = challengers
        .map((v) => ({
          variant: v.key,
          prob: isRateMetric(input.primaryMetric)
            ? comparisons.find((c) => c.variant === v.key && c.metric === input.primaryMetric)!.probBeatsControl
            : rpv.find((r) => r.variant === v.key)!.probBeatsControl,
        }))
        .filter((p) => p.prob >= WINNER_PROB)
        .sort((a, b) => b.prob - a.prob)
      if (primary.length) {
        verdict = 'winner'
        winner = primary[0]!.variant
      } else verdict = 'no_difference'
    }
  }

  return { comparisons, rpv, srm, gate, verdict, winner }
}

// ---------- Daily series ----------

export type DailyPoint = { date: string; arms: Record<string, { visitors: number; conversions: number }> }

const MAX_DAILY_POINTS = 366

/**
 * Cumulative per-arm counts for every UTC day from the start (or first row) to the end (or now),
 * gaps filled. Capped to the last 366 days.
 */
export function cumulativeDaily(
  rows: Array<{ date: string; variant: string; visitors: number; conversions: number }>,
  variantKeys: string[],
  startedAt: string | null,
  endedAt: string | null,
  now: Date,
): DailyPoint[] {
  const dates = rows.map((r) => r.date).sort()
  const first = [startedAt ? startedAt.slice(0, 10) : null, dates[0] ?? null].filter(Boolean).sort()[0]
  if (!first) return []
  const endDay = new Date(Math.min(endedAt ? Date.parse(endedAt) : Infinity, now.getTime())).toISOString().slice(0, 10)
  const last = [endDay, dates[dates.length - 1] ?? endDay].sort().at(-1)!
  const byDate = new Map<string, typeof rows>()
  for (const r of rows) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r)

  const keys = [...variantKeys, ...new Set(rows.map((r) => r.variant).filter((k) => !variantKeys.includes(k)))]
  const running: DailyPoint['arms'] = Object.fromEntries(keys.map((k) => [k, { visitors: 0, conversions: 0 }]))
  const out: DailyPoint[] = []
  for (let t = Date.parse(`${first}T00:00:00Z`), stop = Date.parse(`${last}T00:00:00Z`); t <= stop; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10)
    for (const r of byDate.get(date) ?? []) {
      running[r.variant]!.visitors += r.visitors
      running[r.variant]!.conversions += r.conversions
    }
    out.push({ date, arms: Object.fromEntries(keys.map((k) => [k, { ...running[k]! }])) })
  }
  return out.slice(-MAX_DAILY_POINTS)
}
