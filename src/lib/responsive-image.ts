/** Resize Shopify CDN images; pass through other hosts unchanged. */
export function sizedImageUrl(url: string | undefined, width: number): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('cdn.shopify.com')) return url
    parsed.searchParams.set('width', String(width))
    return parsed.toString()
  } catch {
    return url
  }
}

export function productImageSrcSet(url: string | undefined): string | undefined {
  if (!url) return undefined
  const widths = [320, 480, 640, 800]
  return widths
    .map((width) => {
      const sized = sizedImageUrl(url, width)
      return sized ? `${sized} ${width}w` : null
    })
    .filter(Boolean)
    .join(', ')
}
