import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import aboutContent from '@/content/pages/about.json'
import { AboutPage } from '@/pages/AboutPage'
import { renderWithRouter } from '@/test/test-utils'

describe('AboutPage', () => {
  it('renders every partner with their photo and bio details', () => {
    renderWithRouter(<AboutPage />)

    const teamSection = screen
      .getByRole('heading', { level: 2, name: aboutContent.team.title })
      .closest('section')
    expect(teamSection).not.toBeNull()

    for (const member of aboutContent.team.members) {
      const card = within(teamSection!)
        .getByRole('heading', { level: 3, name: member.name })
        .closest('li')
      expect(card).not.toBeNull()

      expect(within(card!).getByRole('img', { name: member.name })).toHaveAttribute(
        'src',
        member.image,
      )
      expect(within(card!).getByText(member.hometown)).toBeInTheDocument()
      expect(within(card!).getByText(member.handicap)).toBeInTheDocument()
      expect(within(card!).getByText(member.favoriteCourse)).toBeInTheDocument()
    }
  })

  it('renders the values list without the old tradition section', () => {
    renderWithRouter(<AboutPage />)

    expect(
      screen.getByRole('heading', { level: 2, name: aboutContent.values.title }),
    ).toBeInTheDocument()
    for (const item of aboutContent.values.items) {
      expect(screen.getByText(item.label)).toBeInTheDocument()
    }
    expect(screen.queryByText('A new take on tradition')).not.toBeInTheDocument()
  })
})
