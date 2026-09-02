import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'

export function ProductStory() {
  const content = usePageContent('product')

  return (
    <section className="border-y border-sand bg-sand/20 py-12 md:py-16">
      <Container className="grid gap-4 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <h2 className="font-display text-section-title text-heritage-green">
          {content.story.title}
        </h2>
        <p className="max-w-2xl font-body text-body text-matte-black/80">
          {content.story.description}
        </p>
      </Container>
    </section>
  )
}
