/** Prefix a public asset path with the Vite base URL (e.g. /website/ on GitHub Pages). */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${base}${normalizedPath}`
}
