import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { PageLoader } from '@/components/ui/PageLoader'
import { restoreSpaPathFromRedirect } from '@/lib/spa-path-restore'
import { routeModules } from '@/lib/preload-route'
import { NotFoundPage } from '@/pages/NotFoundPage'

restoreSpaPathFromRedirect()

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <NotFoundPage />,
      children: [
        {
          index: true,
          hydrateFallbackElement: <PageLoader label="Loading…" />,
          lazy: async () => ({ Component: (await routeModules.home()).HomePage }),
        },
        {
          path: 'shop',
          hydrateFallbackElement: <PageLoader label="Loading…" />,
          lazy: async () => ({ Component: (await routeModules.shop()).ShopPage }),
        },
        {
          path: 'products/:handle',
          hydrateFallbackElement: <PageLoader label="Loading product…" />,
          lazy: async () => ({ Component: (await routeModules.product()).ProductPage }),
        },
        {
          path: 'about',
          hydrateFallbackElement: <PageLoader label="Loading…" />,
          lazy: async () => ({ Component: (await routeModules.about()).AboutPage }),
        },
        {
          path: 'contact',
          hydrateFallbackElement: <PageLoader label="Loading…" />,
          lazy: async () => ({ Component: (await routeModules.contact()).ContactPage }),
        },
        {
          path: 'cart',
          hydrateFallbackElement: <PageLoader label="Loading…" />,
          lazy: async () => ({ Component: (await routeModules.cart()).CartPage }),
        },
        {
          path: 'order/thank-you',
          hydrateFallbackElement: <PageLoader label="Loading…" />,
          lazy: async () => ({ Component: (await routeModules.thankYou()).OrderThankYouPage }),
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  routerBasename ? { basename: routerBasename } : undefined,
)
