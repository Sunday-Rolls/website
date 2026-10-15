import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { restoreSpaPathFromRedirect } from '@/lib/spa-path-restore'
import { AboutPage } from '@/pages/AboutPage'
import { CartPage } from '@/pages/CartPage'
import { ContactPage } from '@/pages/ContactPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OrderThankYouPage } from '@/pages/OrderThankYouPage'
import { ProductPage } from '@/pages/ProductPage'
import { ShopPage } from '@/pages/ShopPage'

restoreSpaPathFromRedirect()

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <NotFoundPage />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'shop', element: <ShopPage /> },
        { path: 'products/:handle', element: <ProductPage /> },
        { path: 'about', element: <AboutPage /> },
        { path: 'contact', element: <ContactPage /> },
        { path: 'cart', element: <CartPage /> },
        { path: 'order/thank-you', element: <OrderThankYouPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  routerBasename ? { basename: routerBasename } : undefined,
)
