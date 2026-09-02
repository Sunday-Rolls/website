import { usePageContent } from '@/lib/content'
import { cn } from '@/lib/utils'

interface CategoryFiltersProps {
  activeFilter: string
  onFilterChange: (value: string) => void
}

export function CategoryFilters({ activeFilter, onFilterChange }: CategoryFiltersProps) {
  const content = usePageContent('shop')

  return (
    <div className="space-y-4">
      <p className="font-body text-label uppercase tracking-widest text-leather">
        {content.filters.label}
      </p>
      <div className="flex flex-wrap gap-2">
        {content.filters.options.map((option) => {
          const isActive = activeFilter === option.value

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
  )
}
