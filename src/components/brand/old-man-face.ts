import type { Pt } from './old-man-rig-math'

/*
 * The old man's head as three key drawings in the logo's style (profile, three-quarter and
 * straight-on), morphed between as he turns, the way a 2D animator draws a head turn. Each
 * feature has the same number of points in every drawing, so any angle in between is a
 * blend of its two neighbours; facing right is the same drawings mirrored.
 *
 * Coordinates are the logo trace's (logo pixels x 3), measured from his chin (OLD_MAN_CHIN),
 * so the profile drawing sits exactly over the traced logo head; the rig fades that exact
 * trace in as he comes side-on.
 */

export const FACE = {
  outline: '#4e5338',
  cap: '#af9865',
  skin: '#eec080',
  hair: '#f4e6c8',
  pipe: '#676842',
  smoke: '#cca86c',
} as const

export interface FacePart {
  d: string
  fill: string
  stroke: string
  width: number
  opacity: number
}

type Shape = readonly Pt[]

interface View {
  hairFar: Shape
  earFar: Shape
  face: Shape
  hairNear: Shape
  earNear: Shape
  crown: Shape
  brim: Shape
  eyeNear: Shape
  eyeFar: Shape
  browNear: Shape
  browFar: Shape
  mustache: Shape
  nose: Shape
  stem: Shape
  bowl: Shape
  smoke: Shape
}

/** A shape squeezed down to a point: for a feature that's out of sight in this view. */
const hidden = (x: number, y: number, count: number): Shape => Array.from({ length: count }, () => [x, y] as Pt)

// Side-on, facing left: drawn over the traced logo head.
const PROFILE: View = {
  hairFar: hidden(20, -60, 6),
  earFar: hidden(10, -40, 6),
  face: [[-41, -66], [-47, -56], [-43, -46], [-43, -24], [-41, -16], [-35, -2], [-17, 4], [8, 4], [21, -10], [50, -40], [48, -60], [0, -68]],
  hairNear: [[16, -64], [48, -66], [56, -54], [50, -42], [36, -48], [20, -54]],
  earNear: [[27, -50], [38, -53], [43, -42], [40, -29], [31, -27], [26, -38]],
  crown: [[-50, -72], [-47, -84], [-37, -96], [-19, -107], [8, -112], [38, -109], [55, -97], [62, -77], [55, -63], [0, -66]],
  brim: [[-60, -77], [-40, -78], [-20, -71], [-22, -65], [-44, -67], [-58, -71]],
  eyeNear: [[-21, -54], [-17.5, -47], [-21, -40], [-24.5, -47]],
  eyeFar: hidden(-30, -47, 4),
  browNear: [[-34, -56], [-25, -60], [-13, -59]],
  browFar: hidden(-34, -56, 3),
  // The logo's big white mustache sweeps back from under his nose toward his cheek.
  mustache: [[-48, -26], [-38, -29], [-27, -29], [-19, -24], [-11, -13], [-20, -11], [-30, -14], [-38, -17], [-44, -11], [-51, -17]],
  nose: [[-40, -48], [-48, -46], [-54, -40], [-54, -32], [-48, -27], [-41, -28], [-37, -33], [-37, -42]],
  stem: [[-38, -15], [-55, -12], [-71, -10]],
  bowl: [[-96, -33], [-69, -33], [-69, -14], [-75, -5], [-90, -5], [-96, -14]],
  smoke: [[-84, -43], [-89, -53], [-82, -62], [-87, -72]],
}

// Three-quarters, facing left and toward the viewer.
const THREE_QUARTER: View = {
  hairFar: hidden(-12, -62, 6),
  earFar: hidden(-18, -44, 6),
  face: [[-38, -66], [-44, -56], [-44, -44], [-42, -28], [-38, -12], [-30, -2], [-12, 4], [10, 3], [24, -8], [33, -28], [35, -54], [-4, -69]],
  hairNear: [[14, -64], [42, -68], [52, -56], [48, -42], [36, -48], [20, -54]],
  earNear: [[24, -50], [34, -54], [39, -44], [37, -31], [29, -28], [23, -38]],
  crown: [[-56, -68], [-58, -82], [-48, -100], [-26, -111], [2, -114], [28, -110], [45, -98], [49, -80], [45, -65], [-6, -63]],
  brim: [[-68, -73], [-32, -78], [12, -72], [10, -65], [-28, -69], [-64, -67]],
  eyeNear: [[-12, -55], [-8.5, -48], [-12, -41], [-15.5, -48]],
  eyeFar: [[-39, -54], [-37, -48], [-39, -42], [-41, -48]],
  browNear: [[-23, -56], [-13, -60], [-1, -58]],
  browFar: [[-35, -58], [-41, -61], [-46, -59]],
  mustache: [[-48, -22], [-36, -27], [-20, -27], [-6, -23], [8, -10], [-6, -11], [-20, -15], [-34, -15], [-44, -8], [-52, -14]],
  nose: [[-30, -44], [-38, -42], [-44, -36], [-44, -28], [-38, -23], [-30, -23], [-25, -28], [-25, -37]],
  stem: [[-36, -14], [-50, -9], [-62, -5]],
  bowl: [[-82, -26], [-62, -26], [-62, -8], [-66, -1], [-78, -1], [-82, -8]],
  smoke: [[-72, -34], [-76, -44], [-70, -52], [-74, -62]],
}

// Straight on. Everything is symmetric but the pipe, which he holds in the corner of his mouth.
const FRONT: View = {
  hairFar: [[-34, -64], [-50, -68], [-58, -56], [-54, -42], [-44, -48], [-36, -56]],
  earFar: [[-37, -53], [-46, -56], [-51, -46], [-49, -33], [-42, -29], [-37, -39]],
  face: [[-35, -66], [-40, -54], [-40, -42], [-39, -28], [-36, -14], [-26, -2], [-10, 4], [10, 4], [26, -2], [36, -14], [40, -42], [0, -69]],
  hairNear: [[34, -64], [50, -68], [58, -56], [54, -42], [44, -48], [36, -56]],
  earNear: [[37, -53], [46, -56], [51, -46], [49, -33], [42, -29], [37, -39]],
  crown: [[-52, -66], [-57, -80], [-49, -99], [-26, -111], [2, -115], [30, -111], [51, -99], [57, -80], [52, -66], [0, -62]],
  brim: [[-54, -69], [0, -76], [54, -69], [52, -62], [0, -67], [-52, -62]],
  eyeNear: [[15, -54], [18.5, -47], [15, -40], [11.5, -47]],
  eyeFar: [[-15, -54], [-11.5, -47], [-15, -40], [-18.5, -47]],
  browNear: [[6, -58], [15, -62], [25, -60]],
  browFar: [[-6, -58], [-15, -62], [-25, -60]],
  mustache: [[-24, -27], [-12, -30], [0, -28], [12, -30], [24, -27], [38, -14], [20, -12], [0, -15], [-20, -12], [-38, -14]],
  nose: [[5, -47], [-5, -47], [-10, -41], [-10, -32], [-5, -27], [5, -27], [10, -32], [10, -41]],
  stem: [[-14, -14], [-26, -4], [-36, 2]],
  bowl: [[-56, -10], [-36, -10], [-36, 6], [-40, 12], [-52, 12], [-56, 6]],
  smoke: [[-46, -16], [-51, -26], [-45, -34], [-50, -44]],
}

const lerpShape = (a: Shape, b: Shape, f: number): Shape => a.map(([x, y], i) => [x + (b[i][0] - x) * f, y + (b[i][1] - y) * f] as Pt)
const smooth = (f: number) => f * f * (3 - 2 * f)

function blend(yaw: number): View {
  const t = Math.max(0, Math.min(90, yaw))
  const [a, b, f] = t <= 45 ? [PROFILE, THREE_QUARTER, t / 45] : [THREE_QUARTER, FRONT, (t - 45) / 45]
  const out = {} as Record<keyof View, Shape>
  for (const key of Object.keys(PROFILE) as (keyof View)[]) out[key] = lerpShape(a[key], b[key], smooth(f))
  return out as View
}

const n = (v: number) => Math.round(v * 10) / 10
const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`

/** A smooth closed outline through the points (curves through the midpoints). */
function blob(points: Shape): string {
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = `M${pt(mid(points[points.length - 1], points[0]))}`
  points.forEach((p, i) => {
    d += ` Q${pt(p)} ${pt(mid(p, points[(i + 1) % points.length]))}`
  })
  return `${d} Z`
}

/** A smooth open line through the points. */
function curve(points: Shape): string {
  let d = `M${pt(points[0])}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const next: Pt = i === points.length - 2 ? points[i + 1] : [(p[0] + points[i + 1][0]) / 2, (p[1] + points[i + 1][1]) / 2]
    d += ` Q${pt(p)} ${pt(next)}`
  }
  return d
}

/**
 * Every part of his head for one yaw (0 faces left, 90 the viewer, 180 right), back to
 * front. The list never changes length or order.
 */
export function faceParts(yaw: number): FacePart[] {
  const mirrored = yaw > 90
  const v = blend(mirrored ? 180 - yaw : yaw)
  const flip = (s: Shape): Shape => (mirrored ? s.map(([x, y]) => [-x, y] as Pt) : s)
  const side = Math.abs(Math.cos((yaw * Math.PI) / 180))
  const W = 5
  // Mirroring swaps the pipe to his other mouth corner as he passes face-on, so it ducks out
  // of sight for those few degrees; nothing rests there.
  const pipe = Math.min(1, Math.max(0, (side - 0.03) / 0.09))

  // A feature squeezed out of sight would still show as a dot of outline, so it fades as it shrinks.
  const size = (s: Shape) => {
    const xs = s.map(([x]) => x)
    const ys = s.map(([, y]) => y)
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  }
  const shown = (s: Shape) => Math.min(1, size(s) / 5)

  const parts: FacePart[] = []
  const shape = (s: Shape, fill: string, width = W, opacity = 1) =>
    parts.push({ d: blob(flip(s)), fill, stroke: FACE.outline, width, opacity: n(opacity * shown(s) * 100) / 100 })
  const stroke = (s: Shape, color: string, width: number, opacity = 1) =>
    parts.push({ d: curve(flip(s)), fill: 'none', stroke: color, width, opacity: n(opacity * shown(s) * 100) / 100 })

  shape(v.hairFar, FACE.hair)
  shape(v.earFar, FACE.skin)
  shape(v.face, FACE.skin)
  shape(v.hairNear, FACE.hair)
  shape(v.earNear, FACE.skin)
  shape(v.crown, FACE.cap, 5.5)
  shape(v.brim, FACE.cap, 5.5)
  shape(v.eyeFar, FACE.outline, 0)
  shape(v.eyeNear, FACE.outline, 0)
  stroke(v.browFar, FACE.outline, 6)
  stroke(v.browNear, FACE.outline, 6)
  shape(v.mustache, FACE.hair)
  shape(v.nose, FACE.skin)
  stroke(v.stem, FACE.outline, 9, pipe)
  stroke(v.stem, FACE.pipe, 4, pipe)
  shape(v.bowl, FACE.pipe, W, pipe)
  // Smoke drifts up beside him; straight on it would cross his face, so it thins out there.
  stroke(v.smoke, FACE.smoke, 4, pipe * (0.2 + 0.7 * side))
  return parts
}
