import { OLD_MAN, OLD_MAN_CHIN } from './old-man'
import { DROP, LEGS, view, type Pt, type RigFrame, type RigPose, type Skeleton, type V3, type View } from './old-man-rig-math'
import { faceParts } from './old-man-face'
import { OldManHead } from './OldManHead'

/*
 * A generated 3D rig of the logo's old man, drawn as SVG and animated with SMIL. One rig
 * drives both the header stroll and the shop page's Drive.
 *
 * The skeleton lives in his own body space: f points the way he faces, y points down, s
 * points to his right, with the pelvis at the origin. A pose places every joint there.
 * Each frame also says which way he's facing (yaw, in degrees: 0 faces left as in the logo,
 * 90 faces the viewer, 180 faces right), and the joints are projected onto the screen for
 * that yaw. So turning round is a real turn: limbs swing apart and cross over, the near side
 * draws in front, and halfway round he's facing you.
 *
 * His clothes are drawn along the bones (jacket, sleeves, trousers, boots) in the logo's
 * colours, and his head is the exact VectorCraft trace of the logo's head.
 */

const LINEAR = '0 0 1 1'
const TURN_SAMPLE_S = 1 / 24
const HEAD_SCALE = 0.42
const DIM = 'brightness(0.78)'
const HEAD_LEAD = 25

// ---- easing ---------------------------------------------------------------

function bezier(ease: string): (x: number) => number {
  const [x1, y1, x2, y2] = ease.split(' ').map(Number)
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  return (x) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < x) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const lerp3 = (a: V3, b: V3, f: number): V3 => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]

function lerpPose(a: RigPose, b: RigPose, f: number): RigPose {
  const joints = {} as Record<keyof Skeleton, V3>
  for (const key of Object.keys(a.joints) as (keyof Skeleton)[]) {
    const from = a.joints[key]
    if (!from) continue
    joints[key] = lerp3(from, b.joints[key] ?? from, f)
  }
  return {
    root: [lerp(a.root[0], b.root[0], f), lerp(a.root[1], b.root[1], f)],
    yaw: lerp(a.yaw, b.yaw, f),
    joints: joints as Skeleton,
  }
}

/**
 * Turns can't be left to SMIL's straight-line tweening between two projections, so any
 * stretch where the yaw changes is sampled finely here, with its easing baked in.
 */
function bake(frames: readonly RigFrame[]): RigFrame[] {
  const out: RigFrame[] = [frames[0]]
  for (let i = 1; i < frames.length; i++) {
    const [t0, a] = frames[i - 1]
    const [t1, b, ease] = frames[i]
    if (Math.abs(a.yaw - b.yaw) < 0.01) {
      out.push(frames[i])
      continue
    }
    const curve = bezier(ease)
    const steps = Math.max(2, Math.ceil((t1 - t0) / TURN_SAMPLE_S))
    for (let s = 1; s <= steps; s++) {
      const x = s / steps
      out.push([lerp(t0, t1, x), lerpPose(a, b, curve(x)), LINEAR])
    }
  }
  return out
}

// ---- drawing ------------------------------------------------------------------

const n = (v: number) => Math.round(v * 10) / 10
const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`
const line = (...pts: Pt[]) => `M${pts.map(pt).join(' L')}`
const fadeIn = (v: number, from: number, to: number) => Math.max(0, Math.min(1, (v - from) / (to - from)))

type Side = 'L' | 'R'

interface Sample {
  v: View
  j: Skeleton
}

interface Channel {
  values: string[]
}

/** Builds one animated attribute's values across the baked frames. */
function channel(samples: Sample[], value: (s: Sample) => string | number): Channel {
  return { values: samples.map((s) => String(value(s))) }
}

interface Timing {
  dur: string
  keyTimes: string
  keySplines: string
}

function Anim({ attr, ch, timing, discrete }: { attr: string; ch: Channel; timing: Timing; discrete?: boolean }) {
  return discrete ? (
    <animate attributeName={attr} values={ch.values.join(';')} dur={timing.dur} keyTimes={timing.keyTimes} calcMode="discrete" fill="freeze" />
  ) : (
    <animate
      attributeName={attr}
      values={ch.values.join(';')}
      dur={timing.dur}
      keyTimes={timing.keyTimes}
      calcMode="spline"
      keySplines={timing.keySplines}
      fill="freeze"
    />
  )
}

/** An outlined stroke along some joints: a sleeve, a trouser leg, a boot. */
function Limb({
  samples,
  timing,
  points,
  width,
  color,
  visible,
}: {
  samples: Sample[]
  timing: Timing
  points: (s: Sample) => Pt[]
  width: number
  color: string
  visible?: Channel
}) {
  const d = channel(samples, (s) => line(...points(s)))
  return (
    <g opacity={visible ? visible.values[0] : undefined}>
      {visible ? <Anim attr="opacity" ch={visible} timing={timing} discrete /> : null}
      <path d={d.values[0]} stroke={OLD_MAN.outline} strokeWidth={width + 3}>
        <Anim attr="d" ch={d} timing={timing} />
      </path>
      <path d={d.values[0]} stroke={color} strokeWidth={width}>
        <Anim attr="d" ch={d} timing={timing} />
      </path>
    </g>
  )
}

function Hand({ samples, timing, at, visible }: { samples: Sample[]; timing: Timing; at: (s: Sample) => Pt; visible: Channel }) {
  const cx = channel(samples, (s) => n(at(s)[0]))
  const cy = channel(samples, (s) => n(at(s)[1]))
  return (
    <circle cx={cx.values[0]} cy={cy.values[0]} r="3.4" fill={OLD_MAN.skin} stroke={OLD_MAN.outline} strokeWidth="1.6" opacity={visible.values[0]}>
      <Anim attr="cx" ch={cx} timing={timing} />
      <Anim attr="cy" ch={cy} timing={timing} />
      <Anim attr="opacity" ch={visible} timing={timing} discrete />
    </circle>
  )
}

const other = (side: Side): Side => (side === 'L' ? 'R' : 'L')
const short = ([f, y, s]: V3): V3 => [f, y * LEGS, s]
/** The club head stays where the pose puts it, though his hands drop with his pelvis. */
const reach = ([f, y, s]: V3): V3 => [f, y - DROP, s]
const legPoints = (side: Side) => (s: Sample) => [s.v.x(s.j[`hip${side}`]), s.v.x(short(s.j[`knee${side}`])), s.v.x(short(s.j[`ankle${side}`]))]
const bootPoints = (side: Side) => (s: Sample) => [s.v.x(short(s.j[`ankle${side}`])), s.v.x(short(s.j[`toe${side}`]))]
const armPoints = (side: Side) => (s: Sample) => [s.v.x(s.j[`shoulder${side}`]), s.v.x(s.j[`elbow${side}`]), s.v.x(s.j[`hand${side}`])]

// Jacket cross-sections, collar to hem: height, depth front-to-back and width side-to-side
// (half sizes), and how far forward the section sits.
const JACKET: ReadonlyArray<readonly [y: number, depth: number, width: number, forward: number]> = [
  [-43, 7, 8, 3],
  [-37, 12, 16, 0],
  [-25, 16, 17, 3],
  [-11, 18, 17, 7],
  [2, 16, 16, 4],
  [8, 14, 15, 2],
]

function jacketOutline(s: Sample, scale: number): string {
  const yaw = (s.v.yaw * Math.PI) / 180
  const fx = -Math.cos(yaw)
  const sx = -Math.sin(yaw)
  // He leans with his neck: carry the lean down through the sections.
  const lean = s.j.neck[0] - 3
  const left: Pt[] = []
  const right: Pt[] = []
  for (const [y, depth, width, forward] of JACKET) {
    const share = Math.max(0, Math.min(1, (8 - y) / 51))
    const [cx, cy] = s.v.x([forward + lean * share, y, 0])
    const half = Math.hypot(depth * fx, width * sx) * scale
    left.push([cx - half, cy])
    right.push([cx + half, cy])
  }
  const ring = [...left, ...right.reverse()]
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = `M${pt(mid(ring[ring.length - 1], ring[0]))}`
  ring.forEach((p, i) => {
    d += ` Q${pt(p)} ${pt(mid(p, ring[(i + 1) % ring.length]))}`
  })
  return `${d} Z`
}

/** The front-most point of each jacket section, collar to hem, in body space. */
function jacketFront(s: Sample): V3[] {
  const lean = s.j.neck[0] - 3
  return JACKET.slice(1).map(([y, depth, , forward]) => {
    const share = Math.max(0, Math.min(1, (8 - y) / 51))
    return [forward + lean * share + depth * 0.98, y, 0] as V3
  })
}

interface OldManRigProps {
  frames: readonly RigFrame[]
  dur: number
  /** Scene units per body unit. */
  scale: number
  /** What he's holding (a club), drawn from his right hand to `joints.tip`. */
  holdColor?: string
}

/** The old man, animated through `frames` once over `dur` seconds. */
export function OldManRig({ frames, dur, scale, holdColor }: OldManRigProps) {
  const baked = bake(frames)
  const samples: Sample[] = baked.map(([, pose]) => ({ v: view(pose, scale), j: pose.joints }))
  const timing: Timing = {
    dur: `${dur}s`,
    keyTimes: baked.map(([t]) => (t / dur).toFixed(5)).join(';'),
    keySplines: baked.slice(1).map(([, , ease]) => ease).join(';'),
  }

  // Which leg and arm are on the far side, frame by frame.
  const farLeg = (side: Side) => channel(samples, (s) => (s.v.depth(s.j[`hip${side}`]) < s.v.depth(s.j[`hip${other(side)}`]) ? 1 : 0))
  const nearLeg = (side: Side) => channel(samples, (s) => (s.v.depth(s.j[`hip${side}`]) < s.v.depth(s.j[`hip${other(side)}`]) ? 0 : 1))
  const farArm = (side: Side) =>
    channel(samples, (s) => (s.v.depth(s.j[`shoulder${side}`]) < s.v.depth(s.j[`shoulder${other(side)}`]) ? 1 : 0))
  const nearArm = (side: Side) =>
    channel(samples, (s) => (s.v.depth(s.j[`shoulder${side}`]) < s.v.depth(s.j[`shoulder${other(side)}`]) ? 0 : 1))

  const w = (units: number) => units * scale

  // His jacket: oval cross-sections stacked from collar to hem, each projected for the way
  // he faces. Side-on that shows the logo's round belly; face-on, broad shoulders.
  const torso = channel(samples, (s) => jacketOutline(s, scale))

  // His head turns a little ahead of his body (most when he's square to the viewer), which
  // also keeps his eyes on the ball while his shoulders wind back for a swing. It's drawn
  // from the head-turn drawings, with the exact traced logo profile taking over side-on.
  const headYaw = (s: Sample) => s.v.yaw + HEAD_LEAD * Math.sin((s.v.yaw * Math.PI) / 180)
  const [chinX, chinY] = OLD_MAN_CHIN
  const headAt = channel(samples, (s) => pt(s.v.x(s.j.neck)))
  const headTurn = channel(samples, (s) => {
    const yaw = (headYaw(s) * Math.PI) / 180
    const facing = Math.cos(yaw) >= 0 ? 1 : -1
    return n(-facing * 12 * Math.sin(yaw) ** 2)
  })
  const tracedScale = channel(samples, (s) => {
    const facing = Math.cos((headYaw(s) * Math.PI) / 180) >= 0 ? 1 : -1
    return `${n(facing * HEAD_SCALE * scale * 100) / 100} ${n(HEAD_SCALE * scale * 100) / 100}`
  })
  const tracedShow = channel(samples, (s) => n(fadeIn(Math.abs(Math.cos((headYaw(s) * Math.PI) / 180)), 0.975, 0.99) * 100) / 100)
  const faceFrames = samples.map((s) => faceParts(headYaw(s)))
  // The 3D head gives way to the traced profile as it fades in, so the two never double up.
  const faceShow = tracedShow.values.map((v) => 1 - Number(v))
  const face = faceFrames[0].map((_, i) => ({
    part: faceFrames[0][i],
    d: { values: faceFrames.map((parts) => parts[i].d) },
    opacity: { values: faceFrames.map((parts, f) => String(n(parts[i].opacity * faceShow[f] * 100) / 100)) },
  }))

  // Front seam and buttons: the front-most line of the jacket, projected like the rest.
  const seam = channel(samples, (s) => line(...jacketFront(s).map((p) => s.v.x(p))))
  const button = (i: number) => ({
    cx: channel(samples, (s) => n(s.v.x(jacketFront(s)[i])[0])),
    cy: channel(samples, (s) => n(s.v.x(jacketFront(s)[i])[1])),
    // Only on show when his front is turned to the viewer.
    on: channel(samples, (s) => (Math.sin((s.v.yaw * Math.PI) / 180) > 0.35 ? 1 : 0)),
  })
  const buttons = [2, 3].map(button)
  const collar = channel(samples, (s) => {
    const [f, y] = [s.j.neck[0] + 4, s.j.neck[1] + 2]
    return line(s.v.x([f, y, -7]), s.v.x([f + 4, y + 9, 0]), s.v.x([f, y, 7]))
  })

  const holding = holdColor && frames[0][1].joints.tip !== undefined
  const club = holding
    ? channel(samples, (s) => {
        const tip = s.j.tip ? reach(s.j.tip) : s.j.handR
        return line(s.v.x(s.j.handR), s.v.x(tip))
      })
    : null
  // The club head: a short heavy blade at the end of the shaft, toe pointing on round the arc.
  const clubHead = holding
    ? channel(samples, (s) => {
        const tip = s.v.x(s.j.tip ? reach(s.j.tip) : s.j.handR)
        const hand = s.v.x(s.j.handR)
        const len = Math.hypot(tip[0] - hand[0], tip[1] - hand[1]) || 1
        const [ux, uy] = [(tip[0] - hand[0]) / len, (tip[1] - hand[1]) / len]
        const toe: Pt = [tip[0] - uy * 7 * scale + ux * 1.5 * scale, tip[1] + ux * 7 * scale + uy * 1.5 * scale]
        return line(tip, toe)
      })
    : null

  const sides: Side[] = ['L', 'R']

  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g style={{ filter: DIM }}>
        {sides.map((side) => (
          <g key={side}>
            <Limb samples={samples} timing={timing} points={legPoints(side)} width={w(13)} color={OLD_MAN.trousers} visible={farLeg(side)} />
            <Limb samples={samples} timing={timing} points={bootPoints(side)} width={w(10)} color={OLD_MAN.boots} visible={farLeg(side)} />
          </g>
        ))}
        {sides.map((side) => (
          <g key={side}>
            <Limb samples={samples} timing={timing} points={armPoints(side)} width={w(8)} color={OLD_MAN.jacketShade} visible={farArm(side)} />
            <Hand samples={samples} timing={timing} at={(s) => s.v.x(s.j[`hand${side}`])} visible={farArm(side)} />
          </g>
        ))}
      </g>
      {sides.map((side) => (
        <g key={side}>
          <Limb samples={samples} timing={timing} points={legPoints(side)} width={w(13)} color={OLD_MAN.trousers} visible={nearLeg(side)} />
          <Limb samples={samples} timing={timing} points={bootPoints(side)} width={w(10)} color={OLD_MAN.boots} visible={nearLeg(side)} />
        </g>
      ))}

      <path d={torso.values[0]} fill={OLD_MAN.jacket} stroke={OLD_MAN.outline} strokeWidth={w(1.6)}>
        <Anim attr="d" ch={torso} timing={timing} />
      </path>
      <path d={seam.values[0]} stroke={OLD_MAN.outline} strokeWidth={w(1.1)} opacity="0.7">
        <Anim attr="d" ch={seam} timing={timing} />
      </path>
      {buttons.map((b, i) => (
        <circle key={i} cx={b.cx.values[0]} cy={b.cy.values[0]} r={w(1.3)} fill={OLD_MAN.outline} stroke="none" opacity={b.on.values[0]}>
          <Anim attr="cx" ch={b.cx} timing={timing} />
          <Anim attr="cy" ch={b.cy} timing={timing} />
          <Anim attr="opacity" ch={b.on} timing={timing} discrete />
        </circle>
      ))}
      <path d={collar.values[0]} fill={OLD_MAN.jacketShade} stroke={OLD_MAN.outline} strokeWidth={w(1.2)}>
        <Anim attr="d" ch={collar} timing={timing} />
      </path>

      <g transform={`translate(${headAt.values[0]})`}>
        <animateTransform attributeName="transform" type="translate" values={headAt.values.join(';')} dur={timing.dur} keyTimes={timing.keyTimes} calcMode="spline" keySplines={timing.keySplines} fill="freeze" />
        <g transform={`rotate(${headTurn.values[0]})`}>
          <animateTransform attributeName="transform" type="rotate" values={headTurn.values.join(';')} dur={timing.dur} keyTimes={timing.keyTimes} calcMode="spline" keySplines={timing.keySplines} fill="freeze" />
          <g transform={`scale(${n(HEAD_SCALE * scale * 1000) / 1000}) translate(0 10)`} strokeLinecap="round" strokeLinejoin="round">
            {face.map(({ part, d, opacity }, i) => (
              <path key={i} d={part.d} fill={part.fill} stroke={part.stroke} strokeWidth={part.width} opacity={opacity.values[0]}>
                <Anim attr="d" ch={d} timing={timing} />
                <Anim attr="opacity" ch={opacity} timing={timing} />
              </path>
            ))}
          </g>
          <g opacity={tracedShow.values[0]}>
            <Anim attr="opacity" ch={tracedShow} timing={timing} />
            <g transform={`scale(${tracedScale.values[0]})`}>
              <animateTransform attributeName="transform" type="scale" values={tracedScale.values.join(';')} dur={timing.dur} keyTimes={timing.keyTimes} calcMode="spline" keySplines={timing.keySplines} fill="freeze" />
              <g transform={`translate(${-chinX} ${-chinY + 10})`}>
                <OldManHead />
              </g>
            </g>
          </g>
        </g>
      </g>

      {club && clubHead ? (
        <>
          <path d={club.values[0]} stroke={holdColor} strokeWidth={w(2.2)}>
            <Anim attr="d" ch={club} timing={timing} />
          </path>
          <path d={clubHead.values[0]} stroke={holdColor} strokeWidth={w(4.2)}>
            <Anim attr="d" ch={clubHead} timing={timing} />
          </path>
        </>
      ) : null}
      {sides.map((side) => (
        <g key={side}>
          <Limb samples={samples} timing={timing} points={armPoints(side)} width={w(8)} color={OLD_MAN.jacket} visible={nearArm(side)} />
          <Hand samples={samples} timing={timing} at={(s) => s.v.x(s.j[`hand${side}`])} visible={nearArm(side)} />
        </g>
      ))}
    </g>
  )
}
