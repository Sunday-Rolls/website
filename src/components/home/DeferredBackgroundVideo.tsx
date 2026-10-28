import { useEffect, useRef, useState } from 'react'
import { scheduleAfterLoad } from '@/lib/schedule'
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
  /**
   * Fallback: wait this long after load before fetching the mp4 if the
   * visitor neither scrolls the video into view nor interacts.
   */
  delayMs?: number
}

/**
 * Renders a static poster as the paint/LCP surface, then mounts the video.
 * A prioritized (above-the-fold) video starts as soon as the page has loaded,
 * so the poster has already painted; others start when they near the viewport.
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
  delayMs,
}: DeferredBackgroundVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)
  const loadDelay = delayMs ?? (prioritizePoster ? 0 : 20_000)

  useEffect(() => {
    let cancelled = false
    const start = () => {
      if (!cancelled) setShouldLoadVideo(true)
    }
    const cancelDelay = scheduleAfterLoad(start, loadDelay)
    const onInteract = () => {
      cancelDelay()
      start()
    }

    for (const event of ['pointerdown', 'keydown'] as const) {
      window.addEventListener(event, onInteract, { once: true, passive: true })
    }

    const container = containerRef.current
    const observer =
      container && !prioritizePoster && 'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) onInteract()
            },
            { rootMargin: '200px 0px' },
          )
        : null
    if (container) observer?.observe(container)

    return () => {
      cancelled = true
      cancelDelay()
      observer?.disconnect()
      for (const event of ['pointerdown', 'keydown'] as const) {
        window.removeEventListener(event, onInteract)
      }
    }
  }, [loadDelay, prioritizePoster])

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
          decoding={prioritizePoster ? 'sync' : 'async'}
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
          preload="none"
          poster={posterWebpSrc ?? posterSrc}
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ) : null}
    </div>
  )
}
