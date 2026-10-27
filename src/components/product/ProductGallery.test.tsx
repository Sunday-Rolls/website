import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ProductGallery } from '@/components/product/ProductGallery'
import type { ShopifyProduct } from '@/lib/shopify'

const product: ShopifyProduct = {
  id: '1',
  handle: 'the-doodle',
  title: 'The Doodle',
  description: 'A cover',
  price: '$55.00',
  imageUrl: '/a.jpg',
  images: [
    { url: '/a.jpg', alt: 'The Doodle front' },
    { url: '/b.jpg', alt: 'The Doodle dual' },
    { url: '/c.jpg', alt: 'The Doodle open' },
  ],
}

describe('ProductGallery', () => {
  it('shows unique store photos in the thumbnail strip', async () => {
    const user = userEvent.setup()
    render(<ProductGallery product={product} />)

    expect(screen.getByAltText('The Doodle front')).toBeInTheDocument()
    expect(screen.getByText('More views')).toBeInTheDocument()

    const thumbnails = screen.getAllByRole('button', { name: /Show image/ })
    expect(thumbnails).toHaveLength(3)

    await user.click(thumbnails[1])
    expect(thumbnails[1]).toHaveAttribute('aria-current', 'true')
  })

  it('hides the thumbnail strip when there is only one unique photo', () => {
    render(
      <ProductGallery
        product={{
          ...product,
          images: [{ url: '/a.jpg', alt: 'The Doodle front' }],
        }}
      />,
    )

    expect(screen.getByAltText('The Doodle front')).toBeInTheDocument()
    expect(screen.queryByText('More views')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show image/ })).not.toBeInTheDocument()
  })
})
