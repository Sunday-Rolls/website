import { createStorefrontApiClient } from '@shopify/storefront-api-client'
import { productAssets } from '@/assets'
import {
  buildPlaceholderProductsFromCatalog,
} from '@/lib/product-catalog'

const storeDomain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
const publicAccessToken = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
const apiVersion = import.meta.env.VITE_SHOPIFY_API_VERSION ?? '2025-01'

export type ProductCategory = 'headcovers' | 'bags' | 'accessories'

export const isShopifyConfigured = Boolean(storeDomain && publicAccessToken)

export const shopifyClient = isShopifyConfigured
  ? createStorefrontApiClient({
      storeDomain: storeDomain!,
      apiVersion,
      publicAccessToken: publicAccessToken!,
    })
  : null

export interface ShopifyProduct {
  id: string
  handle: string
  title: string
  description: string
  price: string
  compareAtPrice?: string
  imageUrl?: string
  imageAlt?: string
  material?: string
  category?: ProductCategory
  features?: string[]
}

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          handle
          title
          description
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      description
      featuredImage {
        url
        altText
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
    }
  }
`

function formatPrice(amount: string, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(amount))
}

function mapProduct(node: {
  id: string
  handle: string
  title: string
  description: string
  featuredImage?: { url: string; altText?: string | null } | null
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string }
  }
}): ShopifyProduct {
  const { amount, currencyCode } = node.priceRange.minVariantPrice

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    price: formatPrice(amount, currencyCode),
    imageUrl: node.featuredImage?.url,
    imageAlt: node.featuredImage?.altText ?? node.title,
  }
}

export async function fetchProducts(limit = 12): Promise<ShopifyProduct[]> {
  if (!shopifyClient) return []

  const { data, errors } = await shopifyClient.request(PRODUCTS_QUERY, {
    variables: { first: limit },
  })

  if (errors) {
    console.error('Shopify products query failed', errors)
    return []
  }

  return (
    data?.products?.edges?.map((edge: { node: Parameters<typeof mapProduct>[0] }) =>
      mapProduct(edge.node),
    ) ?? []
  )
}

export async function fetchProductByHandle(
  handle: string,
): Promise<ShopifyProduct | null> {
  if (!shopifyClient) return null

  const { data, errors } = await shopifyClient.request(PRODUCT_BY_HANDLE_QUERY, {
    variables: { handle },
  })

  if (errors || !data?.product) {
    console.error('Shopify product query failed', errors)
    return null
  }

  return mapProduct(data.product)
}

export function filterProductsByCategory(
  products: ShopifyProduct[],
  category: string,
): ShopifyProduct[] {
  if (category === 'all') return products

  return products.filter((product) => product.category === category)
}

export const placeholderProducts: ShopifyProduct[] = buildPlaceholderProductsFromCatalog()

export function getPlaceholderProductImage(handle: string): string {
  const product = placeholderProducts.find((item) => item.handle === handle)
  return product?.imageUrl ?? productAssets.galleryFallback
}
