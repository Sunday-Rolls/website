/** Inter 14px widths, measured so the homepage marquee matches real wrapping. */
const CHAR_WIDTHS: Record<string, number> = {
  ' ': 3.94,
  '“': 6.17,
  '”': 6.17,
  "'": 4.2,
  '’': 3.65,
  '.': 4.03,
  ',': 4.03,
  '!': 4.03,
  ':': 4.03,
  '-': 6.44,
  '—': 14,
  '…': 12.1,
  '&': 9.02,
  '/': 5.04,
  '(': 5.11,
  ')': 5.11,
  '0': 8.83,
  '1': 5.69,
  '3': 8.65,
  '9': 8.68,
  a: 7.86,
  b: 8.57,
  c: 8,
  d: 8.57,
  e: 8.16,
  f: 5.18,
  g: 8.59,
  h: 8.28,
  i: 3.39,
  j: 3.39,
  k: 7.68,
  l: 3.39,
  m: 12.26,
  n: 8.27,
  o: 8.39,
  p: 8.57,
  q: 8.57,
  r: 5.27,
  s: 7.39,
  t: 4.58,
  u: 8.28,
  v: 7.87,
  w: 11.46,
  x: 7.64,
  y: 7.87,
  z: 7.73,
  A: 9.66,
  B: 9.16,
  C: 10.23,
  D: 10.1,
  E: 8.42,
  F: 8.26,
  G: 10.45,
  H: 10.4,
  I: 3.76,
  L: 7.92,
  M: 12.65,
  N: 10.55,
  P: 8.94,
  Q: 10.71,
  R: 9.01,
  S: 8.98,
  T: 9.04,
  V: 9.66,
  W: 13.79,
  Y: 9.5,
  Z: 8.8,
  '🔥': 18,
}

/** Wider than a typical letter, so an unmapped glyph cannot sneak onto a third line. */
const FALLBACK_CHAR_WIDTH = 14

/** 20rem card minus 1rem of padding on each side, at a 16px root. */
export const MARQUEE_QUOTE_WIDTH_PX = 288

const MAX_LINES = 2

function textWidth(value: string) {
  let width = 0
  for (const char of value) width += CHAR_WIDTHS[char] ?? FALLBACK_CHAR_WIDTH
  return width
}

/** How many lines the quoted review occupies in a marquee card. */
export function marqueeQuoteLineCount(text: string) {
  const words = `“${text.trim()}”`.split(/\s+/).filter(Boolean)
  let lines = 1
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (textWidth(next) <= MARQUEE_QUOTE_WIDTH_PX) {
      line = next
      continue
    }
    lines += 1
    line = word
  }

  return lines
}

export function fitsMarqueeCard(text: string) {
  const trimmed = text.trim()
  return trimmed.length > 0 && marqueeQuoteLineCount(trimmed) <= MAX_LINES
}

export function selectMarqueeReviews<T extends { text: string }>(reviews: T[]) {
  return reviews.filter((review) => fitsMarqueeCard(review.text))
}
