import { cn } from '@/lib/utils'

interface ValueStripProps {
  items: Array<{ label: string }>
  className?: string
}

export function ValueStrip({ items, className }: ValueStripProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 border-y border-sand bg-sand/30 py-6 md:grid-cols-4',
        className,
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
  )
}
