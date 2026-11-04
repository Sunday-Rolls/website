import type { ReactNode } from 'react'
import { useVariant } from '@/components/experiments/useVariant'

type VariantProps = {
  experiment: string
  /** Arm (or arms) that render `children`. */
  is: string | readonly string[]
  children: ReactNode
  /** Rendered for every other arm. */
  fallback?: ReactNode
}

/**
 * `<Variant experiment="home-banner" is="b"><SplatBanner /></Variant>`
 *
 * Logs the exposure whichever arm the visitor is in, so pair it with a control branch
 * (`fallback`, or a second `<Variant is="control">`) rather than gating only the new arm
 * somewhere the control visitor never renders.
 */
export function Variant({ experiment, is, children, fallback = null }: VariantProps) {
  const arm = useVariant(experiment)
  const arms: readonly string[] = typeof is === 'string' ? [is] : is
  return <>{arms.includes(arm) ? children : fallback}</>
}
