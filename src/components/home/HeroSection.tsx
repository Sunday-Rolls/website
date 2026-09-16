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
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={posterSrc}
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-heritage-green/92 via-heritage-green/72 to-heritage-green/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(176,141,87,0.22),transparent_55%)]" />
        <img
          src={homeAssets.heroTexture}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-soft-light"
        />
      </div>

      <Container className="relative flex min-h-[min(88vh,780px)] items-end py-16 md:items-center md:py-section-y">
        <div className="max-w-xl space-y-5 pb-4 md:pb-0">
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
