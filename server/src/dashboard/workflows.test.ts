import { describe, expect, it, vi } from 'vitest'
import type { ShopifyCredentials } from '../analytics/shopify.js'
import { createMemoryContactStore } from '../contact-store.js'
import { createMemoryReviewStore } from '../reviews.js'
import { runWorkflow, shopifyScopeIncludes } from './workflows.js'

const creds: ShopifyCredentials = {
  shop: 'chrgrk-ff.myshopify.com',
  clientId: 'client',
  clientSecret: 'secret',
  apiVersion: '2025-01',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function shopifyFetch(scope = 'write_orders,write_customers') {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? (JSON.parse(String(init.body)) as { query?: string }) : {}
    const query = body.query ?? ''
    if (url.includes('/admin/oauth/access_token')) {
      return json({ access_token: 'token', scope, expires_in: 3600 })
    }
    if (query.includes('orderCreate')) {
      return json({
        data: {
          orderCreate: {
            order: { id: 'gid://shopify/Order/1', name: '#D1001' },
            userErrors: [],
          },
        },
      })
    }
    if (query.includes('ReadOrder')) {
      return json({ data: { order: { id: 'gid://shopify/Order/1', name: '#D1001' } } })
    }
    if (query.includes('orderDelete')) {
      return json({ data: { orderDelete: { deletedId: 'gid://shopify/Order/1', userErrors: [] } } })
    }
    if (query.includes('orderCancel')) {
      return json({ data: { orderCancel: { job: { id: 'gid://shopify/Job/1' }, orderCancelUserErrors: [], userErrors: [] } } })
    }
    if (query.includes('FindCustomer')) {
      return json({ data: { customers: { nodes: [] } } })
    }
    if (query.includes('customerEmailMarketingSubscribe')) {
      return json({
        data: {
          customerEmailMarketingSubscribe: {
            customer: { id: 'gid://shopify/Customer/9' },
            customerUserErrors: [],
          },
        },
      })
    }
    if (query.includes('CustomerMarketing')) {
      return json({
        data: {
          customer: {
            id: 'gid://shopify/Customer/9',
            emailMarketingConsent: { marketingState: 'SUBSCRIBED' },
          },
        },
      })
    }
    if (query.includes('CustomerDelete')) {
      return json({
        data: { customerDelete: { deletedCustomerId: 'gid://shopify/Customer/9', userErrors: [] } },
      })
    }
    throw new Error(`Unexpected fetch ${url} ${query.slice(0, 40)}`)
  })
}

describe('shopifyScopeIncludes', () => {
  it('matches a comma-separated scope list', () => {
    expect(shopifyScopeIncludes('read_orders,write_orders', 'write_orders')).toBe(true)
    expect(shopifyScopeIncludes('read_orders', 'write_orders')).toBe(false)
  })
})

describe('review workflow', () => {
  it('posts a review, finds it, and deletes it', async () => {
    const reviews = createMemoryReviewStore()
    const result = await runWorkflow('reviews', { reviews, now: () => 1 })
    expect(result.ok).toBe(true)
    expect(result.steps.map((step) => step.name)).toEqual(['Post review', 'Show on site', 'Delete review'])
    expect(await reviews.listByHandle('retro-roller-grey', 10)).toEqual([])
  })

  it('fails when the review store is missing', async () => {
    const result = await runWorkflow('reviews', {})
    expect(result.ok).toBe(false)
    expect(result.steps[0].detail).toMatch(/not configured/)
  })
})

describe('contact workflow', () => {
  it('sends mail, stores the row, and deletes it', async () => {
    const contacts = createMemoryContactStore()
    const sendContactEmail = vi.fn(async () => {})
    const result = await runWorkflow('contact', {
      contacts,
      sendContactEmail,
      resendApiKey: 're_test',
      contactToEmail: 'sundayrollsdevops@gmail.com',
      now: () => 2,
    })
    expect(result.ok).toBe(true)
    expect(sendContactEmail).toHaveBeenCalledOnce()
    const payload = sendContactEmail.mock.calls[0][0]
    expect(payload.subject).toContain('[Dashboard test]')
    expect(result.steps[0].detail).toContain('sundayrollsdevops@gmail.com')
    expect(result.steps[0].detail).toContain('stays in that inbox')
    const savedId = result.steps[1].detail
    expect(await contacts.deleteById(savedId)).toBe(false)
  })

  it('does not send when Resend is not configured', async () => {
    const sendContactEmail = vi.fn(async () => {})
    const result = await runWorkflow('contact', {
      contacts: createMemoryContactStore(),
      sendContactEmail,
    })
    expect(result.ok).toBe(false)
    expect(result.steps[0].detail).toMatch(/RESEND_API_KEY/)
    expect(sendContactEmail).not.toHaveBeenCalled()
  })
})

describe('mailing list workflow', () => {
  it('subscribes a new address and deletes that customer', async () => {
    const fetchImpl = shopifyFetch()
    const result = await runWorkflow('mailing-list', {
      shopify: creds,
      storefrontToken: 'storefront',
      fetch: fetchImpl,
      now: () => 3,
    })
    expect(result.ok).toBe(true)
    expect(result.steps.map((step) => step.ok)).toEqual([true, true, true])
    const bodies = fetchImpl.mock.calls.map((call) => String(call[1]?.body ?? ''))
    expect(bodies.some((body) => body.includes('customerEmailMarketingSubscribe'))).toBe(true)
    expect(bodies.some((body) => body.includes('CustomerDelete'))).toBe(true)
    expect(bodies.some((body) => body.includes('dashboard-test+list-3@sundayrollsgolf.com'))).toBe(true)
  })

  it('does not delete an address that already exists', async () => {
    const fetchImpl = shopifyFetch()
    fetchImpl.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as { query?: string }) : {}
      if (url.includes('/admin/oauth/access_token')) {
        return json({ access_token: 'token', scope: 'write_customers', expires_in: 60 })
      }
      if (body.query?.includes('FindCustomer')) {
        return json({ data: { customers: { nodes: [{ id: 'gid://shopify/Customer/4' }] } } })
      }
      throw new Error(`Unexpected ${body.query}`)
    })
    const result = await runWorkflow('mailing-list', {
      shopify: creds,
      storefrontToken: 'storefront',
      fetch: fetchImpl,
      now: () => 4,
    })
    expect(result.ok).toBe(false)
    expect(result.steps[0].detail).toMatch(/not changed or deleted/)
    expect(fetchImpl.mock.calls.some((call) => String(call[1]?.body ?? '').includes('CustomerDelete'))).toBe(false)
    expect(fetchImpl.mock.calls.some((call) => String(call[1]?.body ?? '').includes('customerEmailMarketingSubscribe'))).toBe(false)
  })

  it('fails before creating a customer when write_customers is missing', async () => {
    const fetchImpl = shopifyFetch('read_customers')
    const result = await runWorkflow('mailing-list', {
      shopify: creds,
      storefrontToken: 'storefront',
      fetch: fetchImpl,
    })
    expect(result.ok).toBe(false)
    expect(result.steps[0].detail).toMatch(/write_customers/)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

describe('order workflow', () => {
  it('creates a test order, reads it, and deletes it', async () => {
    const fetchImpl = shopifyFetch()
    const result = await runWorkflow('orders', { shopify: creds, fetch: fetchImpl, now: () => 5 })
    expect(result.ok).toBe(true)
    expect(result.steps.map((step) => step.name)).toEqual(['Create order', 'Read order', 'Delete order'])
    const createBody = String(fetchImpl.mock.calls.find((call) => String(call[1]?.body ?? '').includes('orderCreate'))?.[1]?.body)
    expect(createBody).toContain('Dashboard smoke test')
    expect(createBody).toContain('analytics-test')
    expect(createBody).toContain('"amount":"0.00"')
    expect(createBody).toContain('BYPASS')
  })

  it('cancels the order when delete is rejected', async () => {
    const fetchImpl = shopifyFetch()
    fetchImpl.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const query = init?.body ? ((JSON.parse(String(init.body)) as { query?: string }).query ?? '') : ''
      if (url.includes('/admin/oauth/access_token')) {
        return json({ access_token: 'token', scope: 'write_orders', expires_in: 60 })
      }
      if (query.includes('orderCreate')) {
        return json({
          data: { orderCreate: { order: { id: 'gid://shopify/Order/2', name: '#D2' }, userErrors: [] } },
        })
      }
      if (query.includes('ReadOrder')) {
        return json({ data: { order: { id: 'gid://shopify/Order/2', name: '#D2' } } })
      }
      if (query.includes('orderDelete')) {
        return json({ data: { orderDelete: { deletedId: null, userErrors: [{ message: 'Cannot delete' }] } } })
      }
      if (query.includes('orderCancel')) {
        return json({ data: { orderCancel: { job: { id: 'job' }, orderCancelUserErrors: [], userErrors: [] } } })
      }
      throw new Error(query.slice(0, 40))
    })
    const result = await runWorkflow('orders', { shopify: creds, fetch: fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.steps.at(-1)?.detail).toContain('#D2')
    expect(result.steps.at(-1)?.detail).toContain('Cancelled')
  })

  it('does not create an order when write_orders is missing', async () => {
    const fetchImpl = shopifyFetch('read_orders')
    const result = await runWorkflow('orders', { shopify: creds, fetch: fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.steps[0].detail).toMatch(/write_orders/)
    expect(fetchImpl.mock.calls.some((call) => String(call[1]?.body ?? '').includes('orderCreate'))).toBe(false)
  })
})
