import { getPublishedCatalogProducts, type CatalogProduct } from '@/lib/product-catalog'

export const TOWEL_UPSELL_MIN_TOTAL_USD = 70
export const TOWEL_UPSELL_MAX_TOTAL_USD = 100
export const DEFAULT_TOWEL_UPSELL_HANDLE = 'golf-towel-green-stripe'

export function shouldShowTowelUpsell(
  totalUsd: number,
  min = TOWEL_UPSELL_MIN_TOTAL_USD,
  max = TOWEL_UPSELL_MAX_TOTAL_USD,
): boolean {
  return totalUsd >= min && totalUsd < max
}

/** Prefer a configured towel that isn’t already in the cart; otherwise any other towel. */
export function selectTowelUpsell(
  cartHandles: Iterable<string>,
  preferredHandle = DEFAULT_TOWEL_UPSELL_HANDLE,
): CatalogProduct | null {
  const inCart = new Set(cartHandles)
  const towels = getPublishedCatalogProducts().filter((product) => product.category === 'towels')
  if (towels.length === 0) return null

  const preferred = towels.find((product) => product.handle === preferredHandle)
  if (preferred && !inCart.has(preferred.handle)) return preferred

  return towels.find((product) => !inCart.has(product.handle)) ?? null
}
