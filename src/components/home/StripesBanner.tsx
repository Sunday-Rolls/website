import { useId, useState } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the italic, so control visitors never download it.
import '@fontsource/cormorant-garamond/latin-500-italic.css'

/**
 * Coastal Sunday Stripes banner (A/B test home-stripes-banner, arm b).
 * Sky-to-shore backdrop, the cover in an arched "beach hut window" over a seersucker
 * panel, a fit picker and a direct shop link, ending in a shoreline that runs into the
 * cream product rows below.
 */
export function StripesBanner() {
  const { stripes } = usePageContent('home')
  const [fitIndex, setFitIndex] = useState(0)
  const sealPathId = useId()

  const fit = stripes?.fits[fitIndex] ?? stripes?.fits[0]
  if (!stripes || !fit) return null

  const fitCount = stripes.fits.length
  const [titleLead, titleLast] = splitLastWord(stripes.title)

  return (
    <section
      className="relative overflow-hidden bg-cream text-harbor"
      aria-labelledby="home-stripes-heading"
    >
      {/* Sky to shore, with low sun in the upper right. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--color-sea-mist)_0%,#eef0ea_50%,#ebe2cf_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[25%] -right-[15%] h-[80%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(255,241,216,0.9),rgba(255,241,216,0))]"
      />
      {/* A whisper of seersucker across the sky, fading out before the copy gets busy. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(90deg,rgba(143,176,220,0.14)_0_2px,transparent_2px_18px)] [mask-image:linear-gradient(to_bottom,black,transparent_45%)]"
      />
      <CoastScene />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+4rem)] lg:pt-24 lg:pb-36">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          {/* The cover, framed like a beach hut window. */}
          <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-[26rem] lg:max-w-[30rem]">
            <div
              aria-hidden="true"
              className="absolute inset-0 translate-x-[7%] translate-y-[5%] rounded-t-full opacity-70 [background-image:repeating-linear-gradient(90deg,var(--color-seersucker)_0_7px,#ffffff_7px_14px)]"
            />

            <div className="relative aspect-[4/5] overflow-hidden rounded-t-full bg-[#e7decd] shadow-[0_45px_80px_-40px_rgba(20,38,64,0.55)] ring-1 ring-harbor/10">
              {stripes.fits.map((option, index) => (
                <img
                  key={option.label}
                  src={assetUrl(option.image)}
                  srcSet={
                    option.imageSmall
                      ? `${assetUrl(option.imageSmall)} 720w, ${assetUrl(option.image)} 1200w`
                      : undefined
                  }
                  sizes="(min-width: 1024px) 30rem, (min-width: 640px) 26rem, 22rem"
                  alt={index === fitIndex ? `Sunday Stripes ${option.label.toLowerCase()} putter cover` : ''}
                  aria-hidden={index === fitIndex ? undefined : true}
                  width={1200}
                  height={1200}
                  loading={index === 0 ? undefined : 'lazy'}
                  fetchPriority="low"
                  decoding="async"
                  className={cn(
                    'absolute inset-0 h-full w-full object-contain transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    index === fitIndex ? 'translate-y-[5%] opacity-100' : 'translate-y-[5%] scale-[1.06] opacity-0',
                  )}
                />
              ))}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 rounded-t-full border border-harbor/15"
              />
              <p
                aria-hidden="true"
                className="absolute inset-x-0 bottom-6 text-center font-body text-nav uppercase text-harbor/55"
              >
                {fit.label}
              </p>
            </div>

            {/* Round woven-label seal. */}
            <div
              aria-hidden="true"
              className="absolute -left-3 top-[10%] grid h-24 w-24 -rotate-12 place-items-center rounded-full bg-cream text-harbor shadow-[0_12px_30px_-12px_rgba(20,38,64,0.45)] ring-1 ring-harbor/10 sm:-left-6 sm:h-28 sm:w-28"
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                <defs>
                  <path id={sealPathId} d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
                </defs>
                <text className="fill-current font-body text-[8.5px] font-medium uppercase" textLength={224} lengthAdjust="spacing">
                  <textPath href={`#${sealPathId}`}>Sunday Stripes · Sunday Rolls ·</textPath>
                </text>
              </svg>
              <WaveMark className="h-4 w-9 text-seersucker" />
            </div>
          </div>

          <div className="space-y-7 lg:max-w-xl">
            {stripes.eyebrow ? (
              <p className="flex items-center gap-3 font-body text-label uppercase tracking-[0.28em] text-harbor/70">
                <WaveMark className="h-3 w-7 text-seersucker" />
                {stripes.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-stripes-heading"
              className="font-display text-[clamp(2.6rem,5.4vw,4.5rem)] leading-[1.02] tracking-[-0.01em] text-harbor"
            >
              {titleLead}
              {titleLead ? ' ' : null}
              <em className="text-[#3d6a9e] italic">{titleLast}</em>
            </h2>

            {stripes.subtitle ? (
              <p className="max-w-md font-display text-[1.5rem] leading-snug text-harbor/90 sm:text-[1.65rem]">
                {stripes.subtitle}
              </p>
            ) : null}

            <div className="space-y-4 font-body text-body text-harbor/75">
              {stripes.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {stripes.details?.length ? (
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-harbor/10 py-4 font-body text-label uppercase text-harbor/70">
                {stripes.details.map((detail) => (
                  <li key={detail} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-seersucker" />
                    {detail}
                  </li>
                ))}
              </ul>
            ) : null}

            {fitCount > 1 ? (
              <div className="space-y-3">
                <p className="font-body text-label uppercase text-harbor/60">Choose your fit</p>
                <div
                  className="relative grid w-full max-w-sm rounded-full border border-harbor/20 bg-white/60 p-1 backdrop-blur-sm"
                  style={{ gridTemplateColumns: `repeat(${fitCount}, minmax(0, 1fr))` }}
                  role="group"
                  aria-label="Choose a putter fit"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-1 rounded-full bg-harbor shadow-[0_6px_16px_-8px_rgba(20,38,64,0.7)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{
                      width: `calc((100% - 0.5rem) / ${fitCount})`,
                      transform: `translateX(${fitIndex * 100}%)`,
                    }}
                  />
                  {stripes.fits.map((option, index) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={index === fitIndex}
                      onClick={() => setFitIndex(index)}
                      className={cn(
                        'relative z-10 rounded-full px-4 py-2 font-body text-label uppercase tracking-widest transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-harbor',
                        index === fitIndex ? 'text-cream' : 'text-harbor/70 hover:text-harbor',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {fit.note ? (
                  <p className="font-body text-body-small text-harbor/65" aria-live="polite">
                    Fits {fit.note}
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button
              href={fit.href}
              className="group [&>span]:gap-3 [&>span]:rounded-full [&>span]:border-harbor [&>span]:bg-harbor [&>span]:px-8 [&>span]:py-3.5 [&>span]:text-cream hover:[&>span]:border-harbor-deep hover:[&>span]:bg-harbor-deep"
              onClick={() => trackCtaClick(stripes.cta.label, 'home_stripes')}
            >
              {stripes.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>
        </div>
      </Container>

      {/* Shoreline: two slow waves that hand off to the cream section below. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden sm:h-24">
        <svg
          viewBox="0 0 1440 96"
          preserveAspectRatio="none"
          className="absolute bottom-0 -left-[5%] h-full w-[110%] fill-seersucker/40 motion-safe:animate-[tide-drift_18s_ease-in-out_infinite]"
        >
          <path d="M0 46 C 240 14, 480 78, 720 46 S 1200 14, 1440 46 V96 H0 Z" />
        </svg>
        <svg
          viewBox="0 0 1440 96"
          preserveAspectRatio="none"
          className="absolute bottom-0 -left-[5%] h-full w-[110%] fill-cream motion-safe:animate-[tide-drift_24s_ease-in-out_infinite_reverse]"
        >
          <path d="M0 62 C 260 38, 460 90, 720 64 S 1180 36, 1440 62 V96 H0 Z" />
        </svg>
      </div>
    </section>
  )
}

/** `"A Little Closer to the Coast"` → `["A Little Closer to the", "Coast"]`, so the last word can be set in italic. */
function splitLastWord(title: string): [string, string] {
  const trimmed = title.trim()
  const cut = trimmed.lastIndexOf(' ')
  return cut === -1 ? ['', trimmed] : [trimmed.slice(0, cut), trimmed.slice(cut + 1)]
}

/**
 * The beach behind the banner, back to front: gulls in the sky, a distant sea with a horizon
 * and glints, a far dune, then a near dune with grass and a rope fence. Each layer drifts at its
 * own speed as the section scrolls past (see `.coast-layer-*` in index.css), so it reads as depth.
 * Everything is anchored to the bottom so the sea always sits behind the middle of the banner.
 */
function CoastScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Sea and horizon */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        className="coast-layer-far absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="coast-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c9dbe8" />
            <stop offset="1" stopColor="#b3cde0" />
          </linearGradient>
          <linearGradient id="coast-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="470" width="1440" height="200" fill="url(#coast-sea)" opacity="0.75" />
        <rect x="0" y="470" width="1440" height="26" fill="url(#coast-haze)" />
        <line x1="0" y1="470.5" x2="1440" y2="470.5" stroke="#9fbbd3" strokeOpacity="0.6" />
        {/* Glints on the water, mostly under the sun on the right. */}
        <g stroke="#ffffff" strokeLinecap="round" strokeOpacity="0.75">
          <line x1="1010" y1="500" x2="1060" y2="500" strokeWidth="2" />
          <line x1="1110" y1="512" x2="1180" y2="512" strokeWidth="2" />
          <line x1="1215" y1="496" x2="1250" y2="496" strokeWidth="1.5" />
          <line x1="960" y1="528" x2="990" y2="528" strokeWidth="1.5" />
          <line x1="1290" y1="530" x2="1350" y2="530" strokeWidth="2" />
          <line x1="140" y1="508" x2="180" y2="508" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="560" y1="540" x2="610" y2="540" strokeWidth="1.5" strokeOpacity="0.5" />
        </g>
        {/* A small sail on the horizon. */}
        <g transform="translate(1180 438)" fill="#f8f4ec" stroke="#9fbbd3" strokeWidth="1">
          <path d="M14 0 L14 28 L0 28 Z" />
          <path d="M17 6 L17 28 L28 28 Z" />
          <path d="M-4 31 L32 31 L27 36 L1 36 Z" fill="#9fbbd3" stroke="none" />
        </g>
      </svg>

      {/* Far dune */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        className="coast-layer-mid absolute inset-0 h-full w-full"
      >
        <path
          d="M0 610 C 180 560, 360 585, 520 600 S 860 560, 1040 590 S 1320 600, 1440 570 V900 H0 Z"
          fill="#e5dbc3"
        />
      </svg>

      {/* Near dune, grass and fence */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        className="coast-layer-near absolute inset-0 h-full w-full"
      >
        <path
          d="M0 690 C 220 640, 420 660, 640 700 S 1080 690, 1260 650 S 1400 655, 1440 660 V900 H0 Z"
          fill="#ebe2cf"
        />
        <g stroke="#a7a77c" strokeLinecap="round" fill="none" strokeOpacity="0.85">
          <DuneGrass x={1240} y={652} />
          <DuneGrass x={1310} y={650} scale={1.15} />
          <DuneGrass x={1380} y={656} scale={0.75} />
        </g>
        {/* Weathered dune fence with a sagging rope. */}
        <g stroke="#a58b6a" strokeLinecap="round" fill="none">
          {[48, 96, 144, 192].map((x, i) => (
            <line key={x} x1={x} y1={664 - i * 3} x2={x - 3} y2={702 - i * 3} strokeWidth="3" />
          ))}
          <path d="M47 672 Q 72 682 95 669 Q 120 679 143 666 Q 168 676 191 663" strokeWidth="1.25" />
        </g>
        <g stroke="#a7a77c" strokeLinecap="round" fill="none" strokeOpacity="0.85">
          <DuneGrass x={24} y={688} scale={0.85} />
          <DuneGrass x={170} y={674} />
        </g>
      </svg>

      {/* Gulls, each on its own slow glide. */}
      <div className="absolute inset-x-0 top-0 h-[55%]">
        <Gull className="left-[8%] top-[14%] w-9 opacity-60 motion-safe:animate-[gull-glide_14s_ease-in-out_infinite]" />
        <Gull className="left-[15%] top-[24%] w-6 opacity-45 motion-safe:animate-[gull-glide_17s_ease-in-out_-4s_infinite]" />
        <Gull className="left-[58%] top-[9%] w-7 opacity-50 motion-safe:animate-[gull-glide_19s_ease-in-out_-9s_infinite]" />
        <Gull className="right-[9%] top-[30%] w-10 opacity-55 motion-safe:animate-[gull-glide_16s_ease-in-out_-6s_infinite]" />
        <Gull className="right-[3%] top-[16%] w-5 opacity-40 motion-safe:animate-[gull-glide_21s_ease-in-out_-12s_infinite]" />
      </div>
    </div>
  )
}

function Gull({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 14" fill="none" className={cn('absolute h-auto text-harbor', className)}>
      <path
        d="M1 9 C 7 2, 13 2, 20 9 C 27 2, 33 2, 39 9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DuneGrass({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} strokeWidth="2">
      <path d="M0 0 C -2 -20, -10 -34, -20 -44" />
      <path d="M4 0 C 4 -22, 2 -40, -2 -56" />
      <path d="M8 0 C 10 -18, 16 -32, 26 -40" />
      <path d="M12 0 C 14 -14, 20 -22, 30 -26" />
      <path d="M-4 0 C -8 -10, -16 -16, -26 -18" />
    </g>
  )
}

function WaveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 12" fill="none" className={className} aria-hidden="true">
      <path
        d="M1 7c3.5-4 7-4 10.5 0s7 4 10.5 0 7-4 10.5 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
