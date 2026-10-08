import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { trackCtaClick } from '@/lib/gtm'
import { assetUrl } from '@/lib/asset-url'
import { homeAssets } from '@/assets'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function HeroSection() {
  const content = usePageContent('home')
  const videoSrc = content.hero.video ? assetUrl(content.hero.video) : homeAssets.heroVideo
  const posterSrc = content.hero.poster ? assetUrl(content.hero.poster) : homeAssets.hero

  return (
    <section className="relative overflow-hidden bg-heritage-green text-cream">
      <div className="absolute inset-0">
        <video
          className="h-full w-full object-cover object-bottom"
          autoPlay
          muted
          loop
          playsInline
          poster={posterSrc}
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/10" />
      </div>

      <Container className="relative flex min-h-[min(68vh,640px)] items-center justify-center py-16 text-center md:py-section-y">
        <div className="mx-auto max-w-3xl space-y-5">
          <p className="font-body text-label uppercase tracking-widest text-soft-gold">Sunday Rolls</p>
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
