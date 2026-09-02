import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { trackCtaClick } from '@/lib/gtm'
import { homeAssets } from '@/assets'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function HeroSection() {
  const content = usePageContent('home')

  return (
    <section className="relative overflow-hidden bg-heritage-green text-cream">
      <div className="absolute inset-0">
        <img
          src={homeAssets.hero}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-heritage-green/95 via-heritage-green/75 to-heritage-green/20" />
        <img
          src={homeAssets.heroTexture}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-soft-light"
        />
      </div>

      <Container className="relative grid min-h-[min(85vh,720px)] items-end gap-10 py-16 md:grid-cols-[1.15fr_0.85fr] md:py-section-y lg:items-center">
        <div className="max-w-xl space-y-5 pb-4 md:pb-0">
          <h1 className="font-display text-hero text-white">{content.hero.headline}</h1>
          <p className="font-body text-body text-cream/90">{content.hero.subheadline}</p>
          <Button
            href={content.hero.cta.href}
            onClick={() =>
              trackCtaClick(resolveLinkLabel(content.hero.cta), 'home_hero')
            }
          >
            {resolveLinkLabel(content.hero.cta)}
          </Button>
        </div>

        <div className="hidden justify-end md:flex">
          <img
            src={homeAssets.hero}
            alt="Sunday Rolls lifestyle photography"
            className="aspect-[4/5] w-full max-w-md rounded-sm border border-cream/15 object-cover shadow-2xl"
          />
        </div>
      </Container>
    </section>
  )
}
