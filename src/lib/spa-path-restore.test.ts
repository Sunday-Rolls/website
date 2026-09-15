import { afterEach, describe, expect, it, vi } from 'vitest'
import { restoreSpaPathFromRedirect } from '@/lib/spa-path-restore'

describe('restoreSpaPathFromRedirect', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('replaces the current URL with the stored deep link', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })
    sessionStorage.setItem('sunday-rolls-spa-path', '/shop?color=navy')

    restoreSpaPathFromRedirect()

    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    expect(replaceState).toHaveBeenCalledWith(null, '', `${base}/shop?color=navy`)
    expect(sessionStorage.getItem('sunday-rolls-spa-path')).toBeNull()
  })

  it('does nothing when no redirect is stored', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })

    restoreSpaPathFromRedirect()

    expect(replaceState).not.toHaveBeenCalled()
  })
})
