import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  addCartLines,
  createCart,
  fetchCart,
  isShopifyConfigured,
  removeCartLines,
  updateCartLines,
  type ShopifyCart,
} from '@/lib/shopify'

const CART_STORAGE_KEY = 'sunday-rolls-cart-id'

interface CartContextValue {
  cart: ShopifyCart | null
  isLoading: boolean
  isUpdating: boolean
  error: string | null
  itemCount: number
  addItem: (variantId: string, quantity?: number) => Promise<ShopifyCart>
  updateItemQuantity: (lineId: string, quantity: number) => Promise<void>
  removeItem: (lineId: string) => Promise<void>
  clearError: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function readStoredCartId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredCartId(cartId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (cartId) window.localStorage.setItem(CART_STORAGE_KEY, cartId)
    else window.localStorage.removeItem(CART_STORAGE_KEY)
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<ShopifyCart | null>(null)
  const [isLoading, setIsLoading] = useState(isShopifyConfigured)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isShopifyConfigured) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function hydrate() {
      const cartId = readStoredCartId()
      if (!cartId) {
        if (!cancelled) setIsLoading(false)
        return
      }

      try {
        const existing = await fetchCart(cartId)
        if (cancelled) return
        if (existing) {
          setCart(existing)
        } else {
          writeStoredCartId(null)
        }
      } catch (err) {
        console.error(err)
        writeStoredCartId(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  const persistCart = useCallback((next: ShopifyCart) => {
    setCart(next)
    writeStoredCartId(next.id)
    return next
  }, [])

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      if (!isShopifyConfigured) {
        throw new Error('Shopify is not configured')
      }

      setIsUpdating(true)
      setError(null)

      try {
        const line = { merchandiseId: variantId, quantity }
        const next = cart
          ? await addCartLines(cart.id, [line])
          : await createCart([line])
        return persistCart(next)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to add to cart'
        setError(message)
        throw err
      } finally {
        setIsUpdating(false)
      }
    },
    [cart, persistCart],
  )

  const updateItemQuantity = useCallback(
    async (lineId: string, quantity: number) => {
      if (!cart) return

      setIsUpdating(true)
      setError(null)

      try {
        if (quantity <= 0) {
          persistCart(await removeCartLines(cart.id, [lineId]))
          return
        }

        persistCart(await updateCartLines(cart.id, [{ id: lineId, quantity }]))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update cart'
        setError(message)
        throw err
      } finally {
        setIsUpdating(false)
      }
    },
    [cart, persistCart],
  )

  const removeItem = useCallback(
    async (lineId: string) => {
      if (!cart) return

      setIsUpdating(true)
      setError(null)

      try {
        persistCart(await removeCartLines(cart.id, [lineId]))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to remove from cart'
        setError(message)
        throw err
      } finally {
        setIsUpdating(false)
      }
    },
    [cart, persistCart],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isLoading,
      isUpdating,
      error,
      itemCount: cart?.totalQuantity ?? 0,
      addItem,
      updateItemQuantity,
      removeItem,
      clearError: () => setError(null),
    }),
    [addItem, cart, error, isLoading, isUpdating, removeItem, updateItemQuantity],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider')
  }
  return context
}
