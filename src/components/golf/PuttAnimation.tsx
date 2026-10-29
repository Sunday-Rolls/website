import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

/** One full putt, from the take-back to the ball dropping and resetting. */
export const PUTT_LOOP_MS = 3600

const DUR = `${PUTT_LOOP_MS / 1000}s`
const INK = 'var(--color-heritage-green)'
const ACCENT = 'var(--color-soft-gold)'
const PUTT_LINE = 'M96 136 C180 162 300 100 390 126'
const FLAG = 'M395 36 Q413 38 430 45 Q413 51 395 57 Z'
const FLAG_WAVE = 'M395 36 Q411 42 430 42 Q411 55 395 57 Z'

/** A putter taps the ball along a breaking line into the cup, on a loop. */
export function PuttAnimation({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const svg = svgRef.current
    if (!reducedMotion || !svg || typeof svg.pauseAnimations !== 'function') return
    // Ball mid-roll on the line: reads as "in progress" without moving.
    svg.setCurrentTime((PUTT_LOOP_MS / 1000) * 0.45)
    svg.pauseAnimations()
  }, [reducedMotion])

  return (
    <svg ref={svgRef} viewBox="0 0 480 190" className={cn('block h-auto w-full', className)} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <ellipse
          cx="240"
          cy="128"
          rx="224"
          ry="50"
          fill="var(--color-sand)"
          stroke="var(--color-canvas-tan)"
          strokeWidth="2"
        />
        <path d={PUTT_LINE} stroke={ACCENT} strokeWidth="2" strokeDasharray="1.5 7" opacity="0">
          <animate
            attributeName="opacity"
            dur={DUR}
            repeatCount="indefinite"
            values="0;1;1;0;0"
            keyTimes="0;0.12;0.7;0.82;1"
          />
        </path>

        <ellipse cx="390" cy="127" rx="11" ry="3.6" fill={INK} stroke="none" />
        <circle cx="390" cy="127" r="4" stroke={ACCENT} strokeWidth="1.5" opacity="0">
          <animate attributeName="r" dur={DUR} repeatCount="indefinite" values="4;4;22;22" keyTimes="0;0.66;0.8;1" />
          <animate
            attributeName="opacity"
            dur={DUR}
            repeatCount="indefinite"
            values="0;0;0.9;0;0"
            keyTimes="0;0.66;0.67;0.8;1"
          />
        </circle>
        <path d="M395 126 V36" stroke={INK} strokeWidth="2.5" />
        <path d={FLAG} fill={ACCENT} stroke="none">
          <animate attributeName="d" dur="1.6s" repeatCount="indefinite" values={`${FLAG};${FLAG_WAVE};${FLAG}`} />
        </path>

        <g stroke={INK}>
          <path d="M58 20 L80 132" strokeWidth="3" />
          <path d="M74 134 H92" strokeWidth="6" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            dur={DUR}
            repeatCount="indefinite"
            values="0 58 20;0 58 20;10 58 20;-6 58 20;0 58 20;0 58 20"
            keyTimes="0;0.06;0.18;0.25;0.4;1"
            calcMode="spline"
            keySplines="0 0 1 1;.4 0 .2 1;.6 0 .4 1;.4 0 .2 1;0 0 1 1"
          />
        </g>

        <g>
          <circle r="7" fill="#fff" stroke={INK} strokeWidth="1.6">
            <animate
              attributeName="r"
              dur={DUR}
              repeatCount="indefinite"
              values="7;7;7;0;0;7"
              keyTimes="0;0.25;0.65;0.69;0.94;1"
            />
          </circle>
          <g fill="var(--color-canvas-tan)" stroke="none">
            <circle cx="2.5" cy="-2" r="1.1" />
            <circle cx="-2.5" cy="1.5" r="1.1" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              dur={DUR}
              repeatCount="indefinite"
              values="0;0;900;900"
              keyTimes="0;0.25;0.65;1"
              calcMode="spline"
              keySplines="0 0 1 1;.2 .5 .4 1;0 0 1 1"
            />
            <animate
              attributeName="opacity"
              dur={DUR}
              repeatCount="indefinite"
              values="1;1;0;0;1"
              keyTimes="0;0.64;0.66;0.95;1"
            />
          </g>
          <animateMotion
            dur={DUR}
            repeatCount="indefinite"
            path={PUTT_LINE}
            keyPoints="0;0;1;1;0;0"
            keyTimes="0;0.25;0.65;0.93;0.94;1"
            calcMode="spline"
            keySplines="0 0 1 1;.2 .5 .4 1;0 0 1 1;0 0 1 1;0 0 1 1"
          />
        </g>
      </g>
    </svg>
  )
}

/** Full-screen "working on it" state that plays at least one putt. */
export function PuttLoader({ label, overlay = false }: { label: string; overlay?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-4 text-center',
        overlay
          ? 'fixed inset-0 z-40 bg-cream/80 backdrop-blur-sm'
          : 'min-h-[calc(100svh-4rem)] py-section-y',
      )}
    >
      <div className="w-72 max-w-[80vw]">
        <PuttAnimation />
      </div>
      <p className="font-body text-label uppercase tracking-widest text-heritage-green/70">{label}</p>
    </div>
  )
}
