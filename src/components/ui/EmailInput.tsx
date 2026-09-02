import { cn } from '@/lib/utils'

interface EmailInputProps {
  placeholder: string
  submitLabel: string
  className?: string
}

export function EmailInput({
  placeholder,
  submitLabel,
  className,
}: EmailInputProps) {
  return (
    <form
      className={cn('flex max-w-md overflow-hidden rounded-md border border-cream/20', className)}
      onSubmit={(event) => event.preventDefault()}
    >
      <input
        type="email"
        name="email"
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 font-body text-body-small text-cream placeholder:text-cream/50 focus:outline-none"
      />
      <button
        type="submit"
        className="bg-soft-gold px-4 py-3 font-body text-label text-heritage-green transition-colors hover:bg-canvas-tan"
      >
        {submitLabel}
      </button>
    </form>
  )
}
