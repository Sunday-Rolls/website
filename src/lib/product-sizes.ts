import { displayVariantTitle, type ShopifyProduct } from '@/lib/shopify'

export interface SizeOption {
  size: string
  /** False when Shopify says that size is sold out. */
  available: boolean
}

/**
 * Sizes a buyer can pick for a product. Shopify variants win once they've loaded;
 * until then (or for catalog-only products) the catalog's `sizes` list is shown.
 * Products without sizes (headcovers, towels) return an empty list.
 */
export function productSizeOptions(
  product: Pick<ShopifyProduct, 'variants' | 'sizes'>,
): SizeOption[] {
  const live = (product.variants ?? []).flatMap((variant) => {
    const size = displayVariantTitle(variant.title)
    return size ? [{ size, available: variant.availableForSale }] : []
  })
  if (live.length > 0) return live
  return (product.sizes ?? []).map((size) => ({ size, available: true }))
}
