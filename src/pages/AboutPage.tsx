import { useEffect } from 'react'
import { homeAssets } from '@/assets'
import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export function AboutPage() {
  const content = usePageContent('about')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  return (
    <>
      <Container className="flex flex-col items-start gap-12 py-section-y lg:gap-16">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-16">
          <div className="space-y-6">
            <div className="space-y-3">
              {content.hero.eyebrow ? (
                <p className="font-body text-label uppercase tracking-widest text-leather">
                  {content.hero.eyebrow}
                </p>
              ) : null}
              <PageHeader title={content.hero.title} />
            </div>

            <img
              src={homeAssets.crew}
              alt="Sunday Rolls crew"
              className="aspect-[4/3] w-full rounded-lg object-cover object-[center_25%]"
            />
          </div>

          <div className="space-y-5 font-body text-body text-matte-black/80 lg:pt-10">
            {content.hero.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        {content.team ? (
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
        ) : null}

        <div className="grid w-full gap-10 border-t border-sand pt-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <img
            src={homeAssets.lifestyle}
            alt="Sunday Rolls headcovers in a golf bag"
            className="aspect-[4/5] w-full max-w-md rounded-lg object-cover"
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
