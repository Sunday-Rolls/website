#!/usr/bin/env node
/**
 * Build the compact splat file the homepage banner renders (`.srsp`).
 *
 *   node scripts/build-splat.mjs --ply capture.ply --out public/assets/home/splats/retro-roller.srsp
 *       Convert a real Gaussian-splat capture (3DGS .ply from Scaniverse, Polycam,
 *       Postshot, Brush, nerfstudio…). Options: --max <n> keeps the n most visible
 *       splats, --rotate-x/--rotate-y/--rotate-z <deg> fix orientation.
 *
 *   node scripts/build-splat.mjs --obj capture/mesh --out public/assets/home/splats/retro-roller-grey.srsp
 *       Turn a textured mesh (OBJ + MTL + texture, e.g. from scripts/object-capture.swift)
 *       into splats spread evenly over its surface, coloured from the texture.
 *       Options: --max <n> splat budget (default 160000), --rotate-x/-y/-z <deg>,
 *       --keep-largest drops loose pieces (the stick, table scraps). --crop/--crop2 cx,cy,cz,r
 *       keep a sphere; --auto-orient faces the Retro Roller's screen to +z, top up;
 *       --drop-stick removes the hanging dowel, --gain/--saturation lift dim captures.
 *
 *   node scripts/build-splat.mjs --photo public/assets/products/retro-roller-grey.jpg --out …
 *       Placeholder until there is a capture: inflate one front-facing product photo
 *       into a puffy 2.5D splat (front = the photo, back = plain body colour). It
 *       looks right for a gentle sway, not a full 360° turn.
 *
 * Output (little endian): "SRSP" | u32 version=1 | u32 count | f32 min[3] | f32 max[3]
 *   | f32 logScaleMin | f32 logScaleMax, then struct-of-arrays:
 *   u16 pos[count*3] | u8 logScale[count*3] | u8 rgba[count*4] | u8 quat[count*4] (wxyz, q*127.5+127.5)
 * The object is centred at the origin, y up, front facing +z, longest side = 1 unit.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const args = parseArgs(process.argv.slice(2))
if (!args.out || (!args.ply && !args.photo && !args.obj)) {
  console.error('usage: build-splat.mjs (--ply file.ply | --obj mesh-folder | --photo image.jpg) --out file.srsp')
  process.exit(1)
}

const splats = args.ply ? await fromPly(args.ply) : args.obj ? await fromObj(args.obj) : await fromPhoto(args.photo)
await mkdir(dirname(args.out), { recursive: true })
const bytes = encode(splats)
await writeFile(args.out, bytes)
console.log(`${args.out}: ${splats.count} splats, ${(bytes.length / 1024).toFixed(0)} KiB`)

function parseArgs(list) {
  const out = {}
  for (let i = 0; i < list.length; i++) {
    const key = list[i].replace(/^--/, '')
    const value = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true
    out[key] = value
  }
  return out
}

/** Splat arrays: pos(3), scale(3, linear σ), rgba(4, 0..255), quat(4, wxyz unit). */
function allocate(count) {
  return {
    count,
    pos: new Float32Array(count * 3),
    scale: new Float32Array(count * 3),
    rgba: new Uint8Array(count * 4),
    quat: new Float32Array(count * 4),
  }
}

// ---------------------------------------------------------------- .ply capture

async function fromPly(path) {
  const buf = await readFile(path)
  const headerEnd = buf.indexOf('end_header\n') + 'end_header\n'.length
  const header = buf.subarray(0, headerEnd).toString('latin1')
  if (!header.includes('binary_little_endian')) throw new Error('only binary_little_endian .ply is supported')
  const count = Number(/element vertex (\d+)/.exec(header)[1])
  const sizes = { float: 4, double: 8, uchar: 1, uint8: 1, int: 4, uint: 4, short: 2, ushort: 2 }
  const props = []
  let stride = 0
  const vertexSection = header.split(/element vertex \d+/)[1].split('element ')[0]
  for (const m of vertexSection.matchAll(/property (\w+) (\w+)/g)) {
    props.push({ type: m[1], name: m[2], offset: stride })
    stride += sizes[m[1]]
  }
  const field = Object.fromEntries(props.map((p) => [p.name, p]))
  for (const need of ['x', 'y', 'z', 'f_dc_0', 'opacity', 'scale_0', 'rot_0']) {
    if (!field[need]) throw new Error(`.ply is missing ${need}; is it a 3DGS export?`)
  }
  const view = new DataView(buf.buffer, buf.byteOffset + headerEnd)
  const f = (i, name) => view.getFloat32(i * stride + field[name].offset, true)
  const SH0 = 0.28209479177387814
  const sigmoid = (x) => 1 / (1 + Math.exp(-x))
  const clamp255 = (x) => Math.max(0, Math.min(255, Math.round(x * 255)))

  let s = allocate(count)
  for (let i = 0; i < count; i++) {
    s.pos.set([f(i, 'x'), f(i, 'y'), f(i, 'z')], i * 3)
    s.scale.set([Math.exp(f(i, 'scale_0')), Math.exp(f(i, 'scale_1')), Math.exp(f(i, 'scale_2'))], i * 3)
    s.rgba.set(
      [
        clamp255(0.5 + SH0 * f(i, 'f_dc_0')),
        clamp255(0.5 + SH0 * f(i, 'f_dc_1')),
        clamp255(0.5 + SH0 * f(i, 'f_dc_2')),
        clamp255(sigmoid(f(i, 'opacity'))),
      ],
      i * 4,
    )
    const q = [f(i, 'rot_0'), f(i, 'rot_1'), f(i, 'rot_2'), f(i, 'rot_3')]
    const n = Math.hypot(...q) || 1
    s.quat.set(q.map((v) => v / n), i * 4)
  }

  s = prune(s, Number(args.max ?? 200_000))
  const rx = (Number(args['rotate-x'] ?? 0) * Math.PI) / 180
  const ry = (Number(args['rotate-y'] ?? 0) * Math.PI) / 180
  const rz = (Number(args['rotate-z'] ?? 0) * Math.PI) / 180
  if (rx || ry || rz) rotateAll(s, eulerQuat(rx, ry, rz))
  normalize(s)
  return s
}

/** Drop faint and tiny splats first, keeping the `max` that contribute most. */
function prune(s, max) {
  const keep = []
  for (let i = 0; i < s.count; i++) {
    const a = s.rgba[i * 4 + 3]
    if (a < 8) continue
    const area = s.scale[i * 3] * s.scale[i * 3 + 1] + s.scale[i * 3 + 1] * s.scale[i * 3 + 2] + s.scale[i * 3] * s.scale[i * 3 + 2]
    keep.push([i, a * Math.sqrt(area)])
  }
  keep.sort((a, b) => b[1] - a[1])
  const chosen = keep.slice(0, max).map(([i]) => i)
  const out = allocate(chosen.length)
  chosen.forEach((src, dst) => {
    out.pos.set(s.pos.subarray(src * 3, src * 3 + 3), dst * 3)
    out.scale.set(s.scale.subarray(src * 3, src * 3 + 3), dst * 3)
    out.rgba.set(s.rgba.subarray(src * 4, src * 4 + 4), dst * 4)
    out.quat.set(s.quat.subarray(src * 4, src * 4 + 4), dst * 4)
  })
  return out
}

function eulerQuat(x, y, z) {
  const qx = [Math.cos(x / 2), Math.sin(x / 2), 0, 0]
  const qy = [Math.cos(y / 2), 0, Math.sin(y / 2), 0]
  const qz = [Math.cos(z / 2), 0, 0, Math.sin(z / 2)]
  return qmul(qz, qmul(qy, qx))
}

function qmul([aw, ax, ay, az], [bw, bx, by, bz]) {
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]
}

function rotateVec(q, v) {
  const [w, x, y, z] = qmul(qmul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]])
  void w
  return [x, y, z]
}

function rotateAll(s, q) {
  for (let i = 0; i < s.count; i++) {
    s.pos.set(rotateVec(q, Array.from(s.pos.subarray(i * 3, i * 3 + 3))), i * 3)
    s.quat.set(qmul(q, Array.from(s.quat.subarray(i * 4, i * 4 + 4))), i * 4)
  }
}

/** Centre on the opaque splats' bounding box and scale the longest side to 1. */
function normalize(s) {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < s.count; i++) {
    if (s.rgba[i * 4 + 3] < 128) continue
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], s.pos[i * 3 + k])
      hi[k] = Math.max(hi[k], s.pos[i * 3 + k])
    }
  }
  const centre = lo.map((v, k) => (v + hi[k]) / 2)
  const size = Math.max(...hi.map((v, k) => v - lo[k])) || 1
  for (let i = 0; i < s.count * 3; i++) {
    s.pos[i] = (s.pos[i] - centre[i % 3]) / size
    s.scale[i] /= size
  }
}

// ----------------------------------------------------------- textured mesh

async function fromObj(folder) {
  const files = await readdir(folder)
  const objName = files.find((f) => f.toLowerCase().endsWith('.obj'))
  if (!objName) throw new Error(`no .obj in ${folder}`)
  const text = await readFile(join(folder, objName), 'utf8')

  const v = []
  const vt = []
  const faces = [] // [vi, ti] x3 + material
  let material = null
  let mtlFile = null
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/)
    switch (p[0]) {
      case 'v':
        v.push(+p[1], +p[2], +p[3])
        break
      case 'vt':
        vt.push(+p[1], +p[2])
        break
      case 'usemtl':
        material = p[1]
        break
      case 'mtllib':
        mtlFile = p.slice(1).join(' ')
        break
      case 'f': {
        const corners = p.slice(1).map((c) => c.split('/').map((n) => (n ? Number(n) - 1 : -1)))
        for (let k = 1; k + 1 < corners.length; k++) faces.push([corners[0], corners[k], corners[k + 1], material])
        break
      }
    }
  }

  // Textures per material (map_Kd).
  const textures = new Map()
  if (mtlFile) {
    const mtl = await readFile(join(folder, mtlFile), 'utf8')
    let current = null
    for (const line of mtl.split('\n')) {
      const p = line.trim().split(/\s+/)
      if (p[0] === 'newmtl') current = p[1]
      if (p[0] === 'map_Kd' && current) {
        const { data, info } = await sharp(join(folder, p.slice(1).join(' '))).removeAlpha().raw().toBuffer({ resolveWithObject: true })
        textures.set(current, { data, w: info.width, h: info.height })
      }
    }
  }
  const sample = (tex, u, w) => {
    if (!tex) return [200, 200, 200]
    const x = Math.min(tex.w - 1, Math.max(0, u * (tex.w - 1)))
    const y = Math.min(tex.h - 1, Math.max(0, (1 - w) * (tex.h - 1)))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(tex.w - 1, x0 + 1)
    const y1 = Math.min(tex.h - 1, y0 + 1)
    const fx = x - x0
    const fy = y - y0
    const at = (xx, yy, c) => tex.data[(yy * tex.w + xx) * 3 + c]
    return [0, 1, 2].map((c) => (at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx) * (1 - fy) + (at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx) * fy)
  }

  let keep = faces
  if (args['keep-largest']) keep = largestComponent(faces, v.length / 3)

  // Spread the splat budget over the surface by area.
  const areas = keep.map(([a, b, c]) => triArea(v, a[0], b[0], c[0]))
  const totalArea = areas.reduce((x, y) => x + y, 0)
  const budget = Number(args.max ?? 160_000)
  const spacing = Math.sqrt(totalArea / budget)
  const counts = areas.map((area) => {
    const n = area / (spacing * spacing)
    return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0)
  })
  const total = counts.reduce((x, y) => x + y, 0)
  let s = allocate(total)
  let n = 0
  keep.forEach(([a, b, c, mat], f) => {
    const tex = textures.get(mat) ?? textures.values().next().value
    const pa = v.slice(a[0] * 3, a[0] * 3 + 3)
    const pb = v.slice(b[0] * 3, b[0] * 3 + 3)
    const pc = v.slice(c[0] * 3, c[0] * 3 + 3)
    const e1 = pb.map((x, k) => x - pa[k])
    const e2 = pc.map((x, k) => x - pa[k])
    const normal = norm3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]])
    const quat = quatFromZ(normal)
    for (let i = 0; i < counts[f]; i++) {
      let r1 = Math.random()
      let r2 = Math.random()
      if (r1 + r2 > 1) {
        r1 = 1 - r1
        r2 = 1 - r2
      }
      const r0 = 1 - r1 - r2
      s.pos.set([0, 1, 2].map((k) => pa[k] * r0 + pb[k] * r1 + pc[k] * r2), n * 3)
      const uv =
        a[1] >= 0 && b[1] >= 0 && c[1] >= 0
          ? [0, 1].map((k) => vt[a[1] * 2 + k] * r0 + vt[b[1] * 2 + k] * r1 + vt[c[1] * 2 + k] * r2)
          : [0, 0]
      s.rgba.set([...sample(tex, uv[0], uv[1]).map(Math.round), 255], n * 4)
      s.scale.set([spacing * 0.95, spacing * 0.95, spacing * 0.15], n * 3)
      s.quat.set(quat, n * 4)
      n++
    }
  })

  const rx = (Number(args['rotate-x'] ?? 0) * Math.PI) / 180
  const ry = (Number(args['rotate-y'] ?? 0) * Math.PI) / 180
  const rz = (Number(args['rotate-z'] ?? 0) * Math.PI) / 180
  if (rx || ry || rz) rotateAll(s, eulerQuat(rx, ry, rz))
  normalize(s)
  for (const spec of [args.crop, args.crop2].filter(Boolean)) {
    // --crop cx,cy,cz,r: keep a sphere, in the units of the normalised scene.
    // --crop2 applies a second sphere in the frame the first crop leaves.
    const [cx, cy, cz, r] = String(spec).split(',').map(Number)
    const kept = []
    for (let i = 0; i < s.count; i++) {
      if (Math.hypot(s.pos[i * 3] - cx, s.pos[i * 3 + 1] - cy, s.pos[i * 3 + 2] - cz) <= r) kept.push(i)
    }
    s = subset(s, kept)
    normalize(s)
  }
  if (args['auto-orient']) {
    autoOrient(s)
    normalize(s)
  }
  if (args['drop-stick']) {
    // The capture hangs the cover on a wooden dowel through its top; drop the tan
    // splats in the top half (the orange A/B buttons sit in the bottom half).
    const kept = []
    for (let i = 0; i < s.count; i++) {
      const [r, g, b] = [s.rgba[i * 4], s.rgba[i * 4 + 1], s.rgba[i * 4 + 2]]
      const max = Math.max(r, g, b)
      const wood = r >= g && g >= b && max > 80 && (max - b) / max > 0.22 && r - g > 6
      if (!(wood && s.pos[i * 3 + 1] > 0.12)) kept.push(i)
    }
    // Then trim whatever still pokes out sideways: in 1 cm-ish bins along x, the
    // dowel is a sliver next to the cover's full height.
    const bins = new Map()
    for (const i of kept) {
      const b = Math.round(s.pos[i * 3] / 0.01)
      bins.set(b, (bins.get(b) ?? 0) + 1)
    }
    const counts = [...bins.values()].sort((a, b) => a - b)
    const typical = counts[Math.floor(counts.length * 0.6)]
    const solid = [...bins.entries()].filter(([, c]) => c >= typical * 0.12).map(([b]) => b)
    const [lo, hi] = [Math.min(...solid), Math.max(...solid)]
    const trimmed = kept.filter((i) => {
      const b = Math.round(s.pos[i * 3] / 0.01)
      return b >= lo && b <= hi
    })
    console.log(`drop-stick: removed ${s.count - trimmed.length} splats`)
    s = subset(s, trimmed)
    normalize(s)
  }
  const gain = Number(args.gain ?? 1)
  const saturation = Number(args.saturation ?? 1)
  if (gain !== 1 || saturation !== 1) {
    for (let i = 0; i < s.count; i++) {
      const c = [0, 1, 2].map((k) => s.rgba[i * 4 + k] * gain)
      const grey = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
      for (let k = 0; k < 3; k++) s.rgba[i * 4 + k] = Math.max(0, Math.min(255, Math.round(grey + (c[k] - grey) * saturation)))
    }
  }
  console.log(`mesh: ${v.length / 3} vertices, ${keep.length}/${faces.length} faces, spacing ${spacing.toExponential(2)}`)
  return s
}

/**
 * Turn a flat product so its thinnest axis faces the camera (+z) and its top is +y.
 * The Retro Roller's yellow screen marks both the front and the top half.
 */
function autoOrient(s) {
  const n = s.count
  const mean = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mean[k] += s.pos[i * 3 + k] / n
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < n; i++) {
    const d = [0, 1, 2].map((k) => s.pos[i * 3 + k] - mean[k])
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a * 3 + b] += (d[a] * d[b]) / n
  }
  const axes = eigenvectors(cov) // sorted by descending eigenvalue
  let z = axes[2]
  const screen = [0, 0, 0]
  let screenCount = 0
  for (let i = 0; i < n; i++) {
    const [r, g, b] = [s.rgba[i * 4], s.rgba[i * 4 + 1], s.rgba[i * 4 + 2]]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // Yellow-olive: red and green well above blue, saturated enough to not be leather.
    if (max > 90 && (max - min) / max > 0.38 && b === min && Math.abs(r - g) < 0.35 * max) {
      for (let k = 0; k < 3; k++) screen[k] += s.pos[i * 3 + k]
      screenCount++
    }
  }
  if (screenCount < 50) throw new Error('auto-orient: could not find the yellow screen')
  const toScreen = screen.map((v, k) => v / screenCount - mean[k])
  if (dot(toScreen, z) < 0) z = z.map((v) => -v)
  // Up: toward the screen, within the face plane.
  let y = norm3(toScreen.map((v, k) => v - dot(toScreen, z) * z[k]))
  const x = norm3(cross(y, z))
  y = cross(z, x)
  // Rows of the rotation are the new axes expressed in old coordinates.
  const m = [x, y, z]
  const q = quatFromMatrix(m)
  for (let i = 0; i < n; i++) {
    const p = [0, 1, 2].map((k) => s.pos[i * 3 + k] - mean[k])
    s.pos.set([dot(m[0], p), dot(m[1], p), dot(m[2], p)], i * 3)
    s.quat.set(qmul(q, Array.from(s.quat.subarray(i * 4, i * 4 + 4))), i * 4)
  }
  console.log(`auto-orient: ${screenCount} screen splats`)
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Jacobi eigen-decomposition of a symmetric 3×3 (row-major); eigenvectors by descending value. */
function eigenvectors(a) {
  const A = [[a[0], a[1], a[2]], [a[3], a[4], a[5]], [a[6], a[7], a[8]]]
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-12) continue
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const sn = t * c
      for (let k = 0; k < 3; k++) {
        const akp = A[k][p]
        const akq = A[k][q]
        A[k][p] = c * akp - sn * akq
        A[k][q] = sn * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = A[p][k]
        const aqk = A[q][k]
        A[p][k] = c * apk - sn * aqk
        A[q][k] = sn * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k][p]
        const vkq = V[k][q]
        V[k][p] = c * vkp - sn * vkq
        V[k][q] = sn * vkp + c * vkq
      }
    }
  }
  return [0, 1, 2]
    .map((i) => ({ value: A[i][i], vector: [V[0][i], V[1][i], V[2][i]] }))
    .sort((p, q) => q.value - p.value)
    .map((e) => e.vector)
}

/** Quaternion (wxyz) of a rotation matrix given as rows. */
function quatFromMatrix(m) {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m
  const trace = m00 + m11 + m22
  let q
  if (trace > 0) {
    const t = Math.sqrt(trace + 1) * 2
    q = [0.25 * t, (m21 - m12) / t, (m02 - m20) / t, (m10 - m01) / t]
  } else if (m00 > m11 && m00 > m22) {
    const t = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = [(m21 - m12) / t, 0.25 * t, (m01 + m10) / t, (m02 + m20) / t]
  } else if (m11 > m22) {
    const t = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = [(m02 - m20) / t, (m01 + m10) / t, 0.25 * t, (m12 + m21) / t]
  } else {
    const t = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = [(m10 - m01) / t, (m02 + m20) / t, (m12 + m21) / t, 0.25 * t]
  }
  return norm3(q.slice(1)).length && q.map((v) => v / Math.hypot(...q))
}

function subset(s, indices) {
  const out = allocate(indices.length)
  indices.forEach((src, dst) => {
    out.pos.set(s.pos.subarray(src * 3, src * 3 + 3), dst * 3)
    out.scale.set(s.scale.subarray(src * 3, src * 3 + 3), dst * 3)
    out.rgba.set(s.rgba.subarray(src * 4, src * 4 + 4), dst * 4)
    out.quat.set(s.quat.subarray(src * 4, src * 4 + 4), dst * 4)
  })
  return out
}

function triArea(v, a, b, c) {
  const e1 = [0, 1, 2].map((k) => v[b * 3 + k] - v[a * 3 + k])
  const e2 = [0, 1, 2].map((k) => v[c * 3 + k] - v[a * 3 + k])
  return 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
}

/** Faces of the connected piece with the most surface area (union-find on shared vertices). */
function largestComponent(faces, vertexCount) {
  const parent = new Int32Array(vertexCount).map((_, i) => i)
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]]
    return x
  }
  for (const [a, b, c] of faces) {
    parent[find(a[0])] = find(b[0])
    parent[find(b[0])] = find(c[0])
  }
  const sizes = new Map()
  for (const [a] of faces) sizes.set(find(a[0]), (sizes.get(find(a[0])) ?? 0) + 1)
  const best = [...sizes.entries()].sort((x, y) => y[1] - x[1])[0][0]
  return faces.filter(([a]) => find(a[0]) === best)
}

// ------------------------------------------------------- photo placeholder

async function fromPhoto(path) {
  // 1. Find the product: flood-fill the background in from the borders. The
  //    stitched edge of the cover is crisp, so the fill stops there while the
  //    soft drop shadow (a slow gradient) gets swallowed as background.
  const probe = 512
  const small = await sharp(path).resize(probe, probe, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const bgMask = floodBackground(small, probe, probe, Number(args.step ?? 4), Number(args.bgdist ?? 45))
  let [x0, y0, x1, y1] = [probe, probe, 0, 0]
  for (let y = 0; y < probe; y++)
    for (let x = 0; x < probe; x++)
      if (!bgMask[y * probe + x]) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  const meta = await sharp(path).metadata()
  const k = meta.width / probe
  const pad = 6
  const crop = {
    left: Math.max(0, Math.floor((x0 - pad) * k)),
    top: Math.max(0, Math.floor((y0 - pad) * k)),
    width: Math.ceil((x1 - x0 + 2 * pad) * k),
    height: Math.ceil((y1 - y0 + 2 * pad) * k),
  }

  // 2. Resample the crop to the splat grid and mask it again at that size.
  const W = Number(args.res ?? 220)
  const H = Math.round((W * crop.height) / crop.width)
  const img = await sharp(path).extract(crop).resize(W, H, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer()
  const bg = floodBackground(img, W, H, Number(args.step ?? 4), Number(args.bgdist ?? 45))
  const inside = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) inside[i] = bg[i] ? 0 : 1
  // Close the speckle the fill leaves on the rim, then fill any interior holes.
  erodeDilate(inside, W, H)
  fillHoles(inside, W, H)

  if (args['debug-mask']) {
    const rgb = Buffer.alloc(W * H * 3)
    for (let i = 0; i < W * H; i++) rgb.fill(inside[i] ? 255 : 0, i * 3, i * 3 + 3)
    await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(args['debug-mask'])
  }

  // 3. Inflate: height from the distance to the rim, rounded over `rim` pixels,
  //    with a faint dome so the face catches the turn.
  const dist = distanceTransform(inside, W, H)
  const rim = W * 0.09
  const thickness = W * 0.11 // half-thickness; the cover is ~2 in deep on a 5 in face
  const height = new Float32Array(W * H)
  let maxDist = 0
  for (let i = 0; i < W * H; i++) maxDist = Math.max(maxDist, dist[i])
  for (let i = 0; i < W * H; i++) {
    if (!inside[i]) continue
    const t = Math.min(dist[i] / rim, 1)
    const round = Math.sqrt(1 - (1 - t) * (1 - t))
    const dome = 0.12 * Math.sin((Math.PI / 2) * Math.min(dist[i] / maxDist, 1))
    height[i] = thickness * (round * 0.88 + dome)
  }

  // Back colour: the body leather, sampled just inside the rim.
  const rimSamples = []
  for (let i = 0; i < W * H; i++)
    if (inside[i] && dist[i] > 5 && dist[i] < 11) rimSamples.push([img[i * 3], img[i * 3 + 1], img[i * 3 + 2]])
  const body = [0, 1, 2].map((c) => median(rimSamples.map((p) => p[c])))
  const backColour = body.map((v) => Math.round(v * 0.86))

  // 4. Emit splats: one per front pixel, one per 2×2 block on the back, plus
  //    a few layers through the rim so the edge reads as solid when it turns.
  const front = []
  const back = []
  const side = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!inside[i]) continue
      front.push(i)
      if (x % 2 === 0 && y % 2 === 0) back.push(i)
      if (dist[i] <= 1.5) side.push(i)
    }
  }
  // Enough layers through the rim that neighbouring splats overlap (σ ≈ 0.9 px).
  const layersAt = (i) => Math.max(3, Math.ceil((2 * Math.max(height[i], thickness * 0.35)) / 0.9))
  const total = front.length + back.length + side.reduce((sum, i) => sum + layersAt(i), 0)
  const s = allocate(total)
  const px = 1 / W // grid spacing in model units (width = 1)
  const at = (x, y) => height[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))]
  let n = 0
  const put = (pos, scale, rgba, quat) => {
    s.pos.set(pos, n * 3)
    s.scale.set(scale, n * 3)
    s.rgba.set(rgba, n * 4)
    s.quat.set(quat, n * 4)
    n++
  }
  const toModel = (x, y, z) => [(x - W / 2) * px, -(y - H / 2) * px, z * px]

  for (const i of front) {
    const x = i % W
    const y = (i / W) | 0
    // Surface normal from the height gradient, splat flattened along it.
    const gx = (at(x + 1, y) - at(x - 1, y)) / 2
    const gy = -(at(x, y + 1) - at(x, y - 1)) / 2
    const normal = norm3([-gx, -gy, 1])
    const shade = 0.82 + 0.18 * normal[2]
    put(
      toModel(x, y, height[i]),
      [px * 0.62, px * 0.62, px * 0.12],
      [img[i * 3] * shade, img[i * 3 + 1] * shade, img[i * 3 + 2] * shade, 255].map(Math.round),
      quatFromZ(normal),
    )
  }
  for (const i of back) {
    const x = i % W
    const y = (i / W) | 0
    const gx = (at(x + 1, y) - at(x - 1, y)) / 2
    const gy = -(at(x, y + 1) - at(x, y - 1)) / 2
    const normal = norm3([-gx, -gy, -1])
    put(toModel(x + 0.5, y + 0.5, -height[i]), [px * 1.25, px * 1.25, px * 0.2], [...backColour, 255], quatFromZ(normal))
  }
  for (const i of side) {
    const x = i % W
    const y = (i / W) | 0
    const h = Math.max(height[i], thickness * 0.35)
    const dx = at(x + 1, y) - at(x - 1, y)
    const dy = at(x, y - 1) - at(x, y + 1)
    const outward = norm3([-dx, -dy, 0])
    const layers = layersAt(i)
    for (let l = 0; l < layers; l++) {
      const z = -h + (2 * h * (l + 0.5)) / layers
      put(
        toModel(x, y, z),
        [px * 0.9, px * 0.9, px * 0.25],
        [...body.map((v) => Math.round(v * 0.8)), 255],
        quatFromZ(outward[0] || outward[1] ? outward : [0, 0, 1]),
      )
    }
  }
  normalize(s)
  return s
}

function floodBackground(img, W, H, step, maxDist) {
  const corners = [0, W - 1, (H - 1) * W, H * W - 1]
  const ref = [0, 1, 2].map((c) => median(corners.map((i) => img[i * 3 + c])))
  const bg = new Uint8Array(W * H)
  const queue = []
  for (let x = 0; x < W; x++) queue.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) queue.push(y * W, y * W + W - 1)
  for (const i of queue) bg[i] = 1
  const diff = (a, b) => Math.max(Math.abs(img[a * 3] - img[b * 3]), Math.abs(img[a * 3 + 1] - img[b * 3 + 1]), Math.abs(img[a * 3 + 2] - img[b * 3 + 2]))
  const fromRef = (a) => Math.hypot(img[a * 3] - ref[0], img[a * 3 + 1] - ref[1], img[a * 3 + 2] - ref[2])
  while (queue.length) {
    const i = queue.pop()
    const x = i % W
    const y = (i / W) | 0
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || bg[j]) continue
      if (diff(i, j) <= step && fromRef(j) <= maxDist) {
        bg[j] = 1
        queue.push(j)
      }
    }
  }
  return bg
}

function erodeDilate(mask, W, H) {
  const pass = (src, keepIf) => {
    const out = new Uint8Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let count = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) count += src[yy * W + xx]
          }
        out[y * W + x] = keepIf(count, src[y * W + x]) ? 1 : 0
      }
    return out
  }
  const opened = pass(pass(mask, (c) => c === 9), (c) => c > 0)
  // One more erosion trims the halo of background-tinted pixels on the rim.
  mask.set(pass(opened, (c) => c === 9))
}

function fillHoles(mask, W, H) {
  const outside = new Uint8Array(W * H)
  const queue = []
  const seed = (i) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1
      queue.push(i)
    }
  }
  for (let x = 0; x < W; x++) {
    seed(x)
    seed((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    seed(y * W)
    seed(y * W + W - 1)
  }
  while (queue.length) {
    const i = queue.pop()
    const x = i % W
    const y = (i / W) | 0
    if (x > 0) seed(i - 1)
    if (x < W - 1) seed(i + 1)
    if (y > 0) seed(i - W)
    if (y < H - 1) seed(i + W)
  }
  for (let i = 0; i < W * H; i++) mask[i] = outside[i] ? 0 : 1
}

/** Two-pass chamfer distance (in pixels) from each inside pixel to the outside. */
function distanceTransform(mask, W, H) {
  const d = new Float32Array(W * H)
  const BIG = 1e9
  for (let i = 0; i < W * H; i++) d[i] = mask[i] ? BIG : 0
  const a = 1
  const b = Math.SQRT2
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x])
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], get(x - 1, y) + a, get(x, y - 1) + a, get(x - 1, y - 1) + b, get(x + 1, y - 1) + b)
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], get(x + 1, y) + a, get(x, y + 1) + a, get(x + 1, y + 1) + b, get(x - 1, y + 1) + b)
    }
  return d
}

function median(values) {
  const sorted = [...values].sort((x, y) => x - y)
  return sorted[sorted.length >> 1] ?? 0
}

function norm3(v) {
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}

/** Quaternion (wxyz) rotating +z onto `n`, so a splat's thin axis follows the surface normal. */
function quatFromZ([x, y, z]) {
  if (z < -0.9999) return [0, 1, 0, 0]
  const q = [1 + z, -y, x, 0]
  const n = Math.hypot(...q)
  return q.map((v) => v / n)
}

// ------------------------------------------------------------------ encode

function encode(s) {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  let lsMin = Infinity
  let lsMax = -Infinity
  for (let i = 0; i < s.count; i++) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], s.pos[i * 3 + k])
      hi[k] = Math.max(hi[k], s.pos[i * 3 + k])
      const ls = Math.log(Math.max(s.scale[i * 3 + k], 1e-7))
      lsMin = Math.min(lsMin, ls)
      lsMax = Math.max(lsMax, ls)
    }
  }
  const headerBytes = 4 + 4 + 4 + 24 + 8
  const out = Buffer.alloc(headerBytes + s.count * (6 + 3 + 4 + 4))
  out.write('SRSP', 0, 'latin1')
  out.writeUInt32LE(1, 4)
  out.writeUInt32LE(s.count, 8)
  ;[...lo, ...hi].forEach((v, k) => out.writeFloatLE(v, 12 + k * 4))
  out.writeFloatLE(lsMin, 36)
  out.writeFloatLE(lsMax, 40)
  let o = headerBytes
  for (let i = 0; i < s.count * 3; i++, o += 2) {
    const k = i % 3
    const t = hi[k] > lo[k] ? (s.pos[i] - lo[k]) / (hi[k] - lo[k]) : 0
    out.writeUInt16LE(Math.round(t * 65535), o)
  }
  const lsRange = lsMax - lsMin || 1
  for (let i = 0; i < s.count * 3; i++, o++) {
    out[o] = Math.round(((Math.log(Math.max(s.scale[i], 1e-7)) - lsMin) / lsRange) * 255)
  }
  for (let i = 0; i < s.count * 4; i++, o++) out[o] = Math.max(0, Math.min(255, Math.round(s.rgba[i])))
  for (let i = 0; i < s.count; i++) {
    // q and -q are the same rotation; keep w >= 0 so the sign survives quantisation.
    const sign = s.quat[i * 4] < 0 ? -1 : 1
    for (let k = 0; k < 4; k++, o++) out[o] = Math.round(Math.max(-1, Math.min(1, sign * s.quat[i * 4 + k])) * 127.5 + 127.5)
  }
  return out
}
