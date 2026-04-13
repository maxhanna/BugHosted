/**
 * WebGL chunk-based block renderer.
 * Renders visible faces only, one draw call per chunk mesh.
 */
import {
  BlockId, BLOCK_COLORS, BlockColor, CHUNK_SIZE, WORLD_HEIGHT,
  RENDER_DISTANCE, DCPlayer, ITEM_COLORS, ItemId
} from './digcraft-types';
import { Chunk } from './digcraft-world';

// ──── Shader sources ────
const VS = `
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
  { dir: [0, 1, 0], verts: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], brightness: 1.0 },   // top
  { dir: [0, -1, 0], verts: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], brightness: 0.5 },   // bottom
  { dir: [0, 0, 1], verts: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], brightness: 0.8 },   // south
  { dir: [0, 0, -1], verts: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]], brightness: 0.8 },   // north
  { dir: [1, 0, 0], verts: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]], brightness: 0.7 },   // east
  { dir: [-1, 0, 0], verts: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], brightness: 0.7 },   // west
];

export interface ChunkMesh {
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  indexCount: number;
  cx: number;
  cz: number;
}

export interface WeaponMesh {
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  indexCount: number;
}

export class DigCraftRenderer {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uMVP: WebGLUniformLocation;
  uFogColor: WebGLUniformLocation;
  uTint: WebGLUniformLocation;
  private _playerPillarLogOnce = false;
  meshes: Map<string, ChunkMesh> = new Map();
  width = 0;
  height = 0;
  public fovDeg: number = 70;
  // Number of chunks to render around the player (user-configurable at runtime)
  public renderDistanceChunks: number = RENDER_DISTANCE;

  // Track last player positions to determine movement for bobbing
  private lastPlayerStates: Map<number, { x: number; y: number; z: number; t: number }> = new Map();

  // Cached weapon meshes by item id
  private weaponMeshes: Map<number, WeaponMesh> = new Map();
  // Cached mob meshes by mob type (e.g. 'Pig','Cow','Sheep')
  private mobMeshes: Map<string, WeaponMesh> = new Map();

  // Sky / fog colour
  private skyR = 0.53;
  private skyG = 0.81;
  private skyB = 0.92;

  /** Update the fog/clear color (useful to match day/night sky) */
  public setFogColor(r: number, g: number, b: number): void {
    this.skyR = r; this.skyG = g; this.skyB = b;
    try {
      this.gl.uniform3f(this.uFogColor, r, g, b);
      this.gl.clearColor(r, g, b, 0);
    } catch (e) { /* ignore if GL not ready */ }
  }

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true })!;
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.resize(canvas.width, canvas.height);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CW);
    // Use a transparent canvas so an HTML/CSS or 2D canvas behind the WebGL
    // canvas can draw the sky (stars/sun/moon) and be properly occluded by
    // opaque world geometry rendered in WebGL.
    gl.clearColor(this.skyR, this.skyG, this.skyB, 0);

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
    this.uTint = gl.getUniformLocation(this.program, 'uTint')!;
    gl.uniform3f(this.uFogColor, this.skyR, this.skyG, this.skyB);
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
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
          if (blockId === BlockId.AIR || blockId === BlockId.WATER || blockId === BlockId.WINDOW_OPEN || blockId === BlockId.DOOR_OPEN) continue;

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

            // Only render faces adjacent to transparent-ish blocks
            if (neighbor !== BlockId.AIR && neighbor !== BlockId.WATER && neighbor !== BlockId.LEAVES && neighbor !== BlockId.GLASS && neighbor !== BlockId.WINDOW_OPEN && neighbor !== BlockId.DOOR_OPEN) continue;

            // Special-case: WINDOW / DOOR should render a wooden frame outline with a transparent center
            if (blockId === BlockId.WINDOW || blockId === BlockId.DOOR) {
              // Use plank colour for window frames, door uses its own colour
              const frameColor = (blockId === BlockId.WINDOW) ? (BLOCK_COLORS[BlockId.PLANK] ?? bc) : bc;
              // four frame rectangles (top, bottom, left, right) in face-local UV space
              const t = 0.16; // frame thickness
              const rects = [
                { u0: 0, u1: 1, v0: 1 - t, v1: 1 }, // top
                { u0: 0, u1: 1, v0: 0, v1: t },     // bottom
                { u0: 0, u1: t, v0: t, v1: 1 - t }, // left
                { u0: 1 - t, u1: 1, v0: t, v1: 1 - t } // right
              ];

              // Compute corner points in world space for face (c0..c3)
              const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
              const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
              const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
              const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
              const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
              const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
              const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

              let rectIndex = 0;
              for (const r of rects) {
                // build quad for rect [u0..u1] x [v0..v1]
                const p00 = [c0[0] + edgeU[0] * r.u0 + edgeV[0] * r.v0, c0[1] + edgeU[1] * r.u0 + edgeV[1] * r.v0, c0[2] + edgeU[2] * r.u0 + edgeV[2] * r.v0];
                const p10 = [c0[0] + edgeU[0] * r.u1 + edgeV[0] * r.v0, c0[1] + edgeU[1] * r.u1 + edgeV[1] * r.v0, c0[2] + edgeU[2] * r.u1 + edgeV[2] * r.v0];
                const p11 = [c0[0] + edgeU[0] * r.u1 + edgeV[0] * r.v1, c0[1] + edgeU[1] * r.u1 + edgeV[1] * r.v1, c0[2] + edgeU[2] * r.u1 + edgeV[2] * r.v1];
                const p01 = [c0[0] + edgeU[0] * r.u0 + edgeV[0] * r.v1, c0[1] + edgeU[1] * r.u0 + edgeV[1] * r.v1, c0[2] + edgeU[2] * r.u0 + edgeV[2] * r.v1];

                const cr = frameColor.r; const cg = frameColor.g; const cb = frameColor.b;
                // push verts with jitter like other faces
                const quadVerts = [p00, p10, p11, p01];
                for (let qvi = 0; qvi < 4; qvi++) {
                  const pv = quadVerts[qvi];
                  positions.push(pv[0], pv[1], pv[2]);
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (rectIndex * 13 + qvi)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const jitter = 0.96 + rnd * 0.08;
                  colors.push(cr * jitter, cg * jitter, cb * jitter);
                  brightness.push(face.brightness * (0.9 + rnd * 0.1));
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
                rectIndex++;
              }
              continue; // next face
            }

            // Default solid-face path
            const isTop = fi === 0;
            const cr = isTop && bc.top ? bc.top.r : bc.r;
            const cg = isTop && bc.top ? bc.top.g : bc.g;
            const cb = isTop && bc.top ? bc.top.b : bc.b;

            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              const wx = ox + x + v[0];
              const wy = y + v[1];
              const wz = oz + z + v[2];
              positions.push(wx, wy, wz);
              // cheap deterministic per-vertex jitter to add surface variation without extra geometry
              const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ vi) >>> 0);
              const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000; // 0..0.999
              const jitter = 0.96 + rnd * 0.08; // ~0.96 - 1.04
              colors.push(cr * jitter, cg * jitter, cb * jitter);
              brightness.push(face.brightness * (0.9 + rnd * 0.1));
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
    const proj = perspectiveMatrix(this.fovDeg * Math.PI / 180, aspect, 0.1, 200);
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
      if (Math.abs(dx) > this.renderDistanceChunks || Math.abs(dz) > this.renderDistanceChunks) continue;

      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);

    const now = performance.now() / 1000;
    // Render other players as coloured pillars and their weapons
    for (const p of players) {
      if (p.userId === myUserId) continue;
      // compute movement speed for bobbing
      const prev = this.lastPlayerStates.get(p.userId);
      let speed = 0;
      if (prev) {
        const dt = Math.max(0.001, now - prev.t);
        const dx = p.posX - prev.x;
        const dz = p.posZ - prev.z;
        speed = Math.sqrt(dx * dx + dz * dz) / dt;
      }
      this.lastPlayerStates.set(p.userId, { x: p.posX, y: p.posY, z: p.posZ, t: now });
      this.drawPlayerPillar(p, mvp, now, speed);
      // Draw healthbar in WebGL
      try {
        const eyeHeight = 1.6;
        const headTop = p.posY + 0.25; // Position for healthbar (name will be above at +0.35)
        const fullW = 0.9;
        const fullH = 0.15;
        const maxH = (p as any).maxHealth ?? 20;
        const curH = Math.max(0, (p.health ?? 0));
        const ratio = Math.max(0, Math.min(1, maxH > 0 ? curH / maxH : 0));

        this.ensureHealthbarMesh();
        // Billboard toward camera
        const T = translationMatrix(p.posX, headTop, p.posZ);
        const R = rotationYMatrix(-yaw);
        
        // Calculate bar width based on health ratio
        const barW = fullW * ratio;
        const barH = fullH;
        const S = this.scaleXYZ(barW, barH, 1);
        const M = multiplyMat4(T, multiplyMat4(R, S));
        const finalMVP = multiplyMat4(mvp, M);
        
        // Simple color - bright green for health, bright red for low health
        if (ratio > 0.5) {
          gl.uniform3f(this.uTint, 0.2, 1.0, 0.2);
        } else {
          gl.uniform3f(this.uTint, 1.0, 0.2, 0.2);
        }
        
        gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
        gl.bindVertexArray(this.healthbarVAO);
        gl.drawElements(gl.TRIANGLES, this.healthbarIndexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
        // restore
        gl.uniformMatrix4fv(this.uMVP, false, mvp);
        gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
      } catch (e) {
        console.error('Error rendering healthbar for player', p.userId, e);
      }
    }
  }

  /** Simple coloured box for other players */
  private playerVAO: WebGLVertexArrayObject | null = null;
  private playerVBO: WebGLBuffer | null = null;
  private playerIBO: WebGLBuffer | null = null;
  private playerIndexCount = 0;

  // Healthbar mesh (unit quad centered at origin, extend X horizontally)
  private healthbarVAO: WebGLVertexArrayObject | null = null;
  private healthbarVBO: WebGLBuffer | null = null;
  private healthbarIBO: WebGLBuffer | null = null;
  private healthbarIndexCount = 0;

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

  // weapon meshes cached per item id (built on demand)
  // see ensureWeaponMeshFor(itemId)

  private drawPlayerPillar(p: DCPlayer, baseMVP: Float32Array, now?: number, speed?: number): void {
    const gl = this.gl;
    if (!this._playerPillarLogOnce) {
      try { console.info('DigCraftRenderer: drawPlayerPillar called example:', p.userId, p.posX, p.posY, p.posZ); } catch (e) { }
      this._playerPillarLogOnce = true;
    }

    // Translate model so feet sit at player's ground position (client stores camera/eye Y)
    const eyeHeight = 1.6;

    // Detect mobs (we map mobs to negative userIds in the client). Draw specialized mob models.
    const isMob = (p.userId ?? 0) < 0;
    if (isMob) {
      const mobType = (p as any).username || 'Mob';
      // Humanoid mobs reuse the player mesh but get a tint (Zombie/Skeleton)
      if (mobType === 'Zombie' || mobType === 'Skeleton') {
        this.ensurePlayerMesh(); 
        const tintHex = (p as any).color ?? (mobType === 'Zombie' ? '#339966' : '#CFCFCF');
        const tint = hexToRGB(tintHex);
        gl.uniform3f(this.uTint, tint[0], tint[1], tint[2]);
        const P = translationMatrix(p.posX, p.posY - eyeHeight, p.posZ);
        const R = rotationYMatrix(p.yaw || 0);
        const world = multiplyMat4(P, R);
        const finalMVP = multiplyMat4(baseMVP, world);
        gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
        gl.bindVertexArray(this.playerVAO);
        gl.drawElements(gl.TRIANGLES, this.playerIndexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
        // restore
        gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
        gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
        return;
      }

      // Animal mobs: build or reuse a custom mesh and draw it (mesh vertex colours encode appearance)
      this.ensureMobMeshFor(mobType);
      const mesh = this.mobMeshes.get(mobType);
      if (mesh && mesh.vao) {
        gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
        const P = translationMatrix(p.posX, p.posY - eyeHeight, p.posZ);
        const R = rotationYMatrix(p.yaw || 0);
        const world = multiplyMat4(P, R);
        const finalMVP = multiplyMat4(baseMVP, world);
        gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
        gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
        return;
      }
      // fall through to player-like draw if no mob mesh available
    }

    // Default: draw a humanoid player
    this.ensurePlayerMesh();
    const P = translationMatrix(p.posX, p.posY - eyeHeight, p.posZ);
    const R = rotationYMatrix(p.yaw ?? 0);
    const world = multiplyMat4(P, R);
    const mvp = multiplyMat4(baseMVP, world);
    const tintHex = (p as any).color ?? '#ffffff';
     const tint = hexToRGB(tintHex);
    // // Tint based on health - green=healthy, yellow=half, red=low
    // const maxH = p.maxHealth ?? 20;
    // const curH = p.health ?? 20;
    // const healthRatio = maxH > 0 ? curH / maxH : 1;
    // if (healthRatio > 0.75) {
    //   gl.uniform3f(this.uTint, tint[0], tint[1], tint[2]);
    // } else if (healthRatio > 0.4) {
    //   gl.uniform3f(this.uTint, 1.0, 1.0, 0.0);
    // } else {
    //   gl.uniform3f(this.uTint, 1.0, 0.2, 0.2);
    // }
    gl.uniform3f(this.uTint, 1.0, 0.2, 0.2);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.bindVertexArray(this.playerVAO);
    gl.drawElements(gl.TRIANGLES, this.playerIndexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    // draw weapon if present (per-item mesh with per-vertex colours)
    const weaponId = (p as any).weapon ?? 0;
    if (weaponId && weaponId > 0) {
      this.ensureWeaponMeshFor(weaponId);
      const mesh = this.weaponMeshes.get(weaponId);
      if (mesh && mesh.vao) {
        // compute bob offset
        const time = now ?? performance.now() / 1000;
        const sp = speed ?? 0;
        const walkFactor = Math.min(1, sp / 4);
        const bob = Math.sin(time * (2 + walkFactor * 6) + p.userId) * (0.02 + walkFactor * 0.06);

        // local hand offset (right hand)
        const legH = 0.5;
        const torsoH = 0.8;
        const handY = legH + torsoH - 0.15 + bob;
        const handX = 0.36; // to the right of torso
        const handZ = 0.14; // slightly forward

        // world transform: T(player) * R(yaw) * T(handLocal)
        const P = translationMatrix(p.posX, p.posY - eyeHeight, p.posZ);
        const R = rotationYMatrix(p.yaw ?? 0);
        const H = translationMatrix(handX, handY, handZ);
        const world = multiplyMat4(P, multiplyMat4(R, H));
        const finalMVP = multiplyMat4(baseMVP, world);

        // use per-vertex colors for weapon (no player tint)
        gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
        gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
      }
      // restore base MVP
      gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
    } else {
      // restore MVP when no weapon drawn
      gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
    }
  }

    private ensureHealthbarMesh(): void {
      console.info('DigCraftRenderer: ensureHealthbarMesh called, existing VAO:', !!this.healthbarVAO);
      if (this.healthbarVAO) return;
      const gl = this.gl;
      // Quad: (-0.5,0,0),(0.5,0,0),(0.5,1,0),(-0.5,1,0) in local space
      const verts: number[] = [];
      const push = (x: number, y: number, z: number, r: number, g: number, b: number, br: number) => {
        verts.push(x, y, z, r, g, b, br);
      };
      push(-0.5, 0, 0, 1, 1, 1, 1);
      push(0.5, 0, 0, 1, 1, 1, 1);
      push(0.5, 1, 0, 1, 1, 1, 1);
      push(-0.5, 1, 0, 1, 1, 1, 1);
      const idx = [0, 1, 2, 0, 2, 3];

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

      this.healthbarVAO = vao;
      this.healthbarVBO = vbo;
      this.healthbarIBO = ibo;
      this.healthbarIndexCount = idx.length;
      console.info('DigCraftRenderer: healthbar mesh created, indexCount:', this.healthbarIndexCount);
    }

    /** Ensure a mesh exists for the named mob type. Simple blocky animals (Pig, Cow, Sheep) get custom meshes. */
    private ensureMobMeshFor(type: string): void {
      if (!type) type = 'Mob';
      if (this.mobMeshes.has(type)) return;
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

      const t = type;
      if (t === 'Pig') {
        const base = hexToRGB('#FF9EA6');
        const snout = hexToRGB('#FF7E7E');
        const legH = 0.35;
        const legX = 0.08; const legZ = 0.08;
        // legs
        addBox(-0.22, 0, -0.12, -0.12, legH, 0.12, base, 0.9);
        addBox(0.12, 0, -0.12, 0.22, legH, 0.12, base, 0.9);
        addBox(-0.22, 0, 0.0, -0.12, legH, 0.12, base, 0.9);
        addBox(0.12, 0, 0.0, 0.22, legH, 0.12, base, 0.9);
        // body
        addBox(-0.32, legH, -0.22, 0.32, legH + 0.48, 0.22, base, 1.0);
        // head
        addBox(0.34, legH + 0.18, -0.12, 0.64, legH + 0.18 + 0.36, 0.12, base, 1.0);
        // snout
        addBox(0.64, legH + 0.3, -0.06, 0.84, legH + 0.3 + 0.18, 0.06, snout, 1.0);
      } else if (t === 'Cow') {
        const white = hexToRGB('#F5F5F0');
        const patch = hexToRGB('#222222');
        const legH = 0.45;
        // legs
        addBox(-0.28, 0, -0.14, -0.18, legH, 0.14, patch, 0.85);
        addBox(0.18, 0, -0.14, 0.28, legH, 0.14, patch, 0.85);
        addBox(-0.28, 0, 0.06, -0.18, legH, 0.26, patch, 0.85);
        addBox(0.18, 0, 0.06, 0.28, legH, 0.26, patch, 0.85);
        // body
        addBox(-0.42, legH, -0.22, 0.42, legH + 0.6, 0.22, white, 1.0);
        // patches
        addBox(0.0, legH + 0.2, -0.08, 0.28, legH + 0.5, 0.02, patch, 0.9);
        addBox(-0.36, legH + 0.3, 0.02, -0.12, legH + 0.55, 0.18, patch, 0.9);
        // head
        addBox(0.48, legH + 0.28, -0.12, 0.74, legH + 0.62, 0.12, white, 1.0);
        // horns
        addBox(0.70, legH + 0.62, -0.02, 0.74, legH + 0.7, -0.01, hexToRGB('#FFF4E0'), 0.95);
        addBox(0.70, legH + 0.62, 0.01, 0.74, legH + 0.7, 0.02, hexToRGB('#FFF4E0'), 0.95);
      } else if (t === 'Sheep') {
        const wool = hexToRGB('#F6F6F6');
        const face = hexToRGB('#4B3B2E');
        const legH = 0.36;
        // legs (dark)
        addBox(-0.16, 0, -0.10, -0.06, legH, 0.10, face, 0.85);
        addBox(0.06, 0, -0.10, 0.16, legH, 0.10, face, 0.85);
        addBox(-0.16, 0, 0.08, -0.06, legH, 0.18, face, 0.85);
        addBox(0.06, 0, 0.08, 0.16, legH, 0.18, face, 0.85);
        // fluffy body (stacked small boxes)
        addBox(-0.36, legH, -0.24, 0.36, legH + 0.44, 0.24, wool, 1.0);
        addBox(-0.40, legH + 0.28, -0.16, -0.36, legH + 0.6, 0.16, wool, 1.0);
        addBox(0.36, legH + 0.28, -0.16, 0.40, legH + 0.6, 0.16, wool, 1.0);
        // head (dark)
        addBox(0.42, legH + 0.18, -0.06, 0.58, legH + 0.42, 0.06, face, 0.95);
      } else if (t === 'Chicken') {
        const body = hexToRGB('#F8F8F0');
        const beak = hexToRGB('#FFCC33');
        const leg = hexToRGB('#D8A24A');
        const legH = 0.16;
        // legs
        addBox(-0.04, 0, -0.02, 0.0, legH, 0.02, leg, 0.85);
        addBox(0.04, 0, -0.02, 0.08, legH, 0.02, leg, 0.85);
        // body
        addBox(-0.18, legH, -0.12, 0.18, legH + 0.20, 0.12, body, 1.0);
        // wings
        addBox(-0.28, legH + 0.04, -0.12, -0.18, legH + 0.12, 0.12, hexToRGB('#EFEFEF'), 0.95);
        addBox(0.18, legH + 0.04, -0.12, 0.28, legH + 0.12, 0.12, hexToRGB('#EFEFEF'), 0.95);
        // head + beak
        addBox(0.22, legH + 0.04, -0.04, 0.36, legH + 0.18, 0.04, body, 1.0);
        addBox(0.36, legH + 0.08, -0.02, 0.44, legH + 0.12, 0.02, beak, 1.0);
      } else if (t === 'Horse') {
        const bodyCol = hexToRGB('#A66B2D');
        const mane = hexToRGB('#4B2E1C');
        const legH = 0.55;
        // legs
        addBox(-0.30, 0, -0.12, -0.22, legH, -0.02, hexToRGB('#4A2F1E'), 0.85);
        addBox(0.22, 0, -0.12, 0.30, legH, -0.02, hexToRGB('#4A2F1E'), 0.85);
        addBox(-0.30, 0, 0.02, -0.22, legH, 0.12, hexToRGB('#4A2F1E'), 0.85);
        addBox(0.22, 0, 0.02, 0.30, legH, 0.12, hexToRGB('#4A2F1E'), 0.85);
        // body
        addBox(-0.40, legH, -0.18, 0.40, legH + 0.72, 0.18, bodyCol, 1.0);
        // head
        addBox(0.42, legH + 0.32, -0.06, 0.70, legH + 0.70, 0.06, bodyCol, 1.0);
        // mane
        addBox(0.46, legH + 0.52, -0.08, 0.70, legH + 0.64, 0.08, mane, 0.95);
        // tail
        addBox(-0.48, legH + 0.36, -0.04, -0.56, legH + 0.56, 0.04, mane, 0.9);
      } else if (t === 'Slime') {
        const g = hexToRGB('#57FF57');
        // main cube
        addBox(-0.30, 0, -0.30, 0.30, 0.60, 0.30, g, 0.9);
        // inner highlight
        addBox(-0.18, 0.42, -0.18, 0.18, 0.60, 0.18, hexToRGB('#80FF80'), 1.0);
      } else if (t === 'Spider') {
        const body = hexToRGB('#2E2E2E');
        const legCol = hexToRGB('#222222');
        // body (wide & low)
        addBox(-0.45, 0, -0.32, 0.45, 0.36, 0.32, body, 1.0);
        // head
        addBox(0.48, 0.12, -0.16, 0.74, 0.36, 0.16, body, 1.0);
        // legs (four per side, thin)
        addBox(-0.52, 0.02, -0.30, -0.46, 0.06, -0.20, legCol, 0.85);
        addBox(-0.52, 0.02, -0.10, -0.46, 0.06, 0.0, legCol, 0.85);
        addBox(-0.52, 0.02, 0.10, -0.46, 0.06, 0.20, legCol, 0.85);
        addBox(-0.52, 0.02, 0.30, -0.46, 0.06, 0.40, legCol, 0.85);
        addBox(0.46, 0.02, -0.30, 0.52, 0.06, -0.20, legCol, 0.85);
        addBox(0.46, 0.02, -0.10, 0.52, 0.06, 0.0, legCol, 0.85);
        addBox(0.46, 0.02, 0.10, 0.52, 0.06, 0.20, legCol, 0.85);
        addBox(0.46, 0.02, 0.30, 0.52, 0.06, 0.40, legCol, 0.85);
      } else {
        // fallback: reuse humanoid player mesh for other mob types (zombie/skeleton handled elsewhere)
        this.ensurePlayerMesh(); 
        this.mobMeshes.set(type, { vao: this.playerVAO, vbo: this.playerVBO, ibo: this.playerIBO, indexCount: this.playerIndexCount });
        return;
      }

      if (vc === 0) {
        // nothing built
        return;
      }

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

      this.mobMeshes.set(type, { vao, vbo, ibo, indexCount: idx.length });
    }

    private scaleXYZ(sx: number, sy: number, sz: number): Float32Array {
      return new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, sz, 0,
        0, 0, 0, 1,
      ]);
    }
  

  private ensureWeaponMeshFor(itemId: number): void {
    if (this.weaponMeshes.has(itemId)) return;
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

    // determine colors: head uses material color, handle uses stick colour
    const headHex = ITEM_COLORS[itemId] ?? '#CCCCCC';
    const headCol = hexToRGB(headHex);
    const stickHex = ITEM_COLORS[ItemId.STICK] ?? '#8B6914';
    const stickCol = hexToRGB(stickHex);

    // Build blocky meshes per item type (approximate Minecraft shapes)
    const isSword = (itemId === ItemId.WOODEN_SWORD || itemId === ItemId.STONE_SWORD || itemId === ItemId.IRON_SWORD || itemId === ItemId.DIAMOND_SWORD);
    const isPick = (itemId === ItemId.WOODEN_PICKAXE || itemId === ItemId.STONE_PICKAXE || itemId === ItemId.IRON_PICKAXE || itemId === ItemId.DIAMOND_PICKAXE);
    const isAxe = (itemId === ItemId.WOODEN_AXE || itemId === ItemId.STONE_AXE || itemId === ItemId.IRON_AXE);

    if (isSword) {
      // sword: guard + long thin blade + handle
      addBox(0.18, -0.05, -0.03, 0.62, 0.05, 0.03, [headCol[0], headCol[1], headCol[2]], 1.0); // main blade
      addBox(0.10, -0.06, -0.06, 0.18, 0.06, 0.06, [0.18, 0.18, 0.18], 0.9); // guard
      addBox(-0.20, -0.05, -0.03, 0.10, 0.05, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.9); // handle
    } else if (isPick) {
      // pickaxe: long handle + T-shaped head
      addBox(-0.28, -0.04, -0.03, 0.28, 0.04, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.9); // handle
      // head center
      addBox(0.28, -0.06, -0.16, 0.52, 0.06, 0.16, [headCol[0], headCol[1], headCol[2]], 1.0);
      // left prong
      addBox(0.20, -0.06, -0.16, 0.28, 0.06, -0.02, [headCol[0], headCol[1], headCol[2]], 1.0);
      // right prong
      addBox(0.28, -0.06, 0.02, 0.36, 0.06, 0.16, [headCol[0], headCol[1], headCol[2]], 1.0);
    } else if (isAxe) {
      // axe: handle + blade to one side
      addBox(-0.28, -0.04, -0.03, 0.22, 0.04, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.9); // handle
      addBox(0.20, -0.06, -0.12, 0.54, 0.06, 0.18, [headCol[0], headCol[1], headCol[2]], 1.0); // blade
      addBox(0.06, -0.06, -0.02, 0.20, 0.06, 0.10, [headCol[0], headCol[1], headCol[2]], 1.0); // small connector
    } else {
      // generic small tool
      addBox(0.0, -0.06, -0.02, 0.5, 0.06, 0.02, [headCol[0], headCol[1], headCol[2]], 1.0);
      addBox(-0.08, -0.04, -0.03, 0.04, 0.04, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.9);
    }

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

    this.weaponMeshes.set(itemId, { vao, vbo, ibo, indexCount: idx.length });
  }

  /** Build a highlight wireframe cube for the targeted block */
  private highlightVAO: WebGLVertexArrayObject | null = null;
  private highlightVBO: WebGLBuffer | null = null;

  drawHighlight(wx: number, wy: number, wz: number, mvp: Float32Array, onTop: boolean = false): void {
    const gl = this.gl;
    if (!this.highlightVAO) {
      // Build line box (slightly expanded)
      const e = 0.005;
      const lo = -e, hi = 1 + e;
      const lineVerts = new Float32Array([
        lo, lo, lo, hi, lo, lo, hi, lo, lo, hi, hi, lo,
        hi, hi, lo, lo, hi, lo, lo, hi, lo, lo, lo, lo,
        lo, lo, hi, hi, lo, hi, hi, lo, hi, hi, hi, hi,
        hi, hi, hi, lo, hi, hi, lo, hi, hi, lo, lo, hi,
        lo, lo, lo, lo, lo, hi, hi, lo, lo, hi, lo, hi,
        hi, hi, lo, hi, hi, hi, lo, hi, lo, lo, hi, hi,
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
      // default highlight colour (black)
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
    if (onTop) {
      const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
      if (depthWasEnabled) gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
      gl.bindVertexArray(this.highlightVAO);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.bindVertexArray(null);
      if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(this.uMVP, false, mvp);
    } else {
      gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
      gl.bindVertexArray(this.highlightVAO);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.bindVertexArray(null);
      gl.uniformMatrix4fv(this.uMVP, false, mvp);
    }
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
    // delete weapon meshes
    for (const [, wm] of this.weaponMeshes) {
      if (wm.vbo) gl.deleteBuffer(wm.vbo);
      if (wm.ibo) gl.deleteBuffer(wm.ibo);
      if (wm.vao) gl.deleteVertexArray(wm.vao);
    }
    this.weaponMeshes.clear();
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

  /**
   * Render the local first-person weapon using the existing per-item blocky meshes.
   * This draws the equipped item's `WeaponMesh` anchored to the camera and applies
   * a simple bob + swing transform so it looks like a Minecraft-style held item.
   */
  renderFirstPersonWeapon(itemId: number, camX: number, camY: number, camZ: number, yaw: number, pitch: number, isBobbing: boolean, isSwinging: boolean, swingStartMs: number): void {
    if (!itemId) return;
    this.ensureWeaponMeshFor(itemId);
    const mesh = this.weaponMeshes.get(itemId);
    if (!mesh || !mesh.vao) return;

    const gl = this.gl;
    const aspect = this.width / Math.max(1, this.height);
    const proj = perspectiveMatrix(this.fovDeg * Math.PI / 180, aspect, 0.1, 200);
    // Render the held item in camera (view) space. The weapon model is defined in
    // camera coordinates (right=X, up=Y, forward=-Z), so we multiply projection
    // by the model transform only (no world/view rotation/translation).
    const baseProj = proj;

    // Simple bobbing
    const now = performance.now() / 1000;
    const bob = isBobbing ? Math.sin(now * 6) * 0.02 : 0;

    // Local hand offset (tuned for first-person view)
    const legH = 0.5;
    const torsoH = 0.8;
    // Lower the first-person weapon baseline by 10% so it appears slightly lower in view
    const baseHandY = legH + torsoH - 0.75;
    const handY = baseHandY * 0.9 + bob; // apply bob after scaling
    // reduce horizontal offset and move the model further from the camera so it
    // projects inside the view frustum at typical FOV/aspect values
    const handX = 0.64; // right of camera
    // In view-space forward is -Z; use a negative Z to bring the model in front of the camera
    const handZ = -1.6; // move further away from camera

    // swing animation (time-based eased progress)
    let swingRot = 0;
    let swingTx = 0, swingTy = 0;
    if (isSwinging && swingStartMs) {
      const dur = 380; // ms
      const elapsed = Math.max(0, performance.now() - swingStartMs);
      const t = Math.min(1, elapsed / dur);
      // simple ease-out curve
      const p = 1 - Math.pow(1 - t, 3);
      // rotate around Z for a slashing feel and translate slightly
      swingRot = Math.sin(p * Math.PI) * 2.0; // radians
      swingTx = -0.18 * Math.sin(p * Math.PI);
      swingTy = -0.06 * Math.sin(p * Math.PI);
    }

    // Build model transform in camera (view) space.
    // Apply a base rotation so weapons (modeled along +X) appear right-side-up
    // in first-person (blade/handle aligned vertically instead of lying on their side).
    const H = translationMatrix(handX + swingTx, handY + swingTy, handZ);
    const Rz = rotationZMatrix(swingRot);
    const S = scaleMatrix(1.2); // make weapon slightly larger for first-person
    // rotate model by +90deg around view-forward (Z) so +X model axis maps to +Y (up)
    const baseRot = rotationZMatrix(Math.PI / 2);
    const model = multiplyMat4(H, multiplyMat4(baseRot, multiplyMat4(Rz, S)));
    const finalMVP = multiplyMat4(baseProj, model);

    // Render on top of the world (draw last). Temporarily disable depth test so held item is always visible.
    const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthWasEnabled) gl.disable(gl.DEPTH_TEST);

    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
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

function rotationYMatrix(theta: number): Float32Array {
  const c = Math.cos(theta), s = Math.sin(theta);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotationZMatrix(theta: number): Float32Array {
  const c = Math.cos(theta), s = Math.sin(theta);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function scaleMatrix(s: number): Float32Array {
  return new Float32Array([
    s, 0, 0, 0,
    0, s, 0, 0,
    0, 0, s, 0,
    0, 0, 0, 1,
  ]);
}

function hexToRGB(hex: string): [number, number, number] {
  // expect formats like '#RRGGBB' or '#RGB'
  if (!hex || hex[0] !== '#') return [1, 1, 1];
  if (hex.length === 4) {
    const r = parseInt(hex[1] + hex[1], 16);
    const g = parseInt(hex[2] + hex[2], 16);
    const b = parseInt(hex[3] + hex[3], 16);
    return [r / 255, g / 255, b / 255];
  }
  if (hex.length === 7) {
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return [r / 255, g / 255, b / 255];
  }
  return [1, 1, 1];
}

/** getFrustumMVP for highlight and player drawing */
export function buildMVP(camX: number, camY: number, camZ: number, yaw: number, pitch: number, aspect: number, fovDeg = 70): Float32Array {
  const proj = perspectiveMatrix(fovDeg * Math.PI / 180, aspect, 0.1, 200);
  const view = lookAtFPS(camX, camY, camZ, yaw, pitch);
  return multiplyMat4(proj, view);
}

