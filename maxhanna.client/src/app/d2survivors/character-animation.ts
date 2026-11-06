import * as THREE from "three";

/**
 * Deep character animation for the D2 Survivors rigs.
 *
 * The class GLBs ship as bind-pose skins with no animation clips, and the rip
 * flattens most of the skeleton: nearly every joint is parented straight to
 * `RootNode` with its bind transform baked in. Rotating such a bone in place
 * rotates its vertices but never moves its children, so limbs tear and the hero
 * collapses back toward the bind pose. That is why the old per-bone Euler wobble
 * always looked like a T-pose with a twitch.
 *
 * This module therefore rebuilds the pose itself:
 *  - every bone is re-parented onto a single pose root and its bind position and
 *    orientation are recorded in model space,
 *  - a semantic skeleton (pelvis, spine, chest, neck, head, arms, forearms,
 *    thighs, shins, feet) is solved with real forward kinematics, so joints
 *    translate as well as rotate,
 *  - everything else in the mesh (fingers, hair, pads, twist joints, skirts) is
 *    rigidly attached to the nearest solved joint, which keeps armour from
 *    shearing when a limb swings,
 *  - the rest stance is solved from the bind pose, so T-pose rigs get arms that
 *    hang and A-pose rigs only need a small correction,
 *  - motion is keyframed per weapon family (wind-up, contact, recovery) with a
 *    full walk cycle underneath.
 */

export type AttackAnimationStyle =
  | "amazonJab"
  | "assassinSlash"
  | "assassinKick"
  | "barbarianCleave"
  | "druidClaw"
  | "necromancerCast"
  | "paladinStrike"
  | "sorceressCast"
  | "spin"
  | "cast"
  | "maceSmash"
  | "staffStrike"
  | "weaponThrow"
  | "swordSlash"
  | "axeChop"
  | "daggerStab"
  | "bowShot"
  | "crossbowShot"
  | "clawFlurry"
  | "unarmedStrike";

const DEG = Math.PI / 180;
const FORWARD = new THREE.Vector3(0, 0, 1);

export interface ClassGait {
  /** Radians per second added to the stride phase while running. */
  walkCadence: number;
  /** Radians per second while standing still (breathing / weight shift). */
  idleCadence: number;
  /** Peak thigh swing, degrees. */
  stride: number;
  /** Peak knee flexion, degrees. */
  knee: number;
  /** Ankle roll from heel strike to toe-off, degrees. */
  footRoll: number;
  /** Shoulder swing while walking, degrees. */
  armSwing: number;
  /** Baseline elbow flexion, degrees. */
  elbow: number;
  /** Forward torso lean at speed, degrees. */
  lean: number;
  /** Torso roll with the stride, degrees. */
  sway: number;
  /** Pelvis roll onto the supporting leg, degrees. */
  pelvisRoll: number;
  /** Pelvis yaw with the stride, degrees. */
  pelvisYaw: number;
  /** Chest counter-yaw, degrees. */
  chestTwist: number;
  /** Head counter-pitch, degrees. */
  headBob: number;
  /** Head counter-yaw, degrees. */
  headYaw: number;
  /** Vertical body bob, model units. */
  bob: number;
  /** Permanent forward hunch, degrees. */
  hunch: number;
  /** Rest stance outward arm angle, degrees. */
  armOut: number;
  /** Rest stance forward arm angle, degrees. */
  armForward: number;
  /** Extra pelvis forward drive per stride, model units. */
  drive: number;
}

export const CLASS_GAIT: Record<string, ClassGait> = {
  amazon: { walkCadence: 7.4, idleCadence: 1.7, stride: 30, knee: 58, footRoll: 20, armSwing: 16, elbow: 13, lean: 5, sway: 3, pelvisRoll: 6.5, pelvisYaw: 10, chestTwist: 8, headBob: 2, headYaw: 3, bob: 0.6, hunch: 0, armOut: 11, armForward: 8, drive: 0.35 },
  assassin: { walkCadence: 8.2, idleCadence: 1.8, stride: 28, knee: 64, footRoll: 18, armSwing: 17, elbow: 16, lean: 6, sway: 2.6, pelvisRoll: 6, pelvisYaw: 12, chestTwist: 9, headBob: 1.6, headYaw: 3.5, bob: 0.5, hunch: 0, armOut: 10, armForward: 12, drive: 0.4 },
  barbarian: { walkCadence: 6.6, idleCadence: 1.5, stride: 38, knee: 70, footRoll: 24, armSwing: 20, elbow: 20, lean: 8, sway: 4.5, pelvisRoll: 9, pelvisYaw: 14, chestTwist: 11, headBob: 2.6, headYaw: 2.6, bob: 1.1, hunch: 2, armOut: 17, armForward: 6, drive: 0.55 },
  druid: { walkCadence: 7.0, idleCadence: 1.6, stride: 33, knee: 62, footRoll: 20, armSwing: 18, elbow: 15, lean: 5.5, sway: 3.2, pelvisRoll: 7, pelvisYaw: 11, chestTwist: 8, headBob: 2, headYaw: 2.8, bob: 0.8, hunch: 1, armOut: 13, armForward: 10, drive: 0.45 },
  necromancer: { walkCadence: 6.0, idleCadence: 1.3, stride: 32, knee: 58, footRoll: 21, armSwing: 11, elbow: 26, lean: 5, sway: 2.4, pelvisRoll: 6, pelvisYaw: 9, chestTwist: 6, headBob: 2.2, headYaw: 2.4, bob: 0.55, hunch: 10, armOut: 8, armForward: 16, drive: 0.3 },
  paladin: { walkCadence: 7.2, idleCadence: 1.6, stride: 32, knee: 60, footRoll: 21, armSwing: 17, elbow: 14, lean: 4.5, sway: 2.6, pelvisRoll: 6, pelvisYaw: 11, chestTwist: 8, headBob: 1.8, headYaw: 2.4, bob: 0.7, hunch: 0, armOut: 13, armForward: 8, drive: 0.4 },
  sorceress: { walkCadence: 7.6, idleCadence: 1.9, stride: 23, knee: 52, footRoll: 16, armSwing: 12, elbow: 18, lean: 3.5, sway: 2, pelvisRoll: 5, pelvisYaw: 9, chestTwist: 7, headBob: 1.4, headYaw: 2.2, bob: 0.45, hunch: 0, armOut: 9, armForward: 13, drive: 0.3 },
};

export function gaitForClass(classId: string): ClassGait {
  return CLASS_GAIT[classId] ?? CLASS_GAIT["paladin"];
}

export interface AttackClipInfo {
  duration: number;
  trail?: string;
  trailArc?: number;
  spin?: boolean;
}

export const ATTACK_CLIP_INFO: Record<AttackAnimationStyle, AttackClipInfo> = {
  amazonJab: { duration: 0.34, trail: "#f6d28b", trailArc: 0.52 },
  assassinSlash: { duration: 0.38, trail: "#a8cfff", trailArc: 2.35 },
  assassinKick: { duration: 0.52, trail: "#ffe2a0", trailArc: 0.82 },
  barbarianCleave: { duration: 0.58, trail: "#ffc06a", trailArc: 2.1 },
  druidClaw: { duration: 0.44, trail: "#9dffb1", trailArc: 1.8 },
  necromancerCast: { duration: 0.62, trail: "#c6e5ff", trailArc: 0.95 },
  paladinStrike: { duration: 0.42, trail: "#fff0a8", trailArc: 1.1 },
  sorceressCast: { duration: 0.58, trail: "#ffb35c", trailArc: 0.9 },
  spin: { duration: 0.68, trail: "#ffce76", trailArc: Math.PI * 2, spin: true },
  cast: { duration: 0.48, trail: "#e6ddff", trailArc: 1.2 },
  maceSmash: { duration: 0.62, trail: "#e5c58b", trailArc: 1.25 },
  staffStrike: { duration: 0.52, trail: "#d6c0ff", trailArc: 2.1 },
  weaponThrow: { duration: 0.5, trail: "#ffd9a0", trailArc: 0.6 },
  swordSlash: { duration: 0.46, trail: "#efe2c0", trailArc: 2.4 },
  axeChop: { duration: 0.64, trail: "#ffcf83", trailArc: 1.5 },
  daggerStab: { duration: 0.34, trail: "#cfe8ff", trailArc: 0.7 },
  bowShot: { duration: 0.52, trail: "#d8e6ff", trailArc: 0.4 },
  crossbowShot: { duration: 0.48, trail: "#cfd9e8", trailArc: 0.5 },
  clawFlurry: { duration: 0.42, trail: "#a8cfff", trailArc: 1.6 },
  unarmedStrike: { duration: 0.32, trail: "#f0e2c8", trailArc: 0.9 },
};

/** Rest stance targets per class: where the arms hang when nothing is happening. */
interface StanceConfig {
  /** Shoulder abduction, degrees away from the torso. */
  out: number;
  /** Arm forward angle, degrees ahead of the body. */
  forward: number;
  /** Baseline elbow flexion, degrees. */
  elbow: number;
  /** Rest arm elevation (negative is down), degrees. */
  elevation: number;
}

const STANCE: Record<string, StanceConfig> = {
  amazon: { out: 26, forward: 4, elbow: 14, elevation: -74 },
  assassin: { out: 24, forward: 7, elbow: 18, elevation: -72 },
  barbarian: { out: 32, forward: 3, elbow: 20, elevation: -70 },
  druid: { out: 29, forward: 5, elbow: 16, elevation: -72 },
  necromancer: { out: 22, forward: 9, elbow: 24, elevation: -68 },
  paladin: { out: 28, forward: 4, elbow: 12, elevation: -72 },
  sorceress: { out: 23, forward: 8, elbow: 20, elevation: -70 },
};

function stanceForClass(classId: string): StanceConfig {
  return STANCE[classId] ?? STANCE["paladin"];
}

/** A solved joint: its bind transform plus the stance it starts each frame from. */
export interface RigJoint {
  bone: THREE.Bone;
  /** Bind position in model space. */
  bindPos: THREE.Vector3;
  /** Bind orientation in model space. */
  bindQuat: THREE.Quaternion;
  /** Stance orientation in model space, used as the zero for the pose. */
  restQuat: THREE.Quaternion;
  /** Direction the limb segment points in the stance, model space. */
  restDir: THREE.Vector3;
  side: -1 | 1;
  /** Semantic parent joint; positions are solved along this chain. */
  parent?: RigJoint;
  /** Length of the limb segment this joint starts, in model units. */
  bindLength?: number;
}

/** Bones that are carried rigidly by a solved joint (fingers, pads, hair...). */
interface RigSatellite {
  bone: THREE.Bone;
  bindPos: THREE.Vector3;
  bindQuat: THREE.Quaternion;
  follow: RigJoint;
}

export interface CharacterRig {
  classId: string;
  poseRoot: THREE.Group;
  joints: RigJoint[];
  pelvis?: RigJoint;
  spine?: RigJoint;
  chest?: RigJoint;
  neck?: RigJoint;
  head?: RigJoint;
  /** Shoulder bones (clavicles). They are posed so pads and straps follow. */
  clavicles: RigJoint[];
  arms: RigJoint[];
  forearms: RigJoint[];
  hands: RigJoint[];
  thighs: RigJoint[];
  knees: RigJoint[];
  feet: RigJoint[];
  satellites: RigSatellite[];
  /** Model-space scale that maps bind units to world units. */
  unitScale: number;
  /** Character height in bind units, used to size body offsets. */
  bindHeight: number;
}

export interface CharacterPoseState {
  /** Seconds since the model started animating; drives breathing and settle. */
  time: number;
  /** Locomotion cycle in radians. */
  walkPhase: number;
  /** 0 = standing, 1 = full running gait. */
  walk: number;
  attackStyle?: AttackAnimationStyle;
  /** Seconds into the current strike clip. */
  attackTime: number;
  attackSide: -1 | 1;
  gait: ClassGait;
  /** Scales all secondary motion, for reduced-motion users. */
  motionScale?: number;
}

export interface CharacterPoseResult {
  /** Vertical body offset in model units. */
  bodyY: number;
  /** Forward body offset in model units. */
  bodyZ: number;
  /** Sideways body offset in model units. */
  bodyX: number;
  /** Whole-model yaw from spinning strikes, radians. */
  rootSpin: number;
  /** Extra weapon-mesh pitch / roll / yaw for detached weapon models. */
  weaponPitch: number;
  weaponRoll: number;
  weaponYaw: number;
  /** How far into the strike the clip is, 0..1, for callers that need it. */
  attackProgress: number;
}

interface ArmPose {
  /** 0 = straight ahead, positive = out to the arm's own side, degrees. */
  az: number;
  /** Elevation above the horizon, degrees. */
  el: number;
  /** Elbow flexion, degrees. */
  elbow: number;
  /** Extra outward twist, degrees. */
  roll?: number;
}

interface BodyPose {
  chestYaw: number;
  chestPitch: number;
  chestRoll: number;
  spineYaw: number;
  spinePitch: number;
  spineRoll: number;
  pelvisYaw: number;
  pelvisPitch: number;
  headYaw: number;
  headPitch: number;
  /** Front leg forward angle, degrees. */
  frontLeg: number;
  /** Back leg forward angle, degrees (negative = behind). */
  backLeg: number;
  frontKnee: number;
  backKnee: number;
  /** Body drop in model units (negative lowers the whole model). */
  crouch: number;
  /** Forward body offset in model units. */
  lunge: number;
  /** Whole-body spin in degrees. */
  rootSpin: number;
  /** Weapon-mesh rotation for detached weapon models. */
  weaponPitch: number;
  weaponRoll: number;
  weaponYaw: number;
}

interface ClipKey {
  t: number;
  lead: ArmPose;
  off: ArmPose;
  body: Partial<BodyPose>;
}

const NEUTRAL_BODY: BodyPose = {
  chestYaw: 0, chestPitch: 0, chestRoll: 0,
  spineYaw: 0, spinePitch: 0, spineRoll: 0,
  pelvisYaw: 0, pelvisPitch: 0,
  headYaw: 0, headPitch: 0,
  frontLeg: 0, backLeg: 0, frontKnee: 0, backKnee: 0,
  crouch: 0, lunge: 0, rootSpin: 0,
  weaponPitch: 0, weaponRoll: 0, weaponYaw: 0,
};

function arm(az: number, el: number, elbow: number, roll = 0): ArmPose {
  return { az, el, elbow, roll };
}

function key(t: number, lead: ArmPose, off: ArmPose, body: Partial<BodyPose> = {}): ClipKey {
  return { t, lead, off, body };
}

/**
 * Strike clips: wind-up, contact, recovery. The off hand, hips, chest, stance
 * and head work alongside the lead arm so the strike travels through the body.
 */
const ATTACK_CLIPS: Record<AttackAnimationStyle, ClipKey[]> = {
  swordSlash: [
    key(0, arm(24, -48, 46), arm(12, -70, 24), { chestYaw: -6, pelvisYaw: -3 }),
    key(0.16, arm(62, 26, 96), arm(6, -66, 34), { chestYaw: -26, pelvisYaw: -10, chestPitch: -6, crouch: -0.02, frontLeg: 8, backLeg: -8, frontKnee: 14, backKnee: 10 }),
    key(0.32, arm(-38, -26, 14), arm(-4, -66, 20), { chestYaw: 28, pelvisYaw: 14, chestPitch: 12, crouch: -0.05, lunge: 0.1, frontLeg: 22, backLeg: -16, frontKnee: 26, backKnee: 12, weaponRoll: 26 }),
    key(0.52, arm(-54, -46, 30), arm(2, -70, 22), { chestYaw: 20, pelvisYaw: 10, chestPitch: 8, crouch: -0.03, lunge: 0.05, frontLeg: 16, backLeg: -12, frontKnee: 20, backKnee: 10 }),
    key(0.78, arm(-6, -56, 44), arm(8, -70, 24), { chestYaw: 4, pelvisYaw: 2, crouch: -0.01, frontLeg: 6, backLeg: -4, frontKnee: 8, backKnee: 4 }),
    key(1, arm(24, -48, 46), arm(12, -70, 24), {}),
  ],
  barbarianCleave: [
    key(0, arm(26, -46, 58), arm(20, -50, 78), { chestYaw: -8, pelvisYaw: -4 }),
    key(0.18, arm(52, 42, 104), arm(40, 30, 116), { chestYaw: -30, pelvisYaw: -14, chestPitch: -10, crouch: 0.02, frontLeg: 6, backLeg: -12, frontKnee: 12, backKnee: 16 }),
    key(0.34, arm(-30, -34, 22), arm(-18, -40, 44), { chestYaw: 32, pelvisYaw: 20, chestPitch: 20, crouch: -0.1, lunge: 0.12, frontLeg: 26, backLeg: -20, frontKnee: 34, backKnee: 14, headPitch: 10 }),
    key(0.56, arm(-52, -54, 34), arm(-24, -52, 52), { chestYaw: 22, pelvisYaw: 14, chestPitch: 12, crouch: -0.06, lunge: 0.06, frontLeg: 18, backLeg: -14, frontKnee: 26, backKnee: 12 }),
    key(0.82, arm(0, -50, 52), arm(10, -54, 70), { chestYaw: 4, pelvisYaw: 2, crouch: -0.01 }),
    key(1, arm(26, -46, 58), arm(20, -50, 78), {}),
  ],
  axeChop: [
    key(0, arm(16, -54, 52), arm(18, -52, 70), { chestYaw: -4 }),
    key(0.22, arm(6, 74, 26), arm(22, 62, 96), { chestYaw: -12, chestPitch: -14, crouch: 0.04, frontLeg: 4, backLeg: -10, frontKnee: 10, backKnee: 18, headPitch: -8 }),
    key(0.38, arm(4, -34, 8), arm(14, -38, 24), { chestYaw: 6, chestPitch: 24, crouch: -0.11, lunge: 0.08, frontLeg: 24, backLeg: -18, frontKnee: 32, backKnee: 12, headPitch: 14 }),
    key(0.58, arm(6, -56, 24), arm(16, -52, 40), { chestPitch: 16, crouch: -0.07, lunge: 0.04, frontLeg: 16, backLeg: -12, frontKnee: 24 }),
    key(0.82, arm(12, -58, 44), arm(18, -54, 62), { chestPitch: 4, crouch: -0.01 }),
    key(1, arm(16, -54, 52), arm(18, -52, 70), {}),
  ],
  maceSmash: [
    key(0, arm(20, -50, 50), arm(14, -58, 40), { chestYaw: -6 }),
    key(0.2, arm(44, 34, 92), arm(10, -56, 44), { chestYaw: -24, pelvisYaw: -10, chestPitch: -8, crouch: -0.01, frontLeg: 6, backLeg: -8, frontKnee: 12 }),
    key(0.36, arm(-6, -30, 18), arm(4, -60, 34), { chestYaw: 16, pelvisYaw: 8, chestPitch: 18, crouch: -0.08, lunge: 0.09, frontLeg: 20, backLeg: -16, frontKnee: 30, backKnee: 12 }),
    key(0.6, arm(-4, -50, 34), arm(8, -62, 36), { chestYaw: 10, chestPitch: 10, crouch: -0.04, frontLeg: 12, backLeg: -10, frontKnee: 18 }),
    key(0.85, arm(10, -52, 46), arm(12, -60, 40), { crouch: -0.01 }),
    key(1, arm(20, -50, 50), arm(14, -58, 40), {}),
  ],
  daggerStab: [
    key(0, arm(22, -50, 62), arm(16, -64, 34), { chestYaw: -8 }),
    key(0.14, arm(34, -34, 96), arm(12, -62, 30), { chestYaw: -16, crouch: -0.02, lunge: -0.03 }),
    key(0.28, arm(2, -22, 6), arm(4, -60, 32), { chestYaw: 18, chestPitch: 12, lunge: 0.1, crouch: -0.03, frontLeg: 18, backLeg: -12, frontKnee: 20 }),
    key(0.42, arm(24, -36, 78), arm(10, -62, 30), { chestYaw: -6, lunge: 0.02 }),
    key(0.56, arm(0, -24, 8), arm(6, -60, 32), { chestYaw: 16, chestPitch: 10, lunge: 0.09, crouch: -0.02, frontLeg: 16, backLeg: -10, frontKnee: 18 }),
    key(0.78, arm(14, -44, 60), arm(12, -62, 32), { chestYaw: 2, lunge: 0.02 }),
    key(1, arm(22, -50, 62), arm(16, -64, 34), {}),
  ],
  amazonJab: [
    key(0, arm(14, -46, 54), arm(20, -52, 66), { chestYaw: -6 }),
    key(0.16, arm(30, -30, 92), arm(24, -46, 84), { chestYaw: -18, crouch: -0.02, lunge: -0.04 }),
    key(0.3, arm(2, -10, 4), arm(10, -40, 40), { chestYaw: 20, chestPitch: 10, lunge: 0.11, crouch: -0.03, frontLeg: 20, backLeg: -14, frontKnee: 22, backKnee: 12 }),
    key(0.52, arm(4, -24, 26), arm(14, -46, 52), { chestYaw: 12, lunge: 0.05, frontLeg: 12, backLeg: -8, frontKnee: 16 }),
    key(0.8, arm(10, -42, 48), arm(18, -50, 62), { chestYaw: 2 }),
    key(1, arm(14, -46, 54), arm(20, -52, 66), {}),
  ],
  staffStrike: [
    key(0, arm(16, -52, 50), arm(14, -56, 54), { chestYaw: -6 }),
    key(0.2, arm(-42, 8, 74), arm(-6, -48, 62), { chestYaw: -30, pelvisYaw: -12, crouch: -0.01, frontLeg: 6, backLeg: -10, frontKnee: 12 }),
    key(0.36, arm(64, -12, 20), arm(24, -54, 48), { chestYaw: 32, pelvisYaw: 16, chestPitch: 8, lunge: 0.09, crouch: -0.05, frontLeg: 20, backLeg: -14, frontKnee: 24, backKnee: 12, weaponRoll: 40 }),
    key(0.58, arm(72, -38, 34), arm(28, -56, 46), { chestYaw: 22, pelvisYaw: 10, lunge: 0.04, crouch: -0.02, frontLeg: 12, backLeg: -8, frontKnee: 16 }),
    key(0.84, arm(30, -50, 46), arm(18, -56, 50), { chestYaw: 4 }),
    key(1, arm(16, -52, 50), arm(14, -56, 54), {}),
  ],
  bowShot: [
    key(0, arm(10, -20, 20), arm(16, -34, 60), { chestYaw: -4 }),
    key(0.18, arm(4, 4, 8), arm(-16, -6, 128), { chestYaw: -18, pelvisYaw: -8, headPitch: -4, frontLeg: 10, backLeg: -10, frontKnee: 14 }),
    key(0.44, arm(2, 2, 4), arm(-24, -2, 146), { chestYaw: -26, pelvisYaw: -12, headPitch: -6, frontLeg: 12, backLeg: -12, frontKnee: 16, lunge: -0.03 }),
    key(0.56, arm(2, 2, 2), arm(-14, -10, 108), { chestYaw: -12, pelvisYaw: -6, headPitch: -2 }),
    key(0.72, arm(4, -6, 10), arm(4, -26, 62), { chestYaw: 2 }),
    key(1, arm(10, -20, 20), arm(16, -34, 60), {}),
  ],
  crossbowShot: [
    key(0, arm(6, -14, 18), arm(10, -20, 46), { chestYaw: -2 }),
    key(0.24, arm(2, 2, 6), arm(4, -4, 74), { chestYaw: -14, pelvisYaw: -6, frontLeg: 8, backLeg: -8, frontKnee: 12 }),
    key(0.36, arm(0, 6, 2), arm(2, 2, 66), { chestYaw: -18, chestPitch: -6, crouch: 0.01, frontLeg: 8, backLeg: -8, frontKnee: 12 }),
    key(0.5, arm(4, -4, 14), arm(6, -12, 54), { chestYaw: -8, chestPitch: 4 }),
    key(1, arm(6, -14, 18), arm(10, -20, 46), {}),
  ],
  weaponThrow: [
    key(0, arm(20, -46, 54), arm(16, -54, 44), { chestYaw: -8 }),
    key(0.18, arm(38, 52, 92), arm(26, 30, 74), { chestYaw: -32, pelvisYaw: -16, chestPitch: -12, crouch: 0.02, frontLeg: 6, backLeg: -12, frontKnee: 10, backKnee: 16 }),
    key(0.34, arm(6, 16, 6), arm(10, -16, 30), { chestYaw: 26, pelvisYaw: 18, chestPitch: 16, lunge: 0.12, crouch: -0.04, frontLeg: 24, backLeg: -18, frontKnee: 26, backKnee: 14, headPitch: 6 }),
    key(0.56, arm(0, -18, 20), arm(6, -40, 36), { chestYaw: 14, chestPitch: 8, lunge: 0.06, crouch: -0.02, frontLeg: 14, backLeg: -10, frontKnee: 18 }),
    key(0.82, arm(12, -42, 44), arm(12, -52, 42), { chestYaw: 2 }),
    key(1, arm(20, -46, 54), arm(16, -54, 44), {}),
  ],
  clawFlurry: [
    key(0, arm(20, -44, 64), arm(18, -44, 64), { chestYaw: -4 }),
    key(0.16, arm(46, 12, 92), arm(-24, -30, 96), { chestYaw: -26, pelvisYaw: -12, crouch: -0.02 }),
    key(0.32, arm(-26, -18, 22), arm(46, 6, 88), { chestYaw: 24, pelvisYaw: 12, chestPitch: 10, lunge: 0.08, crouch: -0.04, frontLeg: 18, backLeg: -14, frontKnee: 22 }),
    key(0.48, arm(44, 4, 78), arm(-22, -24, 30), { chestYaw: -22, pelvisYaw: -10, chestPitch: 8, lunge: 0.06, crouch: -0.03, frontLeg: 16, backLeg: -12, frontKnee: 20 }),
    key(0.68, arm(-14, -34, 42), arm(30, -18, 52), { chestYaw: 14, pelvisYaw: 6, lunge: 0.02, crouch: -0.01 }),
    key(0.86, arm(14, -42, 58), arm(14, -42, 58), { chestYaw: 2 }),
    key(1, arm(20, -44, 64), arm(18, -44, 64), {}),
  ],
  unarmedStrike: [
    key(0, arm(16, -46, 60), arm(14, -48, 62), { chestYaw: -4 }),
    key(0.18, arm(26, -34, 96), arm(10, -46, 74), { chestYaw: -16, crouch: -0.01 }),
    key(0.34, arm(2, -16, 6), arm(8, -44, 70), { chestYaw: 20, chestPitch: 10, lunge: 0.08, frontLeg: 16, backLeg: -12, frontKnee: 20 }),
    key(0.56, arm(-10, -30, 58), arm(16, -34, 10), { chestYaw: -18, chestPitch: 8, lunge: 0.07, frontLeg: 14, backLeg: -10, frontKnee: 18 }),
    key(0.78, arm(10, -42, 52), arm(12, -46, 54), { chestYaw: 2 }),
    key(1, arm(16, -46, 60), arm(14, -48, 62), {}),
  ],
  assassinSlash: [
    key(0, arm(18, -48, 54), arm(14, -58, 40), { chestYaw: -6 }),
    key(0.16, arm(54, 16, 100), arm(2, -56, 46), { chestYaw: -28, pelvisYaw: -12, crouch: -0.02, frontLeg: 8, backLeg: -10, frontKnee: 14 }),
    key(0.32, arm(-34, -24, 16), arm(-6, -56, 40), { chestYaw: 30, pelvisYaw: 16, chestPitch: 10, lunge: 0.1, crouch: -0.05, frontLeg: 22, backLeg: -16, frontKnee: 24, backKnee: 12, weaponRoll: 22 }),
    key(0.5, arm(-46, -40, 34), arm(-2, -58, 38), { chestYaw: 20, pelvisYaw: 10, crouch: -0.03, frontLeg: 14, backLeg: -10, frontKnee: 18 }),
    key(0.78, arm(-4, -52, 46), arm(8, -58, 40), { chestYaw: 4 }),
    key(1, arm(18, -48, 54), arm(14, -58, 40), {}),
  ],
  assassinKick: [
    key(0, arm(18, -46, 52), arm(14, -56, 44), { chestYaw: -4 }),
    key(0.16, arm(24, -30, 78), arm(10, -50, 60), { chestYaw: -12, crouch: -0.03, backKnee: 16 }),
    key(0.34, arm(-16, -8, 30), arm(28, -28, 66), { chestYaw: 12, chestPitch: -12, crouch: 0.04, lunge: 0.06, frontLeg: 62, backLeg: -6, frontKnee: 46 }),
    key(0.52, arm(-6, -24, 46), arm(22, -36, 58), { chestYaw: 8, chestPitch: -4, crouch: 0.01, lunge: 0.02, frontLeg: 30, backLeg: -6, frontKnee: 24 }),
    key(0.8, arm(12, -42, 50), arm(12, -52, 46), { chestYaw: 2 }),
    key(1, arm(18, -46, 52), arm(14, -56, 44), {}),
  ],
  druidClaw: [
    key(0, arm(22, -44, 62), arm(20, -44, 62), { chestYaw: -4 }),
    key(0.18, arm(48, 22, 96), arm(-18, -28, 84), { chestYaw: -28, pelvisYaw: -12, chestPitch: -6, crouch: 0.01, frontLeg: 6, backLeg: -10, frontKnee: 12 }),
    key(0.36, arm(-28, -22, 24), arm(42, 8, 86), { chestYaw: 26, pelvisYaw: 14, chestPitch: 14, lunge: 0.1, crouch: -0.05, frontLeg: 22, backLeg: -16, frontKnee: 26 }),
    key(0.56, arm(40, -2, 70), arm(-20, -26, 32), { chestYaw: -20, pelvisYaw: -8, chestPitch: 8, lunge: 0.05, crouch: -0.03, frontLeg: 16, backLeg: -12, frontKnee: 20 }),
    key(0.8, arm(10, -40, 56), arm(12, -42, 56), { chestYaw: 2 }),
    key(1, arm(22, -44, 62), arm(20, -44, 62), {}),
  ],
  paladinStrike: [
    key(0, arm(16, -50, 50), arm(10, -66, 30), { chestYaw: -4 }),
    key(0.16, arm(40, 8, 88), arm(6, -64, 34), { chestYaw: -22, pelvisYaw: -10, crouch: -0.01, frontLeg: 6, backLeg: -8, frontKnee: 12 }),
    key(0.32, arm(0, -24, 12), arm(4, -64, 32), { chestYaw: 22, pelvisYaw: 12, chestPitch: 14, lunge: 0.09, crouch: -0.04, frontLeg: 20, backLeg: -16, frontKnee: 24, backKnee: 12 }),
    key(0.54, arm(-4, -44, 34), arm(8, -64, 32), { chestYaw: 12, chestPitch: 6, lunge: 0.04, crouch: -0.02, frontLeg: 12, backLeg: -10, frontKnee: 16 }),
    key(0.82, arm(10, -50, 46), arm(10, -66, 30), { chestYaw: 2 }),
    key(1, arm(16, -50, 50), arm(10, -66, 30), {}),
  ],
  necromancerCast: [
    key(0, arm(16, -40, 64), arm(14, -44, 70), { chestYaw: -4 }),
    key(0.24, arm(-6, -12, 88), arm(-2, -14, 92), { chestYaw: -14, pelvisYaw: -6, chestPitch: -6, crouch: 0.01 }),
    key(0.44, arm(6, 12, 18), arm(4, 10, 24), { chestYaw: 10, chestPitch: 8, lunge: 0.05, crouch: -0.02, frontLeg: 10, backLeg: -8, frontKnee: 14 }),
    key(0.66, arm(4, 4, 34), arm(2, 2, 40), { chestYaw: 6, chestPitch: 4, lunge: 0.02, crouch: -0.01 }),
    key(0.86, arm(12, -30, 58), arm(12, -36, 64), { chestYaw: 2 }),
    key(1, arm(16, -40, 64), arm(14, -44, 70), {}),
  ],
  sorceressCast: [
    key(0, arm(14, -42, 62), arm(12, -46, 66), { chestYaw: -4 }),
    key(0.22, arm(-10, -6, 92), arm(-4, -10, 96), { chestYaw: -16, pelvisYaw: -8, chestPitch: -8, crouch: 0.02 }),
    key(0.46, arm(8, 22, 12), arm(6, 18, 20), { chestYaw: 12, chestPitch: 12, lunge: 0.06, crouch: -0.03, frontLeg: 12, backLeg: -8, frontKnee: 16 }),
    key(0.68, arm(6, 10, 30), arm(6, 6, 36), { chestYaw: 6, chestPitch: 6, lunge: 0.02, crouch: -0.01 }),
    key(0.88, arm(12, -32, 56), arm(10, -38, 60), { chestYaw: 2 }),
    key(1, arm(14, -42, 62), arm(12, -46, 66), {}),
  ],
  cast: [
    key(0, arm(16, -44, 60), arm(14, -48, 64), { chestYaw: -4 }),
    key(0.26, arm(2, -6, 84), arm(2, -10, 88), { chestYaw: -12, chestPitch: -4, crouch: 0.01 }),
    key(0.48, arm(8, 14, 24), arm(6, 10, 30), { chestYaw: 8, chestPitch: 8, lunge: 0.05, crouch: -0.02, frontLeg: 10, backLeg: -8, frontKnee: 12 }),
    key(0.72, arm(8, 0, 44), arm(6, -6, 48), { chestYaw: 4, lunge: 0.02 }),
    key(1, arm(16, -44, 60), arm(14, -48, 64), {}),
  ],
  spin: [
    key(0, arm(24, -40, 62), arm(20, -42, 66), { chestYaw: -8, pelvisYaw: -6 }),
    key(0.16, arm(-30, -20, 74), arm(28, -24, 70), { chestYaw: -34, pelvisYaw: -18, crouch: -0.02, rootSpin: -12 }),
    key(0.34, arm(74, -14, 16), arm(70, -16, 20), { chestYaw: 26, pelvisYaw: 18, crouch: -0.03, rootSpin: 150 }),
    key(0.58, arm(80, -24, 18), arm(78, -26, 22), { chestYaw: 18, pelvisYaw: 12, crouch: -0.02, rootSpin: 292 }),
    key(0.8, arm(40, -44, 48), arm(36, -46, 52), { chestYaw: 6, pelvisYaw: 6, crouch: -0.01, rootSpin: 360 }),
    key(1, arm(24, -40, 62), arm(20, -42, 66), { rootSpin: 360 }),
  ],
};

/** How far a strike has travelled at this point in the clip, 0..1, for trails. */
export function attackStrikeIntensity(progress: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, progress) * 1.15));
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleClip(keys: ClipKey[], progress: number): { lead: ArmPose; off: ArmPose; body: BodyPose } {
  const clamped = Math.max(0, Math.min(1, progress));
  let index = 0;
  while (index < keys.length - 1 && clamped > keys[index + 1].t) index += 1;
  const from = keys[index];
  const to = keys[Math.min(keys.length - 1, index + 1)];
  const span = Math.max(1e-5, to.t - from.t);
  const localT = Math.max(0, Math.min(1, (clamped - from.t) / span));
  const eased = localT < 0.5 ? easeInOut(localT) : easeOut(localT);
  const blendArm = (a: ArmPose, b: ArmPose): ArmPose => ({
    az: lerp(a.az, b.az, eased),
    el: lerp(a.el, b.el, eased),
    elbow: lerp(a.elbow, b.elbow, eased),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, eased),
  });
  const body: BodyPose = { ...NEUTRAL_BODY };
  for (const field of Object.keys(NEUTRAL_BODY) as Array<keyof BodyPose>) {
    body[field] = lerp(from.body[field] ?? NEUTRAL_BODY[field], to.body[field] ?? NEUTRAL_BODY[field], eased);
  }
  return { lead: blendArm(from.lead, to.lead), off: blendArm(from.off, to.off), body };
}

function segmentAxis(dir: THREE.Vector3): THREE.Vector3 {
  const axis = new THREE.Vector3().crossVectors(dir, FORWARD);
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  return axis.normalize();
}

/** Rotate a direction about its natural flexion hinge, in model space. */
function flex(dir: THREE.Vector3, degrees: number): THREE.Vector3 {
  const axis = segmentAxis(dir);
  return dir.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, degrees * DEG)).normalize();
}

function armTarget(side: -1 | 1, az: number, el: number): THREE.Vector3 {
  const a = az * DEG;
  const e = el * DEG;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e) * side, Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
}

function legTarget(forwardDegrees: number, outwardDegrees = 2): THREE.Vector3 {
  const f = forwardDegrees * DEG;
  const o = outwardDegrees * DEG;
  return new THREE.Vector3(Math.sin(o), -Math.cos(f) * Math.cos(o), Math.sin(f) * Math.cos(o)).normalize();
}

function firstBoneChild(bone: THREE.Bone): THREE.Bone | undefined {
  for (const child of bone.children) {
    if (child instanceof THREE.Bone) return child;
  }
  return undefined;
}

function boneSide(name: string): -1 | 1 | undefined {
  if (/^(?:r|right)[_-]/.test(name) || /[_-](?:r|right)(?:[_-]|$)/.test(name) || /(?:^|_)r_jnt$/.test(name)) return -1;
  if (/^(?:l|left)[_-]/.test(name) || /[_-](?:l|left)(?:[_-]|$)/.test(name) || /(?:^|_)l_jnt$/.test(name)) return 1;
  return undefined;
}

interface BoneRecord {
  bone: THREE.Bone;
  name: string;
  bindPos: THREE.Vector3;
  bindQuat: THREE.Quaternion;
  /** Baked model-space scale. Armour pieces in these rips scale their bones, so
   *  dropping it while re-parenting blows the mesh up by orders of magnitude. */
  bindScale: THREE.Vector3;
  side?: -1 | 1;
}

interface JointCandidate extends RigJoint {
  name: string;
}

/**
 * Flatten the skeleton onto one pose root and record every bind transform in
 * model space. The rips parent most joints straight to RootNode, so the
 * hierarchy cannot be trusted for forward kinematics.
 */
function flattenSkeleton(model: THREE.Group): Map<THREE.Bone, BoneRecord> {
  model.updateWorldMatrix(true, true);
  const modelInverse = model.matrixWorld.clone().invert();
  const records = new Map<THREE.Bone, BoneRecord>();
  const bones: THREE.Bone[] = [];
  model.traverse((object) => {
    if (object instanceof THREE.Bone) bones.push(object);
  });
  for (const bone of bones) {
    const matrix = modelInverse.clone().multiply(bone.matrixWorld);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    records.set(bone, {
      bone,
      name: bone.name.toLowerCase(),
      bindPos: position,
      bindQuat: quaternion,
      bindScale: scale,
      side: boneSide(bone.name.toLowerCase()),
    });
  }
  return records;
}

/**
 * Some rips ship bones whose transforms sit at the model origin while the skin
 * weights still point at the shoulder or elbow the piece was modelled around.
 * Rebuilding the skin from such a skeleton drags those vertices down to the
 * feet as stretched sheets, so pull the bone back to the geometry it owns.
 */
function recoverDetachedBones(model: THREE.Group, records: Map<THREE.Bone, BoneRecord>, bindHeight: number): void {
  const modelInverse = model.matrixWorld.clone().invert();
  const sums = new Map<THREE.Bone, THREE.Vector3>();
  const counts = new Map<THREE.Bone, number>();
  const toModel = new THREE.Matrix4();
  const point = new THREE.Vector3();
  model.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
    const position = mesh.geometry.attributes["position"] as THREE.BufferAttribute | undefined;
    const skinIndex = mesh.geometry.attributes["skinIndex"] as THREE.BufferAttribute | undefined;
    const skinWeight = mesh.geometry.attributes["skinWeight"] as THREE.BufferAttribute | undefined;
    if (!position || !skinIndex || !skinWeight) return;
    // Geometry positions are authored in the model's rest space; the mesh world
    // matrix carries that space into the scene, and the model inverse brings it
    // back to the units every other bind transform is recorded in.
    mesh.updateWorldMatrix(true, false);
    toModel.copy(modelInverse).multiply(mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      let bestIndex = -1;
      let bestWeight = 0.4;
      for (let channel = 0; channel < 4; channel++) {
        const weight = skinWeight.getComponent(i, channel);
        if (weight <= bestWeight) continue;
        bestWeight = weight;
        bestIndex = skinIndex.getComponent(i, channel);
      }
      const bone = bestIndex >= 0 ? mesh.skeleton.bones[bestIndex] : undefined;
      if (!bone || !records.has(bone)) continue;
      point.fromBufferAttribute(position, i).applyMatrix4(toModel);
      const sum = sums.get(bone) ?? new THREE.Vector3();
      sum.add(point);
      sums.set(bone, sum);
      counts.set(bone, (counts.get(bone) ?? 0) + 1);
    }
  });
  // A healthy bone sits somewhere inside the flesh it owns, so its bind point and
  // that flesh's centroid are close. Only bones stranded a third of a body away
  // are the broken ones; everything else keeps its authored transform.
  for (const [bone, sum] of sums) {
    const record = records.get(bone);
    const count = counts.get(bone) ?? 0;
    if (!record || count < 12) continue;
    const centroid = sum.divideScalar(count);
    if (centroid.distanceTo(record.bindPos) < bindHeight * 0.3) continue;
    record.bindPos.copy(centroid);
  }
}

function reparentToPoseRoot(model: THREE.Group, records: Map<THREE.Bone, BoneRecord>): THREE.Group {
  const poseRoot = new THREE.Group();
  poseRoot.name = "d2sPoseRoot";
  model.add(poseRoot);
  for (const record of records.values()) {
    record.bone.removeFromParent();
    poseRoot.add(record.bone);
    record.bone.position.copy(record.bindPos);
    record.bone.quaternion.copy(record.bindQuat);
    record.bone.scale.copy(record.bindScale);
    record.bone.updateMatrix();
  }
  return poseRoot;
}

function makeJoint(record: BoneRecord): JointCandidate {
  return {
    bone: record.bone,
    name: record.name,
    bindPos: record.bindPos.clone(),
    bindQuat: record.bindQuat.clone(),
    restQuat: record.bindQuat.clone(),
    restDir: new THREE.Vector3(0, -1, 0),
    side: record.side ?? 1,
  };
}

function directionBetween(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const direction = to.clone().sub(from);
  if (direction.lengthSq() < 1e-12) return new THREE.Vector3(0, -1, 0);
  return direction.normalize();
}

function pickOnePerSide(
  candidates: JointCandidate[],
  score: (candidate: JointCandidate) => number,
): JointCandidate[] {
  const picked: JointCandidate[] = [];
  for (const side of [1, -1] as const) {
    const peers = candidates.filter((candidate) => candidate.side === side);
    if (!peers.length) continue;
    picked.push(peers.reduce((winner, candidate) => (score(candidate) > score(winner) ? candidate : winner)));
  }
  return picked;
}

function collectJoints(records: Map<THREE.Bone, BoneRecord>, classId: string): {
  pelvis?: JointCandidate; spine?: JointCandidate; chest?: JointCandidate; neck?: JointCandidate; head?: JointCandidate;
  arms: JointCandidate[]; forearms: JointCandidate[]; hands: JointCandidate[];
  thighs: JointCandidate[]; knees: JointCandidate[]; feet: JointCandidate[];
} {
  const result = {
    pelvis: undefined as JointCandidate | undefined,
    spine: undefined as JointCandidate | undefined,
    chest: undefined as JointCandidate | undefined,
    neck: undefined as JointCandidate | undefined,
    head: undefined as JointCandidate | undefined,
    arms: [] as JointCandidate[],
    forearms: [] as JointCandidate[],
    hands: [] as JointCandidate[],
    thighs: [] as JointCandidate[],
    knees: [] as JointCandidate[],
    feet: [] as JointCandidate[],
  };
  // Short body-part words need boundaries, otherwise "forearm" reads as "ear".
  const faceLike = /shape|mesh|band|attach|necklace|helm|hair|(?:^|[_-])(?:eye|eyes|brow|brows|lip|lips|jaw|horn|ear|ears|nose|teeth|beard|lash|lashes|cheek|nostril)(?:[_-]|$)/i;
  const helper = /twist|helper|pad|plate|armou?r|cord|clip|pivot|strap|finger|thumb|ring|nail|toe|skirt|belt|fauld|tasset|cape|cloth/i;
  for (const record of records.values()) {
    const name = record.name;
    if (!name) continue;
    if (!result.pelvis && (/(?:^|[_-])(?:pelvis|hips?)(?:[_-]|$)/.test(name) || /^root_main_00_m_jnt$/.test(name))) result.pelvis = makeJoint(record);
    if (!result.spine && (/(?:^|[_-])spine[_-]?0?1(?:[_-]|$)/.test(name) || /^spine_01_m_jnt$/.test(name))) result.spine = makeJoint(record);
    if (!result.chest && !faceLike.test(name)
      && (/(?:^|[_-])chest(?:[_-]|$)/.test(name) || /(?:^|[_-])spine[_-]?0?2(?:[_-]|$)/.test(name))) result.chest = makeJoint(record);
    if (!result.neck && !faceLike.test(name) && /(?:^|[_-])neck(?:[_-]?0?[12])?(?:[_-]|$)/.test(name)) result.neck = makeJoint(record);
    if (!result.head && !faceLike.test(name) && /(?:^|[_-])head(?:[_-]|$)/.test(name)) result.head = makeJoint(record);
    const side = record.side;
    if (!side || helper.test(name) || faceLike.test(name)) continue;
    const thigh = /^(?:l|r|left|right)[_-](?:leg[_-]?0?1|upper[_-]?leg|thigh)(?:[_-].*)?$/.test(name)
      || /^(?:hip|upper[_-]?leg|thigh)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name)
      || /^hip_[lr]_jnt$/.test(name)
      || /^(?:l|r)_thigh$/.test(name);
    const shin = /^(?:l|r|left|right)[_-](?:leg[_-]?0?2|lower[_-]?leg|calf|shin|knee)(?:[_-].*)?$/.test(name)
      || /^(?:knee|calf|shin)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name)
      || /^knee_[lr]_jnt$/.test(name)
      || /^(?:l|r)_calf$/.test(name);
    const foot = /^(?:l|r|left|right)[_-](?:leg[_-]?0?[34]|foot|ankle)(?:[_-].*)?$/.test(name)
      || /^ankle_[lr]_jnt$/.test(name)
      || /^(?:l|r)_foot$/.test(name)
      || /^(?:foot|ankle)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name);
    const shoulder = /(?:^|[_-])(?:l|left|r|right)[_-]?shoulder(?:[_-].*)?/.test(name)
      || /(?:^|[_-])shoulder[_-]?(?:l|r)(?:[_-].*)?/.test(name)
      || /^shoulder_[lr]_jnt$/.test(name);
    const upperArm = /(?:^|[_-])(?:l|left|r|right)[_-]?(?:upr|upper)[_-]?arm(?:[_-].*)?/.test(name)
      || /^(?:l|r)_upperarm$/.test(name)
      || /^(?:l|r)_clavicle$/.test(name);
    const lowerArm = /(?:^|[_-])(?:l|left|r|right)[_-]?(?:forearm|fore[_-]?arm|lower[_-]?arm|lwr[_-]?arm)(?:[_-].*)?/.test(name)
      || /^elbow_[lr]_jnt$/.test(name);
    const hand = /(?:^|[_-])(?:l|left|r|right)[_-]?(?:hand|wrist)(?:[_-].*)?/.test(name)
      || /^wrist_[lr]_jnt$/.test(name);
    if (thigh) result.thighs.push(makeJoint(record));
    else if (shin) result.knees.push(makeJoint(record));
    else if (foot) result.feet.push(makeJoint(record));
    else if (shoulder || upperArm) result.arms.push(makeJoint(record));
    else if (lowerArm) result.forearms.push(makeJoint(record));
    else if (hand) result.hands.push(makeJoint(record));
  }
  return result;
}

function armScore(classId: string): (candidate: JointCandidate) => number {
  return (candidate) => {
    const name = candidate.name;
    if (/^shoulder_[lr]_jnt$/.test(name)) return 6;
    if (/upr_arm|upper_arm|upperarm/.test(name)) return 5;
    if (/clavicle/.test(name)) return classId === "barbarian" ? 2 : 1;
    return 2;
  };
}

/**
 * Solve the rest stance. T-pose rigs (Paladin, Amazon) need their upper arms
 * carried down to the sides; A-pose rigs only need a light correction.
 */
function solveRestStance(classId: string, arms: JointCandidate[], forearms: JointCandidate[]): void {
  const stance = stanceForClass(classId);
  for (const armBone of arms) {
    const target = armTarget(armBone.side, stance.out, stance.elevation);
    target.z += stance.forward * DEG;
    target.normalize();
    const bindDir = armBone.restDir.clone();
    const align = new THREE.Quaternion().setFromUnitVectors(bindDir, target);
    armBone.restQuat = align.multiply(armBone.bindQuat.clone());
    armBone.restDir = target;
    const forearm = forearms.find((entry) => entry.side === armBone.side);
    if (forearm) forearm.restDir = flex(target, stance.elbow);
  }
}


/** Far end of a joint's segment, so satellites can bind to the limb they lie on. */
function jointEndPoint(joint: RigJoint): THREE.Vector3 {
  return joint.bindPos.clone().addScaledVector(joint.restDir, joint.bindLength ?? 0);
}

function distanceToSegmentSquared(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): number {
  const ab = to.clone().sub(from);
  const lengthSq = ab.lengthSq();
  if (lengthSq < 1e-12) return point.distanceToSquared(from);
  const t = Math.max(0, Math.min(1, point.clone().sub(from).dot(ab) / lengthSq));
  const closest = from.clone().addScaledVector(ab, t);
  return point.distanceToSquared(closest);
}

export function buildCharacterRig(model: THREE.Group, classId: string): CharacterRig {
  const records = flattenSkeleton(model);
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (const record of records.values()) {
    lowest = Math.min(lowest, record.bindPos.y);
    highest = Math.max(highest, record.bindPos.y);
  }
  const bindHeight = Number.isFinite(highest - lowest) && highest > lowest ? highest - lowest : 1;
  recoverDetachedBones(model, records, bindHeight);
  const poseRoot = reparentToPoseRoot(model, records);
  const found = collectJoints(records, classId);

  // Clavicles are solved separately: the pads, straps and sleeve caps in these
  // rips hang off them, so leaving them at the bind pose keeps the shoulder
  // armour spread out sideways while the arm itself hangs.
  const clavicles = pickOnePerSide(
    found.arms.filter((candidate) => /clavicle/.test(candidate.name)),
    () => 1,
  );
  const armOnly = found.arms.filter((candidate) => !clavicles.includes(candidate));
  const arms = pickOnePerSide(armOnly.length ? armOnly : found.arms, armScore(classId));
  const forearms = pickOnePerSide(found.forearms, (candidate) => {
    if (/^elbow_[lr]_jnt$/.test(candidate.name)) return 6;
    if (/forearm|fore_arm|lwr_arm/.test(candidate.name)) return 5;
    if (/elbow/.test(candidate.name)) return 4;
    return 2;
  });
  const hands = pickOnePerSide(found.hands, (candidate) => {
    if (/wrist/.test(candidate.name)) return 6;
    if (/hand/.test(candidate.name)) return 5;
    return 2;
  });
  const thighs = pickOnePerSide(found.thighs, (candidate) => (/leg_01|thigh|upper_leg/.test(candidate.name) ? 5 : 3));
  const knees = pickOnePerSide(found.knees, (candidate) => (/leg_02|calf|shin|knee/.test(candidate.name) ? 5 : 3));
  const feet = pickOnePerSide(found.feet, (candidate) => (/leg_04|foot|ankle/.test(candidate.name) ? 5 : 3));

  for (const clavicle of clavicles) {
    const armBone = arms.find((entry) => entry.side === clavicle.side);
    clavicle.restDir = armBone ? directionBetween(clavicle.bindPos, armBone.bindPos) : new THREE.Vector3(0, -1, 0);
  }
  // Limb directions from the joint that follows, in bind pose.
  for (const armBone of arms) {
    const forearm = forearms.find((entry) => entry.side === armBone.side);
    armBone.restDir = forearm ? directionBetween(armBone.bindPos, forearm.bindPos) : new THREE.Vector3(0, -1, 0);
  }
  for (const forearm of forearms) {
    const hand = hands.find((entry) => entry.side === forearm.side);
    forearm.restDir = directionBetween(forearm.bindPos, hand?.bindPos ?? forearm.bindPos);
    if (forearm.restDir.lengthSq() < 0.5) {
      const sibling = feet.find((entry) => entry.side === forearm.side);
      forearm.restDir = sibling ? directionBetween(forearm.bindPos, sibling.bindPos) : new THREE.Vector3(0, -1, 0);
    }
  }
  for (const thigh of thighs) {
    const knee = knees.find((entry) => entry.side === thigh.side);
    thigh.restDir = knee ? directionBetween(thigh.bindPos, knee.bindPos) : new THREE.Vector3(0, -1, 0);
  }
  for (const knee of knees) {
    const foot = feet.find((entry) => entry.side === knee.side);
    knee.restDir = foot ? directionBetween(knee.bindPos, foot.bindPos) : new THREE.Vector3(0, -1, 0);
  }
  // Feet point forward along the character's facing axis, whatever their bind rotation.
  for (const foot of feet) foot.restDir = new THREE.Vector3(0, -0.32, 1).normalize();

  solveRestStance(classId, arms, forearms);

  const chest = found.chest ?? found.spine;
  const pelvis = found.pelvis ?? found.spine ?? found.chest;
  found.spine && (found.spine.parent = pelvis);
  chest && chest !== found.spine && (chest.parent = found.spine ?? pelvis);
  found.neck && (found.neck.parent = chest);
  found.head && (found.head.parent = found.neck ?? chest);
  for (const clavicle of clavicles) clavicle.parent = chest ?? pelvis;
  for (const armBone of arms) armBone.parent = clavicles.find((entry) => entry.side === armBone.side) ?? chest ?? pelvis;
  for (const forearm of forearms) forearm.parent = arms.find((entry) => entry.side === forearm.side) ?? chest;
  for (const hand of hands) hand.parent = forearms.find((entry) => entry.side === hand.side) ?? chest;
  for (const thigh of thighs) thigh.parent = pelvis;
  for (const knee of knees) knee.parent = thighs.find((entry) => entry.side === knee.side) ?? pelvis;
  for (const foot of feet) foot.parent = knees.find((entry) => entry.side === foot.side) ?? pelvis;

  const joints: RigJoint[] = [];
  const seen = new Set<THREE.Bone>();
  for (const joint of [
    pelvis, found.spine, chest, found.neck, found.head,
    ...clavicles, ...arms, ...forearms, ...hands, ...thighs, ...knees, ...feet,
  ]) {
    if (!joint || seen.has(joint.bone)) continue;
    seen.add(joint.bone);
    joints.push(joint);
  }

  // Everything not solved is carried rigidly by the closest solved joint: pads,
  // hair, fingers, twist joints, skirts and belt props all move with the limb
  // they belong to instead of being left behind at the bind pose.
  const satellites: RigSatellite[] = [];
  for (const joint of joints) {
    const children = joints.filter((candidate) => candidate.parent === joint);
    joint.bindLength = children.length
      ? Math.min(...children.map((child) => child.bindPos.distanceTo(joint.bindPos)))
      : bindHeight * 0.06;
  }
  const solved = new Set(joints.map((joint) => joint.bone));
  const modelScale = model.getWorldScale(new THREE.Vector3()).x;
  for (const record of records.values()) {
    if (solved.has(record.bone)) continue;
    if (!record.name) continue;
    let best: RigJoint | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const joint of joints) {
      const end = jointEndPoint(joint);
      const distance = distanceToSegmentSquared(record.bindPos, joint.bindPos, end);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = joint;
      }
    }
    if (!best) continue;
    satellites.push({ bone: record.bone, bindPos: record.bindPos.clone(), bindQuat: record.bindQuat.clone(), follow: best });
  }

  const rig: CharacterRig = {
    classId,
    poseRoot,
    joints,
    pelvis,
    spine: found.spine,
    chest,
    neck: found.neck,
    head: found.head,
    clavicles,
    arms,
    forearms,
    hands,
    thighs,
    knees,
    feet,
    satellites,
    unitScale: Number.isFinite(modelScale) && modelScale !== 0 ? modelScale : 1,
    bindHeight,
  };

  // The rips carry stale skin bindings: some meshes ship bone inverses that do
  // not match their own joint transforms, so they ignore the skeleton entirely
  // and stay in bind pose while the rest of the body moves. Rebuilding every
  // skin from the (now consistent) bind pose makes them deform with the body.
  model.updateWorldMatrix(true, true);
  const skeletons = new Set<THREE.Skeleton>();
  model.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton || !mesh.skeleton.bones.length) return;
    if (!skeletons.has(mesh.skeleton)) {
      skeletons.add(mesh.skeleton);
      mesh.skeleton.calculateInverses();
    }
    mesh.bind(mesh.skeleton, mesh.matrixWorld);
  });

  return rig;
}

/**
 * Pose a rig for one frame.
 *
 * Locomotion runs underneath the strike, so a hero that attacks while moving
 * keeps their footwork; the strike poses are layered on the upper body and
 * blended with the walk swing of the arms. Joint positions are solved along the
 * semantic chain, so limbs actually travel through space.
 */
export function poseCharacterRig(rig: CharacterRig, state: CharacterPoseState): CharacterPoseResult {
  const motion = state.motionScale ?? 1;
  const gait = state.gait;
  const walk = Math.max(0, Math.min(1, state.walk)) * motion;
  const phase = state.walkPhase;
  const breathe = Math.sin(state.time * 1.7) * (1 - walk);
  // Standing still is not a frozen pose: the idle weight shift runs on the
  // class's own slow cadence, so a resting hero breathes, drifts and settles
  // instead of holding the walk pose with every sway term multiplied by zero.
  const idle = (1 - walk) * motion;
  const idlePhase = state.time * gait.idleCadence;
  const idleSway = Math.sin(idlePhase) * idle;
  const stance = stanceForClass(rig.classId);

  const attackActive = !!state.attackStyle && state.attackTime < ATTACK_CLIP_INFO[state.attackStyle].duration;
  const clip = state.attackStyle ? ATTACK_CLIPS[state.attackStyle] : undefined;
  const rawProgress = state.attackStyle
    ? Math.max(0, Math.min(1, state.attackTime / ATTACK_CLIP_INFO[state.attackStyle].duration))
    : 0;
  const sampled = clip && attackActive ? sampleClip(clip, rawProgress) : undefined;
  const strike = sampled ? Math.sin(Math.PI * Math.min(1, rawProgress * 1.15)) : 0;

  const orientations = new Map<RigJoint, THREE.Quaternion>();
  const positions = new Map<RigJoint, THREE.Vector3>();
  const deltas = new Map<RigJoint, THREE.Quaternion>();

  const setWorldRotation = (joint: RigJoint | undefined, euler: THREE.Euler): void => {
    if (!joint) return;
    const rotation = new THREE.Quaternion().setFromEuler(euler).multiply(joint.restQuat);
    orientations.set(joint, rotation);
    deltas.set(joint, rotation.clone().multiply(joint.bindQuat.clone().invert()));
  };

  const setWorldDirection = (joint: RigJoint | undefined, direction: THREE.Vector3, twist = 0): void => {
    if (!joint) return;
    const align = new THREE.Quaternion().setFromUnitVectors(joint.restDir, direction);
    if (twist) align.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, twist));
    const rotation = align.multiply(joint.restQuat.clone());
    orientations.set(joint, rotation);
    deltas.set(joint, rotation.clone().multiply(joint.bindQuat.clone().invert()));
  };

  const eulerOf = (pitchDeg: number, yawDeg: number, rollDeg: number): THREE.Euler =>
    new THREE.Euler(pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG, "YXZ");

  // ---- torso -------------------------------------------------------------
  const pelvisRoll = gait.pelvisRoll * Math.sin(phase) * walk + idleSway * 2.1;
  const pelvisYaw = gait.pelvisYaw * Math.sin(phase) * walk + (sampled ? sampled.body.pelvisYaw : 0);
  const pelvisPitch = gait.hunch + (sampled ? sampled.body.pelvisPitch : 0);
  setWorldRotation(rig.pelvis, eulerOf(pelvisPitch, pelvisYaw, pelvisRoll));
  setWorldRotation(rig.spine, eulerOf(
    -(gait.lean * walk) - gait.hunch * 0.45 + Math.sin(phase * 2) * 0.35 * walk + (sampled ? sampled.body.spinePitch : 0),
    -gait.pelvisYaw * 0.35 * Math.sin(phase) * walk + (sampled ? sampled.body.spineYaw : 0),
    gait.sway * Math.sin(phase) * walk + idleSway * 3 + (sampled ? sampled.body.spineRoll : 0),
  ));
  setWorldRotation(rig.chest, eulerOf(
    breathe * 0.8 - idleSway * 1.1 + (sampled ? sampled.body.chestPitch : 0),
    gait.chestTwist * 0.55 * Math.sin(phase) * walk + (sampled ? sampled.body.chestYaw : 0),
    gait.sway * 0.45 * Math.sin(phase) * walk + idleSway * 2.4 + (sampled ? sampled.body.chestRoll : 0),
  ));
  const headYaw = -gait.headYaw * Math.sin(phase) * walk - gait.chestTwist * 0.4 * Math.sin(phase) * walk + breathe * 0.4
    + Math.sin(idlePhase * 0.45) * 3.2 * idle;
  const headPitch = -gait.headBob * Math.sin(phase * 2) * walk + (sampled ? sampled.body.headPitch : 0)
    + Math.sin(idlePhase * 0.7 + 0.5) * 1.5 * idle;
  setWorldRotation(rig.neck, eulerOf(headPitch * 0.45, headYaw * 0.45, 0));
  setWorldRotation(rig.head, eulerOf(headPitch, headYaw, 0));

  // ---- arms --------------------------------------------------------------
  let weaponPitch = sampled ? sampled.body.weaponPitch : 0;
  let weaponRoll = sampled ? sampled.body.weaponRoll : 0;
  let weaponYaw = sampled ? sampled.body.weaponYaw : 0;
  const lateralAxis = new THREE.Vector3(1, 0, 0);
  const forearmDirs = new Map<-1 | 1, THREE.Vector3>();
  const armDirs = new Map<-1 | 1, THREE.Vector3>();
  for (const armBone of rig.arms) {
    const lead = armBone.side === state.attackSide;
    const sidePhase = phase + (armBone.side < 0 ? Math.PI : 0);
    // The idle drift joins the walk swing so hanging arms sway with the weight
    // shift rather than staying pinned to the stance.
    const walkSwing = Math.sin(-sidePhase) * gait.armSwing * walk + idleSway * Math.min(2.6, gait.armSwing * 0.3);
    // The stance arm swings along the sagittal plane, so the shoulder travels
    // forward and back instead of the elbow merely rising.
    const stanceDir = armTarget(armBone.side, stance.out, stance.elevation);
    const swing = new THREE.Quaternion().setFromAxisAngle(lateralAxis, -walkSwing * DEG);
    let dir = stanceDir.applyQuaternion(swing);
    let elbow = stance.elbow + gait.elbow * walk + idle * 2.4 * Math.sin(idlePhase * 0.8 + 0.4);
    let roll = 0;
    if (sampled && strike > 0) {
      const armPose = lead ? sampled.lead : sampled.off;
      const strikeDir = armTarget(armBone.side, armPose.az, armPose.el);
      dir = dir.clone().lerp(strikeDir, strike).normalize();
      elbow = lerp(elbow, armPose.elbow, strike);
      roll = lerp(0, armPose.roll ?? 0, strike);
    }
    armDirs.set(armBone.side, dir);
    setWorldDirection(armBone, dir, roll * DEG);
    const forearm = rig.forearms.find((entry) => entry.side === armBone.side);
    if (forearm) {
      const forearmDir = flex(dir, Math.max(0, elbow));
      forearmDirs.set(armBone.side, forearmDir);
      setWorldDirection(forearm, forearmDir);
    }
  }

  // ---- shoulders ---------------------------------------------------------
  // The bind pose is a T-pose, so pads and straps are modelled on horizontal
  // shoulders. Slope each clavicle toward the hanging arm so the shoulder
  // armour rides down with it instead of staying spread out sideways.
  for (const clavicle of rig.clavicles) {
    const armDir = armDirs.get(clavicle.side);
    if (!armDir) continue;
    setWorldDirection(clavicle, clavicle.restDir.clone().lerp(armDir, 0.3).normalize());
  }

  // ---- wrists ------------------------------------------------------------
  // These rips are skinned in a T-pose, so a wrist that simply rides its forearm
  // keeps the palm facing the floor and the hand sticking out. Bend the wrist in
  // slightly and roll it toward the body so the hands hang like actual hands.
  for (const hand of rig.hands) {
    const forearmDir = forearmDirs.get(hand.side);
    if (!forearmDir) continue;
    setWorldDirection(hand, flex(forearmDir, 15), hand.side * 14);
  }

  // ---- legs --------------------------------------------------------------
  const thighDirs = new Map<-1 | 1, THREE.Vector3>();
  for (const thigh of rig.thighs) {
    const sidePhase = phase + (thigh.side < 0 ? Math.PI : 0);
    const swing = Math.sin(sidePhase) * gait.stride * walk;
    const stanceAngle = sampled
      ? (thigh.side === state.attackSide ? sampled.body.frontLeg : sampled.body.backLeg) * strike
      : 0;
    const dir = legTarget(swing + stanceAngle, 2.5 + stance.out * 0.06);
    thighDirs.set(thigh.side, dir);
    setWorldDirection(thigh, dir);
  }
  for (const knee of rig.knees) {
    const sidePhase = phase + (knee.side < 0 ? Math.PI : 0);
    const lift = Math.max(0, Math.sin(sidePhase + Math.PI * 0.15));
    const locomotion = gait.knee * lift * lift * walk;
    const stanceBend = sampled
      ? (knee.side === state.attackSide ? sampled.body.frontKnee : sampled.body.backKnee) * strike
      : 0;
    const thighDir = thighDirs.get(knee.side) ?? legTarget(0);
    setWorldDirection(knee, flex(thighDir, -(locomotion + stanceBend)));
  }
  for (const foot of rig.feet) {
    const sidePhase = phase + (foot.side < 0 ? Math.PI : 0);
    const ankle = -Math.sin(sidePhase + Math.PI * 0.35) * gait.footRoll * walk;
    const pitch = (ankle + 6) * DEG;
    const toeDir = new THREE.Vector3(0, -Math.sin(pitch) - 0.32, Math.cos(pitch)).normalize();
    setWorldDirection(foot, toeDir);
  }

  // ---- forward kinematics ------------------------------------------------
  // Offsets are expressed as fractions of body height so they read the same on
  // every rig, whose bind units differ by two orders of magnitude.
  const height = rig.bindHeight;
  const bodyY = height * (
    Math.abs(Math.sin(phase)) * (gait.bob / 100) * walk * 0.5
    + breathe * 0.0025
    + (sampled ? sampled.body.crouch * strike : 0)
  );
  const bodyZ = height * (
    (sampled ? sampled.body.lunge * strike : 0)
    + Math.sin(phase * 2) * (gait.drive / 100) * walk * 0.25
  );
  const bodyX = height * (Math.sin(phase) * walk * 0.012 * motion + idleSway * 0.009);

  const solveJoint = (joint: RigJoint | undefined): void => {
    if (!joint) return;
    if (positions.has(joint)) return;
    let position: THREE.Vector3;
    let parentDelta = new THREE.Quaternion();
    if (joint.parent) {
      solveJoint(joint.parent);
      const parentPosition = positions.get(joint.parent) ?? joint.parent.bindPos;
      parentDelta = deltas.get(joint.parent) ?? new THREE.Quaternion();
      position = parentPosition.clone().add(joint.bindPos.clone().sub(joint.parent.bindPos).applyQuaternion(parentDelta));
    } else {
      position = joint.bindPos.clone();
    }
    // Joints we do not pose (wrists) ride their parent rigidly so attached
    // weapons keep their grip angle.
    const orientation = orientations.get(joint) ?? parentDelta.clone().multiply(joint.bindQuat);
    positions.set(joint, position);
    deltas.set(joint, orientation.clone().multiply(joint.bindQuat.clone().invert()));
    joint.bone.position.copy(position);
    joint.bone.quaternion.copy(orientation);
    joint.bone.updateMatrix();
  };
  solveJoint(rig.pelvis);
  for (const joint of rig.joints) solveJoint(joint);

  // The whole body rides the pelvis offset so the crouch and lunge read on screen.
  const rootOffset = new THREE.Vector3(bodyX, bodyY, bodyZ);
  if (rig.pelvis) {
    positions.set(rig.pelvis, (positions.get(rig.pelvis) ?? rig.pelvis.bindPos).clone().add(rootOffset));
    rig.pelvis.bone.position.copy(positions.get(rig.pelvis)!);
    rig.pelvis.bone.updateMatrix();
    // Children were solved before the offset, so shift the whole solved chain.
    for (const joint of rig.joints) {
      if (joint === rig.pelvis) continue;
      const position = positions.get(joint);
      if (!position) continue;
      position.add(rootOffset);
      joint.bone.position.copy(position);
      joint.bone.updateMatrix();
    }
  }

  for (const satellite of rig.satellites) {
    const delta = deltas.get(satellite.follow) ?? new THREE.Quaternion();
    const anchor = positions.get(satellite.follow) ?? satellite.follow.bindPos;
    const offset = satellite.bindPos.clone().sub(satellite.follow.bindPos).applyQuaternion(delta);
    satellite.bone.position.copy(anchor.clone().add(offset));
    satellite.bone.quaternion.copy(delta.clone().multiply(satellite.bindQuat));
    satellite.bone.updateMatrix();
  }

  if (state.attackStyle === "spin") {
    weaponPitch = Math.sin(rawProgress * Math.PI) * 14;
    weaponRoll = Math.sin(rawProgress * Math.PI) * 30;
    weaponYaw = 0;
  }

  return {
    bodyY,
    bodyZ,
    bodyX,
    rootSpin: sampled ? sampled.body.rootSpin * DEG : 0,
    weaponPitch,
    weaponRoll,
    weaponYaw,
    attackProgress: rawProgress,
  };
}

/** Rest pose helper: put the rig back in its solved stance without animation. */
export function resetCharacterRig(rig: CharacterRig): void {
  poseCharacterRig(rig, {
    time: 0,
    walkPhase: 0,
    walk: 0,
    attackTime: Number.POSITIVE_INFINITY,
    attackSide: -1,
    gait: gaitForClass(rig.classId),
  });
}
