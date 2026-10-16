import reviewsData from '@/data/reviews.json'
import { withInferredProductHandle } from '@/lib/reviews'
import type { ProductReview } from '@/types/content'

const reviewItems = ((reviewsData.items ?? []) as ProductReview[]).map(
  withInferredProductHandle,
)

export function getReviewItems(): ProductReview[] {
  return reviewItems
}
