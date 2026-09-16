import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { EmailInput } from '@/components/ui/EmailInput'

export function NewsletterSection() {
  const { newsletter } = usePageContent('home')

  return (
    <section
      className="bg-heritage-green py-section-y text-cream"
      aria-labelledby="home-newsletter-heading"
    >
      <Container>
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          {newsletter.eyebrow ? (
            <p className="font-body text-label uppercase tracking-widest text-soft-gold">
              {newsletter.eyebrow}
            </p>
          ) : null}

          <h2
            id="home-newsletter-heading"
            className="font-display text-section-title text-white"
          >
            {newsletter.title}
          </h2>

          <p className="font-body text-body text-cream/85">{newsletter.description}</p>

          <EmailInput
            placeholder={newsletter.placeholder}
            submitLabel={newsletter.submitLabel}
            className="mx-auto"
          />
        </div>
      </Container>
    </section>
  )
}
