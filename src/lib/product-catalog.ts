import catalogData from '@/data/product-catalog.json'
import type { ProductCategory, ShopifyProduct } from '@/lib/shopify'
import { homeAssets, shopAssets } from '@/assets'

export type CatalogProductStatus = 'Published' | 'Draft' | 'Unpublished' | 'Deleted' | string

export interface CatalogProduct {
  title: string
  handle: string
  status: CatalogProductStatus
  productType: string
  description: string
  sellingMethod: string
  category: ProductCategory
  productToken: string
  itemWeight?: string
  itemWeightUnit?: string
  dimensions?: {
    length?: string
    width?: string
    height?: string
    unit?: string
  }
  images: string[]
}

export interface ProductValidationIssue {
  handle?: string
  title?: string
  field: string
  message: string
  severity: 'error' | 'warning'
}

export interface ProductValidationResult {
  valid: boolean
  issues: ProductValidationIssue[]
  catalogOnly: CatalogProduct[]
  siteOnly: ShopifyProduct[]
}

const catalogProducts = catalogData as CatalogProduct[]

const imagePool = [
  ...shopAssets.products,
  ...homeAssets.featuredProducts,
  ...shopAssets.products,
]

export function slugifyProductTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getCatalogProducts(): CatalogProduct[] {
  return catalogProducts
}

export function getCatalogProductByHandle(handle: string): CatalogProduct | undefined {
  return catalogProducts.find((product) => product.handle === handle)
}

export function getPublishedCatalogProducts(): CatalogProduct[] {
  return catalogProducts.filter((product) => product.status === 'Published')
}

function defaultFeatures(product: CatalogProduct): string[] {
  const features = ['Plush velvet interior', 'Premium exterior materials']

  if (product.itemWeight && product.itemWeightUnit) {
    features.push(`${product.itemWeight} ${product.itemWeightUnit}`)
  }

  if (product.dimensions?.length && product.dimensions?.width && product.dimensions?.height) {
    features.push(
      `${product.dimensions.length} x ${product.dimensions.width} x ${product.dimensions.height} ${product.dimensions.unit ?? 'in'}`,
    )
  }

  return features
}

export function catalogProductToShopifyProduct(
  product: CatalogProduct,
  index: number,
): ShopifyProduct {
  return {
    id: `catalog-${product.handle}`,
    handle: product.handle,
    title: product.title,
    description: product.description,
    price: '$55.00',
    material: product.productToken || 'Premium headcover',
    category: product.category,
    imageUrl: imagePool[index % imagePool.length],
    imageAlt: product.title,
    features: defaultFeatures(product),
  }
}

export function buildPlaceholderProductsFromCatalog(): ShopifyProduct[] {
  return getPublishedCatalogProducts().map(catalogProductToShopifyProduct)
}

export function validateProductsAgainstCatalog(
  siteProducts: ShopifyProduct[],
): ProductValidationResult {
  const issues: ProductValidationIssue[] = []
  const publishedCatalog = getPublishedCatalogProducts()
  const catalogByHandle = new Map(publishedCatalog.map((product) => [product.handle, product]))
  const siteByHandle = new Map(siteProducts.map((product) => [product.handle, product]))

  for (const siteProduct of siteProducts) {
    const catalogProduct = catalogByHandle.get(siteProduct.handle)

    if (!catalogProduct) {
      issues.push({
        handle: siteProduct.handle,
        title: siteProduct.title,
        field: 'handle',
        message: `Product "${siteProduct.title}" is not in the catalog template.`,
        severity: 'error',
      })
      continue
    }

    if (siteProduct.title !== catalogProduct.title) {
      issues.push({
        handle: siteProduct.handle,
        field: 'title',
        message: `Title mismatch for "${siteProduct.handle}". Expected "${catalogProduct.title}", received "${siteProduct.title}".`,
        severity: 'error',
      })
    }

    if (siteProduct.description.trim() !== catalogProduct.description.trim()) {
      issues.push({
        handle: siteProduct.handle,
        field: 'description',
        message: `Description mismatch for "${catalogProduct.title}".`,
        severity: 'warning',
      })
    }

    if (siteProduct.category && siteProduct.category !== catalogProduct.category) {
      issues.push({
        handle: siteProduct.handle,
        field: 'category',
        message: `Category mismatch for "${catalogProduct.title}". Expected "${catalogProduct.category}", received "${siteProduct.category}".`,
        severity: 'error',
      })
    }

    if (catalogProduct.status !== 'Published') {
      issues.push({
        handle: siteProduct.handle,
        field: 'status',
        message: `Catalog product "${catalogProduct.title}" is not published.`,
        severity: 'error',
      })
    }
  }

  const catalogOnly = publishedCatalog.filter((product) => !siteByHandle.has(product.handle))
  for (const missing of catalogOnly) {
    issues.push({
      handle: missing.handle,
      title: missing.title,
      field: 'catalog',
      message: `Catalog product "${missing.title}" is missing from the site product list.`,
      severity: 'error',
    })
  }

  const siteOnly = siteProducts.filter((product) => !catalogByHandle.has(product.handle))

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
    catalogOnly,
    siteOnly,
  }
}

export function assertCatalogSync(siteProducts: ShopifyProduct[]): void {
  const result = validateProductsAgainstCatalog(siteProducts)

  if (!result.valid) {
    const errors = result.issues.filter((issue) => issue.severity === 'error')
    const message = errors.map((issue) => `- ${issue.message}`).join('\n')
    throw new Error(`Product catalog validation failed:\n${message}`)
  }
}
