#!/usr/bin/env node
/**
 * Write 800px-wide product JPEGs and a dimension map so product pages can
 * preload a file that matches the gallery slot.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(root, 'public/assets/products')
const outDir = join(sourceDir, 'w800')
const dimensionsPath = join(root, 'src/data/product-image-dimensions.json')
const MAX_WIDTH = 800

export async function resizeProductImages() {
  const files = (await readdir(sourceDir)).filter((name) => /\.(jpe?g|png)$/i.test(name))
  await mkdir(outDir, { recursive: true })

  const dimensions = {}

  for (const name of files) {
    const source = join(sourceDir, name)
    const input = await readFile(source)
    const image = sharp(input)
    const meta = await image.metadata()
    if (!meta.width || !meta.height) continue

    dimensions[name] = { width: meta.width, height: meta.height }

    const resized = image.resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    const output = name.toLowerCase().endsWith('.png') ? resized.png() : resized.jpeg({ quality: 75 })
    await output.toFile(join(outDir, name))
  }

  const sorted = Object.fromEntries(
    Object.keys(dimensions)
      .sort()
      .map((name) => [name, dimensions[name]]),
  )
  await writeFile(dimensionsPath, `${JSON.stringify(sorted, null, 2)}\n`)
  return Object.keys(sorted).length
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  resizeProductImages()
    .then((count) => {
      console.log(`Resized ${count} product images`)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
