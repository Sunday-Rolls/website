import collectionsContent from '@/content/pages/collections.json'

export interface CollectionFaq {
  question: string
  answer: string
}

export interface CollectionContent {
  slug: string
  /** Matches product.subcategory. */
  sectionId: string
  navLabel: string
  meta: { title: string; description: string }
  header: { title: string; subtitle: string }
  intro: string[]
  faq: CollectionFaq[]
}

export const collections: CollectionContent[] = collectionsContent.collections

export function getCollection(slug: string | undefined): CollectionContent | undefined {
  return collections.find((collection) => collection.slug === slug)
}

export function getCollectionForSection(sectionId: string): CollectionContent | undefined {
  return collections.find((collection) => collection.sectionId === sectionId)
}

export function collectionPath(slug: string): string {
  return `/putter-covers/${slug}`
}
