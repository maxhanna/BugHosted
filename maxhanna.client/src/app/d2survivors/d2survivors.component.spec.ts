import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import * as THREE from "three";
import { D2SurvivorsService } from "../../services/d2survivors.service";
import { D2SurvivorsComponent } from "./d2survivors.component";
import { D2_ITEM_ART, D2_SET_ITEMS, D2_UNIQUE_ITEMS } from "./d2-item-assets.generated";
import { D2_HELMET_VISUALS, getHelmetVisualForItem } from "./d2-helmet-visuals.generated";
import { D2_SKILL_ICON_PATHS } from "./d2-skill-icons.generated";
import { PALADIN_AURA_ART } from "./d2-paladin-auras.generated";
import { ARMOR_AURA_ART } from "./d2-armor-auras.generated";
import { BONE_ARMOR_ART } from "./d2-bone-armor.generated";
import { FROST_NOVA_ART } from "./d2-frost-nova.generated";
import { INFERNO_ART } from "./d2-inferno.generated";
import { ASSASSIN_AURA_ART } from "./d2-assassin-auras.generated";
import { DRUID_SPIRIT_AURA_ART } from "./d2-druid-auras.generated";
import { D2_CLASS_SKILL_TREES } from "./d2survivors-skill-tree.data";
import { ATTACK_CLIP_INFO, buildCharacterRig, gaitForClass, poseCharacterRig } from "./character-animation";

describe("D2SurvivorsComponent combat and equipment", () => {
  let fixture: ComponentFixture<D2SurvivorsComponent>;
  let component: D2SurvivorsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [D2SurvivorsComponent],
      providers: [{
        provide: D2SurvivorsService,
        useValue: {
          lobbyMessage$: new Subject(),
          leaderboardUpdated$: new Subject(),
          disconnectLobby: () => Promise.resolve(),
        },
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(D2SurvivorsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it("uses the imported arrow-flight art for every Amazon bow skill", () => {
    const expected: Record<string, string> = {
      "Magic Arrow": "d2-arrow", "Multiple Shot": "d2-arrow",
      "Guided Arrow": "d2-arrow", "Strafe": "d2-arrow",
      "Fire Arrow": "d2-firearrow", "Exploding Arrow": "d2-firearrow",
      "Immolation Arrow": "d2-firearrow",
      "Cold Arrow": "d2-icearrow", "Ice Arrow": "d2-icearrow",
      "Freezing Arrow": "d2-icearrow",
    };
    for (const [skill, art] of Object.entries(expected)) {
      expect((component as any).missileOverlayId(skill)).toBe(art);
    }
  });

  it("holds the player in place for a melee attack, then lets movement resume", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    const target = { x: 260, y: 250, r: 12, hp: 100 } as any;
    component.enemies = [target];

    component.attackNearestEnemy();
    expect((component as any).playerAttackLockRemaining).toBeGreaterThan(0);
    component.keysDown.add("d");
    component.movePlayer(100);

    expect(component.playerX).toBe(250);
    expect(component.playerY).toBe(250);

    (component as any).playerAttackLockRemaining = 0;
    component.movePlayer(100);
    expect(target.x).toBeLessThan(260);
  });

  it("refuses attacks while the player is running and resumes once they stop", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    const target = { x: 260, y: 250, r: 12, hp: 100 } as any;
    component.enemies = [target];
    component.keysDown.add("d");

    component.attackNearestEnemy();
    expect((component as any).playerAttackLockRemaining).toBe(0);
    expect(target.hp).toBe(100);

    (component as any).updateBasicAttack();
    expect(target.hp).toBe(100);

    component.keysDown.delete("d");
    component.attackNearestEnemy();
    expect(target.hp).toBeLessThan(100);
  });

  it("suppresses spell launches while moving and resumes after stopping", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any,
    ];
    component.attackProjectiles = [];
    component.keysDown.add("d");

    (component as any).updateAutomaticSkillCasts(16);
    component.activateOwnedSkill("Charged Bolt");

    expect(component.attackProjectiles.length).toBe(0);

    component.keysDown.delete("d");
    (component as any).updateAutomaticSkillCasts(16);

    expect(component.attackProjectiles.length).toBeGreaterThan(0);
  });

  it("sends Tornado and Twister in a straight path through enemies to the screen edge", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Tornado", "Twister"];
    component.skillLevels = { Tornado: 1, Twister: 1 };
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any;
    const far = { kind: "normal", species: "fallen", spriteFrame: 0, x: 410, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any;
    component.enemies = [near, far];

    for (const skill of ["Tornado", "Twister"]) {
      near.hp = 100;
      far.hp = 100;
      component.attackProjectiles = [];
      (component as any).rebuildEnemyGrid();
      component.activateOwnedSkill(skill);
      const projectile = component.attackProjectiles[0];

      expect(projectile).toBeDefined();
      expect(projectile.pathHit).toBe(true);
      expect(projectile.target).toBeUndefined();
      expect(projectile.homing).toBe(false);
      expect(Math.hypot(projectile.targetX - projectile.startX, projectile.targetY - projectile.startY)).toBeGreaterThan(
        Math.hypot(far.x - projectile.startX, far.y - projectile.startY),
      );

      for (let frame = 0; frame < 300; frame += 1) (component as any).updateAttackProjectiles(16);
      (component as any).flushPendingDamage();

      expect(near.hp).toBeLessThan(100);
      expect(far.hp).toBeLessThan(100);
    }
  });

  it("keeps player attacks aimed at monsters instead of friendly summons", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.pendingLevelUps = 0;
    (component as any).attackCooldown = 0;
    const summon = {
      kind: "normal",
      species: "wolf",
      campaignBoss: false,
      spriteFrame: 0,
      summonType: "druid",
      summonSkill: "Summon Spirit Wolf",
      x: 252,
      y: 250,
      hp: 100,
      maxHp: 100,
      speed: 0,
      r: 12,
      dmg: 0,
    } as any;
    const monster = {
      kind: "normal",
      species: "fallen",
      campaignBoss: false,
      spriteFrame: 0,
      x: 265,
      y: 250,
      hp: 100,
      maxHp: 100,
      speed: 0,
      r: 12,
      dmg: 0,
    } as any;
    component.enemies = [summon, monster];

    component.attackNearestEnemy();

    expect(summon.hp).toBe(100);
    expect(monster.hp).toBeLessThan(100);

    summon.hp = 100;
    monster.hp = 100;
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();

    expect(summon.hp).toBe(100);
    expect(monster.hp).toBeLessThan(100);

    summon.hp = 100;
    component.enemies = [summon];
    (component as any).attackCooldown = 0;
    component.attackNearestEnemy();

    expect(summon.hp).toBe(100);
  });

  it("applies equipped attack speed to attack animation duration and cooldown", () => {
    component.basicAttackCooldown = 0.72;
    component.equipment.weapon = {
      id: "quick-weapon",
      name: "Quick Blade",
      rarity: "magic",
      slot: "weapon",
      desc: "A fast blade.",
      stats: { attackSpeedPercent: 50 },
    };

    expect(component.playerAttackSpeedMultiplier).toBe(1.5);
    (component as any).triggerAttackAnimation("amazonJab");
    // A blade now plays its own clip, so the lock follows whichever clip the weapon picked.
    expect((component as any).playerAttackLockRemaining).toBeCloseTo(
      ATTACK_CLIP_INFO[(component as any).attackAnimationStyle as keyof typeof ATTACK_CLIP_INFO].duration / 1.5,
      4,
    );
    expect((component as any).paladinAuraAttackCooldown()).toBeCloseTo(0.72 / 1.5, 4);
    expect(component.getItemStatText(component.equipment.weapon)).toContain("+50% Attack Speed");
  });

  it("selects attack motion from the equipped weapon rather than only the character class", () => {
    const trigger = (component as any).triggerAttackAnimation.bind(component);
    component.selectedClass = "paladin";
    component.equipment.weapon = { name: "War Pike", baseName: "War Pike", slot: "weapon" } as any;
    trigger();
    expect((component as any).attackAnimationStyle).toBe("amazonJab");

    component.equipment.weapon = { name: "War Hammer", baseName: "War Hammer", slot: "weapon" } as any;
    trigger();
    expect((component as any).attackAnimationStyle).toBe("maceSmash");

    component.equipment.weapon = { name: "Yew Wand", baseName: "Yew Wand", slot: "weapon", equipmentType: "wand" } as any;
    trigger();
    expect((component as any).attackAnimationStyle).toBe("necromancerCast");
  });

  /**
   * A minimal biped with real joint offsets. The class GLBs flatten their
   * skeleton onto RootNode, so the animation module solves joint positions from
   * bind transforms; a set of bones stacked at the origin cannot exercise it.
   */
  const buildBiped = (): { model: THREE.Group; bones: Record<string, THREE.Bone> } => {
    const model = new THREE.Group();
    const bones: Record<string, THREE.Bone> = {};
    const add = (name: string, x: number, y: number, z: number): THREE.Bone => {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.set(x, y, z);
      bones[name] = bone;
      model.add(bone);
      return bone;
    };
    add("pelvis_bind_jnt", 0, 0.95, 0);
    add("spine_01_bind_jnt", 0, 1.08, 0);
    add("spine_02_bind_jnt", 0, 1.24, 0);
    add("neck_bind_jnt", 0, 1.38, 0);
    add("head_bind_jnt", 0, 1.44, 0);
    for (const [prefix, side] of [["R", -1], ["L", 1]] as const) {
      add(`${prefix}_shoulder_bind_jnt`, side * 0.1, 1.34, 0);
      add(`${prefix}_upr_arm_bind_jnt`, side * 0.12, 1.33, 0);
      add(`${prefix}_lwr_arm_bind_jnt`, side * 0.42, 1.33, 0);
      add(`${prefix}_hand_bind_jnt`, side * 0.66, 1.33, 0);
      add(`${prefix}_leg_01_bind_jnt`, side * 0.09, 0.92, 0);
      add(`${prefix}_leg_02_bind_jnt`, side * 0.09, 0.52, 0);
      add(`${prefix}_leg_04_bind_jnt`, side * 0.09, 0.1, 0);
    }
    return { model, bones };
  };
  const boneDirection = (from: THREE.Bone, to: THREE.Bone): THREE.Vector3 =>
    to.getWorldPosition(new THREE.Vector3()).sub(from.getWorldPosition(new THREE.Vector3())).normalize();

  it("drives the Paladin's arms forward through a full strike instead of only leaning", () => {
    component.selectedClass = "paladin";
    const { model, bones } = buildBiped();
    const anchor = new THREE.Group();
    anchor.add(model);
    (component as any).characterModel = anchor;
    (component as any).characterRig = buildCharacterRig(model, "paladin");
    expect((component as any).characterRig.arms).toHaveSize(2);
    expect((component as any).characterRig.forearms).toHaveSize(2);

    (component as any).animatePlayerModel(16);
    const restRight = boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]);
    const restLeft = boneDirection(bones["L_upr_arm_bind_jnt"], bones["L_lwr_arm_bind_jnt"]);
    // The bind pose is a T-pose: both arms must hang by the time the first frame is posed.
    expect(restRight.y).toBeLessThan(-0.6);
    expect(restLeft.y).toBeLessThan(-0.6);

    (component as any).triggerAttackAnimation("paladinStrike");
    (component as any).animatePlayerModel(210);
    const strikeLeft = boneDirection(bones["L_upr_arm_bind_jnt"], bones["L_lwr_arm_bind_jnt"]);
    const strikeRight = boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]);
    expect(strikeLeft.angleTo(restLeft)).toBeGreaterThan(0.5);
    // The off arm braces too, so it is not a single rigid shoulder.
    expect(strikeRight.angleTo(restRight)).toBeGreaterThan(0.05);

    (component as any).triggerAttackAnimation("maceSmash");
    (component as any).animatePlayerModel(320);
    const smashRight = boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]);
    expect(smashRight.angleTo(restRight)).toBeGreaterThan(0.5);
  });

  it("relaxes the idle arms when the hero is not holding a weapon", () => {
    const { model, bones } = buildBiped();
    const rig = buildCharacterRig(model, "paladin");
    const sample = (weaponless: boolean) => {
      poseCharacterRig(rig, {
        time: 0,
        walkPhase: 0,
        walk: 0,
        attackTime: Number.POSITIVE_INFINITY,
        attackSide: -1,
        gait: gaitForClass("paladin"),
        weaponless,
      });
      return {
        arm: boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]),
        forearm: boneDirection(bones["R_lwr_arm_bind_jnt"], bones["R_hand_bind_jnt"]),
      };
    };

    const armed = sample(false);
    const unarmed = sample(true);
    // Empty hands should hang down instead of being carried forward as though
    // they were still wrapped around a weapon grip.
    expect(unarmed.arm.y).toBeLessThan(-0.95);
    expect(unarmed.arm.z).toBeLessThan(armed.arm.z - 0.1);
    expect(unarmed.forearm.y).toBeLessThan(-0.8);
    expect(unarmed.forearm.z).toBeGreaterThan(0);
    expect(unarmed.arm.x).toBeLessThan(0);
  });

  it("uses the relaxed idle stance only while no weapon is equipped", () => {
    component.selectedClass = "paladin";
    const { model } = buildBiped();
    const anchor = new THREE.Group();
    anchor.add(model);
    (component as any).characterModel = anchor;

    expect((component as any).playerIsWeaponless).toBeTrue();
    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    expect((component as any).playerIsWeaponless).toBeFalse();
  });

  it("lowers the Sorceress arms at rest and swings them through her cast", () => {
    component.selectedClass = "sorceress";
    const { model, bones } = buildBiped();
    const anchor = new THREE.Group();
    anchor.add(model);
    (component as any).characterModel = anchor;
    (component as any).characterRig = buildCharacterRig(model, "sorceress");

    (component as any).animatePlayerModel(16);
    const restRight = boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]);
    const restLeft = boneDirection(bones["L_upr_arm_bind_jnt"], bones["L_lwr_arm_bind_jnt"]);
    expect(restRight.y).toBeLessThan(-0.6);
    expect(restLeft.y).toBeLessThan(-0.6);

    (component as any).triggerAttackAnimation("sorceressCast");
    (component as any).animatePlayerModel(270);
    const castRight = boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]);
    const castForearm = boneDirection(bones["R_lwr_arm_bind_jnt"], bones["R_hand_bind_jnt"]);
    expect(castRight.angleTo(restRight)).toBeGreaterThan(0.4);
    // The elbow folds as the cast pushes forward.
    expect(castForearm.angleTo(new THREE.Vector3(0, -1, 0))).toBeGreaterThan(0.2);
    expect(boneDirection(bones["L_upr_arm_bind_jnt"], bones["L_lwr_arm_bind_jnt"]).angleTo(restLeft)).toBeGreaterThan(0.15);
  });

  it("lowers the Necromancer arms and swings both through a curse cast", () => {
    component.selectedClass = "necromancer";
    const { model, bones } = buildBiped();
    const anchor = new THREE.Group();
    anchor.add(model);
    (component as any).characterModel = anchor;
    (component as any).characterRig = buildCharacterRig(model, "necromancer");

    (component as any).animatePlayerModel(16);
    const restRight = boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]);
    expect(restRight.y).toBeLessThan(-0.5);

    (component as any).triggerAttackAnimation("necromancerCast");
    (component as any).animatePlayerModel(270);
    expect(boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]).angleTo(restRight)).toBeGreaterThan(0.15);
    expect((component as any).attackAnimationTime).toBeCloseTo(0.27, 4);
  });

  it("updates the character weapon visual on equip and unequip", () => {
    const model = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "R_weapon_attach";
    model.add(hand);
    const baseWeapon = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.01, 0.001), new THREE.MeshStandardMaterial());
    baseWeapon.name = "pikeShape_0";
    model.add(baseWeapon);

    (component as any).configureClassMeleeWeapon(model, "amazon");
    expect(baseWeapon.visible).toBeTrue();
    expect(hand.children.some((child) => child.name.startsWith("equipped_weapon_"))).toBeFalse();

    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    (component as any).configureClassMeleeWeapon(model, "amazon");
    const equippedWeapon = hand.children.find((child) => child.name === "equipped_weapon_weapon");
    expect(baseWeapon.visible).toBeFalse();
    expect(equippedWeapon).toBeDefined();

    component.equipment.weapon = null;
    (component as any).configureClassMeleeWeapon(model, "amazon");
    expect(baseWeapon.visible).toBeTrue();
    expect(hand.children.some((child) => child.name.startsWith("equipped_weapon_"))).toBeFalse();
  });

  it("shows and removes an equipped shield at the off-hand attachment", () => {
    const model = new THREE.Group();
    const shieldAttach = new THREE.Bone();
    shieldAttach.name = "shield_attach";
    model.add(shieldAttach);

    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor" } as any;
    (component as any).configureClassMeleeWeapon(model, "paladin");

    const shield = shieldAttach.children.find((child) => child.name === "equipped_shield_shield");
    expect(shield).toBeDefined();
    // The shield is built from the original item cel once its art finishes
    // loading; without a cached texture the group starts empty.
    expect(shield?.children.length).toBe(0);

    component.equipment.shield = null;
    (component as any).configureClassMeleeWeapon(model, "paladin");
    expect(shieldAttach.children.some((child) => child.name.startsWith("equipped_shield_"))).toBeFalse();
  });

  it("mounts the original item art on held weapons and shields", () => {
    const weaponItem = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    const shieldItem = { name: "Buckler", baseName: "Buckler", slot: "armor" } as any;
    component.equipment.weapon = weaponItem;
    component.equipment.shield = shieldItem;

    const weaponArt = new THREE.Texture();
    weaponArt.image = { width: 23, height: 111 };
    const shieldArt = new THREE.Texture();
    shieldArt.image = { width: 44, height: 51 };
    (component as any).equippedItemArtTextures.set(component.inventoryItemImage(weaponItem), weaponArt);
    (component as any).equippedItemArtTextures.set(component.inventoryItemImage(shieldItem), shieldArt);

    const model = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "R_weapon_attach";
    const shieldAttach = new THREE.Bone();
    shieldAttach.name = "shield_attach";
    model.add(hand, shieldAttach);

    (component as any).configureClassMeleeWeapon(model, "paladin");

    const weapon = hand.children.find((child) => child.name === "equipped_weapon_weapon");
    expect(weapon?.children.length).toBe(1);
    expect(weapon?.children.every((child) => (child as THREE.Mesh).geometry instanceof THREE.PlaneGeometry)).toBeTrue();

    const shield = shieldAttach.children.find((child) => child.name === "equipped_shield_shield");
    expect(shield?.children.length).toBe(3);
    expect(shield?.children.every((child) => (child as THREE.Mesh).geometry instanceof THREE.PlaneGeometry)).toBeTrue();
  });

  it("lets Barbarians equip an off-hand weapon or shield, and renders a second weapon on the left hand", () => {
    component.selectedClass = "barbarian";
    component.equipment.weapon = { id: "main", name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    component.inventory[0] = { id: "offhand", name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;

    component.equipSelectedItem(0);
    expect(component.equipment.weapon?.id).toBe("main");
    expect(component.equipment.shield?.id).toBe("offhand");
    expect(component.equippedWeaponDamage).toBe(0);

    const model = new THREE.Group();
    const mainHand = new THREE.Bone();
    mainHand.name = "R_weapon_attach";
    const offhand = new THREE.Bone();
    offhand.name = "L_weapon_attach";
    model.add(mainHand, offhand);
    (component as any).configureClassMeleeWeapon(model, "barbarian");

    expect(mainHand.children.some((child) => child.name === "equipped_weapon_weapon")).toBeTrue();
    expect(offhand.children.some((child) => child.name === "equipped_weapon_offhand_weapon")).toBeTrue();

    component.equipment.shield = null;
    (component as any).configureClassMeleeWeapon(model, "barbarian");
    expect(offhand.children.some((child) => child.name.startsWith("equipped_weapon_offhand_") || child.name.startsWith("equipped_shield_"))).toBeFalse();

    component.equipment.shield = { id: "offhand", name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;
    component.inventory[1] = { id: "shield", name: "Buckler", baseName: "Buckler", slot: "armor" } as any;
    component.equipSelectedItem(1, "shield");
    expect((component.equipment as any).shield?.id).toBe("shield");
    expect(component.inventory[1]?.id).toBe("offhand");

    component.selectedClass = "paladin";
    component.inventory[2] = { id: "not-allowed", name: "Mace", baseName: "Mace", slot: "weapon" } as any;
    component.equipSelectedItem(2, "shield");
    expect((component.equipment as any).shield?.id).toBe("shield");
    expect(component.inventoryStatus).toContain("cannot be equipped");
  });

  it("blocks an off-hand weapon or shield while a bow is equipped", () => {
    component.selectedClass = "barbarian";
    component.playerLevel = 30;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: { id: "bow", name: "Short Bow", baseName: "Short Bow", slot: "weapon", equipmentType: "weapon" } as any, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = { id: "axe", name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", equipmentType: "weapon", requiredLevel: 1 } as any;
    component.inventory[1] = { id: "buckler", name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield", requiredLevel: 1 } as any;
    component.inventory[2] = { id: "offhand-bow", name: "Long Bow", baseName: "Long Bow", slot: "weapon", equipmentType: "weapon", requiredLevel: 1 } as any;

    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("axe");
    expect(component.inventoryStatus).toContain("two-handed");

    component.equipSelectedItem(1);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[1]?.id).toBe("buckler");
    expect(component.inventoryStatus).toContain("two-handed");

    component.equipSelectedItem(2, "shield");
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[2]?.id).toBe("offhand-bow");
    expect(component.inventoryStatus).toContain("two-handed");
  });

  it("blocks equipping a bow while a shield or off-hand weapon is equipped", () => {
    component.selectedClass = "amazon";
    component.playerLevel = 30;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: null, helmet: null, shield: { id: "buckler", name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield", requiredLevel: 1 } as any, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = { id: "bow", name: "Long Bow", baseName: "Long Bow", slot: "weapon", equipmentType: "weapon", requiredLevel: 1 } as any;

    component.equipSelectedItem(0);
    expect(component.equipment.weapon).toBeNull();
    expect(component.equipment.shield?.id).toBe("buckler");
    expect(component.inventory[0]?.id).toBe("bow");
    expect(component.inventoryStatus).toContain("two-handed");

    component.selectedClass = "barbarian";
    component.equipment = { weapon: { id: "sword", name: "Short Sword", baseName: "Short Sword", slot: "weapon", equipmentType: "weapon" } as any, helmet: null, shield: { id: "axe", name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", equipmentType: "weapon" } as any, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.equipSelectedItem(0);
    expect(component.equipment.weapon?.id).toBe("sword");
    expect(component.equipment.shield?.id).toBe("axe");
    expect(component.inventory[0]?.id).toBe("bow");
  });

  it("swaps a bow into the weapon slot when the off hand is empty", () => {
    component.selectedClass = "barbarian";
    component.playerLevel = 30;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: { id: "sword", name: "Short Sword", baseName: "Short Sword", slot: "weapon", equipmentType: "weapon" } as any, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = { id: "bow", name: "Long Bow", baseName: "Long Bow", slot: "weapon", equipmentType: "weapon" } as any;

    component.equipSelectedItem(0);
    expect(component.equipment.weapon?.id).toBe("bow");
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory.some((item) => item?.id === "sword")).toBeTrue();
  });

  it("hides stat previews for bow swaps that the two-handed rule blocks", () => {
    component.selectedClass = "paladin";
    component.playerLevel = 30;
    component.equipment = { weapon: null, helmet: null, shield: { id: "buckler", name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    const bow = { id: "bow", name: "Long Bow", baseName: "Long Bow", slot: "weapon", equipmentType: "weapon", stats: { damageMin: 10, damageMax: 20 } } as any;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = bow;
    component.hoveredItem = bow;
    component.hoveredSlotIndex = 0;

    expect(component.getPreviewItemStatDelta("damage")).toBeNull();
    component.equipment.shield = null;
    expect(component.getPreviewItemStatDelta("damage")).not.toBeNull();
  });

  it("marks a bow as two-handed in its tooltip, but not a one-handed weapon", () => {
    const bow = { id: "bow", name: "Long Bow", baseName: "Long Bow", slot: "weapon", equipmentType: "weapon", stats: { damageMin: 5, damageMax: 11 } } as any;
    const sword = { id: "sword", name: "Short Sword", baseName: "Short Sword", slot: "weapon", equipmentType: "weapon", stats: { damageMin: 3, damageMax: 8 } } as any;

    const bowLines = component.itemStatText(bow);
    expect(bowLines[0]).toBe("Damage: 5 to 11");
    expect(bowLines[1]).toBe("Two-Handed — occupies both hands");
    expect(component.itemStatText(sword)).not.toContain("Two-Handed — occupies both hands");
  });

  it("treats great axes as two-handed and locks the off hand", () => {
    component.selectedClass = "barbarian";
    component.playerLevel = 30;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    const greatAxe = { id: "great-axe", name: "Great Axe", baseName: "Great Axe", rarity: "normal", slot: "weapon", equipmentType: "weapon", requiredLevel: 1, stats: { damageMin: 8, damageMax: 16 }, desc: "A towering axe." } as any;
    const shield = { id: "great-axe-test-shield", name: "Buckler", baseName: "Buckler", rarity: "normal", slot: "armor", equipmentType: "shield", requiredLevel: 1, desc: "A shield." } as any;

    expect(component.itemStatText(greatAxe)).toContain("Two-Handed — occupies both hands");

    component.equipment.weapon = greatAxe;
    component.inventory[0] = shield;
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("great-axe-test-shield");
    expect(component.inventoryStatus).toContain("two-handed");

    component.equipment.weapon = null;
    component.equipment.shield = shield;
    component.inventory[0] = null;
    component.inventory[1] = greatAxe;
    component.equipSelectedItem(1);
    expect(component.equipment.weapon).toBeNull();
    expect(component.inventory[1]?.id).toBe("great-axe");
    expect(component.inventoryStatus).toContain("two-handed");
  });

  it("treats every pike as two-handed and locks the off hand", () => {
    component.selectedClass = "barbarian";
    component.playerLevel = 30;
    const pike = { id: "war-pike", name: "War Pike", baseName: "War Pike", rarity: "normal", slot: "weapon", equipmentType: "weapon", requiredLevel: 1, stats: { damageMin: 5, damageMax: 12 }, desc: "A long polearm." } as any;
    const shield = { id: "pike-test-shield", name: "Buckler", baseName: "Buckler", rarity: "normal", slot: "armor", equipmentType: "shield", requiredLevel: 1, desc: "A shield." } as any;

    for (const name of ["Pike", "War Pike", "Maiden Pike", "Ceremonial Pike", "Matriarchal Pike", "Stygian Pike"]) {
      const item = { ...pike, id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: name };
      expect(component.itemStatText(item)).toContain("Two-Handed — occupies both hands");
    }

    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: pike, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = shield;
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("pike-test-shield");
    expect(component.inventoryStatus).toContain("two-handed");

    component.equipment = { weapon: null, helmet: null, shield, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = pike;
    component.equipSelectedItem(0);
    expect(component.equipment.weapon).toBeNull();
    expect(component.equipment.shield?.id).toBe("pike-test-shield");
    expect(component.inventory[0]?.id).toBe("war-pike");
    expect(component.inventoryStatus).toContain("two-handed");
  });

  it("treats staves as two-handed while keeping sorceress orbs one-handed", () => {
    component.selectedClass = "sorceress";
    component.playerLevel = 30;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    const staff = { id: "staff", name: "Bane Ash", baseName: "Short Staff", rarity: "unique", slot: "weapon", equipmentType: "weapon", requiredLevel: 1, desc: "A staff." } as any;
    const orb = { id: "orb", name: "Eagle Orb", baseName: "Eagle Orb", rarity: "normal", slot: "weapon", equipmentType: "orb", restrictedClass: "sorceress", requiredLevel: 1, desc: "An orb." } as any;
    const shield = { id: "shield", name: "Buckler", baseName: "Buckler", rarity: "normal", slot: "armor", equipmentType: "shield", requiredLevel: 1, desc: "A shield." } as any;

    expect(component.itemStatText(staff)).toContain("Two-Handed — occupies both hands");
    expect(component.itemStatText(orb)).not.toContain("Two-Handed — occupies both hands");

    component.equipment.weapon = staff;
    component.inventory[0] = shield;
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("shield");
    expect(component.inventoryStatus).toContain("two-handed");

    component.equipment.weapon = null;
    component.equipment.shield = shield;
    component.inventory[0] = null;
    component.inventory[1] = staff;
    component.equipSelectedItem(1);
    expect(component.equipment.weapon).toBeNull();
    expect(component.inventory[1]?.id).toBe("staff");
    expect(component.inventoryStatus).toContain("two-handed");

    component.inventory[1] = null;
    component.inventory[20] = orb;
    component.equipSelectedItem(20);
    expect((component.equipment as any).weapon?.id).toBe("orb");
    expect(component.equipment.shield?.id).toBe("shield");
  });

  it("shows a set piece's exact equip refusal next to the Equip button", () => {
    component.selectedClass = "paladin";
    component.playerLevel = 99;
    const aldurs = (component as any).createNamedItem(
      D2_SET_ITEMS.find((entry) => entry.name === "Aldur's Stony Gaze")!, "set");
    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = aldurs;

    const reason = component.equipBlockReason(aldurs);
    expect(reason).toContain("Aldur's Stony Gaze is restricted to druids and cannot be equipped by Paladin.");

    component.inventoryStatus = "";
    component.equipSelectedItem(0);
    expect(component.equipment.helmet).toBeNull();
    expect(component.inventoryStatus).toBe(reason!);
  });

  it("moves a saved off-hand item out of the way when the saved weapon is a bow", () => {
    const bow = { id: "saved-bow", name: "Witherstring", baseName: "Hunter's Bow", rarity: "unique", slot: "weapon", equipmentType: "weapon", desc: "A unique bow." } as any;
    const shield = { id: "saved-shield", name: "Buckler", baseName: "Buckler", rarity: "normal", slot: "armor", equipmentType: "shield", desc: "A shield." } as any;
    (component as any).characterProfiles["amazon"] = {
      gold: 0,
      inventory: [],
      equipment: { weapon: bow, helmet: null, shield, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null },
      beltSlots: Array.from({ length: 16 }, () => ({ kind: null })),
    };
    component.sanctuaryStash = [];

    (component as any).loadCharacterProfile("amazon");

    expect(component.equipment.weapon?.id).toBe("saved-bow");
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory.some((item) => item?.id === "saved-shield") || component.sanctuaryStash.some((item) => item.id === "saved-shield")).toBeTrue();
  });

  it("shows a shield icon for the empty shield slot on every class", () => {
    const classes = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"] as const;

    for (const classId of classes) {
      component.selectedClass = classId as typeof component.selectedClass;
      const expected = classId === "paladin" ? "paladin-shield.png"
        : classId === "necromancer" ? "necromancer-head.png" : "shield.png";
      expect(component.equipmentSlotImage("shield")).toContain(expected);
    }
  });

  it("equips a Necromancer head as a class-restricted shield and uses its original D2 cel", () => {
    const head = {
      id: "preserved-head", name: "Preserved Head", baseName: "Preserved Head", rarity: "normal",
      slot: "armor", equipmentType: "necromancerHead", restrictedClass: "necromancer",
      requiredLevel: 3, desc: "A Necromancer-only shrunken head.",
      stats: { armor: 4, requiresStrength: 12 },
    } as any;
    component.selectedClass = "necromancer";
    component.playerLevel = 30;
    component.equipment.shield = null;
    component.inventory[0] = head;
    (component as any).rebuildInventoryGrid();

    expect(component.equipmentSlotImage("shield")).toContain("necromancer-head.png");
    expect(component.inventoryItemImage(head)).toContain("items/d2/invne1.png");
    component.equipSelectedItem(0);
    expect((component.equipment.shield as any)?.id).toBe("preserved-head");
    expect((component as any).hasEquippedShield()).toBeTrue();

    component.selectedClass = "paladin";
    component.equipment.shield = null;
    component.inventory[0] = head;
    (component as any).rebuildInventoryGrid();
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventoryStatus).toContain("restricted to necromancers");
  });

  it("lets every class equip a great sword", () => {
    const classes = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"] as const;

    for (const classId of classes) {
      component.selectedClass = classId as typeof component.selectedClass;
      component.playerLevel = 30;
      component.equipment.weapon = null;
      component.equipment.shield = null;
      component.inventory[0] = {
        id: `great-sword-${classId}`, name: "Great Sword", baseName: "Great Sword", rarity: "normal",
        slot: "weapon", requiredLevel: 1, desc: "A massive great sword that any class can wield.",
        stats: { damageMin: 8, damageMax: 17 },
      } as any;
      (component as any).rebuildInventoryGrid();
      component.equipSelectedItem(0);
      expect((component.equipment.weapon as any)?.baseName).toBe("Great Sword");
    }
  });

  it("recognizes a named shrunken head saved as a generic shield", () => {
    const homunculus = {
      id: "homunculus", name: "Homunculus", baseName: "Heirophant Trophy", rarity: "unique",
      slot: "armor", equipmentType: "shield", requiredLevel: 42,
      desc: "A unique shrunken head.", stats: { armor: 60 },
    } as any;
    component.playerLevel = 99;
    component.selectedClass = "paladin";
    component.equipment.shield = null;
    component.inventory[0] = homunculus;
    (component as any).rebuildInventoryGrid();
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventoryStatus).toContain("restricted to its class");

    component.selectedClass = "necromancer";
    component.equipment.shield = null;
    component.inventory[0] = homunculus;
    (component as any).rebuildInventoryGrid();
    component.equipSelectedItem(0);
    expect((component.equipment.shield as any)?.id).toBe("homunculus");
  });

  it("includes Barbarian off-hand weapon damage and mastery in the equipped attack damage", () => {
    component.selectedClass = "barbarian";
    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon", stats: { damageMin: 4, damageMax: 8 } } as any;
    component.equipment.shield = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", stats: { damageMin: 6, damageMax: 10 } } as any;
    expect(component.equippedWeaponDamage).toBe(14);
  });

  it("requires an equipped bow for Amazon bow skills and a javelin for javelin skills", () => {
    component.selectedClass = "amazon";
    expect((component as any).hasRequiredWeaponForSkill("Fire Arrow")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Poison Javelin")).toBeFalse();

    component.equipment.weapon = { name: "Short Bow", baseName: "Short Bow", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Fire Arrow")).toBeTrue();
    expect((component as any).hasRequiredWeaponForSkill("Poison Javelin")).toBeFalse();

    component.equipment.weapon = { name: "Javelin", baseName: "Javelin", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Poison Javelin")).toBeTrue();
    expect((component as any).hasRequiredWeaponForSkill("Fire Arrow")).toBeFalse();
  });

  it("requires an equipped shield to use Smite", () => {
    component.selectedClass = "paladin";
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeFalse();

    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeFalse();
    expect(component.getSkillRequirementLabel("Smite")).toBe("Requires a shield equipped");

    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeTrue();
    expect(component.getSkillRequirementLabel("Smite")).toBe("");

    component.equipment.shield = { name: "Targe", baseName: "Targe", slot: "armor", equipmentType: "paladinShield" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeTrue();

    // A Barbarian's off-hand weapon is not a shield.
    component.equipment.shield = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeFalse();
  });

  it("knocks back and stuns enemies hit by Smite", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Smite"];
    component.skillLevels = { Smite: 1 };
    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    const front = { kind: "normal", species: "fallen", spriteFrame: 0, x: 310, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const behind = { kind: "normal", species: "fallen", spriteFrame: 0, x: 190, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [front, behind];
    component.floatingTexts = [];

    component.activateOwnedSkill("Smite");

    expect(front.x).toBeGreaterThan(310);
    expect(front.stunRemaining).toBeGreaterThan(0);
    expect(behind.x).toBe(190);
    expect(behind.stunRemaining).toBeUndefined();
    (component as any).flushPendingDamage();
    expect(front.hp).toBeLessThan(100);
  });

  it("does not shove or stun act bosses hit by Smite", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Smite"];
    component.skillLevels = { Smite: 1 };
    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    const boss = {
      kind: "boss", species: "andariel", campaignBoss: true, spriteFrame: 0,
      x: 310, y: 250, hp: 1000, maxHp: 1000, speed: 90, r: 34, dmg: 20, cd: 0,
    } as any;
    component.enemies = [boss];
    component.floatingTexts = [];

    component.activateOwnedSkill("Smite");

    expect(boss.x).toBe(310);
    expect(boss.y).toBe(250);
    expect(boss.stunRemaining).toBeUndefined();
    expect(component.floatingTexts.some((entry) => entry.text === "STUN")).toBeFalse();
    (component as any).flushPendingDamage();
    expect(boss.hp).toBeLessThan(1000);
  });

  it("stuns every enemy caught in Psychic Hammer's rank-scaled blast", () => {
    component.selectedClass = "assassin";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Psychic Hammer"];
    component.skillLevels = { "Psychic Hammer": 1 };
    const primary = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const nearby = { ...primary, x: 326 };
    const outside = { ...primary, x: 420 };
    component.enemies = [primary, nearby, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Psychic Hammer");

    const blast = component.attackProjectiles[0];
    expect(blast.impactRadius).toBe(38);
    expect(blast.impactStunSeconds).toBeCloseTo(1.4);
    for (let frame = 0; frame < 30; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(primary.hp).toBeLessThan(100);
    expect(nearby.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    expect(primary.stunRemaining).toBeCloseTo(1.4);
    expect(nearby.stunRemaining).toBeCloseTo(1.4);
    expect(outside.stunRemaining).toBeUndefined();
    expect((component as any).getSkillRankStats("Psychic Hammer", "projectile", 1)).toContain("Stun duration: 1.4s");
    expect((component as any).getSkillRankStats("Psychic Hammer", "projectile", 1)).toContain("Blast radius: 38 units");

    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any];
    component.skillLevels = { "Psychic Hammer": 5 };
    component.attackProjectiles = [];
    component.activateOwnedSkill("Psychic Hammer");
    expect(component.attackProjectiles[0].impactRadius).toBe(50);
    expect(component.attackProjectiles[0].impactStunSeconds).toBeCloseTo(1.8);
  });

  it("leaps toward the enemy ahead and stuns the landing area", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    const front = { kind: "normal", species: "fallen", spriteFrame: 0, x: 330, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const nearLanding = { ...front, y: 290 };
    const behind = { ...front, x: 230 };
    const outside = { ...front, x: 380 };
    component.enemies = [front, nearLanding, behind, outside];
    (component as any).leapDustEffects.length = 0;

    component.activateOwnedSkill("Leap");

    expect((component as any).attackAnimationStyle).toBe("leap");
    expect((component as any).playerLeapRemaining).toBeCloseTo(ATTACK_CLIP_INFO.leap.duration);
    expect(front.stunRemaining).toBeUndefined();
    for (let frame = 0; frame < 80; frame += 1) (component as any).updatePlayerLeap(16);

    expect(front.x).toBeCloseTo(280);
    expect(front.stunRemaining).toBeGreaterThan(0);
    expect(nearLanding.stunRemaining).toBeGreaterThan(0);
    expect(behind.stunRemaining).toBeUndefined();
    expect(outside.stunRemaining).toBeUndefined();
    expect((component as any).playerLeapLift).toBe(0);
    expect((component as any).leapDustEffects.length).toBeGreaterThan(0);
  });

  it("keeps the barbarian invulnerable while airborne and stuns all nearby enemies on landing", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    const attacker = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 20, cd: 0 } as any;
    const nearLanding = { ...attacker, x: 300 };
    component.enemies = [attacker, nearLanding];
    component.playerMaxHp = 1000;
    component.playerHp = 100;

    component.activateOwnedSkill("Leap");
    expect((component as any).playerLeapRemaining).toBeGreaterThan(0);
    expect((component as any).getSkillRankStats("Leap", "movement", 1)).toContain("Invulnerable while airborne");

    (component as any).updateEnemies(16);
    expect(component.playerHp).toBe(100);
    expect(attacker.x).toBe(270);
    expect(nearLanding.x).toBe(300);
    expect((component as any).applyIncomingDamage(40)).toBe(0);

    for (let frame = 0; frame < 80; frame += 1) (component as any).updatePlayerLeap(16);

    expect((component as any).playerLeapRemaining).toBe(0);
    expect(attacker.stunRemaining).toBeGreaterThan(0);
    expect(nearLanding.stunRemaining).toBeGreaterThan(0);
  });

  it("prefers a leap target in front over a closer enemy behind", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.skillLevels = { Leap: 1 };
    const ahead = { kind: "normal", species: "fallen", spriteFrame: 0, x: 330, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const behind = { ...ahead, x: 230 };

    component.enemies = [behind, ahead];
    expect((component as any).findLeapTarget()).toBe(ahead);

    component.enemies = [behind];
    expect((component as any).findLeapTarget()).toBe(behind);
  });

  it("cancels Leap without starting a cooldown when no enemy is in range", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 450, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any];
    expect((component as any).findLeapTarget()).toBeUndefined();

    component.activateOwnedSkill("Leap");
    expect((component as any).playerLeapRemaining).toBe(0);
    (component as any).updateAutomaticSkillCasts(16);

    expect((component as any).playerLeapRemaining).toBe(0);
    expect(component.skillCastCooldowns["Leap"] ?? 0).toBe(0);
    expect((component as any).getSkillRankStats("Leap", "movement", 1)).toContain("Leap range: 112 units");
    expect((component as any).getSkillRankStats("Leap", "movement", 1)).toContain("Landing stun: 1.2s in a 52-unit radius");
  });

  it("fears nearby enemies away from the barbarian for a rank-scaled duration", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Howl"];
    component.skillLevels = { Howl: 1 };
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 330, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const far = { ...near, x: 520 };
    component.enemies = [near, far];
    component.floatingTexts = [];

    component.activateOwnedSkill("Howl");

    expect(near.fearRemaining).toBeCloseTo(2.4);
    expect(far.fearRemaining).toBeUndefined();
    expect(near.hp).toBe(100);
    expect(component.floatingTexts.some((entry) => entry.text.includes("TERRIFIED"))).toBeTrue();
    expect((component as any).getSkillRankStats("Howl", "wave", 1)).toContain("Fear duration: 2.4s");

    component.skillLevels = { Howl: 5 };
    component.activateOwnedSkill("Howl");
    expect(near.fearRemaining).toBeCloseTo(3.2);
  });

  it("makes feared enemies run away and prevents their attacks", () => {
    component.playerX = 250;
    component.playerY = 250;
    const enemy = {
      kind: "normal",
      species: "fallen",
      spriteFrame: 0,
      x: 270,
      y: 250,
      hp: 100,
      maxHp: 100,
      speed: 100,
      r: 14,
      dmg: 2,
      cd: 0,
      fearRemaining: 2,
    } as any;
    component.enemies = [enemy];
    const hpBefore = component.playerHp;

    component.updateEnemies(100);

    expect(enemy.x).toBeGreaterThan(270);
    expect(enemy.animationState).toBe("move");
    expect(enemy.fearRemaining).toBeLessThan(2);
    expect(component.playerHp).toBe(hpBefore);
  });

  it("stuns the nearest enemy when Telekinesis is cast", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Telekinesis"];
    component.skillLevels = { Telekinesis: 1 };
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 310, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const far = { ...near, x: 500 };
    component.enemies = [near, far];
    component.floatingTexts = [];

    component.activateOwnedSkill("Telekinesis");

    expect(near.stunRemaining).toBeCloseTo(1.2);
    expect(far.stunRemaining).toBeUndefined();
    expect((component as any).getSkillRankStats("Telekinesis", "strike", 1)).toContain("Pickup reach: +40%");
    expect((component as any).getSkillRankStats("Telekinesis", "strike", 1)).toContain("Stun duration: 1.2s");
  });

  it("extends ground pickup reach while Telekinesis is learned", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.skillLevels = {};
    expect((component as any).groundPickupRadius(30)).toBe(30);

    component.itemDrops = [{
      x: 285,
      y: 250,
      item: {
        id: "telekinesis-drop", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
        slot: "weapon", desc: "A sword.", stats: { damageMin: 2, damageMax: 5 },
      } as any,
      bob: 0,
      life: 30,
      pickupDelay: 0,
      notifiedFull: false,
    }];
    component.updateItemDrops(16);
    expect(component.itemDrops).toHaveSize(1);

    component.skillLevels = { Telekinesis: 1 };
    expect((component as any).groundPickupRadius(30)).toBeCloseTo(42);
    component.updateItemDrops(16);

    expect(component.itemDrops).toHaveSize(0);
    expect(component.inventory.filter(Boolean)).toHaveSize(1);
  });

  it("passively teleports away when a Sorceress with Teleport is hit", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerHp = 100;
    component.playerX = 250;
    component.playerY = 250;
    component.skillLevels = { Teleport: 20 };
    const attacker = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 10 } as any;
    component.enemies = [attacker];
    spyOn(Math, "random").and.returnValue(0);

    const damage = (component as any).applyIncomingDamage(10, attacker);

    expect(damage).toBeGreaterThan(0);
    expect(attacker.x).toBeGreaterThan(300);
    expect((component as any).getSkillRankStats("Teleport", "passive", 20)).toContain("48% chance to teleport away when hit");
    expect((component as any).getSkillRankStats("Teleport", "passive", 20)).toContain("Moves to a random visible location away from the attacker");
  });

  it("does not teleport when the Teleport passive roll fails", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerHp = 100;
    component.skillLevels = { Teleport: 1 };
    const attacker = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 10 } as any;
    component.enemies = [attacker];
    spyOn(Math, "random").and.returnValue(0.99);

    (component as any).applyIncomingDamage(10, attacker);

    expect(attacker.x).toBe(300);
    expect((component as any).teleportChanceForRank(1)).toBeCloseTo(0.1);
    expect((component as any).teleportChanceForRank(20)).toBeCloseTo(0.48);
  });

  it("draws the extracted stun overlay above a stunned monster", () => {
    const image = (component as any).stunOverlayImage as HTMLImageElement;
    Object.defineProperty(image, "complete", { configurable: true, value: true });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 828 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 49 });
    const calls: unknown[][] = [];
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      drawImage: (...args: unknown[]) => calls.push(args),
    } as unknown as CanvasRenderingContext2D;
    component.runTime = 2;

    (component as any).drawEnemyStun(ctx, { x: 250, y: 300 }, 100);

    expect(calls).toHaveSize(1);
    const args = calls[0] as any[];
    expect(args[1]).toBeGreaterThanOrEqual(0);
    expect(args[1] % 69).toBe(0);
    expect(args[2]).toBe(0);
    expect(args[3]).toBe(69);
    expect(args[4]).toBe(49);
    expect(args[7]).toBeGreaterThan(30);
  });

  it("deals Fire Blast damage across the area where its explosion lands", () => {
    component.selectedClass = "assassin";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Fire Blast"];
    component.skillLevels = { "Fire Blast": 1 };
    const primary = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const nearby = { ...primary, x: 326 };
    const outside = { ...primary, x: 420 };
    component.enemies = [primary, nearby, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Fire Blast");

    const blast = component.attackProjectiles[0];
    expect(blast.missileId).toBe("d2-fsexplode");
    expect(blast.kind).toBe("fire");
    expect(blast.impactRadius).toBe(40);
    for (let frame = 0; frame < 30; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(primary.hp).toBeLessThan(100);
    expect(nearby.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
  });

  it("sends the Charged Bolt fan across the whole view and spends each bolt on its first hit", () => {
    component.selectedClass = "sorceress";
    component.playerX = 100;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 500, y: 242, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    (component as any).rebuildEnemyGrid();
    component.attackProjectiles = [];

    component.activateOwnedSkill("Charged Bolt");

    const bolts = component.attackProjectiles;
    expect(bolts).toHaveSize(5);
    for (const bolt of bolts) {
      // Nothing is targeted, so every bolt is aimed a full view away and must
      // find its own first collision along that line.
      expect(bolt.target).toBeUndefined();
      expect(bolt.pathHit).toBeTrue();
      expect(bolt.stopOnFirstHit).toBeTrue();
      const reach = Math.hypot(bolt.targetX - component.playerX, bolt.targetY - (component.playerY - 8));
      expect(reach).toBeGreaterThan(600);
    }

    const firstBolt = bolts[0];
    const otherBolts = bolts.slice(1);
    const directionX = firstBolt.targetX - firstBolt.x;
    const directionY = firstBolt.targetY - firstBolt.y;
    const directionLength = Math.hypot(directionX, directionY);
    const targetDistance = 300;
    target.x = firstBolt.x + directionX / directionLength * targetDistance;
    target.y = firstBolt.y + directionY / directionLength * targetDistance;
    (component as any).rebuildEnemyGrid();

    const travelSeconds = targetDistance * (component as any).worldZoom / 360 + 0.1;
    (component as any).updateAttackProjectiles(travelSeconds * 1000);
    (component as any).flushPendingDamage();

    expect(target.hp).toBeLessThan(100);
    expect(firstBolt.life).toBe(0);
    expect(otherBolts.every((bolt) => bolt.life > 0)).toBeTrue();
    expect(otherBolts.every((bolt) => bolt.x > 100)).toBeTrue();
  });

  it("sells pack gear to Gheed and never offers the gear the hero is wearing", () => {
    component.selectedClass = "sorceress";
    component.sanctuaryGold = 0;
    component.playerGold = 0;
    (component as any).characterProfiles = {};
    component.hasSavedRun = false;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    const packItem = { id: "pack-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal", slot: "weapon", desc: "A blade." } as any;
    component.inventory[0] = packItem;
    const wornHelm = { id: "worn-helm", name: "Worn Helm", baseName: "Cap", rarity: "magic", slot: "armor", equipmentType: "helmet", desc: "A cap." } as any;
    component.equipment.helmet = wornHelm;

    const entries = component.shopItemsForSale;
    expect(entries.some((entry) => entry.item.id === wornHelm.id)).toBeFalse();
    const entry = entries.find((row) => row.item.id === packItem.id);
    expect(entry).toBeDefined();

    const value = component.getItemSellValue(packItem);
    // No character profile and no saved run: selling must still work.
    component.sellShopItem(entry!);

    expect(component.inventory[0]).toBeNull();
    expect(component.sanctuaryGold).toBe(value);
    expect(component.shopMessage).toContain("sold to Gheed");
    expect(component.shopItemsForSale.some((row) => row.item.id === packItem.id)).toBeFalse();
    expect(component.equipment.helmet).toBe(wornHelm);
  });

  it("refuses to sell a piece of gear the hero has equipped", () => {
    component.selectedClass = "sorceress";
    component.sanctuaryGold = 0;
    const wornHelm = { id: "worn-helm", name: "Worn Helm", baseName: "Cap", rarity: "magic", slot: "armor", equipmentType: "helmet", desc: "A cap." } as any;
    component.equipment.helmet = wornHelm;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);

    component.sellShopItem({ item: wornHelm, source: "Pack", inventoryIndex: 0 });

    expect(component.sanctuaryGold).toBe(0);
    expect(component.shopMessage).toContain("equipped");
    expect(component.equipment.helmet).toBe(wornHelm);
  });

  it("adds one more bolt for each Charged Bolt rank", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Bolt"];
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any,
    ];

    for (const rank of [1, 3, 8, 20]) {
      component.skillLevels = { "Charged Bolt": rank };
      (component as any).skillCastCooldowns = {};
      component.attackProjectiles = [];
      component.activateOwnedSkill("Charged Bolt");
      expect(component.attackProjectiles.length).toBe(4 + rank);
    }
  });

  it("channels Arctic Blast as a one-second cone that hits everything in front", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Arctic Blast"];
    component.skillLevels = { "Arctic Blast": 1 };
    const inCone = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 170, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2, cd: 0 } as any;
    const behind = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 420, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2, cd: 0 } as any;
    component.enemies = [inCone, behind];

    component.activateOwnedSkill("Arctic Blast");

    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.arcticBlast);
    expect(effect).toBeDefined();
    expect(effect!.duration).toBeCloseTo(1, 5);
    expect(effect!.coneRange).toBeGreaterThan(100);

    for (let frame = 0; frame < 70; frame += 1) (component as any).updateSkillVisualEffects(16);
    (component as any).flushPendingDamage();

    expect(inCone.hp).toBeLessThan(100);
    expect(behind.hp).toBe(100);
    expect((component as any).skillVisualEffects.some((entry: any) => entry.arcticBlast)).toBeFalse();

    // The stream still channels when nothing is in front of the druid.
    component.enemies = [];
    component.activateOwnedSkill("Arctic Blast");
    expect((component as any).skillVisualEffects.some((entry: any) => entry.arcticBlast)).toBeTrue();
  });

  it("blocks other spells until Arctic Blast finishes channeling", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Arctic Blast", "Molten Boulder"];
    component.skillLevels = { "Arctic Blast": 1, "Molten Boulder": 1 };
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 250, y: 150, hp: 10000, maxHp: 10000, speed: 0, r: 14, dmg: 2, cd: 0,
    } as any];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Arctic Blast");
    component.activateOwnedSkill("Molten Boulder");

    expect((component as any).skillVisualEffects.some((entry: any) => entry.arcticBlast)).toBeTrue();
    expect(component.attackProjectiles.length).toBe(0);

    (component as any).updateSkillVisualEffects(1100);
    component.activateOwnedSkill("Molten Boulder");

    expect(component.attackProjectiles.length).toBeGreaterThan(0);
  });

  it("extends Arctic Blast duration and damage with rank", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Arctic Blast"];
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 150, hp: 10000, maxHp: 10000, speed: 0, r: 14, dmg: 2, cd: 0 } as any;
    component.enemies = [target];

    component.skillLevels = { "Arctic Blast": 1 };
    component.activateOwnedSkill("Arctic Blast");
    const rankOne = (component as any).skillVisualEffects.find((entry: any) => entry.arcticBlast)!;
    const rankOneDuration = rankOne.duration;
    const rankOneTickDamage = rankOne.damagePerTick!;
    (component as any).skillVisualEffects = [];

    component.skillLevels = { "Arctic Blast": 11 };
    component.activateOwnedSkill("Arctic Blast");
    const rankEleven = (component as any).skillVisualEffects.find((entry: any) => entry.arcticBlast)!;

    expect(rankEleven.duration).toBeGreaterThan(rankOneDuration);
    expect(rankEleven.damagePerTick).toBeGreaterThan(rankOneTickDamage);
  });

  it("summons Baal once Act V's living monsters are cleared even with friendly summons alive", () => {
    component.currentAct = 5;
    component.actTime = 180;
    component.actBossSpawned = false;
    component.miniBossSpawned = true;
    const summon = { kind: "normal", species: "wolf", spriteFrame: 0, x: 250, y: 250, hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 0, cd: 1, summonType: "druid", summonSkill: "Summon Spirit Wolf" } as any;
    component.enemies = [summon];

    component.spawnEnemies(16);

    expect(component.actBossSpawned).toBeTrue();
    const baal = component.enemies.find((enemy: any) => enemy.campaignBoss && enemy.species === "baal");
    expect(baal).toBeDefined();
    expect(baal!.kind).toBe("boss");
  });

  it("keeps Baal waiting while living Act V monsters remain", () => {
    component.currentAct = 5;
    component.actTime = 180;
    component.actBossSpawned = false;
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 2, cd: 0 } as any];

    component.spawnEnemies(16);

    expect(component.actBossSpawned).toBeFalse();
    expect(component.enemies.some((enemy: any) => enemy.campaignBoss)).toBeFalse();
  });

  it("prompts Act V players to clear the remaining minions when the boss timer runs out", () => {
    component.currentAct = 5;
    component.actTime = 180;
    component.actBossSpawned = false;

    expect(component.actSecondsRemaining).toBe(0);
    expect(component.actMinionClearPrompt).toBe("Clear the remaining minions");

    // The prompt yields to the boss line once Baal arrives.
    component.actBossSpawned = true;
    expect(component.actMinionClearPrompt).toBe("");

    // Other acts spawn their boss at zero rather than waiting on minions.
    component.actBossSpawned = false;
    component.currentAct = 4;
    expect(component.actMinionClearPrompt).toBe("");

    // Before the timer expires Act V keeps counting down as usual.
    component.currentAct = 5;
    component.actTime = 120;
    expect(component.actMinionClearPrompt).toBe("");
  });

  it("gives every Act V area its own floor tile atlas", () => {
    component.currentAct = 5;
    const areas = component.currentActDetails.areas;

    expect(areas.length).toBe(3);
    expect(areas.map((area) => area.name)).toEqual([
      "Bloody Foothills",
      "Crystalline Passage",
      "Throne of Destruction",
    ]);
    expect(new Set(areas.map((area) => area.floorTiles)).size).toBe(3);
    expect(areas[0].floorTiles).toContain("a5-bloody-foothills");
    expect(areas[1].floorTiles).toContain("a5-crystalline-passage");
    expect(areas[2].floorTiles).toContain("a5-throne-of-destruction");
    expect(areas.every((area) => area.baseFloorVariant === 0)).toBeTrue();
  });

  it("builds Uber Tristram from the original town preset and Tristram floor tiles", () => {
    component.currentAct = 8;
    const act = component.currentActDetails;

    expect(act.name).toBe("Uber Tristram");
    expect(act.map).toContain("a8-tristram-backdrop.png");
    expect(act.backdrop).toContain("a8-tristram-backdrop.png");
    expect(act.floorTiles).toContain("a8-uber-tristram-floor-tiles.png");
    expect(act.baseFloorVariant).toBe(0);
    expect(act.areas.length).toBe(1);
    expect(act.areas[0].name).toBe("Tristram");
    expect(act.areas[0].floorTiles).toBe(act.floorTiles);
    expect(act.areas[0].baseFloorVariant).toBe(0);
  });

  it("anchors the Tristram backdrop to the world centre at the tile projection scale", () => {
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    const image = { naturalWidth: 3840, naturalHeight: 2304 } as HTMLImageElement;
    (component as any).projectionDpr = 1;
    (component as any).currentChunkLocalX = (component as any).chunkTileColumns * 60 / 2;
    (component as any).currentChunkLocalY = (component as any).chunkTileRows * 60 / 2;

    (component as any).drawTristramBackdrop(ctx, image, 356);

    expect(drawImage).toHaveBeenCalled();
    const [, x, y, width, height] = drawImage.calls.mostRecent().args;
    expect(width / image.naturalWidth).toBeCloseTo(356 / 320, 5);
    expect(height / image.naturalHeight).toBeCloseTo(356 / 320, 5);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it("holds stunned enemies in place until the stun expires", () => {
    component.playerX = 250;
    component.playerY = 250;
    const enemy = {
      kind: "normal",
      species: "fallen",
      spriteFrame: 0,
      x: 400,
      y: 250,
      hp: 100,
      maxHp: 100,
      speed: 100,
      r: 14,
      dmg: 2,
      cd: 0,
    } as any;
    component.enemies = [enemy];
    (component as any).applyEnemyStun(enemy, 1);

    component.updateEnemies(300);
    expect(enemy.x).toBe(400);
    expect(enemy.stunRemaining).toBeGreaterThan(0);

    component.updateEnemies(1000);
    expect(enemy.x).toBe(400);

    component.updateEnemies(200);
    expect(enemy.x).toBeLessThan(400);
  });

  it("does not let Molten Boulder bulldoze act bosses", () => {
    (component as any).arenaW = 1000;
    (component as any).arenaH = 1000;
    const boss = {
      kind: "boss", species: "andariel", campaignBoss: true, spriteFrame: 0,
      x: 350, y: 250, hp: 1000, maxHp: 1000, speed: 90, r: 34, dmg: 20, cd: 0,
    } as any;
    const monster = {
      kind: "normal", species: "fallen", campaignBoss: false, spriteFrame: 0,
      x: 350, y: 250, hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 2, cd: 0,
    } as any;
    component.enemies = [boss, monster];
    const projectile = {
      x: 300, y: 250, targetX: 600, targetY: 250,
      speed: 300, radius: 24, life: 10, age: 0, boulder: true,
    } as any;

    (component as any).updateMoltenBoulder(projectile, 0.1);

    expect(boss.x).toBe(350);
    expect(boss.y).toBe(250);
    expect(monster.x).toBeGreaterThan(350);

    (component as any).applyEnemyStun(boss, 1);
    expect(boss.stunRemaining).toBeUndefined();
  });

  it("fires Andariel's own poison blast missile instead of the shared acid bolt", () => {
    component.playerX = 250;
    component.playerY = 250;
    const andariel = {
      kind: "boss",
      species: "andariel",
      spriteFrame: 0,
      x: 430,
      y: 250,
      hp: 4000,
      maxHp: 4000,
      speed: 90,
      r: 34,
      dmg: 24,
      cd: 0,
    } as any;
    component.enemies = [andariel];
    component.attackProjectiles = [];

    component.updateEnemies(16);

    expect(component.attackProjectiles.length).toBe(5);
    for (const blast of component.attackProjectiles) {
      expect(blast.missileId).toBe("d2-andarielspell");
    }
  });

  it("draws the original base-item art and falls back to equipment art for names this game added", () => {
    const imageFor = (name: string, slot: "weapon" | "armor" | "charm" | "belt", equipmentType?: string) =>
      component.inventoryItemImage({ name, slot, equipmentType } as any);

    expect(imageFor("Short Sword", "weapon")).toBe("assets/d2survivors/items/d2/invssd.png");
    expect(imageFor("Bone Wand", "weapon")).toBe("assets/d2survivors/items/d2/invbwn.png");
    expect(imageFor("Leather Cap", "armor")).toBe("assets/d2survivors/items/d2/invcap.png");
    expect(imageFor("Chain Hauberk", "armor")).toBe("assets/d2survivors/items/d2/invchn.png");
    expect(imageFor("Barbarian Battle Axe", "weapon")).toBe("assets/d2survivors/items/d2/invbtx.png");
    expect(imageFor("Buckler", "armor")).toBe("assets/d2survivors/items/d2/invbuc.png");
    expect(imageFor("Leather Gloves", "armor")).toBe("assets/d2survivors/items/d2/invlgl.png");
    expect(imageFor("Heavy Boots", "armor")).toBe("assets/d2survivors/items/d2/invvbt.png");
    expect(imageFor("Gold Amulet", "charm")).toBe("assets/d2survivors/items/d2/invamu.png");
    expect(imageFor("Ring of the Artisan", "charm")).toBe("assets/d2survivors/items/d2/invrin1.png");
    expect(imageFor("Vampirefang Belt", "belt")).toBe("assets/d2survivors/items/d2/invvbl.png");
    expect(imageFor("Stalwart Cap", "armor", "helmet")).toBe("assets/d2survivors/items/helmet.png");
    expect(imageFor("Small Charm", "charm", "charm")).toBe("assets/d2survivors/items/small-charm.png");
    expect(imageFor("Crimson Small Charm", "charm", "charm")).toBe("assets/d2survivors/items/small-charm.png");
    expect(imageFor("Large Charm", "charm", "charm")).toBe("assets/d2survivors/items/large-charm.png");
    expect(imageFor("Grand Charm", "charm", "charm")).toBe("assets/d2survivors/items/grand-charm.png");
    expect(D2_ITEM_ART["quill of the fates"]).toBeUndefined();
  });

  it("maps equipped D2 helmet bases to the original D2R head meshes", () => {
    const idFor = (baseName: string, name = baseName): string | undefined =>
      getHelmetVisualForItem({ baseName, name })?.id;

    expect(idFor("Cap")).toBe("cap");
    expect(idFor("War Hat")).toBe("cap");
    expect(idFor("Jawbone Cap")).toBe("jawbone");
    expect(idFor("Fanged Helm")).toBe("fanged");
    expect(idFor("Horned Helm")).toBe("horned");
    expect(idFor("Assault Helmet")).toBe("assault");
    expect(idFor("Avenger Guard")).toBe("avenger");
    expect(idFor("Full Helm", "Duskdeep")).toBe("full");
    expect(idFor("Bone Helm", "Wormskull")).toBe("bone");
    expect(idFor("Wolf Head")).toBe("wolf");
    expect(idFor("Sky Spirit")).toBe("falcon");
    expect(idFor("Leather Cap", "Stalwart Leather Cap")).toBe("cap");
    expect(getHelmetVisualForItem({ baseName: "Chain Hauberk", name: "Chain Hauberk" })).toBeNull();
  });

  it("ships a model and albedo for every D2R helmet visual", () => {
    for (const visual of Object.values(D2_HELMET_VISUALS)) {
      expect(visual.model).toBe(`assets/d2survivors/models/helmets/${visual.id}.glb`);
      expect(visual.texture).toBe(`assets/d2survivors/models/helmets/${visual.id}.png`);
      expect(visual.scale).toBeGreaterThan(0);
    }
  });

  it("seats caps and helmets on the skull rather than at jaw height", () => {
    const seatedIds = [
      "cap", "skull", "helm", "full", "great", "bone", "mask", "assault",
      "avenger", "fanged", "horned", "wolf", "hawk", "antlers", "falcon", "spirit",
    ] as const;
    for (const id of seatedIds) {
      expect(D2_HELMET_VISUALS[id].lift).toBeGreaterThanOrEqual(0.0009);
    }
  });

  it("drops large and grand charms with their D2R art and inventory footprints", () => {
    const random = spyOn(Math, "random");
    const found = new Map<string, any>();
    // Base selection consumes the first random roll; the two new charm bases
    // sit at the end of the pool, so scan its final slice deterministically.
    for (let roll = 0.9; roll < 1; roll += 0.001) {
      random.and.returnValue(roll);
      const item = (component as any).randomItem();
      if (item.baseName === "Large Charm" || item.baseName === "Grand Charm") {
        found.set(item.baseName, item);
      }
    }

    expect(found.get("Large Charm")?.height).toBe(2);
    expect(found.get("Grand Charm")?.height).toBe(3);
    expect(component.inventoryItemImage(found.get("Large Charm"))).toBe("assets/d2survivors/items/large-charm.png");
    expect(component.inventoryItemImage(found.get("Grand Charm"))).toBe("assets/d2survivors/items/grand-charm.png");
  });

  it("uses a two-row inventory footprint for normal and named wands", () => {
    const normalWand = {
      id: "normal-wand", name: "Bone Wand", baseName: "Bone Wand", rarity: "magic",
      slot: "weapon", equipmentType: "wand", desc: "A wand.", stats: {},
    } as any;
    expect((component as any).itemSize(normalWand)).toEqual({ width: 1, height: 2 });

    for (const catalog of [D2_UNIQUE_ITEMS, D2_SET_ITEMS]) {
      const namedWand = catalog.find((item) => /wand/i.test(item.baseName))!;
      expect(namedWand).toBeDefined();
      expect((component as any).itemSize((component as any).createNamedItem(namedWand, catalog === D2_UNIQUE_ITEMS ? "unique" : "set"))).toEqual({ width: 1, height: 2 });
    }
  });

  it("uses a one-column, two-row inventory footprint for Smoked Spheres", () => {
    const sphere = {
      id: "smoked-sphere", name: "Smoked Sphere", baseName: "Smoked Sphere", rarity: "normal",
      slot: "weapon", equipmentType: "orb", width: 1, height: 3, desc: "A smoked sphere.", stats: {},
    } as any;
    expect((component as any).itemSize(sphere)).toEqual({ width: 1, height: 2 });
  });

  it("uses a one-column, two-row inventory footprint for throwing knives", () => {
    for (const name of ["Throwing Knife", "Balanced Knife"]) {
      const knife = {
        id: name.toLowerCase(), name, baseName: name, rarity: "normal",
        slot: "weapon", desc: "A throwing knife.", stats: {},
      } as any;
      expect((component as any).itemSize(knife)).toEqual({ width: 1, height: 2 });
    }

    const affixedKnife = {
      id: "affixed-throwing-knife", name: "Cruel Throwing Knife of Quickness",
      baseName: "Throwing Knife", rarity: "rare", slot: "weapon",
      desc: "A throwing knife.", stats: {},
    } as any;
    expect((component as any).itemSize(affixedKnife)).toEqual({ width: 1, height: 2 });
  });

  it("uses a 2x4 inventory footprint for Heraldic and Aerin shields", () => {
    for (const baseName of ["Heraldic Shield", "Aerin Shield"]) {
      const shield = {
        id: baseName.toLowerCase(), name: baseName, baseName, rarity: "normal",
        slot: "armor", equipmentType: "paladinShield", width: 2, height: 2,
        desc: "A Paladin shield.", stats: {},
      } as any;
      expect((component as any).itemSize(shield)).toEqual({ width: 2, height: 4 });
    }
    const crown = {
      id: "crown-shield", name: "Crown Shield", baseName: "Crown Shield", rarity: "normal",
      slot: "armor", equipmentType: "paladinShield", width: 2, height: 2,
      desc: "A Paladin shield.", stats: {},
    } as any;
    expect((component as any).itemSize(crown)).toEqual({ width: 2, height: 2 });
  });

  it("previews the full footprint of a dragged item over the hovered slot", () => {
    const shield = {
      id: "drag-shield", name: "Large Shield", baseName: "Large Shield", rarity: "normal",
      slot: "armor", equipmentType: "shield", width: 2, height: 3, desc: "A shield.", stats: {},
    } as any;
    const ring = {
      id: "drag-ring", name: "Ring of the Artisan", baseName: "Ring of the Artisan", rarity: "normal",
      slot: "charm", equipmentType: "ring", desc: "A ring.", stats: {},
    } as any;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = shield;
    component.inventory[2] = ring;
    component.dragState = { source: "inventory", slotIndex: 0, item: shield };
    component.dragGhostSlotIndex = 2;

    const preview = component.inventoryDropPreview!;
    expect(preview).toEqual({ column: 3, row: 1, width: 2, height: 3, allowed: true });
    expect(component.inventoryDropPreviewStyle(preview)).toEqual({
      gridColumn: "3 / span 2",
      gridRow: "1 / span 3",
    });

    component.inventory[3] = { ...ring, id: "drag-blocker" } as any;
    expect(component.inventoryDropPreview?.allowed).toBeFalse();
    expect(component.inventoryDropPreview?.width).toBe(2);
    expect(component.inventoryDropPreview?.height).toBe(3);
  });

  it("shows the imported unique and set cels for those rarities", () => {
    const imageFor = (name: string, baseName: string, rarity: "unique" | "set", slot = "weapon", equipmentType?: string) =>
      component.inventoryItemImage({ name, baseName, rarity, slot, equipmentType } as any);

    expect(imageFor("The Gnasher", "Hand Axe", "unique")).toBe("assets/d2survivors/items/d2/invhaxu.png");
    expect(imageFor("Rixots Keen", "Short Sword", "unique")).toBe("assets/d2survivors/items/unique/rixots-keen.png");
    expect(imageFor("Hsarus' Iron Fist", "Buckler", "set", "armor", "shield")).toBe("assets/d2survivors/items/set/hsarus-iron-fist.png");
    expect(imageFor("Annihilus", "Small Charm", "unique", "charm", "charm")).toBe("assets/d2survivors/items/d2/invmss.png");
    expect(imageFor("Gheed's Fortune", "Grand Charm", "unique", "charm", "charm")).toBe("assets/d2survivors/items/grand-charm.png");
  });

  it("purges retired quill items from saved profiles", () => {
    component.selectedClass = "paladin";
    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = {
      id: "retired-quill",
      name: "Stalwart Quill of the Fates",
      baseName: "Quill of the Fates",
      rarity: "magic",
      slot: "charm",
      equipmentType: "charm",
      desc: "An ink-dark quill.",
      stats: {},
    } as any;

    (component as any).saveCharacterProfile();

    expect((component as any).characterProfiles["paladin"].inventory.some((item: any) => item?.baseName?.toLowerCase() === "quill of the fates")).toBeFalse();
  });

  it("uses the original flippy artwork for loot lying on the ground", () => {
    const groundFor = (name: string, slot: "weapon" | "armor" | "charm") =>
      component.groundItemImage({ name, slot } as any);

    expect(groundFor("Short Sword", "weapon")).toBe("assets/d2survivors/items/ground/flpssd.png");
    expect(groundFor("Chain Hauberk", "armor")).toBe("assets/d2survivors/items/ground/flpchn.png");
    expect(groundFor("Barbarian Battle Axe", "weapon")).toBe("assets/d2survivors/items/ground/flpbtx.png");
    expect(groundFor("Stalwart Cap", "armor")).toBe("assets/d2survivors/items/helmet.png");
  });

  it("plays every flippy frame once and holds the final resting frame", () => {
    const animation = component.groundItemAnimation({
      name: "Short Sword", baseName: "Short Sword", slot: "weapon",
    } as any);

    expect(animation?.path).toBe("assets/d2survivors/items/ground-anim/flpssd.png");
    expect(animation?.frames).toBe(17);
    expect(animation?.width).toBeGreaterThan(0);
    expect(animation?.height).toBeGreaterThan(0);

    const frameAt = (elapsed: number, frames: number) => (component as any).itemDropFrame(elapsed, frames);
    expect(frameAt(0, 17)).toBe(0);
    expect(frameAt(0.5, 17)).toBeGreaterThan(0);
    expect(frameAt(0.5, 17)).toBeLessThan(16);
    expect(frameAt(10, 17)).toBe(16);
  });

  it("uses the named inventory cel as the tint source for unique and set floor loot", () => {
    const sourceFor = (item: any) => (component as any).itemDropTintSource(item);

    expect(sourceFor({
      name: "The Gnasher", baseName: "Hand Axe", rarity: "unique", slot: "weapon", equipmentType: "weapon",
    })).toEqual({
      groundPath: "assets/d2survivors/items/ground/flphax.png",
      artPath: "assets/d2survivors/items/d2/invhaxu.png",
    });
    expect(sourceFor({
      name: "Hsarus' Iron Fist", baseName: "Buckler", rarity: "set", slot: "armor", equipmentType: "shield",
    })).toEqual({
      groundPath: "assets/d2survivors/items/ground/flpbuc.png",
      artPath: "assets/d2survivors/items/set/hsarus-iron-fist.png",
    });
    expect(sourceFor({
      name: "Short Sword", baseName: "Short Sword", rarity: "normal", slot: "weapon", equipmentType: "weapon",
    })).toBeNull();
  });

  it("duotones a flippy cel with its inventory art's dominant colour and keeps its alpha", () => {
    const inventoryPixels = new Uint8ClampedArray([
      100, 28, 24, 255,
      132, 38, 32, 255,
      9, 8, 7, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
    ]);
    const color = (component as any).dominantColorFromPixels(inventoryPixels);
    expect(color[0]).toBeGreaterThan(color[1]);
    expect(color[0]).toBeGreaterThan(color[2]);

    const floorPixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      80, 80, 80, 255,
      230, 230, 230, 255,
      0, 0, 0, 0,
    ]);
    (component as any).tintGroundCelPixels(floorPixels, color);

    expect(floorPixels[3]).toBe(255);
    expect(floorPixels[7]).toBe(255);
    expect(floorPixels[11]).toBe(255);
    expect(floorPixels[15]).toBe(0);
    expect(floorPixels[0]).toBeLessThan(floorPixels[4]);
    expect(floorPixels[4]).toBeLessThan(floorPixels[8]);
    expect(floorPixels[1]).toBeLessThan(floorPixels[0]);
  });

  it("animates the chest through all four original Diablo opening frames", () => {
    const sources: Array<string | null> = [];
    let shadowCount = 0;
    const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      imageSmoothingEnabled: true,
      globalAlpha: 1,
      translate: () => undefined,
      scale: () => undefined,
      createRadialGradient: () => {
        shadowCount += 1;
        return gradient;
      },
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      drawImage: (image: HTMLImageElement) => sources.push(image.getAttribute("src")),
    } as unknown as CanvasRenderingContext2D;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 100, y: 100 });

    (component as any).drawChest(ctx, { x: 0, y: 0, bob: 0, open: false, life: 30 });
    (component as any).drawChest(ctx, { x: 0, y: 0, bob: 0, open: true, life: 1.12 });
    (component as any).drawChest(ctx, { x: 0, y: 0, bob: 0, open: true, life: 1.04 });
    (component as any).drawChest(ctx, { x: 0, y: 0, bob: 0, open: true, life: 0.96 });
    (component as any).drawGoldDrop(ctx, { x: 0, y: 0, amount: 12, bob: 0, life: 18, pickupDelay: 0 });
    (component as any).drawPotionDrop(ctx, { x: 0, y: 0, kind: "health", life: 18, pickupDelay: 0 });
    (component as any).drawPotionDrop(ctx, { x: 0, y: 0, kind: "rejuvenation", life: 18, pickupDelay: 0 });

    expect(sources).toEqual([
      "assets/d2survivors/loot/chest-closed.png?v=2",
      "assets/d2survivors/loot/chest-opening-1.png?v=2",
      "assets/d2survivors/loot/chest-opening-2.png?v=2",
      "assets/d2survivors/loot/chest-open.png?v=2",
      "assets/d2survivors/loot/gold.png?v=2",
      "assets/d2survivors/loot/health-potion.png?v=2",
      "assets/d2survivors/loot/rejuvenation-potion.png?v=2",
    ]);
    expect(shadowCount).toBe(7);
  });

  it("gives Find Potion a passive monster-drop bonus that scales with rank", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Find Potion"];
    component.skillLevels = { "Find Potion": 1 };
    component.potionDrops = [];
    const enemy = { kind: "normal", x: 120, y: 130 } as any;
    spyOn(Math, "random").and.returnValue(0.2);

    (component as any).maybeDropPotion(enemy);
    expect(component.potionDrops.length).toBe(0);

    component.skillLevels["Find Potion"] = 10;
    (component as any).maybeDropPotion(enemy);
    expect(component.potionDrops.length).toBe(1);
  });

  it("draws the act portal from the original red town-portal sheet", () => {
    const draws: Array<{ source: string | null; sx: number; sw: number; dw: number; dh: number }> = [];
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      imageSmoothingEnabled: false,
      drawImage: (image: HTMLImageElement, sx: number, _sy: number, sw: number, _sh: number,
        _dx: number, _dy: number, dw: number, dh: number) => {
        draws.push({ source: image.getAttribute("src"), sx, sw, dw, dh });
      },
    } as unknown as CanvasRenderingContext2D;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 240, y: 180 });
    const shadow = spyOn(component as any, "drawGroundShadow");
    const portal = new Image();
    portal.src = (component as any).portalArtUrl();
    spyOn(component as any, "portalArtImage").and.returnValue(portal);

    (component as any).drawActPortal(ctx);

    const draw = draws[0]!;
    expect(draw.source ?? "").toContain("assets/d2survivors/objects/red-portal.png?v=2");
    expect(draw.sw).toBe(109);
    expect(draw.dw).toBeGreaterThan(0);
    expect(draw.dh).toBeGreaterThan(draw.dw);
    expect(shadow).toHaveBeenCalled();
  });

  it("draws a soft shadow beneath loose item drops", () => {
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      imageSmoothingEnabled: true,
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 40, y: 50 });
    spyOn(component as any, "groundItemAnimation").and.returnValue(null);
    spyOn(component as any, "itemDropImage").and.returnValue({ complete: false, naturalWidth: 0 } as HTMLImageElement);
    spyOn(component as any, "groundItemImage").and.returnValue("assets/d2survivors/items/ground/flpssd.png");
    spyOn(component as any, "tintedItemDropArtFor").and.returnValue(null);
    const shadow = spyOn(component as any, "drawGroundShadow");

    (component as any).drawItemDrop(ctx, {
      x: 0,
      y: 0,
      bob: 0,
      life: 10,
      pickupDelay: 0,
      notifiedFull: false,
      item: { name: "Short Sword", baseName: "Short Sword", slot: "weapon" },
    });

    expect(shadow).toHaveBeenCalled();
  });

  it("defaults the Amazon preview to her light red-and-gold armor instead of the grey medium set", () => {
    component.equipment.body = null;
    const model = new THREE.Group();
    const light = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const medium = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const heavy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    light.name = "torso_armor_litShape_0";
    medium.name = "torso_armor_medShape_0";
    heavy.name = "torso_armor_hvyShape_0";
    model.add(light, medium, heavy);

    (component as any).configureClassArmor(model, "amazon", true);

    expect(light.visible).toBeTrue();
    expect(medium.visible).toBeFalse();
    expect(heavy.visible).toBeFalse();
  });

  it("shows the selected character's saved armor, weapon, and shield in the class preview", () => {
    component.selectedClass = "paladin";
    component.equipment.body = {
      id: "preview-body", name: "Plate Mail", baseName: "Plate Mail", rarity: "rare", slot: "armor",
      desc: "Heavy plate.", stats: { armor: 40 },
    } as any;
    component.equipment.weapon = {
      id: "preview-weapon", name: "Short Sword", baseName: "Short Sword", rarity: "magic", slot: "weapon",
      desc: "A sword.",
    } as any;
    component.equipment.shield = {
      id: "preview-shield", name: "Buckler", baseName: "Buckler", rarity: "normal", slot: "armor",
      equipmentType: "shield", desc: "A buckler.",
    } as any;

    const model = new THREE.Group();
    const light = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const medium = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const heavy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    light.name = "torso_armor_litShape_0";
    medium.name = "torso_armor_medShape_0";
    heavy.name = "torso_armor_hvyShape_0";
    const hand = new THREE.Group();
    hand.name = "R_weapon_attach";
    const shieldAnchor = new THREE.Group();
    shieldAnchor.name = "shield_attach";
    model.add(light, medium, heavy, hand, shieldAnchor);

    const gameplayWeapon = new THREE.Group();
    (component as any).playerWeaponMeshes = [gameplayWeapon];
    (component as any).configureClassMeleeWeapon(model, "paladin", true);

    expect(light.visible).toBeFalse();
    expect(medium.visible).toBeFalse();
    expect(heavy.visible).toBeTrue();
    expect((component as any).previewEquippedWeaponVisual?.parent).toBe(hand);
    expect((component as any).previewEquippedShieldVisual?.parent).toBe(shieldAnchor);
    expect((component as any).playerWeaponMeshes).toEqual([gameplayWeapon]);
  });

  it("hides light variants named lt or containing med inside another word", () => {
    const assassin = new THREE.Group();
    const assassinLight = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const assassinMedium = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    assassinLight.name = "rshoulder_ltShape_0";
    assassinMedium.name = "rshoulder_medShape_0";
    assassin.add(assassinLight, assassinMedium);

    (component as any).configureClassArmor(assassin, "assassin", true);

    expect(assassinLight.visible).toBeFalse();
    expect(assassinMedium.visible).toBeTrue();

    const sorceress = new THREE.Group();
    const sorceressLight = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const sorceressMedium = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    sorceressLight.name = "legs_lit_chains_medals_mergedShape_0";
    sorceressMedium.name = "legs_medShape_0";
    sorceress.add(sorceressLight, sorceressMedium);

    (component as any).configureClassArmor(sorceress, "sorceress", true);

    expect(sorceressLight.visible).toBeFalse();
    expect(sorceressMedium.visible).toBeTrue();
  });

  it("winds up a kick before the chest pops open", () => {
    component.playerX = 250;
    component.playerY = 250;
    component.chests = [{ x: 270, y: 250, bob: 0, open: false, life: 30 }];
    const trigger = spyOn(component as any, "triggerAttackAnimation");
    const open = spyOn(component as any, "openChest");

    component.updateChests(16);

    expect(trigger).toHaveBeenCalledWith("chestKick");
    expect((component as any).playerFacingX).toBe(1);
    expect(component.chests[0].open).toBeFalse();
    expect(open).not.toHaveBeenCalled();

    component.updateChests(400);

    expect(open).toHaveBeenCalled();
  });

  it("spills several rolled chest items on the ground and picks them up one at a time", () => {
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.itemDrops = [];
    spyOn(Math, "random").and.returnValue(0.5);
    component.openChest({ x: 200, y: 200, bob: 0, open: false, life: 30 } as any);

    const rolledCount = component.itemDrops.length;
    const rarities: string[] = ["normal", "magic", "rare", "set", "unique"];
    expect(rolledCount).toBeGreaterThanOrEqual(2);
    expect(rolledCount).toBeLessThanOrEqual(4);
    expect(component.itemDrops.every((drop) => rarities.includes(drop.item.rarity))).toBeTrue();
    expect(component.inventory.filter(Boolean).length).toBe(0);

    component.playerX = 20;
    component.playerY = 20;
    component.updateItemDrops(2000);
    expect(component.itemDrops.length).toBe(rolledCount);
    expect(component.inventory.filter(Boolean).length).toBe(0);

    const drop = component.itemDrops[0];
    component.playerX = drop.x;
    component.playerY = drop.y;
    component.updateItemDrops(1000);
    expect(component.itemDrops.length).toBe(rolledCount - 1);
    expect(component.inventory.filter(Boolean).length).toBe(1);
  });

  it("translates dropped items with the moving world so they stay at their drop location", () => {
    component.enemies = [];
    component.chests = [];
    component.potionDrops = [];
    component.goldDrops = [];
    component.itemDrops = [{
      x: 100,
      y: 200,
      item: { id: "dropped-sword", name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any,
      bob: 0,
      life: 30,
      pickupDelay: 0,
      notifiedFull: false,
    }];

    (component as any).translateWorldEntities(-12, 7);

    expect(component.itemDrops[0].x).toBe(88);
    expect(component.itemDrops[0].y).toBe(207);
  });

  it("rolls a rarity for every item released by a chest", () => {
    component.itemDrops = [];
    const rolled = [
      { id: "chest-normal", name: "Sash", rarity: "normal", slot: "belt", desc: "A sash." },
      { id: "chest-magic", name: "Keen Sash", rarity: "magic", slot: "belt", desc: "A sash." },
      { id: "chest-rare", name: "Stalwart Sash of the Fox", rarity: "rare", slot: "belt", desc: "A sash." },
    ] as any[];
    spyOn(component as any, "randomItem").and.callFake(() => rolled.shift()!);
    spyOn(Math, "random").and.returnValue(0.5);

    component.openChest({ x: 200, y: 200, bob: 0, open: false, life: 30 } as any);

    expect(component.itemDrops.map((drop) => drop.item.rarity)).toEqual(["normal", "magic", "rare"]);
  });

  it("maps light, medium, and heavy armor names to matching rig tiers", () => {
    const armorTier = (component as any).equippedArmorTier.bind(component);
    expect(armorTier({ name: "Leather Armor" } as any)).toBe("light");
    expect(armorTier({ name: "Chain Hauberk" } as any)).toBe("medium");
    expect(armorTier({ name: "Plate Mail" } as any)).toBe("heavy");
  });

  it("shows the selected class armor tier, tints equipped armor, and restores the base look when removed", () => {
    component.equipment.body = { name: "Leather Armor", baseName: "Leather Armor", slot: "armor", stats: { armor: 8 } } as any;
    const model = new THREE.Group();
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mediumMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const heavyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const light = new THREE.Mesh(new THREE.BoxGeometry(), lightMaterial);
    const medium = new THREE.Mesh(new THREE.BoxGeometry(), mediumMaterial);
    const heavy = new THREE.Mesh(new THREE.BoxGeometry(), heavyMaterial);
    light.name = "torso_armor_litShape_0";
    medium.name = "torso_armor_medShape_0";
    heavy.name = "torso_armor_hvyShape_0";
    model.add(light, medium, heavy);

    (component as any).configureClassMeleeWeapon(model, "paladin");
    expect(light.visible).toBeTrue();
    expect(medium.visible).toBeFalse();
    expect(heavy.visible).toBeFalse();
    expect((light.material as THREE.MeshStandardMaterial).color.getHex()).not.toBe(0xffffff);

    component.equipment.body = null;
    (component as any).configureClassMeleeWeapon(model, "paladin");
    expect(light.visible).toBeFalse();
    expect(medium.visible).toBeTrue();
    expect(heavy.visible).toBeFalse();
    expect(light.material).toBe(lightMaterial);
    expect(lightMaterial.color.getHex()).toBe(0xffffff);

    component.equipment.body = { name: "Chain Hauberk", baseName: "Chain Hauberk", slot: "armor", stats: { armor: 18 } } as any;
    (component as any).configureClassMeleeWeapon(model, "paladin");
    expect(light.visible).toBeFalse();
    expect(medium.visible).toBeTrue();

    component.equipment.body = { name: "Plate Mail", baseName: "Plate Mail", slot: "armor", stats: { armor: 30 } } as any;
    (component as any).configureClassMeleeWeapon(model, "paladin");
    expect(light.visible).toBeFalse();
    expect(medium.visible).toBeFalse();
    expect(heavy.visible).toBeTrue();
  });

  it("renders an equipped weapon at the hand attachment and moves it with the arm during a strike", () => {
    component.selectedClass = "paladin";
    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;

    const swordArt = new THREE.Texture();
    swordArt.image = { width: 23, height: 111 };
    (component as any).equippedItemArtTextures.set(component.inventoryItemImage(component.equipment.weapon!), swordArt);

    const anchor = new THREE.Group();
    const { model, bones } = buildBiped();
    anchor.add(model);
    const wrist = new THREE.Bone();
    wrist.name = "R_Wrist";
    wrist.position.set(-0.5, 1.33, 0);
    const hand = new THREE.Bone();
    hand.name = "R_weapon_attach";
    hand.position.set(-0.66, 1.33, 0);
    model.add(wrist, hand);

    (component as any).configureClassMeleeWeapon(model, "paladin");
    const weapon = hand.children.find((child) => child.name === "equipped_weapon_weapon");
    expect(weapon).toBeDefined();
    expect(weapon?.children.some((child) => (child as THREE.Mesh).isMesh)).toBeTrue();

    (component as any).characterModel = anchor;
    (component as any).characterRig = buildCharacterRig(model, "paladin");
    const upperArmBase = bones["R_upr_arm_bind_jnt"].quaternion.clone();
    (component as any).triggerAttackAnimation();
    (component as any).animatePlayerModel(150);

    expect(bones["R_upr_arm_bind_jnt"].quaternion.angleTo(upperArmBase)).toBeGreaterThan(0.1);
    expect(weapon?.parent).toBe(hand);
    expect((component as any).attackAnimationSide).toBe(-1);

    (component as any).triggerAttackAnimation();
    expect((component as any).attackAnimationSide).toBe(-1);
  });

  it("swings the Barbarian at the upper arm while keeping the shoulder pad on the shoulder", () => {
    component.selectedClass = "barbarian";
    const anchor = new THREE.Group();
    const { model, bones } = buildBiped();
    anchor.add(model);
    (component as any).characterModel = anchor;
    (component as any).characterRig = buildCharacterRig(model, "barbarian");
    expect((component as any).characterRig.arms.map((entry: any) => entry.bone.name)).toContain("R_upr_arm_bind_jnt");

    const clavicle = bones["R_shoulder_bind_jnt"];
    const shoulder = clavicle.getWorldPosition(new THREE.Vector3());
    (component as any).animatePlayerModel(16);
    const restArm = bones["R_lwr_arm_bind_jnt"].getWorldPosition(new THREE.Vector3())
      .sub(bones["R_upr_arm_bind_jnt"].getWorldPosition(new THREE.Vector3()));
    (component as any).triggerAttackAnimation();
    (component as any).animatePlayerModel(150);

    const armNow = bones["R_lwr_arm_bind_jnt"].getWorldPosition(new THREE.Vector3())
      .sub(bones["R_upr_arm_bind_jnt"].getWorldPosition(new THREE.Vector3()));
    expect(armNow.angleTo(restArm)).toBeGreaterThan(0.1);
    // The pad stays pinned to the shoulder as the arm swings: it tracks the joint,
    // it does not slide down the arm or drift off the torso.
    const shoulderOffset = (component as any).characterRig as { unitScale: number };
    expect(clavicle.getWorldPosition(new THREE.Vector3())
      .distanceTo(bones["R_upr_arm_bind_jnt"].getWorldPosition(new THREE.Vector3())))
      .toBeLessThan(0.05 * Math.max(1, shoulderOffset.unitScale));
  });

  it("keeps Act 1 skeletons in melee instead of firing arrows", () => {
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 100;
    component.playerMaxHp = 100;
    component.attackProjectiles = [];
    const skeleton = {
      kind: "normal",
      species: "skeleton",
      campaignBoss: false,
      spriteFrame: 0,
      animationState: "move",
      attackAnimationTime: 0,
      facingX: -1,
      facingY: 0,
      x: 430,
      y: 250,
      hp: 100,
      maxHp: 100,
      speed: 100,
      r: 14,
      dmg: 5,
      cd: 0,
    } as any;
    component.enemies = [skeleton];

    component.updateEnemies(16);

    expect(component.attackProjectiles.length).toBe(0);
    expect(skeleton.x).toBeLessThan(430);
    expect(skeleton.animationState).toBe("move");

    skeleton.x = 270;
    skeleton.cd = 0;
    component.updateEnemies(16);

    expect(component.attackProjectiles.length).toBe(0);
    expect(skeleton.animationState).toBe("attack");
    expect(component.playerHp).toBeLessThan(100);
  });

  it("keeps an enemy stationary during its attack and resumes pursuit afterward", () => {
    component.playerX = 250;
    component.playerY = 250;
    const enemy = {
      kind: "normal",
      species: "fallen",
      spriteFrame: 0,
      animationState: "attack",
      attackAnimationTime: 0.3,
      x: 290,
      y: 250,
      hp: 100,
      maxHp: 100,
      speed: 100,
      r: 14,
      dmg: 2,
      cd: 0.8,
    } as any;
    component.enemies = [enemy];

    component.updateEnemies(100);
    expect(enemy.x).toBe(290);
    expect(enemy.animationState).toBe("attack");

    component.updateEnemies(250);
    expect(enemy.x).toBeLessThan(290);
  });

  it("bursts a dying Bone Fetish against a nearby player", () => {
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 100;
    component.playerMaxHp = 100;
    const near = {
      kind: "normal",
      species: "boneFetish",
      spriteFrame: 0,
      x: 285,
      y: 250,
      hp: 0,
      maxHp: 20,
      speed: 0,
      r: 14,
      dmg: 2,
      cd: 0,
    } as any;
    component.enemies = [near];
    (component as any).skillVisualEffects.length = 0;

    component.updateEnemies(16);

    expect(component.playerHp).toBeLessThan(100);
    expect((component as any).skillVisualEffects.some((effect: any) => effect.boneBurst)).toBeTrue();
    expect(component.enemies).toHaveSize(0);

    component.playerHp = 100;
    const far = { ...near, x: 400 };
    component.enemies = [far];
    component.updateEnemies(16);

    expect(component.playerHp).toBe(100);
  });

  it("mirrors right-facing Fallen so their walk cycle matches their movement", () => {
    const frame = { width: 91, height: 75 } as HTMLCanvasElement;
    (component as any).enemySprites.fallen = {
      frames: [Array.from({ length: 13 }, () => frame)],
      columns: 13,
      rows: 1,
      animated: true,
    };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 100, y: 120 });
    spyOn(component as any, "tintedEnemyFrame").and.returnValue(frame);
    spyOn(component as any, "drawGroundShadow");
    spyOn(component as any, "drawHpBar");
    const translate = jasmine.createSpy("translate");
    const scale = jasmine.createSpy("scale");
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      translate,
      scale,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    const enemy = {
      kind: "normal",
      species: "fallen",
      campaignBoss: false,
      spriteFrame: 0,
      animationState: "move",
      attackAnimationTime: 0,
      facingX: 1,
      facingY: 0,
      x: 300,
      y: 250,
      hp: 100,
      maxHp: 100,
      r: 14,
      dmg: 2,
    } as any;

    (component as any).drawEnemy(ctx, enemy);

    expect(translate).toHaveBeenCalledWith(100, 0);
    expect(scale).toHaveBeenCalledWith(-1, 1);

    translate.calls.reset();
    scale.calls.reset();
    enemy.facingX = -1;

    (component as any).drawEnemy(ctx, enemy);

    expect(translate).not.toHaveBeenCalled();
    expect(scale).not.toHaveBeenCalled();
  });

  it("faces south-moving leapers with the hop and lunge rows in the right direction", () => {
    const frame = { width: 120, height: 120 } as HTMLCanvasElement;
    (component as any).enemySprites.leaper = {
      frames: Array.from({ length: 16 }, () => Array.from({ length: 20 }, () => frame)),
      columns: 20,
      rows: 16,
      animated: true,
    };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 100, y: 120 });
    spyOn(component as any, "drawGroundShadow");
    spyOn(component as any, "drawHpBar");
    const tinted = spyOn(component as any, "tintedEnemyFrame").and.returnValue(frame);
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    const enemy = {
      kind: "normal",
      species: "leaper",
      campaignBoss: false,
      spriteFrame: 0,
      animationState: "move",
      attackAnimationTime: 0,
      facingX: 0,
      facingY: 1,
      x: 100,
      y: 250,
      hp: 100,
      maxHp: 100,
      r: 14,
      dmg: 2,
    } as any;

    (component as any).drawEnemy(ctx, enemy);
    expect(tinted.calls.mostRecent().args[1]).toBe(4);

    enemy.animationState = "attack";
    enemy.attackAnimationTime = 0.2;
    (component as any).drawEnemy(ctx, enemy);
    expect(tinted.calls.mostRecent().args[1]).toBe(12);
  });

  it("keeps the Blunderbore's attack on its wind-up and strike instead of the collapsed recovery cels", () => {
    const frame = { width: 85, height: 117 } as HTMLCanvasElement;
    (component as any).enemySprites.blunderbore = {
      frames: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => frame)),
      columns: 16,
      rows: 16,
      animated: true,
    };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 100, y: 120 });
    spyOn(component as any, "drawGroundShadow");
    spyOn(component as any, "drawHpBar");
    const tinted = spyOn(component as any, "tintedEnemyFrame").and.returnValue(frame);
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    const enemy = {
      kind: "normal",
      species: "blunderbore",
      campaignBoss: false,
      spriteFrame: 0,
      animationState: "attack",
      attackAnimationTime: 0,
      facingX: 0,
      facingY: 1,
      x: 100,
      y: 250,
      hp: 100,
      maxHp: 100,
      r: 14,
      dmg: 2,
    } as any;

    const sampledFrames: number[] = [];
    for (const attackAnimationTime of [0.38, 0.3, 0.2, 0.1, 0]) {
      enemy.attackAnimationTime = attackAnimationTime;
      (component as any).drawEnemy(ctx, enemy);
      sampledFrames.push(tinted.calls.mostRecent().args[2] as number);
    }

    expect(Math.max(...sampledFrames)).toBe(8);
    expect(sampledFrames).not.toContain(15);
  });

  it("can roll attack speed as a randomized item affix", () => {
    // 0.2 is in the magic range; 0.001 now drops a real unique at level 1.
    spyOn(Math, "random").and.returnValues(0, 0.2, 0.4, 0.5, 0.5);

    const item = (component as any).randomItem();

    expect(item.stats.attackSpeedPercent).toBeGreaterThanOrEqual(5);
    expect(item.stats.attackSpeedPercent).toBeLessThanOrEqual(12);
    expect(item.affixes.some((affix: string) => affix.includes("Attack Speed"))).toBeTrue();
  });

  it("scales wand necromancer staffmods with the item level", () => {
    const rolls: number[] = [];
    spyOn(Math, "random").and.callFake(() => rolls.shift() ?? 0);
    const roll = (itemLevel: number, ...values: number[]) => {
      rolls.splice(0, rolls.length, ...values);
      return (component as any).rollWandSkillAffix(itemLevel);
    };

    expect(roll(23, 0.1, 0, 0.99).affix).toBe("+1 to Amplify Damage");
    expect(roll(24, 0.1, 0, 0.99).affix).toBe("+2 to Amplify Damage");
    expect(roll(43, 0.1, 0, 0.99).affix).toBe("+3 to Amplify Damage");
    expect(roll(43, 0.6, 0, 0.99).affix).toBe("+3 to Curses Skills");
    expect(roll(43, 0.99, 0.99).affix).toBe("+2 to Necromancer Skill Levels");
  });

  it("applies wand staffmods to effective necromancer skill ranks", () => {
    component.selectedClass = "necromancer";
    component.ownedSkills = ["Teeth", "Raise Skeleton"];
    component.skillLevels = { Teeth: 5, "Raise Skeleton": 2 };
    component.equipment.weapon = {
      id: "staffmod-wand", name: "Staffmod Wand", baseName: "Wand", rarity: "magic",
      slot: "weapon", equipmentType: "wand", desc: "A wand.",
      stats: {
        necromancerSkillLevels: { Teeth: 2 },
        necromancerTreeSkillLevels: { "Poison and Bone": 1 },
        necromancerClassSkillLevel: 1,
      },
    } as any;

    expect(component.skillLevels["Teeth"]).toBe(9);
    expect(component.skillLevels["Raise Skeleton"]).toBe(3);
    expect(component.skillLevels["Bone Spear"]).toBeUndefined();
    expect((component as any).baseSkillLevels.Teeth).toBe(5);

    component.equipment.weapon = null;
    expect(component.skillLevels["Teeth"]).toBe(5);
  });

  it("keeps wand staffmods when a save is sanitized", () => {
    (component as any).restoreRunState({
      selectedClass: "necromancer",
      playerLevel: 50,
      equipment: {
        weapon: {
          id: "saved-staffmod-wand", name: "Bone Wand of the Magus", baseName: "Bone Wand",
          rarity: "magic", slot: "weapon", equipmentType: "wand", desc: "A wand.",
          stats: {
            damageMin: 2, damageMax: 5,
            necromancerSkillLevels: { Teeth: 2 },
            necromancerTreeSkillLevels: { "Poison and Bone": 1 },
            necromancerClassSkillLevel: 1,
          },
          affixes: ["+2 to Teeth"],
        },
      },
      inventory: [],
      beltSlots: [],
    });

    const stats = component.equipment.weapon?.stats;
    expect(stats?.necromancerSkillLevels).toEqual({ Teeth: 2 });
    expect(stats?.necromancerTreeSkillLevels).toEqual({ "Poison and Bone": 1 });
    expect(stats?.necromancerClassSkillLevel).toBe(1);
  });

  it("scales orb sorceress staffmods with the item level", () => {
    const rolls: number[] = [];
    spyOn(Math, "random").and.callFake(() => rolls.shift() ?? 0);
    const roll = (itemLevel: number, ...values: number[]) => {
      rolls.splice(0, rolls.length, ...values);
      return (component as any).rollOrbSkillAffix(itemLevel);
    };

    expect(roll(23, 0.1, 0, 0.99).affix).toBe("+1 to Ice Bolt");
    expect(roll(24, 0.1, 0, 0.99).affix).toBe("+2 to Ice Bolt");
    expect(roll(43, 0.1, 0, 0.99).affix).toBe("+3 to Ice Bolt");
    expect(roll(43, 0.6, 0, 0.99).affix).toBe("+3 to Cold Spells");
    expect(roll(43, 0.99, 0.99).affix).toBe("+2 to Sorceress Skill Levels");
  });

  it("applies orb staffmods to effective sorceress skill ranks", () => {
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Ice Bolt", "Fire Bolt"];
    component.skillLevels = { "Ice Bolt": 5, "Fire Bolt": 2 };
    component.equipment.weapon = {
      id: "staffmod-orb", name: "Staffmod Orb", baseName: "Eagle Orb", rarity: "magic",
      slot: "weapon", equipmentType: "orb", desc: "An orb.",
      stats: {
        sorceressSkillLevels: { "Ice Bolt": 2 },
        sorceressTreeSkillLevels: { "Cold Spells": 1 },
        sorceressClassSkillLevel: 1,
      },
    } as any;

    expect(component.skillLevels["Ice Bolt"]).toBe(9);
    expect(component.skillLevels["Fire Bolt"]).toBe(3);
    expect(component.skillLevels["Frozen Orb"]).toBeUndefined();
    expect((component as any).baseSkillLevels["Ice Bolt"]).toBe(5);

    component.equipment.weapon = null;
    expect(component.skillLevels["Ice Bolt"]).toBe(5);
  });

  it("keeps orb staffmods when a save is sanitized", () => {
    (component as any).restoreRunState({
      selectedClass: "sorceress",
      playerLevel: 50,
      equipment: {
        weapon: {
          id: "saved-staffmod-orb", name: "Eagle Orb of the Magus", baseName: "Eagle Orb",
          rarity: "magic", slot: "weapon", equipmentType: "orb", desc: "An orb.",
          stats: {
            damageMin: 2, damageMax: 5,
            sorceressSkillLevels: { "Ice Bolt": 2 },
            sorceressTreeSkillLevels: { "Cold Spells": 1 },
            sorceressClassSkillLevel: 1,
          },
          affixes: ["+2 to Ice Bolt"],
        },
      },
      inventory: [],
      beltSlots: [],
    });

    const stats = component.equipment.weapon?.stats;
    expect(stats?.sorceressSkillLevels).toEqual({ "Ice Bolt": 2 });
    expect(stats?.sorceressTreeSkillLevels).toEqual({ "Cold Spells": 1 });
    expect(stats?.sorceressClassSkillLevel).toBe(1);
  });

  it("scales druid pelt staffmods with the item level", () => {
    const rolls: number[] = [];
    spyOn(Math, "random").and.callFake(() => rolls.shift() ?? 0);
    const roll = (itemLevel: number, ...values: number[]) => {
      rolls.splice(0, rolls.length, ...values);
      return (component as any).rollDruidPeltSkillAffix(itemLevel);
    };

    expect(roll(23, 0.1, 0, 0.99).affix).toBe("+1 to Firestorm");
    expect(roll(24, 0.1, 0, 0.99).affix).toBe("+2 to Firestorm");
    expect(roll(43, 0.1, 0, 0.99).affix).toBe("+3 to Firestorm");
    expect(roll(43, 0.6, 0, 0.99).affix).toBe("+3 to Elemental Skills");
    expect(roll(43, 0.99, 0.99).affix).toBe("+2 to Druid Skill Levels");
  });

  it("applies pelt staffmods to effective druid skill ranks", () => {
    component.selectedClass = "druid";
    component.ownedSkills = ["Firestorm", "Raven"];
    component.skillLevels = { Firestorm: 5, Raven: 2 };
    component.equipment.helmet = {
      id: "staffmod-pelt", name: "Staffmod Pelt", baseName: "Wolf Head", rarity: "magic",
      slot: "armor", equipmentType: "druidPelt", desc: "A pelt.",
      stats: {
        druidSkillLevels: { Firestorm: 2 },
        druidTreeSkillLevels: { Elemental: 1 },
        druidClassSkillLevel: 1,
      },
    } as any;

    expect(component.skillLevels["Firestorm"]).toBe(9);
    expect(component.skillLevels["Raven"]).toBe(3);
    expect(component.skillLevels["Summon Grizzly"]).toBeUndefined();
    expect((component as any).baseSkillLevels.Firestorm).toBe(5);

    component.equipment.helmet = null;
    expect(component.skillLevels["Firestorm"]).toBe(5);
  });

  it("keeps pelt staffmods when a save is sanitized", () => {
    (component as any).restoreRunState({
      selectedClass: "druid",
      playerLevel: 50,
      equipment: {
        helmet: {
          id: "saved-staffmod-pelt", name: "Wolf Head of the Magus", baseName: "Wolf Head",
          rarity: "magic", slot: "armor", equipmentType: "druidPelt", desc: "A pelt.",
          stats: {
            armor: 8,
            druidSkillLevels: { Firestorm: 2 },
            druidTreeSkillLevels: { Elemental: 1 },
            druidClassSkillLevel: 1,
          },
          affixes: ["+2 to Firestorm"],
        },
      },
      inventory: [],
      beltSlots: [],
    });

    const stats = component.equipment.helmet?.stats;
    expect(stats?.druidSkillLevels).toEqual({ Firestorm: 2 });
    expect(stats?.druidTreeSkillLevels).toEqual({ Elemental: 1 });
    expect(stats?.druidClassSkillLevel).toBe(1);
  });

  it("closes both hovered and selected item tooltips", () => {
    component.hoveredItem = { name: "Short Sword" } as any;
    component.selectedItem = { name: "Short Sword" } as any;
    component.selectedSlotIndex = 0;

    component.closeItemPreview();

    expect(component.hoveredItem).toBeNull();
    expect(component.selectedItem).toBeNull();
    expect(component.selectedSlotIndex).toBeNull();
    expect(component.itemPreviewItem).toBeNull();
  });

  it("keeps a tall item tooltip inside the viewport and on the pointer's other side", () => {
    const preview = document.createElement("div");
    spyOn(preview, "getBoundingClientRect").and.returnValue({ width: 340, height: 520 } as DOMRect);
    (component as any).inventoryItemWindow = { nativeElement: preview };
    const panelHeight = Math.min(520, window.innerHeight - 24);

    (component as any).positionItemPreviewAt(window.innerWidth - 20, window.innerHeight - 20);

    expect(component.itemPreviewLeft).toBeTrue();
    expect(component.itemPreviewAbove).toBeTrue();
    expect(component.itemPreviewX).toBeGreaterThanOrEqual(12);
    expect(component.itemPreviewY).toBeGreaterThanOrEqual(12);
    expect(component.itemPreviewX + 340).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(component.itemPreviewY + panelHeight).toBeLessThanOrEqual(window.innerHeight - 12);
  });

  it("remeasures the tooltip after Angular renders it so a tall panel is not clipped", () => {
    jasmine.clock().install();
    try {
      const preview = document.createElement("div");
      spyOn(preview, "getBoundingClientRect").and.returnValue({ width: 340, height: 220 } as DOMRect);
      const layout = spyOn<any>(component, "positionItemPreviewAt").and.callThrough();
      (component as any).inventoryItemWindow = undefined;

      (component as any).moveItemPreviewTo(100, 200);
      expect(layout.calls.count()).toBe(1);

      (component as any).inventoryItemWindow = { nativeElement: preview };
      jasmine.clock().tick(1);

      expect(layout.calls.count()).toBe(2);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("keeps a short item tooltip below and to the right of the pointer when there is room", () => {
    const preview = document.createElement("div");
    spyOn(preview, "getBoundingClientRect").and.returnValue({ width: 340, height: 220 } as DOMRect);
    (component as any).inventoryItemWindow = { nativeElement: preview };

    (component as any).positionItemPreviewAt(20, 20);

    expect(component.itemPreviewLeft).toBeFalse();
    expect(component.itemPreviewBelow).toBeTrue();
    expect(component.itemPreviewX).toBe(34);
    expect(component.itemPreviewY).toBe(34);
  });

  it("keeps a hover preview open while the pointer moves onto it", () => {
    jasmine.clock().install();
    try {
      component.hoveredItem = { name: "Short Sword" } as any;

      component.onItemPreviewLeave();
      component.onItemPreviewEnter();
      jasmine.clock().tick(200);

      expect(component.hoveredItem).not.toBeNull();

      component.onItemPreviewLeave();
      jasmine.clock().tick(200);

      expect(component.hoveredItem).toBeNull();
    } finally {
      component.onItemPreviewEnter();
      jasmine.clock().uninstall();
    }
  });

  it("closes the skill tooltip and keeps it open while the pointer moves onto it", () => {
    jasmine.clock().install();
    try {
      component.hoveredSkillTooltip = { name: "Might" } as any;

      component.onSkillTooltipLeave();
      component.onSkillTooltipEnter();
      jasmine.clock().tick(250);

      expect(component.hoveredSkillTooltip).not.toBeNull();

      component.hideSkillTooltip();

      expect(component.hoveredSkillTooltip).toBeNull();
    } finally {
      component.hideSkillTooltip();
      jasmine.clock().uninstall();
    }
  });

  it("throws an axe projectile for any class equipped with a throwing axe", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    component.enemies = [{ x: 300, y: 100, r: 10, hp: 100 } as any];
    component.equipment.weapon = { name: "Throwing Axe", baseName: "Throwing Axe", slot: "weapon" } as any;

    component.attackNearestEnemy();

    expect(component.enemies[0].hp).toBe(100);
    expect(component.attackProjectiles.length).toBe(1);
    expect(component.attackProjectiles[0].thrownWeapon).toBe("axe");
    expect((component as any).attackAnimationStyle).toBe("weaponThrow");
  });

  it("lets every class equip the generic throwing axe", () => {
    const classes = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"] as const;
    for (const classId of classes) {
      component.selectedClass = classId;
      component.playerLevel = 1;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.equipment = { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
      const item = {
        id: `throwing-axe-${classId}`,
        name: "Throwing Axe",
        baseName: "Throwing Axe",
        rarity: "normal" as const,
        slot: "weapon" as const,
        desc: "A throwing axe balanced for dual combat.",
        stats: { damageMin: 5, damageMax: 11 },
      };
      component.inventory[0] = item;
      component.equipSelectedItem(0);
      expect(component.equipment.weapon?.id).toBe(item.id);
    }
  });

  it("migrates a saved Barbarian Throwing Axe to the unrestricted generic base", () => {
    const legacy = {
      id: "legacy-barbarian-throwing-axe",
      name: "Savage Barbarian Throwing Axe of Haste",
      baseName: "Barbarian Throwing Axe",
      rarity: "rare",
      slot: "weapon",
      restrictedClass: "barbarian",
      desc: "A Barbarian-only throwing axe balanced for dual combat.",
      stats: { damageMin: 5, damageMax: 11 },
      affixes: ["+5 Maximum Damage (Savage)"],
    };
    (component as any).restoreRunState({
      selectedClass: "sorceress",
      playerLevel: 99,
      equipment: { weapon: legacy },
      inventory: [],
      beltSlots: [],
    });
    const weapon = component.equipment.weapon as any;
    expect(weapon?.name).toBe("Savage Throwing Axe of Haste");
    expect(weapon?.baseName).toBe("Throwing Axe");
    expect(weapon?.restrictedClass).toBeUndefined();
    expect(weapon?.desc).toBe("A throwing axe balanced for dual combat.");
    expect(weapon?.stats.damageMin).toBe(5);
    expect(weapon?.stats.damageMax).toBe(11);
  });

  it("migrates a saved Barbarian Great Sword to the unrestricted generic base", () => {
    const legacy = {
      id: "legacy-barbarian-great-sword",
      name: "Cruel Barbarian Great Sword of Swiftness",
      baseName: "Barbarian Great Sword",
      rarity: "rare",
      slot: "weapon",
      restrictedClass: "barbarian",
      desc: "A Barbarian-only great sword built for sweeping strikes.",
      stats: { damageMin: 8, damageMax: 17 },
      affixes: ["+120% Enhanced Damage (Cruel)"],
    };
    (component as any).restoreRunState({
      selectedClass: "sorceress",
      playerLevel: 99,
      equipment: { weapon: legacy },
      inventory: [],
      beltSlots: [],
    });
    const weapon = component.equipment.weapon as any;
    expect(weapon?.name).toBe("Cruel Great Sword of Swiftness");
    expect(weapon?.baseName).toBe("Great Sword");
    expect(weapon?.restrictedClass).toBeUndefined();
    expect(weapon?.desc).toBe("A massive great sword that any class can wield.");
    expect(weapon?.stats.damageMin).toBe(8);
    expect(weapon?.stats.damageMax).toBe(17);
  });

  it("uses the throwing animation and a javelin projectile for javelin weapons", () => {
    component.equipment.weapon = { name: "War Javelin", baseName: "War Javelin", slot: "weapon" } as any;

    expect((component as any).thrownWeaponKind).toBe("javelin");
    expect((component as any).attackStyleForEquippedWeapon("sorceressCast")).toBe("weaponThrow");
  });

  it("auto-throws a throwing weapon from range without applying melee damage", () => {
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    const target = { x: 250, y: 100, r: 10, hp: 100 } as any;
    component.enemies = [target];
    component.equipment.weapon = { name: "Balanced Axe", baseName: "Balanced Axe", slot: "weapon" } as any;

    (component as any).updateBasicAttack();

    expect(target.hp).toBe(100);
    expect(component.attackProjectiles.length).toBe(1);
    expect(component.attackProjectiles[0].thrownWeapon).toBe("axe");
  });

  it("points generated weapons up regardless of the rig's hand-bone orientation", () => {
    const model = new THREE.Group();
    const hand = new THREE.Object3D();
    hand.name = "R_weapon_attach";
    // A rig whose weapon bone points sideways must still hold the blade upright.
    hand.rotation.z = Math.PI / 2;
    model.add(hand);
    model.updateMatrixWorld(true);
    (component as any).captureWeaponHandRestPose(model);

    const weapon = (component as any).createEquippedWeaponVisual(
      { id: "test-sword", name: "War Sword", baseName: "War Sword", slot: "weapon" } as any,
      hand,
      "weapon",
    ) as THREE.Group;
    model.updateMatrixWorld(true);

    const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(weapon.getWorldQuaternion(new THREE.Quaternion()));
    const modelUp = new THREE.Vector3(0, 1, 0).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    expect(weapon.parent).toBe(hand);
    expect(worldUp.dot(modelUp)).toBeGreaterThan(0.9);
  });

  it("replays the hero preview attack on a click but not after a drag", () => {
    component.previewModel = new THREE.Group();
    (component as any).previewModelClass = "barbarian";
    (component as any).previewAttackTime = Number.POSITIVE_INFINITY;
    const pointerDown = {
      button: 0,
      pointerId: 1,
      clientX: 40,
      clientY: 40,
      currentTarget: { setPointerCapture: () => undefined },
    } as any;

    component.onClassPreviewPointerDown(pointerDown);
    component.onClassPreviewPointerUp({ pointerId: 1, type: "pointerup", clientX: 40, clientY: 40 } as any);
    expect((component as any).previewAttackTime).toBe(0);
    expect((component as any).previewAttackStyle).toBe("barbarianCleave");

    (component as any).previewAttackTime = Number.POSITIVE_INFINITY;
    component.onClassPreviewPointerDown(pointerDown);
    component.onClassPreviewPointerMove({ pointerId: 1, clientX: 90, clientY: 40 } as any);
    component.onClassPreviewPointerUp({ pointerId: 1, type: "pointerup", clientX: 90, clientY: 40 } as any);
    expect((component as any).previewAttackTime).toBe(Number.POSITIVE_INFINITY);
  });

  it("resolves nearby enemies through the spatial grid and coalesces batched damage", () => {
    const first = { x: 130, y: 128, r: 10, hp: 100 } as any;
    const second = { x: 136, y: 128, r: 10, hp: 100 } as any;
    const far = { x: 2000, y: 2000, r: 10, hp: 100 } as any;
    component.enemies = [first, second, far];
    component.floatingTexts = [];
    (component as any).rebuildEnemyGrid();

    const nearby = (component as any).collectEnemiesNear(128, 128, 40);
    expect(nearby).toContain(first);
    expect(nearby).toContain(second);
    expect(nearby).not.toContain(far);

    (component as any).queueEnemyDamage(first, 5, "#ffffff");
    (component as any).queueEnemyDamage(first, 7, "#ffffff");
    (component as any).flushPendingDamage();
    expect(first.hp).toBe(88);
    expect(second.hp).toBe(100);
    expect(component.floatingTexts.filter((text) => text.text === "-12").length).toBe(1);
  });

  it("rounds up fractional damage numbers displayed for player attacks", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 4.2;
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.skillLevels = {};
    component.ownedSkills = [];
    component.floatingTexts = [];
    const target = { x: 260, y: 250, r: 12, hp: 100 } as any;
    component.enemies = [target];

    component.attackNearestEnemy();

    expect(target.hp).toBeCloseTo(95.8, 5);
    expect(component.floatingTexts.some((text) => text.text === "-5")).toBeTrue();
  });

  it("re-homes Barbarian pauldron bones onto the upper arms without moving them at rest", () => {
    const model = new THREE.Group();
    const rightArm = new THREE.Bone();
    rightArm.name = "R_UpperArm";
    rightArm.position.set(1, 0, 0);
    const leftArm = new THREE.Bone();
    leftArm.name = "L_UpperArm";
    leftArm.position.set(-1, 0, 0);
    const heavyPad = new THREE.Bone();
    heavyPad.name = "R_hvy_pad_pivot";
    heavyPad.position.set(1, 0.5, 0);
    const mediumPad = new THREE.Bone();
    mediumPad.name = "R_med_pad_pivot";
    mediumPad.position.set(0.8, 0.4, 0);
    const leftMediumPad = new THREE.Bone();
    leftMediumPad.name = "L_med_pad_pivot";
    leftMediumPad.position.set(-0.8, 0.4, 0);
    model.add(rightArm, leftArm, heavyPad, mediumPad, leftMediumPad);
    model.updateMatrixWorld(true);
    const pads = [heavyPad, mediumPad, leftMediumPad];
    const restPositions = pads.map((pad) => pad.getWorldPosition(new THREE.Vector3()));
    const unrelated = new THREE.Bone();
    const rig = {
      satellites: [...pads.map((bone) => ({ bone })), { bone: unrelated }],
    } as any;

    (component as any).attachBarbarianShoulderPads(model, "barbarian", rig);
    model.updateMatrixWorld(true);

    expect(heavyPad.parent).toBe(rightArm);
    expect(mediumPad.parent).toBe(rightArm);
    expect(leftMediumPad.parent).toBe(leftArm);
    expect(rig.satellites).toEqual([{ bone: unrelated }]);
    pads.forEach((pad, index) => {
      expect(pad.getWorldPosition(new THREE.Vector3()).distanceTo(restPositions[index])).toBeCloseTo(0, 5);
    });

    rightArm.rotation.z = Math.PI / 2;
    leftArm.rotation.z = -Math.PI / 2;
    model.updateMatrixWorld(true);
    pads.forEach((pad, index) => {
      expect(pad.getWorldPosition(new THREE.Vector3()).distanceTo(restPositions[index])).toBeGreaterThan(0.1);
    });
  });

  it("imports the complete real unique and set catalogues", () => {
    expect(D2_UNIQUE_ITEMS.length).toBe(424);
    expect(D2_SET_ITEMS.length).toBe(140);
    const gnasher = D2_UNIQUE_ITEMS.find((item) => item.name === "The Gnasher");
    expect(gnasher?.baseName).toBe("Hand Axe");
    expect(gnasher?.stats.enhancedDamagePercent).toBe(70);
    expect(gnasher?.stats.crushingBlowPercent).toBe(20);
  });

  it("aggregates Hsarus' partial and full set bonuses from equipped pieces", () => {
    const setItem = (name: string): any => {
      const generated = D2_SET_ITEMS.find((item) => item.name === name)!;
      return {
        id: name, name: generated.name, baseName: generated.baseName, rarity: "set",
        slot: generated.slot, equipmentType: generated.equipmentType, width: generated.width,
        height: generated.height, requiredLevel: generated.requiredLevel, setName: generated.setName,
        desc: generated.desc, stats: { ...generated.stats }, affixes: [...generated.affixes],
      };
    };
    component.equipment.shield = setItem("Hsarus' Iron Fist");
    component.equipment.boots = setItem("Hsarus' Iron Heel");
    expect(component.getEquippedSetCount("Hsarus' Defense")).toBe(2);
    expect(component.equippedThorns).toBe(5);
    expect(component.activeSetBonuses.some((bonus) => bonus.lines.includes("Attacker Takes Damage of 5"))).toBeTrue();
    const twoPieceLines = component.setBonusLines(component.equipment.shield!);
    expect(twoPieceLines.find((line) => line.text === "Cannot Be Frozen")?.active).toBeFalse();
    component.equipment.belt = setItem("Hsarus' Iron Stay");
    expect(component.getEquippedSetCount("Hsarus' Defense")).toBe(3);
    const fullLines = component.setBonusLines(component.equipment.belt!);
    expect(fullLines.find((line) => line.text === "Cannot Be Frozen")?.active).toBeTrue();
    expect(fullLines.find((line) => line.text === "Lightning Resist +25%")?.active).toBeTrue();
    expect(component.equippedResistancePercent).toBe(25);
    expect(component.equippedArmor).toBeGreaterThanOrEqual(53);
  });

  it("equips every set item through the inventory equip action at its required level", () => {
    const failures: string[] = [];
    for (const generated of D2_SET_ITEMS) {
      component.selectedClass = (generated.restrictedClass ?? "paladin") as any;
      component.playerLevel = generated.requiredLevel;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.equipment = { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
      component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null }));
      component.inventoryStatus = "";
      const item = (component as any).createNamedItem(generated, "set");
      component.inventory[0] = item;

      component.equipSelectedItem(0);

      if (!Object.values(component.equipment).some((equipped) => equipped?.id === item.id)) {
        failures.push(`${generated.name}: type=${generated.equipmentType} slot=${generated.slot} req=${generated.requiredLevel} status=${component.inventoryStatus}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("blocks equipping a named item above the hero's level", () => {
    const gnasher = D2_UNIQUE_ITEMS.find((item) => item.name === "The Gnasher")!;
    component.playerLevel = 1;
    component.inventory[0] = (component as any).createNamedItem(gnasher, "unique");
    component.equipSelectedItem(0);
    expect(component.equipment.weapon).toBeNull();
    expect(component.inventoryStatus).toContain("requires level 5");
  });

  it("does not offer named drops above the hero's level", () => {
    component.playerLevel = 1;
    spyOn(Math, "random").and.returnValue(0.99);
    const catalog = [
      { name: "Fitting Drop", requiredLevel: 1 },
      { name: "Too-High Drop", requiredLevel: 9 },
    ] as any;

    expect((component as any).randomNamedItem(catalog)?.name).toBe("Fitting Drop");
  });

  it("previews stat deltas for a hovered inventory item and ignores equipped items", () => {
    component.selectedClass = "paladin";
    component.playerLevel = 30;
    component.equipment.helmet = {
      id: "current-helm", name: "Current Helm", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "Current helmet.",
      stats: { armor: 10, plusStrength: 5, plusDexterity: 1, plusVitality: 2, plusEnergy: 1 },
    } as any;
    const candidate = {
      id: "candidate-helm", name: "Candidate Helm", baseName: "Helm", rarity: "rare",
      slot: "armor", equipmentType: "helmet", desc: "Candidate helmet.",
      stats: { armor: 25, plusStrength: 10, plusDexterity: 4, plusVitality: 6, plusEnergy: 3 },
    } as any;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = candidate;
    component.hoveredItem = candidate;
    component.hoveredSlotIndex = 0;

    expect(component.getPreviewItemStatDelta("strength")).toBe(5);
    expect(component.getPreviewItemStatDelta("dexterity")).toBe(3);
    expect(component.getPreviewItemStatDelta("vitality")).toBe(4);
    expect(component.getPreviewItemStatDelta("energy")).toBe(2);
    expect(component.getPreviewItemStatDelta("defense")).toBe(15);
    expect(component.getPreviewItemStatDelta("life")).toBe(4);
    expect(component.getPreviewItemStatDelta("mana")).toBe(4);

    component.selectedItem = candidate;
    component.selectedSlotIndex = 0;
    component.hoveredItem = component.equipment.helmet;
    component.hoveredSlotIndex = null;
    expect(component.getPreviewItemStatDelta("strength")).toBeNull();

    component.hoveredItem = null;
    expect(component.getPreviewItemStatDelta("strength")).toBe(5);
  });

  it("applies small charm stats while they sit in the pack", () => {
    component.playerMaxHp = 100;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = {
      id: "pack-charm", name: "Crimson Small Charm", baseName: "Small Charm", rarity: "magic",
      slot: "charm", equipmentType: "charm", desc: "A palm-sized charm.",
      stats: { plusStrength: 2, plusVitality: 4, allResistPercent: 5, magicFindPercent: 7 },
    } as any;
    component.inventory[1] = {
      id: "pack-ring", name: "Ring of the Artisan", baseName: "Ring", rarity: "magic",
      slot: "charm", equipmentType: "ring", desc: "A ring in the pack.",
      stats: { plusStrength: 50, plusVitality: 50 },
    } as any;

    expect(component.equippedStrengthBonus).toBe(2);
    expect(component.equippedVitalityBonus).toBe(4);
    expect(component.equippedResistancePercent).toBe(5);
    expect(component.equippedMagicFindPercent).toBe(7);
    expect(component.effectivePlayerMaxHp).toBe(104);

    component.inventory[0] = null;
    expect(component.equippedVitalityBonus).toBe(0);
  });

  it("drops only named items whose required level fits the hero", () => {
    component.playerLevel = 5;
    spyOn(Math, "random").and.returnValue(0.001);
    const item = (component as any).randomItem();
    expect(item.rarity).toBe("unique");
    expect(item.requiredLevel).toBeLessThanOrEqual(5);
    expect(D2_UNIQUE_ITEMS.some((entry) => entry.name === item.name)).toBeTrue();
  });

  it("imports a real D2R icon for every class skill and uses it in the tooltip", () => {
    const skills = Object.values(D2_CLASS_SKILL_TREES)
      .flatMap((tree) => tree.sections.flatMap((section) => section.skills));
    expect(skills.length).toBe(210);
    expect(Object.keys(D2_SKILL_ICON_PATHS).length).toBe(210);
    for (const skill of skills) {
      expect(D2_SKILL_ICON_PATHS[skill.name]).toMatch(/^assets\/d2survivors\/skills\/[a-z]+\/[a-z0-9-]+\.webp$/);
    }

    component.selectedClass = "amazon";
    component.playerLevel = 30;
    const magicArrow = D2_CLASS_SKILL_TREES["amazon"].sections[0].skills[0];
    component.showSkillTooltip(
      { clientX: 10, clientY: 10 } as MouseEvent,
      { ...magicArrow, state: "available" as const, reason: "" },
      "Bow and Crossbow",
    );
    expect(component.hoveredSkillTooltip?.icon).toBe(D2_SKILL_ICON_PATHS["Magic Arrow"]);
  });

  it("shows the required skills for a hovered skill and omits them for root skills", () => {
    component.selectedClass = "amazon";
    component.playerLevel = 1;
    const explodingArrow = D2_CLASS_SKILL_TREES["amazon"].sections[0].skills.find((skill) => skill.name === "Exploding Arrow")!;
    component.showSkillTooltip(
      { clientX: 10, clientY: 10 } as MouseEvent,
      { ...explodingArrow, state: "locked" as const, reason: "Requires Magic Arrow, Fire Arrow, Multiple Shot" },
      "Bow and Crossbow",
    );
    expect(component.hoveredSkillTooltip?.prerequisites).toEqual(["Magic Arrow", "Fire Arrow", "Multiple Shot"]);

    const magicArrow = D2_CLASS_SKILL_TREES["amazon"].sections[0].skills.find((skill) => skill.name === "Magic Arrow")!;
    component.showSkillTooltip(
      { clientX: 10, clientY: 10 } as MouseEvent,
      { ...magicArrow, state: "available" as const, reason: "" },
      "Bow and Crossbow",
    );
    expect(component.hoveredSkillTooltip?.prerequisites).toEqual([]);
  });

  it("switches the panel between the three class skill trees", () => {
    component.selectedClass = "amazon";
    expect(component.skillTreeSections.map((section) => section.name)).toEqual([
      "Bow and Crossbow",
      "Passive and Magic",
      "Javelin and Spear",
    ]);
    expect(component.activeSkillTreeSection?.name).toBe("Bow and Crossbow");

    component.selectSkillTreeTab("Javelin and Spear");
    expect(component.activeSkillTreeSection?.name).toBe("Javelin and Spear");
    expect(component.activeSkillTreeSection?.skills[0].name).toBe("Jab");

    component.selectSkillTreeTab("Passive and Magic");
    expect(component.activeSkillTreeSection?.name).toBe("Passive and Magic");
    expect(component.activeSkillTreeSection?.skills[0].name).toBe("Inner Sight");
  });

  it("tracks skill tree tabs by name so redraws reuse their buttons", () => {
    expect(component.trackBySectionName(0, { name: "Combat Skills" })).toBe("Combat Skills");
    expect(component.trackBySectionName(1, { name: "Combat Masteries" })).toBe("Combat Masteries");
  });

  it("uses distinct Diablo II colours and scaling for druid summons instead of the old sepia wash", () => {
    const tintFor = (skill: string) => (component as any).summonSpriteTint(skill);
    const lookFor = (skill: string) => (component as any).druidSummonLook(skill);
    const skills = [
      "Raven", "Summon Spirit Wolf", "Summon Dire Wolf", "Summon Grizzly",
      "Oak Sage", "Heart of Wolverine", "Spirit of Barbs",
      "Poison Creeper", "Carrion Vine", "Solar Creeper",
    ];

    expect(skills.every((skill) => tintFor(skill).length > 0)).toBeTrue();
    expect(tintFor("Summon Spirit Wolf")).not.toContain("sepia");
    expect(new Set(["Oak Sage", "Heart of Wolverine", "Spirit of Barbs"].map(tintFor)).size).toBe(3);
    expect(new Set(["Poison Creeper", "Carrion Vine", "Solar Creeper"].map(tintFor)).size).toBe(3);
    expect(lookFor("Raven").floating).toBeTrue();
    expect(lookFor("Oak Sage").floating).toBeTrue();
    expect(lookFor("Summon Spirit Wolf").sizeScale).toBeLessThan(1);
    // The two combat spirits are drawn at twice their old body size.
    expect(lookFor("Oak Sage").sizeScale).toBeCloseTo(1.64, 2);
    expect(lookFor("Heart of Wolverine").sizeScale).toBeCloseTo(1.64, 2);
    // The Oak Sage spirit and its aura are warm orange, not the old green.
    const oakLook = lookFor("Oak Sage");
    expect(oakLook.glow[0]).toBeGreaterThan(oakLook.glow[1]);
    expect(oakLook.glow[1]).toBeGreaterThan(oakLook.glow[2]);
    expect(tintFor("Oak Sage")).toContain("hue-rotate(-20deg)");
    expect((component as any).summonBarColor({ summonSkill: "Oak Sage" })).toBe("#e8954a");
  });

  it("keeps raven and wolf summons cast-only with one per skill rank", () => {
    component.selectedClass = "druid";
    component.enemies = [];
    const skills = ["Raven", "Summon Spirit Wolf", "Summon Dire Wolf"];
    component.ownedSkills = skills.slice();
    for (const skill of skills) component.skillLevels[skill] = 2;

    (component as any).restoreSummonsFromOwnedSkills();
    expect(component.enemies.filter((enemy) => enemy.summonType === "druid")).toHaveSize(0);

    for (const skill of skills) {
      component.enemies = [];
      const cast = () => (component as any).castSummonedServant(skill);
      const alive = () => component.enemies.filter((enemy) => enemy.summonSkill === skill && enemy.hp > 0).length;
      cast();
      expect(alive()).toBe(1);
      cast();
      expect(alive()).toBe(2);
      cast();
      expect(alive()).toBe(2);
    }
  });

  it("makes Oak Sage a non-attacking life aura for the druid and active summons", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.playerMaxHp = 400;
    component.playerHp = 300;
    component.skillLevels = { "Oak Sage": 1 };
    component.ownedSkills = ["Oak Sage"];
    component.enemies = [];

    const basePlayerMaxHp = component.effectivePlayerMaxHp;
    (component as any).summonCompanion("Oak Sage");
    (component as any).summonCompanion("Summon Spirit Wolf");

    const oak = component.enemies.find((enemy) => enemy.summonSkill === "Oak Sage")!;
    const wolf = component.enemies.find((enemy) => enemy.summonSkill === "Summon Spirit Wolf")!;
    expect(oak).toBeDefined();
    expect(wolf).toBeDefined();
    expect(component.effectivePlayerMaxHp).toBe(Math.round(basePlayerMaxHp * 1.3));
    expect((component as any).effectiveSummonMaxHp(wolf)).toBe(Math.round(wolf.maxHp * 1.3));
    expect(wolf.hp).toBe((component as any).effectiveSummonMaxHp(wolf));
    expect((component as any).getSummonRankStats("Oak Sage", 1)[0]).toContain("+30%");
    expect(component.getSkillDescription("Oak Sage")).toContain("cannot attack");

    component.enemies.push({
      kind: "normal",
      species: "fallen",
      spriteFrame: 0,
      x: oak.x + 8,
      y: oak.y,
      hp: 100,
      maxHp: 100,
      speed: 0,
      r: 14,
      dmg: 0,
      cd: 999,
    } as any);
    component.updateEnemies(16);

    expect(oak.attackAnimationTime ?? 0).toBe(0);
    expect(oak.animationState).not.toBe("attack");
    expect((component as any).summonAttackEffects).toHaveSize(0);

    component.playerHp = component.effectivePlayerMaxHp;
    oak.hp = 0;
    component.updateEnemies(16);

    expect(component.effectivePlayerMaxHp).toBe(basePlayerMaxHp);
    expect(component.playerHp).toBe(basePlayerMaxHp);
    expect((component as any).effectiveSummonMaxHp(wolf)).toBe(wolf.maxHp);
    expect(wolf.hp).toBe(wolf.maxHp);
  });

  it("keeps all druid support spirits out of combat and steers them away from enemies", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    component.skillLevels = { "Oak Sage": 1, "Heart of Wolverine": 1, "Spirit of Barbs": 1 };

    for (const skill of ["Oak Sage", "Heart of Wolverine", "Spirit of Barbs"]) {
      component.enemies = [];
      (component as any).summonCompanion(skill);
      const spirit = component.enemies.find((enemy) => enemy.summonSkill === skill)!;
      const enemy = {
        kind: "normal", species: "fallen", spriteFrame: 0,
        x: spirit.x + 40, y: spirit.y, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0, cd: 999,
      } as any;
      component.enemies.push(enemy);
      const effects = (component as any).summonAttackEffects as unknown[];
      effects.length = 0;
      const distanceBefore = Math.hypot(spirit.x - enemy.x, spirit.y - enemy.y);

      component.updateEnemies(16);

      expect(spirit.animationState).toBe("move");
      expect(spirit.attackAnimationTime ?? 0).toBe(0);
      expect(effects).toHaveSize(0);
      expect(Math.hypot(spirit.x - enemy.x, spirit.y - enemy.y)).toBeGreaterThan(distanceBefore);
      expect(enemy.hp).toBe(100);

      (component as any).summonAttack(spirit, enemy);
      expect(effects).toHaveSize(0);
      expect(enemy.hp).toBe(100);
    }
  });

  it("lets monsters attack the closest golem instead of the necromancer", () => {
    component.selectedClass = "necromancer";
    component.playerX = 100;
    component.playerY = 250;
    component.playerMaxHp = 100;
    component.playerHp = 100;

    for (const skill of ["Clay Golem", "Fire Golem", "Iron Golem"]) {
      const golem = {
        kind: "normal", species: "golem", spriteFrame: 0,
        summonType: "golem", summonSkill: skill,
        x: 240, y: 250, hp: 100, maxHp: 100, speed: 0, r: 19, dmg: 0,
      } as any;
      const monster = {
        kind: "normal", species: "fallen", spriteFrame: 0,
        x: 250, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 5, cd: 0,
      } as any;
      component.enemies = [golem, monster];
      component.playerHp = 100;

      component.updateEnemies(16);

      expect(golem.hp).toBe(95);
      expect(component.playerHp).toBe(100);
      expect(monster.animationState).toBe("attack");
    }
  });

  it("gives both venom vines poison damage and the solar creeper fire damage", () => {
    component.selectedClass = "druid";
    const typeFor = (skill: string) => (component as any).summonDamageType(skill);
    expect(typeFor("Poison Creeper")).toBe("poison");
    expect(typeFor("Carrion Vine")).toBe("poison");
    expect(typeFor("Solar Creeper")).toBe("fire");
    expect(typeFor("Summon Spirit Wolf")).toBe("physical");

    const strike = (skill: string) => {
      const summon = { summonSkill: skill, summonType: "druid", dmg: 12 } as any;
      (component as any).summonAttack(summon, { hp: 100 } as any);
      const effects = (component as any).summonAttackEffects;
      return effects[effects.length - 1];
    };
    expect(strike("Poison Creeper").damageType).toBe("poison");
    expect(strike("Carrion Vine").damageType).toBe("poison");
    expect(strike("Solar Creeper").damageType).toBe("fire");
    expect(strike("Summon Spirit Wolf").damageType).toBe("physical");

    expect((component as any).summonDamageColor({ summonSkill: "Poison Creeper", summonType: "druid" }, "poison")).toBe("#9bdb56");
    expect((component as any).summonDamageColor({ summonSkill: "Solar Creeper", summonType: "druid" }, "fire")).toBe("#ff8a32");
    expect((component as any).getSummonRankStats("Poison Creeper", 1)[1]).toContain("Poison damage");
  });

  it("cycles the four imported skeletal mage elements on a full pack of casts", () => {
    component.selectedClass = "necromancer";
    component.playerX = 250;
    component.playerY = 250;
    component.skillLevels = { "Skeletal Mage": 4 };
    component.enemies = [];

    for (let index = 0; index < 4; index += 1) (component as any).summonCompanion("Skeletal Mage");

    const mages = component.enemies.filter((enemy) => enemy.summonSkill === "Skeletal Mage");
    expect(mages.map((enemy) => enemy.summonElement)).toEqual(["cold", "fire", "lightning", "poison"]);
    expect(mages.map((enemy) => enemy.species)).toEqual([
      "skeletalMageCold", "skeletalMageFire", "skeletalMageLightning", "skeletalMagePoison",
    ]);
    expect(mages.every((enemy) => enemy.summonType === "skeleton")).toBeTrue();
  });

  it("makes raised skeletons melee while skeletal mages keep their distance", () => {
    component.selectedClass = "necromancer";
    component.playerX = 250;
    component.playerY = 250;
    component.playerMaxHp = 100;
    component.playerHp = 100;
    const skeleton = {
      kind: "normal", species: "skeletonWarrior", spriteFrame: 0, x: 250, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 10,
      summonType: "skeleton", summonSkill: "Raise Skeleton", summonSlot: 0,
      summonAttackCooldown: 0, animationState: "idle", facingX: 0, facingY: 1,
    } as any;
    const mage = {
      kind: "normal", species: "skeletalMageFire", spriteFrame: 0, x: 250, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 10,
      summonType: "skeleton", summonSkill: "Skeletal Mage", summonElement: "fire", summonSlot: 1,
      summonAttackCooldown: 0, animationState: "idle", facingX: 0, facingY: 1,
    } as any;
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 320,
      hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 0, cd: 999,
    } as any;
    component.enemies = [skeleton, mage, target];

    component.updateEnemies(16);

    expect(skeleton.animationState).toBe("move");
    expect(mage.animationState).toBe("attack");
    const effects = (component as any).summonAttackEffects;
    expect(effects).toHaveSize(1);
    expect(effects[0].summon).toBe(mage);
    expect(effects[0].damageType).toBe("fire");
  });

  it("maps each skeletal mage variant to its own elemental damage and colour", () => {
    component.selectedClass = "necromancer";
    const typeFor = (element: string) => (component as any).summonDamageType("Skeletal Mage", element);
    expect(["cold", "fire", "lightning", "poison"].map(typeFor)).toEqual(["cold", "fire", "lightning", "poison"]);
    expect((component as any).summonDamageColor({ summonSkill: "Skeletal Mage", summonElement: "cold" }, "cold")).toBe("#8fd8ff");
    expect((component as any).summonDamageColor({ summonSkill: "Skeletal Mage", summonElement: "lightning" }, "lightning")).toBe("#fff27a");
    expect((component as any).summonBarColor({ summonSkill: "Skeletal Mage", summonElement: "poison" })).toBe("#9bdb56");
    expect((component as any).getSummonRankStats("Skeletal Mage", 1).join(" ")).toContain("Elemental damage");
    expect((component as any).getSummonRankStats("Skeletal Mage", 1).join(" ")).toContain("Ranged attacks");
  });

  it("leaves capped, expiring burrow trails for the corpse vines", () => {
    component.selectedClass = "druid";
    component.runTime = 4;
    component.playerX = 250;
    component.playerY = 250;
    const creeper = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 250, y: 250,
      hp: 100, maxHp: 100, speed: 90, r: 15, dmg: 10, cd: 1,
      summonType: "druid", summonSkill: "Poison Creeper", summonSlot: 0,
      animationState: "move", facingX: 1, facingY: 0,
    } as any;
    component.enemies = [creeper];
    const marks = (component as any).creeperTrailMarks;
    marks.length = 0;

    component.updateEnemies(16);
    expect(marks.length).toBeGreaterThan(0);

    // Idle vines keep churning the floor instead of standing still above it.
    creeper.animationState = "idle";
    (component as any).addCreeperTrailMark(creeper);
    expect(marks.length).toBeGreaterThan(1);

    // The ring buffer cannot grow without bound, and every mark eventually goes.
    for (let index = 0; index < 200; index += 1) (component as any).addCreeperTrailMark(creeper);
    expect(marks.length).toBeLessThanOrEqual(120);
    (component as any).updateCreeperTrails(10);
    expect(marks.length).toBe(0);
  });

  it("shows the Cyclone Armor aura only while the timed shield is active", () => {
    component.selectedClass = "druid";
    component.ownedSkills = ["Cyclone Armor"];
    component.skillLevels = { "Cyclone Armor": 1 };
    (component as any).cycloneArmorRemaining = 0;
    expect((component as any).isCycloneArmorActive()).toBeFalse();

    (component as any).cycloneArmorRemaining = 5;
    expect((component as any).isCycloneArmorActive()).toBeTrue();

    component.skillLevels = { "Cyclone Armor": 0 };
    expect((component as any).isCycloneArmorActive()).toBeFalse();

    component.skillLevels = { "Cyclone Armor": 1 };
    component.selectedClass = "sorceress";
    expect((component as any).isCycloneArmorActive()).toBeFalse();

    component.selectedClass = "druid";
    component.ownedSkills = [];
    expect((component as any).isCycloneArmorActive()).toBeFalse();
  });

  it("runs Cyclone Armor as a timed, rank-scaling damage shield with a recast delay", () => {
    component.selectedClass = "druid";
    component.ownedSkills = ["Cyclone Armor"];
    component.skillLevels = { "Cyclone Armor": 1 };
    (component as any).skillCastCooldowns = {};
    (component as any).cycloneArmorRemaining = 0;
    component.runActive = true;

    const durationFor = (rank: number) => (component as any).cycloneArmorDurationForRank(rank);
    const reductionFor = (rank: number) => (component as any).cycloneArmorDamageReductionForRank(rank);
    expect(durationFor(5)).toBeGreaterThan(durationFor(1));
    expect(reductionFor(5)).toBeGreaterThan(reductionFor(1));

    (component as any).updateAutomaticSkillCasts(16);
    const duration = (component as any).cycloneArmorRemaining;
    expect(duration).toBe(durationFor(1));

    (component as any).cycloneArmorRemaining = 0;
    const unshielded = (component as any).applyIncomingDamage(100);
    (component as any).cycloneArmorRemaining = duration;
    const shielded = (component as any).applyIncomingDamage(100);
    expect(shielded).toBeLessThan(unshielded);

    (component as any).updateAutomaticSkillCasts((duration + 0.05) * 1000);
    expect((component as any).cycloneArmorRemaining).toBe(0);
    const recastDelay = component.getSkillCastInterval("Cyclone Armor");
    expect(recastDelay).toBeGreaterThan(0);

    (component as any).updateAutomaticSkillCasts((recastDelay + 0.05) * 1000);
    expect((component as any).cycloneArmorRemaining).toBe(durationFor(1));
  });

  it("draws the back and front Cyclone Armor bands from the imported DCC sheet", () => {
    component.selectedClass = "druid";
    component.ownedSkills = ["Cyclone Armor"];
    component.skillLevels = { "Cyclone Armor": 1 };
    (component as any).cycloneArmorAuraImage = { complete: true, naturalWidth: 1056 };

    const rows: number[] = [];
    const ctx = {
      save() {},
      restore() {},
      drawImage: (_image: unknown, _sx: number, sy: number) => { rows.push(sy); },
    } as any;

    (component as any).drawCycloneArmorAura(ctx, "back");
    expect(rows).toEqual([0, 192, 384]);

    rows.length = 0;
    (component as any).drawCycloneArmorAura(ctx, "front");
    expect(rows).toEqual([96, 288, 480]);
  });

  it("imports the original spinning-blade overlay for Blade Sentinel", () => {
    const art = ASSASSIN_AURA_ART["Blade Sentinel"];
    expect(art.path).toContain("assets/d2survivors/auras/assassin/blade-sentinel.png");
    expect(art.columns).toBe(20);
    expect(art.rows).toBe(1);
    expect(art.frameRate).toBe(16);
    expect(art.frontRow).toBe(0);
    expect(art.backRow).toBeNull();
  });

  it("draws Blade Sentinel as a centered aura frame from the imported sheet", () => {
    const art = ASSASSIN_AURA_ART["Blade Sentinel"];
    (component as any).worldZoom = 1;
    (component as any).bladeSentinelAuraImage = {
      complete: true,
      naturalWidth: art.columns * art.cell,
      naturalHeight: art.cell,
    };
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save() {}, restore() {}, drawImage } as any;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 420, y: 360 });

    (component as any).drawBladeSentinelAura(ctx, { x: 250, y: 250, time: 0.25, duration: 4 } as any);

    const frame = Math.floor(0.25 * art.frameRate) % art.columns;
    expect(drawImage).toHaveBeenCalledWith(
      jasmine.any(Object),
      frame * art.cell, (art.frontRow ?? 0) * art.cell, art.cell, art.cell,
      420 - art.originX * art.scale, 360 - art.originY * art.scale,
      art.cell * art.scale, art.cell * art.scale,
    );
  });

  it("preloads the Blade Sentinel aura sheet during the menu warm-up", () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    const fetchSpy = spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();

    expect(fetchSpy.calls.allArgs().map((args) => args[0]))
      .toContain(ASSASSIN_AURA_ART["Blade Sentinel"].path);
  });

  it("uses original overlay art for every paladin aura", () => {
    const skills = [
      "Might", "Holy Fire", "Holy Freeze", "Holy Shock", "Concentration", "Fanaticism", "Conviction", "Thorns",
      "Blessed Aim", "Vigor", "Defiance", "Prayer", "Resist Fire", "Resist Cold", "Resist Lightning", "Salvation",
      "Cleansing", "Meditation", "Redemption", "Sanctuary",
    ];

    expect(Object.keys(PALADIN_AURA_ART).sort()).toEqual([...skills].sort());
    for (const skill of skills) {
      const art = PALADIN_AURA_ART[skill];
      expect(art.path).toContain("assets/d2survivors/auras/paladin/");
      expect(art.columns).toBeGreaterThan(0);
      expect(art.rows).toBeGreaterThan(0);
      expect(art.backRow !== null || art.frontRow !== null).toBeTrue();
    }
    expect(PALADIN_AURA_ART["Vigor"].path).toContain("vigor.png");
    expect(PALADIN_AURA_ART["Resist Fire"].frontRow).toBe(0);
    expect(PALADIN_AURA_ART["Resist Cold"].backRow).toBe(0);
  });

  it("preloads and decodes every paladin aura during the menu warm-up", () => {
    const preload = spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();

    expect(preload.calls.allArgs().map((args) => args[0]).sort()).toEqual(Object.keys(PALADIN_AURA_ART).sort());
    expect(component.assetsTotal).toBeGreaterThanOrEqual(Object.keys(PALADIN_AURA_ART).length);
  });

  it("gives each sorceress armor spell its own imported aura sheet", () => {
    expect(Object.keys(ARMOR_AURA_ART).sort()).toEqual(["Chilling Armor", "Frozen Armor", "Shiver Armor"]);
    expect(new Set(Object.values(ARMOR_AURA_ART).map((art) => art.path)).size).toBe(3);
    for (const art of Object.values(ARMOR_AURA_ART)) {
      expect(art.path).toContain("assets/d2survivors/auras/armor/");
      expect(art.columns).toBeGreaterThan(0);
      expect(art.rows).toBeGreaterThan(0);
      expect(art.cell).toBe(128);
      expect(art.originY).toBeGreaterThan(art.cell / 2);
    }
  });

  it("shows only the strongest learned armor aura, drawn from its own sheet", () => {
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Frozen Armor"];
    component.skillLevels = { "Frozen Armor": 1 };
    expect((component as any).activeArmorAuraSkill()).toBe("Frozen Armor");

    component.ownedSkills.push("Shiver Armor");
    component.skillLevels["Shiver Armor"] = 1;
    expect((component as any).activeArmorAuraSkill()).toBe("Shiver Armor");

    component.ownedSkills.push("Chilling Armor");
    component.skillLevels["Chilling Armor"] = 1;
    expect((component as any).activeArmorAuraSkill()).toBe("Chilling Armor");

    (component as any).runTime = 0.25;
    (component as any).worldZoom = 1;
    const art = ARMOR_AURA_ART["Chilling Armor"];
    (component as any).armorAuraImages.set("Chilling Armor", {
      complete: true,
      naturalWidth: art.columns * art.cell,
      naturalHeight: art.rows * art.cell,
    });
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save() {}, restore() {}, drawImage } as any;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 420, y: 360 });

    (component as any).drawArmorAura(ctx);

    const frame = Math.floor(0.25 * art.frameRate) % (art.columns * art.rows);
    expect(drawImage).toHaveBeenCalledWith(
      jasmine.any(Object),
      (frame % art.columns) * art.cell, Math.floor(frame / art.columns) * art.cell, art.cell, art.cell,
      420 - art.originX * art.scale, 360 - art.originY * art.scale,
      art.cell * art.scale, art.cell * art.scale,
    );

    component.selectedClass = "paladin";
    expect((component as any).activeArmorAuraSkill()).toBeNull();
  });

  it("gives Bone Armor the original two-layer necromancer overlay", () => {
    expect(BONE_ARMOR_ART.path).toContain("assets/d2survivors/auras/necromancer/bone-armor.png");
    expect(BONE_ARMOR_ART.columns).toBe(24);
    expect(BONE_ARMOR_ART.rows).toBe(2);
    expect(BONE_ARMOR_ART.backRow).toBe(0);
    expect(BONE_ARMOR_ART.frontRow).toBe(1);
  });

  it("draws the Bone Armor back and front rows around the necromancer", () => {
    (component as any).runTime = 0.5;
    (component as any).worldZoom = 1;
    (component as any).boneArmorSheetRequested = true;
    (component as any).boneArmorSheet = {
      complete: true,
      naturalWidth: BONE_ARMOR_ART.columns * BONE_ARMOR_ART.cell,
      naturalHeight: BONE_ARMOR_ART.rows * BONE_ARMOR_ART.cell,
    };
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save() {}, restore() {}, drawImage } as any;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 420, y: 360 });

    (component as any).drawBoneArmorAura(ctx, "back");
    (component as any).drawBoneArmorAura(ctx, "front");

    const frame = Math.floor(0.5 * BONE_ARMOR_ART.frameRate) % BONE_ARMOR_ART.columns;
    expect(drawImage.calls.argsFor(0)[1]).toBe(frame * BONE_ARMOR_ART.cell);
    expect(drawImage.calls.argsFor(0)[2]).toBe(BONE_ARMOR_ART.backRow * BONE_ARMOR_ART.cell);
    expect(drawImage.calls.argsFor(1)[2]).toBe(BONE_ARMOR_ART.frontRow * BONE_ARMOR_ART.cell);
    expect(drawImage.calls.argsFor(0)[5]).toBe(420 - BONE_ARMOR_ART.originX * BONE_ARMOR_ART.scale);
  });

  it("preloads the Bone Armor sheet during the menu warm-up", () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadArmorAuraImage").and.returnValue(Promise.resolve());
    const fetchSpy = spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();

    expect(fetchSpy.calls.allArgs().map((args) => args[0])).toContain(BONE_ARMOR_ART.path);
  });

  it("preloads all three armor aura sheets during the menu warm-up", () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    const preload = spyOn(component as any, "preloadArmorAuraImage").and.returnValue(Promise.resolve());
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();

    expect(preload.calls.allArgs().map((args) => args[0]).sort()).toEqual(Object.keys(ARMOR_AURA_ART).sort());
  });

  it("gives Frost Nova its own 14-frame ring sheet", () => {
    expect(FROST_NOVA_ART.frames).toBe(14);
    expect(FROST_NOVA_ART.path).toBe("assets/d2survivors/effects/frost-nova.png");
    expect(FROST_NOVA_ART.originX).toBeLessThan(FROST_NOVA_ART.frameWidth);
    expect(FROST_NOVA_ART.originY).toBeLessThan(FROST_NOVA_ART.frameHeight);
  });

  it("erupts Frost Nova around the caster and damages only enemies inside the ring", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Frost Nova"];
    component.skillLevels = { "Frost Nova": 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    const edge = { ...base, x: 250 + 142 };
    const outside = { ...base, x: 250 + 180 };
    component.enemies = [inside, edge, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();
    const hits: any[] = [];
    spyOn(component as any, "queueEnemyDamage").and.callFake((enemy: any) => hits.push(enemy));

    component.activateOwnedSkill("Frost Nova");

    expect(hits).toContain(inside);
    expect(hits).toContain(edge);
    expect(hits).not.toContain(outside);
    expect(component.attackProjectiles.length).toBe(0);
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.frostNova);
    expect(effect).toBeTruthy();
    expect(effect.stationary).toBeTrue();
    expect(effect.fieldRadius).toBe(132);
    expect(inside.coldRemaining).toBeGreaterThan(0.9);
    expect(edge.coldRemaining).toBeGreaterThan(0.9);
    expect(outside.coldRemaining).toBeUndefined();
  });

  it("casts Static Field as an AOE lightning pulse that removes 25% of current life", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Static Field"];
    component.skillLevels = { "Static Field": 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    const edge = { ...base, x: 362 };
    const outside = { ...base, x: 390 };
    component.enemies = [inside, edge, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Static Field");

    expect(component.attackProjectiles.length).toBe(0);
    expect(inside.hp).toBeCloseTo(75);
    expect(edge.hp).toBeCloseTo(75);
    expect(outside.hp).toBe(100);
    expect(inside.staticFieldRemaining).toBeGreaterThan(0);
    expect(edge.staticFieldRemaining).toBeGreaterThan(0);
    expect(outside.staticFieldRemaining).toBeUndefined();
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.staticField);
    expect(effect).toBeTruthy();
    expect(effect.stationary).toBeTrue();
    expect(effect.fieldRadius).toBe(112);
  });

  it("casts Lightning as a full-screen rail that damages every enemy on the line", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Lightning"];
    component.skillLevels = { Lightning: 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    const near = { ...base, x: 340 };
    const far = { ...base, x: 900 };
    const offLine = { ...base, x: 600, y: 420 };
    const behind = { ...base, x: 100 };
    component.enemies = [near, far, offLine, behind];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();
    const hits: any[] = [];
    const damages: number[] = [];
    spyOn(component as any, "queueEnemyDamage").and.callFake((enemy: any, damage: number) => {
      hits.push(enemy);
      damages.push(damage);
    });

    component.activateOwnedSkill("Lightning");

    expect(component.attackProjectiles.length).toBe(0);
    expect(hits).toContain(near);
    expect(hits).toContain(far);
    expect(hits).not.toContain(offLine);
    expect(hits).not.toContain(behind);
    expect(damages.length).toBe(2);
    expect(damages[0]).toBe(damages[1]);
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.lightningRail);
    expect(effect).toBeTruthy();
    expect(effect.facingX).toBe(1);
    expect(effect.targetX).toBeGreaterThan(1000);
    expect(effect.duration).toBeGreaterThan(0);

    (component as any).updateSkillVisualEffects(400);
    expect((component as any).skillVisualEffects.some((entry: any) => entry.lightningRail)).toBeFalse();
  });

  it("widens Static Field with additional ranks", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Static Field"];
    component.skillLevels = { "Static Field": 5 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Static Field");

    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.staticField);
    expect(effect.fieldRadius).toBe(140);
    expect((component as any).getSkillRankStats("Static Field", "burst", 5)).toContain("Blast radius: 140 units");
    expect((component as any).getSkillRankStats("Static Field", "burst", 5)).toContain("Removes 25% of each hit enemy's current life");
  });

  it("slows and blue-tints chilled enemies until the cold wears off", () => {
    const enemy = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    expect((component as any).enemyMoveSpeed(enemy)).toBe(100);

    (component as any).applyEnemyChill(enemy);

    expect(enemy.coldRemaining).toBeCloseTo(1.1);
    expect((component as any).enemyMoveSpeed(enemy)).toBe(25);
    expect((component as any).enemySpriteTint(enemy, "base")).not.toBe("base");

    component.enemies = [enemy];
    component.playerX = 0;
    component.playerY = 0;
    component.updateEnemies(1100);

    expect(enemy.coldRemaining).toBeUndefined();
    expect((component as any).enemyMoveSpeed(enemy)).toBe(100);
    expect((component as any).enemySpriteTint(enemy, "base")).toBe("base");
  });

  it("flags ice projectiles as cold damage", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Ice Bolt"];
    component.skillLevels = { "Ice Bolt": 1 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Ice Bolt");

    expect(component.attackProjectiles[0]?.cold).toBeTrue();
  });

  it("channels Inferno in a long fire cone and cancels it when the caster moves", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Inferno"];
    component.skillLevels = { Inferno: 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 500, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    const behind = { ...base, x: 30 };
    const offCone = { ...base, x: 500, y: 340 };
    component.enemies = [inside, behind, offCone];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Inferno");

    expect(component.attackProjectiles.length).toBe(0);
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.inferno);
    expect(effect).toBeTruthy();
    expect(effect.duration).toBeCloseTo(1);
    expect(effect.coneRange).toBe(300);

    (component as any).updateSkillVisualEffects(0.6);
    (component as any).flushPendingDamage();

    expect(inside.hp).toBeLessThan(1000);
    expect(behind.hp).toBe(1000);
    expect(offCone.hp).toBe(1000);

    inside.hp = 1000;
    component.keysDown.add("d");
    (component as any).playerAttackLockRemaining = 0;
    component.movePlayer(16);
    expect((component as any).playerMoveX).toBeGreaterThan(0);
    expect((component as any).skillVisualEffects.some((entry: any) => entry.inferno)).toBeFalse();
    component.keysDown.delete("d");

    (component as any).updateSkillVisualEffects(0.6);
    (component as any).updateSkillVisualEffects(0.6);
    (component as any).flushPendingDamage();

    expect(inside.hp).toBe(1000);
  });

  it("cancels Arctic Blast when the druid moves", () => {
    component.selectedClass = "druid";
    component.ownedSkills = ["Arctic Blast"];
    component.skillLevels = { "Arctic Blast": 1 };
    component.activateOwnedSkill("Arctic Blast");
    expect((component as any).skillVisualEffects.some((entry: any) => entry.arcticBlast)).toBeTrue();

    component.keysDown.add("d");
    (component as any).playerAttackLockRemaining = 0;
    component.movePlayer(16);

    expect((component as any).skillVisualEffects.some((entry: any) => entry.arcticBlast)).toBeFalse();
  });

  it("extends Inferno's channel with its rank", () => {
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Inferno"];
    component.skillLevels = { Inferno: 5 };
    component.activateOwnedSkill("Inferno");

    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.inferno);
    expect(effect.duration).toBeCloseTo(1.4);
  });

  it("casts Blaze as a five-second fire trail instead of a projectile", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Blaze"];
    component.skillLevels = { Blaze: 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).blazeRemaining = 0;
    (component as any).blazeFirePatches.length = 0;
    (component as any).playerAttackLockRemaining = 0;

    component.activateOwnedSkill("Blaze");

    expect(component.attackProjectiles.length).toBe(0);
    expect((component as any).playerAttackLockRemaining).toBe(0);
    expect((component as any).blazeRemaining).toBeGreaterThanOrEqual(5);
    expect((component as any).blazeFirePatches.length).toBe(1);
    const patch = (component as any).blazeFirePatches[0];
    expect(patch.life).toBe(5);
    expect(patch.maxLife).toBe(5);
    expect(patch.radius).toBeGreaterThan(0);
  });

  it("lays fire along the sorceress's steps and burns enemies touching it", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerMoveX = 0;
    (component as any).playerMoveY = 0;
    component.ownedSkills = ["Blaze"];
    component.skillLevels = { Blaze: 1 };
    const inside = { kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    const outside = { ...inside, x: 400 };
    component.enemies = [inside, outside];
    component.floatingTexts = [];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Blaze");
    const firstPatch = (component as any).blazeFirePatches[0];
    expect(firstPatch.life).toBe(5);

    (component as any).updateSkillVisualEffects(200);
    (component as any).flushPendingDamage();
    expect(inside.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    // Standing still refreshes one patch instead of stacking fires in place.
    expect((component as any).blazeFirePatches.length).toBe(1);

    (component as any).playerMoveX = 30;
    (component as any).updateSkillVisualEffects(200);
    (component as any).playerMoveX = 0;
    const patches = (component as any).blazeFirePatches;
    expect(patches.length).toBe(2);
    expect(patches[0].x).toBeCloseTo(220);
    expect(patches[1].x).toBeCloseTo(250);

    (component as any).blazeRemaining = 0;
    (component as any).updateSkillVisualEffects(4700);
    expect(patches).toContain(firstPatch);
    (component as any).updateSkillVisualEffects(200);
    expect(patches).not.toContain(firstPatch);
  });

  it("casts Firestorm as one wandering ground-fire trail per rank", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Firestorm"];
    component.skillLevels = { Firestorm: 3 };
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0, x: 520, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    }] as any;
    component.attackProjectiles = [];
    (component as any).blazeFirePatches.length = 0;
    (component as any).firestormTrails.length = 0;
    (component as any).playerAttackLockRemaining = 0;

    component.activateOwnedSkill("Firestorm");

    expect(component.attackProjectiles.length).toBe(0);
    expect((component as any).firestormTrails.length).toBe(3);
    expect((component as any).blazeFirePatches.length).toBe(1);

    (component as any).updateSkillVisualEffects(1000);
    const patches = (component as any).blazeFirePatches;
    expect((component as any).firestormTrails.length).toBe(0);
    expect(patches.length).toBeGreaterThan(4);
    const farthest = Math.max(...patches.map((patch: any) => Math.hypot(patch.x - 250, patch.y - 250)));
    expect(farthest).toBeGreaterThan(120);
    expect(farthest).toBeLessThan(240);
    expect(patches.some((patch: any) => Math.abs(patch.y - 250) > 5)).toBeTrue();
  });

  it("casts Poison Explosion as a melee strike that leaves a poison cloud", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Poison Explosion"];
    component.skillLevels = { "Poison Explosion": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    const far = { ...target, x: 520 } as any;
    component.enemies = [target, far];
    component.floatingTexts = [];
    component.attackProjectiles = [];
    (component as any).poisonClouds.length = 0;
    (component as any).playerAttackLockRemaining = 0;
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Poison Explosion");

    expect(component.attackProjectiles.length).toBe(0);
    expect(target.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
    expect((component as any).poisonClouds.length).toBe(1);
    const cloud = (component as any).poisonClouds[0];
    expect(cloud.x).toBeCloseTo(target.x);
    expect(cloud.y).toBeCloseTo(target.y);
    expect(cloud.radius).toBe(58);
  });

  it("poisons every enemy inside the Poison Explosion cloud", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Poison Explosion"];
    component.skillLevels = { "Poison Explosion": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    const inside = { ...target, x: 300 } as any;
    const outside = { ...target, x: 400 } as any;
    component.enemies = [target, inside, outside];
    component.floatingTexts = [];
    (component as any).poisonClouds.length = 0;
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Poison Explosion");
    (component as any).updateSkillVisualEffects(16);
    (component as any).flushPendingDamage();

    expect(inside.hp).toBeLessThan(1000);
    expect(outside.hp).toBe(1000);
  });

  it("scales the Poison Explosion cloud radius and poison with ranks", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Poison Explosion"];
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.floatingTexts = [];
    (component as any).poisonClouds.length = 0;
    (component as any).rebuildEnemyGrid();

    component.skillLevels = { "Poison Explosion": 1 };
    component.activateOwnedSkill("Poison Explosion");
    const low = (component as any).poisonClouds[0];

    (component as any).poisonClouds.length = 0;
    target.hp = 1000;
    component.skillLevels = { "Poison Explosion": 10 };
    component.activateOwnedSkill("Poison Explosion");
    const high = (component as any).poisonClouds[0];

    expect(low.radius).toBe(58);
    expect(high.radius).toBe(112);
    expect(high.damagePerTick).toBeGreaterThan(low.damagePerTick);
    expect((component as any).getSkillRankStats("Poison Explosion", "burst", 10))
      .toContain("Melee strike: the hit leaves a 112-unit poison cloud");
  });

  it("plants a persistent Fire Wall instead of firing a projectile", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Fire Wall"];
    component.skillLevels = { "Fire Wall": 1 };
    component.enemies = [];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Fire Wall");

    expect(component.getSkillMissileOverlay("Fire Wall")).toBe("d2-wallfire_low_tiny");
    expect(component.attackProjectiles.length).toBe(1);
    const wall = component.attackProjectiles[0] as any;
    expect(wall.fireWall).toBeTrue();
    expect(wall.life).toBe(4);
    expect(wall.missileId).toBe("d2-wallfire_low_tiny");
    expect(wall.wallHalfLength).toBeGreaterThan(0);
    expect(wall.wallNormalX).toBeCloseTo(1);
    expect(wall.wallNormalY).toBeCloseTo(0);
    expect(wall.damage).toBeGreaterThan(0);
  });

  it("burns every monster touching or standing in the Fire Wall", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Fire Wall"];
    component.skillLevels = { "Fire Wall": 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    component.floatingTexts = [];

    component.activateOwnedSkill("Fire Wall");
    const wall = component.attackProjectiles[0] as any;
    const tangentX = -wall.wallNormalY;
    const tangentY = wall.wallNormalX;
    const makeEnemy = (x: number, y: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    }) as any;
    const touching = makeEnemy(wall.x + tangentX * 30, wall.y + tangentY * 30);
    const outside = makeEnemy(wall.x + wall.wallNormalX * 60, wall.y + wall.wallNormalY * 60);
    const beyondEnd = makeEnemy(wall.x + tangentX * (wall.wallHalfLength + 60), wall.y + tangentY * (wall.wallHalfLength + 60));
    component.enemies = [touching, outside, beyondEnd];
    (component as any).rebuildEnemyGrid();

    (component as any).updateAttackProjectiles(100);
    (component as any).flushPendingDamage();
    const firstHitHp = touching.hp;
    expect(wall.shotCooldown).toBeCloseTo(0.4);
    expect(firstHitHp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    expect(beyondEnd.hp).toBe(100);

    (component as any).updateAttackProjectiles(500);
    (component as any).flushPendingDamage();
    expect(touching.hp).toBeLessThan(firstHitHp);
  });

  it("expires the Fire Wall after four seconds", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Fire Wall"];
    component.skillLevels = { "Fire Wall": 1 };
    component.enemies = [];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Fire Wall");
    const wall = component.attackProjectiles[0];
    (component as any).updateAttackProjectiles(3900);
    expect(component.attackProjectiles).toContain(wall);
    (component as any).updateAttackProjectiles(200);
    expect(component.attackProjectiles).not.toContain(wall);
  });

  it("draws Fire Wall using the imported wallfire animation frames", () => {
    const frames = Array.from({ length: 25 }, () => ({ width: 32, height: 100 }));
    (component as any).missileOverlayImages.set("d2-wallfire_low_tiny", frames);
    (component as any).worldZoom = 1;
    (component as any).projectionDpr = 1;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined, beginPath: () => undefined,
      moveTo: () => undefined, lineTo: () => undefined, stroke: () => undefined, drawImage,
      globalAlpha: 1, lineCap: "butt", lineWidth: 1, strokeStyle: "", filter: "", shadowColor: "", shadowBlur: 0,
    } as any;
    const wall = {
      x: 250, y: 250, age: 1, life: 3, wallNormalX: 1, wallNormalY: 0,
      wallHalfLength: 84, missileId: "d2-wallfire_low_tiny",
    } as any;

    (component as any).drawFireWall(ctx, wall);

    expect(drawImage).toHaveBeenCalled();
    expect(frames).toContain(drawImage.calls.mostRecent().args[0]);
    expect(ctx.filter).toContain("hue-rotate(180deg)");
  });

  it("draws Inferno as a stream of imported flame frames", () => {
    const art = INFERNO_ART;
    const sheet = {
      complete: true,
      naturalWidth: art.frames * art.frameWidth,
      naturalHeight: art.frameHeight,
    } as HTMLImageElement;
    spyOn(component as any, "ensureInfernoSheet").and.returnValue(sheet);
    (component as any).worldZoom = 1;
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined, translate: () => undefined, rotate: () => undefined,
      beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined,
      fill: () => undefined, stroke: () => undefined, ellipse: () => undefined,
      createLinearGradient: () => ({ addColorStop: () => undefined }), drawImage,
    } as any;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number) => ({ x, y: 300 }));
    const effect = {
      inferno: true, x: 100, y: 100, facingX: 1, facingY: 0, time: 0.5, duration: 1,
      coneRange: 300, coneHalfAngle: Math.PI / 12, seed: 3, color: "#ff9c50",
    } as any;

    (component as any).drawInfernoStream(ctx, effect);

    expect(drawImage).toHaveBeenCalled();
    const calls = drawImage.calls.allArgs() as any[][];
    expect(calls.every((call) => call[0] === sheet
      && call[1] % art.frameWidth === 0 && call[2] === 0
      && call[3] === art.frameWidth && call[4] === art.frameHeight)).toBeTrue();
  });

  it("plants a Wake of Fire trap that fans five fireballs at monsters in range", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Wake of Fire"];
    component.skillLevels = { "Wake of Fire": 1 };
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Wake of Fire");

    const trap = component.attackProjectiles.find((projectile) => projectile.wakeOfFireTrap)!;
    expect(trap).toBeDefined();
    trap.shotCooldown = 0;
    (component as any).updateAttackProjectiles(16);

    const fireballs = component.attackProjectiles.filter((projectile) => !projectile.wakeOfFireTrap);
    expect(fireballs).toHaveSize(5);
    expect(fireballs.every((projectile) => projectile.missileId === "d2-fireball")).toBeTrue();
    expect(fireballs.every((projectile) => projectile.damage === 30)).toBeTrue();
    expect(fireballs.every((projectile) => projectile.pathHit)).toBeTrue();
    const angles = fireballs.map((projectile) => Math.atan2(projectile.targetY - trap.y, projectile.targetX - trap.x));
    expect(new Set(angles.map((angle) => angle.toFixed(3))).size).toBe(5);
    expect(trap.ammoRemaining).toBe(4);

    // With nothing in range the trap holds its remaining shots and waits.
    component.enemies = [];
    (component as any).rebuildEnemyGrid();
    trap.shotCooldown = 0;
    (component as any).updateAttackProjectiles(16);
    expect(component.attackProjectiles.filter((projectile) => !projectile.wakeOfFireTrap)).toHaveSize(5);
    expect(trap.ammoRemaining).toBe(4);
    expect(trap.life).toBeGreaterThan(0);
  });

  it("allows only five traps on the floor at once, counting every trap type", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Wake of Fire"];
    component.skillLevels = { "Wake of Fire": 1 };
    component.enemies = [];
    component.floatingTexts = [];
    component.attackProjectiles = [{
      x: 50, y: 50, startX: 50, startY: 50, targetX: 50, targetY: 50,
      speed: 0, damage: 0, life: 2, age: 0, radius: 5, color: "#ffffff", kind: "lightning",
      impactTrap: true,
    } as any];

    for (let index = 0; index < 4; index += 1) component.activateOwnedSkill("Wake of Fire");
    expect(component.attackProjectiles.filter((projectile) => projectile.wakeOfFireTrap)).toHaveSize(4);

    // The Shock Web trap already on the floor is the fifth, so this is refused.
    component.activateOwnedSkill("Wake of Fire");
    expect(component.attackProjectiles.filter((projectile) => projectile.wakeOfFireTrap)).toHaveSize(4);
    expect((component as any).activeTrapCount()).toBe(5);
    expect(component.floatingTexts.some((text) => text.text === "TRAP LIMIT 5")).toBeTrue();
  });

  it("plants a Wake of Inferno trap whose two-second cone burns everything inside it", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Wake of Inferno"];
    component.skillLevels = { "Wake of Inferno": 1 };
    const makeEnemy = (x: number, y: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    }) as any;
    const inside = makeEnemy(250, 250);
    const near = makeEnemy(250, 285);
    const outside = makeEnemy(250, 150);
    component.enemies = [inside, near, outside];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Wake of Inferno");

    const trap = component.attackProjectiles.find((projectile) => projectile.wakeOfInfernoTrap)!;
    expect(trap).toBeDefined();
    trap.shotCooldown = 0;
    (component as any).updateAttackProjectiles(16);

    const cone = (component as any).skillVisualEffects.find((effect: any) => effect.inferno && effect.stationary);
    expect(cone).toBeDefined();
    expect(cone.duration).toBe(2);
    expect(cone.x).toBe(100);
    expect(trap.ammoRemaining).toBe(9);

    // The sentry's cone stays planted even when the hero walks away.
    component.playerX = 400;
    (component as any).updateSkillVisualEffects(1000);
    (component as any).flushPendingDamage();

    expect(cone.x).toBe(100);
    expect(inside.hp).toBeLessThan(100);
    expect(near.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
  });

  it("draws planted traps with the imported sentry spike and ground-fire cels", () => {
    const trapFrames = Array.from({ length: 8 }, () => ({ width: 8, height: 7 }));
    const fireFrames = Array.from({ length: 37 }, () => ({ width: 66, height: 89 }));
    (component as any).missileOverlayImages.set("d2-firespikesground", trapFrames);
    (component as any).missileOverlayImages.set("d2-groundfiresmall", fireFrames);
    (component as any).worldZoom = 1;
    (component as any).projectionDpr = 1;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined, drawImage,
      globalAlpha: 1, globalCompositeOperation: "source-over",
    } as any;
    const trap = { x: 250, y: 250, age: 1, life: 3600, wakeOfFireTrap: true } as any;

    (component as any).drawTrap(ctx, trap);

    const drawn = drawImage.calls.allArgs().map((args) => args[0]);
    expect(drawn.some((frame) => trapFrames.includes(frame))).toBeTrue();
    expect(drawn.some((frame) => fireFrames.includes(frame))).toBeTrue();
  });

  it("uses the imported 15-frame Inferno sheet", () => {
    expect(INFERNO_ART.frames).toBe(15);
    expect(INFERNO_ART.path).toBe("assets/d2survivors/effects/inferno.png");
  });

  it("draws the Frost Nova sheet's expanding frame anchored on the caster", () => {
    const art = FROST_NOVA_ART;
    const sheet = {
      complete: true,
      naturalWidth: art.frames * art.frameWidth,
      naturalHeight: art.frameHeight,
    } as HTMLImageElement;
    spyOn(component as any, "ensureFrostNovaSheet").and.returnValue(sheet);
    (component as any).worldZoom = 1;
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    const effect = { frostNova: true, time: 0.5, duration: art.frames / art.frameRate, fieldRadius: 132 } as any;

    (component as any).drawFrostNovaRing(ctx, effect, { x: 300, y: 300 });

    const frame = Math.min(art.frames - 1, Math.floor(0.5 * art.frameRate));
    const scale = (132 * 2 * 0.7071) / art.frameWidth;
    expect(drawImage).toHaveBeenCalledWith(
      sheet,
      frame * art.frameWidth, 0, art.frameWidth, art.frameHeight,
      300 - art.originX * scale, 300 - art.originY * scale,
      art.frameWidth * scale, art.frameHeight * scale,
    );
  });

  it("uses the original D2 feet overlays for Oak Sage and Heart of Wolverine", () => {
    expect(Object.keys(DRUID_SPIRIT_AURA_ART).sort()).toEqual(["Heart of Wolverine", "Oak Sage"]);
    const oak = DRUID_SPIRIT_AURA_ART["Oak Sage"];
    expect(oak.path).toContain("assets/d2survivors/auras/druid/oak-sage-aura.png");
    expect(oak.columns).toBe(11);
    expect(oak.frameRate).toBe(6);
    const heart = DRUID_SPIRIT_AURA_ART["Heart of Wolverine"];
    expect(heart.path).toContain("assets/d2survivors/auras/druid/heart-of-wolverine-aura.png");
    expect(heart.columns).toBe(30);
    expect(heart.frameRate).toBe(16);
    for (const art of Object.values(DRUID_SPIRIT_AURA_ART)) {
      expect(art.cellWidth).toBeGreaterThan(0);
      expect(art.cellHeight).toBeGreaterThan(0);
      expect(art.originX).toBeGreaterThan(0);
      expect(art.originY).toBeGreaterThan(0);
    }
  });

  it("preloads and decodes both druid spirit auras during the menu warm-up", () => {
    const paladinPreload = spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    const druidPreload = spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();

    expect(druidPreload.calls.allArgs().map((args) => args[0]).sort()).toEqual(Object.keys(DRUID_SPIRIT_AURA_ART).sort());
    expect(component.assetsTotal).toBeGreaterThanOrEqual(
      Object.keys(PALADIN_AURA_ART).length + Object.keys(DRUID_SPIRIT_AURA_ART).length,
    );
    expect(paladinPreload).toHaveBeenCalled();
  });

  it("draws the imported feet overlay on the spirit's ground point", () => {
    (component as any).runTime = 0;
    (component as any).worldZoom = 1;
    (component as any).druidSpiritAuraImages.set("Oak Sage", {
      complete: true, naturalWidth: 128, naturalHeight: 80,
    });
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save() {},
      restore() {},
      drawImage,
    } as any;

    (component as any).drawDruidSpiritAura(ctx, "Oak Sage", { x: 200, y: 300 });

    const oak = DRUID_SPIRIT_AURA_ART["Oak Sage"];
    expect(drawImage).toHaveBeenCalledWith(
      jasmine.any(Object),
      0, 0, oak.cellWidth, oak.cellHeight,
      200 - oak.originX, 300 - oak.originY,
      oak.cellWidth, oak.cellHeight,
    );
  });

  it("draws Oak Sage's feet aura under the druid and every living summon", () => {
    component.selectedClass = "druid";
    component.runTime = 0;
    (component as any).worldZoom = 1;
    component.playerX = 100;
    component.playerY = 200;
    component.skillLevels = { "Oak Sage": 1 };
    component.ownedSkills = ["Oak Sage"];
    component.enemies = [];
    (component as any).summonCompanion("Oak Sage");
    (component as any).summonCompanion("Summon Spirit Wolf");
    const oak = component.enemies.find((enemy) => enemy.summonSkill === "Oak Sage")!;
    const wolf = component.enemies.find((enemy) => enemy.summonSkill === "Summon Spirit Wolf")!;
    component.enemies.push({ ...wolf, hp: 0, x: 900, y: 900 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "isArenaPointOnScreen").and.returnValue(true);
    (component as any).druidSpiritAuraImages.set("Oak Sage", {
      complete: true, naturalWidth: 128, naturalHeight: 80,
    });
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save() {}, restore() {}, drawImage } as any;

    (component as any).drawOakSageBeneficiaryAuras(ctx);

    const art = DRUID_SPIRIT_AURA_ART["Oak Sage"];
    const drawXs = drawImage.calls.allArgs().map((args) => args[5]);
    expect(drawImage).toHaveBeenCalledTimes(3);
    expect(drawXs).toContain(component.playerX - art.originX);
    expect(drawXs).toContain(oak.x - art.originX);
    expect(drawXs).toContain(wolf.x - art.originX);
    expect(drawXs).not.toContain(900 - art.originX);

    oak.hp = 0;
    drawImage.calls.reset();
    (component as any).drawOakSageBeneficiaryAuras(ctx);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("applies the ambience slider volume to the synthesized music bus", () => {
    const gain = {
      cancelScheduledValues: jasmine.createSpy("cancelScheduledValues"),
      setTargetAtTime: jasmine.createSpy("setTargetAtTime"),
    };
    (component as any).audioContext = {
      currentTime: 12,
      close: () => Promise.resolve(),
    } as unknown as AudioContext;
    (component as any).ambientMasterGain = {
      gain,
      disconnect: jasmine.createSpy("disconnectMaster"),
    } as unknown as GainNode;

    (component as any).setAmbientVolume({ target: { value: "35" } } as unknown as Event);

    expect(component.ambientVolumePercent).toBe(35);
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(12);
    const [level, when, timeConstant] = gain.setTargetAtTime.calls.mostRecent().args as [number, number, number];
    expect(level).toBeCloseTo(0.042, 6);
    expect(when).toBe(12);
    expect(timeConstant).toBe(0.05);
  });

  it("opens the skill tree only once when T is pressed from the arena", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.skillTreeOpen = false;
    const event = new KeyboardEvent("keydown", { key: "t" });

    // The arena handler must leave global shortcuts to the window listener.
    component.onKeyDown(event);
    expect(component.skillTreeOpen).toBeFalse();

    component.onGlobalAttackKey(event);
    expect(component.skillTreeOpen).toBeTrue();
  });

  it("closes the inventory with Escape without opening the game menu", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.inventoryOpen = true;
    component.escapeMenuOpen = false;

    component.onGlobalAttackKey(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(component.inventoryOpen).toBeFalse();
    expect(component.escapeMenuOpen).toBeFalse();
  });

  it("shows current and next rank effects for learned class skill upgrades", () => {
    component.selectedClass = "sorceress";
    component.playerLevel = 1;
    component.ownedSkills = ["Ice Bolt"];
    component.skillLevels = { "Ice Bolt": 3, "Frozen Armor": 20, "Warmth": 20, "Charged Bolt": 20 };
    component.pendingLevelUps = 1;
    (component as any).prepareUpgradeChoices();

    const learned = component.upgradeChoices.find((choice) => choice.id === "class-skill:Ice Bolt");
    expect(learned).toBeDefined();
    expect(learned!.currentRank).toBe(3);
    expect(learned!.nextRank).toBe(4);
    expect(learned!.currentStats!.length).toBeGreaterThan(0);
    expect(learned!.nextStats!.length).toBeGreaterThan(0);
    expect(learned!.nextStats).not.toEqual(learned!.currentStats);

    component.ownedSkills = [];
    component.skillLevels = { "Frozen Armor": 20, "Warmth": 20, "Charged Bolt": 20 };
    component.pendingLevelUps = 1;
    (component as any).prepareUpgradeChoices();

    const unlearned = component.upgradeChoices.find((choice) => choice.id === "class-skill:Ice Bolt");
    expect(unlearned).toBeDefined();
    expect(unlearned!.nextStats).toBeUndefined();
    expect(unlearned!.description).toContain("level 1");
  });

  it("gives Plated Belts and Sigon's Wrap four potion rows", () => {
    const platedBelt = { name: "Bladebuckle", baseName: "Plated Belt", slot: "belt", beltQuality: "normal" } as any;
    const sigonsWrap = { name: "Sigon's Wrap", baseName: "Plated Belt", slot: "belt", beltQuality: "normal" } as any;
    const plainPlatedBelt = { name: "Plated Belt", slot: "belt", beltQuality: "normal" } as any;
    const sash = { name: "Sash", baseName: "Sash", slot: "belt", beltQuality: "normal" } as any;

    expect(component.getBeltRows(platedBelt)).toBe(4);
    expect(component.getBeltRows(sigonsWrap)).toBe(4);
    expect(component.getBeltRows(plainPlatedBelt)).toBe(4);

    component.equippedBelt = sigonsWrap;
    expect(component.beltRows).toBe(4);

    component.equippedBelt = sash;
    expect(component.beltRows).toBe(2);
  });

  it("drops potions that no longer fit when equipping a smaller belt", () => {
    const platedBelt = { id: "large-belt", name: "Bladebuckle", baseName: "Plated Belt", slot: "belt", beltQuality: "normal" } as any;
    const sash = { id: "small-belt", name: "Sash", baseName: "Sash", slot: "belt", beltQuality: "normal" } as any;
    component.equipment.belt = platedBelt;
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    // Column 0, from top to bottom: two rejuvs above two health potions.
    component.beltSlots[0] = { kind: "rejuvenation" };
    component.beltSlots[1] = { kind: "rejuvenation" };
    component.beltSlots[2] = { kind: "health" };
    component.beltSlots[3] = { kind: "health" };
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = sash;
    component.potionDrops = [];
    component.playerX = 250;
    component.playerY = 250;

    component.equipBeltFromInventory(0);

    expect(component.equippedBelt).toBe(sash);
    expect(component.beltRows).toBe(2);
    expect(component.beltSlots.slice(0, 2).map((slot) => slot.kind)).toEqual(["health", "health"]);
    expect(component.beltSlots.slice(2).every((slot) => slot.kind === null)).toBeTrue();
    expect(component.potionDrops.map((drop) => drop.kind)).toEqual(["rejuvenation", "rejuvenation"]);
    expect(component.potionDrops.every((drop) => drop.pickupDelay > 0)).toBeTrue();
    expect(component.inventory[0]).toBe(platedBelt);
    expect(component.inventoryStatus).toContain("2 potions fell to the ground.");
  });

  it("toggles the potion belt between one row and all rows with the tilde key", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.beltExpanded = false;

    component.onGlobalAttackKey(new KeyboardEvent("keydown", { key: "~", code: "Backquote" }));
    expect(component.beltExpanded).toBeTrue();

    component.onGlobalAttackKey(new KeyboardEvent("keydown", { key: "`", code: "Backquote" }));
    expect(component.beltExpanded).toBeFalse();
  });

  it("gives Pandemonium enemies and bosses elemental immunities", () => {
    component.currentAct = 7;
    const fallen = (component as any).makeEnemy("normal", false, "fallen");
    expect(fallen.immunities).toEqual(["fire"]);

    component.currentAct = 8;
    const mephisto = (component as any).makeEnemy("boss", true, "mephisto");
    expect(mephisto.immunities).toEqual(["lightning"]);

    component.currentAct = 1;
    const campaignFallen = (component as any).makeEnemy("normal", false, "fallen");
    expect(campaignFallen.immunities).toBeUndefined();
  });

  it("draws Mephisto at double size without smoothing his sprite", () => {
    component.currentAct = 3;
    component.playerX = 250;
    component.playerY = 250;
    const mephisto = (component as any).makeEnemy("boss", true, "mephisto");
    mephisto.x = 260;
    mephisto.y = 250;
    mephisto.animationState = "idle";

    const frame = document.createElement("canvas");
    frame.width = 307;
    frame.height = 309;
    (component as any).enemySprites.mephisto = {
      frames: Array.from({ length: 24 }, () => [frame]),
      columns: 1,
      rows: 24,
      animated: true,
    };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 400, y: 300 });
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    const calls: unknown[][] = [];
    let spriteSmoothing: boolean | undefined;
    const originalDrawImage = ctx.drawImage.bind(ctx);
    (ctx as any).drawImage = (...args: unknown[]) => {
      calls.push(args);
      if (args.length === 5 && Number(args[3]) > 500 && Number(args[4]) > 500) {
        spriteSmoothing = ctx.imageSmoothingEnabled;
      }
      (originalDrawImage as any)(...args);
    };

    (component as any).drawEnemy(ctx, mephisto);

    const spriteCall = calls.find((args) => args.length === 5 && Number(args[3]) > 500 && Number(args[4]) > 500);
    const expectedHeight = mephisto.r * 4.2 * (component as any).worldZoom * 2 * 1.35;
    expect(spriteCall).toBeDefined();
    expect(Number(spriteCall![4])).toBeCloseTo(expectedHeight, 4);
    expect(spriteSmoothing).toBeFalse();
  });

  it("ignores matching elemental damage while still taking other elements", () => {
    component.floatingTexts = [];
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250,
      hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 2, immunities: ["fire"],
    } as any;
    component.enemies = [enemy];

    (component as any).queueEnemyDamage(enemy, 30, "#ff9c50", "fire");
    (component as any).flushPendingDamage();
    expect(enemy.hp).toBe(100);
    expect(component.floatingTexts.length).toBe(0);

    (component as any).queueEnemyDamage(enemy, 12, "#a9dcff", "lightning");
    (component as any).flushPendingDamage();
    expect(enemy.hp).toBe(88);
  });

  it("lets a cold-immune enemy shrug off Frost Nova without being chilled", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Frost Nova"];
    component.skillLevels = { "Frost Nova": 1 };
    const enemy = {
      kind: "normal", species: "skeleton", spriteFrame: 0, x: 300, y: 250,
      hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2, immunities: ["cold"],
    } as any;
    component.enemies = [enemy];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Frost Nova");
    (component as any).flushPendingDamage();

    expect(enemy.hp).toBe(100);
    expect(enemy.coldRemaining).toBeUndefined();
  });

  it("keeps Matron's Den Andariel's dedicated 3x health and 2x damage", () => {
    component.currentAct = 7;
    const matronsAndariel = (component as any).makeEnemy("boss", true, "andariel");
    const level83Difficulty = 1 + (83 - 1) * 0.04;
    const level83UberBossHealth = Math.round(140 * level83Difficulty * 4);
    const level83UberBossDamage = Math.ceil(6 * level83Difficulty * 2.2);

    expect(matronsAndariel.maxHp / level83UberBossHealth).toBeCloseTo(3, 1);
    expect(matronsAndariel.dmg / level83UberBossDamage).toBeCloseTo(2, 1);

    component.currentAct = 1;
    const campaignAndariel = (component as any).makeEnemy("boss", true, "andariel");
    expect(campaignAndariel.maxHp).toBe(140);
    expect(campaignAndariel.dmg).toBe(6);
  });

  it("triples Uber Tristram monster health and doubles its damage", () => {
    const level83Difficulty = 1 + (83 - 1) * 0.04;
    const stats = (act: number, kind: "normal" | "champion" | "boss", species: string, campaignBoss = false) => {
      component.currentAct = act;
      return (component as any).makeEnemy(kind, campaignBoss, species);
    };

    const pandemoniumNormal = stats(7, "normal", "fallen");
    const tristramNormal = stats(8, "normal", "fallen");
    expect(tristramNormal.maxHp).toBe(pandemoniumNormal.maxHp * 3);
    expect(tristramNormal.dmg).toBe(pandemoniumNormal.dmg * 2);

    const pandemoniumChampion = stats(7, "champion", "skeleton");
    const tristramChampion = stats(8, "champion", "skeleton");
    expect(tristramChampion.maxHp).toBe(pandemoniumChampion.maxHp * 3);
    expect(tristramChampion.dmg).toBe(pandemoniumChampion.dmg * 2);

    const pandemoniumBoss = stats(7, "boss", "mephisto", true);
    const tristramBoss = stats(8, "boss", "mephisto", true);
    expect(tristramBoss.maxHp).toBe(Math.round(140 * level83Difficulty * 4 * 3));
    expect(tristramBoss.dmg).toBe(Math.ceil(6 * level83Difficulty * 2.2 * 2));
    expect(tristramBoss.maxHp).toBeCloseTo(pandemoniumBoss.maxHp * 3, -1);
    expect(tristramBoss.dmg).toBeCloseTo(pandemoniumBoss.dmg * 2, -1);

    // The campaign keeps its original, unbuffed stat block.
    const campaignNormal = stats(1, "normal", "fallen");
    expect(campaignNormal.maxHp).toBe(18);
    expect(campaignNormal.dmg).toBe(2);
  });

  it("scales Uber Tristram monsters saved before the buff only once", () => {
    const savedEnemies = [
      { kind: "normal", species: "fallen", x: 300, y: 250, hp: 77, maxHp: 77, speed: 90, r: 14, dmg: 2, cd: 0.8 },
      { kind: "boss", campaignBoss: true, species: "diablo", x: 320, y: 260, hp: 2397, maxHp: 2397, speed: 70, r: 32, dmg: 57, cd: 1.1 },
    ];

    (component as any).restoreRunState({ currentAct: 8, enemies: savedEnemies });
    expect(component.enemies.map((enemy) => [enemy.maxHp, enemy.hp, enemy.dmg]))
      .toEqual([[231, 231, 4], [7191, 7191, 114]]);

    // A save that already records the buff keeps its monsters as they are.
    (component as any).restoreRunState({ currentAct: 8, uberTristramStatsScaled: true, enemies: savedEnemies });
    expect(component.enemies.map((enemy) => enemy.maxHp)).toEqual([77, 2397]);
  });

  it("names the hovered enemy's immunities for the card under its health bar", () => {
    component.currentAct = 8;
    const diablo = (component as any).makeEnemy("boss", true, "diablo");
    component.hoveredEnemy = diablo;

    expect(component.getEnemyImmunityLabel(diablo)).toBe("Fire");

    component.currentAct = 1;
    const campaignFallen = (component as any).makeEnemy("normal", false, "fallen");
    component.hoveredEnemy = campaignFallen;
    expect(component.getEnemyImmunityLabel(campaignFallen)).toBe("");
  });

  it("casts Molten Boulder as two straight rolling boulders", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Molten Boulder"];
    component.skillLevels = { "Molten Boulder": 1 };
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 220, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any,
    ];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Molten Boulder");

    const boulders = component.attackProjectiles.filter((projectile) => projectile.boulder);
    expect(boulders).toHaveSize(2);
    expect(boulders.every((projectile) => projectile.missileId === "d2-rock_large")).toBeTrue();
    expect(boulders.every((projectile) => projectile.radius === 24)).toBeTrue();
    expect(boulders.every((projectile) => projectile.target === undefined)).toBeTrue();
    const startX = boulders[0].x;
    const startY = boulders[0].y;
    for (let frame = 0; frame < 20; frame += 1) (component as any).updateAttackProjectiles(16);

    expect(boulders[0].x).toBeGreaterThan(startX);
    expect(Math.abs(boulders[0].y - startY)).toBeLessThan(5);
  });

  it("bulldozes monsters ahead of a Molten Boulder and bursts where it stops", () => {
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    component.floatingTexts = [];
    const makeEnemy = (x: number, y: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    }) as any;
    const front = makeEnemy(180, 250);
    const side = makeEnemy(200, 292);
    const rear = makeEnemy(70, 250);
    component.enemies = [front, side, rear];
    component.attackProjectiles = [{
      x: 100, y: 250, startX: 100, startY: 250, targetX: 400, targetY: 250,
      speed: 300, damage: 95, life: 10, age: 0, radius: 24, color: "#ff9c50", kind: "fire",
      missileId: "d2-rock_large", boulder: true,
    } as any];

    const sideStartY = side.y;
    for (let frame = 0; frame < 20; frame += 1) {
      (component as any).rebuildEnemyGrid();
      (component as any).updateAttackProjectiles(16);
    }
    const pinnedEarly = front.x;
    expect(pinnedEarly).toBeGreaterThan(180);

    // The flank monster is thrown clear the first time the rock clips it, and
    // the boulder never shoves it a second time.
    let sidePushed = false;
    let pushedSideY = sideStartY;
    for (let frame = 0; frame < 180; frame += 1) {
      (component as any).rebuildEnemyGrid();
      (component as any).updateAttackProjectiles(16);
      if (!sidePushed && side.y > sideStartY) {
        sidePushed = true;
        pushedSideY = side.y;
      }
    }
    expect(sidePushed).toBeTrue();
    expect(side.y).toBe(pushedSideY);
    expect(front.x).toBeGreaterThan(pinnedEarly);

    (component as any).flushPendingDamage();
    expect(front.hp).toBeLessThan(100);
    expect(side.hp).toBe(100);
    expect(rear.hp).toBe(100);
    expect(rear.x).toBe(70);
  });
});
