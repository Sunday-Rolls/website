import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  className?: string
}

export function PageHeader({ title, subtitle, className }: PageHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      <h1 className="font-display text-page-title text-heritage-green">{title}</h1>
      {subtitle ? (
        <p className="max-w-2xl font-body text-body text-matte-black/80">{subtitle}</p>
      ) : null}
    </header>
  )
}
