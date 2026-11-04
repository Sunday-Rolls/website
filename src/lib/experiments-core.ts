/**
 * Pure experiment assignment, shared byte-for-byte in behaviour with `scripts/serve-spa.mjs`
 * and `server/`. See docs/EXPERIMENTS_CONTRACT.md: changing anything here changes who sees
 * which arm, so the test vectors in experiments-core.test.ts must keep passing.
 */

export type ExperimentStatus = 'running' | 'promoted'

export type ExperimentVariantConfig = {
  key: string
  /** Integer percentage; a config's weights sum to 100. */
  weight: number
}

export type ExperimentConfig = {
  key: string
  seed: string
  status: ExperimentStatus
  trafficPct: number
  variants: ExperimentVariantConfig[]
  winner: string | null
}

export type ExperimentsConfigResponse = {
  ok: boolean
  updatedAt?: string
  experiments: ExperimentConfig[]
}

/** Shape the Railway SPA server injects as `window.__SR_EXP__`. */
export type InjectedExperimentState = {
  vid: string | null
  assignments: Record<string, string>
  tracked: string[]
  bot: boolean
}

export const VID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
export const EXPERIMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/
export const VARIANT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,23}$/

export const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|lighthouse|headlesschrome|playwright|facebookexternalhit|bingpreview|embedly|pinterest|vkshare|w3c_validator|preview/i

const encoder = new TextEncoder()

/** 32-bit FNV-1a over the UTF-8 bytes of `str`. */
export function fnv1a32(str: string): number {
  let h = 2166136261
  for (const b of encoder.encode(str)) {
    h ^= b
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Uniform number in [0, 1) derived from `str`. */
export function unit(str: string): number {
  return fnv1a32(str) / 2 ** 32
}

/** The arm for this visitor, or null when they are outside the traffic split (render control, log nothing). */
export function assign(exp: ExperimentConfig, vid: string): string | null {
  if (exp.status === 'promoted') return exp.winner
  if (unit(`${exp.seed}:traffic:${vid}`) * 100 >= exp.trafficPct) return null
  const u = unit(`${exp.seed}:${vid}`)
  let cum = 0
  for (const v of exp.variants) {
    cum += v.weight / 100
    if (u < cum) return v.key
  }
  return exp.variants[exp.variants.length - 1]?.key ?? null
}

/** Assignments and tracked keys for a whole config, in the injected-state shape. */
export function assignAll(
  experiments: ExperimentConfig[],
  vid: string,
): { assignments: Record<string, string>; tracked: string[] } {
  const assignments: Record<string, string> = {}
  const tracked: string[] = []
  for (const exp of experiments) {
    if (!exp || !EXPERIMENT_KEY_PATTERN.test(exp.key)) continue
    const arm = assign(exp, vid)
    if (arm == null) continue
    assignments[exp.key] = arm
    if (exp.status === 'running') tracked.push(exp.key)
  }
  return { assignments, tracked }
}

/** `home-banner:b,other:control` → `{ 'home-banner': 'b', other: 'control' }`. Invalid pairs are dropped. */
export function parseForce(value: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!value) return out
  for (const pair of value.split(',')) {
    const [key, arm, ...rest] = pair.trim().split(':')
    if (rest.length || !key || !arm) continue
    if (!EXPERIMENT_KEY_PATTERN.test(key) || !VARIANT_KEY_PATTERN.test(arm)) continue
    out[key] = arm
  }
  return out
}

/** `{ b: 'x', a: 'y' }` → `a:y|b:x` (keys sorted). Used for `_sr_exp`, `exp_variants` and contact `experiments`. */
export function formatExpString(map: Record<string, string>): string {
  return Object.keys(map)
    .sort()
    .map((key) => `${key}:${map[key]}`)
    .join('|')
}

export function isValidVid(vid: unknown): vid is string {
  return typeof vid === 'string' && VID_PATTERN.test(vid)
}
