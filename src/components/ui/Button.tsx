import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps {
  children: React.ReactNode
  variant?: ButtonVariant
  href?: string
  type?: 'button' | 'submit'
  className?: string
  onClick?: () => void
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
}: Pick<ButtonProps, 'children' | 'variant' | 'className'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center px-6 py-3 font-body text-label uppercase tracking-widest transition-colors',
        variantClasses[variant],
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
}: ButtonProps) {
  if (href) {
    const isExternal = href.startsWith('http')

    if (isExternal) {
      return (
        <a href={href} className={cn('inline-block', className)}>
          <ButtonInner variant={variant}>{children}</ButtonInner>
        </a>
      )
    }

    return (
      <Link to={href} onClick={onClick} className={cn('inline-block', className)}>
        <ButtonInner variant={variant}>{children}</ButtonInner>
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} className={cn('inline-block', className)}>
      <ButtonInner variant={variant}>{children}</ButtonInner>
    </button>
  )
}
