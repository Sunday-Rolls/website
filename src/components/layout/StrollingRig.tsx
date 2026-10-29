import { useId } from 'react'
import { brandAssets } from '@/assets'
import { OLD_MAN } from '@/components/brand/old-man'
import { OldManRig } from '@/components/brand/OldManRig'
import { rigTip, type Pt, type RigFrame, type RigPose, type Skeleton } from '@/components/brand/old-man-rig-math'
import { PUTT_ADDRESS, PUTT_BACK, PUTT_THROUGH, PUTT_WATCH, STAND } from '@/components/brand/old-man-poses'

/*
 * The header logo's putt, drawn into the logo mark's 0 0 79 120 box: the seated logo springs
 * off his log as the rig, lands on the header's bottom edge, turns toward the cart, pulls out
 * a putter and rolls a ball along the bottom of the header. PuttToCart (below) draws that
 * ball and the catcher the cart icon lowers for it, across the whole header, on the same
 * clock. Then he puts the putter away and hops back onto his log, where the logo picture
 * takes over again. One CSS pixel is 1/0.3 logo units.
 */

export const STROLL_S = 8.8
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

const PEAK: [number, number] = [SEAT[0] - 3 * PX, SEAT[1] - 6 * PX]
// Facing the cart (to the right), turned a touch toward the viewer.
const AIM = 160

/** Seconds into the putt: when the ball's struck, rolls, reaches the cart and is reeled in. */
const PUTT = {
  ballDown: 2.6,
  strike: 3.25,
  roll: 2.4,
  arrive: 5.65,
  reel: 0.6,
  reeled: 6.45,
}
// When he's back under his log and springs up onto it.
const BACK_ON_LOG = 8.35

const FRAMES: RigFrame[] = [
  [0, at(SEAT[0], SEAT[1], 0, SIT), LINEAR],
  [0.35, at(SEAT[0], SEAT[1], 0, SIT), LINEAR],
  [0.62, at(PEAK[0], PEAK[1], 0, TUCK), '.2 .6 .4 1'],
  [0.95, at(LAND_X, STAND_Y + 7, 0, CROUCH), '.5 0 .9 .5'],
  [1.3, at(LAND_X, STAND_Y, 0, STAND), EASE],
  // Turn toward the cart and pull out the putter.
  [1.95, at(LAND_X, STAND_Y, AIM, STAND), '.45 0 .4 1'],
  [2.3, at(LAND_X, STAND_Y, AIM, PUTT_ADDRESS), EASE],
  [2.75, at(LAND_X, STAND_Y, AIM, PUTT_ADDRESS), LINEAR],
  [3.05, at(LAND_X, STAND_Y, AIM, PUTT_BACK), '.4 0 .6 1'],
  [PUTT.strike, at(LAND_X, STAND_Y, AIM, PUTT_ADDRESS), '.5 0 1 1'],
  [3.5, at(LAND_X, STAND_Y, AIM, PUTT_THROUGH), '0 0 .4 1'],
  [4.2, at(LAND_X, STAND_Y, AIM, PUTT_THROUGH), LINEAR],
  // Stand up and watch it go.
  [4.6, at(LAND_X, STAND_Y, AIM, PUTT_WATCH), EASE],
  [6.6, at(LAND_X, STAND_Y, AIM, PUTT_WATCH), LINEAR],
  // Putter away, turn back, and up onto the log.
  [7.0, at(LAND_X, STAND_Y, AIM, STAND), EASE],
  [7.55, at(LAND_X, STAND_Y, 0, STAND), '.45 0 .4 1'],
  [7.8, at(LAND_X, STAND_Y + 7, 0, CROUCH), EASE],
  [8.05, at(PEAK[0], PEAK[1], 0, TUCK), '.2 .6 .4 1'],
  [BACK_ON_LOG, at(SEAT[0], SEAT[1], 0, SIT), '.5 0 .5 1'],
  [STROLL_S, at(SEAT[0], SEAT[1], 0, SIT), LINEAR],
]

/** Where the ball sits when he strikes it, in logo units: just ahead of the putter's head. */
const BALL_START: Pt = (() => {
  const i = FRAMES.findIndex(([t]) => t === PUTT.strike)
  const tip = rigTip(FRAMES, SCALE)[i] ?? [LAND_X + 10, 166]
  return [tip[0] + 4, tip[1]]
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
  /** Header pixels: the logo mark's left edge and pixels per logo unit, the header's bottom edge, the cart icon. */
  logoLeft: number
  unit: number
  ground: number
  cartX: number
  cartY: number
  cartBottom: number
}

const BALL_R = 2.2
const CUP_W = 14
const CUP_H = 10

/**
 * The ball he putts and the catcher the cart lowers for it, drawn over the whole header in
 * header pixels. Mount it with the rig so the two share a clock.
 */
export function PuttToCart({ g }: { g: PuttGeometry }) {
  const clipId = `putt-under-cart-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const kt = (...t: number[]) => t.map((v) => (v / STROLL_S).toFixed(4)).join(';')
  const ballX = g.logoLeft + BALL_START[0] * g.unit
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
  const dropAt = PUTT.arrive - 1.0
  const landedAt = PUTT.arrive - 0.5
  const reelFrom = PUTT.arrive + 0.2

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
          <animate attributeName="opacity" dur={DUR} values="0;1;1;0" keyTimes={kt(0, dropAt, PUTT.reeled, STROLL_S)} calcMode="discrete" fill="freeze" />
          <line x1={g.cartX} y1={g.cartBottom} x2={g.cartX} y2={g.cartBottom} stroke={OLD_MAN.outline} strokeWidth="1.2">
            <animate
              attributeName="y2"
              dur={DUR}
              values={`${g.cartBottom};${g.cartBottom};${g.ground - CUP_H};${g.ground - CUP_H};${g.cartBottom};${g.cartBottom}`}
              keyTimes={kt(0, dropAt, landedAt, reelFrom, PUTT.reeled, STROLL_S)}
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
              keyTimes={kt(0, dropAt, landedAt, reelFrom, PUTT.reeled, STROLL_S)}
              calcMode="spline"
              keySplines="0 0 1 1;.5 0 .3 1;0 0 1 1;.5 0 .3 1;0 0 1 1"
              fill="freeze"
            />
            <path d={scoop} fill={OLD_MAN.jacket} stroke={OLD_MAN.outline} strokeWidth="1.4" strokeLinejoin="round" />
          </g>
        </g>

        {/* the ball: down at his feet, struck, rolls all the way into the scoop, reeled up into the cart */}
        <circle cx={ballX} cy={rest} r={BALL_R} fill="#fff" stroke={OLD_MAN.outline} strokeWidth="1.2" opacity="0">
          <animate attributeName="opacity" dur={DUR} values="0;1;0" keyTimes={kt(0, PUTT.ballDown, PUTT.reeled)} calcMode="discrete" fill="freeze" />
          <animate
            attributeName="cx"
            dur={DUR}
            values={`${ballX};${ballX};${stop};${stop}`}
            keyTimes={kt(0, PUTT.strike, PUTT.arrive, STROLL_S)}
            calcMode="spline"
            keySplines="0 0 1 1;.32 .3 .45 1;0 0 1 1"
            fill="freeze"
          />
          <animate
            attributeName="cy"
            dur={DUR}
            values={`${rest};${rest};${rest + raised};${rest + raised}`}
            keyTimes={kt(0, reelFrom, PUTT.reeled, STROLL_S)}
            calcMode="spline"
            keySplines="0 0 1 1;.5 0 .3 1;0 0 1 1"
            fill="freeze"
          />
        </circle>

      </g>
      <g fill="none">
        {/* the cart's little pop as the ball goes in */}
        <circle cx={g.cartX} cy={g.cartY} r="4" stroke="var(--color-soft-gold)" strokeWidth="1.6" opacity="0">
          <animate attributeName="r" dur={DUR} values="4;4;17;17" keyTimes={kt(0, PUTT.reeled, PUTT.reeled + 0.45, STROLL_S)} fill="freeze" />
          <animate attributeName="opacity" dur={DUR} values="0;0;0.9;0;0" keyTimes={kt(0, PUTT.reeled - 0.01, PUTT.reeled, PUTT.reeled + 0.45, STROLL_S)} fill="freeze" />
        </circle>
      </g>
    </svg>
  )
}
