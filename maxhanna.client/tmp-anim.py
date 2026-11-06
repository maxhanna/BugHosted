"""Scratch: deepen character animation (gaits, torso/head channels, weapon styles)."""
import re

P = 'src/app/d2survivors/d2survivors.component.ts'
s = open(P, encoding='utf-8').read()


def replace(old, new, count=1):
    global s
    assert old in s, old[:90]
    s = s.replace(old, new, count)


# ---------------------------------------------------------------- 1. constants
GAIT = '''const PALADIN_ARM_SWING_AXIS = new THREE.Vector3(0, 1, 0);

interface ClassGait {
  idleCadence: number;
  walkCadence: number;
  hip: number;
  knee: number;
  kneeOffset: number;
  footRoll: number;
  armSwing: number;
  elbow: number;
  lean: number;
  sway: number;
  pelvisRoll: number;
  pelvisYaw: number;
  chestTwist: number;
  headBob: number;
  headYaw: number;
  bob: number;
  hunch: number;
}

/**
 * Walk cycles are layered per class: cadence, stride, torso counter-rotation,
 * head stabilisation and vertical bob all come from here, so a Barbarian lumbers
 * with wide hips while a Sorceress takes short, quiet steps.
 */
const CLASS_GAIT: Record<string, ClassGait> = {
  amazon: { idleCadence: 1.8, walkCadence: 6.9, hip: 0.21, knee: 0.28, kneeOffset: 0.38, footRoll: 0.075, armSwing: 0.13, elbow: 0.075, lean: 0.022, sway: 0.011, pelvisRoll: 0.028, pelvisYaw: 0.10, chestTwist: 0.09, headBob: 0.012, headYaw: 0.020, bob: 0.058, hunch: 0 },
  assassin: { idleCadence: 1.7, walkCadence: 7.5, hip: 0.19, knee: 0.31, kneeOffset: 0.34, footRoll: 0.062, armSwing: 0.15, elbow: 0.10, lean: 0.032, sway: 0.013, pelvisRoll: 0.031, pelvisYaw: 0.13, chestTwist: 0.11, headBob: 0.010, headYaw: 0.024, bob: 0.064, hunch: 0 },
  barbarian: { idleCadence: 1.5, walkCadence: 6.0, hip: 0.38, knee: 0.52, kneeOffset: 0.18, footRoll: 0.12, armSwing: 0.27, elbow: 0.14, lean: 0.046, sway: 0.019, pelvisRoll: 0.049, pelvisYaw: 0.17, chestTwist: 0.14, headBob: 0.018, headYaw: 0.022, bob: 0.14, hunch: 0 },
  druid: { idleCadence: 1.6, walkCadence: 6.3, hip: 0.28, knee: 0.36, kneeOffset: 0.28, footRoll: 0.09, armSwing: 0.18, elbow: 0.10, lean: 0.030, sway: 0.015, pelvisRoll: 0.037, pelvisYaw: 0.14, chestTwist: 0.10, headBob: 0.014, headYaw: 0.022, bob: 0.088, hunch: 0 },
  necromancer: { idleCadence: 1.3, walkCadence: 5.4, hip: 0.31, knee: 0.45, kneeOffset: 0.50, footRoll: 0.13, armSwing: 0.085, elbow: 0.06, lean: 0.028, sway: 0.013, pelvisRoll: 0.031, pelvisYaw: 0.10, chestTwist: 0.07, headBob: 0.016, headYaw: 0.018, bob: 0.052, hunch: 0.13 },
  paladin: { idleCadence: 1.6, walkCadence: 6.5, hip: 0.25, knee: 0.34, kneeOffset: 0.30, footRoll: 0.082, armSwing: 0.15, elbow: 0.085, lean: 0.024, sway: 0.011, pelvisRoll: 0.029, pelvisYaw: 0.12, chestTwist: 0.10, headBob: 0.012, headYaw: 0.018, bob: 0.072, hunch: 0 },
  sorceress: { idleCadence: 1.9, walkCadence: 7.0, hip: 0.16, knee: 0.22, kneeOffset: 0.36, footRoll: 0.055, armSwing: 0.07, elbow: 0.05, lean: 0.012, sway: 0.007, pelvisRoll: 0.020, pelvisYaw: 0.085, chestTwist: 0.06, headBob: 0.008, headYaw: 0.016, bob: 0.038, hunch: 0 },
};'''
replace('const PALADIN_ARM_SWING_AXIS = new THREE.Vector3(0, 1, 0);', GAIT)

# ------------------------------------------------------- 2. attack style union
replace('''type AttackAnimationStyle = "amazonJab" | "assassinSlash" | "assassinKick" | "barbarianCleave" | "druidClaw" | "necromancerCast" | "paladinStrike" | "sorceressCast" | "spin" | "cast" | "maceSmash" | "staffStrike" | "weaponThrow";''',
        '''type AttackAnimationStyle = "amazonJab" | "assassinSlash" | "assassinKick" | "barbarianCleave" | "druidClaw" | "necromancerCast" | "paladinStrike" | "sorceressCast" | "spin" | "cast" | "maceSmash" | "staffStrike" | "weaponThrow" | "swordSlash" | "axeChop" | "daggerStab" | "bowShot" | "crossbowShot" | "clawFlurry" | "unarmedStrike";''')

# ------------------------------------------------------ 3. profile interface
replace('''  spin: boolean;
  trail?: string;
  trailArc?: number;
}''', '''  spin: boolean;
  trail?: string;
  trailArc?: number;
  /** Extra pelvis yaw the strike drives, on top of the walk cycle. */
  hipTwist?: number;
  /** Torso yaw; falls back to torsoTwist when a weapon needs its own amount. */
  chestTwist?: number;
  /** Forward compression of the chest during the strike. */
  chestLean?: number;
  /** How strongly the neck and head hold the gaze on the target (0..1). */
  headAim?: number;
  /** Extra weapon spin about its own length, for draw and sweep styles. */
  weaponYaw?: number;
}''')

# ------------------------------------------------------------- 4. new profiles
replace('''  weaponThrow: { duration: 0.5, leadArm: 1.62, offArm: 0.38, armSweep: -0.58, shoulderRoll: 0.24, elbowBend: 0.72, offElbowBend: 0.14, weaponPitch: -0.5, weaponRoll: 0.12, lean: 0.18, torsoTwist: 0.36, bodyLift: 0.022, spin: false },''',
        '''  weaponThrow: { duration: 0.5, leadArm: 1.62, offArm: 0.38, armSweep: -0.58, shoulderRoll: 0.24, elbowBend: 0.72, offElbowBend: 0.14, weaponPitch: -0.5, weaponRoll: 0.12, lean: 0.18, torsoTwist: 0.36, bodyLift: 0.022, spin: false, hipTwist: 0.2, chestTwist: 0.42, headAim: 0.5, weaponYaw: 0.2 },
  // One-handed blades: a diagonal cut from the outside shoulder across the body.
  swordSlash: { duration: 0.46, leadArm: 1.24, offArm: 0.3, armSweep: -0.85, shoulderRoll: 0.3, elbowBend: 0.85, offElbowBend: 0.3, weaponPitch: -0.85, weaponRoll: 0.55, lean: 0.16, torsoTwist: 0.34, bodyLift: 0.02, spin: false, hipTwist: 0.16, chestTwist: 0.44, chestLean: 0.2, headAim: 0.7, weaponYaw: -0.25, trail: "#efe2c0", trailArc: 2.4 },
  // Axes are heavier: overhead wind-up, deep body drop, long follow through.
  axeChop: { duration: 0.64, leadArm: 1.62, offArm: 0.55, armSweep: -0.4, shoulderRoll: -0.5, elbowBend: 1.15, offElbowBend: 0.3, weaponPitch: -1.15, weaponRoll: -0.3, lean: 0.34, torsoTwist: 0.2, bodyLift: 0.012, spin: false, hipTwist: 0.1, chestTwist: 0.34, chestLean: 0.32, headAim: 0.4, weaponYaw: 0.15, trail: "#ffcf83", trailArc: 1.5 },
  // Daggers double-tap: two short thrusts instead of a swing.
  daggerStab: { duration: 0.34, leadArm: 1.45, offArm: 0.35, armSweep: 0.25, shoulderRoll: 0.12, elbowBend: 0.25, offElbowBend: 0.4, weaponPitch: -0.2, weaponRoll: 0.05, lean: 0.2, torsoTwist: 0.12, bodyLift: 0.015, spin: false, hipTwist: 0.08, chestTwist: 0.2, chestLean: 0.18, headAim: 0.5, weaponYaw: 0.1, trail: "#cfe8ff", trailArc: 0.7 },
  // Bow: lead arm holds the bow out, off hand draws to the cheek and releases.
  bowShot: { duration: 0.52, leadArm: 1.5, offArm: 1.05, armSweep: 0.05, shoulderRoll: 0.1, elbowBend: 0.1, offElbowBend: 1.5, weaponPitch: -0.1, weaponRoll: 0, lean: 0.05, torsoTwist: 0.28, bodyLift: 0.01, spin: false, hipTwist: 0.12, chestTwist: 0.3, chestLean: 0.06, headAim: 0.9, weaponYaw: 0, trail: "#d8e6ff", trailArc: 0.4 },
  // Crossbow: braced, level aim, sharp recoil.
  crossbowShot: { duration: 0.48, leadArm: 1.55, offArm: 1.2, armSweep: 0.02, shoulderRoll: 0.06, elbowBend: 0.12, offElbowBend: 1.1, weaponPitch: -0.05, weaponRoll: 0, lean: 0.02, torsoTwist: 0.16, bodyLift: 0.008, spin: false, hipTwist: 0.08, chestTwist: 0.2, headAim: 0.95, trail: "#cfd9e8", trailArc: 0.5 },
  // Claws alternate hands, so the off arm swings as hard as the lead.
  clawFlurry: { duration: 0.42, leadArm: 1.2, offArm: 1.05, armSweep: 0.55, shoulderRoll: 0.24, elbowBend: 0.62, offElbowBend: 0.55, weaponPitch: -0.45, weaponRoll: 0.4, lean: 0.1, torsoTwist: 0.3, bodyLift: 0.018, spin: false, hipTwist: 0.14, chestTwist: 0.38, headAim: 0.6, trail: "#a8cfff", trailArc: 1.6 },
  // Bare hands: jab and cross, with the off hand following the lead.
  unarmedStrike: { duration: 0.32, leadArm: 1.3, offArm: 0.85, armSweep: 0.18, shoulderRoll: 0.1, elbowBend: 0.5, offElbowBend: 0.9, weaponPitch: 0, weaponRoll: 0, lean: 0.12, torsoTwist: 0.2, bodyLift: 0.012, spin: false, hipTwist: 0.1, chestTwist: 0.26, headAim: 0.5, trail: "#f0e2c8", trailArc: 0.9 },''')

# ---------------------------------------------------------- 5. motion curves
CURVES = '''function attackMotionCurve(progress: number, style?: AttackAnimationStyle): number {
  // Eased 0 -> 1 -> 0 pulse inside a slice of the attack, used by the multi-hit
  // and quick-thrust styles.
  const pulse = (start: number, end: number): number => {
    if (progress <= start || progress >= end) return 0;
    return Math.sin(((progress - start) / (end - start)) * Math.PI);
  };
  if (style === "bowShot") {
    if (progress < 0.54) return -0.9 * Math.sin(progress / 0.54 * Math.PI / 2);
    if (progress < 0.66) {
      const release = (progress - 0.54) / 0.12;
      return -0.9 + 2.05 * (release * release * (3 - 2 * release));
    }
    return Math.cos(Math.min(1, (progress - 0.66) / 0.34) * Math.PI / 2);
  }
  if (style === "crossbowShot") {
    if (progress < 0.2) return -0.2 * Math.sin(progress / 0.2 * Math.PI / 2);
    if (progress < 0.36) {
      const kick = (progress - 0.2) / 0.16;
      return -0.2 - 0.55 * (kick * kick * (3 - 2 * kick));
    }
    return -0.75 * Math.cos(Math.min(1, (progress - 0.36) / 0.64) * Math.PI / 2);
  }
  if (style === "swordSlash") {
    if (progress < 0.3) return -0.7 * Math.sin(progress / 0.3 * Math.PI / 2);
    if (progress < 0.52) {
      const strike = (progress - 0.3) / 0.22;
      return -0.7 + 1.95 * (strike * strike * (3 - 2 * strike));
    }
    return Math.cos(Math.min(1, (progress - 0.52) / 0.48) * Math.PI / 2) * 0.55;
  }
  if (style === "axeChop") {
    if (progress < 0.38) return -1.15 * Math.sin(progress / 0.38 * Math.PI / 2);
    if (progress < 0.56) {
      const chop = (progress - 0.38) / 0.18;
      return -1.15 + 2.55 * (chop * chop * (3 - 2 * chop));
    }
    return Math.cos(Math.min(1, (progress - 0.56) / 0.44) * Math.PI / 2) * 0.7;
  }
  if (style === "daggerStab") {
    const first = pulse(0.1, 0.36) * 1.35;
    const second = pulse(0.46, 0.72) * 0.95;
    const settle = progress > 0.72 ? Math.cos(Math.min(1, (progress - 0.72) / 0.28) * Math.PI / 2) : 1;
    return (first + second) * settle - 0.12 * Math.sin(Math.min(1, progress / 0.1) * Math.PI / 2);
  }
  if (style === "clawFlurry") {
    const left = pulse(0.08, 0.44) * 1.1;
    const right = pulse(0.5, 0.86) * 0.95;
    return Math.max(left, right);
  }
  if (style === "unarmedStrike") {
    const jab = pulse(0.1, 0.4) * 1.25;
    const cross = pulse(0.48, 0.84) * 1.0;
    return Math.max(jab, cross);
  }
'''
replace('function attackMotionCurve(progress: number, style?: AttackAnimationStyle): number {\n', CURVES)

# ------------------------------------------------------ 6. rig: chest/neck/head
replace('''  legs?: RigAnimationBone[];
  knees?: RigAnimationBone[];
  feet?: RigAnimationBone[];
  arms?: RigAnimationBone[];
  forearms?: RigAnimationBone[];
}''', '''  legs?: RigAnimationBone[];
  knees?: RigAnimationBone[];
  feet?: RigAnimationBone[];
  arms?: RigAnimationBone[];
  forearms?: RigAnimationBone[];
  chest?: THREE.Bone;
  chestBaseQuaternion?: THREE.Quaternion;
  neck?: THREE.Bone;
  neckBaseQuaternion?: THREE.Quaternion;
  head?: THREE.Bone;
  headBaseQuaternion?: THREE.Quaternion;
}''')

replace('''    const bones: PlayerRigBones = { legs: [], knees: [], feet: [], arms: [], forearms: [] };''',
        '''    const bones: PlayerRigBones = { legs: [], knees: [], feet: [], arms: [], forearms: [] };
    const isHeadLike = /shape|mesh|band|attach|hair|face|eye|brow|lip|jaw|horn|ear|beard|nose|teeth|necklace|bone|pipe|helm/i;''')

replace('''      if ((/(?:^|[_-])spine[_-]?(?:01|1)(?:[_-]|$)/.test(name)
        || (this.selectedClass === "assassin" && /^spine_01_m_jnt$/.test(name))) && !bones.spine) {
        bones.spine = object;
        bones.spineBaseQuaternion = object.quaternion.clone();
      }''',
        '''      if ((/(?:^|[_-])spine[_-]?(?:01|1)(?:[_-]|$)/.test(name)
        || (this.selectedClass === "assassin" && /^spine_01_m_jnt$/.test(name))) && !bones.spine) {
        bones.spine = object;
        bones.spineBaseQuaternion = object.quaternion.clone();
      }
      // Upper torso and head joints differ per rig (chest / spine_02 / spine_0?2),
      // but every class ships them, so the strike and walk can drive them.
      if (!bones.chest
        && (/(?:^|[_-])chest(?:[_-]|$)/.test(name) || /(?:^|[_-])spine[_-]?0?2(?:[_-]|$)/.test(name))
        && !isHeadLike.test(name)) {
        bones.chest = object;
        bones.chestBaseQuaternion = object.quaternion.clone();
      }
      if (!bones.neck && /(?:^|[_-])neck(?:[_-]?(?:0?1|0?2))?(?:[_-]|$)/.test(name) && !isHeadLike.test(name)) {
        bones.neck = object;
        bones.neckBaseQuaternion = object.quaternion.clone();
      }
      if (!bones.head && /(?:^|[_-])head(?:[_-]|$)/.test(name) && !isHeadLike.test(name)) {
        bones.head = object;
        bones.headBaseQuaternion = object.quaternion.clone();
      }''')

# ------------------------------------------------ 7. rewrite animatePlayerModel
start = s.index('  private animatePlayerModel(dt: number): void {')
end = s.index('  private getPreviewPoseBones(', start)

NEW = '''  private animatePlayerModel(dt: number): void {
    if (!this.characterModel) return;
    const seconds = Math.max(0, dt / 1000);
    this.playerAnimationTime += seconds;
    const targetBlend = this.isPlayerMoving ? 1 : 0;
    this.playerMotionBlend += (targetBlend - this.playerMotionBlend) * (1 - Math.exp(-seconds * 8));
    const moving = this.playerMotionBlend;
    const gait = CLASS_GAIT[this.selectedClass] ?? CLASS_GAIT.paladin;
    const isSorceress = this.selectedClass === "sorceress";
    const isBarbarian = this.selectedClass === "barbarian";
    const isNecromancer = this.selectedClass === "necromancer";
    const isPaladin = this.selectedClass === "paladin";
    // The Necromancer shambles: a slower cadence than the other classes but a wider
    // stride, so the walk reads as heavy rather than as a twitch.
    const phase = this.playerAnimationTime * (gait.idleCadence + moving * gait.walkCadence);
    const stride = Math.sin(phase);
    const oppositeStride = -stride;
    const hipAmplitude = moving * gait.hip;
    const legHingeAxis = isNecromancer ? NECROMANCER_LIMB_HINGE_AXIS : new THREE.Vector3(1, 0, 0);
    const rollAxis = new THREE.Vector3(0, 0, 1);

    // These class rigs ship in bind pose without clips. Locomotion is layered
    // first (legs, hips, torso, head) and the weapon's strike is composited on top,
    // so a moving attack keeps its footwork instead of freezing into a pose.
    this.attackAnimationTime += seconds * this.playerAttackSpeedMultiplier;
    const attackProfile = ATTACK_ANIMATION_PROFILES[this.attackAnimationStyle];
    const attackProgress = Math.max(0, Math.min(1, this.attackAnimationTime / attackProfile.duration));
    const attackActive = this.attackAnimationTime < attackProfile.duration;
    const attackMotion = attackActive ? attackMotionCurve(attackProgress, this.attackAnimationStyle) : 0;
    const attackDrive = Math.max(0, attackMotion);
    const attackFollowThrough = attackActive ? Math.sin(Math.PI * attackProgress) : 0;
    const isAssassinKick = this.attackAnimationStyle === "assassinKick";
    const chestTwist = attackProfile.chestTwist ?? attackProfile.torsoTwist;
    const hipTwist = attackProfile.hipTwist ?? 0;
    const chestLean = attackProfile.chestLean ?? attackProfile.lean;
    const headAim = attackProfile.headAim ?? 0.3;
    // Let the axe/javelin leave the hand at the release point of a throw, then
    // restore it once the animation ends so the equipped weapon is not lost.
    if (this.equippedWeaponVisual) {
      this.equippedWeaponVisual.visible = !(this.attackAnimationStyle === "weaponThrow" && attackActive && attackProgress > 0.5);
    }
    for (const leg of this.playerRigBones.legs ?? []) {
      const locomotionSwing = Math.sin(phase + (leg.side < 0 ? Math.PI : 0)) * hipAmplitude;
      const kick = isAssassinKick && leg.side === this.attackAnimationSide ? attackMotion * 1.15 : 0;
      const support = isAssassinKick && leg.side !== this.attackAnimationSide ? Math.max(0, attackMotion) * 0.12 : 0;
      const swing = new THREE.Quaternion().setFromAxisAngle(legHingeAxis, locomotionSwing + kick + support);
      leg.bone.quaternion.copy(leg.baseQuaternion).multiply(swing);
    }
    for (const knee of this.playerRigBones.knees ?? []) {
      const legPhase = phase + (knee.side < 0 ? Math.PI : 0);
      // The bend peaks while the leg travels forward, so the knee never hyperextends.
      const locomotionBend = moving * gait.knee * Math.max(0, Math.sin(legPhase + gait.kneeOffset));
      const kickBend = isAssassinKick && knee.side === this.attackAnimationSide ? Math.max(0, attackMotion) * 1.05 : 0;
      const supportBend = isAssassinKick && knee.side !== this.attackAnimationSide ? Math.max(0, attackMotion) * 0.16 : 0;
      // A heavy strike drops both knees a little, which reads as weight.
      const strikeBend = attackDrive * (isPaladin ? 0 : 0.06);
      const flex = new THREE.Quaternion().setFromAxisAngle(legHingeAxis, locomotionBend + kickBend + supportBend + strikeBend);
      knee.bone.quaternion.copy(knee.baseQuaternion).multiply(flex);
    }
    for (const foot of this.playerRigBones.feet ?? []) {
      const legPhase = phase + (foot.side < 0 ? Math.PI : 0);
      // Toe-off on the trailing leg, heel strike on the leading one.
      const locomotionRoll = -Math.sin(legPhase) * moving * gait.footRoll;
      const kickPoint = isAssassinKick && foot.side === this.attackAnimationSide ? -Math.max(0, attackMotion) * 0.48 : 0;
      const roll = new THREE.Quaternion().setFromAxisAngle(legHingeAxis, locomotionRoll + kickPoint);
      foot.bone.quaternion.copy(foot.baseQuaternion).multiply(roll);
    }
    this.attackAnimationTurn = attackActive && attackProfile.spin ? attackProgress * Math.PI * 2 : 0;
    for (const effect of this.meleeTrailEffects) effect.time += seconds;
    for (let index = this.meleeTrailEffects.length - 1; index >= 0; index -= 1) {
      if (this.meleeTrailEffects[index].time >= this.meleeTrailEffects[index].duration) this.meleeTrailEffects.splice(index, 1);
    }
    for (const arm of this.playerRigBones.arms ?? []) {
      const lead = arm.side === this.attackAnimationSide;
      const attackAmplitude = lead ? attackProfile.leadArm : attackProfile.offArm;
      const armAmplitude = isPaladin ? Math.min(attackAmplitude, lead ? 1.22 : 0.14) : attackAmplitude;
      // The off arm of a two-handed style (bow, crossbow, staff) follows the lead
      // instead of hanging, so the weapon reads as held with both hands.
      const offHandFollow = !lead && (this.attackAnimationStyle === "bowShot" || this.attackAnimationStyle === "crossbowShot") ? 0.55 : 0;
      const locomotionSwing = (arm.side < 0 ? oppositeStride : stride) * moving * gait.armSwing;
      const pitch = locomotionSwing + attackMotion * (armAmplitude + offHandFollow);
      const sweep = attackFollowThrough * (lead ? attackProfile.armSweep : -attackProfile.armSweep * 0.55) * (isPaladin ? 0.35 : 1);
      const roll = attackMotion * attackProfile.shoulderRoll * (lead ? -1 : 1) * (isPaladin ? 0.35 : 1);
      const shoulderRestAngle = isSorceress ? SORCERESS_ARM_REST_ANGLE
        : isNecromancer ? NECROMANCER_ARM_REST_ANGLE
        : 0;
      const shoulderMotion = isPaladin
        ? new THREE.Quaternion().setFromAxisAngle(PALADIN_ARM_SWING_AXIS, -arm.side * pitch)
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, 0, sweep, "XYZ")))
        : isSorceress || isNecromancer
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, shoulderRestAngle + pitch, sweep, "XYZ"))
        : new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, sweep, roll, "XYZ"));
      arm.bone.quaternion.copy(arm.baseQuaternion).multiply(shoulderMotion);
    }
    for (const forearm of this.playerRigBones.forearms ?? []) {
      const lead = forearm.side === this.attackAnimationSide;
      // Elbows bend most on the forward half of the swing, which keeps the arm
      // from looking like a straight stick during the walk.
      const forwardSwing = Math.max(0, Math.sin(phase + (forearm.side < 0 ? Math.PI : 0)));
      const locomotionBend = forwardSwing * moving * gait.elbow;
      const elbowBend = lead ? attackProfile.elbowBend : attackProfile.offElbowBend;
      // A drawn bow folds the off elbow hard while the lead arm stays extended.
      const drawFold = !lead && this.attackAnimationStyle === "bowShot" ? attackDrive * 1.2 : 0;
      const bend = locomotionBend + attackDrive * (isPaladin ? Math.min(elbowBend, lead ? 0.42 : 0.12) : elbowBend) + drawFold;
      const hingeAxis = isSorceress || isNecromancer
        ? SORCERESS_ARM_HINGE_AXIS
        : isPaladin ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const flex = new THREE.Quaternion().setFromAxisAngle(hingeAxis, bend);
      forearm.bone.quaternion.copy(forearm.baseQuaternion).multiply(flex);
    }
    for (let index = 0; index < this.playerWeaponMeshes.length; index += 1) {
      const side = this.playerWeaponMeshes[index].userData["d2sWeaponSide"] as number;
      // The Barbarian weapons are parented to the animated hand; applying a second
      // local swing rotates them around the mesh origin and makes the grip look broken.
      const weaponDrive = isBarbarian ? 0 : attackMotion;
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        weaponDrive * attackProfile.weaponPitch,
        weaponDrive * (attackProfile.weaponYaw ?? 0),
        weaponDrive * attackProfile.weaponRoll * (side < 0 ? -1 : 1),
        "XYZ",
      ));
      this.playerWeaponMeshes[index].quaternion.copy(this.playerWeaponBaseQuaternions[index]).multiply(turn);
    }
    if (this.playerRigBones.pelvis) {
      const base = this.playerRigBones.pelvisBaseQuaternion ?? this.playerRigBones.pelvis.quaternion;
      // Hips lead the walk: they roll into the supporting leg and yaw with the
      // stride, while the strike adds its own rotation.
      const pelvisSway = Math.sin(phase) * moving * gait.pelvisRoll;
      const pelvisYaw = Math.sin(phase) * moving * gait.pelvisYaw + attackMotion * hipTwist;
      const sway = new THREE.Quaternion().setFromAxisAngle(rollAxis, pelvisSway)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pelvisYaw));
      this.playerRigBones.pelvis.quaternion.copy(base).multiply(sway);
    }
    // Shoulders counter-rotate against the hips and drive most of the strike.
    const spineYaw = -Math.sin(phase) * moving * gait.pelvisYaw * 0.45 + attackMotion * chestTwist * 0.4;
    const spinePitch = -(gait.lean * moving)
      + Math.sin(phase * 2) * moving * gait.lean * 0.25
      - attackMotion * attackProfile.lean * (isBarbarian ? 1.25 : 1) * (isPaladin ? 0 : 1);
    const spineRoll = Math.sin(phase) * moving * gait.sway;
    if (this.playerRigBones.spine) {
      const base = this.playerRigBones.spineBaseQuaternion ?? this.playerRigBones.spine.quaternion;
      const paladinLungeScale = isPaladin ? 0 : 1;
      const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(spinePitch, spineYaw * paladinLungeScale, spineRoll, "XYZ"));
      if (isNecromancer) {
        // His spine X is vertical, so the shared Euler above only twists it. A roll
        // about the lateral axis gives the hunched, stooped walk he should have.
        lean.multiply(new THREE.Quaternion().setFromAxisAngle(
          NECROMANCER_LIMB_HINGE_AXIS,
          moving * (gait.hunch + Math.sin(phase * 2) * 0.012),
        ));
      }
      this.playerRigBones.spine.quaternion.copy(base).multiply(lean);
    }
    if (this.playerRigBones.chest) {
      const base = this.playerRigBones.chestBaseQuaternion ?? this.playerRigBones.chest.quaternion;
      const breathe = Math.sin(this.playerAnimationTime * 1.7) * 0.01 * (1 - moving);
      const chestMotion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        breathe - attackMotion * chestLean * (isPaladin ? 0 : 0.55),
        (attackMotion * chestTwist * 0.6 + Math.sin(phase) * moving * gait.chestTwist) * (isPaladin ? 0.25 : 1),
        Math.sin(phase) * moving * gait.chestTwist * 0.4,
        "XYZ",
      ));
      this.playerRigBones.chest.quaternion.copy(base).multiply(chestMotion);
    }
    // Neck and head absorb the torso work so the hero keeps looking where it is
    // going (or at what it is shooting) instead of nodding with every step.
    const headPitch = headAim * attackMotion * chestLean * 0.35
      - Math.sin(phase * 2) * moving * gait.headBob
      - Math.sin(phase * 2) * moving * gait.lean * 0.4;
    const headYaw = -Math.sin(phase) * moving * gait.headYaw - headAim * attackMotion * chestTwist * 0.3;
    for (const entry of [
      { bone: this.playerRigBones.neck, base: this.playerRigBones.neckBaseQuaternion, scale: 0.45 },
      { bone: this.playerRigBones.head, base: this.playerRigBones.headBaseQuaternion, scale: 1 },
    ]) {
      if (!entry.bone) continue;
      const base = entry.base ?? entry.bone.quaternion;
      const stabilize = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        headPitch * entry.scale,
        headYaw * entry.scale,
        -spineRoll * entry.scale * 0.5,
        "XYZ",
      ));
      entry.bone.quaternion.copy(base).multiply(stabilize);
    }
    const yawTarget = this.isPlayerMoving ? Math.atan2(this.playerMoveX, this.playerMoveY) : Math.atan2(this.playerFacingX, this.playerFacingY);
    const yawDelta = Math.atan2(Math.sin(yawTarget - this.characterModel.rotation.y), Math.cos(yawTarget - this.characterModel.rotation.y));
    this.characterModel.rotation.y += yawDelta * (1 - Math.exp(-seconds * 10));
    const modelRoot = this.characterModel.children[0];
    if (modelRoot) modelRoot.rotation.y = this.attackAnimationTurn;
    // Keep footfalls subtle so the model stays grounded instead of hovering between steps.
    const barbarianCrouch = isBarbarian && attackActive ? Math.max(0, -attackMotion) * 0.16 : 0;
    const strikeCrouch = attackDrive * (this.attackAnimationStyle === "axeChop" || this.attackAnimationStyle === "maceSmash" ? 0.1 : 0);
    const attackLift = isPaladin ? 0 : attackDrive * attackProfile.bodyLift;
    this.characterModel.position.y = Math.abs(Math.sin(phase * 2)) * moving * gait.bob - barbarianCrouch - strikeCrouch + attackLift;
  }

'''
s = s[:start] + NEW + s[end:]

# ------------------------------------------- 8. per-weapon attack style choice
old_style = s[s.index('  private attackStyleForEquippedWeapon('):]
old_style = old_style[:old_style.index('\n  }\n') + len('\n  }\n')]
new_style = '''  private attackStyleForEquippedWeapon(classDefault: AttackAnimationStyle): AttackAnimationStyle {
    const item = this.equipment.weapon;
    if (!item) return classDefault;
    if (this.thrownWeaponKind) return "weaponThrow";
    const name = `${item.baseName ?? ""} ${item.name}`.toLowerCase();
    const type = getEquipmentType(item);
    // Every weapon family gets its own strike: wind-up, release point, off-hand
    // work and torso rotation differ between a bow, an axe and a dagger.
    if (type === "claw") return "clawFlurry";
    if (type === "wand" || type === "orb" || /wand|orb/.test(name)) {
      return this.selectedClass === "sorceress" ? "sorceressCast" : "necromancerCast";
    }
    if (/crossbow|arbalest|ballista/.test(name)) return "crossbowShot";
    if (/\\bbow\\b|bow\\b/.test(name)) return "bowShot";
    if (/staff|stave|quarterstaff/.test(name)) return "staffStrike";
    if (/pike|polearm|spear|lance|trident|brandistock|war scythe/.test(name)) return "amazonJab";
    if (/dagger|knife|dirk|stiletto|kris/.test(name)) return "daggerStab";
    if (/hammer|mace|maul|club|flail|scepter|sceptre|mallet/.test(name)) return "maceSmash";
    if (/axe|cleaver|halberd|poleaxe/.test(name)) return this.selectedClass === "barbarian" ? "barbarianCleave" : "axeChop";
    if (/sword|blade|scimitar|sabre|saber|falchion|glaive|crystal sword/.test(name)) {
      return this.selectedClass === "assassin" ? "assassinSlash" : "swordSlash";
    }
    if (/claw|katar|hatchet hands|cestus/.test(name)) return "clawFlurry";
    return classDefault;
  }
'''
s = s.replace(old_style, new_style, 1)

open(P, 'w', encoding='utf-8').write(s)
print('patched animation system')
