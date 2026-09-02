import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
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

    fetchProducts(12).then((items) => {
      if (items.length > 0) setProducts(items)
    })
  }, [content.meta.title])

  const filteredProducts = useMemo(
    () => filterProductsByCategory(products, activeFilter),
    [activeFilter, products],
  )

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
        <ProductGrid products={filteredProducts} />
      </Container>
    </>
  )
}
