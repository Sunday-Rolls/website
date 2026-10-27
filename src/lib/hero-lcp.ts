/** Removes the static homepage LCP poster injected in index.html (outside #root). */
export function removeStaticHeroLcp(): void {
  document.getElementById('hero-lcp')?.remove()
}

/** True when the React route is the homepage (basename already stripped by the router). */
export function isHomePath(pathname: string): boolean {
  return pathname === '/' || pathname === ''
}
