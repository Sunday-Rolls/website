import nodemailer from 'nodemailer'
import type { Config } from './env.js'

export type ContactPayload = {
  name: string
  email: string
  subject: string
  message: string
}

type MailConfig = Pick<
  Config,
  'contactToEmail' | 'smtpUser' | 'smtpPass' | 'smtpHost' | 'smtpPort' | 'resendApiKey'
>

export function createMailer(config: MailConfig) {
  async function sendViaResend(payload: ContactPayload): Promise<void> {
    const apiKey = config.resendApiKey
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured')

    const from = config.smtpUser
      ? `Sunday Rolls Contact <${config.smtpUser}>`
      : 'Sunday Rolls Contact <onboarding@resend.dev>'

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [config.contactToEmail],
        reply_to: payload.email,
        subject: `[Sunday Rolls Contact] ${payload.subject}`,
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
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Resend HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
  }

  async function sendViaSmtp(payload: ContactPayload): Promise<void> {
    if (!config.smtpUser || !config.smtpPass) {
      throw new Error('SMTP_USER / SMTP_PASS are not configured')
    }

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

    await transporter.sendMail({
      from: `"Sunday Rolls Contact" <${config.smtpUser}>`,
      to: config.contactToEmail,
      replyTo: `"${payload.name}" <${payload.email}>`,
      subject: `[Sunday Rolls Contact] ${payload.subject}`,
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

  async function sendContactEmail(payload: ContactPayload): Promise<void> {
    if (config.resendApiKey) {
      await sendViaResend(payload)
      return
    }
    await sendViaSmtp(payload)
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
