import { resolveLinkLabel } from '@/lib/content'
import type { HomeProductBlock } from '@/types/content'
import type { ShopifyProduct } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { ProductCard } from '@/components/ui/ProductCard'
import { cn } from '@/lib/utils'

interface ProductCarouselBlockProps {
  block: HomeProductBlock
  products: ShopifyProduct[]
  tone?: 'cream' | 'sand'
}

export function ProductCarouselBlock({
  block,
  products,
  tone = 'cream',
}: ProductCarouselBlockProps) {
  return (
    <section
      className={cn(
        'py-section-y',
        tone === 'sand' ? 'bg-warm-sand/45' : 'bg-cream',
      )}
    >
      <Container className="space-y-8">
        <div className="max-w-2xl space-y-3">
          <h2 className="font-display text-section-title text-heritage-green">{block.title}</h2>
          {block.subtitle ? (
            <p className="font-body text-body text-matte-black/75">{block.subtitle}</p>
          ) : null}
        </div>

        <div className="-mx-container-x">
          <div
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-container-x pb-3 [scrollbar-width:thin]"
            role="list"
            aria-label={block.title}
          >
            {products.map((product) => (
              <div
                key={product.id}
                role="listitem"
                className="w-[min(78vw,17.5rem)] shrink-0 snap-start sm:w-[18rem]"
              >
                <ProductCard product={product} className="h-full border-sand/80 bg-white/90" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Button href={block.shopAll.href} variant="secondary">
            {resolveLinkLabel(block.shopAll)}
          </Button>
        </div>
      </Container>
    </section>
  )
}
