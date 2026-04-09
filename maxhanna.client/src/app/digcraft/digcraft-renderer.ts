/**
 * WebGL chunk-based block renderer.
 * Renders visible faces only, one draw call per chunk mesh.
 */
import {
  BlockId, BLOCK_COLORS, BlockColor, CHUNK_SIZE, WORLD_HEIGHT,
  RENDER_DISTANCE, DCPlayer
} from './digcraft-types';
import { Chunk } from './digcraft-world';

// ──── Shader sources ────
const VS = `
  attribute vec3 aPos;
  attribute vec3 aColor;
  attribute float aBrightness;
  uniform mat4 uMVP;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vColor = aColor * aBrightness;
    gl_Position = uMVP * vec4(aPos, 1.0);
    vFog = clamp(gl_Position.z / 120.0, 0.0, 1.0);
  }
`;

const FS = `
  precision mediump float;
  varying vec3 vColor;
  varying float vFog;
  uniform vec3 uFogColor;
  void main() {
    vec3 c = mix(vColor, uFogColor, vFog * vFog);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Face directions + brightness
const FACES: { dir: number[]; verts: number[][]; brightness: number }[] = [
  { dir: [0, 1, 0],  verts: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], brightness: 1.0 },   // top
  { dir: [0,-1, 0],  verts: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]], brightness: 0.5 },   // bottom
  { dir: [0, 0, 1],  verts: [[0,0,1],[0,1,1],[1,1,1],[1,0,1]], brightness: 0.8 },   // south
  { dir: [0, 0,-1],  verts: [[1,0,0],[1,1,0],[0,1,0],[0,0,0]], brightness: 0.8 },   // north
  { dir: [1, 0, 0],  verts: [[1,0,1],[1,1,1],[1,1,0],[1,0,0]], brightness: 0.7 },   // east
  { dir: [-1, 0, 0], verts: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]], brightness: 0.7 },   // west
];

export interface ChunkMesh {
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  indexCount: number;
  cx: number;
  cz: number;
}

export class DigCraftRenderer {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uMVP: WebGLUniformLocation;
  uFogColor: WebGLUniformLocation;
  meshes: Map<string, ChunkMesh> = new Map();
  width = 0;
  height = 0;

  // Sky / fog colour
  private skyR = 0.53;
  private skyG = 0.81;
  private skyB = 0.92;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })!;
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.resize(canvas.width, canvas.height);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CW);
    gl.clearColor(this.skyR, this.skyG, this.skyB, 1);

    // Compile shaders
    const vs = this.compileShader(gl.VERTEX_SHADER, VS);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FS);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    this.uMVP = gl.getUniformLocation(this.program, 'uMVP')!;
    this.uFogColor = gl.getUniformLocation(this.program, 'uFogColor')!;
    gl.uniform3f(this.uFogColor, this.skyR, this.skyG, this.skyB);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  /** Build a chunk mesh from block data, including cross-chunk neighbor lookups. */
  buildChunkMesh(chunk: Chunk, getNeighborBlock: (wx: number, wy: number, wz: number) => number): void {
    const key = `${chunk.cx},${chunk.cz}`;
    const old = this.meshes.get(key);
    if (old) {
      if (old.vbo) this.gl.deleteBuffer(old.vbo);
      if (old.ibo) this.gl.deleteBuffer(old.ibo);
      if (old.vao) this.gl.deleteVertexArray(old.vao);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const brightness: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (blockId === BlockId.AIR || blockId === BlockId.WATER) continue;

          const bc: BlockColor = BLOCK_COLORS[blockId] ?? { r: 1, g: 0, b: 1, a: 1 };

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            // Determine neighbor block; use cross-chunk callback for edges
            let neighbor: number;
            if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
              neighbor = chunk.getBlock(nx, ny, nz);
            } else {
              neighbor = getNeighborBlock(ox + nx, ny, oz + nz);
            }

            if (neighbor !== BlockId.AIR && neighbor !== BlockId.WATER && neighbor !== BlockId.LEAVES && neighbor !== BlockId.GLASS) continue;

            const isTop = fi === 0;
            const cr = isTop && bc.top ? bc.top.r : bc.r;
            const cg = isTop && bc.top ? bc.top.g : bc.g;
            const cb = isTop && bc.top ? bc.top.b : bc.b;

            for (const v of face.verts) {
              positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
              colors.push(cr, cg, cb);
              brightness.push(face.brightness);
            }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
            vertCount += 4;
          }
        }
      }
    }

    if (vertCount === 0) {
      this.meshes.set(key, { vao: null, vbo: null, ibo: null, indexCount: 0, cx: chunk.cx, cz: chunk.cz });
      return;
    }

    const gl = this.gl;
    const stride = 7; // 3 pos + 3 color + 1 brightness
    const vData = new Float32Array(vertCount * stride);
    for (let i = 0; i < vertCount; i++) {
      const o = i * stride;
      vData[o] = positions[i * 3];
      vData[o + 1] = positions[i * 3 + 1];
      vData[o + 2] = positions[i * 3 + 2];
      vData[o + 3] = colors[i * 3];
      vData[o + 4] = colors[i * 3 + 1];
      vData[o + 5] = colors[i * 3 + 2];
      vData[o + 6] = brightness[i];
    }

    const iData = new Uint32Array(indices);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vData, gl.STATIC_DRAW);

    const bpe = Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);

    const aColor = gl.getAttribLocation(this.program, 'aColor');
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);

    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    gl.enableVertexAttribArray(aBright);
    gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);

    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iData, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    this.meshes.set(key, { vao, vbo, ibo, indexCount: indices.length, cx: chunk.cx, cz: chunk.cz });
  }

  /** Main render pass. */
  render(camX: number, camY: number, camZ: number, yaw: number, pitch: number, players: DCPlayer[], myUserId: number): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const aspect = this.width / this.height;
    const proj = perspectiveMatrix(70 * Math.PI / 180, aspect, 0.1, 200);
    const view = lookAtFPS(camX, camY, camZ, yaw, pitch);
    const mvp = multiplyMat4(proj, view);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    // Render chunks
    const camCX = Math.floor(camX / CHUNK_SIZE);
    const camCZ = Math.floor(camZ / CHUNK_SIZE);

    for (const [, mesh] of this.meshes) {
      if (!mesh.vao || mesh.indexCount === 0) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > RENDER_DISTANCE || Math.abs(dz) > RENDER_DISTANCE) continue;

      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);

    // Render other players as coloured pillars
    for (const p of players) {
      if (p.userId === myUserId) continue;
      this.drawPlayerPillar(p, mvp);
    }
  }

  /** Simple coloured box for other players */
  private playerVAO: WebGLVertexArrayObject | null = null;
  private playerVBO: WebGLBuffer | null = null;
  private playerIBO: WebGLBuffer | null = null;
  private playerIndexCount = 0;

  private ensurePlayerMesh(): void {
    if (this.playerVAO) return;
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    let vc = 0;

    const pushVert = (x: number, y: number, z: number, r: number, g: number, b: number, br: number) => {
      verts.push(x, y, z, r, g, b, br);
    };

    const addBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, color: [number, number, number], bright: number) => {
      // top
      pushVert(minX, maxY, minZ, color[0], color[1], color[2], bright);
      pushVert(maxX, maxY, minZ, color[0], color[1], color[2], bright);
      pushVert(maxX, maxY, maxZ, color[0], color[1], color[2], bright);
      pushVert(minX, maxY, maxZ, color[0], color[1], color[2], bright);
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
      // bottom
      pushVert(minX, minY, maxZ, color[0], color[1], color[2], bright * 0.6);
      pushVert(maxX, minY, maxZ, color[0], color[1], color[2], bright * 0.6);
      pushVert(maxX, minY, minZ, color[0], color[1], color[2], bright * 0.6);
      pushVert(minX, minY, minZ, color[0], color[1], color[2], bright * 0.6);
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
      // south
      pushVert(minX, minY, maxZ, color[0], color[1], color[2], bright * 0.9);
      pushVert(minX, maxY, maxZ, color[0], color[1], color[2], bright * 0.9);
      pushVert(maxX, maxY, maxZ, color[0], color[1], color[2], bright * 0.9);
      pushVert(maxX, minY, maxZ, color[0], color[1], color[2], bright * 0.9);
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
      // north
      pushVert(maxX, minY, minZ, color[0], color[1], color[2], bright * 0.9);
      pushVert(maxX, maxY, minZ, color[0], color[1], color[2], bright * 0.9);
      pushVert(minX, maxY, minZ, color[0], color[1], color[2], bright * 0.9);
      pushVert(minX, minY, minZ, color[0], color[1], color[2], bright * 0.9);
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
      // east
      pushVert(maxX, minY, maxZ, color[0], color[1], color[2], bright * 0.8);
      pushVert(maxX, maxY, maxZ, color[0], color[1], color[2], bright * 0.8);
      pushVert(maxX, maxY, minZ, color[0], color[1], color[2], bright * 0.8);
      pushVert(maxX, minY, minZ, color[0], color[1], color[2], bright * 0.8);
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
      // west
      pushVert(minX, minY, minZ, color[0], color[1], color[2], bright * 0.8);
      pushVert(minX, maxY, minZ, color[0], color[1], color[2], bright * 0.8);
      pushVert(minX, maxY, maxZ, color[0], color[1], color[2], bright * 0.8);
      pushVert(minX, minY, maxZ, color[0], color[1], color[2], bright * 0.8);
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
    };

    // Build a simple multi-part model: legs, torso, arms, head
    const height = 1.8;
    const headH = 0.5;
    const torsoH = 0.8;
    const legH = height - headH - torsoH; // 0.5
    const torsoHalf = 0.28;
    const torsoZHalf = 0.15;
    const headHalf = 0.22;
    const headZHalf = 0.22;
    const legHalf = 0.11;
    const legZHalf = 0.09;
    const armHalf = 0.08;
    const armZHalf = 0.08;

    // legs (left, right)
    addBox(-0.12, 0, -legZHalf, -0.02, legH, legZHalf, [0.12, 0.12, 0.4], 0.7);
    addBox(0.02, 0, -legZHalf, 0.12, legH, legZHalf, [0.12, 0.12, 0.4], 0.7);
    // torso
    addBox(-torsoHalf, legH, -torsoZHalf, torsoHalf, legH + torsoH, torsoZHalf, [0.18, 0.45, 0.85], 0.95);
    // arms
    addBox(-torsoHalf - armHalf, legH + 0.1, -armZHalf, -torsoHalf + armHalf, legH + torsoH - 0.1, armZHalf, [0.18, 0.45, 0.85], 0.9);
    addBox(torsoHalf - armHalf, legH + 0.1, -armZHalf, torsoHalf + armHalf, legH + torsoH - 0.1, armZHalf, [0.18, 0.45, 0.85], 0.9);
    // head (skin)
    addBox(-headHalf, legH + torsoH, -headZHalf, headHalf, legH + torsoH + headH, headZHalf, [0.9, 0.75, 0.6], 1.0);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const bpe = Float32Array.BYTES_PER_ELEMENT;
    const stride = 7 * bpe;
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
    const aColor = gl.getAttribLocation(this.program, 'aColor');
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 3 * bpe);
    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    gl.enableVertexAttribArray(aBright);
    gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride, 6 * bpe);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.playerVAO = vao;
    this.playerVBO = vbo;
    this.playerIBO = ibo;
    this.playerIndexCount = idx.length;
  }

  private drawPlayerPillar(p: DCPlayer, baseMVP: Float32Array): void {
    this.ensurePlayerMesh();
    const gl = this.gl;
    // Translate model so feet sit at player's ground position (client stores camera/eye Y)
    const eyeHeight = 1.6;
    const t = translationMatrix(p.posX, p.posY - eyeHeight, p.posZ);
    const mvp = multiplyMat4(baseMVP, t);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.bindVertexArray(this.playerVAO);
    gl.drawElements(gl.TRIANGLES, this.playerIndexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    // Restore
    gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
  }

  /** Build a highlight wireframe cube for the targeted block */
  private highlightVAO: WebGLVertexArrayObject | null = null;
  private highlightVBO: WebGLBuffer | null = null;

  drawHighlight(wx: number, wy: number, wz: number, mvp: Float32Array): void {
    const gl = this.gl;
    if (!this.highlightVAO) {
      // Build line box (slightly expanded)
      const e = 0.005;
      const lo = -e, hi = 1 + e;
      const lineVerts = new Float32Array([
        lo, lo, lo, hi, lo, lo,  hi, lo, lo, hi, hi, lo,
        hi, hi, lo, lo, hi, lo,  lo, hi, lo, lo, lo, lo,
        lo, lo, hi, hi, lo, hi,  hi, lo, hi, hi, hi, hi,
        hi, hi, hi, lo, hi, hi,  lo, hi, hi, lo, lo, hi,
        lo, lo, lo, lo, lo, hi,  hi, lo, lo, hi, lo, hi,
        hi, hi, lo, hi, hi, hi,  lo, hi, lo, lo, hi, hi,
      ]);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineVerts, gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(this.program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      // Disable color/brightness (use defaults via shader)
      const aColor = gl.getAttribLocation(this.program, 'aColor');
      gl.disableVertexAttribArray(aColor);
      gl.vertexAttrib3f(aColor, 0, 0, 0);
      const aBright = gl.getAttribLocation(this.program, 'aBrightness');
      gl.disableVertexAttribArray(aBright);
      gl.vertexAttrib1f(aBright, 2.0);
      gl.bindVertexArray(null);
      this.highlightVAO = vao;
      this.highlightVBO = vbo;
    }
    const t = translationMatrix(wx, wy, wz);
    const finalMVP = multiplyMat4(mvp, t);
    gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
    gl.bindVertexArray(this.highlightVAO);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.bindVertexArray(null);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
  }

  dispose(): void {
    const gl = this.gl;
    for (const [, m] of this.meshes) {
      if (m.vbo) gl.deleteBuffer(m.vbo);
      if (m.ibo) gl.deleteBuffer(m.ibo);
      if (m.vao) gl.deleteVertexArray(m.vao);
    }
    this.meshes.clear();
    if (this.playerVBO) gl.deleteBuffer(this.playerVBO);
    if (this.playerIBO) gl.deleteBuffer(this.playerIBO);
    if (this.playerVAO) gl.deleteVertexArray(this.playerVAO);
    if (this.highlightVBO) gl.deleteBuffer(this.highlightVBO);
    if (this.highlightVAO) gl.deleteVertexArray(this.highlightVAO);
    gl.deleteProgram(this.program);
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
}

// ──── Matrix helpers ────
function perspectiveMatrix(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAtFPS(x: number, y: number, z: number, yaw: number, pitch: number): Float32Array {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // Right
  const rx = cy, ry = 0, rz = -sy;
  // Up
  const ux = sy * sp, uy = cp, uz = cy * sp;
  // Forward (into screen)
  const fx = sy * cp, fy = -sp, fz = cy * cp;
  return new Float32Array([
    rx, ux, fx, 0,
    ry, uy, fy, 0,
    rz, uz, fz, 0,
    -(rx * x + ry * y + rz * z),
    -(ux * x + uy * y + uz * z),
    -(fx * x + fy * y + fz * z),
    1,
  ]);
}

export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
  }
  return o;
}

function translationMatrix(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

/** getFrustumMVP for highlight and player drawing */
export function buildMVP(camX: number, camY: number, camZ: number, yaw: number, pitch: number, aspect: number): Float32Array {
  const proj = perspectiveMatrix(70 * Math.PI / 180, aspect, 0.1, 200);
  const view = lookAtFPS(camX, camY, camZ, yaw, pitch);
  return multiplyMat4(proj, view);
}
