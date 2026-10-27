const SHOPIFY_WIDTHS = [480, 640, 800]
const LOCAL_WIDTHS = [320, 480, 640, 800]
/** Bump when replacing product masters so browsers skip cached green-BG WebPs. */
export const LOCAL_PRODUCT_IMAGE_VERSION = '20261027-front'

function isShopifyCdn(url: string): boolean {
  try {
    return new URL(url).hostname.includes('cdn.shopify.com')
  } catch {
    return false
  }
}

function nearestWidth(widths: number[], target: number): number {
  const fit = widths.find((width) => width >= target)
  return fit ?? widths[widths.length - 1]
}

/** Local catalog photo, including one that already points at a generated size. */
function localProductBase(url: string): { prefix: string; name: string } | undefined {
  const marker = '/assets/products/'
  const index = url.indexOf(marker)
  if (index === -1) return undefined

  let file = url.slice(index + marker.length).split(/[?#]/)[0]
  const sized = file.match(/^w\d+\/(.+)$/)
  if (sized) file = sized[1]
  if (!/\.(jpe?g|png|webp)$/i.test(file)) return undefined

  return {
    prefix: url.slice(0, index),
    name: file.replace(/\.(jpe?g|png|webp)$/i, ''),
  }
}

function withLocalCacheBust(path: string): string {
  const joiner = path.includes('?') ? '&' : '?'
  return `${path}${joiner}v=${LOCAL_PRODUCT_IMAGE_VERSION}`
}

function localSizedUrl(url: string, width: number): string | undefined {
  const local = localProductBase(url)
  if (!local) return undefined
  const chosen = nearestWidth(LOCAL_WIDTHS, width)
  return withLocalCacheBust(`${local.prefix}/assets/products/w${chosen}/${local.name}.webp`)
}

/** Resize Shopify CDN images and local product photos. */
export function sizedImageUrl(url: string | undefined, width: number): string | undefined {
  if (!url) return undefined
  if (isShopifyCdn(url)) {
    try {
      const parsed = new URL(url)
      parsed.searchParams.set('width', String(width))
      return parsed.toString()
    } catch {
      return url
    }
  }
  return localSizedUrl(url, width) ?? url
}

export function productImageSrcSet(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (isShopifyCdn(url)) {
    return SHOPIFY_WIDTHS.map((width) => `${sizedImageUrl(url, width)} ${width}w`).join(', ')
  }

  const local = localProductBase(url)
  if (!local) return undefined
  return LOCAL_WIDTHS.map((width) => {
    const path = withLocalCacheBust(
      `${local.prefix}/assets/products/w${width}/${local.name}.webp`,
    )
    return `${path} ${width}w`
  }).join(', ')
}

/** Gallery src: a Shopify width param, or the prebuilt local WebP nearest that width. */
export function optimizedImageUrl(url: string | undefined, width = 800): string | undefined {
  if (!url) return undefined
  if (isShopifyCdn(url)) return sizedImageUrl(url, width)
  return localSizedUrl(url, width) ?? url
}
