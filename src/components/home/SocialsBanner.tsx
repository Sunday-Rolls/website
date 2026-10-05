import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { SocialLinks } from '@/components/ui/SocialLinks'

export function SocialsBanner() {
  const { socials } = usePageContent('home')

  if (!socials) return null

  return (
    <section className="bg-warm-sand/45 py-12" aria-labelledby="home-socials-heading">
      <Container className="space-y-8 text-center">
        <div className="space-y-2">
          {socials.eyebrow ? (
            <p className="font-body text-label uppercase tracking-widest text-leather">
              {socials.eyebrow}
            </p>
          ) : null}
          <h2 id="home-socials-heading" className="font-display text-section-title text-heritage-green">
            {socials.title}
          </h2>
        </div>
        <SocialLinks variant="banner" />
      </Container>
    </section>
  )
}
