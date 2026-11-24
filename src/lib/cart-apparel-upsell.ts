import { getPublishedCatalogProducts, type CatalogProduct } from '@/lib/product-catalog'

/**
 * Apparel to offer as a cart add-on: published apparel that isn't already in the cart.
 * Shown in the same cart-total window as the towel card ($59 to under $100 by default).
 */
export function listApparelUpsellOptions(cartHandles: Iterable<string>): CatalogProduct[] {
  const inCart = new Set(cartHandles)
  return getPublishedCatalogProducts().filter(
    (product) => product.category === 'apparel' && !inCart.has(product.handle),
  )
}

export const APPAREL_UPSELL_MIN_TOTAL_USD = 59
export const APPAREL_UPSELL_MAX_TOTAL_USD = 100

export function isInApparelUpsellWindow(
  totalUsd: number,
  min = APPAREL_UPSELL_MIN_TOTAL_USD,
  max = APPAREL_UPSELL_MAX_TOTAL_USD,
): boolean {
  return totalUsd >= min && totalUsd < max
}

export function shouldShowApparelUpsell(
  cartHandles: Iterable<string>,
  lineCount: number,
  totalUsd: number,
  min = APPAREL_UPSELL_MIN_TOTAL_USD,
  max = APPAREL_UPSELL_MAX_TOTAL_USD,
): boolean {
  return (
    lineCount > 0 &&
    isInApparelUpsellWindow(totalUsd, min, max) &&
    listApparelUpsellOptions(cartHandles).length > 0
  )
}
