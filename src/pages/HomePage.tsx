import { useEffect, useMemo, useState } from 'react'
import { usePageContent } from '@/lib/content'
import {
  fetchProducts,
  filterProductsByCategory,
  placeholderProducts,
  type ShopifyProduct,
} from '@/lib/shopify'
import { HeroSection } from '@/components/home/HeroSection'
import { MediaBreak } from '@/components/home/MediaBreak'
import { ProductCarouselBlock } from '@/components/home/ProductCarouselBlock'
import { ReviewsMarquee } from '@/components/home/ReviewsMarquee'
import { StoryBanner } from '@/components/home/StoryBanner'
import { ValueStrip } from '@/components/ui/ValueStrip'

export function HomePage() {
  const content = usePageContent('home')
  const [products, setProducts] = useState<ShopifyProduct[]>(placeholderProducts)

  useEffect(() => {
    document.title = content.meta.title

    fetchProducts(50).then((items) => {
      if (items.length > 0) setProducts(items)
    })
  }, [content.meta.title])

  const blocks = useMemo(
    () =>
      content.productBlocks.map((block, index) => ({
        block,
        products: filterProductsByCategory(products, block.filter),
        tone: index % 2 === 0 ? ('cream' as const) : ('sand' as const),
      })),
    [content.productBlocks, products],
  )

  return (
    <>
      <HeroSection />
      <ValueStrip items={content.values.items} className="border-sand bg-warm-sand/55" />
      {blocks.map(({ block, products: blockProducts, tone }) => (
        <ProductCarouselBlock
          key={block.id}
          block={block}
          products={blockProducts}
          tone={tone}
        />
      ))}
      <MediaBreak />
      <ReviewsMarquee />
      <StoryBanner />
    </>
  )
}
