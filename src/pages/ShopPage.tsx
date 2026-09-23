import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
import { trackViewItemList } from '@/lib/gtm'
import {
  fetchProducts,
  filterProductsByCategory,
  placeholderProducts,
  type ShopifyProduct,
} from '@/lib/shopify'
import { CategoryFilters } from '@/components/shop/CategoryFilters'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { ShopHeader } from '@/components/shop/ShopHeader'
import { Container } from '@/components/ui/Container'

export function ShopPage() {
  const content = usePageContent('shop')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeFilter = searchParams.get('category') ?? 'all'
  const [products, setProducts] = useState<ShopifyProduct[]>(placeholderProducts)

  useEffect(() => {
    document.title = content.meta.title

    fetchProducts(50).then((items) => {
      if (items.length > 0) setProducts(items)
    })
  }, [content.meta.title])

  const filteredProducts = useMemo(
    () => filterProductsByCategory(products, activeFilter),
    [activeFilter, products],
  )

  useEffect(() => {
    if (filteredProducts.length === 0) return
    trackViewItemList(
      `shop_${activeFilter}`,
      activeFilter === 'all' ? 'Shop' : `Shop — ${activeFilter}`,
      filteredProducts,
    )
  }, [activeFilter, filteredProducts])

  function handleFilterChange(value: string) {
    if (value === 'all') {
      setSearchParams({})
      return
    }

    setSearchParams({ category: value })
  }

  return (
    <>
      <ShopHeader />

      <Container className="space-y-10 py-section-y">
        <CategoryFilters activeFilter={activeFilter} onFilterChange={handleFilterChange} />
        <ProductGrid
          products={filteredProducts}
          listId={`shop_${activeFilter}`}
          listName={activeFilter === 'all' ? 'Shop' : `Shop — ${activeFilter}`}
        />
      </Container>
    </>
  )
}
