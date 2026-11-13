export interface ProductSeoInput {
  title?: string
  category?: string
  subcategory?: string
}
export function productDisplayName(title: string | undefined): string
export function productFitLabel(product: ProductSeoInput | undefined): string
export function productSeoTitle(product: ProductSeoInput | undefined): string
