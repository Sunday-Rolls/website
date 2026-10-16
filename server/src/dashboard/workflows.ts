import { createShopifyAccessToken, type ShopifyCredentials } from '../analytics/shopify.js'
import type { ContactStore } from '../contact-store.js'
import type { ContactPayload } from '../mail.js'
import { REVIEW_LIMITS, type ReviewStore } from '../reviews.js'

export const WORKFLOW_NAMES = ['reviews', 'contact', 'mailing-list', 'orders'] as const
export type WorkflowName = (typeof WORKFLOW_NAMES)[number]

export type WorkflowStep = {
  name: string
  ok: boolean
  detail: string
}

export type WorkflowResult = {
  ok: boolean
  steps: WorkflowStep[]
}

export type WorkflowDeps = {
  reviews?: ReviewStore
  contacts?: ContactStore
  sendContactEmail?: (payload: ContactPayload) => Promise<void>
  resendApiKey?: string
  contactToEmail?: string
  shopify?: ShopifyCredentials | null
  storefrontToken?: string
  fetch?: typeof fetch
  now?: () => number
  productHandle?: string
}

const REVIEW_AUTHOR = 'Dashboard test'
const REVIEW_HANDLE = 'retro-roller-grey'
const TEST_EMAIL_DOMAIN = 'sundayrollsgolf.com'

export function isWorkflowName(value: string): value is WorkflowName {
  return (WORKFLOW_NAMES as readonly string[]).includes(value)
}

export function shopifyScopeIncludes(scope: string, required: string): boolean {
  return scope
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .includes(required)
}

export async function runWorkflow(name: WorkflowName, deps: WorkflowDeps): Promise<WorkflowResult> {
  if (name === 'reviews') return runReviews(deps)
  if (name === 'contact') return runContact(deps)
  if (name === 'mailing-list') return runMailingList(deps)
  return runOrders(deps)
}

function finish(steps: WorkflowStep[]): WorkflowResult {
  return { ok: steps.length > 0 && steps.every((step) => step.ok), steps }
}

function step(name: string, ok: boolean, detail: string): WorkflowStep {
  return { name, ok, detail }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed'
}

async function runReviews(deps: WorkflowDeps): Promise<WorkflowResult> {
  const reviews = deps.reviews
  if (!reviews) return finish([step('Review store', false, 'Review store is not configured')])

  const handle = deps.productHandle || REVIEW_HANDLE
  const token = `dashboard-smoke-${deps.now?.() ?? Date.now()}`
  const steps: WorkflowStep[] = []
  let id: string | null = null

  try {
    const saved = await reviews.create({
      productHandle: handle,
      author: REVIEW_AUTHOR,
      rating: 5,
      text: `Dashboard smoke test ${token}`,
      location: null,
    })
    id = saved.id
    steps.push(step('Post review', true, `${saved.id} on ${handle}`))

    const listed = await reviews.listByHandle(handle, REVIEW_LIMITS.list)
    const visible = listed.some((review) => review.id === saved.id)
    steps.push(
      step(
        'Show on site',
        visible,
        visible
          ? `GET /reviews?handle=${handle} includes ${saved.id}`
          : `Review ${saved.id} was not in the product list`,
      ),
    )
  } catch (error) {
    steps.push(step(id ? 'Show on site' : 'Post review', false, errorDetail(error)))
  } finally {
    if (id) {
      try {
        const deleted = await reviews.deleteById(id)
        const stillThere = (await reviews.listByHandle(handle, REVIEW_LIMITS.list)).some(
          (review) => review.id === id,
        )
        const gone = deleted && !stillThere
        steps.push(
          step(
            'Delete review',
            gone,
            gone ? `Removed ${id}` : `Review ${id} is still stored`,
          ),
        )
      } catch (error) {
        steps.push(step('Delete review', false, errorDetail(error)))
      }
    }
  }

  return finish(steps)
}

async function runContact(deps: WorkflowDeps): Promise<WorkflowResult> {
  if (!deps.resendApiKey?.trim()) {
    return finish([step('Send email', false, 'RESEND_API_KEY is not configured')])
  }
  if (!deps.contacts || !deps.sendContactEmail) {
    return finish([step('Send email', false, 'Contact store is not configured')])
  }

  const inbox = deps.contactToEmail?.trim() || 'the contact inbox'
  const token = `dashboard-smoke-${deps.now?.() ?? Date.now()}`
  const payload: ContactPayload = {
    name: 'Dashboard test',
    email: `dashboard-test+contact-${deps.now?.() ?? Date.now()}@${TEST_EMAIL_DOMAIN}`,
    subject: `[Dashboard test] ${token}`,
    message: `Dashboard smoke test ${token}. This message was sent to confirm contact email delivery.`,
  }
  const steps: WorkflowStep[] = []
  let id: string | null = null

  try {
    await deps.sendContactEmail(payload)
    steps.push(
      step(
        'Send email',
        true,
        `Resend accepted “[Sunday Rolls Contact] ${payload.subject}” for ${inbox}. The message stays in that inbox.`,
      ),
    )
    const saved = await deps.contacts.create(payload, true)
    id = saved.id
    steps.push(step('Save message', true, saved.id))
  } catch (error) {
    steps.push(step(id ? 'Save message' : 'Send email', false, errorDetail(error)))
  } finally {
    if (id) {
      try {
        const deleted = await deps.contacts.deleteById(id)
        steps.push(step('Delete message', deleted, deleted ? `Removed ${id}` : `Message ${id} is still stored`))
      } catch (error) {
        steps.push(step('Delete message', false, errorDetail(error)))
      }
    }
  }

  return finish(steps)
}

type AdminContext = {
  creds: ShopifyCredentials
  accessToken: string
  fetchImpl: typeof fetch
}

async function adminContext(
  deps: WorkflowDeps,
  requiredScope: string,
): Promise<{ ctx: AdminContext } | { error: string }> {
  const creds = deps.shopify
  if (!creds) {
    return { error: 'Shopify not configured (need SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)' }
  }
  const fetchImpl = deps.fetch ?? fetch
  try {
    const token = await createShopifyAccessToken(creds, fetchImpl)
    if (!shopifyScopeIncludes(token.scope, requiredScope)) {
      return { error: `Shopify token is missing the ${requiredScope} scope` }
    }
    return { ctx: { creds, accessToken: token.accessToken, fetchImpl } }
  } catch (error) {
    return { error: errorDetail(error) }
  }
}

async function adminGraphql<T>(ctx: AdminContext, query: string, variables: Record<string, unknown>): Promise<T> {
  const host = shopHost(ctx.creds.shop)
  const version = ctx.creds.apiVersion || '2025-01'
  const res = await ctx.fetchImpl(`https://${host}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ctx.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = (await res.json()) as { errors?: Array<{ message?: string }>; data?: T }
  if (!res.ok || json.errors?.length || !json.data) {
    throw new Error(json.errors?.[0]?.message || `Shopify Admin GraphQL failed (${res.status})`)
  }
  return json.data
}

function shopHost(shop: string): string {
  const trimmed = shop.trim().replace(/^https?:\/\//, '')
  if (trimmed.includes('.')) return trimmed
  return `${trimmed}.myshopify.com`
}

function testEmail(kind: string, now: number): string {
  return `dashboard-test+${kind}-${now}@${TEST_EMAIL_DOMAIN}`
}

async function findCustomerId(ctx: AdminContext, email: string): Promise<string | null> {
  const data = await adminGraphql<{
    customers?: { nodes?: Array<{ id?: string | null }> }
  }>(
    ctx,
    `query FindCustomer($query: String!) {
      customers(first: 1, query: $query) {
        nodes { id }
      }
    }`,
    { query: `email:${email}` },
  )
  return data.customers?.nodes?.[0]?.id ?? null
}

async function runMailingList(deps: WorkflowDeps): Promise<WorkflowResult> {
  const token = deps.storefrontToken?.trim()
  if (!token) {
    return finish([
      step('Subscribe', false, 'Storefront token is not configured (VITE_SHOPIFY_STOREFRONT_TOKEN)'),
    ])
  }

  const ready = await adminContext(deps, 'write_customers')
  if ('error' in ready) return finish([step('Shopify admin', false, ready.error)])
  const ctx = ready.ctx
  const email = testEmail('list', deps.now?.() ?? Date.now())
  const steps: WorkflowStep[] = []
  let createdId: string | null = null

  try {
    const existing = await findCustomerId(ctx, email)
    if (existing) {
      steps.push(
        step('Subscribe', false, `${email} already exists (${existing}). It was not changed or deleted.`),
      )
      return finish(steps)
    }

    const subscribed = await storefrontSubscribe(ctx, token, email)
    createdId = subscribed
    steps.push(step('Subscribe', true, `${email} (${subscribed})`))

    const state = await marketingState(ctx, subscribed)
    const onList = state === 'SUBSCRIBED' || state === 'PENDING'
    steps.push(
      step(
        'Confirm list',
        onList,
        onList ? `${email} is ${state}` : `${email} marketing state is ${state || 'missing'}`,
      ),
    )
  } catch (error) {
    steps.push(step(createdId ? 'Confirm list' : 'Subscribe', false, errorDetail(error)))
  } finally {
    if (createdId) {
      try {
        const deleted = await deleteCustomer(ctx, createdId)
        steps.push(
          step('Remove test email', deleted.ok, deleted.ok ? `Deleted ${email}` : deleted.detail),
        )
      } catch (error) {
        steps.push(step('Remove test email', false, errorDetail(error)))
      }
    }
  }

  return finish(steps)
}

async function storefrontSubscribe(ctx: AdminContext, token: string, email: string): Promise<string> {
  const res = await ctx.fetchImpl(`https://${shopHost(ctx.creds.shop)}/api/unstable/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({
      query: `mutation customerEmailMarketingSubscribe($email: String!) {
        customerEmailMarketingSubscribe(email: $email) {
          customer { id }
          customerUserErrors { message }
        }
      }`,
      variables: { email },
    }),
  })
  const json = (await res.json()) as {
    errors?: Array<{ message?: string }>
    data?: {
      customerEmailMarketingSubscribe?: {
        customer?: { id?: string | null } | null
        customerUserErrors?: Array<{ message?: string }>
      }
    }
  }
  const payload = json.data?.customerEmailMarketingSubscribe
  const userError = payload?.customerUserErrors?.[0]?.message
  const id = payload?.customer?.id
  if (!res.ok || json.errors?.length || userError || !id) {
    throw new Error(userError || json.errors?.[0]?.message || `Newsletter subscribe failed (${res.status})`)
  }
  return id
}

async function marketingState(ctx: AdminContext, id: string): Promise<string> {
  const data = await adminGraphql<{
    customer?: { emailMarketingConsent?: { marketingState?: string | null } | null } | null
  }>(
    ctx,
    `query CustomerMarketing($id: ID!) {
      customer(id: $id) {
        id
        emailMarketingConsent { marketingState }
      }
    }`,
    { id },
  )
  return data.customer?.emailMarketingConsent?.marketingState ?? ''
}

async function deleteCustomer(ctx: AdminContext, id: string): Promise<{ ok: boolean; detail: string }> {
  const data = await adminGraphql<{
    customerDelete?: { deletedCustomerId?: string | null; userErrors?: Array<{ message?: string }> }
  }>(
    ctx,
    `mutation CustomerDelete($id: ID!) {
      customerDelete(input: { id: $id }) {
        deletedCustomerId
        userErrors { message }
      }
    }`,
    { id },
  )
  const error = data.customerDelete?.userErrors?.[0]?.message
  if (error || !data.customerDelete?.deletedCustomerId) {
    return { ok: false, detail: error || `Customer ${id} was not deleted` }
  }
  return { ok: true, detail: data.customerDelete.deletedCustomerId }
}

async function runOrders(deps: WorkflowDeps): Promise<WorkflowResult> {
  const ready = await adminContext(deps, 'write_orders')
  if ('error' in ready) return finish([step('Shopify admin', false, ready.error)])
  const ctx = ready.ctx
  const steps: WorkflowStep[] = []
  let orderId: string | null = null
  let orderName = ''

  try {
    const created = await adminGraphql<{
      orderCreate?: {
        order?: { id?: string | null; name?: string | null } | null
        userErrors?: Array<{ message?: string }>
      }
    }>(
      ctx,
      `mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          order { id name }
          userErrors { field message }
        }
      }`,
      {
        order: {
          currency: 'USD',
          test: true,
          tags: ['dashboard-test', 'analytics-test'],
          lineItems: [
            {
              title: 'Dashboard smoke test',
              quantity: 1,
              priceSet: {
                shopMoney: { amount: '0.00', currencyCode: 'USD' },
              },
            },
          ],
        },
        options: {
          sendReceipt: false,
          sendFulfillmentReceipt: false,
          inventoryBehaviour: 'BYPASS',
        },
      },
    )
    const createError = created.orderCreate?.userErrors?.[0]?.message
    orderId = created.orderCreate?.order?.id ?? null
    orderName = created.orderCreate?.order?.name ?? orderId ?? ''
    if (createError || !orderId) {
      steps.push(step('Create order', false, createError || 'Shopify did not return an order'))
      return finish(steps)
    }
    steps.push(step('Create order', true, `${orderName} (${orderId})`))

    const read = await adminGraphql<{ order?: { id?: string | null; name?: string | null } | null }>(
      ctx,
      `query ReadOrder($id: ID!) {
        order(id: $id) { id name }
      }`,
      { id: orderId },
    )
    const found = read.order?.id === orderId
    if (read.order?.name) orderName = read.order.name
    steps.push(step('Read order', found, found ? `Found ${orderName}` : `Order ${orderId} was not readable`))
  } catch (error) {
    steps.push(step(orderId ? 'Read order' : 'Create order', false, errorDetail(error)))
  } finally {
    if (orderId) {
      try {
        steps.push(await removeOrder(ctx, orderId, orderName || orderId))
      } catch (error) {
        steps.push(step('Delete order', false, `${errorDetail(error)} Order ${orderName || orderId} may still be in Shopify.`))
      }
    }
  }

  return finish(steps)
}

async function removeOrder(ctx: AdminContext, orderId: string, orderName: string): Promise<WorkflowStep> {
  const deleted = await adminGraphql<{
    orderDelete?: { deletedId?: string | null; userErrors?: Array<{ message?: string }> }
  }>(
    ctx,
    `mutation OrderDelete($orderId: ID!) {
      orderDelete(orderId: $orderId) {
        deletedId
        userErrors { field message }
      }
    }`,
    { orderId },
  )
  const deleteError = deleted.orderDelete?.userErrors?.[0]?.message
  if (!deleteError && deleted.orderDelete?.deletedId) {
    return step('Delete order', true, `Removed ${orderName}`)
  }

  const cancelled = await adminGraphql<{
    orderCancel?: { orderCancelUserErrors?: Array<{ message?: string }>; userErrors?: Array<{ message?: string }> }
  }>(
    ctx,
    `mutation OrderCancel($orderId: ID!) {
      orderCancel(orderId: $orderId, notifyCustomer: false, refund: false, restock: false, reason: OTHER, staffNote: "Dashboard smoke test cleanup") {
        job { id }
        orderCancelUserErrors { message }
        userErrors { message }
      }
    }`,
    { orderId },
  )
  const cancelError =
    cancelled.orderCancel?.orderCancelUserErrors?.[0]?.message || cancelled.orderCancel?.userErrors?.[0]?.message
  if (cancelError) {
    return step(
      'Delete order',
      false,
      `Delete was rejected (${deleteError || 'unknown'}). Cancel failed (${cancelError}). Order ${orderName} is still in Shopify.`,
    )
  }
  return step(
    'Delete order',
    true,
    `Delete was rejected (${deleteError || 'unknown'}). Cancelled ${orderName}.`,
  )
}
