import type { Skeleton, V3 } from './old-man-rig-math'

/*
 * Poses for the old man's rig, in his body space (f forward, y down, s to his right, pelvis
 * at the origin; about 95 units from boot soles to cap). Left/right are his own.
 */

export const STAND: Skeleton = {
  neck: [3, -44, 0],
  shoulderL: [0, -35, -9], shoulderR: [0, -35, 9],
  elbowL: [-1, -18, -11], elbowR: [-1, -18, 11],
  handL: [2, -3, -11], handR: [2, -3, 11],
  hipL: [0, 0, -6], hipR: [0, 0, 6],
  kneeL: [2, 24, -6], kneeR: [2, 24, 6],
  ankleL: [0, 46, -6], ankleR: [0, 46, 6],
  toeL: [9, 47, -7], toeR: [9, 47, 7],
}

/** Hands tucked into his jacket pockets, elbows out. */
export const POCKETS: Skeleton = {
  ...STAND,
  elbowL: [-6, -17, -14], handL: [7, -2, -10],
  elbowR: [-6, -17, 14], handR: [7, -2, 10],
}

type Legs = Pick<Skeleton, 'kneeL' | 'ankleL' | 'toeL' | 'kneeR' | 'ankleR' | 'toeR'>

// One stride, walking forward: left leg forward, right passing, right forward, left passing.
const STRIDE_LEGS: Legs[] = [
  { kneeL: [9, 23, -6], ankleL: [12, 45, -6], toeL: [21, 47, -6], kneeR: [-4, 24, 6], ankleR: [-13, 43, 6], toeR: [-6, 48, 6] },
  { kneeL: [1, 25, -6], ankleL: [-2, 46, -6], toeL: [7, 48, -6], kneeR: [7, 21, 6], ankleR: [-2, 40, 6], toeR: [7, 43, 6] },
  { kneeL: [-4, 24, -6], ankleL: [-13, 43, -6], toeL: [-6, 48, -6], kneeR: [9, 23, 6], ankleR: [12, 45, 6], toeR: [21, 47, 6] },
  { kneeL: [7, 21, -6], ankleL: [-2, 40, -6], toeL: [7, 43, -6], kneeR: [1, 25, 6], ankleR: [-2, 46, 6], toeR: [7, 48, 6] },
]
/** Body rise at each stride beat: up as the legs pass. */
export const STRIDE_BOB = [0, -2.5, 0, -2.5]

/** A stride beat with his hands in his pockets. */
export function strollStep(beat: number): Skeleton {
  const legs = STRIDE_LEGS[beat % 4]
  const lean: V3 = [5, -44, 0]
  return { ...POCKETS, ...legs, neck: lean }
}

/**
 * A stride beat carrying a club in his right hand, arms swinging against the legs.
 * The club hangs from his hand, its head trailing just off the ground.
 */
export function carryStep(beat: number): Skeleton {
  const legs = STRIDE_LEGS[beat % 4]
  const swing = [1, 0, -1, 0][beat % 4]
  const handL: V3 = [-8 * swing + 2, -4, -11]
  const handR: V3 = [8 * swing + 3, -4, 11]
  return {
    ...STAND,
    ...legs,
    neck: [4, -44, 0],
    elbowL: [-4 * swing - 1, -19, -11],
    handL,
    elbowR: [4 * swing, -19, 11],
    handR,
    tip: [handR[0] + 16, 40, 12],
  }
}

/** Standing with the club held down at his side. */
export const STAND_CLUB: Skeleton = { ...STAND, handR: [4, -3, 11], tip: [20, 40, 12] }

/**
 * Putting: bent over the ball, hands together low in front, the putter's head on the ground
 * just ahead of his toes. Back and through are a short pendulum from the shoulders.
 */
export const PUTT_ADDRESS: Skeleton = {
  ...STAND,
  neck: [19, -37, 0],
  shoulderL: [8, -31, -9],
  shoulderR: [8, -31, 9],
  elbowL: [11, -15, -8],
  elbowR: [11, -15, 8],
  handL: [16, -2, -2],
  handR: [16, -1, 2],
  kneeL: [8, 23, -7],
  kneeR: [8, 23, 7],
  ankleL: [0, 46, -7],
  ankleR: [0, 46, 7],
  toeL: [9, 47, -8],
  toeR: [9, 47, 8],
  tip: [25, 50, 0],
}
export const PUTT_BACK: Skeleton = {
  ...PUTT_ADDRESS,
  elbowL: [7, -15, -8],
  elbowR: [7, -15, 8],
  handL: [10, -2, -2],
  handR: [10, -1, 2],
  tip: [11, 48, 0],
}
export const PUTT_THROUGH: Skeleton = {
  ...PUTT_ADDRESS,
  neck: [18, -38, 0],
  elbowL: [15, -15, -8],
  elbowR: [15, -15, 8],
  handL: [22, -3, -2],
  handR: [22, -2, 2],
  tip: [40, 46, 0],
}
/** Upright, watching the putt roll, putter resting at his side. */
export const PUTT_WATCH: Skeleton = { ...STAND, handR: [5, -3, 11], tip: [13, 50, 12] }

/*
 * Putting face-on to the viewer (yaw 90): the same bent-over address, but the putter swings
 * across his body, back toward his right side and through toward his left, where the target is.
 */
export const FACE_PUTT_ADDRESS: Skeleton = {
  ...PUTT_ADDRESS,
  elbowL: [11, -15, -7],
  elbowR: [11, -15, 7],
  handL: [16, -2, -2],
  handR: [16, -1, 0],
  kneeL: [8, 23, -10],
  kneeR: [8, 23, 10],
  ankleL: [1, 46, -11],
  ankleR: [1, 46, 11],
  toeL: [10, 47, -13],
  toeR: [10, 47, 13],
  tip: [24, 50, 6],
}
export const FACE_PUTT_BACK: Skeleton = {
  ...FACE_PUTT_ADDRESS,
  shoulderL: [8, -29, -9],
  shoulderR: [8, -33, 9],
  elbowL: [11, -14, -4],
  elbowR: [11, -16, 10],
  handL: [15, -1, 4],
  handR: [15, -1, 6],
  tip: [22, 49, 20],
}
export const FACE_PUTT_THROUGH: Skeleton = {
  ...FACE_PUTT_ADDRESS,
  neck: [18, -38, 0],
  shoulderL: [8, -33, -9],
  shoulderR: [8, -29, 9],
  elbowL: [11, -16, -11],
  elbowR: [11, -14, 3],
  handL: [15, -3, -8],
  handR: [15, -2, -6],
  tip: [22, 47, -18],
}
