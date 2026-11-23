import { getPublishedCatalogProducts, type CatalogProduct } from '@/lib/product-catalog'

/**
 * Apparel to offer as a cart add-on: published apparel that isn't already in the cart.
 * Unlike the towel card (only between $70 and $100), this shows on any cart with items.
 */
export function listApparelUpsellOptions(cartHandles: Iterable<string>): CatalogProduct[] {
  const inCart = new Set(cartHandles)
  return getPublishedCatalogProducts().filter(
    (product) => product.category === 'apparel' && !inCart.has(product.handle),
  )
}

export function shouldShowApparelUpsell(
  cartHandles: Iterable<string>,
  lineCount: number,
): boolean {
  return lineCount > 0 && listApparelUpsellOptions(cartHandles).length > 0
}
