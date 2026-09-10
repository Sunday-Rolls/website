import { useEffect } from 'react'
import { getButtonLabel, usePageContent } from '@/lib/content'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export function ContactPage() {
  const content = usePageContent('contact')

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  const fields = [
    content.form.name,
    content.form.email,
    content.form.subject,
    content.form.message,
  ]

  return (
    <Container className="space-y-16 py-section-y">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-8">
          <PageHeader title={content.header.title} subtitle={content.header.subtitle} />

          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            {fields.map((field) => {
              const isMessage = field.label === content.form.message.label

              return (
                <label key={field.label} className="block space-y-2">
                  <span className="font-body text-label uppercase tracking-widest text-heritage-green">
                    {field.label}
                  </span>
                  {isMessage ? (
                    <textarea
                      name={field.label.toLowerCase()}
                      placeholder={field.placeholder}
                      rows={5}
                      className="w-full rounded-md border border-sand bg-white px-4 py-3 font-body text-body focus:border-heritage-green focus:outline-none"
                    />
                  ) : (
                    <input
                      type={field.label === content.form.email.label ? 'email' : 'text'}
                      name={field.label.toLowerCase()}
                      placeholder={field.placeholder}
                      className="w-full rounded-md border border-sand bg-white px-4 py-3 font-body text-body focus:border-heritage-green focus:outline-none"
                    />
                  )}
                </label>
              )
            })}

            <Button type="submit">{getButtonLabel(content.form.submitLabelKey)}</Button>
          </form>
        </div>

        <aside className="space-y-6 self-start rounded-lg border border-sand bg-white p-6">
          <h2 className="font-display text-2xl text-heritage-green">{content.sidebar.title}</h2>
          <div className="space-y-4">
            <div>
              <p className="font-body text-label uppercase tracking-widest text-leather">
                {content.sidebar.email.label}
              </p>
              <a
                href={`mailto:${content.sidebar.email.value}`}
                className="font-body text-body text-heritage-green underline-offset-4 hover:underline"
              >
                {content.sidebar.email.value}
              </a>
            </div>
            <div>
              <p className="font-body text-label uppercase tracking-widest text-leather">
                {content.sidebar.phone.label}
              </p>
              <a
                href={`tel:${content.sidebar.phone.value.replace(/[^\d+]/g, '')}`}
                className="font-body text-body text-heritage-green underline-offset-4 hover:underline"
              >
                {content.sidebar.phone.value}
              </a>
            </div>
          </div>
        </aside>
      </div>

      {content.returnPolicy ? (
        <section
          id={content.returnPolicy.id}
          className="scroll-mt-24 space-y-4 border-t border-sand pt-12"
        >
          <h2 className="font-display text-section-title text-heritage-green">
            {content.returnPolicy.title}
          </h2>
          <p className="font-body text-body text-matte-black/80">
            {content.returnPolicy.shipToLabel}:{' '}
            <span className="font-semibold text-heritage-green">
              {content.returnPolicy.address}
            </span>
          </p>
          {content.returnPolicy.body.map((paragraph) => (
            <p key={paragraph} className="max-w-3xl font-body text-body text-matte-black/80">
              {paragraph}
            </p>
          ))}
        </section>
      ) : null}
    </Container>
  )
}
