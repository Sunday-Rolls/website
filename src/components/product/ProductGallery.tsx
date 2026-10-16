import { useEffect, useState } from 'react'
import { productAssets } from '@/assets'
import {
  getPlaceholderProductImage,
  type ProductImage,
  type ShopifyProduct,
} from '@/lib/shopify'
import imageDimensions from '@/data/product-image-dimensions.json'
import { optimizedImageUrl, productImageSrcSet } from '@/lib/responsive-image'
import { cn } from '@/lib/utils'

interface ProductGalleryProps {
  product: ShopifyProduct
  className?: string
}

/** Minimum thumbnails when Shopify only has a single image (pad by repeating). */
const MIN_GALLERY_SLOTS = 2

function resolveImages(product: ShopifyProduct): ProductImage[] {
  const seed: ProductImage[] = product.images?.length
    ? [...product.images]
    : [
        {
          url:
            product.imageUrl ??
            getPlaceholderProductImage(product.handle) ??
            productAssets.galleryFallback,
          alt: product.imageAlt ?? product.title,
        },
      ]

  const images: ProductImage[] = []
  const seen = new Set<string>()

  for (const image of seed) {
    if (!image.url || seen.has(image.url)) continue
    seen.add(image.url)
    images.push(image)
  }

  // Pad only with this product's own images — never mix in other products.
  while (images.length < MIN_GALLERY_SLOTS && images[0]) {
    images.push({
      url: images[0].url,
      alt: `${product.title} view ${images.length + 1}`,
    })
  }

  return images
}

export function ProductGallery({ product, className }: ProductGalleryProps) {
  const images = resolveImages(product)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [product.handle])

  const active = images[Math.min(activeIndex, images.length - 1)] ?? images[0]
  const activeSrc = optimizedImageUrl(active.url, 800) ?? active.url
  const dimensionKey = active.url.split('/').pop()?.split('?')[0] ?? ''
  const dimensions = (imageDimensions as Record<string, { width: number; height: number }>)[dimensionKey]

  function goTo(index: number) {
    setActiveIndex((index + images.length) % images.length)
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="overflow-hidden rounded-sm border border-sand bg-cream">
        <img
          src={activeSrc}
          srcSet={productImageSrcSet(active.url)}
          sizes="(min-width: 1024px) 50vw, 100vw"
          alt={active.alt ?? product.title}
          width={dimensions?.width ?? 800}
          height={dimensions?.height ?? 800}
          className="block h-auto w-full"
          style={
            dimensions
              ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` }
              : { aspectRatio: '1 / 1' }
          }
          fetchPriority={activeIndex === 0 ? 'high' : 'auto'}
          decoding="async"
        />
      </div>

      <div className="space-y-2">
        <p className="font-body text-label uppercase tracking-[0.12em] text-matte-black/75">
          More views
        </p>
        <ul
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label="Product image thumbnails"
        >
          {images.map((image, index) => {
            const selected = index === activeIndex
            return (
              <li key={`${image.url}-${index}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Show image ${index + 1}`}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'block h-16 w-16 overflow-hidden rounded-sm border bg-cream transition-colors sm:h-20 sm:w-20',
                    selected
                      ? 'border-heritage-green ring-1 ring-heritage-green'
                      : 'border-sand hover:border-canvas-tan',
                  )}
                >
                  <img
                    src={image.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
