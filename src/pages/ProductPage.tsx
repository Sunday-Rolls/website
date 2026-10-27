import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
import { trackViewItem } from '@/lib/gtm'
import { applyPageMeta } from '@/lib/page-meta'
import { placeholderProducts } from '@/lib/product-catalog'
import type { ShopifyProduct } from '@/lib/shopify'
import { ProductDetails } from '@/components/product/ProductDetails'
import { ProductGallery } from '@/components/product/ProductGallery'
import { ProductReviews } from '@/components/product/ProductReviews'
import { ProductStory } from '@/components/product/ProductStory'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageLoader } from '@/components/ui/PageLoader'

export function ProductPage() {
  const { handle = '' } = useParams()
  const content = usePageContent('product')
  const [product, setProduct] = useState<ShopifyProduct | null | undefined>(() =>
    placeholderProducts.find((entry) => entry.handle === handle),
  )

  useEffect(() => {
    let cancelled = false
    const known = placeholderProducts.find((entry) => entry.handle === handle)
    setProduct(known)

    void import('@/lib/shopify').then(({ fetchProductByHandle }) =>
      fetchProductByHandle(handle).then((item) => {
        if (cancelled) return
        if (item && known) {
          const useStoreImages = Boolean(item.images?.length)
          setProduct({
            ...item,
            imageUrl: useStoreImages ? item.imageUrl : (known.imageUrl ?? item.imageUrl),
            imageAlt: useStoreImages ? item.imageAlt : (known.imageAlt ?? item.imageAlt),
            images: useStoreImages ? item.images : known.images,
            description: item.description || known.description,
            material: known.material ?? item.material,
            category: known.category ?? item.category,
            subcategory: known.subcategory ?? item.subcategory,
            keyFeatures: known.keyFeatures ?? item.keyFeatures,
            features: known.features ?? item.features,
            dimensionsDisplay: known.dimensionsDisplay ?? item.dimensionsDisplay,
          })
          return
        }
        setProduct(item ?? known ?? null)
      }),
    )

    return () => {
      cancelled = true
    }
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
      <Container>
        <PageLoader label={content.loading} />
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
