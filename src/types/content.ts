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
    newsletter: {
      placeholder: string
      submitLabel: string
    }
    columns: {
      shop: string
      company: string
      support: string
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

export interface HomeContent {
  meta: PageMeta
  hero: {
    headline: string
    subheadline: string
    cta: ContentLink
  }
  values: {
    items: Array<{ label: string }>
  }
  featured: {
    title: string
    subtitle: string
    cta: ContentLink
  }
}

export interface ShopContent {
  meta: PageMeta
  header: {
    title: string
    subtitle: string
  }
  filters: {
    label: string
    options: Array<{ label: string; value: string }>
  }
  emptyState: {
    title: string
    description: string
  }
}

export interface ProductContent {
  meta: PageMeta
  loading: string
  notFound: {
    title: string
    description: string
  }
  featuresHeading: string
  defaultFeatures: string[]
  story: {
    title: string
    description: string
  }
}

export interface AboutContent {
  meta: PageMeta
  hero: {
    title: string
    lines: string[]
  }
  tradition: {
    title: string
    lines: string[]
  }
  values: {
    items: Array<{ label: string }>
  }
}

export interface GalleryContent {
  meta: PageMeta
  header: {
    title: string
    subtitle: string
  }
  items: Array<{ caption: string; alt: string }>
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
