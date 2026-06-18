export const VS = `
  attribute vec3 aPos;
  attribute vec3 aColor;
  attribute float aBrightness;
  uniform mat4 uMVP;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vColor = aColor * aBrightness * uTint;
    gl_Position = uMVP * vec4(aPos, 1.0);
    vFog = clamp(gl_Position.z / 200.0, 0.0, 1.0);
  }
`;

export const FS = `
  precision mediump float;
  varying vec3 vColor;
  varying float vFog;
  uniform vec3 uFogColor;
  void main() {
    float fog = 1.0 - exp(-vFog * vFog * 3.0);
    gl_FragColor = vec4(mix(vColor, uFogColor, fog), 1.0);
  }
`;

export function perspectiveMatrix(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAtFPS(x: number, y: number, z: number, yaw: number, pitch: number): Float32Array {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fx = sy * cp, fy = -sp, fz = cy * cp;
  const rx = cy, rz = -sy;
  const ux = sy * sp, uy = cp, uz = cy * sp;
  return new Float32Array([
    rx, ux, fx, 0,
    0, uy, fy, 0,
    rz, uz, fz, 0,
    -(rx * x + 0 * y + rz * z),
    -(ux * x + uy * y + uz * z),
    -(fx * x + fy * y + fz * z), 1,
  ]);
}

export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  return o;
}

function buildMVP(camX: number, camY: number, camZ: number, yaw: number, pitch: number, aspect: number): Float32Array {
  const proj = perspectiveMatrix(60 * Math.PI / 180, aspect, 0.1, 400);
  const view = lookAtFPS(camX, camY, camZ, yaw, pitch);
  return multiplyMat4(proj, view);
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export interface CityBuilding {
  x: number; z: number; width: number; depth: number; height: number;
  color: [number, number, number]; roofColor: [number, number, number];
  windows: { cx: number; cz: number; cw: number; cd: number }[];
}

export interface CityChunk {
  cx: number; cz: number;
  buildings: CityBuilding[];
}

export interface CityMesh {
  vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number;
}

const CHUNK_SIZE = 80;
const BLOCK_SIZE = 30;
const ROAD_WIDTH = 10;
const GRID_PITCH = BLOCK_SIZE + ROAD_WIDTH;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  return s;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 1 / 6) { r = c; g = x; }
  else if (h < 2 / 6) { r = x; g = c; }
  else if (h < 3 / 6) { g = c; b = x; }
  else if (h < 4 / 6) { g = x; b = c; }
  else if (h < 5 / 6) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m), (g + m), (b + m)];
}

function generateBuildings(chunkCX: number, chunkCZ: number): CityBuilding[] {
  const seed = (chunkCX * 100003 + chunkCZ * 70001) >>> 0;
  const rng = mulberry32(seed);
  const buildings: CityBuilding[] = [];
  const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
  for (let by = 0; by < blocksPerChunk; by++) {
    for (let bx = 0; bx < blocksPerChunk; bx++) {
      const gx = chunkCX * (CHUNK_SIZE / GRID_PITCH) + bx;
      const gz = chunkCZ * (CHUNK_SIZE / GRID_PITCH) + by;
      const blockCX = gx * GRID_PITCH + GRID_PITCH / 2;
      const blockCZ = gz * GRID_PITCH + GRID_PITCH / 2;
      const hasBuilding = rng() < 0.75;
      if (!hasBuilding) continue;
      const w = 6 + rng() * (BLOCK_SIZE - 14);
      const d = 6 + rng() * (BLOCK_SIZE - 14);
      const h = 4 + Math.floor(rng() * 7) * 3;
      const hue = rng();
      const sat = 0.25 + rng() * 0.35;
      const lit = 0.35 + rng() * 0.35;
      const color: [number, number, number] = hslToRgb(hue, sat, lit);
      const roofColor: [number, number, number] = [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6];
      const windows: { cx: number; cz: number; cw: number; cd: number }[] = [];
      const winRows = Math.floor(h / 3);
      const winColsX = Math.floor(w / 2.5);
      const winColsZ = Math.floor(d / 2.5);
      for (let ri = 0; ri < winRows; ri++) {
        for (let ci = 0; ci < winColsX; ci++) {
          const wcx = -w / 2 + 1.5 + ci * 2.5 + rng() * 0.3;
          const wcz = d / 2 + 0.05;
          windows.push({ cx: wcx, cz: wcz, cw: 0.8 + rng() * 0.3, cd: 0.1 });
        }
        for (let ci = 0; ci < winColsZ; ci++) {
          const wcx = w / 2 + 0.05;
          const wcz = -d / 2 + 1.5 + ci * 2.5 + rng() * 0.3;
          windows.push({ cx: wcx, cz: wcz, cw: 0.1, cd: 0.8 + rng() * 0.3 });
        }
      }
      buildings.push({
        x: blockCX, z: blockCZ, width: w, depth: d, height: h,
        color, roofColor, windows,
      });
    }
  }
  return buildings;
}

export class GrandTheftRenderer {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uMVP: WebGLUniformLocation; uTint: WebGLUniformLocation; uFogColor: WebGLUniformLocation;

  cityCache = new Map<string, CityMesh>();
  carVAO: WebGLVertexArrayObject | null = null;
  carVBO: WebGLBuffer | null = null;
  carIBO: WebGLBuffer | null = null;
  carIndexCount = 0;
  npcMeshes: { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number }[] = [];

  tracerVAO: WebGLVertexArrayObject | null = null;
  tracerVBO: WebGLBuffer | null = null;
  tracerIBO: WebGLBuffer | null = null;
  tracerIndexCount = 0;

  flashVAO: WebGLVertexArrayObject | null = null;
  flashVBO: WebGLBuffer | null = null;
  flashIBO: WebGLBuffer | null = null;
  flashIndexCount = 0;

  otherPlayerMeshCache = new Map<string, CityMesh>();
  playerMesh: CityMesh | null = null;
  private _playerCarY = 0.4;

  skyR = 0.4; skyG = 0.6; skyB = 0.9;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false })!;
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CW);
    gl.clearColor(this.skyR, this.skyG, this.skyB, 1);

    const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    gl.bindAttribLocation(this.program, 0, 'aPos');
    gl.bindAttribLocation(this.program, 1, 'aColor');
    gl.bindAttribLocation(this.program, 2, 'aBrightness');

    this.uMVP = gl.getUniformLocation(this.program, 'uMVP')!;
    this.uTint = gl.getUniformLocation(this.program, 'uTint')!;
    this.uFogColor = gl.getUniformLocation(this.program, 'uFogColor')!;

    this.buildCarMesh();
    this.buildTracerMesh();
    this.buildFlashMesh();
    this.playerMesh = this.buildPlayerMesh();
  }

  resize(w: number, h: number) {
    this.gl.viewport(0, 0, w, h);
  }

  private addBox(verts: number[], idx: number[], vc: { v: number },
    minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
    color: [number, number, number], bright: number) {
    const pushFace = (a: number[], b: number[], c: number[], d: number[], br: number) => {
      for (const p of [a, b, c, d]) verts.push(p[0], p[1], p[2], color[0], color[1], color[2], br);
      idx.push(vc.v, vc.v + 1, vc.v + 2, vc.v, vc.v + 2, vc.v + 3); vc.v += 4;
    };
    pushFace([minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], bright * 1.05);
    pushFace([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], [minX, minY, minZ], bright * 0.6);
    pushFace([minX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], bright * 0.9);
    pushFace([maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ], [minX, minY, minZ], bright * 0.9);
    pushFace([maxX, minY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [maxX, minY, minZ], bright * 0.8);
    pushFace([minX, minY, minZ], [minX, maxY, minZ], [minX, maxY, maxZ], [minX, minY, maxZ], bright * 0.8);
  }

  private buildMesh(verts: number[], idx: number[]): CityMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, indexCount: idx.length };
  }

  private buildPlayerMesh(): CityMesh {
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };
    const skin: [number, number, number] = [0.95, 0.8, 0.65];
    const shirt: [number, number, number] = [0.2, 0.5, 0.8];
    const pants: [number, number, number] = [0.15, 0.15, 0.2];
    const shoes: [number, number, number] = [0.1, 0.1, 0.1];
    // Head
    this.addBox(verts, idx, vc, -0.15, 1.4, -0.15, 0.15, 1.7, 0.15, skin, 1.0);
    // Body
    this.addBox(verts, idx, vc, -0.2, 0.6, -0.12, 0.2, 1.4, 0.12, shirt, 1.0);
    // Left arm
    this.addBox(verts, idx, vc, -0.3, 0.7, -0.06, -0.2, 1.25, 0.06, skin, 0.95);
    // Right arm
    this.addBox(verts, idx, vc, 0.2, 0.7, -0.06, 0.3, 1.25, 0.06, skin, 0.95);
    // Legs
    this.addBox(verts, idx, vc, -0.14, 0.2, -0.08, -0.02, 0.6, 0.08, pants, 0.9);
    this.addBox(verts, idx, vc, 0.02, 0.2, -0.08, 0.14, 0.6, 0.08, pants, 0.9);
    // Shoes
    this.addBox(verts, idx, vc, -0.14, 0, -0.1, -0.02, 0.2, 0.1, shoes, 0.8);
    this.addBox(verts, idx, vc, 0.02, 0, -0.1, 0.14, 0.2, 0.1, shoes, 0.8);
    return this.buildMesh(verts, idx);
  }

  private buildTracerMesh() {
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };
    const yellow: [number, number, number] = [1, 0.9, 0.2];
    const halfW = 0.025;
    const halfLen = 7.5;
    this.addBox(verts, idx, vc, -halfW, -halfW, -halfLen, halfW, halfW, halfLen, yellow, 1.5);
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    this.tracerVAO = vao;
    this.tracerVBO = vbo;
    this.tracerIBO = ibo;
    this.tracerIndexCount = idx.length;
  }

  private buildFlashMesh() {
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };
    const white: [number, number, number] = [1, 1, 1];
    this.addBox(verts, idx, vc, -0.15, -0.15, -0.15, 0.15, 0.15, 0.15, white, 2.0);
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    this.flashVAO = vao;
    this.flashVBO = vbo;
    this.flashIBO = ibo;
    this.flashIndexCount = idx.length;
  }

  private makeDirectionModelMatrix(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): Float32Array {
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ox, oy, oz, 1]);
    const fx = dx / len, fy = dy / len, fz = dz / len;
    let rx = -fz, rz = fx;
    const rlen = Math.sqrt(rx * rx + rz * rz);
    if (rlen < 0.001) { rx = 1; rz = 0; }
    else { rx /= rlen; rz /= rlen; }
    const ux = fy * rz - fz * 0;
    const uy = fz * rx - fx * rz;
    const uz = fx * 0 - fy * rx;
    return new Float32Array([
      rx, ux, fx, 0,
      0, uy, fy, 0,
      rz, uz, fz, 0,
      ox, oy, oz, 1,
    ]);
  }

  getOtherPlayerMesh(color: [number, number, number]): CityMesh {
    const key = `${color[0].toFixed(2)},${color[1].toFixed(2)},${color[2].toFixed(2)}`;
    let cached = this.otherPlayerMeshCache.get(key);
    if (cached) return cached;
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };
    const dc: [number, number, number] = [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6];
    const glass: [number, number, number] = [0.4, 0.6, 0.8];
    const tire: [number, number, number] = [0.1, 0.1, 0.1];
    this.addBox(verts, idx, vc, -0.7, 0.2, -1.4, 0.7, 0.45, 1.4, color, 1.0);
    this.addBox(verts, idx, vc, -0.65, 0.45, -0.7, 0.65, 0.75, 0.6, color, 0.95);
    this.addBox(verts, idx, vc, -0.6, 0.45, 1.2, 0.6, 0.7, 1.35, glass, 0.7);
    this.addBox(verts, idx, vc, -0.6, 0.45, -1.35, 0.6, 0.7, -1.2, glass, 0.6);
    this.addBox(verts, idx, vc, -0.75, 0.15, -1.5, 0.75, 0.3, -1.4, dc, 0.9);
    this.addBox(verts, idx, vc, -0.75, 0.15, 1.4, 0.75, 0.3, 1.5, dc, 0.9);
    for (const wp of [[-0.8, 0.15, -1.0], [0.8, 0.15, -1.0], [-0.8, 0.15, 1.0], [0.8, 0.15, 1.0]]) {
      this.addBox(verts, idx, vc, wp[0] - 0.13, 0, wp[2] - 0.13, wp[0] + 0.13, 0.22, wp[2] + 0.13, tire, 0.7);
    }
    const mesh = this.buildMesh(verts, idx);
    this.otherPlayerMeshCache.set(key, mesh);
    return mesh;
  }

  getCityChunk(chunkCX: number, chunkCZ: number): CityMesh {
    const key = `${chunkCX},${chunkCZ}`;
    let existing = this.cityCache.get(key);
    if (existing) return existing;

    const buildings = generateBuildings(chunkCX, chunkCZ);
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };

    const worldCX = chunkCX * CHUNK_SIZE;
    const worldCZ = chunkCZ * CHUNK_SIZE;

    const gndColor: [number, number, number] = [0.25, 0.22, 0.20];
    this.addBox(verts, idx, vc,
      worldCX - 5, -0.5, worldCZ - 5,
      worldCX + CHUNK_SIZE + 5, 0, worldCZ + CHUNK_SIZE + 5,
      gndColor, 1.0);

    const roadColor: [number, number, number] = [0.15, 0.15, 0.16];
    const numBlocks = CHUNK_SIZE / GRID_PITCH;
    for (let bi = 0; bi <= numBlocks; bi++) {
      const pos = bi * GRID_PITCH;
      this.addBox(verts, idx, vc,
        worldCX - 5, 0.01, worldCZ + pos - ROAD_WIDTH / 2,
        worldCX + CHUNK_SIZE + 5, 0.05, worldCZ + pos + ROAD_WIDTH / 2,
        roadColor, 1.0);
      this.addBox(verts, idx, vc,
        worldCX + pos - ROAD_WIDTH / 2, 0.01, worldCZ - 5,
        worldCX + pos + ROAD_WIDTH / 2, 0.05, worldCZ + CHUNK_SIZE + 5,
        roadColor, 1.0);
    }

    for (const b of buildings) {
      const hw = b.width / 2, hd = b.depth / 2;
      this.addBox(verts, idx, vc,
        b.x - hw, 0, b.z - hd,
        b.x + hw, b.height, b.z + hd,
        b.color, 1.0);
      this.addBox(verts, idx, vc,
        b.x - hw, b.height, b.z - hd,
        b.x + hw, b.height + 0.5, b.z + hd,
        b.roofColor, 1.0);
      const winColor: [number, number, number] = [0.6, 0.7, 0.9];
      for (const w of b.windows) {
        if (w.cd > 0.5) {
          this.addBox(verts, idx, vc,
            b.x + w.cx - w.cw / 2, 1 + w.cx / b.width * (b.height - 2), b.z + w.cz - w.cd / 2,
            b.x + w.cx + w.cw / 2, 1 + w.cx / b.width * (b.height - 2) + 0.8, b.z + w.cz + w.cd / 2,
            winColor, 0.8);
        } else {
          this.addBox(verts, idx, vc,
            b.x + w.cx - w.cw / 2, 1 + w.cz / b.depth * (b.height - 2), b.z + w.cz - w.cd / 2,
            b.x + w.cx + w.cw / 2, 1 + w.cz / b.depth * (b.height - 2) + 0.8, b.z + w.cz + w.cd / 2,
            winColor, 0.8);
        }
      }
    }

    const sidewalkColor: [number, number, number] = [0.35, 0.33, 0.30];
    for (let bi = 0; bi <= numBlocks; bi++) {
      const pos = bi * GRID_PITCH;
      this.addBox(verts, idx, vc,
        worldCX - 5, 0.05, worldCZ + pos - ROAD_WIDTH / 2 - 1.5,
        worldCX + CHUNK_SIZE + 5, 0.12, worldCZ + pos - ROAD_WIDTH / 2,
        sidewalkColor, 1.0);
      this.addBox(verts, idx, vc,
        worldCX - 5, 0.05, worldCZ + pos + ROAD_WIDTH / 2,
        worldCX + CHUNK_SIZE + 5, 0.12, worldCZ + pos + ROAD_WIDTH / 2 + 1.5,
        sidewalkColor, 1.0);
      this.addBox(verts, idx, vc,
        worldCX + pos - ROAD_WIDTH / 2 - 1.5, 0.05, worldCZ - 5,
        worldCX + pos - ROAD_WIDTH / 2, 0.12, worldCZ + CHUNK_SIZE + 5,
        sidewalkColor, 1.0);
      this.addBox(verts, idx, vc,
        worldCX + pos + ROAD_WIDTH / 2, 0.05, worldCZ - 5,
        worldCX + pos + ROAD_WIDTH / 2 + 1.5, 0.12, worldCZ + CHUNK_SIZE + 5,
        sidewalkColor, 1.0);
    }

    const poleColor: [number, number, number] = [0.2, 0.2, 0.2];
    const lampColor: [number, number, number] = [1.0, 0.95, 0.7];
    for (let bi = 0; bi <= numBlocks; bi++) {
      for (let bj = 0; bj <= numBlocks; bj++) {
        const lx = worldCX + bi * GRID_PITCH;
        const lz = worldCZ + bj * GRID_PITCH;
        const offset = ROAD_WIDTH / 2 + 1;
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sz = -1; sz <= 1; sz += 2) {
            const pl = { x: lx + sx * offset, z: lz + sz * offset };
            if (pl.x >= worldCX && pl.x < worldCX + CHUNK_SIZE && pl.z >= worldCZ && pl.z < worldCZ + CHUNK_SIZE) {
              this.addBox(verts, idx, vc, pl.x - 0.08, 0, pl.z - 0.08, pl.x + 0.08, 3.5, pl.z + 0.08, poleColor, 0.9);
              this.addBox(verts, idx, vc, pl.x - 0.3, 3.3, pl.z - 0.3, pl.x + 0.3, 3.6, pl.z + 0.3, lampColor, 1.5);
            }
          }
        }
      }
    }

    existing = this.buildMesh(verts, idx);
    this.cityCache.set(key, existing);
    return existing;
  }

  private buildCarMesh() {
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };

    const red: [number, number, number] = [0.8, 0.15, 0.15];
    const darkRed: [number, number, number] = [0.5, 0.08, 0.08];
    const glass: [number, number, number] = [0.4, 0.6, 0.8];
    const black: [number, number, number] = [0.05, 0.05, 0.05];
    const silver: [number, number, number] = [0.6, 0.6, 0.62];
    const tire: [number, number, number] = [0.1, 0.1, 0.1];

    this.addBox(verts, idx, vc, -0.8, 0.2, -1.6, 0.8, 0.5, 1.6, red, 1.0);
    this.addBox(verts, idx, vc, -0.75, 0.5, -0.9, 0.75, 0.85, 0.8, red, 0.95);
    this.addBox(verts, idx, vc, -0.7, 0.5, 1.4, 0.7, 0.8, 1.55, glass, 0.7);
    this.addBox(verts, idx, vc, -0.7, 0.5, -1.55, 0.7, 0.8, -1.4, glass, 0.6);
    this.addBox(verts, idx, vc, 0.7, 0.5, -0.8, 0.78, 0.8, 0.7, glass, 0.65);
    this.addBox(verts, idx, vc, -0.78, 0.5, -0.8, -0.7, 0.8, 0.7, glass, 0.65);
    this.addBox(verts, idx, vc, -0.75, 0.22, 0.9, 0.75, 0.35, 1.6, darkRed, 1.0);
    this.addBox(verts, idx, vc, -0.75, 0.22, -1.6, 0.75, 0.35, -0.95, darkRed, 0.95);
    this.addBox(verts, idx, vc, -0.85, 0.15, 1.55, 0.85, 0.35, 1.7, black, 0.8);
    this.addBox(verts, idx, vc, -0.85, 0.15, -1.7, 0.85, 0.35, -1.55, black, 0.8);
    this.addBox(verts, idx, vc, -0.4, 0.25, 1.65, -0.15, 0.4, 1.75, silver, 1.5);
    this.addBox(verts, idx, vc, 0.15, 0.25, 1.65, 0.4, 0.4, 1.75, silver, 1.5);
    this.addBox(verts, idx, vc, -0.4, 0.25, -1.75, -0.15, 0.4, -1.65, [1, 0, 0], 1.2);
    this.addBox(verts, idx, vc, 0.15, 0.25, -1.75, 0.4, 0.4, -1.65, [1, 0, 0], 1.2);
    const wPos = [[-0.9, 0.15, -1.2], [0.9, 0.15, -1.2], [-0.9, 0.15, 1.2], [0.9, 0.15, 1.2]];
    for (const wp of wPos) {
      this.addBox(verts, idx, vc, wp[0] - 0.15, 0, wp[2] - 0.15, wp[0] + 0.15, 0.25, wp[2] + 0.15, tire, 0.7);
      this.addBox(verts, idx, vc, wp[0] - 0.08, 0.05, wp[2] - 0.08, wp[0] + 0.08, 0.2, wp[2] + 0.08, silver, 1.0);
    }

    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    this.carVAO = vao;
    this.carVBO = vbo;
    this.carIBO = ibo;
    this.carIndexCount = idx.length;
  }

  buildNPCMesh(color: [number, number, number]): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number } {
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    const vc = { v: 0 };
    const dc = [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6] as [number, number, number];
    const glass: [number, number, number] = [0.4, 0.6, 0.8];
    const tire: [number, number, number] = [0.1, 0.1, 0.1];

    this.addBox(verts, idx, vc, -0.7, 0.2, -1.4, 0.7, 0.45, 1.4, color, 1.0);
    this.addBox(verts, idx, vc, -0.65, 0.45, -0.7, 0.65, 0.75, 0.6, color, 0.95);
    this.addBox(verts, idx, vc, -0.6, 0.45, 1.2, 0.6, 0.7, 1.35, glass, 0.7);
    this.addBox(verts, idx, vc, -0.6, 0.45, -1.35, 0.6, 0.7, -1.2, glass, 0.6);
    this.addBox(verts, idx, vc, -0.75, 0.15, -1.5, 0.75, 0.3, -1.4, dc, 0.9);
    this.addBox(verts, idx, vc, -0.75, 0.15, 1.4, 0.75, 0.3, 1.5, dc, 0.9);
    for (const wp of [[-0.8, 0.15, -1.0], [0.8, 0.15, -1.0], [-0.8, 0.15, 1.0], [0.8, 0.15, 1.0]]) {
      this.addBox(verts, idx, vc, wp[0] - 0.13, 0, wp[2] - 0.13, wp[0] + 0.13, 0.22, wp[2] + 0.13, tire, 0.7);
    }

    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    const ibo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, indexCount: idx.length };
  }

  render(
    camX: number, camY: number, camZ: number, yaw: number, pitch: number,
    aspect: number,
    playerCarX: number, playerCarY: number, playerCarZ: number, playerCarYaw: number,
    npcs: { x: number; z: number; yaw: number; mesh: { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number } }[],
    otherPlayers: { x: number; y: number; z: number; yaw: number; mesh: CityMesh }[],
    tracers: { originX: number; originY: number; originZ: number; dirX: number; dirY: number; dirZ: number }[],
    muzzleFlashes: { x: number; y: number; z: number; age: number; lifetime: number }[],
    playerMeshOverride: CityMesh | null,
  ) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const mvp = buildMVP(camX, camY, camZ, yaw, pitch, aspect);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniform3f(this.uTint, 1, 1, 1);
    gl.uniform3f(this.uFogColor, this.skyR * 0.6, this.skyG * 0.6, this.skyB * 0.6);

    // Cities
    const chunkCX = Math.floor(camX / CHUNK_SIZE);
    const chunkCZ = Math.floor(camZ / CHUNK_SIZE);
    const viewDist = 3;
    for (let dz = -viewDist; dz <= viewDist; dz++) {
      for (let dx = -viewDist; dx <= viewDist; dx++) {
        const building = this.getCityChunk(chunkCX + dx, chunkCZ + dz);
        gl.bindVertexArray(building.vao);
        gl.drawElements(gl.TRIANGLES, building.indexCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    const proj = perspectiveMatrix(60 * Math.PI / 180, aspect, 0.1, 400);
    const view = lookAtFPS(camX, camY, camZ, yaw, pitch);

    // Player car or player mesh
    if (playerMeshOverride && this.playerMesh) {
      const cy2 = Math.cos(playerCarYaw), sy2 = Math.sin(playerCarYaw);
      const pModel = new Float32Array([
        cy2, 0, -sy2, 0,
        0, 1, 0, 0,
        sy2, 0, cy2, 0,
        playerCarX, playerCarY, playerCarZ, 1,
      ]);
      const pMvp = multiplyMat4(proj, multiplyMat4(view, pModel));
      gl.uniformMatrix4fv(this.uMVP, false, pMvp);
      gl.bindVertexArray(this.playerMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.playerMesh.indexCount, gl.UNSIGNED_SHORT, 0);
      gl.uniformMatrix4fv(this.uMVP, false, mvp);
    } else if (this.carVAO) {
      const cy2 = Math.cos(playerCarYaw), sy2 = Math.sin(playerCarYaw);
      const carModel = new Float32Array([
        cy2, 0, -sy2, 0,
        0, 1, 0, 0,
        sy2, 0, cy2, 0,
        playerCarX, playerCarY, playerCarZ, 1,
      ]);
      const carMvp = multiplyMat4(proj, multiplyMat4(view, carModel));
      gl.uniformMatrix4fv(this.uMVP, false, carMvp);
      gl.bindVertexArray(this.carVAO);
      gl.drawElements(gl.TRIANGLES, this.carIndexCount, gl.UNSIGNED_SHORT, 0);
      gl.uniformMatrix4fv(this.uMVP, false, mvp);
    }

    // Other players
    for (const p of otherPlayers) {
      const cy2 = Math.cos(p.yaw), sy2 = Math.sin(p.yaw);
      const pModel = new Float32Array([
        cy2, 0, -sy2, 0,
        0, 1, 0, 0,
        sy2, 0, cy2, 0,
        p.x, p.y, p.z, 1,
      ]);
      const pMvp = multiplyMat4(proj, multiplyMat4(view, pModel));
      gl.uniformMatrix4fv(this.uMVP, false, pMvp);
      gl.bindVertexArray(p.mesh.vao);
      gl.drawElements(gl.TRIANGLES, p.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    // NPCs
    for (const npc of npcs) {
      const cy2 = Math.cos(npc.yaw), sy2 = Math.sin(npc.yaw);
      const npcModel = new Float32Array([
        cy2, 0, -sy2, 0,
        0, 1, 0, 0,
        sy2, 0, cy2, 0,
        npc.x, playerCarY, npc.z, 1,
      ]);
      const npcMvp = multiplyMat4(proj, multiplyMat4(view, npcModel));
      gl.uniformMatrix4fv(this.uMVP, false, npcMvp);
      gl.bindVertexArray(npc.mesh.vao);
      gl.drawElements(gl.TRIANGLES, npc.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    // Tracers
    if (this.tracerVAO) {
      gl.bindVertexArray(this.tracerVAO);
      for (const t of tracers) {
        const tModel = this.makeDirectionModelMatrix(t.originX, t.originY, t.originZ, t.dirX, t.dirY, t.dirZ);
        const tMvp = multiplyMat4(proj, multiplyMat4(view, tModel));
        gl.uniformMatrix4fv(this.uMVP, false, tMvp);
        gl.drawElements(gl.TRIANGLES, this.tracerIndexCount, gl.UNSIGNED_SHORT, 0);
      }
      gl.uniformMatrix4fv(this.uMVP, false, mvp);
    }

    // Muzzle flashes
    if (this.flashVAO) {
      gl.bindVertexArray(this.flashVAO);
      for (const f of muzzleFlashes) {
        const fade = Math.max(0, 1 - f.age / f.lifetime);
        const fModel = new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          f.x, f.y, f.z, 1,
        ]);
        const fMvp = multiplyMat4(proj, multiplyMat4(view, fModel));
        gl.uniformMatrix4fv(this.uMVP, false, fMvp);
        gl.uniform3f(this.uTint, fade, fade * 0.8, fade * 0.3);
        gl.drawElements(gl.TRIANGLES, this.flashIndexCount, gl.UNSIGNED_SHORT, 0);
      }
      gl.uniformMatrix4fv(this.uMVP, false, mvp);
      gl.uniform3f(this.uTint, 1, 1, 1);
    }
  }

  clearCache() {
    const gl = this.gl;
    Array.from(this.cityCache.values()).forEach(mesh => {
      gl.deleteVertexArray(mesh.vao);
      gl.deleteBuffer(mesh.vbo);
      gl.deleteBuffer(mesh.ibo);
    });
    this.cityCache.clear();
    Array.from(this.otherPlayerMeshCache.values()).forEach(mesh => {
      gl.deleteVertexArray(mesh.vao);
      gl.deleteBuffer(mesh.vbo);
      gl.deleteBuffer(mesh.ibo);
    });
    this.otherPlayerMeshCache.clear();
  }
}
