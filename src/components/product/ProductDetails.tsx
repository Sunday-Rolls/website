import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@/lib/cart'
import { getButtonLabel, usePageContent } from '@/lib/content'
import { trackAddToCart } from '@/lib/gtm'
import {
  fetchProductByHandle,
  isShopifyConfigured,
  type ShopifyProduct,
} from '@/lib/shopify'
import { Button } from '@/components/ui/Button'

interface ProductDetailsProps {
  product: ShopifyProduct
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const content = usePageContent('product')
  const navigate = useNavigate()
  const { addItem, isUpdating } = useCart()
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyFeatures = product.keyFeatures
  const legacyFeatures =
    !keyFeatures?.length && product.features?.length
      ? product.features
      : !keyFeatures?.length
        ? content.defaultFeatures
        : []

  async function handleAddToCart() {
    if (!isShopifyConfigured) {
      setError('Checkout isn’t available yet. Connect Shopify to enable cart.')
      return
    }

    setIsAdding(true)
    setError(null)

    try {
      let variantId = product.variantId
      if (!variantId) {
        const live = await fetchProductByHandle(product.handle)
        variantId = live?.variantId
      }

      if (!variantId) {
        throw new Error('This product is missing a Shopify variant.')
      }

      await addItem(variantId, 1)
      trackAddToCart(product)
      navigate('/cart')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add to cart')
    } finally {
      setIsAdding(false)
    }
  }

  const busy = isAdding || isUpdating

  return (
    <div className="space-y-8">
      <div className="space-y-3 border-b border-sand pb-6">
        <h1 className="font-display text-page-title text-heritage-green">{product.title}</h1>
        <p className="font-body text-2xl text-matte-black">{product.price}</p>
        {product.material ? (
          <p className="font-body text-body-small text-leather">{product.material}</p>
        ) : null}
      </div>

      {product.description ? (
        <p className="font-body text-body text-matte-black/80">{product.description}</p>
      ) : null}

      {keyFeatures?.length ? (
        <div className="space-y-4">
          <p className="font-body text-label uppercase tracking-widest text-leather">
            {content.featuresHeading}
          </p>
          <ul className="space-y-3">
            {keyFeatures.map((feature) => (
              <li key={feature.label} className="font-body text-body text-matte-black/80">
                <span className="font-semibold text-heritage-green">{feature.label}:</span>{' '}
                {feature.text}
              </li>
            ))}
          </ul>
        </div>
      ) : legacyFeatures.length > 0 ? (
        <div className="space-y-4">
          <p className="font-body text-label uppercase tracking-widest text-leather">
            {content.featuresHeading}
          </p>
          <ul className="space-y-2 font-body text-body text-matte-black/80">
            {legacyFeatures.map((feature) => (
              <li key={feature}>• {feature}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {product.dimensionsDisplay ? (
        <div className="space-y-2 border-t border-sand pt-6">
          <p className="font-body text-label uppercase tracking-widest text-leather">
            {content.dimensionsHeading ?? 'Dimensions'}
          </p>
          <p className="font-body text-body text-matte-black/80">{product.dimensionsDisplay}</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <Button onClick={() => void handleAddToCart()} disabled={busy}>
          {busy ? getButtonLabel('addingToCart') : getButtonLabel('addToCart')}
        </Button>
        {error ? (
          <p className="font-body text-body-small text-leather" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
