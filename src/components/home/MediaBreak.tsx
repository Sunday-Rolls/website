import { assetUrl } from '@/lib/asset-url'
import { homeAssets } from '@/assets'
import { usePageContent } from '@/lib/content'

export function MediaBreak() {
  const { mediaBreak } = usePageContent('home')

  if (!mediaBreak) return null

  const videoSrc = assetUrl(mediaBreak.video)
  const posterSrc = mediaBreak.poster ? assetUrl(mediaBreak.poster) : homeAssets.lifestyle

  return (
    <section className="relative overflow-hidden bg-matte-black">
      {/* Taller band so 1080p isn’t crushed into a short strip on wide screens */}
      <div className="relative min-h-[min(58vh,520px)] md:min-h-[min(62vh,560px)]">
        <video
          className="absolute inset-0 h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={posterSrc}
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        {/* Keep text readable without washing the video soft */}
        <div className="absolute inset-0 bg-gradient-to-t from-matte-black/70 via-matte-black/15 to-matte-black/10" />
        {mediaBreak.caption ? (
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-container px-container-x py-10 md:py-12">
            <p className="max-w-lg font-display text-2xl text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.45)] md:text-3xl">
              {mediaBreak.caption}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
