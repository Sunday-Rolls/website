import { cn } from '@/lib/utils'

interface GalleryFigureProps {
  alt: string
  caption: string
  image: string
  aspectClassName?: string
  className?: string
}

export function GalleryFigure({
  alt,
  caption,
  image,
  aspectClassName = 'aspect-[5/3]',
  className,
}: GalleryFigureProps) {
  return (
    <figure className={cn('min-w-0 space-y-3', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-lg bg-warm-sand',
          aspectClassName,
        )}
      >
        <img
          src={image}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <figcaption className="font-body text-body-small text-matte-black/70">
        {caption}
      </figcaption>
    </figure>
  )
}
