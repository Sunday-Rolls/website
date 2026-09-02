import { resolveLinkLabel, usePageContent } from '@/lib/content'
import type { ShopifyProduct } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { ProductCard } from '@/components/ui/ProductCard'

interface FeaturedCollectionProps {
  products: ShopifyProduct[]
}

export function FeaturedCollection({ products }: FeaturedCollectionProps) {
  const content = usePageContent('home')

  return (
    <section className="bg-cream py-section-y">
      <Container className="space-y-10">
        <div className="flex flex-col gap-4 border-b border-sand pb-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <h2 className="font-display text-section-title text-heritage-green">
              {content.featured.title}
            </h2>
            <p className="max-w-xl font-body text-body text-matte-black/75">
              {content.featured.subtitle}
            </p>
          </div>
          <Button href={content.featured.cta.href} variant="secondary">
            {resolveLinkLabel(content.featured.cta)}
          </Button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </Container>
    </section>
  )
}
