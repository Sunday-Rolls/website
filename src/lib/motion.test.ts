import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMinimumDuration } from './motion'

describe('useMinimumDuration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays false when never active', () => {
    const { result } = renderHook(() => useMinimumDuration(false, 1000))
    expect(result.current).toBe(false)
  })

  it('holds for the minimum when the work finishes early', () => {
    const { result, rerender } = renderHook(({ active }) => useMinimumDuration(active, 1000), {
      initialProps: { active: true },
    })
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(200))
    rerender({ active: false })
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(799))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('releases straight away when the work outlasts the minimum', () => {
    const { result, rerender } = renderHook(({ active }) => useMinimumDuration(active, 1000), {
      initialProps: { active: true },
    })
    act(() => vi.advanceTimersByTime(1500))
    rerender({ active: false })
    act(() => vi.advanceTimersByTime(0))
    expect(result.current).toBe(false)
  })

  it('holds again when work restarts after going idle', () => {
    const { result, rerender } = renderHook(({ active }) => useMinimumDuration(active, 1000), {
      initialProps: { active: false },
    })
    rerender({ active: true })
    expect(result.current).toBe(true)
    rerender({ active: false })
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(false)
  })
})
