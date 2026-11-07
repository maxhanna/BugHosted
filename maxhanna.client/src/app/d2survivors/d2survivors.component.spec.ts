import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import * as THREE from "three";
import { D2SurvivorsService } from "../../services/d2survivors.service";
import { D2SurvivorsComponent } from "./d2survivors.component";
import { D2_SET_ITEMS, D2_UNIQUE_ITEMS } from "./d2-item-assets.generated";
import { D2_SKILL_ICON_PATHS } from "./d2-skill-icons.generated";
import { PALADIN_AURA_ART } from "./d2-paladin-auras.generated";
import { D2_CLASS_SKILL_TREES } from "./d2survivors-skill-tree.data";
import { ATTACK_CLIP_INFO, buildCharacterRig } from "./character-animation";

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
    expect(weapon?.children.length).toBe(2);
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

  it("shows a shield icon for the empty shield slot on every class", () => {
    const classes = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"] as const;

    for (const classId of classes) {
      component.selectedClass = classId as typeof component.selectedClass;
      const expected = classId === "paladin" ? "paladin-shield.png" : "shield.png";
      expect(component.equipmentSlotImage("shield")).toContain(expected);
    }
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

  it("sends the Charged Bolt fan past its target and across the whole view", () => {
    component.selectedClass = "sorceress";
    component.playerX = 100;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 103, y: 242, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    (component as any).rebuildEnemyGrid();
    component.attackProjectiles = [];

    component.activateOwnedSkill("Charged Bolt");

    const bolts = component.attackProjectiles;
    expect(bolts).toHaveSize(5);
    for (const bolt of bolts) {
      // Nothing is targeted, so no bolt can end its flight on the nearest monster,
      // and every bolt is aimed a full view away from the caster.
      expect(bolt.target).toBeUndefined();
      expect(bolt.pierce).toBeTrue();
      const reach = Math.hypot(bolt.targetX - component.playerX, bolt.targetY - (component.playerY - 8));
      expect(reach).toBeGreaterThan(600);
    }

    const bolt = bolts[0];
    const hpBefore = target.hp;
    (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();
    // It shocks what it crosses and keeps travelling instead of dying there.
    expect(target.hp).toBeLessThan(hpBefore);
    expect(bolt.life).toBeGreaterThan(0);
    expect(bolt.x).toBeGreaterThan(100);
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
  });

  it("shows the imported unique and set cels for those rarities", () => {
    const imageFor = (name: string, baseName: string, rarity: "unique" | "set", slot = "weapon", equipmentType?: string) =>
      component.inventoryItemImage({ name, baseName, rarity, slot, equipmentType } as any);

    expect(imageFor("The Gnasher", "Hand Axe", "unique")).toBe("assets/d2survivors/items/d2/invhaxu.png");
    expect(imageFor("Rixots Keen", "Short Sword", "unique")).toBe("assets/d2survivors/items/unique/rixots-keen.png");
    expect(imageFor("Hsarus' Iron Fist", "Buckler", "set", "armor", "shield")).toBe("assets/d2survivors/items/set/hsarus-iron-fist.png");
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
      "assets/d2survivors/loot/chest-closed.png",
      "assets/d2survivors/loot/chest-opening-1.png",
      "assets/d2survivors/loot/chest-opening-2.png",
      "assets/d2survivors/loot/chest-open.png",
      "assets/d2survivors/loot/gold.png",
      "assets/d2survivors/loot/health-potion.png",
      "assets/d2survivors/loot/rejuvenation-potion.png",
    ]);
    expect(shadowCount).toBe(7);
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

  it("can roll attack speed as a randomized item affix", () => {
    // 0.2 is in the magic range; 0.001 now drops a real unique at level 1.
    spyOn(Math, "random").and.returnValues(0, 0.2, 0.4, 0.5, 0.5);

    const item = (component as any).randomItem();

    expect(item.stats.attackSpeedPercent).toBeGreaterThanOrEqual(5);
    expect(item.stats.attackSpeedPercent).toBeLessThanOrEqual(12);
    expect(item.affixes.some((affix: string) => affix.includes("Attack Speed"))).toBeTrue();
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

    (component as any).attachBarbarianShoulderPads(model, "barbarian");
    model.updateMatrixWorld(true);

    expect(heavyPad.parent).toBe(rightArm);
    expect(mediumPad.parent).toBe(rightArm);
    expect(leftMediumPad.parent).toBe(leftArm);
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

  it("blocks equipping a named item above the hero's level", () => {
    const gnasher = D2_UNIQUE_ITEMS.find((item) => item.name === "The Gnasher")!;
    component.playerLevel = 1;
    component.inventory[0] = (component as any).createNamedItem(gnasher, "unique");
    component.equipSelectedItem(0);
    expect(component.equipment.weapon).toBeNull();
    expect(component.inventoryStatus).toContain("requires level 5");
  });

  it("drops only named items whose required level fits the hero", () => {
    component.playerLevel = 1;
    spyOn(Math, "random").and.returnValue(0.001);
    const item = (component as any).randomItem();
    expect(item.rarity).toBe("unique");
    expect(item.requiredLevel).toBeLessThanOrEqual(9);
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

  it("shows the Cyclone Armor aura only for a druid who owns the skill", () => {
    component.selectedClass = "druid";
    component.ownedSkills = ["Cyclone Armor"];
    component.skillLevels = { "Cyclone Armor": 1 };
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
});
