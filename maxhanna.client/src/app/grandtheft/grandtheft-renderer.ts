export interface CityMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  indexType?: number;
  bounds?: { w: number; h: number; d: number };
}

export interface CityChunk {
  mesh: CityMesh;
  cx: number;
  cz: number;
}

const CHUNK_SIZE = 80;
const GRID_PITCH = 40;
const BLOCK_SIZE = 30;

// --- Minimal Matrix Math Utilities ---
const mat4 = {
  create: () => new Float32Array(16),
  identity: (m: Float32Array) => {
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return m;
  },
  perspective: (out: Float32Array, fovy: number, aspect: number, near: number, far: number) => {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  },
  lookAt: (out: Float32Array, eye: number[], center: number[], up: number[]) => {
    const [ex, ey, ez] = eye;
    let zx = ex - center[0], zy = ey - center[1], zz = ez - center[2];
    let len = 1 / Math.hypot(zx, zy, zz);
    zx *= len; zy *= len; zz *= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (!len) { xx = 0; xy = 0; xz = 0; } else { len = 1 / len; xx *= len; xy *= len; xz *= len; }
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },
  multiply: (out: Float32Array, a: Float32Array, b: Float32Array) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },
  translate: (out: Float32Array, a: Float32Array, v: number[]) => {
    const x = v[0], y = v[1], z = v[2];
    if (a === out) {
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
      for (let i = 0; i < 12; i++) out[i] = a[i];
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    }
    return out;
  },
  rotateY: (out: Float32Array, a: Float32Array, rad: number) => {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    if (a !== out) {
      out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
  },
  scale: (out: Float32Array, a: Float32Array, v: number[]) => {
    const x = v[0], y = v[1], z = v[2];
    out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
    out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
    out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  },
  targetTo: (out: Float32Array, eye: number[], target: number[], up: number[]) => {
    const [ex, ey, ez] = eye;
    let zx = target[0] - ex, zy = target[1] - ey, zz = target[2] - ez;
    let len = 1 / Math.hypot(zx, zy, zz);
    zx *= len; zy *= len; zz *= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (!len) { xx = 0; xy = 0; xz = 0; } else { len = 1 / len; xx *= len; xy *= len; xz *= len; }
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }
};

export class GrandTheftRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private projLoc: WebGLUniformLocation;
  private viewLoc: WebGLUniformLocation;
  private modelLoc: WebGLUniformLocation;
  private colorLoc: WebGLUniformLocation;
  private normalMatrixLoc: WebGLUniformLocation | null = null;
  private lightDirLoc: WebGLUniformLocation | null = null;
  private viewPosLoc: WebGLUniformLocation | null = null;

  viewMatrix = mat4.create();
  projMatrix = mat4.create();
  private modelMatrix = mat4.create();
  private chunkCache = new Map<string, CityChunk>();
  private meshCache = new Map<string, CityMesh>();

  public playerMesh!: CityMesh;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    const vs = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec4 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMatrix;
uniform vec4 uColor;
out vec4 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out float vDepth;
void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * worldPos;
  gl_Position = uProj * viewPos;
  vColor = aColor * uColor;
  vNormal = normalize(uNormalMatrix * aNormal);
  vWorldPos = worldPos.xyz;
  vDepth = length(viewPos.xyz);
}
`;
    const fs = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in float vDepth;
out vec4 FragColor;
uniform vec3 uLightDir;
uniform vec3 uViewPos;
void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  float diff = max(dot(N, L), 0.0);
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 32.0);
  vec3 ambient = 0.15 * vColor.rgb;
  vec3 diffuse = diff * vColor.rgb;
  vec3 specular = spec * vec3(0.6);
  vec3 color = ambient + diffuse + specular;
  float fog = clamp((vDepth - 80.0) / 250.0, 0.0, 1.0);
  vec3 fogColor = vec3(0.5, 0.6, 0.7);
  vec3 finalColor = mix(color, fogColor, fog * vColor.a);
  FragColor = vec4(finalColor, vColor.a);
}
`;

    this.program = this.createProgram(vs, fs);
    gl.useProgram(this.program);
    this.projLoc = gl.getUniformLocation(this.program, 'uProj')!;
    this.viewLoc = gl.getUniformLocation(this.program, 'uView')!;
    this.modelLoc = gl.getUniformLocation(this.program, 'uModel')!;
    this.colorLoc = gl.getUniformLocation(this.program, 'uColor')!;
    this.normalMatrixLoc = gl.getUniformLocation(this.program, 'uNormalMatrix');
    this.lightDirLoc = gl.getUniformLocation(this.program, 'uLightDir');
    this.viewPosLoc = gl.getUniformLocation(this.program, 'uViewPos');

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.playerMesh = this.getPlayerMesh([0.2, 0.8, 1.0]);
  }

  resize(w: number, h: number) {
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) { console.error('Failed to create shader'); return null; }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const program = this.gl.createProgram()!;
    const vsh = this.createShader(this.gl.VERTEX_SHADER, vs);
    const fsh = this.createShader(this.gl.FRAGMENT_SHADER, fs);
    if (!vsh || !fsh) {
      if (vsh) this.gl.deleteShader(vsh);
      if (fsh) this.gl.deleteShader(fsh);
      this.gl.deleteProgram(program);
      throw new Error('Shader compilation failed');
    }
    this.gl.attachShader(program, vsh);
    this.gl.attachShader(program, fsh);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      console.error('Shader link error:', info);
      this.gl.deleteProgram(program);
      throw new Error('Program link failed');
    }
    return program;
  }

  private mulberry32(seed: number) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  private createMesh(verts: number[], indices: number[]): CityMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    // compute vertex count from indices (robust even if vertices are not tightly packed)
    let maxIndex = 0;
    for (let i = 0; i < indices.length; i++) if (indices[i] > maxIndex) maxIndex = indices[i];
    const vertexCount = maxIndex + 1;
    let floatsPerVertex = 7;
    if (vertexCount > 0) floatsPerVertex = Math.round(verts.length / vertexCount) || 7;

    // If input provides only pos+color (7 floats), generate normals per-vertex
    let interleaved: Float32Array;
    if (floatsPerVertex === 7) {
      const positions = new Float32Array(vertexCount * 3);
      const colors = new Float32Array(vertexCount * 4);
      for (let i = 0; i < vertexCount; i++) {
        const base = i * 7;
        positions[i * 3 + 0] = verts[base + 0];
        positions[i * 3 + 1] = verts[base + 1];
        positions[i * 3 + 2] = verts[base + 2];
        colors[i * 4 + 0] = verts[base + 3];
        colors[i * 4 + 1] = verts[base + 4];
        colors[i * 4 + 2] = verts[base + 5];
        colors[i * 4 + 3] = verts[base + 6];
      }
      const normals = new Float32Array(vertexCount * 3);
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
        const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
        const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
        const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
        const v1x = bx - ax, v1y = by - ay, v1z = bz - az;
        const v2x = cx - ax, v2y = cy - ay, v2z = cz - az;
        const nx = v1y * v2z - v1z * v2y;
        const ny = v1z * v2x - v1x * v2z;
        const nz = v1x * v2y - v1y * v2x;
        normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
        normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
        normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
      }
      // normalize normals
      for (let i = 0; i < vertexCount; i++) {
        const ni = i * 3;
        const nx = normals[ni], ny = normals[ni + 1], nz = normals[ni + 2];
        const l = Math.hypot(nx, ny, nz) || 1.0;
        normals[ni] = nx / l; normals[ni + 1] = ny / l; normals[ni + 2] = nz / l;
      }
      // build interleaved pos(3)+normal(3)+color(4)
      interleaved = new Float32Array(vertexCount * 10);
      for (let i = 0; i < vertexCount; i++) {
        const pi = i * 3, ni = i * 3, ci = i * 4, wi = i * 10;
        interleaved[wi + 0] = positions[pi + 0];
        interleaved[wi + 1] = positions[pi + 1];
        interleaved[wi + 2] = positions[pi + 2];
        interleaved[wi + 3] = normals[ni + 0];
        interleaved[wi + 4] = normals[ni + 1];
        interleaved[wi + 5] = normals[ni + 2];
        interleaved[wi + 6] = colors[ci + 0];
        interleaved[wi + 7] = colors[ci + 1];
        interleaved[wi + 8] = colors[ci + 2];
        interleaved[wi + 9] = colors[ci + 3];
      }
      floatsPerVertex = 10;
    } else {
      interleaved = new Float32Array(verts);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    const useUint32 = indices.length > 0xffff;
    if (useUint32) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    else gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, 'aPos');
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, floatsPerVertex * 4, 0);
    }
    if (floatsPerVertex === 10) {
      const normalLoc = gl.getAttribLocation(this.program, 'aNormal');
      const colorLoc = gl.getAttribLocation(this.program, 'aColor');
      if (normalLoc >= 0) {
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, floatsPerVertex * 4, 3 * 4);
      }
      if (colorLoc >= 0) {
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, floatsPerVertex * 4, 6 * 4);
      }
    } else {
      const colorLoc = gl.getAttribLocation(this.program, 'aColor');
      if (colorLoc >= 0) {
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, floatsPerVertex * 4, 3 * 4);
      }
    }

    gl.bindVertexArray(null);
    return { vao, vbo, ibo, indexCount: indices.length, indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  private computeNormalMatrix(out: Float32Array, m: Float32Array) {
    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[4], m11 = m[5], m12 = m[6];
    const m20 = m[8], m21 = m[9], m22 = m[10];
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    if (!det) {
      out[0] = 1; out[1] = 0; out[2] = 0;
      out[3] = 0; out[4] = 1; out[5] = 0;
      out[6] = 0; out[7] = 0; out[8] = 1;
      return out;
    }
    const invDet = 1 / det;
    const inv00 = (m11 * m22 - m12 * m21) * invDet;
    const inv01 = (m02 * m21 - m01 * m22) * invDet;
    const inv02 = (m01 * m12 - m02 * m11) * invDet;
    const inv10 = (m12 * m20 - m10 * m22) * invDet;
    const inv11 = (m00 * m22 - m02 * m20) * invDet;
    const inv12 = (m02 * m10 - m00 * m12) * invDet;
    const inv20 = (m10 * m21 - m11 * m20) * invDet;
    const inv21 = (m01 * m20 - m00 * m21) * invDet;
    const inv22 = (m00 * m11 - m01 * m10) * invDet;
    out[0] = inv00; out[1] = inv10; out[2] = inv20;
    out[3] = inv01; out[4] = inv11; out[5] = inv21;
    out[6] = inv02; out[7] = inv12; out[8] = inv22;
    return out;
  }

  private addBox(verts: number[], indices: number[], x: number, y: number, z: number, w: number, h: number, d: number, r: number, g: number, b: number, a: number, idxOffset: number) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const faces = [
      [hw, hh, -hd, -hw, hh, -hd, -hw, hh, hd, hw, hh, hd],
      [-hw, -hh, -hd, hw, -hh, -hd, hw, -hh, hd, -hw, -hh, hd],
      [-hw, hh, hd, -hw, -hh, hd, hw, -hh, hd, hw, hh, hd],
      [hw, hh, -hd, hw, -hh, -hd, -hw, -hh, -hd, -hw, hh, -hd],
      [-hw, hh, -hd, -hw, -hh, -hd, -hw, -hh, hd, -hw, hh, hd],
      [hw, hh, hd, hw, -hh, hd, hw, -hh, -hd, hw, hh, -hd]
    ];

    for (let i = 0; i < 6; i++) {
      const f = faces[i];
      const shade = 0.8 + (i * 0.05);
      for (let j = 0; j < 12; j += 3) {
        verts.push(x + f[j], y + f[j + 1], z + f[j + 2], r * shade, g * shade, b * shade, a);
      }
    }

    for (let i = 0; i < 24; i += 4) {
      indices.push(i + idxOffset, i + 1 + idxOffset, i + 2 + idxOffset, i + idxOffset, i + 2 + idxOffset, i + 3 + idxOffset);
    }
  }

  private addPlane(verts: number[], indices: number[], x: number, z: number, w: number, d: number, r: number, g: number, b: number, a: number, idxOffset: number) {
    verts.push(
      x - w / 2, 0, z - d / 2, r, g, b, a,
      x + w / 2, 0, z - d / 2, r, g, b, a,
      x + w / 2, 0, z + d / 2, r, g, b, a,
      x - w / 2, 0, z + d / 2, r, g, b, a
    );
    indices.push(idxOffset, idxOffset + 1, idxOffset + 2, idxOffset, idxOffset + 2, idxOffset + 3);
  }

  getCityChunk(cx: number, cz: number): CityChunk {
    const key = `${cx},${cz}`;
    if (this.chunkCache.has(key)) return this.chunkCache.get(key)!;

    const verts: number[] = [];
    const indices: number[] = [];
    let idxOffset = 0;

    const worldOriginX = cx * CHUNK_SIZE;
    const worldOriginZ = cz * CHUNK_SIZE;

    this.addPlane(verts, indices, worldOriginX + CHUNK_SIZE / 2, worldOriginZ + CHUNK_SIZE / 2, CHUNK_SIZE, CHUNK_SIZE, 0.15, 0.15, 0.15, 1.0, idxOffset);
    idxOffset += 4;

    const seed = (cx * 100003 + cz * 70001) >>> 0;
    const rng = this.mulberry32(seed);
    const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;

    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = cx * blocksPerChunk + bx;
        const gz = cz * blocksPerChunk + by;
        const blockWorldX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockWorldZ = gz * GRID_PITCH + GRID_PITCH / 2;

        this.addPlane(verts, indices, blockWorldX, blockWorldZ, BLOCK_SIZE, BLOCK_SIZE, 0.3, 0.3, 0.3, 1.0, idxOffset);
        idxOffset += 4;

        const hasBuilding = rng() < 0.75;
        if (!hasBuilding) continue;

        const w = 6 + rng() * (BLOCK_SIZE - 14);
        const d = 6 + rng() * (BLOCK_SIZE - 14);
        const h = 10 + rng() * 50;
        const r = 0.4 + rng() * 0.4;
        const g = 0.4 + rng() * 0.4;
        const b = 0.4 + rng() * 0.4;

        this.addBox(verts, indices, blockWorldX, h / 2, blockWorldZ, w, h, d, r, g, b, 1.0, idxOffset);
        idxOffset += 24;
      }
    }

    const mesh = this.createMesh(verts, indices);
    const chunk = { mesh, cx, cz };
    this.chunkCache.set(key, chunk);
    return chunk;
  }

  getPlayerMesh(color: [number, number, number]): CityMesh {
    const key = `player_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    // create a higher-detail humanoid made from subdivided primitives + simple normals
    const verts: number[] = [];
    const indices: number[] = [];

    // helper: add a lathe sphere (approximated by stacks/slices) with pos(3)+normal(3)+color(4)
    const addSphere = (cx: number, cy: number, cz: number, radius: number, stacks: number, slices: number, r: number, g: number, b: number, a: number) => {
      const startIndex = verts.length / 10;
      for (let i = 0; i <= stacks; i++) {
        const v = i / stacks;
        const theta = v * Math.PI;
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        for (let j = 0; j <= slices; j++) {
          const u = j / slices;
          const phi = u * Math.PI * 2;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const x = cosP * sinT;
          const y = cosT;
          const z = sinP * sinT;
          verts.push(cx + x * radius, cy + y * radius, cz + z * radius, x, y, z, r, g, b, a);
        }
      }
      for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < slices; j++) {
          const aI = startIndex + i * (slices + 1) + j;
          const bI = startIndex + (i + 1) * (slices + 1) + j;
          indices.push(aI, bI, aI + 1, bI, bI + 1, aI + 1);
        }
      }
    };

    const addCylinder = (cx: number, cy: number, cz: number, radius: number, height: number, slices: number, r: number, g: number, b: number, a: number) => {
      const startIndex = verts.length / 10;
      for (let i = 0; i <= 1; i++) {
        const y = cy + (i === 0 ? -height / 2 : height / 2);
        for (let j = 0; j <= slices; j++) {
          const u = j / slices;
          const phi = u * Math.PI * 2;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const nx = cosP, nz = sinP;
          verts.push(cx + cosP * radius, y, cz + sinP * radius, nx, 0, nz, r, g, b, a);
        }
      }
      for (let j = 0; j < slices; j++) {
        const aI = startIndex + j;
        const bI = startIndex + (slices + 1) + j;
        indices.push(aI, bI, aI + 1, bI, bI + 1, aI + 1);
      }
    };

    // torso: taller box replaced by blended cylinders/spheres
    addCylinder(0, 0.9, 0, 0.28, 0.9, 18, color[0], color[1], color[2], 1.0);
    addSphere(0, 1.6, 0, 0.18, 10, 18, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);

    // hips / pelvis
    addSphere(0, 0.45, 0, 0.2, 8, 16, color[0], color[1], color[2], 1.0);

    // arms
    addCylinder(-0.45, 1.05, 0, 0.08, 0.7, 12, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addCylinder(0.45, 1.05, 0, 0.08, 0.7, 12, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addSphere(-0.45, 0.6, -0.02, 0.09, 6, 12, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95, 1.0);
    addSphere(0.45, 0.6, -0.02, 0.09, 6, 12, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95, 1.0);

    // legs
    addCylinder(-0.18, -0.6, 0, 0.11, 1.2, 16, color[0], color[1], color[2], 1.0);
    addCylinder(0.18, -0.6, 0, 0.11, 1.2, 16, color[0], color[1], color[2], 1.0);
    addSphere(-0.18, -1.2, 0, 0.11, 6, 12, color[0], color[1], color[2], 1.0);
    addSphere(0.18, -1.2, 0, 0.11, 6, 12, color[0], color[1], color[2], 1.0);

    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getOtherPlayerMesh(color: [number, number, number]): CityMesh {
    return this.getPlayerMesh(color);
  }

  getPedestrianMesh(gender: string): CityMesh {
    // provide gender differentiation by body proportions and clothing tint
    if (gender === 'female') {
      const color: [number, number, number] = [0.85, 0.45, 0.85];
      const key = `ped_female_${color.join(',')}`;
      if (this.meshCache.has(key)) return this.meshCache.get(key)!;
      const mesh = this.getPlayerMesh(color);
      // scale proportions slightly for visual variety
      this.meshCache.set(key, mesh);
      return mesh;
    } else {
      const color: [number, number, number] = [0.45, 0.55, 0.85];
      const key = `ped_male_${color.join(',')}`;
      if (this.meshCache.has(key)) return this.meshCache.get(key)!;
      const mesh = this.getPlayerMesh(color);
      this.meshCache.set(key, mesh);
      return mesh;
    }
  }

  getNPCCarMesh(color: [number, number, number]): CityMesh {
    const key = `car_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.4, 0, 2.0, 0.8, 4.0, color[0], color[1], color[2], 1.0, 0);
    this.addBox(verts, indices, 0, 1.0, -0.2, 1.6, 0.6, 2.0, color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, 1.0, 24);
    this.addBox(verts, indices, -1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 48);
    this.addBox(verts, indices, 1.2, 0.2, -1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 72);
    this.addBox(verts, indices, -1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 96);
    this.addBox(verts, indices, 1.2, 0.2, 1.5, 0.3, 0.4, 0.3, 0.1, 0.1, 0.1, 1.0, 120);
    this.addBox(verts, indices, -0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 144);
    this.addBox(verts, indices, 0.5, 0.3, -2.0, 0.3, 0.2, 0.1, 1.0, 0.9, 0.4, 1.0, 168);
    this.addBox(verts, indices, -0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 192);
    this.addBox(verts, indices, 0.5, 0.3, 2.0, 0.3, 0.2, 0.1, 0.8, 0.0, 0.0, 1.0, 216);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  getMotorcycleMesh(color: [number, number, number]): CityMesh {
    const key = `moto_${color.join(',')}`;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0.3, 0, 0.8, 0.5, 2.4, color[0], color[1], color[2], 1.0, 0);
    this.addBox(verts, indices, 0, 0.6, -0.2, 0.6, 0.3, 0.8, color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, 1.0, 24);
    this.addBox(verts, indices, 0, 0.8, -1.0, 0.7, 0.1, 0.1, 0.2, 0.2, 0.2, 1.0, 48);
    this.addBox(verts, indices, 0, 0.2, -1.0, 0.15, 0.4, 0.15, 0.05, 0.05, 0.05, 1.0, 72);
    this.addBox(verts, indices, 0, 0.2, 1.0, 0.15, 0.4, 0.15, 0.05, 0.05, 0.05, 1.0, 96);
    this.addBox(verts, indices, 0, 0.3, -1.3, 0.2, 0.15, 0.05, 1.0, 0.9, 0.4, 1.0, 120);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set(key, mesh);
    return mesh;
  }

  projectToScreen(wx: number, wy: number, wz: number, canvasW: number, canvasH: number): { x: number; y: number } | null {
    const vp = mat4.create();
    mat4.multiply(vp, this.projMatrix, this.viewMatrix);
    const x = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
    const y = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
    const z = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];
    const w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    if (w <= 0) return null;
    return {
      x: (x / w + 1) / 2 * canvasW,
      y: (1 - y / w) / 2 * canvasH
    };
  }

  clearCache() {
    this.chunkCache.clear();
    this.meshCache.clear();
  }

  private drawMesh(
    mesh: CityMesh,
    x: number, y: number, z: number,
    yaw: number,
    scale: [number, number, number] = [1, 1, 1],
    color: [number, number, number, number] = [1, 1, 1, 1]
  ) {
    mat4.identity(this.modelMatrix);
    mat4.translate(this.modelMatrix, this.modelMatrix, [x, y, z]);
    mat4.rotateY(this.modelMatrix, this.modelMatrix, yaw);
    mat4.scale(this.modelMatrix, this.modelMatrix, scale);
    this.gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.gl.uniform4f(this.colorLoc, color[0], color[1], color[2], color[3]);

    this.gl.bindVertexArray(mesh.vao);
    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_SHORT, 0);
  }

  render(
    camX: number, camY: number, camZ: number, camYaw: number, camPitch: number, aspect: number,
    targetX: number, targetY: number, targetZ: number, carYaw: number,
    serverNPCs: any[], otherPlayers: any[], serverPedestrians: any[], parkedCars: any[],
    tracers: any[], muzzleFlashes: any[], rockets: any[], explosions: any[], bloodSplats: any[],
    bloodPools: any[],
    playerMesh: CityMesh | null
  ) {
    const gl = this.gl;
    gl.clearColor(0.5, 0.6, 0.7, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.perspective(this.projMatrix, Math.PI / 4, aspect, 0.1, 500.0);
    gl.uniformMatrix4fv(this.projLoc, false, this.projMatrix);

    const dirX = Math.sin(camYaw) * Math.cos(camPitch);
    const dirY = -Math.sin(camPitch);
    const dirZ = Math.cos(camYaw) * Math.cos(camPitch);
    mat4.lookAt(this.viewMatrix, [camX, camY, camZ], [camX + dirX, camY + dirY, camZ + dirZ], [0, 1, 0]);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);

    const pcx = Math.floor(camX / CHUNK_SIZE);
    const pcz = Math.floor(camZ / CHUNK_SIZE);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk = this.getCityChunk(pcx + dx, pcz + dz);
        this.drawMesh(chunk.mesh, 0, 0, 0, 0, [1, 1, 1], [1, 1, 1, 1]);
      }
    }

    for (const pc of parkedCars) {
      this.drawMesh(pc.mesh, pc.x, 0, pc.z, pc.yaw);
    }

    for (const npc of serverNPCs) {
      this.drawMesh(npc.mesh, npc.x, 0, npc.z, npc.yaw);
    }

    for (const ped of serverPedestrians) {
      this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw);
    }

    for (const p of otherPlayers) {
      this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw);
    }

    if (playerMesh) {
      this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw);
    }

    gl.disable(gl.DEPTH_TEST);

    for (const b of bloodSplats) {
      const alpha = 1.0 - (b.age / b.lifetime);
      const mesh = this.getBloodMesh();
      this.drawMesh(mesh, b.x, b.y, b.z, 0, [1, 1, 1], [1, 1, 1, alpha]);
    }

    for (const bp of bloodPools) {
      const progress = bp.age / bp.lifetime;
      const poolScale = 1 + progress * bp.maxRadius;
      const alpha = Math.max(0, 1.0 - progress * 0.5);
      const mesh = this.getBloodPoolMesh();
      this.drawMesh(mesh, bp.x, 0.01, bp.z, 0, [poolScale, 1, poolScale], [0.6, 0.0, 0.0, alpha]);
    }

    for (const t of tracers) {
      const alpha = 1.0 - (t.age / t.lifetime);
      const mesh = this.getTracerMesh();

      mat4.identity(this.modelMatrix);
      mat4.targetTo(this.modelMatrix, [t.originX, t.originY, t.originZ], [t.originX + t.dirX * 50, t.originY + t.dirY * 50, t.originZ + t.dirZ * 50], [0, 1, 0]);
      const scaleMat = mat4.create();
      mat4.scale(scaleMat, scaleMat, [0.05, 0.05, 50]);
      mat4.multiply(this.modelMatrix, this.modelMatrix, scaleMat);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      gl.uniform4f(this.colorLoc, 1.0, 0.8, 0.0, alpha);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    for (const r of rockets) {
      const mesh = this.getRocketMesh();
      this.drawMesh(mesh, r.x, r.y, r.z, 0, [1, 1, 1], [1, 1, 1, 1]);
    }

    for (const e of explosions) {
      const progress = e.age / e.lifetime;
      const scale = 1 + progress * 10;
      const alpha = 1.0 - progress;
      const mesh = this.getExplosionMesh();
      this.drawMesh(mesh, e.x, e.y, e.z, 0, [scale, scale, scale], [1, 1, 1, alpha]);
    }

    for (const m of muzzleFlashes) {
      const alpha = 1.0 - (m.age / m.lifetime);
      const mesh = this.getExplosionMesh();
      this.drawMesh(mesh, m.x, m.y, m.z, 0, [0.5, 0.5, 0.5], [1, 1, 1, alpha]);
    }

    gl.enable(gl.DEPTH_TEST);
  }

  private getTracerMesh(): CityMesh {
    if (this.meshCache.has('tracer')) return this.meshCache.get('tracer')!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0.5, 1, 1, 1, 1.0, 0.8, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('tracer', mesh);
    return mesh;
  }

  private getRocketMesh(): CityMesh {
    if (this.meshCache.has('rocket')) return this.meshCache.get('rocket')!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.3, 0.3, 1.5, 1.0, 0.2, 0.2, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('rocket', mesh);
    return mesh;
  }

  private getExplosionMesh(): CityMesh {
    if (this.meshCache.has('explosion')) return this.meshCache.get('explosion')!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 1, 1, 1, 1.0, 0.5, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('explosion', mesh);
    return mesh;
  }

  private getBloodMesh(): CityMesh {
    if (this.meshCache.has('blood')) return this.meshCache.get('blood')!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.5, 0.5, 0.5, 0.8, 0.0, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('blood', mesh);
    return mesh;
  }

  private getBloodPoolMesh(): CityMesh {
    if (this.meshCache.has('bloodpool')) return this.meshCache.get('bloodpool')!;
    const verts: number[] = [];
    const indices: number[] = [];
    this.addPlane(verts, indices, 0, 0, 1, 1, 0.6, 0.0, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('bloodpool', mesh);
    return mesh;
  }
}