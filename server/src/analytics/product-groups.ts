/**
 * Group sold items by SKU across channels and name them the way the website does.
 *
 * Each channel titles the same product differently (Etsy and eBay titles are written for search),
 * so the Products page groups by SKU instead. A line's SKU is, in order:
 * 1. its own SKU, when the website (Shopify) knows it;
 * 2. the SKU of the website product whose name matches the line's title
 *    (old Squarespace "SQ…" codes and Shopify lines without a SKU land here);
 * 3. its own SKU even if Shopify doesn't list it (e.g. an archived product).
 * Lines with no SKU at all stay grouped by their title.
 */
import type { ShopifyInventory } from './inventory.js'

export type SkuCatalog = {
  /** SKU → website name. */
  skuNames: Record<string, string>
  /** Loose website name → SKU, only where the name points at one SKU. */
  nameToSku: Map<string, string>
}

/** Lowercase, punctuation-free: "Mallet - Retro Roller Grey" matches "Mallet – Retro Roller - Grey". */
export function looseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function skuCatalog(shopify: Pick<ShopifyInventory, 'skuNames'> | null | undefined): SkuCatalog {
  const skuNames = { ...(shopify?.skuNames ?? {}) }
  const counts = new Map<string, Set<string>>()
  for (const [sku, name] of Object.entries(skuNames)) {
    const key = looseName(name)
    if (!key) continue
    const set = counts.get(key) ?? new Set<string>()
    set.add(sku)
    counts.set(key, set)
  }
  const nameToSku = new Map<string, string>()
  for (const [key, skus] of counts) if (skus.size === 1) nameToSku.set(key, [...skus][0])
  return { skuNames, nameToSku }
}

export function resolveSku(line: { productName: string; productSku: string | null }, catalog: SkuCatalog): string | null {
  const own = line.productSku?.trim() || null
  if (own && catalog.skuNames[own]) return own
  const byName = catalog.nameToSku.get(looseName(line.productName))
  if (byName) return byName
  return own
}
