import { cn } from '@/lib/utils'

interface ValueStripProps {
  items: Array<{ label: string }>
  className?: string
}

export function ValueStrip({ items, className }: ValueStripProps) {
  const useSpreadLayout = items.length <= 3

  return (
    <div className={cn('border-y border-sand bg-sand/30 py-6', className)}>
      <div
        className={cn(
          'mx-auto w-full max-w-container px-container-x',
          useSpreadLayout
            ? 'flex justify-between gap-6'
            : 'grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4 lg:gap-4',
        )}
      >
        {items.map((item) => (
          <p
            key={item.label}
            className="text-center font-body text-label uppercase tracking-widest text-heritage-green"
          >
            {item.label}
          </p>
        ))}
      </div>
    </div>
  )
}
