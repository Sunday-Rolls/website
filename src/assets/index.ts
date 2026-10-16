import assetsManifest from './assets-manifest.json'
import { assetSrcSet, assetUrl } from '@/lib/asset-url'

export const brandAssets = {
  logo: assetUrl(assetsManifest.brand.logo),
  logoMark: assetUrl(assetsManifest.brand.logo),
} as const

export const homeAssets = {
  hero: assetUrl(assetsManifest.home.hero),
  heroWebp: assetUrl(assetsManifest.home.heroWebp),
  heroPosterWebp: assetUrl(assetsManifest.home.heroPosterWebp),
  heroPosterSrcSet: assetSrcSet(assetsManifest.home.heroPosterSrcSet),
  coursePosterSrcSet: assetSrcSet(assetsManifest.home.coursePosterSrcSet),
  crewWebp: assetUrl(assetsManifest.home.crewWebp),
  heroTexture: assetUrl('/assets/home/hero-texture.svg'),
  lifestyle: assetUrl(assetsManifest.home.lifestyle),
  crew: assetUrl(assetsManifest.home.crew),
  heroVideo: assetUrl(assetsManifest.home.heroVideo),
  swingVideo: assetUrl(assetsManifest.home.swingVideo),
  featuredProducts: [
    assetUrl(assetsManifest.products['the-birdie-machine']),
    assetUrl(assetsManifest.products['flagstick-fuel']),
    assetUrl(assetsManifest.products['retro-roller-yellow']),
    assetUrl(assetsManifest.products['the-corduroy']),
  ],
} as const

export const shopAssets = {
  headerBanner: assetUrl(assetsManifest.shop.banner),
  headerBannerWebp: assetUrl(assetsManifest.shop.bannerWebp),
  headerBannerSrcSet: assetSrcSet(assetsManifest.shop.bannerSrcSet),
  products: Object.values(assetsManifest.products).map(assetUrl),
} as const

export const productAssets = {
  galleryFallback: assetUrl(assetsManifest.products['retro-roller-grey']),
} as const

export function getProductImage(handle: string): string {
  const path =
    assetsManifest.products[handle as keyof typeof assetsManifest.products] ??
    assetsManifest.products['retro-roller-grey']

  return assetUrl(path)
}
