import { useRef, type CSSProperties, type PointerEvent } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

/**
 * Birdie Machine banner (A/B test home-mystery-banner, arm b).
 * An original 1970s Saturday-morning mystery: a moonlit course with fog rolling in, a headline
 * with a stacked groovy shadow, and the cover filed in a manila case folder. A flashlight follows
 * the pointer and picks out a trail of birdie footprints leading to the flag.
 * Center-shafted only, so there is no fit picker.
 */
export function MysteryBanner() {
  const { mystery } = usePageContent('home')
  const sectionRef = useRef<HTMLElement>(null)
  const frame = useRef(0)

  if (!mystery) return null

  // Move the flashlight with the pointer, at most once per frame.
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return
    const section = sectionRef.current
    if (!section) return
    const rect = section.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      section.style.setProperty('--lx', `${x}px`)
      section.style.setProperty('--ly', `${y}px`)
    })
  }

  return (
    <section
      ref={sectionRef}
      onPointerMove={onPointerMove}
      className="relative overflow-hidden bg-midnight text-cream"
      style={{ '--lx': '72%', '--ly': '78%' } as CSSProperties}
      aria-labelledby="home-mystery-heading"
    >
      {/* Night sky over the course. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--color-midnight)_0%,#262049_45%,var(--color-dusk)_80%,#43295c_100%)]"
      />
      <Stars />
      <Moon />
      <Course />

      {/* Flashlight: warm light wherever it points, and the trail it uncovers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-screen [background:radial-gradient(circle_260px_at_var(--lx)_var(--ly),rgba(255,236,190,0.3)_0%,rgba(255,236,190,0.1)_45%,rgba(255,236,190,0)_70%)]"
      />
      <BirdieTracks />

      <Fog />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+5rem)] lg:pt-24 lg:pb-40">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            {mystery.eyebrow ? (
              <p className="flex items-center gap-2.5 font-body text-label font-semibold uppercase tracking-[0.3em] text-groovy-lime">
                <MagnifierMark className="h-4 w-4" />
                {mystery.eyebrow}
              </p>
            ) : null}

            <h2 id="home-mystery-heading" className="space-y-2">
              {mystery.kicker ? (
                <span className="block font-body text-sm font-semibold uppercase tracking-[0.4em] text-cream/75 sm:text-base">
                  {mystery.kicker}{' '}
                </span>
              ) : null}
              <span className="block font-display text-[clamp(3rem,7.2vw,5.9rem)] leading-[0.92] font-semibold text-cream [text-shadow:2px_2px_0_var(--color-groovy-teal),4px_4px_0_var(--color-groovy-lime),6px_6px_0_var(--color-groovy-orange)] sm:[text-shadow:3px_3px_0_var(--color-groovy-teal),6px_6px_0_var(--color-groovy-lime),9px_9px_0_var(--color-groovy-orange)]">
                {mystery.title}
              </span>
            </h2>

            {mystery.subtitle ? (
              <p className="max-w-md font-display text-[1.5rem] leading-snug text-cream/90 sm:text-[1.65rem]">
                {mystery.subtitle}
              </p>
            ) : null}

            <div className="space-y-4 font-body text-body text-cream/75">
              {mystery.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button
                href={mystery.href}
                className="group [&>span]:gap-3 [&>span]:rounded-full [&>span]:border-2 [&>span]:border-groovy-orange [&>span]:bg-groovy-orange [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-semibold [&>span]:text-midnight [&>span]:shadow-[0_0_0_4px_rgba(240,138,60,0.18),0_12px_30px_-12px_rgba(240,138,60,0.8)] [&>span]:transition-[background-color,transform] hover:[&>span]:-translate-y-0.5 hover:[&>span]:bg-[#f6a061]"
                onClick={() => trackCtaClick(mystery.cta.label, 'home_mystery')}
              >
                {mystery.cta.label}
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </Button>
              <p className="hidden font-body text-body-small text-cream/55 [@media(hover:hover)]:block">
                Psst. Shine your light low and follow the tracks.
              </p>
            </div>
          </div>

          <CaseFile
            image={assetUrl(mystery.image)}
            caseNumber={mystery.caseNumber}
            evidence={mystery.evidence ?? []}
          />
        </div>
      </Container>
    </section>
  )
}

/** The cover as a paper-clipped snapshot in a manila case folder, with typed evidence. */
function CaseFile({
  image,
  caseNumber,
  evidence,
}: {
  image: string
  caseNumber?: string
  evidence: Array<{ label: string; value: string }>
}) {
  return (
    <div className="relative order-1 mx-auto w-full max-w-[21rem] pt-8 sm:max-w-[25rem] lg:order-2 lg:max-w-[28rem]">
      <div className="relative -rotate-3 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-rotate-1 motion-reduce:transition-none">
        {/* Folder tab */}
        {caseNumber ? (
          <div className="absolute -top-7 left-6 rounded-t-lg bg-manila px-5 pt-1.5 pb-3 font-mono text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#5b4320]">
            {caseNumber}
          </div>
        ) : null}

        <div className="relative rounded-lg rounded-tl-none bg-manila p-5 pb-6 shadow-[0_40px_70px_-30px_rgba(0,0,0,0.85)] [background-image:linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0)_30%),repeating-linear-gradient(90deg,rgba(120,85,30,0.04)_0_1px,transparent_1px_5px)] sm:p-6">
          {/* Snapshot */}
          <div className="relative mx-auto w-[86%] rotate-[3deg] bg-[#fbf8f1] p-3 pb-10 shadow-[0_14px_28px_-12px_rgba(0,0,0,0.6)]">
            <img
              src={image}
              alt="The Birdie Machine center-shafted putter cover"
              width={720}
              height={720}
              fetchPriority="low"
              decoding="async"
              className="aspect-square w-full object-cover"
            />
            <p aria-hidden="true" className="absolute inset-x-0 bottom-3 text-center font-display text-lg text-[#3b3a4a]">
              Last seen: hole 18
            </p>
            <PaperClip className="absolute -top-5 left-6 h-14 w-6 -rotate-6" />
          </div>

          {/* Stamp */}
          <div
            aria-hidden="true"
            className="absolute top-[38%] -right-3 rotate-[-14deg] border-[3px] border-[#c2372d] px-3 py-1 font-body text-sm font-bold tracking-[0.25em] text-[#c2372d] uppercase opacity-85 mix-blend-multiply sm:-right-5 sm:text-base"
          >
            Open case
          </div>

          {/* Typed evidence */}
          {evidence.length ? (
            <dl className="mt-6 space-y-1.5 border-t-2 border-dashed border-[#5b4320]/40 pt-4 font-mono text-[0.78rem] text-[#3b2c16]">
              {evidence.map((row) => (
                <div key={row.label} className="flex gap-3">
                  <dt className="w-24 shrink-0 font-bold uppercase">{row.label}:</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const STAR_POINTS: Array<[number, number, number, boolean]> = [
  [4, 8, 1.2, true], [11, 18, 0.8, false], [17, 6, 1, false], [23, 14, 1.4, true], [31, 4, 0.9, false],
  [36, 20, 1.1, false], [42, 9, 0.8, true], [49, 16, 1.3, false], [55, 5, 1, false], [61, 22, 0.9, true],
  [66, 11, 1.2, false], [74, 30, 0.8, false], [79, 4, 1.1, true], [86, 26, 0.9, false], [92, 13, 1.3, false],
  [97, 30, 1, true], [8, 32, 0.9, false], [28, 34, 0.8, true], [47, 30, 1, false], [58, 38, 0.8, false],
]

function Stars() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[60%] w-full" preserveAspectRatio="none" viewBox="0 0 100 60">
      {STAR_POINTS.map(([x, y, r, twinkle], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r * 0.22}
          fill="#fff7e0"
          className={twinkle ? 'motion-safe:animate-[star-twinkle_4s_ease-in-out_infinite]' : 'opacity-70'}
          style={twinkle ? { animationDelay: `${-i * 0.7}s` } : undefined}
        />
      ))}
    </svg>
  )
}

function Moon() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-[7%] right-[6%] h-32 w-32 sm:h-44 sm:w-44 lg:right-[10%]">
      <div className="absolute -inset-16 rounded-full bg-[radial-gradient(closest-side,rgba(255,240,200,0.28),rgba(255,240,200,0))]" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_35%,#fffaf0_0%,#f3e7c4_60%,#e2d3a6_100%)] shadow-[0_0_60px_10px_rgba(255,240,200,0.25)]" />
      <div className="absolute top-[30%] left-[52%] h-[14%] w-[14%] rounded-full bg-[#dccb98]/70" />
      <div className="absolute top-[58%] left-[30%] h-[10%] w-[10%] rounded-full bg-[#dccb98]/60" />
      <div className="absolute top-[22%] left-[26%] h-[7%] w-[7%] rounded-full bg-[#dccb98]/50" />
      {/* A wisp of cloud across the moon. */}
      <div className="absolute top-[60%] -left-[35%] h-[12%] w-[110%] rounded-full bg-[#4a3a6e]/45 blur-[10px]" />
    </div>
  )
}

/** Rolling course at night: far hills, the green with its flag, and two bare trees. */
function Course() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path d="M0 640 C 220 590, 420 610, 620 630 S 1020 580, 1240 610 S 1400 620, 1440 600 V900 H0 Z" fill="#2c2452" />
      <path d="M0 720 C 260 670, 520 700, 760 690 S 1180 650, 1440 690 V900 H0 Z" fill="#231d44" />
      {/* Flag on the green, right side. */}
      <g transform="translate(1180 655)">
        <line x1="0" y1="0" x2="0" y2="-120" stroke="#e9dfc7" strokeWidth="3" />
        <path d="M2 -120 L52 -106 L2 -92 Z" fill="var(--color-groovy-orange)" />
        <ellipse cx="0" cy="2" rx="16" ry="4" fill="#15122c" />
      </g>
      {/* Bare trees on the left. */}
      <g stroke="#17132f" strokeLinecap="round" fill="none">
        <path d="M120 700 C 118 640, 126 600, 122 540" strokeWidth="10" />
        <path d="M122 600 C 100 580, 80 570, 60 548" strokeWidth="5" />
        <path d="M121 575 C 146 556, 160 540, 186 528" strokeWidth="5" />
        <path d="M123 548 C 110 520, 106 500, 96 478" strokeWidth="4" />
        <path d="M60 548 C 52 536, 44 532, 34 530" strokeWidth="3" />
        <path d="M186 528 C 196 516, 204 512, 216 510" strokeWidth="3" />
        <path d="M260 700 C 262 660, 256 630, 260 596" strokeWidth="7" />
        <path d="M259 630 C 280 616, 292 606, 306 590" strokeWidth="3.5" />
        <path d="M260 612 C 244 600, 236 590, 226 576" strokeWidth="3.5" />
      </g>
    </svg>
  )
}

/** Footprints from the lower left to the flag: faint everywhere, bright inside the flashlight beam. */
const TRACKS: Array<[number, number, number]> = [
  [6, 90, 60], [11, 87, 70], [16, 89, 62], [21, 85, 72], [27, 87, 64], [33, 83, 74], [39, 85, 66],
  [45, 81, 76], [51, 83, 68], [57, 79, 78], [63, 81, 70], [69, 77, 80], [74, 79, 72], [79, 76, 84],
]

function BirdieTracks() {
  const prints = TRACKS.map(([left, top, rot]) => (
    <TrackPrint key={`${left}-${top}`} style={{ left: `${left}%`, top: `${top}%`, transform: `rotate(${rot}deg)` }} />
  ))
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden text-cream opacity-15 lg:block">
        {prints}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden text-groovy-lime lg:block [mask-image:radial-gradient(circle_220px_at_var(--lx)_var(--ly),black_0%,black_40%,transparent_75%)]"
      >
        {prints}
      </div>
    </>
  )
}

function TrackPrint({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 20 22" className="absolute h-7 w-7" style={style} fill="none">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10 20 L10 8" />
        <path d="M10 9 L3 2" />
        <path d="M10 9 L17 2" />
        <path d="M10 13 L10 21" strokeWidth="1.5" />
      </g>
    </svg>
  )
}

/** Fog: two banks rolling across the course, then a soft cream bank into the section below. */
function Fog() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute bottom-[14%] -left-[10%] h-28 w-[80%] rounded-full bg-[#cfc6e6]/15 blur-2xl motion-safe:animate-[fog-roll_26s_ease-in-out_infinite]" />
      <div className="absolute bottom-[6%] -right-[10%] h-32 w-[75%] rounded-full bg-[#d9d1ec]/15 blur-2xl motion-safe:animate-[fog-roll_32s_ease-in-out_infinite_reverse]" />
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-20 w-full fill-cream sm:h-28">
        <path d="M0 80 C 60 50, 120 60, 170 74 C 210 44, 290 40, 330 70 C 380 48, 450 50, 490 76 C 540 54, 620 52, 660 80 C 710 46, 800 44, 840 74 C 890 52, 960 54, 1000 78 C 1050 48, 1130 46, 1170 72 C 1220 50, 1300 52, 1340 76 C 1380 60, 1420 62, 1440 70 V120 H0 Z" />
      </svg>
    </div>
  )
}

function MagnifierMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 10 L14.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PaperClip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 56" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 14 V44 a5 5 0 0 0 10 0 V10 a8 8 0 0 0 -16 0 V40"
        stroke="#9aa3ad"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
