import { useEffect, useId, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'
import { OldManRig } from '@/components/brand/OldManRig'
import { rigTip, type RigFrame, type RigPose, type V3 } from '@/components/brand/old-man-rig-math'
import { carryStep, STAND_CLUB, STRIDE_BOB } from '@/components/brand/old-man-poses'

const INK = 'var(--color-heritage-green)'
const LINE = 'var(--color-canvas-tan)'
const ACCENT = 'var(--color-soft-gold)'

const HEIGHT = 200
const GROUND_Y = 170
const EASE = '.42 0 .58 1'
const LINEAR = '0 0 1 1'
const FLAG = 'M0 0 Q20 2 38 10 Q20 16 0 22 Z'
const FLAG_WAVE = 'M0 0 Q18 6 38 7 Q18 20 0 22 Z'

type Pt = readonly [number, number]

/** A face-on swing pose in the golfer's own space: standing at x 150, feet on the ground. */
interface Pose {
  head: Pt
  neck: Pt
  shoulder: Pt
  hip: Pt
  elbowA: Pt
  handA: Pt
  elbowB: Pt
  handB: Pt
  kneeL: Pt
  footL: Pt
  kneeR: Pt
  footR: Pt
  clubHead: Pt
  toeL: number
  toeR: number
}

const ADDRESS: Pose = {
  head: [150, 66], neck: [150, 78], shoulder: [150, 86], hip: [150, 121],
  elbowA: [155, 107], handA: [152, 128], elbowB: [145, 107], handB: [151, 128],
  kneeL: [141, 146], footL: [135, 170], kneeR: [159, 146], footR: [165, 170],
  clubHead: [156, 167], toeL: -7, toeR: 7,
}

const TOP: Pose = {
  head: [149, 66], neck: [149, 78], shoulder: [150, 86], hip: [147, 121],
  elbowA: [137, 81], handA: [126, 66], elbowB: [145, 93], handB: [128, 68],
  kneeL: [139, 146], footL: [135, 170], kneeR: [155, 147], footR: [165, 170],
  clubHead: [166, 48], toeL: -7, toeR: 7,
}

const IMPACT: Pose = {
  head: [150, 66], neck: [150, 78], shoulder: [151, 86], hip: [154, 121],
  elbowA: [157, 107], handA: [156, 128], elbowB: [150, 107], handB: [155, 128],
  kneeL: [144, 146], footL: [135, 170], kneeR: [162, 146], footR: [165, 170],
  clubHead: [160, 167], toeL: -7, toeR: 7,
}

// In-between poses so the club sweeps round on an arc instead of cutting straight across him.
const DOWNSWING: Pose = {
  head: [150, 66], neck: [150, 78], shoulder: [150, 86], hip: [151, 121],
  elbowA: [142, 98], handA: [136, 108], elbowB: [146, 102], handB: [137, 108],
  kneeL: [141, 146], footL: [135, 170], kneeR: [158, 146], footR: [165, 170],
  clubHead: [104, 86], toeL: -7, toeR: 7,
}

const RELEASE: Pose = {
  head: [151, 66], neck: [151, 78], shoulder: [152, 86], hip: [156, 121],
  elbowA: [162, 104], handA: [166, 118], elbowB: [158, 104], handB: [165, 118],
  kneeL: [147, 147], footL: [137, 170], kneeR: [163, 146], footR: [165, 170],
  clubHead: [198, 96], toeL: -6, toeR: 7,
}

// Extra beats between the key poses keep the club at full length as it sweeps.
const DOWNSWING_TURN: Pose = {
  ...TOP,
  elbowA: [137, 82], handA: [127, 70], elbowB: [144, 94], handB: [128, 71],
  clubHead: [124, 28],
}

const DOWNSWING_START: Pose = {
  ...TOP,
  hip: [149, 121], elbowA: [137, 88], handA: [130, 80], elbowB: [144, 96], handB: [131, 81],
  clubHead: [98, 58],
}

const DOWNSWING_LATE: Pose = {
  ...DOWNSWING,
  hip: [153, 121], elbowA: [149, 104], handA: [144, 120], elbowB: [151, 106], handB: [145, 120],
  clubHead: [120, 152],
}

const POST_IMPACT: Pose = {
  ...RELEASE,
  hip: [155, 121], elbowA: [160, 106], handA: [161, 124], elbowB: [155, 106], handB: [160, 124],
  clubHead: [196, 146],
}

const FINISH: Pose = {
  head: [155, 65], neck: [155, 77], shoulder: [156, 85], hip: [158, 121],
  elbowA: [168, 74], handA: [170, 58], elbowB: [162, 78], handB: [168, 60],
  kneeL: [152, 148], footL: [144, 168], kneeR: [164, 146], footR: [165, 170],
  clubHead: [128, 72], toeL: -3, toeR: 7,
}

const RISING: Pose = {
  ...FINISH,
  elbowA: [168, 92], handA: [172, 78], elbowB: [162, 94], handB: [170, 80],
  clubHead: [182, 39],
}

/** Seconds into the scene. */
const T = {
  cupIn: 0,
  flagUp: 0.4,
  walkIn: 0.2,
  arrive: 2.6,
  address: 3.1,
  ballOnTee: 3.1,
  top: 4.3,
  topHold: 4.45,
  impact: 4.75,
  finish: 5.15,
  finishHold: 6.6,
  relax: 7.1,
  ballInCup: 7.35,
  walkOut: 7.4,
  gone: 9.8,
  trailOut: 8.2,
  flagDown: 9.2,
  cupOut: 10.0,
  end: 10.8,
}

const STEP = 0.3
// Facing: he walks on facing right, turns three-quarters to the viewer to swing, comes round
// toward the cup through the finish, then turns away left to walk off.
const YAW = { walkIn: 180, swing: 100, finish: 140, walkOut: 0 }
const GOLFER_ROOT: Pt = [150, 120]

/** A swing pose, drawn face-on as the stick figure, turned into the rig's body space. */
function swingPose(p: Pose, yaw: number): RigPose {
  const [hx, hy] = p.hip
  const b = ([x, y]: Pt, f = 0): V3 => [f, y - hy, hx - x]
  const ankle = ([x, y]: Pt): V3 => [0, y - 4 - hy, hx - x]
  const toe = ([x, y]: Pt, out: number): V3 => [7, y - 3 - hy, hx - x + out]
  return {
    root: [hx, hy],
    yaw,
    joints: {
      neck: b(p.neck, 2),
      shoulderL: [0, p.shoulder[1] - hy, -9],
      shoulderR: [0, p.shoulder[1] - hy, 9],
      // Each arm hangs from the shoulder on its own side of him: arm A's elbow sits screen
      // right of his centre at address, which face-on is his left side.
      elbowL: b(p.elbowA, 4),
      handL: b(p.handA, 7),
      elbowR: b(p.elbowB, 4),
      handR: b(p.handB, 7),
      hipL: [0, 0, -6],
      hipR: [0, 0, 6],
      kneeL: b(p.kneeR, 2),
      ankleL: ankle(p.footR),
      toeL: toe(p.footR, -3),
      kneeR: b(p.kneeL, 2),
      ankleR: ankle(p.footL),
      toeR: toe(p.footL, 3),
      tip: b(p.clubHead, 5),
    },
  }
}

const carrying = (t: number, beat: number, yaw: number): RigFrame => [
  t,
  { root: [GOLFER_ROOT[0], GOLFER_ROOT[1] + STRIDE_BOB[beat % 4]], yaw, joints: carryStep(beat) },
  LINEAR,
]

function buildFrames(): RigFrame[] {
  const frames: RigFrame[] = [carrying(0, 0, YAW.walkIn)]
  let beat = 0
  for (let t = T.walkIn; t < T.arrive - 0.01; t += STEP) frames.push(carrying(Math.round(t * 100) / 100, beat++, YAW.walkIn))
  const swing = (t: number, pose: Pose, ease: string, yaw = YAW.swing): RigFrame => [t, swingPose(pose, yaw), ease]
  frames.push(
    [T.arrive, { root: GOLFER_ROOT, yaw: YAW.walkIn, joints: STAND_CLUB }, EASE],
    swing(T.address, ADDRESS, EASE),
    swing(T.address + 0.2, ADDRESS, LINEAR),
    // Shoulders wind away from the target on the way back and unwind through the ball.
    swing(T.top, TOP, '.3 0 .3 1', 72),
    swing(T.topHold, TOP, LINEAR, 72),
    swing(T.impact - 0.25, DOWNSWING_TURN, '.6 0 1 1', 76),
    swing(T.impact - 0.2, DOWNSWING_START, LINEAR, 82),
    swing(T.impact - 0.13, DOWNSWING, LINEAR, 90),
    swing(T.impact - 0.06, DOWNSWING_LATE, LINEAR),
    swing(T.impact, IMPACT, LINEAR),
    swing(T.impact + 0.065, POST_IMPACT, LINEAR, 108),
    swing(T.impact + 0.13, RELEASE, LINEAR, 118),
    swing(T.impact + 0.25, RISING, '0 .3 .6 1', 130),
    swing(T.finish, FINISH, '0 .5 .4 1', YAW.finish),
    swing(T.finishHold, FINISH, LINEAR, YAW.finish),
    [T.relax, { root: GOLFER_ROOT, yaw: YAW.swing, joints: STAND_CLUB }, EASE],
  )
  beat = 0
  for (let t = T.walkOut; t < T.gone - 0.01; t += STEP) {
    const [time, pose] = carrying(Math.round(t * 100) / 100, beat++, YAW.walkOut)
    frames.push([time, pose, beat === 1 ? '.4 0 .6 1' : LINEAR])
  }
  frames.push(carrying(T.gone, beat, YAW.walkOut), carrying(T.end, beat, YAW.walkOut))
  return frames
}

const FRAMES = buildFrames()
const IMPACT_INDEX = FRAMES.findIndex(([t]) => t === T.impact)
const pt = ([x, y]: Pt) => `${x} ${y}`

function sanitizeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

interface SceneProps {
  /** Scene width in SVG units; 1 unit is 1 CSS px times `scale`. */
  width: number
  scale: number
}

function DriveScene({ width, scale }: SceneProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const uid = sanitizeId(useId())
  const trailMaskId = `drive-trail-${uid}`
  const flagClipId = `drive-flag-${uid}`

  // Golfer and cup sit a set distance in from the viewport edges.
  const golferX = Math.round(Math.max(70, width * 0.12))
  const cupX = Math.round(width - Math.max(60, width * 0.1))
  const offLeft = -60 - golferX
  const tip = rigTip(FRAMES, 1)[IMPACT_INDEX] ?? [160, 167]
  const tee: Pt = [Math.round(tip[0] + golferX - 150 + 2), 165]
  const landX = cupX - 110
  const peakX = Math.round((tee[0] + landX) / 2)
  const flightPath = `M${pt(tee)} Q${peakX} -50 ${landX} 168 Q${landX + 30} 142 ${landX + 60} 168 L${cupX} 168`
  const relativeFlight = `M0 0 Q${peakX - tee[0]} -215 ${landX - tee[0]} 3 Q${landX + 30 - tee[0]} -23 ${landX + 60 - tee[0]} 3 L${cupX - tee[0]} 3`

  useEffect(() => {
    const svg = svgRef.current
    if (!reducedMotion || !svg || typeof svg.pauseAnimations !== 'function') return
    // Hold on the address pose: everything on stage, nothing moving.
    svg.setCurrentTime(T.address + 0.1)
    svg.pauseAnimations()
  }, [reducedMotion])

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width="100%"
      height={HEIGHT * scale}
      className="block"
      role="img"
      aria-label="A golfer walks on, drives the ball into the hole and walks off"
    >
      <defs>
        <clipPath id={flagClipId}>
          <rect x={cupX - 30} y="0" width="90" height={GROUND_Y + 1} />
        </clipPath>
        <mask id={trailMaskId} maskUnits="userSpaceOnUse" x="0" y="-100" width={width} height="300">
          <path d={flightPath} fill="none" stroke="#fff" strokeWidth="8" pathLength={1} strokeDasharray="1 1" strokeDashoffset="1">
            <animate attributeName="stroke-dashoffset" begin={`${T.impact}s`} dur="2.4s" values="1;0" calcMode="spline" keySplines=".25 .1 .35 1" fill="freeze" />
          </path>
        </mask>
      </defs>

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M0 ${GROUND_Y} H${width}`} stroke={LINE} strokeWidth="2" />

        <ellipse cx={cupX} cy={GROUND_Y + 1} rx="0" ry="0" fill={INK} stroke="none">
          <animate attributeName="rx" begin={`${T.cupIn}s`} dur="0.6s" values="0;10" calcMode="spline" keySplines={EASE} fill="freeze" />
          <animate attributeName="ry" begin={`${T.cupIn}s`} dur="0.6s" values="0;2.6" calcMode="spline" keySplines={EASE} fill="freeze" />
          <animate attributeName="rx" begin={`${T.cupOut}s`} dur="0.5s" values="10;0" calcMode="spline" keySplines={EASE} fill="freeze" />
          <animate attributeName="ry" begin={`${T.cupOut}s`} dur="0.5s" values="2.6;0" calcMode="spline" keySplines={EASE} fill="freeze" />
        </ellipse>

        <g clipPath={`url(#${flagClipId})`}>
          <g transform="translate(0 80)">
            <path d={`M${cupX + 4} ${GROUND_Y} V94`} stroke={INK} strokeWidth="2.5" />
            <g transform={`translate(${cupX + 4} 94)`}>
              <path d={FLAG} fill={ACCENT} stroke="none">
                <animate attributeName="d" dur="1.6s" repeatCount="indefinite" values={`${FLAG};${FLAG_WAVE};${FLAG}`} />
              </path>
            </g>
            <animateTransform attributeName="transform" type="translate" begin={`${T.flagUp}s`} dur="1s" values="0 80;0 0" calcMode="spline" keySplines={EASE} fill="freeze" />
            <animateTransform attributeName="transform" type="translate" begin={`${T.flagDown}s`} dur="0.9s" values="0 0;0 80" calcMode="spline" keySplines={EASE} fill="freeze" />
          </g>
        </g>

        <g mask={`url(#${trailMaskId})`}>
          <path d={flightPath} stroke={ACCENT} strokeWidth="2" strokeDasharray="2 9">
            <animate attributeName="opacity" begin={`${T.trailOut}s`} dur="0.6s" values="1;0" fill="freeze" />
          </path>
        </g>

        <g transform={`translate(${golferX - 150} 0)`}>
          <g transform={`translate(${offLeft} 0)`}>
            <animateTransform
              attributeName="transform"
              type="translate"
              dur={`${T.end}s`}
              values={`${offLeft} 0;${offLeft} 0;0 0;0 0;${offLeft} 0;${offLeft} 0`}
              keyTimes={[0, T.walkIn, T.arrive, T.walkOut, T.gone, T.end].map((t) => (t / T.end).toFixed(4)).join(';')}
              calcMode="spline"
              keySplines={`${LINEAR};.2 0 .5 1;${LINEAR};.5 0 .8 1;${LINEAR}`}
              fill="freeze"
            />
            <OldManRig frames={FRAMES} dur={T.end} scale={1} holdColor={INK} />
          </g>
        </g>

        <circle cx={tee[0]} cy={tee[1]} r="4.5" fill="#fff" stroke={INK} strokeWidth="1.5" opacity="0">
          <animate attributeName="opacity" begin={`${T.ballOnTee}s`} dur="0.3s" values="0;1" fill="freeze" />
          <animateMotion begin={`${T.impact}s`} dur="2.4s" path={relativeFlight} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".25 .1 .35 1" fill="freeze" />
          <animate attributeName="opacity" begin={`${T.ballInCup}s`} dur="0.2s" values="1;0" fill="freeze" />
        </circle>
      </g>
    </svg>
  )
}

/**
 * A full-width strip: the cup and flag come up at the right edge of the viewport, the logo's
 * old man walks in from the left edge, drives the ball into the cup, then everything leaves.
 * Replays each time it scrolls into view.
 */
export function DriveAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [playKey, setPlayKey] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setPlayKey(1)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setPlayKey((key) => key + 1)
      },
      { threshold: 0.6 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Phones get a slightly smaller golfer so the shot still has room to fly.
  const scale = width > 0 && width < 640 ? 0.75 : 1

  return (
    <div ref={containerRef} className="w-full overflow-hidden" style={{ height: HEIGHT * scale }}>
      {playKey > 0 && width > 0 ? <DriveScene key={playKey} width={Math.round(width / scale)} scale={scale} /> : null}
    </div>
  )
}
