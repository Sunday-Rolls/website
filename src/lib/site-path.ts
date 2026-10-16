/** GitHub Pages serves directory indexes at the slash URL and 301s the other form. */
export function sitePath(path: string): string {
  if (!path.startsWith('/')) return path

  const hashAt = path.indexOf('#')
  const hash = hashAt >= 0 ? path.slice(hashAt) : ''
  const withoutHash = hashAt >= 0 ? path.slice(0, hashAt) : path
  const queryAt = withoutHash.indexOf('?')
  const search = queryAt >= 0 ? withoutHash.slice(queryAt) : ''
  let pathname = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash

  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  if (pathname !== '/') pathname = `${pathname}/`

  return `${pathname}${search}${hash}`
}
