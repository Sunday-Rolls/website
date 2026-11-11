import { getSiteContent } from '@/lib/content'
import type { ShopifyProduct } from '@/lib/shopify'
import type { ProductReview } from '@/types/content'

/** id of the <script type="application/ld+json"> that holds the current product's data. */
export const PRODUCT_JSONLD_ID = 'product-jsonld'

type JsonLd = Record<string, unknown>

function absoluteImage(url: string, origin: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * schema.org Product data for a product page, so Google can show price,
 * availability and review stars in search results.
 *
 * Only reviews left on this site about this exact product count toward the
 * rating. Google's review-snippet rules forbid ratings aggregated from other
 * sites, so imported Etsy reviews (and reviews of sibling products) are left out.
 */
export function buildProductJsonLd(
  product: ShopifyProduct,
  reviews: ProductReview[],
  pageUrl: string,
): JsonLd {
  const { brand } = getSiteContent()
  const origin = new URL(pageUrl).origin
  const images = (product.images?.map((image) => image.url) ?? [product.imageUrl])
    .filter((url): url is string => Boolean(url))
    .map((url) => absoluteImage(url, origin))

  const data: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    url: pageUrl,
    brand: { '@type': 'Brand', name: brand.name },
  }
  if (product.description) data.description = product.description
  if (images.length > 0) data.image = images
  if (product.category) data.category = product.category === 'towels' ? 'Golf Towels' : 'Golf Putter Headcovers'

  const price = Number(product.priceAmount)
  if (Number.isFinite(price) && price > 0 && product.currencyCode) {
    const offer: JsonLd = {
      '@type': 'Offer',
      url: pageUrl,
      price: price.toFixed(2),
      priceCurrency: product.currencyCode,
      itemCondition: 'https://schema.org/NewCondition',
    }
    if (product.availableForSale !== undefined) {
      offer.availability = product.availableForSale
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock'
    }
    data.offers = offer
  }

  const rated = reviews.filter(
    (review) => review.source === 'site' && review.rating >= 1 && review.rating <= 5,
  )
  if (rated.length > 0) {
    const average = rated.reduce((sum, review) => sum + review.rating, 0) / rated.length
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(average.toFixed(1)),
      reviewCount: rated.length,
      bestRating: 5,
      worstRating: 1,
    }
    const written = rated.filter((review) => review.text.trim().length > 0).slice(0, 5)
    if (written.length > 0) {
      data.review = written.map((review) => {
        const entry: JsonLd = {
          '@type': 'Review',
          author: { '@type': 'Person', name: review.author },
          reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
          reviewBody: review.text,
        }
        if (review.createdAt) entry.datePublished = review.createdAt.slice(0, 10)
        return entry
      })
    }
  }

  return data
}

/** Write (or replace) the product structured data in <head>. */
export function applyProductJsonLd(data: JsonLd): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById(PRODUCT_JSONLD_ID) as HTMLScriptElement | null
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = PRODUCT_JSONLD_ID
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/** Remove product structured data when leaving a product page. */
export function clearProductJsonLd(): void {
  if (typeof document === 'undefined') return
  document.getElementById(PRODUCT_JSONLD_ID)?.remove()
}
