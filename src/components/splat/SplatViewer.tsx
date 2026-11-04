import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SplatCloud } from '@/lib/splat/format'
import type { SplatRenderer } from '@/lib/splat/renderer'

interface SplatViewerProps {
  /** `.srsp` URL (already base-prefixed). */
  src: string
  poster: string
  alt: string
  /** `sway` rocks ±35° and springs back after a drag; `spin` turns all the way round. */
  motion: 'sway' | 'spin'
  className?: string
}

type Status = 'idle' | 'ready' | 'failed'

const SWAY_AMPLITUDE = 0.6
const SWAY_PERIOD_S = 11
const SPIN_PERIOD_S = 24
const REST_YAW = -0.32
const REST_PITCH = 0.1

const clouds = new Map<string, Promise<SplatCloud>>()

function loadCloud(src: string): Promise<SplatCloud> {
  let pending = clouds.get(src)
  if (!pending) {
    pending = Promise.all([
      import('@/lib/splat/format'),
      fetch(src).then((response) => {
        if (!response.ok) throw new Error(`splat ${response.status}`)
        return response.arrayBuffer()
      }),
    ]).then(([{ decodeSplat }, buffer]) => decodeSplat(buffer))
    pending.catch(() => clouds.delete(src))
    clouds.set(src, pending)
  }
  return pending
}

/**
 * A slowly turning Gaussian splat with a photo fallback. Nothing is fetched until
 * the viewer is near the viewport, the loop pauses offscreen, and visitors who
 * prefer reduced motion get a still angle they can drag.
 */
export function SplatViewer({ src, poster, alt, motion, className }: SplatViewerProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<SplatRenderer | null>(null)
  const [near, setNear] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const reducedMotion = usePrefersReducedMotion()

  // Live values the animation loop reads without re-subscribing.
  const live = useRef({ visible: false, reducedMotion, motion, dragging: false, offset: 0, lastX: 0, dirty: true })
  useEffect(() => {
    live.current.reducedMotion = reducedMotion
    live.current.motion = motion
    live.current.dirty = true
  }, [reducedMotion, motion])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof IntersectionObserver === 'undefined') return
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true)
      },
      { rootMargin: '400px 0px' },
    )
    const visibleObserver = new IntersectionObserver(([entry]) => {
      live.current.visible = Boolean(entry?.isIntersecting)
      live.current.dirty = true
    })
    nearObserver.observe(wrap)
    visibleObserver.observe(wrap)
    return () => {
      nearObserver.disconnect()
      visibleObserver.disconnect()
    }
  }, [])

  // Create the renderer and run the loop once we are close to the viewport.
  useEffect(() => {
    if (!near) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let cancelled = false
    let frame = 0
    let resizeObserver: ResizeObserver | null = null

    const onContextLost = () => setStatus('failed')
    canvas.addEventListener('webglcontextlost', onContextLost)

    void import('@/lib/splat/renderer')
      .then(({ SplatRenderer }) => {
        if (cancelled) return
        const renderer = new SplatRenderer(canvas)
        rendererRef.current = renderer

        const size = () => {
          const rect = wrap.getBoundingClientRect()
          renderer.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2))
          live.current.dirty = true
        }
        size()
        resizeObserver = new ResizeObserver(size)
        resizeObserver.observe(wrap)

        let clock = 0
        let last = performance.now()
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick)
          const dt = Math.min((now - last) / 1000, 0.1)
          last = now
          const state = live.current
          if (!state.visible) return

          const animate = !state.reducedMotion && !state.dragging
          if (animate) clock += dt
          // In sway mode the photo-built back isn't worth lingering on, so a drag
          // eases back to centre once released.
          if (!state.dragging && state.motion === 'sway' && Math.abs(state.offset) > 1e-4) {
            state.offset *= Math.exp(-dt * 2.2)
            state.dirty = true
          }
          if (!animate && !state.dirty) return
          state.dirty = false

          const base =
            state.reducedMotion
              ? REST_YAW
              : state.motion === 'spin'
                ? REST_YAW + (clock / SPIN_PERIOD_S) * Math.PI * 2
                : REST_YAW * 0.4 + SWAY_AMPLITUDE * Math.sin((clock / SWAY_PERIOD_S) * Math.PI * 2)
          const pitch = REST_PITCH + (state.reducedMotion ? 0 : 0.04 * Math.sin((clock / 7) * Math.PI * 2))
          renderer.render({ yaw: base + state.offset, pitch })
        }
        frame = requestAnimationFrame(tick)
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [near])

  // Load (or swap to) the current splat.
  useEffect(() => {
    if (!near) return
    let cancelled = false
    loadCloud(src)
      .then(async (cloud) => {
        // The renderer module may still be on its way.
        for (let i = 0; i < 100 && !rendererRef.current && !cancelled; i++) {
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        if (cancelled || !rendererRef.current) return
        rendererRef.current.setCloud(cloud)
        live.current.dirty = true
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
    }
  }, [near, src])

  const onPointerDown = (event: React.PointerEvent) => {
    if (status !== 'ready') return
    event.currentTarget.setPointerCapture(event.pointerId)
    live.current.dragging = true
    live.current.lastX = event.clientX
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const state = live.current
    if (!state.dragging) return
    const width = wrapRef.current?.clientWidth || 400
    state.offset += ((event.clientX - state.lastX) / width) * Math.PI
    if (state.motion === 'sway') state.offset = Math.max(-0.9, Math.min(0.9, state.offset))
    state.lastX = event.clientX
    state.dirty = true
  }
  const endDrag = () => {
    live.current.dragging = false
  }

  const ready = status === 'ready'

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={alt}
      className={cn('relative touch-pan-y select-none', ready && 'cursor-grab active:cursor-grabbing', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-splat-status={status}
    >
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        width={1024}
        height={1024}
        className={cn(
          'absolute inset-0 h-full w-full object-contain mix-blend-multiply transition-opacity duration-700',
          ready ? 'opacity-0' : 'opacity-100',
        )}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 h-full w-full transition-opacity duration-700',
          ready ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
