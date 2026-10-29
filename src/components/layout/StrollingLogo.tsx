import { lazy, Suspense, useCallback, useEffect, useId, useState } from 'react'
import { brandAssets } from '@/assets'
import { cn } from '@/lib/utils'
import { loadStrollRig } from './stroll-loader'

const LazyRig = lazy(() =>
  loadStrollRig().then(({ StrollingRig, STROLL_S }) => ({
    default: function StrollPlayer({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
      const clipId = `stroll-log-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
      useEffect(() => {
        onReady()
        const timer = window.setTimeout(onDone, STROLL_S * 1000)
        return () => window.clearTimeout(timer)
      }, [onReady, onDone])
      return (
        <svg
          viewBox="0 0 79 120"
          className="pointer-events-none absolute left-0 top-0 h-9 w-auto overflow-visible"
          aria-hidden="true"
        >
          <StrollingRig clipId={clipId} />
        </svg>
      )
    },
  })),
)

interface StrollingLogoProps {
  strolling: boolean
  onDone: () => void
  /** Clicking him: the logo stays a link, so this runs alongside navigating home. */
  onClick?: () => void
  className?: string
}

/** The header's logo mark. While `strolling`, the rigged old man takes his place and goes for a walk. */
export function StrollingLogo({ strolling, onDone, onClick, className }: StrollingLogoProps) {
  const [rigShown, setRigShown] = useState(false)
  const [wasStrolling, setWasStrolling] = useState(strolling)
  const showRig = useCallback(() => setRigShown(true), [])

  // A new stroll waits for the rig to draw before hiding the logo picture.
  if (strolling !== wasStrolling) {
    setWasStrolling(strolling)
    if (!strolling) setRigShown(false)
  }

  return (
    <span className={cn('relative inline-block shrink-0', className)} onClick={onClick}>
      <img
        src={brandAssets.logoMark}
        alt=""
        aria-hidden="true"
        width={24}
        height={36}
        className={cn('h-9 w-auto', strolling && rigShown && 'invisible')}
      />
      {strolling ? (
        <Suspense fallback={null}>
          <LazyRig onReady={showRig} onDone={onDone} />
        </Suspense>
      ) : null}
    </span>
  )
}
