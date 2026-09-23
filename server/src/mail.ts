import nodemailer from 'nodemailer'
import type { Config } from './env.js'

export type ContactPayload = {
  name: string
  email: string
  subject: string
  message: string
}

export function createMailer(config: Config) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  })

  async function sendContactEmail(payload: ContactPayload): Promise<void> {
    const subject = `[Sunday Rolls Contact] ${payload.subject}`

    await transporter.sendMail({
      from: `"Sunday Rolls Contact" <${config.smtpUser}>`,
      to: config.contactToEmail,
      replyTo: `"${payload.name}" <${payload.email}>`,
      subject,
      text: [
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Subject: ${payload.subject}`,
        '',
        payload.message,
      ].join('\n'),
      html: `
        <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(payload.subject)}</p>
        <hr />
        <p style="white-space: pre-wrap;">${escapeHtml(payload.message)}</p>
      `.trim(),
    })
  }

  return { sendContactEmail }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
