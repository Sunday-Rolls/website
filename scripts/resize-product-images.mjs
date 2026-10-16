#!/usr/bin/env node
/**
 * Write responsive WebPs for product photos, the home posters, the shop
 * banner, and the crew photo. Product pages and cards reference these paths.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(root, 'public/assets/products')
const dimensionsPath = join(root, 'src/data/product-image-dimensions.json')
const PRODUCT_WIDTHS = [320, 480, 640, 800]
const WEBP_QUALITY = 52

async function writeWebp(input, dest, width) {
  await mkdir(dirname(dest), { recursive: true })
  await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toFile(dest)
}

async function writeVariantSet(inputPath, variants) {
  const input = await readFile(inputPath)
  await Promise.all(variants.map(({ width, dest }) => writeWebp(input, dest, width)))
}

export async function resizeProductImages() {
  const files = (await readdir(sourceDir)).filter((name) => /\.(jpe?g|png)$/i.test(name))
  const dimensions = {}

  for (const name of files) {
    const source = join(sourceDir, name)
    const input = await readFile(source)
    const meta = await sharp(input).metadata()
    if (!meta.width || !meta.height) continue

    dimensions[name] = { width: meta.width, height: meta.height }
    const base = name.replace(/\.(jpe?g|png)$/i, '')

    await Promise.all(
      PRODUCT_WIDTHS.map((width) =>
        writeWebp(input, join(sourceDir, `w${width}`, `${base}.webp`), width),
      ),
    )
  }

  await writeVariantSet(join(root, 'public/assets/home/videos/hero-poster.jpg'), [
    { width: 960, dest: join(root, 'public/assets/home/videos/hero-poster-960.webp') },
    { width: 1280, dest: join(root, 'public/assets/home/videos/hero-poster-1280.webp') },
  ])
  await writeVariantSet(join(root, 'public/assets/home/videos/course-poster.jpg'), [
    { width: 960, dest: join(root, 'public/assets/home/videos/course-poster-960.webp') },
    { width: 1280, dest: join(root, 'public/assets/home/videos/course-poster-1280.webp') },
  ])
  await writeVariantSet(join(root, 'public/assets/shop/banner.jpg'), [
    { width: 640, dest: join(root, 'public/assets/shop/banner-640.webp') },
    { width: 960, dest: join(root, 'public/assets/shop/banner-960.webp') },
    { width: 1200, dest: join(root, 'public/assets/shop/banner-1200.webp') },
  ])
  await writeVariantSet(join(root, 'public/assets/home/crew.jpg'), [
    { width: 768, dest: join(root, 'public/assets/home/crew.webp') },
  ])

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
