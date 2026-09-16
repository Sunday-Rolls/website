import { assetUrl } from '@/lib/asset-url'
import { homeAssets } from '@/assets'
import { usePageContent } from '@/lib/content'

export function MediaBreak() {
  const { mediaBreak } = usePageContent('home')

  if (!mediaBreak) return null

  const videoSrc = assetUrl(mediaBreak.video)
  const posterSrc = mediaBreak.poster ? assetUrl(mediaBreak.poster) : homeAssets.lifestyle

  return (
    <section className="home-snap-section relative overflow-hidden bg-matte-black">
      <div className="relative min-h-[min(52vh,420px)]">
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          autoPlay
          muted
          loop
          playsInline
          poster={posterSrc}
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-heritage-green/80 via-heritage-green/25 to-transparent" />
        {mediaBreak.caption ? (
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-container px-container-x py-10">
            <p className="max-w-lg font-display text-2xl text-white md:text-3xl">
              {mediaBreak.caption}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
