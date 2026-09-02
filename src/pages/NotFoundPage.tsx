import { useEffect } from 'react'
import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function NotFoundPage() {
  const content = usePageContent('not-found')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-section-y text-center">
      <p className="font-body text-label uppercase tracking-widest text-leather">
        {content.title}
      </p>
      <p className="font-display text-[clamp(4rem,12vw,7rem)] leading-none text-heritage-green">
        {content.code}
      </p>
      <p className="max-w-md font-body text-body text-matte-black/75">
        {content.description}
      </p>
      <Button href={content.cta.href}>{resolveLinkLabel(content.cta)}</Button>
    </Container>
  )
}
