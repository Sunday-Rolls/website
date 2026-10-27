import { Link } from 'react-router-dom'
import { getButtonLabel } from '@/lib/content'
import { trackSelectItem } from '@/lib/gtm'
import { prefetchHandlers } from '@/lib/preload-route'
import { sitePath } from '@/lib/site-path'
import { productImageSrcSet, sizedImageUrl } from '@/lib/responsive-image'
import type { ShopifyProduct } from '@/lib/shopify'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  product: ShopifyProduct
  className?: string
  listId?: string
  listName?: string
  /** Optional chip overlaid on the photo (e.g. "New!"). */
  badge?: string
  /** Slightly varies badge tilt when several cards share a badge. */
  badgeTilt?: number
  /** Hides the material line and "View details" link for shorter cards. */
  compact?: boolean
  /** Load immediately. Use for the image that can be the largest paint. */
  priority?: boolean
  /** Skip the photo until the slide is near the viewport. The frame stays reserved. */
  loadImage?: boolean
  imageSizes?: string
}

export function ProductCard({
  product,
  className,
  listId = 'shop',
  listName = 'Shop',
  badge,
  badgeTilt = -8,
  compact = false,
  priority = false,
  loadImage = true,
  imageSizes = '(min-width: 1100px) 25vw, (min-width: 640px) 33vw, 50vw',
}: ProductCardProps) {
  const productPath = sitePath(`/products/${product.handle}`)
  const preload = prefetchHandlers(productPath)

  function handleSelect() {
    trackSelectItem(product, listId, listName)
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col border border-sand bg-white transition-shadow hover:shadow-md',
        className,
      )}
    >
      {badge ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-2 -top-2 z-20 inline-flex origin-center items-center bg-heritage-green px-2.5 py-1 font-body text-sm font-semibold tracking-wide text-cream shadow-sm"
          style={{ transform: `rotate(${badgeTilt}deg)` }}
        >
          {badge}
        </span>
      ) : null}
      <Link to={productPath} className="relative block overflow-hidden" onClick={handleSelect} {...preload}>
        <div className="aspect-[4/5] overflow-hidden bg-warm-sand">
          {loadImage && product.imageUrl ? (
            <img
              src={sizedImageUrl(product.imageUrl, 640) ?? product.imageUrl}
              srcSet={productImageSrcSet(product.imageUrl)}
              sizes={imageSizes}
              alt={product.imageAlt ?? product.title}
              width={640}
              height={800}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding={priority ? 'sync' : 'async'}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-b from-warm-sand to-sand">
              <span className="font-display text-2xl text-heritage-green/30">SR</span>
            </div>
          )}
        </div>
        {badge ? <span className="sr-only">{badge}</span> : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to={productPath} onClick={handleSelect} {...preload}>
          <h3 className="font-display text-xl text-heritage-green">{product.title}</h3>
        </Link>
        <p className="font-body text-body-small text-matte-black/70">{product.price}</p>
        {!compact && product.material ? (
          <p className="font-body text-body-small text-leather">{product.material}</p>
        ) : null}
        {!compact ? (
          <Link
            to={productPath}
            className="mt-auto font-body text-label uppercase tracking-widest text-heritage-green transition-colors hover:text-forest-green"
            onClick={handleSelect}
            {...preload}
          >
            {getButtonLabel('viewDetails')} →
          </Link>
        ) : null}
      </div>
    </article>
  )
}
