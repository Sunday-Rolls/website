import { productAssets } from '@/assets'
import { getPlaceholderProductImage, type ShopifyProduct } from '@/lib/shopify'
import { cn } from '@/lib/utils'

interface ProductGalleryProps {
  product: ShopifyProduct
  className?: string
}

export function ProductGallery({ product, className }: ProductGalleryProps) {
  const imageSrc =
    product.imageUrl ?? getPlaceholderProductImage(product.handle) ?? productAssets.galleryFallback

  return (
    <div className={cn('overflow-hidden rounded-sm border border-sand bg-warm-sand', className)}>
      <div className="aspect-[4/5] md:aspect-square">
        <img
          src={imageSrc}
          alt={product.imageAlt ?? product.title}
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  )
}
