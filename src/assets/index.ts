import assetsManifest from './assets-manifest.json'

export const brandAssets = {
  logo: assetsManifest.brand.logo,
  logoMark: assetsManifest.brand.logo,
} as const

export const homeAssets = {
  hero: assetsManifest.home.hero,
  heroTexture: '/assets/home/hero-texture.svg',
  lifestyle: assetsManifest.home.lifestyle,
  crew: assetsManifest.home.crew,
  featuredProducts: [
    assetsManifest.products['the-birdie-machine'],
    assetsManifest.products['flagstick-fuel'],
    assetsManifest.products['retro-roller-yellow'],
    assetsManifest.products['the-corduroy'],
  ],
} as const

export const shopAssets = {
  headerBanner: assetsManifest.shop.banner,
  products: Object.values(assetsManifest.products),
} as const

export const productAssets = {
  galleryFallback: assetsManifest.products['retro-roller-grey'],
} as const

export function getProductImage(handle: string): string {
  return assetsManifest.products[handle as keyof typeof assetsManifest.products] ?? productAssets.galleryFallback
}
