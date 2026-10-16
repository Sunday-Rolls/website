const SHOPIFY_WIDTHS = [480, 640, 800]

function isShopifyCdn(url: string): boolean {
  try {
    return new URL(url).hostname.includes('cdn.shopify.com')
  } catch {
    return false
  }
}

/** Resize Shopify CDN images; pass through other hosts unchanged. */
export function sizedImageUrl(url: string | undefined, width: number): string | undefined {
  if (!url || !isShopifyCdn(url)) return url
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('width', String(width))
    return parsed.toString()
  } catch {
    return url
  }
}

export function productImageSrcSet(url: string | undefined): string | undefined {
  if (!url || !isShopifyCdn(url)) return undefined
  return SHOPIFY_WIDTHS.map((width) => `${sizedImageUrl(url, width)} ${width}w`).join(', ')
}

/** Gallery src: a Shopify width param, or the prebuilt 800px local file. */
export function optimizedImageUrl(url: string | undefined, width = 800): string | undefined {
  if (!url) return undefined
  if (isShopifyCdn(url)) return sizedImageUrl(url, width)

  const marker = '/assets/products/'
  const index = url.indexOf(marker)
  if (index === -1 || url.includes('/assets/products/w800/')) return url

  const file = url.slice(index + marker.length).split(/[?#]/)[0]
  if (!/\.(jpe?g|png)$/i.test(file)) return url
  return `${url.slice(0, index)}/assets/products/w800/${file}`
}
