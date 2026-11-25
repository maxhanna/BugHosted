import * as THREE from "three";
import type { D2HelmetVisual } from "./d2-helmet-visuals.generated";

/**
 * Seat offset from the head joint to the helmet's bounding-box centre. D2R
 * helmet meshes are authored Y-up/+Z-forward, but several class rigs (notably
 * Necromancer, Barbarian, Sorceress and Assassin) bind the head with a
 * quarter-turn so the bone's local Y points forward. Expressing the seat in
 * that bind basis keeps the lift vertical on those rigs.
 *
 * ``seatScale`` is the helmet's own head fit (see ``helmetSeatScale``).  Every
 * lift is authored against a reference head bone (the paladin's 3182 at a
 * 72-unit body), but the rigs bind the head anywhere from ~3100 to ~4200, so a
 * bare head-local lift moved the same hat by a different world distance on each
 * class: the great helm rode ~30% high on the sorceress and sat right on the
 * druid.  Scaling the lift with the helmet's fit keeps that seat on every head.
 */
export function helmetSeatOffset(
  visual: Pick<D2HelmetVisual, "lift" | "hair">,
  headBindQuat: THREE.Quaternion,
  seatScale = 1,
): THREE.Vector3 {
  return new THREE.Vector3(0, visual.lift * seatScale, visual.hair === "none" ? 0 : 0.0003 * seatScale)
    .applyQuaternion(headBindQuat.clone().invert());
}

/**
 * How much bigger or smaller this class's head makes the helmet than the
 * reference head every ``lift`` in the table was authored against.  The mount
 * already scales the mesh by the same factor, so applying it to the seat keeps
 * the rim on the skull instead of leaving it riding above the crown.
 */
export function helmetSeatScale(headFit: number, classScale: number): number {
  return headFit * classScale;
}

/** Head bone world scale of the paladin rig at the 72-unit hero height. */
const REFERENCE_HEAD_SCALE = 3182;

/**
 * Scale a helmet mesh to the head it sits on.
 *
 * Both arguments must be measured at the same scale: a body height in world
 * units against a head bone in world units.  Mixing a model-local height with a
 * world head scale takes the whole model's scale into the ratio, which is how
 * the previews ended up with helmets a few thousand times too large or small.
 * The ratio itself is scale free, so an arena-scaled hero and a menu portrait
 * of the same class get the same helmet.
 */
export function helmetHeadFit(bodyHeightWorld: number, headWorldScale: number): number {
  if (!(bodyHeightWorld > 0) || !(headWorldScale > 0)) return 1;
  return (REFERENCE_HEAD_SCALE * (bodyHeightWorld / 72)) / headWorldScale;
}

export { REFERENCE_HEAD_SCALE };

/**
 * Head-bone-local rotation for the helmet group: cancel the head's bind basis
 * so the authored Y-up mesh stands upright in the model, then apply any
 * per-piece source-axis correction.
 */
export function helmetMountQuaternion(
  headBindQuat: THREE.Quaternion,
  visualRotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Quaternion {
  const [x, y, z] = visualRotation;
  return headBindQuat.clone().invert()
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
}
