import { getButtonLabel, usePageContent } from '@/lib/content'
import { trackAddToCart } from '@/lib/gtm'
import type { ShopifyProduct } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'

interface ProductDetailsProps {
  product: ShopifyProduct
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const content = usePageContent('product')
  const features = product.features?.length ? product.features : content.defaultFeatures

  return (
    <div className="space-y-8">
      <div className="space-y-3 border-b border-sand pb-6">
        <h1 className="font-display text-page-title text-heritage-green">{product.title}</h1>
        <p className="font-body text-2xl text-matte-black">{product.price}</p>
        {product.material ? (
          <p className="font-body text-body-small text-leather">{product.material}</p>
        ) : null}
      </div>

      <div className="space-y-4">
        <p className="font-body text-label uppercase tracking-widest text-leather">
          {content.featuresHeading}
        </p>
        <ul className="space-y-2 font-body text-body text-matte-black/80">
          {features.map((feature) => (
            <li key={feature}>• {feature}</li>
          ))}
        </ul>
      </div>

      <Button
        onClick={() => {
          trackAddToCart(product)
        }}
      >
        {getButtonLabel('addToCart')}
      </Button>
    </div>
  )
}
