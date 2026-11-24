import { useState } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the italic, so control visitors never download it.
import '@fontsource/cormorant-garamond/latin-500-italic.css'

/** Tufted leather tile: diamond creases between buttons, a soft puff in each diamond, brass tacks. */
const TUFTING =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2256%22%20height%3D%2244%22%20viewBox%3D%220%200%2056%2044%22%3E%3Cdefs%3E%3CradialGradient%20id%3D%22p%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%220.08%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%220%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cg%20fill%3D%22url%28%23p%29%22%3E%3Ccircle%20cx%3D%2228%22%20cy%3D%220%22%20r%3D%2218%22%2F%3E%3Ccircle%20cx%3D%220%22%20cy%3D%2222%22%20r%3D%2218%22%2F%3E%3Ccircle%20cx%3D%2256%22%20cy%3D%2222%22%20r%3D%2218%22%2F%3E%3Ccircle%20cx%3D%2228%22%20cy%3D%2244%22%20r%3D%2218%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M0%200%20L56%2044%20M56%200%20L0%2044%22%20stroke%3D%22%23000%22%20stroke-opacity%3D%220.42%22%20stroke-width%3D%221.2%22%20fill%3D%22none%22%2F%3E%3Cg%20fill%3D%22%23c9a45c%22%3E%3Ccircle%20cx%3D%220%22%20cy%3D%220%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2256%22%20cy%3D%220%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%220%22%20cy%3D%2244%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2256%22%20cy%3D%2244%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2228%22%20cy%3D%2222%22%20r%3D%222%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E'

const GOLD_TEXT =
  'bg-[linear-gradient(180deg,#f6e7b8_0%,#e2c27a_38%,#b88c3f_62%,#ecd59a_100%)] bg-clip-text text-transparent'

/**
 * Corduroy banner (A/B test home-corduroy-banner, arm b).
 * An old country-club members' lounge: mahogany paneling over tufted green leather, a crest and
 * gold-leaf headline, and the cover hung like a portrait in a gilded frame under a brass picture
 * light with an engraved plaque. The fit picker swaps the portrait and the plaque.
 */
export function CorduroyBanner() {
  const { corduroy } = usePageContent('home')
  const [fitIndex, setFitIndex] = useState(0)

  const fit = corduroy?.fits[fitIndex] ?? corduroy?.fits[0]
  if (!corduroy || !fit) return null

  return (
    <section
      className="relative overflow-hidden bg-mahogany text-cream"
      aria-labelledby="home-corduroy-heading"
    >
      <Paneling />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+7rem)] lg:pt-24 lg:pb-52">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            <div className="flex items-center gap-4">
              <Crest className="h-16 w-16 shrink-0 text-brass sm:h-20 sm:w-20" />
              {corduroy.eyebrow ? (
                <p className="font-body text-label font-semibold uppercase tracking-[0.35em] text-brass">
                  {corduroy.eyebrow}
                </p>
              ) : null}
            </div>

            <h2
              id="home-corduroy-heading"
              className={cn(
                'pb-1 font-display text-[clamp(2.9rem,6.4vw,5.4rem)] leading-[0.98] font-semibold tracking-[-0.005em] drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]',
                GOLD_TEXT,
              )}
            >
              {corduroy.title}
            </h2>

            <GildedRule />

            {corduroy.subtitle ? (
              <p className="font-display text-[1.65rem] leading-snug text-cream/90 italic sm:text-[1.85rem]">
                {corduroy.subtitle}
              </p>
            ) : null}

            <div className="space-y-4 font-body text-body text-cream/75">
              {corduroy.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {corduroy.register?.length ? (
              <div className="max-w-md">
                <p className="mb-2 font-body text-[0.68rem] font-semibold uppercase tracking-[0.35em] text-brass/90">
                  Club register
                </p>
                <dl className="grid gap-x-8 gap-y-1.5 font-body text-body-small sm:grid-cols-2">
                  {corduroy.register.map((row) => (
                    <div key={row.label} className="flex items-baseline gap-2">
                      <dt className="flex flex-1 items-baseline gap-2 text-cream/60">
                        <span className="shrink-0">{row.label}</span>
                        <span aria-hidden="true" className="min-w-3 flex-1 translate-y-[-3px] border-b border-dotted border-brass/45" />
                      </dt>
                      <dd className="text-right text-cream">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {corduroy.fits.length > 1 ? (
              <div className="space-y-3">
                <p className="font-body text-[0.68rem] font-semibold uppercase tracking-[0.35em] text-brass/90">
                  Choose your fit
                </p>
                <div className="inline-flex border border-brass/60 p-1" role="group" aria-label="Choose a putter fit">
                  {corduroy.fits.map((option, index) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={index === fitIndex}
                      onClick={() => setFitIndex(index)}
                      className={cn(
                        'px-5 py-2 font-body text-label uppercase tracking-[0.2em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-light',
                        index === fitIndex
                          ? 'bg-[linear-gradient(180deg,var(--color-brass-light),var(--color-brass))] font-semibold text-mahogany-deep'
                          : 'text-cream/70 hover:text-cream',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {fit.note ? (
                  <p className="font-body text-body-small text-cream/60" aria-live="polite">
                    Fits {fit.note}
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button
              href={fit.href}
              className="group [&>span]:gap-3 [&>span]:border [&>span]:border-brass-light/70 [&>span]:bg-[linear-gradient(180deg,var(--color-brass-light)_0%,var(--color-brass)_55%,#a9822f_100%)] [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-semibold [&>span]:text-mahogany-deep [&>span]:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_24px_-12px_rgba(0,0,0,0.8)] [&>span]:transition-[filter,transform] hover:[&>span]:-translate-y-0.5 hover:[&>span]:brightness-110"
              onClick={() => trackCtaClick(corduroy.cta.label, 'home_corduroy')}
            >
              {corduroy.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>

          <Portrait fits={corduroy.fits} fitIndex={fitIndex} plaque={corduroy.plaque} />
        </div>
      </Container>

      {/* Brass edge into the cream section below. */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-[linear-gradient(90deg,#8a6a2c,var(--color-brass-light),#a9822f,var(--color-brass-light),#8a6a2c)]" />
    </section>
  )
}

type Fit = { label: string; href: string; image: string; imageSmall?: string }

/** The cover hung like a club portrait: picture light, gilded frame, cream mat and a brass plaque. */
function Portrait({ fits, fitIndex, plaque }: { fits: Fit[]; fitIndex: number; plaque?: string }) {
  const fit = fits[fitIndex] ?? fits[0]
  return (
    <div className="relative order-1 mx-auto w-full max-w-[20rem] pt-12 sm:max-w-[24rem] lg:order-2 lg:max-w-[27rem]">
      {/* Picture light and its wash. */}
      <div aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 w-[56%] -translate-x-1/2">
        <div className="mx-auto h-5 w-2 bg-[linear-gradient(90deg,#7a5c25,var(--color-brass-light),#7a5c25)]" />
        <div className="h-3.5 rounded-full bg-[linear-gradient(180deg,var(--color-brass-light),var(--color-brass)_50%,#7a5c25)] shadow-[0_4px_10px_rgba(0,0,0,0.6)]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-12 left-1/2 h-[70%] w-[130%] -translate-x-1/2 bg-[radial-gradient(ellipse_50%_55%_at_50%_0%,rgba(255,222,160,0.32)_0%,rgba(255,222,160,0.1)_45%,rgba(255,222,160,0)_75%)]"
      />

      {/* Gilded frame */}
      <div className="relative bg-[linear-gradient(135deg,#7a5c25_0%,#ecd59a_18%,#a9822f_36%,#f4e2a8_52%,#8a6a2c_70%,#d9b96d_86%,#7a5c25_100%)] p-3 shadow-[0_40px_60px_-25px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,240,200,0.4)] sm:p-4">
        <div className="bg-[linear-gradient(135deg,#5a4318,#a9822f)] p-[3px]">
          {/* Mat */}
          <div className="bg-[#f1e9d6] p-[9%] shadow-[inset_0_2px_10px_rgba(60,40,10,0.35)]">
            <div className="relative aspect-square overflow-hidden ring-1 ring-[#b88c3f]">
              {fits.map((option, index) => (
                <img
                  key={option.label}
                  src={assetUrl(option.image)}
                  srcSet={option.imageSmall ? `${assetUrl(option.imageSmall)} 720w, ${assetUrl(option.image)} 1200w` : undefined}
                  sizes="(min-width: 1024px) 20rem, (min-width: 640px) 18rem, 15rem"
                  alt={index === fitIndex ? `The Corduroy ${option.label.toLowerCase()} putter cover` : ''}
                  aria-hidden={index === fitIndex ? undefined : true}
                  width={1200}
                  height={1200}
                  loading={index === 0 ? undefined : 'lazy'}
                  fetchPriority="low"
                  decoding="async"
                  className={cn(
                    'absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none',
                    index === fitIndex ? 'opacity-100' : 'opacity-0',
                  )}
                />
              ))}
              {/* Glass and warm light on the picture. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_35%),radial-gradient(ellipse_at_50%_0%,rgba(255,214,140,0.18),rgba(255,214,140,0)_60%)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Engraved brass plaque */}
      {plaque ? (
        <div className="relative mx-auto mt-5 w-[62%] bg-[linear-gradient(180deg,var(--color-brass-light)_0%,var(--color-brass)_55%,#9c7630_100%)] px-4 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_14px_-6px_rgba(0,0,0,0.9)]">
          <span aria-hidden="true" className="absolute top-1/2 left-1.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#7a5c25] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]" />
          <span aria-hidden="true" className="absolute top-1/2 right-1.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#7a5c25] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]" />
          <p className="font-display text-base leading-tight font-semibold tracking-[0.12em] text-[#3a2a12] uppercase [text-shadow:0_1px_0_rgba(255,240,200,0.6)]">
            {plaque}
          </p>
          <p className="font-body text-[0.6rem] tracking-[0.3em] text-[#4a3615] uppercase">{fit.label}</p>
        </div>
      ) : null}
    </div>
  )
}

/** Mahogany panels above a brass chair rail and tufted green leather. */
function Paneling() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Wood: tone, grain, panel seams and a lamp-lit vignette. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#432818_0%,var(--color-mahogany)_60%,var(--color-mahogany-deep)_100%)]" />
      <div className="absolute inset-0 opacity-70 [background-image:repeating-linear-gradient(90deg,rgba(255,190,140,0.035)_0_1px,transparent_1px_6px,rgba(0,0,0,0.05)_6px_7px,transparent_7px_13px)]" />
      <div className="absolute inset-0 [background-image:repeating-linear-gradient(90deg,rgba(0,0,0,0.45)_0_2px,rgba(255,200,150,0.07)_2px_3px,transparent_3px_240px)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(255,200,130,0.12)_0%,rgba(0,0,0,0)_50%),radial-gradient(ellipse_at_50%_50%,rgba(0,0,0,0)_45%,rgba(0,0,0,0.45)_100%)]" />

      {/* Chair rail and tufted leather wainscot, below the content. */}
      <div className="absolute inset-x-0 bottom-0 h-20 lg:h-28">
        <div className="absolute inset-x-0 top-0 h-3 bg-[linear-gradient(180deg,#5a3520,#2a170c)] shadow-[0_3px_6px_rgba(0,0,0,0.6)]" />
        <div className="absolute inset-x-0 top-3 h-[2px] bg-[linear-gradient(90deg,#8a6a2c,var(--color-brass-light),#8a6a2c)]" />
        <div
          className="absolute inset-x-0 top-[14px] bottom-0 bg-club-green"
          style={{
            backgroundImage: `url("${TUFTING}"), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.4))`,
            backgroundSize: '56px 44px, 100% 100%',
          }}
        />
      </div>
    </div>
  )
}

/** A thin gilded rule with a diamond at its center. */
function GildedRule() {
  return (
    <div aria-hidden="true" className="flex max-w-sm items-center gap-3">
      <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(201,164,92,0),var(--color-brass))]" />
      <span className="h-2 w-2 rotate-45 bg-brass" />
      <span className="h-px flex-1 bg-[linear-gradient(90deg,var(--color-brass),rgba(201,164,92,0))]" />
    </div>
  )
}

/** Laurel wreath around an "SR" monogram. */
function Crest({ className }: { className?: string }) {
  const leaves = Array.from({ length: 7 }, (_, i) => {
    const t = 0.18 + i * 0.1
    const a = Math.PI * (0.55 + t)
    return { x: 50 + 34 * Math.cos(a), y: 50 + 34 * Math.sin(a), r: (a * 180) / Math.PI + 90 }
  })
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      {[1, -1].map((side) => (
        <g key={side} transform={side === -1 ? 'translate(100 0) scale(-1 1)' : undefined}>
          <path d="M28 82 C 16 70, 12 52, 18 34" fill="none" stroke="currentColor" strokeWidth="1.6" />
          {leaves.map((leaf, i) => (
            <ellipse key={i} cx={leaf.x} cy={leaf.y} rx="3" ry="7" fill="currentColor" transform={`rotate(${leaf.r - 25} ${leaf.x} ${leaf.y})`} opacity="0.9" />
          ))}
        </g>
      ))}
      <text x="50" y="58" textAnchor="middle" className="fill-current font-display text-[26px] font-semibold italic">
        SR
      </text>
    </svg>
  )
}
