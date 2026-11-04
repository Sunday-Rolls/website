import { describe, expect, it } from 'vitest'
import { decodeSplat } from './format'

/** One splat at the bbox max corner, scale e^0 / e^-2 / e^-2, identity rotation. */
function oneSplat(): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + 17)
  const view = new DataView(buffer)
  'SRSP'.split('').forEach((c, i) => view.setUint8(i, c.charCodeAt(0)))
  view.setUint32(4, 1, true)
  view.setUint32(8, 1, true)
  ;[-0.5, -0.5, -0.1, 0.5, 0.5, 0.1].forEach((v, i) => view.setFloat32(12 + i * 4, v, true))
  view.setFloat32(36, -2, true)
  view.setFloat32(40, 0, true)
  ;[65535, 0, 65535].forEach((v, i) => view.setUint16(44 + i * 2, v, true))
  ;[255, 0, 0].forEach((v, i) => view.setUint8(50 + i, v))
  ;[10, 20, 30, 255].forEach((v, i) => view.setUint8(53 + i, v))
  ;[255, 128, 128, 128].forEach((v, i) => view.setUint8(57 + i, v))
  return buffer
}

describe('decodeSplat', () => {
  it('dequantises position, colour and covariance', () => {
    const cloud = decodeSplat(oneSplat())
    expect(cloud.count).toBe(1)
    expect(Array.from(cloud.centers)).toEqual([0.5, -0.5, expect.closeTo(0.1, 5)])
    expect(Array.from(cloud.colors)).toEqual([10, 20, 30, 255])
    const [xx, xy, xz, yy, yz, zz] = cloud.covariances
    expect(xx).toBeCloseTo(1, 2)
    expect(yy).toBeCloseTo(Math.exp(-4), 3)
    expect(zz).toBeCloseTo(Math.exp(-4), 3)
    expect(Math.abs(xy) + Math.abs(xz) + Math.abs(yz)).toBeLessThan(0.02)
  })

  it('rejects other files', () => {
    expect(() => decodeSplat(new ArrayBuffer(64))).toThrow(/srsp/)
  })
})
