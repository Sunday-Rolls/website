import { randomUUID } from 'node:crypto'
import type { ContactPayload } from './mail.js'

export type StoredContactMessage = ContactPayload & {
  id: string
  createdAt: string
  emailDelivered: boolean
}

export interface ContactStore {
  create(message: ContactPayload, emailDelivered: boolean): Promise<StoredContactMessage>
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
`

export function createPgContactStore(db: Queryable): ContactStore & { migrate(): Promise<void> } {
  return {
    async migrate() {
      await db.query(CONTACT_SCHEMA_SQL)
    },

    async create(message, emailDelivered) {
      const { rows } = await db.query(
        `INSERT INTO contact_messages (id, name, email, subject, body, email_delivered)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, subject, body, email_delivered, created_at`,
        [
          randomUUID(),
          message.name,
          message.email,
          message.subject,
          message.message,
          emailDelivered,
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
    async create(message, emailDelivered) {
      const saved: StoredContactMessage = {
        ...message,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        emailDelivered,
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
