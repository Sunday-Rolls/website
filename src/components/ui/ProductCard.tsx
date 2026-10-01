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
  /** `large` drops the material line and "View details" link in favor of bigger title and price text. */
  size?: 'default' | 'large'
}

export function ProductCard({
  product,
  className,
  listId = 'shop',
  listName = 'Shop',
  size = 'default',
}: ProductCardProps) {
  const isLarge = size === 'large'

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

      <div className={cn('flex flex-1 flex-col', isLarge ? 'gap-1 px-4 py-3.5' : 'gap-2 p-4')}>
        <Link to={`/products/${product.handle}`} onClick={handleSelect}>
          <h3
            className={cn(
              'font-display text-heritage-green',
              isLarge ? 'text-2xl leading-tight md:text-[1.65rem]' : 'text-xl',
            )}
          >
            {product.title}
          </h3>
        </Link>
        <p
          className={cn(
            'font-body',
            isLarge
              ? 'text-body font-medium text-matte-black/80'
              : 'text-body-small text-matte-black/70',
          )}
        >
          {product.price}
        </p>
        {!isLarge && product.material ? (
          <p className="font-body text-body-small text-leather">{product.material}</p>
        ) : null}
        {!isLarge ? (
          <Link
            to={`/products/${product.handle}`}
            className="mt-auto font-body text-label uppercase tracking-widest text-heritage-green transition-colors hover:text-forest-green"
            onClick={handleSelect}
          >
            {getButtonLabel('viewDetails')} →
          </Link>
        ) : null}
      </div>
    </article>
  )
}
