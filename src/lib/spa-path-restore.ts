const STORAGE_KEY = 'sunday-rolls-spa-path'

/** Replay a deep link after GitHub Pages serves the root 404 fallback. */
export function restoreSpaPathFromRedirect(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return
  }

  let saved: string | null = null
  try {
    saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }

  if (!saved) return

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = saved.startsWith('/') ? saved : `/${saved}`
  window.history.replaceState(null, '', `${base}${path}`)
}
