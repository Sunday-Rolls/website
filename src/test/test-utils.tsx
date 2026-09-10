import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter, Route, Routes, type MemoryRouterProps } from 'react-router-dom'
import { CartProvider } from '@/lib/cart'

interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  path?: string
  routerProps?: MemoryRouterProps
}

export function renderWithRouter(
  ui: React.ReactElement,
  { route = '/', path, routerProps, ...options }: RenderWithRouterOptions = {},
) {
  const routePath = path ?? (route.split('?')[0] || '/')

  return render(
    <MemoryRouter initialEntries={[route]} {...routerProps}>
      <CartProvider>
        <Routes>
          <Route path={routePath} element={ui} />
        </Routes>
      </CartProvider>
    </MemoryRouter>,
    options,
  )
}
