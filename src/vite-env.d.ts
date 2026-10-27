/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOPIFY_STORE_DOMAIN?: string
  readonly VITE_SHOPIFY_STOREFRONT_TOKEN?: string
  readonly VITE_SHOPIFY_API_VERSION?: string
  readonly VITE_GTM_ID?: string
  readonly VITE_CONTACT_API_URL?: string
  readonly VITE_CONTACT_API_KEY?: string
  readonly VITE_SITE_ORIGIN?: string
  /** Set to "false" on GitHub Pages / previews so client meta stays noindex. */
  readonly VITE_SEO_INDEX?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
