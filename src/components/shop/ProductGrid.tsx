import type { ShopifyProduct } from '@/lib/shopify'
import { usePageContent } from '@/lib/content'
import { ProductCard } from '@/components/ui/ProductCard'

interface ProductGridProps {
  products: ShopifyProduct[]
  listId?: string
  listName?: string
}

export function ProductGrid({
  products,
  listId = 'shop',
  listName = 'Shop',
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
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          listId={listId}
          listName={listName}
        />
      ))}
    </div>
  )
}
