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
});
