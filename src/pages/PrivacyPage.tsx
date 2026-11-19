import { useEffect } from 'react'
import privacy from '@/content/pages/privacy.json'
import { applyPageMeta } from '@/lib/page-meta'
import { Container } from '@/components/ui/Container'

/**
 * Privacy policy. Deliberately not linked from the header, footer or sitemap,
 * and marked noindex: it exists so Google's OAuth consent screen (Sunday Rolls
 * Ads Cloud project) and similar services have a policy URL to point at.
 */
export function PrivacyPage() {
  useEffect(() => {
    applyPageMeta({
      title: privacy.meta.title,
      description: privacy.meta.description,
      path: '/privacy',
    })

    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const created = !robots
    const previous = robots?.content ?? null
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    robots.content = 'noindex, follow'

    return () => {
      if (!robots) return
      if (created) robots.remove()
      else if (previous !== null) robots.content = previous
    }
  }, [])

  return (
    <Container className="py-section-y">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="font-display text-page-title text-heritage-green">{privacy.title}</h1>
          <p className="font-body text-label uppercase tracking-widest text-leather">
            Last updated: {privacy.lastUpdated}
          </p>
        </header>

        <div
          className="space-y-4 font-body text-body text-matte-black/80 [&_a]:text-heritage-green [&_a]:underline [&_h2]:pt-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-heritage-green [&_li]:pl-1 [&_strong]:text-matte-black [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6"
          // Static, checked-in policy text (src/content/pages/privacy.json), not user input.
          dangerouslySetInnerHTML={{ __html: privacy.html }}
        />
      </article>
    </Container>
  )
}
