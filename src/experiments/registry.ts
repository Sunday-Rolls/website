/**
 * Experiment registry: one `src/experiments/<key>.json` per A/B test (docs/EXPERIMENTS_CONTRACT.md,
 * "GitHub integration"). `schema.json` is the published shape; `validateRegistryEntry` enforces the
 * same rules plus the ones JSON Schema can't express (weights sum to 100, unique arm keys).
 * `registry.test.ts` keeps the two in step.
 *
 * Not imported by the storefront bundle: runtime state comes from contact-api. The GitHub workflow
 * (`.github/scripts/experiments.mjs`) reads the same JSON files with `fs` after this test passes.
 */

export const EXPERIMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/
export const VARIANT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,23}$/
export const PATH_PATTERN = /^\/[^?#\s]*$/
export const PRIMARY_METRICS = [
  'add_to_cart',
  'begin_checkout',
  'contact_submit',
  'newsletter_subscribe',
  'purchase',
] as const

export type PrimaryMetric = (typeof PRIMARY_METRICS)[number]

export type RegistryVariant = { key: string; name?: string; weight: number }

export type RegistryEntry = {
  key: string
  name: string
  hypothesis: string
  variants: RegistryVariant[]
  primaryMetric: PrimaryMetric
  paths: string[]
  minVisitorsPerArm?: number
  minDays?: number
  maxDays?: number
}

const TOP_LEVEL_KEYS = new Set([
  '$schema',
  'key',
  'name',
  'hypothesis',
  'variants',
  'primaryMetric',
  'paths',
  'minVisitorsPerArm',
  'minDays',
  'maxDays',
])
const VARIANT_KEYS = new Set(['key', 'name', 'weight'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** Every problem with `value` as the registry file `fileKey`.json (empty when valid). */
export function validateRegistryEntry(value: unknown, fileKey?: string): string[] {
  const errors: string[] = []
  if (!isObject(value)) return ['must be a JSON object']

  for (const prop of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.has(prop)) errors.push(`unknown property "${prop}"`)
  }

  const { key, name, hypothesis, variants, primaryMetric, paths } = value
  if (typeof key !== 'string' || !EXPERIMENT_KEY_PATTERN.test(key)) {
    errors.push(`key must match ${EXPERIMENT_KEY_PATTERN}`)
  } else if (fileKey !== undefined && key !== fileKey) {
    errors.push(`key "${key}" must equal the filename "${fileKey}"`)
  }
  if (!isText(name, 120)) errors.push('name is required (1–120 characters)')
  if (!isText(hypothesis, 1000)) errors.push('hypothesis is required (1–1000 characters)')

  if (!Array.isArray(variants) || variants.length < 2 || variants.length > 6) {
    errors.push('variants must list 2–6 arms')
  } else {
    const seen = new Set<string>()
    let total = 0
    variants.forEach((variant, index) => {
      const at = `variants[${index}]`
      if (!isObject(variant)) {
        errors.push(`${at} must be an object`)
        return
      }
      for (const prop of Object.keys(variant)) {
        if (!VARIANT_KEYS.has(prop)) errors.push(`${at} has unknown property "${prop}"`)
      }
      if (typeof variant.key !== 'string' || !VARIANT_KEY_PATTERN.test(variant.key)) {
        errors.push(`${at}.key must match ${VARIANT_KEY_PATTERN}`)
      } else if (seen.has(variant.key)) {
        errors.push(`${at}.key "${variant.key}" is used twice`)
      } else {
        seen.add(variant.key)
      }
      if (variant.name !== undefined && !isText(variant.name, 80)) {
        errors.push(`${at}.name must be 1–80 characters`)
      }
      if (!isPositiveInt(variant.weight) || variant.weight > 99) {
        errors.push(`${at}.weight must be an integer from 1 to 99`)
      } else {
        total += variant.weight
      }
    })
    if (!seen.has('control')) errors.push('one variant must have key "control"')
    if (total !== 100 && !errors.some((e) => e.includes('.weight'))) {
      errors.push(`variant weights must sum to 100 (got ${total})`)
    }
  }

  if (typeof primaryMetric !== 'string' || !(PRIMARY_METRICS as readonly string[]).includes(primaryMetric)) {
    errors.push(`primaryMetric must be one of ${PRIMARY_METRICS.join(', ')}`)
  }

  if (!Array.isArray(paths) || paths.length > 10) {
    errors.push('paths must be an array of at most 10 paths (use [] for site-wide)')
  } else {
    paths.forEach((path, index) => {
      if (typeof path !== 'string' || !PATH_PATTERN.test(path) || path.length > 300) {
        errors.push(`paths[${index}] must start with "/", have no query or hash, and be at most 300 characters`)
      }
    })
    if (new Set(paths).size !== paths.length) errors.push('paths must not repeat')
  }

  const limits = { minVisitorsPerArm: 10_000_000, minDays: 365, maxDays: 365 } as const
  for (const [limit, max] of Object.entries(limits)) {
    const n = value[limit]
    if (n !== undefined && (!isPositiveInt(n) || n > max)) {
      errors.push(`${limit} must be an integer from 1 to ${max}`)
    }
  }
  if (isPositiveInt(value.minDays) && isPositiveInt(value.maxDays) && value.maxDays < value.minDays) {
    errors.push('maxDays must be at least minDays')
  }

  return errors
}

export type RegistryFile = { file: string; fileKey: string; entry: unknown }

const registryModules = import.meta.glob<unknown>(['./*.json', '!./schema.json'], {
  eager: true,
  import: 'default',
})

/** Every `src/experiments/<key>.json` (schema excluded), sorted by key. Not validated. */
export function listRegistry(): RegistryFile[] {
  return Object.entries(registryModules)
    .map(([path, entry]) => {
      const file = `src/experiments/${path.replace(/^\.\//, '')}`
      return { file, fileKey: path.replace(/^\.\//, '').replace(/\.json$/, ''), entry }
    })
    .sort((a, b) => a.fileKey.localeCompare(b.fileKey))
}

/**
 * `source` with `//` and block comments blanked, so doc examples don't count as usages.
 * String and template literals are kept as they are (a `//` inside a URL is not a comment).
 */
export function stripComments(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      out += ' '
    } else if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== ch && (ch === '`' || source[j] !== '\n')) {
        j += source[j] === '\\' ? 2 : 1
      }
      out += source.slice(i, j + 1)
      i = j + 1
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** Experiment keys used in a `.ts` / `.tsx` source: `useVariant('k')` and `<Variant experiment="k"`. */
export function findCodeUsages(source: string): string[] {
  const code = stripComments(source)
  const keys = new Set<string>()
  for (const match of code.matchAll(/\buseVariant\(\s*(['"])([^'"\n]+)\1\s*\)/g)) keys.add(match[2])
  for (const match of code.matchAll(/<Variant\b[^>]*?\bexperiment=(?:\{\s*)?(['"])([^'"\n]+)\1/g)) {
    keys.add(match[2])
  }
  return [...keys].sort()
}

/** Experiment keys in a page JSON's top-level `experiments` block. */
export function findContentUsages(content: unknown): string[] {
  if (!isObject(content) || !isObject(content.experiments)) return []
  return Object.keys(content.experiments).sort()
}
