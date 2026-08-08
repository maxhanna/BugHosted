import { RIM_TINTS, DECAL_COLORS, RacingCarAppearance } from '../../services/datacontracts/racing/racing-types';

// Per-decal placement variants — each decal style id gets its own layout so
// different decals put their artwork in different spots on the car instead of
// all sharing one geometry. `flank` plates are mirrored to ±z; `center` plates
// sit on the centreline (z = 0) and are added once. Coordinates hug the body
// loft's tapered top surface (front is +x), matching the values verified for
// the original stripe segments.
export interface DecalLayoutDef {
  flank: Array<[number, number, number, number, number, number]>; // cx, cy, l, h, d, z
  center: Array<[number, number, number, number, number]>;        // cx, cy, l, h, d
}
export const DECAL_LAYOUTS: Record<number, DecalLayoutDef> = {
  // Full-length segmented racing stripes (original look).
  401: {
    flank: [[-0.72, 0.235, 0.50, 0.05, 0.09, 0.05], [-0.16, 0.385, 0.34, 0.05, 0.09, 0.05], [0.60, 0.235, 0.42, 0.05, 0.09, 0.05], [1.02, 0.160, 0.34, 0.05, 0.08, 0.045], [-0.16, 0.395, 0.34, 0.05, 0.06, 0.13], [0.60, 0.225, 0.40, 0.05, 0.06, 0.13]],
    center: [[0.68, 0.225, 0.30, 0.05, 0.10], [1.22, 0.13, 0.14, 0.05, 0.10]],
  },
  // Flames sweep back from the nose across the hood.
  402: {
    flank: [[1.15, 0.145, 0.22, 0.05, 0.08, 0.05], [0.95, 0.17, 0.26, 0.05, 0.08, 0.07], [0.72, 0.205, 0.24, 0.05, 0.07, 0.06], [0.50, 0.24, 0.20, 0.05, 0.06, 0.05]],
    center: [[1.28, 0.125, 0.12, 0.05, 0.08], [0.68, 0.225, 0.16, 0.05, 0.08]],
  },
  // Full-body scattered patches.
  403: {
    flank: [[-0.80, 0.22, 0.14, 0.04, 0.06, 0.05], [-0.55, 0.29, 0.14, 0.04, 0.06, 0.08], [-0.30, 0.40, 0.12, 0.04, 0.06, 0.05], [-0.05, 0.34, 0.12, 0.04, 0.06, 0.08], [0.20, 0.30, 0.14, 0.04, 0.06, 0.05], [0.45, 0.25, 0.14, 0.04, 0.06, 0.08], [0.70, 0.22, 0.12, 0.04, 0.06, 0.05], [0.95, 0.17, 0.12, 0.04, 0.05, 0.05], [1.15, 0.145, 0.10, 0.04, 0.05, 0.04]],
    center: [[0.68, 0.225, 0.16, 0.04, 0.08], [1.25, 0.13, 0.10, 0.04, 0.06]],
  },
  // Big number plates on the nose and flanks.
  404: {
    flank: [[0.85, 0.19, 0.14, 0.05, 0.05, 0.08], [0.50, 0.24, 0.12, 0.05, 0.05, 0.07], [-0.10, 0.38, 0.12, 0.05, 0.05, 0.06], [-0.45, 0.36, 0.12, 0.05, 0.05, 0.06]],
    center: [[1.25, 0.13, 0.18, 0.06, 0.09], [0.68, 0.225, 0.14, 0.06, 0.08]],
  },
  // Checkered bands across the nose and rear deck.
  405: {
    flank: [[0.85, 0.19, 0.12, 0.05, 0.06, 0.07], [-0.20, 0.40, 0.12, 0.05, 0.06, 0.07]],
    center: [[1.15, 0.145, 0.26, 0.05, 0.14], [-0.60, 0.29, 0.26, 0.05, 0.14], [0.68, 0.225, 0.12, 0.05, 0.08]],
  },
  // Zigzag lightning slashes down the flanks.
  406: {
    flank: [[1.10, 0.15, 0.10, 0.05, 0.04, 0.05], [0.90, 0.175, 0.10, 0.05, 0.04, 0.09], [0.70, 0.21, 0.10, 0.05, 0.04, 0.05], [0.50, 0.24, 0.10, 0.05, 0.04, 0.09], [0.30, 0.29, 0.10, 0.05, 0.04, 0.05], [0.05, 0.33, 0.10, 0.05, 0.04, 0.09], [-0.20, 0.40, 0.10, 0.05, 0.04, 0.05]],
    center: [[0.68, 0.225, 0.10, 0.05, 0.06]],
  },
  // Large centered emblem on the engine cover.
  407: {
    flank: [[0.85, 0.19, 0.08, 0.05, 0.05, 0.08], [-0.10, 0.38, 0.08, 0.05, 0.05, 0.07]],
    center: [[0.68, 0.225, 0.30, 0.06, 0.13], [1.25, 0.13, 0.12, 0.05, 0.08], [-0.45, 0.36, 0.14, 0.05, 0.10]],
  },
  // Crest emblem, engine-cover dominant.
  408: {
    flank: [[0.50, 0.24, 0.10, 0.05, 0.05, 0.07]],
    center: [[0.68, 0.225, 0.26, 0.06, 0.12], [1.22, 0.13, 0.10, 0.05, 0.08]],
  },
  // Racing number plates.
  409: {
    flank: [[0.85, 0.19, 0.14, 0.05, 0.05, 0.08], [0.50, 0.24, 0.12, 0.05, 0.05, 0.07], [-0.10, 0.38, 0.12, 0.05, 0.05, 0.06], [-0.45, 0.36, 0.12, 0.05, 0.05, 0.06]],
    center: [[1.25, 0.13, 0.18, 0.06, 0.09], [0.68, 0.225, 0.14, 0.06, 0.08]],
  },
  410: {
    flank: [[0.85, 0.19, 0.14, 0.05, 0.05, 0.08], [0.50, 0.24, 0.12, 0.05, 0.05, 0.07], [-0.10, 0.38, 0.12, 0.05, 0.05, 0.06], [-0.45, 0.36, 0.12, 0.05, 0.05, 0.06]],
    center: [[1.25, 0.13, 0.18, 0.06, 0.09], [0.68, 0.225, 0.14, 0.06, 0.08]],
  },
  411: {
    flank: [[0.85, 0.19, 0.14, 0.05, 0.05, 0.08], [0.50, 0.24, 0.12, 0.05, 0.05, 0.07], [-0.10, 0.38, 0.12, 0.05, 0.05, 0.06], [-0.45, 0.36, 0.12, 0.05, 0.05, 0.06]],
    center: [[1.25, 0.13, 0.18, 0.06, 0.09], [0.68, 0.225, 0.14, 0.06, 0.08]],
  },
  // Thin sponsor side stripes.
  412: {
    flank: [[-0.55, 0.29, 0.40, 0.04, 0.05, 0.06], [-0.20, 0.40, 0.30, 0.04, 0.05, 0.06], [0.15, 0.31, 0.30, 0.04, 0.05, 0.06], [0.50, 0.24, 0.30, 0.04, 0.05, 0.06], [0.85, 0.19, 0.24, 0.04, 0.05, 0.06]],
    center: [[1.25, 0.13, 0.10, 0.04, 0.06]],
  },
  // Full-body scattered patches.
  413: {
    flank: [[-0.80, 0.22, 0.14, 0.04, 0.06, 0.05], [-0.55, 0.29, 0.14, 0.04, 0.06, 0.08], [-0.30, 0.40, 0.12, 0.04, 0.06, 0.05], [-0.05, 0.34, 0.12, 0.04, 0.06, 0.08], [0.20, 0.30, 0.14, 0.04, 0.06, 0.05], [0.45, 0.25, 0.14, 0.04, 0.06, 0.08], [0.70, 0.22, 0.12, 0.04, 0.06, 0.05], [0.95, 0.17, 0.12, 0.04, 0.05, 0.05], [1.15, 0.145, 0.10, 0.04, 0.05, 0.04]],
    center: [[0.68, 0.225, 0.16, 0.04, 0.08], [1.25, 0.13, 0.10, 0.04, 0.06]],
  },
  // Cheetah spots scattered across the body.
  414: {
    flank: [[0.95, 0.17, 0.06, 0.04, 0.05, 0.05], [0.70, 0.21, 0.06, 0.04, 0.05, 0.09], [0.45, 0.25, 0.06, 0.04, 0.05, 0.06], [0.15, 0.31, 0.06, 0.04, 0.05, 0.09], [-0.15, 0.38, 0.06, 0.04, 0.05, 0.05], [-0.45, 0.36, 0.06, 0.04, 0.05, 0.08], [-0.70, 0.25, 0.06, 0.04, 0.05, 0.05]],
    center: [[0.68, 0.225, 0.08, 0.04, 0.05], [1.20, 0.13, 0.06, 0.04, 0.05]],
  },
  // Rising-sun disc on the rear deck.
  415: {
    flank: [[-0.30, 0.40, 0.10, 0.05, 0.05, 0.06]],
    center: [[-0.60, 0.29, 0.24, 0.06, 0.12], [0.68, 0.225, 0.16, 0.05, 0.08]],
  },
  // Circuit-board traces along the flanks.
  416: {
    flank: [[1.10, 0.15, 0.10, 0.05, 0.04, 0.05], [0.90, 0.175, 0.10, 0.05, 0.04, 0.09], [0.70, 0.21, 0.10, 0.05, 0.04, 0.05], [0.50, 0.24, 0.10, 0.05, 0.04, 0.09], [0.30, 0.29, 0.10, 0.05, 0.04, 0.05], [0.05, 0.33, 0.10, 0.05, 0.04, 0.09], [-0.20, 0.40, 0.10, 0.05, 0.04, 0.05]],
    center: [[0.68, 0.225, 0.10, 0.05, 0.06]],
  },
  // Bullseye target on the engine cover.
  417: {
    flank: [[0.50, 0.24, 0.08, 0.05, 0.05, 0.08]],
    center: [[0.68, 0.225, 0.22, 0.06, 0.11], [1.20, 0.13, 0.10, 0.05, 0.07]],
  },
  // Union Jack on the rear deck.
  418: {
    flank: [[-0.30, 0.40, 0.10, 0.05, 0.05, 0.06], [0.30, 0.29, 0.10, 0.05, 0.05, 0.06]],
    center: [[-0.60, 0.29, 0.26, 0.06, 0.13], [0.68, 0.225, 0.20, 0.05, 0.10], [1.20, 0.13, 0.10, 0.05, 0.06]],
  },
  // Cyber grid on the nose and engine cover.
  419: {
    flank: [[1.00, 0.16, 0.10, 0.05, 0.04, 0.05], [0.75, 0.20, 0.10, 0.05, 0.04, 0.08], [0.45, 0.25, 0.10, 0.05, 0.04, 0.05], [0.15, 0.31, 0.10, 0.05, 0.04, 0.08]],
    center: [[0.68, 0.225, 0.14, 0.05, 0.07], [1.25, 0.13, 0.10, 0.05, 0.06]],
  },
  // Zen kanji on the engine cover.
  420: {
    flank: [],
    center: [[0.68, 0.225, 0.18, 0.06, 0.10], [1.22, 0.13, 0.08, 0.05, 0.06]],
  },
  // Dragon flames, front-heavy.
  421: {
    flank: [[1.15, 0.145, 0.22, 0.05, 0.08, 0.05], [0.95, 0.17, 0.26, 0.05, 0.08, 0.07], [0.72, 0.205, 0.24, 0.05, 0.07, 0.06], [0.50, 0.24, 0.20, 0.05, 0.06, 0.05]],
    center: [[1.28, 0.125, 0.12, 0.05, 0.08], [0.68, 0.225, 0.16, 0.05, 0.08]],
  },
  // Bee stripes: full-length segmented stripes.
  422: {
    flank: [[-0.72, 0.235, 0.50, 0.05, 0.09, 0.05], [-0.16, 0.385, 0.34, 0.05, 0.09, 0.05], [0.60, 0.235, 0.42, 0.05, 0.09, 0.05], [1.02, 0.160, 0.34, 0.05, 0.08, 0.045], [-0.16, 0.395, 0.34, 0.05, 0.06, 0.13], [0.60, 0.225, 0.40, 0.05, 0.06, 0.13]],
    center: [[0.68, 0.225, 0.30, 0.05, 0.10], [1.22, 0.13, 0.14, 0.05, 0.10]],
  },
  // Tiger stripes: angled flank slashes.
  423: {
    flank: [[0.95, 0.17, 0.10, 0.05, 0.04, 0.06], [0.75, 0.20, 0.10, 0.05, 0.04, 0.10], [0.55, 0.24, 0.10, 0.05, 0.04, 0.06], [0.35, 0.28, 0.10, 0.05, 0.04, 0.10], [0.10, 0.32, 0.10, 0.05, 0.04, 0.06], [-0.15, 0.38, 0.10, 0.05, 0.04, 0.10], [-0.40, 0.36, 0.10, 0.05, 0.04, 0.06]],
    center: [[0.68, 0.225, 0.12, 0.05, 0.06]],
  },
  // Starburst rays from the nose.
  424: {
    flank: [[1.00, 0.16, 0.08, 0.05, 0.05, 0.05], [0.85, 0.19, 0.08, 0.05, 0.05, 0.09], [0.70, 0.21, 0.08, 0.05, 0.05, 0.05], [0.55, 0.24, 0.08, 0.05, 0.05, 0.09]],
    center: [[1.22, 0.13, 0.14, 0.06, 0.09], [0.68, 0.225, 0.10, 0.05, 0.06]],
  },
  // Heart emblem on the engine cover.
  425: {
    flank: [[0.50, 0.24, 0.06, 0.05, 0.05, 0.08]],
    center: [[0.68, 0.225, 0.16, 0.06, 0.09], [1.22, 0.13, 0.06, 0.05, 0.05]],
  },
  // Arrow chevrons on the flanks.
  426: {
    flank: [[-0.55, 0.29, 0.40, 0.04, 0.05, 0.06], [-0.20, 0.40, 0.30, 0.04, 0.05, 0.06], [0.15, 0.31, 0.30, 0.04, 0.05, 0.06], [0.50, 0.24, 0.30, 0.04, 0.05, 0.06], [0.85, 0.19, 0.24, 0.04, 0.05, 0.06]],
    center: [[1.25, 0.13, 0.10, 0.04, 0.06]],
  },
  // Ocean wave along the flanks.
  427: {
    flank: [[-0.55, 0.29, 0.16, 0.05, 0.06, 0.06], [-0.20, 0.40, 0.16, 0.05, 0.06, 0.06], [0.15, 0.31, 0.16, 0.05, 0.06, 0.06], [0.50, 0.24, 0.16, 0.05, 0.06, 0.06]],
    center: [[0.68, 0.225, 0.14, 0.05, 0.07]],
  },
  // Crescent moon on the engine cover.
  428: {
    flank: [[0.50, 0.24, 0.06, 0.05, 0.05, 0.08]],
    center: [[0.68, 0.225, 0.16, 0.06, 0.09], [1.22, 0.13, 0.06, 0.05, 0.05]],
  },
};
export type AccentSeg = [number, number, number, number, number, number]; // cx, cy, l, h, d, z
// Accent side-pod stripe segments (z > 0; mirrored to -z at build/draw time).
const ACCENT_SEGS: AccentSeg[] = [
  [0.62, 0.31, 0.26, 0.03, 0.06, 0.46],
  [0.24, 0.31, 0.26, 0.03, 0.06, 0.46],
  [-0.14, 0.29, 0.24, 0.03, 0.06, 0.46],
  [-0.50, 0.24, 0.20, 0.03, 0.06, 0.46],
  [-0.74, 0.19, 0.16, 0.03, 0.06, 0.42],
];
const overlap1D = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
// A flank plate counts as "outboard" when its outer z-edge reaches at least
// roughly halfway across the body shoulder (body half-width is ~0.19-0.25,
// so halfway is ~0.10-0.12; the pods sit further out at z = 0.42-0.46).
// Shoulder artwork (racing stripes, tiger slashes, cheetah spots) crosses
// this; flame tongues and number discs, which stay mid-body, no longer
// crowd the pod stripes.
const ACCENT_SHOULDER_Z = 0.10;
/**
 * Accent side-pod stripe segments that survive for a given decal style id
 * (0 = no decal equipped → all segments). The z-aware collision filter is the
 * single source of truth shared by the 3D car mesh (buildCarMesh) and the
 * garage top-down preview, so both show the same combined accent + decal
 * layout.
 */
export function getAccentSegsForStyle(styleKey: number): AccentSeg[] {
  const decal = DECAL_LAYOUTS[styleKey];
  if (!decal) return ACCENT_SEGS;
  const out: AccentSeg[] = [];
  for (const [cx, cy, l, h, d, z] of ACCENT_SEGS) {
    const x0 = cx - l / 2, x1 = cx + l / 2;
    const az = Math.abs(z);
    const aZ0 = az - d / 2, aZ1 = az + d / 2;
    // Flank plates (mirrored to ±z): drop only when the artwork is actually
    // outboard (outer edge at/above ACCENT_SHOULDER_Z) or its z-extent
    // overlaps the accent's pod band, in addition to x overlap.
    const flankCollides = decal.flank.some(([dcx, , dl, , dd, dz]) => {
      const pz = Math.abs(dz);
      const pZ0 = pz - dd / 2, pZ1 = pz + dd / 2;
      return overlap1D(x0, x1, dcx - dl / 2, dcx + dl / 2) &&
        (pZ1 >= ACCENT_SHOULDER_Z || overlap1D(aZ0, aZ1, pZ0, pZ1));
    });
    // Centerline plates (z = 0): require genuine overlap in BOTH x and z, so
    // centreline emblems never erase the pod stripes.
    const centerCollides = decal.center.some(([dcx, , dl, , dd]) =>
      overlap1D(x0, x1, dcx - dl / 2, dcx + dl / 2) &&
      overlap1D(aZ0, aZ1, -dd / 2, dd / 2)
    );
    if (!flankCollides && !centerCollides) out.push([cx, cy, l, h, d, z]);
  }
  return out;
}
// ── Car loft surface sampling ────────────────────────────────────────────────
// The body, engine-cover hump and side pods are smooth lofts (superellipse
// cross-sections, n=4) built in buildCarMesh. These station tables mirror that
// geometry so livery plates can be built as flat quads that hug the paint
// surface like real tattoos/wraps instead of chunky boxes poking out of the
// chassis.
interface LoftStation { x: number; y: number; h: number; w: number; cz?: number }
const BODY_LOFT: LoftStation[] = [
  { x: -1.06, y: 0.10, h: 0.17, w: 0.28 },
  { x: -0.90, y: 0.11, h: 0.19, w: 0.32 },
  { x: -0.74, y: 0.13, h: 0.22, w: 0.36 },
  { x: -0.58, y: 0.16, h: 0.26, w: 0.40 },
  { x: -0.42, y: 0.20, h: 0.32, w: 0.44 },
  { x: -0.26, y: 0.22, h: 0.38, w: 0.47 },
  { x: -0.10, y: 0.21, h: 0.34, w: 0.50 },
  { x: 0.06, y: 0.19, h: 0.28, w: 0.52 },
  { x: 0.22, y: 0.18, h: 0.24, w: 0.51 },
  { x: 0.38, y: 0.17, h: 0.21, w: 0.47 },
  { x: 0.54, y: 0.15, h: 0.18, w: 0.40 },
  { x: 0.70, y: 0.14, h: 0.16, w: 0.34 },
  { x: 0.86, y: 0.12, h: 0.14, w: 0.28 },
  { x: 1.04, y: 0.10, h: 0.11, w: 0.21 },
  { x: 1.22, y: 0.09, h: 0.08, w: 0.14 },
  { x: 1.38, y: 0.09, h: 0.06, w: 0.08 },
];
const HUMP_LOFT: LoftStation[] = [
  { x: 0.13, y: 0.30, h: 0.035, w: 0.26 },
  { x: 0.47, y: 0.30, h: 0.035, w: 0.26 },
];
const POD_LOFT: LoftStation[] = [
  { x: 0.58, y: 0.17, cz: 0.48, h: 0.28, w: 0.34 },
  { x: 0.34, y: 0.18, cz: 0.50, h: 0.27, w: 0.38 },
  { x: 0.08, y: 0.18, cz: 0.50, h: 0.25, w: 0.37 },
  { x: -0.18, y: 0.17, cz: 0.49, h: 0.22, w: 0.33 },
  { x: -0.42, y: 0.16, cz: 0.47, h: 0.18, w: 0.28 },
  { x: -0.64, y: 0.14, cz: 0.44, h: 0.14, w: 0.22 },
  { x: -0.84, y: 0.12, cz: 0.38, h: 0.10, w: 0.14 },
];
/** Top-surface height of a superellipse loft (n=4) at (x, z), mirroring the
 * cross-section math in addSmoothLoft. */
function loftTopY(stations: LoftStation[], x: number, z: number): number {
  let s0 = stations[0], s1 = stations[stations.length - 1];
  if (x <= s0.x) { s1 = s0; }
  else if (x >= s1.x) { s0 = s1; }
  else {
    for (let i = 0; i < stations.length - 1; i++) {
      if (x >= stations[i].x && x <= stations[i + 1].x) { s0 = stations[i]; s1 = stations[i + 1]; break; }
    }
  }
  const f = s1.x === s0.x ? 0 : (x - s0.x) / (s1.x - s0.x);
  const y = s0.y + (s1.y - s0.y) * f;
  const h = s0.h + (s1.h - s0.h) * f;
  const w = s0.w + (s1.w - s0.w) * f;
  const cz = (s0.cz ?? 0) + ((s1.cz ?? 0) - (s0.cz ?? 0)) * f;
  const hw = w / 2, hh = h / 2;
  const dz = Math.abs(z - cz);
  if (dz >= hw) return y;
  const t = Math.pow(dz / hw, 4);
  return y + hh * Math.pow(1 - t, 0.25);
}
/** Highest painted surface at (x, z): the main body or the cockpit hump. */
const carBodyTopY = (x: number, z: number) => Math.max(loftTopY(BODY_LOFT, x, z), loftTopY(HUMP_LOFT, x, z));
/** Side-pod top surface (symmetric about z=0). */
const carPodTopY = (x: number, z: number) => loftTopY(POD_LOFT, x, Math.abs(z));

export interface TrackPoint {
  x: number; z: number;
  dirX: number; dirZ: number;
  width: number;
  isStartFinish?: boolean;
}
export interface RacingCarVertex {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
}
export interface CrowdPerson {
  x: number; y: number; z: number;
  shirt: [number, number, number];
  skin: [number, number, number];
  hair: [number, number, number];
  pants: [number, number, number];
  pose: number;
  scale: number;
  phase: number;
  veiled?: boolean;
  pattern?: [number, number, number];
  flag?: boolean;
}
interface MaskCamCache {
  valid: boolean;
  eyeX: number; eyeY: number; eyeZ: number;
  r0: number; r1: number; r2: number;
  f0: number; f1: number; f2: number;
  p0: number; p5: number;
  w: number; h: number;
}
interface WavingFlag {
  x: number; z: number;
  dirX: number; dirZ: number;
  anchorY: number;
  w: number; h: number;
  kind: 'rect' | 'tri';
  colors: [number, number, number][];
  emblem?: 'maple' | 'cross';
  phase: number;
  speed: number;
  amp: number;
}
export class RacingRenderer {
  private gl: WebGL2RenderingContext;
  private prog!: WebGLProgram;
  private projLoc!: WebGLUniformLocation;
  private viewLoc!: WebGLUniformLocation;
  private modelLoc!: WebGLUniformLocation;
  private colorLoc!: WebGLUniformLocation;
  private textureLoc!: WebGLUniformLocation;
  private hasTexLoc!: WebGLUniformLocation;
  private lightDirLoc!: WebGLUniformLocation;
  private ambientLoc!: WebGLUniformLocation;
  private fogColorLoc!: WebGLUniformLocation;
  private viewPosLoc!: WebGLUniformLocation;
  private useVertexColor!: WebGLUniformLocation;
  private lightMatrixLoc!: WebGLUniformLocation;
  private sunColorLoc!: WebGLUniformLocation;
  private emissiveLoc!: WebGLUniformLocation;
  private skyNightLoc!: WebGLUniformLocation;
  private envTopLoc!: WebGLUniformLocation;
  private envBottomLoc!: WebGLUniformLocation;
  private envStrengthLoc!: WebGLUniformLocation;
  private shadowMapLoc!: WebGLUniformLocation;
  private shadowTexelLoc!: WebGLUniformLocation;
  private heatGlowLoc!: WebGLUniformLocation;
  private metallicLoc!: WebGLUniformLocation;
  private rimTintLoc!: WebGLUniformLocation;
  private rimStrengthLoc!: WebGLUniformLocation;
  private trackVao!: WebGLVertexArrayObject;
  private trackCount = 0;
  private sceneryVao!: WebGLVertexArrayObject;
  private sceneryVbo!: WebGLBuffer;
  private sceneryIbo!: WebGLBuffer;
  private sceneryCount = 0;
  private _cloudVao: WebGLVertexArrayObject | null = null;
  private _cloudVbo: WebGLBuffer | null = null;
  private _cloudIbo: WebGLBuffer | null = null;
  private _cloudCount = 0;
  private _clouds: { ang: number; va: number; radius: number; bx: number; bz: number }[] = [];
  private _cloudRanges: { start: number; count: number }[] = [];
  private _cloudCenterX = 0;
  private _cloudCenterZ = 0;
  private _cloudAlpha = 0.6;
  private alphaLoc!: WebGLUniformLocation;
  private carVao!: WebGLVertexArrayObject;
  private carCount = 0;
  private wheelVao!: WebGLVertexArrayObject;
  private wheelCount = 0;
  private wheelRimVao!: WebGLVertexArrayObject;
  private wheelRimCount = 0;
  private rearWheelVao!: WebGLVertexArrayObject;
  private rearWheelCount = 0;
  private rearWheelRimVao!: WebGLVertexArrayObject;
  private rearWheelRimCount = 0;
  private brakeVao!: WebGLVertexArrayObject;
  private brakeCount = 0;
  private rearBrakeVao!: WebGLVertexArrayObject;
  private rearBrakeCount = 0;
  private rimFaceVao!: WebGLVertexArrayObject;
  private rimFaceCount = 0;
  private rimFaceVaoL!: WebGLVertexArrayObject;
  private rimFaceCountL = 0;
  private rearRimFaceVao!: WebGLVertexArrayObject;
  private rearRimFaceCount = 0;
  private rearRimFaceVaoL!: WebGLVertexArrayObject;
  private rearRimFaceCountL = 0;
  private tireBrandTex!: WebGLTexture;
  /** Tire-wear baking: the sidewall brand texture is redrawn progressively
   *  darker as race distance piles up, so worn tires read as used. */
  private _tireBrandCanvas: HTMLCanvasElement | null = null;
  private _tireBrandCtx: CanvasRenderingContext2D | null = null;
  private tireWear = 0;
  private _bakedTireWear = -1;
  private _tireDist = 0;
  private barrierVao!: WebGLVertexArrayObject;
  private barrierCount = 0;
  private finishVao!: WebGLVertexArrayObject;
  private finishCount = 0;
  private accentVaos = new Map<number, { vao: WebGLVertexArrayObject; count: number }>();
  private decalVaos = new Map<number, { vao: WebGLVertexArrayObject; count: number }>();
  private spoilerVaos = new Map<number, { vao: WebGLVertexArrayObject; count: number }>();
  /** Stock rear wing, drawn only when no spoiler upgrade is equipped so the
   *  spoiler replaces it instead of stacking on top. */
  private baseWingVao!: WebGLVertexArrayObject;
  private baseWingCount = 0;
  private exhaustVaos = new Map<number, { vao: WebGLVertexArrayObject; count: number }>();
  private glowVao!: WebGLVertexArrayObject;
  private glowCount = 0;
  private glowHaloVao!: WebGLVertexArrayObject;
  private nightVao!: WebGLVertexArrayObject;
  private nightCount = 0;
  private headlightVao!: WebGLVertexArrayObject;
  private headlightCount = 0;
  private glowHaloCount = 0;
  private whiteTex!: WebGLTexture;
  private asphaltTex!: WebGLTexture;
  private grassTex!: WebGLTexture;
  private trackTex!: WebGLTexture;
  private glowTex!: WebGLTexture;
  viewMatrix = new Float32Array(16);
  projMatrix = new Float32Array(16);
  modelMatrix = new Float32Array(16);
  private _trackPoints: TrackPoint[] = [];
  trackLen = 0;
  totalTrackDist = 0;
  private shadowFBO!: WebGLFramebuffer;
  private shadowTex!: WebGLTexture;
  private shadowProg!: WebGLProgram;
  private shadowLightLoc!: WebGLUniformLocation;
  private shadowModelLoc!: WebGLUniformLocation;
  private shadowSize = 1024;
  private lightSpace = new Float32Array(16);
  private lightView = new Float32Array(16);
  private lightProj = new Float32Array(16);
  sunDir: [number, number, number] = [0.4, 0.7, 0.5];
  sunColor: [number, number, number] = [1.0, 0.95, 0.85];
  ambientColor: [number, number, number] = [0.25, 0.25, 0.3];
  fogColor: [number, number, number] = [0.4, 0.45, 0.5];
  elapsed = 0;
  theme: 'default' | 'miami' | 'city' | 'mountain' | 'alpine' | 'desert' | 'monaco' | 'monaco-night' | 'montreal' | 'italy' | 'japan' = 'default';
  // Device-quality tier: set by the component for mobile / low-end GPUs. Trims
  // the heaviest scenery (conifer counts and mesh density) and per-frame effects
  // (snow flake count) so the mountain and alpine circuits stay smooth on phones.
  lowQuality = false;
  night = false;
  skyTop: [number, number, number] = [0.1, 0.2, 0.5];
  skyHorizon: [number, number, number] = [0.7, 0.75, 0.85];
  skyBottom: [number, number, number] = [0.4, 0.45, 0.5];
  readonly TRACK_SEGMENTS = 200;
  readonly TRACK_WIDTH = 16;
  readonly TRACK_LENGTH = 2000;
  // Corner direction boards: SIGN_TURN_MIN is the accumulated heading change
  // (radians) over the detection window that qualifies a bend as a "tight
  // corner". The procedurally generated circuit peaks at ~0.44 rad over a
  // 45-unit window, so a threshold of 0.5 (the original value) matched zero
  // corners and no signs ever appeared. 0.23 marks every bend sharper than a
  // ~190-unit radius — roughly a dozen corners per lap, each getting a board
  // at the apex and one 60 units before it, on both sides of the track.
  private readonly SIGN_TURN_WINDOW = 45;
  private readonly SIGN_TURN_MIN = 0.23;
  private readonly SIGN_APPROACH_DIST = 60;
  private readonly SIGN_BOARD_W = 3.0;
  private readonly SIGN_BOARD_H = 1.9;
  private readonly SIGN_OFFSET_CLEAR = 3.4;
  private readonly SIGN_BOTTOM_Y = 0.75;
  // Japan touge: where the valley-drop arc starts (fraction of the lap).
  private _japanValleyFrac = 0.6;
  carX = 0; carY = 0.3; carZ = 0;
  carYaw = 0; carPitch = 0; carRoll = 0;
  carSpeed = 0;
  private _scratchTranslate: [number, number, number] = [0, 0, 0];
  private _scratchScale: [number, number, number] = [1, 1, 1];
  private skyVao!: WebGLVertexArrayObject;
  private skyProg!: WebGLProgram;
  private skyProjLoc!: WebGLUniformLocation;
  private skyViewLoc!: WebGLUniformLocation;
  private skySunDirLoc!: WebGLUniformLocation;
  private skyTimeLoc!: WebGLUniformLocation;
  private skyTopLoc!: WebGLUniformLocation;
  private skyHorizonLoc!: WebGLUniformLocation;
  private skyBottomLoc!: WebGLUniformLocation;
  private skySunColorLoc!: WebGLUniformLocation;
  private skyGlowColorLoc!: WebGLUniformLocation;
  private mirrorTex!: WebGLTexture;
  private mirrorDepth!: WebGLRenderbuffer;
  private mirrorFBO!: WebGLFramebuffer;
  private mirrorProg!: WebGLProgram;
  private mirrorTexLoc!: WebGLUniformLocation;
  private mirrorVao!: WebGLVertexArrayObject;
  private mirrorW = 512;
  private mirrorH = 288;
  private heatShimmer = false;
  private _heatInitialized = false;
  private _heatFBO: WebGLFramebuffer | null = null;
  private _heatTex: WebGLTexture | null = null;
  private _heatDepth: WebGLRenderbuffer | null = null;
  private _heatW = 0;
  private _heatH = 0;
  private heatProg!: WebGLProgram;
  private heatSceneLoc!: WebGLUniformLocation;
  private heatTimeLoc!: WebGLUniformLocation;
  private heatHorizonLoc!: WebGLUniformLocation;
  private heatStrengthLoc!: WebGLUniformLocation;
  private heatVao!: WebGLVertexArrayObject;
  private heatMaskLoc!: WebGLUniformLocation;
  private _heatMaskTex: WebGLTexture | null = null;
  private heatViewProjLoc!: WebGLUniformLocation;
  private heatVulturesLoc!: WebGLUniformLocation;
  private heatCamPosLoc!: WebGLUniformLocation;
  private heatCamRightLoc!: WebGLUniformLocation;
  private heatCamUpLoc!: WebGLUniformLocation;
  private heatCamFwdLoc!: WebGLUniformLocation;
  private heatTanHalfFovLoc!: WebGLUniformLocation;
  private _heatViewProj = new Float32Array(16);
  private _scratchMvp = new Float32Array(16);
  private _vultures: { ang: number; radius: number; alt: number; speed: number; phase: number }[] = [];
  private _vultureWorld = new Float32Array(16);
  private _heatMaskFBO: WebGLFramebuffer | null = null;
  private _heatMaskW = 0;
  private _heatMaskH = 0;
  private _mirrorMaskTex: WebGLTexture | null = null;
  private _mirrorMaskFBO: WebGLFramebuffer | null = null;
  private _heatMaskProg: WebGLProgram | null = null;
  private _heatMaskProjLoc: WebGLUniformLocation | null = null;
  private _heatMaskViewLoc: WebGLUniformLocation | null = null;
  private _heatMaskInitialized = false;
  private static readonly MASK_CAM_MOVE_SQ = 4;
  private static readonly MASK_CAM_ROT_EPS = 0.006;
  private _mainMaskCache: MaskCamCache = { valid: false, eyeX: 0, eyeY: 0, eyeZ: 0, r0: 0, r1: 0, r2: 0, f0: 0, f1: 0, f2: 0, p0: 0, p5: 0, w: 0, h: 0 };
  private _mirrorMaskCache: MaskCamCache = { valid: false, eyeX: 0, eyeY: 0, eyeZ: 0, r0: 0, r1: 0, r2: 0, f0: 0, f1: 0, f2: 0, p0: 0, p5: 0, w: 0, h: 0 };
  private _mirrorSceneFBO: WebGLFramebuffer | null = null;
  private _mirrorSceneTex: WebGLTexture | null = null;
  private _mirrorSceneDepth: WebGLRenderbuffer | null = null;
  private mirrorProj!: Float32Array;
  private mirrorView!: Float32Array;
  constructor(canvas: HTMLCanvasElement, lowQuality = false) {
    this.lowQuality = lowQuality;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.whiteTex = this.makeTex(1, 1, new Uint8Array([255, 255, 255]));
    this.asphaltTex = this.makeAsphaltTex();
    this.grassTex = this.makeGrassTex();
    this.trackTex = this.makeTrackMarkingsTex();
    this.tireBrandTex = this.makeTireBrandTex();
    this.glowTex = this.makeGlowTex();
    if (lowQuality) {
      // The shadow pass re-renders the full scenery every frame — quartering its
      // resolution on weak GPUs cuts that fill cost 4x (and the mirror pixels
      // too) while staying visually close on phones.
      this.shadowSize = 512;
      this.mirrorW = 384;
      this.mirrorH = 216;
    }
    this.initShader();
    this.initShadow();
    this.initSky();
    this.initMirror();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.generateTrack();
    this.buildTrackMesh();
    this.buildScenery();
    this.buildCarMesh();
    this.buildSnowCap();
  }
  private makeTex(w: number, h: number, data: Uint8Array): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
  private makeAsphaltTex(): WebGLTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      const g = 55 + (i % 13) + ((i * 7) % 9);
      data[i * 3] = g; data[i * 3 + 1] = g; data[i * 3 + 2] = g;
    }
    return this.makeTex(size, size, data);
  }
  private makeGrassTex(): WebGLTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      const g = 60 + (i % 20);
      const r = 20 + (i * 3 % 15);
      data[i * 3] = r; data[i * 3 + 1] = g; data[i * 3 + 2] = 15 + (i % 10);
    }
    return this.makeTex(size, size, data);
  }
  /** Draws the sidewall brand into the cached canvas; `wear` (0..1) darkens
   *  the rubber and dims the markings so tires read as used mid-race. */
  private drawTireBrand(wear: number): HTMLCanvasElement {
    const size = 256;
    if (!this._tireBrandCanvas) {
      this._tireBrandCanvas = document.createElement('canvas');
      this._tireBrandCanvas.width = size;
      this._tireBrandCanvas.height = size;
      this._tireBrandCtx = this._tireBrandCanvas.getContext('2d')!;
    }
    const c = this._tireBrandCanvas;
    const g = this._tireBrandCtx!;
    g.fillStyle = '#141416';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = '#26262a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.32, 0, Math.PI * 2);
    g.stroke();
    const text = 'BHOSTED';
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.34;
    g.font = 'bold 40px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e8e8ea';
    // Place each glyph along the arc using its measured width so letters never
    // overlap (the old fixed 0.16-rad step squeezed ~26px glyphs into ~14px of
    // arc at this radius, which made 'BHOSTED' read as one smooshed blob).
    // The whole word is centred on top of the wheel and reads clockwise over
    // the crown, like real sidewall branding.
    const widths = text.split('').map(ch => g.measureText(ch).width * 1.06);
    const totalArc = widths.reduce((a, b) => a + b, 0) / radius;
    let ang = -Math.PI / 2 - totalArc / 2;
    for (let i = 0; i < text.length; i++) {
      const a = ang + widths[i] / (2 * radius);
      g.save();
      g.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
      ang += widths[i] / radius;
    }
    g.font = 'bold 15px Arial, sans-serif';
    g.fillStyle = '#6a6a70';
    g.fillText('GRAND PRIX', cx, cy + 3);
    // Tire wear: a dark translucent pass over the whole sidewall darkens the
    // rubber and dims the brand. Wear tops out at ~42% black so it stays
    // subtle, and it's only re-drawn when the wear bucket changes (see
    // updateTireBrandWear), so per-frame cost stays zero.
    if (wear > 0.01) {
      g.fillStyle = `rgba(5, 6, 8, ${(0.42 * wear).toFixed(3)})`;
      g.fillRect(0, 0, size, size);
    }
    return c;
  }
  private makeTireBrandTex(): WebGLTexture {
    const gl = this.gl;
    const c = this.drawTireBrand(0);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /** Re-bakes the brand texture when race wear crosses a 5% bucket. */
  private updateTireBrandWear() {
    const step = Math.floor(this.tireWear * 20);
    if (step === this._bakedTireWear) return;
    this._bakedTireWear = step;
    if (!this._tireBrandCanvas) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tireBrandTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.drawTireBrand(this.tireWear));
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  private makeTrackMarkingsTex(): WebGLTexture {
    const size = 128;
    const data = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3;
        if (y < 2 || y > size - 3) {
          data[i] = 215; data[i + 1] = 215; data[i + 2] = 212;
        } else if (y > size / 2 - 2 && y < size / 2 + 2) {
          if (x % 24 < 10) { data[i] = 205; data[i + 1] = 205; data[i + 2] = 201; }
          else { data[i] = 62; data[i + 1] = 62; data[i + 2] = 64; }
        } else {
          const n = 56;
          data[i] = n; data[i + 1] = n; data[i + 2] = n + 2;
        }
      }
    }
    return this.makeTex(size, size, data);
  }
  /**
   * Soft spotlight-pool mask for the neon underglow. A circle in UV space that
   * becomes an ellipse once stretched over the non-square glow quad, with a
   * quartic (1-t²)² falloff that reaches exactly zero at ~55% of the quad — so
   * the glow reads as an oval pool fading at the edges instead of a hard
   * rectangle. rgb = alpha (white mask) so additive blending fades colour with
   * the shape, while alpha carries the falloff for the garage contact shadow.
   */
  private makeGlowTex(): WebGLTexture {
    const gl = this.gl;
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size - 0.5;
        const dy = (y + 0.5) / size - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) * 2; // 0 centre -> 1 corner
        const t = Math.min(r / 0.55, 1);            // falloff ends inside the quad
        const a = (1 - t * t) * (1 - t * t);
        const v = Math.round(a * 255);
        const i = (y * size + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = v;
      }
    }
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private vsSrc = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec3 aColor;
in vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat4 uLightMatrix;
uniform vec3 uColor;
uniform mat3 uNormalMatrix;
out vec4 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;
out float vDepth;
out vec4 vLightPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  gl_Position = uProj * vp;
  vColor = vec4(aColor * uColor, 1.0);
  vNormal = normalize(uNormalMatrix * aNormal);
  vWorldPos = wp.xyz;
  vDepth = length(vp.xyz);
  vUV = aUV;
  vLightPos = uLightMatrix * wp;
}`;
  private fsSrc = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
in float vDepth;
in vec4 vLightPos;
out vec4 FragColor;
uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform bool uUseVertexColor;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform float uHeatGlow;
uniform float uMetallic;
uniform vec3 uRimTint;
uniform float uRimStrength;
uniform vec3 uEnvTop;
uniform vec3 uEnvBottom;
uniform float uEnvStrength;
uniform float uAlpha;
uniform float uEmissive;
float calcShadow(vec3 sp, float NdotL) {
  if (sp.x < 0.0 || sp.x > 1.0 || sp.y < 0.0 || sp.y > 1.0 || sp.z < 0.0 || sp.z > 1.0) return 1.0;
  float bias = max(0.0008, 0.0025 * (1.0 - NdotL));
  float depth = sp.z - bias;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, sp.xy + vec2(float(x), float(y)) * uShadowTexel).r;
      sum += step(depth, d);
    }
  }
  return sum / 9.0;
}
vec3 envColor(vec3 R, float sh) {
  float t = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 grad = mix(uEnvBottom, uEnvTop, pow(t, 0.8));
  float hor = exp(-abs(R.y) * 10.0) * 0.55;
  float sun = pow(max(dot(R, normalize(uLightDir)), 0.0), 700.0) * 3.0 * sh;
  return grad * (0.6 + hor) + sun * uSunColor * 1.6;
}
void main() {
  vec4 base = vColor;
  if (uHasTexture) base *= texture(uTexture, vUV);
  if (!uUseVertexColor) base = vColor;
  base.rgb = mix(base.rgb, base.rgb * uRimTint, uRimStrength);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 L = normalize(uLightDir);
  float NdotL = max(dot(N, L), 0.0);
  float upness = N.y * 0.5 + 0.5;
  vec3 amb = uAmbient * base.rgb * (0.55 + 0.9 * upness);
  float shadow = calcShadow(vLightPos.xyz / vLightPos.w * 0.5 + 0.5, NdotL);
  vec3 diffColor = NdotL * uSunColor * base.rgb * shadow;
  vec3 H = normalize(L + V);
  float gloss = 0.28 + uMetallic * 0.9;
  float soft = pow(max(dot(N, H), 0.0), 12.0);
  float sharp = pow(max(dot(N, H), 0.0), 180.0);
  vec3 specColor = uSunColor * (soft * 0.55 + sharp * 1.7) * gloss * (shadow * 0.85 + 0.15);
  vec3 F = normalize(vec3(-L.x, 0.4, -L.z));
  float fillAmt = max(dot(N, F), 0.0) * (1.0 - smoothstep(0.05, 0.5, NdotL));
  vec3 fillColor = fillAmt * uAmbient * 1.9 * base.rgb;
  vec3 R = reflect(-V, N);
  vec3 refl = envColor(R, shadow) * base.rgb * uEnvStrength;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 rimColor = fres * uSunColor * 0.14;
  vec3 color = amb + diffColor + specColor + fillColor + refl + rimColor;
  color += uEmissive * base.rgb;
  float hh = clamp(uHeatGlow, 0.0, 1.35) / 1.35;
  vec3 heatColor = mix(vec3(0.24, 0.02, 0.0), vec3(1.0, 0.40, 0.06), smoothstep(0.0, 0.5, hh));
  heatColor = mix(heatColor, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.72, hh));
  heatColor = mix(heatColor, vec3(1.0, 0.96, 0.90), smoothstep(0.7, 1.0, hh));
  color += heatColor * hh * 1.15;
  float fog = clamp((vDepth - 80.0) / 400.0, 0.0, 1.0);
  color = mix(color, uFogColor, fog * vColor.a * uAlpha);
  color = clamp(color, 0.0, 1.0);
  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  FragColor = vec4(color, base.a * uAlpha);
}`;
  private initShader() {
    const gl = this.gl;
    this.prog = this.createProgram(this.vsSrc, this.fsSrc);
    gl.useProgram(this.prog);
    this.projLoc = gl.getUniformLocation(this.prog, 'uProj')!;
    this.viewLoc = gl.getUniformLocation(this.prog, 'uView')!;
    this.modelLoc = gl.getUniformLocation(this.prog, 'uModel')!;
    this.colorLoc = gl.getUniformLocation(this.prog, 'uColor')!;
    this.textureLoc = gl.getUniformLocation(this.prog, 'uTexture')!;
    this.hasTexLoc = gl.getUniformLocation(this.prog, 'uHasTexture')!;
    this.lightDirLoc = gl.getUniformLocation(this.prog, 'uLightDir')!;
    this.ambientLoc = gl.getUniformLocation(this.prog, 'uAmbient')!;
    this.fogColorLoc = gl.getUniformLocation(this.prog, 'uFogColor')!;
    this.viewPosLoc = gl.getUniformLocation(this.prog, 'uViewPos')!;
    this.useVertexColor = gl.getUniformLocation(this.prog, 'uUseVertexColor')!;
    this.lightMatrixLoc = gl.getUniformLocation(this.prog, 'uLightMatrix')!;
    this.sunColorLoc = gl.getUniformLocation(this.prog, 'uSunColor')!;
    this.envTopLoc = gl.getUniformLocation(this.prog, 'uEnvTop')!;
    this.envBottomLoc = gl.getUniformLocation(this.prog, 'uEnvBottom')!;
    this.envStrengthLoc = gl.getUniformLocation(this.prog, 'uEnvStrength')!;
    this.shadowMapLoc = gl.getUniformLocation(this.prog, 'uShadowMap')!;
    this.shadowTexelLoc = gl.getUniformLocation(this.prog, 'uShadowTexel')!;
    this.heatGlowLoc = gl.getUniformLocation(this.prog, 'uHeatGlow')!;
    this.metallicLoc = gl.getUniformLocation(this.prog, 'uMetallic')!;
    this.rimTintLoc = gl.getUniformLocation(this.prog, 'uRimTint')!;
    this.rimStrengthLoc = gl.getUniformLocation(this.prog, 'uRimStrength')!;
    this.alphaLoc = gl.getUniformLocation(this.prog, 'uAlpha')!;
    this.emissiveLoc = gl.getUniformLocation(this.prog, 'uEmissive')!;
    gl.uniform1i(this.useVertexColor, 1);
    gl.uniform1f(this.alphaLoc, 1);
    gl.uniform1f(this.heatGlowLoc, 0);
    gl.uniform1f(this.metallicLoc, 0.45);
    gl.uniform3f(this.rimTintLoc, 0.72, 0.72, 0.75);
    gl.uniform1f(this.rimStrengthLoc, 0);
  }
  private createProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const v = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(v, vs); gl.compileShader(v);
    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS)) {
      console.error('VS:', gl.getShaderInfoLog(v));
    }
    const f = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(f, fs); gl.compileShader(f);
    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) {
      console.error('FS:', gl.getShaderInfoLog(f));
    }
    const p = gl.createProgram()!;
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    return p;
  }
  private initShadow() {
    const gl = this.gl;
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([]);
    const dvs = `#version 300 es
in vec3 aPos;
uniform mat4 uLightMatrix;
uniform mat4 uModel;
void main() { gl_Position = uLightMatrix * uModel * vec4(aPos, 1.0); }`;
    const dfs = `#version 300 es
precision highp float;
out vec4 FragColor;
void main() {}`;
    this.shadowProg = this.createProgram(dvs, dfs);
    this.shadowLightLoc = gl.getUniformLocation(this.shadowProg, 'uLightMatrix')!;
    this.shadowModelLoc = gl.getUniformLocation(this.shadowProg, 'uModel')!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  private initSky() {
    const gl = this.gl;
    const svs = `#version 300 es
in vec3 aPos;
out vec3 vDir;
uniform mat4 uProj;
uniform mat4 uView;
void main() {
  vDir = aPos;
  mat4 rv = mat4(mat3(uView));
  vec4 p = uProj * rv * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
    const sfs = `#version 300 es
precision highp float;
in vec3 vDir;
out vec4 FragColor;
uniform vec3 uSunDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunColor;
uniform vec3 uGlowColor;
uniform float uTime;
uniform float uNight;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y * 0.5 + 0.5;
  vec3 upper = mix(uHorizon, uTop, clamp(h * 1.5, 0.0, 1.0));
  vec3 lower = mix(uHorizon, uBottom, clamp(-d.y * 3.0, 0.0, 1.0) * 0.5);
  float skyT = clamp(d.y * 4.0 + 0.5, 0.0, 1.0);
  vec3 sky = mix(lower, upper, skyT);
  float sunDot = dot(d, normalize(uSunDir));
  float sun = pow(max(sunDot, 0.0), 120.0);
  sky += uSunColor * sun * 0.9;
  float sunGlow = pow(max(sunDot, 0.0), 12.0);
  sky += uGlowColor * sunGlow * 0.18;
  if (uNight > 0.5 && d.y > 0.08) {
    vec2 cell = floor(d.xz * 240.0);
    float h1 = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 28001.8384);
    float starv = smoothstep(0.9, 0.98, h1);
    float tw = 0.55 + 0.45 * sin(uTime * 1.6 + h2 * 6.2831);
    sky += vec3(starv * tw * smoothstep(0.08, 0.4, d.y)) * uNight;
  }
  FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}`;
    this.skyProg = this.createProgram(svs, sfs);
    this.skyProjLoc = gl.getUniformLocation(this.skyProg, 'uProj')!;
    this.skyViewLoc = gl.getUniformLocation(this.skyProg, 'uView')!;
    this.skySunDirLoc = gl.getUniformLocation(this.skyProg, 'uSunDir')!;
    this.skyTimeLoc = gl.getUniformLocation(this.skyProg, 'uTime')!;
    this.skyTopLoc = gl.getUniformLocation(this.skyProg, 'uTop')!;
    this.skyHorizonLoc = gl.getUniformLocation(this.skyProg, 'uHorizon')!;
    this.skyBottomLoc = gl.getUniformLocation(this.skyProg, 'uBottom')!;
    this.skySunColorLoc = gl.getUniformLocation(this.skyProg, 'uSunColor')!;
    this.skyGlowColorLoc = gl.getUniformLocation(this.skyProg, 'uGlowColor')!;
    this.skyNightLoc = gl.getUniformLocation(this.skyProg, 'uNight')!;
    const c = 1;
    const verts = new Float32Array([
      -c, -c, c, c, -c, c, c, c, c,
      -c, -c, c, c, c, c, -c, c, c,
      c, -c, -c, -c, -c, -c, -c, c, -c,
      c, -c, -c, -c, c, -c, c, c, -c,
      c, -c, c, c, -c, -c, c, c, -c,
      c, -c, c, c, c, -c, c, c, c,
      -c, -c, -c, -c, -c, c, -c, c, c,
      -c, -c, -c, -c, c, c, -c, c, -c,
      -c, c, c, c, c, c, c, c, -c,
      -c, c, c, c, c, -c, -c, c, -c,
      -c, -c, -c, c, -c, -c, c, -c, c,
      -c, -c, -c, c, -c, c, -c, -c, c,
    ]);
    this.skyVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.skyVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  private initMirror() {
    const gl = this.gl;
    this.mirrorProj = new Float32Array(16);
    this.mirrorView = new Float32Array(16);
    this.mirrorTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.mirrorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.mirrorW, this.mirrorH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.mirrorDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.mirrorDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.mirrorW, this.mirrorH);
    this.mirrorFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mirrorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mirrorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.mirrorDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const mvs = `#version 300 es
in vec2 aPos;
in vec2 aUV;
out vec2 vUV;
void main() { vUV = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }`;
    const mfs = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 FragColor;
uniform sampler2D uTex;
void main() { FragColor = texture(uTex, vUV); }`;
    this.mirrorProg = this.createProgram(mvs, mfs);
    this.mirrorTexLoc = gl.getUniformLocation(this.mirrorProg, 'uTex')!;
    const cw = gl.canvas.width || 1280;
    const ch = gl.canvas.height || 720;
    const qw = Math.min(0.4 * cw, 480);
    const qh = qw * (this.mirrorH / this.mirrorW);
    const nx = qw / cw;
    const ny = qh / ch;
    const topY = 1 - 0.02 - ny;
    const quad = new Float32Array([
      -nx, topY - ny, 0, 0,
      nx, topY - ny, 1, 0,
      -nx, topY + ny, 0, 1,
      nx, topY + ny, 1, 1,
    ]);
    this.mirrorVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.mirrorVao);
    const qb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }
  generateTrack() {
    const segs = this.TRACK_SEGMENTS;
    const pts: TrackPoint[] = [];
    const radius = this.TRACK_LENGTH / (Math.PI * 2);
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const r = radius + Math.sin(t * 3) * 30 + Math.sin(t * 7) * 12 + Math.sin(t * 1.7) * 8;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      const dt = 0.001;
      const tn = t + dt;
      const rn = radius + Math.sin(tn * 3) * 30 + Math.sin(tn * 7) * 12 + Math.sin(tn * 1.7) * 8;
      const dx = Math.cos(tn) * rn - x;
      const dz = Math.sin(tn) * rn - z;
      const len = Math.hypot(dx, dz);
      pts.push({
        x, z,
        dirX: len > 0.001 ? dx / len : 1,
        dirZ: len > 0.001 ? dz / len : 0,
        width: this.TRACK_WIDTH + Math.sin(t * 5) * 1.5,
        isStartFinish: i === 0,
      });
    }
    const smoothPts: TrackPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const pi = pts[(i - 1 + pts.length) % pts.length];
      const ci = pts[i];
      const ni = pts[(i + 1) % pts.length];
      smoothPts.push({
        x: (pi.x + ci.x * 2 + ni.x) / 4,
        z: (pi.z + ci.z * 2 + ni.z) / 4,
        dirX: ci.dirX, dirZ: ci.dirZ,
        width: ci.width,
        isStartFinish: ci.isStartFinish,
      });
    }
    for (let i = 0; i < smoothPts.length; i++) {
      const ni = smoothPts[(i + 1) % smoothPts.length];
      const ci = smoothPts[i];
      const dx = ni.x - ci.x;
      const dz = ni.z - ci.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) { ci.dirX = dx / len; ci.dirZ = dz / len; }
    }
    this._trackPoints = smoothPts;
    this.totalTrackDist = 0;
    for (let i = 0; i < smoothPts.length; i++) {
      const ni = smoothPts[(i + 1) % smoothPts.length];
      this.totalTrackDist += Math.hypot(ni.x - smoothPts[i].x, ni.z - smoothPts[i].z);
    }
    this.trackLen = smoothPts.length;
  }
  getTrackLength(): number { return this.totalTrackDist; }
  /** Downhill-touge grade for the Japan circuit: +1 while dropping into the
   *  valley arc, -1 while climbing back out, 0 elsewhere. Symmetric, so a full
   *  lap nets exactly zero — lap times stay fair for the player and bots. */
  getTrackGrade(dist: number): number {
    if (this.theme !== 'japan') return 0;
    const D = this.totalTrackDist;
    if (D <= 0) return 0;
    const t = (((dist % D) + D) % D) / D;
    const w = 0.3; // valley arc width as a fraction of the lap
    const h = w / 2;
    const x = (t - this._japanValleyFrac + 1) % 1;
    if (x >= w) return 0;
    return x < h ? (1 - x / h) : -(1 - (x - h) / h);
  }
  /** Applies the environment theme for the selected track and rebuilds the
   *  scenery geometry. Call before each race (both solo and multiplayer). */
  setTheme(theme: 'default' | 'miami' | 'city' | 'mountain' | 'alpine' | 'desert' | 'monaco' | 'monaco-night' | 'montreal' | 'italy' | 'japan') {
    this.theme = theme;
    // Fresh tyres every race — reset the wear that darkened the sidewalls.
    this._tireDist = 0;
    this.tireWear = 0;
    this._bakedTireWear = -1;
    this.night = theme === 'monaco-night';
    this.heatShimmer = theme === 'desert';
    this._winnerCelebrated = false;
    this._confettiBurst.length = 0;
    switch (theme) {
      case 'miami':
        this.skyTop = [0.13, 0.32, 0.6];
        this.skyHorizon = [0.95, 0.68, 0.55];
        this.skyBottom = [0.55, 0.62, 0.7];
        this.sunDir = [0.35, 0.55, 0.45];
        this.sunColor = [1.0, 0.85, 0.7];
        this.ambientColor = [0.32, 0.3, 0.34];
        this.fogColor = [0.62, 0.6, 0.63];
        break;
      case 'city':
        this.skyTop = [0.05, 0.08, 0.22];
        this.skyHorizon = [0.45, 0.32, 0.5];
        this.skyBottom = [0.2, 0.22, 0.3];
        this.sunDir = [0.25, 0.45, 0.35];
        this.sunColor = [1.0, 0.8, 0.6];
        this.ambientColor = [0.2, 0.2, 0.26];
        this.fogColor = [0.3, 0.3, 0.38];
        break;
      case 'mountain':
        this.skyTop = [0.08, 0.18, 0.45];
        this.skyHorizon = [0.7, 0.78, 0.88];
        this.skyBottom = [0.45, 0.52, 0.62];
        this.sunDir = [0.4, 0.65, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.28, 0.28, 0.32];
        this.fogColor = [0.45, 0.5, 0.58];
        break;
      case 'alpine':
        this.skyTop = [0.02, 0.05, 0.25];
        this.skyHorizon = [0.75, 0.8, 0.9];
        this.skyBottom = [0.5, 0.55, 0.65];
        this.sunDir = [0.3, 0.6, 0.4];
        this.sunColor = [1.0, 0.98, 0.95];
        this.ambientColor = [0.3, 0.32, 0.38];
        this.fogColor = [0.55, 0.58, 0.65];
        break;
      case 'desert':
        this.skyTop = [0.15, 0.25, 0.5];
        this.skyHorizon = [0.92, 0.78, 0.58];
        this.skyBottom = [0.6, 0.5, 0.35];
        this.sunDir = [0.5, 0.65, 0.55];
        this.sunColor = [1.0, 0.88, 0.65];
        this.ambientColor = [0.35, 0.32, 0.28];
        this.fogColor = [0.58, 0.55, 0.5];
        break;
      case 'monaco':
        this.skyTop = [0.08, 0.25, 0.55];
        this.skyHorizon = [0.7, 0.78, 0.88];
        this.skyBottom = [0.45, 0.55, 0.65];
        this.sunDir = [0.4, 0.7, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.28, 0.3, 0.35];
        this.fogColor = [0.45, 0.5, 0.55];
        break;
      case 'montreal':
        this.skyTop = [0.1, 0.2, 0.45];
        this.skyHorizon = [0.82, 0.72, 0.65];
        this.skyBottom = [0.5, 0.48, 0.52];
        this.sunDir = [0.3, 0.55, 0.45];
        this.sunColor = [1.0, 0.9, 0.75];
        this.ambientColor = [0.28, 0.27, 0.3];
        this.fogColor = [0.48, 0.48, 0.52];
        break;
      case 'italy':
        this.skyTop = [0.06, 0.15, 0.45];
        this.skyHorizon = [0.65, 0.72, 0.82];
        this.skyBottom = [0.4, 0.45, 0.52];
        this.sunDir = [0.45, 0.75, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.25, 0.26, 0.3];
        this.fogColor = [0.4, 0.45, 0.5];
        break;
      case 'monaco-night':
        this.skyTop = [0.004, 0.008, 0.04];
        this.skyHorizon = [0.07, 0.09, 0.15];
        this.skyBottom = [0.03, 0.04, 0.06];
        this.sunDir = [0.38, 0.45, 0.32];
        this.sunColor = [0.5, 0.56, 0.72];
        this.ambientColor = [0.045, 0.055, 0.09];
        this.fogColor = [0.03, 0.04, 0.08];
        break;
      case 'japan':
        // Early-morning mountain pass: pale blue sky, low golden sun through
        // cedar mist, hazy valley air.
        this.skyTop = [0.12, 0.26, 0.48];
        this.skyHorizon = [0.88, 0.83, 0.74];
        this.skyBottom = [0.55, 0.62, 0.6];
        this.sunDir = [0.5, 0.38, 0.45];
        this.sunColor = [1.0, 0.92, 0.78];
        this.ambientColor = [0.3, 0.32, 0.32];
        this.fogColor = [0.55, 0.58, 0.6];
        break;
      default:
        this.skyTop = [0.1, 0.2, 0.5];
        this.skyHorizon = [0.7, 0.75, 0.85];
        this.skyBottom = [0.4, 0.45, 0.5];
        this.sunDir = [0.4, 0.7, 0.5];
        this.sunColor = [1.0, 0.95, 0.85];
        this.ambientColor = [0.25, 0.25, 0.3];
        this.fogColor = [0.4, 0.45, 0.5];
        break;
    }
    this._scrubColor = theme === 'desert' ? [0.11, 0.105, 0.1] : theme === 'miami' ? [0.028, 0.026, 0.024] : [0.05, 0.045, 0.04];
    this.buildScenery();
  }
  getTrackPointAlong(dist: number): TrackPoint {
    const t = ((dist % this.totalTrackDist) / this.totalTrackDist) * this.trackLen;
    const idx = Math.floor(t) % this.trackLen;
    const frac = t - Math.floor(t);
    const pi = this._trackPoints[idx];
    const ni = this._trackPoints[(idx + 1) % this.trackLen];
    if (!pi || !ni) return this._trackPoints[0] || { x: 0, z: 0, dirX: 1, dirZ: 0, width: 16 };
    return {
      x: pi.x + (ni.x - pi.x) * frac,
      z: pi.z + (ni.z - pi.z) * frac,
      dirX: pi.dirX + (ni.dirX - pi.dirX) * frac,
      dirZ: pi.dirZ + (ni.dirZ - pi.dirZ) * frac,
      width: (pi.width + ni.width) / 2,
    };
  }
  getDistFromPoint(wx: number, wz: number): number {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < this._trackPoints.length; i++) {
      const p = this._trackPoints[i];
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const p = this._trackPoints[bestIdx];
    const n = this._trackPoints[(bestIdx + 1) % this._trackPoints.length];
    const ax = wx - p.x, az = wz - p.z;
    const sx = n.x - p.x, sz = n.z - p.z;
    const segLenSq = sx * sx + sz * sz;
    let t = segLenSq > 0.0001 ? (ax * sx + az * sz) / segLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    return ((bestIdx + t) / this.trackLen) * this.totalTrackDist;
  }
  private getTrackLateralInfo(wx: number, wz: number): { lateral: number; width: number } {
    if (!this._trackPoints.length) return { lateral: 0, width: 16 };
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < this._trackPoints.length; i++) {
      const p = this._trackPoints[i];
      const d = (p.x - wx) * (p.x - wx) + (p.z - wz) * (p.z - wz);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const p = this._trackPoints[bestIdx];
    const n = this._trackPoints[(bestIdx + 1) % this._trackPoints.length];
    const sx = n.x - p.x, sz = n.z - p.z;
    const segLenSq = sx * sx + sz * sz;
    let t = segLenSq > 0.0001 ? ((wx - p.x) * sx + (wz - p.z) * sz) / segLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = p.x + sx * t, pz = p.z + sz * t;
    const segLen = Math.sqrt(segLenSq) || 1;
    return {
      lateral: (sx * (wz - pz) - sz * (wx - px)) / segLen,
      width: (p.width + n.width) / 2,
    };
  }
  private buildCornerSigns(pts: TrackPoint[], barVerts: number[], barIdxs: number[]) {
    const N = pts.length;
    if (N < 8) return;
    const theta: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      theta.push(Math.atan2(a.dirX * b.dirZ - a.dirZ * b.dirX, a.dirX * b.dirX + a.dirZ * b.dirZ));
      totalLen += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const avgSeg = totalLen / N;
    const win = Math.max(3, Math.min(12, Math.round(this.SIGN_TURN_WINDOW / avgSeg)));
    const turn: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < win; j++) s += theta[(i - j + N) % N];
      turn[i] = s;
    }
    const sep = Math.max(4, Math.round(win * 1.5));
    const order = Array.from({ length: N }, (_, i) => i)
      .sort((x, y) => Math.abs(turn[y]) - Math.abs(turn[x]));
    const apexes: number[] = [];
    for (const i of order) {
      if (Math.abs(turn[i]) < this.SIGN_TURN_MIN) break;
      if (apexes.some(a => {
        const d = Math.abs(a - i);
        return Math.min(d, N - d) < sep;
      })) continue;
      apexes.push(i);
    }
    const approachSegs = Math.max(2, Math.round(this.SIGN_APPROACH_DIST / avgSeg));
    for (const i of apexes) {
      const dir = turn[i] > 0 ? 1 : -1;
      this.addCornerSign(pts, i, dir, barVerts, barIdxs);
      this.addCornerSign(pts, (i - approachSegs + N) % N, dir, barVerts, barIdxs);
    }
  }
  private addCornerSign(pts: TrackPoint[], idx: number, turnDir: number, barVerts: number[], barIdxs: number[]) {
    const pt = pts[idx];
    const hx = pt.dirX, hz = pt.dirZ;
    const px = -pt.dirZ, pz = pt.dirX;
    const halfW = this.SIGN_BOARD_W / 2;
    const off = pt.width / 2 + 1.8 + this.SIGN_OFFSET_CLEAR;
    const bottom = this.SIGN_BOTTOM_Y;
    const top = bottom + this.SIGN_BOARD_H;
    const mid = (bottom + top) / 2;
    // Classic racing-yellow direction board: black frame, yellow face, black
    // arrow that points across the track into the corner (headDir picks the
    // sign so both roadside boards show the same turn direction to the driver).
    const RIM: [number, number, number] = [0.05, 0.05, 0.05];
    const FACE: [number, number, number] = [0.97, 0.8, 0.05];
    const INK: [number, number, number] = [0.05, 0.05, 0.05];
    const POST: [number, number, number] = [0.14, 0.14, 0.14];
    for (const sideCode of [1, -1]) {
      const sx = px * sideCode, sz = pz * sideCode;
      const cx = pt.x + sx * off;
      const cz = pt.z + sz * off;
      const nx = -sx, nz = -sz;
      const headDir = turnDir * sideCode;
      const base = barVerts.length / 11;
      const V = (u: number, v: number, e: number, r: number, g: number, b: number) => {
        barVerts.push(cx + u * hx + nx * e, v, cz + u * hz + nz * e, nx, 0, nz, r, g, b, 0, 0);
      };
      const quad = (b00: number, b01: number, b10: number, b11: number) => {
        barIdxs.push(b00, b01, b10);
        barIdxs.push(b01, b11, b10);
      };
      // Support post down to the ground so the board reads as a sign post.
      const p1 = base;
      const postHalf = 0.09;
      V(-postHalf, 0, -0.01, ...POST);
      V(postHalf, 0, -0.01, ...POST);
      V(-postHalf, bottom, -0.01, ...POST);
      V(postHalf, bottom, -0.01, ...POST);
      quad(p1, p1 + 1, p1 + 2, p1 + 3);
      // Black border frame.
      const b1 = base + 4;
      V(-halfW - 0.14, bottom - 0.14, -0.01, ...RIM);
      V(halfW + 0.14, bottom - 0.14, -0.01, ...RIM);
      V(-halfW - 0.14, top + 0.14, -0.01, ...RIM);
      V(halfW + 0.14, top + 0.14, -0.01, ...RIM);
      quad(b1, b1 + 1, b1 + 2, b1 + 3);
      // Yellow face.
      const b2 = base + 8;
      V(-halfW, bottom, 0.01, ...FACE);
      V(halfW, bottom, 0.01, ...FACE);
      V(-halfW, top, 0.01, ...FACE);
      V(halfW, top, 0.01, ...FACE);
      quad(b2, b2 + 1, b2 + 2, b2 + 3);
      // Black arrowhead pointing into the corner.
      const b3 = base + 12;
      const headBaseU = headDir * halfW * 0.34;
      const headHalf = this.SIGN_BOARD_H * 0.3;
      V(headDir * (halfW - 0.2), mid, 0.03, ...INK);
      V(headBaseU, mid - headHalf, 0.03, ...INK);
      V(headBaseU, mid + headHalf, 0.03, ...INK);
      barIdxs.push(b3, b3 + 1, b3 + 2);
      // Black arrow shaft.
      const b4 = base + 15;
      const shaftEndU = -headDir * halfW * 0.48;
      const sh = this.SIGN_BOARD_H * 0.26;
      V(headBaseU, mid - sh, 0.03, ...INK);
      V(shaftEndU, mid - sh, 0.03, ...INK);
      V(headBaseU, mid + sh, 0.03, ...INK);
      V(shaftEndU, mid + sh, 0.03, ...INK);
      quad(b4, b4 + 1, b4 + 2, b4 + 3);
    }
  }
  private buildTrackMesh() {
    const pts = this._trackPoints;
    const gl = this.gl;
    const verts: number[] = [];
    const idxs: number[] = [];
    const barVerts: number[] = [];
    const barIdxs: number[] = [];
    const perSegVerts = 6;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const npx = -n.dirZ;
      const npz = n.dirX;
      const hw = p.width / 2;
      const hwN = n.width / 2;
      const segDist = i / pts.length;
      verts.push(p.x + ppx * hw, 0, p.z + ppz * hw, 0, 1, 0, 1, 1, 1, segDist * 4, 0);
      verts.push(n.x + npx * hwN, 0, n.z + npz * hwN, 0, 1, 0, 1, 1, 1, (segDist + 1 / pts.length) * 4, 0);
      verts.push(p.x, 0, p.z, 0, 1, 0, 1, 1, 1, segDist * 4, 0.5);
      verts.push(n.x, 0, n.z, 0, 1, 0, 1, 1, 1, (segDist + 1 / pts.length) * 4, 0.5);
      verts.push(p.x - ppx * hw, 0, p.z - ppz * hw, 0, 1, 0, 1, 1, 1, segDist * 4, 1);
      verts.push(n.x - npx * hwN, 0, n.z - npz * hwN, 0, 1, 0, 1, 1, 1, (segDist + 1 / pts.length) * 4, 1);
      const vi = i * perSegVerts;
      idxs.push(vi, vi + 1, vi + 2);
      idxs.push(vi + 2, vi + 1, vi + 3);
      idxs.push(vi + 2, vi + 3, vi + 5);
      idxs.push(vi + 2, vi + 5, vi + 4);
      const shoulderW = 20;
      const su = 0.3 + segDist * 0.4;
      const suN = 0.3 + (segDist + 1 / pts.length) * 0.4;
      const gr = 0.55, gg = 1.7, gb = 0.4;
      verts.push(p.x + ppx * hw, -0.2, p.z + ppz * hw, 0, 1, 0, gr, gg, gb, su, 0.25);
      verts.push(n.x + npx * hwN, -0.2, n.z + npz * hwN, 0, 1, 0, gr, gg, gb, suN, 0.25);
      verts.push(p.x + ppx * (hw + shoulderW), -0.2, p.z + ppz * (hw + shoulderW), 0, 1, 0, gr, gg, gb, su, 0.25);
      verts.push(n.x + npx * (hwN + shoulderW), -0.2, n.z + npz * (hwN + shoulderW), 0, 1, 0, gr, gg, gb, suN, 0.25);
      verts.push(p.x - ppx * hw, -0.2, p.z - ppz * hw, 0, 1, 0, gr, gg, gb, su, 0.75);
      verts.push(n.x - npx * hwN, -0.2, n.z - npz * hwN, 0, 1, 0, gr, gg, gb, suN, 0.75);
      verts.push(p.x - ppx * (hw + shoulderW), -0.2, p.z - ppz * (hw + shoulderW), 0, 1, 0, gr, gg, gb, su, 0.75);
      verts.push(n.x - npx * (hwN + shoulderW), -0.2, n.z - npz * (hwN + shoulderW), 0, 1, 0, gr, gg, gb, suN, 0.75);
      const si = pts.length * perSegVerts + i * 8;
      idxs.push(si, si + 1, si + 2);
      idxs.push(si + 2, si + 1, si + 3);
      idxs.push(si + 4, si + 5, si + 6);
      idxs.push(si + 6, si + 5, si + 7);
      const barrierH = 0.85;
      const bw = hw + 1.5;
      const bwN = hwN + 1.5;
      const striped = Math.floor(i / 4) % 2 === 0;
      const br = striped ? 0.95 : 0.8;
      const bg = striped ? 0.95 : 0.1;
      const bb = striped ? 0.95 : 0.08;
      const lb = barVerts.length / 11;
      barVerts.push(p.x + ppx * bw, 0, p.z + ppz * bw, ppx, 0, ppz, br, bg, bb, 0, 0);
      barVerts.push(n.x + npx * bwN, 0, n.z + npz * bwN, npx, 0, npz, br, bg, bb, 1, 0);
      barVerts.push(p.x + ppx * bw, barrierH, p.z + ppz * bw, ppx, 0, ppz, br, bg, bb, 0, 1);
      barVerts.push(n.x + npx * bwN, barrierH, n.z + npz * bwN, npx, 0, npz, br, bg, bb, 1, 1);
      barIdxs.push(lb, lb + 1, lb + 2);
      barIdxs.push(lb + 1, lb + 3, lb + 2);
      const rb = barVerts.length / 11;
      barVerts.push(p.x - ppx * bw, 0, p.z - ppz * bw, -ppx, 0, -ppz, br, bg, bb, 0, 0);
      barVerts.push(n.x - npx * bwN, 0, n.z - npz * bwN, -npx, 0, -npz, br, bg, bb, 1, 0);
      barVerts.push(p.x - ppx * bw, barrierH, p.z - ppz * bw, -ppx, 0, -ppz, br, bg, bb, 0, 1);
      barVerts.push(n.x - npx * bwN, barrierH, n.z - npz * bwN, -npx, 0, -npz, br, bg, bb, 1, 1);
      barIdxs.push(rb, rb + 2, rb + 1);
      barIdxs.push(rb + 1, rb + 2, rb + 3);
      const curbTop = 0.02;
      const addCurb = (side: 1 | -1, checker: boolean) => {
        const cRed = checker ? 0.93 : 0.85;
        const cGrn = checker ? 0.93 : 0.08;
        const cBlu = checker ? 0.93 : 0.08;
        const dirX = side === 1 ? ppx : -ppx;
        const dirZ = side === 1 ? ppz : -ppz;
        const ci = barVerts.length / 11;
        barVerts.push(p.x + dirX * hw, curbTop, p.z + dirZ * hw, 0, 1, 0, cRed, cGrn, cBlu, 0, 0);
        barVerts.push(n.x + dirX * hwN, curbTop, n.z + dirZ * hwN, 0, 1, 0, cRed, cGrn, cBlu, 1, 0);
        barVerts.push(p.x + dirX * bw, curbTop, p.z + dirZ * bw, 0, 1, 0, cRed, cGrn, cBlu, 0, 1);
        barVerts.push(n.x + dirX * bwN, curbTop, n.z + dirZ * bwN, 0, 1, 0, cRed, cGrn, cBlu, 1, 1);
        barIdxs.push(ci, ci + 2, ci + 1);
        barIdxs.push(ci + 1, ci + 2, ci + 3);
      };
      addCurb(1, i % 2 === 0);
      addCurb(-1, i % 2 === 1);
      const tcr = striped ? 0.8 : 0.65;
      const tcg = striped ? 0.8 : 0.08;
      const tcb = striped ? 0.8 : 0.06;
      const capW = 0.3;
      const tc = barVerts.length / 11;
      barVerts.push(p.x + ppx * bw, barrierH, p.z + ppz * bw, 0, 1, 0, tcr, tcg, tcb, 0, 0);
      barVerts.push(n.x + npx * bwN, barrierH, n.z + npz * bwN, 0, 1, 0, tcr, tcg, tcb, 1, 0);
      barVerts.push(p.x + ppx * (bw + capW), barrierH, p.z + ppz * (bw + capW), 0, 1, 0, tcr, tcg, tcb, 0, 1);
      barVerts.push(n.x + npx * (bwN + capW), barrierH, n.z + npz * (bwN + capW), 0, 1, 0, tcr, tcg, tcb, 1, 1);
      barIdxs.push(tc, tc + 1, tc + 2);
      barIdxs.push(tc + 1, tc + 3, tc + 2);
      const tr = barVerts.length / 11;
      barVerts.push(p.x - ppx * bw, barrierH, p.z - ppz * bw, 0, 1, 0, tcr, tcg, tcb, 0, 0);
      barVerts.push(n.x - npx * bwN, barrierH, n.z - npz * bwN, 0, 1, 0, tcr, tcg, tcb, 1, 0);
      barVerts.push(p.x - ppx * (bw + capW), barrierH, p.z - ppz * (bw + capW), 0, 1, 0, tcr, tcg, tcb, 0, 1);
      barVerts.push(n.x - npx * (bwN + capW), barrierH, n.z - npz * (bwN + capW), 0, 1, 0, tcr, tcg, tcb, 1, 1);
      barIdxs.push(tr, tr + 1, tr + 2);
      barIdxs.push(tr + 1, tr + 3, tr + 2);
      if (i % 15 === 0) {
        const boardColors: [number, number, number][] = [
          [0.9, 0.1, 0.1], [0.1, 0.5, 0.9], [0.95, 0.85, 0.1], [0.1, 0.8, 0.3],
        ];
        const bc = boardColors[Math.floor(i / 15) % boardColors.length];
        const boardY = barrierH + 0.5;
        const bTop = barVerts.length / 11;
        barVerts.push(p.x + ppx * (bw + capW), barrierH, p.z + ppz * (bw + capW), 0, 1, 0, ...bc, 0, 0);
        barVerts.push(n.x + npx * (bwN + capW), barrierH, n.z + npz * (bwN + capW), 0, 1, 0, ...bc, 1, 0);
        barVerts.push(p.x + ppx * (bw + capW), boardY, p.z + ppz * (bw + capW), 0, 1, 0, ...bc, 0, 1);
        barVerts.push(n.x + npx * (bwN + capW), boardY, n.z + npz * (bwN + capW), 0, 1, 0, ...bc, 1, 1);
        barIdxs.push(bTop, bTop + 1, bTop + 2);
        barIdxs.push(bTop + 1, bTop + 3, bTop + 2);
      }
    }
    this.buildCornerSigns(pts, barVerts, barIdxs);
    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this.trackCount = idxArray.length;
    this.trackVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.trackVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    const barArray = new Float32Array(barVerts);
    const barIdxArray = new Uint16Array(barIdxs);
    this.barrierCount = barIdxArray.length;
    this.barrierVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.barrierVao);
    const bvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bvbo);
    gl.bufferData(gl.ARRAY_BUFFER, barArray, gl.STATIC_DRAW);
    const bibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, barIdxArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.buildFinishLine();
  }
  private buildFinishLine() {
    const gl = this.gl;
    const p = this._trackPoints[0];
    const n = this._trackPoints[1];
    const ppx = -p.dirZ;
    const ppz = p.dirX;
    const hw = p.width / 2;
    const segLen = Math.hypot(n.x - p.x, n.z - p.z) || 1;
    const nx = (n.x - p.x) / segLen;
    const nz = (n.z - p.z) / segLen;
    // Longer, forward-biased band so the checker line reads clearly ahead of
    // the parked car during the countdown instead of being hidden under it.
    // Back edge stays at -4.5 so the first grid slots (-5..) sit behind the line.
    const bandLen = Math.min(13, segLen * 3.5);
    const bandStart = -4.5;
    const verts: number[] = [];
    const idxs: number[] = [];
    const cols = 12, rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const white = (r + c) % 2 === 0;
        const col = white ? 1.0 : 0.07;
        const f0 = bandStart + (r / rows) * bandLen;
        const f1 = bandStart + ((r + 1) / rows) * bandLen;
        const x0 = p.x + ppx * (c / cols * 2 - 1) * hw + nx * f0;
        const z0 = p.z + ppz * (c / cols * 2 - 1) * hw + nz * f0;
        const x1 = p.x + ppx * ((c + 1) / cols * 2 - 1) * hw + nx * f0;
        const z1 = p.z + ppz * ((c + 1) / cols * 2 - 1) * hw + nz * f0;
        const x2 = p.x + ppx * ((c + 1) / cols * 2 - 1) * hw + nx * f1;
        const z2 = p.z + ppz * ((c + 1) / cols * 2 - 1) * hw + nz * f1;
        const x3 = p.x + ppx * (c / cols * 2 - 1) * hw + nx * f1;
        const z3 = p.z + ppz * (c / cols * 2 - 1) * hw + nz * f1;
        const b = verts.length / 11;
        verts.push(x0, 0.02, z0, 0, 1, 0, col, col, col, 0, 0);
        verts.push(x1, 0.02, z1, 0, 1, 0, col, col, col, 0, 0);
        verts.push(x2, 0.02, z2, 0, 1, 0, col, col, col, 0, 0);
        verts.push(x3, 0.02, z3, 0, 1, 0, col, col, col, 0, 0);
        idxs.push(b, b + 1, b + 2);
        idxs.push(b, b + 2, b + 3);
      }
    }
    const fArray = new Float32Array(verts);
    const fIdxArray = new Uint16Array(idxs);
    this.finishCount = fIdxArray.length;
    this.finishVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.finishVao);
    const fvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fvbo);
    gl.bufferData(gl.ARRAY_BUFFER, fArray, gl.STATIC_DRAW);
    const fibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fIdxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  private initOasisFx() {
    if (this._frondVao) return;
    const gl = this.gl;
    const mk = () => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
      gl.bindVertexArray(null);
      return { vao, buf };
    };
    const f = mk(); this._frondVao = f.vao; this._frondBuf = f.buf;
    const w = mk(); this._waterVao = w.vao; this._waterBuf = w.buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._frondBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 220 * 7 * 6 * 11 * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._waterBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 600 * 11 * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  private drawPalmFronds(eye: number[]) {
    const crowns = this._palmCrowns;
    if (!crowns.length) return;
    const gl = this.gl;
    this.initOasisFx();
    const t = this.elapsed;
    const verts: number[] = [];
    const idxs: number[] = [];
    const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const frondCol = [0.06, 0.42, 0.1] as [number, number, number];
    const maxVerts = 220 * 7 * 6;
    let used = 0;
    for (const c of crowns) {
      if (used >= maxVerts) break;
      const ddx = c.x - eye[0], ddz = c.z - eye[2];
      if (ddx * ddx + ddz * ddz > 450 * 450) continue;
      const sway = Math.sin(t * 0.9 + c.phase) * 0.18 + Math.sin(t * 0.4 + c.phase * 1.7) * 0.07;
      const droop = Math.abs(Math.sin(t * 0.8 + c.phase * 1.3)) * 0.14;
      for (let f = 0; f < 7; f++) {
        if (used >= maxVerts) break;
        const a = (f / 7) * Math.PI * 2 + c.lean * 0.3 + sway;
        const len = (1.6 + rnd(c.phase * 13 + f * 7) * 0.5) * c.s;
        const ex = c.x + Math.cos(a) * len;
        const ez = c.z + Math.sin(a) * len;
        const ey = c.y + 0.2 - rnd(c.phase * 29 + f * 3) * 0.7 - droop * 0.5;
        this.addQuad(verts, idxs,
          [c.x, c.y, c.z], [ex, ey, ez],
          [c.x + Math.cos(a) * len * 0.95, ey - 0.15, c.z + Math.sin(a) * len * 0.95],
          [c.x + Math.cos(a) * 0.3, c.y - 0.15, c.z + Math.sin(a) * 0.3],
          frondCol);
        used += 6;
      }
    }
    if (!idxs.length) return;
    const tri: number[] = [];
    for (const i of idxs) {
      const o = i * 11;
      tri.push(verts[o], verts[o + 1], verts[o + 2], verts[o + 3], verts[o + 4], verts[o + 5],
        verts[o + 6], verts[o + 7], verts[o + 8], verts[o + 9], verts[o + 10]);
    }
    const data = new Float32Array(tri);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._frondBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.useProgram(this.prog);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.bindVertexArray(this._frondVao);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
    gl.bindVertexArray(null);
  }
  private drawOasisWater(eye: number[]) {
    const pools = this._oasisPools;
    if (!pools.length) return;
    const gl = this.gl;
    this.initOasisFx();
    const t = this.elapsed;
    const verts: number[] = [];
    const maxVerts = 4 * 600;
    let used = 0;
    for (const pool of pools) {
      if (used >= maxVerts) break;
      const ddx = pool.x - eye[0], ddz = pool.z - eye[2];
      if (ddx * ddx + ddz * ddz > 260 * 260) continue;
      const cells = 10;
      const half = pool.r;
      const cell = (2 * half) / cells;
      const H = (wx: number, wz: number) => {
        const dxp = wx - pool.x, dzp = wz - pool.z;
        const dist = Math.sqrt(dxp * dxp + dzp * dzp) || 0.001;
        const ripple = Math.sin(dist * 5.5 - t * 3.0 + pool.phase) * 0.035 * Math.exp(-dist * 0.45);
        const wave = Math.sin(wx * 0.8 + t * 1.3) * 0.012 + Math.cos(wz * 1.0 + t * 1.0) * 0.012;
        return Math.max(-0.255, -0.22 + ripple + wave);
      };
      const gh: number[][] = [];
      for (let i = 0; i <= cells; i++) {
        gh.push([]);
        for (let j = 0; j <= cells; j++) {
          gh[i].push(H(pool.x - half + cell * i, pool.z - half + cell * j));
        }
      }
      for (let i = 0; i < cells && used < maxVerts; i++) {
        for (let j = 0; j < cells && used < maxVerts; j++) {
          const corners: number[][] = [];
          for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
            const ci = i + di, cj = j + dj;
            const wx = pool.x - half + cell * ci;
            const wz = pool.z - half + cell * cj;
            const hC = gh[ci][cj];
            const slopeX = (gh[Math.min(cells, ci + 1)][cj] - gh[Math.max(0, ci - 1)][cj]) / (2 * cell);
            const slopeZ = (gh[ci][Math.min(cells, cj + 1)] - gh[ci][Math.max(0, cj - 1)]) / (2 * cell);
            let nx = -slopeX, ny = 1, nz = -slopeZ;
            const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            const wv = Math.max(0, (hC - -0.22) * 4);
            corners.push([wx, hC, wz, nx, ny, nz, 0.11 + 0.06 * wv, 0.46 + 0.08 * wv, 0.44 + 0.07 * wv]);
          }
          const [a, b, c2, d] = corners;
          for (const v of [a, b, c2]) verts.push(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], 0, 0);
          for (const v of [a, c2, d]) verts.push(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], 0, 0);
          used += 6;
        }
      }
    }
    if (!verts.length) return;
    const data = new Float32Array(verts);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._waterBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.useProgram(this.prog);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.bindVertexArray(this._waterVao);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
    gl.bindVertexArray(null);
  }
  private buildScenery() {
    const gl = this.gl;
    if (this.sceneryVao) { try { gl.deleteVertexArray(this.sceneryVao); } catch { } }
    if (this.sceneryVbo) { try { gl.deleteBuffer(this.sceneryVbo); } catch { } }
    if (this.sceneryIbo) { try { gl.deleteBuffer(this.sceneryIbo); } catch { } }
    if (this._cloudVao) { try { gl.deleteVertexArray(this._cloudVao); } catch { } }
    if (this._cloudVbo) { try { gl.deleteBuffer(this._cloudVbo); } catch { } }
    if (this._cloudIbo) { try { gl.deleteBuffer(this._cloudIbo); } catch { } }
    this._cloudCount = 0;
    this._clouds = [];
    this._cloudRanges = [];
    if (this._birdsVao) { try { gl.deleteVertexArray(this._birdsVao); } catch { } }
    if (this._animalsVao) { try { gl.deleteVertexArray(this._animalsVao); } catch { } }
    if (this._animalsBuf) { try { gl.deleteBuffer(this._animalsBuf); } catch { } }
    this._marmotWhistles = 0;
    if (this._birdsBuf) { try { gl.deleteBuffer(this._birdsBuf); } catch { } }
    if (this._balloonVao) { try { gl.deleteVertexArray(this._balloonVao); } catch { } }
    if (this._balloonVbo) { try { gl.deleteBuffer(this._balloonVbo); } catch { } }
    if (this._balloonIbo) { try { gl.deleteBuffer(this._balloonIbo); } catch { } }
    if (this._windVao) { try { gl.deleteVertexArray(this._windVao); } catch { } }
    if (this._windBuf) { try { gl.deleteBuffer(this._windBuf); } catch { } }
    if (this._windSmokeVao) { try { gl.deleteVertexArray(this._windSmokeVao); } catch { } }
    if (this._windSmokeBuf) { try { gl.deleteBuffer(this._windSmokeBuf); } catch { } }
    if (this._crowdVao) { try { gl.deleteVertexArray(this._crowdVao); } catch { } }
    if (this._crowdBuf) { try { gl.deleteBuffer(this._crowdBuf); } catch { } }
    if (this._flagVao) { try { gl.deleteVertexArray(this._flagVao); } catch { } }
    if (this._flagBuf) { try { gl.deleteBuffer(this._flagBuf); } catch { } }
    if (this._confettiVao) { try { gl.deleteVertexArray(this._confettiVao); } catch { } }
    if (this._confettiBuf) { try { gl.deleteBuffer(this._confettiBuf); } catch { } }
    if (this.nightVao) { try { gl.deleteVertexArray(this.nightVao); } catch { } }
    this.nightCount = 0;
    this._winTrailStartedAt = -1;
    this._crowdPeople = [];
    this._flags = [];
    this._palmCrowns.length = 0;
    this._oasisPools.length = 0;
    this._desertPerchSpots = [];
    const pts = this._trackPoints;
    const verts: number[] = [];
    const idxs: number[] = [];
    if (this.theme === 'miami') {
      this.addOceanPlane(verts, idxs);
      this.addSandBand(verts, idxs);
      this.addMiamiScenery(verts, idxs);
    } else if (this.theme === 'city') {
      this.addCityScenery(verts, idxs);
    } else if (this.theme === 'mountain') {
      this.addMountainScenery(verts, idxs);
    } else if (this.theme === 'alpine') {
      this.addAlpineScenery(verts, idxs);
    } else if (this.theme === 'desert') {
      this.addDesertGround(verts, idxs);
      this.addDesertScenery(verts, idxs);
    } else if (this.theme === 'monaco' || this.theme === 'monaco-night') {
      this.addMonacoScenery(verts, idxs);
    } else if (this.theme === 'montreal') {
      this.addMontrealScenery(verts, idxs);
    } else if (this.theme === 'italy') {
      this.addItalyScenery(verts, idxs);
    } else if (this.theme === 'japan') {
      this.addJapanScenery(verts, idxs);
    } else {
      this.addForestScenery(verts, idxs);
    }
    this.addClouds();
    const gsPositions = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(f => Math.floor(f * pts.length));
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const gx = p.x + ppx * (p.width / 2 + 8);
      const gz = p.z + ppz * (p.width / 2 + 8);
      const wide = gi === 0 || gi === Math.floor(pts.length / 2);
      this.addGrandstand(verts, idxs, gx, gz, p.dirX, p.dirZ, wide ? 5 : 3.5, 3);
    }
    const fenceCrowdShirts: [number, number, number][] = this.crowdShirtsForTheme();
    const fenceSkins: [number, number, number][] = [
      [0.85, 0.65, 0.5], [0.55, 0.36, 0.22], [0.95, 0.82, 0.66], [0.4, 0.26, 0.15],
    ];
    const fenceHairs: [number, number, number][] = [
      [0.1, 0.08, 0.06], [0.55, 0.38, 0.18], [0.9, 0.85, 0.7], [0.18, 0.12, 0.08], [0.3, 0.2, 0.12],
    ];
    for (let i = 0; i < pts.length; i += 16) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = (i / 16) % 2 === 0 ? -1 : 1;
      const baseX = p.x + ppx * (p.width / 2 + 2.8) * side;
      const baseZ = p.z + ppz * (p.width / 2 + 2.8) * side;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let s = 0; s < n; s++) {
        const off = (s - n / 2) * 0.8;
        this._crowdPeople.push({
          x: baseX + ppx * off,
          y: 0,
          z: baseZ + ppz * off,
          shirt: fenceCrowdShirts[Math.floor(Math.random() * fenceCrowdShirts.length)],
          skin: fenceSkins[Math.floor(Math.random() * fenceSkins.length)],
          hair: fenceHairs[Math.floor(Math.random() * fenceHairs.length)],
          pants: [0.12, 0.12, 0.16],
          pose: Math.floor(Math.random() * 3),
          scale: 0.85 + Math.random() * 0.3,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    if (this.theme === 'desert') {
      this.addFestivalCrowd(pts);
    }
    for (let i = 0; i < pts.length; i += 20) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const lx = p.x + ppx * (p.width / 2 + 1) * side;
        const lz = p.z + ppz * (p.width / 2 + 1) * side;
        this.addCylinder(verts, idxs, lx, 0, lz, 0.08, 3, 6, [0.2, 0.2, 0.2]);
        this.addSphere(verts, idxs, lx, 3, lz, 0.15, 6, this.theme === 'miami' ? [1, 0.9, 0.65] : [1, 0.95, 0.7]);
      }
    }
    const sf = pts[0];
    this.addStartGantry(verts, idxs, sf.x, sf.z, sf.dirX, sf.dirZ, sf.width);
    const turns: { i: number; t: number; s: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cross = p0.dirX * p1.dirZ - p0.dirZ * p1.dirX;
      const dot = p0.dirX * p1.dirX + p0.dirZ * p1.dirZ;
      const t = Math.abs(Math.atan2(cross, dot));
      if (t > 0.04) turns.push({ i, t, s: cross > 0 ? -1 : 1 });
    }
    turns.sort((a, b) => b.t - a.t);
    const picked: typeof turns = [];
    for (const c of turns) {
      if (picked.length >= 8) break;
      if (picked.every(p => {
        const d = Math.abs(p.i - c.i);
        return Math.min(d, pts.length - d) > 18;
      })) picked.push(c);
    }
    for (const c of picked) {
      const p = pts[c.i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const ox = ppx * c.s;
      const oz = ppz * c.s;
      this.addTireBarrier(verts, idxs, p.x + ox * (p.width / 2 + 4), p.z + oz * (p.width / 2 + 4), ppx, ppz, 5);
      this.addMarshalPost(verts, idxs, p.x + ox * (p.width / 2 + 2.6), p.z + oz * (p.width / 2 + 2.6), ppx, ppz, c.s);
      for (const back of [5, 10]) {
        const bi = (c.i - back + pts.length) % pts.length;
        const bp = pts[bi];
        const bpx = -bp.dirZ;
        const bpz = bp.dirX;
        const bx = bp.x + bpx * (bp.width / 2 + 1.6) * c.s;
        const bz = bp.z + bpz * (bp.width / 2 + 1.6) * c.s;
        this.addBrakeBoard(verts, idxs, bx, bz, bpx, bpz);
      }
    }
    this.buildFlagBuffers();
    const vertArray = new Float32Array(verts);
    const idxArray = new Uint32Array(idxs);
    this.sceneryCount = idxArray.length;
    this.sceneryVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.sceneryVao);
    this.sceneryVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneryVbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    this.sceneryIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sceneryIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.buildNightGlow();
    this.initSkyObjects();
    this.initConfetti();
  }
  private addForestScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const trunk = [0.3, 0.15, 0.05];
    const greenLight = [0.1, 0.35, 0.06];
    const greenMid = [0.05, 0.28, 0.04];
    const greenDark = [0.03, 0.2, 0.03];
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const dist = p.width / 2 + 22 + Math.random() * 22;
      for (const side of [-1, 1]) {
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const roll = Math.random();
        if (roll < 0.35) {
          const th = 2.0 + Math.random() * 2.5;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.12, th, 6, trunk);
          const cr = 0.7 + Math.random() * 0.8;
          const ch = 1.5 + Math.random() * 1.2;
          this.addCone(verts, idxs, tx, th - 0.2, tz, cr, ch, 10, greenMid);
          this.addCone(verts, idxs, tx, th - 0.2 + ch * 0.4, tz, cr * 0.65, ch * 0.6, 10, greenDark);
          this.addCone(verts, idxs, tx, th - 0.2 + ch * 0.8, tz, cr * 0.25, ch * 0.25, 8, greenLight);
        } else if (roll < 0.65) {
          const th = 0.6 + Math.random() * 0.5;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.1, th, 5, trunk);
          const sr = 0.5 + Math.random() * 0.6;
          this.addSphere(verts, idxs, tx, th + sr * 0.7, tz, sr, 10, greenLight);
          this.addSphere(verts, idxs, tx, th + sr * 0.5, tz, sr * 0.7, 8, greenMid);
        } else {
          const th = 0.8 + Math.random() * 0.5;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.1, th, 5, trunk);
          const bottleDefs = [
            { r: 0.5 + Math.random() * 0.3, h: 0.6 + Math.random() * 0.3, c: greenDark },
            { r: 0.8 + Math.random() * 0.4, h: 0.7 + Math.random() * 0.3, c: greenMid },
            { r: 0.6 + Math.random() * 0.3, h: 0.5 + Math.random() * 0.2, c: greenLight },
          ];
          let y = th - 0.2;
          for (const def of bottleDefs) {
            this.addCone(verts, idxs, tx, y, tz, def.r, def.h, 10, def.c);
            y += def.h * 0.6;
          }
        }
        if (Math.random() < 0.4) {
          const sx = tx + (Math.random() - 0.5) * 1.5;
          const sz = tz + (Math.random() - 0.5) * 1.5;
          this.addSphere(verts, idxs, sx, 0.2, sz, 0.2 + Math.random() * 0.15, 6, greenDark);
        }
        if (treeIdx++ > 200) break;
      }
      if (treeIdx > 200) break;
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 100;
      const dx = pts[0].x + Math.cos(a) * dist;
      const dz = pts[0].z + Math.sin(a) * dist;
      this.addCone(verts, idxs, dx, 0, dz, 0.6 + Math.random() * 0.5, 1.0 + Math.random() * 0.8, 6, greenDark);
    }
  }
  private addMountainScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const rock = [0.32, 0.30, 0.28];
    const rockLight = [0.45, 0.43, 0.40];
    const rockDark = [0.22, 0.20, 0.18];
    const snow = [0.85, 0.88, 0.92];
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    const ridgeColors: number[][] = [[0.38, 0.38, 0.42], [0.42, 0.42, 0.46], [0.46, 0.46, 0.5]];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const mh = 25 + Math.random() * 55;
      const mw = 30 + Math.random() * 40;
      const dist = outer + mw + 30 + Math.random() * 120;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const col = ridgeColors[k % ridgeColors.length];
      this.addCone(verts, idxs, mx, 0, mz, mw, mh, 8, col);
      if (mh > 55) {
        this.addCone(verts, idxs, mx, mh * 0.72, mz, mw * 0.35, mh * 0.28, 6, snow);
      }
    }
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 34 + Math.random() * 24;
        const rx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const rz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        const s = 1.0 + Math.random() * 2.5;
        const roll = Math.random();
        if (roll < 0.4) {
          this.addCone(verts, idxs, rx, 0, rz, s * 1.2, s * 2.4, 8, rockLight);
          if (s > 1.8) {
            this.addCone(verts, idxs, rx, s * 2.0, rz, s * 0.3, s * 0.4, 5, snow);
          }
        } else if (roll < 0.7) {
          this.addCone(verts, idxs, rx, 0, rz, s * 1.8, s * 1.3, 7, rockDark);
        } else {
          this.addCone(verts, idxs, rx, 0, rz, s * 2.0, s * 0.9, 8, rock);
        }
      }
    }
    let pineIdx = 0;
    const pineCap = this.lowQuality ? 55 : 100;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 26 + Math.random() * 20;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        this.addAlpineConifer(verts, idxs, tx, tz, 0.5 + Math.random() * 0.45);
        if (pineIdx++ > pineCap) break;
      }
      if (pineIdx > pineCap) break;
    }
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = outer + 20 + Math.random() * 110;
      const sx = Math.cos(a) * dist;
      const sz = Math.sin(a) * dist;
      this.addSphere(verts, idxs, sx, 0.05, sz, 1.5 + Math.random() * 3.0, 6, snow);
    }
  }
  private addClouds() {
    const gl = this.gl;
    const pts = this._trackPoints;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    let count: number;
    let altMin: number;
    let altMax: number;
    let sizeScale: number;
    switch (this.theme) {
      case 'miami': count = 9; altMin = 40; altMax = 75; sizeScale = 1.0; this._cloudAlpha = 0.6; break;
      case 'mountain':
      case 'alpine': count = 12; altMin = 32; altMax = 52; sizeScale = 1.1; this._cloudAlpha = 0.5; break;
      case 'desert': count = 4; altMin = 110; altMax = 165; sizeScale = 0.55; this._cloudAlpha = 0.4; break;
      case 'city': count = 6; altMin = 55; altMax = 90; sizeScale = 0.8; this._cloudAlpha = 0.55; break;
      case 'monaco':
      case 'monaco-night': count = 6; altMin = 50; altMax = 80; sizeScale = 0.85; this._cloudAlpha = 0.55; break;
      case 'montreal': count = 7; altMin = 48; altMax = 78; sizeScale = 0.9; this._cloudAlpha = 0.6; break;
      case 'italy': count = 7; altMin = 50; altMax = 85; sizeScale = 0.95; this._cloudAlpha = 0.6; break;
      case 'japan': count = 6; altMin = 60; altMax = 100; sizeScale = 1.0; this._cloudAlpha = 0.55; break;
      default: count = 6; altMin = 55; altMax = 90; sizeScale = 1; this._cloudAlpha = 0.6; break;
    }
    const base = this.theme === 'city'
      ? [0.16, 0.17, 0.2]
      : this.theme === 'mountain' || this.theme === 'alpine'
        ? [0.95, 0.96, 0.99]
        : [0.98, 0.98, 1.0];
    const verts: number[] = [];
    const idxs: number[] = [];
    const seg = 9;
    this._cloudCenterX = cx;
    this._cloudCenterZ = cz;
    this._clouds = [];
    this._cloudRanges = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = outer + 30 + Math.random() * 140;
      const px = cx + Math.cos(a) * dist;
      const pz = cz + Math.sin(a) * dist;
      const s0 = idxs.length;
      const py = altMin + Math.random() * (altMax - altMin);
      const r = (9 + Math.random() * 7) * sizeScale;
      const dim = 0.9 + Math.random() * 0.1;
      const col = [base[0] * dim, base[1] * dim, base[2] * dim];
      this.addEllipsoid(verts, idxs, px, py - r * 0.45, pz, r * 1.05, r * 0.5, r * 0.95, seg, col);
      this.addEllipsoid(verts, idxs, px + r * 0.5, py - r * 0.4, pz + r * 0.25, r * 0.7, r * 0.42, r * 0.62, seg, col);
      this.addEllipsoid(verts, idxs, px - r * 0.5, py - r * 0.42, pz - r * 0.2, r * 0.65, r * 0.4, r * 0.58, seg, col);
      this.addEllipsoid(verts, idxs, px, py, pz, r * 0.62, r * 0.6, r * 0.58, seg, col);
      this.addEllipsoid(verts, idxs, px + r * 0.62, py + r * 0.1, pz + r * 0.3, r * 0.45, r * 0.42, r * 0.4, seg, col);
      this.addEllipsoid(verts, idxs, px - r * 0.58, py + r * 0.05, pz - r * 0.35, r * 0.42, r * 0.4, r * 0.38, seg, col);
      this.addEllipsoid(verts, idxs, px + r * 0.2, py + r * 0.52, pz + r * 0.1, r * 0.32, r * 0.3, r * 0.3, seg, col);
      this.addEllipsoid(verts, idxs, px - r * 0.15, py + r * 0.6, pz - r * 0.05, r * 0.24, r * 0.24, r * 0.24, seg, col);
      this._cloudRanges.push({ start: s0, count: idxs.length - s0 });
      this._clouds.push({
        ang: a,
        va: (Math.random() < 0.5 ? 1 : -1) * (0.004 + Math.random() * 0.012),
        radius: dist,
        bx: px,
        bz: pz,
      });
    }
    this._cloudCount = idxs.length;
    if (this._cloudCount === 0) return;
    this._cloudVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._cloudVao);
    this._cloudVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._cloudVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this._cloudIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._cloudIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idxs), gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  private addEllipsoid(verts: number[], idxs: number[], cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segments: number, color: number[]) {
    const [cr, cg, cb] = color;
    const baseIdx = verts.length / 11;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      for (let j = 0; j <= segments; j++) {
        const b = (j / segments) * Math.PI;
        const nx = Math.cos(a) * Math.sin(b);
        const ny = Math.cos(b);
        const nz = Math.sin(a) * Math.sin(b);
        verts.push(cx + nx * rx, cy + ny * ry, cz + nz * rz, nx, ny, nz, cr, cg, cb, i / segments, j / segments);
      }
    }
    const stride = segments + 1;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a0 = baseIdx + i * stride + j;
        const b0 = a0 + 1;
        const c0 = a0 + stride;
        const d0 = c0 + 1;
        idxs.push(a0, b0, c0);
        idxs.push(c0, b0, d0);
      }
    }
  }
  private addCityScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const palette: [number, number, number][] = [
      [0.12, 0.18, 0.32], [0.1, 0.22, 0.28], [0.2, 0.16, 0.3], [0.14, 0.14, 0.38], [0.08, 0.28, 0.34],
      [0.16, 0.12, 0.26], [0.1, 0.16, 0.28], [0.24, 0.2, 0.3], [0.12, 0.24, 0.24], [0.18, 0.18, 0.36],
    ];
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 40 + Math.random() * 26;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const h = 12 + Math.random() * 38;
        const w = 4 + Math.random() * 5;
        const d = 4 + Math.random() * 5;
        const col = palette[Math.floor(Math.random() * palette.length)];
        this.addCityBuilding(verts, idxs, bx, bz, h, w, d, col);
        if (bIdx++ > 40) break;
      }
      if (bIdx > 40) break;
    }
    const overpassEvery = Math.max(10, Math.floor(pts.length / 6));
    for (let k = 0; k < 6; k++) {
      const p = pts[(k * overpassEvery) % pts.length];
      this.addOverpass(verts, idxs, p);
    }
    let rampIdx = 0;
    for (let i = 0; i < pts.length; i += 22) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 62 + Math.random() * 18;
        const rx = p.x + ppx * dist * side;
        const rz = p.z + ppz * dist * side;
        this.addHighwayRamp(verts, idxs, rx, rz, p.dirX, p.dirZ, 26 + Math.random() * 22);
        if (rampIdx++ > 7) break;
      }
      if (rampIdx > 7) break;
    }
    let benchIdx = 0;
    for (let i = 0; i < pts.length; i += 8) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 14 + Math.random() * 8;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 3;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 3;
        this.addBench(verts, idxs, bx, bz, p.dirX, p.dirZ);
        if (benchIdx++ > 34) break;
      }
      if (benchIdx > 34) break;
    }
  }
  private addCityBuilding(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    const roll = Math.random();
    if (roll < 0.22) {
      this.addGlassTower(verts, idxs, bx, bz, h, w, d, col);
    } else if (roll < 0.4) {
      this.addSetbackTower(verts, idxs, bx, bz, h, w, d, col);
    } else if (roll < 0.58) {
      this.addLowRiseBlock(verts, idxs, bx, bz, h * 0.7, w, d, col);
    } else if (roll < 0.72) {
      this.addDomedHall(verts, idxs, bx, bz, h * 0.8, w, d, col);
    } else if (roll < 0.86) {
      this.addWaterTowerRoof(verts, idxs, bx, bz, h * 0.8, w, d, col);
    } else {
      this.addSpire(verts, idxs, bx, bz, h, w, d, col);
    }
  }
  private addGlassTower(verts: number[], idxs: number[], tx: number, tz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, tx, h / 2, tz, w, h, d, col);
    const rows = Math.max(4, Math.floor(h / 4));
    const cols = 2;
    const wn = 0.5;
    for (const sx of [-1, 1]) {
      const zc = tz + sx * (d / 2 + 0.05);
      for (let r = 0; r < rows; r++) {
        const wy = 1 + r * (h - 2) / rows;
        for (let c = 0; c < cols; c++) {
          const xc = tx - w / 2 + 0.8 + c * (w - 1.6) / cols;
          this.addWindowQuad(verts, idxs, xc, wy, zc, wn * 2, wn, 0, sx, [0.95, 0.85, 0.5]);
        }
      }
    }
    for (const sz of [-1, 1]) {
      const xc = tx + sz * (w / 2 + 0.05);
      for (let r = 0; r < rows; r++) {
        const wy = 1 + r * (h - 2) / rows;
        for (let c = 0; c < cols; c++) {
          const zc = tz - d / 2 + 0.8 + c * (d - 1.6) / cols;
          this.addWindowQuad(verts, idxs, xc, wy, zc, wn * 2, wn, sz, 0, [0.95, 0.85, 0.5]);
        }
      }
    }
    this.addCylinder(verts, idxs, tx, h, tz, 0.06, 3, 5, [0.3, 0.3, 0.35]);
    this.addSphere(verts, idxs, tx, h + 3, tz, 0.12, 6, [0.9, 0.15, 0.12]);
  }
  private addSetbackTower(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    const tiers: [number, number][] = [
      [h * 0.55, 1], [h * 0.3, 0.8], [h * 0.18, 0.58],
    ];
    let y = 0;
    for (const [th, scale] of tiers) {
      this.addBox(verts, idxs, bx, y + th / 2, bz, w * scale, th, d * scale, col);
      y += th;
    }
    this.addBox(verts, idxs, bx, y + 0.3, bz, w * 0.42, 0.6, d * 0.42, [0.85, 0.85, 0.9]);
    this.addCone(verts, idxs, bx, y + 0.7, bz, w * 0.16, 1.4, 6, [0.7, 0.7, 0.78]);
  }
  private addLowRiseBlock(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w * 1.4, h, d * 1.4, col);
    this.addBox(verts, idxs, bx, h + 0.35, bz, w * 1.4 + 0.6, 0.7, d * 1.4 + 0.6, [0.75, 0.75, 0.8]);
    for (const ux of [-0.8, 0.8]) {
      this.addBox(verts, idxs, bx + ux, h + 1.4, bz, 0.8, 0.9, 0.8, [0.45, 0.45, 0.5]);
    }
    const rows = Math.max(2, Math.floor(h / 4));
    const cols = 4;
    for (const sx of [-1, 1]) {
      const zc = bz + sx * (d * 1.4 / 2 + 0.05);
      for (let r = 0; r < rows; r++) {
        const wy = 1 + r * (h - 2) / rows;
        for (let c = 0; c < cols; c++) {
          const xc = bx - w * 1.4 / 2 + 1 + c * (w * 1.4 - 2) / cols;
          this.addWindowQuad(verts, idxs, xc, wy, zc, 0.9, 0.6, 0, sx, [0.9, 0.85, 0.6]);
        }
      }
    }
  }
  private addDomedHall(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
    for (let c = 0; c < 4; c++) {
      const cx = bx - w / 2 + (c + 0.5) * (w / 4);
      this.addBox(verts, idxs, cx, h * 0.45, bz - d / 2 - 0.4, 0.4, h * 0.9, 0.4, [0.85, 0.85, 0.9]);
    }
    this.addBox(verts, idxs, bx, h + 0.3, bz, w + 0.8, 0.6, d + 0.8, [0.85, 0.85, 0.9]);
    this.addSphere(verts, idxs, bx, h + 1.5, bz, Math.max(w, d) * 0.5, 6, [0.5, 0.6, 0.7]);
    this.addCylinder(verts, idxs, bx, h + 2.4, bz, 0.06, 1.2, 6, [0.85, 0.85, 0.9]);
  }
  private addWaterTowerRoof(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
    const ty = h + 0.8;
    for (const lx of [-0.9, 0.9]) {
      for (const lz of [-0.9, 0.9]) {
        this.addBox(verts, idxs, bx + lx, ty + 0.5, bz + lz, 0.25, 1, 0.25, [0.45, 0.45, 0.5]);
      }
    }
    this.addCylinder(verts, idxs, bx, ty + 1.2, bz, 1.1, 1.4, 8, [0.55, 0.4, 0.3]);
    this.addCone(verts, idxs, bx, ty + 2.6, bz, 1.15, 0.8, 8, [0.35, 0.3, 0.28]);
  }
  private addSpire(verts: number[], idxs: number[], bx: number, bz: number, h: number, w: number, d: number, col: number[]) {
    this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
    this.addBox(verts, idxs, bx, h + h * 0.3, bz, w * 0.45, h * 0.6, d * 0.45, col);
    this.addCone(verts, idxs, bx, h * 1.9, bz, w * 0.18, h * 0.35, 6, [0.6, 0.6, 0.65]);
  }
  private addOverpass(verts: number[], idxs: number[], p: any) {
    const ppx = -p.dirZ;
    const ppz = p.dirX;
    const deckY = 7;
    const halfSpan = p.width / 2 + 30;
    this.addOrientedBox(verts, idxs, p.x, deckY, p.z, halfSpan * 2, 0.4, 5.5, ppx, ppz, [0.35, 0.37, 0.42]);
    for (const s of [-1, 1]) {
      const ox = p.x + p.dirX * (5.5 / 2 - 0.15) * s;
      const oz = p.z + p.dirZ * (5.5 / 2 - 0.15) * s;
      this.addOrientedBox(verts, idxs, ox, deckY + 0.45, oz, halfSpan * 2, 0.5, 0.25, ppx, ppz, [0.55, 0.55, 0.6]);
    }
    for (const s of [-1, 1]) {
      for (const off of [p.width / 2 + 10, p.width / 2 + 19, p.width / 2 + 28]) {
        const px = p.x + ppx * off * s;
        const pz = p.z + ppz * off * s;
        this.addBox(verts, idxs, px, deckY / 2, pz, 0.9, deckY, 0.9, [0.4, 0.4, 0.45]);
      }
    }
  }
  private addHighwayRamp(verts: number[], idxs: number[], hx: number, hz: number, dirX: number, dirZ: number, len: number) {
    const deckY = 5;
    this.addOrientedBox(verts, idxs, hx, deckY, hz, len, 0.35, 7, dirX, dirZ, [0.35, 0.37, 0.42]);
    for (const s of [-1, 1]) {
      const ox = hx + (-dirZ) * (7 / 2 - 0.12) * s;
      const oz = hz + (dirX) * (7 / 2 - 0.12) * s;
      this.addOrientedBox(verts, idxs, ox, deckY + 0.4, oz, len, 0.45, 0.22, dirX, dirZ, [0.55, 0.55, 0.6]);
    }
    const steps = Math.max(2, Math.floor(len / 8));
    for (let i = 0; i <= steps; i++) {
      const t = -0.5 + (i / steps);
      const px = hx + dirX * len * t;
      const pz = hz + dirZ * len * t;
      for (const s of [-1, 1]) {
        this.addBox(verts, idxs, px + (-dirZ) * 3 * s, deckY / 2, pz + (dirX) * 3 * s, 0.7, deckY, 0.7, [0.4, 0.4, 0.45]);
      }
    }
  }
  private addBench(verts: number[], idxs: number[], bx: number, bz: number, dirX: number, dirZ: number) {
    const wood: [number, number, number] = [0.55, 0.42, 0.28];
    const metal: [number, number, number] = [0.35, 0.37, 0.4];
    const ppx = -dirZ, ppz = dirX;
    this.addOrientedBox(verts, idxs, bx, 0.5, bz, 1.7, 0.08, 0.5, dirX, dirZ, wood);
    this.addOrientedBox(verts, idxs, bx - ppx * 0.1, 0.88, bz - ppz * 0.1, 1.7, 0.55, 0.08, dirX, dirZ, wood);
    for (const s of [-1, 1]) {
      this.addBox(verts, idxs, bx + dirX * 0.7 * s, 0.25, bz + dirZ * 0.7 * s, 0.1, 0.5, 0.4, metal);
    }
  }
  private addOceanPlane(verts: number[], idxs: number[]) {
    const c = 900;
    this.addQuad(verts, idxs,
      [-c, -0.4, -c], [c, -0.4, -c], [c, -0.4, c], [-c, -0.4, c],
      [0.05, 0.5, 0.55]);
  }
  private addSandBand(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ppx = -p.dirZ, ppz = p.dirX;
      const npx = -n.dirZ, npz = n.dirX;
      const inner = p.width / 2 + 18;
      const outer = p.width / 2 + 52;
      for (const side of [-1, 1]) {
        const pIn = [p.x + ppx * inner * side, -0.26, p.z + ppz * inner * side];
        const pOut = [p.x + ppx * outer * side, -0.26, p.z + ppz * outer * side];
        const nIn = [n.x + npx * inner * side, -0.26, n.z + npz * inner * side];
        const nOut = [n.x + npx * outer * side, -0.26, n.z + npz * outer * side];
        this.addGroundQuad(verts, idxs, pIn, nIn, nOut, pOut, [0.85, 0.78, 0.58]);
      }
    }
  }
  private addAlpineScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const dist = p.width / 2 + 22 + Math.random() * 18;
      for (const side of [-1, 1]) {
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        this.addAlpineConifer(verts, idxs, tx, tz, 0.8 + Math.random() * 0.7);
        if (treeIdx++ > (this.lowQuality ? 75 : 140)) break;
      }
      if (treeIdx > (this.lowQuality ? 75 : 140)) break;
    }
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const sx = p.x + ppx * (p.width / 2 + 2) * side;
        const sz = p.z + ppz * (p.width / 2 + 2) * side;
        this.addCone(verts, idxs, sx, 0, sz, 1.2 + Math.random() * 1.0, 0.6 + Math.random() * 0.4, 6, [0.9, 0.92, 0.96]);
      }
    }
    let smIdx = 0;
    for (let i = 0; i < pts.length; i += 24) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = (i / 24) % 2 === 0 ? -1 : 1;
      const dist = p.width / 2 + 20 + Math.random() * 12;
      const smx = p.x + ppx * dist * side + (Math.random() - 0.5) * 4;
      const smz = p.z + ppz * dist * side + (Math.random() - 0.5) * 4;
      this.addSnowman(verts, idxs, smx, smz, 0.8 + Math.random() * 0.5, Math.atan2(ppx * side, ppz * side));
      if (smIdx++ > 14) break;
    }
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const mh = 30 + Math.random() * 60;
      const mw = 40 + Math.random() * 30;
      const dist = outer + mw + 40 + Math.random() * 110;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      this.addCone(verts, idxs, mx, 0, mz, mw, mh, 8, [0.45, 0.5, 0.55]);
      this.addCone(verts, idxs, mx, mh * 0.7, mz, mw * 0.35, mh * 0.3, 6, [0.85, 0.88, 0.95]);
    }
  }
  private addAlpineConifer(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const h = (4 + Math.random() * 7) * s;
    const trunkH = h * 0.1;
    this.addCylinder(verts, idxs, x, 0, z, 0.13 * s, trunkH, 6, [0.35, 0.22, 0.1]);
    const greens: [number, number, number][] = [
      [0.02, 0.16, 0.06], [0.03, 0.2, 0.07], [0.02, 0.13, 0.05],
    ];
    const snow = [0.92, 0.94, 0.98];
    const tiers = this.lowQuality ? 4 : 5 + Math.floor(Math.random() * 2);
    const sideN = this.lowQuality ? 6 : 8;
    const baseR = (0.75 + Math.random() * 0.35) * s;
    let lastTop = trunkH;
    for (let t = 0; t < tiers; t++) {
      const frac = t / tiers;
      const ty = trunkH + frac * h * 0.85;
      const tr = baseR * (1 - frac * 0.82);
      const th = h * (0.22 - frac * 0.1);
      this.addCone(verts, idxs, x, ty, z, tr, th, sideN, greens[t % greens.length]);
      this.addCone(verts, idxs, x, ty + th * 0.72, z, tr * 0.34, th * 0.28, 6, snow);
      lastTop = ty + th;
    }
    this.addCone(verts, idxs, x, lastTop - h * 0.02, z, baseR * 0.12, h * 0.16, 6, snow);
  }
  private addSnowman(verts: number[], idxs: number[], x: number, z: number, s: number, yaw: number) {
    const snow = [0.94, 0.96, 1];
    const coal = [0.1, 0.1, 0.12];
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    this.addSphere(verts, idxs, x, 0.55 * s, z, 0.55 * s, 8, snow);
    this.addSphere(verts, idxs, x, 1.15 * s, z, 0.4 * s, 8, snow);
    this.addSphere(verts, idxs, x, 1.68 * s, z, 0.3 * s, 8, snow);
    const eyeY = 1.74 * s;
    this.addSphere(verts, idxs, x + fx * 0.16 * s, eyeY, z + fz * 0.16 * s, 0.045 * s, 5, coal);
    this.addSphere(verts, idxs, x - fx * 0.16 * s, eyeY, z - fz * 0.16 * s, 0.045 * s, 5, coal);
    this.addCone(verts, idxs, x + fx * 0.28 * s, 1.62 * s, z + fz * 0.28 * s, 0.05 * s, 0.22 * s, 6, [0.95, 0.5, 0.1]);
    for (let b = 0; b < 3; b++) {
      this.addSphere(verts, idxs, x + fx * 0.26 * s, (1.05 + b * 0.13) * s, z + fz * 0.26 * s, 0.045 * s, 5, coal);
    }
    const armY = 1.22 * s;
    const armA = yaw + 1.25;
    const ax = fx * 0.32 * s;
    const az = fz * 0.32 * s;
    this.addOrientedBox(verts, idxs, x + ax + Math.cos(armA) * 0.25 * s, armY, z + az + Math.sin(armA) * 0.25 * s,
      0.5 * s, 0.05 * s, 0.05 * s, Math.cos(armA), Math.sin(armA), [0.42, 0.3, 0.16]);
    this.addOrientedBox(verts, idxs, x - ax + Math.cos(-armA) * 0.25 * s, armY, z - az + Math.sin(-armA) * 0.25 * s,
      0.5 * s, 0.05 * s, 0.05 * s, Math.cos(-armA), Math.sin(-armA), [0.42, 0.3, 0.16]);
    this.addCylinder(verts, idxs, x, 1.98 * s, z, 0.16 * s, 0.28 * s, 8, [0.12, 0.12, 0.14]);
    this.addCylinder(verts, idxs, x, 1.9 * s, z, 0.24 * s, 0.09 * s, 8, [0.12, 0.12, 0.14]);
  }
  private addDesertGround(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ppx = -p.dirZ, ppz = p.dirX;
      const npx = -n.dirZ, npz = n.dirX;
      const inner = p.width / 2 + 16;
      const outer = p.width / 2 + 80;
      for (const side of [-1, 1]) {
        const pIn = [p.x + ppx * inner * side, -0.26, p.z + ppz * inner * side];
        const pOut = [p.x + ppx * outer * side, -0.26, p.z + ppz * outer * side];
        const nIn = [n.x + npx * inner * side, -0.26, n.z + npz * inner * side];
        const nOut = [n.x + npx * outer * side, -0.26, n.z + npz * outer * side];
        this.addGroundQuad(verts, idxs, pIn, nIn, nOut, pOut, [0.85, 0.76, 0.55]);
      }
    }
  }
  private addDesertScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    this._desertPerchSpots = [];
    const sand = [0.82, 0.72, 0.52];
    const sandLight = [0.92, 0.84, 0.62];
    const sandDark = [0.66, 0.56, 0.4];
    const rock = [0.62, 0.45, 0.3];
    const rockDark = [0.45, 0.32, 0.22];
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 24 + Math.random() * 26;
        const dx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const dz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        const s = 4 + Math.random() * 5;
        const h = 1.2 + Math.random() * 1.8;
        const col = Math.random() < 0.5 ? sand : sandLight;
        this.addCone(verts, idxs, dx, -0.15, dz, s, h, 8, col);
        this.addCone(verts, idxs, dx + (Math.random() - 0.5) * s * 1.4, -0.15, dz + (Math.random() - 0.5) * s * 1.4, s * 0.8, h * 0.7, 7, sandDark);
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const dist = outer + 50 + Math.random() * 120;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const s = 16 + Math.random() * 18;
      const h = 4 + Math.random() * 5;
      this.addCone(verts, idxs, mx, -0.15, mz, s, h, 8, sand);
      this.addCone(verts, idxs, mx + s * 0.4, -0.15, mz, s * 0.7, h * 0.8, 7, sandLight);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const dist = outer + 40 + Math.random() * 100;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const s = 10 + Math.random() * 10;
      const h = 8 + Math.random() * 12;
      const roll = Math.random();
      if (roll < 0.45) {
        this.addCone(verts, idxs, mx, 0, mz, s, h, 8, rock);
        this.addBox(verts, idxs, mx, h - 1.5, mz, s * 0.55, 2.2, s * 0.55, rockDark);
        this._desertPerchSpots.push({ x: mx, y: h - 0.25, z: mz });
      } else if (roll < 0.75) {
        this.addCone(verts, idxs, mx, -0.15, mz, s, h, 7, rock);
        this.addCone(verts, idxs, mx + s * 0.35, h * 0.4, mz - s * 0.2, s * 0.6, h * 0.65, 6, rockDark);
      } else {
        this.addCone(verts, idxs, mx, -0.15, mz, s * 0.8, h * 1.3, 7, rockDark);
        this.addCone(verts, idxs, mx, h * 0.85, mz, s * 0.28, h * 0.35, 6, rock);
      }
    }
    for (let i = 0; i < pts.length; i += 9) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 30 + Math.random() * 20;
        const rx = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const rz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        const s = 2 + Math.random() * 3;
        this.addCone(verts, idxs, rx, -0.15, rz, s, s * (1.2 + Math.random() * 1.2), 7, Math.random() < 0.5 ? rock : rockDark);
      }
    }
    for (const oi of [Math.floor(pts.length / 5), Math.floor(pts.length / 2), Math.floor(pts.length * 4 / 5)]) {
      const p = pts[oi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = p.width / 2 + 40 + Math.random() * 14;
      const ox = p.x + ppx * dist * side;
      const oz = p.z + ppz * dist * side;
      const r = 4 + Math.random() * 2;
      this._oasisPools.push({ x: ox, z: oz, r, phase: Math.random() * Math.PI * 2 });
      for (let pi = 0; pi < 6; pi++) {
        const a = (pi / 6) * Math.PI * 2 + Math.random() * 0.6;
        const px = ox + Math.cos(a) * (r + 2.5 + Math.random() * 2);
        const pz = oz + Math.sin(a) * (r + 2.5 + Math.random() * 2);
        this.addPalmTree(verts, idxs, px, pz, 0.9 + Math.random() * 0.5);
      }
      for (let ri = 0; ri < 4; ri++) {
        const a = Math.random() * Math.PI * 2;
        const rx = ox + Math.cos(a) * r * 0.8;
        const rz = oz + Math.sin(a) * r * 0.8;
        this.addCone(verts, idxs, rx, 0, rz, 0.12, 0.5 + Math.random() * 0.4, 5, [0.2, 0.4, 0.15]);
      }
      this.addSphere(verts, idxs, ox + r * 0.6, 0.25, oz + r * 0.4, 0.5, 7, [0.25, 0.5, 0.18]);
    }
    for (const ci of [Math.floor(pts.length / 6), Math.floor(pts.length / 3), Math.floor(pts.length * 2 / 3)]) {
      const p = pts[ci];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = p.width / 2 + 34 + Math.random() * 12;
      const bx = p.x + ppx * dist * side;
      const bz = p.z + ppz * dist * side;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        this.addCamel(verts, idxs, bx + ppx * k * 1.8, bz + ppz * k * 1.8, ppx, ppz, 0.8 + Math.random() * 0.2);
      }
    }
    for (const vi of [Math.floor(pts.length / 7), Math.floor(pts.length * 3 / 7), Math.floor(pts.length * 5 / 7)]) {
      const p = pts[vi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = p.width / 2 + 30 + Math.random() * 12;
      const vx = p.x + ppx * dist * side;
      const vz = p.z + ppz * dist * side;
      const huts = 4 + Math.floor(Math.random() * 3);
      for (let h = 0; h < huts; h++) {
        const hx = vx + (Math.random() - 0.5) * 16;
        const hz = vz + (Math.random() - 0.5) * 16;
        this.addShack(verts, idxs, hx, hz, ppx, ppz, 0.7 + Math.random() * 0.3);
      }
      this.addPalmTree(verts, idxs, vx + 3, vz + 2, 0.8);
      this.addPalmTree(verts, idxs, vx - 3, vz - 2, 0.7);
    }
    let cactusIdx = 0;
    for (let i = 0; i < pts.length; i += 6) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 26 + Math.random() * 20;
        const cx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const cz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        if (Math.random() < 0.65) {
          const ch = 1.2 + Math.random() * 1.4;
          const cCol = [0.16, 0.28, 0.12];
          this.addCylinder(verts, idxs, cx, 0, cz, 0.07, ch, 6, cCol);
          const arms = 1 + Math.floor(Math.random() * 2);
          for (let a = 0; a < arms; a++) {
            const as = a === 0 ? -1 : 1;
            const ay = ch * (0.35 + Math.random() * 0.3);
            this.addCylinder(verts, idxs, cx + as * 0.12, ay, cz, 0.045, 0.3, 5, cCol);
            this.addCylinder(verts, idxs, cx + as * 0.38, ay + 0.12, cz, 0.045, 0.35 + Math.random() * 0.2, 5, cCol);
          }
        } else {
          this.addSphere(verts, idxs, cx, 0.3, cz, 0.3, 8, [0.18, 0.3, 0.13]);
          this.addSphere(verts, idxs, cx, 0.55, cz, 0.14, 6, [0.95, 0.55, 0.3]);
        }
        if (cactusIdx++ > 34) break;
      }
      if (cactusIdx > 34) break;
    }
  }
  private addCamel(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, s: number) {
    const body = [0.75, 0.6, 0.42];
    const dark = [0.5, 0.38, 0.26];
    for (const [lx, lz] of [[0.3, 0.14], [0.3, -0.14], [-0.3, 0.14], [-0.3, -0.14]]) {
      this.addCylinder(verts, idxs, x + lx * s, 0.4 * s, z + lz * s, 0.045 * s, 0.8 * s, 5, dark);
    }
    this.addOrientedBox(verts, idxs, x, 0.9 * s, z, 1.4 * s, 0.5 * s, 0.45 * s, dirX, dirZ, body);
    this.addSphere(verts, idxs, x + dirX * 0.1 * s, 1.25 * s, z + dirZ * 0.1 * s, 0.26 * s, 6, body);
    const nx = x + dirX * 0.6 * s;
    const nz = z + dirZ * 0.6 * s;
    this.addOrientedBox(verts, idxs, nx, 1.25 * s, nz, 0.5 * s, 0.9 * s, 0.16 * s, dirX, dirZ, body);
    this.addSphere(verts, idxs, nx + dirX * 0.35 * s, 1.75 * s, nz + dirZ * 0.35 * s, 0.13 * s, 6, dark);
    this.addCylinder(verts, idxs, x - dirX * 0.62 * s, 1.05 * s, z - dirZ * 0.62 * s, 0.03 * s, 0.3 * s, 4, dark);
  }
  private addShack(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, s: number) {
    const mud = [0.78, 0.64, 0.44];
    const roof = [0.55, 0.42, 0.28];
    const h = 1.3 * s;
    this.addOrientedBox(verts, idxs, x, h / 2, z, 1.6 * s, h, 1.3 * s, dirX, dirZ, mud);
    this.addOrientedBox(verts, idxs, x, h + 0.12 * s, z, 1.8 * s, 0.2 * s, 1.5 * s, dirX, dirZ, roof);
    const px = -dirZ, pz = dirX;
    const fx = x + px * (0.72 * s), fz = z + pz * (0.72 * s);
    this.addQuad(verts, idxs,
      [fx - dirX * 0.2 * s, 0.05, fz - dirZ * 0.2 * s],
      [fx + dirX * 0.2 * s, 0.05, fz + dirZ * 0.2 * s],
      [fx + dirX * 0.2 * s, 0.85 * s, fz + dirZ * 0.2 * s],
      [fx - dirX * 0.2 * s, 0.85 * s, fz - dirZ * 0.2 * s],
      [0.25, 0.18, 0.12]);
  }
  private addMonacoScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    this.addOceanPlane(verts, idxs);
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    const pastels: [number, number, number][] = [
      [0.92, 0.85, 0.72], [0.85, 0.78, 0.68], [0.95, 0.88, 0.78], [0.78, 0.82, 0.88],
      [0.88, 0.82, 0.75], [0.7, 0.75, 0.82], [0.96, 0.9, 0.8], [0.8, 0.72, 0.9],
    ];
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 14 + Math.random() * 18;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        const h = 22 + Math.random() * 34;
        const w = 5 + Math.random() * 4;
        const d = 5 + Math.random() * 4;
        this.addCityBuilding(verts, idxs, bx, bz, h, w, d, pastels[Math.floor(Math.random() * pastels.length)]);
        if (bIdx++ > 90) break;
      }
      if (bIdx > 90) break;
    }
    let oIdx = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 50 + Math.random() * 34;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 12;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 12;
        const h = 34 + Math.random() * 46;
        const w = 6 + Math.random() * 5;
        const d = 6 + Math.random() * 5;
        this.addCityBuilding(verts, idxs, bx, bz, h, w, d, pastels[Math.floor(Math.random() * pastels.length)]);
        if (oIdx++ > 60) break;
      }
      if (oIdx > 60) break;
    }
    for (let k = 0; k < 14; k++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = outer + 25 + Math.random() * 60;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      const n = 3 + Math.floor(Math.random() * 4);
      for (let m = 0; m < n; m++) {
        this.addRivieraHouse(verts, idxs, tx + (Math.random() - 0.5) * 14, tz + (Math.random() - 0.5) * 14,
          Math.random() * Math.PI * 2, 1 + Math.random() * 0.6);
      }
    }
    let shopIdx = 0;
    for (let i = 0; i < pts.length; i += 10) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = (i / 10) % 2 === 0 ? -1 : 1;
      const dist = p.width / 2 + 5 + Math.random() * 4;
      const sx = p.x + ppx * dist * side + (Math.random() - 0.5) * 3;
      const sz = p.z + ppz * dist * side + (Math.random() - 0.5) * 3;
      this.addBoutique(verts, idxs, sx, sz, p.dirX, p.dirZ, 1);
      if (shopIdx++ > 38) break;
    }
    let palmIdx = 0;
    for (let i = 0; i < pts.length; i += 8) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = (i / 8) % 2 === 0 ? -1 : 1;
      const dist = p.width / 2 + 12 + Math.random() * 5;
      const px = p.x + ppx * dist * side + (Math.random() - 0.5) * 4;
      const pz = p.z + ppz * dist * side + (Math.random() - 0.5) * 4;
      this.addPalmTree(verts, idxs, px, pz, 0.9 + Math.random() * 0.5);
      if (palmIdx++ > 44) break;
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 95 + Math.random() * 45;
      const yx = pts[0].x + Math.cos(a) * dist;
      const yz = pts[0].z + Math.sin(a) * dist;
      const yaw = Math.random() * Math.PI * 2;
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      this.addOrientedBox(verts, idxs, yx, 0.15, yz, 2.5, 0.4, 1.0, dx, dz, [0.9, 0.9, 0.95]);
      this.addOrientedBox(verts, idxs, yx, 0.55, yz, 2.0, 0.8, 0.4, dx, dz, [0.8, 0.8, 0.85]);
    }
    this.addExtraBleachers(verts, idxs);
  }
  private addRivieraHouse(verts: number[], idxs: number[], x: number, z: number, yaw: number, s: number) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const wall = [0.95, 0.92, 0.85];
    const roof = [0.75, 0.32, 0.18];
    const h = 1.6 * s;
    this.addOrientedBox(verts, idxs, x, h / 2, z, 1.8 * s, h, 1.4 * s, dx, dz, wall);
    this.addOrientedBox(verts, idxs, x, h + 0.1 * s, z, 2.1 * s, 0.22 * s, 1.7 * s, dx, dz, roof);
    const px = -dz, pz = dx;
    const fx = x + px * (0.72 * s), fz = z + pz * (0.72 * s);
    this.addQuad(verts, idxs,
      [fx - dx * 0.22 * s, 0.05, fz - dz * 0.22 * s],
      [fx + dx * 0.22 * s, 0.05, fz + dz * 0.22 * s],
      [fx + dx * 0.22 * s, 1.0 * s, fz + dz * 0.22 * s],
      [fx - dx * 0.22 * s, 1.0 * s, fz - dz * 0.22 * s],
      [0.3, 0.2, 0.12]);
  }
  private addBoutique(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, s: number) {
    const h = 2.4 * s;
    this.addOrientedBox(verts, idxs, x, h / 2, z, 2.0 * s, h, 1.6 * s, dirX, dirZ, [0.95, 0.9, 0.82]);
    const px = -dirZ, pz = dirX;
    this.addOrientedBox(verts, idxs, x + px * (0.85 * s), h * 0.78, z + pz * (0.85 * s),
      2.0 * s, 0.1 * s, 0.6 * s, dirX, dirZ, [0.85, 0.55, 0.2]);
    const sx = x + px * (0.85 * s), sz = z + pz * (0.85 * s);
    this.addQuad(verts, idxs,
      [sx - dirX * 0.3 * s, h * 0.92, sz - dirZ * 0.3 * s],
      [sx + dirX * 0.3 * s, h * 0.92, sz + dirZ * 0.3 * s],
      [sx + dirX * 0.3 * s, h * 1.06, sz + dirZ * 0.3 * s],
      [sx - dirX * 0.3 * s, h * 1.06, sz - dirZ * 0.3 * s],
      [0.55, 0.15, 0.25]);
  }
  private addMontrealScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    this.addOceanPlane(verts, idxs);
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    let outer = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z) + p.width / 2;
      if (r > outer) outer = r;
    }
    const domeAng = Math.random() * Math.PI * 2;
    const domeDist = outer + 40 + Math.random() * 45;
    const domeR = 7.5 + Math.random() * 3;
    const domeX = cx + Math.cos(domeAng) * domeDist;
    const domeZ = cz + Math.sin(domeAng) * domeDist;
    this.addGeodesicDome(verts, idxs, domeX, 0.35, domeZ, domeR);
    const ux = -Math.cos(domeAng);
    const uz = -Math.sin(domeAng);
    const shore = domeR * 0.95;
    const bridgeLen = Math.max(12, domeDist - shore - (outer - 8));
    const mx = domeX + ux * (shore + bridgeLen / 2);
    const mz = domeZ + uz * (shore + bridgeLen / 2);
    this.addOrientedBox(verts, idxs, mx, 0.2, mz, bridgeLen, 0.14, 2.2, ux, uz, [0.55, 0.56, 0.6]);
    const px = -uz;
    const pz = ux;
    for (const s of [-1, 1]) {
      this.addOrientedBox(verts, idxs, mx + px * (1.15 * s), 0.42, mz + pz * (1.15 * s),
        bridgeLen, 0.05, 0.08, ux, uz, [0.42, 0.43, 0.47]);
    }
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 24 + Math.random() * 20;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 7;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 7;
        if (Math.random() < 0.55) {
          this.addMapleTree(verts, idxs, tx, tz, 0.9 + Math.random() * 0.5);
        } else {
          const th = 1.3 + Math.random() * 1.0;
          this.addCylinder(verts, idxs, tx, 0, tz, 0.08, th, 5, [0.3, 0.18, 0.06]);
          this.addSphere(verts, idxs, tx, th + 0.5, tz, 0.85 + Math.random() * 0.5, 6, [0.05, 0.35, 0.08]);
        }
        if (treeIdx++ > 70) break;
      }
      if (treeIdx > 70) break;
    }
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 55 + Math.random() * 32;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const h = 18 + Math.random() * 30;
        const w = 5 + Math.random() * 4;
        const d = 5 + Math.random() * 4;
        const roll = Math.random();
        const col = roll < 0.45 ? [0.45, 0.5, 0.58] : roll < 0.7 ? [0.58, 0.47, 0.44] : [0.32, 0.42, 0.6];
        this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
        this.addBox(verts, idxs, bx, h + 0.1, bz, w + 0.5, 0.2, d + 0.5, [0.2, 0.2, 0.24]);
        if (bIdx++ > 32) break;
      }
      if (bIdx > 32) break;
    }
    let flowerIdx = 0;
    for (let i = 0; i < pts.length; i += 16) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const side = (i / 16) % 2 === 0 ? -1 : 1;
      const dist = p.width / 2 + 2.6 + Math.random() * 4;
      const fx = p.x + ppx * dist * side + (Math.random() - 0.5) * 2;
      const fz = p.z + ppz * dist * side + (Math.random() - 0.5) * 2;
      this.addFlowerCluster(verts, idxs, fx, fz, 0.7 + Math.random() * 0.5);
      if (flowerIdx++ > 30) break;
    }
    let flagIdx = 0;
    for (let i = 0; i < pts.length; i += 26) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 5 + (side === 1 ? 1.4 : 0);
        const fx = p.x + ppx * dist * side;
        const fz = p.z + ppz * dist * side;
        this.addFlagOnPole(verts, idxs, fx, fz, p.dirX, p.dirZ,
          (flagIdx + side) % 2 === 0 ? 'quebec' : 'canada', 3.1, 1);
        if (flagIdx++ > 44) break;
      }
      if (flagIdx > 44) break;
    }
    this.addExtraBleachers(verts, idxs);
  }
  private addExtraBleachers(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const step = Math.max(8, Math.floor(pts.length / 8));
    let bleacherIdx = 0;
    for (let i = Math.floor(pts.length / 16); i < pts.length + Math.floor(pts.length / 16); i += step) {
      const p = pts[i % pts.length];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const gx = p.x - ppx * (p.width / 2 + 8);
      const gz = p.z - ppz * (p.width / 2 + 8);
      this.addGrandstand(verts, idxs, gx, gz, p.dirX, p.dirZ, 3, 3);
      if (bleacherIdx++ > 7) break;
    }
  }
  private addMapleTree(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const th = 1.4 * s;
    this.addCylinder(verts, idxs, x, 0, z, 0.09 * s, th, 5, [0.32, 0.2, 0.08]);
    const crown = Math.random() < 0.6
      ? (Math.random() < 0.5 ? [0.78, 0.18, 0.07] : [0.88, 0.42, 0.08])
      : [0.1, 0.42, 0.1];
    const cy = th + 0.5 * s;
    const cr = 0.72 * s;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
      const lx = Math.cos(a) * cr * 0.55;
      const lz = Math.sin(a) * cr * 0.55;
      this.addEllipsoid(verts, idxs, x + lx, cy + Math.abs(Math.cos(a)) * 0.1 * s, z + lz,
        cr * 0.52, cr * 0.42, cr * 0.42, 6, crown);
    }
    this.addEllipsoid(verts, idxs, x, cy + 0.2 * s, z, cr * 0.5, cr * 0.4, cr * 0.5, 6, crown);
  }
  private addFlowerCluster(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const petals: [number, number, number][] = [
      [0.95, 0.15, 0.3], [1, 0.85, 0.2], [0.95, 0.95, 0.98], [0.7, 0.3, 0.85], [1, 0.55, 0.25],
    ];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 0.9 * s;
      const oz = (Math.random() - 0.5) * 0.9 * s;
      const stemH = (0.2 + Math.random() * 0.18) * s;
      this.addCylinder(verts, idxs, x + ox, 0, z + oz, 0.02 * s, stemH, 4, [0.12, 0.5, 0.12]);
      this.addSphere(verts, idxs, x + ox, stemH + 0.05 * s, z + oz, 0.09 * s, 4, petals[i % petals.length]);
    }
  }
  private addFlagOnPole(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, kind: 'canada' | 'quebec', poleH: number, size: number) {
    this.addCylinder(verts, idxs, x, 0, z, 0.05 * size, poleH, 6, [0.55, 0.55, 0.58]);
    const w = 1.15 * size;
    const h = 0.7 * size;
    const topY = poleH - 0.05;
    const red: [number, number, number] = [0.82, 0.1, 0.12];
    const white: [number, number, number] = [0.95, 0.95, 0.95];
    const blue: [number, number, number] = [0.05, 0.2, 0.62];
    this._flags.push({
      x, z, dirX, dirZ,
      anchorY: topY, w, h,
      kind: 'rect',
      colors: kind === 'canada' ? [red, white, red] : [blue, blue, blue],
      emblem: kind === 'canada' ? 'maple' : 'cross',
      phase: Math.random() * Math.PI * 2,
      speed: 4 + Math.random() * 1.5,
      amp: 0.9 + Math.random() * 0.3,
    });
  }
  private addGeodesicDome(verts: number[], idxs: number[], x: number, y: number, z: number, r: number) {
    const t = (1 + Math.sqrt(5)) / 2;
    const V: [number, number, number][] = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const F: [number, number, number][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const s = r / Math.sqrt(1 + t * t);
    const frame: [number, number, number] = [0.5, 0.53, 0.6];
    const panel: [number, number, number] = [0.78, 0.84, 0.92];
    let fi = 0;
    for (const [a, b, c] of F) {
      const A = V[a], B = V[b], C = V[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (ny <= 0.18) continue;
      const col = fi++ % 2 === 0 ? panel : frame;
      for (const P of [A, B, C]) {
        verts.push(x + P[0] * s, y + r + P[1] * s, z + P[2] * s, nx, ny, nz, col[0], col[1], col[2], 0, 0);
      }
    }
    this.addCylinder(verts, idxs, x, y, z, r * 0.98, 0.22, 12, [0.35, 0.36, 0.4]);
    this.addCylinder(verts, idxs, x, y - 0.9, z, r * 0.6, 1.8, 10, [0.5, 0.52, 0.55]);
  }
  private addItalyScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    let treeIdx = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 22 + Math.random() * 18;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        const th = 1.5 + Math.random() * 1.2;
        this.addCylinder(verts, idxs, tx, 0, tz, 0.06, th, 5, [0.3, 0.2, 0.08]);
        this.addCone(verts, idxs, tx, th - 0.3, tz, 1.2 + Math.random() * 0.8, 0.8 + Math.random() * 0.5, 8, [0.03, 0.22, 0.05]);
        this.addCone(verts, idxs, tx, th + 0.1, tz, 0.8 + Math.random() * 0.5, 0.5 + Math.random() * 0.3, 8, [0.05, 0.28, 0.06]);
        if (treeIdx++ > 150) break;
      }
      if (treeIdx > 150) break;
    }
    const turns: { i: number; t: number; s: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cross = p0.dirX * p1.dirZ - p0.dirZ * p1.dirX;
      const dot = p0.dirX * p1.dirX + p0.dirZ * p1.dirZ;
      const t = Math.abs(Math.atan2(cross, dot));
      if (t > 0.04) turns.push({ i, t, s: cross > 0 ? -1 : 1 });
    }
    turns.sort((a, b) => b.t - a.t);
    const baseGs = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(f => Math.floor(f * pts.length));
    const picked: typeof turns = [];
    for (const c of turns) {
      if (picked.length >= 10) break;
      if (picked.every(p => {
        const d = Math.abs(p.i - c.i);
        return Math.min(d, pts.length - d) > 18;
      }) && baseGs.every(g => {
        const d = Math.abs(g - c.i);
        return Math.min(d, pts.length - d) > 10;
      })) picked.push(c);
    }
    for (const c of picked) {
      const p = pts[c.i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const hw = p.width / 2;
      const ox = ppx * c.s;
      const oz = ppz * c.s;
      const span = 2;
      const rise = 0.4;
      const rampPts: { ix: number; iz: number; oxx: number; ozz: number; y: number }[] = [];
      for (let k = -span; k <= span; k++) {
        const i = (c.i + k + pts.length) % pts.length;
        const pp = pts[i];
        const qx = -pp.dirZ;
        const qz = pp.dirX;
        const hh = pp.width / 2;
        const y = rise * (1 - Math.abs(k) / (span + 1));
        rampPts.push({
          ix: pp.x + qx * (hh + 0.1) * c.s,
          iz: pp.z + qz * (hh + 0.1) * c.s,
          oxx: pp.x + qx * (hh + 2.6) * c.s,
          ozz: pp.z + qz * (hh + 2.6) * c.s,
          y,
        });
      }
      for (let k = 0; k < rampPts.length - 1; k++) {
        const a = rampPts[k];
        const b = rampPts[k + 1];
        this.pushRampQuad(verts, idxs,
          [a.ix, 0.03, a.iz], [b.ix, 0.03, b.iz], [a.oxx, a.y, a.ozz], [b.oxx, b.y, b.ozz]);
      }
      for (let k = -1; k <= 1; k++) {
        const i = (c.i + k + pts.length) % pts.length;
        const pp = pts[i];
        const qx = -pp.dirZ;
        const qz = pp.dirX;
        const hh = pp.width / 2;
        const kx = pp.x + qx * (hh + 0.75) * -c.s;
        const kz = pp.z + qz * (hh + 0.75) * -c.s;
        const red = (i + c.i) % 2 === 0;
        this.addOrientedBox(verts, idxs, kx, 0.09, kz, 0.55, 0.18, 1.4, qx, qz,
          red ? [0.85, 0.1, 0.08] : [0.92, 0.92, 0.92]);
      }
      this.addGrandstand(verts, idxs,
        p.x + ox * (hw + 9), p.z + oz * (hw + 9), p.dirX, p.dirZ, 3.5, 3);
    }
    this.addExtraBleachers(verts, idxs);
    const buntingCols: [number, number, number][] = [[0.85, 0.12, 0.1], [0.92, 0.9, 0.88]];
    let buntingIdx = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      const hw2 = p.width / 2;
      for (const side of [-1, 1]) {
        const wx = p.x + ppx * (hw2 + 1.72) * side;
        const wz = p.z + ppz * (hw2 + 1.72) * side;
        const col = buntingCols[(buntingIdx + (side === 1 ? 0 : 1)) % 6 === 0 ? 1 : 0];
        this._flags.push({
          x: wx, z: wz,
          dirX: ppx * side, dirZ: ppz * side,
          anchorY: 0.85, w: 0.2, h: 0.28,
          kind: 'tri',
          colors: [col],
          phase: Math.random() * Math.PI * 2,
          speed: 6 + Math.random() * 3,
          amp: 0.9 + Math.random() * 0.4,
        });
        buntingIdx++;
      }
    }
    const sf = pts[0];
    this.addGantryBunting(sf.x, sf.z, sf.dirX, sf.dirZ, sf.width);
  }
  private addJapanScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    const N = pts.length;
    // Valley arc: one stretch of the pass where the ground falls away into a
    // misty valley (the downhill drop) with a river and a small town far below,
    // then the road climbs back up the far side.
    const valleyStart = Math.floor(N * 0.6);
    const valleyEnd = Math.floor(N * 0.9);
    this._japanValleyFrac = 0.6;
    const slopeW = 36;
    const floorW = 72;
    const floorY = -15;
    const dropSide = (p: TrackPoint) => {
      const latX = -p.dirZ, latZ = p.dirX;
      return (latX * p.x + latZ * p.z) >= 0 ? 1 : -1;
    };
    // Forest-floor shoulder band around the circuit, skipping the side that
    // falls away into the valley (the escarpment replaces it there).
    for (let i = 0; i < N; i += 2) {
      const p = pts[i];
      const n = pts[(i + 1) % N];
      const ppx = -p.dirZ, ppz = p.dirX;
      const npx = -n.dirZ, npz = n.dirX;
      const inner = p.width / 2 + 14;
      const outer = p.width / 2 + 46;
      for (const side of [-1, 1]) {
        if (i >= valleyStart && i < valleyEnd && side === dropSide(p)) continue;
        this.addGroundQuad(verts, idxs,
          [p.x + ppx * inner * side, 0, p.z + ppz * inner * side],
          [n.x + npx * inner * side, 0, n.z + npz * inner * side],
          [n.x + npx * outer * side, 0, n.z + npz * outer * side],
          [p.x + ppx * outer * side, 0, p.z + ppz * outer * side],
          [0.1, 0.24, 0.1]);
      }
    }
    for (let i = valleyStart; i < valleyEnd; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % N];
      const s = dropSide(p);
      const ppx = -p.dirZ, ppz = p.dirX;
      const npx = -n.dirZ, npz = n.dirX;
      const ox = ppx * s, oz = ppz * s;
      const nox = npx * s, noz = npz * s;
      const hw = p.width / 2 + 1.7;
      const hwn = n.width / 2 + 1.7;
      const e1 = [p.x + ox * hw, 0, p.z + oz * hw];
      const e2 = [n.x + nox * hwn, 0, n.z + noz * hwn];
      const s1 = [p.x + ox * (hw + slopeW), floorY, p.z + oz * (hw + slopeW)];
      const s2 = [n.x + nox * (hwn + slopeW), floorY, n.z + noz * (hwn + slopeW)];
      // Sloped escarpment dropping from the track edge to the valley floor.
      this.addQuad(verts, idxs, e1, e2, s2, s1, [0.13, 0.2, 0.12]);
      // Valley floor.
      const f1 = [p.x + ox * (hw + slopeW + floorW), floorY, p.z + oz * (hw + slopeW + floorW)];
      const f2 = [n.x + nox * (hwn + slopeW + floorW), floorY, n.z + noz * (hwn + slopeW + floorW)];
      this.addQuad(verts, idxs, s1, s2, f2, f1, [0.3, 0.37, 0.33]);
      // Winding river glinting on the floor.
      const wave = Math.sin(i * 0.3) * 6;
      const rw = 3.6;
      const r1 = [p.x + ox * (hw + slopeW + floorW * 0.55) + ox * wave, floorY + 0.05, p.z + oz * (hw + slopeW + floorW * 0.55) + oz * wave];
      const r2 = [n.x + nox * (hwn + slopeW + floorW * 0.55) + nox * wave, floorY + 0.05, n.z + noz * (hwn + slopeW + floorW * 0.55) + noz * wave];
      this.addQuad(verts, idxs, r1, r2,
        [r2[0] + nox * rw, floorY + 0.05, r2[2] + noz * rw],
        [r1[0] + ox * rw, floorY + 0.05, r1[2] + oz * rw],
        [0.24, 0.42, 0.45]);
      // Red/white touge guardrail posts along the drop edge plus a white rail.
      if (i % 2 === 0) {
        this.addOrientedBox(verts, idxs,
          (e1[0] + e2[0]) / 2 - ox * 0.35, 0.42, (e1[2] + e2[2]) / 2 - oz * 0.35,
          0.34, 0.84, 0.16, p.dirX, p.dirZ,
          Math.floor(i / 2) % 2 === 0 ? [0.85, 0.1, 0.08] : [0.93, 0.93, 0.95]);
      }
      const railLen = Math.hypot(e2[0] - e1[0], e2[2] - e1[2]) + 0.25;
      this.addOrientedBox(verts, idxs,
        (e1[0] + e2[0]) / 2, 0.66, (e1[2] + e2[2]) / 2,
        railLen, 0.15, 0.11, p.dirX, p.dirZ, [0.93, 0.93, 0.95]);
    }
    // Small riverside town on the valley floor (lit warm windows).
    let townIdx = 0;
    for (let i = valleyStart; i < valleyEnd; i += 3) {
      const p = pts[i];
      const s = dropSide(p);
      const ppx = -p.dirZ, ppz = p.dirX;
      const ox = ppx * s, oz = ppz * s;
      const off = 0.55 + Math.random() * 0.35;
      const bx = p.x + ox * (p.width / 2 + slopeW + floorW * off) + (Math.random() - 0.5) * 10;
      const bz = p.z + oz * (p.width / 2 + slopeW + floorW * off) + (Math.random() - 0.5) * 10;
      const bh = 1.1 + Math.random() * 1.7;
      const warm = Math.random() < 0.7;
      this.addOrientedBox(verts, idxs, bx, floorY + bh / 2, bz,
        1.9 + Math.random() * 1.6, bh, 1.9 + Math.random() * 1.6,
        ppx, ppz, warm ? [0.85, 0.68, 0.42] : [0.36, 0.42, 0.52]);
      if (townIdx++ > 26) break;
    }
    // Distant blue ridges rising out of the valley haze.
    for (let i = valleyStart; i < valleyEnd; i += 5) {
      const p = pts[i];
      const s = dropSide(p);
      const ppx = -p.dirZ, ppz = p.dirX;
      const ox = ppx * s, oz = ppz * s;
      const mx = p.x + ox * (p.width / 2 + slopeW + floorW + 16 + Math.random() * 26);
      const mz = p.z + oz * (p.width / 2 + slopeW + floorW + 16 + Math.random() * 26);
      const mh = 16 + Math.random() * 24;
      const mw = 24 + Math.random() * 20;
      this.addCone(verts, idxs, mx, floorY, mz, mw, mh, 7, [0.4, 0.48, 0.53]);
      this.addCone(verts, idxs, mx, floorY + mh * 0.62, mz, mw * 0.32, mh * 0.42, 6, [0.56, 0.62, 0.64]);
    }
    // Dense cedar forest on the mountain side (and both sides outside the
    // valley arc) — trees skip the side that falls away into the valley.
    let treeIdx = 0;
    for (let i = 0; i < N; i += 3) {
      const p = pts[i];
      const ppx = -p.dirZ, ppz = p.dirX;
      const inValley = i >= valleyStart && i < valleyEnd;
      const s = dropSide(p);
      for (const side of [-1, 1]) {
        if (inValley && side === s) continue;
        const dist = p.width / 2 + 24 + Math.random() * 20;
        const tx = p.x + ppx * dist * side + (Math.random() - 0.5) * 8;
        const tz = p.z + ppz * dist * side + (Math.random() - 0.5) * 8;
        this.addJapaneseCedar(verts, idxs, tx, tz, 0.8 + Math.random() * 0.7);
        if (treeIdx++ > 150) break;
      }
      if (treeIdx > 150) break;
    }
    // A few sakura trees near the start/finish for the Japan flavour.
    for (const fi of [0, Math.floor(N * 0.03), Math.floor(N / 2), Math.floor(N / 2) + Math.floor(N * 0.03)]) {
      const p = pts[fi];
      const ppx = -p.dirZ, ppz = p.dirX;
      for (const side of [-1, 1]) {
        const sx2 = p.x + ppx * (p.width / 2 + 6 + Math.random() * 4) * side;
        const sz2 = p.z + ppz * (p.width / 2 + 6 + Math.random() * 4) * side;
        this.addSakura(verts, idxs, sx2, sz2, 0.85 + Math.random() * 0.45);
      }
    }
    // Red torii gates at the two sharpest corners of the valley arc.
    const turns: { i: number; t: number }[] = [];
    for (let i = valleyStart + 2; i < valleyEnd - 2; i++) {
      const a = pts[i - 1], b = pts[i];
      const cross = a.dirX * b.dirZ - a.dirZ * b.dirX;
      const dot = a.dirX * b.dirX + a.dirZ * b.dirZ;
      turns.push({ i, t: Math.abs(Math.atan2(cross, dot)) });
    }
    turns.sort((a, b) => b.t - a.t);
    let toriiCount = 0;
    for (const c of turns) {
      if (toriiCount >= 2) break;
      const p = pts[c.i];
      const s = dropSide(p);
      const ppx = -p.dirZ, ppz = p.dirX;
      const inX = ppx * -s, inZ = ppz * -s;
      this.addTorii(verts, idxs, p.x + inX * (p.width / 2 + 3.5), p.z + inZ * (p.width / 2 + 3.5), 1, ppx, ppz);
      toriiCount++;
    }
    this.addExtraBleachers(verts, idxs);
  }
  private addJapaneseCedar(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const h = (5 + Math.random() * 8) * s;
    const trunkH = h * 0.08;
    this.addCylinder(verts, idxs, x, 0, z, 0.15 * s, trunkH, 6, [0.33, 0.2, 0.09]);
    const greens: [number, number, number][] = [
      [0.02, 0.18, 0.07], [0.03, 0.22, 0.08], [0.015, 0.14, 0.05], [0.04, 0.26, 0.09],
    ];
    const tiers = 5 + Math.floor(Math.random() * 2);
    const baseR = (0.7 + Math.random() * 0.35) * s;
    let lastTop = trunkH;
    for (let t = 0; t < tiers; t++) {
      const frac = t / tiers;
      const ty = trunkH + frac * h * 0.85;
      const tr = baseR * (1 - frac * 0.85);
      const th = h * (0.24 - frac * 0.1);
      this.addCone(verts, idxs, x, ty, z, tr, th, 8, greens[t % greens.length]);
      lastTop = ty + th;
    }
    this.addCone(verts, idxs, x, lastTop - h * 0.02, z, baseR * 0.12, h * 0.18, 6, greens[3]);
  }
  private addSakura(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const h = (3 + Math.random() * 2) * s;
    this.addCylinder(verts, idxs, x, 0, z, 0.11 * s, h, 6, [0.3, 0.18, 0.1]);
    const pinks: [number, number, number][] = [
      [0.95, 0.62, 0.72], [0.93, 0.55, 0.66], [1.0, 0.72, 0.8],
    ];
    const canopy = 2 + Math.floor(Math.random() * 2);
    for (let c = 0; c < canopy; c++) {
      const ty = h - 0.3 * s * (c + 1);
      this.addCone(verts, idxs,
        x + (Math.random() - 0.5) * 0.5 * s, ty, z + (Math.random() - 0.5) * 0.5 * s,
        0.8 * s, 0.7 * s, 6, pinks[c % pinks.length]);
    }
  }
  private addTorii(verts: number[], idxs: number[], x: number, z: number, s: number, dirX: number, dirZ: number) {
    const red = [0.8, 0.09, 0.08];
    const dark = [0.5, 0.06, 0.06];
    const legH = 3.2 * s;
    const span = 2.7 * s;
    this.addOrientedBox(verts, idxs, x - dirX * span * 0.55, legH / 2, z - dirZ * span * 0.55, 0.2 * s, legH, 0.2 * s, dirX, dirZ, red);
    this.addOrientedBox(verts, idxs, x + dirX * span * 0.55, legH / 2, z + dirZ * span * 0.55, 0.2 * s, legH, 0.2 * s, dirX, dirZ, red);
    this.addOrientedBox(verts, idxs, x, legH + 0.22 * s, z, span + 0.5 * s, 0.24 * s, 0.3 * s, dirX, dirZ, red);
    this.addOrientedBox(verts, idxs, x, legH - 0.5 * s, z, span + 0.25 * s, 0.16 * s, 0.2 * s, dirX, dirZ, dark);
    this.addOrientedBox(verts, idxs, x, legH - 0.18 * s, z, 0.42 * s, 0.55 * s, 0.06, dirX, dirZ, [0.1, 0.1, 0.12]);
  }
  private pushRampQuad(verts: number[], idxs: number[],
    a: number[], b: number[], c: number[], d: number[]) {
    let nx = (c[1] - a[1]) * (b[2] - a[2]) - (c[2] - a[2]) * (b[1] - a[1]);
    let ny = (c[2] - a[2]) * (b[0] - a[0]) - (c[0] - a[0]) * (b[2] - a[2]);
    let nz = (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const base = verts.length / 11;
    for (const p of [a, b, c, d]) {
      verts.push(p[0], p[1], p[2], nx, ny, nz, 0.78, 0.74, 0.66, 0, 0);
    }
    idxs.push(base, base + 2, base + 1);
    idxs.push(base + 1, base + 2, base + 3);
  }
  private addGantryBunting(x: number, z: number, dirX: number, dirZ: number, width: number) {
    const ppx = -dirZ;
    const ppz = dirX;
    const span = width / 2 + 1.3;
    const anchorY = 4.4;
    const sag = 1.1;
    const steps = 8;
    const red: [number, number, number] = [0.85, 0.12, 0.1];
    const white: [number, number, number] = [0.92, 0.9, 0.88];
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const wireY = anchorY - sag * 4 * f * (1 - f);
      const bx = x - ppx * span + ppx * (2 * span) * f;
      const bz = z - ppz * span + ppz * (2 * span) * f;
      const col = s % 2 === 0 ? red : white;
      this._flags.push({
        x: bx, z: bz,
        dirX: ppx, dirZ: ppz,
        anchorY: wireY, w: 0.2, h: 0.32,
        kind: 'tri',
        colors: [col],
        phase: Math.random() * Math.PI * 2,
        speed: 6 + Math.random() * 3,
        amp: 1,
      });
    }
  }
  private addMiamiScenery(verts: number[], idxs: number[]) {
    const pts = this._trackPoints;
    let palmIdx = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 24 + Math.random() * 16;
        const px = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const pz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        if (Math.random() < 0.62) {
          this.addPalmTree(verts, idxs, px, pz, 0.7 + Math.random() * 0.6);
        } else {
          this.addFloweringTree(verts, idxs, px, pz, 0.8 + Math.random() * 0.5);
        }
        if (palmIdx++ > 110) break;
      }
      if (palmIdx > 110) break;
    }
    const pastels: [number, number, number][] = [
      [0.95, 0.6, 0.65], [0.6, 0.85, 0.8], [0.98, 0.85, 0.6], [0.85, 0.75, 0.9], [0.75, 0.85, 0.95],
      [0.95, 0.7, 0.55], [0.65, 0.95, 0.9], [0.9, 0.8, 0.7],
    ];
    let bIdx = 0;
    for (let i = 0; i < pts.length; i += 5) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const dist = p.width / 2 + 60 + Math.random() * 25;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 10;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 10;
        const h = 10 + Math.random() * 30;
        const w = 5 + Math.random() * 3;
        const d = 5 + Math.random() * 3;
        const col = pastels[Math.floor(Math.random() * pastels.length)];
        const roll = Math.random();
        if (roll < 0.3 && h > 18) {
          this.addGlassTower(verts, idxs, bx, bz, h, w, d, col);
        } else if (roll < 0.45 && h > 14) {
          this.addSetbackTower(verts, idxs, bx, bz, h, w, d, col);
        } else {
          this.addBox(verts, idxs, bx, h / 2, bz, w, h, d, col);
          this.addBox(verts, idxs, bx, h + 0.4, bz, w + 0.8, 0.8, d + 0.8, [0.95, 0.95, 0.9]);
        }
        if (roll >= 0.3) {
          const rows = Math.max(3, Math.floor(h / 4));
          for (const sx of [-1, 1]) {
            const zc = bz + sx * (d / 2 + 0.05);
            for (let r = 0; r < rows; r++) {
              const wy = 1 + r * (h - 2) / rows;
              for (let c = 0; c < 3; c++) {
                const xc = bx - w / 2 + 0.9 + c * (w - 1.8) / 3;
                this.addWindowQuad(verts, idxs, xc, wy, zc, 0.8, 0.5, 0, sx, [0.15, 0.35, 0.4]);
              }
            }
          }
        }
        if (bIdx++ > 44) break;
      }
      if (bIdx > 44) break;
    }
    const gsPositions = [0, Math.floor(pts.length / 4), Math.floor(pts.length / 2), Math.floor(pts.length * 3 / 4)];
    const umbrellaColors: [number, number, number][] = [
      [0.9, 0.25, 0.3], [0.95, 0.8, 0.2], [0.1, 0.65, 0.55], [0.25, 0.5, 0.9], [0.95, 0.55, 0.8],
      [0.95, 0.35, 0.9], [0.2, 0.8, 0.85],
    ];
    const towelColors: [number, number, number][] = [
      [0.95, 0.35, 0.4], [0.3, 0.7, 0.95], [0.95, 0.85, 0.2], [0.3, 0.85, 0.55], [0.95, 0.55, 0.8], [0.95, 0.65, 0.3],
    ];
    const ballColors: [number, number, number][] = [
      [0.95, 0.3, 0.3], [0.3, 0.6, 0.95], [0.98, 0.85, 0.2], [0.25, 0.8, 0.45], [0.95, 0.45, 0.75],
    ];
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (let u = 0; u < 4; u++) {
        const dist = p.width / 2 + 26 + Math.random() * 12;
        const side = u % 2 === 0 ? -1 : 1;
        const ux = p.x + ppx * dist * side + (Math.random() - 0.5) * 6;
        const uz = p.z + ppz * dist * side + (Math.random() - 0.5) * 6;
        this.addCylinder(verts, idxs, ux, 0, uz, 0.05, 1.6, 6, [0.85, 0.8, 0.7]);
        this.addCone(verts, idxs, ux, 1.6, uz, 0.9, 0.35, 8, umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)]);
        if (Math.random() < 0.85) {
          const tcol = towelColors[Math.floor(Math.random() * towelColors.length)];
          const tx = ux + (Math.random() < 0.5 ? 1.1 : -1.1);
          const tz = uz + (Math.random() < 0.5 ? 1.0 : -1.0);
          this.addQuad(verts, idxs,
            [tx - 1.0, -0.23, tz - 0.55], [tx + 1.0, -0.23, tz - 0.55],
            [tx + 1.0, -0.23, tz + 0.55], [tx - 1.0, -0.23, tz + 0.55], tcol);
        }
        if (Math.random() < 0.7) {
          this.addSphere(verts, idxs, ux + (Math.random() - 0.5) * 3, 0.04, uz + (Math.random() - 0.5) * 3, 0.3, 8, ballColors[Math.floor(Math.random() * ballColors.length)]);
        }
      }
    }
    for (const gi of gsPositions) {
      const p = pts[gi];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (let b = 0; b < 3; b++) {
        const dist = p.width / 2 + 24 + Math.random() * 8;
        const side = b % 2 === 0 ? -1 : 1;
        const bx = p.x + ppx * dist * side + (Math.random() - 0.5) * 5;
        const bz = p.z + ppz * dist * side + (Math.random() - 0.5) * 5;
        this.addBench(verts, idxs, bx, bz, p.dirX, p.dirZ);
      }
    }
  }
  private addPalmTree(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const lean = (Math.random() - 0.5) * 0.8;
    const trunkH = 3.2 * s;
    this.addCylinder(verts, idxs, x, 0, z, 0.14 * s, trunkH * 0.55, 6, [0.5, 0.36, 0.18]);
    const kinkX = x + lean * 0.4;
    const kinkZ = z + lean * 0.3;
    this.addCylinder(verts, idxs, kinkX, trunkH * 0.55, kinkZ, 0.11 * s, trunkH * 0.45, 6, [0.45, 0.32, 0.16]);
    const topX = kinkX + lean * 0.55;
    const topZ = kinkZ + lean * 0.4;
    const topY = trunkH;
    this._palmCrowns.push({ x: topX, y: topY, z: topZ, s, phase: Math.random() * Math.PI * 2, lean });
    this.addSphere(verts, idxs, topX + lean * 0.2, topY - 0.1, topZ + lean * 0.15, 0.14 * s, 6, [0.5, 0.35, 0.15]);
  }
  private addFloweringTree(verts: number[], idxs: number[], x: number, z: number, s: number) {
    const lean = (Math.random() - 0.5) * 0.5;
    const trunkH = 2.2 * s;
    this.addCylinder(verts, idxs, x, 0, z, 0.12 * s, trunkH, 6, [0.42, 0.28, 0.14]);
    const topX = x + lean * 0.4;
    const topZ = z + lean * 0.3;
    const blossom: [number, number, number] = Math.random() < 0.55
      ? [0.93, 0.45, 0.72]
      : [0.98, 0.55, 0.25];
    const r = (0.9 + Math.random() * 0.5) * s;
    this.addSphere(verts, idxs, topX, trunkH + r * 0.7, topZ, r, 8, blossom);
    this.addSphere(verts, idxs, topX + r * 0.45, trunkH + r * 0.55, topZ + r * 0.2, r * 0.65, 7, blossom);
    this.addSphere(verts, idxs, topX - r * 0.4, trunkH + r * 0.5, topZ - r * 0.25, r * 0.6, 7, blossom);
    this.addSphere(verts, idxs, topX, trunkH + r * 0.35, topZ, r * 0.8, 7, [0.12, 0.4, 0.12]);
  }
  private addGroundQuad(verts: number[], idxs: number[], a: number[], b: number[], c: number[], d: number[], color: number[]) {
    const [r, g, bl] = color;
    const base = verts.length / 11;
    for (const p of [a, b, c, d]) {
      verts.push(p[0], -0.26, p[2], 0, 1, 0, r, g, bl, 0, 0);
    }
    idxs.push(base, base + 1, base + 2);
    idxs.push(base + 2, base + 3, base);
  }
  private buildSnowCap() {
    const gl = this.gl;
    const verts: number[] = [];
    const idxs: number[] = [];
    const snow = [0.97, 0.98, 1.0];
    this.addBox(verts, idxs, -0.27, 0.43, 0, 0.30, 0.03, 0.40, snow);
    this.addBox(verts, idxs, -1.02, 0.47, 0, 0.38, 0.03, 1.00, snow);
    this.addBox(verts, idxs, -1.02, 0.52, 0, 0.26, 0.03, 0.90, snow);
    this.addBox(verts, idxs, -1.02, 0.38, 0, 0.30, 0.03, 0.80, snow);
    this.addBox(verts, idxs, 1.22, 0.075, 0, 0.36, 0.03, 1.40, snow);
    this.addBox(verts, idxs, 0.40, 0.455, 0, 0.20, 0.03, 0.46, snow);
    this.addBox(verts, idxs, 1.20, 0.145, 0, 0.36, 0.03, 0.16, snow);
    this.addBox(verts, idxs, 0.30, 0.33, 0.50, 0.50, 0.03, 0.32, snow);
    this.addBox(verts, idxs, 0.30, 0.33, -0.50, 0.50, 0.03, 0.32, snow);
    this.addBox(verts, idxs, -0.48, 0.50, 0, 0.55, 0.03, 0.05, snow);
    this.addBox(verts, idxs, -1.04, 0.30, 0, 0.14, 0.03, 0.45, snow);
    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this._snowCapCount = idxArray.length;
    this._snowCapVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._snowCapVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  private updateSnowCap(cur: number, dt: number, speed: number): number {
    const snowing = this.theme === 'alpine' || this.theme === 'mountain';
    if (!snowing) {
      return Math.max(0, cur - 0.5 * dt);
    }
    const rate = 0.04 + Math.min(Math.abs(speed) / 10, 1) * 0.10;
    return Math.min(1, cur + rate * dt);
  }
  private buildCarMesh() {
    const gl = this.gl;
    const verts: number[] = [];
    const idxs: number[] = [];
    // Stock rear wing lives in its own mesh so an equipped spoiler replaces it
    // (renderCar skips baseWingVao when app.spoilerId is set).
    const baseWingVerts: number[] = [];
    const baseWingIdxs: number[] = [];
    const accFixedVerts: number[] = [];
    const accFixedIdxs: number[] = [];
    // Paint surfaces are baked pure white: renderCar tints them with uColor =
    // the equipped skin, so the paint shows its true colour. Baking a tinted
    // base here would multiply into every skin (red base = every paint reads
    // dark/muddy), which is why the garage paint preview looked broken.
    const [cr, cg, cb] = [1, 1, 1];
    const carbon = [0.12, 0.12, 0.14];
    const dark = [0.08, 0.08, 0.10];
    const grey = [0.22, 0.22, 0.24];
    const hel = [1.0, 1.0, 1.02];  // driver helmet shell (tinted by the car colour)
    this.addBox(verts, idxs, -0.1, 0.02, 0, 2.6, 0.03, 1.05, dark);
    this.addBox(verts, idxs, 0.1, 0.06, 0.53, 1.4, 0.07, 0.02, carbon);
    this.addBox(verts, idxs, 0.1, 0.06, -0.53, 1.4, 0.07, 0.02, carbon);
    this.addBox(verts, idxs, -0.3, 0.05, 0.53, 0.8, 0.05, 0.015, carbon);
    this.addBox(verts, idxs, -0.3, 0.05, -0.53, 0.8, 0.05, 0.015, carbon);
    this.addTaperedBox(verts, idxs, 0.7, 0.01, 0, 0.5, 0.03, 0.02, 0.4, 0.5, carbon);
    this.addTaperedBox(verts, idxs, -0.9, 0.03, 0.52, 0.5, 0.05, 0.02, 0.08, 0.02, carbon);
    this.addTaperedBox(verts, idxs, -0.9, 0.03, -0.52, 0.5, 0.05, 0.02, 0.08, 0.02, carbon);
    this.addTaperedBox(verts, idxs, -1.1, 0.035, 0, 0.4, 0.13, 0.03, 0.7, 0.45, carbon);
    this.addTaperedBox(verts, idxs, -1.1, 0.01, 0.18, 0.4, 0.06, 0.02, 0.2, 0.08, dark);
    this.addTaperedBox(verts, idxs, -1.1, 0.01, -0.18, 0.4, 0.06, 0.02, 0.2, 0.08, dark);
    for (const dz of [-0.3, -0.1, 0.1, 0.3]) {
      this.addBox(verts, idxs, -1.15, 0.07, dz, 0.3, 0.08, 0.02, carbon);
    }
    this.addSmoothLoft(verts, idxs, BODY_LOFT.map(s => ({ ...s, cz: s.cz ?? 0 })), 30, [cr, cg, cb], true);
    this.addSmoothLoft(verts, idxs, HUMP_LOFT.map(s => ({ ...s, cz: s.cz ?? 0 })), 20, dark, false);
    this.addBox(verts, idxs, 0.26, 0.27, 0, 0.18, 0.07, 0.20, [cr, cg, cb]);
    this.addBox(verts, idxs, 0.29, 0.30, 0, 0.12, 0.05, 0.18, [0.1, 0.1, 0.12]);
    // ── Driver: detailed helmet (dome + curved visor + crown vents +
    // tear-off posts), HANS collar, suit shoulders + arms, gloved hands and a
    // proper F1 steering wheel with a centre screen and buttons.
    // The dome is sized to tuck just under the halo bar (y≈0.40) so the crown
    // never z-fights the halo, which is what made the old head look broken
    // from the garage's orbit camera.
    const shell = hel;                        // paint-tinted helmet shell
    const visorDark = [0.02, 0.02, 0.05];     // visor opening
    const visorSheen = [0.22, 0.3, 0.42];     // visor reflection strip
    const suitC = [0.14, 0.05, 0.05];         // race suit (tinted by paint)
    const hansC = [0.9, 0.9, 0.93];           // HANS collar (tinted bright)
    const gloveC = [0.95, 0.95, 0.97];        // gloves (tinted)
    const wheelFace = [0.05, 0.05, 0.07];     // wheel body
    // Helmet shell — smooth dome, lowered so it clears the halo bar above.
    this.addEllipsoid(verts, idxs, 0.40, 0.335, 0, 0.088, 0.062, 0.10, 20, shell);
    // Curved visor opening across the front of the dome (its full ellipsoid
    // back half hides inside the shell; only the front band shows).
    this.addEllipsoid(verts, idxs, 0.48, 0.332, 0, 0.016, 0.04, 0.09, 14, visorDark);
    // Visor reflection sheen — a lighter strip just forward of the opening.
    this.addEllipsoid(verts, idxs, 0.495, 0.338, 0, 0.004, 0.016, 0.07, 12, visorSheen);
    // Tear-off posts / visor mounts — silver dots on both sides.
    this.addBox(verts, idxs, 0.48, 0.362, 0.084, 0.013, 0.013, 0.013, [0.7, 0.7, 0.75]);
    this.addBox(verts, idxs, 0.48, 0.362, -0.084, 0.013, 0.013, 0.013, [0.7, 0.7, 0.75]);
    // Crown air vents — two small slots on top of the dome, tucked below the
    // halo bar (y 0.40) so they never clip into it.
    this.addBox(verts, idxs, 0.385, 0.392, 0.04, 0.035, 0.010, 0.013, [0.05, 0.05, 0.07]);
    this.addBox(verts, idxs, 0.385, 0.392, -0.04, 0.035, 0.010, 0.013, [0.05, 0.05, 0.07]);
    // Neck / HANS collar — bright ring around the base of the helmet.
    this.addBox(verts, idxs, 0.40, 0.272, 0, 0.095, 0.026, 0.108, hansC);
    // Race suit shoulders peeking out of the cockpit opening.
    this.addBox(verts, idxs, 0.315, 0.295, 0.085, 0.17, 0.034, 0.095, suitC);
    this.addBox(verts, idxs, 0.315, 0.295, -0.085, 0.17, 0.034, 0.095, suitC);
    // Arms reaching from the shoulders to the wheel.
    this.addStrut(verts, idxs, 0.34, 0.29, 0.085, 0.525, 0.278, 0.068, 0.024, suitC);
    this.addStrut(verts, idxs, 0.34, 0.29, -0.085, 0.525, 0.278, -0.068, 0.024, suitC);
    // Steering wheel — wide flat face angled toward the driver, centre
    // screen, coloured buttons and outer grips.
    this.addBox(verts, idxs, 0.545, 0.285, 0, 0.016, 0.05, 0.115, wheelFace);
    this.addBox(verts, idxs, 0.553, 0.285, 0, 0.005, 0.03, 0.052, [0.05, 0.45, 0.85]);
    this.addBox(verts, idxs, 0.553, 0.307, 0.047, 0.004, 0.012, 0.012, [1, 0.15, 0.15]);
    this.addBox(verts, idxs, 0.553, 0.307, -0.047, 0.004, 0.012, 0.012, [0.15, 0.55, 0.15]);
    this.addBox(verts, idxs, 0.553, 0.263, 0.047, 0.004, 0.012, 0.012, [0.12, 0.45, 1]);
    this.addBox(verts, idxs, 0.553, 0.263, -0.047, 0.004, 0.012, 0.012, [1, 0.5, 0.05]);
    this.addBox(verts, idxs, 0.553, 0.285, 0.088, 0.004, 0.009, 0.012, [0.85, 0.85, 0.9]);
    this.addBox(verts, idxs, 0.553, 0.285, -0.088, 0.004, 0.009, 0.012, [0.85, 0.85, 0.9]);
    // Gloved hands gripping the wheel sides.
    this.addEllipsoid(verts, idxs, 0.532, 0.276, 0.066, 0.022, 0.031, 0.027, 10, gloveC);
    this.addEllipsoid(verts, idxs, 0.532, 0.276, -0.066, 0.022, 0.031, 0.027, 10, gloveC);
    // Steering column behind the wheel.
    this.addBox(verts, idxs, 0.50, 0.278, 0, 0.035, 0.02, 0.03, carbon);
    this.addCylinder(verts, idxs, 0.05, 0.25, 0, 0.025, 0.18, 10, carbon);
    this.addBox(verts, idxs, 0.4, 0.42, 0, 0.2, 0.04, 0.52, carbon);
    this.addCylinder(verts, idxs, 0.4, 0.40, 0.26, 0.022, 0.05, 10, carbon);
    this.addCylinder(verts, idxs, 0.4, 0.40, -0.26, 0.022, 0.05, 10, carbon);
    this.addTaperedBox(verts, idxs, 0.4, 0.42, 0, 0.2, 0.05, 0.04, 0.52, 0.48, carbon);
    this.addStrut(verts, idxs, 0.05, 0.25, 0.2, 0.4, 0.42, 0.26, 0.025, carbon);
    this.addStrut(verts, idxs, 0.05, 0.25, -0.2, 0.4, 0.42, -0.26, 0.025, carbon);
    this.addStrut(verts, idxs, 0.05, 0.42, 0.24, 0.4, 0.42, 0.26, 0.025, carbon);
    this.addStrut(verts, idxs, 0.05, 0.42, -0.24, 0.4, 0.42, -0.26, 0.025, carbon);
    this.addBox(verts, idxs, 0.4, 0.46, 0, 0.1, 0.02, 0.1, carbon);
    this.addBox(verts, idxs, 0.92, 0.10, 0.13, 0.5, 0.05, 0.02, carbon);
    this.addBox(verts, idxs, 0.92, 0.10, -0.13, 0.5, 0.05, 0.02, carbon);
    this.addBox(verts, idxs, 0.85, 0.02, 0, 0.15, 0.02, 0.08, dark);
    this.addBox(verts, idxs, 1.40, 0.10, 0, 0.06, 0.015, 0.015, [0.3, 0.3, 0.35]);
    this.addBox(verts, idxs, 1.44, 0.10, 0, 0.02, 0.02, 0.02, [1, 0.1, 0.1]);
    const frontWingEls = [
      { x: 1.22, y: 0.05, span: 1.55, l: 0.36, h: 0.025, lift: 0.025 },
      { x: 1.15, y: 0.09, span: 1.48, l: 0.22, h: 0.025, lift: 0.022 },
      { x: 1.09, y: 0.07, span: 1.40, l: 0.16, h: 0.022, lift: 0.018 },
      { x: 1.03, y: 0.06, span: 1.32, l: 0.12, h: 0.02, lift: 0.015 },
      { x: 0.97, y: 0.05, span: 1.24, l: 0.08, h: 0.018, lift: 0.012 },
    ];
    for (const el of frontWingEls) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const z0 = -el.span / 2 + (el.span / segs) * i;
        const z1 = z0 + el.span / segs;
        const t0 = Math.abs(z0) / (el.span / 2);
        const t1 = Math.abs(z1) / (el.span / 2);
        const y0 = el.y + t0 * t0 * el.lift;
        const y1 = el.y + t1 * t1 * el.lift;
        this.addBox(verts, idxs, el.x, (y0 + y1) / 2, (z0 + z1) / 2, el.l, el.h, (z1 - z0) * 1.15, carbon);
      }
    }
    this.addTaperedBox(verts, idxs, 1.3, 0.12, 0.78, 0.4, 0.25, 0.15, 0.04, 0.04, carbon);
    this.addTaperedBox(verts, idxs, 1.3, 0.12, -0.78, 0.4, 0.25, 0.15, 0.04, 0.04, carbon);
    this.addBox(verts, idxs, 1.22, 0.04, 0.78, 0.36, 0.08, 0.03, carbon);
    this.addBox(verts, idxs, 1.22, 0.04, -0.78, 0.36, 0.08, 0.03, carbon);
    this.addBox(verts, idxs, 1.04, 0.12, 0.78, 0.02, 0.25, 0.03, carbon);
    this.addBox(verts, idxs, 1.04, 0.12, -0.78, 0.02, 0.25, 0.03, carbon);
    this.addBox(verts, idxs, 1.15, 0.22, 0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.15, 0.22, -0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, 0.70, 0.16, 0.05, 0.06, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, -0.70, 0.16, 0.05, 0.06, carbon);
    this.addBox(verts, idxs, 1.22, 0.08, 0.16, 0.12, 0.05, 0.04, carbon);
    this.addBox(verts, idxs, 1.22, 0.08, -0.16, 0.12, 0.05, 0.04, carbon);
    for (const sgn of [1, -1]) {
      this.addSmoothLoft(verts, idxs, POD_LOFT.map(s => ({ ...s, cz: s.cz! * sgn })), 22, [cr, cg, cb], true);
    }
    this.addBox(verts, idxs, 0.585, 0.19, 0.5, 0.02, 0.14, 0.28, dark);
    this.addBox(verts, idxs, 0.585, 0.19, -0.5, 0.02, 0.14, 0.28, dark);
    this.addBox(verts, idxs, 0.35, 0.04, 0.5, 0.6, 0.08, 0.34, dark);
    this.addBox(verts, idxs, 0.35, 0.04, -0.5, 0.6, 0.08, 0.34, dark);
    this.addBox(verts, idxs, -0.35, 0.26, 0.5, 0.3, 0.01, 0.16, dark);
    this.addBox(verts, idxs, -0.35, 0.26, -0.5, 0.3, 0.01, 0.16, dark);
    for (let g = 0; g < 3; g++) {
      const gx = 0.10 - g * 0.12;
      this.addBox(verts, idxs, gx, 0.12, 0.5, 0.02, 0.04, 0.02, dark);
      this.addBox(verts, idxs, gx, 0.12, -0.5, 0.02, 0.04, 0.02, dark);
    }
    this.addTaperedBox(verts, idxs, -0.25, 0.42, 0, 0.45, 0.09, 0.17, 0.16, 0.26, carbon);
    this.addBox(verts, idxs, -0.15, 0.47, 0, 0.1, 0.06, 0.14, dark);
    this.addBox(verts, idxs, -0.15, 0.45, 0, 0.08, 0.04, 0.02, carbon);
    const rearWingEls = [
      { x: -1.02, y: 0.35, span: 1.05, l: 0.30, h: 0.03, lift: 0.015 },
      { x: -1.02, y: 0.42, span: 1.08, l: 0.38, h: 0.035, lift: 0.02 },
      { x: -1.02, y: 0.49, span: 1.02, l: 0.26, h: 0.03, lift: 0.015 },
    ];
    for (const el of rearWingEls) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const z0 = -el.span / 2 + (el.span / segs) * i;
        const z1 = z0 + el.span / segs;
        const t0 = Math.abs(z0) / (el.span / 2);
        const t1 = Math.abs(z1) / (el.span / 2);
        const y0 = el.y + t0 * t0 * el.lift;
        const y1 = el.y + t1 * t1 * el.lift;
        this.addBox(baseWingVerts, baseWingIdxs, el.x, (y0 + y1) / 2, (z0 + z1) / 2, el.l, el.h, (z1 - z0) * 1.15, carbon);
      }
    }
    this.addBox(baseWingVerts, baseWingIdxs, -1.02, 0.42, 0.54, 0.38, 0.28, 0.045, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -1.02, 0.42, -0.54, 0.38, 0.28, 0.045, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -1.02, 0.38, 0.54, 0.02, 0.08, 0.025, dark);
    this.addBox(baseWingVerts, baseWingIdxs, -1.02, 0.38, -0.54, 0.02, 0.08, 0.025, dark);
    this.addBox(baseWingVerts, baseWingIdxs, -0.83, 0.42, 0.54, 0.03, 0.28, 0.02, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -0.83, 0.42, -0.54, 0.03, 0.28, 0.02, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -0.85, 0.40, 0, 0.10, 0.05, 0.08, grey);
    this.addBox(baseWingVerts, baseWingIdxs, -0.92, 0.32, 0.22, 0.10, 0.16, 0.04, grey);
    this.addBox(baseWingVerts, baseWingIdxs, -0.92, 0.32, -0.22, 0.10, 0.16, 0.04, grey);
    this.addBox(baseWingVerts, baseWingIdxs, -0.95, 0.30, 0.15, 0.06, 0.06, 0.03, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -0.95, 0.30, -0.15, 0.06, 0.06, 0.03, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -1.02, 0.45, 0, 0.06, 0.04, 0.92, carbon);
    this.addBox(baseWingVerts, baseWingIdxs, -1.04, 0.28, 0, 0.12, 0.02, 0.50, carbon);
    this.addBox(verts, idxs, 0.55, 0.10, 0.33, 0.30, 0.12, 0.02, carbon);
    this.addBox(verts, idxs, 0.55, 0.10, -0.33, 0.30, 0.12, 0.02, carbon);
    this.addBox(verts, idxs, 0.55, 0.07, 0.38, 0.26, 0.08, 0.015, carbon);
    this.addBox(verts, idxs, 0.55, 0.07, -0.38, 0.26, 0.08, 0.015, carbon);
    this.addBox(verts, idxs, 0.55, 0.05, 0.43, 0.20, 0.05, 0.012, carbon);
    this.addBox(verts, idxs, 0.55, 0.05, -0.43, 0.20, 0.05, 0.012, carbon);
    this.addBox(verts, idxs, 0.55, 0.015, 0.38, 0.20, 0.01, 0.12, carbon);
    this.addBox(verts, idxs, 0.55, 0.015, -0.38, 0.20, 0.01, 0.12, carbon);
    this.addBox(verts, idxs, 1.15, 0.22, 0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.15, 0.22, -0.74, 0.12, 0.06, 0.08, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, 0.70, 0.16, 0.05, 0.06, carbon);
    this.addBox(verts, idxs, 1.12, 0.18, -0.70, 0.16, 0.05, 0.06, carbon);
    this.addTaperedBox(verts, idxs, 0.35, 0.06, 0.35, 0.25, 0.06, 0.01, 0.14, 0.02, carbon);
    this.addTaperedBox(verts, idxs, 0.35, 0.06, -0.35, 0.25, 0.06, 0.01, 0.14, 0.02, carbon);
    this.addBox(verts, idxs, 0.62, 0.12, 0.62, 0.10, 0.10, 0.06, carbon);
    this.addBox(verts, idxs, 0.62, 0.12, -0.62, 0.10, 0.10, 0.06, carbon);
    this.addBox(verts, idxs, 0.67, 0.12, 0.62, 0.02, 0.06, 0.04, dark);
    this.addBox(verts, idxs, 0.67, 0.12, -0.62, 0.02, 0.06, 0.04, dark);
    this.addStrut(verts, idxs, 0.62, 0.12, 0.62, 0.72, 0.06, 0.72, 0.015, grey);
    this.addStrut(verts, idxs, 0.62, 0.12, -0.62, 0.72, 0.06, -0.72, 0.015, grey);
    this.addBox(accFixedVerts, accFixedIdxs, -0.1, 0.30, 0.505, 0.5, 0.02, 0.005, [1, 1, 1]);
    this.addBox(accFixedVerts, accFixedIdxs, -0.1, 0.30, -0.505, 0.5, 0.02, 0.005, [1, 1, 1]);
    this.addBox(verts, idxs, 0.35, 0.30, 0.60, 0.10, 0.05, 0.07, grey);
    this.addBox(verts, idxs, 0.35, 0.30, -0.60, 0.10, 0.05, 0.07, grey);
    this.addStrut(verts, idxs, 0.30, 0.24, 0.52, 0.35, 0.30, 0.60, 0.02, carbon);
    this.addStrut(verts, idxs, 0.30, 0.24, -0.52, 0.35, 0.30, -0.60, 0.02, carbon);
    this.addBox(verts, idxs, 0.40, 0.30, 0.60, 0.02, 0.03, 0.05, [0.6, 0.65, 0.7]);
    this.addBox(verts, idxs, 0.40, 0.30, -0.60, 0.02, 0.03, 0.05, [0.6, 0.65, 0.7]);
    this.addCylinder(accFixedVerts, accFixedIdxs, -0.72, 0.28, 0.18, 0.04, 0.07, 10, [1, 1, 1]);
    this.addCylinder(accFixedVerts, accFixedIdxs, -0.72, 0.28, -0.18, 0.04, 0.07, 10, [1, 1, 1]);
    this.addCylinder(accFixedVerts, accFixedIdxs, -0.70, 0.28, 0.18, 0.025, 0.02, 8, dark);
    this.addCylinder(accFixedVerts, accFixedIdxs, -0.70, 0.28, -0.18, 0.025, 0.02, 8, dark);
    // Accent side-pod stripes — segmented racing stripes along the side-pod
    // flanks (mirroring the decal treatment). The z-aware collision filter
    // (which segments survive a given decal style) lives in the shared
    // getAccentSegsForStyle() helper so the garage preview and the 3D mesh
    // always agree. Fixed accent bits (mirrors, engine-cover cylinders) are
    // always included. Each plate is tinted by ACCENT_COLORS at draw time.
    const accentGeoms = new Map<number, { v: number[]; i: number[] }>();
    // Key 0 = no decal equipped (all accent segments shown).
    for (const styleKey of [0, ...Object.keys(DECAL_LAYOUTS).map(Number)]) {
      const gv: number[] = [...accFixedVerts];
      const gi: number[] = [...accFixedIdxs];
      for (const [cx, , l, , d, z] of getAccentSegsForStyle(styleKey)) {
        this.addSurfacePlate(gv, gi, cx, z, l, d, carPodTopY, [1, 1, 1]);
        this.addSurfacePlate(gv, gi, cx, -z, l, d, carPodTopY, [1, 1, 1]);
      }
      accentGeoms.set(styleKey, { v: gv, i: gi });
    }
    this.addBox(verts, idxs, -1.035, 0.52, 0, 0.05, 0.07, 0.06, [1, 0.15, 0.15]);
    this.addBox(verts, idxs, -1.03, 0.52, 0.02, 0.01, 0.03, 0.01, [1, 0.5, 0.5]);
    this.addBox(verts, idxs, -1.03, 0.52, -0.02, 0.01, 0.03, 0.01, [1, 0.5, 0.5]);
    this.addBox(verts, idxs, -1.03, 0.52, 0, 0.01, 0.03, 0.01, [1, 0.5, 0.5]);
    this.addBox(verts, idxs, -0.20, 0.50, 0, 0.04, 0.05, 0.05, [1.0, 0.9, 0.2]);
    this.addCylinder(verts, idxs, -0.60, 0.39, 0, 0.008, 0.30, 8, grey);
    this.addBox(verts, idxs, -0.55, 0.40, 0, 0.50, 0.16, 0.015, carbon);
    // Per-style livery decals — geometry is built per style id below, once
    // `stride` is in scope (see the VAO loop after the car buffer setup).
    this.addStrut(verts, idxs, 0.58, 0.16, 0.22, 0.72, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.58, 0.16, -0.22, 0.72, 0.06, -0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.54, 0.16, 0.22, 0.68, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.54, 0.16, -0.22, 0.68, 0.06, -0.72, 0.025, carbon);
    this.addStrut(verts, idxs, 0.62, 0.05, 0.22, 0.78, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.62, 0.05, -0.22, 0.78, 0.02, -0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.58, 0.05, 0.22, 0.74, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.58, 0.05, -0.22, 0.74, 0.02, -0.74, 0.025, carbon);
    this.addStrut(verts, idxs, 0.68, 0.03, 0.72, 0.60, 0.14, 0.18, 0.015, grey);
    this.addStrut(verts, idxs, 0.68, 0.03, -0.72, 0.60, 0.14, -0.18, 0.015, grey);
    this.addStrut(verts, idxs, 0.60, 0.14, 0.18, 0.60, 0.14, -0.18, 0.012, grey);
    this.addStrut(verts, idxs, -0.52, 0.16, 0.22, -0.64, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.52, 0.16, -0.22, -0.64, 0.06, -0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.16, 0.22, -0.68, 0.06, 0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.16, -0.22, -0.68, 0.06, -0.72, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.05, 0.22, -0.70, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.56, 0.05, -0.22, -0.70, 0.02, -0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.60, 0.05, 0.22, -0.74, 0.02, 0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.60, 0.05, -0.22, -0.74, 0.02, -0.74, 0.025, carbon);
    this.addStrut(verts, idxs, -0.54, 0.14, 0.18, -0.54, 0.14, -0.18, 0.012, grey);
    const vertArray = new Float32Array(verts);
    const idxArray = new Uint16Array(idxs);
    this.carCount = idxArray.length;
    this.carVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.carVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    // Per-style livery decals — one VAO per decal style id, each with its own
    // placement layout (see DECAL_LAYOUTS) so stripes, flames, emblems, number
    // plates etc. put their artwork in different spots on the car. Plates hug
    // the local body surface (the loft's top tapers toward nose and tail) and
    // are tinted by DECAL_COLORS at draw time.
    for (const styleIdStr of Object.keys(DECAL_LAYOUTS)) {
      const styleId = Number(styleIdStr);
      const layout = DECAL_LAYOUTS[styleId] ?? DECAL_LAYOUTS[401];
      const gv: number[] = [];
      const gi: number[] = [];
      for (const [cx, , l, , d, z] of layout.flank) {
        this.addSurfacePlate(gv, gi, cx, z, l, d, carBodyTopY, [1, 1, 1]);
        this.addSurfacePlate(gv, gi, cx, -z, l, d, carBodyTopY, [1, 1, 1]);
      }
      for (const [cx, , l, , d] of layout.center) {
        this.addSurfacePlate(gv, gi, cx, 0, l, d, carBodyTopY, [1, 1, 1]);
      }
      const decVao = gl.createVertexArray()!;
      gl.bindVertexArray(decVao);
      const dvbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, dvbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
      const dibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(gi), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
      this.decalVaos.set(styleId, { vao: decVao, count: gi.length });
    }
    gl.bindVertexArray(null);
    for (const [styleKey, geom] of accentGeoms) {
      const accVao = gl.createVertexArray()!;
      gl.bindVertexArray(accVao);
      const avbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, avbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.v), gl.STATIC_DRAW);
      const aibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, aibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geom.i), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
      this.accentVaos.set(styleKey, { vao: accVao, count: geom.i.length });
    }
    gl.bindVertexArray(null);

    // Spoiler upgrades — extra rear-wing elements stacked above the base wing,
    // one VAO per spoiler id. Each variant gets its OWN baked colour and a
    // clearly different silhouette (height, span, element count) so the garage
    // preview actually changes between upgrades — the old build used one
    // near-black colour and nearly-identical thin planes for every id, which
    // made all seven look the same. Colours are baked; the draw sets uColor to
    // white so they show as-is.
    const spoilerGeoms = new Map<number, { v: number[]; i: number[] }>();
    {
      const carbon = [0.10, 0.10, 0.12];
      const silver = [0.72, 0.74, 0.80];
      const titanium = [0.45, 0.62, 0.90];
      const gold = [0.92, 0.72, 0.18];
      const red = [0.85, 0.16, 0.14];
      const white = [0.88, 0.88, 0.92];
      const teal = [0.10, 0.72, 0.78];
      const plane = (gv: number[], gi: number[], y: number, span: number, chord: number, c: number[]) => {
        this.addBox(gv, gi, -1.02, y, 0, chord, 0.025, span, c);
      };
      // The stock rear wing is removed when a spoiler is equipped (renderCar
      // skips baseWingVao), so the spoiler's own supports must reach down to
      // the rear bodywork (~0.22) instead of starting at the old wing base.
      const endplate = (gv: number[], gi: number[], _yb: number, yTop: number, c: number[]) => {
        const yb = 0.24;
        this.addBox(gv, gi, -1.02, (yb + yTop) / 2, 0.54, 0.22, yTop - yb, 0.028, c);
        this.addBox(gv, gi, -1.02, (yb + yTop) / 2, -0.54, 0.22, yTop - yb, 0.028, c);
      };
      const pylon = (gv: number[], gi: number[], z: number, yTop: number, c: number[]) => {
        this.addStrut(gv, gi, -1.02, 0.22, z, -1.02, yTop, z, 0.028, c);
      };
      const build = (id: number, fn: (gv: number[], gi: number[]) => void) => {
        const gv: number[] = [];
        const gi: number[] = [];
        fn(gv, gi);
        spoilerGeoms.set(id, { v: gv, i: gi });
      };
      build(101, (gv, gi) => { // Carbon Wing — single tall element, gloss black.
        plane(gv, gi, 0.62, 1.00, 0.18, carbon);
        endplate(gv, gi, 0.54, 0.70, silver);
        pylon(gv, gi, 0.30, 0.62, carbon); pylon(gv, gi, -0.30, 0.62, carbon);
      });
      build(102, (gv, gi) => { // Dual Wing — silver stacked elements, wide.
        plane(gv, gi, 0.56, 1.06, 0.14, silver);
        plane(gv, gi, 0.70, 1.16, 0.20, silver);
        endplate(gv, gi, 0.54, 0.76, carbon);
        pylon(gv, gi, 0.30, 0.70, silver); pylon(gv, gi, -0.30, 0.70, silver);
      });
      build(103, (gv, gi) => { // DRS Wing — titanium split main plane + narrow nose.
        this.addBox(gv, gi, -1.02, 0.68, -0.28, 0.20, 0.028, 0.40, titanium);
        this.addBox(gv, gi, -1.02, 0.68, 0.28, 0.20, 0.028, 0.40, titanium);
        plane(gv, gi, 0.58, 0.24, 0.14, titanium);
        endplate(gv, gi, 0.56, 0.74, titanium);
        pylon(gv, gi, 0.30, 0.68, titanium); pylon(gv, gi, -0.30, 0.68, titanium);
      });
      build(104, (gv, gi) => { // Gurney Flap — white low plane + tall trailing lip.
        plane(gv, gi, 0.56, 1.10, 0.16, white);
        this.addBox(gv, gi, -1.12, 0.60, 0, 0.02, 0.10, 1.06, red);
        endplate(gv, gi, 0.54, 0.66, white);
        pylon(gv, gi, 0.30, 0.56, white); pylon(gv, gi, -0.30, 0.56, white);
      });
      build(105, (gv, gi) => { // Whale Tail — gold long swept wide plane.
        plane(gv, gi, 0.58, 1.24, 0.30, gold);
        this.addBox(gv, gi, -1.13, 0.62, 0, 0.16, 0.03, 1.20, gold);
        endplate(gv, gi, 0.56, 0.70, gold);
        pylon(gv, gi, 0.30, 0.58, gold); pylon(gv, gi, -0.30, 0.58, gold);
      });
      build(106, (gv, gi) => { // Bi-Plane — red double-deck with cross struts.
        plane(gv, gi, 0.56, 0.92, 0.16, red);
        plane(gv, gi, 0.74, 1.02, 0.16, red);
        this.addStrut(gv, gi, -1.02, 0.56, 0, -1.02, 0.74, 0, 0.022, carbon);
        this.addStrut(gv, gi, -1.02, 0.56, 0.30, -1.02, 0.74, 0.30, 0.022, carbon);
        this.addStrut(gv, gi, -1.02, 0.56, -0.30, -1.02, 0.74, -0.30, 0.022, carbon);
        endplate(gv, gi, 0.56, 0.78, carbon);
        pylon(gv, gi, 0.30, 0.74, red); pylon(gv, gi, -0.30, 0.74, red);
      });
      build(107, (gv, gi) => { // Aero DRS+ — teal triple stacked element.
        plane(gv, gi, 0.56, 0.94, 0.12, teal);
        this.addBox(gv, gi, -1.02, 0.68, -0.26, 0.16, 0.024, 0.32, teal);
        this.addBox(gv, gi, -1.02, 0.68, 0.26, 0.16, 0.024, 0.32, teal);
        plane(gv, gi, 0.78, 1.08, 0.18, teal);
        endplate(gv, gi, 0.56, 0.84, carbon);
        pylon(gv, gi, 0.30, 0.78, teal); pylon(gv, gi, -0.30, 0.78, teal);
      });
    }
    // Exhaust upgrades — tail tips poking out of the rear deck, one VAO per id.
    const exhaustGeoms = new Map<number, { v: number[]; i: number[] }>();
    {
      // The body loft's rear face sits at x = -1.06 with the deck ~0.19 high;
      // the rear wing starts above y ≈ 0.35 and the diffuser tops out at
      // ~0.10. Tips are placed in the clear band behind the bodywork (x ≈
      // -1.12, y ≈ 0.14) so they visibly protrude from the tail instead of
      // being buried inside the shell — this is what made every exhaust look
      // identical (invisible) in the garage before.
      const silver = [0.8, 0.82, 0.88];
      const titanium = [0.42, 0.62, 0.95];
      const carbon = [0.12, 0.12, 0.14];
      const tip = (gv: number[], gi: number[], z: number, h: number, w: number, c: number[]) => {
        this.addBox(gv, gi, -1.12, 0.14, z, 0.16, h, w, c);
      };
      const surround = (gv: number[], gi: number[], z: number, h: number, w: number) => {
        this.addBox(gv, gi, -1.09, 0.14, z, 0.08, h + 0.02, w + 0.02, carbon);
      };
      const build = (id: number, fn: (gv: number[], gi: number[]) => void) => {
        const gv: number[] = [];
        const gi: number[] = [];
        fn(gv, gi);
        exhaustGeoms.set(id, { v: gv, i: gi });
      };
      build(301, (gv, gi) => { // Sport Exhaust — twin chrome tips.
        tip(gv, gi, 0.14, 0.06, 0.06, silver);
        tip(gv, gi, -0.14, 0.06, 0.06, silver);
      });
      build(302, (gv, gi) => { // Titanium Tips — blue-burn tips.
        tip(gv, gi, 0.14, 0.06, 0.06, titanium);
        tip(gv, gi, -0.14, 0.06, 0.06, titanium);
      });
      build(303, (gv, gi) => { // Twin Exhaust — four chrome tips.
        tip(gv, gi, 0.09, 0.05, 0.05, silver);
        tip(gv, gi, 0.19, 0.05, 0.05, silver);
        tip(gv, gi, -0.09, 0.05, 0.05, silver);
        tip(gv, gi, -0.19, 0.05, 0.05, silver);
      });
      build(304, (gv, gi) => { // Quad — four large tips with carbon surround.
        surround(gv, gi, 0.09, 0.065, 0.06);
        surround(gv, gi, 0.19, 0.065, 0.06);
        surround(gv, gi, -0.09, 0.065, 0.06);
        surround(gv, gi, -0.19, 0.065, 0.06);
        tip(gv, gi, 0.09, 0.065, 0.06, silver);
        tip(gv, gi, 0.19, 0.065, 0.06, silver);
        tip(gv, gi, -0.09, 0.065, 0.06, silver);
        tip(gv, gi, -0.19, 0.065, 0.06, silver);
      });
      build(305, (gv, gi) => { // Carbon Exhaust — dark tips.
        surround(gv, gi, 0.14, 0.06, 0.06);
        surround(gv, gi, -0.14, 0.06, 0.06);
        tip(gv, gi, 0.14, 0.06, 0.06, carbon);
        tip(gv, gi, -0.14, 0.06, 0.06, carbon);
      });
    }
    const buildPartVao = (geom: { v: number[]; i: number[] }): { vao: WebGLVertexArrayObject; count: number } => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.v), gl.STATIC_DRAW);
      const ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geom.i), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
      return { vao, count: geom.i.length };
    };
    for (const [id, geom] of spoilerGeoms) this.spoilerVaos.set(id, buildPartVao(geom));
    gl.bindVertexArray(null);
    for (const [id, geom] of exhaustGeoms) this.exhaustVaos.set(id, buildPartVao(geom));
    gl.bindVertexArray(null);
    // Stock rear wing — separate VAO so an equipped spoiler replaces it.
    const baseWingVao = buildPartVao({ v: baseWingVerts, i: baseWingIdxs });
    this.baseWingVao = baseWingVao.vao;
    this.baseWingCount = baseWingVao.count;
    gl.bindVertexArray(null);

    const buildGlowQuad = (glowL: number, glowW: number): { vao: WebGLVertexArrayObject; count: number } => {
      const gv: number[] = [];
      const gi: number[] = [];
      const gy = -0.11;
      gv.push(-glowL, gy, -glowW, 0, 1, 0, 1, 1, 1, 0, 0);
      gv.push(glowL, gy, -glowW, 0, 1, 0, 1, 1, 1, 1, 0);
      gv.push(glowL, gy, glowW, 0, 1, 0, 1, 1, 1, 1, 1);
      gv.push(-glowL, gy, -glowW, 0, 1, 0, 1, 1, 1, 0, 0);
      gv.push(glowL, gy, glowW, 0, 1, 0, 1, 1, 1, 1, 1);
      gv.push(-glowL, gy, glowW, 0, 1, 0, 1, 1, 1, 0, 1);
      gi.push(0, 1, 2, 3, 4, 5);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const gvbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, gvbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
      const gibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(gi), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
      gl.bindVertexArray(null);
      return { vao, count: gi.length };
    };
    const core = buildGlowQuad(2.0, 1.0);
    this.glowVao = core.vao;
    this.glowCount = core.count;
    const halo = buildGlowQuad(3.0, 1.5);
    this.glowHaloVao = halo.vao;
    this.glowHaloCount = halo.count;
    this.buildWheelMesh();
    this.buildHeadlightQuads();
  }
  private buildNightGlow() {
    const gl = this.gl;
    if (this.nightVao) { try { gl.deleteVertexArray(this.nightVao); } catch { } }
    this.nightCount = 0;
    if (!this.night) return;
    const pts = this._trackPoints;
    if (!pts.length) return;
    const verts: number[] = [];
    const idxs: number[] = [];
    const warm: [number, number, number] = [1.0, 0.8, 0.42];
    const lampWarm: [number, number, number] = [1.0, 0.9, 0.6];
    let winIdx = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        if (Math.random() < 0.4) continue;
        const dist = p.width / 2 + 15 + Math.random() * 12;
        const wx = p.x + ppx * dist * side;
        const wz = p.z + ppz * dist * side;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const wy = 3 + Math.random() * 5;
          const w = 0.35 + Math.random() * 0.25;
          const h = 0.5 + Math.random() * 0.35;
          this.addQuad(verts, idxs,
            [wx - p.dirX * w, wy, wz - p.dirZ * w],
            [wx + p.dirX * w, wy, wz + p.dirZ * w],
            [wx + p.dirX * w, wy + h, wz + p.dirZ * w],
            [wx - p.dirX * w, wy + h, wz - p.dirZ * w],
            Math.random() < 0.7 ? warm : [0.16, 0.2, 0.35]);
        }
        if (winIdx++ > 220) break;
      }
      if (winIdx > 220) break;
    }
    for (let i = 0; i < pts.length; i += 20) {
      const p = pts[i];
      const ppx = -p.dirZ;
      const ppz = p.dirX;
      for (const side of [-1, 1]) {
        const lx = p.x + ppx * (p.width / 2 + 1) * side;
        const lz = p.z + ppz * (p.width / 2 + 1) * side;
        // Lamp pole (grounds the head so it doesn't float over the street).
        // Drawn in the additive night pass, so keep it near-black — it adds a
        // faint dark stick under the glowing head instead of a new glow streak.
        this.addQuad(verts, idxs,
          [lx - 0.05, -0.2, lz],
          [lx + 0.05, -0.2, lz],
          [lx + 0.05, 2.7, lz],
          [lx - 0.05, 2.7, lz],
          [0.03, 0.035, 0.05]);
        this.addQuad(verts, idxs,
          [lx - 0.22, 2.7, lz],
          [lx + 0.22, 2.7, lz],
          [lx + 0.22, 3.3, lz],
          [lx - 0.22, 3.3, lz],
          lampWarm);
        const fx = p.dirX, fz = p.dirZ;
        // Ground light pool sits AT street height (the shoulder plane is -0.2,
        // the racing surface is 0) so it hugs the sidewalk instead of hovering.
        // The track's depth edge naturally clips the part under the asphalt,
        // keeping the racing line clean.
        this.addQuad(verts, idxs,
          [lx - fx * 2.4, -0.18, lz - fz * 2.4],
          [lx + fx * 2.4, -0.18, lz + fz * 2.4],
          [lx + fx * 2.4 + ppx * 1.9 * side, -0.18, lz + fz * 2.4 + ppz * 1.9 * side],
          [lx - fx * 2.4 + ppx * 1.9 * side, -0.18, lz - fz * 2.4 + ppz * 1.9 * side],
          [0.9, 0.72, 0.4]);
      }
    }
    let outer = 0;
    for (const p of pts) { const r = Math.hypot(p.x, p.z) + p.width / 2; if (r > outer) outer = r; }
    for (let k = 0; k < 3; k++) {
      const ang = -0.6 + k * 0.5;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const tx = -dz, tz = dx;
      const mx = dx * (outer + 8);
      const mz = dz * (outer + 8);
      this.addQuad(verts, idxs,
        [mx - tx * 9, -0.18, mz - tz * 9],
        [mx + tx * 9, -0.18, mz + tz * 9],
        [mx + tx * 9 + dx * 3.2, -0.18, mz + tz * 9 + dz * 3.2],
        [mx - tx * 9 + dx * 3.2, -0.18, mz - tz * 9 + dz * 3.2],
        [0.45, 0.55, 0.85]);
    }
    if (!idxs.length) return;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idxs), gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.nightVao = vao;
    this.nightCount = idxs.length;
  }
  private buildHeadlightQuads() {
    const gl = this.gl;
    if (this.headlightVao) { try { gl.deleteVertexArray(this.headlightVao); } catch { } }
    const gv: number[] = [];
    const gi: number[] = [];
    const gy = -0.10;
    // Headlight pools are trapezoids (conical): narrow right at the car,
    // flaring outward as they reach forward, instead of flat rectangles.
    const x0 = 1.7, x1 = 5.3;                 // near (at bumper) .. far (ahead)
    const zMid = -0.55, zHi = 0.55;           // inner edges start at the lamps, diverge outward
    const zLoNear = -1.05, zLoFar = -2.6;     // left outer edge: flares outward
    const zHiNear = 1.05, zHiFar = 2.6;       // right outer edge: flares outward
    const pushQuad = (ax: number, az: number, bx: number, bz: number,
      cx: number, cz: number, dx: number, dz: number) => {
      const b = gv.length / 11;
      for (const [px, pz] of [[ax, az], [bx, bz], [cx, cz], [dx, dz]]) {
        gv.push(px, gy, pz, 0, 1, 0, 1, 1, 1, 0, 0);
      }
      gi.push(b, b + 1, b + 2, b + 2, b + 3, b);
    };
    pushQuad(x0, zLoNear, x1, zLoFar, x1, zMid, x0, zMid);
    pushQuad(x0, zHi, x1, zHi, x1, zHiFar, x0, zHiNear);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(gi), gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.headlightVao = vao;
    this.headlightCount = gi.length;
  }
  private buildWheelMesh() {
    const gl = this.gl;
    const stride = 11 * 4;
    const fv: number[] = [];
    const fi: number[] = [];
    const fvRim: number[] = [];
    const fiRim: number[] = [];
    const fb: number[] = [];
    const fbi: number[] = [];
    const frf: number[] = [];
    const frfi: number[] = [];
    const frfL: number[] = [];
    const frfiL: number[] = [];
    this.addCylinder(fvRim, fiRim, 0, 0, 0, 0.165, 0.15, 18, [1, 1, 1]);
    this.addRimRing(frf, frfi, 0, 0.152, 0, 0.135, 0.065, [1, 1, 1]);
    this.addRimRing(frfL, frfiL, 0, 0.152, 0, 0.135, 0.065, [1, 1, 1], true);
    this.addCylinder(fv, fi, 0, 0, 0, 0.17, 0.12, 18, [0.13, 0.13, 0.14]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.2;
      this.addBox(fv, fi, Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17, 0.02, 0.01, 0.02, [0.2, 0.2, 0.2]);
    }
    this.addCylinder(fv, fi, 0.14, 0.05, 0, 0.008, 0.05, 6, [0.2, 0.2, 0.2]);
    this.addCylinder(fb, fbi, 0, 0, 0, 0.078, 0.17, 22, [0.42, 0.40, 0.38]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.35;
      this.addCylinder(fb, fbi, Math.cos(a) * 0.052, 0, Math.sin(a) * 0.052, 0.011, 0.19, 8, [0.03, 0.03, 0.04]);
    }
    this.addBox(fb, fbi, 0.07, 0.16, 0, 0.045, 0.05, 0.06, [0.85, 0.12, 0.10]);
    this.addCylinder(fb, fbi, 0, 0, 0, 0.028, 0.19, 12, [0.22, 0.22, 0.26]);
    const fvaRim = new Float32Array(fvRim);
    const fiaRim = new Uint16Array(fiRim);
    this.wheelRimCount = fiaRim.length;
    this.wheelRimVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.wheelRimVao);
    const rvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rvbo);
    gl.bufferData(gl.ARRAY_BUFFER, fvaRim, gl.STATIC_DRAW);
    const ribo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fiaRim, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    const fva = new Float32Array(fv);
    const fia = new Uint16Array(fi);
    this.wheelCount = fia.length;
    this.wheelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.wheelVao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, fva, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, fia, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.brakeCount = fbi.length;
    this.brakeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.brakeVao);
    const bvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bvbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fb), gl.STATIC_DRAW);
    const bibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(fbi), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.rimFaceCount = frfi.length;
    this.rimFaceVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rimFaceVao);
    const rfbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rfbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frf), gl.STATIC_DRAW);
    const rfibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rfibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(frfi), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.rimFaceCountL = frfiL.length;
    this.rimFaceVaoL = gl.createVertexArray()!;
    gl.bindVertexArray(this.rimFaceVaoL);
    const rflbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rflbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frfL), gl.STATIC_DRAW);
    const rflibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rflibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(frfiL), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    const rv: number[] = [];
    const ri: number[] = [];
    const rvRim: number[] = [];
    const riRim: number[] = [];
    const rb: number[] = [];
    const rbi: number[] = [];
    const rrf: number[] = [];
    const rrfi: number[] = [];
    const rrfL: number[] = [];
    const rrfiL: number[] = [];
    this.addCylinder(rvRim, riRim, 0, 0, 0, 0.175, 0.18, 18, [1, 1, 1]);
    this.addRimRing(rrf, rrfi, 0, 0.182, 0, 0.145, 0.07, [1, 1, 1]);
    this.addRimRing(rrfL, rrfiL, 0, 0.182, 0, 0.145, 0.07, [1, 1, 1], true);
    this.addCylinder(rv, ri, 0, 0, 0, 0.18, 0.15, 18, [0.13, 0.13, 0.14]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.2;
      this.addBox(rv, ri, Math.cos(a) * 0.18, 0.15, Math.sin(a) * 0.18, 0.02, 0.01, 0.02, [0.2, 0.2, 0.2]);
    }
    this.addCylinder(rv, ri, 0.15, 0.06, 0, 0.008, 0.05, 6, [0.2, 0.2, 0.2]);
    this.addCylinder(rb, rbi, 0, 0, 0, 0.088, 0.2, 22, [0.42, 0.40, 0.38]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.35;
      this.addCylinder(rb, rbi, Math.cos(a) * 0.058, 0, Math.sin(a) * 0.058, 0.012, 0.215, 8, [0.03, 0.03, 0.04]);
    }
    this.addBox(rb, rbi, 0.08, 0.19, 0, 0.05, 0.055, 0.065, [0.85, 0.12, 0.10]);
    this.addCylinder(rb, rbi, 0, 0, 0, 0.031, 0.22, 12, [0.22, 0.22, 0.26]);
    const rvaRim = new Float32Array(rvRim);
    const riaRim = new Uint16Array(riRim);
    this.rearWheelRimCount = riaRim.length;
    this.rearWheelRimVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearWheelRimVao);
    const rrvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrvbo);
    gl.bufferData(gl.ARRAY_BUFFER, rvaRim, gl.STATIC_DRAW);
    const rribo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rribo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, riaRim, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    const rva = new Float32Array(rv);
    const ria = new Uint16Array(ri);
    this.rearWheelCount = ria.length;
    this.rearWheelVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearWheelVao);
    const rrvbo2 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrvbo2);
    gl.bufferData(gl.ARRAY_BUFFER, rva, gl.STATIC_DRAW);
    const rribo2 = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rribo2);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ria, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.rearBrakeCount = rbi.length;
    this.rearBrakeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearBrakeVao);
    const rbbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rbbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rb), gl.STATIC_DRAW);
    const rbibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rbibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(rbi), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.rearRimFaceCount = rrfi.length;
    this.rearRimFaceVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearRimFaceVao);
    const rrfbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrfbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rrf), gl.STATIC_DRAW);
    const rrfibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rrfibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(rrfi), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this.rearRimFaceCountL = rrfiL.length;
    this.rearRimFaceVaoL = gl.createVertexArray()!;
    gl.bindVertexArray(this.rearRimFaceVaoL);
    const rrlbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, rrlbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rrfL), gl.STATIC_DRAW);
    const rrlibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rrlibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(rrfiL), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  private addRimRing(verts: number[], idxs: number[], cx: number, cy: number, cz: number, outerRadius: number, innerRadius: number, color: number[], flipU = false) {
    const [r, g, b] = color;
    const segments = 28;
    const baseIdx = verts.length / 11;
    const uOf = (x: number) => 0.5 + (flipU ? -1 : 1) * x / (outerRadius * 2);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * innerRadius;
      const z = Math.sin(a) * innerRadius;
      verts.push(cx + x, cy, cz + z, 0, 1, 0, r, g, b, uOf(x), 0.5 + z / (outerRadius * 2));
    }
    const innerStart = baseIdx;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * outerRadius;
      const z = Math.sin(a) * outerRadius;
      verts.push(cx + x, cy, cz + z, 0, 1, 0, r, g, b, uOf(x), 0.5 + z / (outerRadius * 2));
    }
    const outerStart = innerStart + segments + 1;
    for (let i = 0; i < segments; i++) {
      idxs.push(innerStart + i, innerStart + i + 1, outerStart + i);
      idxs.push(innerStart + i + 1, outerStart + i + 1, outerStart + i);
    }
  }
  private addBox(verts: number[], idxs: number[], cx: number, cy: number, cz: number, l: number, h: number, w: number, color: number[]) {
    const hw = w / 2, hh = h / 2, hl = l / 2;
    const [r, g, b] = color;
    const n = [
      [0, 0, 1],
      [0, 0, -1],
      [-1, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, -1, 0]
    ];
    const v = [
      [-hl, -hh, -hw],
      [hl, -hh, -hw],
      [hl, hh, -hw],
      [-hl, hh, -hw],
      [-hl, -hh, hw],
      [hl, -hh, hw],
      [hl, hh, hw],
      [-hl, hh, hw]
    ];
    const faces = [
      [3, 2, 1, 0],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [1, 2, 6, 5],
      [3, 0, 4, 7]
    ];
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ];
    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];
      const norm = n[fi];
      const base = verts.length / 11;
      for (let vi = 0; vi < 4; vi++) {
        const vv = v[face[vi]];
        verts.push(cx + vv[0], cy + vv[1], cz + vv[2], norm[0], norm[1], norm[2], r, g, b, uvs[vi][0], uvs[vi][1]);
      }
      idxs.push(base, base + 1, base + 2);
      idxs.push(base + 2, base + 3, base);
    }
  }
  private addOrientedBox(verts: number[], idxs: number[], cx: number, cy: number, cz: number, len: number, h: number, wid: number, dirX: number, dirZ: number, color: number[]) {
    const dl = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const ux = dirX / dl, uz = dirZ / dl;
    const vx = -uz, vz = ux;
    const hl = len / 2, hh = h / 2, hw = wid / 2;
    const corner = (sx: number, sy: number, sz: number): number[] => [
      cx + ux * hl * sx + vx * hw * sz,
      cy + hh * sy,
      cz + uz * hl * sx + vz * hw * sz,
    ];
    const c00 = corner(-1, -1, -1), c01 = corner(-1, -1, 1), c02 = corner(-1, 1, -1), c03 = corner(-1, 1, 1);
    const c10 = corner(1, -1, -1), c11 = corner(1, -1, 1), c12 = corner(1, 1, -1), c13 = corner(1, 1, 1);
    this.addQuad(verts, idxs, c01, c00, c10, c11, color);
    this.addQuad(verts, idxs, c03, c13, c12, c02, color);
    this.addQuad(verts, idxs, c02, c12, c10, c00, color);
    this.addQuad(verts, idxs, c01, c11, c13, c03, color);
    this.addQuad(verts, idxs, c00, c01, c03, c02, color);
    this.addQuad(verts, idxs, c10, c12, c13, c11, color);
  }
  /** Flat livery plate that hugs a loft's top surface like a tattoo/wrap.
   * Corners are sampled on the surface (with a tiny lift so the plate never
   * z-fights the paint beneath), and the quad is split 6×2 so it follows the
   * body's slope and curvature instead of poking out as a solid block. */
  private addSurfacePlate(verts: number[], idxs: number[], cx: number, cz: number, l: number, d: number, topY: (x: number, z: number) => number, color: number[], lift = 0.006) {
    const hl = l / 2, hd = d / 2;
    const cols = 6, rows = 2;
    for (let ci = 0; ci < cols; ci++) {
      for (let ri = 0; ri < rows; ri++) {
        const x0 = cx - hl + (l / cols) * ci;
        const x1 = x0 + l / cols;
        const z0 = cz - hd + (d / rows) * ri;
        const z1 = z0 + d / rows;
        const p00 = [x0, topY(x0, z0) + lift, z0];
        const p10 = [x1, topY(x1, z0) + lift, z0];
        const p11 = [x1, topY(x1, z1) + lift, z1];
        const p01 = [x0, topY(x0, z1) + lift, z1];
        this.addQuad(verts, idxs, p00, p01, p11, p10, color);
      }
    }
  }
  private addQuad(verts: number[], idxs: number[], a: number[], b: number[], c: number[], d: number[], color: number[]) {
    const [r, g, bl] = color;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = verts.length / 11;
    for (const p of [a, b, c, d]) {
      verts.push(p[0], p[1], p[2], nx, ny, nz, r, g, bl, 0, 0);
    }
    idxs.push(base, base + 1, base + 2);
    idxs.push(base + 2, base + 3, base);
  }
  private addWindowQuad(verts: number[], idxs: number[], cx: number, cy: number, cz: number, w: number, h: number, nx: number, nz: number, color: number[]) {
    const hw = w / 2;
    const rx = nz, rz = -nx;
    const a = [cx - rx * hw, cy, cz - rz * hw];
    const b = [cx + rx * hw, cy, cz + rz * hw];
    const c = [cx + rx * hw, cy + h, cz + rz * hw];
    const d = [cx - rx * hw, cy + h, cz - rz * hw];
    this.addQuad(verts, idxs, a, b, c, d, color);
  }
  private addStrut(verts: number[], idxs: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: number[]) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let vx = 0, vy = 1, vz = 0;
    if (Math.abs(uy) > 0.9) { vx = 1; vy = 0; vz = 0; }
    const vdot = vx * ux + vy * uy + vz * uz;
    vx -= vdot * ux; vy -= vdot * uy; vz -= vdot * uz;
    const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    vx /= vlen; vy /= vlen; vz /= vlen;
    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;
    const h = t / 2;
    const a0 = [ax - vx * h - wx * h, ay - vy * h - wy * h, az - vz * h - wz * h];
    const a1 = [ax + vx * h - wx * h, ay + vy * h - wy * h, az + vz * h - wz * h];
    const a2 = [ax + vx * h + wx * h, ay + vy * h + wy * h, az + vz * h + wz * h];
    const a3 = [ax - vx * h + wx * h, ay - vy * h + wy * h, az - vz * h + wz * h];
    const b0 = [bx - vx * h - wx * h, by - vy * h - wy * h, bz - vz * h - wz * h];
    const b1 = [bx + vx * h - wx * h, by + vy * h - wy * h, bz + vz * h - wz * h];
    const b2 = [bx + vx * h + wx * h, by + vy * h + wy * h, bz + vz * h + wz * h];
    const b3 = [bx - vx * h + wx * h, by - vy * h + wy * h, bz - vz * h + wz * h];
    this.addQuad(verts, idxs, a0, a1, b1, b0, color);
    this.addQuad(verts, idxs, a2, a3, b3, b2, color);
    this.addQuad(verts, idxs, a1, a2, b2, b1, color);
    this.addQuad(verts, idxs, a0, b0, b3, a3, color);
    this.addQuad(verts, idxs, a0, a3, a2, a1, color);
    this.addQuad(verts, idxs, b0, b1, b2, b3, color);
  }
  private addTaperedBox(verts: number[], idxs: number[], cx: number, cy: number, cz: number, l: number, hBack: number, hFront: number, wBack: number, wFront: number, color: number[]) {
    const hl = l / 2, hhb = hBack / 2, hhf = hFront / 2, hwb = wBack / 2, hwf = wFront / 2;
    const b0 = [cx - hl, cy - hhb, cz - hwb];
    const b1 = [cx - hl, cy - hhb, cz + hwb];
    const b2 = [cx - hl, cy + hhb, cz + hwb];
    const b3 = [cx - hl, cy + hhb, cz - hwb];
    const f0 = [cx + hl, cy - hhf, cz - hwf];
    const f1 = [cx + hl, cy - hhf, cz + hwf];
    const f2 = [cx + hl, cy + hhf, cz + hwf];
    const f3 = [cx + hl, cy + hhf, cz - hwf];
    this.addQuad(verts, idxs, b1, b0, f0, f1, color);
    this.addQuad(verts, idxs, b2, f2, f3, b3, color);
    this.addQuad(verts, idxs, b3, f3, f0, b0, color);
    this.addQuad(verts, idxs, b1, f1, f2, b2, color);
    this.addQuad(verts, idxs, b0, b1, b2, b3, color);
    this.addQuad(verts, idxs, f0, f3, f2, f1, color);
  }
  private addSmoothLoft(verts: number[], idxs: number[], stations: Array<{ x: number; y: number; cz: number; h: number; w: number }>, segs: number, color: number[], closeCaps: boolean) {
    const n = 4;
    const ringIdx: number[][] = stations.map(st => {
      const row: number[] = [];
      const hw = st.w / 2, hh = st.h / 2;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const sx = ca < 0 ? -1 : 1, sy = sa < 0 ? -1 : 1;
        const lx = sx * Math.pow(Math.abs(ca), 2 / n) * hw;
        const ly = sy * Math.pow(Math.abs(sa), 2 / n) * hh;
        verts.push(st.x, st.y + ly, st.cz + lx, 0, 0, 0, color[0], color[1], color[2], 0, 0);
        row.push(verts.length / 11 - 1);
      }
      return row;
    });
    const acc: number[][] = [];
    const addN = (vi: number, nx: number, ny: number, nz: number) => {
      let a = acc[vi];
      if (!a) { a = [0, 0, 0]; acc[vi] = a; }
      a[0] += nx; a[1] += ny; a[2] += nz;
    };
    for (let s = 0; s < stations.length - 1; s++) {
      const A = ringIdx[s], B = ringIdx[s + 1];
      for (let i = 0; i < segs; i++) {
        const ax = verts[A[i] * 11], ay = verts[A[i] * 11 + 1], az = verts[A[i] * 11 + 2];
        const bx = verts[B[i] * 11], by = verts[B[i] * 11 + 1], bz = verts[B[i] * 11 + 2];
        const cx = verts[B[i + 1] * 11], cy = verts[B[i + 1] * 11 + 1], cz2 = verts[B[i + 1] * 11 + 2];
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz2 - az;
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const quad = [A[i], B[i], B[i + 1], A[i + 1]];
        for (const vi of quad) addN(vi, nx, ny, nz);
        idxs.push(A[i], B[i], B[i + 1]);
        idxs.push(B[i + 1], A[i + 1], A[i]);
      }
    }
    for (let s = 0; s < stations.length; s++) {
      for (const vi of ringIdx[s]) {
        const a = acc[vi];
        if (!a) continue;
        const len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
        verts[vi * 11 + 3] = a[0] / len;
        verts[vi * 11 + 4] = a[1] / len;
        verts[vi * 11 + 5] = a[2] / len;
      }
    }
    if (closeCaps) {
      const F = ringIdx[ringIdx.length - 1];
      const fc = stations[stations.length - 1];
      verts.push(fc.x, fc.y, fc.cz, 1, 0, 0, color[0], color[1], color[2], 0, 0);
      const fCenter = verts.length / 11 - 1;
      for (let i = 0; i < segs; i++) idxs.push(fCenter, F[i + 1], F[i]);
      const R = ringIdx[0];
      const rc = stations[0];
      verts.push(rc.x, rc.y, rc.cz, -1, 0, 0, color[0], color[1], color[2], 0, 0);
      const rCenter = verts.length / 11 - 1;
      for (let i = 0; i < segs; i++) idxs.push(rCenter, R[i], R[i + 1]);
    }
  }
  private addCylinder(verts: number[], idxs: number[], cx: number, cy: number, cz: number, radius: number, height: number, segments: number, color: number[]) {
    const [r, g, b] = color;
    const baseIdx = verts.length / 11;
    const stride = segments + 1;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      verts.push(cx + x, cy + height, cz + z, 0, 1, 0, r * 1.1, g * 1.1, b * 1.1, i / segments, 1);
    }
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      verts.push(cx + x, cy, cz + z, 0, -1, 0, r * 0.9, g * 0.9, b * 0.9, i / segments, 0);
    }
    const topStart = baseIdx;
    const bottomStart = baseIdx + stride;
    for (let i = 0; i < segments; i++) {
      idxs.push(bottomStart + i, topStart + i, topStart + i + 1);
      idxs.push(bottomStart + i, topStart + i + 1, bottomStart + i + 1);
    }
    const topCenter = verts.length / 11;
    verts.push(cx, cy + height, cz, 0, 1, 0, r, g, b, 0.5, 1);
    for (let i = 0; i < segments; i++) {
      idxs.push(topCenter, topStart + i + 1, topStart + i);
    }
    const bottomCenter = verts.length / 11;
    verts.push(cx, cy, cz, 0, -1, 0, r, g, b, 0.5, 0);
    for (let i = 0; i < segments; i++) {
      idxs.push(bottomCenter, bottomStart + i, bottomStart + i + 1);
    }
  }
  private addCone(verts: number[], idxs: number[], cx: number, cy: number, cz: number, radius: number, height: number, segments: number, color: number[]) {
    const [r, g, b] = color;
    const baseIdx = verts.length / 11;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, 0, -1, 0, r, g, b, i / segments, 0);
    }
    const tipIdx = verts.length / 11;
    verts.push(cx, cy + height, cz, 0, 1, 0, r * 1.3, g * 1.3, b * 1.3, 0.5, 1);
    for (let i = 0; i < segments; i++) {
      idxs.push(baseIdx + i, baseIdx + i + 1, baseIdx + segments + 1);
    }
    const sideStart = verts.length / 11;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5, r, g, b, i / segments, 0);
    }
    const tipIdx2 = verts.length / 11;
    verts.push(cx, cy + height, cz, 0, 0.7, 0, r * 1.1, g * 1.1, b * 1.1, 0.5, 1);
    for (let i = 0; i < segments; i++) {
      idxs.push(sideStart + i, tipIdx2, sideStart + i + 1);
    }
  }
  private addSphere(verts: number[], idxs: number[], cx: number, cy: number, cz: number, r: number, segments: number, color: number[]) {
    this.addEllipsoid(verts, idxs, cx, cy, cz, r, r, r, segments, color);
  }
  private addGrandstand(verts: number[], idxs: number[], gx: number, gz: number, dirX: number, dirZ: number, width: number, depth: number) {
    const ppx = -dirZ;
    const ppz = dirX;
    const hw = width / 2;
    const crowdShirts: [number, number, number][] = this.crowdShirtsForTheme();
    const skins: [number, number, number][] = [
      [0.85, 0.65, 0.5], [0.55, 0.36, 0.22], [0.95, 0.82, 0.66], [0.4, 0.26, 0.15],
    ];
    const hairs: [number, number, number][] = [
      [0.1, 0.08, 0.06], [0.55, 0.38, 0.18], [0.9, 0.85, 0.7], [0.18, 0.12, 0.08], [0.3, 0.2, 0.12],
    ];
    const standPeople: [number, number][] = [
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [-1.6, 1], [-0.6, 1], [0.4, 1], [1.4, 1], [2.4, 1],
    ];
    for (const [off, tier] of standPeople) {
      const bx = gx + ppx * (off * hw * 0.45 + tier * 0.9);
      const bz = gz + ppz * (off * hw * 0.35 + tier * 0.9);
      const ty = 0.1 + tier * 0.35;
      this._crowdPeople.push({
        x: bx,
        y: ty,
        z: bz,
        shirt: crowdShirts[Math.floor(Math.random() * crowdShirts.length)],
        skin: skins[Math.floor(Math.random() * skins.length)],
        hair: hairs[Math.floor(Math.random() * hairs.length)],
        pants: [0.12, 0.12, 0.16],
        pose: Math.floor(Math.random() * 3),
        scale: 0.9 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.addBox(verts, idxs, gx + ppx * 3, 2.5, gz + ppz * 3, 1.5, 0.1, hw * 2.5, [0.3, 0.3, 0.35]);
    for (const side of [-1, 1]) {
      this.addBox(verts, idxs, gx + ppx * 3 + ppx * side * hw * 1.2, 1.25, gz + ppz * 3 + ppz * side * hw * 1.2, 0.1, 2.5, 0.1, [0.3, 0.3, 0.35]);
    }
    for (const side of [-1, 1]) {
      const fx = gx + ppx * 0.6 * side;
      const fz = gz + ppz * 0.6 * side;
      this.addCylinder(verts, idxs, fx, 0, fz, 0.045, 2.4, 6, [0.55, 0.55, 0.58]);
      const flagCols = this.themeFlagColors();
      const col = flagCols[side === 1 ? 0 : 1];
      this._flags.push({
        x: fx + ppx * 0.35 * side, z: fz + ppz * 0.35 * side,
        dirX: ppx * side, dirZ: ppz * side,
        anchorY: 2.08, w: 0.35, h: 0.55,
        kind: 'rect',
        colors: [col, col, col],
        phase: Math.random() * Math.PI * 2,
        speed: 5 + Math.random() * 1.5,
        amp: 0.85 + Math.random() * 0.3,
      });
    }
  }
  private addFestivalCrowd(pts: { x: number; z: number; dirX: number; dirZ: number; width: number }[]) {
    if (!pts.length) return;
    const start = pts[0];
    const ppx = -start.dirZ;
    const ppz = start.dirX;
    const robeColors: [number, number, number][] = [
      [0.92, 0.88, 0.78],
      [0.75, 0.1, 0.1],
      [0.85, 0.8, 0.72],
      [0.1, 0.32, 0.14],
      [0.95, 0.93, 0.88],
    ];
    const patternColors: [number, number, number][] = [
      [0.85, 0.6, 0.1],
      [0.75, 0.1, 0.1],
      [0, 0.45, 0.15],
      [0.1, 0.35, 0.6],
    ];
    const skins: [number, number, number][] = [
      [0.55, 0.36, 0.22], [0.75, 0.55, 0.4], [0.4, 0.26, 0.15],
    ];
    const spots: [number, number, number][] = [
      [-4, 0, 0], [-3.2, 0, 0.2], [-2.4, 0, -0.15], [-1.6, 0, 0.1],
      [1.6, 0, -0.1], [2.4, 0, 0.15], [3.2, 0, -0.2], [4, 0, 0],
      [-3.6, 1, 0.4], [-2.8, 1, 0], [-2, 1, 0.3],
      [2, 1, -0.3], [2.8, 1, 0], [3.6, 1, 0.4],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [off, tier, stagger] = spots[i];
      const bx = start.x + ppx * (start.width / 2 + 3.2) + ppx * off;
      const bz = start.z + ppz * (start.width / 2 + 3.2) + ppz * off;
      const ty = 0.1 + tier * 0.35 + stagger;
      this._crowdPeople.push({
        x: bx,
        y: ty,
        z: bz,
        shirt: robeColors[Math.floor(Math.random() * robeColors.length)],
        skin: skins[Math.floor(Math.random() * skins.length)],
        hair: [0, 0, 0],
        pants: [0.12, 0.12, 0.16],
        pose: Math.floor(Math.random() * 3),
        scale: 0.9 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        veiled: true,
        pattern: patternColors[Math.floor(Math.random() * patternColors.length)],
        flag: i % 3 === 1,
      });
    }
  }
  private crowdShirtsForTheme(): [number, number, number][] {
    switch (this.theme) {
      case 'miami':
        return [[0.95, 0.45, 0.6], [0.2, 0.7, 0.75], [0.95, 0.55, 0.35],
        [0.45, 0.85, 0.6], [0.75, 0.6, 0.9], [1, 0.9, 0.75], [0.3, 0.8, 0.9], [0.95, 0.85, 0.3]];
      case 'italy':
        return [[0.8, 0.1, 0.1], [0, 0.55, 0.15], [0.9, 0.9, 0.9],
        [0.7, 0.1, 0.1], [0, 0.45, 0.12], [0.85, 0.85, 0.85]];
      case 'japan':
        return [[0.85, 0.12, 0.12], [0.95, 0.95, 0.98], [0.95, 0.6, 0.72],
        [0.25, 0.5, 0.35], [0.9, 0.9, 0.92], [0.8, 0.25, 0.3]];
      case 'montreal':
        return [[0.1, 0.3, 0.8], [0.9, 0.9, 0.95], [0.05, 0.2, 0.6],
        [0.95, 0.3, 0.3], [0.7, 0.85, 1], [0.1, 0.25, 0.7]];
      case 'monaco':
      case 'monaco-night':
        return [[0.8, 0.1, 0.1], [0.9, 0.9, 0.95], [0.7, 0.12, 0.12],
        [0.85, 0.85, 0.9], [0.9, 0.75, 0.25], [0.95, 0.95, 0.98]];
      case 'desert':
        return [[0.75, 0.1, 0.1], [0, 0.45, 0.15], [0.8, 0.6, 0.35],
        [0.9, 0.9, 0.9], [0.6, 0.3, 0.1], [0, 0.4, 0.12]];
      case 'mountain':
      case 'alpine':
        return [[0.1, 0.5, 0.7], [0.9, 0.9, 0.95], [0, 0.4, 0.25],
        [0.7, 0.8, 1], [0.85, 0.9, 0.95], [0.1, 0.35, 0.55]];
      case 'city':
        return [[0.5, 0.55, 0.6], [0.85, 0.3, 0.2], [0.2, 0.3, 0.45],
        [0.8, 0.8, 0.8], [0.35, 0.45, 0.55], [0.9, 0.75, 0.2]];
      default:
        return [[0.7, 0.15, 0.15], [0.15, 0.3, 0.7], [0.8, 0.7, 0.1],
        [0.9, 0.9, 0.9], [0.15, 0.5, 0.2], [0.6, 0.2, 0.6], [0.1, 0.65, 0.65], [0.95, 0.5, 0.15]];
    }
  }
  private themeFlagColors(): [number, number, number][] {
    switch (this.theme) {
      case 'italy': return [[0.8, 0.1, 0.1], [0, 0.55, 0.15]];
      case 'japan': return [[0.9, 0.08, 0.08], [0.94, 0.94, 0.96]];
      case 'montreal': return [[0.1, 0.3, 0.8], [0.9, 0.9, 0.95]];
      case 'monaco': case 'monaco-night': return [[0.8, 0.1, 0.1], [0.9, 0.9, 0.95]];
      case 'desert': return [[0.75, 0.1, 0.1], [0, 0.45, 0.15]];
      case 'mountain': case 'alpine': return [[0.1, 0.5, 0.7], [0.9, 0.9, 0.95]];
      case 'miami': return [[0.95, 0.45, 0.6], [0.2, 0.7, 0.75]];
      default: return this.crowdShirtsForTheme().slice(0, 2);
    }
  }
  private addStartGantry(verts: number[], idxs: number[], x: number, z: number, dirX: number, dirZ: number, width: number) {
    const ppx = -dirZ;
    const ppz = dirX;
    const hw = width / 2;
    const beamY = 4.4;
    for (const side of [-1, 1]) {
      this.addBox(verts, idxs, x + ppx * (hw + 1.3) * side, beamY / 2, z + ppz * (hw + 1.3) * side, 0.5, beamY, 0.5, [0.25, 0.25, 0.3]);
    }
    this.addOrientedBox(verts, idxs, x, beamY, z, width + 3, 0.45, 0.7, ppx, ppz, [0.35, 0.35, 0.4]);
    for (let s = 0; s < 6; s++) {
      const off = (s - 2.5) * (width / 6);
      const checker = s % 2 === 0;
      this.addBox(verts, idxs, x + ppx * off, beamY - 0.55, z + ppz * off, 0.06, 0.9, width / 6 * 1.05, checker ? [0.92, 0.92, 0.92] : [0.12, 0.12, 0.14]);
    }
    for (const side of [-1, 0, 1]) {
      this.addSphere(verts, idxs, x + ppx * (hw / 2) * side, beamY + 0.4, z + ppz * (hw / 2) * side, 0.16, 6, [1, 0.95, 0.7]);
    }
    if (this.theme === 'desert') {
      this.addFestivalLights(verts, idxs, x, z, ppx, ppz, hw);
    }
  }
  private addFestivalLights(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number, hw: number) {
    const span = hw + 1.3;
    const anchorY = 4.4;
    const sag = 1.8;
    const steps = 10;
    const colors: [number, number, number][] = [
      [1.0, 0.72, 0.25],
      [0.95, 0.32, 0.22],
      [0.32, 0.92, 0.78],
      [1.0, 0.85, 0.45],
    ];
    for (const depth of [0, 0.7]) {
      const dz = ppz * depth;
      const x0 = x - ppx * span, z0 = z + dz - ppz * span;
      const x1 = x + ppx * span, z1 = z + dz + ppz * span;
      let px0 = x0, py0 = anchorY, pz0 = z0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        const py = anchorY - sag * Math.sin(t * Math.PI);
        this.addWire(verts, idxs, px0, py0, pz0, px, py, pz, 0.028, [0.22, 0.16, 0.1]);
        px0 = px; py0 = py; pz0 = pz;
        if (i > 1 && i < steps) {
          const col = colors[(i * 2 + (depth > 0 ? 1 : 0)) % colors.length];
          this.addSphere(verts, idxs, px, py - 0.16, pz, 0.13, 8, col);
          this.addSphere(verts, idxs, px, py - 0.16, pz, 0.055, 6, [1, 0.98, 0.85]);
          this.addCone(verts, idxs, px, py - 0.03, pz, 0.06, 0.12, 6, [0.55, 0.4, 0.2]);
        }
      }
    }
  }
  private addWire(verts: number[], idxs: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, color: number[]) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    const [r, g, b] = color;
    const fx = dx / len, fy = dy / len, fz = dz / len;
    let hx = 0, hy = 1, hz = 0;
    if (Math.abs(fy) > 0.9) { hx = 1; hy = 0; hz = 0; }
    let rxn = fy * hz - fz * hy, ryn = fz * hx - fx * hz, rzn = fx * hy - fy * hx;
    const rl = Math.hypot(rxn, ryn, rzn) || 1;
    rxn /= rl; ryn /= rl; rzn /= rl;
    const ux = ryn * fz - rzn * fy, uy = rzn * fx - rxn * fz, uz = rxn * fy - ryn * fx;
    const h = t / 2;
    const p: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? 0 : len;
      const xi = (i % 4 === 1 || i % 4 === 2) ? h : -h;
      const yi = (i === 2 || i === 3 || i === 6 || i === 7) ? h : -h;
      p.push([x0 + fx * s + rxn * xi + ux * yi, y0 + fy * s + ryn * xi + uy * yi, z0 + fz * s + rzn * xi + uz * yi]);
    }
    const faces = [
      { f: [3, 2, 1, 0], n: [0, 0, 1] },
      { f: [4, 5, 6, 7], n: [0, 0, -1] },
      { f: [0, 1, 5, 4], n: [-1, 0, 0] },
      { f: [2, 3, 7, 6], n: [1, 0, 0] },
      { f: [1, 2, 6, 5], n: [0, 1, 0] },
      { f: [3, 0, 4, 7], n: [0, -1, 0] },
    ];
    for (const face of faces) {
      const base = verts.length / 11;
      const nx = face.n[0] * rxn + face.n[1] * ux + face.n[2] * fx;
      const ny = face.n[0] * ryn + face.n[1] * uy + face.n[2] * fy;
      const nz = face.n[0] * rzn + face.n[1] * uz + face.n[2] * fz;
      for (const vi of face.f) {
        verts.push(p[vi][0], p[vi][1], p[vi][2], nx, ny, nz, r, g, b, 0, 0);
      }
      idxs.push(base, base + 1, base + 2);
      idxs.push(base + 2, base + 3, base);
    }
  }
  private addTireBarrier(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number, tires: number) {
    for (let r = 0; r < 2; r++) {
      for (let t = 0; t < tires; t++) {
        const off = (t - (tires - 1) / 2) * 1.1;
        const tx = x + ppx * off;
        const tz = z + ppz * off;
        this.addCylinder(verts, idxs, tx, r * 0.32, tz, 0.5, 0.3, 10, r === 0 ? [0.09, 0.09, 0.1] : [0.12, 0.12, 0.13]);
      }
    }
  }
  private addMarshalPost(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number, side: number) {
    this.addBox(verts, idxs, x, 0.5, z, 1.1, 1, 1.1, [0.85, 0.85, 0.88]);
    this.addBox(verts, idxs, x, 1.05, z, 1.3, 0.12, 1.3, [0.85, 0.15, 0.15]);
    const px = x + ppx * 0.9 * side;
    const pz = z + ppz * 0.9 * side;
    this.addCylinder(verts, idxs, px, 0, pz, 0.035, 2.4, 6, [0.55, 0.55, 0.58]);
    this._flags.push({
      x: px, z: pz,
      dirX: ppx * side, dirZ: ppz * side,
      anchorY: 2.2, w: 0.35, h: 0.6,
      kind: 'rect',
      colors: [[1, 0.85, 0.15], [1, 0.85, 0.15], [1, 0.85, 0.15]],
      phase: Math.random() * Math.PI * 2,
      speed: 5 + Math.random() * 2,
      amp: 0.9,
    });
  }
  private addBrakeBoard(verts: number[], idxs: number[], x: number, z: number, ppx: number, ppz: number) {
    this.addBox(verts, idxs, x, 0.6, z, 0.08, 1.2, 0.08, [0.6, 0.6, 0.62]);
    this.addBox(verts, idxs, x + ppx * 0.3, 1.15, z + ppz * 0.3, 0.06, 0.85, 0.6, [0.9, 0.12, 0.12]);
    this.addBox(verts, idxs, x + ppx * 0.33, 1.15, z + ppz * 0.33, 0.03, 0.3, 0.62, [0.95, 0.95, 0.95]);
  }
  private _rainParticles: { x: number; y: number; z: number; speed: number }[] = [];
  private _rainVao!: WebGLVertexArrayObject;
  private _rainCount = 0;
  private _rainInitialized = false;
  private _snowParticles: { x: number; y: number; z: number; fall: number; wind: number; phase: number }[] = [];
  private _snowVao!: WebGLVertexArrayObject;
  private _snowBuf!: WebGLBuffer;
  private _snowCount = 0;
  // Reused per-frame write buffer — avoids allocating a new array + Float32Array
  // every frame (the main mobile cost of the snowfall effect).
  private _snowData: Float32Array | null = null;
  private _snowInitialized = false;
  private initRainParticles() {
    if (this._rainInitialized) return;
    this._rainInitialized = true;
    const gl = this.gl;
    const count = 2000;
    const verts: number[] = [];
    this._rainParticles = [];
    for (let i = 0; i < count; i++) {
      const r = { x: (Math.random() - 0.5) * 200, y: Math.random() * 30, z: (Math.random() - 0.5) * 200, speed: 20 + Math.random() * 15 };
      this._rainParticles.push(r);
      verts.push(r.x, r.y, r.z, 0.5, 0.6, 0.8, 0.3);
      verts.push(r.x, r.y - 0.5, r.z, 0.5, 0.6, 0.8, 0.3);
    }
    this._rainCount = count * 2;
    this._rainVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._rainVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this._rainBuf = buf;
  }
  private _rainBuf!: WebGLBuffer;
  private initSnowParticles() {
    if (this._snowInitialized) return;
    this._snowInitialized = true;
    const gl = this.gl;
    const count = this.lowQuality ? 1200 : 3500;
    const verts: number[] = [];
    this._snowParticles = [];
    for (let i = 0; i < count; i++) {
      const f = {
        x: (Math.random() - 0.5) * 260,
        y: Math.random() * 40,
        z: (Math.random() - 0.5) * 260,
        fall: 1.5 + Math.random() * 3.0,
        wind: 2 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2,
      };
      this._snowParticles.push(f);
      verts.push(f.x, f.y, f.z, 0.97, 0.98, 1, 0.9);
      verts.push(f.x, f.y - 0.16, f.z, 0.97, 0.98, 1, 0.9);
    }
    this._snowCount = count * 2;
    this._snowData = new Float32Array(count * 2 * 7);
    this._snowVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._snowVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this._snowBuf = buf;
  }
  private _smokeParticles: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; size: number; color?: [number, number, number]; chip?: boolean }[] = [];
  private _smokeVao!: WebGLVertexArrayObject;
  private _smokeBuf!: WebGLBuffer;
  private _smokeMax = 220;
  private _scrubMarks: { x: number; z: number; yaw: number; len: number; wid: number; life: number; maxLife: number; alphaBase: number }[] = [];
  private _scrubVao: WebGLVertexArrayObject | null = null;
  private _scrubBuf: WebGLBuffer | null = null;
  private _scrubMax = 1200;
  private _scrubInitialized = false;
  private _scrubColor: [number, number, number] = [0.05, 0.045, 0.04];
  private _scrubLast: Map<string, { x: number; z: number }> = new Map();
  private _palmCrowns: { x: number; y: number; z: number; s: number; phase: number; lean: number }[] = [];
  private _oasisPools: { x: number; z: number; r: number; phase: number }[] = [];
  private _frondVao: WebGLVertexArrayObject | null = null;
  private _frondBuf: WebGLBuffer | null = null;
  private _waterVao: WebGLVertexArrayObject | null = null;
  private _waterBuf: WebGLBuffer | null = null;
  private _smokeInitialized = false;
  private smokeProg!: WebGLProgram;
  private smokeProjLoc!: WebGLUniformLocation;
  private smokeViewLoc!: WebGLUniformLocation;
  private initSmoke() {
    if (this._smokeInitialized) return;
    this._smokeInitialized = true;
    const gl = this.gl;
    const vs = `#version 300 es\nin vec3 aPos;\nin vec4 aColor;\nuniform mat4 uProj;\nuniform mat4 uView;\nout vec4 vColor;\nvoid main() { vColor = aColor; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
    const fs = `#version 300 es\nprecision highp float;\nin vec4 vColor;\nout vec4 FragColor;\nvoid main() { FragColor = vColor; }`;
    this.smokeProg = this.createProgram(vs, fs);
    this.smokeProjLoc = gl.getUniformLocation(this.smokeProg, 'uProj')!;
    this.smokeViewLoc = gl.getUniformLocation(this.smokeProg, 'uView')!;
    this._smokeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._smokeVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, this._smokeMax * 6 * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this._smokeBuf = buf;
  }
  private emitSmoke(x: number, z: number, yaw: number, slide: number) {
    if (this._smokeParticles.length >= this._smokeMax) return;
    const intensity = Math.min((slide - 0.35) / 0.65, 1);
    if (intensity <= 0) return;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    for (const side of [-1, 1]) {
      const wx = x - 0.55 * sinY - side * 0.60 * cosY;
      const wz = z - 0.55 * cosY + side * 0.60 * sinY;
      const count = 1 + Math.floor(intensity * 2 + Math.random());
      for (let i = 0; i < count; i++) {
        if (this._smokeParticles.length >= this._smokeMax) return;
        this._smokeParticles.push({
          x: wx + (Math.random() - 0.5) * 0.15,
          y: 0.2 + Math.random() * 0.15,
          z: wz + (Math.random() - 0.5) * 0.15,
          vx: -sinY * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6,
          vy: 1.0 + Math.random() * 1.2,
          vz: -cosY * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.4,
          size: 0.15 + Math.random() * 0.1
        });
      }
    }
  }
  private emitSand(x: number, z: number, yaw: number, speed: number = 0) {
    if (this._smokeParticles.length >= this._smokeMax) return;
    const intensity = Math.min(Math.abs(speed) / 22, 1);
    if (intensity <= 0.12) return;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    const sandColors: [number, number, number][] = [
      [0.82, 0.68, 0.45], [0.76, 0.62, 0.4], [0.9, 0.78, 0.58], [0.7, 0.56, 0.37],
    ];
    for (const side of [-1, 1]) {
      const wx = x - 0.6 * sinY - side * 0.65 * cosY;
      const wz = z - 0.6 * cosY + side * 0.65 * sinY;
      const count = 1 + Math.floor(intensity * 2 + Math.random());
      for (let i = 0; i < count; i++) {
        if (this._smokeParticles.length >= this._smokeMax) return;
        const col = sandColors[Math.floor(Math.random() * sandColors.length)];
        this._smokeParticles.push({
          x: wx + (Math.random() - 0.5) * 0.2,
          y: 0.15 + Math.random() * 0.2,
          z: wz + (Math.random() - 0.5) * 0.2,
          vx: -sinY * (1.2 + Math.random() * 1.4) + 0.8 + (Math.random() - 0.5) * 0.5,
          vy: 1.5 + Math.random() * 1.7,
          vz: -cosY * (1.2 + Math.random() * 1.4) + 0.4 + (Math.random() - 0.5) * 0.5,
          life: 0,
          maxLife: 1.7 + Math.random() * 1.2,
          size: 0.34 + Math.random() * 0.2,
          color: col,
        });
      }
    }
  }
  private emitBrakeDust(x: number, z: number, yaw: number, brake: number, speed: number = 0) {
    if (this._smokeParticles.length >= this._smokeMax) return;
    const intensity = Math.min(brake, 1);
    if (intensity <= 0) return;
    const speedFactor = Math.min(Math.abs(speed) / 40, 1);
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    for (const side of [-1, 1]) {
      const wheels: Array<[number, number]> = [
        [x + 0.62 * sinY - side * 0.60 * cosY, z + 0.62 * cosY + side * 0.60 * sinY],
        [x - 0.55 * sinY - side * 0.60 * cosY, z - 0.55 * cosY + side * 0.60 * sinY]
      ];
      for (const [wx, wz] of wheels) {
        if (this._smokeParticles.length >= this._smokeMax) return;
        const count = 1 + Math.floor(intensity * (0.8 + speedFactor * 0.9) + Math.random() * 0.7);
        for (let i = 0; i < count; i++) {
          if (this._smokeParticles.length >= this._smokeMax) return;
          this._smokeParticles.push({
            x: wx + (Math.random() - 0.5) * 0.12,
            y: 0.12 + Math.random() * 0.1,
            z: wz + (Math.random() - 0.5) * 0.12,
            vx: -sinY * (0.6 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.5,
            vy: 0.4 + Math.random() * 0.5,
            vz: -cosY * (0.6 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.5,
            life: 0,
            maxLife: 0.3 + Math.random() * 0.25,
            size: 0.1 + Math.random() * 0.07,
            color: [0.38, 0.33, 0.29]
          });
        }
      }
    }
  }
  /** Big one-shot spin-out burst: dense gray tire smoke kicked up around all four
   *  wheels when a car loses it in a corner. Heavier, longer-lived and wider than
   *  the drift smoke, so a crash reads instantly on screen. speed (m/s) scales the
   *  burst so a high-speed bin throws a much bigger cloud. */
  emitCrashSmoke(x: number, z: number, yaw: number, speed: number = 0) {
    if (this._smokeParticles.length >= this._smokeMax) return;
    const speedF = Math.min(Math.abs(speed) / 55, 1);
    const scale = 0.65 + speedF * 0.85;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    const grayColors: [number, number, number][] = [
      [0.55, 0.55, 0.56], [0.62, 0.62, 0.64], [0.48, 0.48, 0.5], [0.68, 0.68, 0.7],
    ];
    for (const side of [-1, 1]) {
      const wx = x - 0.55 * sinY - side * 0.62 * cosY;
      const wz = z - 0.55 * cosY + side * 0.62 * sinY;
      const count = Math.round((6 + Math.random() * 4) * scale);
      for (let i = 0; i < count; i++) {
        if (this._smokeParticles.length >= this._smokeMax) return;
        const col = grayColors[Math.floor(Math.random() * grayColors.length)];
        this._smokeParticles.push({
          x: wx + (Math.random() - 0.5) * 0.5 * scale,
          y: 0.18 + Math.random() * 0.3,
          z: wz + (Math.random() - 0.5) * 0.5 * scale,
          vx: (-sinY * (1.2 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.8) * scale,
          vy: (1.6 + Math.random() * 2.2) * (0.8 + speedF * 0.5),
          vz: (-cosY * (1.2 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.8) * scale,
          life: 0,
          maxLife: (1.1 + Math.random() * 1.0) * (0.8 + speedF * 0.6),
          size: (0.4 + Math.random() * 0.25) * (0.85 + speedF * 0.6),
          color: col,
        });
      }
    }
  }
  /** Paint-debris flecks kicked off the bodywork at a car-vs-car contact
   *  point. Reuses the smoke particle pool with a `chip` mode: gravity, a soft
   *  ground bounce and shrink-over-life so they read as solid little shards of
   *  paint (plus a few dark carbon bits) instead of smoke puffs. `impact` is a
   *  0..1 strength that scales the burst size and throw speed. */
  emitPaintChips(x: number, z: number, yaw: number, paint: [number, number, number], impact: number = 0.5) {
    if (this._smokeParticles.length >= this._smokeMax) return;
    const count = 4 + Math.round(impact * 8) + Math.floor(Math.random() * 3);
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    for (let i = 0; i < count; i++) {
      if (this._smokeParticles.length >= this._smokeMax) return;
      const dark = Math.random() < 0.35;
      const col: [number, number, number] = dark
        ? [0.12 + Math.random() * 0.1, 0.11 + Math.random() * 0.1, 0.1 + Math.random() * 0.1]
        : [
            paint[0] * (0.8 + Math.random() * 0.4),
            paint[1] * (0.8 + Math.random() * 0.4),
            paint[2] * (0.8 + Math.random() * 0.4),
          ];
      this._smokeParticles.push({
        x: x + (Math.random() - 0.5) * 0.6,
        y: 0.25 + Math.random() * 0.35,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: (sinY * (1.5 + Math.random() * 3) + (Math.random() - 0.5) * 4) * (0.5 + impact),
        vy: (2 + Math.random() * 3.5) * (0.6 + impact),
        vz: (cosY * (1.5 + Math.random() * 3) + (Math.random() - 0.5) * 4) * (0.5 + impact),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.45,
        size: 0.07 + Math.random() * 0.1,
        color: col,
        chip: true,
      });
    }
  }
  private initScrub() {
    if (this._scrubInitialized) return;
    this._scrubInitialized = true;
    const gl = this.gl;
    this._scrubVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._scrubVao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, (this._scrubMax * 6 * 7 + 64) * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this._scrubBuf = buf;
  }
  private emitScrubMarks(x: number, z: number, yaw: number, brake: number, speed: number, keyPrefix: string) {
    const heatArr = keyPrefix === 'player' ? this._playerHeat : this._carHeat.get(keyPrefix);
    let fade = 1;
    if (heatArr) {
      const heat = Math.max(...heatArr);
      if (heat > this._brakeHeatFadeOn) {
        const t = Math.min(1, (heat - this._brakeHeatFadeOn) / (this._brakeHeatCap - this._brakeHeatFadeOn));
        fade = 1 - this._brakeHeatFadeAmount * t;
      }
    }
    const intensity = Math.min(brake, 1);
    if (intensity <= 0) return;
    const spacing = (1.5 + Math.abs(speed) * 0.03) * (2 - fade);
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    for (const axle of [0.62, -0.62]) {
      for (const side of [-1, 1]) {
        const key = keyPrefix + (axle > 0 ? 'F' : 'R') + (side > 0 ? 'R' : 'L');
        const last = this._scrubLast.get(key) ?? null;
        const moved = last ? Math.hypot(x - last.x, z - last.z) : Infinity;
        if (moved < spacing) continue;
        this._scrubLast.set(key, { x, z });
        if (this._scrubMarks.length >= this._scrubMax) this._scrubMarks.shift();
        this._scrubMarks.push({
          x: x + axle * sinY - side * (axle < 0 ? 0.68 : 0.60) * cosY,
          z: z + axle * cosY + side * (axle < 0 ? 0.68 : 0.60) * sinY,
          yaw,
          len: 2.1 + Math.abs(speed) * 0.04,
          wid: ((axle < 0 ? 0.42 : 0.34) + Math.random() * 0.12) * (0.5 + 0.5 * fade),
          life: 0,
          maxLife: 4 + Math.random() * 2,
          alphaBase: (0.2 + intensity * 0.12) * fade
        });
      }
    }
  }
  private updateScrubMarks(dt: number) {
    const marks = this._scrubMarks;
    for (let i = marks.length - 1; i >= 0; i--) {
      marks[i].life += dt;
      if (marks[i].life >= marks[i].maxLife) { marks.splice(i, 1); continue; }
    }
  }
  private drawScrubMarks(proj: Float32Array, view: Float32Array, eye: number[]) {
    const gl = this.gl;
    const marks = this._scrubMarks;
    if (marks.length === 0) return;
    this.initScrub();
    const data: number[] = [];
    for (const mk of marks) {
      const ex = mk.x - eye[0], ez = mk.z - eye[2];
      if (ex * ex + ez * ez > 130 * 130) continue;
      const t = mk.life / mk.maxLife;
      const alpha = mk.alphaBase * Math.pow(1 - t, 1.6);
      if (alpha <= 0.003) continue;
      const sx = Math.sin(mk.yaw), cz = Math.cos(mk.yaw);
      const hx = sx * mk.len * 0.5, hz = cz * mk.len * 0.5;
      const wx = cz * mk.wid * 0.5, wz = -sx * mk.wid * 0.5;
      const y = 0.02;
      const p = (px: number, pz: number) => data.push(px, y, pz, this._scrubColor[0], this._scrubColor[1], this._scrubColor[2], alpha);
      p(mk.x - hx - wx, mk.z - hz - wz);
      p(mk.x + hx - wx, mk.z + hz - wz);
      p(mk.x + hx + wx, mk.z + hz + wz);
      p(mk.x - hx - wx, mk.z - hz - wz);
      p(mk.x + hx + wx, mk.z + hz + wz);
      p(mk.x - hx + wx, mk.z - hz + wz);
    }
    if (data.length === 0) return;
    gl.useProgram(this.smokeProg);
    gl.uniformMatrix4fv(this.smokeProjLoc, false, proj);
    gl.uniformMatrix4fv(this.smokeViewLoc, false, view);
    gl.bindVertexArray(this._scrubVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._scrubBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }
  private updateSmoke(dt: number) {
    const parts = this._smokeParticles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.maxLife) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.chip) {
        // Paint chips are ballistic: strong gravity with a soft ground bounce.
        p.vy -= 9.8 * 2.2 * dt;
        if (p.y <= 0) { p.y = 0; p.vy = -p.vy * 0.35; p.vx *= 0.7; p.vz *= 0.7; }
      } else {
        p.vy *= (1 - 0.4 * dt);
        p.vx *= (1 - 0.6 * dt); p.vz *= (1 - 0.6 * dt);
      }
    }
  }
  private drawSmoke(proj: Float32Array, view: Float32Array) {
    const gl = this.gl;
    const parts = this._smokeParticles;
    if (parts.length === 0) return;
    this.initSmoke();
    const rx = view[0], ry = view[4], rz = view[8];
    const ux = view[1], uy = view[5], uz = view[9];
    const data: number[] = [];
    for (const p of parts) {
      const t = p.life / p.maxLife;
      // Chips shrink and stay opaque-ish (solid flecks); smoke grows and fades.
      const s = p.chip ? p.size * (1 - t) : p.size * (0.5 + t * 1.8);
      const alpha = p.chip ? 0.85 * (1 - t) : Math.max(0, 0.5 * (1 - t));
      const gray = 0.5 + t * 0.15;
      const cr = p.color ? (p.chip ? p.color[0] : p.color[0] * (0.75 + 0.4 * t)) : gray;
      const cg = p.color ? (p.chip ? p.color[1] : p.color[1] * (0.75 + 0.4 * t)) : gray;
      const cb = p.color ? (p.chip ? p.color[2] : p.color[2] * (0.75 + 0.4 * t)) : gray + 0.03;
      const hx = rx * s, hy = ry * s, hz = rz * s;
      const wx = ux * s, wy = uy * s, wz = uz * s;
      const cx = p.x, cy = p.y, cz = p.z;
      data.push(cx - hx + wx, cy - hy + wy, cz - hz + wz, cr, cg, cb, alpha);
      data.push(cx + hx + wx, cy + hy + wy, cz + hz + wz, cr, cg, cb, alpha);
      data.push(cx + hx - wx, cy + hy - wy, cz + hz - wz, cr, cg, cb, alpha);
      data.push(cx - hx + wx, cy - hy + wy, cz - hz + wz, cr, cg, cb, alpha);
      data.push(cx + hx - wx, cy + hy - wy, cz + hz - wz, cr, cg, cb, alpha);
      data.push(cx - hx - wx, cy - hy - wy, cz - hz - wz, cr, cg, cb, alpha);
    }
    gl.useProgram(this.smokeProg);
    gl.uniformMatrix4fv(this.smokeProjLoc, false, proj);
    gl.uniformMatrix4fv(this.smokeViewLoc, false, view);
    gl.bindVertexArray(this._smokeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._smokeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }
  private static readonly EAGLE_STOOP_MS = 5200;
  private static readonly EAGLE_STOOP_MIN_GAP = 11;
  private static readonly EAGLE_STOOP_MAX_GAP = 26;
  private static readonly VULTURE_PERCH_MS = 9000;
  private static readonly VULTURE_PERCH_MIN_GAP = 14;
  private static readonly VULTURE_PERCH_MAX_GAP = 30;
  private _birdsVao!: WebGLVertexArrayObject;
  private _birdsBuf!: WebGLBuffer;
  private _birds: {
    phase: number; speed: number; radius: number; alt: number; ang: number; dir: number; size: number; shade: number;
    eagle?: boolean; diveT: number; diveNext: number; diveX: number; diveZ: number;
    perch?: boolean; perchT: number; perchNext: number; perchX: number; perchY: number; perchZ: number;
  }[] = [];
  private _desertPerchSpots: { x: number; y: number; z: number }[] = [];
  private _confettiVao!: WebGLVertexArrayObject;
  private _confettiBuf!: WebGLBuffer;
  private _confettiCount = 0;
  private _confetti: { x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number; spin: number; size: number; color: [number, number, number]; petal?: boolean }[] = [];
  private _confettiCap = 1300;
  private _confettiBurst: { x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number; spin: number; size: number; sx: number; sy: number; sz: number; color: [number, number, number] }[] = [];
  private _winnerCelebrated = false;
  private _winTrailSpeed = 0;
  private _winTrailStartedAt = -1;
  winTrailAnchor: { x: number; z: number; yaw: number } | null = null;
  armWinTrail() { this._winTrailStartedAt = this.elapsed; }
  disarmWinTrail() { this._winTrailStartedAt = -1; }
  static readonly WIN_TRAIL_SECONDS = 7;
  private static readonly WIN_TRAIL_MIN_SPEED = 6;
  private _crowdVao!: WebGLVertexArrayObject;
  private _crowdBuf!: WebGLBuffer;
  private _crowdData!: Float32Array;
  private _crowdPeople: CrowdPerson[] = [];
  private _flags: WavingFlag[] = [];
  private _flagVao!: WebGLVertexArrayObject;
  private _flagBuf!: WebGLBuffer;
  private _flagData!: Float32Array;
  private _crowdExcitement = 0;
  private _balloonVao!: WebGLVertexArrayObject;
  private _balloonVbo!: WebGLBuffer;
  private _balloonIbo!: WebGLBuffer;
  private _balloonCount = 0;
  private _balloons: { ang: number; radius: number; alt: number; phase: number; color: [number, number, number] }[] = [];
  private _trackCenterX = 0;
  private _trackCenterZ = 0;
  private _animalsVao!: WebGLVertexArrayObject;
  private _animalsBuf!: WebGLBuffer;
  private _animals: { kind: 0 | 1 | 2; x: number; z: number; yaw: number; size: number; phase: number; retr: number }[] = [];
  private _tumbleweeds: { x: number; z: number; vx: number; vz: number; spin: number; phase: number; size: number }[] = [];
  private _dustDevils: { x: number; z: number; vx: number; vz: number; phase: number; size: number; life: number; maxLife: number }[] = [];
  private _windVao!: WebGLVertexArrayObject;
  private _windBuf!: WebGLBuffer;
  private _windSmokeVao!: WebGLVertexArrayObject;
  private _windSmokeBuf!: WebGLBuffer;
  private _marmotWhistles = 0;
  private initSkyObjects() {
    const gl = this.gl;
    const pts = this._trackPoints;
    let cx = 0, cz = 0;
    if (pts.length) {
      for (const p of pts) { cx += p.x; cz += p.z; }
      cx /= pts.length; cz /= pts.length;
    }
    this._trackCenterX = cx;
    this._trackCenterZ = cz;
    this._birds = [];
    const isMiami = this.theme === 'miami';
    const isHighCountry = this.theme === 'mountain' || this.theme === 'alpine';
    const isDesert = this.theme === 'desert';
    const birdCount = isMiami ? 26 : isHighCountry ? 24 : isDesert ? 14 : 18;
    for (let i = 0; i < birdCount; i++) {
      const eagle = isHighCountry && i % 2 === 0;
      const vulture = isDesert && i % 2 === 0;
      const diveTarget = eagle && pts.length
        ? pts[Math.floor(Math.random() * pts.length)]
        : null;
      this._birds.push({
        phase: Math.random() * Math.PI * 2,
        speed: eagle || vulture ? 0.04 + Math.random() * 0.05 : isMiami ? 0.09 + Math.random() * 0.08 : 0.05 + Math.random() * 0.09,
        radius: isMiami ? 110 + Math.random() * 90 : eagle || vulture ? 170 + Math.random() * 120 : 160 + Math.random() * 130,
        alt: isMiami ? 18 + Math.random() * 16 : eagle || vulture ? 55 + Math.random() * 30 : 34 + Math.random() * 30,
        ang: Math.random() * Math.PI * 2,
        dir: Math.random() < 0.5 ? 1 : -1,
        size: eagle ? 1.7 + Math.random() * 0.4 : vulture ? 1.3 + Math.random() * 0.3 : isMiami ? 0.7 + Math.random() * 0.25 : 0.9 + Math.random() * 0.3,
        shade: isMiami ? 0.85 + Math.random() * 0.08 : vulture ? 0.12 : eagle ? 0.1 : 0.08 + Math.random() * 0.05,
        eagle: !!diveTarget,
        diveT: 0,
        diveNext: eagle ? 8 + Math.random() * 16 : Number.MAX_SAFE_INTEGER,
        diveX: diveTarget?.x ?? cx,
        diveZ: diveTarget?.z ?? cz,
        perch: vulture && i < 6 && this._desertPerchSpots.length > 0,
        perchT: 0,
        perchNext: vulture && i < 6 && this._desertPerchSpots.length > 0
          ? 10 + Math.random() * 18 : Number.MAX_SAFE_INTEGER,
        perchX: 0, perchY: 0, perchZ: 0,
      });
    }
    this._vultures = [];
    if (isDesert) {
      for (let i = 0; i < 4; i++) {
        this._vultures.push({
          ang: (i / 4) * Math.PI * 2 + Math.random() * 0.6,
          radius: 150 + Math.random() * 130,
          alt: 58 + Math.random() * 28,
          speed: 0.03 + Math.random() * 0.04,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    this._animals = [];
    if (isHighCountry) {
      let deerIdx = 0;
      for (let i = 0; i < pts.length; i += 10) {
        const p = pts[i];
        const ppx = -p.dirZ;
        const ppz = p.dirX;
        const side = (i / 10) % 2 === 0 ? -1 : 1;
        const kind: 0 | 1 = deerIdx % 2 === 0 ? 0 : 1;
        const dist = kind === 0
          ? p.width / 2 + 26 + (deerIdx % 5) * 2.5 + Math.random() * 3
          : p.width / 2 + 36 + Math.random() * 6;
        const ax = p.x + ppx * dist * side + (Math.random() - 0.5) * 4;
        const az = p.z + ppz * dist * side + (Math.random() - 0.5) * 4;
        this._animals.push({
          kind,
          x: ax,
          z: az,
          yaw: Math.atan2(ppx * side, ppz * side),
          size: kind === 0 ? 0.85 + Math.random() * 0.25 : 0.7 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
          retr: 0,
        });
        deerIdx++;
        if (deerIdx >= 13) break;
      }
      if (this.theme === 'alpine') {
        for (let i = 0; i < pts.length; i += 15) {
          const p = pts[i];
          const ppx = -p.dirZ;
          const ppz = p.dirX;
          const side = (i / 15) % 2 === 0 ? -1 : 1;
          const dist = p.width / 2 + 20 + Math.random() * 8;
          this._animals.push({
            kind: 2,
            x: p.x + ppx * dist * side + (Math.random() - 0.5) * 2,
            z: p.z + ppz * dist * side + (Math.random() - 0.5) * 2,
            yaw: Math.atan2(-ppx * side, -ppz * side),
            size: 0.5 + Math.random() * 0.14,
            phase: Math.random() * Math.PI * 2,
            retr: 0,
          });
        }
      }
      this._animalsVao = gl.createVertexArray()!;
      gl.bindVertexArray(this._animalsVao);
      this._animalsBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this._animalsBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(26 * 10 * 36 * 11), gl.DYNAMIC_DRAW);
      const stride = 11 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
      gl.bindVertexArray(null);
    }
    this._balloons = [];
    const balloonColors: [number, number, number][] = [
      [0.9, 0.25, 0.2], [0.2, 0.55, 0.9], [0.95, 0.75, 0.15],
      [0.35, 0.8, 0.35], [0.85, 0.4, 0.7], [0.95, 0.5, 0.8], [0.4, 0.75, 0.95],
    ];
    for (let i = 0; i < (isMiami || this.theme === 'montreal' || this.theme === 'monaco' ? 7 : 4); i++) {
      this._balloons.push({
        ang: Math.random() * Math.PI * 2,
        radius: 190 + Math.random() * 120,
        alt: 26 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        color: balloonColors[i % balloonColors.length],
      });
    }
    const bverts: number[] = [];
    const bidxs: number[] = [];
    this.addSphere(bverts, bidxs, 0, 0, 0, 1, 10, [1, 1, 1]);
    this.addBox(bverts, bidxs, 0, -1.7, 0, 0.7, 0.55, 0.7, [0.45, 0.3, 0.18]);
    const bv = new Float32Array(bverts);
    const bi = new Uint16Array(bidxs);
    this._balloonCount = bi.length;
    this._balloonVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._balloonVao);
    this._balloonVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._balloonVbo);
    gl.bufferData(gl.ARRAY_BUFFER, bv, gl.STATIC_DRAW);
    this._balloonIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._balloonIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bi, gl.STATIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    this._tumbleweeds = [];
    this._dustDevils = [];
    if (isDesert) {
      const R = 240;
      for (let i = 0; i < 6; i++) {
        this._tumbleweeds.push({
          x: cx + (Math.random() - 0.5) * R * 2,
          z: cz + (Math.random() - 0.5) * R * 2,
          vx: 1.5 + Math.random() * 1.7,
          vz: 0.5 + Math.random() * 1.7,
          spin: 3 + Math.random() * 4,
          phase: Math.random() * Math.PI * 2,
          size: 0.32 + Math.random() * 0.3,
        });
      }
      for (let i = 0; i < 3; i++) {
        this._dustDevils.push({
          x: cx + (Math.random() - 0.5) * R * 2,
          z: cz + (Math.random() - 0.5) * R * 2,
          vx: 1.1 + Math.random() * 1.3,
          vz: 0.4 + Math.random() * 1.3,
          phase: Math.random() * Math.PI * 2,
          size: 1.1 + Math.random() * 0.9,
          life: 0,
          maxLife: 9 + Math.random() * 8,
        });
      }
      this._windVao = gl.createVertexArray()!;
      gl.bindVertexArray(this._windVao);
      this._windBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this._windBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(6 * 64 * 11), gl.DYNAMIC_DRAW);
      const wstride = 11 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, wstride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, wstride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, wstride, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, wstride, 36);
      gl.bindVertexArray(null);
      this._windSmokeVao = gl.createVertexArray()!;
      gl.bindVertexArray(this._windSmokeVao);
      this._windSmokeBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this._windSmokeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(3 * 40 * 7), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
      gl.bindVertexArray(null);
    }
    this._birdsVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._birdsVao);
    this._birdsBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._birdsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._birds.length * 6 * 11), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
    const maxCrowdVerts = 230 * 216;
    this._crowdData = new Float32Array(maxCrowdVerts * 11);
    this._crowdVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._crowdVao);
    this._crowdBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._crowdBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._crowdData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  private initConfetti() {
    const gl = this.gl;
    const pts = this._trackPoints;
    const dense = this.theme === 'miami' || this.theme === 'monaco';
    const desert = this.theme === 'desert';
    const perStand = dense ? 26 : desert ? 8 : 12;
    const perStart = dense ? 26 : desert ? 16 : 12;
    const confettiColors: [number, number, number][] = desert
      ? [[0.95, 0.45, 0.5], [0.98, 0.75, 0.15], [0.8, 0.45, 0.3], [0.98, 0.93, 0.85],
      [0.85, 0.2, 0.25], [0.9, 0.55, 0.2], [0.99, 0.85, 0.55], [0.7, 0.25, 0.3]]
      : [[0.95, 0.25, 0.3], [0.2, 0.7, 0.95], [0.98, 0.8, 0.1], [0.3, 0.85, 0.4],
      [0.95, 0.5, 0.85], [0.95, 0.6, 0.2], [0.55, 0.45, 0.95], [0.95, 0.95, 0.98]];
    this._confetti = [];
    const anchors: { x: number; z: number }[] = [{ x: pts[0].x, z: pts[0].z }];
    for (const f of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      const p = pts[Math.floor(f * pts.length)];
      anchors.push({ x: p.x, z: p.z });
    }
    for (let ai = 0; ai < anchors.length; ai++) {
      const a = anchors[ai];
      const n = ai === 0 ? perStart : perStand;
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        this._confetti.push({
          x: a.x + (Math.random() - 0.5) * 24 + side * 10,
          y: 4 + Math.random() * 14,
          z: a.z + (Math.random() - 0.5) * 24,
          vx: (Math.random() - 0.5) * 0.6,
          vy: desert ? 0.35 + Math.random() * 0.5 : 0.8 + Math.random() * 0.9,
          vz: (Math.random() - 0.5) * 0.6,
          phase: Math.random() * Math.PI * 2,
          spin: desert ? 3.5 + Math.random() * 5 : 2 + Math.random() * 5,
          size: desert ? 0.1 + Math.random() * 0.11 : 0.09 + Math.random() * 0.09,
          color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
          petal: desert,
        });
      }
    }
    this._confettiCount = this._confetti.length * 6;
    const maxConfetti = Math.max(this._confetti.length, 1300);
    this._confettiCap = maxConfetti - 50;
    this._confettiVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._confettiVao);
    this._confettiBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._confettiBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(maxConfetti * 6 * 11), gl.DYNAMIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  celebrateWinner(winSpeed = 0, skipTrail = false) {
    if (this._winnerCelebrated) return;
    this._winnerCelebrated = true;
    this._winTrailSpeed = winSpeed;
    if (!skipTrail) this._winTrailStartedAt = this.elapsed;
    const pts = this._trackPoints;
    if (!pts.length) return;
    const colors: [number, number, number][] = [
      [0.95, 0.25, 0.3], [0.2, 0.7, 0.95], [0.98, 0.8, 0.1], [0.3, 0.85, 0.4],
      [0.95, 0.5, 0.85], [0.95, 0.6, 0.2], [0.55, 0.45, 0.95], [0.95, 0.95, 0.98],
    ];
    const line = pts[0];
    const straight = this.getTrackPointAlong(Math.max(0, this.totalTrackDist - 60));
    const anchors = [{ x: line.x, z: line.z }, { x: straight.x, z: straight.z }];
    for (const a of anchors) {
      const count = a === anchors[0] ? 120 : 90;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.5 + Math.random() * 4;
        const speed = 6 + Math.random() * 8;
        this._confettiBurst.push({
          x: a.x + Math.cos(ang) * rad,
          y: 0.4 + Math.random() * 0.8,
          z: a.z + Math.sin(ang) * rad,
          vx: Math.cos(ang) * speed * 0.5,
          vy: 8 + Math.random() * 6,
          vz: Math.sin(ang) * speed * 0.5,
          phase: Math.random() * Math.PI * 2,
          spin: 3 + Math.random() * 7,
          size: 0.08 + Math.random() * 0.08,
          sx: a.x, sy: 0.3, sz: a.z,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }
  }
  private drawConfetti(dt: number, view: Float32Array, eye: number[], camYaw = 0, drawRain = false) {
    const gl = this.gl;
    const t = this.elapsed;
    if ((!this._confetti.length && !this._confettiBurst.length) || !this._confettiVao) return;
    if (drawRain && this._winTrailStartedAt >= 0) {
      const trailAge = t - this._winTrailStartedAt;
      if (trailAge > RacingRenderer.WIN_TRAIL_SECONDS) {
        this._winTrailStartedAt = -1;
      } else if (Math.abs(this._winTrailSpeed) >= RacingRenderer.WIN_TRAIL_MIN_SPEED
        && this._confetti.length + this._confettiBurst.length < this._confettiCap) {
        const a = this.winTrailAnchor;
        const ayaw = a ? a.yaw : camYaw;
        const bx = (a ? a.x : eye[0]) - Math.sin(ayaw) * 2.5;
        const bz = (a ? a.z : eye[2]) - Math.cos(ayaw) * 2.5;
        const backX = -Math.sin(ayaw);
        const backZ = -Math.cos(ayaw);
        const colors: [number, number, number][] = [
          [0.95, 0.25, 0.3], [0.2, 0.7, 0.95], [0.98, 0.8, 0.1], [0.3, 0.85, 0.4],
          [0.95, 0.5, 0.85], [0.95, 0.6, 0.2], [0.55, 0.45, 0.95], [0.95, 0.95, 0.98],
        ];
        for (let i = 0; i < 5; i++) {
          const spread = (Math.random() - 0.5) * 0.7;
          const sideX = -Math.cos(camYaw);
          const sideZ = Math.sin(camYaw);
          this._confetti.push({
            x: bx + sideX * spread,
            y: 1.1 + Math.random() * 0.35,
            z: bz + sideZ * spread,
            vx: backX * (3 + Math.random() * 3) + (Math.random() - 0.5) * 0.6,
            vy: 1.2 + Math.random() * 1.6,
            vz: backZ * (3 + Math.random() * 3) + (Math.random() - 0.5) * 0.6,
            phase: Math.random() * Math.PI * 2,
            spin: 2 + Math.random() * 5,
            size: 0.08 + Math.random() * 0.08,
            color: colors[Math.floor(Math.random() * colors.length)],
          });
        }
      }
    }
    const rxx = view[0], rxy = view[4], rxz = view[8];
    const uxx = view[1], uxy = view[5], uxz = view[9];
    const data: number[] = [];
    for (const c of this._confetti) {
      const fall = c.petal ? c.vy * 0.5 : c.vy;
      const swayX = c.petal ? 0.34 : 0.12;
      const swayZ = c.petal ? 0.3 : 0.1;
      c.y -= fall * dt;
      c.x += c.vx * dt + Math.sin(t * 2.4 + c.phase) * swayX * dt;
      c.z += c.vz * dt + Math.cos(t * 2 + c.phase) * swayZ * dt;
      c.phase += c.spin * dt;
      if (c.y < 0.3) c.y = c.petal ? 5 + Math.random() * 7 : 12 + Math.random() * 10;
      if (Math.hypot(c.x - eye[0], c.z - eye[2]) > 110) continue;
      const s = c.size;
      const ca = Math.cos(c.phase), sa = Math.sin(c.phase);
      const ax = rxx * ca + uxx * sa, ay = rxy * ca + uxy * sa, az = rxz * ca + uxz * sa;
      const bx = -rxx * sa + uxx * ca, by = -rxy * sa + uxy * ca, bz = -rxz * sa + uxz * ca;
      const col = c.color;
      const base = data.length / 11;
      const p = (ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) => {
        data.push(c.x + ax * ox + bx * oz, c.y + ay * ox + by * oz, c.z + az * ox + bz * oz, nx, ny, nz, col[0], col[1], col[2], 0, 0);
      };
      const hw = c.petal ? s * 1.7 : s;
      const hd = c.petal ? s * 0.5 : s;
      p(-hw, 0, -hd, 0, 1, 0); p(hw, 0, -hd, 0, 1, 0); p(-hw, 0, hd, 0, 1, 0);
      p(hw, 0, -hd, 0, 1, 0); p(hw, 0, hd, 0, 1, 0); p(-hw, 0, hd, 0, 1, 0);
    }
    for (const c of this._confettiBurst) {
      c.vy -= 24 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.phase += c.spin * dt;
      if (c.y < 0.3) {
        c.y = 12 + Math.random() * 10;
        c.vx = (Math.random() - 0.5) * 0.6;
        c.vy = 0.8 + Math.random() * 0.9;
        c.vz = (Math.random() - 0.5) * 0.6;
        c.x = c.sx + (Math.random() - 0.5) * 10;
        c.z = c.sz + (Math.random() - 0.5) * 10;
      }
      if (Math.hypot(c.x - eye[0], c.z - eye[2]) > 110) continue;
      const s = c.size;
      const ca = Math.cos(c.phase), sa = Math.sin(c.phase);
      const ax = rxx * ca + uxx * sa, ay = rxy * ca + uxy * sa, az = rxz * ca + uxz * sa;
      const bx = -rxx * sa + uxx * ca, by = -rxy * sa + uxy * ca, bz = -rxz * sa + uxz * ca;
      const col = c.color;
      const p = (ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) => {
        data.push(c.x + ax * ox + bx * oz, c.y + ay * ox + by * oz, c.z + az * ox + bz * oz, nx, ny, nz, col[0], col[1], col[2], 0, 0);
      };
      p(-s, 0, -s, 0, 1, 0); p(s, 0, -s, 0, 1, 0); p(-s, 0, s, 0, 1, 0);
      p(s, 0, -s, 0, 1, 0); p(s, 0, s, 0, 1, 0); p(-s, 0, s, 0, 1, 0);
    }
    if (!data.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._confettiBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    gl.bindVertexArray(this._confettiVao);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
    gl.bindVertexArray(null);
  }
  private drawSkyObjects(dt: number) {
    const gl = this.gl;
    const t = this.elapsed;
    const cx = this._trackCenterX, cz = this._trackCenterZ;
    if (this._birds.length && this._birdsBuf && this._birdsVao) {
      const data: number[] = [];
      const stoopMs = RacingRenderer.EAGLE_STOOP_MS / 1000;
      for (const b of this._birds) {
        b.ang += b.dir * b.speed * dt;
        if (b.eagle) {
          if (b.diveT <= 0 && b.diveNext > 0) {
            b.diveNext -= dt;
            if (b.diveNext <= 0) {
              b.diveT = stoopMs;
              b.diveNext = Number.MAX_SAFE_INTEGER;
              const tp = this._trackPoints[Math.floor(Math.random() * this._trackPoints.length)];
              if (tp) { b.diveX = tp.x; b.diveZ = tp.z; }
            }
          } else if (b.diveT > 0) {
            b.diveT -= dt;
            if (b.diveT <= 0) {
              b.diveT = 0;
              b.diveNext = RacingRenderer.EAGLE_STOOP_MIN_GAP + Math.random() * (RacingRenderer.EAGLE_STOOP_MAX_GAP - RacingRenderer.EAGLE_STOOP_MIN_GAP);
            }
          }
        }
        if (b.perch) {
          if (b.perchT <= 0 && b.perchNext > 0) {
            b.perchNext -= dt;
            if (b.perchNext <= 0) {
              b.perchT = RacingRenderer.VULTURE_PERCH_MS / 1000;
              b.perchNext = Number.MAX_SAFE_INTEGER;
              const spot = this._desertPerchSpots[Math.floor(Math.random() * this._desertPerchSpots.length)];
              if (spot) { b.perchX = spot.x; b.perchY = spot.y; b.perchZ = spot.z; }
            }
          } else if (b.perchT > 0) {
            b.perchT -= dt;
            if (b.perchT <= 0) {
              b.perchT = 0;
              b.perchNext = RacingRenderer.VULTURE_PERCH_MIN_GAP + Math.random() * (RacingRenderer.VULTURE_PERCH_MAX_GAP - RacingRenderer.VULTURE_PERCH_MIN_GAP);
            }
          }
        }
        const orbX = cx + Math.cos(b.ang) * b.radius;
        const orbZ = cz + Math.sin(b.ang) * b.radius;
        const orbY = b.alt + Math.sin(t * 0.7 + b.phase) * 2.5;
        let bx = orbX, bz = orbZ, by = orbY;
        let flapFreq = b.size >= 1.5 ? 5.5 : 9;
        let perched = false;
        if (b.eagle && b.diveT > 0) {
          const k = 1 - b.diveT / stoopMs;
          const down = Math.min(1, k / 0.6);
          const diveY = Math.max(4.5, b.alt * 0.16);
          const altF = down * down * (3 - 2 * down);
          by = b.alt * (1 - altF) + diveY * altF
            + Math.sin(t * 0.7 + b.phase) * 2.5 * (1 - altF);
          const horizF = Math.sin(Math.min(1, k) * Math.PI);
          bx = orbX + (b.diveX - orbX) * horizF;
          bz = orbZ + (b.diveZ - orbZ) * horizF;
          flapFreq = k < 0.6 ? 7.5 : 4.2;
        }
        if (b.perch && b.perchT > 0) {
          const pk = 1 - b.perchT / (RacingRenderer.VULTURE_PERCH_MS / 1000);
          if (pk < 0.3) {
            const d = pk / 0.3;
            const eased = d * d * (3 - 2 * d);
            by = orbY * (1 - eased) + b.perchY * eased;
            bx = orbX + (b.perchX - orbX) * eased;
            bz = orbZ + (b.perchZ - orbZ) * eased;
            flapFreq = 7.5;
          } else if (pk < 0.6) {
            bx = b.perchX; by = b.perchY; bz = b.perchZ;
            perched = true;
          } else {
            const d = (pk - 0.6) / 0.4;
            const eased = d * d * (3 - 2 * d);
            by = b.perchY * (1 - eased) + orbY * eased;
            bx = b.perchX + (orbX - b.perchX) * eased;
            bz = b.perchZ + (orbZ - b.perchZ) * eased;
            flapFreq = 4.2;
          }
        }
        const flap = Math.sin(t * flapFreq + b.phase) * 0.22 * (b.size >= 1.5 ? 0.8 : 1) * (b.eagle && b.diveT > 0 ? 0.45 : 1) * (perched ? 0 : 1);
        const dx = Math.cos(b.ang + Math.PI / 2) * b.dir;
        const dz = Math.sin(b.ang + Math.PI / 2) * b.dir;
        const px = -dz, pz = dx;
        const shade = b.shade;
        const bodyF = 0.16 * b.size;
        const wing = 0.9 * b.size * (perched ? 0.16 : 1);
        const mk = (x: number, y: number, z: number) => {
          data.push(x, y, z, 0, 1, 0, shade, shade, shade + 0.01, 0, 0);
        };
        mk(bx - dx * bodyF, by + flap, bz - dz * bodyF);
        mk(bx, by, bz);
        mk(bx + px * wing, by - flap * 0.6, bz + pz * wing);
        mk(bx + dx * bodyF, by + flap, bz + dz * bodyF);
        mk(bx, by, bz);
        mk(bx - px * wing, by - flap * 0.6, bz - pz * wing);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._birdsBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
      gl.bindVertexArray(this._birdsVao);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      this.mat4Identity(this.modelMatrix);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.setNormalMatrix(this.modelMatrix);
      gl.drawArrays(gl.TRIANGLES, 0, this._birds.length * 6);
      gl.bindVertexArray(null);
    }
    if (this._balloons.length && this._balloonVao && this._balloonCount) {
      for (const bal of this._balloons) {
        bal.ang += 0.012 * dt;
        const bx = cx + Math.cos(bal.ang) * bal.radius;
        const bz = cz + Math.sin(bal.ang) * bal.radius;
        const by = bal.alt + Math.sin(t * 0.5 + bal.phase) * 1.8;
        this.mat4Translate(this.modelMatrix, [bx, by, bz]);
        gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
        this.setNormalMatrix(this.modelMatrix);
        gl.uniform1i(this.hasTexLoc, 0);
        gl.uniform3f(this.colorLoc, bal.color[0], bal.color[1], bal.color[2]);
        gl.bindVertexArray(this._balloonVao);
        gl.drawElements(gl.TRIANGLES, this._balloonCount, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
      }
    }
  }
  private drawDesertWind(dt: number, proj: Float32Array, view: Float32Array, eye: number[], advance: boolean) {
    if (this.theme !== 'desert') return;
    if (!this._tumbleweeds.length && !this._dustDevils.length) return;
    const gl = this.gl;
    const t = this.elapsed;
    const cx = this._trackCenterX, cz = this._trackCenterZ;
    const cull2 = 120 * 120;
    const rx = view[0], ry = view[4], rz = view[8];
    const ux = view[1], uy = view[5], uz = view[9];
    if (this._tumbleweeds.length) {
      const data: number[] = [];
      for (const w of this._tumbleweeds) {
        if (advance) {
          w.x += w.vx * dt;
          w.z += w.vz * dt;
          if (w.x < cx - 340) { w.x = cx - 340; w.vx = Math.abs(w.vx); }
          if (w.x > cx + 340) { w.x = cx + 340; w.vx = -Math.abs(w.vx); }
          if (w.z < cz - 340) { w.z = cz - 340; w.vz = Math.abs(w.vz); }
          if (w.z > cz + 340) { w.z = cz + 340; w.vz = -Math.abs(w.vz); }
          w.phase += w.spin * dt;
        }
        const dx = w.x - eye[0], dz = w.z - eye[2];
        if (dx * dx + dz * dz > cull2) continue;
        const shade = 0.85 + Math.sin(t * 1.3 + w.phase) * 0.15;
        const col = [0.5 * shade, 0.34 * shade, 0.17 * shade];
        const s = w.size;
        for (const ang of [0, Math.PI / 2]) {
          const ca = Math.cos(w.phase + ang), sa = Math.sin(w.phase + ang);
          const ax = rx * ca + ux * sa, ay = ry * ca + uy * sa, az = rz * ca + uz * sa;
          const bx = -rx * sa + ux * ca, by = -ry * sa + uy * ca, bz = -rz * sa + uz * ca;
          const ring: number[][] = [];
          for (let i = 0; i <= 10; i++) {
            const th = (i / 10) * Math.PI * 2;
            const ox = Math.cos(th) * s, oz = Math.sin(th) * s;
            ring.push([w.x + ax * ox + bx * oz, 0.32 + ay * ox + by * oz, w.z + az * ox + bz * oz]);
          }
          for (let i = 0; i < 10; i++) {
            data.push(w.x, 0.32, w.z, 0, 1, 0, col[0], col[1], col[2], 0, 0);
            data.push(ring[i][0], ring[i][1], ring[i][2], 0, 1, 0, col[0], col[1], col[2], 0, 0);
            data.push(ring[i + 1][0], ring[i + 1][1], ring[i + 1][2], 0, 1, 0, col[0], col[1], col[2], 0, 0);
          }
        }
      }
      if (data.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._windBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
        gl.bindVertexArray(this._windVao);
        gl.uniform1i(this.hasTexLoc, 0);
        gl.uniform3f(this.colorLoc, 1, 1, 1);
        this.mat4Identity(this.modelMatrix);
        gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
        this.setNormalMatrix(this.modelMatrix);
        gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
        gl.bindVertexArray(null);
      }
    }
    if (this._dustDevils.length) {
      const data: number[] = [];
      for (const d of this._dustDevils) {
        if (advance) {
          d.life += dt;
          d.phase += 2.6 * dt;
          d.vx += Math.sin(t * 0.7 + d.phase) * 0.16 * dt;
          d.vz += Math.cos(t * 0.5 + d.phase) * 0.16 * dt;
          d.x += d.vx * dt;
          d.z += d.vz * dt;
          if (d.life > d.maxLife || Math.abs(d.x - cx) > 380 || Math.abs(d.z - cz) > 380) {
            d.life = 0;
            d.maxLife = 9 + Math.random() * 8;
            d.x = cx + (Math.random() - 0.5) * 460;
            d.z = cz + (Math.random() - 0.5) * 460;
            d.vx = 1.1 + Math.random() * 1.3;
            d.vz = 0.4 + Math.random() * 1.3;
            d.size = 1.1 + Math.random() * 0.9;
          }
        }
        const dx = d.x - eye[0], dz = d.z - eye[2];
        if (dx * dx + dz * dz > cull2) continue;
        const c1 = Math.cos(d.phase), s1 = Math.sin(d.phase);
        const a1x = rx * c1 + ux * s1, a1y = ry * c1 + uy * s1, a1z = rz * c1 + uz * s1;
        const b1x = -rx * s1 + ux * c1, b1y = -ry * s1 + uy * c1, b1z = -rz * s1 + uz * c1;
        const quads: [number, number, number][] = [[0.35, 1.0, 0.26], [1.8, 0.8, 0.34], [3.1, 0.5, 0.16]];
        for (const rot of [0, Math.PI / 2]) {
          const cr = Math.cos(rot), sr = Math.sin(rot);
          const ax = a1x * cr + b1x * sr, ay = a1y * cr + b1y * sr, az = a1z * cr + b1z * sr;
          for (const [cy, wf, alpha] of quads) {
            const hw = (d.size * Math.max(0.35, 1 - cy / 3.4) * wf) / 2;
            const hh = 0.55 * (0.8 + cy * 0.35);
            const x0 = d.x, y0 = cy, z0 = d.z;
            const p1 = [x0 + ax * hw, y0 + hh, z0 + az * hw];
            const p2 = [x0 + ax * hw, y0 - hh, z0 + az * hw];
            const p3 = [x0 - ax * hw, y0 - hh, z0 - az * hw];
            const p4 = [x0 - ax * hw, y0 + hh, z0 - az * hw];
            for (const [px, py, pz] of [p1, p2, p3, p1, p3, p4]) {
              data.push(px, py, pz, 0.78, 0.64, 0.42, alpha);
            }
          }
        }
      }
      if (data.length) {
        this.initSmoke();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._windSmokeBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
        gl.useProgram(this.smokeProg);
        gl.uniformMatrix4fv(this.smokeProjLoc, false, proj);
        gl.uniformMatrix4fv(this.smokeViewLoc, false, view);
        gl.bindVertexArray(this._windSmokeVao);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
        gl.bindVertexArray(null);
        gl.depthMask(true);
      }
    }
  }
  private drawAnimals(eye: number[]) {
    const gl = this.gl;
    if (!this._animals.length || !this._animalsVao || !this._animalsBuf) return;
    const t = this.elapsed;
    const data: number[] = [];
    let w = 0;
    const cull2 = 90 * 90;
    for (const a of this._animals) {
      const dx = a.x - eye[0];
      const dz = a.z - eye[2];
      if (dx * dx + dz * dz > cull2) continue;
      const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
      const s = a.size;
      const isMarmot = a.kind === 2;
      if (isMarmot) {
        const d2 = dx * dx + dz * dz;
        if (d2 < 24 * 24) {
          if (a.retr <= 0) {
            a.retr = t;
            this._marmotWhistles++;
          }
        } else if (a.retr > 0 && t - a.retr >= 6.1) {
          a.retr = 0;
        }
        if (a.retr > 0 && t - a.retr >= 7.3) a.retr = 0;
      }
      const graze = Math.max(0, Math.sin(t * 0.35 + a.phase) - 0.55) * 2.2;
      const bob = Math.sin(t * 2.1 + a.phase) * 0.02 * s;
      const tail = Math.sin(t * 3.3 + a.phase) * 0.05 * s;
      const isDeer = a.kind === 0;
      const bodyCol: [number, number, number] = isDeer ? [0.58, 0.4, 0.24] : [0.45, 0.45, 0.48];
      const legCol: [number, number, number] = isDeer ? [0.3, 0.2, 0.12] : [0.32, 0.32, 0.35];
      const headCol: [number, number, number] = isDeer ? [0.62, 0.45, 0.28] : [0.5, 0.5, 0.53];
      const hornCol: [number, number, number] = [0.85, 0.85, 0.88];
      const L = (lx: number, lz: number) => [a.x + lx * cy - lz * sy, a.z + lx * sy + lz * cy] as const;
      const [bx1, bz1] = L(0, 0);
      w = this.pushBoxVerts(data, w, bx1, 0.28 * s, bz1, 1.0 * s, 0.42 * s, 0.34 * s, bodyCol[0], bodyCol[1], bodyCol[2]);
      for (const sideL of [-1, 1]) {
        for (const fwdL of [-1, 1]) {
          const [lx2, lz2] = L(fwdL * 0.32 * s, sideL * 0.12 * s);
          w = this.pushBoxVerts(data, w, lx2, 0.12 * s, lz2, 0.1 * s, 0.24 * s, 0.1 * s, legCol[0], legCol[1], legCol[2]);
        }
      }
      const neckBaseY = 0.42 * s;
      const headDip = graze * 0.18 * s;
      const [nx, nz] = L(0.42 * s, 0);
      w = this.pushBoxVerts(data, w, nx, neckBaseY - headDip * 0.5, nz, 0.16 * s, 0.36 * s, 0.16 * s, bodyCol[0], bodyCol[1], bodyCol[2]);
      const [hx, hz] = L(0.52 * s, 0);
      w = this.pushBoxVerts(data, w, hx, neckBaseY + 0.16 * s - headDip, hz, 0.2 * s, 0.18 * s, 0.14 * s, headCol[0], headCol[1], headCol[2]);
      for (const sideL of [-1, 1]) {
        if (isDeer) {
          const [ex, ez] = L(0.52 * s, sideL * 0.12 * s);
          w = this.pushBoxVerts(data, w, ex, neckBaseY + 0.3 * s - headDip, ez, 0.05 * s, 0.1 * s, 0.03 * s, headCol[0], headCol[1], headCol[2]);
        } else {
          const [gx, gz] = L(0.5 * s, sideL * 0.07 * s);
          w = this.pushBoxVerts(data, w, gx, neckBaseY + 0.28 * s - headDip, gz, 0.05 * s, 0.16 * s, 0.05 * s, hornCol[0], hornCol[1], hornCol[2]);
        }
      }
      const tailCol: [number, number, number] = isDeer ? [0.85, 0.8, 0.7] : [0.4, 0.4, 0.43];
      const [tx, tz] = L(-0.55 * s, 0);
      w = this.pushBoxVerts(data, w, tx, 0.42 * s + tail, tz, 0.07 * s, 0.1 * s, 0.06 * s, tailCol[0], tailCol[1], tailCol[2]);
      if (isMarmot) {
        const k = a.retr > 0 ? Math.max(0, Math.min(1, (t - a.retr) / 7.3)) : 0;
        let vis = 1;
        if (k < 0.22) vis = 1 - Math.sin((k / 0.22) * Math.PI * 0.5);
        else if (k >= 0.84) vis = Math.sin(((k - 0.84) / 0.16) * Math.PI * 0.5);
        else vis = 0;
        w = this.pushBoxVerts(data, w, a.x, 0.05 * s, a.z, 0.6 * s, 0.1 * s, 0.5 * s, 0.62, 0.58, 0.52);
        const [mx, mz] = L(-0.5 * s, 0.35 * s);
        w = this.pushBoxVerts(data, w, mx, 0.02 * s, mz, 0.5 * s, 0.08 * s, 0.36 * s, 0.32, 0.26, 0.2);
        if (vis > 0.02) {
          const vs = s * vis;
          const breathe = Math.sin(t * 3.1 + a.phase) * 0.015 * vs;
          w = this.pushBoxVerts(data, w, a.x, 0.16 * vs + breathe, a.z, 0.5 * vs, 0.36 * vs, 0.4 * vs, 0.66, 0.48, 0.28);
          const [hx, hz] = L(0.2 * vs, 0);
          w = this.pushBoxVerts(data, w, hx, 0.36 * vs + breathe, hz, 0.26 * vs, 0.22 * vs, 0.24 * vs, 0.6, 0.42, 0.24);
          for (const sideL of [-1, 1]) {
            const [ex, ez] = L(0.24 * vs, sideL * 0.12 * vs);
            w = this.pushBoxVerts(data, w, ex, 0.5 * vs + breathe, ez, 0.06 * vs, 0.12 * vs, 0.04 * vs, 0.42, 0.3, 0.18);
          }
          const [tlx, tlz] = L(-0.3 * vs, 0);
          w = this.pushBoxVerts(data, w, tlx, 0.16 * vs + breathe, tlz, 0.12 * vs, 0.06 * vs, 0.08 * vs, 0.55, 0.4, 0.24);
        }
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this._animalsBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
    gl.bindVertexArray(this._animalsVao);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 11);
    gl.bindVertexArray(null);
  }
  /** Spikes the crowd animation into a cheering frenzy (used when a car
   *  roars past a grandstand). Level 0..1; decays back to 0 over ~4s. */
  exciteCrowd(level = 1) {
    this._crowdExcitement = Math.max(0, Math.min(1, Math.max(this._crowdExcitement, level)));
  }
  /** Drains the marmot-alarm queue. Returns the number of whistles queued
   *  since the last call (the component plays a whistle sound for each). */
  consumeMarmotWhistle(): number {
    const n = this._marmotWhistles;
    this._marmotWhistles = 0;
    return n;
  }
  render(eyeX: number, eyeY: number, eyeZ: number, yaw: number, pitch: number, aspect: number,
    cars: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed?: number; accel?: number; spin?: number; slide?: number; id?: string })[], dt: number,
    fovZoom: number = 1.0, shakeX: number = 0, shakeY: number = 0, isRaining: boolean = false, speedRatio: number = 0,
    playerSpeed: number = 0, playerAccel: number = 0, playerSpin: number = 0, playerSlide: number = 0, playerAppearance?: RacingCarAppearance,
    skipMirror: boolean = false) {
    const gl = this.gl;
    this.elapsed += dt;
    // Tire wear — accumulate race distance and darken the sidewall brand as
    // the stint goes on (full wear after ~4 laps of the current circuit). The
    // texture is only re-baked when wear crosses a 5% bucket, so this costs
    // nothing per frame.
    this._tireDist += Math.abs(playerSpeed) * dt;
    const wearTarget = Math.min(1, this._tireDist / Math.max(1, this.totalTrackDist * 4));
    if (wearTarget !== this.tireWear) { this.tireWear = wearTarget; this.updateTireBrandWear(); }
    if (this._winTrailStartedAt >= 0) {
      this._winTrailSpeed = Math.abs(playerSpeed);
    }
    if (this._crowdExcitement > 0) {
      this._crowdExcitement = Math.max(0, this._crowdExcitement - dt * 0.25);
    }
    const fov = 1.1 * fovZoom;
    this.mat4Perspective(this.projMatrix, fov, aspect, 0.5, 600);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const eye = [eyeX + shakeX, eyeY + shakeY, eyeZ];
    const lookX = eye[0] + sinY * cosP;
    const lookY = eye[1] - sinP;
    const lookZ = eye[2] + cosY * cosP;
    this.mat4LookAt(this.viewMatrix, eye as number[], [lookX, lookY, lookZ], [0, 1, 0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.shadowProg);
    const lightTarget = [eyeX + this.sunDir[0] * 50, eyeY + this.sunDir[1] * 50, eyeZ + this.sunDir[2] * 50];
    const lightEye = [eyeX - this.sunDir[0] * 80, eyeY - this.sunDir[1] * 80, eyeZ - this.sunDir[2] * 80];
    this.mat4LookAt(this.lightView, lightEye, lightTarget, [0, 1, 0]);
    this.mat4Ortho(this.lightProj, -80, 80, -80, 80, 0, 200);
    this.mat4Multiply(this.lightSpace, this.lightProj, this.lightView);
    gl.uniformMatrix4fv(this.shadowLightLoc, false, this.lightSpace);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.shadowModelLoc, false, this.modelMatrix);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 2.0);
    gl.bindVertexArray(this.trackVao);
    gl.drawElements(gl.TRIANGLES, this.trackCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.barrierVao);
    gl.drawElements(gl.TRIANGLES, this.barrierCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.finishVao);
    gl.drawElements(gl.TRIANGLES, this.finishCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.sceneryVao);
    gl.drawElements(gl.TRIANGLES, this.sceneryCount, gl.UNSIGNED_INT, 0);
    for (const car of cars) {
      this.renderCarShadow(car.x, car.y, car.z, car.yaw, car.speed ?? 0, car.spin, car.slide ?? 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    const heatStrength = 0.4 + 0.6 * Math.pow(Math.max(0, Math.min(1, speedRatio)), 1.5);
    if (this.heatShimmer && this.ensureHeatPass()) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._heatFBO);
      gl.viewport(0, 0, this._heatW, this._heatH);
      gl.clearColor(0.4, 0.45, 0.5, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.drawWorldScene(this.projMatrix, this.viewMatrix, eye as number[], cars, dt, isRaining, true, speedRatio);
      this.buildHeatMask(this.projMatrix, this.viewMatrix, this._heatW, this._heatH, false);
      this.drawHeatShimmer(heatStrength, eye as number[], this.projMatrix, this.viewMatrix);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clearColor(0.4, 0.45, 0.5, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.drawWorldScene(this.projMatrix, this.viewMatrix, eye as number[], cars, dt, isRaining, true, speedRatio);
    }
    if (!skipMirror) {
      this.renderMirror(eyeX, eyeY, eyeZ, yaw, cars, dt, isRaining, playerSpeed, playerAccel, playerSpin, playerSlide, playerAppearance, heatStrength);
    }
  }
  /** Turntable view of the real race car (same mesh + appearance as on track) for
   *  the garage. `vp` is the canvas-pixel rectangle of the preview stage so the
   *  car fills exactly the preview column on desktop and the top strip on mobile. */
  renderGarage(rotY: number, rotX: number, zoom: number, appearance: RacingCarAppearance,
    vp: { x: number; y: number; w: number; h: number }, dt: number = 0) {
    const gl = this.gl;
    this.elapsed += dt;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.028, 0.028, 0.055, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const w = Math.max(1, Math.round(vp.w));
    const h = Math.max(1, Math.round(vp.h));
    gl.viewport(Math.round(vp.x), Math.round(vp.y), w, h);
    const aspect = w / h;
    const dist = 4.1 / Math.max(0.45, zoom);
    const yaw = (rotY * Math.PI) / 180;
    const pitch = Math.min(1.15, Math.max(-0.25, (rotX * Math.PI) / 180));
    const eyeX = Math.sin(yaw) * Math.cos(pitch) * dist;
    const eyeY = Math.sin(pitch) * dist + 0.28;
    const eyeZ = Math.cos(yaw) * Math.cos(pitch) * dist;
    this.mat4Perspective(this.projMatrix, 1.0, aspect, 0.5, 100);
    this.mat4LookAt(this.viewMatrix, [eyeX, eyeY, eyeZ], [0, 0.18, 0], [0, 1, 0]);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.projLoc, false, this.projMatrix);
    gl.uniformMatrix4fv(this.viewLoc, false, this.viewMatrix);
    gl.uniform3fv(this.lightDirLoc, this.sunDir);
    gl.uniform3fv(this.envTopLoc, this.skyTop);
    gl.uniform3fv(this.envBottomLoc, this.skyBottom);
    gl.uniform1f(this.envStrengthLoc, 0.4);
    gl.uniform3fv(this.sunColorLoc, this.sunColor);
    gl.uniform3fv(this.ambientLoc, this.ambientColor);
    gl.uniform3fv(this.fogColorLoc, this.fogColor);
    gl.uniform3f(this.viewPosLoc, eyeX, eyeY, eyeZ);
    gl.uniform1f(this.alphaLoc, 1);
    gl.uniform1f(this.emissiveLoc, 0);
    this.mat4Identity(this.lightSpace);
    gl.uniformMatrix4fv(this.lightMatrixLoc, false, this.lightSpace);
    gl.uniform1f(this.shadowTexelLoc, 1 / this.shadowSize);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.uniform1i(this.shadowMapLoc, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.hasTexLoc, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
    // Soft floor shadow under the parked car (dark ellipse blob, same glow quad).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.mat4Identity(this.modelMatrix);
    this.mat4Scale(this.modelMatrix, [1.3, 1.3, 1.3]);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.uniform3f(this.colorLoc, 0, 0, 0);
    gl.uniform1f(this.alphaLoc, 0.32);
    gl.uniform1f(this.metallicLoc, 0);
    gl.uniform1f(this.rimStrengthLoc, 0);
    gl.bindVertexArray(this.glowHaloVao);
    gl.drawElements(gl.TRIANGLES, this.glowHaloCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.uniform1f(this.alphaLoc, 1);
    gl.disable(gl.BLEND);
    // The real race car — same draw path as on track, so garage == racing model.
    const skin = appearance.skin ?? [0.85, 0.06, 0.06];
    this.renderCar(0, 0, 0, 0, skin[0], skin[1], skin[2], 0, 0, 0, 0, appearance);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }
  private pushBoxVerts(d: (number[] | Float32Array), wi: number, cx: number, cy: number, cz: number,
    l: number, h: number, w: number, r: number, g: number, b: number): number {
    const hx = l / 2, hy = h / 2, hz = w / 2;
    const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      d[wi++] = cx + x; d[wi++] = cy + y; d[wi++] = cz + z;
      d[wi++] = nx; d[wi++] = ny; d[wi++] = nz;
      d[wi++] = r; d[wi++] = g; d[wi++] = b;
      d[wi++] = 0; d[wi++] = 0;
    };
    v(-hx, -hy, hz, 0, 0, 1); v(hx, -hy, hz, 0, 0, 1); v(hx, hy, hz, 0, 0, 1);
    v(-hx, -hy, hz, 0, 0, 1); v(hx, hy, hz, 0, 0, 1); v(-hx, hy, hz, 0, 0, 1);
    v(hx, -hy, -hz, 0, 0, -1); v(-hx, -hy, -hz, 0, 0, -1); v(-hx, hy, -hz, 0, 0, -1);
    v(hx, -hy, -hz, 0, 0, -1); v(-hx, hy, -hz, 0, 0, -1); v(hx, hy, -hz, 0, 0, -1);
    v(hx, -hy, hz, 1, 0, 0); v(hx, -hy, -hz, 1, 0, 0); v(hx, hy, -hz, 1, 0, 0);
    v(hx, -hy, hz, 1, 0, 0); v(hx, hy, -hz, 1, 0, 0); v(hx, hy, hz, 1, 0, 0);
    v(-hx, -hy, -hz, -1, 0, 0); v(-hx, -hy, hz, -1, 0, 0); v(-hx, hy, hz, -1, 0, 0);
    v(-hx, -hy, -hz, -1, 0, 0); v(-hx, hy, hz, -1, 0, 0); v(-hx, hy, -hz, -1, 0, 0);
    v(-hx, hy, hz, 0, 1, 0); v(hx, hy, hz, 0, 1, 0); v(hx, hy, -hz, 0, 1, 0);
    v(-hx, hy, hz, 0, 1, 0); v(hx, hy, -hz, 0, 1, 0); v(-hx, hy, -hz, 0, 1, 0);
    v(-hx, -hy, -hz, 0, -1, 0); v(hx, -hy, -hz, 0, -1, 0); v(hx, -hy, hz, 0, -1, 0);
    v(-hx, -hy, -hz, 0, -1, 0); v(hx, -hy, hz, 0, -1, 0); v(-hx, -hy, hz, 0, -1, 0);
    return wi;
  }
  private static CROWD_CULL_DIST = 80;
  private buildFlagBuffers() {
    const gl = this.gl;
    if (!this._flags.length) { this._flagData = new Float32Array(0); return; }
    let cap = 0;
    for (const f of this._flags) {
      cap += f.kind === 'tri' ? 6 : (3 + (f.emblem ? 3 : 0)) * 36;
    }
    this._flagData = new Float32Array(cap * 11);
    this._flagVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._flagVao);
    this._flagBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._flagBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._flagData, gl.DYNAMIC_DRAW);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);
  }
  private pushTriVerts(d: Float32Array, wi: number, a: number[], b: number[], c: number[],
    r: number, g: number, bl: number): number {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const push = (p: number[]) => {
      d[wi++] = p[0]; d[wi++] = p[1]; d[wi++] = p[2];
      d[wi++] = nx; d[wi++] = ny; d[wi++] = nz;
      d[wi++] = r; d[wi++] = g; d[wi++] = bl;
      d[wi++] = 0; d[wi++] = 0;
    };
    push(a); push(b); push(c); push(a); push(c); push(b);
    return wi;
  }
  private drawFlags(eye: number[]) {
    const gl = this.gl;
    if (!this._flagVao || !this._flagData || !this._flags.length) return;
    gl.useProgram(this.prog);
    const t = this.elapsed;
    const data = this._flagData;
    const cull2 = RacingRenderer.CROWD_CULL_DIST * RacingRenderer.CROWD_CULL_DIST;
    const ex = eye[0];
    const ez = eye[2];
    let w = 0;
    for (const f of this._flags) {
      const dx = f.x - ex;
      const dz = f.z - ez;
      if (dx * dx + dz * dz > cull2) continue;
      const ppx = -f.dirZ;
      const ppz = f.dirX;
      if (f.kind === 'tri') {
        const sway = Math.sin(t * f.speed + f.phase) * 0.07 * f.amp;
        const bob = Math.sin(t * f.speed * 0.8 + f.phase * 1.3) * 0.05 * f.amp;
        const [r, g, b] = f.colors[0];
        const halfW = f.w * 0.5;
        const b0 = [f.x - ppx * halfW, f.anchorY, f.z - ppz * halfW];
        const b1 = [f.x + ppx * halfW, f.anchorY, f.z + ppz * halfW];
        const tip = [f.x + f.dirX * f.w + ppx * sway, f.anchorY - f.h + bob, f.z + f.dirZ * f.w + ppz * sway];
        w = this.pushTriVerts(data, w, b0, b1, tip, r, g, b);
      } else {
        const sw = Math.sin(t * f.speed * 0.6 + f.phase * 1.3) * 0.06 * f.amp;
        const segW = f.w / 3;
        let segOff = 0;
        for (let k = 0; k < 3; k++) {
          const grow = (k + 1) / 3;
          const dy = Math.sin(t * f.speed + f.phase + k * 1.1) * 0.055 * f.amp * grow;
          const roll = Math.sin(t * f.speed + f.phase * 1.7 + k * 1.7) * 0.05 * f.amp * grow;
          const [r, g, b] = f.colors[k % f.colors.length];
          w = this.pushBoxVerts(data, w,
            f.x + f.dirX * (segOff + segW / 2) + ppx * (sw + roll),
            f.anchorY - f.h / 2 + dy,
            f.z + f.dirZ * (segOff + segW / 2) + ppz * (sw + roll),
            segW - 0.02, f.h, 0.02, r, g, b);
          segOff += segW;
        }
        if (f.emblem) {
          const midRoll = Math.sin(t * f.speed + f.phase * 1.7 + 1.7) * 0.05 * f.amp * (2 / 3);
          const midWave = Math.sin(t * f.speed + f.phase + 1.1) * 0.055 * f.amp * (2 / 3);
          const cx = f.x + f.dirX * (f.w / 2) + ppx * midRoll;
          const cy = f.anchorY - f.h / 2 + midWave;
          const cz = f.z + f.dirZ * (f.w / 2) + ppz * midRoll;
          if (f.emblem === 'maple') {
            w = this.pushBoxVerts(data, w, cx, cy, cz + 0.02, 0.06, f.h * 0.42, 0.035, 0.82, 0.1, 0.12);
            w = this.pushBoxVerts(data, w, cx - f.dirZ * 0.08, cy, cz + f.dirX * 0.08 + 0.02, 0.05, f.h * 0.36, 0.035, 0.82, 0.1, 0.12);
            w = this.pushBoxVerts(data, w, cx + f.dirZ * 0.08, cy, cz - f.dirX * 0.08 + 0.02, 0.05, f.h * 0.36, 0.035, 0.82, 0.1, 0.12);
          } else {
            w = this.pushBoxVerts(data, w, cx, cy, cz + 0.02, 0.1, f.h, 0.035, 0.95, 0.95, 0.95);
            w = this.pushBoxVerts(data, w, cx, cy, cz + 0.02, f.w, 0.12, 0.035, 0.95, 0.95, 0.95);
          }
        }
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this._flagBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindVertexArray(this._flagVao);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, w / 11);
    gl.bindVertexArray(null);
  }
  private drawCrowd(eye: number[]) {
    const gl = this.gl;
    if (!this._crowdVao || !this._crowdBuf || !this._crowdData || !this._crowdPeople.length) return;
    gl.useProgram(this.prog);
    const t = this.elapsed;
    const data = this._crowdData;
    const cull2 = RacingRenderer.CROWD_CULL_DIST * RacingRenderer.CROWD_CULL_DIST;
    const ex = eye[0];
    const ez = eye[2];
    const frenzy = 1 + this._crowdExcitement * 1.6;
    const waveSpeed = 4.1 + this._crowdExcitement * 3.2;
    let w = 0;
    for (const p of this._crowdPeople) {
      const dx = p.x - ex;
      const dz = p.z - ez;
      if (dx * dx + dz * dz > cull2) continue;
      const s = p.scale;
      const bob = Math.sin(t * 2.4 + p.phase) * 0.04 * frenzy * s;
      const legSway = Math.sin(t * 2.4 + p.phase) * 0.03 * frenzy * s;
      const y0 = p.y + bob;
      const ty = y0 + 0.72 * s;
      const [sr, sg, sb] = p.shirt;
      const [kr, kg, kb] = p.skin;
      const [hr, hg, hb] = p.hair;
      const [pr, pg, pb] = p.pants;
      w = this.pushBoxVerts(data, w, p.x + legSway * 0.4, y0 + 0.24 * s, p.z, 0.2 * s, 0.48 * s, 0.24 * s, pr, pg, pb);
      if (p.veiled) {
        const [xr, xg, xb] = p.pattern ?? [0.85, 0.6, 0.1];
        w = this.pushBoxVerts(data, w, p.x, ty, p.z, 0.3 * s, 0.62 * s, 0.32 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x, ty + 0.1 * s, p.z, 0.31 * s, 0.05 * s, 0.33 * s, xr, xg, xb);
        w = this.pushBoxVerts(data, w, p.x, ty + 0.44 * s, p.z, 0.18 * s, 0.16 * s, 0.18 * s, kr, kg, kb);
        w = this.pushBoxVerts(data, w, p.x, ty + 0.5 * s, p.z, 0.26 * s, 0.12 * s, 0.26 * s, sr, sg, sb);
      } else {
        w = this.pushBoxVerts(data, w, p.x, ty, p.z, 0.26 * s, 0.48 * s, 0.3 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x, ty + 0.34 * s, p.z, 0.17 * s, 0.17 * s, 0.17 * s, kr, kg, kb);
        w = this.pushBoxVerts(data, w, p.x, ty + 0.45 * s, p.z, 0.19 * s, 0.06 * s, 0.19 * s, hr, hg, hb);
      }
      const armLen = 0.4 * s;
      const shoulderY = ty + 0.18 * s;
      const sway = Math.sin(t * 2.9 + p.phase * 1.3) * 0.05 * frenzy * s;
      const wave = Math.sin(t * waveSpeed + p.phase) * 0.09 * frenzy * s;
      if (!p.veiled && p.pose === 0) {
        w = this.pushBoxVerts(data, w, p.x - 0.21 * s + sway, shoulderY - armLen / 2, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x + 0.21 * s - sway, shoulderY - armLen / 2, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
      } else if (!p.veiled && p.pose === 1) {
        w = this.pushBoxVerts(data, w, p.x - 0.2 * s, shoulderY + armLen / 2 + wave, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x + 0.2 * s, shoulderY + armLen / 2 - wave, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
      } else if (!p.veiled && p.pose === 2) {
        w = this.pushBoxVerts(data, w, p.x - 0.21 * s + sway, shoulderY - armLen / 2, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
        w = this.pushBoxVerts(data, w, p.x + 0.2 * s, shoulderY + armLen / 2 + wave, p.z, 0.07 * s, armLen, 0.09 * s, sr, sg, sb);
      }
      if (p.flag) {
        const poleX = p.x + 0.26 * s;
        const poleBaseY = ty + 0.14 * s;
        w = this.pushBoxVerts(data, w, poleX, poleBaseY + 0.26 * s, p.z, 0.045 * s, 0.52 * s, 0.045 * s, 0.2, 0.15, 0.1);
        const flagTopY = poleBaseY + 0.54 * s;
        for (let k = 0; k < 3; k++) {
          const fy = flagTopY - Math.sin(t * waveSpeed + p.phase * 1.7 + k * 0.9) * 0.05 * frenzy * s;
          w = this.pushBoxVerts(data, w, poleX + 0.02 * s + k * 0.16 * s, fy, p.z, 0.16 * s, 0.09 * s, 0.05 * s, 0.75, 0.08, 0.08);
        }
        const starY = flagTopY - Math.sin(t * waveSpeed + p.phase * 1.7 + 0.9) * 0.05 * frenzy * s;
        w = this.pushBoxVerts(data, w, poleX + 0.18 * s, starY, p.z + 0.015 * s, 0.08 * s, 0.08 * s, 0.07 * s, 0, 0.45, 0.15);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this._crowdBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindVertexArray(this._crowdVao);
    gl.uniform1i(this.hasTexLoc, 0);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, w / 11);
    gl.bindVertexArray(null);
  }
  private drawWorldScene(proj: Float32Array, view: Float32Array, eye: number[],
    cars: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed?: number; accel?: number; spin?: number; slide?: number; id?: string })[],
    dt: number, isRaining: boolean, drawRain: boolean, playerSpeedRatio: number = 0) {
    const gl = this.gl;
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.skyProg);
    gl.uniformMatrix4fv(this.skyProjLoc, false, proj);
    gl.uniformMatrix4fv(this.skyViewLoc, false, view);
    gl.uniform3fv(this.skySunDirLoc, this.sunDir);
    gl.uniform1f(this.skyTimeLoc, this.elapsed);
    gl.uniform3fv(this.skyTopLoc, this.skyTop);
    gl.uniform3fv(this.skyHorizonLoc, this.skyHorizon);
    gl.uniform3fv(this.skyBottomLoc, this.skyBottom);
    gl.uniform3fv(this.skySunColorLoc, this.sunColor);
    gl.uniform3fv(this.skyGlowColorLoc, [this.sunColor[0] * 0.85, this.sunColor[1] * 0.75, this.sunColor[2] * 0.6]);
    gl.uniform1f(this.skyNightLoc, this.night ? 1 : 0);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    if (isRaining) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.useProgram(this.prog);
    gl.uniform1f(this.alphaLoc, 1);
    gl.uniform1f(this.emissiveLoc, 0);
    gl.uniformMatrix4fv(this.projLoc, false, proj);
    gl.uniformMatrix4fv(this.viewLoc, false, view);
    gl.uniform3fv(this.lightDirLoc, this.sunDir);
    gl.uniform3fv(this.envTopLoc, this.skyTop);
    gl.uniform3fv(this.envBottomLoc, this.skyBottom);
    gl.uniform1f(this.envStrengthLoc, 0.16);
    if (isRaining) {
      gl.uniform3fv(this.sunColorLoc, new Float32Array([this.sunColor[0] * 0.5, this.sunColor[1] * 0.5, this.sunColor[2] * 0.55]));
    } else {
      gl.uniform3fv(this.sunColorLoc, this.sunColor);
    }
    gl.uniformMatrix4fv(this.lightMatrixLoc, false, this.lightSpace);
    gl.uniform1f(this.shadowTexelLoc, 1.0 / this.shadowSize);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(this.shadowMapLoc, 1);
    gl.activeTexture(gl.TEXTURE0);
    if (isRaining) {
      gl.uniform3fv(this.ambientLoc, new Float32Array([0.15, 0.15, 0.18]));
      gl.uniform3fv(this.fogColorLoc, new Float32Array([0.2, 0.22, 0.25]));
    } else {
      gl.uniform3fv(this.ambientLoc, this.ambientColor);
      gl.uniform3fv(this.fogColorLoc, this.fogColor);
    }
    gl.uniform3f(this.viewPosLoc, eye[0], eye[1], eye[2]);
    gl.uniform1i(this.hasTexLoc, 1);
    gl.bindVertexArray(this.trackVao);
    gl.uniform1i(this.textureLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trackTex);
    gl.uniform1i(this.hasTexLoc, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.trackCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.finishVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.uniform1i(this.hasTexLoc, 0);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.finishCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.barrierVao);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.barrierCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.sceneryVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.uniform1i(this.hasTexLoc, 1);
    this.mat4Identity(this.modelMatrix);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, 1, 1, 1);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.sceneryCount, gl.UNSIGNED_INT, 0);
    if (this._cloudCount > 0 && this._clouds.length > 0) {
      gl.uniform1f(this.alphaLoc, this._cloudAlpha);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
      gl.uniform1i(this.hasTexLoc, 1);
      gl.bindVertexArray(this._cloudVao);
      const t = this.elapsed;
      const sdLen = Math.hypot(this.sunDir[0], this.sunDir[2]) || 1;
      const sdx = this.sunDir[0] / sdLen;
      const sdz = this.sunDir[2] / sdLen;
      const range = 0.5 + 0.5 * (1 - Math.min(1, Math.max(0, this.sunDir[1])));
      const warmth = Math.max(0.2, Math.min(1, 0.4 + (this.sunColor[0] - this.sunColor[2]) * 1.5));
      for (let ci = 0; ci < this._clouds.length; ci++) {
        const c = this._clouds[ci];
        const a = c.ang + c.va * t;
        const cxp = this._cloudCenterX + Math.cos(a) * c.radius;
        const czp = this._cloudCenterZ + Math.sin(a) * c.radius;
        const side = Math.max(0, Math.min(1, 0.5 + 0.5 * (Math.cos(a) * sdx + Math.sin(a) * sdz)));
        gl.uniform3f(this.colorLoc,
          1 + (side - 0.5) * 0.28 * range * warmth,
          1 + (side - 0.5) * 0.14 * range * warmth,
          1 - (side - 0.5) * 0.2 * range);
        this.mat4Identity(this.modelMatrix);
        this.mat4Translate(this.modelMatrix, [cxp - c.bx, 0, czp - c.bz]);
        gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
        this.setNormalMatrix(this.modelMatrix);
        const r = this._cloudRanges[ci];
        gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, r.start * 4);
      }
      gl.bindVertexArray(null);
      gl.uniform1f(this.alphaLoc, 1);
    }
    gl.bindVertexArray(null);
    if (this.night && this.nightCount > 0) {
      gl.uniform1f(this.emissiveLoc, 1);
      gl.uniform1f(this.alphaLoc, 1);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.nightVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
      gl.uniform1i(this.hasTexLoc, 0);
      this.mat4Identity(this.modelMatrix);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      this.setNormalMatrix(this.modelMatrix);
      gl.drawElements(gl.TRIANGLES, this.nightCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(this.emissiveLoc, 0);
    }
    if (drawRain && this.theme === 'desert') {
      this.drawMirageLake(proj, view, eye);
    }
    this.drawSkyObjects(dt);
    this.drawDesertWind(dt, proj, view, eye, drawRain);
    const camYaw = Math.atan2(-view[8], -view[10]);
    this.drawConfetti(dt, view, eye, camYaw, drawRain);
    this.drawPalmFronds(eye);
    this.drawOasisWater(eye);
    this.drawAnimals(eye);
    this.drawScrubMarks(proj, view, eye);
    for (const car of cars) {
      this.renderCar(car.x, car.y, car.z, car.yaw, car.r, car.g, car.b, car.speed ?? 0, car.accel ?? 0, car.spin, car.slide ?? 0, car);
      if (drawRain && (car.slide ?? 0) > 0.35) {
        this.emitSmoke(car.x, car.z, car.yaw, car.slide ?? 0);
      }
      if (drawRain && this.theme === 'desert') {
        const off = this.getTrackLateralInfo(car.x, car.z);
        if (Math.abs(off.lateral) > off.width / 2 + 1.2) {
          this.emitSand(car.x, car.z, car.yaw, car.speed ?? 0);
        }
      }
      if (drawRain && (car.accel ?? 0) < -0.3) {
        this.emitBrakeDust(car.x, car.z, car.yaw, Math.min(1, -(car.accel ?? 0)), car.speed ?? 0);
        this.emitScrubMarks(car.x, car.z, car.yaw, Math.min(1, -(car.accel ?? 0)), car.speed ?? 0, car.id ?? 'anon');
      }
      if (drawRain && car.id) {
        let h = this._carHeat.get(car.id);
        if (!h) { h = [0, 0, 0, 0]; this._carHeat.set(car.id, h); }
        this.updateBrakeHeat(h, dt, car.speed ?? 0, car.accel ?? 0);
        this._carLock.set(car.id, this.updateWheelLock(this._carLock.get(car.id) ?? 0, dt, car.speed ?? 0, car.accel ?? 0));
        this._carSnow.set(car.id, this.updateSnowCap(this._carSnow.get(car.id) ?? 0, dt, car.speed ?? 0));
      }
    }
    gl.uniform1f(this.envStrengthLoc, 0.16);
    if (drawRain) {
      this.updateSmoke(dt);
      this.updateScrubMarks(dt);
      this.drawSmoke(proj, view);
    }
    this.drawCrowd(eye);
    this.drawFlags(eye);
    if (drawRain && isRaining) {
      this.initRainParticles();
    }
    if (drawRain && this._rainCount > 0) {
      const rain = this._rainParticles;
      const rainData: number[] = [];
      const wind = Math.sin(this.elapsed * 0.3) * 5;
      for (let i = 0; i < rain.length; i++) {
        const r = rain[i];
        r.y -= r.speed * dt;
        r.x += wind * dt;
        if (r.y < -2) { r.y = 25 + Math.random() * 5; r.x = eye[0] + (Math.random() - 0.5) * 200; r.z = eye[2] + (Math.random() - 0.5) * 200; }
        rainData.push(r.x, r.y, r.z, 0.5, 0.6, 0.8, 0.3);
        rainData.push(r.x, r.y - 0.5, r.z, 0.5, 0.6, 0.8, 0.3);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._rainBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(rainData));
      gl.useProgram(this.prog);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.bindVertexArray(this._rainVao);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      this.mat4Identity(this.modelMatrix);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      gl.drawArrays(gl.LINES, 0, this._rainCount);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
    }
    const snowing = this.theme === 'alpine' || this.theme === 'mountain';
    if (drawRain && snowing) {
      this.initSnowParticles();
      if (this._snowCount > 0) {
        const snow = this._snowParticles;
        const data = this._snowData!;
        let w = 0;
        const intensity = Math.max(0, Math.min(1, playerSpeedRatio));
        // Cap the per-frame flake count on weak GPUs — the draw is also scaled
        // by speed, so cruising still reads as light snowfall.
        const maxDraw = this.lowQuality ? 900 : snow.length;
        const drawCount = Math.min(maxDraw, Math.round(snow.length * (0.3 + 0.7 * intensity)));
        const gust = (1 + 0.9 * Math.sin(this.elapsed * 0.5) * Math.sin(this.elapsed * 0.13)) * (0.35 + 0.65 * intensity);
        const flakeBoost = 0.45 + 0.55 * intensity;
        for (let i = 0; i < drawCount; i++) {
          const f = snow[i];
          f.y -= f.fall * dt * (1 + 0.8 * intensity);
          const vx = f.wind * 0.3 * gust * flakeBoost + Math.sin(this.elapsed * 0.9 + f.phase) * 0.7 * flakeBoost;
          const vz = f.wind * 0.13 * gust * flakeBoost + Math.cos(this.elapsed * 0.7 + f.phase) * 0.5 * flakeBoost;
          f.x += vx * dt;
          f.z += vz * dt;
          if (f.y < -2) {
            f.y = 30 + Math.random() * 12;
            f.x = eye[0] + (Math.random() - 0.5) * 260;
            f.z = eye[2] + (Math.random() - 0.5) * 260;
          }
          const vlen = Math.hypot(vx, vz) || 1;
          const sx = (vx / vlen) * 0.1;
          const sz = (vz / vlen) * 0.1;
          data[w++] = f.x; data[w++] = f.y; data[w++] = f.z; data[w++] = 0.97; data[w++] = 0.98; data[w++] = 1; data[w++] = 0.9;
          data[w++] = f.x + sx; data[w++] = f.y - 0.16; data[w++] = f.z + sz; data[w++] = 0.97; data[w++] = 0.98; data[w++] = 1; data[w++] = 0.9;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this._snowBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, w));
        gl.useProgram(this.prog);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(false);
        gl.bindVertexArray(this._snowVao);
        gl.uniform1i(this.hasTexLoc, 0);
        gl.uniform3f(this.colorLoc, 1, 1, 1);
        this.mat4Identity(this.modelMatrix);
        gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
        gl.drawArrays(gl.LINES, 0, w / 7);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
      }
    }
  }
  private renderMirror(eyeX: number, eyeY: number, eyeZ: number, yaw: number,
    cars: (RacingCarAppearance & { x: number; y: number; z: number; yaw: number; r: number; g: number; b: number; speed?: number; accel?: number; spin?: number; slide?: number; id?: string })[],
    dt: number, isRaining: boolean, playerSpeed: number = 0, playerAccel: number = 0, playerSpin: number = 0, playerSlide: number = 0, playerAppearance?: RacingCarAppearance, heatStrength: number = 1.0) {
    const gl = this.gl;
    const mEye = [eyeX, eyeY + 0.22, eyeZ];
    const mYaw = yaw + Math.PI;
    const mPitch = 0.06;
    const cosY = Math.cos(mYaw), sinY = Math.sin(mYaw);
    const cosP = Math.cos(mPitch), sinP = Math.sin(mPitch);
    const lookX = mEye[0] + sinY * cosP;
    const lookY = mEye[1] - sinP;
    const lookZ = mEye[2] + cosY * cosP;
    this.mat4Perspective(this.mirrorProj, 1.35, this.mirrorW / this.mirrorH, 0.5, 600);
    this.mat4LookAt(this.mirrorView, mEye as number[], [lookX, lookY, lookZ], [0, 1, 0]);
    const useMirrorHeat = this.heatShimmer && this.ensureMirrorScenePass();
    gl.bindFramebuffer(gl.FRAMEBUFFER, useMirrorHeat ? this._mirrorSceneFBO : this.mirrorFBO);
    gl.viewport(0, 0, this.mirrorW, this.mirrorH);
    gl.clearColor(0.4, 0.45, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawWorldScene(this.mirrorProj, this.mirrorView, mEye, cars, dt, isRaining, false);
    this.updateBrakeHeat(this._playerHeat, dt, playerSpeed, playerAccel);
    this._playerLock = this.updateWheelLock(this._playerLock, dt, playerSpeed, playerAccel);
    this._playerSnow = this.updateSnowCap(this._playerSnow, dt, playerSpeed);
    const pa = playerAppearance ?? {};
    this.renderCar(eyeX, 0.1, eyeZ, yaw,
      pa.skin?.[0] ?? 0.85, pa.skin?.[1] ?? 0.06, pa.skin?.[2] ?? 0.06,
      playerSpeed, playerAccel, playerSpin, playerSlide, pa);
    let mirrorPuffs = false;
    if (playerSlide > 0.35) {
      this.emitSmoke(eyeX, eyeZ, yaw, playerSlide);
      mirrorPuffs = true;
    }
    if (this.theme === 'desert') {
      const off = this.getTrackLateralInfo(eyeX, eyeZ);
      if (Math.abs(off.lateral) > off.width / 2 + 1.2) {
        this.emitSand(eyeX, eyeZ, yaw, playerSpeed);
        mirrorPuffs = true;
      }
    }
    if (playerAccel < -0.3) {
      this.emitBrakeDust(eyeX, eyeZ, yaw, Math.min(1, -playerAccel), playerSpeed);
      this.emitScrubMarks(eyeX, eyeZ, yaw, Math.min(1, -playerAccel), playerSpeed, 'player');
      mirrorPuffs = true;
    }
    if (mirrorPuffs) {
      this.drawSmoke(this.mirrorProj, this.mirrorView);
    }
    if (useMirrorHeat) {
      this.buildHeatMask(this.mirrorProj, this.mirrorView, this.mirrorW, this.mirrorH, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.mirrorFBO);
      gl.viewport(0, 0, this.mirrorW, this.mirrorH);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.useProgram(this.heatProg);
      gl.uniform1i(this.heatSceneLoc, 0);
      gl.uniform1i(this.heatMaskLoc, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._mirrorSceneTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._mirrorMaskTex);
      gl.uniform1f(this.heatTimeLoc, this.elapsed);
      gl.uniform1f(this.heatStrengthLoc, 0.5 * heatStrength);
      this.setHeatCamera(mEye[0], mEye[1], mEye[2], this.mirrorProj, this.mirrorView, this.heatHorizonRow(mEye[0], mEye[2], this.mirrorProj, this.mirrorView));
      this.mat4Multiply(this._heatViewProj, this.mirrorProj, this.mirrorView);
      gl.uniformMatrix4fv(this.heatViewProjLoc, false, this._heatViewProj);
      this.uploadVultures();
      gl.bindVertexArray(this.heatVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.mirrorProg);
    gl.uniform1i(this.mirrorTexLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mirrorTex);
    gl.bindVertexArray(this.mirrorVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
  private readonly _brakeHeatCap = 1.35;
  private readonly _brakeHeatFadeOn = 0.85;
  private readonly _brakeHeatFadeAmount = 0.8;
  private _carHeat: Map<string, number[]> = new Map();
  private _playerHeat: number[] = [0, 0, 0, 0];
  private _carSnow: Map<string, number> = new Map();
  private _playerSnow = 0;
  private _snowCapVao!: WebGLVertexArrayObject;
  private _snowCapCount = 0;
  private _carLock: Map<string, number> = new Map();
  private _playerLock = 0;
  private updateBrakeHeat(h: number[], dt: number, speed: number, accel: number) {
    const braking = accel < -0.3;
    const force = Math.min(1, -accel);
    const speedFactor = Math.min(Math.abs(speed) / 30, 1);
    for (let wi = 0; wi < 4; wi++) {
      let v = h[wi];
      if (braking) {
        const frontBias = wi < 2 ? 1.12 : 1.0;
        v += (0.9 + 0.85 * force) * (0.35 + 0.65 * speedFactor) * frontBias * dt;
        v = Math.min(v, this._brakeHeatCap);
      } else {
        v *= Math.exp(-dt / 3.0);
        if (v < 0.005) v = 0;
      }
      h[wi] = v;
    }
  }
  private updateWheelLock(cur: number, dt: number, speed: number, accel: number): number {
    const braking = accel < -0.3;
    const speedFactor = Math.min(Math.abs(speed) / 15, 1);
    const target = braking ? Math.min(1, -accel) * speedFactor : 0;
    const rate = target > cur ? 10 : 6;
    return cur + (target - cur) * Math.min(1, dt * rate);
  }
  /**
   * Hottest player brake-disc heat (0..1.35), read back by the physics so
   * overheating degrades braking. The hottest disc governs bite (fronts run
   * hotter from brake bias), and the same sim drives the glow — one source.
   */
  getPlayerBrakeHeat(): number {
    return Math.max(this._playerHeat[0], this._playerHeat[1], this._playerHeat[2], this._playerHeat[3]);
  }
  /** Hottest brake-disc heat for an AI/remote car (keyed by the same stable id
   *  the per-car heat sim uses, e.g. 'b0') — read back by the bot AI so
   *  over-braking degrades their late-race pace just like the player's. */
  getCarBrakeHeat(carId: string): number {
    const h = this._carHeat.get(carId);
    if (!h) return 0;
    return Math.max(h[0], h[1], h[2], h[3]);
  }
  /** Front-wheel lock factor (0..1) for the local player — the same smoothed
   *  state that scrubs the fronts' visual spin under hard braking, read back
   *  by the audio so the brake squeal swells and detunes with the actual
   *  lockup rather than raw brake input. */
  getPlayerLock(): number {
    return this._playerLock;
  }
  renderCar(x: number, y: number, z: number, yaw: number, r: number, g: number, b: number, speed: number = 0, accel: number = 0, spin?: number, slide: number = 0, appearance?: RacingCarAppearance) {
    const gl = this.gl;
    const app = appearance ?? {};
    gl.useProgram(this.prog);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(this.metallicLoc, app.metallic ?? 0.45);
    gl.uniform1f(this.rimStrengthLoc, 0);
    gl.uniform1f(this.envStrengthLoc, 0.22 + (app.metallic ?? 0.45) * 0.75);
    gl.bindVertexArray(this.carVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    this.mat4Identity(this.modelMatrix);
    this.mat4Translate(this.modelMatrix, [x, y + 0.15, z]);
    this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
    this.mat4Scale(this.modelMatrix, [0.8, 0.8, 0.8]);
    gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
    gl.uniform3f(this.colorLoc, r, g, b);
    gl.uniform1i(this.hasTexLoc, 0);
    this.setNormalMatrix(this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.carCount, gl.UNSIGNED_SHORT, 0);
    if (app.decalStyle && DECAL_COLORS[app.decalStyle]) {
      const dc = DECAL_COLORS[app.decalStyle];
      gl.uniform3f(this.colorLoc, dc[0], dc[1], dc[2]);
      const decal = this.decalVaos.get(app.decalStyle);
      if (decal) {
        gl.bindVertexArray(decal.vao);
        gl.drawElements(gl.TRIANGLES, decal.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    const acc = app.accent ?? [0.16, 0.16, 0.2];
    gl.uniform3f(this.colorLoc, acc[0], acc[1], acc[2]);
    const accDecal = this.accentVaos.get(app.decalStyle ?? 0) ?? this.accentVaos.get(0);
    if (accDecal) {
      gl.bindVertexArray(accDecal.vao);
      gl.drawElements(gl.TRIANGLES, accDecal.count, gl.UNSIGNED_SHORT, 0);
    }
    // Spoiler / exhaust upgrades — baked colours, so uColor must be white.
    const spoiler = app.spoilerId ? this.spoilerVaos.get(app.spoilerId) : undefined;
    if (spoiler) {
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      gl.bindVertexArray(spoiler.vao);
      gl.drawElements(gl.TRIANGLES, spoiler.count, gl.UNSIGNED_SHORT, 0);
    } else {
      // No spoiler equipped — keep the stock rear wing (replaces, not stacks).
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      gl.bindVertexArray(this.baseWingVao);
      gl.drawElements(gl.TRIANGLES, this.baseWingCount, gl.UNSIGNED_SHORT, 0);
    }
    const exhaust = app.exhaustId ? this.exhaustVaos.get(app.exhaustId) : undefined;
    if (exhaust) {
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      gl.bindVertexArray(exhaust.vao);
      gl.drawElements(gl.TRIANGLES, exhaust.count, gl.UNSIGNED_SHORT, 0);
    }
    const snowAmt = appearance?.id ? (this._carSnow.get(appearance.id) ?? 0) : this._playerSnow;
    if (snowAmt > 0.02) {
      const lift = 1 + snowAmt * 0.06;
      this.mat4Identity(this.modelMatrix);
      this.mat4Translate(this.modelMatrix, [x, y + 0.15, z]);
      this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
      this.mat4Scale(this.modelMatrix, [0.8, 0.8, 0.8]);
      this.mat4Scale(this.modelMatrix, [lift, lift, lift]);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.setNormalMatrix(this.modelMatrix);
      gl.uniform1f(this.metallicLoc, 0);
      gl.uniform1f(this.rimStrengthLoc, 0);
      gl.uniform1f(this.envStrengthLoc, 0.14);
      gl.uniform3f(this.colorLoc, 0.97, 0.98, 1.0);
      gl.bindVertexArray(this._snowCapVao);
      gl.drawElements(gl.TRIANGLES, this._snowCapCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.metallicLoc, app.metallic ?? 0.45);
      gl.uniform1f(this.rimStrengthLoc, 0);
      gl.uniform1f(this.envStrengthLoc, 0.22 + (app.metallic ?? 0.45) * 0.75);
    }
    if (app.glow) {
      const g = app.glow;
      const blendWas = gl.isEnabled(gl.BLEND);
      gl.enable(gl.BLEND);
      const revHz = 1.4 + Math.min(Math.abs(speed) / 12, 1) * 4.2;
      const revWave = 0.5 + 0.5 * Math.sin(this.elapsed * revHz * Math.PI * 2 + z * 2.4);
      const rolling = Math.min(Math.abs(speed) / 6, 1);
      const throttleSpike = 1 + Math.max(accel, 0) * 0.3;
      const pulse = (0.68 + 0.24 * revWave * (0.3 + 0.7 * rolling)) * throttleSpike;
      gl.uniform1f(this.heatGlowLoc, 0);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
      gl.uniform1i(this.hasTexLoc, 1);
      const gi = (app.glowIntensity ?? 50) / 100;
      const intensity = 0.3 + gi * 1.9;
      gl.uniform3f(this.colorLoc, g[0] * 0.5 * pulse * intensity, g[1] * 0.5 * pulse * intensity, g[2] * 0.5 * pulse * intensity);
      gl.bindVertexArray(this.glowHaloVao);
      gl.drawElements(gl.TRIANGLES, this.glowHaloCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform3f(this.colorLoc, g[0] * 2.2 * pulse * intensity, g[1] * 2.2 * pulse * intensity, g[2] * 2.2 * pulse * intensity);
      gl.bindVertexArray(this.glowVao);
      gl.drawElements(gl.TRIANGLES, this.glowCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (!blendWas) gl.disable(gl.BLEND);
    }
    if (this.night && this.headlightCount > 0) {
      gl.uniform1f(this.emissiveLoc, 1);
      gl.uniform1f(this.heatGlowLoc, 0);
      const headBlendWas = gl.isEnabled(gl.BLEND);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform3f(this.colorLoc, 1.0, 0.92, 0.62);
      gl.bindVertexArray(this.headlightVao);
      gl.drawElements(gl.TRIANGLES, this.headlightCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(this.emissiveLoc, 0);
      if (!headBlendWas) gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(this.wheelVao);
    const wheelPositions = [
      [0.62, 0, -0.60],
      [0.62, 0, 0.60],
      [-0.55, 0, -0.60],
      [-0.55, 0, 0.60]
    ];
    const flicker = 0.92 + 0.08 * Math.sin(this.elapsed * (7 + Math.abs(speed) * 0.3));
    const flash = accel < -0.3 ? Math.min(1, -accel) * 0.3 : 0;
    const heatArr = appearance?.id ? (this._carHeat.get(appearance.id) ?? [0, 0, 0, 0]) : this._playerHeat;
    gl.uniform1f(this.heatGlowLoc, 0);
    for (let wi = 0; wi < wheelPositions.length; wi++) {
      const wp = wheelPositions[wi];
      const rear = wi >= 2;
      // Wheels on the driver's left (negative z in car-local space) are
      // mirrored so the branded sidewall faces outward like the right side;
      // the ring UVs are flipped (rimFaceVaoL) so 'BHOSTED' still reads
      // correctly, and the spin sign flips with the mirror.
      const leftSide = wp[2] < 0;
      this.mat4Identity(this.modelMatrix);
      this.mat4Translate(this.modelMatrix, [x, y + 0.17, z]);
      this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
      this.mat4Translate(this.modelMatrix, wp);
      if (leftSide) this.mat4Scale(this.modelMatrix, [1, 1, -1]);
      const slipFactor = Math.max(0, 1 - Math.min(slide, 1) * 0.75);
      const lockF = wi < 2 ? (appearance?.id ? (this._carLock.get(appearance.id) ?? 0) : this._playerLock) : 0;
      const wheelSpin = (spin !== undefined
        ? spin * slipFactor
        : this.elapsed * Math.min(Math.abs(speed) / 0.17, 40) * (speed < 0 ? 1 : -1) * slipFactor) * (1 - lockF) * (leftSide ? -1 : 1);
      this.mat4RotateZ(this.modelMatrix, wheelSpin);
      this.mat4RotateX(this.modelMatrix, Math.PI / 2);
      gl.uniformMatrix4fv(this.modelLoc, false, this.modelMatrix);
      this.setNormalMatrix(this.modelMatrix);
      const rimTint = app.rimStyle && RIM_TINTS[app.rimStyle] ? RIM_TINTS[app.rimStyle] : [0.72, 0.72, 0.75];
      gl.uniform3f(this.rimTintLoc, rimTint[0], rimTint[1], rimTint[2]);
      gl.uniform1f(this.rimStrengthLoc, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tireBrandTex);
      gl.uniform1i(this.hasTexLoc, 1);
      gl.uniform3f(this.colorLoc, 1, 1, 1);
      gl.bindVertexArray(leftSide ? (rear ? this.rearRimFaceVaoL : this.rimFaceVaoL) : (rear ? this.rearRimFaceVao : this.rimFaceVao));
      gl.drawElements(gl.TRIANGLES, leftSide ? (rear ? this.rearRimFaceCountL : this.rimFaceCountL) : (rear ? this.rearRimFaceCount : this.rimFaceCount), gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(rear ? this.rearWheelRimVao : this.wheelRimVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelRimCount : this.wheelRimCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.rimStrengthLoc, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
      gl.uniform1i(this.hasTexLoc, 0);
      gl.uniform3f(this.colorLoc, 0.05, 0.05, 0.05);
      gl.bindVertexArray(rear ? this.rearWheelVao : this.wheelVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelCount : this.wheelCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.heatGlowLoc, Math.min(1.35, (heatArr[wi] ?? 0) * flicker + flash));
      gl.bindVertexArray(rear ? this.rearBrakeVao : this.brakeVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearBrakeCount : this.brakeCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.heatGlowLoc, 0);
    }
    gl.uniform1f(this.heatGlowLoc, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }
  private renderCarShadow(x: number, y: number, z: number, yaw: number, speed: number = 0, spin?: number, slide: number = 0) {
    const gl = this.gl;
    gl.useProgram(this.shadowProg);
    gl.bindVertexArray(this.carVao);
    this.mat4Identity(this.modelMatrix);
    this.mat4Translate(this.modelMatrix, [x, y + 0.15, z]);
    this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
    this.mat4Scale(this.modelMatrix, [0.8, 0.8, 0.8]);
    gl.uniformMatrix4fv(this.shadowModelLoc, false, this.modelMatrix);
    gl.drawElements(gl.TRIANGLES, this.carCount, gl.UNSIGNED_SHORT, 0);
    const wheelPositions = [
      [0.62, 0, -0.60],
      [0.62, 0, 0.60],
      [-0.55, 0, -0.60],
      [-0.55, 0, 0.60]
    ];
    for (let wi = 0; wi < wheelPositions.length; wi++) {
      const wp = wheelPositions[wi];
      const rear = wi >= 2;
      gl.bindVertexArray(rear ? this.rearWheelVao : this.wheelVao);
      this.mat4Identity(this.modelMatrix);
      this.mat4Translate(this.modelMatrix, [x, y + 0.17, z]);
      this.mat4RotateY(this.modelMatrix, yaw - Math.PI / 2);
      this.mat4Translate(this.modelMatrix, wp);
      const slipFactor = Math.max(0, 1 - Math.min(slide, 1) * 0.75);
      const wheelSpin = spin !== undefined
        ? spin * slipFactor
        : this.elapsed * Math.min(Math.abs(speed) / 0.17, 40) * (speed < 0 ? 1 : -1) * slipFactor;
      this.mat4RotateZ(this.modelMatrix, wheelSpin);
      this.mat4RotateX(this.modelMatrix, Math.PI / 2);
      gl.uniformMatrix4fv(this.shadowModelLoc, false, this.modelMatrix);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelCount : this.wheelCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(rear ? this.rearWheelRimVao : this.wheelRimVao);
      gl.drawElements(gl.TRIANGLES, rear ? this.rearWheelRimCount : this.wheelRimCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }
  private _mirageProg: WebGLProgram | null = null;
  private _mirageVao: WebGLVertexArrayObject | null = null;
  private _mirageBuf: WebGLBuffer | null = null;
  private _mirageProjLoc: WebGLUniformLocation | null = null;
  private _mirageViewLoc: WebGLUniformLocation | null = null;
  private _mirageTimeLoc: WebGLUniformLocation | null = null;
  private _mirageSkyTopLoc: WebGLUniformLocation | null = null;
  private _mirageSkyHorizonLoc: WebGLUniformLocation | null = null;
  private _mirageAlphaLoc: WebGLUniformLocation | null = null;
  private _miragePosLoc = -1;
  private _mirageInitialized = false;
  private ensureMirage(): boolean {
    if (this._mirageInitialized) return !!this._mirageProg;
    this._mirageInitialized = true;
    const gl = this.gl;
    const vs = `#version 300 es
in vec3 aPos;
out vec2 vWorldXZ;
uniform mat4 uProj;
uniform mat4 uView;
void main() { vWorldXZ = aPos.xz; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
    const fs = `#version 300 es
precision highp float;
in vec2 vWorldXZ;
out vec4 FragColor;
uniform float uTime;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uAlpha;
void main() {
  float r1 = sin(vWorldXZ.x * 1.7 + uTime * 2.2) * sin(vWorldXZ.y * 1.3 - uTime * 1.7);
  float r2 = sin((vWorldXZ.x + vWorldXZ.y) * 0.45 + uTime * 0.9);
  float ripple = clamp(r1 * 0.5 + r2 * 0.5, -1.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, 0.45 + 0.25 * ripple);
  float glint = pow(0.5 + 0.5 * ripple, 6.0);
  col += vec3(1.0, 0.95, 0.8) * glint * 0.35;
  float a = uAlpha * (0.62 + 0.3 * ripple);
  FragColor = vec4(col, a);
}`;
    this._mirageProg = this.createProgram(vs, fs);
    this._mirageProjLoc = gl.getUniformLocation(this._mirageProg, 'uProj');
    this._mirageViewLoc = gl.getUniformLocation(this._mirageProg, 'uView');
    this._mirageTimeLoc = gl.getUniformLocation(this._mirageProg, 'uTime');
    this._mirageSkyTopLoc = gl.getUniformLocation(this._mirageProg, 'uSkyTop');
    this._mirageSkyHorizonLoc = gl.getUniformLocation(this._mirageProg, 'uSkyHorizon');
    this._mirageAlphaLoc = gl.getUniformLocation(this._mirageProg, 'uAlpha');
    this._mirageVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._mirageVao);
    this._mirageBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._mirageBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(4 * 3), gl.DYNAMIC_DRAW);
    this._miragePosLoc = gl.getAttribLocation(this._mirageProg, 'aPos');
    gl.enableVertexAttribArray(this._miragePosLoc);
    gl.vertexAttribPointer(this._miragePosLoc, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return !!this._mirageProg;
  }
  private drawMirageLake(proj: Float32Array, view: Float32Array, eye: number[]) {
    if (!this.ensureMirage()) return;
    if (!this._trackPoints.length || this.totalTrackDist <= 0) return;
    const gl = this.gl;
    const carDist = this.getDistFromPoint(eye[0], eye[2]);
    const ahead = 150 + Math.sin(this.elapsed * 0.05) * 8;
    const center = this.getTrackPointAlong(carDist + ahead);
    const dx = center.x - eye[0];
    const dy = 0.4 - eye[1];
    const dz = center.z - eye[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 30 || dist > 420) return;
    const fx = -view[8], fy = -view[9], fz = -view[10];
    const fl = Math.hypot(fx, fy, fz) || 1;
    const angle = (fx * dx + fy * dy + fz * dz) / (fl * dist);
    const angleFade = Math.max(0, Math.min(1, (angle - 0.55) / 0.35));
    const distFade = Math.max(0, Math.min(1, (dist - 55) / 45)) * (1 - Math.max(0, Math.min(1, (dist - 240) / 120)));
    const alpha = 0.42 * angleFade * distFade;
    if (alpha < 0.02) return;
    let dX = center.dirX, dZ = center.dirZ;
    const dl = Math.hypot(dX, dZ) || 1;
    dX /= dl; dZ /= dl;
    const len = 46, halfW = (center.width * 0.82) / 2;
    const px = -dZ, pz = dX;
    const cx = center.x, cz = center.z, cy = 0.09;
    const c = [
      cx - dX * len / 2 - px * halfW, cy, cz - dZ * len / 2 - pz * halfW,
      cx - dX * len / 2 + px * halfW, cy, cz - dZ * len / 2 + pz * halfW,
      cx + dX * len / 2 - px * halfW, cy, cz + dZ * len / 2 - pz * halfW,
      cx + dX * len / 2 + px * halfW, cy, cz + dZ * len / 2 + pz * halfW,
    ];
    gl.useProgram(this._mirageProg);
    gl.uniformMatrix4fv(this._mirageProjLoc, false, proj);
    gl.uniformMatrix4fv(this._mirageViewLoc, false, view);
    gl.uniform1f(this._mirageTimeLoc, this.elapsed);
    gl.uniform3f(this._mirageSkyTopLoc, this.skyTop[0], this.skyTop[1], this.skyTop[2]);
    gl.uniform3f(this._mirageSkyHorizonLoc, this.skyHorizon[0], this.skyHorizon[1], this.skyHorizon[2]);
    gl.uniform1f(this._mirageAlphaLoc, alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._mirageBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(c));
    gl.bindVertexArray(this._mirageVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }
  private ensureMirrorScenePass(): boolean {
    if (this._mirrorSceneFBO) return true;
    const gl = this.gl;
    this._mirrorSceneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this._mirrorSceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.mirrorW, this.mirrorH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._mirrorSceneDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this._mirrorSceneDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.mirrorW, this.mirrorH);
    this._mirrorSceneFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._mirrorSceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._mirrorSceneTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._mirrorSceneDepth);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      gl.deleteFramebuffer(this._mirrorSceneFBO);
      gl.deleteTexture(this._mirrorSceneTex);
      gl.deleteRenderbuffer(this._mirrorSceneDepth);
      this._mirrorSceneFBO = null;
      this._mirrorSceneTex = null;
      this._mirrorSceneDepth = null;
      return false;
    }
    return true;
  }
  private ensureHeatPass(): boolean {
    const gl = this.gl;
    const cw = gl.canvas.width || 1280;
    const ch = gl.canvas.height || 720;
    if (this._heatFBO && this._heatW === cw && this._heatH === ch) return true;
    if (!this._heatInitialized) {
      this._heatInitialized = true;
      this.initHeatPass();
    }
    if (this._heatFBO) {
      gl.deleteFramebuffer(this._heatFBO);
      gl.deleteTexture(this._heatTex);
      gl.deleteRenderbuffer(this._heatDepth);
      this._heatFBO = null;
    }
    this._heatW = cw; this._heatH = ch;
    this._heatTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this._heatTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._heatDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this._heatDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, cw, ch);
    this._heatFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._heatFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._heatTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._heatDepth);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) { this.heatShimmer = false; return false; }
    return true;
  }
  /** Returns true when the given camera's mask must be (re)rasterized, and
   *  records the camera it just rasterized for. Compares the view matrix's
   *  translation (eye, incl. screen shake) and rotation basis against the last
   *  build, plus the projection's focal lengths (the speed-based FOV zoom and
   *  aspect live there, independent of the view), and the raster size. The
   *  mask is only sampled through a LINEAR-filtered texture, so a few units of
   *  camera travel inside the tolerance are visually indistinguishable. */
  private heatMaskNeedsRebuild(proj: Float32Array, view: Float32Array, w: number, h: number, cache: MaskCamCache): boolean {
    const dx = view[12] - cache.eyeX, dy = view[13] - cache.eyeY, dz = view[14] - cache.eyeZ;
    const moved = dx * dx + dy * dy + dz * dz > RacingRenderer.MASK_CAM_MOVE_SQ;
    const e = RacingRenderer.MASK_CAM_ROT_EPS;
    const rotated =
      Math.abs(view[0] - cache.r0) > e || Math.abs(view[1] - cache.r1) > e || Math.abs(view[2] - cache.r2) > e ||
      Math.abs(-view[8] - cache.f0) > e || Math.abs(-view[9] - cache.f1) > e || Math.abs(-view[10] - cache.f2) > e;
    const projChanged =
      Math.abs(proj[0] - cache.p0) > Math.abs(proj[0]) * 1e-4 ||
      Math.abs(proj[5] - cache.p5) > Math.abs(proj[5]) * 1e-4;
    if (!cache.valid || moved || rotated || projChanged || cache.w !== w || cache.h !== h) {
      cache.valid = true;
      cache.eyeX = view[12]; cache.eyeY = view[13]; cache.eyeZ = view[14];
      cache.r0 = view[0]; cache.r1 = view[1]; cache.r2 = view[2];
      cache.f0 = -view[8]; cache.f1 = -view[9]; cache.f2 = -view[10];
      cache.p0 = proj[0]; cache.p5 = proj[5];
      cache.w = w; cache.h = h;
      return true;
    }
    return false;
  }
  private buildHeatMask(proj: Float32Array, view: Float32Array, w: number, h: number, mirror: boolean) {
    const gl = this.gl;
    const cache = mirror ? this._mirrorMaskCache : this._mainMaskCache;
    if (!this.heatMaskNeedsRebuild(proj, view, w, h, cache)) return;
    if (!this._heatMaskInitialized) {
      this._heatMaskInitialized = true;
      const vs = `#version 300 es\nin vec3 aPos;\nuniform mat4 uProj;\nuniform mat4 uView;\nvoid main() { gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
      const fs = `#version 300 es\nprecision highp float;\nout vec4 FragColor;\nvoid main() { FragColor = vec4(1.0); }`;
      this._heatMaskProg = this.createProgram(vs, fs);
      this._heatMaskProjLoc = gl.getUniformLocation(this._heatMaskProg, 'uProj');
      this._heatMaskViewLoc = gl.getUniformLocation(this._heatMaskProg, 'uView');
    }
    if (!this._heatMaskProg) {
      cache.valid = false;
      return;
    }
    const sizeOk = mirror
      ? !!this._mirrorMaskTex && !!this._mirrorMaskFBO
      : !!this._heatMaskTex && !!this._heatMaskFBO && this._heatMaskW === w && this._heatMaskH === h;
    if (!sizeOk) {
      const nt = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, nt);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const nf = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, nf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nt, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (mirror) { this._mirrorMaskTex = nt; this._mirrorMaskFBO = nf; }
      else { this._heatMaskTex = nt; this._heatMaskFBO = nf; this._heatMaskW = w; this._heatMaskH = h; }
    }
    const fbo = mirror ? this._mirrorMaskFBO : this._heatMaskFBO;
    if (!fbo) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this._heatMaskProg);
    gl.uniformMatrix4fv(this._heatMaskProjLoc, false, proj);
    gl.uniformMatrix4fv(this._heatMaskViewLoc, false, view);
    gl.bindVertexArray(this.trackVao);
    gl.drawElements(gl.TRIANGLES, this.trackCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.finishVao);
    gl.drawElements(gl.TRIANGLES, this.finishCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** Screen Y (0..1) of the true horizon for a camera: projects a far point on
   *  the ground plane straight ahead of it, so the shimmer band rides the real
   *  sand/sky line as the camera pitches instead of a fixed screen row. */
  private heatHorizonRow(camX: number, camZ: number, proj: Float32Array, view: Float32Array): number {
    const far = 1e4;
    const fx = camX - view[8] * far;
    const fz = camZ - view[10] * far;
    this.mat4Multiply(this._scratchMvp, proj, view);
    const cw = this._scratchMvp[3] * fx + this._scratchMvp[11] * fz + this._scratchMvp[15];
    if (cw <= 0.001) return 0.42;
    const cy = this._scratchMvp[1] * fx + this._scratchMvp[9] * fz + this._scratchMvp[13];
    return Math.max(0.12, Math.min(0.9, (cy / cw) * 0.5 + 0.5));
  }
  /** Uploads the camera position, world-space basis and focal lengths so the
   *  heat shader can reconstruct the ground-plane point each fragment looks at
   *  (anchoring the shimmer to the sand), and sets the horizon row for the band. */
  private setHeatCamera(camX: number, camY: number, camZ: number, proj: Float32Array, view: Float32Array, horizonY: number) {
    const gl = this.gl;
    gl.uniform3f(this.heatCamPosLoc, camX, camY, camZ);
    gl.uniform3f(this.heatCamRightLoc, view[0], view[1], view[2]);
    gl.uniform3f(this.heatCamUpLoc, view[4], view[5], view[6]);
    gl.uniform3f(this.heatCamFwdLoc, -view[8], -view[9], -view[10]);
    gl.uniform2f(this.heatTanHalfFovLoc, 1 / proj[0], 1 / proj[5]);
    gl.uniform1f(this.heatHorizonLoc, horizonY);
  }
  private drawHeatShimmer(strength: number, eye: number[], proj: Float32Array, view: Float32Array) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this.heatProg);
    gl.uniform1i(this.heatSceneLoc, 0);
    gl.uniform1i(this.heatMaskLoc, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._heatTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._heatMaskTex);
    gl.uniform1f(this.heatTimeLoc, this.elapsed);
    gl.uniform1f(this.heatStrengthLoc, strength);
    this.setHeatCamera(eye[0], eye[1], eye[2], proj, view, this.heatHorizonRow(eye[0], eye[2], proj, view));
    this.mat4Multiply(this._heatViewProj, proj, view);
    gl.uniformMatrix4fv(this.heatViewProjLoc, false, this._heatViewProj);
    this.uploadVultures();
    gl.bindVertexArray(this.heatVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
  /** Advances the desert vultures' lazy thermal orbit around the circuit
   *  (elapsed-driven so the main view and mirror stay in sync) and uploads
   *  their world positions plus bank angle to the heat shader's uVultures
   *  uniform. Each bird breathes its orbit radius, rides a long altitude wave
   *  and rolls gently into/out of the turn — a loose thermal spiral instead of
   *  a fixed circle. */
  private uploadVultures() {
    const gl = this.gl;
    const t = this.elapsed;
    const cx = this._trackCenterX, cz = this._trackCenterZ;
    if (this._vultures.length === 0) {
      this._vultureWorld.fill(0);
      this._vultureWorld[1] = 1e9; this._vultureWorld[5] = 1e9;
      this._vultureWorld[9] = 1e9; this._vultureWorld[13] = 1e9;
      gl.uniform4fv(this.heatVulturesLoc, this._vultureWorld);
      return;
    }
    for (let i = 0; i < this._vultures.length && i < 4; i++) {
      const v = this._vultures[i];
      const ang = v.ang + v.speed * t;
      const rad = v.radius * (1 + Math.sin(t * 0.16 + v.phase * 1.3) * 0.06);
      const alt = v.alt + Math.sin(t * 0.5 + v.phase) * 3 + Math.sin(t * 0.09 + v.phase * 2.1) * 6;
      const bank = Math.sin(t * 0.4 + v.phase) * 0.35;
      this._vultureWorld[i * 4] = cx + Math.cos(ang) * rad;
      this._vultureWorld[i * 4 + 1] = alt;
      this._vultureWorld[i * 4 + 2] = cz + Math.sin(ang) * rad;
      this._vultureWorld[i * 4 + 3] = bank;
    }
    gl.uniform4fv(this.heatVulturesLoc, this._vultureWorld);
  }
  private initHeatPass() {
    const gl = this.gl;
    const vs = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
    const fs = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 FragColor;
uniform sampler2D uScene;
uniform sampler2D uMask;
uniform float uTime;
uniform float uHorizonY;
uniform float uStrength;
uniform mat4 uViewProj;
uniform vec4 uVultures[4];
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform vec2 uTanHalfFov;   
float sdSegment(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float vultureShape(vec2 q, float flap) {
  float d = sdSegment(q, vec2(-0.14, 0.0), vec2(0.14, 0.0), 0.065);
  d = min(d, sdSegment(q, vec2(-0.12, 0.03), vec2(-0.85, 0.22 + flap), 0.055));
  d = min(d, sdSegment(q, vec2(0.12, 0.03), vec2(0.85, 0.22 + flap), 0.055));
  d = min(d, length(q - vec2(0.27, 0.01)) - 0.04);
  return d;
}
void main() {
  float heat = exp(-abs(vUV.y - uHorizonY) * 9.0);
  heat *= 1.0 - texture(uMask, vUV).r;
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 ray = normalize(uCamFwd + uCamRight * (ndc.x * uTanHalfFov.x) + uCamUp * (ndc.y * uTanHalfFov.y));
  float tHit = -uCamPos.y / max(ray.y, 0.0001);
  vec2 wxz = uCamPos.xz + ray.xz * clamp(tHit, 0.0, 2500.0);
  float n1 = sin(wxz.x * 0.55 + uTime * 2.4);
  float n2 = sin(wxz.x * 0.15 - uTime * 1.5 + sin(wxz.y * 0.26 + uTime * 1.2) * 2.5);
  float n3 = sin(wxz.y * 0.2 - uTime * 2.8 + wxz.x * 0.1);
  float dx = (n1 * 0.55 + n2 * 0.45) * 0.0055;
  float dy = (n3 * 0.65 + n1 * 0.35) * 0.004;
  vec2 uv = vUV + vec2(dx, dy) * heat * uStrength;
  vec3 col = texture(uScene, clamp(uv, 0.001, 0.999)).rgb;  
  float dark = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 vp = uVultures[i].xyz;
    float bank = uVultures[i].w;
    vec4 w = vec4(vp, 1.0);
    vec4 clip = uViewProj * w;
    if (clip.w <= 0.001) continue;
    vec2 suv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (suv.x < -0.2 || suv.x > 1.2 || suv.y < -0.2 || suv.y > 1.2) continue;
    float sc = max(0.02, (0.05 + float(i) * 0.018) * (180.0 / clip.w));
    vec2 q = (vUV - suv) / sc;
    float cs = cos(bank), sn = sin(bank);
    q = mat2(cs, sn, -sn, cs) * q;
    float flap = sin(uTime * 1.2 + float(i) * 2.6) * 0.06;
    float d = vultureShape(q, flap);
    float a = 1.0 - smoothstep(-0.02, 0.035, d);
    a *= smoothstep(0.0, 0.08, suv.x) * smoothstep(1.0, 0.92, suv.x);
    dark += a * (0.25 + 0.15 * uStrength);
  }
  col *= 1.0 - clamp(dark, 0.0, 0.6);
  FragColor = vec4(col, 1.0);
}`;
    this.heatProg = this.createProgram(vs, fs);
    this.heatSceneLoc = gl.getUniformLocation(this.heatProg, 'uScene')!;
    this.heatMaskLoc = gl.getUniformLocation(this.heatProg, 'uMask')!;
    this.heatTimeLoc = gl.getUniformLocation(this.heatProg, 'uTime')!;
    this.heatHorizonLoc = gl.getUniformLocation(this.heatProg, 'uHorizonY')!;
    this.heatStrengthLoc = gl.getUniformLocation(this.heatProg, 'uStrength')!;
    this.heatViewProjLoc = gl.getUniformLocation(this.heatProg, 'uViewProj')!;
    this.heatVulturesLoc = gl.getUniformLocation(this.heatProg, 'uVultures')!;
    this.heatCamPosLoc = gl.getUniformLocation(this.heatProg, 'uCamPos')!;
    this.heatCamRightLoc = gl.getUniformLocation(this.heatProg, 'uCamRight')!;
    this.heatCamUpLoc = gl.getUniformLocation(this.heatProg, 'uCamUp')!;
    this.heatCamFwdLoc = gl.getUniformLocation(this.heatProg, 'uCamFwd')!;
    this.heatTanHalfFovLoc = gl.getUniformLocation(this.heatProg, 'uTanHalfFov')!;
    this.heatVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.heatVao);
    const hbuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, hbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  resetRaceFX() {
    this._smokeParticles = [];
    this.winTrailAnchor = null;
    this._scrubMarks = [];
    this._scrubLast.clear();
    this._carHeat.clear();
    this._carLock.clear();
    this._carSnow.clear();
    this._playerSnow = 0;
    this._playerHeat = [0, 0, 0, 0];
    this._playerLock = 0;
  }
  clearCache() {
    this._carHeat.clear();
    this._carLock.clear();
    this._carSnow.clear();
    this._playerSnow = 0;
    this._scrubMarks = [];
    this._scrubLast.clear();
    if (this._heatFBO) {
      const gl = this.gl;
      gl.deleteFramebuffer(this._heatFBO);
      gl.deleteTexture(this._heatTex);
      gl.deleteRenderbuffer(this._heatDepth);
      this._heatFBO = null;
      this._heatW = 0; this._heatH = 0;
    }
    if (this._mirrorSceneFBO) {
      const gl = this.gl;
      gl.deleteFramebuffer(this._mirrorSceneFBO);
      gl.deleteTexture(this._mirrorSceneTex);
      gl.deleteRenderbuffer(this._mirrorSceneDepth);
      this._mirrorSceneFBO = null;
    }
    if (this._heatMaskFBO || this._mirrorMaskFBO) {
      const gl = this.gl;
      if (this._heatMaskFBO) {
        gl.deleteFramebuffer(this._heatMaskFBO);
        gl.deleteTexture(this._heatMaskTex);
        this._heatMaskFBO = null; this._heatMaskTex = null;
        this._heatMaskW = 0; this._heatMaskH = 0;
      }
      if (this._mirrorMaskFBO) {
        gl.deleteFramebuffer(this._mirrorMaskFBO);
        gl.deleteTexture(this._mirrorMaskTex);
        this._mirrorMaskFBO = null; this._mirrorMaskTex = null;
      }
      this._heatMaskInitialized = false;
      this._mainMaskCache.valid = false;
      this._mirrorMaskCache.valid = false;
    }
    this._trackPoints = [];
  }
  /**
   * Release the WebGL context and every GPU resource it owns. Called once at
   * teardown (component ngOnDestroy) so GPU memory doesn't accumulate across
   * open/close cycles — clearCache only frees the few FBOs/textures it tracks,
   * while loseContext() hands ALL of the context's buffers, VAOs, programs and
   * textures back to the browser in one call (the canonical way to drop a WebGL
   * context). Safe to call once; afterwards the renderer must not draw again.
   */
  dispose() {
    const gl = this.gl;
    if (!gl) return;
    try { this.clearCache(); } catch { }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null!;
  }
  private mat4Identity(out: Float32Array) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  }
  private mat4Perspective(out: Float32Array, fov: number, aspect: number, near: number, far: number) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  }
  private mat4Ortho(out: Float32Array, l: number, r: number, b: number, t: number, n: number, f: number) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
    out[12] = (l + r) * lr; out[13] = (t + b) * bt; out[14] = (n + f) * nf; out[15] = 1;
  }
  private mat4LookAt(out: Float32Array, eye: number[], center: number[], up: number[]) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = 1 / Math.hypot(zx, zy, zz);
    zx *= len; zy *= len; zz *= len;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len > 0.001) { len = 1 / len; xx *= len; xy *= len; xz *= len; } else { xx = 1; xy = 0; xz = 0; }
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
  }
  private mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array) {
    for (let i = 0; i < 4; i++) {
      const ai0 = a[i], ai1 = a[4 + i], ai2 = a[8 + i], ai3 = a[12 + i];
      out[i] = ai0 * b[0] + ai1 * b[4] + ai2 * b[8] + ai3 * b[12];
      out[4 + i] = ai0 * b[1] + ai1 * b[5] + ai2 * b[9] + ai3 * b[13];
      out[8 + i] = ai0 * b[2] + ai1 * b[6] + ai2 * b[10] + ai3 * b[14];
      out[12 + i] = ai0 * b[3] + ai1 * b[7] + ai2 * b[11] + ai3 * b[15];
    }
  }
  private mat4Translate(out: Float32Array, v: number[]) {
    out[12] = out[0] * v[0] + out[4] * v[1] + out[8] * v[2] + out[12];
    out[13] = out[1] * v[0] + out[5] * v[1] + out[9] * v[2] + out[13];
    out[14] = out[2] * v[0] + out[6] * v[1] + out[10] * v[2] + out[14];
    out[15] = out[3] * v[0] + out[7] * v[1] + out[11] * v[2] + out[15];
  }
  private mat4RotateY(out: Float32Array, rad: number) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = out[0], a01 = out[1], a02 = out[2], a03 = out[3];
    const a20 = out[8], a21 = out[9], a22 = out[10], a23 = out[11];
    out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
  }
  private mat4RotateX(out: Float32Array, rad: number) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = out[4], a11 = out[5], a12 = out[6], a13 = out[7];
    const a20 = out[8], a21 = out[9], a22 = out[10], a23 = out[11];
    out[4] = a10 * c + a20 * s; out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s; out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s; out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s; out[11] = a23 * c - a13 * s;
  }
  private mat4RotateZ(out: Float32Array, rad: number) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = out[0], a01 = out[1], a02 = out[2], a03 = out[3];
    const a10 = out[4], a11 = out[5], a12 = out[6], a13 = out[7];
    out[0] = a00 * c + a10 * s; out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s; out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s; out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s; out[7] = a13 * c - a03 * s;
  }
  private mat4Scale(out: Float32Array, v: number[]) {
    out[0] *= v[0]; out[1] *= v[0]; out[2] *= v[0]; out[3] *= v[0];
    out[4] *= v[1]; out[5] *= v[1]; out[6] *= v[1]; out[7] *= v[1];
    out[8] *= v[2]; out[9] *= v[2]; out[10] *= v[2]; out[11] *= v[2];
  }
  private setNormalMatrix(model: Float32Array) {
    const gl = this.gl;
    const m00 = model[0], m01 = model[1], m02 = model[2];
    const m10 = model[4], m11 = model[5], m12 = model[6];
    const m20 = model[8], m21 = model[9], m22 = model[10];
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    if (Math.abs(det) < 1e-6) return;
    const invDet = 1 / det;
    const nm = [
      (m11 * m22 - m12 * m21) * invDet,
      (m02 * m21 - m01 * m22) * invDet,
      (m01 * m12 - m02 * m11) * invDet,
      (m12 * m20 - m10 * m22) * invDet,
      (m00 * m22 - m02 * m20) * invDet,
      (m10 * m02 - m00 * m12) * invDet,
      (m10 * m21 - m11 * m20) * invDet,
      (m01 * m20 - m00 * m21) * invDet,
      (m00 * m11 - m01 * m10) * invDet,
    ];
    const loc = gl.getUniformLocation(this.prog, 'uNormalMatrix');
    if (loc) gl.uniformMatrix3fv(loc, false, new Float32Array(nm));
  }
}