import { useEffect } from 'react'
import { homeAssets } from '@/assets'
import { usePageContent } from '@/lib/content'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function AboutPage() {
  const content = usePageContent('about')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <>
      <Container className="py-section-y">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="space-y-6 lg:max-w-xl">
            {content.hero.eyebrow ? (
              <p className="font-body text-label uppercase tracking-widest text-matte-black/45">
                {content.hero.eyebrow}
              </p>
            ) : null}

            <h1 className="font-display text-page-title text-heritage-green">
              {content.hero.title}
            </h1>

            <div className="space-y-5 font-body text-body text-matte-black/80">
              {content.hero.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            {content.hero.cta ? (
              <Button href={content.hero.cta.href}>{content.hero.cta.label} →</Button>
            ) : null}
          </div>

          <img
            src={homeAssets.crew}
            alt="The Sunday Rolls crew"
            className="aspect-[5/4] w-full object-cover object-[center_18%] sm:aspect-[4/3]"
          />
        </section>
      </Container>

      {content.team ? (
        <Container className="pb-section-y">
          <section className="w-full space-y-10 border-t border-sand pt-12">
            <div className="max-w-2xl space-y-3">
              <h2 className="font-display text-section-title text-heritage-green">
                {content.team.title}
              </h2>
              {content.team.subtitle ? (
                <p className="font-body text-body text-matte-black/80">{content.team.subtitle}</p>
              ) : null}
            </div>

            <div className="grid gap-10 md:grid-cols-3">
              {content.team.members.map((member, index) => (
                <article
                  key={`${member.role}-${index}`}
                  className="space-y-3 border-t border-sand pt-5"
                >
                  <div className="space-y-1">
                    <h3 className="font-display text-2xl text-heritage-green">{member.name}</h3>
                    <p className="font-body text-label uppercase tracking-widest text-leather">
                      {member.role}
                    </p>
                  </div>
                  <p className="font-body text-body text-matte-black/80">{member.bio}</p>
                </article>
              ))}
            </div>
          </section>
        </Container>
      ) : null}

      <Container className="pb-section-y">
        <div
          id="tradition"
          className="grid scroll-mt-28 w-full gap-10 border-t border-sand pt-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16"
        >
          <img
            src={homeAssets.lifestyle}
            alt="Sunday Rolls headcovers in a golf bag"
            className="aspect-[4/5] w-full max-w-md object-cover"
          />

          <div className="space-y-4">
            <h2 className="font-display text-section-title text-heritage-green">
              {content.tradition.title}
            </h2>
            {content.tradition.lines.map((line) => (
              <p key={line} className="font-body text-body text-matte-black/80">
                {line}
              </p>
            ))}
          </div>
        </div>
      </Container>

      <section className="border-y border-sand bg-sand/20 py-section-y">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          {content.values.title ? (
            <h2 className="max-w-xs font-display text-section-title text-heritage-green lg:sticky lg:top-28 lg:self-start">
              {content.values.title}
            </h2>
          ) : null}

          <ul className="divide-y divide-sand border-y border-sand">
            {content.values.items.map((item) => (
              <li
                key={item.label}
                className="grid gap-2 py-6 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-8"
              >
                <p className="font-display text-2xl text-heritage-green">{item.label}</p>
                {item.description ? (
                  <p className="font-body text-body text-matte-black/75">{item.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  )
}
