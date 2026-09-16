import { useEffect } from 'react'

const HEADER_OFFSET = 64
const SECTION_SELECTOR = '.home-snap-section'
const LERP = 0.06
const SETTLE_DURATION_MS = 900
const SETTLE_THRESHOLD_PX = 28

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function maxScrollY() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

function sectionTargets() {
  return Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)).map((section) =>
    clamp(section.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, 0, maxScrollY()),
  )
}

function nearestSectionTarget(scrollY: number) {
  const targets = sectionTargets()
  if (targets.length === 0) return scrollY

  let nearest = targets[0]
  let nearestDistance = Math.abs(scrollY - nearest)

  for (const target of targets) {
    const distance = Math.abs(scrollY - target)
    if (distance < nearestDistance) {
      nearest = target
      nearestDistance = distance
    }
  }

  return nearest
}

function animateScrollTo(targetY: number, durationMs: number) {
  const startY = window.scrollY
  const delta = targetY - startY
  if (Math.abs(delta) < 1) return Promise.resolve()

  const start = performance.now()

  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      window.scrollTo({ top: startY + delta * easeInOutCubic(progress), behavior: 'auto' })
      if (progress < 1) {
        requestAnimationFrame(tick)
        return
      }
      resolve()
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Slows homepage scrolling with eased inertia and a gentle settle onto section tops.
 */
export function useHomeSmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return

    let frame = 0
    let current = window.scrollY
    let target = window.scrollY
    let animating = false
    let settling = false
    let settleTimer = 0

    const stopFrame = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      animating = false
    }

    const render = () => {
      const delta = target - current
      if (Math.abs(delta) < 0.35) {
        current = target
        window.scrollTo({ top: current, behavior: 'auto' })
        animating = false
        frame = 0
        return
      }

      current += delta * LERP
      window.scrollTo({ top: current, behavior: 'auto' })
      frame = requestAnimationFrame(render)
    }

    const startRender = () => {
      if (animating || settling) return
      animating = true
      frame = requestAnimationFrame(render)
    }

    const queueSettle = () => {
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (settling) return
        const nearest = nearestSectionTarget(window.scrollY)
        if (Math.abs(nearest - window.scrollY) < SETTLE_THRESHOLD_PX) return

        settling = true
        stopFrame()
        target = nearest
        current = window.scrollY
        void animateScrollTo(nearest, SETTLE_DURATION_MS).finally(() => {
          current = nearest
          target = nearest
          settling = false
        })
      }, 140)
    }

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      if ((event.target as Element | null)?.closest?.('.product-carousel-snap')) return
      if (settling) {
        event.preventDefault()
        return
      }

      event.preventDefault()
      target = clamp(target + event.deltaY, 0, maxScrollY())
      startRender()
      queueSettle()
    }

    const onScroll = () => {
      if (animating || settling) return
      current = window.scrollY
      target = window.scrollY
      queueSettle()
    }

    const onResize = () => {
      target = clamp(target, 0, maxScrollY())
      current = clamp(window.scrollY, 0, maxScrollY())
    }

    document.documentElement.classList.add('home-smooth-scroll')
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      document.documentElement.classList.remove('home-smooth-scroll')
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(settleTimer)
      stopFrame()
    }
  }, [])
}
