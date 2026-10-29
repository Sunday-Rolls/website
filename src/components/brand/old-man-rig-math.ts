/*
 * The maths behind the old man's rig: his skeleton's types, and how body space projects onto
 * the screen for the way he's facing. See OldManRig.tsx.
 */

export type V3 = readonly [f: number, y: number, s: number]
export type Pt = readonly [number, number]

export interface Skeleton {
  neck: V3
  shoulderL: V3
  shoulderR: V3
  elbowL: V3
  elbowR: V3
  handL: V3
  handR: V3
  hipL: V3
  hipR: V3
  kneeL: V3
  kneeR: V3
  ankleL: V3
  ankleR: V3
  toeL: V3
  toeR: V3
  /** The head of whatever his right hand holds (a club), if anything. */
  tip?: V3
}

export interface RigPose {
  /** Pelvis position on screen, in scene units. */
  root: Pt
  /** Which way he faces: 0 left, 90 toward the viewer, 180 right. */
  yaw: number
  joints: Skeleton
}

export type RigFrame = readonly [time: number, pose: RigPose, ease: string]


// He's short in the leg, like the logo: poses are written with long legs, and the rig
// shortens them and drops his pelvis to keep his boots on the ground.
export const LEGS = 0.72
export const DROP = 48 * (1 - LEGS)

export interface View {
  x: (p: V3) => Pt
  depth: (p: V3) => number
  yaw: number
}

export function view(pose: RigPose, scale: number): View {
  const yaw = (pose.yaw * Math.PI) / 180
  const fx = -Math.cos(yaw)
  const sx = -Math.sin(yaw)
  return {
    x: ([f, y, s]) => [pose.root[0] + (f * fx + s * sx) * scale, pose.root[1] + (y + DROP) * scale],
    depth: ([f, , s]) => f * Math.sin(yaw) - s * Math.cos(yaw),
    yaw: pose.yaw,
  }
}


/** Where the tip of what he's holding is, on screen, at each frame given. */
export function rigTip(frames: readonly RigFrame[], scale: number): (Pt | null)[] {
  return frames.map(([, pose]) => (pose.joints.tip ? view(pose, scale).x([pose.joints.tip[0], pose.joints.tip[1] - DROP, pose.joints.tip[2]]) : null))
}

