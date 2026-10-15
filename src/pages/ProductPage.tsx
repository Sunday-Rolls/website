import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
import { trackViewItem } from '@/lib/gtm'
import { applyPageMeta } from '@/lib/page-meta'
import {
  fetchProductByHandle,
  placeholderProducts,
  type ShopifyProduct,
} from '@/lib/shopify'
import { ProductDetails } from '@/components/product/ProductDetails'
import { ProductGallery } from '@/components/product/ProductGallery'
import { ProductReviews } from '@/components/product/ProductReviews'
import { ProductStory } from '@/components/product/ProductStory'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export function ProductPage() {
  const { handle = '' } = useParams()
  const content = usePageContent('product')
  const [product, setProduct] = useState<ShopifyProduct | null | undefined>(undefined)

  useEffect(() => {
    fetchProductByHandle(handle).then((item) => {
      setProduct(item ?? placeholderProducts.find((entry) => entry.handle === handle) ?? null)
    })
  }, [handle])

  useEffect(() => {
    if (product) {
      applyPageMeta({
        title: `${product.title} — Sunday Rolls`,
        description: product.description || content.meta.description,
        path: `/products/${product.handle}`,
        image: product.imageUrl,
        type: 'product',
      })
      trackViewItem(product)
      return
    }
    applyPageMeta({
      title: content.meta.title,
      description: content.meta.description,
      path: handle ? `/products/${handle}` : undefined,
    })
  }, [product, content.meta.title, content.meta.description, handle])

  if (product === undefined) {
    return (
      <Container className="py-section-y">
        <p className="font-body text-body">{content.loading}</p>
      </Container>
    )
  }

  if (product === null) {
    return (
      <Container className="py-section-y">
        <PageHeader
          title={content.notFound.title}
          subtitle={content.notFound.description}
        />
      </Container>
    )
  }

  return (
    <>
      <Container className="grid gap-10 py-section-y lg:grid-cols-2 lg:gap-16">
        <ProductGallery product={product} />
        <ProductDetails product={product} />
      </Container>
      <ProductReviews product={product} />
      <ProductStory />
    </>
  )
}
