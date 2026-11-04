import { describe, expect, it } from 'vitest'
import schema from './schema.json'
import {
  EXPERIMENT_KEY_PATTERN,
  PATH_PATTERN,
  PRIMARY_METRICS,
  VARIANT_KEY_PATTERN,
  findCodeUsages,
  findContentUsages,
  listRegistry,
  stripComments,
  validateRegistryEntry,
} from './registry'

// Every source file except tests (they use made-up keys on purpose).
const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.{test,spec}.{ts,tsx}', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true },
)
const contentFiles = import.meta.glob<unknown>('/src/content/**/*.json', {
  eager: true,
  import: 'default',
})

const registry = listRegistry()
const registryKeys = new Set(registry.map((r) => r.fileKey))

function usages(): Map<string, string[]> {
  const where = new Map<string, string[]>()
  const add = (key: string, file: string) => where.set(key, [...(where.get(key) ?? []), file])
  for (const [file, source] of Object.entries(sources)) {
    for (const key of findCodeUsages(source)) add(key, file)
  }
  for (const [file, content] of Object.entries(contentFiles)) {
    for (const key of findContentUsages(content)) add(key, file)
  }
  return where
}

describe('experiment registry (src/experiments/*.json)', () => {
  it('has at least the A/A check', () => {
    expect(registryKeys.has('aa-check')).toBe(true)
  })

  it.each(registry.map((r) => [r.file, r] as const))('%s matches the schema and its filename', (_file, r) => {
    expect(validateRegistryEntry(r.entry, r.fileKey)).toEqual([])
  })

  it('has a registry file for every experiment used in src/', () => {
    const missing = [...usages()]
      .filter(([key]) => !registryKeys.has(key))
      .map(([key, files]) => `${key} (used in ${files.join(', ')}): add src/experiments/${key}.json`)
    expect(missing).toEqual([])
  })
})

describe('schema.json and validateRegistryEntry agree', () => {
  const props = schema.properties
  it('uses the same patterns, metrics and required fields', () => {
    const same = (pattern: string, re: RegExp) => expect(new RegExp(pattern).source).toBe(re.source)
    same(props.key.pattern, EXPERIMENT_KEY_PATTERN)
    same(props.variants.items.properties.key.pattern, VARIANT_KEY_PATTERN)
    same(props.paths.items.pattern, PATH_PATTERN)
    expect(props.primaryMetric.enum).toEqual([...PRIMARY_METRICS])
    expect(schema.required).toEqual(['key', 'name', 'hypothesis', 'variants', 'primaryMetric', 'paths'])
  })
})

describe('validateRegistryEntry', () => {
  const valid = {
    key: 'home-banner',
    name: 'Banner',
    hypothesis: 'Lifts add to cart',
    variants: [
      { key: 'control', weight: 50 },
      { key: 'b', name: 'Banner', weight: 50 },
    ],
    primaryMetric: 'add_to_cart',
    paths: ['/'],
  }

  it('accepts a valid entry', () => {
    expect(validateRegistryEntry(valid, 'home-banner')).toEqual([])
  })

  it('rejects a key that differs from the filename', () => {
    expect(validateRegistryEntry(valid, 'other')).toEqual(['key "home-banner" must equal the filename "other"'])
  })

  it('rejects weights that do not sum to 100, a missing control and duplicate arms', () => {
    const errors = validateRegistryEntry({
      ...valid,
      variants: [
        { key: 'b', weight: 40 },
        { key: 'b', weight: 40 },
      ],
    })
    expect(errors).toContain('variants[1].key "b" is used twice')
    expect(errors).toContain('one variant must have key "control"')
    expect(errors).toContain('variant weights must sum to 100 (got 80)')
  })

  it('rejects unknown fields, bad metrics, paths and limits', () => {
    const errors = validateRegistryEntry({
      ...valid,
      targeting: {},
      primaryMetric: 'clicks',
      paths: ['shop', '/a?b=1'],
      minDays: 0,
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        'unknown property "targeting"',
        expect.stringContaining('primaryMetric must be one of'),
        'paths[0] must start with "/", have no query or hash, and be at most 300 characters',
        'paths[1] must start with "/", have no query or hash, and be at most 300 characters',
        'minDays must be an integer from 1 to 365',
      ]),
    )
  })
})

describe('usage scanners', () => {
  it('finds useVariant and <Variant experiment> keys, ignoring comments', () => {
    const source = [
      `// useVariant('in-comment')`,
      `/** <Variant experiment="in-doc" is="b"> */`,
      `const arm = useVariant('home-banner')`,
      `const other = useVariant( "pdp-copy" )`,
      `const url = 'https://example.com/x' // trailing`,
      `return <Variant is="b" experiment="cart-upsell">x</Variant>`,
      `const dynamic = useVariant(key)`,
    ].join('\n')
    expect(findCodeUsages(source)).toEqual(['cart-upsell', 'home-banner', 'pdp-copy'])
  })

  it('keeps string literals that contain comment markers', () => {
    expect(stripComments(`const a = 'x // y' /* gone */ + "/* kept */"`)).toBe(`const a = 'x // y'   + "/* kept */"`)
  })

  it('reads top-level experiments keys from page content', () => {
    expect(findContentUsages({ hero: {}, experiments: { 'home-copy': { b: {} } } })).toEqual(['home-copy'])
    expect(findContentUsages({ hero: { experiments: { nested: {} } } })).toEqual([])
  })
})
