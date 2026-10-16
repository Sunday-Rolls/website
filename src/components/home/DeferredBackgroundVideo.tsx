import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type DeferredBackgroundVideoProps = {
  videoSrc: string
  posterSrc: string
  posterWebpSrc?: string
  posterWebpSrcSet?: string
  posterWidth?: number
  posterHeight?: number
  /** Eager poster fetch for above-the-fold LCP. */
  prioritizePoster?: boolean
  className?: string
  videoClassName?: string
  /** Start loading when within this margin of the viewport. */
  rootMargin?: string
}

/**
 * Renders a static poster as the paint/LCP surface, then mounts the video only
 * after the section is near the viewport (and after first paint for the hero).
 */
export function DeferredBackgroundVideo({
  videoSrc,
  posterSrc,
  posterWebpSrc,
  posterWebpSrcSet,
  posterWidth = 1280,
  posterHeight = 720,
  prioritizePoster = false,
  className,
  videoClassName,
  rootMargin = '200px',
}: DeferredBackgroundVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node || shouldLoadVideo) return

    let idleId: number | undefined
    let timeoutId: number | undefined
    let cancelled = false

    const armLoad = () => {
      if (cancelled || shouldLoadVideo) return
      const start = () => {
        if (!cancelled) setShouldLoadVideo(true)
      }
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(start, { timeout: 2500 })
      } else {
        timeoutId = window.setTimeout(start, 600)
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      armLoad()
      return () => {
        cancelled = true
        if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(idleId)
        }
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          armLoad()
        }
      },
      { rootMargin },
    )
    observer.observe(node)

    return () => {
      cancelled = true
      observer.disconnect()
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [rootMargin, shouldLoadVideo])

  return (
    <div ref={containerRef} className={cn('absolute inset-0', className)}>
      <picture>
        {posterWebpSrcSet || posterWebpSrc ? (
          <source
            srcSet={posterWebpSrcSet ?? posterWebpSrc}
            {...(posterWebpSrcSet ? { sizes: '100vw' } : {})}
            type="image/webp"
          />
        ) : null}
        <img
          src={posterSrc}
          alt=""
          aria-hidden="true"
          width={posterWidth}
          height={posterHeight}
          decoding="async"
          fetchPriority={prioritizePoster ? 'high' : 'low'}
          loading={prioritizePoster ? 'eager' : 'lazy'}
          className={cn('h-full w-full object-cover', videoClassName)}
        />
      </picture>

      {shouldLoadVideo ? (
        <video
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            videoClassName,
          )}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={posterSrc}
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ) : null}
    </div>
  )
}
