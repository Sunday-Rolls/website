import { describe, expect, it } from 'vitest'
import {
  analyzeExperiment,
  bootstrapRpv,
  chiSquareSurvival,
  compareBinary,
  computeGate,
  cumulativeDaily,
  fnv1a32,
  lnGamma,
  mulberry32,
  revenueCap,
  sampleBeta,
  sampleBinomial,
  sampleGamma,
  srmTest,
  twoProportionPValue,
  type AnalysisInput,
} from './stats.js'
import type { ArmResults } from './types.js'

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

describe('random numbers', () => {
  it('mulberry32 is deterministic per seed and uniform-ish', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 10_000 }, () => a())
    expect(Array.from({ length: 10_000 }, () => b())).toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mean(xs)).toBeCloseTo(0.5, 1)
    expect(mulberry32(43)()).not.toBe(mulberry32(42)())
  })

  it('fnv1a32 matches the contract test vectors', () => {
    expect(fnv1a32('')).toBe(2166136261)
    expect(fnv1a32('a')).toBe(3826002220)
    expect(fnv1a32('héllo')).toBe(1252296000)
  })

  it('samples Gamma and Beta with the right means', () => {
    const rng = mulberry32(7)
    for (const shape of [0.5, 1, 3.5, 50]) {
      const xs = Array.from({ length: 20_000 }, () => sampleGamma(rng, shape))
      expect(mean(xs) / shape).toBeCloseTo(1, 1)
    }
    const betas = Array.from({ length: 20_000 }, () => sampleBeta(rng, 2, 8))
    expect(mean(betas)).toBeCloseTo(0.2, 2)
  })

  it('samples Binomial across its three regimes', () => {
    const rng = mulberry32(9)
    for (const [n, p] of [
      [20, 0.3],
      [1000, 0.01],
      [5000, 0.2],
      [200, 0.9],
    ] as const) {
      const xs = Array.from({ length: 5_000 }, () => sampleBinomial(rng, n, p))
      expect(Math.abs(mean(xs) - n * p) / Math.sqrt(n * p * (1 - p))).toBeLessThan(0.1)
      expect(xs.every((x) => x >= 0 && x <= n && Number.isInteger(x))).toBe(true)
    }
  })
})

describe('distributions and tests', () => {
  it('lnGamma matches factorials', () => {
    expect(lnGamma(1)).toBeCloseTo(0, 10)
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 10)
    expect(lnGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 10)
  })

  it('chi-square survival matches tables', () => {
    expect(chiSquareSurvival(3.841459, 1)).toBeCloseTo(0.05, 6)
    expect(chiSquareSurvival(5.991465, 2)).toBeCloseTo(0.05, 6)
    expect(chiSquareSurvival(11.344867, 3)).toBeCloseTo(0.01, 6)
    expect(chiSquareSurvival(0, 4)).toBe(1)
  })

  it('two-proportion z-test: 100/1000 vs 130/1000', () => {
    const p = twoProportionPValue({ conversions: 100, visitors: 1000 }, { conversions: 130, visitors: 1000 })
    expect(p).toBeGreaterThan(0.03)
    expect(p).toBeLessThan(0.04)
    expect(p).toBeCloseTo(0.03548, 4)
    expect(twoProportionPValue({ conversions: 50, visitors: 1000 }, { conversions: 50, visitors: 1000 })).toBeCloseTo(1, 10)
    expect(twoProportionPValue({ conversions: 0, visitors: 0 }, { conversions: 1, visitors: 10 })).toBe(1)
    expect(twoProportionPValue({ conversions: 0, visitors: 10 }, { conversions: 0, visitors: 10 })).toBe(1)
  })

  it('SRM chi-square for k arms', () => {
    expect(srmTest([500, 500], [50, 50])).toEqual({ pValue: 1, ok: true })
    const skewed = srmTest([400, 600], [50, 50])
    expect(skewed.pValue).toBeGreaterThan(2.4e-10)
    expect(skewed.pValue).toBeLessThan(2.7e-10)
    expect(skewed.ok).toBe(false)
    // 3 arms, weights 25/25/50, exactly on target.
    expect(srmTest([250, 250, 500], [25, 25, 50]).pValue).toBeCloseTo(1, 10)
    expect(srmTest([0, 0], [50, 50])).toEqual({ pValue: 1, ok: true })
    expect(srmTest([520, 480], [50, 50]).ok).toBe(true)
  })
})

describe('Beta-Binomial comparison', () => {
  it('is symmetric (~0.5) for identical arms and deterministic per seed', () => {
    const arm = { conversions: 60, visitors: 1000 }
    const a = compareBinary(arm, arm, mulberry32(1))
    expect(a.probBeatsControl).toBeCloseTo(0.5, 1)
    expect(a.lift).toBe(0)
    expect(a.liftInterval[0]).toBeLessThan(0)
    expect(a.liftInterval[1]).toBeGreaterThan(0)
    expect(compareBinary(arm, arm, mulberry32(1))).toEqual(a)
    expect(compareBinary(arm, arm, mulberry32(2)).probBeatsControl).not.toBe(a.probBeatsControl)
  })

  it('detects a clear winner with small expected loss', () => {
    const r = compareBinary({ conversions: 100, visitors: 2000 }, { conversions: 160, visitors: 2000 }, mulberry32(3))
    expect(r.controlRate).toBe(0.05)
    expect(r.variantRate).toBe(0.08)
    expect(r.lift).toBeCloseTo(0.6, 10)
    expect(r.probBeatsControl).toBeGreaterThan(0.999)
    expect(r.expectedLoss).toBeLessThan(1e-4)
    expect(r.liftInterval[0]).toBeGreaterThan(0.2)
    expect(r.liftInterval[1]).toBeLessThan(1.1)
    expect(r.pValue).toBeLessThan(0.001)
    const loser = compareBinary({ conversions: 160, visitors: 2000 }, { conversions: 100, visitors: 2000 }, mulberry32(3))
    expect(loser.probBeatsControl).toBeLessThan(0.001)
    expect(loser.expectedLoss).toBeCloseTo(0.03, 2)
  })

  it('reports a null observed lift when control has no conversions', () => {
    const r = compareBinary({ conversions: 0, visitors: 100 }, { conversions: 3, visitors: 100 }, mulberry32(4), 2000)
    expect(r.lift).toBeNull()
    expect(Number.isFinite(r.liftInterval[0])).toBe(true)
  })
})

describe('RPV bootstrap', () => {
  it('caps at p99 of buyers and compares arms', () => {
    const control = { visitors: 1000, revenues: Array.from({ length: 30 }, () => 40) }
    const variant = { visitors: 1000, revenues: [...Array.from({ length: 50 }, () => 40), 100_000] }
    const cap = revenueCap([control, variant])
    expect(cap).toBeLessThan(100_000)
    const r = bootstrapRpv(control, variant, cap, mulberry32(5))
    expect(r.controlRpv).toBeCloseTo(1.2, 10)
    expect(r.variantRpv).toBeLessThan(5)
    expect(r.probBeatsControl).toBeGreaterThan(0.95)
    expect(r.lift).toBeGreaterThan(0.5)
    expect(r.liftInterval![0]).toBeLessThan(r.lift!)
    expect(bootstrapRpv(control, variant, cap, mulberry32(5))).toEqual(r)
  })

  it('is a coin flip with no revenue at all', () => {
    const empty = { visitors: 500, revenues: [] }
    const r = bootstrapRpv(empty, empty, revenueCap([empty, empty]), mulberry32(6), 500)
    expect(r).toEqual({ controlRpv: 0, variantRpv: 0, lift: null, liftInterval: null, probBeatsControl: 0.5 })
  })
})

function arm(variant: string, visitors: number, atc: number, purchasers = 0, revenue = 0): ArmResults {
  return {
    variant,
    visitors,
    forcedVisitors: 0,
    events: { add_to_cart: atc, begin_checkout: 0, contact_submit: 0, newsletter_subscribe: 0 },
    orders: purchasers,
    purchasers,
    revenue,
    taggedOrders: 0,
    beaconMissingOrders: 0,
  }
}

function input(arms: ArmResults[], extra: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    seed: 'seed-1',
    primaryMetric: 'add_to_cart',
    variants: [
      { key: 'control', weight: 50, isControl: true },
      { key: 'b', weight: 50, isControl: false },
    ],
    arms,
    revenue: {},
    startedAt: '2026-10-01T00:00:00.000Z',
    endedAt: null,
    minDays: 14,
    maxDays: 42,
    minVisitorsPerArm: 1000,
    now: new Date('2026-10-20T00:00:00.000Z'),
    ...extra,
  }
}

describe('gate and verdict', () => {
  it('computes the sample gate', () => {
    const g = computeGate(input([]), 812)
    expect(g).toEqual({ days: 19, minDays: 14, maxDays: 42, minVisitorsPerArm: 1000, smallestArm: 812, ready: false, overMaxDays: false })
    expect(computeGate(input([], { endedAt: '2026-10-05T12:00:00.000Z' }), 5000)).toMatchObject({ days: 4, ready: false })
    expect(computeGate(input([], { startedAt: null }), 5000).days).toBe(0)
    expect(computeGate(input([], { now: new Date('2026-12-01T00:00:00Z') }), 5000)).toMatchObject({ ready: true, overMaxDays: true })
  })

  it('one comparison per challenger × rate metric, primary first', () => {
    const stats = analyzeExperiment(
      input([arm('control', 2000, 100), arm('b', 2000, 110), arm('c', 2000, 90)], {
        primaryMetric: 'purchase',
        variants: [
          { key: 'control', weight: 34, isControl: true },
          { key: 'b', weight: 33, isControl: false },
          { key: 'c', weight: 33, isControl: false },
        ],
      }),
    )
    expect(stats.comparisons.map((c) => `${c.variant}:${c.metric}`)).toEqual([
      'b:purchase',
      'b:add_to_cart',
      'b:begin_checkout',
      'b:contact_submit',
      'b:newsletter_subscribe',
      'c:purchase',
      'c:add_to_cart',
      'c:begin_checkout',
      'c:contact_submit',
      'c:newsletter_subscribe',
    ])
    expect(stats.rpv.map((r) => r.variant)).toEqual(['b', 'c'])
  })

  it('early before the gate, winner after, deterministic', () => {
    const arms = [arm('control', 2000, 100), arm('b', 2000, 160)]
    expect(analyzeExperiment(input(arms, { now: new Date('2026-10-10T00:00:00Z') }))).toMatchObject({ verdict: 'early', winner: null })
    const done = analyzeExperiment(input(arms))
    expect(done).toMatchObject({ verdict: 'winner', winner: 'b', srm: { ok: true }, gate: { ready: true } })
    expect(analyzeExperiment(input(arms))).toEqual(done)
  })

  it('no_difference when nothing clears 95%', () => {
    expect(analyzeExperiment(input([arm('control', 2000, 100), arm('b', 2000, 104)])).verdict).toBe('no_difference')
  })

  it('srm_fail beats everything', () => {
    expect(analyzeExperiment(input([arm('control', 1200, 60), arm('b', 1800, 200)])).verdict).toBe('srm_fail')
  })

  it('guardrail_fail when purchases or revenue per visitor look worse', () => {
    const arms = [arm('control', 2000, 100, 60, 2400), arm('b', 2000, 160, 30, 1200)]
    const revenue = { control: Array(60).fill(40), b: Array(30).fill(40) }
    const stats = analyzeExperiment(input(arms, { revenue }))
    expect(stats.verdict).toBe('guardrail_fail')
    expect(stats.winner).toBeNull()
  })

  it('judges revenue_per_visitor primaries on the bootstrap', () => {
    const arms = [arm('control', 3000, 100, 60, 2400), arm('b', 3000, 100, 120, 4800)]
    const revenue = { control: Array(60).fill(40), b: Array(120).fill(40) }
    const stats = analyzeExperiment(input(arms, { revenue, primaryMetric: 'revenue_per_visitor' }))
    expect(stats.comparisons[0]!.metric).toBe('add_to_cart')
    expect(stats).toMatchObject({ verdict: 'winner', winner: 'b' })
  })
})

describe('cumulativeDaily', () => {
  it('fills gaps and accumulates per arm', () => {
    const out = cumulativeDaily(
      [
        { date: '2026-11-01', variant: 'control', visitors: 3, conversions: 1 },
        { date: '2026-11-01', variant: 'b', visitors: 2, conversions: 0 },
        { date: '2026-11-03', variant: 'b', visitors: 1, conversions: 2 },
      ],
      ['control', 'b'],
      '2026-11-01T08:00:00.000Z',
      null,
      new Date('2026-11-04T10:00:00.000Z'),
    )
    expect(out).toEqual([
      { date: '2026-11-01', arms: { control: { visitors: 3, conversions: 1 }, b: { visitors: 2, conversions: 0 } } },
      { date: '2026-11-02', arms: { control: { visitors: 3, conversions: 1 }, b: { visitors: 2, conversions: 0 } } },
      { date: '2026-11-03', arms: { control: { visitors: 3, conversions: 1 }, b: { visitors: 3, conversions: 2 } } },
      { date: '2026-11-04', arms: { control: { visitors: 3, conversions: 1 }, b: { visitors: 3, conversions: 2 } } },
    ])
    expect(cumulativeDaily([], ['control'], null, null, new Date())).toEqual([])
  })
})
