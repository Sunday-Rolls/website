import type { ShopifyProduct } from '@/lib/shopify'
import { usePageContent } from '@/lib/content'
import { ProductCard } from '@/components/ui/ProductCard'

interface ProductGridProps {
  products: ShopifyProduct[]
  listId?: string
  listName?: string
  /** Optional chip on each product photo (e.g. section "New!" badge). */
  badge?: string
  /** First N cards load immediately so an in-view photo is not deferred. */
  priorityCount?: number
}

const BADGE_TILTS = [-10, -6, -12, -7, -9, -5, -11]

export function ProductGrid({
  products,
  listId = 'shop',
  listName = 'Shop',
  badge,
  priorityCount = 0,
}: ProductGridProps) {
  const content = usePageContent('shop')

  if (products.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-sand bg-white p-12 text-center">
        <h2 className="font-display text-2xl text-heritage-green">
          {content.emptyState.title}
        </h2>
        <p className="mt-3 font-body text-body text-matte-black/70">
          {content.emptyState.description}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          listId={listId}
          listName={listName}
          badge={badge}
          badgeTilt={BADGE_TILTS[index % BADGE_TILTS.length]}
          priority={index < priorityCount}
          imageSizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      ))}
    </div>
  )
}
