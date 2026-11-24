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
  | "leap"
  | "clawFlurry"
  | "unarmedStrike"
  | "chestKick";

const DEG = Math.PI / 180;
const FORWARD = new THREE.Vector3(0, 0, 1);
const FINGER_HINGE = new THREE.Vector3(1, 0, 0);

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
  amazon: { walkCadence: 7.4, idleCadence: 1.7, stride: 30, knee: 58, footRoll: 20, armSwing: 16, elbow: 15, lean: 5, sway: 3, pelvisRoll: 6.5, pelvisYaw: 10, chestTwist: 8, headBob: 2, headYaw: 3, bob: 0.6, hunch: 0, armOut: 11, armForward: 8, drive: 0.35 },
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
  // Matches the D2R barbarian leap states: wind-up, a long airborne beat and a
  // planted landing. The actual air height is driven by the arena, not the clip.
  leap: { duration: 1.02 },
  clawFlurry: { duration: 0.42, trail: "#a8cfff", trailArc: 1.6 },
  unarmedStrike: { duration: 0.32, trail: "#f0e2c8", trailArc: 0.9 },
  chestKick: { duration: 0.7 },
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

/** Per-class empty-hand idle pose. The arms use the same azimuth/elevation
 *  space as the strike clips, while the wrist owns the palm roll. These are
 *  deliberately asymmetric: a class reads from the silhouette, not just gear. */
interface IdleArmPose {
  /** Upper-arm azimuth: 0 points forward, 90 points out to the side. */
  out: number;
  /** Extra forward drift of the upper arm, degrees. */
  forward: number;
  /** Upper-arm elevation above the horizon, degrees. */
  elevation: number;
  /** Elbow flexion, degrees. */
  elbow: number;
  /** Wrist bend relative to the forearm, degrees. */
  wristFlex: number;
  /** Palm roll toward the thigh, degrees. */
  wristRoll: number;
}

interface IdlePose {
  /** Right hand, which normally carries the weapon. */
  lead: IdleArmPose;
  /** Left hand, kept free for shields, off-hand weapons and gestures. */
  off: IdleArmPose;
  chestYaw: number;
  chestPitch: number;
  pelvisYaw: number;
  headYaw: number;
  legSpread: number;
  /** Vertical settle as a fraction of body height (negative drops the body). */
  crouch: number;
}

const CLASS_IDLE: Record<string, IdlePose> = {
  amazon: {
    // A planted spear stance: the weapon hand hangs close to the shaft, the free
    // hand rests by the hip, and the feet sit a little wider than a walk.
    lead: { out: 58, forward: 0, elevation: -72, elbow: 20, wristFlex: 6, wristRoll: 152 },
    off: { out: 47, forward: 9, elevation: -64, elbow: 38, wristFlex: 10, wristRoll: 158 },
    chestYaw: 4, chestPitch: -1, pelvisYaw: -3, headYaw: -4, legSpread: 6.5, crouch: -0.005,
  },
  assassin: {
    // Both hands rest by the hips: a raised, open palm reads as a gesture, not
    // an idle, and leaves the wrists looking stiff.
    lead: { out: 48, forward: 6, elevation: -70, elbow: 22, wristFlex: 12, wristRoll: 70 },
    off: { out: 44, forward: 8, elevation: -70, elbow: 19, wristFlex: 14, wristRoll: 74 },
    chestYaw: -5, chestPitch: 2, pelvisYaw: 3, headYaw: 3, legSpread: 2.5, crouch: -0.012,
  },
  barbarian: {
    lead: { out: 66, forward: 0, elevation: -64, elbow: 26, wristFlex: 12, wristRoll: 62 },
    off: { out: 66, forward: 3, elevation: -62, elbow: 32, wristFlex: 14, wristRoll: 68 },
    chestYaw: 0, chestPitch: -3, pelvisYaw: 0, headYaw: 0, legSpread: 6, crouch: 0,
  },
  druid: {
    lead: { out: 52, forward: 2, elevation: -71, elbow: 20, wristFlex: 6, wristRoll: 64 },
    off: { out: 46, forward: 7, elevation: -70, elbow: 19, wristFlex: 8, wristRoll: 70 },
    chestYaw: 4, chestPitch: 0, pelvisYaw: -2, headYaw: 4, legSpread: 3.5, crouch: -0.004,
  },
  necromancer: {
    // The hunched, hands-up-at-the-belly cast stance read as frozen. Both arms
    // drop so the hands sit just below the belt, with the lead hand a little
    // forward and the off hand at the hip.
    lead: { out: 42, forward: 12, elevation: -66, elbow: 24, wristFlex: 18, wristRoll: 68 },
    off: { out: 44, forward: 14, elevation: -68, elbow: 22, wristFlex: 20, wristRoll: 74 },
    chestYaw: -7, chestPitch: 4, pelvisYaw: 3, headYaw: -5, legSpread: 2, crouch: -0.008,
  },
  paladin: {
    lead: { out: 56, forward: 0, elevation: -73, elbow: 15, wristFlex: 4, wristRoll: 62 },
    off: { out: 48, forward: 6, elevation: -70, elbow: 18, wristFlex: 6, wristRoll: 68 },
    chestYaw: 3, chestPitch: -2, pelvisYaw: -2, headYaw: 1, legSpread: 3.5, crouch: 0,
  },
  sorceress: {
    lead: { out: 56, forward: 4, elevation: -70, elbow: 20, wristFlex: 8, wristRoll: 66 },
    off: { out: 52, forward: 15, elevation: -54, elbow: 58, wristFlex: 16, wristRoll: 74 },
    chestYaw: -4, chestPitch: -1, pelvisYaw: 2, headYaw: -3, legSpread: 2.5, crouch: -0.002,
  },
};

function idleForClass(classId: string): IdlePose {
  return CLASS_IDLE[classId] ?? CLASS_IDLE["paladin"];
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
  /** Hands only: bind direction from the wrist toward the finger roots. */
  fingerDir?: THREE.Vector3;
  /** Hands only: twist between the hand's and the forearm's bind frames, radians.
   *  Several rigs are bound with the palm turned a quarter turn off the arm. */
  palmTwist?: number;
  /** Hands only: bind-space palm normal, pointing out of the palm. */
  palmNormal?: THREE.Vector3;
  /** Hands only: bind-space fist tunnel, from the little finger toward the
   *  thumb. A held weapon's shaft runs along this axis. */
  gripAxis?: THREE.Vector3;
  /** Hands only: wrist-to-knuckle distance in bind units. */
  handLength?: number;
  /** World units per unit of this bone's local space. Gear mounted on the bone
   *  is sized and placed through this, because the rips bake wild scales into
   *  the joints (one hand can carry 6000x, another 2600x). */
  worldScale?: THREE.Vector3;
  /** Hands only: the bind pose has the fingers fanned open and needs relaxing. */
  splayedFingers?: boolean;
}

/**
 * A stock weapon that ships inside the class model and is skinned rigidly to a
 * single hand-attachment bone. Those meshes are authored pointing forward from
 * the T-pose, so once the arm is brought down to the side they end up carried
 * like a horizontal lance through the hip. The rig re-aims the mount so the
 * weapon stands up with the hero instead.
 */
export interface StockWeaponMount {
  bone: THREE.Bone;
  /** The stock weapon mesh itself. Equipping a real weapon hides it. */
  mesh: THREE.Object3D;
  /** Long axis of the weapon in model bind space, pointing at the weapon's head. */
  axis: THREE.Vector3;
  /** Direction that axis should point in while posed. */
  target: THREE.Vector3;
}

/** Bones that are carried rigidly by a solved joint (fingers, pads, hair...). */
interface RigSatellite {
  bone: THREE.Bone;
  bindPos: THREE.Vector3;
  bindQuat: THREE.Quaternion;
  follow: RigJoint;
  /** Extra bend about the bone's own hinge, for fanned bind-pose fingers. */
  curl?: number;
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
  /** Stock weapon held in the hand, if the model ships one. */
  weaponMount?: StockWeaponMount;
  /** Model-space scale that maps bind units to world units. */
  unitScale: number;
  /** Character height in scene units, used to size held gear to the body. */
  worldHeight?: number;
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
  /** True when the hero has no visible weapon and should use a relaxed idle stance. */
  weaponless?: boolean;
  /** True when a shield or off-hand weapon occupies the left hand. */
  offhandHeld?: boolean;
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
  leap: [
    key(0, arm(24, -48, 52), arm(20, -50, 64), { chestYaw: -4, pelvisYaw: -2 }),
    key(0.14, arm(38, -36, 88), arm(34, -38, 94), { chestPitch: 12, spinePitch: 7, crouch: -0.11, frontLeg: 24, backLeg: -20, frontKnee: 46, backKnee: 34, headPitch: 8 }),
    key(0.24, arm(18, 34, 20), arm(12, 26, 36), { chestPitch: 16, spinePitch: 8, crouch: 0.02, frontLeg: -8, backLeg: 8, frontKnee: 6, backKnee: 4, headPitch: -4 }),
    key(0.42, arm(42, 22, 30), arm(36, 16, 46), { chestPitch: 4, crouch: -0.03, frontLeg: 48, backLeg: -34, frontKnee: 74, backKnee: 48, headPitch: 4 }),
    key(0.62, arm(50, 18, 26), arm(44, 12, 40), { chestPitch: -4, crouch: -0.01, frontLeg: 36, backLeg: -28, frontKnee: 58, backKnee: 40 }),
    key(0.78, arm(30, -28, 42), arm(26, -34, 58), { chestPitch: 12, crouch: -0.08, frontLeg: 26, backLeg: -20, frontKnee: 52, backKnee: 36, headPitch: 10 }),
    key(0.9, arm(20, -44, 54), arm(18, -46, 68), { chestPitch: 4, crouch: -0.03, frontLeg: 14, backLeg: -10, frontKnee: 28, backKnee: 18 }),
    key(1, arm(24, -48, 52), arm(20, -50, 64), {}),
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
  chestKick: [
    key(0, arm(16, -46, 54), arm(12, -52, 48), { chestYaw: -2 }),
    key(0.18, arm(30, -20, 68), arm(8, -48, 54), { chestYaw: -12, chestPitch: 8, crouch: -0.02, frontLeg: -12, backLeg: 6, frontKnee: 12, backKnee: 10 }),
    key(0.42, arm(-18, -12, 28), arm(26, -22, 60), { chestYaw: 16, chestPitch: -12, crouch: 0.04, lunge: 0.08, frontLeg: 72, backLeg: -10, frontKnee: 22, backKnee: 14, headPitch: -6 }),
    key(0.6, arm(-8, -28, 40), arm(20, -32, 54), { chestYaw: 10, chestPitch: -4, crouch: 0.01, lunge: 0.03, frontLeg: 34, backLeg: -6, frontKnee: 20 }),
    key(0.82, arm(10, -44, 50), arm(12, -48, 50), { chestYaw: 2 }),
    key(1, arm(16, -46, 54), arm(12, -52, 48), {}),
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

/**
 * Empty hands hang clear of the torso, with the class's own shoulder, elbow and
 * wrist placement. The wrist roll is what keeps the authored T-pose palm from
 * facing forward with every finger spread at the camera.
 */
function idleArmTarget(side: -1 | 1, pose: IdleArmPose): THREE.Vector3 {
  const target = armTarget(side, pose.out, pose.elevation);
  target.z += pose.forward * DEG;
  return target.normalize();
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

/**
 * Rotation whose local +Y and +Z axes land on the two given directions. Used
 * to move a bind-pose hand frame (fingers, palm) onto a posed frame without
 * guessing Euler angles per class.
 */
function frameQuaternion(yAxis: THREE.Vector3, zAxis: THREE.Vector3): THREE.Quaternion {
  const y = yAxis.clone().normalize();
  const z = zAxis.clone().addScaledVector(y, -zAxis.dot(y));
  if (z.lengthSq() < 1e-10) z.set(0, 0, 1).addScaledVector(y, -y.z);
  if (z.lengthSq() < 1e-10) z.set(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * Twist between the hand's bind frame and the forearm's, around the knuckle
 * axis. A T-pose wrist usually lines up with its forearm, but several rips are
 * bound with the hand turned a quarter turn, which leaves the palm facing the
 * camera once the arm is brought down to the side.
 */
function bindPalmTwist(hand: RigJoint, forearm: RigJoint): number {
  if (!hand.fingerDir) return 0;
  const axis = hand.fingerDir.clone().normalize();
  const handUp = new THREE.Vector3(0, 1, 0).applyQuaternion(hand.bindQuat).projectOnPlane(axis);
  const armUp = new THREE.Vector3(0, 1, 0).applyQuaternion(forearm.bindQuat).projectOnPlane(axis);
  if (handUp.lengthSq() < 1e-8 || armUp.lengthSq() < 1e-8) return 0;
  handUp.normalize();
  armUp.normalize();
  const cross = new THREE.Vector3().crossVectors(handUp, armUp);
  const dot = Math.min(1, Math.max(-1, handUp.dot(armUp)));
  return Math.atan2(cross.dot(axis), dot);
}

/** Bend for one finger segment at rest, by chain position. */
const FINGER_CURL: Record<string, number> = {
  a: 0.32, b: 0.48, c: 0.4,
  "1": 0.30, "2": 0.46, "3": 0.38, "4": 0.24,
};

function fingerCurl(joint: RigJoint, name: string): number {
  if (!joint.splayedFingers) return 0;
  const fanned = /(?:^|_)(finger|thumb)_[a-d]_([abc])$/.exec(name);
  const chained = /(?:^|_)(?:finger|thumb)_0?([1-4])_/.exec(name);
  // Assassin digit chains read `hand_<digit>_01_R_JNT`.
  const assassin = /(?:^|_)hand_(?:index|middle|ring|pinky|thumb)_0?([1-3])_/i.exec(name);
  const segment = fanned ? fanned[2] : chained?.[1] ?? assassin?.[1];
  if (!segment) return 0;
  const amount = FINGER_CURL[segment] ?? 0;
  const bend = /thumb|tmb/.test(name) ? amount * 0.4 : amount;
  // The two naming families bind their finger hinges on opposite axes.
  return fanned ? bend : -bend;
}

/**
 * Find the model's own held weapon, if it has one. Only meshes bound almost
 * entirely to a hand-attachment bone count: armour, hair and limbs share their
 * weights across the skeleton, while a stock weapon is rigid on its mount.
 */
function findStockWeaponMount(model: THREE.Group): StockWeaponMount | undefined {
  model.updateWorldMatrix(true, true);
  const modelInverse = model.matrixWorld.clone().invert();
  const mountNames = new Set(["r_weapon_attach", "l_weapon_attach", "two_hand_weapon_attach"]);
  let mount: StockWeaponMount | undefined;
  model.traverse((object) => {
    if (mount) return;
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.visible || !mesh.skeleton?.bones.length) return;
    const geometry = mesh.geometry;
    const skinIndex = geometry.attributes["skinIndex"] as THREE.BufferAttribute | undefined;
    const skinWeight = geometry.attributes["skinWeight"] as THREE.BufferAttribute | undefined;
    if (!skinIndex || !skinWeight) return;
    const totals = new Map<THREE.Bone, number>();
    let total = 0;
    for (let i = 0; i < skinIndex.count; i++) {
      for (let channel = 0; channel < 4; channel++) {
        const weight = skinWeight.getComponent(i, channel);
        if (!weight) continue;
        const bone = mesh.skeleton.bones[skinIndex.getComponent(i, channel)];
        if (!bone) continue;
        totals.set(bone, (totals.get(bone) ?? 0) + weight);
        total += weight;
      }
    }
    if (total <= 0) return;
    const [bone, weighted] = [...totals.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    if (weighted / total < 0.85 || !mountNames.has(bone.name.toLowerCase())) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const axis = new THREE.Vector3();
    if (size.x >= size.y && size.x >= size.z) axis.set(1, 0, 0);
    else if (size.y >= size.z) axis.set(0, 1, 0);
    else axis.set(0, 0, 1);
    const toModel = new THREE.Matrix4().copy(modelInverse).multiply(mesh.matrixWorld);
    const rotation = new THREE.Quaternion();
    toModel.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
    axis.applyQuaternion(rotation).normalize();
    // Weapon meshes are authored pointing forward, so keep the head at that end.
    if (axis.z < 0) axis.negate();
    mount = { bone, mesh, axis: axis.clone(), target: new THREE.Vector3(0, 1, 0.22).normalize() };
  });
  return mount;
}

/** Gear the component mounted on a bone: equipped weapon, off-hand blade or shield. */
interface HeldItem {
  visual: THREE.Object3D;
  anchor: RigJoint;
  kind: "weapon" | "offhand" | "shield";
  /** Height of the item's cel in its own units, used to size it to the body. */
  celHeight: number;
  /** Base and magic name, used to pick the weapon family's length. */
  name: string;
  /** Roll about the cel's normal that stands its own art upright, radians. */
  celAxis?: number;
  /** Helper nodes between the anchor bone and the visual (shield_attach, attach
   *  bones). Several of them move every frame, so the transform is read fresh. */
  chainNodes?: THREE.Object3D[];
}

/**
 * Weapons carried in the body frame at rest instead of following the fist:
 * bows, crossbows and staves. A fist-following frame tipped them by whatever
 * angle the relaxed wrist happened to sit at.
 */
function isCarriedUpright(name: string): boolean {
  return /staff|bow|crossbow/i.test(name);
}

/** A bow is held by a riser that crosses the fist rather than running along it. */
function isBowCel(name: string): boolean {
  return /bow|bow/i.test(name) && !/crossbow/i.test(name);
}

/** Cel-roll straightening for thrown weapons, which stay in the fist's tunnel. */
function isThrownWeapon(name: string): boolean {
  return /javelin/i.test(name);
}

/**
 * Where a javelin bundle sits in the fist, in hand lengths. A bundle is a flat
 * cel and the fist is real geometry, so the cel has to ride the palm side and
 * just in front of the fingers: hung on the knuckle side it slid behind the
 * gauntlet and read as a pack leaning beside the hand instead of being carried.
 */
const JAVELIN_FIST_PUSH = 0.15;
const JAVELIN_PALM_OFFSET = 0.6;
const JAVELIN_FRONT_OFFSET = 2.1;

/** Roll that stands a carried cel's own art upright, in the cel's plane. */
function carriedCelRoll(item: HeldItem): number {
  if (!item.celAxis) return 0;
  // A crossbow's long axis is its stock, which is carried flat, not on end.
  return /crossbow/i.test(item.name) ? item.celAxis + Math.PI / 2 : item.celAxis;
}

/** Share of the hero's height one held cel should cover. Cels include padding. */
export function heldItemShare(item: HeldItem): number {
  // Item names arrive capitalised ("Short Staff"), so every family test here
  // has to ignore case or the whole table collapses to the sword default.
  const name = item.name.toLowerCase();
  // A cel is an inventory icon: its frame is the item's whole silhouette, so
  // these shares are the item's real length against the body. Flat shares made
  // every shield chest-to-hip while one-handed blades ran from knee to past
  // the head, which read as the gear being scaled at random.
  if (item.kind === "shield") {
    if (/buckler|small|round/.test(name)) return 0.26;
    if (/tower|large|pavise/.test(name)) return 0.46;
    // Kite, gothic, heraldic and the paladin shields cover shoulder to hip.
    return 0.4;
  }
  // An off-hand blade is the second half of a dual wield: it reads from the same
  // family table as a main-hand weapon, a little smaller so the pair does not
  // look like two full-sized weapons.
  const offhandScale = item.kind === "offhand" ? 0.85 : 1;
  // A short bow is a good third shorter than a long bow. One share for the whole
  // family made the two identical on the hero, and both of them oversized.
  if (/short bow/i.test(item.name)) return 0.52 * offhandScale;
  // The crossbow cel is a wide, low stock: at a long bow's share it covered the
  // whole portrait.
  if (/crossbow/i.test(item.name)) return 0.5 * offhandScale;
  if (/bow/i.test(item.name)) return 0.72 * offhandScale;
  // A staff is carried upright beside the hero, so it stops short of the bows;
  // polearms still hang on their full length.
  if (/staff/i.test(item.name)) return 0.78 * offhandScale;
  if (/polearm|spear|pike/i.test(item.name)) return 0.85 * offhandScale;
  // A bundle of shafts reads oversized beside the fist, so it sits a little
  // smaller than a polearm's share.
  if (/javelin/i.test(item.name)) return 0.32 * offhandScale;
  if (/dagger|kris/i.test(item.name)) return 0.17 * offhandScale;
  // A hand axe is a one-handed hatchet, not a battle axe; it matches the axe
  // test below, so it has to be named first. 0.3 keeps the haft a hand's length
  // shorter than the battle axe's 0.4: at 0.4 its head clears the shoulder and
  // the hatchet reads as a second two-hander beside the real one.
  if (/hand ?axe|hatchet/i.test(item.name)) return 0.3 * offhandScale;
  if (/wand/i.test(item.name)) return 0.3 * offhandScale;
  if (/orb/i.test(item.name)) return 0.24 * offhandScale;
  if (/axe|mace|hammer|club|scepter/i.test(item.name)) return 0.4 * offhandScale;
  return 0.42 * offhandScale;
}

function collectHeldItems(rig: CharacterRig): HeldItem[] {
  const items: HeldItem[] = [];
  const byBone = new Map<THREE.Object3D, RigJoint>();
  for (const joint of rig.joints) byBone.set(joint.bone, joint);
  const bySatellite = new Map<THREE.Object3D, RigJoint>();
  for (const satellite of rig.satellites) bySatellite.set(satellite.bone, satellite.follow);
  let root: THREE.Object3D | null = rig.joints[0]?.bone ?? rig.pelvis?.bone ?? null;
  // Stop at this rig's own model. Climbing to the scene would sweep up the gear
  // of every other hero posed in the same scene (the hero archive line-up) and
  // re-parent it onto this one's hands.
  while (root?.parent && !(root.parent as THREE.Scene).isScene) root = root.parent;
  if (!root) return items;
  // Collect before touching the hierarchy: moving a cel onto its bone inside
  // the traversal would let three.js visit the moved subtree a second time.
  const mounted: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.userData?.["d2sHeldItem"]) mounted.push(child);
  });
  for (const child of mounted) {
    const held = child.userData["d2sHeldItem"] as { kind?: string; celHeight?: number; name?: string; celAxis?: number };
    if (!held) continue;
    // Gear may hang off a helper node under the bone chain, so climb to the
    // nearest joint and remember the static transform in between.
    const chainParts: THREE.Object3D[] = [];
    let node = child.parent;
    while (node && !byBone.has(node) && !bySatellite.has(node)) {
      chainParts.unshift(node);
      node = node.parent;
    }
    let anchor = node ? byBone.get(node) : undefined;
    if (!anchor && node) {
      // `R_weapon_attach` and `shield_attach` are pulled out of the skeleton
      // onto the pose root and driven from their bone, so the cel no longer has
      // a joint above it. Hang it on that bone instead; otherwise it keeps its
      // build-time mount and floats beside the fist while the arm animates.
      anchor = bySatellite.get(node);
      if (anchor) {
        // The mount hangs off the lower arm; a blade belongs in the fist, and a
        // shield keeps that anchor but is re-centred on the fist when placed.
        if (held.kind !== "shield") anchor = rig.hands.find((hand) => hand.side === anchor!.side) ?? anchor;
        anchor.bone.add(child);
        chainParts.length = 0;
      }
    }
    if (!anchor) {
      // Some rips hang the shield off a plain group instead of a bone, so the
      // climb finds no joint and the cel is left on its build-time mount beside
      // the body. Strap those onto the off forearm, where a shield belongs.
      const fallback = held.kind === "shield"
        ? rig.forearms.find((entry) => entry.side === 1) ?? rig.hands.find((entry) => entry.side === 1)
        : rig.hands.find((entry) => entry.side === -1);
      if (fallback) {
        anchor = fallback;
        fallback.bone.add(child);
        chainParts.length = 0;
      }
    }
    if (!anchor) continue;
    items.push({
      visual: child,
      anchor,
      kind: held.kind === "shield" ? "shield" : held.kind === "offhand" ? "offhand" : "weapon",
      celHeight: typeof held.celHeight === "number" ? held.celHeight : 0,
      name: held.name ?? "",
      celAxis: typeof held.celAxis === "number" ? held.celAxis : undefined,
      chainNodes: chainParts.length ? chainParts : undefined,
    });
  }
  return items;
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
  const weaponMount = findStockWeaponMount(model);
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
  // The T-pose hand bone points down its local axis rather than along the
  // fingers, so aiming the bone at the forearm leaves the fingers splayed
  // sideways. Record the actual wrist-to-knuckle direction for empty hands.
  for (const hand of hands) {
    // Finger roots are authored as `*_finger_01_*` on Paladin/Amazon/Druid rigs,
    // as `*_finger_A_A` on Barbarian/Sorceress/Necromancer rigs and as
    // `hand_<digit>_01_R_JNT` on the Assassin. Match the first bone of any of
    // those chains, otherwise the free hand has no knuckle direction and gets
    // aimed by an arbitrary wrist axis.
    const fingerRoots = [...records.values()].filter((record) => record.side === hand.side
      && (/(?:^|_)finger_0?1(?:_|$)/.test(record.name)
        || /(?:^|_)(?:finger_[a-d]|thumb)_a$/.test(record.name)
        || /(?:^|_)hand_(?:index|middle|ring|pinky|thumb)_0?1(?:_|$)/i.test(record.name)));
    if (fingerRoots.length) {
      // The A/B/C rigs ship the fingers fanned wide in their bind pose, so they
      // need a light curl at rest; the older bind poses already have closed hands.
      hand.splayedFingers = fingerRoots.some((record) => /(?:^|_)finger_[a-d]_a$/.test(record.name))
        || (["amazon", "druid"].includes(classId) && fingerRoots.some((record) => /_finger_0?1(?:_|$)/.test(record.name)))
        // The Assassin binds every digit fanned straight out, like the A/B/C rigs.
        || fingerRoots.some((record) => /(?:^|_)hand_(?:index|middle|ring|pinky|thumb)_0?1(?:_|$)/i.test(record.name));
      const rootCenter = new THREE.Vector3();
      for (const root of fingerRoots) rootCenter.add(root.bindPos);
      rootCenter.divideScalar(fingerRoots.length);
      // A few rips place the wrist bone right on the knuckles, which leaves no
      // usable direction; those hands keep the fallback wrist alignment.
      if (hand.bindPos.distanceTo(rootCenter) >= bindHeight * 0.004) {
        hand.fingerDir = directionBetween(hand.bindPos, rootCenter);
      }
      // The knuckle line and the palm normal turn the hand into a real grip
      // frame: a held weapon's shaft runs along the first, the free palm faces
      // along the second. Both come from the finger roots, so every rig gets
      // its own axes instead of a hand-tuned wrist roll.
      const fingers = fingerRoots.filter((record) => !/thumb/.test(record.name));
      if (fingers.length >= 2 && hand.fingerDir) {
        const digit = (record: BoneRecord): number => {
          const numbered = /finger_0?([1-4])(?:_|$)/.exec(record.name);
          if (numbered) return Number(numbered[1]);
          const letter = /finger_([a-d])(?:_|$)/.exec(record.name);
          if (letter) return "abcd".indexOf(letter[1]) + 1;
          // Assassin digits are spelled out, thumb last so it sorts off the end.
          const named = /(?:^|_)hand_(index|middle|ring|pinky|thumb)_0?\d/i.exec(record.name);
          if (named) return ({"index": 1, "middle": 2, "ring": 3, "pinky": 4, "thumb": 5} as Record<string, number>)[named[1].toLowerCase()] ?? 99;
          return 99;
        };
        const ordered = [...fingers].sort((a, b) => digit(a) - digit(b));
        const across = ordered[ordered.length - 1].bindPos.clone().sub(ordered[0].bindPos);
        if (across.lengthSq() > 1e-10) {
          across.normalize();
          const normal = new THREE.Vector3().crossVectors(hand.fingerDir, across).normalize();
          // These rips bind in a T-pose with the palms facing the floor, which
          // fixes the handedness of the derived frame on both arms.
          if (normal.y > 0) {
            across.negate();
            normal.negate();
          }
          hand.palmNormal = normal;
          hand.gripAxis = across.clone().negate();
          hand.handLength = hand.bindPos.distanceTo(rootCenter);
        }
      }
    }
    const forearm = forearms.find((entry) => entry.side === hand.side);
    if (forearm) hand.palmTwist = bindPalmTwist(hand, forearm);
  }
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
    const curl = fingerCurl(best, record.name);
    satellites.push({ bone: record.bone, bindPos: record.bindPos.clone(), bindQuat: record.bindQuat.clone(), follow: best, curl: curl || undefined });
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
    weaponMount,
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

  const worldHeight = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  rig.worldHeight = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : undefined;
  for (const joint of joints) {
    joint.worldScale = joint.bone.getWorldScale(new THREE.Vector3());
  }

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
  // A second, slower cycle rides under the weight shift so the hips, the chest
  // and the head never land on the same beat. That off-beat drift is what makes
  // a planted hero read as alive instead of as a looping sway.
  const idleDrift = Math.sin(idlePhase * 0.61 + 0.9) * idle;
  const stance = stanceForClass(rig.classId);
  const idlePose = idleForClass(rig.classId);
  const weaponless = state.weaponless === true;
  const offhandHeld = state.offhandHeld === true;
  // Gear mounted on a bone by the component, solved into the posed hand below.
  const heldItems = collectHeldItems(rig);
  const heldWeapon = heldItems.find((item) => item.kind !== "shield");
  const weaponHand = heldWeapon
    ? rig.hands.find((hand) => hand.side === heldWeapon.anchor.side) ?? heldWeapon.anchor
    : undefined;

  const attackActive = !!state.attackStyle && state.attackTime < ATTACK_CLIP_INFO[state.attackStyle].duration;
  const clip = state.attackStyle ? ATTACK_CLIPS[state.attackStyle] : undefined;
  const rawProgress = state.attackStyle
    ? Math.max(0, Math.min(1, state.attackTime / ATTACK_CLIP_INFO[state.attackStyle].duration))
    : 0;
  const sampled = clip && attackActive ? sampleClip(clip, rawProgress) : undefined;
  // The leap is a full-body move, so it holds its pose through the airborne beat
  // instead of fading the arms and legs out halfway like a weapon swing.
  const strike = sampled
    ? state.attackStyle === "leap"
      ? Math.min(1, Math.sin(Math.PI * rawProgress) * 2.4)
      : Math.sin(Math.PI * Math.min(1, rawProgress * 1.15))
    : 0;

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

  // Equipped forearms keep the authored grip basis so weapons stay aligned.
  // Empty hands instead need the bind offset itself aimed along the relaxed
  // forearm, otherwise the wrist keeps the T-pose sideways offset.
  const setWorldDirectionFromBind = (joint: RigJoint | undefined, bindDirection: THREE.Vector3, direction: THREE.Vector3, twist = 0): void => {
    if (!joint) return;
    const align = new THREE.Quaternion().setFromUnitVectors(bindDirection, direction);
    if (twist) align.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, twist));
    const rotation = align.multiply(joint.bindQuat.clone());
    orientations.set(joint, rotation);
    deltas.set(joint, rotation.clone().multiply(joint.bindQuat.clone().invert()));
  };

  // Place a hand from its own bind grip frame: `axis` is the bind direction a
  // held weapon runs along (or the fingers, for an empty hand), `up` is where
  // that direction should point now and `palm` is where the palm should face.
  const setHandFrame = (joint: RigJoint, axis: THREE.Vector3, up: THREE.Vector3, palm: THREE.Vector3): void => {
    const bindFrame = frameQuaternion(axis, joint.palmNormal ?? palm);
    const worldFrame = frameQuaternion(up, palm);
    const rotation = worldFrame.multiply(bindFrame.invert()).multiply(joint.bindQuat.clone());
    orientations.set(joint, rotation);
    deltas.set(joint, rotation.clone().multiply(joint.bindQuat.clone().invert()));
  };

  const eulerOf = (pitchDeg: number, yawDeg: number, rollDeg: number): THREE.Euler =>
    new THREE.Euler(pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG, "YXZ");

  // ---- torso -------------------------------------------------------------
  // Heavier builds shift more weight than light ones: the same idle on a
  // barbarian and a sorceress should not travel the same number of degrees.
  const idleRoll = 2.1 + gait.pelvisRoll * 0.18;
  const pelvisRoll = gait.pelvisRoll * Math.sin(phase) * walk + idleSway * idleRoll + idleDrift * 0.9;
  const pelvisYaw = gait.pelvisYaw * Math.sin(phase) * walk + idlePose.pelvisYaw * idle + (sampled ? sampled.body.pelvisYaw : 0);
  const pelvisPitch = gait.hunch + (sampled ? sampled.body.pelvisPitch : 0);
  setWorldRotation(rig.pelvis, eulerOf(pelvisPitch, pelvisYaw, pelvisRoll));
  setWorldRotation(rig.spine, eulerOf(
    -(gait.lean * walk) - gait.hunch * 0.45 + Math.sin(phase * 2) * 0.35 * walk
      + breathe * 0.55 + (sampled ? sampled.body.spinePitch : 0),
    -gait.pelvisYaw * 0.35 * Math.sin(phase) * walk + (sampled ? sampled.body.spineYaw : 0),
    gait.sway * Math.sin(phase) * walk + idleSway * 3 + (sampled ? sampled.body.spineRoll : 0),
  ));
  setWorldRotation(rig.chest, eulerOf(
    breathe * 1.9 - idleSway * 1.1 + idlePose.chestPitch * idle + (sampled ? sampled.body.chestPitch : 0),
    gait.chestTwist * 0.55 * Math.sin(phase) * walk + idlePose.chestYaw * idle + (sampled ? sampled.body.chestYaw : 0),
    gait.sway * 0.45 * Math.sin(phase) * walk + idleSway * 2.4 + (sampled ? sampled.body.chestRoll : 0),
  ));
  const headYaw = -gait.headYaw * Math.sin(phase) * walk - gait.chestTwist * 0.4 * Math.sin(phase) * walk + breathe * 0.4
    + Math.sin(idlePhase * 0.45) * 3.2 * idle + idlePose.headYaw * idle - idlePose.chestYaw * 0.35 * idle;
  const headPitch = -gait.headBob * Math.sin(phase * 2) * walk + (sampled ? sampled.body.headPitch : 0)
    + Math.sin(idlePhase * 0.7 + 0.5) * 1.5 * idle + breathe * 0.5;
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
    // Alternate the two shoulders through the idle cycle. The previous drift
    // was under three degrees and disappeared against the armour; this swing
    // is large enough to read at rest without looking like a march.
    const idleArmPhase = idlePhase + (armBone.side < 0 ? Math.PI : 0);
    const idleArmWave = Math.sin(idleArmPhase) * idle;
    const walkSwing = Math.sin(-sidePhase) * gait.armSwing * walk
      + idleArmWave * Math.min(6.5, gait.armSwing * 0.45);
    // The stance arm swings along the sagittal plane, so the shoulder travels
    // forward and back instead of the elbow merely rising. A second rotation
    // around the forward axis opens and closes the arm against the ribs.
    const idleAbduction = idleArmWave * (weaponless ? 5.5 : 4.2);
    // Weapon-carrying classes still need breathing room at rest. Raise and
    // open the upper arms while idling, but leave the walking stance untouched.
    const armedIdleOut = idle * (stance.out < 20 ? 10 : 5);
    const idleArm = armBone.side < 0 ? idlePose.lead : idlePose.off;
    const stanceDir = weaponless
      ? idleArmTarget(armBone.side, idleArm)
      : armTarget(armBone.side, stance.out + armedIdleOut, stance.elevation + idle * 5);
    const swing = new THREE.Quaternion().setFromAxisAngle(lateralAxis, -walkSwing * DEG);
    let dir = stanceDir.applyQuaternion(swing);
    dir.applyAxisAngle(new THREE.Vector3(0, 0, armBone.side), idleAbduction * DEG);
    // The shoulders lift on the inhale, so the hanging arms open a hair with
    // the chest instead of orbiting their own sine only.
    dir.applyAxisAngle(new THREE.Vector3(0, 0, armBone.side), breathe * 1.2 * idle * DEG);
    let elbow = weaponless
      ? idleArm.elbow + gait.elbow * walk * 0.35 + idleArmWave * 4.5
      : stance.elbow + gait.elbow * walk + idleArmWave * 3.8;
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
      if (weaponless) {
        const hand = rig.hands.find((entry) => entry.side === forearm.side);
        const bindDir = hand ? directionBetween(forearm.bindPos, hand.bindPos) : forearm.restDir;
        setWorldDirectionFromBind(forearm, bindDir, forearmDir);
      } else {
        setWorldDirection(forearm, forearmDir);
      }
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
  // A hand wrapped around the model's own stock weapon gets the same treatment:
  // that weapon is aimed by the rig, so its grip does not depend on the wrist.
  // Equipping a real weapon swaps the stock mesh out at runtime, so re-check it
  // every frame instead of trusting the mount recorded when the rig was built.
  const stockWeaponJoint = rig.weaponMount?.mesh.visible
    ? rig.satellites.find((satellite) => satellite.bone === rig.weaponMount!.bone)?.follow
    : undefined;
  // The stock weapon usually hangs off the forearm, so pick the hand on that side.
  const stockWeaponHand = stockWeaponJoint
    ? rig.hands.find((hand) => hand === stockWeaponJoint)
      ?? rig.hands.find((hand) => hand.side === stockWeaponJoint.side)
    : undefined;
  // A shield fist is turned by the cel it carries, so it needs the body's own
  // front rather than a wrist-roll guess.
  const shieldHandSide = heldItems.find((item) => item.kind === "shield")?.anchor.side;
  const shieldFront = (() => {
    let node: THREE.Object3D | null = rig.hands[0]?.bone ?? null;
    while (node?.parent) node = node.parent;
    return node
      ? FORWARD.clone().applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()))
      : FORWARD.clone();
  })();
  for (const hand of rig.hands) {
    const forearmDir = forearmDirs.get(hand.side);
    if (!forearmDir) continue;
    const idleArmPhase = idlePhase + (hand.side < 0 ? Math.PI : 0);
    const idleWrist = Math.sin(idleArmPhase) * idle * 3.5;
    const idleArm = hand.side < 0 ? idlePose.lead : idlePose.off;
    // The weapon hand keeps its authored grip. A free left hand gets the class
    // wrist pose even while the right hand carries a stock weapon.
    const freeHand = hand.side > 0 ? !offhandHeld : weaponless;
    const naturalHand = freeHand || stockWeaponHand === hand;
    const wristFlex = naturalHand ? idleArm.wristFlex : 15;
    const wristRoll = naturalHand ? idleArm.wristRoll : 14;
    const handDir = flex(forearmDir, wristFlex + idleWrist);
    const palmTarget = new THREE.Vector3(-hand.side, 0, 0);
    if (weaponHand === hand && hand.gripAxis && hand.palmNormal) {
      // A held weapon runs down the fist tunnel, so the knuckles face the blade.
      // Aim that tunnel up the arm (the way a sword is carried at rest) and turn
      // the palm at the body; the mounted cel is placed in this same frame, so
      // it stays inside the grip through every swing.
      const blade = forearmDir.clone().negate();
      blade.z += 0.3;
      blade.y += 0.05;
      blade.normalize();
      setHandFrame(hand, hand.gripAxis, blade, palmTarget);
    } else if (hand.side === shieldHandSide && hand.fingerDir && hand.palmNormal) {
      // A shield is gripped from behind: fingers run down the arm with the palm
      // turned in to the body, so the knuckles face the cel and the fingertips
      // curl away from it instead of out through the face.
      setHandFrame(hand, hand.fingerDir, handDir, shieldFront.clone().negate());
    } else if (naturalHand && hand.fingerDir && hand.palmNormal) {
      // Fingers continue the forearm and the palm faces the thigh. Using the
      // rig's own palm normal removes the per-class wrist-roll guesses.
      setHandFrame(hand, hand.fingerDir, handDir, palmTarget);
    } else if (naturalHand && hand.fingerDir) {
      const roll = hand.side * wristRoll * DEG - (hand.palmTwist ?? 0);
      setWorldDirectionFromBind(hand, hand.fingerDir, handDir, roll);
    } else {
      setWorldDirection(hand, handDir, hand.side * wristRoll);
    }
  }

  // ---- legs --------------------------------------------------------------
  const thighDirs = new Map<-1 | 1, THREE.Vector3>();
  for (const thigh of rig.thighs) {
    const sidePhase = phase + (thigh.side < 0 ? Math.PI : 0);
    const swing = Math.sin(sidePhase) * gait.stride * walk;
    const stanceAngle = sampled
      ? (thigh.side === state.attackSide ? sampled.body.frontLeg : sampled.body.backLeg) * strike
      : 0;
    const dir = legTarget(swing + stanceAngle, 2.5 + stance.out * 0.06 + idlePose.legSpread * idle);
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
    // The leg the weight has left softens, which is what sells a hip shift.
    const idleWeight = Math.max(0, idleSway * knee.side) * 2.6 * idle;
    const thighDir = thighDirs.get(knee.side) ?? legTarget(0);
    setWorldDirection(knee, flex(thighDir, -(locomotion + stanceBend + idleWeight)));
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
    + breathe * 0.005
    + idlePose.crouch * idle
    + (sampled ? sampled.body.crouch * strike : 0)
  );
  const bodyZ = height * (
    (sampled ? sampled.body.lunge * strike : 0)
    + Math.sin(phase * 2) * (gait.drive / 100) * walk * 0.25
    // Standing settles back and forth over the feet on its own slow cycle. The
    // rig has no foot IK, so translation drags the planted feet with it: keep the
    // travel under a few centimetres and let the hips do the reading.
    + Math.sin(idlePhase * 0.5 + 2.1) * 0.004 * idle
  );
  const bodyX = height * (
    Math.sin(phase) * walk * 0.012 * motion
    + idleSway * 0.014
    + idleDrift * 0.005
  );

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

  // ---- mounted gear ------------------------------------------------------
  // Equipped weapons and shields are flat cels parented to a bone. Place them
  // in the posed fist every frame: grip in the palm, shaft along the fist
  // tunnel, flat turned toward the camera, and sized from the character height
  // instead of whatever scale the bone chain happens to carry.
  const placeHeld = (item: HeldItem): void => {
    const parent = item.visual.parent;
    if (!parent) return;
    const celHeight = item.celHeight > 0 ? item.celHeight : 0.006;
    const body = rig.worldHeight ?? rig.bindHeight;
    const delta = deltas.get(item.anchor) ?? new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    if (item.kind !== "shield") {
      // Follow the fist: the hand is posed holding the blade along its grip
      // axis, so the cel has to leave the fist in that same direction.
      const hand = (item.anchor.gripAxis ? item.anchor : undefined)
        ?? rig.hands.find((candidate) => candidate.side === item.anchor.side);
      const gripDelta = hand ? deltas.get(hand) : undefined;
      const gripAxis = hand?.gripAxis ?? item.anchor.gripAxis;
      // Bows and staves are carried, not swung: they stand in the body's own
      // frame. Following the relaxed fist laid them across the hero at whatever
      // angle that wrist happened to sit, which read as a plank leaning on them.
      if (isCarriedUpright(item.name)) {
        // A carried cel stands in the body's own frame at rest, which keeps a bow
        // or staff from lying across the hero. During a strike the hand is what
        // carries it, so blend into the fist's grip axis as the swing builds;
        // pinning the body frame through the whole clip left the staff standing
        // beside the hand and the bow hovering off its riser.
        up.set(0, 1, 0);
        if (gripAxis && gripDelta) {
          let handUp = gripAxis.clone().applyQuaternion(gripDelta).normalize();
          // Only the part of the fist axis inside the cel's own plane may tilt
          // it. Aligning the whole axis turned the flat edge-on to the camera,
          // which made the bow vanish mid-draw.
          handUp.addScaledVector(FORWARD, -handUp.dot(FORWARD));
          if (handUp.lengthSq() > 1e-6) {
            if (isBowCel(item.name)) {
              // A bow's riser crosses the fist's tunnel rather than running along
              // it, so its long axis is the in-plane perpendicular of the grip.
              handUp = new THREE.Vector3().crossVectors(FORWARD, handUp).normalize();
              if (handUp.y < 0) handUp.negate();
            }
            up.lerp(handUp.normalize(), Math.min(1, strike * 1.15)).normalize();
          }
        }
      } else if (gripAxis && gripDelta) {
        up.copy(gripAxis).applyQuaternion(gripDelta).normalize();
        if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
      } else {
        const forearmDir = forearmDirs.get(item.anchor.side);
        if (forearmDir) {
          up.copy(forearmDir).negate();
          up.z += 0.3;
          up.y += 0.05;
          up.normalize();
        }
      }
    }
    const worldFrame = frameQuaternion(up, FORWARD);

    // Where the cel actually hangs from is only known once the helper nodes and
    // satellites have been written, so the flat is derived from the real parent
    // rotation (one frame old at worst) instead of guessing the chain.
    let rootObject: THREE.Object3D = parent;
    while (rootObject.parent) rootObject = rootObject.parent;
    const parentWorldQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    const rootWorldQuat = rootObject.getWorldQuaternion(new THREE.Quaternion());
    // Both are built in the rig's own space: a shield stands upright in the
    // character's frame and faces the same front its weapon cels are bound
    // against, so it turns with the body instead of the world.
    const targetWorldQuat = rootWorldQuat.multiply(worldFrame);
    item.visual.quaternion.copy(parentWorldQuat.invert().multiply(targetWorldQuat));
    const carriedRoll = carriedCelRoll(item);
    if (carriedRoll && (isCarriedUpright(item.name) || isThrownWeapon(item.name))) {
      // The inventory art is drawn on the diagonal, so a bow or staff stood
      // upright by its frame still leans across the hero like a plank. Roll the
      // cel until its own long axis lines up with the frame - or, for a javelin,
      // with the fist's grip tunnel, which is where its shaft has to run.
      item.visual.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), carriedRoll),
      );
    }

    const boneScale = item.anchor.worldScale
      ?? new THREE.Vector3(item.anchor.bone.scale.x || 1, item.anchor.bone.scale.y || 1, item.anchor.bone.scale.z || 1);
    const chainScale = new THREE.Vector3(1, 1, 1);
    let chainMatrix: THREE.Matrix4 | undefined;
    if (item.chainNodes?.length) {
      chainMatrix = new THREE.Matrix4();
      for (const node of item.chainNodes) {
        node.updateMatrix();
        chainMatrix.multiply(node.matrix);
      }
      const chainPosition = new THREE.Vector3();
      const chainQuat = new THREE.Quaternion();
      chainMatrix.decompose(chainPosition, chainQuat, chainScale);
    }
    // The bone chain carries wildly non-uniform scales. Compensating per axis
    // shears the cel into a sliver once those axes are also rotated, so divide
    // by one representative scalar and keep the cel's own aspect intact.
    const axes = [boneScale.x * chainScale.x, boneScale.y * chainScale.y, boneScale.z * chainScale.z]
      .map((value) => Math.abs(value) || 1)
      .sort((a, b) => a - b);
    const localPerWorld = axes[1];
    item.visual.scale.setScalar((body * heldItemShare(item)) / (celHeight * localPerWorld));

    parent.updateWorldMatrix(true, false);
    const parentInverse = parent.matrixWorld.clone().invert();
    if (item.kind === "shield") {
      // A shield is held by the off fist, not strapped mid-forearm: the face
      // hangs in front of the hand and is centred on the grip. Centring the cel
      // on the forearm instead left the fist level with the face, so the hand
      // read as poking out through the shield.
      const forearm = rig.forearms.find((entry) => entry.side === item.anchor.side)
        ?? rig.forearms.find((entry) => entry.side === 1)
        ?? rig.forearms[0];
      const hand = rig.hands.find((entry) => entry.side === forearm?.side);
      const fist = (hand ?? forearm ?? item.anchor).bone.getWorldPosition(new THREE.Vector3());
      const handUnits = (hand?.handLength ?? item.anchor.handLength ?? 0) * (rig.unitScale || 1);
      // The body's own axes, so the face sits in front of the fist and turns with
      // the character. The elbow cross product used before pointed through the
      // back on these rips, which laid the face behind the knuckles.
      const front = FORWARD.clone().applyQuaternion(rootWorldQuat);
      const bodyUp = up.clone().applyQuaternion(rootWorldQuat);
      const outboard = new THREE.Vector3(item.anchor.side > 0 ? 1 : -1, 0, 0)
        .applyQuaternion(rootWorldQuat);
      // The fist has to sit behind the face, otherwise the fingers show through
      // the cel. Measure how far the fingertips actually reach: hand length
      // varies wildly between rips, so a fixed multiple of it left some classes
      // poking through by a unit or more.
      //
      // Measure that reach out of the palm rather than along the body's front:
      // the fingertips sit at a fixed offset in the hand's own frame, so the
      // extent is the same pose after pose, while a front projection pumps as
      // the idle sway turns the wrist and slid the face a third of a unit
      // toward and away from the camera.
      const handJoint = hand ?? forearm ?? item.anchor;
      const palmWorld = hand?.palmNormal
        ? hand.palmNormal.clone().applyQuaternion(hand.bone.getWorldQuaternion(new THREE.Quaternion())).normalize()
        : null;
      let tipReach = handUnits * 1.6;
      for (const satellite of rig.satellites) {
        if (satellite.follow !== handJoint) continue;
        const offset = satellite.bone.getWorldPosition(new THREE.Vector3()).sub(fist);
        const reach = palmWorld ? -offset.dot(palmWorld) : offset.dot(front);
        if (Number.isFinite(reach)) tipReach = Math.max(tipReach, reach);
      }
      const clearance = Math.max(body * 0.034, tipReach + body * 0.006);
      const center = fist.clone()
        .addScaledVector(outboard, body * 0.012)
        .addScaledVector(bodyUp, body * 0.02)
        .addScaledVector(front, clearance);
      item.visual.position.copy(center.applyMatrix4(parentInverse));
      return;
    }
    // Grip point: half a fist along the knuckles from the joint the cel hangs
    // on. Every rip authors its weapon mount for the model's own stock mesh, so
    // riding the mount leaves the cel in front of the fingers on one class and
    // behind them on another; the posed palm replaces that offset.
    const handUnits = (item.anchor.handLength ?? 0) * (rig.unitScale || 1);
    // A javelin bundle is gripped at its binding, so its cel has to sit in the
    // palm. Standing it the usual fraction of a fist forward of the wrist left
    // the fist hidden behind the shafts, which read as the pack hovering beside
    // the hand rather than being carried in it.
    const thrown = isThrownWeapon(item.name);
    const push = thrown
      ? handUnits * JAVELIN_FIST_PUSH
      : Math.max(body * 0.014, handUnits * 0.45);
    const gripDir = (item.anchor.fingerDir ?? new THREE.Vector3(0, -1, 0))
      .clone().applyQuaternion(delta).applyQuaternion(rootWorldQuat).normalize();
    const target = item.anchor.bone.getWorldPosition(new THREE.Vector3()).addScaledVector(gripDir, push);
    if (thrown) {
      // A curled fist closes on the palm side of the hand, so a bundle hung on
      // the knuckle side sat beside the fingers with nothing crossing them. Ride
      // the palm side instead: the shafts pass through the finger tunnel and the
      // curled fingers close over them, which is what reads as carried.
      const palmDir = item.anchor.palmNormal
        ?.clone().applyQuaternion(delta).applyQuaternion(rootWorldQuat).normalize();
      if (palmDir) target.addScaledVector(palmDir, handUnits * JAVELIN_PALM_OFFSET);
      const frontDir = FORWARD.clone().applyQuaternion(rootWorldQuat).normalize();
      target.addScaledVector(frontDir, handUnits * JAVELIN_FRONT_OFFSET);
    }
    item.visual.position.copy(target.applyMatrix4(parentInverse));
  };
  for (const item of heldItems) placeHeld(item);

  for (const satellite of rig.satellites) {
    const delta = deltas.get(satellite.follow) ?? new THREE.Quaternion();
    const anchor = positions.get(satellite.follow) ?? satellite.follow.bindPos;
    const offset = satellite.bindPos.clone().sub(satellite.follow.bindPos).applyQuaternion(delta);
    satellite.bone.position.copy(anchor.clone().add(offset));
    satellite.bone.quaternion.copy(delta.clone().multiply(satellite.bindQuat));
    if (rig.weaponMount?.mesh.visible && satellite.bone === rig.weaponMount.bone) {
      // Stand the model's own weapon upright instead of letting it ride the
      // arm's T-pose angle into a horizontal lance.
      const axis = rig.weaponMount.axis.clone().applyQuaternion(delta).normalize();
      satellite.bone.quaternion.premultiply(
        new THREE.Quaternion().setFromUnitVectors(axis, rig.weaponMount.target),
      );
    }
    if (satellite.curl) {
      // Flex about the finger's own hinge so the fanned bind pose closes into a
      // relaxed hand instead of a splayed claw.
      satellite.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(FINGER_HINGE, satellite.curl));
    }
    satellite.bone.updateMatrix();
  }

  // Weapon/shield anchors can be satellite bones, whose transform the loop above
  // rewrites, so anything hung on one is placed again once they have settled.
  for (const item of heldItems) {
    // Shields also need this pass: their clearance is measured from the posed
    // fingertips, which are only written by the loop above.
    const onSatellite = item.kind === "shield"
      || rig.satellites.some((satellite) => satellite.bone === item.anchor.bone)
      || item.chainNodes?.some((node) => rig.satellites.some((satellite) => satellite.bone === node));
    if (onSatellite) placeHeld(item);
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
