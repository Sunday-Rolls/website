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
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--color-sea-mist)_0%,#edf1ed_55%,var(--color-cream)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[25%] -right-[15%] h-[80%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(255,241,216,0.9),rgba(255,241,216,0))]"
      />
      {/* A whisper of seersucker across the sky, fading out before the copy gets busy. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(90deg,rgba(143,176,220,0.14)_0_2px,transparent_2px_18px)] [mask-image:linear-gradient(to_bottom,black,transparent_65%)]"
      />

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
                    'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    index === fitIndex ? 'scale-[1.12] opacity-100' : 'scale-[1.18] opacity-0',
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
          className="absolute bottom-0 -left-[5%] h-full w-[110%] fill-seersucker/30 motion-safe:animate-[tide-drift_18s_ease-in-out_infinite]"
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
