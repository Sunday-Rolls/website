import { createStorefrontApiClient } from '@shopify/storefront-api-client'
import {
  catalogProductToShopifyProduct,
  getCatalogProductByHandle,
  placeholderProducts as catalogPlaceholders,
} from '@/lib/product-catalog'

const storeDomain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
const publicAccessToken = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
const apiVersion = import.meta.env.VITE_SHOPIFY_API_VERSION ?? '2025-01'

export type ProductCategory = 'headcovers' | 'bags' | 'towels' | 'accessories'
export type HeadcoverSubcategory = 'center-shafted' | 'mallet' | 'oz-mezz'

export const isShopifyConfigured = Boolean(storeDomain && publicAccessToken)

export const shopifyClient = isShopifyConfigured
  ? createStorefrontApiClient({
      storeDomain: storeDomain!,
      apiVersion,
      publicAccessToken: publicAccessToken!,
    })
  : null

/**
 * Newsletter subscribe (`customerEmailMarketingSubscribe`) is documented on
 * Storefront `unstable` only — keep cart/product traffic on the stable version.
 */
const NEWSLETTER_API_VERSION = 'unstable'

const newsletterClient = isShopifyConfigured
  ? createStorefrontApiClient({
      storeDomain: storeDomain!,
      apiVersion: NEWSLETTER_API_VERSION,
      publicAccessToken: publicAccessToken!,
    })
  : null

export interface ProductFeature {
  label: string
  text: string
}

export interface ProductImage {
  url: string
  alt?: string
}

export interface ShopifyProduct {
  id: string
  handle: string
  title: string
  description: string
  price: string
  compareAtPrice?: string
  imageUrl?: string
  imageAlt?: string
  /** Gallery slides — Shopify media when available, catalog/placeholders otherwise */
  images?: ProductImage[]
  material?: string
  category?: ProductCategory
  subcategory?: HeadcoverSubcategory
  features?: string[]
  keyFeatures?: ProductFeature[]
  dimensionsDisplay?: string
  /** Storefront variant GID required for cart lines */
  variantId?: string
}

export interface CartLineItem {
  id: string
  quantity: number
  title: string
  handle: string
  variantId: string
  /** Formatted unit merchandise price. */
  price: string
  /** Formatted line total after quantity (and line discounts when present). */
  lineTotal: string
  imageUrl?: string
  imageAlt?: string
}

export interface CartDiscount {
  /** Code or automatic discount title shown to the buyer. */
  title: string
  /** Formatted discount amount (positive currency string). */
  amount: string
  amountValue: number
}

export interface ShopifyCart {
  id: string
  checkoutUrl: string
  totalQuantity: number
  subtotal: string
  total: string
  /** Raw merchandise subtotal before cart-level discounts (USD/major units). */
  subtotalAmount: number
  totalAmount: number
  currencyCode: string
  discounts: CartDiscount[]
  lines: CartLineItem[]
}

const PRODUCT_SELECTION = `
  id
  handle
  title
  description
  featuredImage {
    url
    altText
  }
  images(first: 20) {
    nodes {
      url
      altText
    }
  }
  priceRange {
    minVariantPrice {
      amount
      currencyCode
    }
  }
  variants(first: 1) {
    nodes {
      id
    }
  }
`

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          ${PRODUCT_SELECTION}
        }
      }
    }
  }
`

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${PRODUCT_SELECTION}
    }
  }
`

const CART_SELECTION = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
  }
  discountCodes {
    code
    applicable
  }
  discountAllocations {
    discountedAmount {
      amount
      currencyCode
    }
    ... on CartAutomaticDiscountAllocation {
      title
    }
    ... on CartCodeDiscountAllocation {
      code
    }
    ... on CartCustomDiscountAllocation {
      title
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
        amountPerQuantity {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          price {
            amount
            currencyCode
          }
          image {
            url
            altText
          }
          product {
            title
            handle
          }
        }
      }
    }
  }
`

const CART_CREATE = `#graphql
  mutation CartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart {
        ${CART_SELECTION}
      }
      userErrors {
        field
        message
      }
    }
  }
`

const CART_QUERY = `#graphql
  query Cart($id: ID!) {
    cart(id: $id) {
      ${CART_SELECTION}
    }
  }
`

const CART_LINES_ADD = `#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_SELECTION}
      }
      userErrors {
        field
        message
      }
    }
  }
`

const CART_LINES_UPDATE = `#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_SELECTION}
      }
      userErrors {
        field
        message
      }
    }
  }
`

const CART_LINES_REMOVE = `#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ${CART_SELECTION}
      }
      userErrors {
        field
        message
      }
    }
  }
`

type Money = { amount: string; currencyCode: string }

type ProductNode = {
  id: string
  handle: string
  title: string
  description: string
  featuredImage?: { url: string; altText?: string | null } | null
  images?: {
    nodes: Array<{ url: string; altText?: string | null }>
  } | null
  priceRange: { minVariantPrice: Money }
  variants?: { nodes: Array<{ id: string }> }
}

type DiscountAllocationNode = {
  discountedAmount: Money
  title?: string | null
  code?: string | null
}

type CartNode = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  cost: {
    subtotalAmount: Money
    totalAmount: Money
  }
  discountCodes?: Array<{ code: string; applicable: boolean }> | null
  discountAllocations?: DiscountAllocationNode[] | null
  lines: {
    nodes: Array<{
      id: string
      quantity: number
      cost?: {
        totalAmount?: Money | null
        amountPerQuantity?: Money | null
      } | null
      merchandise: {
        id: string
        title: string
        price: Money
        image?: { url: string; altText?: string | null } | null
        product: { title: string; handle: string }
      }
    }>
  }
}

function moneyAmount(money: Money | null | undefined): number {
  if (!money?.amount) return 0
  const value = Number(money.amount)
  return Number.isFinite(value) ? value : 0
}

function mapCartDiscounts(node: CartNode, currencyCode: string): CartDiscount[] {
  const allocations = node.discountAllocations ?? []
  const fromAllocations = allocations
    .map((allocation) => {
      const amountValue = moneyAmount(allocation.discountedAmount)
      if (amountValue <= 0) return null
      const title =
        allocation.code?.trim() ||
        allocation.title?.trim() ||
        'Discount'
      return {
        title,
        amountValue,
        amount: formatPrice(String(amountValue), allocation.discountedAmount.currencyCode || currencyCode),
      } satisfies CartDiscount
    })
    .filter((entry): entry is CartDiscount => entry != null)

  if (fromAllocations.length > 0) return fromAllocations

  const subtotal = moneyAmount(node.cost.subtotalAmount)
  const total = moneyAmount(node.cost.totalAmount)
  const savings = Math.round((subtotal - total) * 100) / 100
  if (savings <= 0) return []

  const applicableCode = (node.discountCodes ?? []).find((entry) => entry.applicable)?.code
  const title = applicableCode?.trim() || 'Discount'

  return [
    {
      title,
      amountValue: savings,
      amount: formatPrice(String(savings), currencyCode),
    },
  ]
}

export function formatPrice(amount: string, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(amount))
}

function mergeProductImages(
  primary: ProductImage[] | undefined,
  fallback: ProductImage[] | undefined,
): ProductImage[] | undefined {
  const merged: ProductImage[] = []
  const seen = new Set<string>()

  for (const image of [...(primary ?? []), ...(fallback ?? [])]) {
    if (!image.url || seen.has(image.url)) continue
    seen.add(image.url)
    merged.push(image)
    if (merged.length >= 5) break
  }

  return merged.length > 0 ? merged : undefined
}

function enrichFromCatalog(product: ShopifyProduct): ShopifyProduct {
  const catalog = getCatalogProductByHandle(product.handle)
  if (!catalog) return product

  const fromCatalog = catalogProductToShopifyProduct(catalog)
  // Shopify media order is the source of truth (featured = shop thumbnail).
  // Catalog images are placeholders only when the storefront product has none.
  const images = product.images?.length
    ? product.images
    : mergeProductImages(product.images, fromCatalog.images)

  return {
    ...fromCatalog,
    ...product,
    id: product.id,
    price: product.price,
    imageUrl: images?.[0]?.url ?? product.imageUrl ?? fromCatalog.imageUrl,
    imageAlt: images?.[0]?.alt ?? product.imageAlt ?? fromCatalog.imageAlt,
    images,
    variantId: product.variantId,
    description: product.description || fromCatalog.description,
    material: fromCatalog.material,
    category: fromCatalog.category,
    subcategory: fromCatalog.subcategory,
    features: fromCatalog.features,
    keyFeatures: fromCatalog.keyFeatures,
    dimensionsDisplay: fromCatalog.dimensionsDisplay,
  }
}

function mapProduct(node: ProductNode): ShopifyProduct {
  const { amount, currencyCode } = node.priceRange.minVariantPrice
  const shopifyImages =
    node.images?.nodes.map((image) => ({
      url: image.url,
      alt: image.altText ?? node.title,
    })) ?? []
  const featured = node.featuredImage
    ? [{ url: node.featuredImage.url, alt: node.featuredImage.altText ?? node.title }]
    : []
  const images = shopifyImages.length > 0 ? shopifyImages : featured

  return enrichFromCatalog({
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    price: formatPrice(amount, currencyCode),
    imageUrl: images[0]?.url ?? node.featuredImage?.url,
    imageAlt: images[0]?.alt ?? node.featuredImage?.altText ?? node.title,
    images: images.length > 0 ? images : undefined,
    variantId: node.variants?.nodes?.[0]?.id,
  })
}

function mapCart(node: CartNode): ShopifyCart {
  const currencyCode = node.cost.totalAmount.currencyCode || node.cost.subtotalAmount.currencyCode
  const subtotalAmount = moneyAmount(node.cost.subtotalAmount)
  const totalAmount = moneyAmount(node.cost.totalAmount)

  return {
    id: node.id,
    checkoutUrl: node.checkoutUrl,
    totalQuantity: node.totalQuantity,
    subtotal: formatPrice(node.cost.subtotalAmount.amount, currencyCode),
    total: formatPrice(node.cost.totalAmount.amount, currencyCode),
    subtotalAmount,
    totalAmount,
    currencyCode,
    discounts: mapCartDiscounts(node, currencyCode),
    lines: node.lines.nodes.map((line) => {
      const unitMoney = line.cost?.amountPerQuantity ?? line.merchandise.price
      const lineMoney =
        line.cost?.totalAmount ??
        ({
          amount: String(moneyAmount(unitMoney) * line.quantity),
          currencyCode: unitMoney.currencyCode,
        } satisfies Money)

      return {
        id: line.id,
        quantity: line.quantity,
        title: line.merchandise.product.title,
        handle: line.merchandise.product.handle,
        variantId: line.merchandise.id,
        price: formatPrice(unitMoney.amount, unitMoney.currencyCode),
        lineTotal: formatPrice(lineMoney.amount, lineMoney.currencyCode),
        imageUrl: line.merchandise.image?.url,
        imageAlt: line.merchandise.image?.altText ?? line.merchandise.product.title,
      }
    }),
  }
}

function userErrorMessage(
  errors: Array<{ message: string }> | undefined,
  fallback: string,
): string {
  if (errors?.length) return errors.map((error) => error.message).join('; ')
  return fallback
}

// Storefront `CustomerMarketingSubscribe` only exposes `id` (not email) on unstable.
const NEWSLETTER_SUBSCRIBE_MUTATION = `#graphql
  mutation customerEmailMarketingSubscribe($email: String!) {
    customerEmailMarketingSubscribe(email: $email) {
      customer {
        id
      }
      customerUserErrors {
        field
        message
        code
      }
    }
  }
`

export async function subscribeToNewsletter(email: string): Promise<void> {
  const trimmed = email.trim()
  if (!trimmed) {
    throw new Error('Enter an email address to subscribe.')
  }
  if (!newsletterClient) {
    throw new Error('Newsletter signup is unavailable right now.')
  }

  const { data, errors } = await newsletterClient.request(NEWSLETTER_SUBSCRIBE_MUTATION, {
    variables: { email: trimmed },
  })

  const payload = data?.customerEmailMarketingSubscribe
  if (errors || !payload) {
    throw new Error('Unable to subscribe right now. Please try again.')
  }
  if (payload.customerUserErrors?.length) {
    throw new Error(
      userErrorMessage(payload.customerUserErrors, 'Unable to subscribe right now. Please try again.'),
    )
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

  const live =
    data?.products?.edges?.map((edge: { node: ProductNode }) => mapProduct(edge.node)) ?? []
  return mergeCatalogOnlyProducts(live)
}

/** Keep published catalog products on the site until they exist in Shopify. */
function mergeCatalogOnlyProducts(live: ShopifyProduct[]): ShopifyProduct[] {
  const seen = new Set(live.map((product) => product.handle))
  const extras = catalogPlaceholders.filter((product) => !seen.has(product.handle))
  return [...live, ...extras]
}

const productByHandleCache = new Map<string, Promise<ShopifyProduct | null>>()

export function prefetchProductByHandle(handle: string): void {
  void fetchProductByHandle(handle)
}

export async function fetchProductByHandle(
  handle: string,
): Promise<ShopifyProduct | null> {
  const cached = productByHandleCache.get(handle)
  if (cached) return cached

  const request = requestProductByHandle(handle).then((product) => {
    if (!product) productByHandleCache.delete(handle)
    return product
  })
  productByHandleCache.set(handle, request)
  return request
}

async function requestProductByHandle(handle: string): Promise<ShopifyProduct | null> {
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

export async function createCart(
  lines: Array<{ merchandiseId: string; quantity: number }> = [],
): Promise<ShopifyCart> {
  if (!shopifyClient) throw new Error('Shopify is not configured')

  const { data, errors } = await shopifyClient.request(CART_CREATE, {
    variables: { lines },
  })

  const payload = data?.cartCreate
  if (errors || !payload?.cart) {
    throw new Error(userErrorMessage(payload?.userErrors, 'Unable to create cart'))
  }
  if (payload.userErrors?.length) {
    throw new Error(userErrorMessage(payload.userErrors, 'Unable to create cart'))
  }

  return mapCart(payload.cart)
}

export async function fetchCart(cartId: string): Promise<ShopifyCart | null> {
  if (!shopifyClient) return null

  const { data, errors } = await shopifyClient.request(CART_QUERY, {
    variables: { id: cartId },
  })

  if (errors) {
    console.error('Shopify cart query failed', errors)
    return null
  }

  return data?.cart ? mapCart(data.cart) : null
}

export async function addCartLines(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>,
): Promise<ShopifyCart> {
  if (!shopifyClient) throw new Error('Shopify is not configured')

  const { data, errors } = await shopifyClient.request(CART_LINES_ADD, {
    variables: { cartId, lines },
  })

  const payload = data?.cartLinesAdd
  if (errors || !payload?.cart) {
    throw new Error(userErrorMessage(payload?.userErrors, 'Unable to add to cart'))
  }
  if (payload.userErrors?.length) {
    throw new Error(userErrorMessage(payload.userErrors, 'Unable to add to cart'))
  }

  return mapCart(payload.cart)
}

export async function updateCartLines(
  cartId: string,
  lines: Array<{ id: string; quantity: number }>,
): Promise<ShopifyCart> {
  if (!shopifyClient) throw new Error('Shopify is not configured')

  const { data, errors } = await shopifyClient.request(CART_LINES_UPDATE, {
    variables: { cartId, lines },
  })

  const payload = data?.cartLinesUpdate
  if (errors || !payload?.cart) {
    throw new Error(userErrorMessage(payload?.userErrors, 'Unable to update cart'))
  }
  if (payload.userErrors?.length) {
    throw new Error(userErrorMessage(payload.userErrors, 'Unable to update cart'))
  }

  return mapCart(payload.cart)
}

export async function removeCartLines(
  cartId: string,
  lineIds: string[],
): Promise<ShopifyCart> {
  if (!shopifyClient) throw new Error('Shopify is not configured')

  const { data, errors } = await shopifyClient.request(CART_LINES_REMOVE, {
    variables: { cartId, lineIds },
  })

  const payload = data?.cartLinesRemove
  if (errors || !payload?.cart) {
    throw new Error(userErrorMessage(payload?.userErrors, 'Unable to remove from cart'))
  }
  if (payload.userErrors?.length) {
    throw new Error(userErrorMessage(payload.userErrors, 'Unable to remove from cart'))
  }

  return mapCart(payload.cart)
}

export {
  filterProductsByCategory,
  getPlaceholderProductImage,
  placeholderProducts,
  sortProductsBySubcategory,
} from '@/lib/product-catalog'
