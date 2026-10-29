import { brandAssets } from '@/assets'
import { OLD_MAN } from '@/components/brand/old-man'
import { OldManRig } from '@/components/brand/OldManRig'
import type { RigFrame, RigPose, Skeleton } from '@/components/brand/old-man-rig-math'
import { POCKETS, STAND, STRIDE_BOB, strollStep } from '@/components/brand/old-man-poses'

/*
 * The header logo's stroll, drawn into the logo mark's 0 0 79 120 box: the seated logo
 * springs off his log as the rig, lands on the header's bottom edge, pockets his hands,
 * walks a little left, turns round, walks back and hops up onto his log, where the logo
 * picture takes over again. One CSS pixel is 1/0.3 logo units.
 */

export const STROLL_S = 11.4
const DUR = `${STROLL_S}s`
// Sized so his head matches the logo's: rig head scale (0.42) x SCALE = logo units per trace unit.
const SCALE = 0.33214 / 0.42
const PX = 1 / 0.3
const EASE = '.4 0 .2 1'
const LINEAR = '0 0 1 1'

// Logo units: his seat, and where his pelvis sits standing on the header's bottom edge.
const SEAT: [number, number] = [58.8, 71.3]
const STAND_Y = 166.7 - 51 * SCALE
const LAND_X = SEAT[0] - 6 * PX

const SIT: Skeleton = {
  ...STAND,
  neck: [8, -43, 0],
  elbowL: [8, -20, -11], handL: [20, -8, -9],
  elbowR: [8, -20, 11], handR: [20, -8, 9],
  kneeL: [24, 2, -6], ankleL: [22, 25, -6], toeL: [30, 27, -6],
  kneeR: [24, 2, 6], ankleR: [22, 25, 6], toeR: [30, 27, 6],
}
const TUCK: Skeleton = {
  ...SIT,
  elbowL: [2, -24, -13], handL: [10, -30, -12],
  elbowR: [2, -24, 13], handR: [10, -30, 12],
  kneeL: [18, -6, -6], ankleL: [8, 15, -6], toeL: [17, 17, -6],
  kneeR: [18, -6, 6], ankleR: [8, 15, 6], toeR: [17, 17, 6],
}
const CROUCH: Skeleton = {
  ...STAND,
  neck: [9, -42, 0],
  kneeL: [13, 18, -6], ankleL: [2, 39, -6], toeL: [11, 41, -6],
  kneeR: [13, 18, 6], ankleR: [2, 39, 6], toeR: [11, 41, 6],
}

const at = (x: number, y: number, yaw: number, joints: Skeleton): RigPose => ({ root: [x, y], yaw, joints })

function walk(t0: number, t1: number, x0: number, x1: number, yaw: number): RigFrame[] {
  const frames: RigFrame[] = []
  const beats = Math.max(1, Math.round((t1 - t0) / 0.2))
  for (let i = 1; i <= beats; i++) {
    const last = i === beats
    const beat = (i + 1) % 4
    frames.push([
      t0 + ((t1 - t0) * i) / beats,
      at(x0 + ((x1 - x0) * i) / beats, STAND_Y + (last ? 0 : STRIDE_BOB[beat] * SCALE), yaw, last ? POCKETS : strollStep(beat)),
      LINEAR,
    ])
  }
  return frames
}

const LEFT_X = LAND_X - 16 * PX
const PEAK: [number, number] = [SEAT[0] - 3 * PX, SEAT[1] - 6 * PX]
// When he's back under his log and springs up onto it.
const BACK_ON_LOG = 10.9

const FRAMES: RigFrame[] = [
  [0, at(SEAT[0], SEAT[1], 0, SIT), LINEAR],
  [0.35, at(SEAT[0], SEAT[1], 0, SIT), LINEAR],
  [0.62, at(PEAK[0], PEAK[1], 0, TUCK), '.2 .6 .4 1'],
  [0.95, at(LAND_X, STAND_Y + 7, 0, CROUCH), '.5 0 .9 .5'],
  [1.3, at(LAND_X, STAND_Y, 0, STAND), EASE],
  [1.45, at(LAND_X, STAND_Y, 0, STAND), LINEAR],
  [1.95, at(LAND_X, STAND_Y, 0, POCKETS), EASE],
  [2.1, at(LAND_X, STAND_Y, 0, POCKETS), LINEAR],
  // A few steps left, turn round, and back to the log.
  ...walk(2.1, 4.9, LAND_X, LEFT_X, 0),
  [5.1, at(LEFT_X, STAND_Y, 0, POCKETS), LINEAR],
  [5.8, at(LEFT_X, STAND_Y, 180, POCKETS), '.45 0 .4 1'],
  ...walk(5.8, 8.6, LEFT_X, LAND_X, 180),
  [8.8, at(LAND_X, STAND_Y, 180, POCKETS), LINEAR],
  [9.5, at(LAND_X, STAND_Y, 0, POCKETS), '.45 0 .4 1'],
  [9.9, at(LAND_X, STAND_Y, 0, STAND), EASE],
  [10.15, at(LAND_X, STAND_Y + 7, 0, CROUCH), EASE],
  [10.45, at(PEAK[0], PEAK[1], 0, TUCK), '.2 .6 .4 1'],
  [BACK_ON_LOG, at(SEAT[0], SEAT[1], 0, SIT), '.5 0 .5 1'],
  [STROLL_S, at(SEAT[0], SEAT[1], 0, SIT), LINEAR],
]

const swap = (t0: number, t1: number, during: '0' | '1') => {
  const outside = during === '1' ? '0' : '1'
  return (
    <animate
      attributeName="opacity"
      dur={DUR}
      values={`${outside};${during};${outside}`}
      keyTimes={`0;${(t0 / STROLL_S).toFixed(4)};${(t1 / STROLL_S).toFixed(4)}`}
      calcMode="discrete"
      fill="freeze"
    />
  )
}

// The logo picture in VectorCraft trace units, for the end grain of his log.
const LOGO_TO_TRACE = 'translate(4.0035 7.1645) scale(0.16607)'
const LOGO_BOX = { x: -24.11, y: -43.14, width: 475.7, height: 722.6 }

/** The stroll, drawn into the logo mark's box; mount it to play once. */
export function StrollingRig({ clipId }: { clipId: string }) {
  return (
    <g>
      {/* the seated logo, until he springs off and once he's back */}
      <image href={brandAssets.logoMark} x="0" y="0" width="79" height="120" preserveAspectRatio="none">
        {swap(0.35, BACK_ON_LOG, '0')}
      </image>

      {/* his log stays while he's away: the logo's end grain on a drawn trunk */}
      <g opacity="0">
        {swap(0.35, BACK_ON_LOG, '1')}
        <g transform={LOGO_TO_TRACE}>
          <defs>
            <clipPath id={clipId}>
              <rect x="296" y="438" width="90" height="105" />
            </clipPath>
          </defs>
          <path
            d="M200 448 C200 438 210 432 222 432 L330 432 L330 532 L222 532 C210 532 200 526 200 516 Z"
            fill="#837449"
            stroke={OLD_MAN.outline}
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <path d="M222 466 H300 M240 500 H312" stroke={OLD_MAN.outline} strokeWidth="6" strokeLinecap="round" opacity="0.6" />
          <image href={brandAssets.logoMark} {...LOGO_BOX} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
        </g>
      </g>

      <g opacity="0">
        {swap(0.35, BACK_ON_LOG, '1')}
        <OldManRig frames={FRAMES} dur={STROLL_S} scale={SCALE} />
      </g>
    </g>
  )
}
