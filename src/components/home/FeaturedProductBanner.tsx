import { useState } from 'react'
import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { SplatViewer } from '@/components/splat/SplatViewer'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

/** Flagship-product banner: copy on one side, a slowly turning Gaussian splat on the other. */
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

          <div className="relative order-1 mx-auto w-full max-w-[34rem] lg:order-2">
            {/* Spotlight behind the cover. */}
            <div
              aria-hidden="true"
              className="absolute -inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(246,242,232,0.9)_0%,rgba(231,222,206,0.5)_34%,rgba(176,141,87,0.12)_55%,rgba(26,26,26,0)_70%)]"
            />
            <SplatViewer
              src={assetUrl(colorway.splat)}
              poster={assetUrl(colorway.poster)}
              alt={`${featured.title} putter cover in ${colorway.label.toLowerCase()}`}
              motion={colorway.motion ?? featured.motion}
              className="aspect-square w-full [&_img]:scale-[1.9] [&_img]:[mask-image:radial-gradient(circle,black_28%,transparent_42%)]"
            />
            <p className="mt-2 text-center font-body text-label uppercase tracking-widest text-cream/45" aria-hidden="true">
              Drag to turn
            </p>
          </div>
        </div>
      </Container>
    </section>
  )
}
