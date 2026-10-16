import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { trackCtaClick } from '@/lib/gtm'
import { assetUrl } from '@/lib/asset-url'
import { homeAssets } from '@/assets'
import { DeferredBackgroundVideo } from '@/components/home/DeferredBackgroundVideo'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function HeroSection() {
  const content = usePageContent('home')
  const videoSrc = content.hero.video ? assetUrl(content.hero.video) : homeAssets.heroVideo
  const posterSrc = content.hero.poster ? assetUrl(content.hero.poster) : homeAssets.hero
  const posterWebpSrc = content.hero.posterWebp
    ? assetUrl(content.hero.posterWebp)
    : homeAssets.heroPosterWebp

  return (
    <section className="relative overflow-hidden bg-heritage-green text-cream">
      <DeferredBackgroundVideo
        videoSrc={videoSrc}
        posterSrc={posterSrc}
        posterWebpSrc={posterWebpSrc}
        prioritizePoster
        rootMargin="0px"
        videoClassName="object-bottom"
      />
      <div className="absolute inset-0 bg-black/10" />

      <Container className="relative flex min-h-[min(68vh,640px)] items-center justify-center py-16 text-center md:py-section-y">
        <div className="mx-auto max-w-3xl space-y-5">
          <p className="-mt-10 font-body text-base font-medium uppercase tracking-[0.18em] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
            Sunday Rolls
          </p>
          <h1 className="font-display text-hero text-white">{content.hero.headline}</h1>
          <p className="font-body text-body text-cream/90">{content.hero.subheadline}</p>
          <Button
            href={content.hero.cta.href}
            className="[&_span]:border-cream [&_span]:bg-cream [&_span]:text-heritage-green hover:[&_span]:bg-white"
            onClick={() =>
              trackCtaClick(resolveLinkLabel(content.hero.cta), 'home_hero')
            }
          >
            {resolveLinkLabel(content.hero.cta)}
          </Button>
        </div>
      </Container>
    </section>
  )
}
