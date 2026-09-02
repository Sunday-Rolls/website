import { useEffect } from 'react'
import { GalleryFigure } from '@/components/gallery/GalleryFigure'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePageContent } from '@/lib/content'

export function GalleryPage() {
  const content = usePageContent('gallery')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <Container className="space-y-10 py-section-y">
      <PageHeader title={content.header.title} subtitle={content.header.subtitle} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <GalleryFigure
          alt={content.featured.alt}
          caption={content.featured.caption}
          image={content.featured.image}
          aspectClassName="aspect-[4/3] sm:aspect-[16/10]"
        />

        <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1">
          {content.items.map((item, index) => (
            <GalleryFigure
              key={`${item.caption}-${index}`}
              alt={item.alt}
              caption={item.caption}
              image={item.image}
            />
          ))}
        </div>
      </section>
    </Container>
  )
}
