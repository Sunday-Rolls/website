import { randomUUID } from 'node:crypto'
import type { ContactPayload } from './mail.js'

/** Stored with the message for A/B results; never put in the email. */
export type ContactExperimentContext = {
  visitorId: string | null
  /** `{ "home-banner": "b" }`, parsed from the `_sr_exp`-format `experiments` field. */
  experiments: Record<string, string> | null
}

export type StoredContactMessage = ContactPayload & {
  id: string
  createdAt: string
  emailDelivered: boolean
  visitorId: string | null
  experiments: Record<string, string> | null
}

export interface ContactStore {
  create(
    message: ContactPayload,
    emailDelivered: boolean,
    context?: ContactExperimentContext,
  ): Promise<StoredContactMessage>
  deleteById(id: string): Promise<boolean>
}

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export const CONTACT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  email_delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON contact_messages (created_at DESC);
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS experiments jsonb;
`

export function createPgContactStore(db: Queryable): ContactStore & { migrate(): Promise<void> } {
  return {
    async migrate() {
      await db.query(CONTACT_SCHEMA_SQL)
    },

    async create(message, emailDelivered, context) {
      const { rows } = await db.query(
        `INSERT INTO contact_messages (id, name, email, subject, body, email_delivered, visitor_id, experiments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, name, email, subject, body, email_delivered, visitor_id, experiments, created_at`,
        [
          randomUUID(),
          message.name,
          message.email,
          message.subject,
          message.message,
          emailDelivered,
          context?.visitorId ?? null,
          context?.experiments ? JSON.stringify(context.experiments) : null,
        ],
      )
      const row = rows[0]
      const createdAt = row.created_at
      return {
        id: String(row.id),
        name: String(row.name),
        email: String(row.email),
        subject: String(row.subject),
        message: String(row.body),
        emailDelivered: Boolean(row.email_delivered),
        visitorId: row.visitor_id == null ? null : String(row.visitor_id),
        experiments: (row.experiments as Record<string, string> | null) ?? null,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
      }
    },

    async deleteById(id) {
      const { rows } = await db.query(`DELETE FROM contact_messages WHERE id = $1 RETURNING id`, [id])
      return rows.length > 0
    },
  }
}

export function createMemoryContactStore(): ContactStore {
  const messages: StoredContactMessage[] = []

  return {
    async create(message, emailDelivered, context) {
      const saved: StoredContactMessage = {
        ...message,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        emailDelivered,
        visitorId: context?.visitorId ?? null,
        experiments: context?.experiments ?? null,
      }
      messages.unshift(saved)
      return saved
    },

    async deleteById(id) {
      const index = messages.findIndex((message) => message.id === id)
      if (index === -1) return false
      messages.splice(index, 1)
      return true
    },
  }
}
