import type { SizeOption } from '@/lib/product-sizes'
import { cn } from '@/lib/utils'

interface SizePickerProps {
  label: string
  options: SizeOption[]
  value: string | null
  disabled?: boolean
  /** Smaller chips for tight spots like the cart add-on card. */
  compact?: boolean
  onChange: (size: string) => void
}

/** Size chips (radio group) for apparel. Sold-out sizes stay visible but can't be picked. */
export function SizePicker({ label, options, value, disabled, compact, onChange }: SizePickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-body text-label uppercase tracking-widest text-leather">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = option.size === value
          const unavailable = !option.available
          return (
            <button
              key={option.size}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled || unavailable}
              onClick={() => onChange(option.size)}
              className={cn(
                'border font-body font-medium tracking-wide transition-colors disabled:cursor-not-allowed',
                compact ? 'min-w-10 px-2.5 py-1 text-sm' : 'min-w-14 px-4 py-2 text-body',
                selected
                  ? 'border-heritage-green bg-heritage-green text-cream'
                  : 'border-heritage-green/35 bg-cream text-heritage-green hover:border-heritage-green',
                unavailable && 'line-through opacity-40',
              )}
            >
              {option.size}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
