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
 * 4. for old Retro Roller / retro gaming listings from before colors existed: the grey DF3 cover,
 *    or the grey mallet cover when the title says mallet or heel shaft (a named color wins);
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

/** Old Retro Roller / retro gaming titles → the Retro Roller DF3 or mallet SKU. */
export function legacyRetroSku(name: string, catalog: SkuCatalog): string | null {
  const s = name.toLowerCase()
  if (!/retro|game ?boy|gaming/.test(s)) return null
  const mallet = /heel/.test(s) || (/mallet/.test(s) && !/center|centre|df3|l\.?a\.?b/.test(s))
  const base = mallet ? 'SR-RETRO-MAL' : 'SR-RETRO-DF3'
  const color = COLORS.find(([re]) => re.test(s))?.[1]
  const sku = `${base}-${color ?? 'GRY'}`
  return catalog.skuNames[sku] ? sku : null
}

export function resolveSku(line: { productName: string; productSku: string | null }, catalog: SkuCatalog): string | null {
  const own = line.productSku?.trim() || null
  if (own && catalog.skuNames[own]) return own
  const byName = catalog.nameToSku.get(looseName(line.productName)) ?? catalog.wordsToSku.get(nameWords(line.productName))
  if (byName) return byName
  return legacyRetroSku(line.productName, catalog) ?? own
}
