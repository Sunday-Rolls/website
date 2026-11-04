/**
 * Decoder for `.srsp`, the compact splat format written by `scripts/build-splat.mjs`.
 * See that script's header for the byte layout.
 */
export interface SplatCloud {
  count: number
  /** xyz per splat. */
  centers: Float32Array
  /** Upper triangle of the 3D covariance per splat: xx, xy, xz, yy, yz, zz. */
  covariances: Float32Array
  /** rgba per splat, 0..255. */
  colors: Uint8Array
}

const HEADER_BYTES = 44

export function decodeSplat(buffer: ArrayBuffer): SplatCloud {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
  if (magic !== 'SRSP') throw new Error('not an .srsp splat file')
  const version = view.getUint32(4, true)
  if (version !== 1) throw new Error(`unsupported .srsp version ${version}`)

  const count = view.getUint32(8, true)
  const lo = [0, 1, 2].map((k) => view.getFloat32(12 + k * 4, true))
  const hi = [0, 1, 2].map((k) => view.getFloat32(24 + k * 4, true))
  const lsMin = view.getFloat32(36, true)
  const lsMax = view.getFloat32(40, true)

  let offset = HEADER_BYTES
  const pos = new Uint16Array(buffer.slice(offset, offset + count * 6))
  offset += count * 6
  const logScale = new Uint8Array(buffer, offset, count * 3)
  offset += count * 3
  const colors = new Uint8Array(buffer.slice(offset, offset + count * 4))
  offset += count * 4
  const quat = new Uint8Array(buffer, offset, count * 4)

  const centers = new Float32Array(count * 3)
  const covariances = new Float32Array(count * 6)
  const lsRange = lsMax - lsMin

  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      centers[i * 3 + k] = lo[k] + (pos[i * 3 + k] / 65535) * (hi[k] - lo[k])
    }

    const sx = Math.exp(lsMin + (logScale[i * 3] / 255) * lsRange)
    const sy = Math.exp(lsMin + (logScale[i * 3 + 1] / 255) * lsRange)
    const sz = Math.exp(lsMin + (logScale[i * 3 + 2] / 255) * lsRange)

    let w = (quat[i * 4] - 127.5) / 127.5
    let x = (quat[i * 4 + 1] - 127.5) / 127.5
    let y = (quat[i * 4 + 2] - 127.5) / 127.5
    let z = (quat[i * 4 + 3] - 127.5) / 127.5
    const n = Math.hypot(w, x, y, z) || 1
    w /= n
    x /= n
    y /= n
    z /= n

    // Rotation matrix rows, then Σ = R S Sᵀ Rᵀ = M Mᵀ with M = R S.
    const m00 = (1 - 2 * (y * y + z * z)) * sx
    const m01 = 2 * (x * y - w * z) * sy
    const m02 = 2 * (x * z + w * y) * sz
    const m10 = 2 * (x * y + w * z) * sx
    const m11 = (1 - 2 * (x * x + z * z)) * sy
    const m12 = 2 * (y * z - w * x) * sz
    const m20 = 2 * (x * z - w * y) * sx
    const m21 = 2 * (y * z + w * x) * sy
    const m22 = (1 - 2 * (x * x + y * y)) * sz

    const c = i * 6
    covariances[c] = m00 * m00 + m01 * m01 + m02 * m02
    covariances[c + 1] = m00 * m10 + m01 * m11 + m02 * m12
    covariances[c + 2] = m00 * m20 + m01 * m21 + m02 * m22
    covariances[c + 3] = m10 * m10 + m11 * m11 + m12 * m12
    covariances[c + 4] = m10 * m20 + m11 * m21 + m12 * m22
    covariances[c + 5] = m20 * m20 + m21 * m21 + m22 * m22
  }

  return { count, centers, covariances, colors }
}
