import * as THREE from "three";
import type { D2HelmetVisual } from "./d2-helmet-visuals.generated";

/**
 * Seat offset from the head joint to the helmet's bounding-box centre. D2R
 * helmet meshes are authored Y-up/+Z-forward, but several class rigs (notably
 * Necromancer, Barbarian, Sorceress and Assassin) bind the head with a
 * quarter-turn so the bone's local Y points forward. Expressing the seat in
 * that bind basis keeps the lift vertical on those rigs.
 */
export function helmetSeatOffset(
  visual: Pick<D2HelmetVisual, "lift" | "hair">,
  headBindQuat: THREE.Quaternion,
): THREE.Vector3 {
  return new THREE.Vector3(0, visual.lift, visual.hair === "none" ? 0 : 0.0003)
    .applyQuaternion(headBindQuat.clone().invert());
}

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
