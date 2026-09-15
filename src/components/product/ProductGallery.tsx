import { useEffect, useState } from 'react'
import { productAssets } from '@/assets'
import {
  getPlaceholderProductImage,
  type ProductImage,
  type ShopifyProduct,
} from '@/lib/shopify'
import { cn } from '@/lib/utils'

interface ProductGalleryProps {
  product: ShopifyProduct
  className?: string
}

function resolveImages(product: ShopifyProduct): ProductImage[] {
  if (product.images?.length) return product.images

  const fallback =
    product.imageUrl ?? getPlaceholderProductImage(product.handle) ?? productAssets.galleryFallback

  return [{ url: fallback, alt: product.imageAlt ?? product.title }]
}

export function ProductGallery({ product, className }: ProductGalleryProps) {
  const images = resolveImages(product)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [product.handle])

  const active = images[Math.min(activeIndex, images.length - 1)] ?? images[0]
  const showCarousel = images.length > 1

  function goTo(index: number) {
    setActiveIndex((index + images.length) % images.length)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-hidden rounded-sm border border-sand bg-cream">
        <img
          src={active.url}
          alt={active.alt ?? product.title}
          className="block h-auto w-full"
        />
      </div>

      {showCarousel ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              className="font-body text-label uppercase tracking-[0.12em] text-heritage-green transition-opacity hover:opacity-70"
              aria-label="Previous product image"
            >
              Prev
            </button>
            <p className="font-body text-body-small text-matte-black/60">
              {activeIndex + 1} / {images.length}
            </p>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              className="font-body text-label uppercase tracking-[0.12em] text-heritage-green transition-opacity hover:opacity-70"
              aria-label="Next product image"
            >
              Next
            </button>
          </div>

          <ul className="grid grid-cols-5 gap-2" aria-label="Product image thumbnails">
            {images.map((image, index) => {
              const selected = index === activeIndex
              return (
                <li key={`${image.url}-${index}`}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Show image ${index + 1}`}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'overflow-hidden rounded-sm border bg-cream transition-colors',
                      selected ? 'border-heritage-green' : 'border-sand hover:border-canvas-tan',
                    )}
                  >
                    <img
                      src={image.url}
                      alt=""
                      className="aspect-square h-auto w-full object-cover"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
