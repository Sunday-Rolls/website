export interface NavLink {
  label: string
  href: string
}

export interface SiteContent {
  brand: {
    name: string
    shortName: string
    tagline: string
    description: string
  }
  navigation: {
    primary: NavLink[]
    footerShop: NavLink[]
    footerCompany: NavLink[]
    footerSupport: NavLink[]
  }
  footer: {
    columns: {
      shop: string
      company: string
      support: string
    }
    contact?: {
      email: string
      phone: string
    }
    social?: {
      instagram?: string
    }
    copyright: string
  }
  buttons: Record<string, string>
}

export interface PageMeta {
  title: string
  description: string
}

export interface ContentLink {
  labelKey?: string
  label?: string
  href: string
}

export interface HomeProductBlock {
  id: string
  title: string
  subtitle?: string
  filter: string
  shopAll: ContentLink
}

export interface HomeContent {
  meta: PageMeta
  hero: {
    headline: string
    subheadline: string
    cta: ContentLink
    video?: string
    poster?: string
  }
  values: {
    items: Array<{ label: string }>
  }
  productBlocks: HomeProductBlock[]
  mediaBreak?: {
    video: string
    poster?: string
    caption?: string
  }
  reviews: {
    title: string
    items: ProductReview[]
  }
  story: {
    eyebrow?: string
    title: string
    lines: string[]
    cta: ContentLink
  }
  newsletter: {
    eyebrow?: string
    title: string
    description: string
    placeholder: string
    submitLabel: string
  }
}

export interface ShopFilterOption {
  label: string
  value: string
  /** Set true to hide from the shop UI without deleting the option (e.g. Bags). */
  hidden?: boolean
  children?: Array<{ label: string; value: string; hidden?: boolean }>
}

export interface ShopContent {
  meta: PageMeta
  header: {
    title: string
    subtitle: string
  }
  filters: {
    label: string
    subFilterLabel?: string
    options: ShopFilterOption[]
  }
  emptyState: {
    title: string
    description: string
  }
  _docs?: Record<string, string>
}

export interface ProductReview {
  author: string
  location?: string
  rating: number
  /** Empty string for star-only Etsy ratings with no written review. */
  text: string
  /** Listing title from Etsy when present (especially useful for star-only reviews). */
  listing?: string
}

export interface ProductContent {
  meta: PageMeta
  loading: string
  notFound: {
    title: string
    description: string
  }
  featuresHeading: string
  dimensionsHeading?: string
  defaultFeatures: string[]
  story: {
    title: string
    description: string
  }
  reviews?: {
    heading: string
    empty: string
    items: ProductReview[]
  }
}

export interface AboutContent {
  meta: PageMeta
  hero: {
    title: string
    eyebrow?: string
    lines: string[]
  }
  tradition: {
    title: string
    lines: string[]
  }
  values: {
    title?: string
    items: Array<{ label: string; description?: string }>
  }
  team?: {
    title: string
    subtitle?: string
    members: Array<{ name: string; role: string; bio: string }>
  }
}

export interface GalleryContent {
  meta: PageMeta
  header: {
    title: string
    subtitle: string
  }
  featured: {
    caption: string
    alt: string
    image: string
  }
  items: Array<{ caption: string; alt: string; image: string }>
}

export interface ContactContent {
  meta: PageMeta
  header: {
    title: string
    subtitle: string
  }
  form: {
    name: { label: string; placeholder: string }
    email: { label: string; placeholder: string }
    subject: { label: string; placeholder: string }
    message: { label: string; placeholder: string }
    submitLabelKey: string
  }
  sidebar: {
    title: string
    email: { label: string; value: string }
    phone: { label: string; value: string }
  }
  returnPolicy?: {
    id: string
    title: string
    shipToLabel: string
    address: string
    body: string[]
  }
}

export interface CartContent {
  meta: PageMeta
  header: {
    title: string
    continueShoppingKey: string
    continueShoppingHref: string
  }
  summary: {
    totalLabel: string
    checkoutLabelKey: string
  }
  lineActions: {
    quantityLabel: string
    removeLabel: string
    decreaseLabel: string
    increaseLabel: string
  }
  status: {
    loading: string
    updating: string
    unavailable: string
  }
  emptyState: {
    title: string
    description: string
    cta: ContentLink
  }
}

export interface NotFoundContent {
  meta: PageMeta
  title: string
  code: string
  description: string
  cta: ContentLink
}

export type PageContentMap = {
  home: HomeContent
  shop: ShopContent
  product: ProductContent
  about: AboutContent
  gallery: GalleryContent
  contact: ContactContent
  cart: CartContent
  'not-found': NotFoundContent
}

export type PageKey = keyof PageContentMap
