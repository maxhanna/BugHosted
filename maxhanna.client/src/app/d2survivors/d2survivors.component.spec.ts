import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import * as THREE from "three";
import { D2SurvivorsService } from "../../services/d2survivors.service";
import { D2SurvivorsComponent } from "./d2survivors.component";

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
    component.keysDown.add("d");

    component.attackNearestEnemy();
    expect((component as any).playerAttackLockRemaining).toBeGreaterThan(0);
    component.movePlayer(100);

    expect(component.playerX).toBe(250);
    expect(component.playerY).toBe(250);

    (component as any).playerAttackLockRemaining = 0;
    component.movePlayer(100);
    expect(target.x).toBeLessThan(260);
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
    expect((component as any).playerAttackLockRemaining).toBeCloseTo(0.38 / 1.5, 4);
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

  it("drives the Paladin's actual arms forward for a compact strike instead of leaning into the target", () => {
    component.selectedClass = "paladin";
    const rig = new THREE.Group();
    const spine = new THREE.Bone();
    spine.name = "spine_01_bind_jnt";
    const rightShoulder = new THREE.Bone();
    rightShoulder.name = "R_shoulder_bind_jnt";
    const leftShoulder = new THREE.Bone();
    leftShoulder.name = "L_shoulder_bind_jnt";
    spine.add(rightShoulder, leftShoulder);
    const rightArm = new THREE.Bone();
    rightArm.name = "R_upr_arm_bind_jnt";
    const rightArmTwist = new THREE.Bone();
    rightArmTwist.name = "R_upr_arm_twist_01_bind_jnt";
    const rightForearm = new THREE.Bone();
    rightForearm.name = "R_lwr_arm_bind_jnt";
    rightArm.add(rightArmTwist);
    rightArmTwist.add(rightForearm);
    const leftArm = new THREE.Bone();
    leftArm.name = "L_upr_arm_bind_jnt";
    const leftArmTwist = new THREE.Bone();
    leftArmTwist.name = "L_upr_arm_twist_01_bind_jnt";
    const leftForearm = new THREE.Bone();
    leftForearm.name = "L_lwr_arm_bind_jnt";
    leftArm.add(leftArmTwist);
    leftArmTwist.add(leftForearm);
    rig.add(spine, rightArm, leftArm);

    const characterModel = new THREE.Group();
    characterModel.add(rig);
    (component as any).characterModel = characterModel;
    (component as any).playerRigBones = (component as any).getPlayerRigBones(rig);
    expect((component as any).playerRigBones.arms.map((entry: any) => entry.bone.name)).toEqual([
      "R_upr_arm_bind_jnt",
      "L_upr_arm_bind_jnt",
    ]);
    expect((component as any).playerRigBones.forearms.map((entry: any) => entry.bone.name)).toEqual([
      "R_lwr_arm_bind_jnt",
      "L_lwr_arm_bind_jnt",
    ]);

    (component as any).animatePlayerModel(16);
    const idleLeftArm = leftArm.quaternion.clone();
    const idleRightArm = rightArm.quaternion.clone();
    (component as any).triggerAttackAnimation("paladinStrike");
    (component as any).animatePlayerModel(210);

    expect(leftArm.quaternion.angleTo(idleLeftArm)).toBeGreaterThan(0.8);
    expect(leftForearm.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.1);
    expect(spine.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(0.1);
    expect(characterModel.position.y).toBe(0);

    (component as any).triggerAttackAnimation("maceSmash");
    (component as any).animatePlayerModel(320);
    expect(rightArm.quaternion.angleTo(idleRightArm)).toBeGreaterThan(0.8);
    expect(spine.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(0.1);
    expect(characterModel.position.y).toBe(0);
  });

  it("lowers the Sorceress arms at rest and bends them at the rig's shoulder and elbow hinges when casting", () => {
    component.selectedClass = "sorceress";
    const rig = new THREE.Group();
    const rightArm = new THREE.Bone();
    rightArm.name = "R_UpperArm";
    const rightForearm = new THREE.Bone();
    rightForearm.name = "R_ForeArm";
    rightArm.add(rightForearm);
    const leftArm = new THREE.Bone();
    leftArm.name = "L_UpperArm";
    const leftForearm = new THREE.Bone();
    leftForearm.name = "L_ForeArm";
    leftArm.add(leftForearm);
    rig.add(rightArm, leftArm);

    const characterModel = new THREE.Group();
    characterModel.add(rig);
    (component as any).characterModel = characterModel;
    (component as any).playerRigBones = (component as any).getPlayerRigBones(rig);
    expect((component as any).playerRigBones.arms).toHaveSize(2);
    expect((component as any).playerRigBones.forearms).toHaveSize(2);

    (component as any).animatePlayerModel(16);
    const rightArmIdlePose = rightArm.quaternion.clone();
    expect(rightArmIdlePose.y).toBeLessThan(-0.3);
    expect(leftArm.quaternion.y).toBeLessThan(-0.3);

    (component as any).triggerAttackAnimation("sorceressCast");
    (component as any).animatePlayerModel(270);
    expect(rightArm.quaternion.angleTo(rightArmIdlePose)).toBeGreaterThan(0.5);
    expect(Math.abs(rightForearm.quaternion.y)).toBeGreaterThan(0.1);
    expect(leftArm.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.5);
  });

  it("lowers the Necromancer arms and animates the actual clavicle and elbow hinges during a cast", () => {
    component.selectedClass = "necromancer";
    const rig = new THREE.Group();
    const rightClavicle = new THREE.Bone();
    rightClavicle.name = "R_Clavicle";
    const rightArm = new THREE.Bone();
    rightArm.name = "R_UpperArm";
    const rightForearm = new THREE.Bone();
    rightForearm.name = "R_ForeArm";
    rightClavicle.add(rightArm);
    rightArm.add(rightForearm);
    const leftClavicle = new THREE.Bone();
    leftClavicle.name = "L_Clavicle";
    const leftArm = new THREE.Bone();
    leftArm.name = "L_UpperArm";
    const leftForearm = new THREE.Bone();
    leftForearm.name = "L_ForeArm";
    leftClavicle.add(leftArm);
    leftArm.add(leftForearm);
    rig.add(rightClavicle, leftClavicle);

    const characterModel = new THREE.Group();
    characterModel.add(rig);
    (component as any).characterModel = characterModel;
    (component as any).playerRigBones = (component as any).getPlayerRigBones(rig);
    expect((component as any).playerRigBones.arms.map((entry: any) => entry.bone.name)).toEqual(["R_Clavicle", "L_Clavicle"]);
    expect((component as any).playerRigBones.forearms).toHaveSize(2);

    (component as any).animatePlayerModel(16);
    const rightIdlePose = rightClavicle.quaternion.clone();
    const leftIdlePose = leftClavicle.quaternion.clone();
    expect(rightIdlePose.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.5);
    expect(leftIdlePose.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.5);

    (component as any).triggerAttackAnimation("necromancerCast");
    (component as any).animatePlayerModel(270);
    expect(rightClavicle.quaternion.angleTo(rightIdlePose)).toBeGreaterThan(0.1);
    expect(leftClavicle.quaternion.angleTo(leftIdlePose)).toBeGreaterThan(0.1);
    expect(rightForearm.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.1);
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
    expect(shield?.children.length).toBeGreaterThanOrEqual(3);
    expect((shield?.children[0] as THREE.Mesh).geometry).toBeInstanceOf(THREE.ExtrudeGeometry);

    component.equipment.shield = null;
    (component as any).configureClassMeleeWeapon(model, "paladin");
    expect(shieldAttach.children.some((child) => child.name.startsWith("equipped_shield_"))).toBeFalse();
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

  it("maps inventory items to art matching their equipment instead of defaulting legacy gear to body armor", () => {
    const imageFor = (name: string, slot: "weapon" | "armor" | "charm" | "belt", equipmentType?: string) =>
      component.inventoryItemImage({ name, slot, equipmentType } as any);

    expect(imageFor("Short Sword", "weapon")).toBe("assets/d2survivors/items/weapon.png");
    expect(imageFor("Bone Wand", "weapon")).toBe("assets/d2survivors/items/wand.png");
    expect(imageFor("Leather Cap", "armor")).toBe("assets/d2survivors/items/helmet.png");
    expect(imageFor("Chain Hauberk", "armor")).toBe("assets/d2survivors/items/body.png");
    expect(imageFor("Buckler", "armor")).toBe("assets/d2survivors/items/shield.png");
    expect(imageFor("Leather Gloves", "armor")).toBe("assets/d2survivors/items/gloves.png");
    expect(imageFor("Heavy Boots", "armor")).toBe("assets/d2survivors/items/boots.png");
    expect(imageFor("Gold Amulet", "charm")).toBe("assets/d2survivors/items/amulet.png");
    expect(imageFor("Ring of the Artisan", "charm")).toBe("assets/d2survivors/items/ring.png");
    expect(imageFor("Vampirefang Belt", "belt")).toBe("assets/d2survivors/items/belt.png");
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

    const model = new THREE.Group();
    const upperArm = new THREE.Bone();
    upperArm.name = "R_UpperArm";
    const forearm = new THREE.Bone();
    forearm.name = "R_ForeArm";
    const wrist = new THREE.Bone();
    wrist.name = "R_Wrist";
    const hand = new THREE.Bone();
    hand.name = "R_weapon_attach";
    model.add(upperArm);
    upperArm.add(forearm);
    forearm.add(wrist);
    wrist.add(hand);

    (component as any).configureClassMeleeWeapon(model, "paladin");
    const weapon = hand.children.find((child) => child.name === "equipped_weapon_weapon");
    expect(weapon).toBeDefined();
    expect(weapon?.children.some((child) => (child as THREE.Mesh).isMesh)).toBeTrue();

    const anchor = new THREE.Group();
    anchor.add(model);
    (component as any).characterModel = anchor;
    (component as any).playerRigBones = (component as any).getPlayerRigBones(model);
    const upperArmBase = upperArm.quaternion.clone();
    (component as any).triggerAttackAnimation();
    (component as any).animatePlayerModel(150);

    expect(upperArm.quaternion.angleTo(upperArmBase)).toBeGreaterThan(0.1);
    expect(weapon?.parent).toBe(hand);
    expect((component as any).attackAnimationSide).toBe(-1);

    (component as any).triggerAttackAnimation();
    expect((component as any).attackAnimationSide).toBe(-1);
  });

  it("animates Barbarian arm attacks at the upper-arm joints without rotating the clavicles", () => {
    component.selectedClass = "barbarian";
    const model = new THREE.Group();
    const clavicle = new THREE.Bone();
    clavicle.name = "R_Clavicle";
    const upperArm = new THREE.Bone();
    upperArm.name = "R_UpperArm";
    const forearm = new THREE.Bone();
    forearm.name = "R_ForeArm";
    model.add(clavicle);
    clavicle.add(upperArm);
    upperArm.add(forearm);

    const anchor = new THREE.Group();
    anchor.add(model);
    (component as any).characterModel = anchor;
    (component as any).playerRigBones = (component as any).getPlayerRigBones(model);
    expect((component as any).playerRigBones.arms.map((entry: any) => entry.bone)).toContain(upperArm);
    expect((component as any).playerRigBones.arms.map((entry: any) => entry.bone)).not.toContain(clavicle);

    const clavicleBase = clavicle.quaternion.clone();
    const upperArmBase = upperArm.quaternion.clone();
    (component as any).triggerAttackAnimation();
    (component as any).animatePlayerModel(150);

    expect(clavicle.quaternion.angleTo(clavicleBase)).toBeCloseTo(0);
    expect(upperArm.quaternion.angleTo(upperArmBase)).toBeGreaterThan(0.1);
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
    spyOn(Math, "random").and.returnValues(0, 0, 0.5, 0.5, 0, 0.5);

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
    const arm = new THREE.Bone();
    arm.name = "R_UpperArm";
    arm.position.set(1, 0, 0);
    const pad = new THREE.Bone();
    pad.name = "R_hvy_pad_pivot";
    pad.position.set(1, 0.5, 0);
    model.add(arm, pad);
    model.updateMatrixWorld(true);
    const restPosition = pad.getWorldPosition(new THREE.Vector3());

    (component as any).attachBarbarianShoulderPads(model, "barbarian");
    model.updateMatrixWorld(true);

    expect(pad.parent).toBe(arm);
    expect(pad.getWorldPosition(new THREE.Vector3()).distanceTo(restPosition)).toBeCloseTo(0, 5);

    arm.rotation.z = Math.PI / 2;
    model.updateMatrixWorld(true);
    expect(pad.getWorldPosition(new THREE.Vector3()).distanceTo(restPosition)).toBeGreaterThan(0.1);
  });
});
