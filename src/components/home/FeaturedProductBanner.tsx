import { useState } from 'react'
import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

/** Flagship-product banner: copy on one side, the cover swaying under a spotlight on the other. */
export function FeaturedProductBanner() {
  const { featured } = usePageContent('home')
  const [active, setActive] = useState(0)

  if (!featured || featured.colorways.length === 0) return null
  const colorway = featured.colorways[active] ?? featured.colorways[0]
  const ctaLabel = resolveLinkLabel(featured.cta)

  return (
    <section
      className="relative overflow-hidden bg-matte-black text-cream"
      aria-labelledby="home-featured-heading"
    >
      {/* Faint LCD dot grid, a nod to the handheld the cover is stitched after. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(var(--color-cream)_1px,transparent_1.5px)] [background-size:14px_14px]"
      />

      <Container className="relative py-section-y">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="order-2 space-y-6 lg:order-1 lg:max-w-xl">
            {featured.eyebrow ? (
              <p className="font-body text-label uppercase tracking-widest text-soft-gold-bright">
                <span aria-hidden="true">▶ </span>
                {featured.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-featured-heading"
              className="font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] text-cream"
            >
              {featured.title}
            </h2>

            {featured.tagline ? (
              <p className="font-mono text-sm uppercase tracking-[0.2em] text-soft-gold-bright">
                {featured.tagline}
                <span aria-hidden="true" className="ml-1 inline-block animate-[featured-blink_1.1s_steps(1)_infinite] motion-reduce:animate-none">
                  _
                </span>
              </p>
            ) : null}

            <div className="space-y-4 font-body text-body text-cream/80">
              {featured.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            {featured.colorways.length > 1 ? (
              <div className="space-y-3">
                <p className="font-body text-label uppercase tracking-widest text-cream/60">
                  Colorway · <span className="text-cream">{colorway.label}</span>
                </p>
                <div className="flex flex-wrap gap-3" role="group" aria-label="Choose a colorway">
                  {featured.colorways.map((option, index) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={index === active}
                      aria-label={option.label}
                      onClick={() => setActive(index)}
                      className={cn(
                        'h-9 w-9 rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-gold-bright',
                        index === active
                          ? 'scale-110 border-soft-gold-bright'
                          : 'border-cream/25 hover:border-cream/60',
                      )}
                      style={{ backgroundColor: option.swatch }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <Button
              href={colorway.href}
              className="[&_span]:border-cream [&_span]:bg-cream [&_span]:text-heritage-green hover:[&_span]:bg-white"
              onClick={() => trackCtaClick(ctaLabel, 'home_featured')}
            >
              {ctaLabel} →
            </Button>
          </div>

          <div className="relative order-1 mx-auto aspect-square w-full max-w-[34rem] lg:order-2">
            {/* Spotlight: a soft cone from above, a glow behind the cover and a pool of light on the floor. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[14%] -top-[18%] bottom-[12%] [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)] bg-[linear-gradient(to_bottom,rgba(246,242,232,0.34),rgba(246,242,232,0.08)_70%,rgba(246,242,232,0))] blur-xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(246,242,232,0.42)_0%,rgba(231,222,206,0.16)_38%,rgba(26,26,26,0)_68%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[8%] bottom-[6%] h-[16%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(246,242,232,0.3)_0%,rgba(246,242,232,0.08)_45%,rgba(26,26,26,0)_72%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[27%] bottom-[11%] h-[5%] rounded-[50%] bg-black/55 blur-md motion-safe:animate-[featured-shadow_6s_ease-in-out_infinite]"
            />

            <div className="absolute inset-[13%] bottom-[17%] origin-[50%_0%] motion-safe:animate-[featured-sway_6s_ease-in-out_infinite]">
              <img
                key={colorway.label}
                src={assetUrl(colorway.image)}
                alt={`${featured.title} putter cover in ${colorway.label.toLowerCase()}`}
                width={1024}
                height={1024}
                fetchPriority="low"
                decoding="async"
                className="h-full w-full object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.55)] motion-safe:animate-[featured-in_450ms_ease-out]"
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
