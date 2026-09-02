import { useEffect } from 'react'
import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export function GalleryPage() {
  const content = usePageContent('gallery')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <Container className="space-y-10 py-section-y">
      <PageHeader title={content.header.title} subtitle={content.header.subtitle} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="aspect-[16/10] rounded-lg bg-gradient-to-br from-forest-green to-heritage-green" />

        <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
          {content.items.map((item, index) => (
            <figure key={`${item.caption}-${index}`} className="space-y-3">
              <div className="aspect-[5/3] rounded-lg bg-gradient-to-br from-warm-sand to-sand" />
              <figcaption className="font-body text-body-small text-matte-black/70">
                {item.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Container>
  )
}
