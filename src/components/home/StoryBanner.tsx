import { resolveLinkLabel, usePageContent } from '@/lib/content'
import { homeAssets } from '@/assets'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

export function StoryBanner() {
  const { story } = usePageContent('home')

  return (
    <section className="home-snap-section bg-cream py-section-y" aria-labelledby="home-story-heading">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="space-y-6 lg:max-w-xl">
            {story.eyebrow ? (
              <p className="font-body text-label uppercase tracking-widest text-leather">
                {story.eyebrow}
              </p>
            ) : null}

            <h2 id="home-story-heading" className="font-display text-page-title text-heritage-green">
              {story.title}
            </h2>

            <div className="space-y-5 font-body text-body text-matte-black/80">
              {story.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <Button href={story.cta.href}>
              {resolveLinkLabel(story.cta)} →
            </Button>
          </div>

          <img
            src={homeAssets.crew}
            alt="The Sunday Rolls crew"
            className="aspect-[5/4] w-full object-cover object-[center_18%] sm:aspect-[4/3]"
          />
        </div>
      </Container>
    </section>
  )
}
