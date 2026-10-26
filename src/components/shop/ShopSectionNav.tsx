import { useSearchParams } from 'react-router-dom'
import { useSiteContent } from '@/lib/content'
import { cn } from '@/lib/utils'

function categoryFromHref(href: string): string | null {
  const queryIndex = href.indexOf('?')
  if (queryIndex === -1) return null
  return new URLSearchParams(href.slice(queryIndex)).get('category')
}

interface ShopSectionNavProps {
  sectionIds: string[]
}

export function ShopSectionNav({ sectionIds }: ShopSectionNavProps) {
  const { navigation } = useSiteContent()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCategory = searchParams.get('category')
  const visibleIds = new Set(sectionIds)

  const chips = navigation.footerShop.flatMap((link) => {
    const category = categoryFromHref(link.href)
    if (!category || !visibleIds.has(category)) return []
    return [{ label: link.label, category }]
  })

  if (chips.length === 0) return null

  return (
    <nav
      aria-label="Shop sections"
      className="border-b border-sand bg-cream"
    >
      <div className="mx-auto flex max-w-container gap-2 overflow-x-auto px-container-x py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const isActive = activeCategory === chip.category

          return (
            <button
              key={chip.category}
              type="button"
              aria-current={isActive ? 'true' : undefined}
              onClick={() => setSearchParams({ category: chip.category })}
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 font-body text-sm font-medium tracking-wide transition-colors',
                isActive
                  ? 'border-heritage-green bg-heritage-green text-cream'
                  : 'border-heritage-green/35 bg-cream text-heritage-green hover:border-heritage-green hover:bg-warm-sand/50',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
