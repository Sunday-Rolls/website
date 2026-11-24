import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the heavy weight, so control visitors never download it.
import '@fontsource/inter/latin-800.css'

/**
 * Doodle banner (A/B test home-doodle-banner, arm b).
 * A founder's sketchbook page, inspired by the cover's all-over doodle art: a crowd of original
 * little monsters in black ink and greys packs the edges, each one drawing itself in. Their eyes
 * follow the pointer. The cover is taped onto the page. One fit (L.A.B. DF3), no fit picker.
 */
export function DoodleBanner() {
  const { doodle } = usePageContent('home')
  const sectionRef = useRef<HTMLElement>(null)
  useEyesFollowPointer(sectionRef)

  if (!doodle) return null

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-paper text-ink"
      aria-labelledby="home-doodle-heading"
    >
      {/* Sketchbook dot grid. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(22,22,22,0.13)_1px,transparent_1.4px)] [background-size:22px_22px]"
      />
      <Crowd />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+7.5rem)] lg:pt-24 lg:pb-60">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            {doodle.eyebrow ? (
              <p className="inline-block -rotate-2 rounded-full border-2 border-ink bg-white px-4 py-1 font-body text-label font-bold tracking-[0.25em] uppercase shadow-[3px_3px_0_var(--color-ink)]">
                {doodle.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-doodle-heading"
              className="space-y-1 font-body text-[clamp(2.6rem,6.2vw,5rem)] leading-[0.95] font-extrabold tracking-[-0.02em] text-white uppercase [-webkit-text-stroke:2px_var(--color-ink)] [paint-order:stroke_fill] [text-shadow:4px_4px_0_var(--color-graphite)] sm:[-webkit-text-stroke:2.5px_var(--color-ink)] sm:[text-shadow:5px_5px_0_var(--color-graphite)]"
            >
              {doodle.titleLines.map((line, index) => (
                <span
                  key={line}
                  className={cn('relative block w-fit', index % 2 === 0 ? '-rotate-[1.5deg]' : 'rotate-1')}
                >
                  {line}{' '}
                  {index === doodle.titleLines.length - 1 ? <Scribble /> : null}
                </span>
              ))}
            </h2>

            {doodle.subtitle ? (
              <p className="font-body text-lg font-bold text-ink sm:text-xl">{doodle.subtitle}</p>
            ) : null}

            <div className="space-y-4 font-body text-body text-ink/80">
              {doodle.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {doodle.notes?.length ? (
              <div className="relative max-w-md rotate-[0.6deg] border-2 border-ink bg-white px-5 pt-4 pb-4 shadow-[5px_5px_0_var(--color-pencil)]">
                <Tape className="-top-3 left-6 -rotate-6" />
                <p className="mb-2 font-body text-xs font-extrabold tracking-[0.25em] uppercase">Field notes</p>
                <dl className="space-y-1 font-body text-body-small">
                  {doodle.notes.map((row) => (
                    <div key={row.label} className="flex gap-3 border-b border-dashed border-ink/20 pb-1 last:border-0">
                      <dt className="w-24 shrink-0 font-bold">{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <Button
              href={doodle.href}
              className="group [&>span]:gap-3 [&>span]:rounded-[14px_18px_12px_20px] [&>span]:border-[2.5px] [&>span]:border-ink [&>span]:bg-ink [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-extrabold [&>span]:text-white [&>span]:shadow-[4px_4px_0_var(--color-graphite)] [&>span]:transition-[transform,box-shadow] hover:[&>span]:-translate-y-0.5 hover:[&>span]:-rotate-1 hover:[&>span]:shadow-[6px_6px_0_var(--color-graphite)]"
              onClick={() => trackCtaClick(doodle.cta.label, 'home_doodle')}
            >
              {doodle.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>

          {/* The cover, taped into the sketchbook. */}
          <div className="relative order-1 mx-auto w-full max-w-[20rem] sm:max-w-[24rem] lg:order-2 lg:max-w-[27rem]">
            <DoodleArrow className="absolute -bottom-10 -left-16 hidden h-24 w-28 text-ink lg:block" />
            <Sparkle className="absolute -top-8 -right-2 h-10 w-10 text-ink" />
            <Sparkle className="absolute top-[40%] -right-10 h-7 w-7 text-graphite" />
            <div className="relative rotate-2 border-2 border-ink bg-white p-3 shadow-[8px_8px_0_var(--color-ink)] sm:p-4">
              <Tape className="-top-4 -left-5 -rotate-[28deg]" />
              <Tape className="-right-5 -bottom-3 -rotate-[28deg]" />
              <img
                src={assetUrl(doodle.image)}
                alt="The Doodle center-shafted putter cover"
                width={900}
                height={900}
                fetchPriority="low"
                decoding="async"
                className="aspect-square w-full border-2 border-ink object-cover"
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

/** Move each monster's pupils toward the pointer, at most once per frame. */
function useEyesFollowPointer(sectionRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    // matchMedia is missing in some environments (old browsers, tests): then just track the pointer.
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let pointer: { x: number; y: number } | null = null

    function update() {
      frame = 0
      if (!section || !pointer) return
      const monsters = section.querySelectorAll<HTMLElement>('[data-doodle-monster]')
      monsters.forEach((monster) => {
        const rect = monster.getBoundingClientRect()
        const dx = pointer!.x - (rect.left + rect.width / 2)
        const dy = pointer!.y - (rect.top + rect.height / 2)
        const distance = Math.hypot(dx, dy) || 1
        monster.style.setProperty('--dx', (dx / distance).toFixed(3))
        monster.style.setProperty('--dy', (dy / distance).toFixed(3))
      })
    }

    function onMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [sectionRef])
}

type Eye = [cx: number, cy: number, r: number]
type MonsterShape = { body: string; fill: string; eyes: Eye[]; extras?: string[] }

const INK = 'var(--color-ink)'
const LIGHT = '#ffffff'
const MID = '#d9d8d3'
const DARK = '#7d7d78'

/** Ten original doodle monsters, drawn on a 100×100 grid. */
const MONSTERS: MonsterShape[] = [
  // Blob
  { body: 'M20 70 C10 40 30 12 52 14 C76 16 92 40 84 70 C80 88 26 92 20 70 Z', fill: MID, eyes: [[40, 45, 9], [64, 45, 9]], extras: ['M40 66 Q52 76 64 66'] },
  // Cyclops ghost
  { body: 'M24 90 V44 C24 20 76 20 76 44 V90 L68 82 L60 90 L50 82 L40 90 L32 82 Z', fill: LIGHT, eyes: [[50, 46, 14]], extras: ['M42 70 Q50 74 58 70'] },
  // Three eyes
  { body: 'M16 60 C16 28 84 28 84 60 C84 86 16 86 16 60 Z', fill: DARK, eyes: [[34, 54, 7], [50, 44, 7], [66, 54, 7]], extras: ['M38 70 H62', 'M43 70 V75', 'M57 70 V75'] },
  // Horned
  { body: 'M26 88 C14 62 22 36 50 34 C78 36 86 62 74 88 Z', fill: MID, eyes: [[40, 58, 8], [60, 58, 8]], extras: ['M33 40 L26 16 L44 33', 'M67 40 L74 16 L56 33', 'M40 76 Q50 70 60 76'] },
  // Octopus
  { body: 'M26 58 C26 26 74 26 74 58 Z', fill: LIGHT, eyes: [[42, 46, 6], [58, 46, 6]], extras: ['M30 58 C26 72 16 74 12 84', 'M42 58 C40 74 36 82 34 92', 'M58 58 C60 74 64 82 66 92', 'M70 58 C74 72 84 74 88 84', 'M36 54 h2', 'M62 54 h2'] },
  // Fuzzy
  { body: 'M20 60 L15 52 L21 46 L17 38 L26 34 L26 25 L35 26 L39 17 L47 22 L53 15 L59 22 L67 17 L71 26 L79 25 L79 34 L87 38 L83 46 L89 52 L83 60 L87 69 L78 72 L76 81 L66 80 L60 87 L52 80 L44 87 L38 80 L28 81 L24 72 L15 68 Z', fill: MID, eyes: [[40, 48, 5], [60, 48, 5]], extras: ['M43 62 Q50 57 57 62'] },
  // Worm
  { body: 'M30 90 C22 60 30 24 56 22 C80 20 88 46 78 60 C70 70 56 64 54 90 Z', fill: DARK, eyes: [[64, 38, 8]], extras: ['M34 74 H54', 'M32 62 H58', 'M36 50 H64', 'M68 50 Q72 54 76 50'] },
  // Bot
  { body: 'M24 30 H76 V84 H24 Z', fill: LIGHT, eyes: [[38, 52, 7], [62, 52, 7]], extras: ['M50 30 V16', 'M46 12 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0', 'M36 72 H64', 'M43 68 V76', 'M50 68 V76', 'M57 68 V76'] },
  // One-eyed dot
  { body: 'M26 54 A24 24 0 1 0 74 54 A24 24 0 1 0 26 54 Z', fill: DARK, eyes: [[50, 50, 11]], extras: ['M30 34 L22 24', 'M70 34 L78 24'] },
  // X-eyed ghost
  { body: 'M24 90 V46 C24 22 76 22 76 46 V90 C70 84 64 90 58 84 C52 90 46 84 40 90 C34 84 30 90 24 90 Z', fill: LIGHT, eyes: [], extras: ['M36 44 L46 54', 'M46 44 L36 54', 'M54 44 L64 54', 'M64 44 L54 54', 'M38 68 L42 64 L46 68 L50 64 L54 68 L58 64 L62 68'] },
]

function Monster({ shape, delay, blink }: { shape: MonsterShape; delay: number; blink: number }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" style={{ '--draw-delay': `${delay}s` } as CSSProperties}>
      <path
        d={shape.body}
        pathLength={1}
        fill={shape.fill}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
        className="doodle-ink doodle-wash"
      />
      {shape.extras?.map((d) => (
        <path key={d} d={d} pathLength={1} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="doodle-ink" />
      ))}
      {shape.eyes.map(([cx, cy, r]) => (
        <g
          key={`${cx}-${cy}`}
          className="origin-center [transform-box:fill-box] motion-safe:animate-[doodle-blink_6s_ease-in-out_infinite]"
          style={{ animationDelay: `${blink}s` }}
        >
          <circle cx={cx} cy={cy} r={r} pathLength={1} fill={LIGHT} stroke={INK} strokeWidth="2.4" className="doodle-ink doodle-wash" />
          <g
            className="transition-transform duration-150 ease-out"
            style={{ transform: `translate(calc(var(--dx, 0) * ${(r * 0.42).toFixed(2)}px), calc(var(--dy, 0) * ${(r * 0.42).toFixed(2)}px))` }}
          >
            <circle cx={cx} cy={cy} r={r * 0.48} fill={INK} className="doodle-wash" />
            <circle cx={cx - r * 0.18} cy={cy - r * 0.2} r={r * 0.14} fill={LIGHT} className="doodle-wash" />
          </g>
        </g>
      ))}
    </svg>
  )
}

/** Where each monster sits: [left %, top %, size rem, rotation, monster, wide screens only]. */
const PLACEMENTS: Array<[number, number, number, number, number, boolean]> = [
  // Crowd along the bottom edge.
  [-2, 80, 9, -8, 0, false], [7, 84, 7.5, 6, 3, false], [15, 79, 8.5, -4, 5, false], [24, 85, 7, 10, 1, false],
  [32, 81, 8, -6, 7, false], [41, 86, 7, 4, 2, false], [49, 80, 9, -10, 9, false], [58, 85, 7.5, 8, 4, false],
  [66, 80, 8.5, -3, 6, false], [75, 85, 7, 7, 8, false], [83, 79, 9, -7, 0, false], [92, 84, 8, 5, 5, false],
  // Up the sides on wide screens.
  [-3, 8, 8, 12, 2, true], [1, 30, 7, -10, 8, true], [-2, 52, 8.5, 6, 1, true],
  [92, 6, 8, -12, 3, true], [95, 28, 7, 8, 9, true], [91, 50, 8, -5, 6, true],
]

function Crowd() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {PLACEMENTS.map(([left, top, size, rotate, monster, wideOnly], index) => (
        <div
          key={index}
          data-doodle-monster=""
          className={cn('absolute', wideOnly ? 'hidden xl:block' : 'block')}
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `clamp(${(size * 0.6).toFixed(2)}rem, ${(size * 0.95).toFixed(2)}vw, ${size}rem)`,
            aspectRatio: '1',
            transform: `rotate(${rotate}deg)`,
          }}
        >
          <Monster shape={MONSTERS[monster]} delay={0.15 + (index % 9) * 0.12} blink={-((index * 1.7) % 6)} />
        </div>
      ))}
      {/* Little squiggles and stars between them. */}
      <svg viewBox="0 0 1440 900" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.55">
          <path d="M120 120 q10 -14 20 0 t20 0 t20 0" pathLength={1} className="doodle-ink" />
          <path d="M1300 160 q10 -14 20 0 t20 0" pathLength={1} className="doodle-ink" />
          <path d="M700 60 l6 12 l13 2 l-10 9 l3 13 l-12 -7 l-12 7 l3 -13 l-10 -9 l13 -2 z" pathLength={1} className="doodle-ink" />
          <path d="M240 680 c-10 -10 10 -20 0 -30 c-10 -10 10 -20 0 -30" pathLength={1} className="doodle-ink" />
          <path d="M1220 640 a10 10 0 1 0 20 0 a5 5 0 1 0 -10 0" pathLength={1} className="doodle-ink" />
        </g>
      </svg>
    </div>
  )
}

/** A hand-drawn scribble underline under the last headline line. */
function Scribble() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      className="absolute -bottom-3 left-0 h-4 w-full sm:h-5"
    >
      <path
        d="M4 14 C60 4 120 20 180 10 S270 6 296 12 M20 20 C90 12 170 22 250 16"
        pathLength={1}
        fill="none"
        stroke={INK}
        strokeWidth="3.5"
        strokeLinecap="round"
        className="doodle-ink"
        style={{ '--draw-delay': '0.8s' } as CSSProperties}
      />
    </svg>
  )
}

function Tape({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute z-10 block h-6 w-20 bg-[rgba(232,225,205,0.82)] shadow-[0_1px_2px_rgba(0,0,0,0.15)] [clip-path:polygon(3%_0,97%_4%,100%_50%,96%_100%,2%_96%,0_50%)]',
        className,
      )}
    />
  )
}

function DoodleArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={className} aria-hidden="true">
      <path d="M8 86 C30 90 70 80 84 50 C90 36 92 26 96 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength={1} className="doodle-ink" style={{ '--draw-delay': '1.2s' } as CSSProperties} />
      <path d="M84 22 L96 12 L104 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="doodle-ink" style={{ '--draw-delay': '1.8s' } as CSSProperties} />
    </svg>
  )
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <path d="M20 4 C21 14 26 19 36 20 C26 21 21 26 20 36 C19 26 14 21 4 20 C14 19 19 14 20 4 Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" pathLength={1} className="doodle-ink" />
    </svg>
  )
}
