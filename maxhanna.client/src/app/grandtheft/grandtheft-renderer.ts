export interface CityMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  indexType?: number;
  texture?: WebGLTexture | null;
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
  private textureLoc: WebGLUniformLocation | null = null;
  private useTextureLoc: WebGLUniformLocation | null = null;

  viewMatrix = mat4.create();
  projMatrix = mat4.create();
  private modelMatrix = mat4.create();
  private chunkCache = new Map<string, CityChunk>();
  private meshCache = new Map<string, CityMesh>();

  public playerMesh: CityMesh | CityMesh[] | null = null; // Allow array of meshes
  public currentModelUrl: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    const vs = `#version 300 es
  in vec3 aPos;
in vec3 aNormal;
in vec4 aColor;
in vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMatrix;
uniform vec4 uColor;
out vec4 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out float vDepth;
out vec2 vUV;
void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * worldPos;
  gl_Position = uProj * viewPos;
  vColor = aColor * uColor;
  vNormal = normalize(uNormalMatrix * aNormal);
  vWorldPos = worldPos.xyz;
  vDepth = length(viewPos.xyz);
  vUV = aUV;
}
`;
    const fs = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in float vDepth;
in vec2 vUV;
out vec4 FragColor;
uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform sampler2D uTexture;
uniform bool uHasTexture;
void main() {
  vec4 baseColor = vColor;
  if (uHasTexture) {
    baseColor *= texture(uTexture, vUV);
  }
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  float diff = max(dot(N, L), 0.0);
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 R = reflect(-L, N);
  float spec = pow(max(dot(R, V), 0.0), 32.0);
  vec3 ambient = 0.15 * baseColor.rgb;
  vec3 diffuse = diff * baseColor.rgb;
  vec3 specular = spec * vec3(0.6);
  vec3 color = ambient + diffuse + specular;
  float fog = clamp((vDepth - 80.0) / 250.0, 0.0, 1.0);
  vec3 fogColor = vec3(0.5, 0.6, 0.7);
  vec3 finalColor = mix(color, fogColor, fog * baseColor.a);
  FragColor = vec4(finalColor, baseColor.a);
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
    this.textureLoc = gl.getUniformLocation(this.program, 'uTexture');
    this.useTextureLoc = gl.getUniformLocation(this.program, 'uHasTexture');

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  async initPlayerModel(modelUrl?: string): Promise<void> {
    this.currentModelUrl = modelUrl || null;
    if (modelUrl) {
      const loaded = await this.loadGLTF(modelUrl);
      if (loaded && loaded.length > 0) {
        this.playerMesh = loaded; // KEEP ALL MESHES
        return;
      }
    }
    this.playerMesh = this.generateSamplePlayerModel();
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

  private createMesh(verts: number[], indices: number[], texture: WebGLTexture | null = null): CityMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    
    let maxIndex = 0;
    for (let i = 0; i < indices.length; i++) if (indices[i] > maxIndex) maxIndex = indices[i];
    const vertexCount = maxIndex + 1;
    let floatsPerVertex = Math.round(verts.length / vertexCount) || 7;

    // Standardize to 12 floats: pos(3), normal(3), color(4), uv(2)
    const targetFloats = 12;
    const interleaved = new Float32Array(vertexCount * targetFloats);

    if (floatsPerVertex === 7) {
      // Procedural boxes: Generate normals and default UVs
      const positions = new Float32Array(vertexCount * 3);
      const colors = new Float32Array(vertexCount * 4);
      for (let i = 0; i < vertexCount; i++) {
        const base = i * 7;
        positions[i * 3] = verts[base];
        positions[i * 3 + 1] = verts[base + 1];
        positions[i * 3 + 2] = verts[base + 2];
        colors[i * 4] = verts[base + 3];
        colors[i * 4 + 1] = verts[base + 4];
        colors[i * 4 + 2] = verts[base + 5];
        colors[i * 4 + 3] = verts[base + 6];
      }
      const normals = new Float32Array(vertexCount * 3);
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
        const v1x = positions[ib] - positions[ia], v1y = positions[ib + 1] - positions[ia + 1], v1z = positions[ib + 2] - positions[ia + 2];
        const v2x = positions[ic] - positions[ia], v2y = positions[ic + 1] - positions[ia + 1], v2z = positions[ic + 2] - positions[ia + 2];
        const nx = v1y * v2z - v1z * v2y, ny = v1z * v2x - v1x * v2z, nz = v1x * v2y - v1y * v2x;
        normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
        normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
        normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
      }
      for (let i = 0; i < vertexCount; i++) {
        const ni = i * 3;
        const l = Math.hypot(normals[ni], normals[ni + 1], normals[ni + 2]) || 1.0;
        normals[ni] /= l; normals[ni + 1] /= l; normals[ni + 2] /= l;
      }
      for (let i = 0; i < vertexCount; i++) {
        const dst = i * targetFloats;
        interleaved[dst] = positions[i * 3];
        interleaved[dst + 1] = positions[i * 3 + 1];
        interleaved[dst + 2] = positions[i * 3 + 2];
        interleaved[dst + 3] = normals[i * 3];
        interleaved[dst + 4] = normals[i * 3 + 1];
        interleaved[dst + 5] = normals[i * 3 + 2];
        interleaved[dst + 6] = colors[i * 4];
        interleaved[dst + 7] = colors[i * 4 + 1];
        interleaved[dst + 8] = colors[i * 4 + 2];
        interleaved[dst + 9] = colors[i * 4 + 3];
        interleaved[dst + 10] = 0; // UV X
        interleaved[dst + 11] = 0; // UV Y
      }
    } else if (floatsPerVertex === 10) {
      // Procedural spheres/cylinders: Already have normals, just append default UVs
      for (let i = 0; i < vertexCount; i++) {
        const src = i * 10;
        const dst = i * targetFloats;
        interleaved.set(verts.slice(src, src + 10), dst);
        interleaved[dst + 10] = 0;
        interleaved[dst + 11] = 0;
      }
    } else if (floatsPerVertex === 12) {
      // glTF: Already fully formatted
      interleaved.set(verts);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    const useUint32 = maxIndex > 0xffff;
    if (useUint32) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    else gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const stride = targetFloats * 4; // 48 bytes
    const posLoc = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);

    const normalLoc = gl.getAttribLocation(this.program, 'aNormal');
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, stride, 12);

    const colorLoc = gl.getAttribLocation(this.program, 'aColor');
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, stride, 24);

    const uvLoc = gl.getAttribLocation(this.program, 'aUV');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 40);

    gl.bindVertexArray(null);
    return { vao, vbo, ibo, indexCount: indices.length, indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, texture };
  }

  private computeNormalMatrix(out: Float32Array, m: Float32Array) {
    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[4], m11 = m[5], m12 = m[6];
    const m20 = m[8], m21 = m[9], m22 = m[10];
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    if (!det) {
      out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 1; out[5] = 0; out[6] = 0; out[7] = 0; out[8] = 1;
      return out;
    }
    const invDet = 1 / det;
    out[0] = (m11 * m22 - m12 * m21) * invDet; out[1] = (m12 * m20 - m10 * m22) * invDet; out[2] = (m10 * m21 - m11 * m20) * invDet;
    out[3] = (m02 * m21 - m01 * m22) * invDet; out[4] = (m00 * m22 - m02 * m20) * invDet; out[5] = (m02 * m10 - m00 * m12) * invDet;
    out[6] = (m01 * m12 - m02 * m11) * invDet; out[7] = (m02 * m10 - m00 * m12) * invDet; out[8] = (m00 * m11 - m01 * m10) * invDet;
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
    const key = `${ cx },${ cz } `;
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
    const key = `player_${ color.join(',') } `;
    if (this.meshCache.has(key)) return this.meshCache.get(key)!;
    const verts: number[] = [];
    const indices: number[] = [];

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

    addCylinder(0, 0.9, 0, 0.28, 0.9, 18, color[0], color[1], color[2], 1.0);
    addSphere(0, 1.6, 0, 0.18, 10, 18, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addSphere(0, 0.45, 0, 0.2, 8, 16, color[0], color[1], color[2], 1.0);
    addCylinder(-0.45, 1.05, 0, 0.08, 0.7, 12, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addCylinder(0.45, 1.05, 0, 0.08, 0.7, 12, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 1.0);
    addSphere(-0.45, 0.6, -0.02, 0.09, 6, 12, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95, 1.0);
    addSphere(0.45, 0.6, -0.02, 0.09, 6, 12, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95, 1.0);
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
    if (gender === 'female') {
      const color: [number, number, number] = [0.85, 0.45, 0.85];
      const key = `ped_female_${ color.join(',') } `;
      if (this.meshCache.has(key)) return this.meshCache.get(key)!;
      const mesh = this.getPlayerMesh(color);
      this.meshCache.set(key, mesh);
      return mesh;
    } else {
      const color: [number, number, number] = [0.45, 0.55, 0.85];
      const key = `ped_male_${ color.join(',') } `;
      if (this.meshCache.has(key)) return this.meshCache.get(key)!;
      const mesh = this.getPlayerMesh(color);
      this.meshCache.set(key, mesh);
      return mesh;
    }
  }

  getNPCCarMesh(color: [number, number, number]): CityMesh {
    const key = `car_${ color.join(',') } `;
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
    const key = `moto_${ color.join(',') } `;
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
    mesh: CityMesh | CityMesh[],
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

    const meshes = Array.isArray(mesh) ? mesh : [mesh];
    for (const m of meshes) {
      if (m.texture) {
        this.gl.uniform1i(this.useTextureLoc, 1);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, m.texture);
        this.gl.uniform1i(this.textureLoc, 0);
      } else {
        this.gl.uniform1i(this.useTextureLoc, 0);
      }

      this.gl.bindVertexArray(m.vao);
      this.gl.drawElements(this.gl.TRIANGLES, m.indexCount, m.indexType || this.gl.UNSIGNED_SHORT, 0);
    }
  }

  render(
    camX: number, camY: number, camZ: number, camYaw: number, camPitch: number, aspect: number,
    targetX: number, targetY: number, targetZ: number, carYaw: number,
    serverNPCs: any[], otherPlayers: any[], serverPedestrians: any[], parkedCars: any[],
    tracers: any[], muzzleFlashes: any[], rockets: any[], explosions: any[], bloodSplats: any[],
    bloodPools: any[],
    playerMesh: CityMesh | CityMesh[] | null
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

    for (const pc of parkedCars) this.drawMesh(pc.mesh, pc.x, 0, pc.z, pc.yaw);
    for (const npc of serverNPCs) this.drawMesh(npc.mesh, npc.x, 0, npc.z, npc.yaw);
    for (const ped of serverPedestrians) this.drawMesh(ped.mesh, ped.x, 0, ped.z, ped.yaw);
    for (const p of otherPlayers) this.drawMesh(p.mesh, p.posX, p.posY, p.posZ, p.yaw);
    if (playerMesh) this.drawMesh(playerMesh, targetX, targetY, targetZ, carYaw);

    gl.disable(gl.DEPTH_TEST);

    for (const b of bloodSplats) {
      const alpha = 1.0 - (b.age / b.lifetime);
      this.drawMesh(this.getBloodMesh(), b.x, b.y, b.z, 0, [1, 1, 1], [1, 1, 1, alpha]);
    }
    for (const bp of bloodPools) {
      const progress = bp.age / bp.lifetime;
      const poolScale = 1 + progress * bp.maxRadius;
      const alpha = Math.max(0, 1.0 - progress * 0.5);
      this.drawMesh(this.getBloodPoolMesh(), bp.x, 0.01, bp.z, 0, [poolScale, 1, poolScale], [0.6, 0.0, 0.0, alpha]);
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
      gl.uniform1i(this.useTextureLoc, 0);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType || gl.UNSIGNED_SHORT, 0);
    }
    for (const r of rockets) this.drawMesh(this.getRocketMesh(), r.x, r.y, r.z, 0, [1, 1, 1], [1, 1, 1, 1]);
    for (const e of explosions) {
      const progress = e.age / e.lifetime;
      const scale = 1 + progress * 10;
      const alpha = 1.0 - progress;
      this.drawMesh(this.getExplosionMesh(), e.x, e.y, e.z, 0, [scale, scale, scale], [1, 1, 1, alpha]);
    }
    for (const m of muzzleFlashes) {
      const alpha = 1.0 - (m.age / m.lifetime);
      this.drawMesh(this.getExplosionMesh(), m.x, m.y, m.z, 0, [0.5, 0.5, 0.5], [1, 1, 1, alpha]);
    }

    gl.enable(gl.DEPTH_TEST);
  }

  private getTracerMesh(): CityMesh {
    if (this.meshCache.has('tracer')) return this.meshCache.get('tracer')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0.5, 1, 1, 1, 1.0, 0.8, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('tracer', mesh);
    return mesh;
  }

  private getRocketMesh(): CityMesh {
    if (this.meshCache.has('rocket')) return this.meshCache.get('rocket')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.3, 0.3, 1.5, 1.0, 0.2, 0.2, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('rocket', mesh);
    return mesh;
  }

  private getExplosionMesh(): CityMesh {
    if (this.meshCache.has('explosion')) return this.meshCache.get('explosion')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 1, 1, 1, 1.0, 0.5, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('explosion', mesh);
    return mesh;
  }

  private getBloodMesh(): CityMesh {
    if (this.meshCache.has('blood')) return this.meshCache.get('blood')!;
    const verts: number[] = [], indices: number[] = [];
    this.addBox(verts, indices, 0, 0, 0, 0.5, 0.5, 0.5, 0.8, 0.0, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('blood', mesh);
    return mesh;
  }

  private getBloodPoolMesh(): CityMesh {
    if (this.meshCache.has('bloodpool')) return this.meshCache.get('bloodpool')!;
    const verts: number[] = [], indices: number[] = [];
    this.addPlane(verts, indices, 0, 0, 1, 1, 0.6, 0.0, 0.0, 1.0, 0);
    const mesh = this.createMesh(verts, indices);
    this.meshCache.set('bloodpool', mesh);
    return mesh;
  }

  private loadTexture(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        // DO NOT flip the image. We will flip the UVs in the shader/loader instead.
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        resolve(tex);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // --- glTF Model Loader ---

  async loadGLTF(url: string): Promise<CityMesh[] | null> {
    try {
      const isGLB = url.endsWith('.glb');
      const raw = await (await fetch(url)).arrayBuffer();

      let json: any;
      let binBuffer: ArrayBuffer | null = null;

      if (isGLB) {
        const header = new Uint32Array(raw, 0, 3);
        const version = header[1];
        if (version !== 2) { console.error('Unsupported glTF version', version); return null; }
        let offset = 12;
        while (offset < raw.byteLength) {
          const chunkHeader = new Uint32Array(raw, offset, 2);
          const chunkLen = chunkHeader[0];
          const chunkType = chunkHeader[1];
          offset += 8;
          if (chunkType === 0x4E4F534A) {
            const decoder = new TextDecoder();
            json = JSON.parse(decoder.decode(new Uint8Array(raw, offset, chunkLen)));
          } else if (chunkType === 0x004E4942) {
            binBuffer = raw.slice(offset, offset + chunkLen);
          }
          offset += chunkLen;
        }
      } else {
        const decoder = new TextDecoder();
        json = JSON.parse(decoder.decode(new Uint8Array(raw)));
      }

      if (!json) return null;

      const base = url.substring(0, url.lastIndexOf('/') + 1);
      const buffers: ArrayBuffer[] = [];
      if (json.buffers) {
        for (const buf of json.buffers) {
          if (buf.uri) {
            if (buf.uri.startsWith('data:')) {
              const b64 = buf.uri.split(',')[1];
              const binaryStr = atob(b64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              buffers.push(bytes.buffer);
            } else {
              const bufRes = await fetch(base + buf.uri);
              buffers.push(await bufRes.arrayBuffer());
            }
          } else if (binBuffer) {
            buffers.push(binBuffer);
          }
        }
      } else if (binBuffer) {
        buffers.push(binBuffer);
      }

      const meshes: CityMesh[] = [];

      for (const meshDef of json.meshes || []) {
        for (const prim of meshDef.primitives || []) {
          const verts: number[] = [];
          const indices: number[] = [];

          if (prim.indices !== undefined) {
            const idxAcc = json.accessors[prim.indices];
            const idxBufView = json.bufferViews[idxAcc.bufferView];
            const buf = buffers[idxBufView.buffer];
            const count = idxAcc.count;
            const idxByteOffset = (idxBufView.byteOffset || 0) + (idxAcc.byteOffset || 0);

            if (idxAcc.componentType === 5125) {
              const view = new Uint32Array(buf, idxByteOffset, count);
              for (let i = 0; i < count; i++) indices.push(view[i]);
            } else if (idxAcc.componentType === 5123) {
              const view = new Uint16Array(buf, idxByteOffset, count);
              for (let i = 0; i < count; i++) indices.push(view[i]);
            } else if (idxAcc.componentType === 5121) {
              const view = new Uint8Array(buf, idxByteOffset, count);
              for (let i = 0; i < count; i++) indices.push(view[i]);
            }
          } else {
            const posAcc = json.accessors[prim.attributes.POSITION];
            for (let i = 0; i < posAcc.count; i++) indices.push(i);
          }

          const posAcc = json.accessors[prim.attributes.POSITION];
          const posBufView = json.bufferViews[posAcc.bufferView];
          const posBuf = buffers[posBufView.buffer];
          
          const posStride = (posBufView.byteStride || 12) / 4;
          const posOffset = (posBufView.byteOffset || 0) + (posAcc.byteOffset || 0);
          const posData = new Float32Array(posBuf, 0, posBuf.byteLength / 4);

          let normData: Float32Array | null = null;
          let normStride = 3, normOffset = 0;
          if (prim.attributes.NORMAL !== undefined) {
            const normAcc = json.accessors[prim.attributes.NORMAL];
            const normBufView = json.bufferViews[normAcc.bufferView];
            const normBuf = buffers[normBufView.buffer];
            normStride = (normBufView.byteStride || 12) / 4;
            normOffset = (normBufView.byteOffset || 0) + (normAcc.byteOffset || 0);
            normData = new Float32Array(normBuf, 0, normBuf.byteLength / 4);
          }

          let uvData: Float32Array | null = null;
          let uvStride = 2, uvOffset = 0;
          if (prim.attributes.TEXCOORD_0 !== undefined) {
            const uvAcc = json.accessors[prim.attributes.TEXCOORD_0];
            const uvBufView = json.bufferViews[uvAcc.bufferView];
            const uvBuf = buffers[uvBufView.buffer];
            uvStride = (uvBufView.byteStride || 8) / 4;
            uvOffset = (uvBufView.byteOffset || 0) + (uvAcc.byteOffset || 0);
            uvData = new Float32Array(uvBuf, 0, uvBuf.byteLength / 4);
          }

          const vCount = posAcc.count;
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity;
          let minZ = Infinity, maxZ = -Infinity;

          for (let i = 0; i < vCount; i++) {
            const pi = (posOffset / 4) + i * posStride;
            const x = posData[pi], y = posData[pi + 1], z = posData[pi + 2];
            verts.push(x, y, z);
            
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

            if (normData) {
              const ni = (normOffset / 4) + i * normStride;
              verts.push(normData[ni], normData[ni + 1], normData[ni + 2]);
            } else {
              verts.push(0, 1, 0);
            }
            verts.push(1, 1, 1, 1); // Default white color to multiply texture with

            if (uvData) {
              const ui = (uvOffset / 4) + i * uvStride;
              // FLIP Y coordinate for WebGL (1.0 - v)
              verts.push(uvData[ui], 1.0 - uvData[ui + 1]);
            } else {
              verts.push(0, 0);
            }
          }

          // --- NORMALIZE MODEL SCALE AND PIVOT ---
          const height = Math.max(0.001, maxY - minY);
          const targetHeight = 2.0;
          const scaleFactor = targetHeight / height;
          const centerX = (minX + maxX) / 2;
          const centerY = minY;
          const centerZ = (minZ + maxZ) / 2;

          // Stride is 12 floats
          for (let i = 0; i < verts.length; i += 12) {
            verts[i]     = (verts[i]     - centerX) * scaleFactor;
            verts[i + 1] = (verts[i + 1] - centerY) * scaleFactor + 1.0;
            verts[i + 2] = (verts[i + 2] - centerZ) * scaleFactor;
          }

          // --- LOAD TEXTURE ---
          let texture: WebGLTexture | null = null;
          if (json.materials && json.textures && json.images) {
            const matIndex = prim.material;
            if (matIndex !== undefined && json.materials[matIndex].pbrMetallicRoughness) {
              const texInfo = json.materials[matIndex].pbrMetallicRoughness.baseColorTexture;
              if (texInfo) {
                const textureIndex = texInfo.index;
                const imageIndex = json.textures[textureIndex].source;
                const imageInfo = json.images[imageIndex];
                let imgUrl = '';
                if (imageInfo.uri) {
                  imgUrl = imageInfo.uri.startsWith('data:') ? imageInfo.uri : base + imageInfo.uri;
                } else if (imageInfo.bufferView !== undefined) {
                  const bView = json.bufferViews[imageInfo.bufferView];
                  const buf = buffers[bView.buffer];
                  const offset = bView.byteOffset || 0;
                  const len = bView.byteLength;
                  const blob = new Blob([new Uint8Array(buf, offset, len)], { type: imageInfo.mimeType });
                  imgUrl = URL.createObjectURL(blob);
                }
                if (imgUrl) {
                  texture = await this.loadTexture(imgUrl);
                }
              }
            }
          }

          if (indices.length > 0 && verts.length > 0) {
            meshes.push(this.createMesh(verts, indices, texture));
          }
        }
      }

      return meshes.length > 0 ? meshes : null;
    } catch (e) {
      console.error('Failed to load glTF', url, e);
      return null;
    }
  }

  generateSamplePlayerModel(): CityMesh {
    const verts: number[] = [];
    const indices: number[] = [];
    const col: [number, number, number] = [0.2, 0.8, 1.0];

    this.addBox(verts, indices, 0, 0.5, 0, 0.7, 0.8, 0.4, col[0], col[1], col[2], 1.0, 0);
    this.addBox(verts, indices, 0, 1.15, 0, 0.4, 0.3, 0.4, col[0] * 0.9, col[1] * 0.9, col[2] * 0.9, 1.0, verts.length / 7);
    this.addBox(verts, indices, -0.55, 0.7, 0, 0.2, 0.6, 0.2, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1.0, verts.length / 7);
    this.addBox(verts, indices, 0.55, 0.7, 0, 0.2, 0.6, 0.2, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1.0, verts.length / 7);
    this.addBox(verts, indices, -0.2, 0.05, 0, 0.2, 0.5, 0.2, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1.0, verts.length / 7);
    this.addBox(verts, indices, 0.2, 0.05, 0, 0.2, 0.5, 0.2, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1.0, verts.length / 7);

    return this.createMesh(verts, indices);
  }
} 