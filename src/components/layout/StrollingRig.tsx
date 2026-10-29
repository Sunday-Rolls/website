import { useId } from 'react'
import { brandAssets } from '@/assets'
import { OLD_MAN } from '@/components/brand/old-man'
import { OldManRig } from '@/components/brand/OldManRig'
import { rigTip, view, type Pt, type RigFrame, type RigPose, type Skeleton } from '@/components/brand/old-man-rig-math'
import {
  FACE_PUTT_ADDRESS,
  FACE_PUTT_BACK,
  FACE_PUTT_THROUGH,
  PUTT_WATCH,
  STAND,
  STRIDE_BOB,
  strollStep,
} from '@/components/brand/old-man-poses'

/*
 * The header logo's putt, drawn into the logo mark's 0 0 79 120 box: still sitting on his log,
 * the old man holds out a ball and drops it, and it bounces a couple of times along the
 * header's bottom edge. He springs off the log as the rig, walks over to the ball, turns to
 * face the viewer, pulls out a putter and rolls it along the bottom of the header to the cart.
 * PuttToCart (below) draws that ball and the catcher the cart icon lowers for it, across the
 * whole header, on the same clock. Then he puts the putter away, walks back and hops onto his
 * log, where the logo picture takes over again. One CSS pixel is 1/0.3 logo units.
 */

export const STROLL_S = 14.75
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
/** Sitting, holding the ball out in his near (left) hand, looking down at it. */
const SIT_HOLD: Skeleton = { ...SIT, neck: [10, -42, 0], elbowL: [14, -24, -12], handL: [27, -23, -11] }
/** The hand opens: a little lift as the ball drops away. */
const SIT_LET_GO: Skeleton = { ...SIT_HOLD, handL: [27, -26, -11] }
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

const PEAK: [number, number] = [SEAT[0] - 3 * PX, SEAT[1] - 6 * PX]
// Facing: 0 left (as he sits), 180 right (walking to the ball), 90 square to the viewer to putt,
// and turned a touch toward the cart to watch it roll.
const YAW = { left: 0, right: 180, face: 90, watch: 118 }

// The walk: STEP seconds a beat, and how far his pelvis moves each beat so the planted boot stays put.
const STEP = 0.3
const STRIDE = 12.5 * SCALE
const WALK_BEATS = 6
// Where he stands to putt: the beats plus the closing step back to standing.
const ADDRESS_X = LAND_X + (WALK_BEATS + 1) * STRIDE

/** Seconds into the scene. */
const T = {
  swap: 0.35,
  holdOut: 0.75,
  drop: 1.0,
  hop: 2.25,
  walkOut: 3.65,
  address: 6.5,
  strike: 7.4,
  arrive: 9.6,
  reeled: 10.4,
  walkBack: 11.4,
}
const BACK_ON_LOG = 14.3

/** Strolling hands-in-pockets from `x0`, `dir` +1 to the right or -1 to the left, ending stood still. */
function walk(t0: number, x0: number, dir: 1 | -1, yaw: number): RigFrame[] {
  const frames: RigFrame[] = []
  for (let beat = 0; beat < WALK_BEATS; beat++) {
    const x = x0 + dir * (beat + 1) * STRIDE
    frames.push([t0 + (beat + 1) * STEP, at(x, STAND_Y + STRIDE_BOB[beat % 4] * SCALE, yaw, strollStep(beat)), LINEAR])
  }
  frames.push([t0 + (WALK_BEATS + 1) * STEP, at(x0 + dir * (WALK_BEATS + 1) * STRIDE, STAND_Y, yaw, STAND), '0 0 .4 1'])
  return frames
}

const FRAMES: RigFrame[] = [
  [0, at(SEAT[0], SEAT[1], YAW.left, SIT), LINEAR],
  [T.swap, at(SEAT[0], SEAT[1], YAW.left, SIT), LINEAR],
  // Hold the ball out and let it go.
  [T.holdOut, at(SEAT[0], SEAT[1], YAW.left, SIT_HOLD), EASE],
  [T.drop, at(SEAT[0], SEAT[1], YAW.left, SIT_HOLD), LINEAR],
  [T.drop + 0.12, at(SEAT[0], SEAT[1], YAW.left, SIT_LET_GO), EASE],
  [T.drop + 0.55, at(SEAT[0], SEAT[1], YAW.left, SIT), EASE],
  // Watch it bounce, then down off the log.
  [T.hop, at(SEAT[0], SEAT[1], YAW.left, SIT), LINEAR],
  [T.hop + 0.27, at(PEAK[0], PEAK[1], YAW.left, TUCK), '.2 .6 .4 1'],
  [T.hop + 0.6, at(LAND_X, STAND_Y + 7, YAW.left, CROUCH), '.5 0 .9 .5'],
  [T.hop + 0.95, at(LAND_X, STAND_Y, YAW.left, STAND), EASE],
  // Turn round and walk over to the ball.
  [T.walkOut, at(LAND_X, STAND_Y, YAW.right, STAND), '.45 0 .4 1'],
  ...walk(T.walkOut, LAND_X, 1, YAW.right),
  // Square up to the viewer and pull out the putter.
  [T.address - 0.35, at(ADDRESS_X, STAND_Y, YAW.face, STAND), '.45 0 .4 1'],
  [T.address, at(ADDRESS_X, STAND_Y, YAW.face, FACE_PUTT_ADDRESS), EASE],
  [T.address + 0.4, at(ADDRESS_X, STAND_Y, YAW.face, FACE_PUTT_ADDRESS), LINEAR],
  [T.strike - 0.2, at(ADDRESS_X, STAND_Y, YAW.face, FACE_PUTT_BACK), '.4 0 .6 1'],
  [T.strike, at(ADDRESS_X, STAND_Y, YAW.face, FACE_PUTT_ADDRESS), '.5 0 1 1'],
  [T.strike + 0.25, at(ADDRESS_X, STAND_Y, YAW.face, FACE_PUTT_THROUGH), '0 0 .4 1'],
  [T.strike + 0.9, at(ADDRESS_X, STAND_Y, YAW.face, FACE_PUTT_THROUGH), LINEAR],
  // Stand up and watch it go.
  [T.strike + 1.3, at(ADDRESS_X, STAND_Y, YAW.watch, PUTT_WATCH), EASE],
  [T.reeled + 0.2, at(ADDRESS_X, STAND_Y, YAW.watch, PUTT_WATCH), LINEAR],
  // Putter away, turn back toward his log and walk home.
  [T.reeled + 0.6, at(ADDRESS_X, STAND_Y, YAW.face, STAND), EASE],
  [T.walkBack, at(ADDRESS_X, STAND_Y, YAW.left, STAND), '.45 0 .4 1'],
  ...walk(T.walkBack, ADDRESS_X, -1, YAW.left),
  // Up onto the log.
  [BACK_ON_LOG - 0.55, at(LAND_X, STAND_Y + 7, YAW.left, CROUCH), EASE],
  [BACK_ON_LOG - 0.3, at(PEAK[0], PEAK[1], YAW.left, TUCK), '.2 .6 .4 1'],
  [BACK_ON_LOG, at(SEAT[0], SEAT[1], YAW.left, SIT), '.5 0 .5 1'],
  [STROLL_S, at(SEAT[0], SEAT[1], YAW.left, SIT), LINEAR],
]

const BALL_R = 2.2

/** Where his left hand is at a frame time, in logo units. */
const handAt = (t: number): Pt => {
  const [, pose] = FRAMES.find(([ft]) => ft === t)!
  return view(pose, SCALE).x(pose.joints.handL)
}

/** Where the ball sits when he strikes it, in logo units: just ahead of the putter's head. */
const BALL_START: Pt = (() => {
  const i = FRAMES.findIndex(([t]) => t === T.strike)
  const tip = rigTip(FRAMES, SCALE)[i] ?? [ADDRESS_X, 166]
  return [tip[0] + BALL_R * PX * 0.9, tip[1]]
})()

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
        <OldManRig frames={FRAMES} dur={STROLL_S} scale={SCALE} holdColor={OLD_MAN.outline} holdWeight={2.4} />
      </g>
    </g>
  )
}

export interface PuttGeometry {
  /** Header pixels: the logo mark's top-left corner and pixels per logo unit, the header's bottom edge, the cart icon. */
  logoLeft: number
  logoTop: number
  unit: number
  ground: number
  cartX: number
  cartY: number
  cartBottom: number
}

const CUP_W = 14
const CUP_H = 10
// Gravity, near enough: speeding up as it falls, slowing as it rises.
const FALL = '.55 .085 .68 .53'
const RISE = '.25 .46 .45 .94'

type Key = readonly [t: number, value: number, ease?: string]

/** One animated attribute through timed keys; each key's ease shapes the stretch leading to it. */
function Track({ attr, keys }: { attr: string; keys: Key[] }) {
  return (
    <animate
      attributeName={attr}
      dur={DUR}
      values={keys.map(([, v]) => v.toFixed(2)).join(';')}
      keyTimes={keys.map(([t]) => (t / STROLL_S).toFixed(4)).join(';')}
      calcMode="spline"
      keySplines={keys.slice(1).map(([, , ease]) => ease ?? LINEAR).join(';')}
      fill="freeze"
    />
  )
}

/**
 * The ball he drops and putts and the catcher the cart lowers for it, drawn over the whole
 * header in header pixels. Mount it with the rig so the two share a clock.
 */
export function PuttToCart({ g }: { g: PuttGeometry }) {
  const clipId = `putt-under-cart-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const kt = (...t: number[]) => t.map((v) => (v / STROLL_S).toFixed(4)).join(';')
  const px = ([x, y]: Pt): Pt => [g.logoLeft + x * g.unit, g.logoTop + y * g.unit]
  const ballX = px(BALL_START)[0]
  const rest = g.ground - BALL_R
  // The catcher is a scoop lying on its side, mouth open toward him, so the ball rolls
  // straight in. Raised, it's wholly inside the cart icon: everything above the icon's
  // bottom edge is clipped away, so it drops out of the cart and reels back into it.
  const raised = g.cartBottom - g.ground - 2
  const left = g.cartX - CUP_W / 2
  const right = g.cartX + CUP_W / 2
  const scoop = `M${left} ${g.ground - CUP_H} L${right - 4} ${g.ground - CUP_H} Q${right} ${g.ground - CUP_H} ${right} ${g.ground - CUP_H / 2} Q${right} ${g.ground} ${right - 4} ${g.ground} L${left} ${g.ground}`
  // The ball comes to rest against the back of the scoop.
  const stop = right - 2.5 - BALL_R
  const dropAt = T.arrive - 1.0
  const landedAt = T.arrive - 0.5
  const reelFrom = T.arrive + 0.2

  // In his hand while he sits, hanging just under his fingers.
  const [sitX, sitY] = px(handAt(T.swap))
  const [holdX, holdY] = px(handAt(T.holdOut))
  const grip = BALL_R * 0.8
  // Dropped: it falls, bounces twice, each lower and quicker, drifting on along the header,
  // and rolls to a stop where he'll putt it from.
  const drop = rest - holdY - grip
  const fall = 0.38
  const bounce = (h: number) => fall * Math.sqrt(h)
  const land1 = T.drop + fall
  const peak1 = land1 + bounce(0.3)
  const land2 = peak1 + bounce(0.3)
  const peak2 = land2 + bounce(0.08)
  const land3 = peak2 + bounce(0.08)
  const stopped = land3 + 0.6
  const drift = ballX - holdX
  const ballCx: Key[] = [
    [0, sitX],
    [T.swap, sitX],
    [T.holdOut, holdX, EASE],
    [T.drop, holdX],
    [land1, holdX + drift * 0.3],
    [land2, holdX + drift * 0.65],
    [land3, holdX + drift * 0.82],
    [stopped, ballX, '.2 .6 .4 1'],
    [T.strike, ballX],
    [T.arrive, stop, '.32 .3 .45 1'],
    [STROLL_S, stop],
  ]
  const ballCy: Key[] = [
    [0, sitY + grip],
    [T.swap, sitY + grip],
    [T.holdOut, holdY + grip, EASE],
    [T.drop, holdY + grip],
    [land1, rest, FALL],
    [peak1, rest - drop * 0.3, RISE],
    [land2, rest, FALL],
    [peak2, rest - drop * 0.08, RISE],
    [land3, rest, FALL],
    [STROLL_S, rest],
  ]

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x="-10000" y={g.cartBottom} width="20000" height="200" />
        </clipPath>
      </defs>
      <g fill="none" strokeLinecap="round" clipPath={`url(#${clipId})`}>
        {/* the catcher: a little basket on a line from the cart icon */}
        <g opacity="0">
          <animate attributeName="opacity" dur={DUR} values="0;1;1;0" keyTimes={kt(0, dropAt, T.reeled, STROLL_S)} calcMode="discrete" fill="freeze" />
          <line x1={g.cartX} y1={g.cartBottom} x2={g.cartX} y2={g.cartBottom} stroke={OLD_MAN.outline} strokeWidth="1.2">
            <animate
              attributeName="y2"
              dur={DUR}
              values={`${g.cartBottom};${g.cartBottom};${g.ground - CUP_H};${g.ground - CUP_H};${g.cartBottom};${g.cartBottom}`}
              keyTimes={kt(0, dropAt, landedAt, reelFrom, T.reeled, STROLL_S)}
              calcMode="spline"
              keySplines="0 0 1 1;.5 0 .3 1;0 0 1 1;.5 0 .3 1;0 0 1 1"
              fill="freeze"
            />
          </line>
          <g transform={`translate(0 ${raised})`}>
            <animateTransform
              attributeName="transform"
              type="translate"
              dur={DUR}
              values={`0 ${raised};0 ${raised};0 0;0 0;0 ${raised};0 ${raised}`}
              keyTimes={kt(0, dropAt, landedAt, reelFrom, T.reeled, STROLL_S)}
              calcMode="spline"
              keySplines="0 0 1 1;.5 0 .3 1;0 0 1 1;.5 0 .3 1;0 0 1 1"
              fill="freeze"
            />
            <path d={scoop} fill={OLD_MAN.jacket} stroke={OLD_MAN.outline} strokeWidth="1.4" strokeLinejoin="round" />
          </g>
        </g>

        {/* the same ball once it's in the scoop, reeled up into the cart */}
        <circle cx={stop} cy={rest} r={BALL_R} fill="#fff" stroke={OLD_MAN.outline} strokeWidth="1.2" opacity="0">
          <animate attributeName="opacity" dur={DUR} values="0;1;0" keyTimes={kt(0, T.arrive, T.reeled)} calcMode="discrete" fill="freeze" />
          <animate
            attributeName="cy"
            dur={DUR}
            values={`${rest};${rest};${rest + raised};${rest + raised}`}
            keyTimes={kt(0, reelFrom, T.reeled, STROLL_S)}
            calcMode="spline"
            keySplines="0 0 1 1;.5 0 .3 1;0 0 1 1"
            fill="freeze"
          />
        </circle>
      </g>
      {/* the ball: held out, dropped, bouncing, struck and rolled all the way into the scoop,
          drawn over the catcher so it stays in sight as it rolls in */}
      <circle cx={sitX} cy={sitY + grip} r={BALL_R} fill="#fff" stroke={OLD_MAN.outline} strokeWidth="1.2" opacity="0">
        <animate attributeName="opacity" dur={DUR} values="0;1;0" keyTimes={kt(0, T.swap, T.arrive)} calcMode="discrete" fill="freeze" />
        <Track attr="cx" keys={ballCx} />
        <Track attr="cy" keys={ballCy} />
      </circle>

      <g fill="none">
        {/* the cart's little pop as the ball goes in */}
        <circle cx={g.cartX} cy={g.cartY} r="4" stroke="var(--color-soft-gold)" strokeWidth="1.6" opacity="0">
          <animate attributeName="r" dur={DUR} values="4;4;17;17" keyTimes={kt(0, T.reeled, T.reeled + 0.45, STROLL_S)} fill="freeze" />
          <animate attributeName="opacity" dur={DUR} values="0;0;0.9;0;0" keyTimes={kt(0, T.reeled - 0.01, T.reeled, T.reeled + 0.45, STROLL_S)} fill="freeze" />
        </circle>
      </g>
    </svg>
  )
}
