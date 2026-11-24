import type { CSSProperties } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the italic, so control visitors never download it.
import '@fontsource/cormorant-garamond/latin-500-italic.css'

/**
 * Breakfast Roller banner (A/B test home-breakfast-banner, arm b).
 * A vintage cereal-box riff in the cover's own orange: copy and a "Roller Facts" panel on the
 * left, the cover on a tilted box front over a slowly turning sunrise on the right, and a milk
 * splash that runs into the cream product rows below. Center-shafted only, so no fit picker.
 */
export function BreakfastBanner() {
  const { breakfast } = usePageContent('home')
  if (!breakfast) return null

  const [titleLead, titleLast] = splitLastWord(breakfast.title)

  return (
    <section
      className="relative overflow-hidden bg-cereal text-ribbon-deep"
      aria-labelledby="home-breakfast-heading"
    >
      {/* Morning light from behind the box, and a faint printed halftone over everything. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_45%,rgba(247,197,72,0.55)_0%,rgba(247,197,72,0)_55%),linear-gradient(180deg,#f07a2a_0%,var(--color-cereal)_45%,var(--color-cereal-deep)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.13)_1.2px,transparent_1.6px)] [background-size:12px_12px] [mask-image:linear-gradient(115deg,transparent_10%,black_60%)]"
      />
      <Flakes />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+4.5rem)] lg:pt-24 lg:pb-40">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            {breakfast.eyebrow ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-ribbon-deep px-4 py-1.5 font-body text-label font-semibold uppercase tracking-[0.22em] text-yolk">
                <SunMark className="h-3.5 w-3.5" />
                {breakfast.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-breakfast-heading"
              className="font-display text-[clamp(2.9rem,6.4vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.01em] text-[#fff8ec] [text-shadow:3px_3px_0_var(--color-ribbon-deep)] sm:[text-shadow:4px_4px_0_var(--color-ribbon-deep)]"
            >
              {titleLead}
              {titleLead ? ' ' : null}
              <em className="font-medium text-yolk italic">{titleLast}</em>
            </h2>

            {breakfast.subtitle ? (
              <p className="font-body text-lg font-semibold uppercase tracking-[0.08em] text-ribbon-deep sm:text-xl">
                {breakfast.subtitle}
              </p>
            ) : null}

            <div className="space-y-4 font-body text-body text-ribbon-deep">
              {breakfast.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            <RollerFacts
              fit={breakfast.fit}
              details={breakfast.details ?? []}
            />

            <Button
              href={breakfast.href}
              className="group [&>span]:gap-3 [&>span]:rounded-full [&>span]:border-2 [&>span]:border-ribbon-deep [&>span]:bg-[#fff8ec] [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-semibold [&>span]:text-ribbon-deep [&>span]:shadow-[4px_4px_0_var(--color-ribbon-deep)] [&>span]:transition-[transform,box-shadow,background-color] hover:[&>span]:-translate-y-0.5 hover:[&>span]:bg-yolk hover:[&>span]:shadow-[6px_6px_0_var(--color-ribbon-deep)]"
              onClick={() => trackCtaClick(breakfast.cta.label, 'home_breakfast')}
            >
              {breakfast.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>

          {/* The cover on a box front, over a turning sunrise. */}
          <div className="relative order-1 mx-auto w-full max-w-[21rem] sm:max-w-[25rem] lg:order-2 lg:max-w-[28rem]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 [mask-image:radial-gradient(closest-side,black_35%,transparent_100%)]"
            >
              <div className="h-full w-full rounded-full [background-image:repeating-conic-gradient(from_0deg,rgba(255,224,150,0.34)_0deg_6deg,transparent_6deg_15deg)] motion-safe:animate-[sunburst-turn_140s_linear_infinite]" />
            </div>

            <div className="relative -rotate-2 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:rotate-0 motion-reduce:transition-none">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border-[3px] border-ribbon-deep bg-oat shadow-[10px_10px_0_var(--color-ribbon-deep)]">
                <img
                  src={assetUrl(breakfast.image)}
                  srcSet={
                    breakfast.imageSmall
                      ? `${assetUrl(breakfast.imageSmall)} 720w, ${assetUrl(breakfast.image)} 1200w`
                      : undefined
                  }
                  sizes="(min-width: 1024px) 28rem, (min-width: 640px) 25rem, 21rem"
                  alt={`The Breakfast Roller ${breakfast.fit.label.toLowerCase()} putter cover`}
                  width={1200}
                  height={1200}
                  fetchPriority="low"
                  decoding="async"
                  className="absolute inset-0 h-full w-full -translate-y-[2%] object-contain"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-3 rounded-[1.25rem] border-2 border-ribbon-deep/20"
                />
                <p
                  aria-hidden="true"
                  className="absolute inset-x-0 top-7 text-center font-body text-nav font-semibold uppercase text-ribbon-deep/60"
                >
                  Part of a complete round
                </p>
              </div>

              {/* Ribbon across the box, in the embroidered banner's blue. */}
              <div aria-hidden="true" className="absolute -inset-x-6 bottom-[9%] sm:-inset-x-8">
                <svg viewBox="0 0 400 64" className="h-auto w-full drop-shadow-[0_6px_0_rgba(19,32,58,0.35)]">
                  <path d="M0 14 L34 14 L34 56 L0 56 L14 35 Z" fill="#163a85" />
                  <path d="M400 14 L366 14 L366 56 L400 56 L386 35 Z" fill="#163a85" />
                  <path d="M24 6 L376 6 L376 50 L24 50 Z" fill="var(--color-ribbon)" />
                  <path d="M24 50 L34 56 L34 50 Z M376 50 L366 56 L366 50 Z" fill="#0f2457" />
                  <text
                    x="200"
                    y="35"
                    textAnchor="middle"
                    className="fill-yolk font-display text-[20px] font-medium italic"
                  >
                    {breakfast.fit.label}
                    {breakfast.fit.note ? ` · ${shortFit(breakfast.fit.note)}` : ''}
                  </text>
                </svg>
              </div>

              {breakfast.badge ? <Starburst label={breakfast.badge} /> : null}
            </div>
          </div>
        </div>
      </Container>

      <MilkSplash />
    </section>
  )
}

/** A nutrition-label style panel: the fit and what the cover is made with. */
function RollerFacts({
  fit,
  details,
}: {
  fit: { label: string; note?: string }
  details: string[]
}) {
  return (
    <div className="max-w-sm border-2 border-ribbon-deep bg-[#fff8ec]/90 px-4 pt-2 pb-3 font-body text-ribbon-deep shadow-[4px_4px_0_rgba(19,32,58,0.25)]">
      <p className="border-b-[6px] border-ribbon-deep pb-1 font-display text-[1.9rem] leading-none font-semibold">
        Roller Facts
      </p>
      <dl>
      <div className="flex items-baseline justify-between gap-4 border-b border-ribbon-deep/40 py-1.5 text-body-small">
        <dt className="font-semibold">Serving size</dt>
        <dd>1 putter cover</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-b border-ribbon-deep/40 py-1.5 text-body-small">
        <dt className="font-semibold">Fit</dt>
        <dd>{fit.label} only</dd>
      </div>
      {fit.note ? (
        <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-ribbon-deep py-1.5 text-body-small">
          <dt className="font-semibold">Made for</dt>
          <dd className="text-right">{fit.note}</dd>
        </div>
      ) : null}
      {details.length ? (
        <div className="pt-1.5 text-[0.75rem] leading-snug">
          <dt className="inline font-semibold">Contains: </dt>
          <dd className="inline">{details.map((detail) => detail.toLowerCase()).join(', ')}.</dd>
        </div>
      ) : null}
      </dl>
    </div>
  )
}

/** Round sticker on the corner of the box, the way cereal boxes call out an edition. */
function Starburst({ label }: { label: string }) {
  const points = 18
  const path = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 42
    const a = (Math.PI * i) / points - Math.PI / 2
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
  const words = label.split(' ')
  const lines = words.length > 2 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : words

  return (
    <div
      aria-hidden="true"
      className="absolute -top-6 -right-5 h-28 w-28 rotate-12 drop-shadow-[3px_3px_0_var(--color-ribbon-deep)] sm:-top-8 sm:-right-8 sm:h-32 sm:w-32"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <polygon points={path} fill="var(--color-yolk)" stroke="var(--color-ribbon-deep)" strokeWidth="2" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="var(--color-ribbon-deep)" strokeWidth="1" strokeDasharray="2 2.5" />
        <text textAnchor="middle" className="fill-ribbon-deep font-body font-bold uppercase">
          {lines.map((line, i) => (
            <tspan
              key={line}
              x="50"
              y={50 + (i - (lines.length - 1) / 2) * 12 + 3.5}
              className={i === lines.length - 1 && lines.length > 1 ? 'text-[11px]' : 'text-[8.5px]'}
            >
              {line}
            </tspan>
          ))}
        </text>
      </svg>
    </div>
  )
}

const FLAKES: Array<{ className: string; rot: number; delay: string; fill: string }> = [
  { className: 'left-[4%] top-[12%] w-11', rot: -20, delay: '0s', fill: 'var(--color-yolk)' },
  { className: 'left-[44%] top-[6%] w-8', rot: 35, delay: '-3s', fill: '#f9dc8f' },
  { className: 'right-[6%] top-[10%] w-12', rot: 10, delay: '-5s', fill: 'var(--color-yolk)' },
  { className: 'right-[3%] top-[58%] w-9', rot: -40, delay: '-2s', fill: '#f9dc8f' },
  { className: 'left-[2%] top-[62%] w-10', rot: 50, delay: '-6s', fill: '#f9dc8f' },
  { className: 'left-[47%] bottom-[16%] w-8', rot: -10, delay: '-4s', fill: 'var(--color-yolk)' },
]

/** A few toasted flakes drifting at the edges, clear of the copy. */
function Flakes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
      {FLAKES.map((flake) => (
        <svg
          key={flake.className}
          viewBox="0 0 41 32"
          className={cn(
            'absolute h-auto drop-shadow-[2px_2px_0_rgba(19,32,58,0.35)] motion-safe:animate-[flake-drift_9s_ease-in-out_infinite]',
            flake.className,
          )}
          style={{ '--flake-rot': `${flake.rot}deg`, animationDelay: flake.delay, transform: `rotate(${flake.rot}deg)` } as CSSProperties}
        >
          {/* A curled, toasted flake: ragged outline, a darker toasted edge and a crease. */}
          <path
            d="M3 14 L7 8 L12 9 L15 3 L21 6 L26 2 L30 7 L36 6 L37 12 L39 17 L34 21 L35 27 L28 26 L23 30 L18 26 L11 28 L9 22 L2 20 Z"
            fill={flake.fill}
            stroke="#b4540f"
            strokeOpacity="0.7"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M9 16 C 15 12, 24 12, 31 16" stroke="#c9500f" strokeOpacity="0.5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M14 21 C 19 19, 24 19, 28 21" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  )
}

/** Milk poured along the bottom edge, splashing up into the orange, in the cream of the section below. */
function MilkSplash() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 sm:h-28">
      <svg viewBox="0 0 1440 112" preserveAspectRatio="none" className="absolute inset-0 h-full w-full fill-cream">
        <path d="M0 70 C 90 40, 170 88, 260 62 C 330 42, 370 18, 420 40 C 470 62, 520 78, 600 64 C 700 46, 760 82, 860 70 C 950 58, 1010 26, 1080 44 C 1140 60, 1200 80, 1280 62 C 1350 46, 1400 58, 1440 52 V112 H0 Z" />
      </svg>
      {/* Droplets thrown up by the splash. */}
      <svg viewBox="0 0 1440 112" preserveAspectRatio="xMidYMax meet" className="absolute inset-0 h-full w-full fill-cream">
        <ellipse cx="402" cy="16" rx="7" ry="8" />
        <ellipse cx="438" cy="6" rx="4" ry="5" />
        <ellipse cx="1062" cy="22" rx="6" ry="7" />
        <ellipse cx="1098" cy="12" rx="3.5" ry="4.5" />
      </svg>
    </div>
  )
}

function SunMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="8" cy="8" r="3.2" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="7.4" y="0.5" width="1.2" height="2.8" rx="0.6" transform={`rotate(${i * 45} 8 8)`} />
      ))}
    </svg>
  )
}

/** `"Breakfast Before Birdies"` → `["Breakfast Before", "Birdies"]`, so the last word can be set in italic. */
function splitLastWord(title: string): [string, string] {
  const trimmed = title.trim()
  const cut = trimmed.lastIndexOf(' ')
  return cut === -1 ? ['', trimmed] : [trimmed.slice(0, cut), trimmed.slice(cut + 1)]
}

/** `"L.A.B. DF3 and putters like it"` → `"L.A.B. DF3"` for the ribbon, which only fits a few words. */
function shortFit(note: string): string {
  return note.split(' and ')[0]
}
