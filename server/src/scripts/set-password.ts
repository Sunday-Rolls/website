#!/usr/bin/env node
/**
 * Usage: npm run user:set-password -- user@example.com 'NewPassword' [Display Name]
 */
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword, isValidEmail, normalizeEmail } from '../analytics/auth.js'
import { createPgAnalyticsStore } from '../analytics/store.js'

const emailArg = process.argv[2]
const password = process.argv[3]
const nameArg = process.argv[4]

if (!emailArg || !password) {
  console.error('Usage: npm run user:set-password -- <email> <password> [name]')
  process.exit(1)
}

const email = normalizeEmail(emailArg)
if (!isValidEmail(email)) {
  console.error('Invalid email')
  process.exit(1)
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
const store = createPgAnalyticsStore(pool)
await store.migrate()

const existing = await store.getUserByEmail(email)
const user = await store.upsertUser({
  id: existing?.id ?? randomUUID(),
  email,
  name: nameArg?.trim() || existing?.name || email.split('@')[0],
  passwordHash: await hashPassword(password),
})

console.log(`Password set for ${user.email} (${user.name})`)
await pool.end()
