/**
 * One-shot helper used to enrich product-catalog.json with subcategories,
 * key features, and dimensions pulled from sundayrollsgolf.com.
 * Re-run only if regenerating catalog fields from scratch.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = join(root, 'src/data/product-catalog.json')

const standardDf3 = {
  keyFeatures: [
    {
      label: 'Precision Fit',
      text: 'Designed for the L.A.B. DF3 putter',
    },
    {
      label: 'Premium Protection',
      text: 'Soft velvet lining cushions your putter and prevents damage',
    },
    {
      label: 'Durable Construction',
      text: 'Reinforced stitching, magnetic closure and quality materials built for everyday play',
    },
    {
      label: 'Designed in the USA',
      text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
    },
  ],
  dimensionsDisplay: '4.625 in. (Length) × 5 in. (Width)',
  dimensions: { length: '4.625', width: '5', height: '2', unit: 'in' },
}

const byHandle = {
  'retro-roller-grey': {
    subcategory: 'center-shafted',
    ...standardDf3,
  },
  'retro-roller-purple': {
    subcategory: 'center-shafted',
    ...standardDf3,
  },
  'retro-roller-yellow': {
    subcategory: 'center-shafted',
    ...standardDf3,
  },
  'flagstick-fuel': {
    subcategory: 'center-shafted',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Designed specifically for the L.A.B. DF3 putter',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, a secure magnetic closure, and premium materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '4.625 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.625', width: '5', height: '2', unit: 'in' },
  },
  'the-corduroy': {
    subcategory: 'center-shafted',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Designed specifically for the L.A.B. DF3 putter and other center-shaft mallet putters',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, a secure magnetic closure, and premium materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '4.625 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.625', width: '5', height: '2', unit: 'in' },
  },
  'sunday-stripes': {
    subcategory: 'center-shafted',
    keyFeatures: [
      {
        label: 'Classic Aesthetic',
        text: 'Premium seersucker fabric provides a textured, high-end look that stands out in a sea of synthetic covers',
      },
      {
        label: 'Artisan Embroidery',
        text: 'High-stitch count graphic of the "Skipper" adds a unique, collector-grade personality to your gear',
      },
      {
        label: 'Plush Interior',
        text: 'A soft, protective lining shields your putter from dings, scratches, and the elements, with a premium magnetic closure',
      },
      {
        label: 'Tailored Fit',
        text: 'Specifically contoured for mallet-style putters to ensure a secure, no-slip closure during your round',
      },
    ],
    dimensionsDisplay: '4.625 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.625', width: '5', height: '2', unit: 'in' },
  },
  'the-birdie-machine': {
    subcategory: 'center-shafted',
    ...standardDf3,
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Designed for the L.A.B. DF3 putter',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, magnetic closure and quality materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
  },
  'the-breakfast-roller': {
    subcategory: 'center-shafted',
    ...standardDf3,
  },
  'mallet-retro-roller-white': {
    subcategory: 'mallet',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Mallet putter specifically the TaylorMade Spider and other similar mallet-style putters',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, magnetic closure and quality materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '4.375 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.375', width: '5', height: '2', unit: 'in' },
  },
  'mallet-retro-roller-grey': {
    subcategory: 'mallet',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Mallet putter specifically the TaylorMade Spider and other similar mallet-style putters',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, magnetic closure and quality materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '4.375 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.375', width: '5', height: '2', unit: 'in' },
  },
  'mallet-sunday-stripes': {
    subcategory: 'mallet',
    keyFeatures: [
      {
        label: 'Classic Aesthetic',
        text: 'Premium seersucker fabric provides a textured, high-end look that stands out in a sea of synthetic covers',
      },
      {
        label: 'Artisan Embroidery',
        text: 'High-stitch count graphic of the "Skipper" adds a unique, collector-grade personality to your gear',
      },
      {
        label: 'Plush Interior',
        text: 'A soft, protective lining shields your putter from dings, scratches, and the elements, with a premium magnetic closure',
      },
      {
        label: 'Tailored Fit',
        text: 'Specifically contoured for mallet-style heel-shafted putters to ensure a secure, no-slip closure during your round',
      },
    ],
    dimensionsDisplay: '4.375 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.375', width: '5', height: '2', unit: 'in' },
  },
  'mallet-the-corduroy': {
    subcategory: 'mallet',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Designed specifically for the TaylorMade Spider and other similar mallet putters',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, a secure magnetic closure, and premium materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '4.375 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.375', width: '5', height: '2', unit: 'in' },
  },
  'sunny-side-up': {
    subcategory: 'oz-mezz',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Designed specifically for the L.A.B. OZ1i and Mezz.1',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, a secure magnetic closure, and premium materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '3.25 in. (Length) × 4.25 in. (Width)',
    dimensions: { length: '3.25', width: '4.25', height: '2', unit: 'in' },
  },
  'coin-collector': {
    subcategory: 'oz-mezz',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Designed specifically for the L.A.B. OZ1i and Mezz.1',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter and prevents damage',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, a secure magnetic closure, and premium materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '3.25 in. (Length) × 4.25 in. (Width)',
    dimensions: { length: '3.25', width: '4.25', height: '2', unit: 'in' },
  },
  'the-doodle': {
    subcategory: 'center-shafted',
    description:
      'Bring a crowd of quirky characters to the green with this premium center shafted putter cover. Drawn by one of our founders, this chaotic doodle art and playful little monsters keep your putter protected while injecting a heavy dose of personality into your bag. It features dense, high-quality embroidery packed with an all-over cast of wacky, friendly little creatures in a sleek monochrome and grey color scheme.',
    sellingMethod: 'By the item',
    productToken: 'Headcover',
    itemWeight: '8',
    itemWeightUnit: 'oz',
    keyFeatures: [
      {
        label: 'Precision Fit',
        text: 'Custom-designed for the L.A.B. DF3 center-shafted putter',
      },
      {
        label: 'Premium Protection',
        text: 'Soft velvet lining cushions your putter head and prevents dings or scratches',
      },
      {
        label: 'Durable Construction',
        text: 'Reinforced stitching, secure magnetic closure, and high-grade materials built for everyday play',
      },
      {
        label: 'Designed in the USA',
        text: 'Thoughtful craftsmanship with a playful, collector-worthy aesthetic',
      },
    ],
    dimensionsDisplay: '4.625 in. (Length) × 5 in. (Width)',
    dimensions: { length: '4.625', width: '5', height: '2', unit: 'in' },
  },
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

const enriched = catalog.map((product) => {
  const extras = byHandle[product.handle]
  if (!extras) {
    throw new Error(`Missing enrichment for ${product.handle}`)
  }

  return {
    ...product,
    ...extras,
    category: 'headcovers',
  }
})

writeFileSync(catalogPath, `${JSON.stringify(enriched, null, 2)}\n`)
console.log(`Enriched ${enriched.length} products`)
