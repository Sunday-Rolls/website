import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: [path.resolve(rootDir, './src/test/setup.ts')],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      css: true,
    },
  }),
)
