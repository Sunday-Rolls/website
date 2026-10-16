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
      await resizeProducts()
    },
    async configureServer() {
      await resizeProducts()
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
  plugins: [react(), tailwindcss(), productImages(), inlineCss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
