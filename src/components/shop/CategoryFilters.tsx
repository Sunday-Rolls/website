import { usePageContent } from '@/lib/content'
import { cn } from '@/lib/utils'
import type { ShopFilterOption } from '@/types/content'

interface CategoryFiltersProps {
  activeFilter: string
  onFilterChange: (value: string) => void
}

function isHeadcoverFilter(value: string, options: ShopFilterOption[]): boolean {
  if (value === 'headcovers') return true

  return options.some(
    (option) =>
      option.value === 'headcovers' &&
      option.children?.some((child) => child.value === value),
  )
}

export function CategoryFilters({ activeFilter, onFilterChange }: CategoryFiltersProps) {
  const content = usePageContent('shop')
  const visibleOptions = content.filters.options.filter((option) => !option.hidden)
  const headcoversOption = content.filters.options.find((option) => option.value === 'headcovers')
  const showSubFilters = isHeadcoverFilter(activeFilter, content.filters.options)
  const subOptions = (headcoversOption?.children ?? []).filter((option) => !option.hidden)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <p className="font-body text-label uppercase tracking-widest text-leather">
          {content.filters.label}
        </p>
        <div className="flex flex-wrap gap-2">
          {visibleOptions.map((option) => {
            const isActive =
              activeFilter === option.value ||
              (option.value === 'headcovers' &&
                option.children?.some((child) => child.value === activeFilter))

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => onFilterChange(option.value)}
                className={cn(
                  'rounded-sm border px-4 py-2 font-body text-nav uppercase tracking-widest transition-colors',
                  isActive
                    ? 'border-heritage-green bg-heritage-green text-white'
                    : 'border-sand bg-white text-heritage-green hover:border-heritage-green',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {showSubFilters && subOptions.length > 0 ? (
        <div className="space-y-3 border-l-2 border-sand pl-4">
          <p className="font-body text-label uppercase tracking-widest text-leather">
            {content.filters.subFilterLabel ?? 'Headcover type'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={activeFilter === 'headcovers'}
              onClick={() => onFilterChange('headcovers')}
              className={cn(
                'rounded-sm border px-3 py-1.5 font-body text-nav uppercase tracking-widest transition-colors',
                activeFilter === 'headcovers'
                  ? 'border-heritage-green bg-heritage-green text-white'
                  : 'border-sand bg-white text-heritage-green hover:border-heritage-green',
              )}
            >
              All
            </button>
            {subOptions.map((option) => {
              const isActive = activeFilter === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onFilterChange(option.value)}
                  className={cn(
                    'rounded-sm border px-3 py-1.5 font-body text-nav uppercase tracking-widest transition-colors',
                    isActive
                      ? 'border-heritage-green bg-heritage-green text-white'
                      : 'border-sand bg-white text-heritage-green hover:border-heritage-green',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
