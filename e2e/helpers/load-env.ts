import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Load KEY=VALUE files into process.env without overwriting existing vars. */
export function loadEnvFiles(paths: string[]): void {
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue
    const text = readFileSync(filePath, 'utf8')
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}

export function loadProjectEnv(cwd = process.cwd()): void {
  loadEnvFiles([resolve(cwd, '.env'), resolve(cwd, 'server', '.env')])
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env ${name} (see docs/E2E_ORDER_ANALYTICS.md)`)
  }
  return value
}

export function optionalEnv(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback
}
