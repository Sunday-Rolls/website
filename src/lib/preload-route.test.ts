import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadForStaleChunk } from '@/lib/preload-route'

describe('reloadForStaleChunk', () => {
  const reload = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    reload.mockReset()
    vi.stubGlobal('location', { ...window.location, reload })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reloads once, then lets the next failure through', () => {
    expect(reloadForStaleChunk()).toBe(true)
    expect(reloadForStaleChunk()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again once the guard window has passed', () => {
    sessionStorage.setItem('sr:stale-chunk-reload', String(Date.now() - 60_000))
    expect(reloadForStaleChunk()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
