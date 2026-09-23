import { useEffect, useState, type FormEvent } from 'react'
import { getButtonLabel, usePageContent } from '@/lib/content'
import { submitContactForm } from '@/lib/contact-api'
import { pushEvent } from '@/lib/gtm'
import { toastError, toastSuccess } from '@/lib/toast'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

type FormState = {
  name: string
  email: string
  subject: string
  message: string
}

const emptyForm: FormState = {
  name: '',
  email: '',
  subject: '',
  message: '',
}

export function ContactPage() {
  const content = usePageContent('contact')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      await submitContactForm(form)
      pushEvent('contact_submit', { method: 'contact_api' })
      toastSuccess(
        content.form.successMessage ??
          "Message sent — we'll get back to you soon.",
      )
      setForm(emptyForm)
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : (content.form.errorMessage ?? 'Something went wrong. Please try again.')
      toastError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const fields: Array<{
    key: keyof FormState
    label: string
    placeholder: string
    multiline?: boolean
  }> = [
    {
      key: 'name',
      label: content.form.name.label,
      placeholder: content.form.name.placeholder,
    },
    {
      key: 'email',
      label: content.form.email.label,
      placeholder: content.form.email.placeholder,
    },
    {
      key: 'subject',
      label: content.form.subject.label,
      placeholder: content.form.subject.placeholder,
    },
    {
      key: 'message',
      label: content.form.message.label,
      placeholder: content.form.message.placeholder,
      multiline: true,
    },
  ]

  return (
    <Container className="space-y-16 py-section-y">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-8">
          <PageHeader title={content.header.title} subtitle={content.header.subtitle} />

          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            {fields.map((field) => (
              <label key={field.key} className="block space-y-2">
                <span className="font-body text-label uppercase tracking-widest text-heritage-green">
                  {field.label}
                </span>
                {field.multiline ? (
                  <textarea
                    name={field.key}
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    rows={5}
                    required
                    disabled={isSubmitting}
                    className="w-full rounded-md border border-sand bg-white px-4 py-3 font-body text-body focus:border-heritage-green focus:outline-none disabled:opacity-60"
                  />
                ) : (
                  <input
                    type={field.key === 'email' ? 'email' : 'text'}
                    name={field.key}
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    required
                    disabled={isSubmitting}
                    className="w-full rounded-md border border-sand bg-white px-4 py-3 font-body text-body focus:border-heritage-green focus:outline-none disabled:opacity-60"
                  />
                )}
              </label>
            ))}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? (content.form.submittingLabel ?? 'Sending…')
                : getButtonLabel(content.form.submitLabelKey)}
            </Button>
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
