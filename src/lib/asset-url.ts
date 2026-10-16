/** Prefix a public asset path with the Vite base URL (e.g. /website/ on GitHub Pages). */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${base}${normalizedPath}`
}

/** Prefix each URL in a srcset while leaving width descriptors alone. */
export function assetSrcSet(srcSet: string): string {
  return srcSet
    .split(',')
    .map((part) => {
      const [url, ...descriptor] = part.trim().split(/\s+/)
      if (!url) return ''
      return [assetUrl(url), ...descriptor].join(' ')
    })
    .filter(Boolean)
    .join(', ')
}
