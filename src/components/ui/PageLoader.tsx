import { brandAssets } from '@/assets'

interface PageLoaderProps {
  label: string
}

export function PageLoader({ label }: PageLoaderProps) {
  return (
    <div
      className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center gap-5 py-section-y"
      role="status"
      aria-live="polite"
    >
      <div className="page-loader-stage" aria-hidden="true">
        <span className="page-loader-glow" />
        <img
          src={brandAssets.logoMark}
          alt=""
          width={48}
          height={72}
          className="page-loader-mark relative h-16 w-auto"
        />
      </div>
      <p className="font-body text-label uppercase tracking-widest text-heritage-green/70">
        {label}
      </p>
    </div>
  )
}
