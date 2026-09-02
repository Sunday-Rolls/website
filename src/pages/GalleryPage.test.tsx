import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import galleryContent from '@/content/pages/gallery.json'
import { GalleryPage } from '@/pages/GalleryPage'
import { renderWithRouter } from '@/test/test-utils'

describe('GalleryPage', () => {
  it('renders gallery header and images from content', () => {
    renderWithRouter(<GalleryPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: galleryContent.header.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(galleryContent.header.subtitle)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: galleryContent.featured.alt })).toHaveAttribute(
      'src',
      galleryContent.featured.image,
    )

    for (const item of galleryContent.items) {
      expect(screen.getByRole('img', { name: item.alt })).toHaveAttribute('src', item.image)
    }
  })
})
