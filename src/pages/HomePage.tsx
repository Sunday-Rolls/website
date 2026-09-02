import { useEffect, useState } from 'react'
import { usePageContent } from '@/lib/content'
import {
  fetchProducts,
  placeholderProducts,
  type ShopifyProduct,
} from '@/lib/shopify'
import { FeaturedCollection } from '@/components/home/FeaturedCollection'
import { HeroSection } from '@/components/home/HeroSection'
import { ValueStrip } from '@/components/ui/ValueStrip'

export function HomePage() {
  const content = usePageContent('home')
  const [products, setProducts] = useState<ShopifyProduct[]>(placeholderProducts.slice(0, 4))

  useEffect(() => {
    document.title = content.meta.title

    fetchProducts(4).then((items) => {
      if (items.length > 0) setProducts(items)
    })
  }, [content.meta.title])

  return (
    <>
      <HeroSection />
      <ValueStrip items={content.values.items} />
      <FeaturedCollection products={products} />
    </>
  )
}
