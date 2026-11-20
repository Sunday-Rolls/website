/**
 * Group sold items by SKU across channels and name them the way the website does.
 *
 * Each channel titles the same product differently (Etsy and eBay titles are written for search),
 * so the Products page groups by SKU instead. A line's SKU is, in order:
 * 1. its own SKU, when the website (Shopify) knows it;
 * 2. the SKU of the website product whose name matches the line's title
 *    (old Squarespace "SQ…" codes and Shopify lines without a SKU land here);
 * 3. the same, ignoring old-name noise ("Pre-Order", "(L.A.B. DF3)", "SR -", word order),
 *    when that points at exactly one website product;
 * 4. old marketplace titles by design: Retro Roller / retro gaming listings from before colors
 *    existed go to the grey DF3 or grey mallet cover (a named color wins); other designs by name
 *    (Seersucker and "Blue Stripe" covers are Sunday Stripes), DF3 or mallet by the title;
 * 5. its own SKU even if Shopify doesn't list it (e.g. an archived product).
 * Lines with no SKU at all stay grouped by their title.
 */
import type { ShopifyInventory } from './inventory.js'

export type SkuCatalog = {
  /** SKU → website name. */
  skuNames: Record<string, string>
  /** Loose website name → SKU, only where the name points at one SKU. */
  nameToSku: Map<string, string>
  /** Same, keyed by the name's word set without old-name noise. */
  wordsToSku: Map<string, string>
}

const NOISE = new Set(['sr', 'pre', 'preorder', 'order', 'listing', 'lab', 'l', 'a', 'b', 'df3', 'taylormade', 'spider', 'striped', 'solid'])

/** "Sunday Stripes (L.A.B. DF3)" and "PRE ORDER - Sunday Stripes" → "stripes sunday". */
export function nameWords(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !NOISE.has(w))
  return [...new Set(words)].sort().join(' ')
}

function uniqueMap(entries: Array<[string, string]>): Map<string, string> {
  const seen = new Map<string, Set<string>>()
  for (const [key, sku] of entries) {
    if (!key) continue
    const set = seen.get(key) ?? new Set<string>()
    set.add(sku)
    seen.set(key, set)
  }
  const out = new Map<string, string>()
  for (const [key, skus] of seen) if (skus.size === 1) out.set(key, [...skus][0])
  return out
}

/** Lowercase, punctuation-free: "Mallet - Retro Roller Grey" matches "Mallet – Retro Roller - Grey". */
export function looseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function skuCatalog(shopify: Pick<ShopifyInventory, 'skuNames'> | null | undefined): SkuCatalog {
  const skuNames = { ...(shopify?.skuNames ?? {}) }
  const entries = Object.entries(skuNames)
  return {
    skuNames,
    nameToSku: uniqueMap(entries.map(([sku, name]) => [looseName(name), sku])),
    wordsToSku: uniqueMap(entries.map(([sku, name]) => [nameWords(name), sku])),
  }
}

const COLORS: Array<[RegExp, string]> = [
  [/\bwhite\b/, 'WHT'],
  [/\bpurple\b/, 'PUR'],
  [/\byellow\b/, 'YEL'],
  [/\b(grey|gray)\b/, 'GRY'],
]

/** Design words in old marketplace titles → SKU stem. Mallet/heel-shaft titles use the -MAL cover. */
const DESIGNS: Array<[RegExp, string, 'putter' | 'fixed']> = [
  [/corduroy/, 'SR-CORD', 'putter'],
  [/morning dew/, 'SR-DEW', 'putter'],
  [/birdie/, 'SR-BIRDIE', 'putter'],
  [/doodle/, 'SR-DOODLE', 'putter'],
  [/breakfast/, 'SR-BREAKFAST', 'putter'],
  [/flagstick|fuel/, 'SR-FUEL', 'putter'],
  // Seersucker and "Blue Stripe" covers are Sunday Stripes (towels are handled by name, not here).
  [/sunday stripes|seersucker|stripe/, 'SR-STRIPES', 'putter'],
  [/sunny side/, 'SR-SUNNY-OZ', 'fixed'],
  [/coin collector/, 'SR-COIN-OZ', 'fixed'],
]

function isMalletTitle(s: string): boolean {
  return /heel/.test(s) || (/mallet/.test(s) && !/center|centre|df3|l\.?a\.?b/.test(s))
}

/**
 * Old marketplace titles → a website SKU. Retro Roller / retro gaming / Game Boy titles from before
 * colors existed go to the grey DF3 or grey mallet cover (a named color wins); other designs are
 * found by name. Only SKUs the website has are returned.
 */
export function legacyRetroSku(name: string, catalog: SkuCatalog): string | null {
  const s = name.toLowerCase()
  if (/towel/.test(s)) return null
  if (/retro|game ?boy|gaming/.test(s)) {
    const base = isMalletTitle(s) ? 'SR-RETRO-MAL' : 'SR-RETRO-DF3'
    const color = COLORS.find(([re]) => re.test(s))?.[1]
    const sku = `${base}-${color ?? 'GRY'}`
    return catalog.skuNames[sku] ? sku : null
  }
  for (const [re, stem, kind] of DESIGNS) {
    if (!re.test(s)) continue
    const sku = kind === 'fixed' ? stem : `${stem}-${isMalletTitle(s) ? 'MAL' : 'DF3'}`
    return catalog.skuNames[sku] ? sku : null
  }
  return null
}

export function resolveSku(line: { productName: string; productSku: string | null }, catalog: SkuCatalog): string | null {
  const own = line.productSku?.trim() || null
  if (own && catalog.skuNames[own]) return own
  const byName = catalog.nameToSku.get(looseName(line.productName)) ?? catalog.wordsToSku.get(nameWords(line.productName))
  if (byName) return byName
  return legacyRetroSku(line.productName, catalog) ?? own
}
