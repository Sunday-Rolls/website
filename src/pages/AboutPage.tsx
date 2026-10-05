import { useEffect } from 'react'
import { homeAssets } from '@/assets'
import { assetUrl } from '@/lib/asset-url'
import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'

export function AboutPage() {
  const content = usePageContent('about')
  const { team } = content

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <>
      <Container className="py-section-y">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="space-y-6 lg:max-w-xl">
            <h1 className="font-display text-page-title text-heritage-green">
              {content.hero.title}
            </h1>

            <div className="space-y-5 font-body text-body text-matte-black/80">
              {content.hero.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <img
            src={homeAssets.crew}
            alt="The Sunday Rolls crew"
            className="aspect-[5/4] w-full object-cover object-[center_74%]"
          />
        </section>
      </Container>

      {team ? (
        <section
          className="bg-heritage-green py-section-y text-cream"
          aria-labelledby="about-team-heading"
        >
          <Container className="space-y-10">
            <div className="space-y-3 text-center">
              <h2 id="about-team-heading" className="font-display text-page-title text-white">
                {team.title}
              </h2>
              {team.subtitle ? (
                <p className="font-body text-body text-cream/80">{team.subtitle}</p>
              ) : null}
            </div>

            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-5">
              {team.members.map((member) => {
                const details = [
                  { label: team.labels.hometown, value: member.hometown },
                  { label: team.labels.handicap, value: member.handicap },
                  { label: team.labels.favoriteCourse, value: member.favoriteCourse },
                ]

                return (
                  <li
                    key={member.name}
                    className="space-y-4 max-sm:last:odd:col-span-2 max-sm:last:odd:mx-auto max-sm:last:odd:w-[calc(50%-0.5rem)]"
                  >
                    <img
                      src={assetUrl(member.image)}
                      alt={member.name}
                      className="aspect-[4/5] w-full object-cover"
                      loading="lazy"
                    />
                    <div className="space-y-1">
                      <h3 className="font-display text-2xl leading-tight text-white">
                        {member.name}
                      </h3>
                      <p className="font-body text-label uppercase tracking-widest text-soft-gold">
                        {member.role}
                      </p>
                    </div>
                    <dl className="space-y-2 font-body text-body-small">
                      {details.map((detail) => (
                        <div key={detail.label}>
                          <dt className="text-[0.6875rem] uppercase tracking-widest text-cream/60">
                            {detail.label}
                          </dt>
                          <dd className="text-cream/90">{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                )
              })}
            </ul>
          </Container>
        </section>
      ) : null}

      <section className="py-section-y" aria-labelledby="about-values-heading">
        <Container className="mx-auto max-w-2xl space-y-8 text-center">
          {content.values.title ? (
            <h2
              id="about-values-heading"
              className="font-display text-page-title text-heritage-green"
            >
              {content.values.title}
            </h2>
          ) : null}

          <ul className="divide-y divide-sand border-y border-sand">
            {content.values.items.map((item) => (
              <li key={item.label} className="space-y-1 py-6">
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
