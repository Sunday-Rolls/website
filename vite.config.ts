import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

async function resizeProducts() {
  const module = (await import('./scripts/resize-product-images.mjs')) as {
    resizeProductImages: () => Promise<number>
  }
  await module.resizeProductImages()
}

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const basePath = process.env.VITE_BASE_PATH ?? '/'

function productImages(): Plugin {
  return {
    name: 'product-images',
    async buildStart() {
      if (process.env.VITEST) return
      await resizeProducts()
    },
    async configureServer() {
      await resizeProducts()
    },
  }
}

/** Vite rewrites href, not imagesrcset, so GitHub Pages base paths need a pass. */
function prefixImageSrcSet(): Plugin {
  return {
    name: 'prefix-image-srcset',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const base = basePath.endsWith('/') ? basePath : `${basePath}/`
        if (base === '/') return html
        const prefixSet = (value: string) =>
          value
            .split(',')
            .map((part: string) => {
              const [url, ...descriptor] = part.trim().split(/\s+/)
              if (!url.startsWith('/') || url.startsWith(base)) return part.trim()
              return [`${base.slice(0, -1)}${url}`, ...descriptor].join(' ')
            })
            .join(', ')
        return html
          .replace(/imagesrcset="([^"]+)"/g, (_match, value: string) => {
            return `imagesrcset="${prefixSet(value)}"`
          })
          .replace(/\ssrcset="([^"]+)"/g, (_match, value: string) => {
            return ` srcset="${prefixSet(value)}"`
          })
          .replace(/(\s(?:src|href)=")(\/assets\/)/g, (_match, attr, path) => {
            return `${attr}${base.slice(0, -1)}${path}`
          })
      },
    },
  }
}

/** The built stylesheet is ~10 KiB and otherwise blocks first paint. */
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = bundle['index.html']
      if (!htmlAsset || htmlAsset.type !== 'asset') return

      let html = htmlAsset.source.toString()
      const tags = html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) ?? []

      for (const tag of tags) {
        const href = tag.match(/href="([^"]+)"/)?.[1]
        if (!href) continue
        const assetName = Object.keys(bundle).find((name) => href.endsWith(name))
        const asset = assetName ? bundle[assetName] : undefined
        if (!asset || asset.type !== 'asset') continue
        html = html.replace(tag, `<style>${asset.source.toString()}</style>`)
        delete bundle[assetName!]
      }

      htmlAsset.source = html
    },
  }
}

export default defineConfig({
  base: basePath,
  build: {
    manifest: true,
  },
  plugins: [react(), tailwindcss(), productImages(), prefixImageSrcSet(), inlineCss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
