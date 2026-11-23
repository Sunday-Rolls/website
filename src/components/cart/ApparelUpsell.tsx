import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { assetUrl } from '@/lib/asset-url'
import type { CatalogProduct } from '@/lib/product-catalog'
import { productSizeOptions } from '@/lib/product-sizes'
import { sitePath } from '@/lib/site-path'
import { cn } from '@/lib/utils'
import {
  fetchProductByHandle,
  findVariantForSize,
  formatPrice,
  type ProductVariant,
} from '@/lib/shopify'
import type { CartContent } from '@/types/content'
import { Button } from '@/components/ui/Button'
import { SizePicker } from '@/components/product/SizePicker'

interface ApparelUpsellProps {
  product: CatalogProduct
  copy: NonNullable<CartContent['apparelUpsell']>
  currencyCode: string
  disabled?: boolean
  /** Half-width layout (next to the towel card): the button sits under the text. */
  compact?: boolean
  /** Adds the chosen variant; the cart provider shows any error. */
  onAdd: (variantId: string) => Promise<unknown>
}

/** "Complete the look" card: pick a size, add the tee to the order. */
export function ApparelUpsell({
  product,
  copy,
  currencyCode,
  disabled,
  compact,
  onAdd,
}: ApparelUpsellProps) {
  const [variants, setVariants] = useState<ProductVariant[] | undefined>(undefined)
  const [size, setSize] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Live variants tell us which sizes are sold out.
  useEffect(() => {
    let cancelled = false
    void fetchProductByHandle(product.handle).then((live) => {
      if (!cancelled && live?.variants?.length) setVariants(live.variants)
    })
    return () => {
      cancelled = true
    }
  }, [product.handle])

  const sizeOptions = productSizeOptions({ variants, sizes: product.sizes })
  const image = product.images[0] ? assetUrl(product.images[0]) : undefined
  const price = product.price ? formatPrice(product.price, currencyCode) : null
  const busy = disabled || adding

  async function handleAdd() {
    if (busy) return
    if (sizeOptions.length > 0 && !size) {
      setMessage(copy.sizeRequired)
      return
    }
    setAdding(true)
    setMessage(null)
    try {
      const live = variants ?? (await fetchProductByHandle(product.handle))?.variants
      const variantId = size ? findVariantForSize(live, size)?.id : live?.[0]?.id
      if (!variantId) throw new Error('Shirt is unavailable')
      await onAdd(variantId)
    } catch {
      setMessage('That size isn’t available right now.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <aside
      aria-label={copy.title}
      className={cn(
        'grid h-full gap-4 border border-sand bg-warm-sand/35 p-4 sm:grid-cols-[88px_1fr] sm:items-start',
        !compact && 'lg:grid-cols-[88px_1fr_auto]',
      )}
    >
      <Link to={sitePath(`/products/${product.handle}`)} className="block overflow-hidden">
        {image ? (
          <img src={image} alt={product.title} className="aspect-square w-full object-cover" />
        ) : (
          <div className="aspect-square bg-warm-sand" />
        )}
      </Link>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="space-y-1">
          <p className="font-body text-label uppercase tracking-widest text-leather">{copy.eyebrow}</p>
          <h2 className="font-display text-xl text-heritage-green">{copy.title}</h2>
          <p className="max-w-xl font-body text-body-small text-matte-black/75">
            {copy.description}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          {sizeOptions.length > 0 ? (
            <SizePicker
              compact
              label={copy.sizeLabel}
              options={sizeOptions}
              value={size}
              disabled={busy}
              onChange={(next) => {
                setSize(next)
                setMessage(null)
              }}
            />
          ) : null}
          {price ? <p className="pb-1 font-body text-body-small text-matte-black/70">{price}</p> : null}
        </div>
        {message ? (
          <p className="font-body text-body-small text-leather" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          'flex items-center',
          compact ? 'sm:col-start-2' : 'lg:justify-end lg:self-center',
        )}
      >
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleAdd()}>
          {adding ? copy.addingLabel : copy.ctaLabel}
        </Button>
      </div>
    </aside>
  )
}
