/**
 * WebGL chunk-based block renderer.
 * Renders visible faces only, one draw call per chunk mesh.
 */
import {
  BlockId, BLOCK_COLORS, BlockColor, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL,
  RENDER_DISTANCE, DCPlayer, ITEM_COLORS, ItemId, getBlockHealth
} from './digcraft-types';
import { Chunk } from './digcraft-world';
import { BiomeId } from './digcraft-biome';

// ──── Shader sources ────
// aBrightness encodes directional face shading AND baked block-light.
// uAmbient scales sky contribution (1.0=day, 0.15=night).
// Block-lit faces have aBrightness > 1 so they stay bright at night.
// Two shader variants: desktop has point-light loop, mobile skips it entirely.
const MAX_POINT_LIGHTS = 3;
const TRANSPARENT_BLOCKS = new Set([
  BlockId.AIR,
  BlockId.LEAVES,
  BlockId.WATER,
  BlockId.SHRUB,
  BlockId.TREE,
  BlockId.TALLGRASS,
  BlockId.CHEST,
  BlockId.BONFIRE,
  BlockId.WINDOW_OPEN, BlockId.DOOR_OPEN,
  BlockId.SEAWEED,
  BlockId.CACTUS,
  BlockId.BAMBOO,
  BlockId.TORCH,
  BlockId.NETHER_STALACTITE, BlockId.NETHER_STALAGMITE,
  BlockId.CAULDRON, BlockId.CAULDRON_LAVA, BlockId.CAULDRON_WATER,
  BlockId.LAVA]);

// Desktop vertex shader — includes point-light distance loop
const VS_DESKTOP = `
  attribute vec3 aPos;
  attribute vec3 aColor;
  attribute float aBrightness;
  attribute float aAlpha;
  uniform mat4 uMVP;
  uniform vec3 uTint;
  uniform float uAmbient;
  uniform float uHeldTorchLight;
  uniform vec4 uPointLights[3];
  varying vec3 vColor;
  varying float vFog;
  varying float vAlpha;
  void main() {
    float skyLight   = min(aBrightness, 1.0) * uAmbient;
    float blockLight = max(0.0, aBrightness - 1.0);
    float ptLight = uHeldTorchLight;
    for (int i = 0; i < 3; i++) {
      float r = uPointLights[i].w;
      if (r > 0.0) {
        float d = length(aPos - uPointLights[i].xyz);
        if (d < r) ptLight = max(ptLight, (r - d) / r);
      }
    }
    float finalBright = max(skyLight, max(blockLight, ptLight));
    vColor = aColor * finalBright * uTint;
    vAlpha = aAlpha;
    gl_Position = uMVP * vec4(aPos, 1.0);
    vFog = clamp(gl_Position.z / 120.0, 0.0, 1.0);
  }
`;

// Mobile vertex shader — no point-light loop, includes torch-based face shading
const VS_MOBILE = `
  attribute vec3 aPos;
  attribute vec3 aColor;
  attribute float aBrightness;
  attribute float aAlpha;
  uniform mat4 uMVP;
  uniform vec3 uTint;
  uniform float uAmbient;
  uniform float uHeldTorchLight;
  varying vec3 vColor;
  varying float vFog;
  varying float vAlpha;
  void main() {
    float skyLight = min(aBrightness, 1.0) * uAmbient;
    float blockLight = max(0.0, aBrightness - 1.0);
    // Face shading: based on which direction the face points (in local space)
    // Top face (y+) = 1.0, sides = 0.8, bottom = 0.6
    float faceShade = 0.6;
    if (abs(aPos.y - 1.0) < 0.01) faceShade = 1.0;
    else if (abs(aPos.y - 0.0) < 0.01) faceShade = 0.6;
    else if (abs(aPos.x - 0.0) < 0.01 || abs(aPos.x - 1.0) < 0.01 || abs(aPos.z - 0.0) < 0.01 || abs(aPos.z - 1.0) < 0.01) faceShade = 0.8;
    // Combine: torch adds face-shaded light, not uniform
    float torchLight = uHeldTorchLight * faceShade;
    float finalBright = max(skyLight, max(blockLight, torchLight));
    vColor = aColor * finalBright * uTint;
    vAlpha = aAlpha;
    gl_Position = uMVP * vec4(aPos, 1.0);
    vFog = clamp(gl_Position.z / 120.0, 0.0, 1.0);
  }
`;

// Alias — resolved at construction time based on lowEndMode
let VS = VS_DESKTOP; // overridden in constructor if mobile

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

// Watch face patterns for digital clock display (5x3 grid for "A HH:MM" = A, H, H, M, M)
// The grid shows 5 characters, each needing 3x5 pixel blocks
// '.' = off/dark, '1' = lit/red, 'A'/'P' = AM/PM indicator, '0'-'9' = digit
const WATCH_PATTERNS: Record<string, string[]> = {
  // 5 columns x 3 rows grid pattern
  // Positions: 0=AM/PM indicator, 1-2=hour tens+units, 3-4=minute tens+units
  empty: [
    '.....',
    '.....',
    '.....'
  ],
  // Simple 7-segment style digits (using 3x5 grid per digit, but we'll use simpler 2x3 for watch display)
  '0': ['1.1', '.1.', '1.1', '1.1', '111'],
  '1': ['.1.', '.1.', '.1.', '.1.', '.1.'],
  '2': ['111', '..1', '111', '1..', '111'],
  '3': ['111', '..1', '111', '..1', '111'],
  '4': ['1.1', '1.1', '111', '..1', '..1'],
  '5': ['111', '1..', '111', '..1', '111'],
  '6': ['111', '1..', '111', '1.1', '111'],
  '7': ['111', '..1', '..1', '..1', '..1'],
  '8': ['111', '1.1', '111', '1.1', '111'],
  '9': ['111', '1.1', '111', '..1', '111'],
  'A': ['1.1', '1.1', '111', '1.1', '1.1'],
  'P': ['111', '1.1', '111', '1..', '1..'],
  ':': ['.', '1', '.', '1', '.'],
};

// Simple blocky face patterns (8x8 grid). Each pattern uses a palette mapping
// single-character keys to hex colors. '.' means transparent/no block.
const FACE_PATTERNS: Record<string, { grid: string[]; palette: Record<string, string> }> = {
  default: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '........',
      '...22...',
      '..2222..',
      '........'
    ], palette: { '1': '#000000', '2': '#000000' }
  },
  smile: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '.1....1.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000' }
  },
  wink: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '.1....1.',
      '...11...',
      '..1.11..',
      '........'
    ], palette: { '1': '#000000' }
  },
  sad: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '..1..1..',
      '.11111..',
      '........',
      '........'
    ], palette: { '1': '#000000' }
  },
  angry: {
    grid: [
      '.1....1.',
      '.11..11.',
      '........',
      '.1....1.',
      '.111111.',
      '..1111..',
      '........',
      '........'
    ], palette: { '1': '#000000' }
  },
  cool: {
    grid: [
      '........',
      '.222222.',
      '.2....2.',
      '.222222.',
      '.1....1.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '2': '#222222' }
  },
  surprised: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '........',
      '...33...',
      '..3..3..',
      '........'
    ], palette: { '1': '#000000', '3': '#ff6b6b' }
  },
  robot: {
    grid: [
      '.333333.',
      '.3....3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3....3.',
      '.333333.',
      '........',
      '........'
    ], palette: { '3': '#6b6b6b' }
  },
  alien: {
    grid: [
      '........',
      '..4444..',
      '.4.44.4.',
      '.4.44.4.',
      '.444444.',
      '...44...',
      '........',
      '........'
    ], palette: { '4': '#22ff66' }
  },
  cat: {
    grid: [
      '........',
      '.5.55.5.',
      '.5....5.',
      '.5....5.',
      '.55..55.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '5': '#000000', '1': '#000000' }
  },
  dog: {
    grid: [
      '........',
      '.6.66.6.',
      '.6....6.',
      '.6....6.',
      '.66..66.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '6': '#4b2f1e', '1': '#000000' }
  },
  skull: {
    grid: [
      '..7777..',
      '.7....7.',
      '.7.77.7.',
      '.7.77.7.',
      '.7....7.',
      '..7777..',
      '........',
      '........'
    ], palette: { '7': '#f5f5f5' }
  }
  ,
  pirate: {
    grid: [
      '..4444..',
      '.44..44.',
      '.4.11.4.',
      '.4..99..',
      '.4.444..',
      '..4444..',
      '........',
      '........'
    ], palette: { '4': '#22aa22', '1': '#000000', '9': '#ffcc00' }
  },
  moustache: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '........',
      '.11..11.',
      '..1111..',
      '........'
    ], palette: { '1': '#000000' }
  },
  sick: {
    grid: [
      '........',
      '.1....1.',
      '........',
      '.2....2.',
      '.2....2.',
      '...33...',
      '..3..3..',
      '........'
    ], palette: { '1': '#000000', '2': '#ff4444', '3': '#44ff44' }
  },
  tongue: {
    grid: [
      '........',
      '........',
      '.1....1.',
      '........',
      '........',
      '...11...',
      '..3333..',
      '...33...'
    ], palette: { '1': '#000000', '3': '#ff6688' }
  },
  monocle: {
    grid: [
      '........',
      '..4444..',
      '.4.11.4.',
      '.4....4.',
      '.4....4.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '4': '#ffd700' }
  },
  glasses: {
    grid: [
      '........',
      '..4444..',
      '.44.44.4.',
      '.4....4.',
      '.4....4.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '4': '#222222' }
  },
  bandana: {
    grid: [
      '..3333..',
      '.333333.',
      '.3.33.3.',
      '.3.33.3.',
      '........',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '3': '#ff4444' }
  },
  hero: {
    grid: [
      '..5555..',
      '.55..55.',
      '.5.55.5.',
      '.5.55.5.',
      '.5....5.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '5': '#2244ff' }
  },
  villain: {
    grid: [
      '...11...',
      '..1..1..',
      '.1.11.1.',
      '.1.11.1.',
      '.1....1.',
      '...11...',
      '..4444..',
      '........'
    ], palette: { '1': '#000000', '4': '#ff0000' }
  },
  bunny: {
    grid: [
      '..66..66',
      '.6.66.6.',
      '.6....6.',
      '.6....6.',
      '.6....6.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '6': '#ffffff' }
  },
  ghost: {
    grid: [
      '.222222.',
      '.2....2.',
      '.2.22.2.',
      '.2.22.2.',
      '.2.22.2.',
      '.2.22.2.',
      '.222222.',
      '...11...'
    ], palette: { '1': '#000000', '2': '#ffffff' }
  },
  zombie: {
    grid: [
      '........',
      '..7777..',
      '.7....7.',
      '.7.11.7.',
      '.7.11.7.',
      '.777777.',
      '........',
      '........'
    ], palette: { '1': '#000000', '7': '#44aa44' }
  },
  vampire: {
    grid: [
      '..3333..',
      '.3.33.3.',
      '.3.33.3.',
      '.3....3.',
      '.3.11.3.',
      '.3.11.3.',
      '.333333.',
      '...11...'
    ], palette: { '1': '#000000', '3': '#ff0000' }
  },
  ninja: {
    grid: [
      '..4444..',
      '.44..44.',
      '.4.44.4.',
      '.4.44.4.',
      '.44..44.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '4': '#222222' }
  },
  dragon: {
    grid: [
      '.66..66.',
      '.6.66.6.',
      '.6.66.6.',
      '.66..66.',
      '.6.66.6.',
      '...11...',
      '..1111..',
      '...11...'
    ], palette: { '1': '#000000', '6': '#44ff44' }
  },
  demon: {
    grid: [
      '.555555.',
      '.5.55.5.',
      '.5.55.5.',
      '.5.55.5.',
      '.5....5.',
      '...33...',
      '..3..3..',
      '........'
    ], palette: { '1': '#000000', '3': '#ff0000', '5': '#222222' }
  },
  angel: {
    grid: [
      '..3333..',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '...11...',
      '..1111..',
      '...11...'
    ], palette: { '1': '#000000', '3': '#ffffff' }
  },
  // Additional creative faces (30 more)
  spark: {
    grid: [
      '....11..',
      '...1.1..',
      '..1...1.',
      '.1.....1',
      '.1.....1',
      '..1...1.',
      '...1.1..',
      '....11..'
    ], palette: { '1': '#ffff00' }
  },
  love: {
    grid: [
      '..3333..',
      '.3.33.3.',
      '.3.33.3.',
      '.333333.',
      '.333333.',
      '..3333..',
      '...33...',
      '.... ....'
    ], palette: { '3': '#ff3366' }
  },
  confuse: {
    grid: [
      '........',
      '.1....1.',
      '........',
      '..1..1..',
      '...11...',
      '...11...',
      '..1..1..',
      '........'
    ], palette: { '1': '#000000' }
  },
  meh: {
    grid: [
      '........',
      '.1....1.',
      '........',
      '...11...',
      '........',
      '...11...',
      '..1..1..',
      '........'
    ], palette: { '1': '#000000' }
  },
  shy: {
    grid: [
      '...11...',
      '..1..1..',
      '.1....1.',
      '........',
      '..5555..',
      '.55..55.',
      '.555555.',
      '........'
    ], palette: { '1': '#000000', '5': '#ff9999' }
  },
  winkTongue: {
    grid: [
      '........',
      '.1....2.',
      '........',
      '.1....1.',
      '...11...',
      '...33...',
      '..333333',
      '...33...'
    ], palette: { '1': '#000000', '2': '#000000', '3': '#ff6688' }
  },
  coolSunglasses: {
    grid: [
      '........',
      '.666666.',
      '.6.11.6.',
      '.6.11.6.',
      '.6.11.6.',
      '...11...',
      '..1111..',
      '........'
    ], palette: { '1': '#000000', '6': '#111111' }
  },
  cyber: {
    grid: [
      '..5555..',
      '.5.55.5.',
      '.5.11.5.',
      '.5.11.5.',
      '.5.11.5.',
      '..5.5...',
      '..555...',
      '........'
    ], palette: { '1': '#00ff00', '5': '#003300' }
  },
  clown: {
    grid: [
      '........',
      '.3.33.3.',
      '.3.33.3.',
      '..3333..',
      '.1....1.',
      '.1.11.1.',
      '.111111.',
      '........'
    ], palette: { '1': '#000000', '3': '#ff0000' }
  },
  mask: {
    grid: [
      '........',
      '..5555..',
      '.5.55.5.',
      '.5.55.5.',
      '.5.55.5.',
      '.5.55.5.',
      '..5555..',
      '...11...'
    ], palette: { '1': '#000000', '5': '#ff4444' }
  },
  samurai: {
    grid: [
      '.5.55.5.',
      '.5.55.5.',
      '.5.55.5.',
      '.555555.',
      '.5.55.5.',
      '.5.55.5.',
      '.555555.',
      '...11...'
    ], palette: { '1': '#000000', '5': '#888888' }
  },
  wizard: {
    grid: [
      '..3333..',
      '.3.33.3.',
      '.3.33.3.',
      '.333333.',
      '.3.33.3.',
      '.3.55.3.',
      '.355553.',
      '...33...'
    ], palette: { '1': '#000000', '3': '#6600cc', '5': '#ff9900' }
  },
  pirateEye: {
    grid: [
      '..4444..',
      '.44..44.',
      '.4.11.4.',
      '.44..44.',
      '.4.444..',
      '..4444..',
      '.666666.',
      '........'
    ], palette: { '1': '#000000', '4': '#22aa22', '6': '#ffaa00' }
  },
  vampireTeeth: {
    grid: [
      '..5555..',
      '.5.55.5.',
      '.5.55.5.',
      '.5.55.5.',
      '.5.11.5.',
      '.5.55.5.',
      '.555555.',
      '..1..1..'
    ], palette: { '1': '#ffffff', '5': '#880000' }
  },
  werewolf: {
    grid: [
      '.6.66.6.',
      '.6.66.6.',
      '.6.66.6.',
      '.666666.',
      '.6.11.6.',
      '.6.11.6.',
      '..1111..',
      '.3..3.3.'
    ], palette: { '1': '#000000', '3': '#444444', '6': '#664422' }
  },
  alien2: {
    grid: [
      '.333333.',
      '.3.33.3.',
      '.3.33.3.',
      '.333333.',
      '.3.33.3.',
      '.3.33.3.',
      '..3333..',
      '...11...'
    ], palette: { '1': '#000000', '3': '#00ff88' }
  },
  robot2: {
    grid: [
      '.333333.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.333333.'
    ], palette: { '3': '#666666' }
  },
  creeper: {
    grid: [
      '.3.33.3.',
      '.3.33.3.',
      '.333333.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.'
    ], palette: { '3': '#00aa00' }
  },
  slime: {
    grid: [
      '........',
      '.22.22..',
      '.22.22..',
      '.222222.',
      '.222222.',
      '.2.22.2.',
      '.2.22.2.',
      '...11...'
    ], palette: { '1': '#000000', '2': '#88ff88' }
  },
  ghost2: {
    grid: [
      '.333333.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '.333333.',
      '.333333.',
      '...11...'
    ], palette: { '1': '#000000', '3': '#ffffff' }
  },
  pumpkin: {
    grid: [
      '.666666.',
      '.6.66.6.',
      '.6.66.6.',
      '.6.66.6.',
      '.6.66.6.',
      '.666666.',
      '.555555.',
      '.1.11.1.'
    ], palette: { '1': '#000000', '5': '#ff8800', '6': '#ff6600' }
  },
  snowman: {
    grid: [
      '..6666..',
      '.6.66.6.',
      '.6.11.6.',
      '.6.11.6.',
      '..6666..',
      '...11...',
      '..1..1..',
      '........'
    ], palette: { '1': '#000000', '6': '#ffffff' }
  },
  heartEyes: {
    grid: [
      '.1....1.',
      '1.11.11.',
      '1.11.11.',
      '.111111.',
      '.111111.',
      '..1111..',
      '...11...',
      '........'
    ], palette: { '1': '#ff0000' }
  },
  crying: {
    grid: [
      '.1....1.',
      '.1.33.1.',
      '...33...',
      '..3.3..',
      '.1.33.1.',
      '.1.33.1.',
      '.1.11.1.',
      '........'
    ], palette: { '1': '#000000', '3': '#4488ff' }
  },
  sleeping: {
    grid: [
      '........',
      '...11...',
      '.1.11.1.',
      '.1.11.1.',
      '..1111..',
      '..1111..',
      '.111111.',
      '........'
    ], palette: { '1': '#000000' }
  },
  dizzy: {
    grid: [
      '.1....1.',
      '..1..1..',
      '...11...',
      '..1.1.1.',
      '.1.1.1..',
      '.1.1.1..',
      '..1.1...',
      '........'
    ], palette: { '1': '#000000' }
  },
  rich: {
    grid: [
      '..4444..',
      '.44..44.',
      '.4.44.4.',
      '.44..44.',
      '...11...',
      '...11...',
      '...11...',
      '........'
    ], palette: { '1': '#000000', '4': '#ffd700' }
  },
  brain: {
    grid: [
      '.222222.',
      '2.1.1.1.2',
      '.1.1.1.1.',
      '.1.1.1.1.',
      '.1.1.1.1.',
      '.1.1.1.1.',
      '.222222.',
      '........'
    ], palette: { '1': '#ff88cc', '2': '#ffaaee' }
  },
  alien3: {
    grid: [
      '...11...',
      '..1..1..',
      '.1.11.1.',
      '..1.11..',
      '.1.11.1.',
      '.1.11.1.',
      '...11...',
      '........'
    ], palette: { '1': '#000000' }
  },
  fire: {
    grid: [
      '....3...',
      '...3.3..',
      '..3.33..',
      '.3.333.3',
      '..3333..',
      '...33...',
      '..3..3..',
      '........'
    ], palette: { '3': '#ff4400' }
  },
  flower: {
    grid: [
      '..3.3...',
      '.3.3.3..',
      '.3.3.3.',
      '..3333..',
      '...11...',
      '..1.1..',
      '..1.1..',
      '........'
    ], palette: { '1': '#000000', '3': '#ff66cc' }
  },
  leaf: {
    grid: [
      '...33...',
      '..3.3...',
      '.3.33.3.',
      '.3.33.3.',
      '.3.33.3.',
      '..3.3...',
      '...33...',
      '........'
    ], palette: { '3': '#22aa00' }
  },
  star: {
    grid: [
      '....3...',
      '...3.3..',
      '..3.3.3.',
      '.3.333.3',
      '..33333..',
      '.3.333.3.',
      '...3.3..',
      '........'
    ], palette: { '3': '#ffff00' }
  }
};

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

export interface CrumbleParticle {
  wx: number;
  wy: number;
  wz: number;
  color: { r: number; g: number; b: number };
  startTime: number;
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
  uAmbient: WebGLUniformLocation;
  uHeldTorchLight: WebGLUniformLocation;
  uPointLights: (WebGLUniformLocation | null)[] = [];
  private _currentAmbient = 1.0;
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
  /** On low-end/mobile: render water as opaque to skip the expensive transparent pass */
  public lowEndMode: boolean = false;

  /** Desktop mode: true when not on mobile (used for shiny effects) */
  public get isDesktop(): boolean { return !this.lowEndMode; }

  // Track last player positions to determine movement for bobbing
  private lastPlayerStates: Map<number, { x: number; y: number; z: number; t: number }> = new Map();

  // Cached weapon meshes by item id
  private weaponMeshes: Map<number, WeaponMesh> = new Map();
  // Cached mob meshes by mob type (e.g. 'Pig','Cow','Sheep')
  private mobMeshes: Map<string, WeaponMesh> = new Map();

  // Sky / fog colour
  skyR = 0.53;
  skyG = 0.81;
  skyB = 0.92;
  private userFaces: { id: number; gridData: string; paletteData: string }[] = [];

  /** Update the fog/clear color (useful to match day/night sky) */
  public setFogColor(r: number, g: number, b: number): void {
    this.skyR = r; this.skyG = g; this.skyB = b;
    if (this.gl && this.uFogColor) {
      this.gl.uniform3f(this.uFogColor, r, g, b);
      this.gl.clearColor(r, g, b, 0);
    }
  }

  /** Set ambient light level: 1.0 = full day, 0.15 = night minimum */
  public setAmbient(level: number): void {
    this._currentAmbient = Math.max(0.05, Math.min(1.0, level));
    if (this.gl && this.uAmbient) this.gl.uniform1f(this.uAmbient, this._currentAmbient);
  }

  /** Update point lights for the current frame (desktop only — no-op on mobile). */
  public setPointLights(lights: Array<{ x: number; y: number; z: number; radius: number }>): void {
    // if (this.lowEndMode) return; // mobile uses no point lights
    const gl = this.gl;
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const loc = this.uPointLights[i];
      if (!loc) continue;
      const l = lights[i];
      if (l) gl.uniform4f(loc, l.x, l.y, l.z, l.radius);
      else gl.uniform4f(loc, 0, 0, 0, 0);
    }
  }

  /** Set user-created faces for rendering */
  public setUserFaces(faces: { id: number; gridData: string; paletteData: string }[]): void {
    this.userFaces = faces || [];
  }

  constructor(canvas: HTMLCanvasElement, userFaces?: { id: number; gridData: string; paletteData: string }[]) {
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

    // Compile shaders — pick mobile (no point-lights) or desktop variant
    const vsSource = this.lowEndMode ? VS_MOBILE : VS_DESKTOP;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FS);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    this.uMVP = gl.getUniformLocation(this.program, 'uMVP')!;
    this.uFogColor = gl.getUniformLocation(this.program, 'uFogColor')!;
    this.uTint = gl.getUniformLocation(this.program, 'uTint')!;
    this.uAmbient = gl.getUniformLocation(this.program, 'uAmbient')!;
    this.uHeldTorchLight = gl.getUniformLocation(this.program, 'uHeldTorchLight')!;
    // Point-light uniforms only exist in the desktop shader
    if (!this.lowEndMode) {
      for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
        this.uPointLights.push(gl.getUniformLocation(this.program, `uPointLights[${i}]`));
      }
    }
    gl.uniform3f(this.uFogColor, this.skyR, this.skyG, this.skyB);
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniform1f(this.uAmbient, 1.0);
    gl.uniform1f(this.uHeldTorchLight, 0.0);
    if (!this.lowEndMode) {
      for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
        if (this.uPointLights[i]) gl.uniform4f(this.uPointLights[i]!, 0, 0, 0, 0);
      }
    }

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

  private watchBlockPositions: Map<string, number> = new Map();

  // NOTE: worker pool and seq tracking moved to ChunkLoader



  setWatchBlocks(watchBlocks: Map<string, number>): void {
    this.watchBlockPositions = watchBlocks;
  }

  /**
   * Offload mesh generation for a single chunk to a Web Worker.
   * neighborChunks: mapping from "cx,cz" -> { cx, cz, blocks, biomeColumn, waterLevel?, fluidIsSource? }
   */
  _applyMeshWorkerResult(msg: any): void {
    try {
      const key = msg.key as string;
      const [resCx, resCz] = key.split(',').map((s: string) => Number(s));
      const vData: Float32Array = msg.vData as Float32Array;
      const iData: Uint32Array  = msg.iData as Uint32Array;
      const gl = this.gl;

      // Free any old GL objects for this key.
      const old = this.meshes.get(key);
      if (old) {
        if (old.vbo)      gl.deleteBuffer(old.vbo);
        if (old.ibo)      gl.deleteBuffer(old.ibo);
        if (old.vao)      gl.deleteVertexArray(old.vao);
        if (old.waterVbo) gl.deleteBuffer(old.waterVbo);
        if (old.waterIbo) gl.deleteBuffer(old.waterIbo);
        if (old.waterVao) gl.deleteVertexArray(old.waterVao);
        if (old.lavaVbo)  gl.deleteBuffer(old.lavaVbo);
        if (old.lavaIbo)  gl.deleteBuffer(old.lavaIbo);
        if (old.lavaVao)  gl.deleteVertexArray(old.lavaVao);
      }

      const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
      const aPos        = gl.getAttribLocation(this.program, 'aPos');
      const aColor      = gl.getAttribLocation(this.program, 'aColor');
      const aBrightness = gl.getAttribLocation(this.program, 'aBrightness');
      const aAlpha      = gl.getAttribLocation(this.program, 'aAlpha');

      const setupVAO = (verts: Float32Array, indices: Uint32Array): {
        vao: WebGLVertexArrayObject | null;
        vbo: WebGLBuffer | null;
        ibo: WebGLBuffer | null;
      } => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        if (aPos >= 0)        { gl.enableVertexAttribArray(aPos);        gl.vertexAttribPointer(aPos,        3, gl.FLOAT, false, stride, 0); }
        if (aColor >= 0)      { gl.enableVertexAttribArray(aColor);      gl.vertexAttribPointer(aColor,      3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT); }
        if (aBrightness >= 0) { gl.enableVertexAttribArray(aBrightness); gl.vertexAttribPointer(aBrightness, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT); }
        if (aAlpha >= 0)      { gl.enableVertexAttribArray(aAlpha);      gl.vertexAttribPointer(aAlpha,      1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT); }
        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return { vao, vbo, ibo };
      };

      const { vao, vbo, ibo } = setupVAO(vData, iData);
      const mesh: ChunkMesh = {
        vao, vbo, ibo, indexCount: iData.length,
        cx: resCx, cz: resCz,
        waterVao: null, waterVbo: null, waterIbo: null, waterIndexCount: 0,
        lavaVao:  null, lavaVbo:  null, lavaIbo:  null, lavaIndexCount:  0,
      };

      if (msg.wVData && msg.wIData) {
        try {
          const r = setupVAO(msg.wVData as Float32Array, msg.wIData as Uint32Array);
          mesh.waterVao = r.vao; mesh.waterVbo = r.vbo; mesh.waterIbo = r.ibo;
          mesh.waterIndexCount = (msg.wIData as Uint32Array).length;
        } catch (e) { console.warn('water mesh upload failed', e); }
      }

      if (msg.lVData && msg.lIData) {
        try {
          const r = setupVAO(msg.lVData as Float32Array, msg.lIData as Uint32Array);
          mesh.lavaVao = r.vao; mesh.lavaVbo = r.vbo; mesh.lavaIbo = r.ibo;
          mesh.lavaIndexCount = (msg.lIData as Uint32Array).length;
        } catch (e) { console.warn('lava mesh upload failed', e); }
      }

      this.meshes.set(key, mesh);
    } catch (e) {
      console.warn('[Renderer] applyWorkerResult failed', e);
    }
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

    // ── Fast block lookup ──────────────────────────────────────────────────────
    // Grab a direct reference to the raw Uint8Array so in-chunk lookups skip the
    // bounds-check + method-call overhead of chunk.getBlock().  Cross-chunk coords
    // (nx/ny/nz outside [0,CS) / [0,WH)) fall through to getNeighborBlock which
    // already handles the world-coordinate form.
    const _blocks = chunk.blocks;          // Uint8Array — layout: (y*CS+z)*CS+x
    const CS = CHUNK_SIZE;
    const WH = WORLD_HEIGHT;
    const _getBlock = (lx: number, ly: number, lz: number): number => {
      if (lx >= 0 && lx < CS && ly >= 0 && ly < WH && lz >= 0 && lz < CS)
        return _blocks[(ly * CS + lz) * CS + lx];
      return getNeighborBlock(ox + lx, ly, oz + lz);
    };
    // ──────────────────────────────────────────────────────────────────────────

    // Helper: push a quad (4 verts, 6 indices) into the geometry arrays
    const pushQuad = (
      p0: [number, number, number], p1: [number, number, number],
      p2: [number, number, number], p3: [number, number, number],
      r: number, g: number, b: number, bright: number, alpha: number = 1.0
    ) => {
      const base = vertCount;
      for (const p of [p0, p1, p2, p3]) {
        positions.push(p[0], p[1], p[2]);
        colors.push(r, g, b);
        brightness.push(bright);
        alphas.push(alpha);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      vertCount += 4;
    };

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
          const blockId = _getBlock(x, y, z);
          if (blockId === BlockId.AIR || blockId === BlockId.WINDOW_OPEN || blockId === BlockId.DOOR_OPEN) continue;
          if (blockId === BlockId.WATER && !this.lowEndMode) continue;
          if (blockId === BlockId.LAVA && !this.lowEndMode) continue;

          let bc: BlockColor = BLOCK_COLORS[blockId] ?? { r: 1, g: 0, b: 1, a: 1 };

          // Emissive blocks light themselves — spreading is done in the shader via uPointLights
          let blAdd = 0;
          if (blockId === BlockId.LAVA || blockId === BlockId.GLOWSTONE) blAdd = 1.9;
          else if (blockId === BlockId.TORCH) blAdd = 1.85;
          else if (blockId === BlockId.BONFIRE) blAdd = 1.7;

          // Shiny ores: mark with exactly 1.15 so the vertex shader applies proximity shimmer
          const isShinyOre = blockId === BlockId.GOLD_ORE || blockId === BlockId.DIAMOND_ORE ||
            blockId === BlockId.AMETHYST || blockId === BlockId.COPPER_ORE ||
            blockId === BlockId.QUARTZ_ORE || blockId === BlockId.AMETHYST_BRICK;
          const oreMarker = isShinyOre ? 1.15 : 0;

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            // Determine neighbor block; use cross-chunk callback for edges
            const neighbor = _getBlock(nx, ny, nz);

            // Only render faces adjacent to transparent-ish blocks. Lava is considered transparent only on non-low-end (desktop) mode.
            const isTransparentNeighbor = TRANSPARENT_BLOCKS.has(neighbor);
            if (!isTransparentNeighbor) continue;

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



            // Special-case: GRASS block - solid colors (top green, sides brown, bottom brown)
            if (blockId === BlockId.GRASS) {
              const isTop = fi === 0;
              const isBottom = fi === 1;
              const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
              const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
              const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
              const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
              const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
              const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
              const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

              if (isTop) {
                // Top face: 3x3 grid (grass detail)
                const gridSize = this.lowEndMode ? 1 : 2;
                const cellSize = 1 / gridSize;
                const grassColors = [
                  { r: .30, g: .65, b: .20 },  // green
                  { r: .35, g: .70, b: .25 },  // lighter green
                  { r: .25, g: .55, b: .15 },  // darker green
                ];

                for (let gy = 0; gy < gridSize; gy++) {
                  for (let gx = 0; gx < gridSize; gx++) {
                    const u0 = gx * cellSize;
                    const v0 = gy * cellSize;
                    const u1 = u0 + cellSize;
                    const v1 = v0 + cellSize;

                    const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (gx * 97 + gy)) >>> 0);
                    const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                    const colorIdx = Math.floor(rnd * 3) % 3;
                    const baseColor = grassColors[colorIdx];
                    const shade = 0.85 + rnd * 0.25;

                    const verts = [
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * v0, c0[1] + edgeU[1] * u0 + edgeV[1] * v0, c0[2] + edgeU[2] * u0 + edgeV[2] * v0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * v0, c0[1] + edgeU[1] * u1 + edgeV[1] * v0, c0[2] + edgeU[2] * u1 + edgeV[2] * v0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * v1, c0[1] + edgeU[1] * u1 + edgeV[1] * v1, c0[2] + edgeU[2] * u1 + edgeV[2] * v1],
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * v1, c0[1] + edgeU[1] * u0 + edgeV[1] * v1, c0[2] + edgeU[2] * u0 + edgeV[2] * v1],
                    ];

                    for (let vi = 0; vi < 4; vi++) {
                      const pv = verts[vi];
                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                      const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const vshade = shade * (0.9 + vrnd * 0.15);
                      positions.push(pv[0], pv[1], pv[2]);
                      colors.push(baseColor.r * vshade, baseColor.g * vshade, baseColor.b * vshade);
                      brightness.push(face.brightness * (0.95 + vrnd * 0.1));
                      alphas.push(1.0);
                    }
                    indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                    vertCount += 4;
                  }
                }
              } else if (!isBottom) {
                // Side faces: solid dirt brown
                const baseColor = { r: .55, g: .36, b: .24 };
                const shade = 0.85;
                for (let vi = 0; vi < 4; vi++) {
                  const v = face.verts[vi];
                  positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
                  colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
                  brightness.push(face.brightness);
                  alphas.push(1.0);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              } else {
                // Bottom face - plain dirt
                const baseColor = { r: .55, g: .36, b: .24 };
                const shade = 0.75;
                for (let vi = 0; vi < 4; vi++) {
                  const v = face.verts[vi];
                  positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
                  colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
                  brightness.push(face.brightness);
                  alphas.push(1.0);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }
              continue;
            }

            // Special-case: WATCH block - shows digital time on top face
            const watchKey = `${ox + x},${y},${oz + z}`;
            // Render watch face either when this block is a WATCH or when a placed-time exists
            if (blockId === BlockId.WATCH || this.watchBlockPositions.has(watchKey)) {
              const baseColor = bc;
              const shade = 0.9;
              const watchTime = this.watchBlockPositions.get(watchKey) ?? (() => {
                const segmentMs = 10 * 60 * 1000;
                const nowMs = Date.now();
                const posInSeg = nowMs % segmentMs;
                const phase = posInSeg / segmentMs;
                const ticksInSeg = phase * 12000;
                return Math.floor(ticksInSeg);
              })();
              const hour = Math.floor(watchTime / 1000) % 24;
              const minute = Math.floor((watchTime % 1000) / 1000 * 60);
              const displayHour = hour % 12 || 12;
              const timeStr = `${displayHour}:${minute.toString().padStart(2, '0')}`;
              const isPM = hour >= 12;
              const digits = (isPM ? 'P' : 'A') + timeStr.replace(':', '');

              for (let tfi = 0; tfi < FACES.length; tfi++) {
                const face = FACES[tfi];
                const isTopFace = tfi === 0;
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                const neighbor = _getBlock(nx, ny, nz);

                const isTransparent = TRANSPARENT_BLOCKS.has(neighbor);
                if (!isTransparent) continue;

                const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
                const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
                const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
                const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
                const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];

                if (isTopFace) {
                  // Digital clock face on top - draw small cubes like player faces.
                  // Format: A (row 0-2), HH (rows 6-8), MM (rows 12-14) - actually simple 5x3 column layout.
                  // Each character gets 1 column, 3 rows. Total 5 columns x 3 rows = 15 "slots".
                  // For simplicity: 5 columns across the face, 3 rows vertically.
                  const cellW = 1 / 5;
                  const cellH = 1 / 3;
                  const halfW = cellW * 0.4;
                  const halfH = cellH * 0.4;

                  // Ensure hour is two digits so digits string is length 5: A H H M M
                  const displayHourStr = displayHour.toString().padStart(2, '0');
                  const timeStrPad = `${displayHourStr}:${minute.toString().padStart(2, '0')}`;
                  const digitsStr = (isPM ? 'A' : 'P') + timeStrPad.replace(':', '');

                  // Draw background (dark surface)
                  pushQuad(
                    [c0[0], c0[1], c0[2]],
                    [c1[0], c1[1], c1[2]],
                    [c2[0], c2[1], c2[2]],
                    [c3[0], c3[1], c3[2]],
                    0, 0, 0, face.brightness * 0.5
                  );

                  // Draw "segment" squares as small cubes (like player face pixels)
                  for (let gx = 0; gx < 5; gx++) {
                    const char = digitsStr[gx] ?? '.';
                    for (let gy = 0; gy < 3; gy++) {
                      // Check digit pattern - if pattern has '1' at this position, draw it lit
                      const pattern = WATCH_PATTERNS[char] || WATCH_PATTERNS['empty'];
                      const line = pattern[gy] || '.....';
                      const isLit = line[gx] === '1';

                      // Compute center position of this segment in world space
                      const uCenter = (gx + 0.5) / 5;
                      const vCenter = (gy + 0.5) / 3;
                      const lerpX = c0[0] * (1 - uCenter) * (1 - vCenter) + c1[0] * uCenter * (1 - vCenter) + c2[0] * uCenter * vCenter + c3[0] * (1 - uCenter) * vCenter;
                      const lerpY = c0[1] * (1 - uCenter) * (1 - vCenter) + c1[1] * uCenter * (1 - vCenter) + c2[1] * uCenter * vCenter + c3[1] * (1 - uCenter) * vCenter;
                      const lerpZ = c0[2] * (1 - uCenter) * (1 - vCenter) + c1[2] * uCenter * (1 - vCenter) + c2[2] * uCenter * vCenter + c3[2] * (1 - uCenter) * vCenter;

                      // Draw small cube for each segment (like player face pixels)
                      const segSize = 0.08;
                      const segColor = isLit ? { r: 0.9, g: 0.15, b: 0.12 } : { r: 0.15, g: 0.10, b: 0.08 };

                      const bx = lerpX - segSize * 0.5;
                      const by = lerpY - segSize * 0.5;
                      const bz = lerpZ - 0.01; // slightly above face

                      // Push cube vertices (small box)
                      const bright = face.brightness * (isLit ? 1.5 : 0.4);
                      // Bottom face
                      positions.push(bx, by, bz); colors.push(segColor.r * shade, segColor.g * shade, segColor.b * shade); brightness.push(bright); alphas.push(1.0);
                      positions.push(bx + segSize, by, bz); colors.push(segColor.r * shade, segColor.g * shade, segColor.b * shade); brightness.push(bright); alphas.push(1.0);
                      positions.push(bx + segSize, by + segSize, bz); colors.push(segColor.r * shade, segColor.g * shade, segColor.b * shade); brightness.push(bright); alphas.push(1.0);
                      positions.push(bx, by + segSize, bz); colors.push(segColor.r * shade, segColor.g * shade, segColor.b * shade); brightness.push(bright); alphas.push(1.0);
                      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                      vertCount += 4;

                      // Top face
                      positions.push(bx, by, bz + 0.02); colors.push(segColor.r * shade * 1.2, segColor.g * shade * 1.2, segColor.b * shade * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                      positions.push(bx + segSize, by, bz + 0.02); colors.push(segColor.r * shade * 1.2, segColor.g * shade * 1.2, segColor.b * shade * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                      positions.push(bx + segSize, by + segSize, bz + 0.02); colors.push(segColor.r * shade * 1.2, segColor.g * shade * 1.2, segColor.b * shade * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                      positions.push(bx, by + segSize, bz + 0.02); colors.push(segColor.r * shade * 1.2, segColor.g * shade * 1.2, segColor.b * shade * 1.2); brightness.push(bright * 1.1); alphas.push(1.0);
                      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                      vertCount += 4;
                    }
                  }
                } else {
                  // Side and bottom faces - solid block color
                  const sideShade = shade * (face.brightness / 1.0);
                  for (let vi = 0; vi < 4; vi++) {
                    const v = face.verts[vi];
                    positions.push(ox + x + v[0], y + v[1], oz + z + v[2]);
                    colors.push(baseColor.r * sideShade, baseColor.g * sideShade, baseColor.b * sideShade);
                    brightness.push(face.brightness);
                    alphas.push(1.0);
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                }
              }
              continue;
            }

            // Special-case: TREE render as mini trees (wood trunk + leaves canopy)
            if (blockId === BlockId.TREE) {
              const trunkColor = BLOCK_COLORS[BlockId.WOOD] ?? { r: .45, g: .30, b: .15 };
              const leafColor = bc;
              const leafBiome = chunk.getBiome(x, z);
              const leafTint = getLeafTint(leafBiome);
              const trunkHeight = 0.6;

              for (let tfi = 0; tfi < FACES.length; tfi++) {
                const face = FACES[tfi];
                const isTopFace = tfi === 0;
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                const neighbor = _getBlock(nx, ny, nz);

                const isTransparent = TRANSPARENT_BLOCKS.has(neighbor);
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
                const gridSizeX = isTopFace ? 2 : 3;
                const cellSizeX = 1 / gridSizeX;
                const cellSizeY = 1 / gridSizeY;

                for (let gy = 0; gy < gridSizeY; gy++) {
                  for (let gx = 0; gx < gridSizeX; gx++) {
                    const u0 = gx * cellSizeX;
                    const v0 = gy * cellSizeY;
                    const u1 = u0 + cellSizeX;
                    const v1 = v0 + cellSizeY;

                    const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (tfi * 374761393) ^ (gx * 97 + gy)) >>> 0);
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
                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (tfi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
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
            if (blockId === BlockId.TALLGRASS || blockId === BlockId.SEAWEED) {
              const baseColor = bc;
              const isSeagrass = blockId === BlockId.SEAWEED;
              const time = performance.now() / 1000;
              // Tall grass has multiple vertical blade strands with varying heights
              const numStrands = isSeagrass ? 28 : 20;

              for (let tgfi = 0; tgfi < FACES.length; tgfi++) {
                const face = FACES[tgfi];
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                const neighbor = _getBlock(nx, ny, nz);

                // Only render if neighbor is transparent (air, leaves, water)
                const isTransparent = TRANSPARENT_BLOCKS.has(neighbor);
                if (!isTransparent) continue;

                for (let strand = 0; strand < numStrands; strand++) {
                  // Each strand has unique seed for variation
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (strand * 12345) ^ (tgfi * 789)) >>> 0);
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

                    // Each segment leans a bit more than the previous (seaweed sways over time)
                    const segLeanX = baseLeanX * segHeightRatio + (isSeagrass ? Math.sin(time * 1.2 + strand * 0.7 + seg * 0.3) * 0.06 * segHeightRatio : 0);
                    const segLeanZ = baseLeanZ * segHeightRatio + (isSeagrass ? Math.cos(time * 0.9 + strand * 0.5 + seg * 0.4) * 0.05 * segHeightRatio : 0);

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

                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (tgfi * 374761393) ^ (strand * 97 + seg * 31 + vi * 17)) >>> 0);
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
   
            // Special-case: CAULDRON - improved iron pot shape (rim ring + inner walls)
            if (blockId === BlockId.CAULDRON || blockId === BlockId.CAULDRON_LAVA || neighbor === BlockId.CAULDRON_WATER || blockId === BlockId.CAULDRON_WATER) {
              const ironColor: [number, number, number] = [0.35, 0.35, 0.38]; // steel gray
              const ironDark: [number, number, number] = [0.22, 0.22, 0.26]; // darker for interior
              const lavaColor: [number, number, number] = [1.0, 0.45, 0.05]; // bright orange lava
              const waterColor: [number, number, number] = [0.20, 0.50, 0.90]; // bright blue water
              const hasLava = blockId === BlockId.CAULDRON_LAVA || neighbor === BlockId.CAULDRON_WATER;
              const hasWater = blockId === BlockId.CAULDRON_WATER;

              // Dimensions (kept inside the block so the pot reads as hollow)
              const rimY = y + 0.90;            // rim top
              const bodyTopY = rimY - 0.12;     // top of the pot body, just under rim
              const botY = y + 0.20;            // interior bottom
              const outerInset = 0.06;          // outer skirt inset from block edge
              const innerInset = 0.18;          // inner hollow inset

              // World-space coords
              const ox0 = ox + x + outerInset;
              const ox1 = ox + x + 1 - outerInset;
              const oz0 = oz + z + outerInset;
              const oz1 = oz + z + 1 - outerInset;
              const ix0 = ox + x + innerInset;
              const ix1 = ox + x + 1 - innerInset;
              const iz0 = oz + z + innerInset;
              const iz1 = oz + z + 1 - innerInset;

              // Top rim ring (4 quads forming a donut)
              const outerVerts = [
                [ox0, rimY, oz0],
                [ox1, rimY, oz0],
                [ox1, rimY, oz1],
                [ox0, rimY, oz1],
              ];
              const innerVerts = [
                [ix0, rimY, iz0],
                [ix1, rimY, iz0],
                [ix1, rimY, iz1],
                [ix0, rimY, iz1],
              ];

              for (let s = 0; s < 4; s++) {
                const oA = outerVerts[s];
                const oB = outerVerts[(s + 1) % 4];
                const iB = innerVerts[(s + 1) % 4];
                const iA = innerVerts[s];
                positions.push(oA[0], oA[1], oA[2], oB[0], oB[1], oB[2], iB[0], iB[1], iB[2], iA[0], iA[1], iA[2]);
                // Slight highlight on top rim
                for (let vi = 0; vi < 4; vi++) { colors.push(ironColor[0], ironColor[1], ironColor[2]); brightness.push(1.05); alphas.push(1.0); }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }

              // Inner lava/water surface (inside the inner ring)
              if (hasLava || hasWater) {
                const fluidY = y + (hasLava ? 0.50 : 0.55);
                const fluidColor = hasLava ? lavaColor : waterColor;
                const fluidBright = hasLava ? 1.5 : 1.2;
                const fluidVerts = [
                  [ix0 + 0.02, fluidY, iz0 + 0.02],
                  [ix1 - 0.02, fluidY, iz0 + 0.02],
                  [ix1 - 0.02, fluidY, iz1 - 0.02],
                  [ix0 + 0.02, fluidY, iz1 - 0.02],
                ];
                for (let vi = 0; vi < 4; vi++) {
                  positions.push(fluidVerts[vi][0], fluidVerts[vi][1], fluidVerts[vi][2]);
                  colors.push(fluidColor[0], fluidColor[1], fluidColor[2]);
                  brightness.push(fluidBright);
                  alphas.push(1.0);
                }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }

              // Outer skirt (external walls) - four faces
              const outerWalls = [
                // south (z high)
                [[ox0, bodyTopY, oz1], [ox1, bodyTopY, oz1], [ox1, botY, oz1], [ox0, botY, oz1]],
                // north (z low)
                [[ox1, bodyTopY, oz0], [ox0, bodyTopY, oz0], [ox0, botY, oz0], [ox1, botY, oz0]],
                // east (x high)
                [[ox1, bodyTopY, oz1], [ox1, bodyTopY, oz0], [ox1, botY, oz0], [ox1, botY, oz1]],
                // west (x low)
                [[ox0, bodyTopY, oz0], [ox0, bodyTopY, oz1], [ox0, botY, oz1], [ox0, botY, oz0]],
              ];
              for (let w = 0; w < outerWalls.length; w++) {
                const face = outerWalls[w];
                for (let vi = 0; vi < 4; vi++) { positions.push(face[vi][0], face[vi][1], face[vi][2]); colors.push(ironColor[0] * 0.9, ironColor[1] * 0.9, ironColor[2] * 0.9); brightness.push(0.9); alphas.push(1.0); }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }

              // Inner walls (visible inside the pot) - four faces using inner inset
              const innerWalls = [
                [[ix0, bodyTopY, iz1], [ix1, bodyTopY, iz1], [ix1, botY, iz1], [ix0, botY, iz1]],
                [[ix1, bodyTopY, iz0], [ix0, bodyTopY, iz0], [ix0, botY, iz0], [ix1, botY, iz0]],
                [[ix1, bodyTopY, iz1], [ix1, bodyTopY, iz0], [ix1, botY, iz0], [ix1, botY, iz1]],
                [[ix0, bodyTopY, iz0], [ix0, bodyTopY, iz1], [ix0, botY, iz1], [ix0, botY, iz0]],
              ];
              for (let w = 0; w < innerWalls.length; w++) {
                const face = innerWalls[w];
                for (let vi = 0; vi < 4; vi++) { positions.push(face[vi][0], face[vi][1], face[vi][2]); colors.push(ironDark[0], ironDark[1], ironDark[2]); brightness.push(0.6); alphas.push(1.0); }
                indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                vertCount += 4;
              }

              // Bottom - interior floor (inside inner inset)
              const bottomVerts = [[ix0, botY, iz0], [ix1, botY, iz0], [ix1, botY, iz1], [ix0, botY, iz1]];
              const bcol = hasLava ? lavaColor : hasWater ? waterColor : ironDark;
              const bBright = hasLava ? 1.3 : hasWater ? 1.0 : 0.5;
              for (let vi = 0; vi < 4; vi++) { positions.push(bottomVerts[vi][0], bottomVerts[vi][1], bottomVerts[vi][2]); colors.push(bcol[0], bcol[1], bcol[2]); brightness.push(bBright); alphas.push(1.0); }
              indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
              vertCount += 4;

              continue;
            }

            // Special-case: FENCE - Minecraft-style fence with posts and rails
            if (blockId === BlockId.FENCE) {
              const postW = 0.12, postH = 1.0;
              const rw = 0.1, rh = 0.15;

              // helper to add a post
              const addPost = (px: number, pz: number) => {
                const x0 = ox + x + px - postW, x1 = ox + x + px + postW;
                const z0 = oz + z + pz - postW, z1 = oz + z + pz + postW;
                const y0 = y, y1 = y + postH;
                // south face
                pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.25, 0.18, 0.10, 0.7);
                // east face
                pushQuad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 0.25, 0.18, 0.10, 0.7);
                // north face (skip if adjacent fence)
                // west face (skip if adjacent fence)
                // top face
                pushQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0.25, 0.18, 0.10, 1.0);
              };

              // helper to add a rail
              const addRail = (py: number, pz: number, len: number) => {
                const x0 = ox + x - len, x1 = ox + x + len;
                const z0 = oz + z + pz - rw, z1 = oz + z + pz + rw;
                const y0 = y + py, y1 = y + py + rh;
                pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.40, 0.30, 0.20, 0.8);
                pushQuad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 0.40, 0.30, 0.20, 0.8);
              };

              // Make a better fence - more realistic post and rail dimensions
              addPost(0.2, 0.2);
              addPost(0.8, 0.2);
              addPost(0.2, 0.8);
              addPost(0.8, 0.8);
              addRail(0.9, 0.5, 0.5);  // Top rail
              addRail(0.1, 0.5, 0.5);  // Bottom rail
              continue;
            }

            // Special-case: CRAFTING_TABLE - Minecraft-style table with 3x3 grid on front
            if (blockId === BlockId.CRAFTING_TABLE) {
              const tableTopColor: [number, number, number] = [0.70, 0.55, 0.30]; // Lighter oak
              const tableSideColor: [number, number, number] = [0.60, 0.45, 0.22]; // Oak planks
              const tableDark: [number, number, number] = [0.50, 0.38, 0.18]; // Darker for shading

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
                const isTopFace = fi === 0;
                const isBottomFace = fi === 1;
                const isFrontFace = fi === 2; // south face

                const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
                const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
                const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
                const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
                const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
                const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

                if (isTopFace) {
                  // Top face: 2x2 grid pattern (like Minecraft crafting grid)
                  const gridSize = 2;
                  const cellSize = 1 / gridSize;
                  for (let gy = 0; gy < gridSize; gy++) {
                    for (let gx = 0; gx < gridSize; gx++) {
                      const u0 = gx * cellSize;
                      const v0_ = gy * cellSize;
                      const u1 = u0 + cellSize;
                      const v1_ = v0_ + cellSize;

                      const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                      const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const shade = 0.85 + rnd * 0.25;
                      const cr = tableTopColor[0] * shade;
                      const cg = tableTopColor[1] * shade;
                      const cb = tableTopColor[2] * shade;

                      const verts = [
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                      ];

                      for (let vi = 0; vi < 4; vi++) {
                        const pv = verts[vi];
                        const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                        const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                        const vshade = 0.9 + vrnd * 0.15;
                        positions.push(pv[0], pv[1], pv[2]);
                        colors.push(cr * vshade, cg * vshade, cb * vshade);
                        brightness.push(face.brightness * (0.9 + vrnd * 0.15));
                        alphas.push(1.0);
                      }
                      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                      vertCount += 4;
                    }
                  }
                } else if (isBottomFace) {
                  // Bottom face: plain darker base
                  const baseColor = [tableDark[0] * 0.7, tableDark[1] * 0.7, tableDark[2] * 0.7];
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const shade = 0.9 + rnd * 0.15;

                  const verts = [c0, c1, c2, c3];
                  for (let vi = 0; vi < 4; vi++) {
                    const pv = verts[vi];
                    positions.push(pv[0], pv[1], pv[2]);
                    colors.push(baseColor[0] * shade, baseColor[1] * shade, baseColor[2] * shade);
                    brightness.push(face.brightness);
                    alphas.push(1.0);
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                } else if (isFrontFace) {
                  // Front face: 3x3 grid pattern (the crafting grid)
                  const gridSize = 3;
                  const cellSize = 1 / gridSize;
                  for (let gy = 0; gy < gridSize; gy++) {
                    for (let gx = 0; gx < gridSize; gx++) {
                      const u0 = gx * cellSize;
                      const v0_ = gy * cellSize;
                      const u1 = u0 + cellSize;
                      const v1_ = v0_ + cellSize;

                      const baseColor = tableSideColor;

                      const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                      const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const shade = 0.85 + rnd * 0.25;
                      const cr = baseColor[0] * shade;
                      const cg = baseColor[1] * shade;
                      const cb = baseColor[2] * shade;

                      const verts = [
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                      ];

                      for (let vi = 0; vi < 4; vi++) {
                        const pv = verts[vi];
                        const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                        const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                        const vshade = 0.9 + vrnd * 0.15;
                        positions.push(pv[0], pv[1], pv[2]);
                        colors.push(cr * vshade, cg * vshade, cb * vshade);
                        brightness.push(face.brightness * (0.9 + vrnd * 0.15));
                        alphas.push(1.0);
                      }
                      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                      vertCount += 4;
                    }
                  }
                } else {
                  // Side faces (north, east, west): horizontal planks
                  const gridSizeX = 3;
                  const cellSizeX = 1 / gridSizeX;

                  for (let gx = 0; gx < gridSizeX; gx++) {
                    const u0 = gx * cellSizeX;
                    const u1 = u0 + cellSizeX;

                    const baseColor = tableSideColor;

                    const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97)) >>> 0);
                    const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                    const shade = 0.85 + rnd * 0.25;
                    const cr = baseColor[0] * shade;
                    const cg = baseColor[1] * shade;
                    const cb = baseColor[2] * shade;

                    const verts = [
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * 0, c0[1] + edgeU[1] * u0 + edgeV[1] * 0, c0[2] + edgeU[2] * u0 + edgeV[2] * 0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * 0, c0[1] + edgeU[1] * u1 + edgeV[1] * 0, c0[2] + edgeU[2] * u1 + edgeV[2] * 0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * 1, c0[1] + edgeU[1] * u1 + edgeV[1] * 1, c0[2] + edgeU[2] * u1 + edgeV[2] * 1],
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * 1, c0[1] + edgeU[1] * u0 + edgeV[1] * 1, c0[2] + edgeU[2] * u0 + edgeV[2] * 1],
                    ];

                    for (let vi = 0; vi < 4; vi++) {
                      const pv = verts[vi];
                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + vi * 31)) >>> 0);
                      const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const vshade = 0.9 + vrnd * 0.15;
                      positions.push(pv[0], pv[1], pv[2]);
                      colors.push(cr * vshade, cg * vshade, cb * vshade);
                      brightness.push(face.brightness * (0.9 + vrnd * 0.15));
                      alphas.push(1.0);
                    }
                    indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                    vertCount += 4;
                  }
                }
              }
              continue;
            }

            // Special-case: SMITHING_TABLE - dark wood table with diamond pattern on front
            if (blockId === BlockId.SMITHING_TABLE) {
              const tableTopColor: [number, number, number] = [0.55, 0.42, 0.30]; // Darker oak top
              const tableSideColor: [number, number, number] = [0.30, 0.22, 0.18]; // Dark warped wood sides
              const tableDark: [number, number, number] = [0.22, 0.16, 0.12]; // Darker for shading
              const diamondColor: [number, number, number] = [0.45, 0.35, 0.28]; // Diamond pattern color

              for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];

                const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
                const isTopFace = fi === 0;
                const isBottomFace = fi === 1;
                const isFrontFace = fi === 2; // south face

                const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
                const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
                const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
                const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
                const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
                const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

                if (isTopFace) {
                  // Top face: smooth dark surface with subtle variation
                  const gridSize = 2;
                  const cellSize = 1 / gridSize;
                  for (let gy = 0; gy < gridSize; gy++) {
                    for (let gx = 0; gx < gridSize; gx++) {
                      const u0 = gx * cellSize;
                      const v0_ = gy * cellSize;
                      const u1 = u0 + cellSize;
                      const v1_ = v0_ + cellSize;

                      const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                      const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const shade = 0.85 + rnd * 0.2;
                      const cr = tableTopColor[0] * shade;
                      const cg = tableTopColor[1] * shade;
                      const cb = tableTopColor[2] * shade;

                      const verts = [
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                      ];

                      for (let vi = 0; vi < 4; vi++) {
                        const pv = verts[vi];
                        const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                        const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                        const vshade = 0.9 + vrnd * 0.15;
                        positions.push(pv[0], pv[1], pv[2]);
                        colors.push(cr * vshade, cg * vshade, cb * vshade);
                        brightness.push(face.brightness * (0.9 + vrnd * 0.15));
                        alphas.push(1.0);
                      }
                      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                      vertCount += 4;
                    }
                  }
                } else if (isBottomFace) {
                  // Bottom face: plain darker base
                  const baseColor = [tableDark[0] * 0.7, tableDark[1] * 0.7, tableDark[2] * 0.7];
                  const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
                  const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                  const shade = 0.9 + rnd * 0.15;

                  const verts = [c0, c1, c2, c3];
                  for (let vi = 0; vi < 4; vi++) {
                    const pv = verts[vi];
                    positions.push(pv[0], pv[1], pv[2]);
                    colors.push(baseColor[0] * shade, baseColor[1] * shade, baseColor[2] * shade);
                    brightness.push(face.brightness);
                    alphas.push(1.0);
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                } else if (isFrontFace) {
                  // Front face: diamond pattern representing smithing (two overlapping diamonds)
                  const gridSize = 3;
                  const cellSize = 1 / gridSize;
                  for (let gy = 0; gy < gridSize; gy++) {
                    for (let gx = 0; gx < gridSize; gx++) {
                      const u0 = gx * cellSize;
                      const v0_ = gy * cellSize;
                      const u1 = u0 + cellSize;
                      const v1_ = v0_ + cellSize;

                      // Create diamond pattern - center cells are lighter (the diamond shape)
                      const centerX = 1;
                      const centerY = 1;
                      const distFromCenter = Math.sqrt(Math.pow(gx - centerX, 2) + Math.pow(gy - centerY, 2));
                      const isDiamond = distFromCenter <= 1.0;
                      const baseColor = isDiamond ? diamondColor : tableSideColor;

                      const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy)) >>> 0);
                      const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const shade = 0.85 + rnd * 0.25;
                      const cr = baseColor[0] * shade;
                      const cg = baseColor[1] * shade;
                      const cb = baseColor[2] * shade;

                      const verts = [
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_],
                        [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_],
                        [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_],
                      ];

                      for (let vi = 0; vi < 4; vi++) {
                        const pv = verts[vi];
                        const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + gy + vi * 31)) >>> 0);
                        const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                        const vshade = 0.9 + vrnd * 0.15;
                        positions.push(pv[0], pv[1], pv[2]);
                        colors.push(cr * vshade, cg * vshade, cb * vshade);
                        brightness.push(face.brightness * (0.9 + vrnd * 0.15));
                        alphas.push(1.0);
                      }
                      indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                      vertCount += 4;
                    }
                  }
                } else {
                  // Side faces (north, east, west): horizontal dark planks
                  const gridSizeX = 3;
                  const cellSizeX = 1 / gridSizeX;

                  for (let gx = 0; gx < gridSizeX; gx++) {
                    const u0 = gx * cellSizeX;
                    const u1 = u0 + cellSizeX;

                    const baseColor = tableSideColor;

                    const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97)) >>> 0);
                    const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                    const shade = 0.85 + rnd * 0.25;
                    const cr = baseColor[0] * shade;
                    const cg = baseColor[1] * shade;
                    const cb = baseColor[2] * shade;

                    const verts = [
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * 0, c0[1] + edgeU[1] * u0 + edgeV[1] * 0, c0[2] + edgeU[2] * u0 + edgeV[2] * 0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * 0, c0[1] + edgeU[1] * u1 + edgeV[1] * 0, c0[2] + edgeU[2] * u1 + edgeV[2] * 0],
                      [c0[0] + edgeU[0] * u1 + edgeV[0] * 1, c0[1] + edgeU[1] * u1 + edgeV[1] * 1, c0[2] + edgeU[2] * u1 + edgeV[2] * 1],
                      [c0[0] + edgeU[0] * u0 + edgeV[0] * 1, c0[1] + edgeU[1] * u0 + edgeV[1] * 1, c0[2] + edgeU[2] * u0 + edgeV[2] * 1],
                    ];

                    for (let vi = 0; vi < 4; vi++) {
                      const pv = verts[vi];
                      const vseed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393) ^ (gx * 97 + vi * 31)) >>> 0);
                      const vrnd = (((vseed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
                      const vshade = 0.9 + vrnd * 0.15;
                      positions.push(pv[0], pv[1], pv[2]);
                      colors.push(cr * vshade, cg * vshade, cb * vshade);
                      brightness.push(face.brightness * (0.9 + vrnd * 0.15));
                      alphas.push(1.0);
                    }
                    indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                    vertCount += 4;
                  }
                }
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
              // Use block-light bonus if present; use oreMarker (1.15) for shiny ores so shader can shimmer them
              const faceBright = face.brightness * (0.9 + rnd * 0.1);
              const baked = blAdd > 0 ? Math.max(faceBright, blAdd) : (oreMarker > 0 ? oreMarker : faceBright);
              brightness.push(baked);
              alphas.push(1.0);
            }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
            vertCount += 4;

            // Damage overlay: black crack marks on damaged blocks (Minecraft-style)
            // Uses 4x4 grid of smaller squares
            const blockHealth = chunk.getBlockHealth(x, y, z);
            const maxHealth = getBlockHealth(blockId);
            if (blockHealth > 0 && blockHealth < maxHealth && maxHealth > 1) {
              const damageGridSize = 4;
              const cellSize = 1 / damageGridSize;
              const inset = 0.02; // push slightly inward from edges
              const offset = 0.003; // push slightly off the block surface

              // Determine which cells to draw based on damage level
              const damageRatio = (maxHealth - blockHealth) / maxHealth;
              const cellsToDraw = Math.floor(damageRatio * 16); // max 16 cells (4x4)

              const v0 = face.verts[0]; const v1 = face.verts[1]; const v2 = face.verts[2]; const v3 = face.verts[3];
              const c0 = [ox + x + v0[0], y + v0[1], oz + z + v0[2]];
              const c1 = [ox + x + v1[0], y + v1[1], oz + z + v1[2]];
              const c2 = [ox + x + v2[0], y + v2[1], oz + z + v2[2]];
              const c3 = [ox + x + v3[0], y + v3[1], oz + z + v3[2]];
              const edgeU = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
              const edgeV = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];

              // Calculate face normal for offset direction
              const faceNx = face.dir[0];
              const faceNy = face.dir[1];
              const faceNz = face.dir[2];

              // Fixed pattern - draw cells in order based on damage ratio
              let drawnCells = 0;
              for (let gy = 0; gy < damageGridSize && drawnCells < cellsToDraw; gy++) {
                for (let gx = 0; gx < damageGridSize && drawnCells < cellsToDraw; gx++) {
                  const u0 = inset + gx * cellSize;
                  const v0_ = inset + gy * cellSize;
                  const u1 = u0 + cellSize - inset;
                  const v1_ = v0_ + cellSize - inset;

                  // Add slight offset outward from the block face
                  const ox_ = faceNx * offset;
                  const oy_ = faceNy * offset;
                  const oz_ = faceNz * offset;

                  const crackVerts = [
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v0_ + ox_, c0[1] + edgeU[1] * u0 + edgeV[1] * v0_ + oy_, c0[2] + edgeU[2] * u0 + edgeV[2] * v0_ + oz_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v0_ + ox_, c0[1] + edgeU[1] * u1 + edgeV[1] * v0_ + oy_, c0[2] + edgeU[2] * u1 + edgeV[2] * v0_ + oz_],
                    [c0[0] + edgeU[0] * u1 + edgeV[0] * v1_ + ox_, c0[1] + edgeU[1] * u1 + edgeV[1] * v1_ + oy_, c0[2] + edgeU[2] * u1 + edgeV[2] * v1_ + oz_],
                    [c0[0] + edgeU[0] * u0 + edgeV[0] * v1_ + ox_, c0[1] + edgeU[1] * u0 + edgeV[1] * v1_ + oy_, c0[2] + edgeU[2] * u0 + edgeV[2] * v1_ + oz_],
                  ];

                  for (let cvi = 0; cvi < 4; cvi++) {
                    const pv = crackVerts[cvi];
                    positions.push(pv[0], pv[1], pv[2]);
                    colors.push(0.06, 0.06, 0.06); // Dark crack color
                    brightness.push(face.brightness * 0.25); // Much darker to contrast
                    alphas.push(0.9); // More visible
                  }
                  indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
                  vertCount += 4;
                  drawnCells++;
                }
              }
              this.gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
            }
          }
        }
      }
    }

    // ─── Water & Lava meshes (transparent passes) ───
    const wPos: number[] = [];
    const wCol: number[] = [];
    const wBright: number[] = [];
    const wAlpha: number[] = [];
    const wIndices: number[] = [];
    let wVertCount = 0;
    const wc = BLOCK_COLORS[BlockId.WATER] ?? { r: 0.2, g: 0.45, b: 0.78, a: 0.55 };

    const lPos: number[] = [];
    const lCol: number[] = [];
    const lBright: number[] = [];
    const lAlpha: number[] = [];
    const lIndices: number[] = [];
    let lVertCount = 0;
    const lc = BLOCK_COLORS[BlockId.LAVA] ?? { r: 1.0, g: 0.45, b: 0.05, a: 0.92 };

    // On low-end mode, skip building the expensive transparent fluid meshes entirely
    if (!this.lowEndMode) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            if (_getBlock(x, y, z) !== BlockId.WATER) continue;
            // Check if water block above - if so, render full height
            let hasWaterAbove = false;
            if (y + 1 < WORLD_HEIGHT) {
              hasWaterAbove = _getBlock(x, y + 1, z) === BlockId.WATER;
            }
            // If water above, render full; otherwise use waterLevel
            const lvl = hasWaterAbove ? 8 : Math.max(1, Math.min(8, chunk.getWaterLevel(x, y, z) || 8));
            const h = hasWaterAbove ? 1.0 : 0.125 + (lvl / 8) * 0.5; // max 62.5% of block height

            for (let fi = 0; fi < FACES.length; fi++) {
              const face = FACES[fi];
              const nx = x + face.dir[0];
              const ny = y + face.dir[1];
              const nz = z + face.dir[2];
              const nb = _getBlock(nx, ny, nz);
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

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            if (_getBlock(x, y, z) !== BlockId.LAVA) continue;
            const h = 1.0; // full block height for lava surface

            for (let fi = 0; fi < FACES.length; fi++) {
              const face = FACES[fi];
              const nx = x + face.dir[0];
              const ny = y + face.dir[1];
              const nz = z + face.dir[2];
              const nb = _getBlock(nx, ny, nz);
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
    getNeighborBlock: (wx: number, wy: number, wz: number) => number,
    fluidYMin = 0,
    fluidYMax = WORLD_HEIGHT
  ): void {
    const key = `${chunk.cx},${chunk.cz}`;
    const existing = this.meshes.get(key);
    if (!existing) {
      // No opaque mesh yet — skip fluid-only rebuild; the worker will build
      // the full mesh (opaque + fluid) shortly.
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

    // On low-end/mobile mode we don't build transparent fluid meshes —
    // keep opaque meshes (water/lava rendered as opaque) and clear fluid buffers.
    if (this.lowEndMode) {
      existing.waterVao = null; existing.waterVbo = null; existing.waterIbo = null; existing.waterIndexCount = 0;
      existing.lavaVao = null; existing.lavaVbo = null; existing.lavaIbo = null; existing.lavaIndexCount = 0;
      this.meshes.set(key, existing);
      return;
    }

    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    // Fast in-chunk block lookup (same pattern as buildChunkMesh)
    const _fBlocks = chunk.blocks;
    const _fCS = CHUNK_SIZE;
    const _fWH = WORLD_HEIGHT;
    const _fGetBlock = (lx: number, ly: number, lz: number): number => {
      if (lx >= 0 && lx < _fCS && ly >= 0 && ly < _fWH && lz >= 0 && lz < _fCS)
        return _fBlocks[(ly * _fCS + lz) * _fCS + lx];
      return getNeighborBlock(ox + lx, ly, oz + lz);
    };

    const stride = 8;
    const bpe = Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aColor = gl.getAttribLocation(this.program, 'aColor');
    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');

    // Clamp scan range — only scan the Y band where fluid actually exists
    const yStart = Math.max(0, fluidYMin - 2);
    const yEnd = Math.min(WORLD_HEIGHT, fluidYMax + 2);
    const time = performance.now() / 1000;
    const fluidSurfaceHeight = (level: number, isSource: boolean, hasFluidAbove: boolean): number => {
      if (hasFluidAbove || isSource) return 1.0;
      const clamped = Math.max(0, Math.min(8, level || 0));
      return 0.16 + (clamped / 8) * 0.84;
    };
    const getFluidNeighbor = (wx: number, wy: number, wz: number): { blockId: number; level: number; isSource: boolean } => {
      const lx = wx - ox;  // wx is already world coord, ox is chunk world origin
      const lz = wz - oz;
      // lx/lz will only be 0..CHUNK_SIZE-1 for blocks IN this chunk
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && wy >= 0 && wy < WORLD_HEIGHT) {
        try {
          return {
            blockId: _fGetBlock(lx, wy, lz),
            level: chunk.getFluidLevel ? chunk.getFluidLevel(lx, wy, lz) : 8,
            isSource: chunk.isFluidSource ? chunk.isFluidSource(lx, wy, lz) : true
          };
        } catch (e) {
          return { blockId: BlockId.AIR, level: 0, isSource: false };
        }
      }
      const blockId = getNeighborBlock(wx, wy, wz);
      return { blockId, level: blockId === BlockId.WATER || blockId === BlockId.LAVA ? 8 : 0, isSource: blockId === BlockId.WATER || blockId === BlockId.LAVA };
    };

    // ── Water ──
    const wPos: number[] = [], wCol: number[] = [], wBright: number[] = [], wAlpha: number[] = [], wIdx: number[] = [];
    let wVc = 0;
    const wc = BLOCK_COLORS[BlockId.WATER] ?? { r: 0.2, g: 0.45, b: 0.78, a: 0.55 };

    for (let y = yStart; y < yEnd; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (_fGetBlock(x, y, z) !== BlockId.WATER) continue;
          const level = Math.max(0, Math.min(8, chunk.getFluidLevel(x, y, z) || 8));
          const isSource = chunk.isFluidSource(x, y, z);
          const hasWaterAbove = getFluidNeighbor(ox + x, y + 1, oz + z).blockId === BlockId.WATER;
          const h = fluidSurfaceHeight(level, isSource, hasWaterAbove);
          const westH = fluidSurfaceHeight(getFluidNeighbor(ox + x - 1, y, oz + z).level, getFluidNeighbor(ox + x - 1, y, oz + z).isSource, getFluidNeighbor(ox + x - 1, y + 1, oz + z).blockId === BlockId.WATER);
          const eastH = fluidSurfaceHeight(getFluidNeighbor(ox + x + 1, y, oz + z).level, getFluidNeighbor(ox + x + 1, y, oz + z).isSource, getFluidNeighbor(ox + x + 1, y + 1, oz + z).blockId === BlockId.WATER);
          const northH = fluidSurfaceHeight(getFluidNeighbor(ox + x, y, oz + z - 1).level, getFluidNeighbor(ox + x, y, oz + z - 1).isSource, getFluidNeighbor(ox + x, y + 1, oz + z - 1).blockId === BlockId.WATER);
          const southH = fluidSurfaceHeight(getFluidNeighbor(ox + x, y, oz + z + 1).level, getFluidNeighbor(ox + x, y, oz + z + 1).isSource, getFluidNeighbor(ox + x, y + 1, oz + z + 1).blockId === BlockId.WATER);
          const flowX = (westH - eastH);
          const flowZ = (northH - southH);
          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const nb = _fGetBlock(nx, ny, nz);
            if (nb === BlockId.WATER) continue;
            const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
            const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const jitter = 0.94 + rnd * 0.1;
            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              let topH = h;
              if (fi === 0) {
                if (vi === 0) topH = (h + westH + northH) / 3;
                else if (vi === 1) topH = (h + eastH + northH) / 3;
                else if (vi === 2) topH = (h + eastH + southH) / 3;
                else topH = (h + westH + southH) / 3;
                topH += Math.sin(time * 2.0 + (ox + x + v[0]) * 2.2 + (oz + z + v[2]) * 1.8) * 0.01;
              }
              wPos.push(ox + x + v[0], y + (v[1] >= 0.99 ? topH : v[1]), oz + z + v[2]);
              const flowShade = fi === 0 ? 1.0 + ((flowX * (v[0] - 0.5) + flowZ * (v[2] - 0.5)) * 0.08) : 1.0;
              wCol.push(wc.r * jitter * flowShade, wc.g * jitter * flowShade, wc.b * jitter * flowShade);
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

    for (let y = yStart; y < yEnd; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (_fGetBlock(x, y, z) !== BlockId.LAVA) continue;
          const level = Math.max(0, Math.min(8, chunk.getFluidLevel(x, y, z) || 8));
          const isSource = chunk.isFluidSource(x, y, z);
          const hasLavaAbove = getFluidNeighbor(ox + x, y + 1, oz + z).blockId === BlockId.LAVA;
          const h = fluidSurfaceHeight(level, isSource, hasLavaAbove);
          const westH = fluidSurfaceHeight(getFluidNeighbor(ox + x - 1, y, oz + z).level, getFluidNeighbor(ox + x - 1, y, oz + z).isSource, getFluidNeighbor(ox + x - 1, y + 1, oz + z).blockId === BlockId.LAVA);
          const eastH = fluidSurfaceHeight(getFluidNeighbor(ox + x + 1, y, oz + z).level, getFluidNeighbor(ox + x + 1, y, oz + z).isSource, getFluidNeighbor(ox + x + 1, y + 1, oz + z).blockId === BlockId.LAVA);
          const northH = fluidSurfaceHeight(getFluidNeighbor(ox + x, y, oz + z - 1).level, getFluidNeighbor(ox + x, y, oz + z - 1).isSource, getFluidNeighbor(ox + x, y + 1, oz + z - 1).blockId === BlockId.LAVA);
          const southH = fluidSurfaceHeight(getFluidNeighbor(ox + x, y, oz + z + 1).level, getFluidNeighbor(ox + x, y, oz + z + 1).isSource, getFluidNeighbor(ox + x, y + 1, oz + z + 1).blockId === BlockId.LAVA);
          const flowX = (westH - eastH);
          const flowZ = (northH - southH);
          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const nb = _fGetBlock(nx, ny, nz);
            if (nb === BlockId.LAVA) continue;
            const seed = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (fi * 374761393)) >>> 0);
            const rnd = (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
            const jitter = 0.95 + rnd * 0.1;
            for (let vi = 0; vi < face.verts.length; vi++) {
              const v = face.verts[vi];
              let topH = h;
              if (fi === 0) {
                if (vi === 0) topH = (h + westH + northH) / 3;
                else if (vi === 1) topH = (h + eastH + northH) / 3;
                else if (vi === 2) topH = (h + eastH + southH) / 3;
                else topH = (h + westH + southH) / 3;
                topH += Math.sin(time * 1.5 + (ox + x + v[0]) * 1.7 + (oz + z + v[2]) * 2.1) * 0.008;
              }
              lPos.push(ox + x + v[0], y + (v[1] >= 0.99 ? topH : v[1]), oz + z + v[2]);
              const flowShade = fi === 0 ? 1.0 + ((flowX * (v[0] - 0.5) + flowZ * (v[2] - 0.5)) * 0.08) : 1.0;
              lCol.push(lc.r * jitter * flowShade, lc.g * jitter * flowShade, lc.b * jitter * flowShade);
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
        d[o] = wPos[i * 3]; d[o + 1] = wPos[i * 3 + 1]; d[o + 2] = wPos[i * 3 + 2];
        d[o + 3] = wCol[i * 3]; d[o + 4] = wCol[i * 3 + 1]; d[o + 5] = wCol[i * 3 + 2];
        d[o + 6] = wBright[i]; d[o + 7] = wAlpha[i];
      }
      waterIndexCount = wIdx.length;
      waterVao = gl.createVertexArray()!; gl.bindVertexArray(waterVao);
      waterVbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, waterVbo); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);
      gl.enableVertexAttribArray(aBright); gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);
      if (aAlpha >= 0) { gl.enableVertexAttribArray(aAlpha); gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe); }
      waterIbo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, waterIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(wIdx), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
    }

    // Upload lava VAO
    let lavaVao: WebGLVertexArrayObject | null = null, lavaVbo: WebGLBuffer | null = null, lavaIbo: WebGLBuffer | null = null, lavaIndexCount = 0;
    if (lVc > 0) {
      const d = new Float32Array(lVc * stride);
      for (let i = 0; i < lVc; i++) {
        const o = i * stride;
        d[o] = lPos[i * 3]; d[o + 1] = lPos[i * 3 + 1]; d[o + 2] = lPos[i * 3 + 2];
        d[o + 3] = lCol[i * 3]; d[o + 4] = lCol[i * 3 + 1]; d[o + 5] = lCol[i * 3 + 2];
        d[o + 6] = lBright[i]; d[o + 7] = lAlpha[i];
      }
      lavaIndexCount = lIdx.length;
      lavaVao = gl.createVertexArray()!; gl.bindVertexArray(lavaVao);
      lavaVbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, lavaVbo); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride * bpe, 0);
      gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride * bpe, 3 * bpe);
      gl.enableVertexAttribArray(aBright); gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride * bpe, 6 * bpe);
      if (aAlpha >= 0) { gl.enableVertexAttribArray(aAlpha); gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride * bpe, 7 * bpe); }
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

    // Fast in-chunk block lookup for Nether (Y axis maps to internal ny, not world Y)
    const _nBlocks = chunk.blocks;
    const _nCS = CHUNK_SIZE;
    const _nGetBlock = (lx: number, lny: number, lz: number, nd: number, worldY: number): number => {
      if (lx >= 0 && lx < _nCS && lny >= 0 && lny < nd && lz >= 0 && lz < _nCS)
        return _nBlocks[(lny * _nCS + lz) * _nCS + lx];
      return getNeighborBlock(ox + lx, worldY, oz + lz);
    };

    const lc = BLOCK_COLORS[BlockId.LAVA] ?? { r: 1.0, g: 0.45, b: 0.05, a: 0.92 };

    // Iterate only the populated Nether depth range
    for (let ny = 0; ny < netherDepth; ny++) {
      // World Y: internal ny=0 is just below the overworld floor (world y=-1)
      const worldY = -(ny + 1);
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockId = _nGetBlock(x, ny, z, netherDepth, worldY);
          if (blockId === BlockId.AIR) continue;

          const bc: BlockColor = BLOCK_COLORS[blockId] ?? { r: 1, g: 0, b: 1, a: 1 };
          const isLava = blockId === BlockId.LAVA;

          for (let fi = 0; fi < FACES.length; fi++) {
            const face = FACES[fi];
            const nx2 = x + face.dir[0];
            const ny2 = ny + face.dir[1];
            const nz2 = z + face.dir[2];

            // Neighbor in world coords
            const neighborWorldY = worldY + face.dir[1];
            const neighbor = _nGetBlock(nx2, ny2, nz2, netherDepth, neighborWorldY);

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
  render(camX: number, camY: number, camZ: number, yaw: number, pitch: number, players: DCPlayer[], myUserId: number, crumblingParticles?: CrumbleParticle[], playerDamageFlash?: Map<number, number>, mobDamageFlash?: Map<number, number>, heldTorchLight: boolean = false): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthMask(true);
    gl.useProgram(this.program);
    // Reset uniforms that may have been left dirty by mob/player draw calls last frame
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.useProgram(this.program);
    // Re-apply ambient every frame; uHeldTorchLight is set by the component before render()
    gl.uniform1f(this.uAmbient, this._currentAmbient);

    const aspect = this.width / this.height;
    const proj = perspectiveMatrix(this.fovDeg * Math.PI / 180, aspect, 0.1, 200);
    const view = lookAtFPS(camX, camY, camZ, yaw, pitch);
    const mvp = multiplyMat4(proj, view);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    // Render chunks
    const camCX = Math.floor(camX / CHUNK_SIZE);
    const camCZ = Math.floor(camZ / CHUNK_SIZE);
    // On low-end mode, reduce effective render distance by 1 chunk
    const effectiveDist = this.lowEndMode ? Math.max(1, this.renderDistanceChunks - 1) : this.renderDistanceChunks;

    for (const [, mesh] of this.meshes) {
      if (!mesh.vao || mesh.indexCount === 0) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > effectiveDist || Math.abs(dz) > effectiveDist) continue;

      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);

    // Water: draw after opaque terrain; depth write off so transparent layers stack
    // On low-end/mobile: skip transparent water pass entirely — water rendered as opaque in main pass
    if (!this.lowEndMode) {
      gl.depthMask(false);
      for (const [, mesh] of this.meshes) {
        if (!mesh.waterVao || !mesh.waterIndexCount) continue;
        const dx = mesh.cx - camCX;
        const dz = mesh.cz - camCZ;
        if (Math.abs(dx) > effectiveDist || Math.abs(dz) > effectiveDist) continue;
        gl.bindVertexArray(mesh.waterVao);
        gl.drawElements(gl.TRIANGLES, mesh.waterIndexCount, gl.UNSIGNED_INT, 0);
      }
      gl.depthMask(true);
      gl.bindVertexArray(null);
    }

    // Lava: draw with warm tint after opaque geometry (transparent pass)
    if (!this.lowEndMode) {
      gl.depthMask(false);
      for (const [, mesh] of this.meshes) {
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
    }

    // ── Nether opaque pass ──
    for (const [, mesh] of this.netherMeshes) {
      if (!mesh.vao || mesh.indexCount === 0) continue;
      const dx = mesh.cx - camCX;
      const dz = mesh.cz - camCZ;
      if (Math.abs(dx) > effectiveDist || Math.abs(dz) > effectiveDist) continue;
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
      if (Math.abs(dx) > effectiveDist || Math.abs(dz) > effectiveDist) continue;
      gl.uniform3f(this.uTint, 1.2, 1.05, 0.9);
      gl.bindVertexArray(mesh.lavaVao);
      gl.drawElements(gl.TRIANGLES, mesh.lavaIndexCount, gl.UNSIGNED_INT, 0);
      gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);

    const now = performance.now() / 1000;
    // Render other players as coloured pillars and their weapons
    // On low-end mode, skip other players beyond 20 blocks for performance
    const playerRenderDist = this.lowEndMode ? 20 : 100;
    for (const p of players) {
      if (p.userId === myUserId) continue;
      // Distance culling for low-end mode
      const distToPlayer = Math.sqrt((p.posX - camX) ** 2 + (p.posY - camY) ** 2 + (p.posZ - camZ) ** 2);
      if (this.lowEndMode && distToPlayer > playerRenderDist) continue;
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
      // Flash red when damaged
      if ((p as any).isFlashing) {
        gl.uniform3f(this.uTint, 1.0, 0.2, 0.2);
      }
      this.drawPlayerPillar(p, mvp, now, speed, camX, camY, camZ);
      const dist = Math.sqrt((p.posX - camX) ** 2 + (p.posY - camY) ** 2 + (p.posZ - camZ) ** 2);
      if (dist <= 20) {
        // Draw healthbar in WebGL (skip on low-end for performance)
        if (!this.lowEndMode) {
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
    const armZHalf = 0.10;

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
    // Always restore tint and MVP so subsequent draw calls aren't affected
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
  }

  renderCrumblingParticles(particles: CrumbleParticle[], baseMVP: Float32Array): void {
    if (!particles.length) return;
    this.ensureCubeMesh();
    if (!this.cubeVAO) {
      return;
    }
    const gl = this.gl;
    const now = performance.now();
    const duration = 500;
    let anyDrawn = false;
    for (const p of particles) {
      const elapsed = now - p.startTime;
      const t = elapsed / duration;
      if (t >= 1) continue;
      const scale = 0.3 * (1 - t * 0.5); // larger particles
      const wx = p.wx;
      const wy = p.wy - (elapsed / 1000) * 0.5; // slow fall
      const wz = p.wz;
      const world = multiplyMat4(translationMatrix(wx, wy, wz), scaleMatrix(scale));
      gl.uniform3f(this.uTint, p.color.r, p.color.g, p.color.b);
      gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, world));
      gl.bindVertexArray(this.cubeVAO);
      gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_INT, 0);
      anyDrawn = true;
    }
    if (anyDrawn) {
      gl.bindVertexArray(null);
      gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
      gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
    }
  }

  renderArrows(arrows: any[], baseMVP: Float32Array): void {
    if (!arrows.length) return;
    this.ensureCubeMesh();
    if (!this.cubeVAO) return;
    const gl = this.gl;
    for (const arrow of arrows) {
      const isBoneArrow = arrow.arrowType === 'bone';
      // bone arrows are gray/silver, normal arrows are brown/wood
      const shaftColor = isBoneArrow ? [0.75, 0.75, 0.78] : [0.58, 0.39, 0.2];
      const tipColor = isBoneArrow ? [0.85, 0.85, 0.88] : [0.72, 0.72, 0.76];
      const featherColor = isBoneArrow ? [0.95, 0.95, 0.98] : [0.92, 0.92, 0.94];

      const speed = Math.sqrt((arrow.vx || 0) * (arrow.vx || 0) + (arrow.vy || 0) * (arrow.vy || 0) + (arrow.vz || 0) * (arrow.vz || 0)) || 1;
      const yaw = Math.atan2(arrow.vx || 0, -(arrow.vz || 1));
      const pitch = Math.asin(Math.max(-1, Math.min(1, (arrow.vy || 0) / speed)));
      const anchor = multiplyMat4(
        translationMatrix(arrow.wx, arrow.wy, arrow.wz),
        multiplyMat4(rotationYMatrix(yaw), rotationXMatrix(-pitch))
      );

      const shaft = multiplyMat4(anchor, multiplyMat4(translationMatrix(0, 0, -0.02), scaleMatrix3(0.014, 0.014, 0.34)));
      gl.uniform3f(this.uTint, shaftColor[0], shaftColor[1], shaftColor[2]);
      gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, shaft));
      gl.bindVertexArray(this.cubeVAO);
      gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_INT, 0);

      const tip = multiplyMat4(anchor, multiplyMat4(translationMatrix(0, 0, -0.22), scaleMatrix3(0.028, 0.028, 0.06)));
      gl.uniform3f(this.uTint, tipColor[0], tipColor[1], tipColor[2]);
      gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, tip));
      gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_INT, 0);

      const featherLeft = multiplyMat4(anchor, multiplyMat4(translationMatrix(-0.03, 0, 0.12), scaleMatrix3(0.03, 0.004, 0.07)));
      gl.uniform3f(this.uTint, featherColor[0], featherColor[1], featherColor[2]);
      gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, featherLeft));
      gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_INT, 0);

      const featherRight = multiplyMat4(anchor, multiplyMat4(translationMatrix(0.03, 0, 0.12), scaleMatrix3(0.03, 0.004, 0.07)));
      gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, featherRight));
      gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
  }

  private tintColor(color: [number, number, number], amount: number): [number, number, number] {
    return [
      Math.max(0, Math.min(1, color[0] * amount)),
      Math.max(0, Math.min(1, color[1] * amount)),
      Math.max(0, Math.min(1, color[2] * amount)),
    ];
  }

  private armorColor(itemId?: number, dyeId?: number): [number, number, number] {
    if (!itemId || itemId <= 0) return [1, 1, 1];
    // If dyed, use the dye's color instead of armor's base color
    if (dyeId && dyeId > 0) {
      return hexToRGB(ITEM_COLORS[dyeId] ?? '#d9dde8');
    }
    return hexToRGB(ITEM_COLORS[itemId] ?? '#d9dde8');
  }

  private getArmorDyeColor(itemId: number): [number, number, number] | null {
    // Dye IDs: WHITE=195, ORANGE=196, MAGENTA=197, LIGHT_BLUE=198, YELLOW=199, LIME=200, PINK=201
    const dyeMap: Record<number, number> = {
      211: 195, 212: 195, 213: 195, 214: 195, // White Leather
      215: 196, 216: 196, 217: 196, 218: 196, // Orange Leather
      219: 199, 220: 199, 221: 199, 222: 199, // Yellow Leather
      223: 200, 224: 200, 225: 200, 226: 200, // Lime Leather
      227: 198, 228: 198, 229: 198, 230: 198, // Light Blue Leather
      231: 201, 232: 201, 233: 201, 234: 201, // Pink Leather
      235: 197, 236: 197, 237: 197, 238: 197, // Magenta Leather
      239: 195, 240: 195, 241: 195, 242: 195, // White Iron
      243: 196, 244: 196, 245: 196, 246: 196, // Orange Iron
      247: 199, 248: 199, 249: 199, 250: 199, // Yellow Iron
      251: 200, 252: 200, 253: 200, 254: 200, // Lime Iron
      255: 198, 256: 198, 257: 198, 258: 198, // Light Blue Iron
      259: 201, 260: 201, 261: 201, 262: 201, // Pink Iron
      263: 197, 264: 197, 265: 197, 266: 197, // Magenta Iron
      267: 195, 268: 195, 269: 195, 270: 195, // White Diamond
      271: 196, 272: 196, 273: 196, 274: 196, // Orange Diamond
      275: 199, 276: 199, 277: 199, 278: 199, // Yellow Diamond
      279: 200, 280: 200, 281: 200, 282: 200, // Lime Diamond
      283: 198, 284: 198, 285: 198, 286: 198, // Light Blue Diamond
      287: 201, 288: 201, 289: 201, 290: 201, // Pink Diamond
      291: 197, 292: 197, 293: 197, 294: 197, // Magenta Diamond
      295: 195, 296: 195, 297: 195, 298: 195, // White Gold
      299: 196, 300: 196, 301: 196, 302: 196, // Orange Gold
      303: 199, 304: 199, 305: 199, 306: 199, // Yellow Gold
      307: 200, 308: 200, 309: 200, 310: 200, // Lime Gold
      311: 198, 312: 198, 313: 198, 314: 198, // Light Blue Gold
      315: 201, 316: 201, 317: 201, 318: 201, // Pink Gold
      319: 197, 320: 197, 321: 197, 322: 197, // Magenta Gold
    };
    const dyeId = dyeMap[itemId];
    if (dyeId) {
      return hexToRGB(ITEM_COLORS[dyeId] ?? '#d9dde8');
    }
    return null;
  }

  private getBaseArmorColor(itemId: number): [number, number, number] | null {
    // Base armor IDs: LEATHER=140-143, IRON=144-147, DIAMOND=148-151, GOLD=162-165
    const baseMap: Record<number, number> = {
      211: 140, 212: 141, 213: 142, 214: 143, // White Leather
      215: 140, 216: 141, 217: 142, 218: 143, // Orange Leather
      219: 140, 220: 141, 221: 142, 222: 143, // Yellow Leather
      223: 140, 224: 141, 225: 142, 226: 143, // Lime Leather
      227: 140, 228: 141, 229: 142, 230: 143, // Light Blue Leather
      231: 140, 232: 141, 233: 142, 234: 143, // Pink Leather
      235: 140, 236: 141, 237: 142, 238: 143, // Magenta Leather
      239: 144, 240: 145, 241: 146, 242: 147, // White Iron
      243: 144, 244: 145, 245: 146, 246: 147, // Orange Iron
      247: 144, 248: 145, 249: 146, 250: 147, // Yellow Iron
      251: 144, 252: 145, 253: 146, 254: 147, // Lime Iron
      255: 144, 256: 145, 257: 146, 258: 147, // Light Blue Iron
      259: 144, 260: 145, 261: 146, 262: 147, // Pink Iron
      263: 144, 264: 145, 265: 146, 266: 147, // Magenta Iron
      267: 148, 268: 149, 269: 150, 270: 151, // White Diamond
      271: 148, 272: 149, 273: 150, 274: 151, // Orange Diamond
      275: 148, 276: 149, 277: 150, 278: 151, // Yellow Diamond
      279: 148, 280: 149, 281: 150, 282: 151, // Lime Diamond
      283: 148, 284: 149, 285: 150, 286: 151, // Light Blue Diamond
      287: 148, 288: 149, 289: 150, 290: 151, // Pink Diamond
      291: 148, 292: 149, 293: 150, 294: 151, // Magenta Diamond
      295: 162, 296: 163, 297: 164, 298: 165, // White Gold
      299: 162, 300: 163, 301: 164, 302: 165, // Orange Gold
      303: 162, 304: 163, 305: 164, 306: 165, // Yellow Gold
      307: 162, 308: 163, 309: 164, 310: 165, // Lime Gold
      311: 162, 312: 163, 313: 164, 314: 165, // Light Blue Gold
      315: 162, 316: 163, 317: 164, 318: 165, // Pink Gold
      319: 162, 320: 163, 321: 164, 322: 165, // Magenta Gold
    };
    const baseId = baseMap[itemId];
    if (baseId) {
      return hexToRGB(ITEM_COLORS[baseId] ?? '#d9dde8');
    }
    return null;
  }

  private lightenColor(color: [number, number, number]): [number, number, number] {
    return [
      Math.min(255, color[0] * 1.3),
      Math.min(255, color[1] * 1.3),
      Math.min(255, color[2] * 1.3)
    ];
  }

  private drawHeldWeaponForAvatar(baseMVP: Float32Array, root: Float32Array, handX: number, shoulderY: number, armHeight: number, armAngle: number, weaponId: number): void {
    if (!weaponId || weaponId <= 0) return;
    this.ensureWeaponMeshFor(weaponId);
    const mesh = this.weaponMeshes.get(weaponId);
    if (!mesh?.vao) return;

    const gl = this.gl;
    // Position weapon at hand - weapon mesh points along +X, so rotate to point up and outward
    // Apply rotation to tilt upward and outward from player's body
    const weaponRotY = weaponId === ItemId.BOW ? rotationYMatrix(1.2) : rotationYMatrix(Math.PI / 2);
    const weaponRotZ = weaponId === ItemId.BOW ? rotationZMatrix(-0.12) : rotationZMatrix(-Math.PI / 4);
    const weaponOffset = weaponId === ItemId.BOW
      ? translationMatrix(0.04, -armHeight * 0.28, 0.12)
      : translationMatrix(0.05, -armHeight * 0.35, 0.18);
    const handAnchor = multiplyMat4(root,
      multiplyMat4(
        translationMatrix(handX, shoulderY, 0),
        multiplyMat4(
          rotationXMatrix(armAngle),
          multiplyMat4(
            weaponRotY,
            multiplyMat4(
              weaponRotZ,
              multiplyMat4(
                weaponOffset,
                scaleMatrix(0.9)
              )
            )
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

  private drawHeldWeaponIfVisible(p: DCPlayer, baseMVP: Float32Array, now: number, speed: number, eyeH: number, gl: WebGL2RenderingContext): void {
    const weaponId = (p as any).equipment?.weapon ?? (p as any).weapon ?? 0;
    if (weaponId && weaponId > 0) {
      this.ensureWeaponMeshFor(weaponId);
      const mesh = this.weaponMeshes.get(weaponId);
      if (mesh && mesh.vao) {
        // compute bob offset and arm swing similar to avatar renderer
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
        const armHeight = 0.72;

        // compute arm swing (same formula as avatar)
        const phase = time * (0.8 + Math.min(1, sp / 4) * 2.4) + p.userId * 0.15;
        const swingAmount = Math.min(0.75, sp / 4);
        const armSwing = Math.sin(phase + Math.PI) * swingAmount * 0.75;
        const weaponIdLocal = (p as any).weapon ?? 0;
        let armAngle = weaponIdLocal > 0 ? -0.45 : armSwing;
        // If attacking, animate a repeated swing while the flag remains true
        if ((p as any).isAttacking) {
          const attackSpeed = 8.0;
          const attackAmp = 0.6;
          armAngle = 0.6 - Math.sin(time * attackSpeed + p.userId) * attackAmp;
        }

        // world transform: T(player) * R(bodyYaw) * hand local anchor * arm rotation * weapon local offset
        const P = translationMatrix(p.posX, p.posY - eyeH, p.posZ);
        // bodyYaw from server is world-space; negate for renderer (same as drawHumanoidAvatar)
        const R = rotationYMatrix(-((p as any).bodyYaw ?? p.yaw ?? 0));
        const handAnchor = multiplyMat4(P, multiplyMat4(R, multiplyMat4(
          translationMatrix(handX, handY, handZ),
          multiplyMat4(rotationXMatrix(armAngle), multiplyMat4(translationMatrix(0.02, -armHeight + 0.14, 0.08), multiplyMat4(rotationZMatrix(Math.PI / 2), scaleMatrix(0.9)))))
        ));
        const finalMVP = multiplyMat4(baseMVP, handAnchor);

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

  private drawLeftHandItem(p: DCPlayer, baseMVP: Float32Array, now: number, speed: number, eyeH: number, gl: WebGL2RenderingContext): void {
    const leftHand = (p as any).equipment?.leftHand ?? (p as any).leftHand ?? 0;
    if (!leftHand) return;

    const time = now ?? performance.now() / 1000;
    const walkFactor = Math.min(1, (speed ?? 0) / 4);
    const bob = Math.sin(time * (2 + walkFactor * 6) + p.userId) * (0.02 + walkFactor * 0.06);

    const legH = 0.5;
    const torsoH = 0.8;
    const handY = legH + torsoH - 0.15 + bob;
    const handX = -0.36; // left hand (negative X = to the left)
    const handZ = 0.14;
    const armHeight = 0.72;

    // Blocking arm angle when defending with shield
    let armAngle = 0.3;
    if ((p as any).isDefending && leftHand === 172) { // SHIELD
      armAngle = 0.8;
    }

    const P = translationMatrix(p.posX, p.posY - eyeH, p.posZ);
    const R = rotationYMatrix(-((p as any).bodyYaw ?? p.yaw ?? 0));
    const handAnchor = multiplyMat4(P, multiplyMat4(R, multiplyMat4(
      translationMatrix(handX, handY, handZ),
      multiplyMat4(rotationXMatrix(armAngle), multiplyMat4(translationMatrix(0.02, -armHeight + 0.14, 0.08), multiplyMat4(rotationZMatrix(Math.PI / 2), scaleMatrix(0.9)))))
    ));
    const finalMVP = multiplyMat4(baseMVP, handAnchor);

    if (leftHand === ItemId.TORCH || leftHand === BlockId.TORCH) { // TORCH
      this.ensureWeaponMeshFor(ItemId.TORCH);
      const mesh = this.weaponMeshes.get(ItemId.TORCH);
      if (mesh?.vao) {
        gl.uniform3f(this.uTint, 1.0, 0.85, 0.4);
        gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
      }
    } else if (leftHand === ItemId.SHIELD) { // SHIELD
      this.ensureWeaponMeshFor(ItemId.SHIELD);
      const mesh = this.weaponMeshes.get(ItemId.SHIELD);
      if (mesh?.vao) {
        gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
        gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
      }
    }
    gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
  }

  private drawHumanoidAvatar(
    p: DCPlayer,
    baseMVP: Float32Array,
    now: number,
    speed: number,
    opts?: { preview?: boolean; rootWorld?: Float32Array; baseColorHex?: string; skinColorHex?: string; skipWeapon?: boolean }
  ): void {
    const eyeHeight = 1.6;

    // For preview mode, yaw is the spin yaw passed directly (no negation needed).
    // For other players: server stores camera yaw in world-space (0 = +Z forward, positive = CCW).
    // WebGL view uses -Z forward, so negate for both body and head.
    const isPreview = !!opts?.preview;
    const bodyYaw = p.bodyYaw ?? p.yaw ?? 0;
    const headYaw = p.yaw ?? 0;
    const headPitch = (p as any).pitch ?? 0;

    const renderBodyYaw = isPreview ? bodyYaw : -bodyYaw;
    const renderHeadYaw = headYaw;
    // Pitch: server stores positive-up pitch. WebGL pitch is also positive-up (rotateX).
    // No negation needed for pitch.
    const renderHeadPitch = headPitch;

    const root = opts?.rootWorld ?? multiplyMat4(
      translationMatrix(p.posX, p.posY - eyeHeight, p.posZ),
      rotationYMatrix(renderBodyYaw)
    );

    const baseColor = hexToRGB(opts?.baseColorHex ?? p.color ?? '#7fb5ff');
    const skinColor = hexToRGB(opts?.skinColorHex ?? '#efc39a');
    const shirtColor = this.tintColor(baseColor, 1.02);
    const pantsColor = this.tintColor(baseColor, 0.55);
    const sleeveColor = this.tintColor(baseColor, 0.92);

    const helmetId = (p as any).helmet ?? 0;
    const chestId = (p as any).chest ?? 0;
    const legsId = (p as any).legs ?? 0;
    const bootsId = (p as any).boots ?? 0;
    const legsDye = this.getArmorDyeColor(legsId);
    const legArmorColor = legsDye ?? this.armorColor(legsId);
    const legHighlightColor = this.lightenColor(legArmorColor);
    const baseArmorColor = this.getBaseArmorColor(legsId) ?? this.armorColor(legsId);

    const legW = 0.23, legH = 0.72, legD = 0.23;
    const torsoW = 0.56, torsoH = 0.72, torsoD = 0.29;
    const armW = 0.19, armH = 0.72, armD = 0.19;
    const shoulderW = 0.28, shoulderH = 0.22, shoulderD = 0.25;
    const headS = 0.48;
    const shoulderY = legH + torsoH - 0.05;
    const armX = torsoW * 0.5 + armW * 0.55;

    const phase = now * ((isPreview ? 2.4 : 0.8) + Math.min(1, speed / 4) * 2.4) + p.userId * 0.15;
    const swingAmount = isPreview ? 0.38 : Math.min(0.75, speed / 4);
    const legSwing = Math.sin(phase) * swingAmount * 0.85;
    const armSwing = Math.sin(phase + Math.PI) * swingAmount * 0.75;
    const bob = (isPreview ? Math.sin(now * 1.6) : Math.sin(phase * 0.5)) *
      (isPreview ? 0.025 : Math.min(0.04, speed * 0.015));
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    // ── Torso ──────────────────────────────────────────────────────────────────
    const torsoWorld = multiplyMat4(
      rootBob,
      multiplyMat4(translationMatrix(0, legH + torsoH * 0.5, 0), this.scaleXYZ(torsoW, torsoH, torsoD))
    );
    this.drawCube(baseMVP, torsoWorld, shirtColor);

    // Head rotates independently from body
    const headRelYaw = renderHeadYaw - renderBodyYaw;
    const headLocal = multiplyMat4(
      translationMatrix(0, legH + torsoH + headS * 0.5, 0),
      multiplyMat4(rotationYMatrix(headRelYaw), rotationXMatrix(renderHeadPitch))
    );
    const headWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, this.scaleXYZ(headS, headS, headS)));
    this.drawCube(baseMVP, headWorld, skinColor);

    // ── Face (blocky pixel art) ────────────────────────────────────────────────
    const playerFace = (p as any).face || 'default';
    if (playerFace && playerFace !== 'default') {
      this.drawBlockyFace(playerFace, baseMVP, rootBob, headLocal, headS);
    }

    // ── Legs ───────────────────────────────────────────────────────────────────
    if (!legsId) {
      const leftLegWorld = multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, legH, 0),
        multiplyMat4(rotationXMatrix(legSwing),
          multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(legW, legH, legD)))
      ));
      this.drawCube(baseMVP, leftLegWorld, pantsColor);

      const rightLegWorld = multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, legH, 0),
        multiplyMat4(rotationXMatrix(-legSwing),
          multiplyMat4(translationMatrix(0, -legH * 0.5, 0), this.scaleXYZ(legW, legH, legD)))
      ));
      this.drawCube(baseMVP, rightLegWorld, pantsColor);
    }
    

    // ── Arm swing angle ────────────────────────────────────────────────────────
    const weaponId = (p as any).equipment?.weapon ?? (p as any).weapon ?? 0;
    const leftHandId = (p as any).equipment?.leftHand ?? (p as any).leftHand ?? 0;
    // Right arm: use weapon angle when equipped, otherwise swing
    let rightArmBaseAngle = weaponId > 0 ? -0.45 : armSwing;
    // Left arm: always swing (different phase for natural look)
    const leftArmSwing = Math.sin(phase + Math.PI + 0.5) * swingAmount * 0.75;
    if ((p as any).isAttacking) {
      const attackSpeed = 12.0;
      const attackAmp = 1.2;
      rightArmBaseAngle = -Math.abs(Math.sin(now * attackSpeed + p.userId)) * attackAmp;
    }

    // ── Shoulders ──────────────────────────────────────────────────────────────
    // Right shoulder: doesn't swing when weapon is equipped in the right hand (that arm is occupied)
    // Left shoulder: always swings with the freely swinging left arm
    const rightShoulderSwing = weaponId > 0 ? 0 : armSwing;
    const leftShoulderSwing = armSwing;
    const shoulderY2 = shoulderY + shoulderH * 0.1;
    if (!chestId) {
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(armX, shoulderY2, 0),
        multiplyMat4(rotationXMatrix(rightShoulderSwing),
          multiplyMat4(translationMatrix(0, -shoulderH * 0.5, 0), this.scaleXYZ(shoulderW, shoulderH, shoulderD))
        )
      )), shirtColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-armX, shoulderY2, 0),
        multiplyMat4(rotationXMatrix(leftShoulderSwing),
          multiplyMat4(translationMatrix(0, -shoulderH * 0.5, 0), this.scaleXYZ(shoulderW, shoulderH, shoulderD))
        )
      )), shirtColor);
    }
    
    // ── Arms ───────────────────────────────────────────────────────────────────
    // Right arm (always drawn - weapon goes on top)
    const rightArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(armX, shoulderY, 0),
      multiplyMat4(
        rotationXMatrix(rightArmBaseAngle),
        multiplyMat4(
          translationMatrix(0, -armH * 0.5, 0),
          this.scaleXYZ(armW, armH, armD)
        )
      )
    ));
    this.drawCube(baseMVP, rightArmWorld, sleeveColor);

    // Draw weapon on top of arm (for game mode)
    if (!opts?.preview && weaponId && weaponId > 0) {
      this.drawHeldWeaponForAvatar(baseMVP, rootBob, armX, shoulderY, armH, rightArmBaseAngle, weaponId);
    }

    // For preview mode, also draw the weapon in the right hand
    if (opts?.preview && weaponId && weaponId > 0) {
      this.drawHeldWeaponForAvatar(baseMVP, rootBob, armX, shoulderY, armH, rightArmBaseAngle, weaponId);
    }

    // Left arm
    const leftArmWorld = multiplyMat4(rootBob, multiplyMat4(
      translationMatrix(-armX, shoulderY, 0),
      multiplyMat4(
        rotationXMatrix(leftArmSwing),
        multiplyMat4(
          translationMatrix(0, -armH * 0.5, 0),
          this.scaleXYZ(armW, armH, armD)
        )
      )
    ));
    this.drawCube(baseMVP, leftArmWorld, sleeveColor);

    // Render left hand items for inventory preview mode (both hands visible)
    if (opts?.preview && leftHandId && leftHandId > 0) {
      // Position item in left hand (same location as right hand item, but on left side)
      const baseRot = multiplyMat4(rotationXMatrix(leftArmSwing * (Math.PI / 2)), rotationYMatrix(Math.PI / 2));

      const handAnchor = multiplyMat4(rootBob,
        multiplyMat4(
          translationMatrix(-armX, shoulderY, 0),
          multiplyMat4(
            baseRot,
            multiplyMat4(
              translationMatrix(0.02, -armH * 0.55, -0.1),  // positioning offset for left hand
              multiplyMat4(rotationZMatrix(Math.PI / 2), scaleMatrix(0.9))
            )
          )
        )
      );
      
      this.ensureWeaponMeshFor(leftHandId);
      const mesh = this.weaponMeshes.get(leftHandId);
      if (mesh?.vao) {
        this.gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
        this.gl.uniformMatrix4fv(this.uMVP, false, multiplyMat4(baseMVP, handAnchor));
        this.gl.bindVertexArray(mesh.vao);
        this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_INT, 0);
        this.gl.bindVertexArray(null);
      }
    }

    // ── Armor ──────────────────────────────────────────────────────────────────
    const helmetColor = this.getBaseArmorColor(helmetId) ?? this.armorColor(helmetId);
    const helmetDyeColor = this.getArmorDyeColor(helmetId) ?? this.lightenColor(helmetColor);
    if (helmetId) {
      // Back plate that covers the rear of the skull and extends above the head
      const helmetBackLocal = multiplyMat4(
        translationMatrix(0, headS * 0.18, headS * 0.44),
        this.scaleXYZ(headS + 0.12, headS * 0.78, headS * 0.7)
      );
      const helmetBackWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, helmetBackLocal));
      this.drawCube(baseMVP, helmetBackWorld, helmetColor);

      // Top cap that covers more of the head front and extends back over the crown
      const helmetTopLocal = multiplyMat4(
        translationMatrix(0, headS * 0.45, -headS * 0.22),
        this.scaleXYZ(headS + 0.14, headS * 0.44, headS * 0.72)
      );
      const helmetTopWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, helmetTopLocal));
      this.drawCube(baseMVP, helmetTopWorld, helmetColor);

      // Side plates that protect the temples without blocking the face
      const sidePlateLeftLocal = multiplyMat4(
        translationMatrix(-headS * 0.5, headS * 0.18, -headS * 0.06),
        this.scaleXYZ(headS * 0.16, headS * 0.58, headS * 0.44)
      );
      const sidePlateRightLocal = multiplyMat4(
        translationMatrix(headS * 0.5, headS * 0.18, -headS * 0.06),
        this.scaleXYZ(headS * 0.16, headS * 0.58, headS * 0.44)
      );
      const sidePlateLeftWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, sidePlateLeftLocal));
      const sidePlateRightWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, sidePlateRightLocal));
      this.drawCube(baseMVP, sidePlateLeftWorld, helmetDyeColor);
      this.drawCube(baseMVP, sidePlateRightWorld, helmetDyeColor);

      // Slight brow band above the eyes for a more defined front face rim
      const browLocal = multiplyMat4(
        translationMatrix(0, headS * 0.24, -headS * 0.02),
        this.scaleXYZ(headS * 0.6, headS * 0.08, headS * 0.08)
      );
      const browWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, browLocal));
      this.drawCube(baseMVP, browWorld, helmetDyeColor);

      // Horizontal bar across helmet forehead right behind nose guard
      // Uses dye color if available, otherwise the lightened armor color
      const barColor = helmetDyeColor ?? this.lightenColor(helmetColor);
      const barLocal = multiplyMat4(
        translationMatrix(0, headS * 0.12, -headS * 0.65), // positioned right behind nose guard
        this.scaleXYZ(headS * 0.4, headS * 0.04, headS * 0.04)
      );
      const barWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, barLocal));
      this.drawCube(baseMVP, barWorld, barColor);

      // Nose guard projection in front of the face - exaggerated position
      const noseLocal = multiplyMat4(
        translationMatrix(0, headS * 0.08, -headS * 0.75), // moved even further in front
        this.scaleXYZ(headS * 0.2, headS * 0.48, headS * 0.10)
      );
      const noseWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, noseLocal));
      this.drawCube(baseMVP, noseWorld, helmetDyeColor);

      // Helmet highlight stripe along the top/front edge
      const hlLocal = multiplyMat4(
        translationMatrix(0, headS * 0.42, -headS * 0.08),
        this.scaleXYZ(headS * 0.78, headS * 0.08, headS * 0.1)
      );
      const hlWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, hlLocal));
      this.drawCube(baseMVP, hlWorld, helmetDyeColor);
    }

    const chestColor = this.armorColor(chestId);
    const chestHighlightColor = this.lightenColor(chestColor);

    if (chestId) {
      // Main torso
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + torsoH * 0.5, 0),
          this.scaleXYZ(torsoW + 0.07, torsoH + 0.06, torsoD + 0.06))), chestColor);
      // Pectoral highlight (back)
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + torsoH * 0.65, torsoD * 0.8),
          this.scaleXYZ(torsoW * 0.5, torsoH * 0.15, torsoD * 0.2))), chestHighlightColor);
      // Pectoral highlight (front)
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + torsoH * 0.65, -torsoD * 0.8),
          this.scaleXYZ(torsoW * 0.5, torsoH * 0.15, torsoD * 0.2))), chestHighlightColor);
      // Shoulders - right shoulder doesn't swing with weapon, left shoulder always swings
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(armX, shoulderY2, 0),
        multiplyMat4(
          multiplyMat4(rotationXMatrix(rightShoulderSwing),
            translationMatrix(0, -shoulderH * 0.5, 0)),
          this.scaleXYZ(shoulderW + 0.05, shoulderH + 0.05, shoulderD + 0.05)))), chestColor);
      // Shoulder stripe highlight
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(armX, shoulderY2 + shoulderH * 0.2, 0),
        this.scaleXYZ(shoulderW * 0.6, shoulderH * 0.15, shoulderD * 0.6))), chestHighlightColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-armX, shoulderY2 + shoulderH * 0.2, 0),
        this.scaleXYZ(shoulderW * 0.6, shoulderH * 0.15, shoulderD * 0.6))), chestHighlightColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-armX, shoulderY2, 0),
        multiplyMat4(
          multiplyMat4(rotationXMatrix(leftShoulderSwing),
            translationMatrix(0, -shoulderH * 0.5, 0)),
          this.scaleXYZ(shoulderW + 0.05, shoulderH + 0.05, shoulderD + 0.05)))), chestColor);
    }

    if (legsId) {
      // Left leg
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, legH, 0),
        multiplyMat4(rotationXMatrix(legSwing),
          multiplyMat4(translationMatrix(0, -legH * 0.5, 0),
            this.scaleXYZ(legW + 0.05, legH + 0.04, legD + 0.05))))), baseArmorColor);
      // Right leg
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, legH, 0),
        multiplyMat4(rotationXMatrix(-legSwing),
          multiplyMat4(translationMatrix(0, -legH * 0.5, 0),
            this.scaleXYZ(legW + 0.05, legH + 0.04, legD + 0.05))))), baseArmorColor);
      // Belt/waist
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + 0.08, 0),
          this.scaleXYZ(torsoW * 0.72, 0.18, torsoD + 0.05))), legArmorColor);
      // Belt highlights (front and back)
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + 0.1, torsoD * 0.7),
          this.scaleXYZ(torsoW * 0.5, 0.08, torsoD * 0.15))), legHighlightColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + 0.1, -torsoD * 0.7),
          this.scaleXYZ(torsoW * 0.5, 0.08, torsoD * 0.15))), legHighlightColor);
      // Front buckle
      this.drawCube(baseMVP, multiplyMat4(rootBob,
        multiplyMat4(translationMatrix(0, legH + 0.14, -torsoD * 0.7),
          this.scaleXYZ(torsoW * 0.1, 0.04, torsoD * 0.05))), baseArmorColor);
      // Side leg highlights (for dyed armors) 
      const highlightWidth = legW * 0.1;
      const highlightHeight = legH * 0.3;
      // Left side highlight
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13 - highlightWidth/2, legH - highlightHeight/2, 0),
        this.scaleXYZ(highlightWidth, highlightHeight, legD * 0.8))), legArmorColor);
      // Right side highlight
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13 + highlightWidth/2, legH - highlightHeight/2, 0),
        this.scaleXYZ(highlightWidth, highlightHeight, legD * 0.8))), legArmorColor);
      
    }
 
    const bootsDye = this.getArmorDyeColor(bootsId);
    const bootsColor = bootsDye ?? this.getBaseArmorColor(bootsId) ?? this.armorColor(bootsId);
    const bootsBaseColor = this.armorColor(bootsId);
    if (bootsId) {
      const bootHeight = 0.24;
      // Left boot
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, legH, 0),
        multiplyMat4(rotationXMatrix(legSwing),
          multiplyMat4(translationMatrix(0, -legH + bootHeight * 0.5, 0),
            this.scaleXYZ(legW + 0.06, bootHeight, legD + 0.07))))), bootsBaseColor);
      // Right boot
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, legH, 0),
        multiplyMat4(rotationXMatrix(-legSwing),
          multiplyMat4(translationMatrix(0, -legH + bootHeight * 0.5, 0),
            this.scaleXYZ(legW + 0.06, bootHeight, legD + 0.07))))), bootsBaseColor);
      // Boot stripe highlights 
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(-0.13, legH + bootHeight * 0.3, 0),
        this.scaleXYZ(legW * 0.7, bootHeight * 0.15, legD * 0.8))), bootsColor);
      this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(
        translationMatrix(0.13, legH + bootHeight * 0.3, 0),
        this.scaleXYZ(legW * 0.7, bootHeight * 0.15, legD * 0.8))), bootsColor);
    }

    if (!opts?.skipWeapon) {
      this.drawHeldWeaponForAvatar(baseMVP, rootBob, armX, shoulderY, armH, rightArmBaseAngle, weaponId);
    }
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

    const previewPlayer: DCPlayer = { ...player, yaw: -spinYaw, posX: 0, posY: 1.6, posZ: 0 };
    this.drawHumanoidAvatar(previewPlayer, mvp, now, 1.2, { preview: true });
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
  }

  // weapon meshes cached per item id (built on demand)
  // see ensureWeaponMeshFor(itemId)
  /** Simple shark renderer: elongated body, dorsal & side fins, wagging tail. */
  private drawShark(baseMVP: Float32Array, posX: number, posY: number, posZ: number, yaw: number, now: number, speed: number): void {
    const eyeHeight = 1.6;
    const bodyColor: [number, number, number] = [0.36, 0.52, 0.58];
    const bellyColor: [number, number, number] = [0.78, 0.86, 0.88];

    const root = multiplyMat4(
      translationMatrix(posX, posY - eyeHeight, posZ),
      rotationYMatrix(-yaw)
    );

    // gentle bob and swim-phase for tail wagging
    const phase = now * (1.2 + Math.min(1, speed / 2));
    const bob = Math.sin(phase * 0.6) * 0.06;
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    // Body - elongated along Z
    const bodyY = 0.6;
    const bodyWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, bodyY, 0), this.scaleXYZ(0.5, 0.28, 1.1)));
    this.drawCube(baseMVP, bodyWorld, bodyColor);

    // Belly (lighter underside)
    const bellyWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, bodyY - 0.08, 0.05), this.scaleXYZ(0.44, 0.18, 0.9)));
    this.drawCube(baseMVP, bellyWorld, bellyColor);

    // Dorsal fin
    const dorsal = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, bodyY + 0.22, -0.05), this.scaleXYZ(0.07, 0.26, 0.36)));
    this.drawCube(baseMVP, dorsal, bodyColor);

    // Side fins
    const leftFin = multiplyMat4(rootBob, multiplyMat4(translationMatrix(-0.36, bodyY, 0.0), this.scaleXYZ(0.06, 0.02, 0.26)));
    const rightFin = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0.36, bodyY, 0.0), this.scaleXYZ(0.06, 0.02, 0.26)));
    this.drawCube(baseMVP, leftFin, bodyColor);
    this.drawCube(baseMVP, rightFin, bodyColor);

    // Tail - two-part with wag animation
    const tailAngle = Math.sin(phase * 2.5) * 0.6 * (0.6 + Math.min(1, speed));
    const tailBasePosZ = -0.6;
    const tailBase = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, bodyY, tailBasePosZ), rotationYMatrix(tailAngle)));
    const tailWorld = multiplyMat4(tailBase, this.scaleXYZ(0.28, 0.18, 0.36));
    this.drawCube(baseMVP, tailWorld, bodyColor);
    const tailTip = multiplyMat4(multiplyMat4(tailBase, translationMatrix(0, 0, -0.32)), this.scaleXYZ(0.18, 0.12, 0.28));
    this.drawCube(baseMVP, tailTip, bodyColor);

    // Eyes near the front
    const eyeSize = 0.06;
    const eyeZ = 0.56;
    const leftEye = multiplyMat4(rootBob, multiplyMat4(translationMatrix(-0.18, bodyY + 0.05, eyeZ), this.scaleXYZ(eyeSize, eyeSize, 0.02)));
    const rightEye = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0.18, bodyY + 0.05, eyeZ), this.scaleXYZ(eyeSize, eyeSize, 0.02)));
    this.drawCube(baseMVP, leftEye, [0, 0, 0]);
    this.drawCube(baseMVP, rightEye, [0, 0, 0]);
  }

  /** Trident-wielding underwater zombie: humanoid with a long trident prop. */
  private drawTridentZombie(baseMVP: Float32Array, posX: number, posY: number, posZ: number, yaw: number, now: number, speed: number): void {
    const eyeHeight = 1.6;
    const skin: [number, number, number] = [0.22, 0.58, 0.52];
    const cloth: [number, number, number] = [0.18, 0.24, 0.28];
    const tridentColor: [number, number, number] = [0.7, 0.9, 0.95];

    const root = multiplyMat4(
      translationMatrix(posX, posY - eyeHeight, posZ),
      rotationYMatrix(-yaw)
    );

    // slow bob to show underwater drift
    const phase = now * (0.6 + Math.min(1, speed / 4));
    const bob = Math.sin(phase * 0.7) * 0.04;
    const rootBob = multiplyMat4(root, translationMatrix(0, bob, 0));

    // Head
    const headSize = 0.36;
    const headY = 1.56;
    const headWorld = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, headY, 0), this.scaleXYZ(headSize, headSize, headSize * 0.9)));
    this.drawCube(baseMVP, headWorld, skin);

    // Eyes
    const eyeSize = 0.08;
    const eyeZ = headSize * 0.9 / 2 + 0.01;
    const eyeSpacing = 0.09;
    this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(translationMatrix(-eyeSpacing, headY + 0.02, eyeZ), this.scaleXYZ(eyeSize, eyeSize, 0.02))), [0, 0, 0]);
    this.drawCube(baseMVP, multiplyMat4(rootBob, multiplyMat4(translationMatrix(eyeSpacing, headY + 0.02, eyeZ), this.scaleXYZ(eyeSize, eyeSize, 0.02))), [0, 0, 0]);

    // Torso
    const torsoY = headY - 0.4;
    const torso = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0, torsoY, 0), this.scaleXYZ(0.36, 0.46, 0.22)));
    this.drawCube(baseMVP, torso, cloth);

    // Arms
    const armY = torsoY + 0.08;
    const armH = 0.44;
    // Left arm (idle)
    const leftArm = multiplyMat4(rootBob, multiplyMat4(translationMatrix(-0.38, armY, 0), this.scaleXYZ(0.09, armH, 0.08)));
    this.drawCube(baseMVP, leftArm, skin);
    // Right arm (holds trident)
    const rightArmRoot = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0.38, armY - 0.06, 0.06), rotationYMatrix(-0.12)));
    const rightArm = multiplyMat4(rightArmRoot, this.scaleXYZ(0.09, armH, 0.08));
    this.drawCube(baseMVP, rightArm, skin);

    // Legs
    const hipY = torsoY - 0.36;
    const leftLeg = multiplyMat4(rootBob, multiplyMat4(translationMatrix(-0.12, hipY - 0.25, 0), this.scaleXYZ(0.12, 0.5, 0.12)));
    const rightLeg = multiplyMat4(rootBob, multiplyMat4(translationMatrix(0.12, hipY - 0.25, 0), this.scaleXYZ(0.12, 0.5, 0.12)));
    this.drawCube(baseMVP, leftLeg, cloth);
    this.drawCube(baseMVP, rightLeg, cloth);

    // Trident: long thin shaft + three prongs at tip
    const shaftLen = 1.1;
    const shaft = multiplyMat4(rightArmRoot, multiplyMat4(translationMatrix(0, 0, shaftLen * 0.5 + 0.14), rotationYMatrix(0)));
    const shaftBox = multiplyMat4(shaft, this.scaleXYZ(0.04, 0.04, shaftLen));
    this.drawCube(baseMVP, shaftBox, tridentColor);

    // Prongs - three small tines at front
    const prongCenter = multiplyMat4(shaft, translationMatrix(0, 0, shaftLen * 0.5 + 0.02));
    const prong1 = multiplyMat4(prongCenter, this.scaleXYZ(0.02, 0.12, 0.02));
    const prong2 = multiplyMat4(multiplyMat4(prongCenter, translationMatrix(-0.06, 0, 0)), this.scaleXYZ(0.02, 0.12, 0.02));
    const prong3 = multiplyMat4(multiplyMat4(prongCenter, translationMatrix(0.06, 0, 0)), this.scaleXYZ(0.02, 0.12, 0.02));
    this.drawCube(baseMVP, prong1, tridentColor);
    this.drawCube(baseMVP, prong2, tridentColor);
    this.drawCube(baseMVP, prong3, tridentColor);
  }

  private drawPlayerPillar(p: DCPlayer, baseMVP: Float32Array, now?: number, speed?: number, camX?: number, camY?: number, camZ?: number): void {
    const gl = this.gl;
    if (!this._playerPillarLogOnce) {
      try { console.info('DigCraftRenderer: drawPlayerPillar called example:', p.userId, p.posX, p.posY, p.posZ); } catch (e) { }
      this._playerPillarLogOnce = true;
    }

    // Flash red when damaged
    if ((p as any).isFlashing) {
      gl.uniform3f(this.uTint, 1.0, 0.2, 0.2);
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
      // Sharks: elongated swimming predator
      if (mobType === 'Shark') {
        this.drawShark(baseMVP, p.posX, p.posY, p.posZ, p.yaw ?? 0, now ?? performance.now() / 1000, speed ?? 0);
        return;
      }
      // Trident-wielding underwater zombie
      if (mobType === 'TridentZombie') {
        this.drawTridentZombie(baseMVP, p.posX, p.posY, p.posZ, p.yaw ?? 0, now ?? performance.now() / 1000, speed ?? 0);
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

    // Use the detailed humanoid avatar renderer for players so head and body
    // rotations are applied independently (bodyYaw from movement, head yaw/pitch from camera).
    if (!isMob) {
      this.drawHumanoidAvatar(p, baseMVP, now ?? performance.now() / 1000, speed ?? 0, { skipWeapon: true });
      this.drawHeldWeaponIfVisible(p, baseMVP, now ?? performance.now() / 1000, speed ?? 0, eyeHeight, gl);
      this.drawLeftHandItem(p, baseMVP, now ?? performance.now() / 1000, speed ?? 0, eyeHeight, gl);
      gl.uniformMatrix4fv(this.uMVP, false, baseMVP);
      gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
      return;
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
    ctx.font = 'bold 24px minecraftFont, monospace';
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

  /** Render a player's face as a textured quad on their head */
  private drawFaceText(face: string, worldMatrix: Float32Array, baseMVP: Float32Array): void {
    const tex = this.getNameTexture(face);
    this.ensureTextQuad();
    const gl = this.gl;
    gl.useProgram(this.textProgram);
    const S = this.scaleXYZ(0.15, 0.15, 1); // Smaller scale for face
    const finalWorld = multiplyMat4(worldMatrix, S);
    const finalMVP = multiplyMat4(baseMVP, finalWorld);
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

  /** Draw a blocky / pixel-art face on the player's head using small cubes. */
  private drawBlockyFace(faceId: string, baseMVP: Float32Array, rootBob: Float32Array, headLocal: Float32Array, headS: number): void {
    let pattern: { grid: string[]; palette: Record<string, string> } | undefined;
    // Check if it's a numeric user face ID
    const numericId = parseInt(faceId, 10);
    if (!isNaN(numericId)) {
      const userFace = this.userFaces.find(f => f.id === numericId);
      if (userFace && userFace.gridData && userFace.paletteData) {
        const grid = userFace.gridData.split('');
        const N = 8;
        const gridRows: string[] = [];
        for (let i = 0; i < N; i++) {
          gridRows.push(grid.slice(i * N, (i + 1) * N).join(''));
        }
        const palette: Record<string, string> = {};
        const paletteParts = userFace.paletteData.split(',');
        for (const part of paletteParts) {
          const [key, color] = part.split(':');
          if (key && color) palette[key] = color;
        }
        pattern = { grid: gridRows, palette };
      }
    }
    // Fall back to built-in patterns
    if (!pattern) {
      pattern = FACE_PATTERNS[faceId] || FACE_PATTERNS['default'];
    }
    if (!pattern || !pattern.grid || pattern.grid.length === 0) return;
    const gl = this.gl;
    const N = pattern.grid.length; // we assume square grid (e.g., 8)
    const pixelSize = headS / N;
    const half = (N - 1) / 2;
    // thickness of the pixel cube in head-space (small extrusion off the head face)
    const thickness = pixelSize * 0.5;

    for (let row = 0; row < N; row++) {
      const line = pattern.grid[row] || '';
      for (let col = 0; col < N; col++) {
        const ch = line[col] || '.';
        if (!ch || ch === '.') continue;
        const hex = pattern.palette[ch];
        if (!hex) continue;
        const color = hexToRGB(hex);
        // compute offsets in head-local units (headLocal is centered at head center)
        const xOff = (col - half) * pixelSize;
        const yOff = (half - row) * pixelSize; // row 0 is top
        // Place pixels on the front of the head. Head-local forward is negative Z,
        // so negate the offset to ensure faces appear on the visible front side.
        const zOff = -headS * 0.5 - thickness * 0.5;

        const pixelWorld = multiplyMat4(rootBob, multiplyMat4(headLocal, multiplyMat4(translationMatrix(xOff, yOff, zOff), this.scaleXYZ(pixelSize * 0.95, pixelSize * 0.95, thickness))));
        // draw a small cube for this pixel
        this.drawCube(baseMVP, pixelWorld, color);
      }
    }
  }

  /** Ensure a mesh exists for the named mob type. Simple blocky animals (Pig, Cow, Sheep) get custom meshes. */
  private ensureMobMeshFor(type: string): void {
    if (!type) type = 'Mob';
    if (this.mobMeshes.has(type)) return;
    const gl = this.gl;

    // Pre-allocate typed arrays — max 40 boxes per mob × (24 verts × 7 floats) and (6 faces × 6 indices)
    const MAX_BOXES = 40;
    const VERTS_PER_BOX = 24 * 7; // 24 verts, 7 floats each
    const IDX_PER_BOX = 36;     // 6 faces × 6 indices
    const verts = new Float32Array(MAX_BOXES * VERTS_PER_BOX);
    const idx = new Uint32Array(MAX_BOXES * IDX_PER_BOX);
    let vi = 0; // float write cursor
    let ii = 0; // index write cursor
    let vc = 0; // vertex count

    const pushVert = (x: number, y: number, z: number, r: number, g: number, b: number, br: number) => {
      verts[vi++] = x; verts[vi++] = y; verts[vi++] = z;
      verts[vi++] = r; verts[vi++] = g; verts[vi++] = b;
      verts[vi++] = br;
    };

    const addBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, color: [number, number, number], bright: number) => {
      const r = color[0], g = color[1], b = color[2];
      // top
      pushVert(minX, maxY, minZ, r, g, b, bright);
      pushVert(maxX, maxY, minZ, r, g, b, bright);
      pushVert(maxX, maxY, maxZ, r, g, b, bright);
      pushVert(minX, maxY, maxZ, r, g, b, bright);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // bottom
      const bd = bright * 0.6;
      pushVert(minX, minY, maxZ, r, g, b, bd);
      pushVert(maxX, minY, maxZ, r, g, b, bd);
      pushVert(maxX, minY, minZ, r, g, b, bd);
      pushVert(minX, minY, minZ, r, g, b, bd);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // south
      const bs = bright * 0.9;
      pushVert(minX, minY, maxZ, r, g, b, bs);
      pushVert(minX, maxY, maxZ, r, g, b, bs);
      pushVert(maxX, maxY, maxZ, r, g, b, bs);
      pushVert(maxX, minY, maxZ, r, g, b, bs);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // north
      pushVert(maxX, minY, minZ, r, g, b, bs);
      pushVert(maxX, maxY, minZ, r, g, b, bs);
      pushVert(minX, maxY, minZ, r, g, b, bs);
      pushVert(minX, minY, minZ, r, g, b, bs);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // east
      const be = bright * 0.8;
      pushVert(maxX, minY, maxZ, r, g, b, be);
      pushVert(maxX, maxY, maxZ, r, g, b, be);
      pushVert(maxX, maxY, minZ, r, g, b, be);
      pushVert(maxX, minY, minZ, r, g, b, be);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // west
      pushVert(minX, minY, minZ, r, g, b, be);
      pushVert(minX, maxY, minZ, r, g, b, be);
      pushVert(minX, maxY, maxZ, r, g, b, be);
      pushVert(minX, minY, maxZ, r, g, b, be);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
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
      addBox(-0.22, 0, -0.14, -0.12, legH, 0.0, sand, 0.85);
      addBox(0.12, 0, -0.14, 0.22, legH, 0.0, sand, 0.85);
      addBox(-0.22, 0, 0.04, -0.12, legH, 0.18, sand, 0.85);
      addBox(0.12, 0, 0.04, 0.22, legH, 0.18, sand, 0.85);
      // body
      addBox(-0.38, legH, -0.20, 0.38, legH + 0.52, 0.20, sand, 1.0);
      // hump
      addBox(-0.10, legH + 0.44, -0.12, 0.14, legH + 0.72, 0.12, dark, 0.95);
      // neck
      addBox(0.38, legH + 0.18, -0.06, 0.52, legH + 0.52, 0.06, sand, 0.95);
      // head
      addBox(0.52, legH + 0.30, -0.08, 0.76, legH + 0.52, 0.08, sand, 1.0);
      // snout
      addBox(0.76, legH + 0.32, -0.05, 0.90, legH + 0.46, 0.05, dark, 0.9);
    } else if (t === 'Goat') {
      // White/grey mountain goat with small horns
      const wool = hexToRGB('#D8D0C0');
      const dark = hexToRGB('#706858');
      const legH = 0.40;
      // legs
      addBox(-0.18, 0, -0.10, -0.08, legH, 0.10, dark, 0.85);
      addBox(0.08, 0, -0.10, 0.18, legH, 0.10, dark, 0.85);
      addBox(-0.18, 0, 0.06, -0.08, legH, 0.16, dark, 0.85);
      addBox(0.08, 0, 0.06, 0.18, legH, 0.16, dark, 0.85);
      // body
      addBox(-0.30, legH, -0.18, 0.30, legH + 0.44, 0.18, wool, 1.0);
      // head
      addBox(0.32, legH + 0.20, -0.08, 0.56, legH + 0.44, 0.08, wool, 1.0);
      // horns (two small spikes)
      addBox(0.36, legH + 0.44, -0.06, 0.40, legH + 0.58, -0.02, dark, 0.9);
      addBox(0.48, legH + 0.44, 0.02, 0.52, legH + 0.58, 0.06, dark, 0.9);
      // beard
      addBox(0.44, legH + 0.14, -0.02, 0.52, legH + 0.22, 0.02, dark, 0.85);
    } else if (t === 'Blaze') {
      // Fiery yellow-orange Nether mob: floating rod body with flame rods around it
      const core = hexToRGB('#FFCC00');
      const flame = hexToRGB('#FF6600');
      const dark = hexToRGB('#CC8800');
      // central body (vertical rod)
      addBox(-0.12, 0.20, -0.12, 0.12, 1.20, 0.12, core, 1.0);
      // head (slightly wider)
      addBox(-0.18, 1.10, -0.18, 0.18, 1.40, 0.18, core, 1.0);
      // eyes
      addBox(-0.10, 1.22, -0.19, -0.04, 1.30, -0.17, [0.1, 0.1, 0.1], 1.0);
      addBox(0.04, 1.22, -0.19, 0.10, 1.30, -0.17, [0.1, 0.1, 0.1], 1.0);
      // flame rods orbiting the body (8 rods at different angles, simplified as 4 pairs)
      addBox(-0.50, 0.55, -0.04, -0.14, 0.65, 0.04, flame, 0.95);
      addBox(0.14, 0.55, -0.04, 0.50, 0.65, 0.04, flame, 0.95);
      addBox(-0.04, 0.55, -0.50, 0.04, 0.65, -0.14, flame, 0.95);
      addBox(-0.04, 0.55, 0.14, 0.04, 0.65, 0.50, flame, 0.95);
      addBox(-0.50, 0.80, -0.04, -0.14, 0.90, 0.04, dark, 0.9);
      addBox(0.14, 0.80, -0.04, 0.50, 0.90, 0.04, dark, 0.9);
      addBox(-0.04, 0.80, -0.50, 0.04, 0.90, -0.14, dark, 0.9);
      addBox(-0.04, 0.80, 0.14, 0.04, 0.90, 0.50, dark, 0.9);
    } else if (t === 'Ghast') {
      // Large white floating jellyfish-like mob with tentacles
      const body = hexToRGB('#F8F8F8');
      const eye = hexToRGB('#CC2222');
      const tent = hexToRGB('#E0E0E0');
      // main cube body
      addBox(-0.55, 0.50, -0.55, 0.55, 1.40, 0.55, body, 1.0);
      // eyes (3 in a row on front face)
      addBox(-0.22, 0.88, -0.56, -0.10, 1.00, -0.54, eye, 1.0);
      addBox(-0.06, 0.88, -0.56, 0.06, 1.00, -0.54, eye, 1.0);
      addBox(0.10, 0.88, -0.56, 0.22, 1.00, -0.54, eye, 1.0);
      // mouth slit
      addBox(-0.18, 0.76, -0.56, 0.18, 0.82, -0.54, [0.2, 0.2, 0.2], 1.0);
      // tentacles (9 hanging down)
      const tentOffsets = [[-0.40, -0.30, -0.20, 0.10, 0.20, 0.30], [-0.40, -0.30, -0.20, 0.10, 0.20, 0.30]];
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
      const leg = hexToRGB('#882222');
      const eye = hexToRGB('#FFCC00');
      const legH = 0.55;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, leg, 0.85);
      addBox(0.06, 0, -0.08, 0.14, legH, 0.08, leg, 0.85);
      addBox(-0.32, legH, -0.28, 0.32, legH + 0.52, 0.28, body, 1.0);
      addBox(-0.10, legH + 0.44, -0.30, 0.10, legH + 0.56, -0.28, eye, 1.0);
      addBox(-0.10, legH + 0.44, 0.28, 0.10, legH + 0.56, 0.30, eye, 1.0);
      // mouth fringe
      addBox(-0.28, legH + 0.10, -0.30, 0.28, legH + 0.18, -0.28, leg, 0.9);
    } else if (t === 'Hoglin') {
      // Large pig-like Nether beast — brown, tusks, big head
      const body = hexToRGB('#8B4513');
      const tusk = hexToRGB('#F0E0C0');
      const dark = hexToRGB('#5C2E0A');
      const legH = 0.45;
      addBox(-0.30, 0, -0.14, -0.20, legH, 0.14, dark, 0.85);
      addBox(0.20, 0, -0.14, 0.30, legH, 0.14, dark, 0.85);
      addBox(-0.30, 0, 0.06, -0.20, legH, 0.26, dark, 0.85);
      addBox(0.20, 0, 0.06, 0.30, legH, 0.26, dark, 0.85);
      addBox(-0.44, legH, -0.22, 0.44, legH + 0.62, 0.22, body, 1.0);
      // big head
      addBox(0.44, legH + 0.14, -0.18, 0.80, legH + 0.58, 0.18, body, 1.0);
      // tusks
      addBox(0.80, legH + 0.18, -0.14, 0.96, legH + 0.24, -0.08, tusk, 1.0);
      addBox(0.80, legH + 0.18, 0.08, 0.96, legH + 0.24, 0.14, tusk, 1.0);
    } else if (t === 'Armadillo') {
      // Small desert creature with armored shell
      const shell = hexToRGB('#A08060');
      const skin = hexToRGB('#C8A070');
      const legH = 0.18;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, skin, 0.85);
      addBox(0.06, 0, -0.08, 0.06, legH, 0.08, skin, 0.85);
      addBox(-0.14, 0, 0.04, -0.06, legH, 0.12, skin, 0.85);
      addBox(0.06, 0, 0.04, 0.14, legH, 0.12, skin, 0.85);
      // armored body (dome shape approximated with stacked boxes)
      addBox(-0.22, legH, -0.16, 0.22, legH + 0.22, 0.16, shell, 1.0);
      addBox(-0.18, legH + 0.18, -0.12, 0.18, legH + 0.32, 0.12, shell, 0.95);
      // head
      addBox(0.22, legH + 0.04, -0.06, 0.38, legH + 0.18, 0.06, skin, 1.0);
    } else if (t === 'Llama') {
      // Tall camelid with fluffy body
      const wool = hexToRGB('#D4C090');
      const face = hexToRGB('#C0A870');
      const legH = 0.65;
      addBox(-0.18, 0, -0.10, -0.10, legH, 0.0, wool, 0.85);
      addBox(0.10, 0, -0.10, 0.18, legH, 0.0, wool, 0.85);
      addBox(-0.18, 0, 0.04, -0.10, legH, 0.14, wool, 0.85);
      addBox(0.10, 0, 0.04, 0.18, legH, 0.14, wool, 0.85);
      addBox(-0.30, legH, -0.18, 0.30, legH + 0.50, 0.18, wool, 1.0);
      // neck
      addBox(0.28, legH + 0.14, -0.06, 0.40, legH + 0.50, 0.06, wool, 0.95);
      // head
      addBox(0.40, legH + 0.28, -0.08, 0.62, legH + 0.50, 0.08, face, 1.0);
      // ears
      addBox(0.44, legH + 0.50, -0.06, 0.48, legH + 0.60, -0.02, face, 0.9);
      addBox(0.54, legH + 0.50, 0.02, 0.58, legH + 0.60, 0.06, face, 0.9);
    } else if (t === 'Parrot') {
      // Small colorful jungle bird
      const feather = hexToRGB('#22CC44');
      const beak = hexToRGB('#FFCC00');
      const wing = hexToRGB('#1188FF');
      const legH = 0.12;
      addBox(-0.04, 0, -0.02, 0.0, legH, 0.02, feather, 0.85);
      addBox(0.04, 0, -0.02, 0.08, legH, 0.02, feather, 0.85);
      addBox(-0.12, legH, -0.10, 0.12, legH + 0.22, 0.10, feather, 1.0);
      addBox(-0.20, legH + 0.06, -0.10, -0.12, legH + 0.18, 0.10, wing, 0.95);
      addBox(0.12, legH + 0.06, -0.10, 0.20, legH + 0.18, 0.10, wing, 0.95);
      addBox(0.12, legH + 0.08, -0.04, 0.22, legH + 0.16, 0.04, beak, 1.0);
      // tail feathers
      addBox(-0.06, legH, -0.14, 0.06, legH + 0.08, -0.10, wing, 0.9);
    } else if (t === 'Ocelot') {
      // Spotted jungle cat
      const fur = hexToRGB('#D4A820');
      const spot = hexToRGB('#8B6010');
      const legH = 0.30;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, fur, 0.85);
      addBox(0.06, 0, -0.08, 0.14, legH, 0.08, fur, 0.85);
      addBox(-0.14, 0, 0.06, -0.06, legH, 0.14, fur, 0.85);
      addBox(0.06, 0, 0.06, 0.14, legH, 0.14, fur, 0.85);
      addBox(-0.22, legH, -0.14, 0.22, legH + 0.30, 0.14, fur, 1.0);
      addBox(-0.06, legH + 0.10, -0.04, 0.06, legH + 0.20, 0.04, spot, 0.9);
      addBox(0.22, legH + 0.10, -0.08, 0.42, legH + 0.28, 0.08, fur, 1.0);
      // tail
      addBox(-0.28, legH + 0.14, -0.04, -0.22, legH + 0.28, 0.04, fur, 0.9);
    } else if (t === 'PolarBear') {
      // Large white bear
      const white = hexToRGB('#F0F0F0');
      const dark = hexToRGB('#C8C8C8');
      const legH = 0.50;
      addBox(-0.28, 0, -0.14, -0.18, legH, 0.14, dark, 0.85);
      addBox(0.18, 0, -0.14, 0.28, legH, 0.14, dark, 0.85);
      addBox(-0.28, 0, 0.06, -0.18, legH, 0.26, dark, 0.85);
      addBox(0.18, 0, 0.06, 0.28, legH, 0.26, dark, 0.85);
      addBox(-0.42, legH, -0.22, 0.42, legH + 0.60, 0.22, white, 1.0);
      addBox(0.42, legH + 0.22, -0.14, 0.72, legH + 0.54, 0.14, white, 1.0);
      // ears
      addBox(-0.18, legH + 0.58, -0.04, -0.10, legH + 0.66, 0.04, white, 0.9);
      addBox(0.10, legH + 0.58, -0.04, 0.18, legH + 0.66, 0.04, white, 0.9);
    } else if (t === 'Fox') {
      // Small orange fox with bushy tail
      const orange = hexToRGB('#D06020');
      const white = hexToRGB('#F0F0F0');
      const dark = hexToRGB('#2A1A0A');
      const legH = 0.24;
      addBox(-0.10, 0, -0.06, -0.04, legH, 0.06, orange, 0.85);
      addBox(0.04, 0, -0.06, 0.10, legH, 0.06, orange, 0.85);
      addBox(-0.10, 0, 0.04, -0.04, legH, 0.10, orange, 0.85);
      addBox(0.04, 0, 0.04, 0.10, legH, 0.10, orange, 0.85);
      addBox(-0.20, legH, -0.14, 0.20, legH + 0.28, 0.14, orange, 1.0);
      addBox(0.20, legH + 0.06, -0.08, 0.40, legH + 0.24, 0.08, orange, 1.0);
      // ears
      addBox(-0.12, legH + 0.28, -0.04, -0.06, legH + 0.38, 0.04, orange, 0.9);
      addBox(0.06, legH + 0.28, -0.04, 0.12, legH + 0.38, 0.04, orange, 0.9);
      // bushy tail
      addBox(-0.26, legH + 0.04, -0.06, -0.20, legH + 0.22, 0.06, white, 0.9);
    } else if (t === 'Wolf') {
      // Grey wolf
      const grey = hexToRGB('#888888');
      const dark = hexToRGB('#555555');
      const legH = 0.36;
      addBox(-0.14, 0, -0.08, -0.06, legH, 0.08, grey, 0.85);
      addBox(0.06, 0, -0.08, 0.14, legH, 0.08, grey, 0.85);
      addBox(-0.14, 0, 0.06, -0.06, legH, 0.14, grey, 0.85);
      addBox(0.06, 0, 0.06, 0.14, legH, 0.14, grey, 0.85);
      addBox(-0.24, legH, -0.16, 0.24, legH + 0.36, 0.16, grey, 1.0);
      addBox(0.24, legH + 0.08, -0.10, 0.48, legH + 0.30, 0.10, grey, 1.0);
      // ears
      addBox(-0.14, legH + 0.36, -0.04, -0.06, legH + 0.46, 0.04, dark, 0.9);
      addBox(0.06, legH + 0.36, -0.04, 0.14, legH + 0.46, 0.04, dark, 0.9);
      // tail
      addBox(-0.30, legH + 0.18, -0.04, -0.24, legH + 0.34, 0.04, grey, 0.9);
    } else if (t === 'Deer') {
      // Brown deer with antlers
      const brown = hexToRGB('#C08040');
      const dark = hexToRGB('#7A4820');
      const legH = 0.55;
      addBox(-0.12, 0, -0.08, -0.04, legH, 0.08, dark, 0.85);
      addBox(0.04, 0, -0.08, 0.12, legH, 0.08, dark, 0.85);
      addBox(-0.12, 0, 0.04, -0.04, legH, 0.12, dark, 0.85);
      addBox(0.04, 0, 0.04, 0.12, legH, 0.12, dark, 0.85);
      addBox(-0.24, legH, -0.14, 0.24, legH + 0.42, 0.14, brown, 1.0);
      addBox(0.24, legH + 0.14, -0.08, 0.46, legH + 0.38, 0.08, brown, 1.0);
      // antlers
      addBox(-0.08, legH + 0.42, -0.02, -0.04, legH + 0.58, 0.02, dark, 0.9);
      addBox(0.04, legH + 0.42, -0.02, 0.08, legH + 0.58, 0.02, dark, 0.9);
      addBox(-0.14, legH + 0.52, -0.02, -0.08, legH + 0.56, 0.02, dark, 0.9);
      addBox(0.08, legH + 0.52, -0.02, 0.14, legH + 0.56, 0.02, dark, 0.9);
    } else if (t === 'Frog') {
      // Small green frog — wide flat body, big eyes
      const green = hexToRGB('#448844');
      const light = hexToRGB('#88CC88');
      const eye = hexToRGB('#FFCC00');
      const legH = 0.10;
      // back legs (wide)
      addBox(-0.28, 0, -0.06, -0.14, legH, 0.06, green, 0.85);
      addBox(0.14, 0, -0.06, 0.28, legH, 0.06, green, 0.85);
      // body (flat and wide)
      addBox(-0.22, legH, -0.18, 0.22, legH + 0.18, 0.18, green, 1.0);
      addBox(-0.16, legH + 0.14, -0.14, 0.16, legH + 0.24, 0.14, light, 0.95);
      // head
      addBox(-0.18, legH + 0.14, -0.20, 0.18, legH + 0.28, -0.18, green, 1.0);
      // eyes (bulging)
      addBox(-0.16, legH + 0.26, -0.22, -0.08, legH + 0.34, -0.14, eye, 1.0);
      addBox(0.08, legH + 0.26, -0.22, 0.16, legH + 0.34, -0.14, eye, 1.0);
    } else if (t === 'Axolotl') {
      // Pink aquatic salamander with feathery gills
      const pink = hexToRGB('#FF88AA');
      const gill = hexToRGB('#FF4488');
      const legH = 0.12;
      addBox(-0.14, 0, -0.06, -0.06, legH, 0.06, pink, 0.85);
      addBox(0.06, 0, -0.06, 0.14, legH, 0.06, pink, 0.85);
      addBox(-0.14, 0, 0.04, -0.06, legH, 0.10, pink, 0.85);
      addBox(0.06, 0, 0.04, 0.14, legH, 0.10, pink, 0.85);
      addBox(-0.22, legH, -0.14, 0.22, legH + 0.20, 0.14, pink, 1.0);
      addBox(0.22, legH + 0.04, -0.06, 0.40, legH + 0.16, 0.06, pink, 1.0);
      // gills (feathery spikes on sides of head)
      addBox(-0.26, legH + 0.14, -0.04, -0.22, legH + 0.26, 0.04, gill, 0.9);
      addBox(0.22, legH + 0.14, -0.04, 0.26, legH + 0.26, 0.04, gill, 0.9);
      // tail
      addBox(-0.28, legH + 0.06, -0.04, -0.22, legH + 0.18, 0.04, pink, 0.9);
    } else if (t === 'Turtle') {
      // Green turtle with domed shell
      const shell = hexToRGB('#44AA44');
      const skin = hexToRGB('#228822');
      const legH = 0.10;
      addBox(-0.28, 0, -0.08, -0.18, legH, 0.08, skin, 0.85);
      addBox(0.18, 0, -0.08, 0.28, legH, 0.08, skin, 0.85);
      addBox(-0.28, 0, 0.04, -0.18, legH, 0.12, skin, 0.85);
      addBox(0.18, 0, 0.04, 0.28, legH, 0.12, skin, 0.85);
      // domed shell
      addBox(-0.32, legH, -0.22, 0.32, legH + 0.28, 0.22, shell, 1.0);
      addBox(-0.26, legH + 0.24, -0.16, 0.26, legH + 0.38, 0.16, shell, 0.95);
      // head
      addBox(0.32, legH + 0.04, -0.08, 0.50, legH + 0.18, 0.08, skin, 1.0);
    } else if (t === 'Dolphin') {
      // Blue-grey dolphin
      const blue = hexToRGB('#6688CC');
      const light = hexToRGB('#AABBEE');
      // body (horizontal, elongated)
      addBox(-0.50, 0.30, -0.14, 0.50, 0.60, 0.14, blue, 1.0);
      // head/snout
      addBox(0.50, 0.32, -0.10, 0.76, 0.56, 0.10, blue, 1.0);
      addBox(0.76, 0.36, -0.06, 0.90, 0.50, 0.06, light, 1.0);
      // dorsal fin
      addBox(-0.04, 0.60, -0.02, 0.08, 0.80, 0.02, blue, 0.9);
      // tail flukes
      addBox(-0.56, 0.28, -0.18, -0.50, 0.36, -0.10, blue, 0.9);
      addBox(-0.56, 0.28, 0.10, -0.50, 0.36, 0.18, blue, 0.9);
      // pectoral fins
      addBox(0.20, 0.22, -0.18, 0.36, 0.30, -0.14, blue, 0.9);
      addBox(0.20, 0.22, 0.14, 0.36, 0.30, 0.18, blue, 0.9);
    } else if (t === 'Rabbit') {
      // Small brown rabbit with long ears
      const fur = hexToRGB('#C8A070');
      const dark = hexToRGB('#8B6040');
      const legH = 0.18;
      addBox(-0.10, 0, -0.06, -0.04, legH, 0.06, fur, 0.85);
      addBox(0.04, 0, -0.06, 0.10, legH, 0.06, fur, 0.85);
      addBox(-0.14, legH, -0.12, 0.14, legH + 0.22, 0.12, fur, 1.0);
      addBox(0.14, legH + 0.06, -0.06, 0.28, legH + 0.20, 0.06, fur, 1.0);
      // long ears
      addBox(-0.08, legH + 0.22, -0.03, -0.02, legH + 0.44, 0.03, fur, 0.9);
      addBox(0.02, legH + 0.22, -0.03, 0.08, legH + 0.44, 0.03, fur, 0.9);
      // inner ear
      addBox(-0.07, legH + 0.24, -0.02, -0.03, legH + 0.42, 0.02, dark, 0.85);
      addBox(0.03, legH + 0.24, -0.02, 0.07, legH + 0.42, 0.02, dark, 0.85);
    } else if (t === 'Troglodite') {
      // Cave-dwelling alien — grayish skin, large eyes, slender build
      const skin = hexToRGB('#708090');
      const dark = hexToRGB('#4A5060');
      const eye = hexToRGB('#00FFFF'); // Glowing cyan eyes
      const legH = 0.38;
      // legs (slender)
      addBox(-0.12, 0, -0.06, -0.04, legH, 0.06, skin, 0.85);
      addBox(0.04, 0, -0.06, 0.12, legH, 0.06, skin, 0.85);
      addBox(-0.12, 0, 0.02, -0.04, legH, 0.10, skin, 0.85);
      addBox(0.04, 0, 0.02, 0.12, legH, 0.10, skin, 0.85);
      // body (thin and tall)
      addBox(-0.22, legH, -0.12, 0.22, legH + 0.48, 0.12, skin, 1.0);
      // head (large, alien-shaped)
      addBox(0.20, legH + 0.20, -0.14, 0.50, legH + 0.48, 0.14, skin, 1.0);
      // large eyes (two on front)
      addBox(0.32, legH + 0.30, -0.10, 0.42, legH + 0.40, -0.06, eye, 1.0);
      addBox(0.32, legH + 0.30, 0.06, 0.42, legH + 0.40, 0.10, eye, 1.0);
      // small antenna/antler-like protrusions
      addBox(0.28, legH + 0.46, -0.04, 0.32, legH + 0.58, -0.02, dark, 0.9);
      addBox(0.38, legH + 0.46, 0.02, 0.42, legH + 0.58, 0.04, dark, 0.9);
    } else if (t === 'Salmon') {
      // Pinkish-orange fish body with fins
      const body = hexToRGB('#E8A088');
      const fin = hexToRGB('#F0B0A0');
      const dark = hexToRGB('#B87858');
      const eye = hexToRGB('#202020');
      // tail fin
      addBox(-0.32, 0.14, -0.08, -0.18, 0.22, 0.08, fin, 0.85);
      addBox(-0.32, 0.14, 0.08, -0.18, 0.22, -0.08, fin, 0.85);
      // body (elongated horizontal)
      addBox(-0.18, 0.08, -0.10, 0.24, 0.28, 0.10, body, 1.0);
      // dorsal fin
      addBox(-0.04, 0.28, -0.08, 0.10, 0.38, 0.08, fin, 0.9);
      // head
      addBox(0.22, 0.10, -0.08, 0.38, 0.26, 0.08, body, 1.0);
      // snout
      addBox(0.36, 0.12, -0.04, 0.46, 0.22, 0.04, dark, 0.95);
      // eye
      addBox(0.30, 0.16, -0.09, 0.34, 0.20, -0.05, eye, 1.0);
    } else if (t === 'Cod') {
      // Blue-grey fish with classic cod appearance
      const body = hexToRGB('#B8C8D8');
      const fin = hexToRGB('#D0D8E8');
      const dark = hexToRGB('#8898A8');
      const eye = hexToRGB('#202020');
      // tail fin
      addBox(-0.32, 0.14, -0.08, -0.18, 0.22, 0.08, fin, 0.85);
      addBox(-0.32, 0.14, 0.08, -0.18, 0.22, -0.08, fin, 0.85);
      // body (elongated)
      addBox(-0.18, 0.08, -0.10, 0.24, 0.28, 0.10, body, 1.0);
      // dorsal fin
      addBox(-0.04, 0.28, -0.08, 0.10, 0.38, 0.08, fin, 0.9);
      // head
      addBox(0.22, 0.10, -0.08, 0.38, 0.26, 0.08, body, 1.0);
      // whiskers (barbel)
      addBox(0.30, 0.14, 0.02, 0.42, 0.18, 0.04, dark, 0.8);
      // eye
      addBox(0.30, 0.16, -0.09, 0.34, 0.20, -0.05, eye, 1.0);
    } else if (t === 'Donkey') {
      // Grey-brown horse-like body with darker legs
      const bodyCol = hexToRGB('#8B6B4B');
      const darkLeg = hexToRGB('#5B4B2B');
      const mane = hexToRGB('#302010');
      const legH = 0.50;
      // legs
      addBox(-0.28, 0, -0.10, -0.18, legH, -0.02, darkLeg, 0.85);
      addBox(0.18, 0, -0.10, 0.28, legH, -0.02, darkLeg, 0.85);
      addBox(-0.28, 0, 0.02, -0.18, legH, 0.10, darkLeg, 0.85);
      addBox(0.18, 0, 0.02, 0.28, legH, 0.10, darkLeg, 0.85);
      // body
      addBox(-0.38, legH, -0.16, 0.38, legH + 0.65, 0.16, bodyCol, 1.0);
      // head
      addBox(0.40, legH + 0.28, -0.06, 0.66, legH + 0.62, 0.06, bodyCol, 1.0);
      // ears
      addBox(0.52, legH + 0.58, -0.06, 0.58, legH + 0.72, -0.02, bodyCol, 0.95);
      addBox(0.52, legH + 0.58, 0.02, 0.58, legH + 0.72, 0.06, bodyCol, 0.95);
      // mane
      addBox(0.18, legH + 0.48, -0.06, 0.24, legH + 0.64, 0.06, mane, 0.9);
    } else if (t === 'GlowSquid') {
      // Dark purple body with glowing cyan areas
      const body = hexToRGB('#302040');
      const glow = hexToRGB('#88FFAA');
      const tentacle = hexToRGB('#402850');
      // mantle (large oval body)
      addBox(-0.28, 0.20, -0.20, 0.28, 0.60, 0.20, body, 1.0);
      // glowing spots on mantle
      addBox(-0.16, 0.35, -0.08, -0.08, 0.45, 0.08, glow, 1.2);
      addBox(0.08, 0.28, 0.02, 0.20, 0.38, 0.14, glow, 1.2);
      addBox(-0.12, 0.48, -0.02, 0.04, 0.55, 0.10, glow, 1.2);
      // fins on top
      addBox(-0.12, 0.55, -0.16, 0.12, 0.65, -0.08, glow, 1.1);
      // tentacles (8 small ones at bottom)
      addBox(-0.24, 0.10, -0.28, -0.18, 0.20, 0.02, tentacle, 0.85);
      addBox(-0.08, 0.08, -0.30, 0.0, 0.18, 0.02, tentacle, 0.85);
      addBox(0.08, 0.08, -0.30, 0.16, 0.18, 0.02, tentacle, 0.85);
      addBox(0.20, 0.10, -0.28, 0.28, 0.20, 0.02, tentacle, 0.85);
      // eyes (two glowing eyes)
      addBox(-0.14, 0.48, -0.22, -0.06, 0.54, -0.18, glow, 1.3);
      addBox(0.06, 0.48, -0.22, 0.14, 0.54, -0.18, glow, 1.3);
    } else if (t === 'Tadpole') {
      // Tiny tadpole - small body with tail
      const body = hexToRGB('#444444');
      const eye = hexToRGB('#000000');
      // tail
      addBox(-0.24, 0.06, -0.02, -0.10, 0.10, 0.02, body, 0.85);
      // body (small oval)
      addBox(-0.10, 0.04, -0.06, 0.08, 0.12, 0.06, body, 1.0);
      // head
      addBox(0.06, 0.04, -0.05, 0.16, 0.12, 0.05, body, 1.0);
      // eyes
      addBox(0.10, 0.08, -0.06, 0.13, 0.10, -0.04, eye, 1.0);
      addBox(0.10, 0.08, 0.04, 0.13, 0.10, 0.06, eye, 1.0);
    } else if (t === 'Bee') {
      // Small yellow and black striped flying mob
      const yellow = hexToRGB('#FFD700');
      const black = hexToRGB('#222222');
      const wing = hexToRGB('#EEEEEE');
      // body (striped)
      addBox(-0.10, 0.02, -0.08, 0.10, 0.14, 0.08, yellow, 1.0);
      addBox(-0.04, 0.04, -0.06, 0.04, 0.12, 0.06, black, 1.0);
      // head
      addBox(0.10, 0.04, -0.06, 0.20, 0.12, 0.06, yellow, 1.0);
      // stinger
      addBox(-0.14, 0.06, -0.02, -0.10, 0.10, 0.02, black, 0.9);
      // wings (translucent)
      addBox(-0.06, 0.14, -0.20, 0.02, 0.18, -0.10, wing, 0.7);
      addBox(-0.06, 0.14, 0.10, 0.02, 0.18, 0.20, wing, 0.7);
    } else if (t === 'CaveSpider') {
      // Darker spider with red eyes - cave variant
      const body = hexToRGB('#1A1A2E');
      const legCol = hexToRGB('#151525');
      const eye = hexToRGB('#FF0000');
      // body
      addBox(-0.40, 0, -0.28, 0.40, 0.32, 0.28, body, 1.0);
      // head
      addBox(0.42, 0.10, -0.14, 0.66, 0.32, 0.14, body, 1.0);
      // red eyes
      addBox(0.50, 0.18, -0.10, 0.56, 0.24, -0.06, eye, 1.3);
      addBox(0.50, 0.18, 0.06, 0.56, 0.24, 0.10, eye, 1.3);
      // legs
      addBox(-0.46, 0.02, -0.26, -0.40, 0.06, -0.18, legCol, 0.85);
      addBox(-0.46, 0.02, -0.08, -0.40, 0.06, 0.0, legCol, 0.85);
      addBox(-0.46, 0.02, 0.08, -0.40, 0.06, 0.26, legCol, 0.85);
      addBox(0.40, 0.02, -0.26, 0.46, 0.06, -0.18, legCol, 0.85);
      addBox(0.40, 0.02, -0.08, 0.46, 0.06, 0.0, legCol, 0.85);
      addBox(0.40, 0.02, 0.08, 0.46, 0.06, 0.26, legCol, 0.85);
    } else if (t === 'Enderman') {
      // Tall dark figure with glowing purple eyes
      const body = hexToRGB('#0A0A0A');
      const eye = hexToRGB('#AA00FF');
      const legH = 0.40;
      // legs
      addBox(-0.12, 0, -0.08, -0.04, legH, 0.08, body, 0.85);
      addBox(0.04, 0, -0.08, 0.12, legH, 0.08, body, 0.85);
      // body (tall and thin)
      addBox(-0.18, legH, -0.12, 0.18, legH + 1.00, 0.12, body, 1.0);
      // head (slightly elongated)
      addBox(-0.12, legH + 0.90, -0.10, 0.12, legH + 1.20, 0.10, body, 1.0);
      // glowing purple eyes
      addBox(-0.08, legH + 1.00, -0.12, -0.02, legH + 1.08, -0.08, eye, 1.5);
      addBox(0.02, legH + 1.00, -0.12, 0.08, legH + 1.08, -0.08, eye, 1.5);
    } else if (t === 'Panda') {
      // Black and white panda
      const white = hexToRGB('#F5F5F5');
      const black = hexToRGB('#222222');
      const legH = 0.28;
      // legs (black)
      addBox(-0.14, 0, -0.10, -0.06, legH, 0.10, black, 0.85);
      addBox(0.06, 0, -0.10, 0.14, legH, 0.10, black, 0.85);
      addBox(-0.14, 0, 0.02, -0.06, legH, 0.14, black, 0.85);
      addBox(0.06, 0, 0.02, 0.14, legH, 0.14, black, 0.85);
      // body (white)
      addBox(-0.28, legH, -0.20, 0.28, legH + 0.50, 0.20, white, 1.0);
      // black patches on body
      addBox(-0.20, legH + 0.10, -0.12, -0.08, legH + 0.30, 0.12, black, 0.95);
      addBox(0.08, legH + 0.10, -0.12, 0.20, legH + 0.30, 0.12, black, 0.95);
      // head (white)
      addBox(0.30, legH + 0.30, -0.14, 0.58, legH + 0.58, 0.14, white, 1.0);
      // black eye patches
      addBox(0.36, legH + 0.40, -0.16, 0.46, legH + 0.50, -0.08, black, 0.95);
      addBox(0.36, legH + 0.40, 0.08, 0.46, legH + 0.50, 0.16, black, 0.95);
      // ears
      addBox(0.30, legH + 0.56, -0.12, 0.38, legH + 0.66, -0.04, black, 0.9);
      addBox(0.42, legH + 0.56, 0.04, 0.50, legH + 0.66, 0.12, black, 0.9);
    } else if (t === 'Strider') {
      // Brownish strider that walks on lava
      const brown = hexToRGB('#8B4513');
      const dark = hexToRGB('#5D2E0C');
      const legH = 0.60;
      // legs (very tall)
      addBox(-0.10, 0, -0.08, -0.04, legH, 0.08, dark, 0.85);
      addBox(0.04, 0, -0.08, 0.10, legH, 0.08, dark, 0.85);
      // body
      addBox(-0.30, legH, -0.18, 0.30, legH + 0.40, 0.18, brown, 1.0);
      // head
      addBox(0.28, legH + 0.20, -0.10, 0.54, legH + 0.42, 0.10, brown, 1.0);
      // snout
      addBox(0.50, legH + 0.24, -0.06, 0.66, legH + 0.34, 0.06, dark, 0.9);
    } else if (t === 'WoodsWolf') {
      // Brown/tan wolf for forest/wooded biomes
      const brown = hexToRGB('#8B6914');
      const dark = hexToRGB('#5D4510');
      const legH = 0.32;
      addBox(-0.12, 0, -0.07, -0.05, legH, 0.07, brown, 0.85);
      addBox(0.05, 0, -0.07, 0.12, legH, 0.07, brown, 0.85);
      addBox(-0.12, 0, 0.05, -0.05, legH, 0.12, brown, 0.85);
      addBox(0.05, 0, 0.05, 0.12, legH, 0.12, brown, 0.85);
      addBox(-0.22, legH, -0.14, 0.22, legH + 0.32, 0.14, brown, 1.0);
      addBox(0.22, legH + 0.07, -0.09, 0.44, legH + 0.27, 0.09, brown, 1.0);
      // ears
      addBox(-0.12, legH + 0.32, -0.03, -0.05, legH + 0.42, 0.03, dark, 0.9);
      addBox(0.05, legH + 0.32, -0.03, 0.12, legH + 0.42, 0.03, dark, 0.9);
      // tail
      addBox(-0.28, legH + 0.16, -0.03, -0.22, legH + 0.30, 0.03, dark, 0.9);
    } else if (t === 'SavannahWolf') {
      // Light tan wolf for savanna biomes
      const tan = hexToRGB('#C4A35A');
      const dark = hexToRGB('#9A7B3A');
      const legH = 0.34;
      addBox(-0.13, 0, -0.07, -0.05, legH, 0.07, tan, 0.85);
      addBox(0.05, 0, -0.07, 0.13, legH, 0.07, tan, 0.85);
      addBox(-0.13, 0, 0.05, -0.05, legH, 0.13, tan, 0.85);
      addBox(0.05, 0, 0.05, 0.13, legH, 0.13, tan, 0.85);
      addBox(-0.24, legH, -0.15, 0.24, legH + 0.34, 0.15, tan, 1.0);
      addBox(0.24, legH + 0.08, -0.10, 0.46, legH + 0.28, 0.10, tan, 1.0);
      // ears
      addBox(-0.13, legH + 0.34, -0.03, -0.05, legH + 0.44, 0.03, dark, 0.9);
      addBox(0.05, legH + 0.34, -0.03, 0.13, legH + 0.44, 0.03, dark, 0.9);
      // tail
      addBox(-0.30, legH + 0.18, -0.03, -0.24, legH + 0.32, 0.03, dark, 0.9);
    } else if (t === 'MountainWolf') {
      // White/grey wolf for snowy mountain biomes
      const white = hexToRGB('#D0D0D8');
      const grey = hexToRGB('#A0A0A8');
      const legH = 0.30;
      addBox(-0.11, 0, -0.06, -0.04, legH, 0.06, grey, 0.85);
      addBox(0.04, 0, -0.06, 0.11, legH, 0.06, grey, 0.85);
      addBox(-0.11, 0, 0.04, -0.04, legH, 0.11, grey, 0.85);
      addBox(0.04, 0, 0.04, 0.11, legH, 0.11, grey, 0.85);
      addBox(-0.20, legH, -0.12, 0.20, legH + 0.30, 0.12, white, 1.0);
      addBox(0.20, legH + 0.06, -0.08, 0.40, legH + 0.24, 0.08, white, 1.0);
      // ears
      addBox(-0.11, legH + 0.30, -0.03, -0.04, legH + 0.40, 0.03, grey, 0.9);
      addBox(0.04, legH + 0.30, -0.03, 0.11, legH + 0.40, 0.03, grey, 0.9);
      // tail
      addBox(-0.26, legH + 0.14, -0.03, -0.20, legH + 0.28, 0.03, grey, 0.9);
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
    // Upload only the filled portion of the pre-allocated buffer
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, vi), gl.STATIC_DRAW);
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
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, ii), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.mobMeshes.set(type, { vao, vbo, ibo, indexCount: ii });
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

    // Pre-allocate typed arrays — weapons use at most 20 boxes
    const MAX_BOXES = 20;
    const VERTS_PER_BOX = 24 * 7;
    const IDX_PER_BOX = 36;
    const verts = new Float32Array(MAX_BOXES * VERTS_PER_BOX);
    const idx = new Uint32Array(MAX_BOXES * IDX_PER_BOX);
    let vi = 0, ii = 0, vc = 0;

    const pushVert = (x: number, y: number, z: number, r: number, g: number, b: number, br: number) => {
      verts[vi++] = x; verts[vi++] = y; verts[vi++] = z;
      verts[vi++] = r; verts[vi++] = g; verts[vi++] = b;
      verts[vi++] = br;
    };

    const addBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, color: [number, number, number], bright: number) => {
      const r = color[0], g = color[1], b = color[2];
      // top
      pushVert(minX, maxY, minZ, r, g, b, bright);
      pushVert(maxX, maxY, minZ, r, g, b, bright);
      pushVert(maxX, maxY, maxZ, r, g, b, bright);
      pushVert(minX, maxY, maxZ, r, g, b, bright);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // bottom
      const bd = bright * 0.6;
      pushVert(minX, minY, maxZ, r, g, b, bd);
      pushVert(maxX, minY, maxZ, r, g, b, bd);
      pushVert(maxX, minY, minZ, r, g, b, bd);
      pushVert(minX, minY, minZ, r, g, b, bd);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // south
      const bs = bright * 0.9;
      pushVert(minX, minY, maxZ, r, g, b, bs);
      pushVert(minX, maxY, maxZ, r, g, b, bs);
      pushVert(maxX, maxY, maxZ, r, g, b, bs);
      pushVert(maxX, minY, maxZ, r, g, b, bs);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // north
      pushVert(maxX, minY, minZ, r, g, b, bs);
      pushVert(maxX, maxY, minZ, r, g, b, bs);
      pushVert(minX, maxY, minZ, r, g, b, bs);
      pushVert(minX, minY, minZ, r, g, b, bs);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // east
      const be = bright * 0.8;
      pushVert(maxX, minY, maxZ, r, g, b, be);
      pushVert(maxX, maxY, maxZ, r, g, b, be);
      pushVert(maxX, maxY, minZ, r, g, b, be);
      pushVert(maxX, minY, minZ, r, g, b, be);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
      // west
      pushVert(minX, minY, minZ, r, g, b, be);
      pushVert(minX, maxY, minZ, r, g, b, be);
      pushVert(minX, maxY, maxZ, r, g, b, be);
      pushVert(minX, minY, maxZ, r, g, b, be);
      idx[ii++] = vc; idx[ii++] = vc + 1; idx[ii++] = vc + 2; idx[ii++] = vc; idx[ii++] = vc + 2; idx[ii++] = vc + 3; vc += 4;
    };

// determine colors: head uses material color, handle uses stick colour
    const headHex = ITEM_COLORS[itemId] ?? '#CCCCCC';
    const headCol = hexToRGB(headHex);
    const stickHex = itemId === ItemId.BONE_BOW ? '#A9A9A9' : (ITEM_COLORS[ItemId.STICK] ?? '#8B6914');
    const stickCol = hexToRGB(stickHex);

    // Build blocky meshes per item type (approximate Minecraft shapes)
    const isSword = (itemId === ItemId.WOODEN_SWORD || itemId === ItemId.STONE_SWORD || itemId === ItemId.COPPER_SWORD || itemId === ItemId.GOLD_SWORD || itemId === ItemId.IRON_SWORD || itemId === ItemId.DIAMOND_SWORD || itemId === ItemId.NETHERITE_SWORD);
    const isPick = (itemId === ItemId.WOODEN_PICKAXE || itemId === ItemId.STONE_PICKAXE || itemId === ItemId.COPPER_PICKAXE || itemId === ItemId.GOLD_PICKAXE || itemId === ItemId.IRON_PICKAXE || itemId === ItemId.DIAMOND_PICKAXE || itemId === ItemId.NETHERITE_PICKAXE);
    const isAxe = (itemId === ItemId.WOODEN_AXE || itemId === ItemId.STONE_AXE || itemId === ItemId.COPPER_AXE || itemId === ItemId.GOLD_AXE || itemId === ItemId.IRON_AXE || itemId === ItemId.DIAMOND_AXE || itemId === ItemId.NETHERITE_AXE);

    if (isSword) {
      // Minecraft sword: tapered blade + crossguard + handle
      // Blade (tapered - wider at top, narrower to tip)
      addBox(0.20, -0.02, -0.02, 0.60, 0.02, 0.02, [headCol[0], headCol[1], headCol[2]], 1.0); // main blade top
      addBox(0.14, -0.03, -0.03, 0.60, 0.03, 0.03, [headCol[0], headCol[1], headCol[2]], 0.95); // blade narrowing
      addBox(0.14, -0.01, -0.01, 0.60, 0.01, 0.01, [headCol[0] * 1.1, headCol[1] * 1.1, headCol[2] * 1.1], 1.0); // blade edge highlight
      // Crossguard (perpendicular bar)
      addBox(0.10, -0.05, -0.06, 0.14, 0.05, 0.06, [0.2, 0.2, 0.2], 0.85);
      addBox(0.14, -0.04, -0.05, 0.22, 0.04, 0.05, [0.25, 0.25, 0.25], 0.9);
      addBox(0.14, -0.04, 0.05, 0.22, 0.04, 0.06, [0.25, 0.25, 0.25], 0.9);
      // Handle with grip texture
      addBox(-0.18, -0.03, -0.03, 0.10, 0.03, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.85);
      addBox(-0.14, -0.02, -0.02, 0.10, 0.02, 0.02, [stickCol[0] * 1.15, stickCol[1] * 1.15, stickCol[2] * 1.15], 0.95);
      // Pommel (round end)
      addBox(-0.22, -0.04, -0.04, -0.18, 0.04, 0.04, [headCol[0] * 0.7, headCol[1] * 0.7, headCol[2] * 0.7], 0.8);
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
    } else if (itemId === ItemId.BOW || itemId === ItemId.BONE_BOW) {
      const stringCol: [number, number, number] = [0.82, 0.8, 0.72];
      // Grip
      addBox(-0.05, -0.05, -0.04, 0.07, 0.05, 0.04, [stickCol[0] * 0.85, stickCol[1] * 0.7, stickCol[2] * 0.65], 0.95);
      // Upper limb
      addBox(0.00, 0.03, -0.03, 0.08, 0.09, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.95);
      addBox(0.06, 0.09, -0.025, 0.14, 0.17, 0.025, [stickCol[0] * 1.05, stickCol[1] * 1.02, stickCol[2] * 0.98], 1.0);
      addBox(0.12, 0.17, -0.02, 0.18, 0.28, 0.02, [stickCol[0], stickCol[1], stickCol[2]], 0.92);
      // Lower limb
      addBox(0.00, -0.09, -0.03, 0.08, -0.03, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.95);
      addBox(0.06, -0.17, -0.025, 0.14, -0.09, 0.025, [stickCol[0] * 1.05, stickCol[1] * 1.02, stickCol[2] * 0.98], 1.0);
      addBox(0.12, -0.28, -0.02, 0.18, -0.17, 0.02, [stickCol[0], stickCol[1], stickCol[2]], 0.92);
      // Bow string
      addBox(0.165, -0.28, -0.006, 0.185, 0.28, 0.006, stringCol, 0.9);
    } else if (itemId === ItemId.ARROW) {
      addBox(-0.03, -0.012, -0.18, 0.03, 0.012, 0.16, [stickCol[0], stickCol[1], stickCol[2]], 0.95);
      addBox(-0.045, -0.045, -0.24, 0.045, 0.045, -0.17, [0.72, 0.72, 0.76], 1.0);
      addBox(-0.06, -0.004, 0.10, -0.015, 0.004, 0.18, [0.92, 0.92, 0.94], 0.95);
      addBox(0.015, -0.004, 0.10, 0.06, 0.004, 0.18, [0.92, 0.92, 0.94], 0.95);
    } else if (itemId === ItemId.SHIELD) {
      // Minecraft shield: wide oak plank body + iron trim + handle
      const woodCol: [number, number, number] = [0.54, 0.42, 0.28];
      const trimCol: [number, number, number] = [0.75, 0.75, 0.75];
      // Main shield body (wider than weapons, pentagon-ish approximation with 3 boxes)
      addBox(-0.14, -0.28, 0.00, 0.14, 0.28, 0.02, woodCol, 1.0);
      addBox(-0.14, 0.24, 0.00, 0.14, 0.28, 0.02, woodCol, 0.95);
      addBox(-0.14, -0.28, 0.00, -0.10, 0.28, 0.02, woodCol, 0.92);
      addBox(0.10, -0.28, 0.00, 0.14, 0.28, 0.02, woodCol, 0.92);
      // Iron trim top/bottom
      addBox(-0.14, 0.26, 0.00, 0.14, 0.30, 0.025, trimCol, 0.9);
      addBox(-0.14, -0.30, 0.00, 0.14, -0.26, 0.025, trimCol, 0.85);
      // Iron left/right trim
      addBox(-0.16, -0.28, 0.00, -0.12, 0.28, 0.025, trimCol, 0.9);
      addBox(0.12, -0.28, 0.00, 0.16, 0.28, 0.025, trimCol, 0.9);
      // Handle (center back)
      addBox(-0.025, -0.12, -0.02, 0.025, 0.12, 0.00, stickCol, 0.85);
    } else {
      // generic small tool
      addBox(0.0, -0.06, -0.02, 0.5, 0.06, 0.02, [headCol[0], headCol[1], headCol[2]], 1.0);
      addBox(-0.08, -0.04, -0.03, 0.04, 0.04, 0.03, [stickCol[0], stickCol[1], stickCol[2]], 0.9);
    }

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, vi), gl.STATIC_DRAW);
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
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, ii), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.weaponMeshes.set(itemId, { vao, vbo, ibo, indexCount: ii });
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

  /** Free GL resources for a single chunk mesh and clear related bookkeeping. */
  freeChunkMesh(key: string): void {
    try {
      const gl = this.gl;
      const m = this.meshes.get(key);
      if (m) {
        if (m.vbo) gl.deleteBuffer(m.vbo);
        if (m.ibo) gl.deleteBuffer(m.ibo);
        if (m.vao) gl.deleteVertexArray(m.vao);
        if (m.waterVbo) gl.deleteBuffer(m.waterVbo);
        if (m.waterIbo) gl.deleteBuffer(m.waterIbo);
        if (m.waterVao) gl.deleteVertexArray(m.waterVao);
        if (m.lavaVbo) gl.deleteBuffer(m.lavaVbo);
        if (m.lavaIbo) gl.deleteBuffer(m.lavaIbo);
        if (m.lavaVao) gl.deleteVertexArray(m.lavaVao);
      }
      this.meshes.delete(key);
    } catch (e) {
      try { console.warn('freeChunkMesh failed for', key, e); } catch (_) { }
    }
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
   * If no item is equipped but isSwinging is true, renders a punch/hand animation.
   */
  renderFirstPersonWeapon(itemId: number, camX: number, camY: number, camZ: number, yaw: number, pitch: number, isBobbing: boolean, isSwinging: boolean, swingStartMs: number): void {
    // If no weapon but swinging, render a punch animation (bare hand)
    if (!itemId && isSwinging) {
      this.renderPunchAnimation(camX, camY, camZ, yaw, pitch, isBobbing, isSwinging, swingStartMs);
      return;
    }

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
    // rotate model by +90deg around view-forward (Z) so +X model axis maps to +Y (up),
    // flip 180deg so blade points correctly
    const baseRot = itemId === ItemId.BOW
      ? multiplyMat4(rotationZMatrix(Math.PI / 2), rotationYMatrix(-0.35))
      : rotationZMatrix(Math.PI / 2);
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

  /**
   * Render the local first-person left-hand item (torch/shield).
   * Similar to renderFirstPersonWeapon but anchored to the left side
   * and supports a defending pose for shields.
   */
  renderFirstPersonLeftItem(itemId: number, camX: number, camY: number, camZ: number, yaw: number, pitch: number, isBobbing: boolean, isDefending: boolean): void {
    if (!itemId) return;
    this.ensureWeaponMeshFor(itemId);
    const mesh = this.weaponMeshes.get(itemId);
    if (!mesh || !mesh.vao) return;

    const gl = this.gl;
    const aspect = this.width / Math.max(1, this.height);
    const proj = perspectiveMatrix(this.fovDeg * Math.PI / 180, aspect, 0.1, 200);
    const baseProj = proj;

    const now = performance.now() / 1000;
    const bob = isBobbing ? Math.sin(now * 6) * 0.02 : 0;

    const legH = 0.5;
    const torsoH = 0.8;
    const baseHandY = legH + torsoH - 0.75;
    const handY = baseHandY * 0.9 + bob;
    const handX = -0.64; // left of camera
    let handZ = -1.6;

    // If defending with shield, present a blocking pose
    if (isDefending && itemId === ItemId.SHIELD) {
      handZ = -1.1; // bring shield slightly closer
      const H = translationMatrix(handX, handY, handZ);
      const baseRot = multiplyMat4(rotationXMatrix(0.8), rotationZMatrix(Math.PI / 2));
      const S = scaleMatrix(1.2);
      const model = multiplyMat4(H, multiplyMat4(baseRot, S));
      const finalMVP = multiplyMat4(baseProj, model);

      const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
      if (depthWasEnabled) gl.disable(gl.DEPTH_TEST);

      gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
      gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);

      if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
      return;
    }

    // Default left-hand rendering (no swing)
    const H = translationMatrix(handX, handY, handZ);
    const baseRot = rotationZMatrix(Math.PI / 2);
    const S = scaleMatrix(1.2);
    const model = multiplyMat4(H, multiplyMat4(baseRot, S));
    const finalMVP = multiplyMat4(baseProj, model);

    const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthWasEnabled) gl.disable(gl.DEPTH_TEST);

    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
  }

  /**
   * Render a punch animation when the player attacks with bare hands.
   * Shows a simple blocky hand that swings forward.
   */
  private renderPunchAnimation(camX: number, camY: number, camZ: number, yaw: number, pitch: number, isBobbing: boolean, isSwinging: boolean, swingStartMs: number): void {
    const gl = this.gl;
    const aspect = this.width / Math.max(1, this.height);
    const proj = perspectiveMatrix(this.fovDeg * Math.PI / 180, aspect, 0.1, 200);

    // Bobbing
    const now = performance.now() / 1000;
    const bob = isBobbing ? Math.sin(now * 6) * 0.02 : 0;

    // Hand position (slightly different from weapon position for punch feel)
    const legH = 0.5;
    const torsoH = 0.8;
    const baseHandY = legH + torsoH - 0.7;
    const handY = baseHandY * 0.9 + bob;
    const handX = 0.62;
    const handZ = -1.5;

    // Punch animation - more aggressive forward thrust than weapon swing
    let punchExtend = 0;
    let punchRot = 0;
    if (isSwinging && swingStartMs) {
      const dur = 280; // faster than weapon swing
      const elapsed = Math.max(0, performance.now() - swingStartMs);
      const t = Math.min(1, elapsed / dur);
      const p = 1 - Math.pow(1 - t, 3);
      punchExtend = -0.4 * Math.sin(p * Math.PI); // forward thrust
      punchRot = Math.sin(p * Math.PI) * 1.5; // rotation punch
    }

    // Build transform for punch hand
    const H = translationMatrix(handX, handY + punchExtend * 0.3, handZ + punchExtend);
    const Rz = rotationZMatrix(punchRot);
    const S = scaleMatrix(0.8); // smaller than weapon
    const baseRot = rotationZMatrix(Math.PI / 2);
    const model = multiplyMat4(H, multiplyMat4(baseRot, multiplyMat4(Rz, S)));
    const finalMVP = multiplyMat4(proj, model);

    // Draw a simple hand shape (blocky fist)
    // Create hand geometry on the fly (a small cube for the fist)
    const handVerts: number[] = [];
    const handIndices: number[] = [];

    // Simple 0.15 sized cube centered at origin
    const s = 0.07;
    // Front face
    handVerts.push(-s, -s, s, s, -s, s, s, s, s, -s, s, s);
    handIndices.push(0, 1, 2, 0, 2, 3);
    // Back face
    handVerts.push(s, -s, -s, -s, -s, -s, -s, s, -s, s, s, -s);
    handIndices.push(4, 5, 6, 4, 6, 7);
    // Top face
    handVerts.push(-s, s, s, s, s, s, s, s, -s, -s, s, -s);
    handIndices.push(8, 9, 10, 8, 10, 11);
    // Bottom face
    handVerts.push(-s, -s, -s, s, -s, -s, s, -s, s, -s, -s, s);
    handIndices.push(12, 13, 14, 12, 14, 15);
    // Right face
    handVerts.push(s, -s, s, s, -s, -s, s, s, -s, s, s, s);
    handIndices.push(16, 17, 18, 16, 18, 19);
    // Left face
    handVerts.push(-s, -s, -s, -s, -s, s, -s, s, s, -s, s, -s);
    handIndices.push(20, 21, 22, 20, 22, 23);

    // Simple skin-tone color for the hand
    const skinColor = [0.85, 0.65, 0.55]; // light skin tone
    const handBrightness = 1.1;

    // Create buffers for hand geometry
    const handVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, handVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(handVerts), gl.DYNAMIC_DRAW);

    const handIBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, handIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(handIndices), gl.DYNAMIC_DRAW);

    const handVAO = gl.createVertexArray();
    gl.bindVertexArray(handVAO);

    gl.bindBuffer(gl.ARRAY_BUFFER, handVBO);
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aColor = gl.getAttribLocation(this.program, 'aColor');
    const aBright = gl.getAttribLocation(this.program, 'aBrightness');
    const aAlpha = gl.getAttribLocation(this.program, 'aAlpha');

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    // Color attribute - push same color for all verts
    const colors: number[] = [];
    const brightness: number[] = [];
    const alphas: number[] = [];
    for (let i = 0; i < handVerts.length / 3; i++) {
      colors.push(skinColor[0], skinColor[1], skinColor[2]);
      brightness.push(handBrightness);
      alphas.push(1.0);
    }
    const colorVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

    const brightVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, brightVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(brightness), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aBright);
    gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, 0, 0);

    const alphaVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, alphaVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alphas), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aAlpha);
    gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, handIBO);

    // Render with depth disabled for first-person overlay
    const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthWasEnabled) gl.disable(gl.DEPTH_TEST);

    gl.uniform3f(this.uTint, 1.0, 1.0, 1.0);
    gl.uniformMatrix4fv(this.uMVP, false, finalMVP);
    gl.bindVertexArray(handVAO);
    gl.drawElements(gl.TRIANGLES, handIndices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);

    // Clean up
    gl.deleteBuffer(handVBO);
    gl.deleteBuffer(handIBO);
    gl.deleteBuffer(colorVBO);
    gl.deleteBuffer(brightVBO);
    gl.deleteBuffer(alphaVBO);
    gl.deleteVertexArray(handVAO);
  }
}

// ──── Matrix helpers ────
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

function scaleMatrix3(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
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