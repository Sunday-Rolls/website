import { useEffect } from 'react'
import {
  recordExposure,
  shouldRecordExposure,
  useExperimentsSnapshot,
  variantFrom,
} from '@/lib/experiments'

/**
 * The visitor's arm for `key` (`'control'` when the experiment is missing, not loaded yet,
 * or the visitor is outside the traffic split). Rendering the caller counts as an exposure,
 * logged once per visitor, so call it in the component that actually shows the difference.
 */
export function useVariant(key: string): string {
  const snapshot = useExperimentsSnapshot()
  const arm = variantFrom(snapshot, key)
  const eligible = shouldRecordExposure(snapshot, key)

  useEffect(() => {
    if (eligible) recordExposure(key)
  }, [key, arm, eligible])

  return arm
}
