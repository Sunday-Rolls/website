import { useEffect } from 'react'
import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { ValueStrip } from '@/components/ui/ValueStrip'

export function AboutPage() {
  const content = usePageContent('about')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <>
      <Container className="grid gap-10 py-section-y lg:grid-cols-[1fr_1.2fr]">
        <PageHeader title={content.hero.title} />

        <div className="space-y-4 font-body text-body text-matte-black/80">
          {content.hero.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-warm-sand to-canvas-tan lg:col-span-2" />

        <div className="aspect-[3/4] rounded-lg bg-gradient-to-br from-heritage-green to-forest-green" />

        <div className="space-y-4 self-center">
          <h2 className="font-display text-section-title text-heritage-green">
            {content.tradition.title}
          </h2>
          {content.tradition.lines.map((line) => (
            <p key={line} className="font-body text-body text-matte-black/80">
              {line}
            </p>
          ))}
        </div>
      </Container>

      <ValueStrip items={content.values.items} />
    </>
  )
}
