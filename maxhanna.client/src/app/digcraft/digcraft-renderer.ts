/**
 * WebGL chunk-based block renderer.
 * Renders visible faces only, one draw call per chunk mesh.
 */
import {
  BlockId, BLOCK_COLORS, BlockColor, CHUNK_SIZE, WORLD_HEIGHT,
  RENDER_DISTANCE, DCPlayer, ITEM_COLORS, ItemId
} from './digcraft-types';
import { Chunk } from './digcraft-world';
import { BiomeId } from './digcraft-biome';

// ──── Shader sources ────
const VS = `
  attribute vec3 aPos;
  attribute vec3 aColor;
  attribute float aBrightness;
  attribute float aAlpha;
  uniform mat4 uMVP;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vFog;
  varying float vAlpha;
  void main() {
    vColor = aColor * aBrightness * uTint;
    vAlpha = aAlpha;
    gl_Position = uMVP * vec4(aPos, 1.0);
    vFog = clamp(gl_Position.z / 120.0, 0.0, 1.0);
  }
`;

const FS = `
  precision mediump float;
  varying vec3 vColor;
  varying float vFog;
  varying float vAlpha;
  uniform vec3 uFogColor;
  void main() {
    vec3 c = mix(vColor, uFogColor, vFog * vFog);
    gl_FragColor = vec4(c, vAlpha);
  }
`;

// Text shader for rendering name tags
const VS_TEXT = `
  attribute vec3 aPos;
  attribute vec2 aTexCoord;
  uniform mat4 uMVP;
  varying vec2 vTexCoord;
  void main() {
    vTexCoord = aTexCoord;
    gl_Position = uMVP * vec4(aPos, 1.0);
  }
`;

const FS_TEXT = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  uniform vec3 uTint;
  void main() {
    vec4 c = texture2D(uTexture, vTexCoord);
    if (c.a < 0.1) discard;
    gl_FragColor = vec4(uTint * c.rgb, c.a);
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
  /** Transparent water (second draw pass) */
  waterVao?: WebGLVertexArrayObject | null;
  waterVbo?: WebGLBuffer | null;
  waterIbo?: WebGLBuffer | null;
  waterIndexCount?: number;
  /** Transparent lava (second draw pass) */
  lavaVao?: WebGLVertexArrayObject | null;
  lavaVbo?: WebGLBuffer | null;
  lavaIbo?: WebGLBuffer | null;
  lavaIndexCount?: number;
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
  // Text shader for name tags
  textProgram: WebGLProgram;
  uMVPText: WebGLUniformLocation;
  uTintText: WebGLUniformLocation;
  uTexture: WebGLUniformLocation;
  private _playerPillarLogOnce = false;
  meshes: Map<string, ChunkMesh> = new Map();
  /** Nether chunk meshes — keyed "nether:cx,cz" to avoid colliding with overworld */
  netherMeshes: Map<string, ChunkMesh> = new Map();
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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

    // Compile text shader for name tags
    const vsText = this.compileShader(gl.VERTEX_SHADER, VS_TEXT);
    const fsText = this.compileShader(gl.FRAGMENT_SHADER, FS_TEXT);
    this.textProgram = gl.createProgram()!;
    gl.attachShader(this.textProgram, vsText);
    gl.attachShader(this.textProgram, fsText);
    gl.linkProgram(this.textProgram);
    this.textProgram = this.textProgram;
    this.uMVPText = gl.getUniformLocation(this.textProgram, 'uMVP')!;
    this.uTintText = gl.getUniformLocation(this.textProgram, 'uTint')!;
    this.uTexture = gl.getUniformLocation(this.textProgram, 'uTexture')!;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  /** Build a chunk mesh from block data, including cross-chunk neighbor lookups. */
  buildChunkMesh(
    chunk: Chunk,
    getNeighborBlock: (wx: number, wy: number, wz: number) => number
  ): void {
    const key = `${chunk.cx},${chunk.cz}`;
    const old = this.meshes.get(key);
    if (old) {
      if (old.vbo) this.gl.deleteBuffer(old.vbo);
      if (old.ibo) this.gl.deleteBuffer(old.ibo);
      if (old.vao) this.gl.deleteVertexArray(old.vao);
      if (old.waterVbo) this.gl.deleteBuffer(old.waterVbo);
      if (old.waterIbo) this.gl.deleteBuffer(old.waterIbo);
      if (old.waterVao) this.gl.deleteVertexArray(old.waterVao);
      if (old.lavaVbo) this.gl.deleteBuffer(old.lavaVbo);
      if (old.lavaIbo) this.gl.deleteBuffer(old.lavaIbo);
      if (old.lavaVao) this.gl.deleteVertexArray(old.lavaVao);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const brightness: number[] = [];
    const alphas: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    // Helper: determine leaf tint + base blend amount from biome id
    const getLeafTint = (biome: number): { tint: { r: number; g: number; b: number } | null; blend: number } => {
      switch (biome) {
        // Super-hot: strong yellowing (desert-like)
        case BiomeId.DESERT:
        case BiomeId.BADLANDS:
        case BiomeId.WOODED_BADLANDS:
        case BiomeId.ERODED_BADLANDS:
        case BiomeId.SAVANNA:
        case BiomeId.SAVANNA_PLATEAU:
        case BiomeId.WINDSWEPT_SAVANNA:
          return { tint: { r: 1.0, g: 0.92, b: 0.22 }, blend: 0.82 };
        // Hot: some yellowing / browning
        case BiomeId.JUNGLE:
        case BiomeId.BAMBOO_JUNGLE:
        case BiomeId.SPARSE_JUNGLE:
        case BiomeId.MEADOW:
        case BiomeId.FLOWER_FOREST:
        case BiomeId.CHERRY_GROVE:
        case BiomeId.SWAMP:
        case BiomeId.MANGROVE_SWAMP:
          return { tint: { r: 1.0, g: 0.83, b: 0.34 }, blend: 0.42 };
        // Cold / snowy: tint toward white (snow on leaves)
        case BiomeId.SNOWY_PLAINS:
        case BiomeId.ICE_PLAINS:
        case BiomeId.ICE_SPIKE_PLAINS:
        case BiomeId.SNOWY_BEACH:
        case BiomeId.FROZEN_PEAKS:
        case BiomeId.SNOWY_SLOPES:
        case BiomeId.SNOWY_TAIGA:
        case BiomeId.JAGGED_PEAKS:
          return { tint: { r: 1.0, g: 1.0, b: 1.0 }, blend: 0.72 };
        default:
          return { tint: null, blend: 0 };
      }
    };

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (blockId === BlockId.AIR || blockId === BlockId.WATER || blockId === BlockId.LAVA || blockId === BlockId.WINDOW_OPEN || blockId === BlockId.DOOR_OPEN) continue;

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
            if (neighbor !== BlockId.AIR && neighbor !== BlockId.WATER && neighbor !== BlockId.LAVA && neighbor !== BlockId.LEAVES && neighbor !== BlockId.GLASS && neighbor !== BlockId.WINDOW_OPEN && neighbor !== BlockId.DOOR_OPEN && neighbor !== BlockId.TALLGRASS && neighbor !== BlockId.BONFIRE && neighbor !== BlockId.CHEST) continue;

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
                  alphas.push(1.0);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
                rectIndex++;
              }
              continue; // next face
            }

            // Special-case: LEAVES should render as a grid of small squares with varying greens
            if (blockId === BlockId.LEAVES) {
              const gridSize = 2; // 2x2 = 4 squares per face
              const cellSize = 1 / gridSize;
              const baseColor = bc;
              const biome = chunk.getBiome(x, z);
              const lt = getLeafTint(biome);

              const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
              const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
              const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
              const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
              const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
              const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
              const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

              for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                  const u0 = gx * cellSize;
                  const v0 = gy * cellSize;
                  const u1 = u0 + cellSize;
                  const v1 = v0 + cellSize;

                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

                  const isTransparent = false;
                  const shade = 0.7 + rnd * 0.5;

                  // per-cell tint blend (adds per-cell variation)
                  const baseBlend = lt.blend || 0;
                  const cellBlend = lt.tint ? Math.min(1, baseBlend * (0.6 + rnd * 0.8)) : 0;
                  const mixedR = lt.tint ? (baseColor.r * (1 - cellBlend) + lt.tint.r * cellBlend) : baseColor.r;
                  const mixedG = lt.tint ? (baseColor.g * (1 - cellBlend) + lt.tint.g * cellBlend) : baseColor.g;
                  const mixedB = lt.tint ? (baseColor.b * (1 - cellBlend) + lt.tint.b * cellBlend) : baseColor.b;

                  const cr = mixedR * shade;
                  const cg = mixedG * shade;
                  const cb = mixedB * shade;
                  const alpha = isTransparent ? 0.0 : 1.0;
                  const brightMult = isTransparent ? 0.3 : 1.0;

                  const verts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0, c0[1] + edgeU[1] * u0 + edgeV[1] * v0, c0[2] + edgeU[2] * u0 + edgeV[2] * v0],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0, c0[1] + edgeU[1] * u1 + edgeV[1] * v0, c0[2] + edgeU[2] * u1 + edgeV[2] * v0],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1, c0[1] + edgeU[1] * u1 + edgeV[1] * v1, c0[2] + edgeU[2] * u1 + edgeV[2] * v1],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1, c0[1] + edgeU[1] * u0 + edgeV[1] * v1, c0[2] + edgeU[2] * u0 + edgeV[2] * v1],
                  ];

                  for (let vi = 0; vi < 4; vi++) {
                    const pv = verts[vi];
                    positions.push(pv[0], pv[1], pv[2]);
                    const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                    const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                    const vshade = 0.85 + vrnd * 0.2;
                    colors.push(cr * vshade, cg * vshade, cb * vshade);
                    brightness.push(face.brightness * (0.85 + vrnd * 0.15) * brightMult);
                    alphas.push(alpha);
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                }
              }
              continue; // next face
            }

            // Special-case: SHRUB and TREE render as mini trees (wood trunk + leaves canopy)
            if (blockId === BlockId.SHRUB || blockId === BlockId.TREE) {
              const trunkColor = BLOCK_COLORS[BlockId.WOOD] ?? { r: .45, g: .30, b: .15 };
              const leafColor = bc;
              const leafBiome = chunk.getBiome(x, z);
              const leafTint = getLeafTint(leafBiome);
              const trunkHeight = blockId === BlockId.SHRUB ? 0.3 : 0.6;

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const isTopFace = fi === 0;
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                let neighbor: number;
                if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
                  neighbor = chunk.getBlock(nx, ny, nz);
                } else {
                  neighbor = getNeighborBlock(ox + nx, ny, oz + nz);
                }

                const isTransparent = neighbor === BlockId.AIR || neighbor === BlockId.LEAVES || neighbor === BlockId.WATER || neighbor === BlockId.SHRUB || neighbor === BlockId.TREE || neighbor === BlockId.TALLGRASS || neighbor === BlockId.BONFIRE || neighbor === BlockId.CHEST;
                if (!isTransparent) continue;

                const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
                const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
                const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
                const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
                const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
                const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
                const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

                // Grid-based rendering: 2x2 for leaves, 3x1 for wood bark texture
                const gridSizeY = isTopFace ? 2 : 1;
                const gridSizeX = (blockId === BlockId.SHRUB) ? 2 : (isTopFace ? 2 : 3);
                const cellSizeX = 1 / gridSizeX;
                const cellSizeY = 1 / gridSizeY;

                for (let gy = 0; gy < gridSizeY; gy++) {
                  for (let gx = 0; gx < gridSizeX; gx++) {
                    const u0 = gx * cellSizeX;
                    const v0 = gy * cellSizeY;
                    const u1 = u0 + cellSizeX;
                    const v1 = v0 + cellSizeY;

                    const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                    const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

                    // Determine if this cell is trunk or leaves based on UV center
                    const cellCenterU = (u0 + u1) / 2;
                    const cellCenterV = (v0 + v1) / 2;
                    const cellCenterY = c0[1] + edgeU[1] * cellCenterU + edgeV[1] * cellCenterV;
                    const isCellTrunk = cellCenterY <= trunkHeight;

                    let cr: number, cg: number, cb: number, br = face.brightness;

                    if (isCellTrunk) {
                      // Wood bark texture: darker strips with variation
                      // Create bark-like pattern: alternating light/dark strips
                      const barkVariation = (gx % 2 === 0) ? 0.85 : 1.0;
                      const shade = barkVariation + (rnd - 0.5) * 0.15;
                      cr = trunkColor.r * shade;
                      cg = trunkColor.g * shade;
                      cb = trunkColor.b * shade;
                      br *= 0.9;
                    } else {
                      // Leaves texture: varied green with slight transparency
                      const shade = 0.75 + rnd * 0.4;
                      const baseBlend = leafTint.blend || 0;
                      const cellBlend = leafTint.tint ? Math.min(1, baseBlend * (0.6 + rnd * 0.8)) : 0;
                      const mixedR = leafTint.tint ? (leafColor.r * (1 - cellBlend) + leafTint.tint.r * cellBlend) : leafColor.r;
                      const mixedG = leafTint.tint ? (leafColor.g * (1 - cellBlend) + leafTint.tint.g * cellBlend) : leafColor.g;
                      const mixedB = leafTint.tint ? (leafColor.b * (1 - cellBlend) + leafTint.tint.b * cellBlend) : leafColor.b;
                      cr = mixedR * shade;
                      cg = mixedG * shade;
                      cb = mixedB * shade;
                      br *= 0.85;
                    }

                    const verts = [
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * v0, c0[1] + edgeU[1] * u0 + edgeV[1] * v0, c0[2] + edgeU[2] * u0 + edgeV[2] * v0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * v0, c0[1] + edgeU[1] * u1 + edgeV[1] * v0, c0[2] + edgeU[2] * u1 + edgeV[2] * v0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * v1, c0[1] + edgeU[1] * u1 + edgeV[1] * v1, c0[2] + edgeU[2] * u1 + edgeV[2] * v1],
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * v1, c0[1] + edgeU[1] * u0 + edgeV[1] * v1, c0[2] + edgeU[2] * u0 + edgeV[2] * v1],
                    ];

                    for (let vi = 0; vi < 4; vi++) {
                      const pv = verts[vi];
                      positions.push(pv[0], pv[1], pv[2]);
                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                      const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const vshade = 0.9 + vrnd * 0.15;
                      colors.push(cr * vshade, cg * vshade, cb * vshade);
                      brightness.push(br * (0.85 + vrnd * 0.2));
                      alphas.push(1.0);
                    }
                    indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                    vertCount += 4;
                  }
                }
              }
              continue;
            }

            // Special-case: TALLGRASS renders as vertical strands (like Minecraft tall grass)
            if (blockId === BlockId.TALLGRASS) {
              const baseColor = bc;
              // Tall grass has multiple vertical blade strands with varying heights
              const numStrands = 20;

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                let neighbor: number;
                if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
                  neighbor = chunk.getBlock(nx, ny, nz);
                } else {
                  neighbor = getNeighborBlock(ox + nx, ny, oz + nz);
                }

                // Only render if neighbor is transparent (air, leaves, water)
                const isTransparent = neighbor === BlockId.AIR || neighbor === BlockId.LEAVES || neighbor === BlockId.WATER || neighbor === BlockId.TALLGRASS || neighbor === BlockId.BONFIRE || neighbor === BlockId.CHEST;
                if (!isTransparent) continue;

                for (let strand = 0; strand < numStrands; strand++) {
                  // Each strand has unique seed for variation
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (strand * 12345) ^ (fi * 789)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

                  // Variable strand properties
                  const strandWidth = 0.10 + rnd * 0.08; // 0.10 to 0.18 (thicker)
                  const strandHeight = 0.15 + rnd * 0.1;  // 0.15 to 0.25 (half height)
                  const numSegments = 2 + Math.floor(rnd * 2); // 2-3 segments per strand

                  // Random rotation for this strand (0 to 2*PI)
                  const rotation = rnd * Math.PI * 2;
                  const cosR = Math.cos(rotation);
                  const sinR = Math.sin(rotation);

                  // Offset this strand within the block (spread across block area)
                  const offsetX = (rnd - 0.5) * 0.5;

                  // Random lean direction - each segment leans differently
                  const baseLeanX = (rnd - 0.5) * 0.12;
                  const baseLeanZ = ((((seed * 34567890 + 12345) >>> 0) % 1000) / 1000 - 0.5) * 0.12;

                  const centerX = ox + x;
                  const centerZ = oz + z;
                  const baseY = y;

                  // Helper to rotate a point around center
                  const rotatePoint = (px: number, pz: number): [number, number] => {
                    const dx = px - centerX;
                    const dz = pz - centerZ;
                    return [centerX + dx * cosR - dz * sinR, centerZ + dx * sinR + dz * cosR];
                  };

                  // Build strand from multiple segments (like pixelated grass)
                  for (let seg = 0; seg < numSegments; seg++) {
                    const segSeed = (seed + seg * 11111) >>> 0;
                    const segRnd = (((segSeed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

                    // Segment height varies
                    const segHeightRatio = (seg + 1) / numSegments;
                    const segTopY = baseY + strandHeight * segHeightRatio;
                    const segBottomY = baseY + strandHeight * (seg / numSegments);

                    // Each segment leans a bit more than the previous
                    const segLeanX = baseLeanX * segHeightRatio;
                    const segLeanZ = baseLeanZ * segHeightRatio;

                    const halfW = strandWidth / 2;

                    // Local coordinates relative to center, then rotate
                    const lx1 = offsetX - halfW;
                    const lx2 = offsetX + halfW;
                    const lzBottom = segLeanZ;
                    const lzTop = segLeanX + segLeanZ;

                    // Rotate each corner
                    const [c1x, c1z] = rotatePoint(centerX + lx1, centerZ + lzBottom);
                    const [c2x, c2z] = rotatePoint(centerX + lx2, centerZ + lzBottom);
                    const [c3x, c3z] = rotatePoint(centerX + lx2, centerZ + lzTop);
                    const [c4x, c4z] = rotatePoint(centerX + lx1, centerZ + lzTop);

                    // 4 corners of the segment quad
                    const verts = [
                      [c1x, segBottomY, c1z],
                      [c2x, segBottomY, c2z],
                      [c3x, segTopY, c3z],
                      [c4x, segTopY, c4z],
                    ];

                    // Vary green per segment - lighter at top
                    const shadeBase = 0.65 + segRnd * 0.25;
                    const shadeTop = shadeBase * 1.15;
                    const cr = baseColor.r * shadeBase;
                    const cg = baseColor.g * shadeBase;
                    const cb = baseColor.b * shadeBase;
                    const crTop = baseColor.r * shadeTop;
                    const cgTop = baseColor.g * shadeTop;
                    const cbTop = baseColor.b * shadeTop;

                    // Push vertices with color variation top vs bottom
                    const colorsThis = [
                      [cr, cg, cb],
                      [cr, cg, cb],
                      [crTop, cgTop, cbTop],
                      [crTop, cgTop, cbTop],
                    ];

                    for (let vi = 0; vi < 4; vi++) {
                      const pv = verts[vi];
                      positions.push(pv[0], pv[1], pv[2]);

                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (strand * 97 + seg * 31 + vi * 17)) >>> 0);
                      const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const vshade = 0.85 + vrnd * 0.2;
                      colors.push(colorsThis[vi][0] * vshade, colorsThis[vi][1] * vshade, colorsThis[vi][2] * vshade);
                      brightness.push(face.brightness * (0.8 + vrnd * 0.25));
                      alphas.push(1.0);
                    }
                    indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                    vertCount += 4;
                  }
                }
              }
              continue;
            }

            // Special-case: BONFIRE renders as a campfire with animated fire effect
            if (blockId === BlockId.BONFIRE) {
              const baseColor = bc;
              const time = performance.now() / 1000;

              // Base logs (dark brown rectangle at bottom)
              const logHeight = 0.15;

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                let neighbor: number;
                if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
                  neighbor = chunk.getBlock(nx, ny, nz);
                } else {
                  neighbor = getNeighborBlock(ox + nx, ny, oz + nz);
                }

                const isTransparent = neighbor === BlockId.AIR || neighbor === BlockId.LEAVES || neighbor === BlockId.WATER || neighbor === BlockId.BONFIRE || neighbor === BlockId.CHEST;
                if (!isTransparent && fi !== 0) continue; // Only show bottom face when adjacent to solid

                const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];

                // Draw logs (brown base)
                const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
                const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
                const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
                const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
                const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
                const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

                // Log color (dark brown)
                const logColor = { r: 0.25, g: 0.15, b: 0.08 };

                const verts = [
                  [c0[0], c0[1], c0[2]],
                  [c1[0], c1[1], c1[2]],
                  [c2[0], c2[1], c2[2]],
                  [c3[0], c3[1], c3[2]],
                ];

                for (let vi = 0; vi < 4; vi++) {
                  const pv = verts[vi];
                  positions.push(pv[0], pv[1], pv[2]);
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ vi) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const jitter = 0.9 + rnd * 0.15;
                  colors.push(logColor.r * jitter, logColor.g * jitter, logColor.b * jitter);
                  brightness.push(face.brightness * 0.7);
                  alphas.push(1.0);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }

              // Fire effect - animated flickering flames
              const numFlames = 6;
              const baseFlameY = y + logHeight;
              const flameMaxHeight = 0.5;

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                if (face.dir[1] > 0) continue; // Don't render on top face

                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                let neighbor: number;
                if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
                  neighbor = chunk.getBlock(nx, ny, nz);
                } else {
                  neighbor = getNeighborBlock(ox + nx, ny, oz + nz);
                }

                const isTransparent = neighbor === BlockId.AIR || neighbor === BlockId.LEAVES || neighbor === BlockId.WATER;
                if (!isTransparent) continue;

                for (let f = 0; f < numFlames; f++) {
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (f * 4567) ^ (fi * 123)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

                  // Random position within block
                  const offsetX = (rnd - 0.5) * 0.5;
                  const offsetZ = ((((seed * 23456789 + 12345) >>> 0) % 1000) / 1000 - 0.5) * 0.5;

                  // Animated flame height with flickering
                  const flickerPhase = time * 8 + f * 1.5;
                  const flicker = 0.7 + Math.sin(flickerPhase) * 0.3;
                  const flameHeight = (rnd * 0.5 + 0.3) * flameMaxHeight * flicker;
                  const flameWidth = 0.08 + rnd * 0.06;

                  const bx = ox + x + offsetX;
                  const bz = oz + z + offsetZ;
                  const baseY = baseFlameY;
                  const topY = baseFlameY + flameHeight;

                  // Fire colors - orange/yellow/red gradient
                  const fireBase = { r: 1.0, g: 0.3 + rnd * 0.2, b: 0.0 };
                  const fireTop = { r: 1.0, g: 0.6 + rnd * 0.3, b: 0.0 };

                  const halfW = flameWidth / 2;

                  const verts = [
                    [bx - halfW, baseY, bz],
                    [bx + halfW, baseY, bz],
                    [bx + halfW, topY, bz],
                    [bx - halfW, topY, bz],
                  ];

                  const colorsThis = [
                    [fireBase.r, fireBase.g, fireBase.b],
                    [fireBase.r, fireBase.g, fireBase.b],
                    [fireTop.r, fireTop.g, fireTop.b],
                    [fireTop.r, fireTop.g, fireTop.b],
                  ];

                  for (let vi = 0; vi < 4; vi++) {
                    const pv = verts[vi];
                    positions.push(pv[0], pv[1], pv[2]);

                    const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (f * 97 + vi * 31)) >>> 0);
                    const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                    const vshade = 0.85 + vrnd * 0.2;
                    colors.push(colorsThis[vi][0] * vshade, colorsThis[vi][1] * vshade, colorsThis[vi][2] * vshade);
                    brightness.push(face.brightness * (1.2 + vrnd * 0.3)); // Extra bright for fire
                    alphas.push(1.0);
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                }
              }
              continue;
            }

            // Special-case: CHEST renders as a brown box with darker top
            if (blockId === BlockId.CHEST) {
              const chestBaseColor = [0.545, 0.271, 0.075]; // Brown
              const chestTopColor = [0.4, 0.2, 0.05]; // Darker brown for top

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                let neighbor: number;
                if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
                  neighbor = chunk.getBlock(nx, ny, nz);
                } else {
                  neighbor = getNeighborBlock(ox + nx, ny, oz + nz);
                }

                const isTransparent = neighbor === BlockId.AIR || neighbor === BlockId.LEAVES || neighbor === BlockId.WATER || neighbor === BlockId.CHEST;
                if (!isTransparent && fi !== 0) continue; // Only show bottom face when adjacent to solid

                const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
                const isTopFace = fi === 0;

                // Box vertices
                const verts = [
                  [ox + x + v0[0], y + v0[1], oz + z + v0[2]],
                  [ox + x + v1[0], y + v1[1], oz + z + v1[2]],
                  [ox + x + v2[0], y + v2[1], oz + z + v2[2]],
                  [ox + x + v3[0], y + v3[1], oz + z + v3[2]]
                ];

                const baseColor = isTopFace ? chestTopColor : chestBaseColor;
                const rnd = (((((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                const shade = 0.9 + rnd * 0.2;

                for (let vi = 0; vi < 4; vi++) {
                  const pv = verts[vi];
                  positions.push(pv[0], pv[1], pv[2]);
                  colors.push(baseColor[0] * shade, baseColor[1] * shade, baseColor[2] * shade);
                  brightness.push(face.brightness);
                  alphas.push(1.0);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }
              continue;
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
              alphas.push(1.0);
            }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
            vertCount += 4;
          }
        }
      }
    }

    // ─── Water mesh (Minecraft-style: tinted, alpha-blended, surface height from level 1–8) ───
    const wPos: number[] = [];
    const wCol: number[] = [];
    const wBright: number[] = [];
    const wAlpha: number[] = [];
    const wIndices: number[] = [];
    let wVertCount = 0;
    const wc = BLOCK_COLORS[BlockId.WATER] ?? { r: 0.2, g: 0.45, b: 0.78, a: 0.55 };

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.getBlock(x, y, z) !== BlockId.WATER) continue;
          const lvl = Math.max(1, Math.min(8, chunk.getWaterLevel(x, y, z) || 8));
          const h = 0.125 + (lvl / 8) * 0.875;

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            let nb: number;
            if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
              nb = chunk.getBlock(nx, ny, nz);
            } else {
              nb = getNeighborBlock(ox + nx, ny, oz + nz);
            }
            if (nb === BlockId.WATER) continue;

            const pushVert = (lx: number, ly: number, lz: number, br: number, alpha: number): void => {
              const wx = ox + x + lx;
              const wy = y + ly;
              const wz = oz + z + lz;
              wPos.push(wx, wy, wz);
              const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
              const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
              const jitter = 0.94 + rnd * 0.1;
              wCol.push(wc.r * jitter, wc.g * jitter, wc.b * jitter);
              wBright.push(br * (0.92 + rnd * 0.08));
              wAlpha.push(alpha);
            };

            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              const ly = v[1] >= 0.99 ? h : v[1];
              pushVert(v[0], ly, v[2], face.brightness, fi === 0 ? 0.52 : 0.42);
            }
            wIndices.push(wVertCount, wVertCount + 1, wVertCount + 2, wVertCount, wVertCount + 2, wVertCount + 3);
            wVertCount += 4;
          }
        }
      }
    }

    // ─── Lava mesh (similar to water but brighter and warmer tint) ───
    const lPos: number[] = [];
    const lCol: number[] = [];
    const lBright: number[] = [];
    const lAlpha: number[] = [];
    const lIndices: number[] = [];
    let lVertCount = 0;
    const lc = BLOCK_COLORS[BlockId.LAVA] ?? { r: 1.0, g: 0.45, b: 0.05, a: 0.92 };

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.getBlock(x, y, z) !== BlockId.LAVA) continue;
          const h = 1.0; // full block height for lava surface

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            let nb: number;
            if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
              nb = chunk.getBlock(nx, ny, nz);
            } else {
              nb = getNeighborBlock(ox + nx, ny, oz + nz);
            }
            if (nb === BlockId.LAVA) continue;

            const pushVertL = (lx: number, ly: number, lz: number, br: number, alpha: number): void => {
              const wx = ox + x + lx;
              const wy = y + ly;
              const wz = oz + z + lz;
              lPos.push(wx, wy, wz);
              const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
              const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
              const jitter = 0.95 + rnd * 0.1;
              lCol.push(lc.r * jitter, lc.g * jitter, lc.b * jitter);
              lBright.push(br * (1.0 + rnd * 0.12));
              lAlpha.push(alpha);
            };

            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              const ly = v[1] >= 0.99 ? h : v[1];
              pushVertL(v[0], ly, v[2], face.brightness, fi === 0 ? 0.78 : 0.62);
            }
            lIndices.push(lVertCount, lVertCount + 1, lVertCount + 2, lVertCount, lVertCount + 2, lVertCount + 3);
            lVertCount += 4;
          }
        }
      }
    }

    if (vertCount === 0 && wVertCount === 0 && lVertCount === 0) {
      this.meshes.set(key, { vao: null, vbo: null, ibo: null, indexCount: 0, cx: chunk.cx, cz: chunk.cz, waterVao: null, waterVbo: null, waterIbo: null, waterIndexCount: 0, lavaVao: null, lavaVbo: null, lavaIbo: null, lavaIndexCount: 0 });
      return;
    }

    const gl = this.gl;
    const stride = 8; // 3 pos + 3 color + 1 brightness + 1 alpha
    const bpe = Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aColor = gl.getAttribLocation(this.program, 'aColor');
    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');

    let vao: WebGLVertexArrayObject | null = null;
    let vbo: WebGLBuffer | null = null;
    let ibo: WebGLBuffer | null = null;
    let indexCount = 0;

    if (vertCount > 0) {
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
        vData[o + 7] = alphas[i];
      }

      const iData = new Uint32Array(indices);
      indexCount = indices.length;

      vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);

      vbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vData, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);

      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);

      gl.enableVertexAttribArray(aBright);
      gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);

      if (aAlpha >= 0) {
        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe);
      }

      ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iData, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }

    let waterVao: WebGLVertexArrayObject | null = null;
    let waterVbo: WebGLBuffer | null = null;
    let waterIbo: WebGLBuffer | null = null;
    let waterIndexCount = 0;

    if (wVertCount > 0) {
      const wData = new Float32Array(wVertCount * stride);
      for (let i = 0; i < wVertCount; i++) {
        const o = i * stride;
        wData[o] = wPos[i * 3];
        wData[o + 1] = wPos[i * 3 + 1];
        wData[o + 2] = wPos[i * 3 + 2];
        wData[o + 3] = wCol[i * 3];
        wData[o + 4] = wCol[i * 3 + 1];
        wData[o + 5] = wCol[i * 3 + 2];
        wData[o + 6] = wBright[i];
        wData[o + 7] = wAlpha[i];
      }
      const wiData = new Uint32Array(wIndices);
      waterIndexCount = wIndices.length;

      waterVao = gl.createVertexArray()!;
      gl.bindVertexArray(waterVao);

      waterVbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, waterVbo);
      gl.bufferData(gl.ARRAY_BUFFER, wData, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);

      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);

      gl.enableVertexAttribArray(aBright);
      gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);

      if (aAlpha >= 0) {
        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe);
      }

      waterIbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, waterIbo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wiData, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }

    let lavaVao: WebGLVertexArrayObject | null = null;
    let lavaVbo: WebGLBuffer | null = null;
    let lavaIbo: WebGLBuffer | null = null;
    let lavaIndexCount = 0;

    if (lVertCount > 0) {
      const lData = new Float32Array(lVertCount * stride);
      for (let i = 0; i < lVertCount; i++) {
        const o = i * stride;
        lData[o] = lPos[i * 3];
        lData[o + 1] = lPos[i * 3 + 1];
        lData[o + 2] = lPos[i * 3 + 2];
        lData[o + 3] = lCol[i * 3];
        lData[o + 4] = lCol[i * 3 + 1];
        lData[o + 5] = lCol[i * 3 + 2];
        lData[o + 6] = lBright[i];
        lData[o + 7] = lAlpha[i];
      }
      const liData = new Uint32Array(lIndices);
      lavaIndexCount = lIndices.length;

      lavaVao = gl.createVertexArray()!;
      gl.bindVertexArray(lavaVao);

      lavaVbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, lavaVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lData, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);

      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);

      gl.enableVertexAttribArray(aBright);
      gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);

      if (aAlpha >= 0) {
        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe);
      }

      lavaIbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lavaIbo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, liData, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }

    this.meshes.set(key, {
      vao, vbo, ibo, indexCount, cx: chunk.cx, cz: chunk.cz,
      waterVao, waterVbo, waterIbo, waterIndexCount,
      lavaVao, lavaVbo, lavaIbo, lavaIndexCount
    });
  }

  /**
   * Rebuild ONLY the water and lava transparent meshes for a chunk, leaving
   * the opaque mesh untouched. ~10-20x cheaper than a full buildChunkMesh
   * because it skips the entire opaque block pass.
   */
  buildFluidMeshOnly(
    chunk: Chunk,
    getNeighborBlock: (wx: number, wy: number, wz: number) => number
  ): void {
    const key = `${chunk.cx},${chunk.cz}`;
    const existing = this.meshes.get(key);
    if (!existing) {
      // No opaque mesh yet — do a full build
      this.buildChunkMesh(chunk, getNeighborBlock);
      return;
    }

    // Free old fluid buffers only
    const gl = this.gl;
    if (existing.waterVbo) gl.deleteBuffer(existing.waterVbo);
    if (existing.waterIbo) gl.deleteBuffer(existing.waterIbo);
    if (existing.waterVao) gl.deleteVertexArray(existing.waterVao);
    if (existing.lavaVbo) gl.deleteBuffer(existing.lavaVbo);
    if (existing.lavaIbo) gl.deleteBuffer(existing.lavaIbo);
    if (existing.lavaVao) gl.deleteVertexArray(existing.lavaVao);

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const stride = 8;
    const bpe = Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aColor = gl.getAttribLocation(this.program, 'aColor');
    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');

    // ── Water ──
    const wPos: number[] = [], wCol: number[] = [], wBright: number[] = [], wAlpha: number[] = [], wIdx: number[] = [];
    let wVc = 0;
    const wc = BLOCK_COLORS[BlockId.WATER] ?? { r: 0.2, g: 0.45, b: 0.78, a: 0.55 };

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.getBlock(x, y, z) !== BlockId.WATER) continue;
          const lvl = Math.max(1, Math.min(8, chunk.getWaterLevel(x, y, z) || 8));
          const h = 0.125 + (lvl / 8) * 0.875;
          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const nb = (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE)
              ? chunk.getBlock(nx, ny, nz) : getNeighborBlock(ox + nx, ny, oz + nz);
            if (nb === BlockId.WATER) continue;
            const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
            const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const jitter = 0.94 + rnd * 0.1;
            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              wPos.push(ox + x + v[0], y + (v[1] >= 0.99 ? h : v[1]), oz + z + v[2]);
              wCol.push(wc.r * jitter, wc.g * jitter, wc.b * jitter);
              wBright.push(face.brightness * (0.92 + rnd * 0.08));
              wAlpha.push(fi === 0 ? 0.52 : 0.42);
            }
            wIdx.push(wVc, wVc + 1, wVc + 2, wVc, wVc + 2, wVc + 3);
            wVc += 4;
          }
        }
      }
    }

    // ── Lava ──
    const lPos: number[] = [], lCol: number[] = [], lBright: number[] = [], lAlpha: number[] = [], lIdx: number[] = [];
    let lVc = 0;
    const lc = BLOCK_COLORS[BlockId.LAVA] ?? { r: 1.0, g: 0.45, b: 0.05, a: 0.92 };

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (chunk.getBlock(x, y, z) !== BlockId.LAVA) continue;
          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const nb = (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE)
              ? chunk.getBlock(nx, ny, nz) : getNeighborBlock(ox + nx, ny, oz + nz);
            if (nb === BlockId.LAVA) continue;
            const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
            const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const jitter = 0.95 + rnd * 0.1;
            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              lPos.push(ox + x + v[0], y + (v[1] >= 0.99 ? 1.0 : v[1]), oz + z + v[2]);
              lCol.push(lc.r * jitter, lc.g * jitter, lc.b * jitter);
              lBright.push(face.brightness * (1.0 + rnd * 0.12));
              lAlpha.push(fi === 0 ? 0.78 : 0.62);
            }
            lIdx.push(lVc, lVc + 1, lVc + 2, lVc, lVc + 2, lVc + 3);
            lVc += 4;
          }
        }
      }
    }

    // Upload water VAO
    let waterVao: WebGLVertexArrayObject | null = null, waterVbo: WebGLBuffer | null = null, waterIbo: WebGLBuffer | null = null, waterIndexCount = 0;
    if (wVc > 0) {
      const d = new Float32Array(wVc * stride);
      for (let i = 0; i < wVc; i++) {
        const o = i * stride;
        d[o]=wPos[i*3]; d[o+1]=wPos[i*3+1]; d[o+2]=wPos[i*3+2];
        d[o+3]=wCol[i*3]; d[o+4]=wCol[i*3+1]; d[o+5]=wCol[i*3+2];
        d[o+6]=wBright[i]; d[o+7]=wAlpha[i];
      }
      waterIndexCount = wIdx.length;
      waterVao = gl.createVertexArray()!; gl.bindVertexArray(waterVao);
      waterVbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, waterVbo); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride*bpe, 0);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride*bpe, 3*bpe);
      gl.enableVertexAttribArray(aBright); gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride*bpe, 6*bpe);
      if (aAlpha >= 0) { gl.enableVertexAttribArray(aAlpha); gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride*bpe, 7*bpe); }
      waterIbo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, waterIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(wIdx), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
    }

    // Upload lava VAO
    let lavaVao: WebGLVertexArrayObject | null = null, lavaVbo: WebGLBuffer | null = null, lavaIbo: WebGLBuffer | null = null, lavaIndexCount = 0;
    if (lVc > 0) {
      const d = new Float32Array(lVc * stride);
      for (let i = 0; i < lVc; i++) {
        const o = i * stride;
        d[o]=lPos[i*3]; d[o+1]=lPos[i*3+1]; d[o+2]=lPos[i*3+2];
        d[o+3]=lCol[i*3]; d[o+4]=lCol[i*3+1]; d[o+5]=lCol[i*3+2];
        d[o+6]=lBright[i]; d[o+7]=lAlpha[i];
      }
      lavaIndexCount = lIdx.length;
      lavaVao = gl.createVertexArray()!; gl.bindVertexArray(lavaVao);
      lavaVbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, lavaVbo); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride*bpe, 0);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride*bpe, 3*bpe);
      gl.enableVertexAttribArray(aBright); gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride*bpe, 6*bpe);
      if (aAlpha >= 0) { gl.enableVertexAttribArray(aAlpha); gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride*bpe, 7*bpe); }
      lavaIbo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lavaIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(lIdx), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
    }

    // Patch fluid buffers into existing mesh entry, keep opaque mesh intact
    existing.waterVao = waterVao; existing.waterVbo = waterVbo; existing.waterIbo = waterIbo; existing.waterIndexCount = waterIndexCount;
    existing.lavaVao = lavaVao; existing.lavaVbo = lavaVbo; existing.lavaIbo = lavaIbo; existing.lavaIndexCount = lavaIndexCount;
  }

  /** Build a mesh for a Nether chunk. Stored in netherMeshes with key "nether:cx,cz".
   *  The chunk's internal Y (0..NETHER_DEPTH-1) is offset by -NETHER_DEPTH so world Y
   *  maps correctly: internal y=0 → world y=-1, internal y=ND-1 → world y=-ND.
   */
  buildNetherChunkMesh(
    chunk: Chunk,
    netherDepth: number,
    getNeighborBlock: (wx: number, wy: number, wz: number) => number
  ): void {
    const key = `nether:${chunk.cx},${chunk.cz}`;
    const old = this.netherMeshes.get(key);
    if (old) {
      if (old.vbo) this.gl.deleteBuffer(old.vbo);
      if (old.ibo) this.gl.deleteBuffer(old.ibo);
      if (old.vao) this.gl.deleteVertexArray(old.vao);
      if (old.lavaVbo) this.gl.deleteBuffer(old.lavaVbo);
      if (old.lavaIbo) this.gl.deleteBuffer(old.lavaIbo);
      if (old.lavaVao) this.gl.deleteVertexArray(old.lavaVao);
    }

    const gl = this.gl;
    const positions: number[] = [];
    const colors: number[] = [];
    const brightness: number[] = [];
    const alphas: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    const lPos: number[] = [], lCol: number[] = [], lBright: number[] = [], lAlpha: number[] = [], lIndices: number[] = [];
    let lVertCount = 0;

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const lc = BLOCK_COLORS[BlockId.LAVA] ?? { r: 1.0, g: 0.45, b: 0.05, a: 0.92 };

    // Iterate only the populated Nether depth range
    for (let ny = 0; ny < netherDepth; ny++) {
      // World Y: internal ny=0 is just below the overworld floor (world y=-1)
      const worldY = -(ny + 1);
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = chunk.getBlock(x, ny, z);
          if (blockId === BlockId.AIR) continue;

          const bc: BlockColor = BLOCK_COLORS[blockId] ?? { r: 1, g: 0, b: 1, a: 1 };
          const isLava = blockId === BlockId.LAVA;

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx2 = x + face.dir[0];
            const ny2 = ny + face.dir[1];
            const nz2 = z + face.dir[2];

            // Neighbor in world coords
            let neighbor: number;
            const neighborWorldY = worldY + face.dir[1];
            if (nx2 >= 0 && nx2 < CHUNK_SIZE && ny2 >= 0 && ny2 < netherDepth && nz2 >= 0 && nz2 < CHUNK_SIZE) {
              neighbor = chunk.getBlock(nx2, ny2, nz2);
            } else {
              neighbor = getNeighborBlock(ox + nx2, neighborWorldY, oz + nz2);
            }

            if (isLava) {
              if (neighbor === BlockId.LAVA) continue;
              // Push lava face
              for (let vi = 0; vi < face.verts.length; vi++) {
                const v = face.verts[vi];
                const ly = v[1] >= 0.99 ? 1.0 : v[1];
                lPos.push(ox + x + v[0], worldY + ly, oz + z + v[2]);
                const seed2 = (((x * 73856093) ^ (ny * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
                const rnd2 = (((seed2 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                lCol.push(lc.r * (0.95 + rnd2 * 0.1), lc.g * (0.95 + rnd2 * 0.1), lc.b * (0.95 + rnd2 * 0.1));
                lBright.push(face.brightness * (1.0 + rnd2 * 0.12));
                lAlpha.push(fi === 0 ? 0.78 : 0.62);
              }
              lIndices.push(lVertCount, lVertCount + 1, lVertCount + 2, lVertCount, lVertCount + 2, lVertCount + 3);
              lVertCount += 4;
              continue;
            }

            // Skip face if neighbor is opaque (not air/lava/leaves)
            if (neighbor !== BlockId.AIR && neighbor !== BlockId.LAVA) continue;

            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              positions.push(ox + x + v[0], worldY + v[1], oz + z + v[2]);
              const seed2 = (((x * 73856093) ^ (ny * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ vi) >>> 0);
              const rnd2 = (((seed2 * 1103515245 + 12345) >>> 0) % 1000) / 1000;
              colors.push(bc.r * (0.96 + rnd2 * 0.08), bc.g * (0.96 + rnd2 * 0.08), bc.b * (0.96 + rnd2 * 0.08));
              brightness.push(face.brightness * (0.9 + rnd2 * 0.1));
              alphas.push(1.0);
            }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
            vertCount += 4;
          }
        }
      }
    }

    const stride = 8;
    const bpe = Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aColor = gl.getAttribLocation(this.program, 'aColor');
    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');

    let vao: WebGLVertexArrayObject | null = null, vbo: WebGLBuffer | null = null, ibo: WebGLBuffer | null = null;
    let indexCount = 0;
    if (vertCount > 0) {
      const vData = new Float32Array(vertCount * stride);
      for (let i = 0; i < vertCount; i++) {
        const o = i * stride;
        vData[o] = positions[i * 3]; vData[o + 1] = positions[i * 3 + 1]; vData[o + 2] = positions[i * 3 + 2];
        vData[o + 3] = colors[i * 3]; vData[o + 4] = colors[i * 3 + 1]; vData[o + 5] = colors[i * 3 + 2];
        vData[o + 6] = brightness[i]; vData[o + 7] = alphas[i];
      }
      indexCount = indices.length;
      vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
      vbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, vData, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);
      gl.enableVertexAttribArray(aBright); gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);
      if (aAlpha >= 0) { gl.enableVertexAttribArray(aAlpha); gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe); }
      ibo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }

    let lavaVao: WebGLVertexArrayObject | null = null, lavaVbo: WebGLBuffer | null = null, lavaIbo: WebGLBuffer | null = null;
    let lavaIndexCount = 0;
    if (lVertCount > 0) {
      const lData = new Float32Array(lVertCount * stride);
      for (let i = 0; i < lVertCount; i++) {
        const o = i * stride;
        lData[o] = lPos[i * 3]; lData[o + 1] = lPos[i * 3 + 1]; lData[o + 2] = lPos[i * 3 + 2];
        lData[o + 3] = lCol[i * 3]; lData[o + 4] = lCol[i * 3 + 1]; lData[o + 5] = lCol[i * 3 + 2];
        lData[o + 6] = lBright[i]; lData[o + 7] = lAlpha[i];
      }
      lavaIndexCount = lIndices.length;
      lavaVao = gl.createVertexArray()!; gl.bindVertexArray(lavaVao);
      lavaVbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, lavaVbo); gl.bufferData(gl.ARRAY_BUFFER, lData, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);
      gl.enableVertexAttribArray(aBright); gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);
      if (aAlpha >= 0) { gl.enableVertexAttribArray(aAlpha); gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe); }
      lavaIbo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lavaIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(lIndices), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }

    this.netherMeshes.set(key, {
      vao, vbo, ibo, indexCount, cx: chunk.cx, cz: chunk.cz,
      lavaVao, lavaVbo, lavaIbo, lavaIndexCount
    });
  }
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

    // Water: draw after opaque terrain; depth write off so transparent layers stack
    gl.depthMask(false);
    for (const [, mesh] of this.meshes) {
      if (!mesh.waterVao || !mesh.waterIndexCount) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > this.renderDistanceChunks || Math.abs(dz) > this.renderDistanceChunks) continue;
      gl.bindVertexArray(mesh.waterVao);
      gl.drawElements(gl.TRIANGLES, mesh.waterIndexCount, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);

    // Lava: draw with warm tint after opaque geometry (transparent pass)
    gl.depthMask(false);
    for (const [, mesh] of this.meshes) {
      if (!mesh.lavaVao || !mesh.lavaIndexCount) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > this.renderDistanceChunks || Math.abs(dz) > this.renderDistanceChunks) continue;
      // warm tint for lava
      gl.uniform3f(this.uTint, 1.2, 1.05, 0.9);
      gl.bindVertexArray(mesh.lavaVao);
      gl.drawElements(gl.TRIANGLES, mesh.lavaIndexCount, gl.UNSIGNED_INT, 0);
      // restore tint
      gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);

    // ── Nether opaque pass ──
    for (const [, mesh] of this.netherMeshes) {
      if (!mesh.vao || mesh.indexCount === 0) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > this.renderDistanceChunks || Math.abs(dz) > this.renderDistanceChunks) continue;
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);

    // ── Nether lava pass ──
    gl.depthMask(false);
    for (const [, mesh] of this.netherMeshes) {
      if (!mesh.lavaVao || !mesh.lavaIndexCount) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > this.renderDistanceChunks || Math.abs(dz) > this.renderDistanceChunks) continue;
      gl.uniform3f(this.uTint, 1.2, 1.05, 0.9);
      gl.bindVertexArray(mesh.lavaVao);
      gl.drawElements(gl.TRIANGLES, mesh.lavaIndexCount, gl.UNSIGNED_INT, 0);
      gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    }
    gl.depthMask(true);
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
      this.drawPlayerPillar(p, mvp, now, speed, camX, camY, camZ);
      const dist = Math.sqrt((p.posX - camX) ** 2 + (p.posY - camY) ** 2 + (p.posZ - camZ) ** 2);
      if (dist <= 20) {
        // Draw healthbar in WebGL
        try {
          const eyeHeight = 1.6;
          const headTop = p.posY + 0.45; // Position for healthbar (above player's head)
          const fullW = 0.9;
          const fullH = 0.15;
          const maxH = (p as any).maxHealth ?? 20;
          const curH = Math.max(0, (p.health ?? 0));
          const ratio = Math.max(0, Math.min(1, maxH > 0 ? curH / maxH : 0));

          this.ensureHealthbarMesh();
          // Billboard toward camera - compute angle from object to camera
          const T = translationMatrix(p.posX, headTop, p.posZ);
          const R = rotationYMatrix(-yaw + Math.PI);

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

          // Draw player name above healthbar using text texture
          const playerName = (p as any).username || 'Player';
          const nameY = headTop + 0.35;
          this.drawNameText(playerName, p.posX, nameY, p.posZ, yaw, mvp, mvp);

          gl.bindVertexArray(null);
          // restore
          gl.uniformMatrix4fv(this.uMVP, false, mvp);
          gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
        } catch (e) {
          console.error('Error rendering healthbar for player', p.userId, e);
        }
      }
    }
  }

  /** Simple coloured box for other players */
  private playerVAO: WebGLVertexArrayObject | null = null;
  private playerVBO: WebGLBuffer | null = null;
  private playerIBO: WebGLBuffer | null = null;
  private playerIndexCount = 0;
  private cubeVAO: WebGLVertexArrayObject | null = null;
  private cubeVBO: WebGLBuffer | null = null;
  private cubeIBO: WebGLBuffer | null = null;
  private cubeIndexCount = 0;

  // Healthbar mesh (unit quad centered at origin, extend X horizontally)
  private healthbarVAO: WebGLVertexArrayObject | null = null;
  private healthbarVBO: WebGLBuffer | null = null;
  private healthbarIBO: WebGLBuffer | null = null;
  private healthbarIndexCount = 0;

  // Text texture cache for player names
  private textTextures = new Map<string, WebGLTexture>();
  private textTextureSize = 128;
  // Text quad VAO for rendering name textures
  private textVAO: WebGLVertexArrayObject | null = null;
  private textVBO: WebGLBuffer | null = null;

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
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
    if (aAlpha >= 0) {
      gl.disableVertexAttribArray(aAlpha);
      gl.vertexAttrib1f(aAlpha, 1.0);
    }
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.playerVAO = vao;
    this.playerVBO = vbo;
    this.playerIBO = ibo;
    this.playerIndexCount = idx.length;
  }

  private ensureCubeMesh(): void {
    if (this.cubeVAO) return;
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    let vc = 0;

    const pushVert = (x: number, y: number, z: number, bright: number) => {
      verts.push(x, y, z, 1, 1, 1, bright);
    };

    const faces = [
      { points: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], bright: 1.0 },
      { points: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]], bright: 0.58 },
      { points: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]], bright: 0.9 },
      { points: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]], bright: 0.86 },
      { points: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]], bright: 0.8 },
      { points: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]], bright: 0.76 },
    ] as const;

    for (const face of faces) {
      for (const point of face.points) {
        pushVert(point[0], point[1], point[2], face.bright);
      }
      idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
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

    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
    if (aAlpha >= 0) {
      gl.disableVertexAttribArray(aAlpha);
      gl.vertexAttrib1f(aAlpha, 1.0);
    }

    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.cubeVAO = vao;
    this.cubeVBO = vbo;
    this.cubeIBO = ibo;
    this.cubeIndexCount = idx.length;
  }

  private drawCube(baseMVP: Float32Array, world: Float32Array, color: [number, number, number]): void {
    this.ensureCubeMesh();
    if (!this.cubeVAO) return;
    const gl = this.gl;
    gl.uniform3f(this.uTint, color[0], color[1], color[2]);
    gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, world));
    gl.bindVertexArray(this.cubeVAO);
    gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  private tintColor(color: [number, number, number], amount: number): [number, number, number] {
    return [
      Math.max(0, Math.min(1, color[0] * amount)),
      Math.max(0, Math.min(1, color[1] * amount)),
      Math.max(0, Math.min(1, color[2] * amount)),
    ];
  }

  private armorColor(itemId?: number): [number, number, number] | null {
    if (!itemId || itemId <= 0) return null;
    return hexToRGB(ITEM_COLORS[itemId] ?? '#d9dde8');
  }

  private drawHeldWeapon(baseMVP: Float32Array, root: Float32Array, handX: number, shoulderY: number, armHeight: number, armAngle: number, weaponId: number): void {
    if (!weaponId || weaponId <= 0) return;
    this.ensureWeaponMeshFor(weaponId);
    const mesh = this.weaponMeshes.get(weaponId);
    if (!mesh?.vao) return;

    const gl = this.gl;
    const handAnchor = multiplyMat4(root,
      multiplyMat4(
        translationMatrix(handX, shoulderY, 0),
        multiplyMat4(
          rotationXMatrix(armAngle),
          multiplyMat4(
            translationMatrix(0.02, -armHeight + 0.14, 0.08),
            multiplyMat4(rotationZMatrix(Math.PI / 2), scaleMatrix(0.9))
          )
        )
      )
    );

    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, handAnchor));
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  private drawHumanoidAvatar(p: DCPlayer, baseMVP: Float32Array, now: number, speed: number, opts?: { preview?: boolean; rootWorld?: Float32Array; baseColorHex?: string; skinColorHex?: string }): void {
    const eyeHeight = 1.6;
    const bodyYaw = p.bodyYaw ?? p.yaw ?? 0;
    const headYaw = p.yaw ?? 0;
    const root = opts?.rootWorld ?? multiplyMat4(
      translationMatrix(p.posX, p.posY - eyeHeight, p.posZ),
      rotationYMatrix(bodyYaw)
    );

    const baseColor = hexToRGB(opts?.baseColorHex ?? p.color ?? '#7fb5ff');
    const skinColor = hexToRGB(opts?.skinColorHex ?? '#efc39a');
    const shirtColor = this.tintColor(baseColor, 1.02);
    const pantsColor = this.tintColor(baseColor, 0.55);
    const sleeveColor = this.tintColor(baseColor, 0.92);

    const legW = 0.23, legH = 0.72, legD = 0.23;
    const torsoW = 0.56, torsoH = 0.72, torsoD = 0.29;
    const armW = 0.19, armH = 0.72, armD = 0.19;
    const headS = 0.48;
    const shoulderY = legH + torsoH - 0.05;
    const armX = torsoW * 0.5 + armW * 0.55;
    const phase = now * ((opts?.preview ? 2.4 : 0.8) + Math.min(1, speed / 4) * 2.4) + p.userId * 0.15;
    const swingAmount = opts?.preview ? 0.38 : Math.min(0.75, speed / 4);
    const legSwing = Math.sin(phase) * swingAmount * 0.85;
    const armSwing = Math.sin(phase + Math.PI) * swingAmount * 0.75;
    const bob = (opts?.preview ? Math.sin(now * 1.6) : Math.sin(phase * 0.5)) * (opts?.preview ? 0.025 : Math.min(0.04, speed * 0.015));
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    const torsoWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH * 0.5, 0), this.scaleXYZ(torsoW, torsoH, torsoD)));
    this.drawCube(baseMVP, torsoWorld, shirtColor);

    // Head rotates independently (looking direction)
    const headLocal = multiplyMat4(translationMatrix(0, legH + torsoH + headS * 0.5, 0), rotationYMatrix(headYaw - bodyYaw));
    const headWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, this.scaleXYZ(headS, headS, headS)));
    this.drawCube(baseMVP, headWorld, skinColor);

    const leftLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-0.13, legH, 0),
      multiplyMat4(rotationXMatrix(legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(legW, legH, legD)))
    ));
    this.drawCube(baseMVP, leftLegWorld, pantsColor);

    const rightLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0.13, legH, 0),
      multiplyMat4(rotationXMatrix(-legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(legW, legH, legD)))
    ));
    this.drawCube(baseMVP, rightLegWorld, pantsColor);

    const weaponId = (p as any).weapon ?? 0;
    const rightArmBaseAngle = weaponId > 0 ? -0.45 : armSwing;
    const rightArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(armX, shoulderY, 0),
      multiplyMat4(rotationXMatrix(rightArmBaseAngle), multiplyMat4(translationMatrix(0, -armH * 0.5, 0), this.scaleXYZ(armW, armH, armD)))
    ));
    this.drawCube(baseMVP, rightArmWorld, sleeveColor);

    const leftArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-armX, shoulderY, 0),
      multiplyMat4(rotationXMatrix(-armSwing), multiplyMat4(translationMatrix(0, -armH * 0.5, 0), this.scaleXYZ(armW, armH, armD)))
    ));
    this.drawCube(baseMVP, leftArmWorld, sleeveColor);

    const helmetColor = this.armorColor((p as any).helmet);
    if (helmetColor) {
      const helmetWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH + headS * 0.5, 0), this.scaleXYZ(headS + 0.08, headS + 0.08, headS + 0.08)));
      this.drawCube(baseMVP, helmetWorld, helmetColor);
    }

    const chestColor = this.armorColor((p as any).chest);
    if (chestColor) {
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH * 0.5, 0), this.scaleXYZ(torsoW + 0.07, torsoH + 0.06, torsoD + 0.06))), chestColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(armX, shoulderY, 0),
        multiplyMat4(rotationXMatrix(rightArmBaseAngle), multiplyMat4(translationMatrix(0, -armH * 0.45, 0), this.scaleXYZ(armW + 0.05, armH * 0.9, armD + 0.05)))
      )), chestColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-armX, shoulderY, 0),
        multiplyMat4(rotationXMatrix(-armSwing), multiplyMat4(translationMatrix(0, -armH * 0.45, 0), this.scaleXYZ(armW + 0.05, armH * 0.9, armD + 0.05)))
      )), chestColor);
    }

    const legArmorColor = this.armorColor((p as any).legs);
    if (legArmorColor) {
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, legH, 0),
        multiplyMat4(rotationXMatrix(legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(legW + 0.05, legH + 0.04, legD + 0.05)))
      )), legArmorColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, legH, 0),
        multiplyMat4(rotationXMatrix(-legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(legW + 0.05, legH + 0.04, legD + 0.05)))
      )), legArmorColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + 0.08, 0), this.scaleXYZ(torsoW * 0.72, 0.18, torsoD + 0.05))), legArmorColor);
    }

    const bootsColor = this.armorColor((p as any).boots);
    if (bootsColor) {
      const bootHeight = 0.24;
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, bootHeight * 0.5, 0),
        this.scaleXYZ(legW + 0.06, bootHeight, legD + 0.07)
      )), bootsColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, bootHeight * 0.5, 0),
        this.scaleXYZ(legW + 0.06, bootHeight, legD + 0.07)
      )), bootsColor);
    }

    this.drawHeldWeapon(baseMVP, rootBob, armX, shoulderY, armH, rightArmBaseAngle, weaponId);
    this.gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
  }

  private drawCreeper(baseMVP: Float32Array, posX: number, posY: number, posZ: number, yaw: number, now: number, speed: number): void {
    const eyeHeight = 1.6;
    // Creeper green base color
    const creeperGreen: [number, number, number] = [0.1, 0.55, 0.1];
    const darkGreen: [number, number, number] = [0.08, 0.35, 0.08];
    const footColor: [number, number, number] = [0.12, 0.4, 0.12];

    const root = multiplyMat4(
      translationMatrix(posX, posY - eyeHeight, posZ),
      rotationYMatrix(-yaw)  // Negate: yaw points to player's face, so negate to show back
    );

    // Bobbing animation
    const phase = now * (0.8 + Math.min(1, speed / 4) * 2.4);
    const bob = Math.sin(phase * 0.5) * Math.min(0.03, speed * 0.01);
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    // Creeper body - main torso (boxy, slightly wider at bottom)
    const bodyW = 0.5, bodyH = 0.65, bodyD = 0.45;
    const bodyY = 0.75;
    const torsoWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, bodyY, 0),
      this.scaleXYZ(bodyW, bodyH, bodyD)
    ));
    this.drawCube(baseMVP, torsoWorld, creeperGreen);

    // Upper body slightly wider 
    const upperWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, bodyY + 0.35, 0),
      this.scaleXYZ(bodyW + 0.08, 0.25, bodyD + 0.05)
    ));
    this.drawCube(baseMVP, upperWorld, creeperGreen);

    // Legs - two separate blocks
    const legW = 0.18, legH = 0.4, legD = 0.18;
    const legSpacing = 0.14;
    const legY = 0.2;
    // Left leg
    const leftLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-legSpacing, legY + legH * 0.5, 0),
      this.scaleXYZ(legW, legH, legD)
    ));
    this.drawCube(baseMVP, leftLegWorld, footColor);
    // Right leg
    const rightLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(legSpacing, legY + legH * 0.5, 0),
      this.scaleXYZ(legW, legH, legD)
    ));
    this.drawCube(baseMVP, rightLegWorld, footColor);

    // Side arms - hanging down on each side
    const armW = 0.15, armH = 0.55, armD = 0.15;
    const armY = 0.65;
    const armXOffset = bodyW / 2 + armW / 2 + 0.02;
    // Left arm
    const leftArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-armXOffset, armY, 0),
      this.scaleXYZ(armW, armH, armD)
    ));
    this.drawCube(baseMVP, leftArmWorld, creeperGreen);
    // Right arm
    const rightArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(armXOffset, armY, 0),
      this.scaleXYZ(armW, armH, armD)
    ));
    this.drawCube(baseMVP, rightArmWorld, creeperGreen);

    // Head (no distinct neck, merges into body)
    const headSize = 0.4;
    const headY = bodyY + bodyH / 2 + 0.28;
    const headWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, headY, 0),
      this.scaleXYZ(headSize, headSize, headSize * 0.9)
    ));
    this.drawCube(baseMVP, headWorld, creeperGreen);

    // Face - darker snout area (billboard-like front face)
    const snoutW = 0.22, snoutH = 0.18, snoutD = 0.05;
    const snoutY = headY - 0.08;
    const snoutZ = headSize * 0.9 / 2 + snoutD / 2;
    const snoutWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, snoutY, snoutZ),
      this.scaleXYZ(snoutW, snoutH, snoutD)
    ));
    this.drawCube(baseMVP, snoutWorld, darkGreen);

    // Eyes (two dark pixels on face)
    const eyeSize = 0.08;
    const eyeY = headY + 0.05;
    const eyeZ = headSize * 0.9 / 2 + 0.01;
    const eyeSpacing = 0.1;
    // Left eye
    const leftEyeWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-eyeSpacing, eyeY, eyeZ),
      this.scaleXYZ(eyeSize, eyeSize, 0.02)
    ));
    this.drawCube(baseMVP, leftEyeWorld, [0, 0, 0]);
    // Right eye
    const rightEyeWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(eyeSpacing, eyeY, eyeZ),
      this.scaleXYZ(eyeSize, eyeSize, 0.02)
    ));
    this.drawCube(baseMVP, rightEyeWorld, [0, 0, 0]);
  }

  private drawSkeleton(baseMVP: Float32Array, posX: number, posY: number, posZ: number, yaw: number, now: number, speed: number): void {
    const eyeHeight = 1.6;
    // Skeleton bone white color
    const boneWhite: [number, number, number] = [0.95, 0.95, 0.92];
    const boneGray: [number, number, number] = [0.75, 0.75, 0.72];

    const root = multiplyMat4(
      translationMatrix(posX, posY - eyeHeight, posZ),
      rotationYMatrix(-yaw)
    );

    // Bobbing animation
    const phase = now * (0.8 + Math.min(1, speed / 4) * 2.4);
    const bob = Math.sin(phase * 0.5) * Math.min(0.03, speed * 0.01);
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    // Head - skull with hollow eyes
    const headSize = 0.35;
    const headY = 1.55;
    const headWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, headY, 0),
      this.scaleXYZ(headSize, headSize, headSize * 0.9)
    ));
    this.drawCube(baseMVP, headWorld, boneWhite);

    // Eye sockets - two dark hollows
    const eyeSize = 0.08;
    const eyeY = headY + 0.02;
    const eyeZ = headSize * 0.9 / 2 + 0.01;
    const eyeSpacing = 0.1;
    const leftEyeSocket = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-eyeSpacing, eyeY, eyeZ),
      this.scaleXYZ(eyeSize, eyeSize, 0.02)
    ));
    this.drawCube(baseMVP, leftEyeSocket, [0.1, 0.1, 0.1]);
    const rightEyeSocket = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(eyeSpacing, eyeY, eyeZ),
      this.scaleXYZ(eyeSize, eyeSize, 0.02)
    ));
    this.drawCube(baseMVP, rightEyeSocket, [0.1, 0.1, 0.1]);

    // Ribcage - horizontal bars
    const ribcageY = headY - 0.4;
    const ribWidth = 0.35;
    const ribDepth = 0.25;
    for (let i = 0; i < 3; i++) {
      const ribWorld = multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0, ribcageY - i * 0.1, 0),
        this.scaleXYZ(ribWidth, 0.06, ribDepth)
      ));
      this.drawCube(baseMVP, ribWorld, boneWhite);
    }

    // Arms - thin bones pointing down/at bow
    const armW = 0.06, armH = 0.5, armD = 0.06;
    const shoulderY = ribcageY + 0.1;
    // Left arm
    const leftArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-ribWidth / 2 - 0.05, shoulderY - 0.15, 0),
      this.scaleXYZ(armW, armH, armD)
    ));
    this.drawCube(baseMVP, leftArmWorld, boneGray);
    // Right arm (holding bow)
    const rightArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(ribWidth / 2 + 0.05, shoulderY - 0.15, 0),
      this.scaleXYZ(armW, armH, armD)
    ));
    this.drawCube(baseMVP, rightArmWorld, boneGray);

    // Legs - thin bones
    const legW = 0.1, legH = 0.55, legD = 0.1;
    const hipY = ribcageY - 0.35;
    const legSpacing = 0.12;
    // Left leg
    const leftLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-legSpacing, hipY - 0.25, 0),
      this.scaleXYZ(legW, legH, legD)
    ));
    this.drawCube(baseMVP, leftLegWorld, boneGray);
    // Right leg
    const rightLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(legSpacing, hipY - 0.25, 0),
      this.scaleXYZ(legW, legH, legD)
    ));
    this.drawCube(baseMVP, rightLegWorld, boneGray);
  }

  /**
   * Render a Bear mob - a large quadruped with rounded body, four legs, and small head.
   * Bears walk on all fours with a bulky torso and thick neck.
   */
  private drawBear(baseMVP: Float32Array, posX: number, posY: number, posZ: number, yaw: number, now: number, speed: number): void {
    const eyeHeight = 1.6;
    // Bear colors from digcraft-bear.ts
    const bodyColor: [number, number, number] = [0.36, 0.25, 0.20]; // #5C4033
    const faceColor: [number, number, number] = [0.24, 0.17, 0.12]; // #3E2B20
    const bellyColor: [number, number, number] = [0.54, 0.43, 0.28]; // #8B6F47

    const root = multiplyMat4(
      translationMatrix(posX, posY - eyeHeight, posZ),
      rotationYMatrix(-yaw)
    );

    // Bobbing animation for walking
    const phase = now * (0.8 + Math.min(1, speed / 4) * 2.4);
    const bob = Math.sin(phase * 0.5) * Math.min(0.03, speed * 0.01);
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    // Body - large rounded torso (bear is bulky)
    const bodyWidth = 0.52, bodyDepth = 0.42, bodyHeight = 0.55;
    const bodyY = 0.25;
    const bodyWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, bodyY, 0),
      this.scaleXYZ(bodyWidth, bodyHeight, bodyDepth)
    ));
    this.drawCube(baseMVP, bodyWorld, bodyColor);

    // Belly - lighter underside (visible when bear is turned)
    const bellyWidth = 0.48, bellyDepth = 0.38, bellyHeight = 0.45;
    const bellyY = bodyY - 0.02;
    const bellyWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, bellyY, 0),
      this.scaleXYZ(bellyWidth, bellyHeight, bellyDepth)
    ));
    this.drawCube(baseMVP, bellyWorld, bellyColor);

    // Neck - connects body to head
    const neckWidth = 0.22, neckDepth = 0.18, neckHeight = 0.35;
    const neckY = bodyY + bodyHeight * 0.55;
    const neckWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, neckY, 0),
      this.scaleXYZ(neckWidth, neckHeight, neckDepth)
    ));
    this.drawCube(baseMVP, neckWorld, bodyColor);

    // Head - small relative to body (bears have relatively small heads)
    const headWidth = 0.28, headDepth = 0.24, headHeight = 0.32;
    const headY = neckY + neckHeight * 0.55;
    const headWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, headY, 0),
      this.scaleXYZ(headWidth, headHeight, headDepth)
    ));
    this.drawCube(baseMVP, headWorld, faceColor);

    // Ears - two small rounded ears on top of head
    const earSize = 0.08;
    const earY = headY + headHeight * 0.55;
    const earSpacing = 0.08;
    // Left ear
    const leftEarWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-earSpacing, earY, headDepth * 0.5 + 0.02),
      this.scaleXYZ(earSize, earSize, earSize * 0.6)
    ));
    this.drawCube(baseMVP, leftEarWorld, faceColor);
    // Right ear
    const rightEarWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(earSpacing, earY, headDepth * 0.5 + 0.02),
      this.scaleXYZ(earSize, earSize, earSize * 0.6)
    ));
    this.drawCube(baseMVP, rightEarWorld, faceColor);

    // Snout - protruding nose/mouth area
    const snoutWidth = 0.12, snoutDepth = 0.1, snoutHeight = 0.12;
    const snoutY = headY + headHeight * 0.35;
    const snoutWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, snoutY, -headDepth * 0.5 - 0.05),
      this.scaleXYZ(snoutWidth, snoutHeight, snoutDepth)
    ));
    this.drawCube(baseMVP, snoutWorld, faceColor);

    // Nose - dark black nose at tip of snout
    const noseSize = 0.05;
    const noseY = snoutY + snoutHeight * 0.55;
    const noseWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, noseY, -snoutDepth * 0.5 - 0.02),
      this.scaleXYZ(noseSize, noseSize, noseSize * 0.5)
    ));
    this.drawCube(baseMVP, noseWorld, [0.05, 0.05, 0.05]);

    // Legs - four sturdy legs (bear walks on all fours)
    const legWidth = 0.14, legDepth = 0.12, legHeight = 0.52;
    const hipY = bodyY - bodyHeight * 0.35;
    const legSpacingX = 0.18, legSpacingZ = 0.12;

    // Front left leg
    const frontLeftLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-legSpacingX, hipY - 0.26, -legSpacingZ),
      this.scaleXYZ(legWidth, legHeight, legDepth)
    ));
    this.drawCube(baseMVP, frontLeftLegWorld, bodyColor);

    // Front right leg
    const frontRightLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(legSpacingX, hipY - 0.26, -legSpacingZ),
      this.scaleXYZ(legWidth, legHeight, legDepth)
    ));
    this.drawCube(baseMVP, frontRightLegWorld, bodyColor);

    // Back left leg
    const backLeftLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-legSpacingX, hipY - 0.26, legSpacingZ),
      this.scaleXYZ(legWidth, legHeight, legDepth)
    ));
    this.drawCube(baseMVP, backLeftLegWorld, bodyColor);

    // Back right leg
    const backRightLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(legSpacingX, hipY - 0.26, legSpacingZ),
      this.scaleXYZ(legWidth, legHeight, legDepth)
    ));
    this.drawCube(baseMVP, backRightLegWorld, bodyColor);

    // Tail - short stubby tail
    const tailWidth = 0.06, tailDepth = 0.04, tailHeight = 0.08;
    const tailY = hipY - 0.15;
    const tailWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0, tailY, legSpacingZ + 0.05),
      this.scaleXYZ(tailWidth, tailHeight, tailDepth)
    ));
    this.drawCube(baseMVP, tailWorld, bodyColor);
  }

  renderAvatarPreview(player: DCPlayer, spinYaw: number, tilt: number, now: number): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const aspect = this.width / Math.max(1, this.height);
    const proj = perspectiveMatrix(38 * Math.PI / 180, aspect, 0.1, 100);
    const view = lookAtFPS(0, 1.2, 3.7, 0, tilt);
    const mvp = multiplyMat4(proj, view);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    const previewPlayer: DCPlayer = { ...player, yaw: spinYaw, posX: 0, posY: 1.6, posZ: 0 };
    this.drawHumanoidAvatar(previewPlayer, mvp, now, 1.2, { preview: true });
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
  }

  // weapon meshes cached per item id (built on demand)
  // see ensureWeaponMeshFor(itemId)

  private drawPlayerPillar(p: DCPlayer, baseMVP: Float32Array, now?: number, speed?: number, camX?: number, camY?: number, camZ?: number): void {
    const gl = this.gl;
    if (!this._playerPillarLogOnce) {
      try { console.info('DigCraftRenderer: drawPlayerPillar called example:', p.userId, p.posX, p.posY, p.posZ); } catch (e) { }
      this._playerPillarLogOnce = true;
    }

    // Translate model so feet sit at player's ground position (client stores camera/eye Y)
    const eyeHeight = 1.6;

    // Detect mobs (we map mobs to negative userIds in the client). Draw specialized mob models.
    const isMob = (p.userId ?? 0) < 0;
    if (isMob && camX != null && camY != null && camZ != null) {
      // Skip mobs beyond render distance
      const mobDist = Math.sqrt((p.posX - camX) ** 2 + (p.posY - camY) ** 2 + (p.posZ - camZ) ** 2);
      const renderDistBlocks = (this.renderDistanceChunks + 1) * CHUNK_SIZE;
      if (mobDist > renderDistBlocks) return;

      const mobType = p.username || 'Mob';
      // Zombie is rendered as a Creeper (green boxy body, legs, side arms, no distinct head)
      if (mobType === 'Zombie') {
        this.drawCreeper(baseMVP, p.posX, p.posY, p.posZ, p.yaw ?? 0, now ?? performance.now() / 1000, speed ?? 0);
        return;
      }
      // Skeleton / WitherSkeleton share the skeleton renderer
      if (mobType === 'Skeleton' || mobType === 'WitherSkeleton') {
        this.drawSkeleton(baseMVP, p.posX, p.posY, p.posZ, p.yaw ?? 0, now ?? performance.now() / 1000, speed ?? 0);
        return;
      }
      // Bear - rendered as a large quadruped with rounded body, four legs, and small head
      if (mobType === 'Bear') {
        this.drawBear(baseMVP, p.posX, p.posY, p.posZ, p.yaw ?? 0, now ?? performance.now() / 1000, speed ?? 0);
        return;
      }
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

    // Default: draw a simple humanoid player (no new avatar)
    const tintHex = p.color ?? '#7fb5ff';
    const eyeH = 1.6;
    const legH = 0.5;
    const torsoH = 0.72;
    const headS = 0.48;
    const baseColor = hexToRGB(tintHex);
    const skinColor = hexToRGB('#efc39a');
    const shirtColor = this.tintColor(baseColor, 1.02);
    const pantsColor = this.tintColor(baseColor, 0.55);
    const sleeveColor = this.tintColor(baseColor, 0.92);

    // compute walk animation
    const time = now ?? performance.now() / 1000;
    const walkSpeed = speed ?? 0;
    const phase = time * (0.8 + Math.min(1, walkSpeed / 4) * 2.4) + p.userId * 0.15;
    const swingAmount = Math.min(0.75, walkSpeed / 4);
    const legSwing = Math.sin(phase) * swingAmount * 0.85;
    const armSwing = Math.sin(phase + Math.PI) * swingAmount * 0.75;
    const bob = Math.sin(phase * 0.5) * Math.min(0.04, walkSpeed * 0.015);

    const rootBob = multiplyMat4(
      translationMatrix(p.posX, p.posY - eyeH + bob, p.posZ),
      rotationYMatrix(p.yaw ?? 0)
    );

    // draw torso
    const torsoWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH * 0.5, 0), this.scaleXYZ(0.56, torsoH, 0.29)));
    this.drawCube(baseMVP, torsoWorld, shirtColor);

    // draw head
    const headWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH + headS * 0.5, 0), this.scaleXYZ(headS, headS, headS)));
    this.drawCube(baseMVP, headWorld, skinColor);

    // draw legs
    const leftLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-0.13, legH, 0),
      multiplyMat4(rotationXMatrix(legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(0.23, legH, 0.23)))
    ));
    this.drawCube(baseMVP, leftLegWorld, pantsColor);

    const rightLegWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(0.13, legH, 0),
      multiplyMat4(rotationXMatrix(-legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(0.23, legH, 0.23)))
    ));
    this.drawCube(baseMVP, rightLegWorld, pantsColor);

    // draw arms
    const armW = 0.19, armH = 0.72, armD = 0.19, armX = 0.56 * 0.5 + armW * 0.55, shoulderY = legH + torsoH - 0.05;
    const leftArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-armX, shoulderY, 0),
      multiplyMat4(rotationXMatrix(-armSwing), multiplyMat4(translationMatrix(0, -armH * 0.5, 0), this.scaleXYZ(armW, armH, armD)))
    ));
    this.drawCube(baseMVP, leftArmWorld, sleeveColor);

    const rightArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(armX, shoulderY, 0),
      multiplyMat4(rotationXMatrix(armSwing), multiplyMat4(translationMatrix(0, -armH * 0.5, 0), this.scaleXYZ(armW, armH, armD)))
    ));
    this.drawCube(baseMVP, rightArmWorld, sleeveColor);

    const weaponId = (p as any).weapon ?? 0;
    const helmetColor = this.armorColor((p as any).helmet);
    if (helmetColor) {
      const helmetWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH + headS * 0.5, 0), this.scaleXYZ(headS + 0.08, headS + 0.08, headS + 0.08)));
      this.drawCube(baseMVP, helmetWorld, helmetColor);
    }

    const chestColor = this.armorColor((p as any).chest);
    if (chestColor) {
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + torsoH * 0.5, 0), this.scaleXYZ(0.56 + 0.07, torsoH + 0.06, 0.29 + 0.06))), chestColor);
      const rightArmRotation = armSwing;
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(armX, shoulderY, 0),
        multiplyMat4(rotationXMatrix(rightArmRotation), multiplyMat4(translationMatrix(0, -armH * 0.5, 0), this.scaleXYZ(armW + 0.05, armH, armD + 0.05)))
      )), chestColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-armX, shoulderY, 0),
        multiplyMat4(rotationXMatrix(-armSwing), multiplyMat4(translationMatrix(0, -armH * 0.5, 0), this.scaleXYZ(armW + 0.05, armH, armD + 0.05)))
      )), chestColor);
    }

    const legArmorColor = this.armorColor((p as any).legs);
    if (legArmorColor) {
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, legH, 0),
        multiplyMat4(rotationXMatrix(legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(0.23 + 0.05, legH + 0.04, 0.23 + 0.05)))
      )), legArmorColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, legH, 0),
        multiplyMat4(rotationXMatrix(-legSwing), multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(0.23 + 0.05, legH + 0.04, 0.23 + 0.05)))
      )), legArmorColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, legH + 0.08, 0), this.scaleXYZ(0.56 * 0.72, 0.18, 0.29 + 0.05))), legArmorColor);
    }

    const bootsColor = this.armorColor((p as any).boots);
    if (bootsColor) {
      const bootHeight = 0.24;
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, bootHeight * 0.5, 0),
        this.scaleXYZ(0.23 + 0.06, bootHeight, 0.23 + 0.07)
      )), bootsColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, bootHeight * 0.5, 0),
        this.scaleXYZ(0.23 + 0.06, bootHeight, 0.23 + 0.07)
      )), bootsColor);
    }

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
        const P = translationMatrix(p.posX, p.posY - eyeH, p.posZ);
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
    // console.info('DigCraftRenderer: ensureHealthbarMesh called, existing VAO:', !!this.healthbarVAO);
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
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
    if (aAlpha >= 0) {
      gl.disableVertexAttribArray(aAlpha);
      gl.vertexAttrib1f(aAlpha, 1.0);
    }

    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    this.healthbarVAO = vao;
    this.healthbarVBO = vbo;
    this.healthbarIBO = ibo;
    this.healthbarIndexCount = idx.length;
  }

  /** Create or get a texture for a player's name */
  private getNameTexture(name: string): WebGLTexture {
    if (this.textTextures.has(name)) {
      return this.textTextures.get(name)!;
    }
    const gl = this.gl;
    const canvas = document.createElement('canvas');
    canvas.width = this.textTextureSize;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(20, 20, 30, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textTextures.set(name, tex);
    return tex;
  }

  /** Ensure text quad VAO exists for rendering name textures */
  private ensureTextQuad(): void {
    if (this.textVAO) return;
    const gl = this.gl;
    // Quad with position and UV coordinates (flip V to fix upside-down text, flip U to fix horizontal flip)
    const verts = new Float32Array([
      -0.5, 0, 0, 1, 1,
      0.5, 0, 0, 0, 1,
      0.5, 1, 0, 0, 0,
      -0.5, 1, 0, 1, 0,
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    this.textVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.textVAO);
    this.textVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textVBO);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.textProgram, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 20, 0);
    const aTex = gl.getAttribLocation(this.textProgram, 'aTexCoord');
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 20, 12);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  /** Render a player's name as a textured quad above their position */
  private drawNameText(name: string, x: number, y: number, z: number, yaw: number, mvp: Float32Array, baseMVP: Float32Array): void {
    const tex = this.getNameTexture(name);
    this.ensureTextQuad();
    const gl = this.gl;
    gl.useProgram(this.textProgram);
    const T = translationMatrix(x, y, z);
    const R = rotationYMatrix(-yaw + Math.PI);
    const S = this.scaleXYZ(0.8, 0.3, 1);
    const world = multiplyMat4(T, multiplyMat4(R, S));
    const finalMVP = multiplyMat4(mvp, world);
    gl.uniformMatrix4fv(this.uMVPText, false, finalMVP);
    gl.uniform3f(this.uTintText, 1.0, 1.0, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uTexture, 0);
    gl.bindVertexArray(this.textVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.useProgram(this.program);
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
    } else if (t === 'Camel') {
      // Sandy-tan camel: tall legs, humped body, long neck+head
      const sand = hexToRGB('#C8A060');
      const dark = hexToRGB('#A07840');
      const legH = 0.70;
      // four legs (tall and thin)
      addBox(-0.22, 0, -0.14, -0.12, legH, 0.0,  sand, 0.85);
      addBox( 0.12, 0, -0.14,  0.22, legH, 0.0,  sand, 0.85);
      addBox(-0.22, 0,  0.04, -0.12, legH, 0.18, sand, 0.85);
      addBox( 0.12, 0,  0.04,  0.22, legH, 0.18, sand, 0.85);
      // body
      addBox(-0.38, legH, -0.20, 0.38, legH + 0.52, 0.20, sand, 1.0);
      // hump
      addBox(-0.10, legH + 0.44, -0.12, 0.14, legH + 0.72, 0.12, dark, 0.95);
      // neck
      addBox( 0.38, legH + 0.18, -0.06, 0.52, legH + 0.52, 0.06, sand, 0.95);
      // head
      addBox( 0.52, legH + 0.30, -0.08, 0.76, legH + 0.52, 0.08, sand, 1.0);
      // snout
      addBox( 0.76, legH + 0.32, -0.05, 0.90, legH + 0.46, 0.05, dark, 0.9);
    } else if (t === 'Goat') {
      // White/grey mountain goat with small horns
      const wool = hexToRGB('#D8D0C0');
      const dark = hexToRGB('#706858');
      const legH = 0.40;
      // legs
      addBox(-0.18, 0, -0.10, -0.08, legH,  0.10, dark, 0.85);
      addBox( 0.08, 0, -0.10,  0.18, legH,  0.10, dark, 0.85);
      addBox(-0.18, 0,  0.06, -0.08, legH,  0.16, dark, 0.85);
      addBox( 0.08, 0,  0.06,  0.18, legH,  0.16, dark, 0.85);
      // body
      addBox(-0.30, legH, -0.18, 0.30, legH + 0.44, 0.18, wool, 1.0);
      // head
      addBox( 0.32, legH + 0.20, -0.08, 0.56, legH + 0.44, 0.08, wool, 1.0);
      // horns (two small spikes)
      addBox( 0.36, legH + 0.44, -0.06, 0.40, legH + 0.58, -0.02, dark, 0.9);
      addBox( 0.48, legH + 0.44,  0.02, 0.52, legH + 0.58,  0.06, dark, 0.9);
      // beard
      addBox( 0.44, legH + 0.14, -0.02, 0.52, legH + 0.22,  0.02, dark, 0.85);
    } else if (t === 'Blaze') {
      // Fiery yellow-orange Nether mob: floating rod body with flame rods around it
      const core  = hexToRGB('#FFCC00');
      const flame = hexToRGB('#FF6600');
      const dark  = hexToRGB('#CC8800');
      // central body (vertical rod)
      addBox(-0.12, 0.20, -0.12, 0.12, 1.20, 0.12, core, 1.0);
      // head (slightly wider)
      addBox(-0.18, 1.10, -0.18, 0.18, 1.40, 0.18, core, 1.0);
      // eyes
      addBox(-0.10, 1.22, -0.19, -0.04, 1.30, -0.17, [0.1, 0.1, 0.1], 1.0);
      addBox( 0.04, 1.22, -0.19,  0.10, 1.30, -0.17, [0.1, 0.1, 0.1], 1.0);
      // flame rods orbiting the body (8 rods at different angles, simplified as 4 pairs)
      addBox(-0.50, 0.55, -0.04, -0.14, 0.65, 0.04, flame, 0.95);
      addBox( 0.14, 0.55, -0.04,  0.50, 0.65, 0.04, flame, 0.95);
      addBox(-0.04, 0.55, -0.50,  0.04, 0.65, -0.14, flame, 0.95);
      addBox(-0.04, 0.55,  0.14,  0.04, 0.65,  0.50, flame, 0.95);
      addBox(-0.50, 0.80, -0.04, -0.14, 0.90, 0.04, dark, 0.9);
      addBox( 0.14, 0.80, -0.04,  0.50, 0.90, 0.04, dark, 0.9);
      addBox(-0.04, 0.80, -0.50,  0.04, 0.90, -0.14, dark, 0.9);
      addBox(-0.04, 0.80,  0.14,  0.04, 0.90,  0.50, dark, 0.9);
    } else if (t === 'Ghast') {
      // Large white floating jellyfish-like mob with tentacles
      const body = hexToRGB('#F8F8F8');
      const eye  = hexToRGB('#CC2222');
      const tent = hexToRGB('#E0E0E0');
      // main cube body
      addBox(-0.55, 0.50, -0.55, 0.55, 1.40, 0.55, body, 1.0);
      // eyes (3 in a row on front face)
      addBox(-0.22, 0.88, -0.56, -0.10, 1.00, -0.54, eye, 1.0);
      addBox(-0.06, 0.88, -0.56,  0.06, 1.00, -0.54, eye, 1.0);
      addBox( 0.10, 0.88, -0.56,  0.22, 1.00, -0.54, eye, 1.0);
      // mouth slit
      addBox(-0.18, 0.76, -0.56,  0.18, 0.82, -0.54, [0.2, 0.2, 0.2], 1.0);
      // tentacles (9 hanging down)
      const tentOffsets = [[-0.40,-0.30,-0.20,0.10,0.20,0.30],[-0.40,-0.30,-0.20,0.10,0.20,0.30]];
      const txs = [-0.40, -0.20, 0.0, 0.20, 0.40, -0.30, -0.10, 0.10, 0.30];
      const tzs = [-0.40, -0.20, 0.0, 0.20, 0.40, -0.30, -0.10, 0.10, 0.30];
      for (let ti = 0; ti < 9; ti++) {
        const tx = txs[ti % txs.length];
        const tz = tzs[Math.floor(ti / 3) % tzs.length];
        const tlen = 0.25 + (ti % 3) * 0.12;
        addBox(tx - 0.04, 0.50 - tlen, tz - 0.04, tx + 0.04, 0.50, tz + 0.04, tent, 0.85);
      }
    } else if (t === 'Strider') {
      // Red Nether mob that walks on lava — tall thin legs, round body
      const body = hexToRGB('#CC4444');
      const leg  = hexToRGB('#882222');
      const eye  = hexToRGB('#FFCC00');
      const legH = 0.55;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, leg, 0.85);
      addBox( 0.06, 0, -0.08,  0.14, legH, 0.08, leg, 0.85);
      addBox(-0.32, legH, -0.28, 0.32, legH + 0.52, 0.28, body, 1.0);
      addBox(-0.10, legH + 0.44, -0.30, 0.10, legH + 0.56, -0.28, eye, 1.0);
      addBox(-0.10, legH + 0.44,  0.28, 0.10, legH + 0.56,  0.30, eye, 1.0);
      // mouth fringe
      addBox(-0.28, legH + 0.10, -0.30, 0.28, legH + 0.18, -0.28, leg, 0.9);
    } else if (t === 'Hoglin') {
      // Large pig-like Nether beast — brown, tusks, big head
      const body = hexToRGB('#8B4513');
      const tusk = hexToRGB('#F0E0C0');
      const dark = hexToRGB('#5C2E0A');
      const legH = 0.45;
      addBox(-0.30, 0, -0.14, -0.20, legH, 0.14, dark, 0.85);
      addBox( 0.20, 0, -0.14,  0.30, legH, 0.14, dark, 0.85);
      addBox(-0.30, 0,  0.06, -0.20, legH, 0.26, dark, 0.85);
      addBox( 0.20, 0,  0.06,  0.30, legH, 0.26, dark, 0.85);
      addBox(-0.44, legH, -0.22, 0.44, legH + 0.62, 0.22, body, 1.0);
      // big head
      addBox( 0.44, legH + 0.14, -0.18, 0.80, legH + 0.58, 0.18, body, 1.0);
      // tusks
      addBox( 0.80, legH + 0.18, -0.14, 0.96, legH + 0.24, -0.08, tusk, 1.0);
      addBox( 0.80, legH + 0.18,  0.08, 0.96, legH + 0.24,  0.14, tusk, 1.0);
    } else if (t === 'Armadillo') {
      // Small desert creature with armored shell
      const shell = hexToRGB('#A08060');
      const skin  = hexToRGB('#C8A070');
      const legH  = 0.18;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, skin, 0.85);
      addBox( 0.06, 0, -0.08,  0.06, legH, 0.08, skin, 0.85);
      addBox(-0.14, 0,  0.04, -0.06, legH, 0.12, skin, 0.85);
      addBox( 0.06, 0,  0.04,  0.14, legH, 0.12, skin, 0.85);
      // armored body (dome shape approximated with stacked boxes)
      addBox(-0.22, legH, -0.16, 0.22, legH + 0.22, 0.16, shell, 1.0);
      addBox(-0.18, legH + 0.18, -0.12, 0.18, legH + 0.32, 0.12, shell, 0.95);
      // head
      addBox( 0.22, legH + 0.04, -0.06, 0.38, legH + 0.18, 0.06, skin, 1.0);
    } else if (t === 'Llama') {
      // Tall camelid with fluffy body
      const wool = hexToRGB('#D4C090');
      const face = hexToRGB('#C0A870');
      const legH = 0.65;
      addBox(-0.18, 0, -0.10, -0.10, legH, 0.0,  wool, 0.85);
      addBox( 0.10, 0, -0.10,  0.18, legH, 0.0,  wool, 0.85);
      addBox(-0.18, 0,  0.04, -0.10, legH, 0.14, wool, 0.85);
      addBox( 0.10, 0,  0.04,  0.18, legH, 0.14, wool, 0.85);
      addBox(-0.30, legH, -0.18, 0.30, legH + 0.50, 0.18, wool, 1.0);
      // neck
      addBox( 0.28, legH + 0.14, -0.06, 0.40, legH + 0.50, 0.06, wool, 0.95);
      // head
      addBox( 0.40, legH + 0.28, -0.08, 0.62, legH + 0.50, 0.08, face, 1.0);
      // ears
      addBox( 0.44, legH + 0.50, -0.06, 0.48, legH + 0.60, -0.02, face, 0.9);
      addBox( 0.54, legH + 0.50,  0.02, 0.58, legH + 0.60,  0.06, face, 0.9);
    } else if (t === 'Parrot') {
      // Small colorful jungle bird
      const feather = hexToRGB('#22CC44');
      const beak    = hexToRGB('#FFCC00');
      const wing    = hexToRGB('#1188FF');
      const legH    = 0.12;
      addBox(-0.04, 0, -0.02, 0.0, legH, 0.02, feather, 0.85);
      addBox( 0.04, 0, -0.02, 0.08, legH, 0.02, feather, 0.85);
      addBox(-0.12, legH, -0.10, 0.12, legH + 0.22, 0.10, feather, 1.0);
      addBox(-0.20, legH + 0.06, -0.10, -0.12, legH + 0.18, 0.10, wing, 0.95);
      addBox( 0.12, legH + 0.06, -0.10,  0.20, legH + 0.18, 0.10, wing, 0.95);
      addBox( 0.12, legH + 0.08, -0.04, 0.22, legH + 0.16, 0.04, beak, 1.0);
      // tail feathers
      addBox(-0.06, legH, -0.14, 0.06, legH + 0.08, -0.10, wing, 0.9);
    } else if (t === 'Ocelot') {
      // Spotted jungle cat
      const fur  = hexToRGB('#D4A820');
      const spot = hexToRGB('#8B6010');
      const legH = 0.30;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, fur, 0.85);
      addBox( 0.06, 0, -0.08,  0.14, legH, 0.08, fur, 0.85);
      addBox(-0.14, 0,  0.06, -0.06, legH, 0.14, fur, 0.85);
      addBox( 0.06, 0,  0.06,  0.14, legH, 0.14, fur, 0.85);
      addBox(-0.22, legH, -0.14, 0.22, legH + 0.30, 0.14, fur, 1.0);
      addBox(-0.06, legH + 0.10, -0.04, 0.06, legH + 0.20, 0.04, spot, 0.9);
      addBox( 0.22, legH + 0.10, -0.08, 0.42, legH + 0.28, 0.08, fur, 1.0);
      // tail
      addBox(-0.28, legH + 0.14, -0.04, -0.22, legH + 0.28, 0.04, fur, 0.9);
    } else if (t === 'PolarBear') {
      // Large white bear
      const white = hexToRGB('#F0F0F0');
      const dark  = hexToRGB('#C8C8C8');
      const legH  = 0.50;
      addBox(-0.28, 0, -0.14, -0.18, legH, 0.14, dark, 0.85);
      addBox( 0.18, 0, -0.14,  0.28, legH, 0.14, dark, 0.85);
      addBox(-0.28, 0,  0.06, -0.18, legH, 0.26, dark, 0.85);
      addBox( 0.18, 0,  0.06,  0.28, legH, 0.26, dark, 0.85);
      addBox(-0.42, legH, -0.22, 0.42, legH + 0.60, 0.22, white, 1.0);
      addBox( 0.42, legH + 0.22, -0.14, 0.72, legH + 0.54, 0.14, white, 1.0);
      // ears
      addBox(-0.18, legH + 0.58, -0.04, -0.10, legH + 0.66, 0.04, white, 0.9);
      addBox( 0.10, legH + 0.58, -0.04,  0.18, legH + 0.66, 0.04, white, 0.9);
    } else if (t === 'Fox') {
      // Small orange fox with bushy tail
      const orange = hexToRGB('#D06020');
      const white  = hexToRGB('#F0F0F0');
      const dark   = hexToRGB('#2A1A0A');
      const legH   = 0.24;
      addBox(-0.10, 0, -0.06, -0.04, legH, 0.06, orange, 0.85);
      addBox( 0.04, 0, -0.06,  0.10, legH, 0.06, orange, 0.85);
      addBox(-0.10, 0,  0.04, -0.04, legH, 0.10, orange, 0.85);
      addBox( 0.04, 0,  0.04,  0.10, legH, 0.10, orange, 0.85);
      addBox(-0.20, legH, -0.14, 0.20, legH + 0.28, 0.14, orange, 1.0);
      addBox( 0.20, legH + 0.06, -0.08, 0.40, legH + 0.24, 0.08, orange, 1.0);
      // ears
      addBox(-0.12, legH + 0.28, -0.04, -0.06, legH + 0.38, 0.04, orange, 0.9);
      addBox( 0.06, legH + 0.28, -0.04,  0.12, legH + 0.38, 0.04, orange, 0.9);
      // bushy tail
      addBox(-0.26, legH + 0.04, -0.06, -0.20, legH + 0.22, 0.06, white, 0.9);
    } else if (t === 'Wolf') {
      // Grey wolf
      const grey = hexToRGB('#888888');
      const dark = hexToRGB('#555555');
      const legH = 0.36;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, grey, 0.85);
      addBox( 0.06, 0, -0.08,  0.14, legH, 0.08, grey, 0.85);
      addBox(-0.14, 0,  0.06, -0.06, legH, 0.14, grey, 0.85);
      addBox( 0.06, 0,  0.06,  0.14, legH, 0.14, grey, 0.85);
      addBox(-0.24, legH, -0.16, 0.24, legH + 0.36, 0.16, grey, 1.0);
      addBox( 0.24, legH + 0.08, -0.10, 0.48, legH + 0.30, 0.10, grey, 1.0);
      // ears
      addBox(-0.14, legH + 0.36, -0.04, -0.06, legH + 0.46, 0.04, dark, 0.9);
      addBox( 0.06, legH + 0.36, -0.04,  0.14, legH + 0.46, 0.04, dark, 0.9);
      // tail
      addBox(-0.30, legH + 0.18, -0.04, -0.24, legH + 0.34, 0.04, grey, 0.9);
    } else if (t === 'Deer') {
      // Brown deer with antlers
      const brown = hexToRGB('#C08040');
      const dark  = hexToRGB('#7A4820');
      const legH  = 0.55;
      addBox(-0.12, 0, -0.08, -0.04, legH, 0.08, dark, 0.85);
      addBox( 0.04, 0, -0.08,  0.12, legH, 0.08, dark, 0.85);
      addBox(-0.12, 0,  0.04, -0.04, legH, 0.12, dark, 0.85);
      addBox( 0.04, 0,  0.04,  0.12, legH, 0.12, dark, 0.85);
      addBox(-0.24, legH, -0.14, 0.24, legH + 0.42, 0.14, brown, 1.0);
      addBox( 0.24, legH + 0.14, -0.08, 0.46, legH + 0.38, 0.08, brown, 1.0);
      // antlers
      addBox(-0.08, legH + 0.42, -0.02, -0.04, legH + 0.58, 0.02, dark, 0.9);
      addBox( 0.04, legH + 0.42, -0.02,  0.08, legH + 0.58, 0.02, dark, 0.9);
      addBox(-0.14, legH + 0.52, -0.02, -0.08, legH + 0.56, 0.02, dark, 0.9);
      addBox( 0.08, legH + 0.52, -0.02,  0.14, legH + 0.56, 0.02, dark, 0.9);
    } else if (t === 'Frog') {
      // Small green frog — wide flat body, big eyes
      const green = hexToRGB('#448844');
      const light = hexToRGB('#88CC88');
      const eye   = hexToRGB('#FFCC00');
      const legH  = 0.10;
      // back legs (wide)
      addBox(-0.28, 0, -0.06, -0.14, legH, 0.06, green, 0.85);
      addBox( 0.14, 0, -0.06,  0.28, legH, 0.06, green, 0.85);
      // body (flat and wide)
      addBox(-0.22, legH, -0.18, 0.22, legH + 0.18, 0.18, green, 1.0);
      addBox(-0.16, legH + 0.14, -0.14, 0.16, legH + 0.24, 0.14, light, 0.95);
      // head
      addBox(-0.18, legH + 0.14, -0.20, 0.18, legH + 0.28, -0.18, green, 1.0);
      // eyes (bulging)
      addBox(-0.16, legH + 0.26, -0.22, -0.08, legH + 0.34, -0.14, eye, 1.0);
      addBox( 0.08, legH + 0.26, -0.22,  0.16, legH + 0.34, -0.14, eye, 1.0);
    } else if (t === 'Axolotl') {
      // Pink aquatic salamander with feathery gills
      const pink = hexToRGB('#FF88AA');
      const gill = hexToRGB('#FF4488');
      const legH = 0.12;
      addBox(-0.14, 0, -0.06, -0.06, legH, 0.06, pink, 0.85);
      addBox( 0.06, 0, -0.06,  0.14, legH, 0.06, pink, 0.85);
      addBox(-0.14, 0,  0.04, -0.06, legH, 0.10, pink, 0.85);
      addBox( 0.06, 0,  0.04,  0.14, legH, 0.10, pink, 0.85);
      addBox(-0.22, legH, -0.14, 0.22, legH + 0.20, 0.14, pink, 1.0);
      addBox( 0.22, legH + 0.04, -0.06, 0.40, legH + 0.16, 0.06, pink, 1.0);
      // gills (feathery spikes on sides of head)
      addBox(-0.26, legH + 0.14, -0.04, -0.22, legH + 0.26, 0.04, gill, 0.9);
      addBox( 0.22, legH + 0.14, -0.04,  0.26, legH + 0.26, 0.04, gill, 0.9);
      // tail
      addBox(-0.28, legH + 0.06, -0.04, -0.22, legH + 0.18, 0.04, pink, 0.9);
    } else if (t === 'Turtle') {
      // Green turtle with domed shell
      const shell = hexToRGB('#44AA44');
      const skin  = hexToRGB('#228822');
      const legH  = 0.10;
      addBox(-0.28, 0, -0.08, -0.18, legH, 0.08, skin, 0.85);
      addBox( 0.18, 0, -0.08,  0.28, legH, 0.08, skin, 0.85);
      addBox(-0.28, 0,  0.04, -0.18, legH, 0.12, skin, 0.85);
      addBox( 0.18, 0,  0.04,  0.28, legH, 0.12, skin, 0.85);
      // domed shell
      addBox(-0.32, legH, -0.22, 0.32, legH + 0.28, 0.22, shell, 1.0);
      addBox(-0.26, legH + 0.24, -0.16, 0.26, legH + 0.38, 0.16, shell, 0.95);
      // head
      addBox( 0.32, legH + 0.04, -0.08, 0.50, legH + 0.18, 0.08, skin, 1.0);
    } else if (t === 'Dolphin') {
      // Blue-grey dolphin
      const blue = hexToRGB('#6688CC');
      const light = hexToRGB('#AABBEE');
      // body (horizontal, elongated)
      addBox(-0.50, 0.30, -0.14, 0.50, 0.60, 0.14, blue, 1.0);
      // head/snout
      addBox( 0.50, 0.32, -0.10, 0.76, 0.56, 0.10, blue, 1.0);
      addBox( 0.76, 0.36, -0.06, 0.90, 0.50, 0.06, light, 1.0);
      // dorsal fin
      addBox(-0.04, 0.60, -0.02, 0.08, 0.80, 0.02, blue, 0.9);
      // tail flukes
      addBox(-0.56, 0.28, -0.18, -0.50, 0.36, -0.10, blue, 0.9);
      addBox(-0.56, 0.28,  0.10, -0.50, 0.36,  0.18, blue, 0.9);
      // pectoral fins
      addBox( 0.20, 0.22, -0.18, 0.36, 0.30, -0.14, blue, 0.9);
      addBox( 0.20, 0.22,  0.14, 0.36, 0.30,  0.18, blue, 0.9);
    } else if (t === 'Rabbit') {
      // Small brown rabbit with long ears
      const fur  = hexToRGB('#C8A070');
      const dark = hexToRGB('#8B6040');
      const legH = 0.18;
      addBox(-0.10, 0, -0.06, -0.04, legH, 0.06, fur, 0.85);
      addBox( 0.04, 0, -0.06,  0.10, legH, 0.06, fur, 0.85);
      addBox(-0.14, legH, -0.12, 0.14, legH + 0.22, 0.12, fur, 1.0);
      addBox( 0.14, legH + 0.06, -0.06, 0.28, legH + 0.20, 0.06, fur, 1.0);
      // long ears
      addBox(-0.08, legH + 0.22, -0.03, -0.02, legH + 0.44, 0.03, fur, 0.9);
      addBox( 0.02, legH + 0.22, -0.03,  0.08, legH + 0.44, 0.03, fur, 0.9);
      // inner ear
      addBox(-0.07, legH + 0.24, -0.02, -0.03, legH + 0.42, 0.02, dark, 0.85);
      addBox( 0.03, legH + 0.24, -0.02,  0.07, legH + 0.42, 0.02, dark, 0.85);
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
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
    if (aAlpha >= 0) {
      gl.disableVertexAttribArray(aAlpha);
      gl.vertexAttrib1f(aAlpha, 1.0);
    }
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
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
    if (aAlpha >= 0) {
      gl.disableVertexAttribArray(aAlpha);
      gl.vertexAttrib1f(aAlpha, 1.0);
    }
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.weaponMeshes.set(itemId, { vao, vbo, ibo, indexCount: idx.length });
  }

  /** Build a highlight wireframe cube for the targeted block */
  private highlightVAO: WebGLVertexArrayObject | null = null;
  private highlightVBO: WebGLBuffer | null = null;

  drawHighlight(wx: number, wy: number, wz: number, mvp: Float32Array, onTop: boolean = false, r: number = 0, g: number = 0, b: number = 0): void {
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
      // Disable color attribute (use tint uniforms)
      const aColor = gl.getAttribLocation(this.program, 'aColor');
      gl.disableVertexAttribArray(aColor);
      // default white so tint works
      gl.vertexAttrib3f(aColor, 1, 1, 1);
      const aBright = gl.getAttribLocation(this.program, 'aBrightness');
      gl.disableVertexAttribArray(aBright);
      gl.vertexAttrib1f(aBright, 2.0);
      const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');
      if (aAlpha >= 0) {
        gl.disableVertexAttribArray(aAlpha);
        gl.vertexAttrib1f(aAlpha, 1.0);
      }
      gl.bindVertexArray(null);
      this.highlightVAO = vao;
      this.highlightVBO = vbo;
    }
    const t = translationMatrix(wx, wy, wz);
    const finalMVP = multiplyMat4(mvp, t);
    // Use tint for highlight color (normalized 0-1)
    gl.uniform3f(this.uTint, r, g, b);
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
    // Restore tint
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
  }

  dispose(): void {
    const gl = this.gl;
    for (const [, m] of this.meshes) {
      if (m.vbo) gl.deleteBuffer(m.vbo);
      if (m.ibo) gl.deleteBuffer(m.ibo);
      if (m.vao) gl.deleteVertexArray(m.vao);
      if (m.waterVbo) gl.deleteBuffer(m.waterVbo);
      if (m.waterIbo) gl.deleteBuffer(m.waterIbo);
      if (m.waterVao) gl.deleteVertexArray(m.waterVao);
    }
    this.meshes.clear();
    for (const [, m] of this.netherMeshes) {
      if (m.vbo) gl.deleteBuffer(m.vbo);
      if (m.ibo) gl.deleteBuffer(m.ibo);
      if (m.vao) gl.deleteVertexArray(m.vao);
      if (m.lavaVbo) gl.deleteBuffer(m.lavaVbo);
      if (m.lavaIbo) gl.deleteBuffer(m.lavaIbo);
      if (m.lavaVao) gl.deleteVertexArray(m.lavaVao);
    }
    this.netherMeshes.clear();
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

function rotationXMatrix(theta: number): Float32Array {
  const c = Math.cos(theta), s = Math.sin(theta);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
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
