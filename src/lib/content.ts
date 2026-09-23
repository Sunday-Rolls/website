import siteContent from '@/content/site.json'
import homeContent from '@/content/pages/home.json'
import shopContent from '@/content/pages/shop.json'
import productContent from '@/content/pages/product.json'
import aboutContent from '@/content/pages/about.json'
import galleryContent from '@/content/pages/gallery.json'
import contactContent from '@/content/pages/contact.json'
import cartContent from '@/content/pages/cart.json'
import notFoundContent from '@/content/pages/not-found.json'
import reviewsData from '@/data/reviews.json'
import theme from '@/theme/theme.json'
import { withInferredProductHandle } from '@/lib/reviews'
import type {
  PageContentMap,
  PageKey,
  ProductReview,
  SiteContent,
} from '@/types/content'
import type { Theme } from '@/types/theme'

const reviewItems = ((reviewsData.items ?? []) as ProductReview[]).map(
  withInferredProductHandle,
)

const pageContent: PageContentMap = {
  home: {
    ...homeContent,
    reviews: {
      ...homeContent.reviews,
      items: reviewItems,
    },
  },
  shop: shopContent,
  product: {
    ...productContent,
    reviews: productContent.reviews
      ? {
          ...productContent.reviews,
          items: reviewItems,
        }
      : undefined,
  },
  about: aboutContent,
  gallery: galleryContent,
  contact: contactContent,
  cart: cartContent,
  'not-found': notFoundContent,
}

export function getSiteContent(): SiteContent {
  return siteContent as SiteContent
}

export function getPageContent<K extends PageKey>(page: K): PageContentMap[K] {
  return pageContent[page]
}

export function getTheme(): Theme {
  return theme as Theme
}

export function getReviewItems(): ProductReview[] {
  return reviewItems
}

export function getButtonLabel(key: string): string {
  const { buttons } = getSiteContent()
  return buttons[key] ?? key
}

export function resolveLinkLabel(link: {
  label?: string
  labelKey?: string
}): string {
  if (link.label) return link.label
  if (link.labelKey) return getButtonLabel(link.labelKey)
  return ''
}

export function formatCopyright(template: string): string {
  return template.replace('{year}', String(new Date().getFullYear()))
}

export function useSiteContent(): SiteContent {
  return getSiteContent()
}

export function usePageContent<K extends PageKey>(page: K): PageContentMap[K] {
  return getPageContent(page)
}

export function useTheme(): Theme {
  return getTheme()
}
