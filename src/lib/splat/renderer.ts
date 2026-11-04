import type { SplatCloud } from './format'

/**
 * A small WebGL2 Gaussian-splat renderer for a single object turning in front of
 * a fixed camera. Each splat is an instanced quad; its 3D covariance is projected
 * to a 2D ellipse in the vertex shader (EWA splatting, as in 3DGS) and splats are
 * blended back to front after a CPU counting sort. The canvas is transparent so
 * the section background shows through.
 */

const TEX_WIDTH = 2048

const VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uCenters;
uniform sampler2D uCovA;
uniform sampler2D uCovB;
uniform sampler2D uColors;
uniform mat3 uW;
uniform vec3 uT;
uniform vec2 uFocal;
uniform vec2 uViewport;

in vec2 aCorner;
in uint aIndex;

out vec4 vColor;
out vec2 vPos;

void main() {
  ivec2 tc = ivec2(int(aIndex % ${TEX_WIDTH}u), int(aIndex / ${TEX_WIDTH}u));
  vec3 cam = uW * texelFetch(uCenters, tc, 0).xyz + uT;
  if (cam.z < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  vec4 a = texelFetch(uCovA, tc, 0);
  vec2 b = texelFetch(uCovB, tc, 0).xy;
  mat3 V = mat3(a.x, a.y, a.z, a.y, a.w, b.x, a.z, b.x, b.y);

  float iz = 1.0 / cam.z;
  mat3 J = mat3(
    uFocal.x * iz, 0.0, 0.0,
    0.0, uFocal.y * iz, 0.0,
    -uFocal.x * cam.x * iz * iz, -uFocal.y * cam.y * iz * iz, 0.0
  );
  mat3 T = J * uW;
  mat3 cov = T * V * transpose(T);

  float c00 = cov[0][0] + 0.3;
  float c01 = cov[0][1];
  float c11 = cov[1][1] + 0.3;
  float mid = 0.5 * (c00 + c11);
  float radius = length(vec2(0.5 * (c00 - c11), c01));
  float l1 = mid + radius;
  float l2 = max(mid - radius, 0.1);
  vec2 dir = abs(c01) > 1e-6 ? normalize(vec2(c01, l1 - c00)) : (c00 >= c11 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 major = min(sqrt(2.0 * l1), 1024.0) * dir;
  vec2 minor = min(sqrt(2.0 * l2), 1024.0) * vec2(dir.y, -dir.x);

  vec2 centre = vec2(uFocal.x * cam.x, uFocal.y * cam.y) * iz;
  vec2 offset = aCorner.x * major + aCorner.y * minor;
  gl_Position = vec4((centre + offset) / (0.5 * uViewport), 0.0, 1.0);

  vColor = texelFetch(uColors, tc, 0);
  vPos = aCorner;
}
`

const FRAGMENT = `#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vPos;
out vec4 fragColor;

void main() {
  float power = -dot(vPos, vPos);
  if (power < -4.0) discard;
  float alpha = exp(power) * vColor.a;
  if (alpha < 1.0 / 255.0) discard;
  fragColor = vec4(vColor.rgb * alpha, alpha);
}
`

export interface SplatView {
  /** Turn about the vertical axis, radians. */
  yaw: number
  /** Tilt toward the viewer, radians. */
  pitch: number
}

export class SplatRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly indexBuffer: WebGLBuffer
  private readonly textures: WebGLTexture[] = []
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {}
  private cloud: SplatCloud | null = null
  private order = new Uint32Array(0)
  private depthKeys = new Uint16Array(0)
  private counts = new Uint32Array(65536)
  private lastSortedYaw = Number.NaN
  private lastSortedPitch = Number.NaN
  private width = 1
  private height = 1
  /** Vertical field of view in radians. */
  private readonly fov = (28 * Math.PI) / 180

  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl

    this.program = link(gl, VERTEX, FRAGMENT)
    for (const name of ['uCenters', 'uCovA', 'uCovB', 'uColors', 'uW', 'uT', 'uFocal', 'uViewport']) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name)
    }

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]), gl.STATIC_DRAW)
    const corner = gl.getAttribLocation(this.program, 'aCorner')
    gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)

    this.indexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer)
    const index = gl.getAttribLocation(this.program, 'aIndex')
    gl.enableVertexAttribArray(index)
    gl.vertexAttribIPointer(index, 1, gl.UNSIGNED_INT, 0, 0)
    gl.vertexAttribDivisor(index, 1)

    gl.bindVertexArray(null)
  }

  setCloud(cloud: SplatCloud) {
    const { gl } = this
    this.cloud = cloud
    const rows = Math.ceil(cloud.count / TEX_WIDTH)
    const texels = TEX_WIDTH * rows

    const centers = new Float32Array(texels * 4)
    const covA = new Float32Array(texels * 4)
    const covB = new Float32Array(texels * 4)
    const colors = new Uint8Array(texels * 4)
    for (let i = 0; i < cloud.count; i++) {
      centers.set(cloud.centers.subarray(i * 3, i * 3 + 3), i * 4)
      covA.set(cloud.covariances.subarray(i * 6, i * 6 + 4), i * 4)
      covB.set(cloud.covariances.subarray(i * 6 + 4, i * 6 + 6), i * 4)
    }
    colors.set(cloud.colors)

    for (const texture of this.textures) gl.deleteTexture(texture)
    this.textures.length = 0
    this.textures.push(
      upload(gl, 0, gl.RGBA32F, gl.RGBA, gl.FLOAT, rows, centers),
      upload(gl, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, rows, covA),
      upload(gl, 2, gl.RGBA32F, gl.RGBA, gl.FLOAT, rows, covB),
      upload(gl, 3, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, rows, colors),
    )

    this.order = new Uint32Array(cloud.count)
    this.depthKeys = new Uint16Array(cloud.count)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.order.byteLength, gl.DYNAMIC_DRAW)
    this.lastSortedYaw = Number.NaN
  }

  /** Size the drawing buffer in device pixels. */
  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.width = Math.max(1, Math.round(cssWidth * dpr))
    this.height = Math.max(1, Math.round(cssHeight * dpr))
    if (this.canvas.width !== this.width) this.canvas.width = this.width
    if (this.canvas.height !== this.height) this.canvas.height = this.height
  }

  render({ yaw, pitch }: SplatView) {
    const { gl, cloud } = this
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!cloud || cloud.count === 0) return

    // World → camera: rotate the object (yaw about y, then pitch about x), then
    // flip z so the camera looks down +z from `distance` away.
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    // R = Rx(pitch) · Ry(yaw), rows:
    const r0 = [cy, 0, sy]
    const r1 = [sp * sy, cp, -sp * cy]
    const r2 = [-cp * sy, sp, cp * cy]
    // W = diag(1, 1, -1) · R
    const w2 = [-r2[0], -r2[1], -r2[2]]

    const tanHalf = Math.tan(this.fov / 2)
    const aspect = this.width / this.height
    // Keep the unit-sized object (plus room to turn) inside the shorter side.
    const fitHalf = 0.62
    const distance = fitHalf / (tanHalf * Math.min(1, aspect)) + 0.5
    const focalY = this.height / 2 / tanHalf

    if (
      Number.isNaN(this.lastSortedYaw) ||
      Math.abs(yaw - this.lastSortedYaw) > 0.01 ||
      Math.abs(pitch - this.lastSortedPitch) > 0.01
    ) {
      this.sort(w2)
      this.lastSortedYaw = yaw
      this.lastSortedPitch = pitch
    }

    gl.useProgram(this.program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)
    // Column-major: columns are W's columns.
    gl.uniformMatrix3fv(this.uniforms.uW, false, [r0[0], r1[0], w2[0], r0[1], r1[1], w2[1], r0[2], r1[2], w2[2]])
    gl.uniform3f(this.uniforms.uT, 0, 0, distance)
    gl.uniform2f(this.uniforms.uFocal, focalY, focalY)
    gl.uniform2f(this.uniforms.uViewport, this.width, this.height)
    gl.uniform1i(this.uniforms.uCenters, 0)
    gl.uniform1i(this.uniforms.uCovA, 1)
    gl.uniform1i(this.uniforms.uCovB, 2)
    gl.uniform1i(this.uniforms.uColors, 3)
    this.textures.forEach((texture, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    })

    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, cloud.count)
    gl.bindVertexArray(null)
  }

  /** Back-to-front counting sort on 16-bit view depth. */
  private sort(depthRow: number[]) {
    const { cloud, order, depthKeys, counts } = this
    if (!cloud) return
    const { centers, count } = cloud
    let min = Infinity
    let max = -Infinity
    const depths = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const d = depthRow[0] * centers[i * 3] + depthRow[1] * centers[i * 3 + 1] + depthRow[2] * centers[i * 3 + 2]
      depths[i] = d
      if (d < min) min = d
      if (d > max) max = d
    }
    const scale = max > min ? 65535 / (max - min) : 0
    counts.fill(0)
    for (let i = 0; i < count; i++) {
      // Farthest (largest depth) gets key 0 so it draws first.
      const key = ((max - depths[i]) * scale) | 0
      depthKeys[i] = key
      counts[key]++
    }
    for (let k = 1; k < 65536; k++) counts[k] += counts[k - 1]
    for (let i = count - 1; i >= 0; i--) order[--counts[depthKeys[i]]] = i

    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, order)
  }

  dispose() {
    const { gl } = this
    for (const texture of this.textures) gl.deleteTexture(texture)
    gl.deleteBuffer(this.indexBuffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

function upload(
  gl: WebGL2RenderingContext,
  unit: number,
  internalFormat: number,
  format: number,
  type: number,
  rows: number,
  data: ArrayBufferView,
): WebGLTexture {
  const texture = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, TEX_WIDTH, rows, 0, format, type, data)
  return texture
}

function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`splat shader: ${gl.getShaderInfoLog(shader)}`)
    }
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`splat program: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}
