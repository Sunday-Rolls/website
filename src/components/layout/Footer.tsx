import { Link } from 'react-router-dom'
import { formatCopyright, useSiteContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { SocialLinks } from '@/components/ui/SocialLinks'

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

          {footer.contact && (
            <div className="space-y-2 font-body text-body-small text-cream/85">
              {footer.contact?.email ? (
                <p>
                  <a
                    href={`mailto:${footer.contact.email}`}
                    className="transition-colors hover:text-white"
                  >
                    {footer.contact.email}
                  </a>
                </p>
              ) : null}
              {footer.contact?.phone ? (
                <p>
                  <a
                    href={`tel:${footer.contact.phone.replace(/[^\d+]/g, '')}`}
                    className="transition-colors hover:text-white"
                  >
                    {footer.contact.phone}
                  </a>
                </p>
              ) : null}
            </div>
          )}

          <SocialLinks className="pt-1" />
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title} className="space-y-3">
              <p className="font-body text-label text-soft-gold-bright">{column.title}</p>
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
