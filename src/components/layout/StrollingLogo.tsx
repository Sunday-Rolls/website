import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { brandAssets } from '@/assets'
import { cn } from '@/lib/utils'
import { loadStrollRig } from './stroll-loader'
import type { PuttGeometry } from './StrollingRig'

const LazyRig = lazy(() =>
  loadStrollRig().then(({ StrollingRig, PuttToCart, STROLL_S }) => ({
    default: function StrollPlayer({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
      const clipId = `stroll-log-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
      const anchorRef = useRef<HTMLSpanElement>(null)
      const [scene, setScene] = useState<{ header: HTMLElement; g: PuttGeometry } | null>(null)

      // Measure where the ball starts and where the cart is before drawing anything, so
      // the old man and the ball start on the same clock.
      useLayoutEffect(() => {
        const anchor = anchorRef.current
        const header = anchor?.closest('header')
        const cart = header?.querySelector('[data-putt-target]')
        if (!anchor || !header || !cart) return
        const h = header.getBoundingClientRect()
        const box = anchor.getBoundingClientRect()
        const c = cart.getBoundingClientRect()
        const unit = box.height / 120
        setScene({
          header,
          g: {
            logoLeft: box.left - h.left,
            unit,
            ground: h.height - 1.5,
            cartX: c.left - h.left + c.width / 2,
            cartY: c.top - h.top + c.height / 2,
            cartBottom: c.bottom - h.top - 1,
          },
        })
      }, [])

      useEffect(() => {
        if (!scene) return
        onReady()
        const timer = window.setTimeout(onDone, STROLL_S * 1000)
        return () => window.clearTimeout(timer)
      }, [scene, onReady, onDone])

      return (
        <>
          <span ref={anchorRef} className="pointer-events-none absolute left-0 top-0 h-9 w-[23.7px]" aria-hidden="true" />
          {scene ? (
            <>
              <svg
                viewBox="0 0 79 120"
                className="pointer-events-none absolute left-0 top-0 h-9 w-auto overflow-visible"
                aria-hidden="true"
              >
                <StrollingRig clipId={clipId} />
              </svg>
              {createPortal(<PuttToCart g={scene.g} />, scene.header)}
            </>
          ) : null}
        </>
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

/** The header's logo mark. While `strolling`, the rigged old man takes his place and putts a ball to the cart. */
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
