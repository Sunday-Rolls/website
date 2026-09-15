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
  images: [
    { url: '/a.jpg', alt: 'The Doodle front' },
    { url: '/b.jpg', alt: 'The Doodle side' },
    { url: '/c.jpg', alt: 'The Doodle back' },
    { url: '/d.jpg', alt: 'The Doodle detail' },
    { url: '/e.jpg', alt: 'The Doodle lifestyle' },
  ],
}

describe('ProductGallery', () => {
  it('shows the first image and lets the user flip through the carousel', async () => {
    const user = userEvent.setup()
    render(<ProductGallery product={product} />)

    expect(screen.getByAltText('The Doodle front')).toBeInTheDocument()
    expect(screen.getByText('1 / 5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next product image' }))
    expect(screen.getByAltText('The Doodle side')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show image 5' }))
    expect(screen.getByAltText('The Doodle lifestyle')).toBeInTheDocument()
    expect(screen.getByText('5 / 5')).toBeInTheDocument()
  })
})
