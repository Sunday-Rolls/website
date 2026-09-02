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
    <Container className="grid gap-10 py-section-y lg:grid-cols-[1.2fr_0.8fr]">
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

      <aside className="space-y-6 rounded-lg border border-sand bg-white p-6">
        <h2 className="font-display text-2xl text-heritage-green">{content.sidebar.title}</h2>
        <div className="space-y-4">
          <div>
            <p className="font-body text-label uppercase tracking-widest text-leather">
              {content.sidebar.email.label}
            </p>
            <p className="font-body text-body">{content.sidebar.email.value}</p>
          </div>
          <div>
            <p className="font-body text-label uppercase tracking-widest text-leather">
              {content.sidebar.phone.label}
            </p>
            <p className="font-body text-body">{content.sidebar.phone.value}</p>
          </div>
        </div>
      </aside>
    </Container>
  )
}
