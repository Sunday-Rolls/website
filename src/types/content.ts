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
      facebook?: string
      instagram?: string
      etsy?: string
    }
    copyright: string
    credit?: string
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

export type ValueIcon = 'flag' | 'spool' | 'bag' | 'shield'

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
    posterWebp?: string
    posterWebpSrcSet?: string
  }
  values: {
    items: Array<{ label: string; icon?: ValueIcon }>
  }
  productBlocks: HomeProductBlock[]
  socials?: {
    eyebrow?: string
    title: string
  }
  mediaBreak?: {
    video: string
    poster?: string
    posterWebp?: string
    posterWebpSrcSet?: string
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
    submittingLabel: string
    successMessage: string
    errorMessage: string
    consent?: string
  }
}

export interface ShopSection {
  /** Matches `product.subcategory`, or `product.category` for towels. */
  id: string
  title: string
  subtitle?: string
  /** Short label overlaid on each product card in the section, e.g. "New!". */
  badge?: string
}

export interface ShopContent {
  meta: PageMeta
  header: {
    title: string
    subtitle: string
  }
  sections: ShopSection[]
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
  /** Shopify product handle when the review is tied to a specific product. */
  productHandle?: string
  /** Stable id for site-submitted reviews (and dedupe). */
  id?: string
  /** Where the review came from. */
  source?: 'etsy' | 'site'
  /** ISO timestamp for site-submitted reviews. */
  createdAt?: string
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
    /** Shown when this product has no reviews but sibling products do. */
    emptyWithSimilar: string
    leaveCta: string
    summary: {
      outOf: string
      countOne: string
      countMany: string
      histogramLabel: string
    }
    form: {
      title: string
      nameLabel: string
      namePlaceholder: string
      locationLabel: string
      locationPlaceholder: string
      ratingLabel: string
      reviewLabel: string
      reviewPlaceholder: string
      submitLabel: string
      cancelLabel: string
      success: string
      error: string
      submitError: string
    }
    similar?: {
      heading: string
      headcovers: string
      towels: string
    }
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
  values: {
    title?: string
    items: Array<{ label: string; description?: string }>
  }
  team?: {
    title: string
    subtitle?: string
    labels: {
      hometown: string
      handicap: string
      favoriteCourse: string
    }
    members: TeamMember[]
  }
}

export interface TeamMember {
  name: string
  role: string
  hometown: string
  handicap: string
  favoriteCourse: string
  image: string
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
    submittingLabel?: string
    successMessage?: string
    errorMessage?: string
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
    subtotalLabel: string
    discountLabel: string
    totalLabel: string
    checkoutLabelKey: string
  }
  freeShipping: {
    threshold: number
    progressLabel: string
    remainingLabel: string
    unlockedLabel: string
    barLabel: string
  }
  towelUpsell: {
    minTotal: number
    maxTotal: number
    preferredHandle: string
    eyebrow: string
    title: string
    description: string
    colorLabel: string
    ctaLabel: string
    addingLabel: string
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
  contact: ContactContent
  cart: CartContent
  'not-found': NotFoundContent
}

export type PageKey = keyof PageContentMap
