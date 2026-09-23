import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}))

vi.mock('@shopify/storefront-api-client', () => ({
  createStorefrontApiClient: vi.fn(() => ({
    request: requestMock,
  })),
}))

describe('subscribeToNewsletter', () => {
  beforeEach(() => {
    vi.resetModules()
    requestMock.mockReset()
    vi.stubEnv('VITE_SHOPIFY_STORE_DOMAIN', 'sunday-rolls.myshopify.com')
    vi.stubEnv('VITE_SHOPIFY_STOREFRONT_TOKEN', 'test-token')
    vi.stubEnv('VITE_SHOPIFY_API_VERSION', '2025-01')
  })

  it('subscribes via customerEmailMarketingSubscribe', async () => {
    requestMock.mockResolvedValue({
      data: {
        customerEmailMarketingSubscribe: {
          customer: { id: 'gid://shopify/Customer/1' },
          customerUserErrors: [],
        },
      },
    })

    const { subscribeToNewsletter } = await import('@/lib/shopify')
    await expect(subscribeToNewsletter('  golfer@example.com  ')).resolves.toBeUndefined()

    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining('customerEmailMarketingSubscribe'),
      { variables: { email: 'golfer@example.com' } },
    )
  })

  it('surfaces Shopify customer user errors', async () => {
    requestMock.mockResolvedValue({
      data: {
        customerEmailMarketingSubscribe: {
          customer: null,
          customerUserErrors: [{ message: 'Email has already been taken', field: ['email'] }],
        },
      },
    })

    const { subscribeToNewsletter } = await import('@/lib/shopify')
    await expect(subscribeToNewsletter('golfer@example.com')).rejects.toThrow(
      'Email has already been taken',
    )
  })

  it('rejects empty email before calling Shopify', async () => {
    const { subscribeToNewsletter } = await import('@/lib/shopify')
    await expect(subscribeToNewsletter('   ')).rejects.toThrow('Enter an email address')
    expect(requestMock).not.toHaveBeenCalled()
  })
})
