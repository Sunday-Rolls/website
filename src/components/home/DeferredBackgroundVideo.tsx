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
   * Wait this long after load before fetching the mp4.
   * The hero is on screen immediately, so a short idle timeout still
   * competes with Largest Contentful Paint.
   */
  delayMs?: number
}

/**
 * Renders a static poster as the paint/LCP surface, then mounts the video
 * after the visitor interacts or well after load.
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
  const loadDelay = delayMs ?? (prioritizePoster ? 15_000 : 20_000)

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

    return () => {
      cancelled = true
      cancelDelay()
      for (const event of ['pointerdown', 'keydown'] as const) {
        window.removeEventListener(event, onInteract)
      }
    }
  }, [loadDelay])

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
