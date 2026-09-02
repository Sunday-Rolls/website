import { Link } from 'react-router-dom'
import { formatCopyright, useSiteContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { EmailInput } from '@/components/ui/EmailInput'

export function Footer() {
  const { brand, navigation, footer } = useSiteContent()

  const columns = [
    { title: footer.columns.shop, links: navigation.footerShop },
    { title: footer.columns.company, links: navigation.footerCompany },
    { title: footer.columns.support, links: navigation.footerSupport },
  ]

  return (
    <footer className="mt-auto border-t border-sand bg-heritage-green text-cream">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.2fr_2fr]">
        <div className="space-y-4">
          <p className="font-display text-xl">{brand.name}</p>
          <p className="font-body text-body-small text-cream/80">{brand.tagline}</p>
          <EmailInput
            placeholder={footer.newsletter.placeholder}
            submitLabel={footer.newsletter.submitLabel}
          />
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title} className="space-y-3">
              <p className="font-body text-label text-soft-gold">{column.title}</p>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="font-body text-body-small text-cream/85 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>

      <Container className="border-t border-cream/10 py-4">
        <p className="font-body text-body-small text-cream/70">
          {formatCopyright(footer.copyright)}
        </p>
      </Container>
    </footer>
  )
}
