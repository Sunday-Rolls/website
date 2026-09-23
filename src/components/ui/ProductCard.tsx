import { Link } from 'react-router-dom'
import { getButtonLabel } from '@/lib/content'
import { trackSelectItem } from '@/lib/gtm'
import type { ShopifyProduct } from '@/lib/shopify'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  product: ShopifyProduct
  className?: string
  listId?: string
  listName?: string
}

export function ProductCard({
  product,
  className,
  listId = 'shop',
  listName = 'Shop',
}: ProductCardProps) {
  function handleSelect() {
    trackSelectItem(product, listId, listName)
  }

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden border border-sand bg-white transition-shadow hover:shadow-md',
        className,
      )}
    >
      <Link to={`/products/${product.handle}`} className="block" onClick={handleSelect}>
        <div className="aspect-[4/5] bg-warm-sand">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.imageAlt ?? product.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-b from-warm-sand to-sand">
              <span className="font-display text-2xl text-heritage-green/30">SR</span>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to={`/products/${product.handle}`} onClick={handleSelect}>
          <h3 className="font-display text-xl text-heritage-green">{product.title}</h3>
        </Link>
        <p className="font-body text-body-small text-matte-black/70">{product.price}</p>
        {product.material ? (
          <p className="font-body text-body-small text-leather">{product.material}</p>
        ) : null}
        <Link
          to={`/products/${product.handle}`}
          className="mt-auto font-body text-label uppercase tracking-widest text-heritage-green transition-colors hover:text-forest-green"
          onClick={handleSelect}
        >
          {getButtonLabel('viewDetails')} →
        </Link>
      </div>
    </article>
  )
}
