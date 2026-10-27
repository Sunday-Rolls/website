import { useLayoutEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { AnalyticsListener } from '@/components/AnalyticsListener'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { AppToaster } from '@/components/ui/AppToaster'
import { CartProvider } from '@/lib/cart'
import { isHomePath, removeStaticHeroLcp } from '@/lib/hero-lcp'

export function Layout() {
  const { pathname } = useLocation()

  // Static #hero-lcp lives outside #root for homepage LCP; remove it on SPA leave-home.
  useLayoutEffect(() => {
    if (isHomePath(pathname)) return
    removeStaticHeroLcp()
  }, [pathname])

  return (
    <CartProvider>
      <ScrollRestoration />
      <AppToaster />
      <AnalyticsListener />
      <div className="flex min-h-screen flex-col bg-cream text-matte-black">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </CartProvider>
  )
}
