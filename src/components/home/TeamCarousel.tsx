import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { homeAssets } from '@/assets'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function TeamCarousel() {
  const { team } = usePageContent('home')

  return (
    <section className="border-t border-sand bg-warm-sand/35 py-section-y" aria-labelledby="home-team-heading">
      <Container className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-3">
            <h2 id="home-team-heading" className="font-display text-section-title text-heritage-green">
              {team.title}
            </h2>
            {team.subtitle ? (
              <p className="font-body text-body text-matte-black/75">{team.subtitle}</p>
            ) : null}
          </div>
          <Button href={team.cta.href} variant="secondary">
            {resolveLinkLabel(team.cta)}
          </Button>
        </div>

        <div className="-mx-container-x">
          <div
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-container-x pb-3 [scrollbar-width:thin]"
            role="list"
            aria-label={team.title}
          >
            {team.members.map((member, index) => (
              <article
                key={`${member.name}-${index}`}
                role="listitem"
                className="w-[min(70vw,16rem)] shrink-0 snap-start space-y-4 sm:w-[17rem]"
              >
                <div className="aspect-[4/5] overflow-hidden bg-sand">
                  <img
                    src={homeAssets.crew}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full scale-[1.85] object-cover"
                    style={{ objectPosition: member.focus ?? '50% 40%' }}
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-2xl text-heritage-green">{member.name}</h3>
                  <p className="font-body text-label uppercase tracking-widest text-leather">
                    {member.role}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}
