import { Link } from 'react-router-dom'
import { formatCopyright, useSiteContent } from '@/lib/content'
import { prefetchHandlers } from '@/lib/preload-route'
import { sitePath } from '@/lib/site-path'
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
      <Container className="grid gap-6 py-8 md:grid-cols-[1.2fr_2fr] md:gap-10 md:py-12">
        <div className="space-y-3 md:space-y-4">
          <p className="font-display text-xl">{brand.name}</p>
          <p className="font-body text-body-small text-cream/80">{brand.tagline}</p>

          {footer.contact && (
            <div className="space-y-1 font-body text-body-small text-cream/85 md:space-y-2">
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

          <SocialLinks className="pt-0.5 md:pt-1" />
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-8">
          {columns.map((column) => (
            <div key={column.title} className="space-y-2 sm:space-y-3">
              <p className="font-body text-label text-soft-gold-bright">{column.title}</p>
              <ul className="space-y-1 sm:space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={sitePath(link.href)}
                      className="font-body text-body-small text-cream/85 transition-colors hover:text-white"
                      {...prefetchHandlers(sitePath(link.href))}
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
