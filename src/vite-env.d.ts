/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOPIFY_STORE_DOMAIN?: string
  readonly VITE_SHOPIFY_STOREFRONT_TOKEN?: string
  readonly VITE_SHOPIFY_API_VERSION?: string
  /** Branded checkout / primary domain, e.g. shop.sundayrollsgolf.com */
  readonly VITE_SHOPIFY_CHECKOUT_DOMAIN?: string
  /** gid://shopify/Shop/<id> for Shopify analytics */
  readonly VITE_SHOPIFY_SHOP_ID?: string
  /** Headless channel storefront ID for Shopify analytics (defaults to '0') */
  readonly VITE_SHOPIFY_STOREFRONT_ID?: string
  readonly VITE_GTM_ID?: string
  readonly VITE_META_PIXEL_ID?: string
  readonly VITE_CONTACT_API_URL?: string
  readonly VITE_CONTACT_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
