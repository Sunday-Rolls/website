import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Stays true for at least `minMs` after `active` turns on, so a loading animation
 * plays through once even when the work behind it finishes quickly.
 */
export function useMinimumDuration(active: boolean, minMs: number): boolean {
  const startedAt = useRef<number | null>(null)
  const [holding, setHolding] = useState(active)
  const [wasActive, setWasActive] = useState(active)

  // Latch on during render so there's no frame between `active` and the hold.
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setHolding(true)
  }

  useEffect(() => {
    if (active) {
      startedAt.current ??= Date.now()
      return
    }
    if (!holding) return

    const elapsed = startedAt.current === null ? minMs : Date.now() - startedAt.current
    const timer = window.setTimeout(() => {
      startedAt.current = null
      setHolding(false)
    }, Math.max(0, minMs - elapsed))
    return () => window.clearTimeout(timer)
  }, [active, holding, minMs])

  return active || holding
}
