import { cn } from '@/lib/utils'

interface ValueStripProps {
  items: Array<{ label: string }>
  className?: string
}

export function ValueStrip({ items, className }: ValueStripProps) {
  return (
    <div className={cn('border-y border-sand bg-sand/30 py-6', className)}>
      <div className="mx-auto flex w-full max-w-container justify-between px-container-x">
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
