import { Outlet, ScrollRestoration } from 'react-router-dom'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { AppToaster } from '@/components/ui/AppToaster'
import { CartProvider } from '@/lib/cart'

export function Layout() {
  return (
    <CartProvider>
      <ScrollRestoration />
      <AppToaster />
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
