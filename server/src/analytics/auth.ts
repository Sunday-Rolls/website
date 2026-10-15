import { randomUUID } from 'node:crypto'
import { compare, hash } from 'bcryptjs'

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash)
}

export function newSessionId(): string {
  return randomUUID()
}

export function sessionExpiry(now = new Date(), days = 14): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320
}

export const SESSION_COOKIE = 'sr_dashboard_session'
