import { useState } from 'react'
import { usePageContent } from '@/lib/content'
import { pushEvent } from '@/lib/gtm'
import { subscribeToNewsletter } from '@/lib/shopify'
import { Container } from '@/components/ui/Container'
import { EmailInput } from '@/components/ui/EmailInput'

type Status = { tone: 'success' | 'error'; message: string } | null

export function NewsletterSection() {
  const { newsletter } = usePageContent('home')
  const [status, setStatus] = useState<Status>(null)

  async function handleSubscribe(email: string) {
    setStatus(null)

    try {
      await subscribeToNewsletter(email)
      setStatus({ tone: 'success', message: newsletter.successMessage })
      pushEvent('newsletter_subscribe', { method: 'shopify_storefront' })
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : newsletter.errorMessage
      setStatus({ tone: 'error', message })
    }
  }

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
            submittingLabel={newsletter.submittingLabel}
            className="mx-auto"
            disabled={status?.tone === 'success'}
            onSubmitEmail={handleSubscribe}
          />

          {newsletter.consent ? (
            <p className="font-body text-body-small text-cream/65">{newsletter.consent}</p>
          ) : null}

          {status ? (
            <p
              role="status"
              className={
                status.tone === 'success'
                  ? 'font-body text-body-small text-soft-gold'
                  : 'font-body text-body-small text-canvas-tan'
              }
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </Container>
    </section>
  )
}
