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

/** "Golf Towel - Green Stripe" → "Green Stripe" */
export function towelColorLabel(title: string): string {
  const separator = title.indexOf(' - ')
  if (separator === -1) return title.trim()
  return title.slice(separator + 3).trim() || title.trim()
}

/** Towels not already in the cart, preferred color first. */
export function listTowelUpsellOptions(
  cartHandles: Iterable<string>,
  preferredHandle = DEFAULT_TOWEL_UPSELL_HANDLE,
): CatalogProduct[] {
  const inCart = new Set(cartHandles)
  const towels = getPublishedCatalogProducts().filter(
    (product) => product.category === 'towels' && !inCart.has(product.handle),
  )

  return [...towels].sort((a, b) => {
    if (a.handle === preferredHandle) return -1
    if (b.handle === preferredHandle) return 1
    return 0
  })
}

/** Prefer a configured towel that isn’t already in the cart; otherwise any other towel. */
export function selectTowelUpsell(
  cartHandles: Iterable<string>,
  preferredHandle = DEFAULT_TOWEL_UPSELL_HANDLE,
): CatalogProduct | null {
  return listTowelUpsellOptions(cartHandles, preferredHandle)[0] ?? null
}
