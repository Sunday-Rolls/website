import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'

interface EmailInputProps {
  placeholder: string
  submitLabel: string
  submittingLabel?: string
  className?: string
  disabled?: boolean
  onSubmitEmail: (email: string) => void | Promise<void>
}

export function EmailInput({
  placeholder,
  submitLabel,
  submittingLabel = 'Subscribing…',
  className,
  disabled = false,
  onSubmitEmail,
}: EmailInputProps) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || disabled) return

    setSubmitting(true)
    try {
      await onSubmitEmail(email)
      setEmail('')
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = disabled || submitting

  return (
    <form
      className={cn('flex max-w-md overflow-hidden rounded-md border border-cream/20', className)}
      onSubmit={handleSubmit}
    >
      <input
        type="email"
        name="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        required
        autoComplete="email"
        disabled={isDisabled}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 font-body text-body-small text-cream placeholder:text-cream/50 focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isDisabled}
        className="bg-soft-gold px-4 py-3 font-body text-label text-heritage-green transition-colors hover:bg-canvas-tan disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  )
}
