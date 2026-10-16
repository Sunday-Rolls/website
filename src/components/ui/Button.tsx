import { Link } from 'react-router-dom'
import { prefetchHandlers } from '@/lib/preload-route'
import { sitePath } from '@/lib/site-path'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps {
  children: React.ReactNode
  variant?: ButtonVariant
  href?: string
  type?: 'button' | 'submit'
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-heritage-green text-white hover:bg-forest-green border border-heritage-green',
  secondary:
    'bg-transparent text-heritage-green hover:bg-sand/40 border border-heritage-green',
  ghost: 'bg-transparent text-heritage-green hover:text-forest-green border-none',
}

function ButtonInner({
  children,
  variant = 'primary',
  className,
  disabled,
}: Pick<ButtonProps, 'children' | 'variant' | 'className' | 'disabled'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center px-6 py-3 font-body text-label uppercase tracking-widest transition-colors',
        variantClasses[variant],
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Button({
  children,
  variant = 'primary',
  href,
  type = 'button',
  className,
  onClick,
  disabled = false,
}: ButtonProps) {
  if (href && !disabled) {
    const isExternal = href.startsWith('http')

    if (isExternal) {
      return (
        <a href={href} onClick={onClick} className={cn('inline-block', className)}>
          <ButtonInner variant={variant}>{children}</ButtonInner>
        </a>
      )
    }

    const to = sitePath(href)

    return (
      <Link
        to={to}
        onClick={onClick}
        className={cn('inline-block', className)}
        {...prefetchHandlers(to)}
      >
        <ButtonInner variant={variant}>{children}</ButtonInner>
      </Link>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn('inline-block', className)}
    >
      <ButtonInner variant={variant} disabled={disabled}>
        {children}
      </ButtonInner>
    </button>
  )
}
