import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import * as THREE from "three";
import { type D2LeaderboardEntry, D2SurvivorsService } from "../../services/d2survivors.service";
import { D2SurvivorsComponent, enemyD2PixelHeight, enemySpriteDirectionRow, enemySpriteRow, wereformRow } from "./d2survivors.component";
import { D2_ITEM_ART, D2_SET_ITEMS, D2_UNIQUE_ITEMS } from "./d2-item-assets.generated";
import { getD2BaseItemFootprint } from "./d2-item-footprints";
import { D2_HELMET_VISUALS, getHelmetVisualForItem } from "./d2-helmet-visuals.generated";
import { helmetMountQuaternion, helmetSeatOffset } from "./d2-helmet-mount";
import { D2_SKILL_ICON_PATHS } from "./d2-skill-icons.generated";
import { PALADIN_AURA_ART } from "./d2-paladin-auras.generated";
import { D2_PALADIN_AURA_HIT_ART } from "./d2-paladin-aura-hits.generated";
import { ARMOR_AURA_ART } from "./d2-armor-auras.generated";
import { BONE_ARMOR_ART } from "./d2-bone-armor.generated";
import { FROST_NOVA_ART } from "./d2-frost-nova.generated";
import { NOVA_RING_ART } from "./d2-nova-ring.generated";
import { THUNDER_STORM_ART } from "./d2-thunderstorm.generated";
import { HYDRA_ART } from "./d2-hydra.generated";
import { INFERNO_ART } from "./d2-inferno.generated";
import { ASSASSIN_AURA_ART } from "./d2-assassin-auras.generated";
import { DRUID_SPIRIT_AURA_ART } from "./d2-druid-auras.generated";
import { D2_CLASS_SKILL_TREES } from "./d2survivors-skill-tree.data";
import { ATTACK_CLIP_INFO, buildCharacterRig, gaitForClass, heldItemShare, poseCharacterRig } from "./character-animation";
import { D2_AFFIXES, eligibleAffixes, itemAffixTypes, rollAffix } from "./d2-item-affixes";
import { D2_RUNE_BY_NAME } from "./d2-runes";

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

  it("uses the original missile art from missiles.txt for every Amazon ranged skill", () => {
    const expected: Record<string, string> = {
      "Magic Arrow": "d2-safearrow", "Multiple Shot": "d2-arrow",
      "Guided Arrow": "d2-safearrow", "Strafe": "d2-arrow",
      "Fire Arrow": "d2-firearrow", "Exploding Arrow": "d2-firearrow",
      "Immolation Arrow": "d2-firearrow",
      "Cold Arrow": "d2-icearrow", "Ice Arrow": "d2-icearrow",
      "Freezing Arrow": "d2-icearrow",
      "Poison Javelin": "d2-javelin", "Plague Javelin": "d2-javelin",
      "Lightning Bolt": "d2-lightningjavelin", "Lightning Fury": "d2-lightningjavelin",
      "Charged Strike": "d2-chargedbolt", "Lightning Strike": "d2-lightningstrike",
    };
    for (const [skill, art] of Object.entries(expected)) {
      expect((component as any).missileOverlayId(skill)).toBe(art);
    }
  });

  it("draws Fire Bolt with its own smaller bolt cels", () => {
    expect((component as any).missileOverlayId("Fire Bolt")).toBe("d2-firebolt");
    expect((component as any).missileOverlayId("Fire Ball")).toBe("d2-fireball");
  });

  it("streams art through a bounded queue so the browser never runs out of requests", async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 30 }, () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });

    await (component as any).runAssetTasks(tasks, 4);

    expect(peak).toBe(4);
    expect(inFlight).toBe(0);
  });

  it("uses original D2R cels for the remaining player-skill effects", () => {
    expect((component as any).missileOverlayId("Teeth")).toBe("d2-teethmissile");
    expect((component as any).missileOverlayId("Blaze")).toBe("d2-groundfiresmall");
    expect((component as any).missileOverlayId("Corpse Explosion")).toBe("d2-corpseexplodeguts");
    expect((component as any).missileOverlayId("Psychic Hammer")).toBe("d2-mindblast");
  });

  it("uses the matching missile cel for Meteor, Poison Nova, and claw skills", () => {
    expect((component as any).missileOverlayId("Meteor")).toBe("d2-meteortail");
    expect((component as any).missileOverlayId("Poison Nova")).toBe("d2-poisonnova");
    expect((component as any).missileOverlayId("Fists of Fire")).toBe("d2-firearrowexplode");
    expect((component as any).missileOverlayId("Fire Claws")).toBe("d2-firearrowexplode");
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

  it("casts the spell assigned to the basic-attack slot instead of the weapon swing", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Fire Bolt"];
    component.skillLevels = { Attack: 1, "Fire Bolt": 1 };
    component.attackProjectiles = [];
    component.basicAttackSpell = "Fire Bolt";
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 420, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];

    (component as any).updateBasicAttack();

    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect((component as any).skillCastCooldowns["Fire Bolt"]).toBeGreaterThan(0);
    expect(target.hp).toBe(100);
  });

  it("falls back to the weapon attack while the assigned basic-attack spell is recharging", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Fire Bolt"];
    component.skillLevels = { Attack: 1, "Fire Bolt": 1 };
    component.attackProjectiles = [];
    component.basicAttackSpell = "Fire Bolt";
    (component as any).skillCastCooldowns = { "Fire Bolt": 4 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 262, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];

    (component as any).updateBasicAttack();

    expect(component.attackProjectiles.length).toBe(0);
    expect(target.hp).toBeLessThan(100);
    expect((component as any).skillCastCooldowns["Fire Bolt"]).toBe(4);
  });

  it("makes socketed white bases a regular part of the loot stream", () => {
    const socketedBases: any[] = [];
    for (let index = 0; index < 80; index += 1) {
      const item = (component as any).randomItem(30);
      if (item && item.rarity === "normal" && (item.sockets ?? 0) > 0) socketedBases.push(item);
    }

    expect(socketedBases.length).toBeGreaterThanOrEqual(2);
    expect(socketedBases.every((item) => item.slot !== "charm")).toBeTrue();
  });

  it("stocks socketed white bases at Gheed's shop", () => {
    const socketedOffers = component.gheedsShopItems.filter((offer) =>
      offer.item.rarity === "normal" && (offer.item.sockets ?? 0) > 0);
    expect(socketedOffers.length).toBeGreaterThan(0);

    const offer = socketedOffers[0];
    expect(component.shopOfferStatText(offer.item)).toContain(`Sockets: 0 / ${offer.item.sockets}`);
    component.sanctuaryGold = 5000;
    component.buyGheedsItem(offer);

    const bought = component.inventory.find((item) => !!item && item.baseName === offer.item.baseName && (item.sockets ?? 0) > 0);
    expect(bought).toBeTruthy();
    expect(component.sanctuaryGold).toBe(5000 - offer.cost);
  });

  it("lists owned castable spells and clears the assignment back to the weapon attack", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Fire Bolt", "Warmth"];

    expect(component.basicAttackPickerSpells).toEqual(["Fire Bolt"]);

    component.selectBasicAttackSpell("Fire Bolt");
    expect(component.basicAttackSpell).toBe("Fire Bolt");
    expect(component.basicAttackSlotSkill).toBe("Fire Bolt");

    component.selectBasicAttackSpell(null);
    expect(component.basicAttackSpell).toBeNull();
    expect(component.basicAttackSlotSkill).toBe("Attack");
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

  it("holds automatic and direct spells until the hero reaches a clicked enemy", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 100,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).clickMoveTarget = target;
    (component as any).skillCastCooldowns = {};

    // A click pursuit is a movement command even before displacement starts.
    expect((component as any).playerChasingClickedTarget).toBeTrue();
    (component as any).updateAutomaticSkillCasts(16);
    component.activateOwnedSkill("Charged Bolt");
    expect(component.attackProjectiles).toHaveSize(0);

    // Once the hero is at the click stop distance, combat may cast again.
    target.x = 130;
    expect((component as any).playerChasingClickedTarget).toBeFalse();
    (component as any).updateAutomaticSkillCasts(16);
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
  });

  it("lets the basic-attack picker take a press without closing itself", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.ownedSkills = ["Attack", "Charged Bolt"];
    component.skillLevels = { Attack: 1, "Charged Bolt": 1 };
    component.selectBasicAttackSpell(null);
    component.basicAttackPickerOpen = true;

    // The picker lives inside the battlefield wrapper, so its own pointerdown used
    // to dismiss it before the option's click could land.
    const picker = document.createElement("div");
    picker.className = "d2s-basic-attack-picker";
    const option = document.createElement("button");
    picker.appendChild(option);
    component.onArenaPointerDown({ target: option, pointerType: "mouse", button: 0 } as any);
    expect(component.basicAttackPickerOpen).toBeTrue();

    // The option's click then assigns the spell, and the bar shows it.
    component.selectBasicAttackSpell("Charged Bolt");
    expect(component.basicAttackSpell).toBe("Charged Bolt");
    expect(component.basicAttackSlotArt.kind).toBe("icon");
    expect(component.basicAttackSlotTitle).toContain("Charged Bolt");

    // A press on the battlefield itself still dismisses the picker.
    component.basicAttackPickerOpen = true;
    const arena = document.createElement("canvas");
    arena.className = "d2s-arena";
    component.onArenaPointerDown({ target: arena, pointerType: "touch", button: 0 } as any);
    expect(component.basicAttackPickerOpen).toBeFalse();
  });

  it("casts the basic attack on a right-click at the cursor", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Attack", "Charged Bolt"];
    component.skillLevels = { Attack: 1, "Charged Bolt": 1 };
    component.selectBasicAttackSpell("Charged Bolt");
    component.skillCastCooldowns["Charged Bolt"] = 0;
    (component as any).attackCooldown = 0;
    component.attackProjectiles = [];
    const arena = document.createElement("canvas");
    arena.className = "d2s-arena";
    const rightClick = () => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
      Object.defineProperty(event, "target", { value: arena });
      return event;
    };

    const spellClick = rightClick();
    component.onArenaContextMenu(spellClick);
    expect(spellClick.defaultPrevented).toBeTrue();
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.attackProjectiles[0].missileId).toBe("d2-chargedbolt");

    // With no spell assigned the weapon attack lands on the monster under the
    // cursor instead of walking to it.
    component.selectBasicAttackSpell(null);
    component.attackProjectiles = [];
    component.floatingTexts = [];
    (component as any).attackCooldown = 0;
    (component as any).clickMoveTarget = null;
    const monster = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0,
    } as any;
    component.enemies = [monster];
    component.onArenaContextMenu(rightClick());
    expect(component.floatingTexts.length).toBeGreaterThan(0);
    expect((component as any).clickMoveTarget).toBeNull();
  });

  it("aims a right-click spell at the monster under the cursor and falls back to the nearest", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Attack", "Fire Bolt"];
    component.skillLevels = { Attack: 1, "Fire Bolt": 1 };
    component.selectBasicAttackSpell("Fire Bolt");
    const arena = document.createElement("canvas");
    arena.className = "d2s-arena";
    const rightClick = () => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
      Object.defineProperty(event, "target", { value: arena });
      return event;
    };
    const monster = (x: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 0,
    }) as any;
    const near = monster(262);
    const clicked = monster(340);
    component.enemies = [near, clicked];
    component.attackProjectiles = [];
    component.skillCastCooldowns["Fire Bolt"] = 0;
    (component as any).attackCooldown = 0;

    // A monster under the cursor wins over the nearer one behind the hero.
    (component as any).updateHoveredEnemy = () => { (component as any).hoveredEnemy = clicked; };
    component.onArenaContextMenu(rightClick());
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.attackProjectiles[0].target).toBe(clicked);
    expect((component as any).playerFacingX).toBeCloseTo(1, 5);

    // Empty ground still casts, and the spell takes the nearest monster.
    component.attackProjectiles = [];
    component.skillCastCooldowns["Fire Bolt"] = 0;
    (component as any).attackCooldown = 0;
    (component as any).updateHoveredEnemy = () => { (component as any).hoveredEnemy = null; };
    component.onArenaContextMenu(rightClick());
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.attackProjectiles[0].target).toBe(near);
  });

  it("aims a left-click attack spell at the monster the hero walked to", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Attack", "Fire Bolt"];
    component.skillLevels = { Attack: 1, "Fire Bolt": 1 };
    component.selectBasicAttackSpell("Fire Bolt");
    const monster = (x: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 0,
    }) as any;
    const near = monster(262);
    const clicked = monster(285);
    component.enemies = [near, clicked];
    component.attackProjectiles = [];
    component.skillCastCooldowns["Fire Bolt"] = 0;
    (component as any).attackCooldown = 0;
    (component as any).clickMoveTarget = null;
    const arena = document.createElement("canvas");
    arena.className = "d2s-arena";
    (component as any).arenaRef = { nativeElement: arena };
    (component as any).updateHoveredEnemy = () => { (component as any).hoveredEnemy = clicked; };
    (component as any).updateHoveredGroundPickup = () => { (component as any).hoveredGroundPickup = null; };

    // The left click is a walk-to command aimed at the clicked monster...
    component.onArenaPointerDown({
      target: arena, pointerType: "mouse", button: 0, clientX: 300, clientY: 300,
      preventDefault: () => undefined,
    } as any);
    expect((component as any).clickMoveTarget).toBe(clicked);

    // ...and the basic attack it hands off to casts at that same monster instead
    // of the one that merely happens to be nearer.
    (component as any).updateBasicAttack();
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.attackProjectiles[0].target).toBe(clicked);
  });

  it("aims every targeted spell at the monster clicked for the basic attack", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    (component as any).clickMoveTarget = null;
    component.ownedSkills = ["Attack", "Blizzard", "Meteor", "Lightning"];
    component.skillLevels = { Attack: 1, Blizzard: 1, Meteor: 1, Lightning: 1 };
    const monster = (x: number, y: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y,
      hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 0,
    }) as any;
    const near = monster(300, 250);
    const clicked = monster(250, 360);
    component.enemies = [near, clicked];
    component.attackProjectiles = [];
    (component as any).playerBlizzards.length = 0;

    // Blizzard rains on the clicked monster, not the nearer one.
    component.activateOwnedSkill("Blizzard", clicked);
    expect((component as any).playerBlizzards[0].x).toBe(clicked.x);
    expect((component as any).playerBlizzards[0].y).toBe(clicked.y);

    // Meteor flies at it.
    component.activateOwnedSkill("Meteor", clicked);
    expect(component.attackProjectiles[0].target).toBe(clicked);

    // Lightning turns the hero and lays the rail through it.
    component.activateOwnedSkill("Lightning", clicked);
    expect((component as any).playerFacingX).toBeCloseTo(0, 5);
    expect((component as any).playerFacingY).toBeCloseTo(1, 5);

    // Fist of the Heavens strikes it directly: the four bolts radiate from it.
    component.selectedClass = "paladin";
    component.ownedSkills = ["Attack", "Fist of the Heavens"];
    component.skillLevels = { Attack: 1, "Fist of the Heavens": 1 };
    component.attackProjectiles = [];
    component.activateOwnedSkill("Fist of the Heavens", clicked);
    expect(component.attackProjectiles).toHaveSize(4);
    for (const bolt of component.attackProjectiles) {
      expect(bolt.fistOfTheHeavensBolt).toBeTrue();
      expect(Math.hypot(bolt.startX - clicked.x, bolt.startY - clicked.y)).toBeCloseTo(16, 5);
    }

    // Poison Explosion opens its well under it.
    component.selectedClass = "necromancer";
    component.ownedSkills = ["Attack", "Poison Explosion"];
    component.skillLevels = { Attack: 1, "Poison Explosion": 1 };
    (component as any).poisonClouds.length = 0;
    component.activateOwnedSkill("Poison Explosion", clicked);
    expect((component as any).poisonClouds[0].x).toBe(clicked.x);
    expect((component as any).poisonClouds[0].y).toBe(clicked.y);
  });

  it("places ground-targeted spells on the empty floor a right-click lands on", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    (component as any).clickMoveTarget = null;
    component.ownedSkills = ["Attack", "Blizzard", "Meteor", "Lightning"];
    component.skillLevels = { Attack: 1, Blizzard: 1, Meteor: 1, Lightning: 1 };
    // No monsters at all: an empty-floor right-click still places the spell.
    component.enemies = [];
    const ground = { x: 620, y: 380 };
    component.attackProjectiles = [];
    (component as any).playerBlizzards.length = 0;

    component.activateOwnedSkill("Blizzard", undefined, ground);
    expect((component as any).playerBlizzards[0].x).toBe(ground.x);
    expect((component as any).playerBlizzards[0].y).toBe(ground.y);

    component.activateOwnedSkill("Meteor", undefined, ground);
    const meteor = component.attackProjectiles[0];
    expect(meteor.missileId).toBe("d2-meteortail");
    expect(meteor.targetX).toBe(ground.x);
    expect(meteor.targetY).toBe(ground.y);

    component.activateOwnedSkill("Lightning", undefined, ground);
    expect((component as any).playerFacingX).toBeGreaterThan(0);
    expect((component as any).playerFacingY).toBeGreaterThan(0);

    component.selectedClass = "necromancer";
    component.ownedSkills = ["Attack", "Poison Explosion"];
    component.skillLevels = { Attack: 1, "Poison Explosion": 1 };
    (component as any).poisonClouds.length = 0;
    component.activateOwnedSkill("Poison Explosion", undefined, ground);
    expect((component as any).poisonClouds[0].x).toBe(ground.x);

    // Fist of the Heavens auto-targets: a bare-floor cast strikes the monster in
    // the direction it was aimed, not the one merely closest to the hero.
    component.selectedClass = "paladin";
    component.ownedSkills = ["Attack", "Fist of the Heavens"];
    component.skillLevels = { Attack: 1, "Fist of the Heavens": 1 };
    const behind = { kind: "normal", species: "fallen", spriteFrame: 0, x: 200, y: 230, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any;
    const aimed = { kind: "normal", species: "fallen", spriteFrame: 0, x: 520, y: 360, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any;
    component.enemies = [behind, aimed];
    component.attackProjectiles = [];
    component.activateOwnedSkill("Fist of the Heavens", undefined, ground);
    expect(component.attackProjectiles).toHaveSize(4);
    for (const bolt of component.attackProjectiles.filter((projectile) => projectile.fistOfTheHeavensBolt)) {
      expect(bolt.fistOfTheHeavensIgnore).toBe(aimed);
      expect(Math.hypot(bolt.startX - aimed.x, bolt.startY - aimed.y)).toBeCloseTo(16, 5);
    }

    // With nothing anywhere to smite, bare ground still only plays the cast.
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).skillCastCooldowns = {};
    component.activateOwnedSkill("Fist of the Heavens", undefined, ground);
    expect(component.attackProjectiles).toHaveSize(0);
  });

  it("fires Glacial Spike as a flying cold missile, even at empty ground", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Glacial Spike"];
    component.skillLevels = { "Glacial Spike": 18 };
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any,
    ];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects.length = 0;
    component.activateOwnedSkill("Glacial Spike");

    const shot = component.attackProjectiles[0];
    expect(shot.missileId).toBe("d2-glacialspike");
    // The renderer skips melee-kind projectiles, so a spike cast by an ordinary
    // (melee) basic attack used to be invisible: it has to carry a real element.
    expect(shot.kind).toBe("cold");
    expect(shot.damageType).toBe("cold");
    // The spell used to fall back on a cast ring around the hero instead.
    expect((component as any).skillVisualEffects.length).toBe(0);

    // D2 throws the spike down the facing when nothing is in the arena.
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects.length = 0;
    (component as any).skillCastCooldowns = {};
    component.activateOwnedSkill("Glacial Spike");

    const loose = component.attackProjectiles[0];
    expect(loose).toBeDefined();
    expect(loose.missileId).toBe("d2-glacialspike");
    expect(loose.kind).toBe("cold");
    expect(loose.target).toBeUndefined();
    expect(loose.targetX).toBeGreaterThan(component.playerX);
    expect((component as any).skillVisualEffects.length).toBe(0);
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
    to.position.clone().sub(from.position).normalize();

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

  it("animates the idle arms instead of leaving them pinned to the torso", () => {
    const { model, bones } = buildBiped();
    const rig = buildCharacterRig(model, "paladin");
    const sample = (time: number) => {
      poseCharacterRig(rig, {
        time,
        walkPhase: 0,
        walk: 0,
        attackTime: Number.POSITIVE_INFINITY,
        attackSide: -1,
        gait: gaitForClass("paladin"),
        weaponless: true,
      });
      return {
        rightArm: boneDirection(bones["R_upr_arm_bind_jnt"], bones["R_lwr_arm_bind_jnt"]),
        leftArm: boneDirection(bones["L_upr_arm_bind_jnt"], bones["L_lwr_arm_bind_jnt"]),
        rightForearm: boneDirection(bones["R_lwr_arm_bind_jnt"], bones["R_hand_bind_jnt"]),
      };
    };

    const start = sample(0);
    const moving = sample(1.2);
    expect(moving.rightArm.angleTo(start.rightArm)).toBeGreaterThan(0.04);
    expect(moving.leftArm.angleTo(start.leftArm)).toBeGreaterThan(0.04);
    expect(moving.rightForearm.angleTo(start.rightForearm)).toBeGreaterThan(0.02);
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

  it("mounts the original item art on held weapons and shields", async () => {
    const weaponItem = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    const shieldItem = { name: "Buckler", baseName: "Buckler", slot: "armor" } as any;
    component.equipment.weapon = weaponItem;
    component.equipment.shield = shieldItem;
    // These families ship a D2R mesh; pretend the extraction had none so the
    // inventory-cel fallback is what gets built.
    const noMesh = () => Promise.resolve(null);
    (component as any).heldItemMeshes.set("short_sword", noMesh());
    (component as any).heldItemMeshes.set("buckler", noMesh());

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const weapon = hand.children.find((child) => child.name === "equipped_weapon_weapon");
    expect(weapon?.children.length).toBe(1);
    expect(weapon?.children.every((child) => (child as THREE.Mesh).geometry instanceof THREE.PlaneGeometry)).toBeTrue();

    const shield = shieldAttach.children.find((child) => child.name === "equipped_shield_shield");
    expect(shield?.children.length).toBe(3);
    expect(shield?.children.every((child) => (child as THREE.Mesh).geometry instanceof THREE.PlaneGeometry)).toBeTrue();
  });

  it("mounts the D2R held-item mesh for a weapon family the extraction ships", async () => {
    component.selectedClass = "paladin";
    component.equipment.weapon = { name: "Broad Sword", baseName: "Broad Sword", slot: "weapon" } as any;
    const template = new THREE.Group();
    template.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1)));
    (component as any).heldItemMeshes.set("broad_sword", Promise.resolve({ mesh: template, height: 1.2 }));

    const model = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "R_weapon_attach";
    model.add(hand);
    (component as any).configureClassMeleeWeapon(model, "paladin");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const weapon = hand.children.find((child) => child.name === "equipped_weapon_weapon") as THREE.Group;
    expect(weapon.children).toHaveSize(1);
    const mesh = weapon.children[0] as THREE.Group;
    expect(mesh.children.some((child) => (child as THREE.Mesh).isMesh)).toBeTrue();
    // The rig sizes the mounted mesh from its own height, like a cel.
    expect((weapon.userData["d2sHeldItem"] as { celHeight?: number }).celHeight).toBe(1.2);
    // Swapping gear may only unparent it: its geometry is shared with the cache.
    expect(weapon.userData["d2sSharedGear"]).toBeTrue();
  });

  it("seats the posed shield cel on the off fist instead of mid-forearm", () => {
    const model = new THREE.Group();
    const add = (name: string, x: number, y: number, z: number): THREE.Bone => {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.set(x, y, z);
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
    // Knuckle roots, named the way the A/B/C rips name them, give the off hand
    // the grip frame the shield pose uses to turn the palm in to the body.
    for (const [digit, finger] of ["a", "b", "c", "d"].entries()) {
      add(`L_finger_${finger}_a`, 0.68, 1.33, -0.012 + digit * 0.008);
    }
    // Held gear is sized against the model's world height, so give the skeleton
    // a body box and scale it to a hero 88 scene units tall.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.44, 0.24), new THREE.MeshStandardMaterial());
    body.position.set(0, 0.82, 0);
    model.add(body);
    model.scale.setScalar(88 / 1.44);
    const anchor = new THREE.Group();
    anchor.add(model);

    const rig = buildCharacterRig(model, "paladin");
    const offHand = rig.hands.find((hand) => hand.side === 1)!;
    const offForearm = rig.forearms.find((forearm) => forearm.side === 1)!;
    const shield = new THREE.Group();
    shield.name = "equipped_shield_shield";
    shield.userData["d2sHeldItem"] = { kind: "shield", celHeight: 51, name: "Buckler" };
    offHand.bone.add(shield);

    poseCharacterRig(rig, {
      time: 0,
      walkPhase: 0,
      walk: 0,
      attackTime: 0,
      attackSide: 1,
      gait: gaitForClass("paladin"),
      offhandHeld: true,
    });
    anchor.updateMatrixWorld(true);

    expect(rig.worldHeight).toBeCloseTo(88, 0);
    const fist = offHand.bone.getWorldPosition(new THREE.Vector3());
    const elbow = offForearm.bone.getWorldPosition(new THREE.Vector3());
    const cel = shield.getWorldPosition(new THREE.Vector3());
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()));
    const fromFist = cel.clone().sub(fist);
    const armDir = fist.clone().sub(elbow).normalize();

    // The face hangs its clearance in front of the fist: 0.034 of body height,
    // roughly three units on this hero.  The forearm-centre mount this replaces
    // sat 58% of the way down the arm and only ~1 unit forward, so it fails both
    // this and the along-the-arm check below.
    const forward = fromFist.dot(front);
    expect(forward).toBeGreaterThan(2.6);
    expect(forward).toBeLessThan(3.6);
    // Centred on the grip, not slid down the forearm toward the elbow.
    expect(fromFist.dot(armDir)).toBeGreaterThan(-3.5);
    expect(cel.distanceTo(fist)).toBeLessThan(4.5);
    expect(cel.distanceTo(elbow)).toBeGreaterThan(cel.distanceTo(fist) * 2);
    // Palm-in wrist: the palm turns into the body so the knuckles face the cel.
    const palmWorld = offHand.palmNormal!.clone()
      .applyQuaternion(offHand.bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
    expect(palmWorld.dot(front)).toBeLessThan(-0.6);
  });

  it("labels gems and jewels by their own type instead of calling every socketable a jewel", () => {
    const gem = { id: "gem-1", name: "Chipped Ruby", baseName: "Chipped Ruby", rarity: "normal", slot: "charm", equipmentType: "gem", desc: "", stats: {} } as any;
    const jewel = { id: "jewel-1", name: "Shimmering Jewel", baseName: "Jewel", rarity: "magic", slot: "charm", equipmentType: "jewel", desc: "", stats: {}, affixes: ["All Resistances +5%"] } as any;
    expect(component.itemTypeLabel(gem)).toBe("Gem");
    expect(component.itemTypeLabel(jewel)).toBe("Jewel");
    expect(component.isSocketable(gem)).toBeTrue();
    expect(component.isSocketable(jewel)).toBeTrue();
  });

  it("sets gems into open sockets and applies the host's gem row", () => {
    const host = {
      id: "host-1", name: "Jeweler's Short Sword", baseName: "Short Sword", rarity: "magic",
      slot: "weapon", equipmentType: "weapon", sockets: 2, desc: "", stats: { damageMin: 3, damageMax: 7 },
    } as any;
    const gem = {
      id: "gem-1", name: "Chipped Ruby", baseName: "Chipped Ruby", rarity: "normal",
      slot: "charm", equipmentType: "gem", desc: "", stats: {},
    } as any;
    component.inventory[3] = gem;
    component.inventory[10] = host;
    // Dropping the gem on the socketed item has to be an allowed target even
    // though the two items cannot swap places in the grid.
    (component as any).dragState = { source: "inventory", slotIndex: 3, item: gem };
    expect(component.canDropOnSlot(3, 10, gem)).toBeTrue();
    component.onInventoryDrop(10, { preventDefault: () => undefined } as DragEvent);
    expect(component.socketedCount(host)).toBe(1);
    // A weapon takes gems.txt's weapon row: a chipped ruby adds 3-4 fire damage.
    expect(host.stats.elementalDamageMin).toBe(3);
    expect(host.stats.elementalDamageMax).toBe(4);
    expect(component.inventory[3]).toBeNull();
    expect(component.itemStatText(host)).toContain("Chipped Ruby: Adds 3-4 Fire Damage");

    component.inventory[4] = { ...gem, id: "gem-2" };
    expect(component.socketInventoryItem(4, host)).toBeTrue();
    component.inventory[5] = { ...gem, id: "gem-3" };
    expect(component.socketInventoryItem(5, host)).toBeFalse();
    expect(component.socketedCount(host)).toBe(2);
    expect(component.inventory[5]?.id).toBe("gem-3");
    expect(component.inventoryStatus).toContain("no open sockets");
  });

  it("uses the helm row for armor and refuses gear with no sockets", () => {
    const armor = { id: "a", name: "Artisan's Quilted Armor", baseName: "Quilted Armor", rarity: "magic", slot: "armor", equipmentType: "body", sockets: 1, desc: "", stats: {} } as any;
    const gem = { id: "g", name: "Chipped Amethyst", baseName: "Chipped Amethyst", rarity: "normal", slot: "charm", equipmentType: "gem", desc: "", stats: {} } as any;
    component.inventory[0] = gem;
    expect(component.socketInventoryItem(0, armor)).toBeTrue();
    // Body armor takes the helm row: a chipped amethyst grants +3 Strength.
    expect(armor.stats.plusStrength).toBe(3);

    component.inventory[1] = { ...gem, id: "g2" };
    const plain = { id: "plain", name: "Short Sword", baseName: "Short Sword", rarity: "normal", slot: "weapon", equipmentType: "weapon", desc: "", stats: {} } as any;
    expect(component.socketInventoryItem(1, plain)).toBeFalse();
    expect(component.inventory[1]?.id).toBe("g2");
    expect(component.inventoryStatus).toContain("has no sockets");
    expect(component.socketedCount(plain)).toBe(0);
  });

  it("gives a unique or set item the sockets its Socketed line advertises", () => {
    const named = (affixes: string[]) => (component as any).createNamedItem({
      name: "Bonesnap", baseName: "Ogre Axe", rarity: "unique", slot: "weapon",
      equipmentType: "weapon", width: 2, height: 4, desc: "A unique Ogre Axe.",
      requiredLevel: 30, stats: { damageMin: 20, damageMax: 45 }, affixes,
      art: "assets/d2survivors/items/d2/invba3.png",
    }, "unique") as any;
    const axe = named(["+320% Enhanced Damage", "Socketed (2)"]);
    expect(axe.sockets).toBe(2);

    component.inventory[0] = {
      id: "named-gem", name: "Chipped Ruby", baseName: "Chipped Ruby", rarity: "normal",
      slot: "charm", equipmentType: "gem", desc: "", stats: {},
    } as any;
    expect(component.socketInventoryItem(0, axe)).toBeTrue();
    expect(component.socketedCount(axe)).toBe(1);
    expect(component.inventory[0]).toBeNull();
    // A named item whose properties never mention sockets stays solid.
    expect(named(["+10 to Strength"]).sockets).toBeUndefined();
  });

  it("sockets a gem dragged onto a socketed weapon with a touch long-press", () => {
    jasmine.clock().install();
    try {
      component.inventoryOpen = true;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[0] = {
        id: "touch-gem", name: "Chipped Ruby", baseName: "Chipped Ruby", rarity: "normal",
        slot: "charm", equipmentType: "gem", desc: "", stats: {},
      } as any;
      const sword = {
        id: "touch-sword", name: "Broad Sword", baseName: "Broad Sword", rarity: "normal",
        slot: "weapon", sockets: 2, desc: "", stats: { damageMin: 5, damageMax: 10 },
      } as any;
      component.inventory[20] = sword;
      (component as any).rebuildInventoryGrid();
      spyOn(component as any, "persistRunProgress");

      const source = document.createElement("div");
      const target = document.createElement("div");
      target.dataset["inventorySlot"] = "20";
      spyOn(document, "elementFromPoint").and.returnValue(target);
      const touchEvent = (x: number, y: number) => ({
        pointerType: "touch", pointerId: 11, clientX: x, clientY: y, currentTarget: source,
        preventDefault: jasmine.createSpy("preventDefault"),
      }) as unknown as PointerEvent;

      component.onInventoryPointerDown(0, touchEvent(10, 10));
      jasmine.clock().tick(430);
      component.onInventoryPointerMove(touchEvent(40, 30));
      component.onInventoryPointerUp(touchEvent(40, 30));

      expect(component.socketedCount(sword)).toBe(1);
      expect(component.inventory[0]).toBeNull();
      expect(component.inventoryStatus).toContain("sockets");
      expect(component.mobileInventoryDrag).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("drops real jewels with the imported cel and rolled jewel affixes", () => {
    const jewel = (component as any).createJewelItem(30) as any;
    expect(jewel.equipmentType).toBe("jewel");
    expect(jewel.slot).toBe("charm");
    // Magic jewels cap at two properties; only rare jewels reach four.
    expect(["magic", "rare"]).toContain(jewel.rarity);
    expect(jewel.name).toContain("Jewel");
    expect(jewel.affixes.length).toBeGreaterThan(0);
    expect(jewel.affixes.length).toBeLessThan(5);
    expect(jewel.desc).toBe(jewel.affixes.join(", "));
    // Art comes from the six dedicated jewel cels, not the Perfect Diamond cel
    // misc.txt points the jewel rows at.
    expect(component.inventoryItemImage(jewel)).toMatch(/items\/d2\/invjw[1-6]\.png$/);

    const host = { id: "h", name: "Mechanic's Helmet", baseName: "Helm", rarity: "magic", slot: "armor", equipmentType: "helmet", sockets: 1, desc: "", stats: {} } as any;
    component.inventory[0] = jewel;
    expect(component.socketInventoryItem(0, host)).toBeTrue();
    for (const [key, value] of Object.entries(jewel.stats as Record<string, number>)) {
      expect((host.stats as Record<string, number>)[key]).toBe(value);
    }
  });

  it("drops gems from the imported gem table, graded by area level", () => {
    const chipped = (component as any).createGemItem(1) as any;
    const perfect = (component as any).createGemItem(40) as any;
    expect(chipped.equipmentType).toBe("gem");
    expect(chipped.name.startsWith("Chipped ")).toBeTrue();
    expect(chipped.requiredLevel).toBe(1);
    expect(perfect.name.startsWith("Perfect ")).toBeTrue();
    expect(perfect.requiredLevel).toBe(29);
    expect(component.itemTypeLabel(chipped)).toBe("Gem");
    expect(component.inventoryItemImage(chipped)).toContain("assets/d2survivors/items/d2/inv");
    expect(chipped.affixes.length).toBe(3);
  });

  it("punches one hole into the art of a socketed item per socket", () => {
    expect((component as any).socketHoles(null)).toEqual([]);
    expect((component as any).socketHoles({ sockets: 0 } as any)).toEqual([]);
    // A rune or gem has no sockets of its own to show.
    for (const sockets of [1, 2, 3, 4, 5, 6]) {
      const holes = (component as any).socketHoles({ sockets } as any) as Array<{ left: number; top: number; size: number }>;
      expect(holes.length).toBe(sockets);
      for (const hole of holes) {
        expect(hole.left).toBeGreaterThan(10);
        expect(hole.left).toBeLessThan(90);
        expect(hole.top).toBeGreaterThan(10);
        expect(hole.top).toBeLessThan(90);
        expect(hole.size).toBeLessThan(40);
      }
    }
  });

  it("drops runes as their own socketable and labels them as runes", () => {
    const rune = (component as any).createRuneItem(40) as any;
    expect(rune.equipmentType).toBe("rune");
    expect(rune.slot).toBe("charm");
    expect(rune.requiredLevel).toBeGreaterThan(0);
    expect(component.itemTypeLabel(rune)).toBe("Rune");
    expect(component.isSocketable(rune)).toBeTrue();
    expect(component.getEquipmentType(rune)).toBe("rune");
    // Low areas cannot hand out a Zod; high ones can reach the top of the list.
    const low = Array.from({ length: 40 }, () => (component as any).createRuneItem(1) as any);
    expect(low.every((entry) => entry.requiredLevel <= 13)).toBeTrue();
  });

  it("spells Insight when Ral Tir Tal Sol fill a white staff in order", () => {
    const staff = {
      id: "staff-1", name: "Battle Staff", baseName: "Battle Staff", rarity: "normal",
      slot: "weapon", sockets: 4, desc: "", stats: { damageMin: 5, damageMax: 12 },
    } as any;
    component.inventory[20] = staff;
    ["Ral", "Tir", "Tal", "Sol"].forEach((name, index) => {
      component.inventory[index] = {
        id: `rune-${name}`, name, baseName: name, rarity: "normal", slot: "charm",
        equipmentType: "rune", desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(index, staff)).toBeTrue();
    });

    expect(staff.runeword).toBe("Insight");
    expect(staff.name).toBe("Insight");
    // The base name survives so the tooltip still says what it was built in.
    expect(staff.baseName).toBe("Battle Staff");
    expect(staff.requiredLevel).toBe(27);
    expect(staff.stats.fasterCastPercent).toBe(35);
    expect(staff.stats.magicFindPercent).toBe(23);
    expect(component.itemTypeLabel(staff)).toBe("Runeword");
    expect(component.itemStatText(staff).some((line) => line.includes("Meditation Aura"))).toBeTrue();
    expect(component.inventoryStatus).toContain("completed Insight");
  });

  it("will not accept the right runes in the wrong order", () => {
    const staff = {
      id: "staff-2", name: "Long Staff", baseName: "Long Staff", rarity: "normal",
      slot: "weapon", sockets: 4, desc: "", stats: {},
    } as any;
    component.inventory[20] = staff;
    // Tir and Ral swapped: partial words never form a runeword.
    ["Tir", "Ral", "Tal", "Sol"].forEach((name, index) => {
      component.inventory[index] = {
        id: `bad-${index}`, name, baseName: name, rarity: "normal", slot: "charm",
        equipmentType: "rune", desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(index, staff)).toBeTrue();
    });
    expect(staff.runeword).toBeUndefined();
    expect(staff.name).toBe("Long Staff");
    expect(staff.stats.fasterCastPercent).toBeUndefined();
  });

  it("breaks the word when a gem shares the sockets, like a ruby in a shield", () => {
    const shield = {
      id: "shield-1", name: "Tower Shield", baseName: "Tower Shield", rarity: "normal",
      slot: "armor", equipmentType: "shield", sockets: 4, desc: "", stats: { armor: 34 },
    } as any;

    component.inventory[0] = {
      id: "ruby-1", name: "Chipped Ruby", baseName: "Chipped Ruby", rarity: "normal",
      slot: "charm", equipmentType: "gem", desc: "", stats: {},
    } as any;
    expect(component.socketInventoryItem(0, shield)).toBeTrue();
    ["Ral", "Tir", "Tal"].forEach((name, index) => {
      component.inventory[index + 1] = {
        id: `gem-mix-${name}`, name, baseName: name, rarity: "normal", slot: "charm",
        equipmentType: "rune", desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(index + 1, shield)).toBeTrue();
    });

    expect(component.socketedCount(shield)).toBe(4);
    expect(shield.runeword).toBeUndefined();
    expect(shield.name).toBe("Tower Shield");
  });

  it("never forms a runeword in a magic base or the wrong kind of base", () => {
    const magicStaff = {
      id: "magic-staff", name: "Jeweler's Battle Staff", baseName: "Battle Staff", rarity: "magic",
      slot: "weapon", sockets: 4, desc: "", stats: {},
    } as any;
    const helm = {
      id: "helm-1", name: "Great Helm", baseName: "Great Helm", rarity: "normal",
      slot: "armor", equipmentType: "helmet", sockets: 4, desc: "", stats: { armor: 20 },
    } as any;
    const runes = ["Ral", "Tir", "Tal", "Sol"];

    runes.forEach((name, index) => {
      component.inventory[index] = {
        id: `armoury-${name}`, name, baseName: name, rarity: "normal", slot: "charm",
        equipmentType: "rune", desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(index, magicStaff)).toBeTrue();
    });
    // Insight needs a white base: a magic staff keeps its own name.
    expect(magicStaff.runeword).toBeUndefined();
    expect(magicStaff.name).toBe("Jeweler's Battle Staff");

    runes.forEach((name, index) => {
      component.inventory[index] = {
        id: `armoury2-${name}`, name, baseName: name, rarity: "normal", slot: "charm",
        equipmentType: "rune", desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(index, helm)).toBeTrue();
    });
    // ...and Insight's family is polearms, staves and bows, never a helm.
    expect(helm.runeword).toBeUndefined();
    expect(helm.name).toBe("Great Helm");
  });

  it("leaves a rune base unformed until its last socket is filled", () => {
    const staff = {
      id: "staff-3", name: "Staff", baseName: "Staff", rarity: "normal",
      slot: "weapon", sockets: 4, desc: "", stats: {},
    } as any;
    component.inventory[0] = {
      id: "partial-ral", name: "Ral", baseName: "Ral", rarity: "normal", slot: "charm",
      equipmentType: "rune", desc: "", stats: {},
    } as any;
    expect(component.socketInventoryItem(0, staff)).toBeTrue();
    expect(staff.runeword).toBeUndefined();
    // A lone rune pays its own weapon column while it waits for the rest of the
    // word; Ral adds 5-30 fire damage in a weapon.
    expect((staff.stats as Record<string, number>)["elementalDamageMin"]).toBe(5);
    expect((staff.stats as Record<string, number>)["elementalDamageMax"]).toBe(30);
    expect(component.itemStatText(staff).some((line) => line.includes("Ral: Adds 5-30 Fire Damage"))).toBeTrue();
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

  it("rolls the Barbarian's off-hand blade to the same flat angle as the main blade", () => {
    component.selectedClass = "barbarian";
    component.equipment.weapon = { id: "main", name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    component.equipment.shield = { id: "offhand", name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;

    const model = new THREE.Group();
    const mainHand = new THREE.Bone();
    mainHand.name = "R_weapon_attach";
    const offhand = new THREE.Bone();
    offhand.name = "L_weapon_attach";
    model.add(mainHand, offhand);
    (component as any).configureClassMeleeWeapon(model, "barbarian");

    const mainWeapon = mainHand.children.find((child) => child.name === "equipped_weapon_weapon");
    const offhandWeapon = offhand.children.find((child) => child.name === "equipped_weapon_offhand_weapon");
    expect(mainWeapon).toBeDefined();
    expect(offhandWeapon).toBeDefined();

    // The item cel is a plane whose normal is local +Z. Both blades must get
    // the same quarter-turn; otherwise the off hand stays edge-on like the old
    // Paladin. The two leans are mirrored, so allow their small angle apart.
    const bladeNormal = (weapon: THREE.Object3D): THREE.Vector3 =>
      new THREE.Vector3(0, 0, 1).applyQuaternion(weapon.quaternion).normalize();
    expect(bladeNormal(mainWeapon!).angleTo(bladeNormal(offhandWeapon!))).toBeLessThan(0.6);
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
    expect((component as any).itemSize(greatAxe)).toEqual({ width: 2, height: 4 });

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

  it("treats the Battle Axe as an unrestricted two-handed 2x3 weapon", () => {
    const battleAxe = {
      id: "battle-axe", name: "Battle Axe", baseName: "Battle Axe", rarity: "normal",
      slot: "weapon", width: 2, height: 3, stats: { damageMin: 7, damageMax: 15 },
      desc: "A two-handed battle axe that any class can wield.",
    } as any;
    const shield = {
      id: "battle-axe-test-shield", name: "Buckler", baseName: "Buckler", rarity: "normal",
      slot: "armor", equipmentType: "shield", requiredLevel: 1, desc: "A shield.",
    } as any;

    expect((component as any).itemSize(battleAxe)).toEqual({ width: 2, height: 3 });
    expect((component as any).itemSize({ ...battleAxe, name: "Savage Battle Axe of Haste", rarity: "rare" }))
      .toEqual({ width: 2, height: 3 });
    expect(component.itemStatText(battleAxe)).toContain("Two-Handed — occupies both hands");

    const classes = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"] as const;
    for (const classId of classes) {
      component.selectedClass = classId;
      component.playerLevel = 1;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.equipment = { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
      const item = { ...battleAxe, id: `battle-axe-${classId}` };
      component.inventory[0] = item;
      component.equipSelectedItem(0);
      expect(component.equipment.weapon?.id).toBe(item.id);
    }

    component.selectedClass = "barbarian";
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: battleAxe, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = shield;
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("battle-axe-test-shield");
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

  it("treats every maul as two-handed and blocks a Barbarian wand in the off hand", () => {
    component.selectedClass = "barbarian";
    component.playerLevel = 30;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    const maul = { id: "maul", name: "Maul", baseName: "Maul", rarity: "normal", slot: "weapon", equipmentType: "weapon", requiredLevel: 1, desc: "A maul." } as any;
    const wand = { id: "wand", name: "Yew Wand", baseName: "Yew Wand", rarity: "normal", slot: "weapon", equipmentType: "wand", requiredLevel: 1, desc: "A wand." } as any;

    for (const base of ["Maul", "Great Maul", "Ogre Maul", "Thunder Maul"]) {
      expect(component.itemStatText({ ...maul, id: base, name: base, baseName: base })).toContain("Two-Handed — occupies both hands");
    }

    component.equipment.weapon = maul;
    component.inventory[0] = wand;
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("wand");
    expect(component.inventoryStatus).toContain("two-handed");

    component.equipment.weapon = null;
    component.equipment.shield = wand;
    component.inventory[0] = maul;
    component.equipSelectedItem(0);
    expect(component.equipment.weapon).toBeNull();
    expect(component.inventory[0]?.id).toBe("maul");
    expect(component.inventoryStatus).toContain("two-handed");
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

  it("swaps the main-menu hero and points Gheed's shop at that character's gold and pack", () => {
    const axe = {
      id: "swap-axe", name: "Hand Axe", baseName: "Hand Axe", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", desc: "An axe.",
    } as any;
    (component as any).characterProfiles["paladin"] = {
      gold: 4321,
      inventory: [axe],
      equipment: { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null },
      beltSlots: Array.from({ length: 16 }, () => ({ kind: null })),
    };
    component.sanctuaryGold = 0;
    component.selectedClass = "amazon";

    const order = component.classes.map((characterClass) => characterClass.id);
    expect(component.menuHeroSwapClassName(1)).toBe(component.classes[1].name);
    for (let step = 0; step < order.length && component.selectedClass !== "paladin"; step += 1) {
      component.cycleMenuHeroClass(1);
    }

    expect(component.selectedClass).toBe("paladin");
    expect(component.selectedClassName).toBe("Paladin");
    expect(component.sanctuaryGold).toBe(4321);
    expect(component.inventory.some((item) => item?.id === "swap-axe")).toBeTrue();
    expect(component.shopItemsForSale.some((entry) => entry.item.id === "swap-axe")).toBeTrue();
    expect(component.menuHeroSwapClassName(-1)).toBe(component.classes[order.indexOf("paladin") - 1].name);

    component.cycleMenuHeroClass(-1);
    expect(component.selectedClass).not.toBe("paladin");
    expect(component.sanctuaryGold).toBe(0);
  });

  it("lists the selected character's weapon and armor beneath the main-menu portrait", () => {
    component.selectedClass = "paladin";
    component.equipment.weapon = {
      id: "menu-sword", name: "Savage Short Sword", baseName: "Short Sword", rarity: "magic",
      slot: "weapon", desc: "A sword.",
    } as any;
    component.equipment.body = {
      id: "menu-body", name: "Ancient Plate", baseName: "Ancient Armor", rarity: "unique",
      slot: "armor", desc: "Ancient armor.",
    } as any;

    const gear = component.menuHeroLoadoutGear;

    expect(gear.map((entry) => entry.slot)).toEqual(["weapon", "body"]);
    expect(gear.map((entry) => entry.label)).toEqual(["Weapon", "Armor"]);
    expect(gear.map((entry) => entry.item.name)).toEqual(["Savage Short Sword", "Ancient Plate"]);
    expect(gear.every((entry) => !!entry.icon)).toBeTrue();

    component.equipment.weapon = null;
    expect(component.menuHeroLoadoutGear.map((entry) => entry.item.name)).toEqual(["Ancient Plate"]);
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

  it("mounts a single cel for a Necromancer shrunken head instead of front and back copies", () => {
    const head = {
      id: "unraveller-head", name: "Unraveller Head", baseName: "Unraveller Head",
      slot: "armor", equipmentType: "necromancerHead",
    } as any;
    const texture = new THREE.Texture();
    texture.image = { width: 100, height: 120 };
    const visual = new THREE.Group();

    (component as any).buildHeldItemArt(visual, head, texture, "shield");

    const heads = visual.children.filter((child) => child instanceof THREE.Mesh);
    expect(heads).toHaveSize(1);
    expect((heads[0] as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
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

  it("shows the active axe mastery and every damage component in the damage tooltip", () => {
    component.selectedClass = "barbarian";
    component.basicAttackName = "Basic Attack";
    component.basicAttackDamage = 100;
    component.skillLevels = { "Axe Mastery": 5 };
    component.ownedSkills = ["Basic Attack", "Axe Mastery"];
    component.equipment.weapon = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", stats: { damageMin: 1, damageMax: 1 } } as any;
    component.equipment.shield = null;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventoryOpen = true;

    component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, "damage");
    const tooltip = component.hoveredStatTooltip!;
    const masteryLine = tooltip.lines.find((line) => line.label.includes("Axe Mastery rank 5"));

    expect(component.inventoryAttackDamage).toBe(121);
    expect(masteryLine?.label).toContain("Hand Axe");
    expect(masteryLine?.value).toBe("+20");
    expect(tooltip.lines.find((line) => line.label === "Weapon & damage gear")?.value).toBe("+1");
    expect(tooltip.lines.find((line) => line.total)?.value).toBe("121");
  });

  it("explains that Axe Mastery does not apply to a non-axe weapon", () => {
    component.selectedClass = "barbarian";
    component.basicAttackName = "Basic Attack";
    component.basicAttackDamage = 100;
    component.skillLevels = { "Axe Mastery": 5 };
    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon", stats: { damageMin: 1, damageMax: 1 } } as any;
    component.equipment.shield = null;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventoryOpen = true;

    component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, "damage");
    const tooltip = component.hoveredStatTooltip!;
    const masteryLine = tooltip.lines.find((line) => line.label === "Weapon mastery (Short Sword)");

    expect(component.inventoryAttackDamage).toBe(101);
    expect(masteryLine?.value).toBe("No matching rank");
    expect(tooltip.lines.find((line) => line.total)?.value).toBe("101");
  });

  it("shows active spell effects in the Life and Defense tooltips", () => {
    component.selectedClass = "druid";
    component.playerMaxHp = 400;
    component.skillLevels = { "Oak Sage": 1 };
    component.enemies = [{ summonType: "druid", summonSkill: "Oak Sage", hp: 10, maxHp: 10 } as any];
    component.inventoryOpen = true;

    component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, "life");
    const lifeTooltip = component.hoveredStatTooltip!;
    expect(lifeTooltip.lines.find((line) => line.label === "Oak Sage rank 1")?.value).toBe("+30% (+120)");
    expect(lifeTooltip.lines.find((line) => line.total)?.value).toBe(`${component.effectivePlayerMaxHp}`);

    component.selectedClass = "paladin";
    component.skillLevels = { "Holy Shield": 1 };
    component.ownedSkills = ["Holy Shield"];
    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    (component as any).holyShieldRemaining = 30;
    component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, "defense");
    const defenseTooltip = component.hoveredStatTooltip!;

    expect(defenseTooltip.lines.find((line) => line.label === "Holy Shield rank 1")).toBeDefined();
    expect(defenseTooltip.lines.find((line) => line.total)?.value).toBe(`${component.equippedArmor}`);
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

  it("requires an equipped shield to use Smite or Charge", () => {
    component.selectedClass = "paladin";
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Charge")).toBeFalse();

    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Charge")).toBeFalse();
    expect(component.getSkillRequirementLabel("Smite")).toBe("Requires a shield equipped");
    expect(component.getSkillRequirementLabel("Charge")).toBe("Requires a shield equipped");

    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeTrue();
    expect((component as any).hasRequiredWeaponForSkill("Charge")).toBeTrue();
    expect(component.getSkillRequirementLabel("Smite")).toBe("");
    expect(component.getSkillRequirementLabel("Charge")).toBe("");

    component.equipment.shield = { name: "Targe", baseName: "Targe", slot: "armor", equipmentType: "paladinShield" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeTrue();
    expect((component as any).hasRequiredWeaponForSkill("Charge")).toBeTrue();

    // A Barbarian's off-hand weapon is not a shield.
    component.equipment.shield = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Smite")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Charge")).toBeFalse();
  });

  it("requires two weapons for Double Swing and two throwing weapons for Double Throw", () => {
    component.selectedClass = "barbarian";

    expect((component as any).hasRequiredWeaponForSkill("Double Swing")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeFalse();
    expect(component.getSkillRequirementLabel("Double Swing")).toBe("Requires a weapon in each hand");
    expect(component.getSkillRequirementLabel("Double Throw")).toBe("Requires a throwing weapon in each hand");

    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Swing")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeFalse();

    component.equipment.shield = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Swing")).toBeTrue();
    expect(component.getSkillRequirementLabel("Double Swing")).toBe("");
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeFalse();

    component.equipment.weapon = { name: "Javelin", baseName: "Javelin", slot: "weapon" } as any;
    component.equipment.shield = { name: "Throwing Axe", baseName: "Throwing Axe", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeTrue();

    component.equipment.shield = { name: "Throwing Knife", baseName: "Throwing Knife", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeTrue();

    component.equipment.weapon = { name: "Throwing Knife", baseName: "Throwing Knife", slot: "weapon" } as any;
    component.equipment.shield = { name: "Throwing Knife", baseName: "Throwing Knife", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeTrue();

    component.equipment.weapon = { name: "Javelin", baseName: "Javelin", slot: "weapon" } as any;
    component.equipment.shield = { name: "Javelin", baseName: "Javelin", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeTrue();

    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Swing")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeFalse();
    expect(component.getSkillRequirementLabel("Double Throw")).toBe("Requires a throwing weapon in each hand");
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

  it("charges into the target and shield-bashes only the area in front", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charge"];
    component.skillLevels = { Charge: 1 };
    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 430, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const besideTarget = { ...target, x: 440 };
    const passed = { ...target, x: 300 };
    const behind = { ...target, x: 230 };
    component.enemies = [target, besideTarget, passed, behind];
    // Clicking picks the distant target even though another monster is closer;
    // the charge then runs past that closer monster and bashes only ahead.
    (component as any).clickMoveTarget = target;
    component.floatingTexts = [];
    (component as any).leapDustEffects.length = 0;

    component.activateOwnedSkill("Charge");

    expect((component as any).playerChargeRemaining).toBeGreaterThan(0);
    expect(target.stunRemaining).toBeUndefined();
    for (let frame = 0; frame < 40; frame += 1) (component as any).updatePlayerCharge(16);

    expect((component as any).playerChargeRemaining).toBe(0);
    expect((component as any).isPlayerMoving).toBeFalse();
    expect((component as any).attackAnimationStyle).toBe("paladinStrike");
    expect(target.x).toBeCloseTo(282, 1);
    expect(target.stunRemaining).toBeGreaterThan(0);
    expect(besideTarget.stunRemaining).toBeGreaterThan(0);
    expect(passed.stunRemaining).toBeUndefined();
    expect(behind.stunRemaining).toBeUndefined();
    expect((component as any).leapDustEffects.length).toBeGreaterThan(0);
    (component as any).flushPendingDamage();
    expect(target.hp).toBeLessThan(100);
    expect(besideTarget.hp).toBeLessThan(100);
    expect(passed.hp).toBe(100);
    expect(component.floatingTexts.filter((entry) => entry.text === "STUN").length).toBe(2);
    expect((component as any).getSkillRankStats("Charge", "movement", 1)).toContain("Shield bash: 52-unit frontal area");
  });

  it("lands one rapid Zeal strike per rank and stops at that count", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Zeal"];
    component.skillLevels = { Zeal: 5 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.floatingTexts = [];

    component.activateOwnedSkill("Zeal");

    // The first blow lands as the cast starts; four more follow on the flurry beat.
    expect(target.hp).toBeLessThan(1000);
    expect((component as any).zealStrikeRemaining).toBe(4);
    expect(component.floatingTexts.length).toBe(1);
    for (let beat = 0; beat < 4; beat += 1) (component as any).updateZealStrikes(160);
    expect(component.floatingTexts.length).toBe(5);
    expect(target.hp).toBeLessThan(1000);
    expect((component as any).zealStrikeRemaining).toBe(0);

    // Another update after the fifth blow must not add a sixth hit.
    (component as any).updateZealStrikes(160);
    expect(component.floatingTexts.length).toBe(5);

    component.skillLevels = { Zeal: 1 };
    component.floatingTexts = [];
    component.activateOwnedSkill("Zeal");
    for (let beat = 0; beat < 4; beat += 1) (component as any).updateZealStrikes(160);
    expect(component.floatingTexts.length).toBe(1);
    expect((component as any).getSkillRankStats("Zeal", "strike", 5)).toContain("5 rapid melee strikes per cast");
  });

  it("turns Zeal's remaining blows on the next enemy in melee reach after a kill", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Zeal"];
    component.skillLevels = { Zeal: 3 };
    const first = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 1, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const second = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 274, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [first, second];
    component.floatingTexts = [];

    component.activateOwnedSkill("Zeal");

    expect(first.hp).toBeLessThanOrEqual(0);
    expect(second.hp).toBe(1000);
    // The killing blow opens one more strike in the flurry, and that strike
    // picks the next monster already in melee reach instead of the corpse.
    (component as any).updateZealStrikes(160);
    expect(second.hp).toBeLessThan(1000);
    expect((component as any).zealStrikeTarget).toBe(second);
    expect(component.floatingTexts.length).toBe(2);
  });

  it("starts Zeal on the nearest in-range enemy, not a farther nearest one", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Zeal"];
    component.skillLevels = { Zeal: 3 };
    const smallOutOfReach = { kind: "normal", species: "fallen", spriteFrame: 0, x: 285, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 6, dmg: 2 } as any;
    const largeInReach = { kind: "normal", species: "fallen", spriteFrame: 0, x: 290, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 20, dmg: 2 } as any;
    component.enemies = [smallOutOfReach, largeInReach];
    component.floatingTexts = [];

    component.activateOwnedSkill("Zeal");

    expect(smallOutOfReach.hp).toBe(1000);
    expect(largeInReach.hp).toBeLessThan(1000);
    expect((component as any).zealStrikeTarget).toBe(largeInReach);
  });

  it("retargets Zeal when a later blow, not the first, kills the enemy", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Zeal"];
    component.skillLevels = { Zeal: 4 };
    const first = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    const second = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 274, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [first, second];
    component.floatingTexts = [];

    component.activateOwnedSkill("Zeal");
    const damage = (component as any).zealStrikeDamage;
    // Let the next blow leave only a sliver of life, then have the following
    // blow finish it. The last strike of the flurry must move on.
    first.hp = damage + 0.01;
    (component as any).updateZealStrikes(160);
    (component as any).updateZealStrikes(160);
    expect(first.hp).toBeLessThanOrEqual(0);
    expect(second.hp).toBe(1000);
    (component as any).updateZealStrikes(160);
    expect(second.hp).toBeLessThan(1000);
    expect((component as any).zealStrikeRemaining).toBe(0);
  });

  it("leeches life and mana from basic melee attacks", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 500;
    component.playerMaxHp = 1000;
    component.playerMana = 100;
    component.playerMaxMana = 1000;
    component.basicAttackDamage = 100;
    (component as any).attackCooldown = 0;
    component.equipment.weapon = {
      id: "test-sword", name: "Short Sword", baseName: "Short Sword",
      slot: "weapon", equipmentType: "weapon",
    } as any;
    const target = { x: 260, y: 250, r: 12, hp: 1000 } as any;
    component.enemies = [target];
    spyOnProperty(component, "equippedLifeStealPercent", "get").and.returnValue(10);
    spyOnProperty(component, "equippedManaStealPercent", "get").and.returnValue(5);

    component.attackNearestEnemy();

    const damage = 1000 - target.hp;
    expect(damage).toBeGreaterThan(0);
    expect(component.playerHp).toBeCloseTo(500 + damage * 0.1, 5);
    expect(component.playerMana).toBeCloseTo(100 + damage * 0.05, 5);
  });

  it("leeches life and mana from melee skills", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.playerHp = 500;
    component.playerMaxHp = 1000;
    component.playerMana = 100;
    component.playerMaxMana = 1000;
    component.ownedSkills = ["Smite"];
    component.skillLevels = { Smite: 1 };
    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 310, y: 250,
      hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0,
    } as any;
    component.enemies = [target];
    spyOnProperty(component, "equippedLifeStealPercent", "get").and.returnValue(10);
    spyOnProperty(component, "equippedManaStealPercent", "get").and.returnValue(5);

    component.activateOwnedSkill("Smite");
    (component as any).flushPendingDamage();

    const damage = 1000 - target.hp;
    expect(damage).toBeGreaterThan(0);
    expect(component.playerHp).toBeCloseTo(500 + damage * 0.1, 5);
    expect(component.playerMana).toBeCloseTo(100 + damage * 0.05, 5);
  });

  it("does not leech life or mana from ranged spells", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    component.playerHp = 500;
    component.playerMaxHp = 1000;
    component.playerMana = 100;
    component.playerMaxMana = 1000;
    component.ownedSkills = ["Fist of the Heavens"];
    component.skillLevels = { "Fist of the Heavens": 1 };
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 250,
      hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0,
    } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();
    spyOnProperty(component, "equippedLifeStealPercent", "get").and.returnValue(10);
    spyOnProperty(component, "equippedManaStealPercent", "get").and.returnValue(5);

    component.activateOwnedSkill("Fist of the Heavens");
    (component as any).flushPendingDamage();

    expect(target.hp).toBeLessThan(1000);
    expect(component.playerHp).toBe(500);
    expect(component.playerMana).toBe(100);
  });

  it("makes Nihlathak teleport out of melee pressure instead of swinging back", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const nihlathak = {
      kind: "boss", species: "nihlathak", miniBoss: true, spriteFrame: 0,
      x: 350, y: 250, hp: 10000, maxHp: 10000, speed: 74, r: 20, dmg: 40, cd: 0,
    } as any;
    component.enemies = [nihlathak];

    component.updateEnemies(16);

    expect(component.playerHp).toBe(1000);
    expect(nihlathak.x).not.toBe(350);
    expect(Math.hypot(nihlathak.x - component.playerX, nihlathak.y - component.playerY)).toBeGreaterThan(150);
    expect((component as any).skillVisualEffects.filter((effect: any) => effect.name === "Teleport")).toHaveSize(2);
  });

  it("detonates a corpse for 10-20% of the dead monster's full life", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).applyIncomingDamage = (damage: number) => damage;
    const nihlathak = {
      kind: "boss", species: "nihlathak", miniBoss: true, spriteFrame: 0,
      x: 470, y: 250, hp: 10000, maxHp: 10000, speed: 74, r: 20, dmg: 40, cd: 0,
      nihlathakSpellCycle: 0,
    } as any;
    component.enemies = [nihlathak];
    (component as any).nihlathakCorpses = [{ x: 270, y: 250, maxHp: 500, life: 10, seed: 0.25 }];

    component.updateEnemies(16);

    const damage = 1000 - component.playerHp;
    expect(damage).toBeGreaterThanOrEqual(50);
    expect(damage).toBeLessThanOrEqual(100);
    expect((component as any).nihlathakCorpses).toHaveSize(0);
    expect(component.floatingTexts.some((entry) => entry.text === "CORPSE EXPLOSION")).toBeTrue();
  });

  it("casts an enemy-owned Arctic Blast that chills the hero but never hits monsters", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const nihlathak = {
      kind: "boss", species: "nihlathak", miniBoss: true, spriteFrame: 0,
      x: 545, y: 250, hp: 10000, maxHp: 10000, speed: 74, r: 20, dmg: 40, cd: 0,
      nihlathakSpellCycle: 2,
    } as any;
    const dummy = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 350, y: 250, hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 2, cd: 0,
    } as any;
    component.enemies = [nihlathak, dummy];

    component.updateEnemies(16);

    expect(component.playerHp).toBeLessThan(1000);
    expect((component as any).playerChilledRemaining).toBeGreaterThan(0);
    const blast = (component as any).skillVisualEffects.find((effect: any) => effect.name === "Arctic Blast");
    expect(blast).toBeDefined();
    expect(blast.enemyCast).toBeTrue();
    const dummyHp = dummy.hp;
    (component as any).updateSkillVisualEffects(100);
    expect(dummy.hp).toBe(dummyHp);
  });

  it("summons Ice Spawn, frenzies them for double damage, and grants no kill credit", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const nihlathak = {
      kind: "boss", species: "nihlathak", miniBoss: true, spriteFrame: 0,
      x: 470, y: 250, hp: 10000, maxHp: 10000, speed: 74, r: 20, dmg: 40, cd: 0,
      nihlathakSpellCycle: 1,
    } as any;
    component.enemies = [nihlathak];

    component.updateEnemies(16);

    const minions = component.enemies.filter((enemy: any) => enemy.nihlathakMinion) as any[];
    expect(minions).toHaveSize(2);
    expect(minions.every((minion) => minion.customName === "Ice Spawn")).toBeTrue();
    expect(component.playerHp).toBe(1000);

    const minion = minions[0];
    minion.x = 270;
    minion.y = 250;
    minion.hp = 100;
    minion.maxHp = 100;
    minion.dmg = 5;
    minion.cd = 0;
    nihlathak.cd = 0;
    nihlathak.attackAnimationTime = 0;
    nihlathak.nihlathakSpellCycle = 3;
    (component as any).applyIncomingDamage = (damage: number) => damage;
    const hpBeforeFrenzy = component.playerHp;

    component.updateEnemies(16);

    expect(minion.frenzyRemaining).toBeGreaterThan(0);
    expect(hpBeforeFrenzy - component.playerHp).toBe(10);

    (component as any).runKillCount = 0;
    nihlathak.cd = 99;
    for (const summoned of minions) summoned.hp = 0;
    component.updateEnemies(16);
    expect((component as any).runKillCount).toBe(0);
    expect(component.enemies.some((enemy: any) => enemy.nihlathakMinion)).toBeFalse();
  });

  it("applies Horror and forces the hero to run away from Nihlathak", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const nihlathak = {
      kind: "boss", species: "nihlathak", miniBoss: true, spriteFrame: 0,
      x: 470, y: 250, hp: 10000, maxHp: 10000, speed: 74, r: 20, dmg: 40, cd: 0,
      nihlathakSpellCycle: 4,
    } as any;
    component.enemies = [nihlathak];

    component.updateEnemies(16);

    expect(component.playerHp).toBe(1000);
    expect((component as any).playerHorrorRemaining).toBeGreaterThan(0);
    component.keysDown.add("d");
    component.movePlayer(100);
    expect((component as any).playerMoveX).toBeLessThan(0);
    expect(component.playerX).toBe(250);
    component.keysDown.delete("d");
  });

  it("splits Vengeance into four damage types so single immunities do not stop it", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Vengeance"];
    component.skillLevels = { Vengeance: 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.floatingTexts = [];

    component.activateOwnedSkill("Vengeance");
    const fullDamage = 1000 - target.hp;
    expect(fullDamage).toBeGreaterThan(0);

    // One immunity removes only that element's quarter of the strike.
    target.hp = 1000;
    target.immunities = ["fire"];
    component.floatingTexts = [];
    component.activateOwnedSkill("Vengeance");
    expect(1000 - target.hp).toBeCloseTo(fullDamage * 0.75, 5);

    target.hp = 1000;
    target.immunities = ["fire", "cold", "lightning", "magic"];
    component.floatingTexts = [];
    component.activateOwnedSkill("Vengeance");
    expect(target.hp).toBe(1000);
    expect(component.floatingTexts.length).toBe(0);
    expect((component as any).getSkillRankStats("Vengeance", "strike", 1))
      .toContain("Damage split evenly across fire, cold, lightning and magic");
  });

  it("spawns an animated Blessed Hammer that spirals out and strikes what it passes", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Blessed Hammer"];
    component.skillLevels = { "Blessed Hammer": 1 };
    component.enemies = [];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Blessed Hammer");

    const hammer = component.attackProjectiles[0];
    expect(hammer.missileId).toBe("d2-blessedhammer");
    expect(hammer.blessedHammer).toBeTrue();
    expect((component as any).missileFrameCount("d2-blessedhammer")).toBe(6);
    expect(hammer.x).toBeCloseTo(250, 1);
    const centerY = component.playerY - 10;
    const startRadius = Math.hypot(hammer.x - component.playerX, hammer.y - centerY);

    for (let frame = 0; frame < 30; frame += 1) (component as any).updateAttackProjectiles(16);

    expect(hammer.age).toBeCloseTo(0.48, 2);
    const spiralRadius = Math.hypot(hammer.x - component.playerX, hammer.y - centerY);
    expect(spiralRadius).toBeGreaterThan(startRadius + 10);

    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: hammer.x, y: hammer.y, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    (component as any).rebuildEnemyGrid();
    (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(target.hp).toBeLessThan(100);
  });

  it("calls down a lightning strike and scatters four independent Holy Bolts", () => {
    component.selectedClass = "paladin";
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Fist of the Heavens"];
    component.skillLevels = { "Fist of the Heavens": 1 };
    const primary = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [primary];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects = [];
    component.floatingTexts = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Fist of the Heavens");

    const bolts = component.attackProjectiles.filter((projectile) => projectile.fistOfTheHeavensBolt);
    expect(bolts.length).toBe(4);
    expect(new Set(bolts).size).toBe(4);
    for (const bolt of bolts) {
      expect(bolt.missileId).toBe("d2-holyboltmissile");
      expect(bolt.kind).toBe("holy");
      expect(bolt.damageType).toBe("magic");
      expect(bolt.sourceOnlyArt).toBeTrue();
      expect(bolt.fistOfTheHeavensIgnore).toBe(primary);
    }
    // missiles.txt: fistoftheheavensbolt gains 15% magic damage per Holy Bolt rank.
    const unsynergisedBoltDamage = bolts[0].damage;
    component.skillLevels["Holy Bolt"] = 11;
    component.activateOwnedSkill("Fist of the Heavens");
    const synergyBolts = component.attackProjectiles.filter((projectile) => projectile.fistOfTheHeavensBolt);
    expect(synergyBolts.length).toBe(8);
    expect(synergyBolts[7].damage).toBeCloseTo(unsynergisedBoltDamage * (1 + 11 * 0.15), 5);
    component.skillLevels["Holy Bolt"] = 0;
    // Keep the original volley for the rest of the test.
    component.attackProjectiles = [...bolts];

    expect((component as any).missileOverlayId("Fist of the Heavens")).toBe("d2-handofgod");
    expect((component as any).missileFrameCount("d2-handofgod")).toBe(21);
    expect((component as any).missileFrameCount("d2-lightningbolt")).toBe(8);
    expect((component as any).missileFrameCount("d2-holyboltmissile")).toBe(16);
    expect((component as any).missileFrameCount("d2-teethexplode")).toBe(13);
    // The strike is the skill's single handofgod srvoverlay on the target; D2 has
    // no second bolt over the caster, so no cast effect is queued.
    expect((component as any).skillVisualEffects.some((effect: any) => effect.fistOfTheHeavensCast)).toBeFalse();
    expect((component as any).skillVisualEffects.some((effect: any) => effect.fistOfTheHeavensStrike && effect.missileId === "d2-handofgod" && effect.x === primary.x && effect.y === primary.y)).toBeTrue();

    (component as any).flushPendingDamage();
    expect(primary.hp).toBeLessThan(1000);

    const east = { ...primary, species: "skeleton", x: 400, y: 250, hp: 1000, maxHp: 1000 } as any;
    const south = { ...primary, species: "skeletonWarrior", x: 250, y: 350, hp: 1000, maxHp: 1000 } as any;
    const west = { ...primary, species: "skeletalMageCold", x: 150, y: 250, hp: 1000, maxHp: 1000 } as any;
    const north = { ...primary, species: "balrog", x: 250, y: 150, hp: 1000, maxHp: 1000 } as any;
    const nonHoly = { ...primary, species: "sandRaider", x: 300, y: 250, hp: 1000, maxHp: 1000 } as any;
    component.enemies = [primary, east, south, west, north, nonHoly];
    (component as any).rebuildEnemyGrid();

    for (let frame = 0; frame < 80; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(east.hp).toBeLessThan(1000);
    expect(south.hp).toBeLessThan(1000);
    expect(west.hp).toBeLessThan(1000);
    expect(north.hp).toBeLessThan(1000);
    expect(nonHoly.hp).toBe(1000);
    expect((component as any).skillVisualEffects.some((effect: any) => effect.fistOfTheHeavensBoltImpact)).toBeTrue();
  });

  it("only lets Fist of the Heavens Holy Bolts hurt Undead and Demons, with no ally healing", () => {
    component.selectedClass = "paladin";
    component.playerX = 100;
    component.playerY = 250;
    component.playerHp = 500;
    component.playerMaxHp = 1000;
    component.ownedSkills = ["Fist of the Heavens"];
    component.skillLevels = { "Fist of the Heavens": 1 };
    const primary = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [primary];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Fist of the Heavens");
    const ally = { ...primary, species: "skeleton", summonType: "skeleton", x: 250, y: 350, hp: 10, maxHp: 100 } as any;
    const mortal = { ...primary, species: "sandRaider", x: 300, y: 250 } as any;
    const undead = { ...primary, species: "skeleton", x: 400, y: 250, hp: 1000, maxHp: 1000 } as any;
    const demon = { ...primary, species: "balrog", x: 250, y: 150, hp: 1000, maxHp: 1000 } as any;
    component.enemies = [primary, mortal, undead, demon, ally];
    (component as any).rebuildEnemyGrid();
    const playerHp = component.playerHp;
    const allyHp = ally.hp;

    for (let frame = 0; frame < 80; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(mortal.hp).toBe(1000);
    expect(undead.hp).toBeLessThan(1000);
    expect(demon.hp).toBeLessThan(1000);
    expect(component.playerHp).toBe(playerHp);
    expect(ally.hp).toBe(allyHp);
    expect((component as any).getSkillRankStats("Fist of the Heavens", "projectile", 1))
      .toContain("Fist-created Holy Bolts never heal allies.");
  });

  it("stops the hero from walking through a Bone Wall", () => {
    component.playerX = 250;
    component.playerY = 250;
    const wall = {
      x: 258, y: 250, startX: 258, startY: 250, targetX: 258, targetY: 250,
      speed: 0, damage: 0, life: Number.POSITIVE_INFINITY, age: 0, radius: 10,
      color: "#d9d0b5", kind: "bone", boneWall: true,
      wallNormalX: 1, wallNormalY: 0, wallHalfLength: 100, wallHealth: 1000, wallMaxHealth: 1000,
    } as any;
    component.attackProjectiles = [wall];
    component.keysDown.add("d");

    component.movePlayer(100);

    expect((component as any).playerMoveX).toBe(0);
    expect(component.playerX).toBe(250);

    wall.wallHealth = 0;
    wall.life = 0;
    component.movePlayer(100);
    expect((component as any).playerMoveX).toBeGreaterThan(0);
    component.keysDown.delete("d");
  });

  it("always lands Fist of the Heavens lightning through a Bone Wall", () => {
    component.selectedClass = "paladin";
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Fist of the Heavens"];
    component.skillLevels = { "Fist of the Heavens": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 500, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    const wall = {
      x: 300, y: 250, startX: 300, startY: 250, targetX: 300, targetY: 250,
      speed: 0, damage: 0, life: Number.POSITIVE_INFINITY, age: 0, radius: 10,
      color: "#d9d0b5", kind: "bone", boneWall: true,
      wallNormalX: 1, wallNormalY: 0, wallHalfLength: 200, wallHealth: 1000, wallMaxHealth: 1000,
    } as any;
    component.enemies = [target];
    component.attackProjectiles = [wall];
    component.floatingTexts = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Fist of the Heavens");
    expect(component.attackProjectiles.filter((projectile) => projectile.fistOfTheHeavensBolt).length).toBe(4);
    (component as any).flushPendingDamage();

    expect(target.hp).toBeLessThan(1000);
    expect(wall.wallHealth).toBe(1000);
  });

  it("keeps an active Blessed Hammer orbiting its cast point after the paladin moves", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Blessed Hammer"];
    component.skillLevels = { "Blessed Hammer": 1 };
    component.attackProjectiles = [];

    component.activateOwnedSkill("Blessed Hammer");
    const hammer = component.attackProjectiles[0];
    const castCenterX = hammer.blessedHammerCenterX!;
    const castCenterY = hammer.blessedHammerCenterY!;

    // Normal movement translates the world beneath a stationary arena-space
    // player. The hammer keeps its original world-space orbit, so it falls
    // behind instead of staying glued to the paladin.
    (component as any).shiftWorldBy(64, -32);
    (component as any).updateAttackProjectiles(16);

    const angle = hammer.blessedHammerAngle ?? 0;
    const radius = hammer.blessedHammerRadius ?? 0;
    expect(hammer.blessedHammerCenterX).toBeCloseTo(castCenterX - 64, 5);
    expect(hammer.blessedHammerCenterY).toBeCloseTo(castCenterY + 32, 5);
    expect(hammer.x).toBeCloseTo(castCenterX - 64 + Math.cos(angle) * radius, 5);
    expect(hammer.y).toBeCloseTo(castCenterY + 32 + Math.sin(angle) * radius, 5);
    expect(hammer.x).not.toBeCloseTo(component.playerX + Math.cos(angle) * radius, 1);

    // Even a direct player-position change cannot pull the hammer back.
    component.playerX += 80;
    component.playerY += 40;
    (component as any).updateAttackProjectiles(16);
    expect(hammer.blessedHammerCenterX).toBeCloseTo(castCenterX - 64, 5);
    expect(hammer.blessedHammerCenterY).toBeCloseTo(castCenterY + 32, 5);
  });

  it("keeps the barbarian invulnerable while airborne and keeps monsters reacting", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    const attacker = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 20, cd: 0 } as any;
    const watcher = { ...attacker, x: 300 };
    const follower = { ...attacker, x: 360 };
    component.enemies = [attacker, watcher, follower];
    component.playerMaxHp = 1000;
    component.playerHp = 100;

    component.activateOwnedSkill("Leap");
    expect((component as any).playerLeapRemaining).toBeGreaterThan(0);
    expect((component as any).getSkillRankStats("Leap", "movement", 1)).toContain("Invulnerable while airborne");
    expect(watcher.leapReaction).toBe("wait");
    expect(follower.leapReaction).toBe("chase");

    (component as any).updateEnemies(100);
    expect(component.playerHp).toBe(100);
    expect((component as any).applyIncomingDamage(40)).toBe(0);
    expect(attacker.x).toBe(270);
    expect(watcher.x).toBe(300);
    expect(watcher.animationState).toBe("idle");
    expect(follower.x).toBeLessThan(360);
    expect(follower.animationState).toBe("move");

    for (let frame = 0; frame < 80; frame += 1) (component as any).updatePlayerLeap(16);

    expect((component as any).playerLeapRemaining).toBe(0);
    expect(attacker.stunRemaining).toBeGreaterThan(0);
    expect(watcher.stunRemaining).toBeGreaterThan(0);
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

  it("walks to clicked floor loot and lets automatic pickup collect it", () => {
    component.selectedClass = "amazon";
    component.activeTab = "run";
    component.runActive = true;
    component.pendingLevelUps = 0;
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    const drop = {
      x: 284,
      y: 250,
      item: {
        id: "clicked-loot", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
        slot: "weapon", desc: "A sword.", stats: { damageMin: 2, damageMax: 5 },
      } as any,
      bob: 0,
      life: 30,
      pickupDelay: 0,
      notifiedFull: false,
    };
    component.itemDrops = [drop];
    const arena = {
      width: 500, height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: arena };
    spyOn(component as any, "updateHoveredEnemy");
    spyOn(component as any, "updateHoveredGroundPickup").and.callFake(() => {
      component.hoveredGroundPickup = { text: drop.item.name, x: 20, y: 20, radius: 30, source: drop };
    });

    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, target: arena, clientX: 100, clientY: 100,
      preventDefault: () => undefined,
    } as any);

    expect((component as any).clickMoveTarget).toBeNull();
    expect((component as any).clickLootTarget?.source).toBe(drop);

    spyOn(component as any, "campaignTerrainBlocks").and.returnValue(false);
    spyOn(component as any, "boneWallBlocksPlayer").and.returnValue(false);
    component.movePlayer(250);
    component.updateItemDrops(16);

    expect(component.itemDrops).toHaveSize(0);
    expect(component.inventory.filter(Boolean)).toHaveSize(1);
    expect(component.inventory.find(Boolean)?.id).toBe("clicked-loot");
  });

  it("routes a floor click around a wall instead of stopping at it", () => {
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    component.activeTab = "run";
    component.runActive = true;
    spyOn(component as any, "campaignCollisionContext").and.returnValue({ clearance: 8, blocksSight: false } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "campaignBlockedSamples").and.callFake((_context: any, x: number, y: number) => (
      x >= 270 && x <= 300 && y >= 210 && y <= 290 ? 1 : 0
    ));

    const path = (component as any).planClickGroundPath(350, 250) as Array<{ x: number; y: number }>;

    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(1);
    expect(path.some((point) => point.y < 210 || point.y > 290)).toBeTrue();
    expect(path.every((point) => !(point.x >= 270 && point.x <= 300 && point.y >= 210 && point.y <= 290))).toBeTrue();
  });

  it("turns an empty floor click into a walk-only destination", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.pendingLevelUps = 0;
    component.playerX = 250;
    component.playerY = 250;
    const arena = { width: 500, height: 500 } as any;
    (component as any).arenaRef = { nativeElement: arena };
    spyOn(component as any, "updateHoveredEnemy").and.callFake(() => { component.hoveredEnemy = null; });
    spyOn(component as any, "updateHoveredGroundPickup").and.callFake(() => { component.hoveredGroundPickup = null; });
    spyOn(component as any, "arenaWorldPointAt").and.returnValue({ x: 340, y: 250 });
    spyOn(component as any, "planClickGroundPath").and.returnValue([{ x: 340, y: 250 }]);

    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, target: arena, clientX: 350, clientY: 250,
      preventDefault: () => undefined,
    } as any);

    expect((component as any).clickMoveTarget).toBeNull();
    expect((component as any).clickLootTarget).toBeNull();
    expect((component as any).clickGroundTarget).toEqual({ x: 340, y: 250 });
    expect((component as any).clickGroundPath).toEqual([{ x: 340, y: 250 }]);
  });

  it("does not attack or cast while walking to a floor destination", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.pendingLevelUps = 0;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).attackCooldown = 0;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    (component as any).skillCastCooldowns = {};
    component.attackProjectiles = [];
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies = [target];
    (component as any).clickGroundTarget = { x: 420, y: 250 };
    (component as any).clickGroundPath = [{ x: 420, y: 250 }];

    expect((component as any).playerRunning).toBeTrue();
    component.attackNearestEnemy();
    (component as any).updateBasicAttack();
    (component as any).updateAutomaticSkillCasts(16);
    component.activateOwnedSkill("Charged Bolt");

    expect(target.hp).toBe(100);
    expect(component.attackProjectiles).toHaveSize(0);
  });

  it("walks all the way to the selected floor point and then releases the move command", () => {
    component.runActive = true;
    component.pendingLevelUps = 0;
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    (component as any).playerAttackLockRemaining = 0;
    (component as any).clickGroundTarget = { x: 350, y: 250 };
    (component as any).clickGroundPath = [{ x: 350, y: 250 }];
    spyOn(component as any, "campaignTerrainBlocks").and.returnValue(false);
    spyOn(component as any, "boneWallBlocksPlayer").and.returnValue(false);

    component.movePlayer(100);
    expect((component as any).clickGroundTarget).not.toBeNull();
    expect((component as any).clickGroundTarget.x).toBeLessThan(350);

    for (let frame = 0; frame < 20 && (component as any).clickGroundTarget; frame += 1) {
      component.movePlayer(100);
    }

    expect((component as any).clickGroundTarget).toBeNull();
    expect((component as any).clickGroundPath).toHaveSize(0);
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
      expect(bolt.driftStrength).toBe(0.16);
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

  it("weaves each Charged Bolt around its launch line rather than flying dead straight", () => {
    component.selectedClass = "sorceress";
    (component as any).worldZoom = 1;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 600, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Charged Bolt");

    component.enemies = [];
    (component as any).rebuildEnemyGrid();
    const bolt = component.attackProjectiles[2];
    const startX = bolt.x;
    const startY = bolt.y;
    const lineX = bolt.targetX - startX;
    const lineY = bolt.targetY - startY;
    const lineLength = Math.hypot(lineX, lineY);
    for (let frame = 0; frame < 40; frame += 1) (component as any).updateAttackProjectiles(16);

    const perpendicular = Math.abs(lineX * (bolt.y - startY) - lineY * (bolt.x - startX)) / lineLength;
    expect(perpendicular).toBeGreaterThan(1.5);
    expect(Math.hypot(bolt.headingX ?? 0, bolt.headingY ?? 0)).toBeCloseTo(1);
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

  it("ramps monster health and damage with the area level", () => {
    const sample = (act: number, areaIndex: number) => {
      component.currentAct = act;
      component.currentAreaIndex = areaIndex;
      const normal = (component as any).makeEnemy("normal", false, "fallen");
      const champion = (component as any).makeEnemy("champion", false, "fallen", "champion");
      return {
        hp: normal.maxHp, dmg: normal.dmg,
        championHp: champion.maxHp, championDmg: champion.dmg,
      };
    };

    // Blood Moor (area level 1) keeps the untouched base block.
    expect(sample(1, 0)).toEqual({ hp: 18, dmg: 2, championHp: 54, championDmg: 4 });
    // Catacombs: area level 11. Edge: 2 * 6 = 12 damage, 48 life.
    expect(sample(1, 5)).toEqual({ hp: 48, dmg: 12, championHp: 144, championDmg: 23 });
    // Throne of Destruction: area level 43, where the hero's armour and
    // resistances are the only thing keeping a pack from three-shotting them.
    const throne = sample(5, 12);
    expect(throne.hp).toBe(203);
    expect(throne.dmg).toBe(98);
    // Pandemonium's level-83 monsters sit far above the campaign's endgame.
    // Forgotten Sands is a plain level-83 area, unlike Tristram's extra 3x/2x.
    const pandemonium = sample(6, 0);
    expect(pandemonium.hp).toBe(527);
    expect(pandemonium.dmg).toBe(321);

    // Bosses ramp too, but with the square root of the monster curve so their
    // existing 10x block does not compound into something unkillable.
    component.currentAct = 5;
    component.currentAreaIndex = 12;
    const baal = (component as any).makeEnemy("boss", true, "baal");
    expect(baal.maxHp).toBe(Math.round(140 * 10 * Math.sqrt((component as any).areaHealthScale())));
    expect(baal.dmg).toBe(Math.ceil(6 * 10 * Math.sqrt((component as any).areaDamageScale())));
  });

  it("uses LightningStrike and hits the D2 number of chained monsters", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Chain Lightning"];
    const enemies = [310, 370, 430, 490].map((x) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    }) as any);
    component.enemies = enemies;

    // D2's Chain Lightning hits [(25 + slvl) / 5] monsters, one more per five
    // levels past rank 1, and soft points count towards that level.
    const expectations: Array<[number, number]> = [[1, 5], [5, 6], [10, 7], [20, 9], [30, 11]];
    for (const [rank, targets] of expectations) {
      for (const enemy of enemies) enemy.hp = 100;
      component.skillLevels = { "Chain Lightning": rank };
      (component as any).skillCastCooldowns = {};
      component.attackProjectiles = [];
      (component as any).rebuildEnemyGrid();
      component.activateOwnedSkill("Chain Lightning");

      const bolt = component.attackProjectiles[0];
      expect(bolt).toBeDefined();
      expect(bolt.missileId).toBe("d2-lightningstrike");
      expect(bolt.chainJumpsRemaining).toBe(targets - 1);
      expect((component as any).missileOverlayId("Chain Lightning")).toBe("d2-lightningstrike");

      for (let frame = 0; frame < 300; frame += 1) (component as any).updateAttackProjectiles(16);
      (component as any).flushPendingDamage();

      // Only four monsters are in reach here, so every one of them is struck.
      expect(enemies.filter((enemy) => enemy.hp < 100).length).toBe(enemies.length);
    }
  });

  it("applies the D2 lightning-tree synergies to Chain Lightning and Lightning", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = {
      "Charged Bolt": 10, "Lightning": 10, "Nova": 10, "Chain Lightning": 10,
    };

    // Chain Lightning receives +4% per rank of Charged Bolt, Lightning and Nova.
    expect((component as any).lightningSynergyMultiplier("Chain Lightning"))
      .toBeCloseTo(1 + 0.04 * 30, 6);
    // Lightning receives +8% per rank of Charged Bolt, Nova and Chain Lightning.
    expect((component as any).lightningSynergyMultiplier("Lightning"))
      .toBeCloseTo(1 + 0.08 * 30, 6);

    // Unspent skills add nothing.
    component.skillLevels = {};
    expect((component as any).lightningSynergyMultiplier("Chain Lightning")).toBe(1);
    expect((component as any).lightningSynergyMultiplier("Lightning")).toBe(1);
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

  it("walks every Act V zone through its terrain floor atlas", () => {
    component.currentAct = 5;
    const areas = component.currentActDetails.areas;

    expect(areas.length).toBe(13);
    expect(areas.map((area) => area.name)).toEqual([
      "Bloody Foothills",
      "Frigid Highlands",
      "Arreat Plateau",
      "Crystalline Passage",
      "Frozen River",
      "Nihlathak's Temple",
      "Halls of Vaught",
      "Glacial Trail",
      "Frozen Tundra",
      "Ancients' Way",
      "Arreat Summit",
      "Worldstone Keep",
      "Throne of Destruction",
    ]);
    expect(new Set(areas.map((area) => area.floorTiles)).size).toBe(3);
    expect(areas[0].floorTiles).toContain("a5-bloody-foothills");
    expect(areas[3].floorTiles).toContain("a5-crystalline-passage");
    expect(areas[12].floorTiles).toContain("a5-throne-of-destruction");
    expect(areas.every((area) => area.baseFloorVariant >= 0 && area.baseFloorVariant < 16)).toBeTrue();
  });

  it("keeps every lore zone in the campaign acts in order", () => {
    const campaignZones = [1, 2, 3, 4, 5].flatMap((actId) => {
      component.currentAct = actId;
      return component.currentActDetails.areas
        .map((area) => area.name)
        .filter((name) => name !== "Sewers");
    });

    expect(campaignZones).toEqual(component.mapAreas);
  });

  it("holds the area change until the next area's ground and collision are ready", () => {
    spyOn(component as any, "persistRunProgress");
    component.currentAct = 1;
    component.actTime = 0;
    component.playerLevel = 99;
    (component as any).campaignWorlds.clear();
    (component as any).campaignWorldFailures.clear();

    (component as any).updateCampaignArea();
    expect(component.currentAreaIndex).toBe(0);

    component.actTime = 70;
    (component as any).updateCampaignArea();
    // The clock moved on, but the hero is still standing in the area whose map
    // and walls they can see: switching here would drop them into a map that has
    // not decoded yet, with no collision to keep them out of its walls.
    expect(component.currentAreaIndex).toBe(0);
    expect(component.currentArea.name).toBe("Blood Moor");
    expect((component as any).pendingCampaignAreaIndex).toBe(3);

    const pending = (component as any).pendingWorldEntry();
    expect(pending.area).toBe("Dark Wood");
    const ground = document.createElement("img");
    Object.defineProperties(ground, {
      naturalWidth: { configurable: true, value: 5440 },
      naturalHeight: { configurable: true, value: 2976 },
    });
    (component as any).campaignWorlds.set(pending.slug, {
      ground,
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 5440, backdropHeight: 2976, instances: [],
        walkable: { x: 2720, y: 1488, halfWidth: 2600, halfHeight: 1400 },
      },
    });
    (component as any).updateCampaignArea();
    // Ground and layout without the collision mask still leave the walls hollow.
    expect(component.currentAreaIndex).toBe(0);

    const assets = (component as any).campaignWorlds.get(pending.slug);
    assets.collision = { width: 1, height: 1, blocked: new Uint8Array(1) };
    (component as any).updateCampaignArea();

    expect(component.currentAreaIndex).toBe(3);
    expect(component.currentArea.name).toBe("Dark Wood");
    expect((component as any).pendingCampaignAreaIndex).toBeNull();
    expect([...(component as any).campaignWorlds.keys()]).toEqual([pending.slug]);
  });

  it("freezes the zone order once the act boss arrives", () => {
    spyOn(component as any, "persistRunProgress");
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    component.actTime = 130;
    component.actBossSpawned = true;

    (component as any).updateCampaignArea();

    expect(component.currentAreaIndex).toBe(0);
    expect((component as any).pendingCampaignAreaIndex).toBeNull();
  });

  it("keeps the pending area's ground while the hero still plays the previous one", () => {
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    expect(component.currentArea.name).toBe("Blood Moor");
    (component as any).campaignWorlds.clear();
    // The clock has already moved to Cold Plains; its ground is loading behind
    // the area the hero can see, so it must not be thrown away on arrival.
    (component as any).pendingCampaignAreaIndex = 1;
    const created: Array<{ image: any; src: string }> = [];
    const originalImage = (window as any).Image;
    class FakeImage {
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      naturalWidth = 5440;
      naturalHeight = 2976;
      set src(value: string) { created.push({ image: this, src: value }); }
      get src(): string { return ""; }
      removeAttribute(): void { /* the element is released */ }
    }
    (window as any).Image = FakeImage;
    spyOn(window, "fetch").and.resolveTo({ ok: false, status: 404 } as Response);
    try {
      const entry = (component as any).pendingWorldEntry();
      (component as any).ensureCampaignWorld(entry);
      const ground = created.find((item) => item.src === entry.ground);
      expect(ground).toBeTruthy();
      ground!.image.onload!(new Event("load"));
    } finally {
      (window as any).Image = originalImage;
    }

    expect([...(component as any).campaignWorlds.keys()]).toEqual(["a1-cold-plains"]);
  });

  it("lays the authored area art over the floor for every campaign act", () => {
    for (let actId = 2; actId <= 7; actId += 1) {
      component.currentAct = actId;
      expect(component.currentActDetails.backdrop).withContext(`Act ${actId} backdrop`).toBeTruthy();
      expect(component.currentActDetails.backdrop).withContext(`Act ${actId} backdrop path`).toContain("assets/d2survivors/maps/");
    }

    // Act I uses its courtyard as the level; Act VIII keeps the Tristram
    // backdrop and wall-sorting pass.
    component.currentAct = 1;
    expect(component.currentActDetails.backdrop).toContain("act1-barracks.png");
  });

  it("scales an area backdrop over the arena and anchors it to the chunk centre", () => {
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    const image = { naturalWidth: 1400, naturalHeight: 700 } as HTMLImageElement;
    component.currentAct = 3;
    component.arenaW = 720;
    component.arenaH = 480;
    (component as any).arenaRef = {
      nativeElement: { width: 1260, height: 1616, clientWidth: 630, clientHeight: 808 },
    };
    (component as any).projectionWidth = 1260;
    (component as any).projectionDpr = 1;
    (component as any).projectionCenterX = 630;
    (component as any).projectionCenterY = 808;
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = 360;
    (component as any).currentChunkLocalY = 240;

    (component as any).drawCampaignAreaBackdrop(ctx, image, 356);

    expect(drawImage).toHaveBeenCalled();
    const [, x, y, width, height] = (drawImage.calls.mostRecent() as any).args;
    const expectedScale = Math.min(4.2, Math.max(356 / 320, 1260 * 1.75 / 1400, 1616 * 0.9 / 700));
    expect(width).toBeCloseTo(1400 * expectedScale, 5);
    expect(height).toBeCloseTo(700 * expectedScale, 5);
    expect(x + width / 2).toBeCloseTo(630, 5);
    expect(y + height / 2).toBeCloseTo(808, 5);
  });

  it("anchors the Act I courtyard gate walkway to the world gate", () => {
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    const image = { naturalWidth: 520, naturalHeight: 300 } as HTMLImageElement;
    component.currentAct = 1;
    component.arenaW = 720;
    component.arenaH = 480;
    (component as any).arenaRef = {
      nativeElement: { width: 1260, height: 1616, clientWidth: 630, clientHeight: 808 },
    };
    (component as any).projectionWidth = 1260;
    (component as any).projectionDpr = 1;
    (component as any).projectionCenterX = 630;
    (component as any).projectionCenterY = 808;
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = 360;
    (component as any).currentChunkLocalY = 240;

    (component as any).drawCampaignAreaBackdrop(ctx, image, 356);

    const [, x, y, width] = (drawImage.calls.mostRecent() as any).args;
    const scale = width / 520;
    const door = (component as any).act1Gate;
    const doorOffsetX = door.x - 360;
    const doorOffsetY = door.y - 240;
    const expectedX = 630 + (doorOffsetX * 2.1 - doorOffsetY * 2.1) * 0.7071;
    const expectedY = 808 + (doorOffsetX * 2.1 + doorOffsetY * 2.1) * 0.35355;
    expect(scale).toBeCloseTo(4.2, 5);
    // The courtyard's keyed gate walkway, not the middle of the wall face.
    expect(x + 228 * scale).toBeCloseTo(expectedX, 4);
    expect(y + 274 * scale).toBeCloseTo(expectedY, 4);
  });

  it("composes each zone from authored ground, trail, edge and prop cells", () => {
    const tiles: HTMLCanvasElement[] = [];
    for (let index = 0; index < 16; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 80;
      const context = canvas.getContext("2d")!;
      context.fillStyle = `rgb(${index * 12}, ${40 + index * 8}, 32)`;
      context.fillRect(0, 0, 160, 80);
      tiles.push(canvas);
    }
    const area = {
      name: "Blood Moor",
      level: 1,
      floorTiles: "assets/d2survivors/maps/tiles/act1-floor-tiles.png",
      baseFloorVariant: 5,
    };

    const terrain = (component as any).campaignTerrainForArea(area, tiles);

    expect(terrain.style).toBe("trail");
    expect(terrain.ground).toEqual([5, 7, 12]);
    expect(terrain.path).toEqual([1, 10]);
    expect(terrain.edge).toEqual([12]);
    expect(terrain.accents).toContain(3);
    expect(terrain.base).toBe(5);
  });

  it("repeats the area's authored floor diamond so the ground reads as one material", () => {
    const tiles: HTMLCanvasElement[] = [];
    for (let index = 0; index < 16; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 80;
      canvas.getContext("2d")!.fillRect(0, 0, 160, 80);
      tiles.push(canvas);
    }
    const area = {
      name: "Blood Moor",
      level: 1,
      floorTiles: "assets/d2survivors/maps/tiles/act1-floor-tiles.png",
      baseFloorVariant: 5,
    };
    const terrain = (component as any).campaignTerrainForArea(area, tiles);
    const used = new Set<HTMLCanvasElement>();
    for (let x = 0; x < 48; x += 1) {
      for (let y = 0; y < 48; y += 1) {
        const image = (component as any).campaignGroundTile(tiles, terrain, tiles[6], x, y, area) as HTMLCanvasElement;
        used.add(image);
      }
    }

    // A mixed mosaic of cart-track, grass and boulder cells read as tiles glued
    // together, so the floor is one written diamond repeated edge to edge.
    expect(used.size).toBe(1);
    expect([...used][0]).toBe(tiles[area.baseFloorVariant]);
    const repeat = (component as any).campaignGroundTile(tiles, terrain, tiles[6], 12, 30, area);
    const again = (component as any).campaignGroundTile(tiles, terrain, tiles[6], 12, 30, area);
    expect(again).toBe(repeat);
  });

  it("strips a cell's baked elevation lip so neighbouring floor diamonds meet flush", () => {
    const source = document.createElement("canvas");
    source.width = 160;
    source.height = 80;
    const context = source.getContext("2d")!;
    context.fillStyle = "rgb(120, 96, 64)";
    context.fillRect(0, 0, 160, 80);
    context.strokeStyle = "rgb(0, 0, 0)";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(80, 0);
    context.lineTo(160, 40);
    context.lineTo(80, 80);
    context.lineTo(0, 40);
    context.closePath();
    context.stroke();

    const cleaned = (component as any).cleanCampaignFloorTile(source) as HTMLCanvasElement;
    const pixels = cleaned.getContext("2d")!.getImageData(0, 0, 160, 80).data;
    const pixel = (x: number, y: number): number[] => {
      const offset = (y * 160 + x) * 4;
      return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    };

    // Outside the authored diamond stays clear, so the tiles can abut on edges.
    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(159, 79)[3]).toBe(0);
    // The dark lip is dropped: the diamond is filled with the clean material
    // right up to its border instead of repeating a scalloped shadow.
    for (const [x, y] of [[80, 4], [8, 40], [152, 40], [80, 75]]) {
      const [red, , , alpha] = pixel(x, y);
      expect(alpha).toBe(255);
      expect(red).toBeGreaterThan(90);
    }
  });

  it("does not add synthetic cast rings or labels for armor and auras", () => {
    (component as any).skillVisualEffects.length = 0;
    component.selectedClass = "sorceress";

    (component as any).addSkillVisualEffect("Frozen Armor");
    expect((component as any).skillVisualEffects.length).toBe(0);

    component.selectedClass = "paladin";
    (component as any).addSkillVisualEffect("Might");
    expect((component as any).skillVisualEffects.length).toBe(0);
  });

  it("clamps the campaign area index when the start-frame clock is invalid", () => {
    component.currentAct = 1;
    component.actBossSpawned = false;
    component.actTransitionReady = false;
    component.campaignVictory = false;
    component.currentAreaIndex = 0;

    component.actTime = Number.NaN;
    expect(() => (component as any).updateCampaignArea()).not.toThrow();
    expect(component.currentAreaIndex).toBe(0);
    expect(component.actTime).toBe(0);

    component.actTime = -1;
    expect(() => (component as any).updateCampaignArea()).not.toThrow();
    expect(component.currentAreaIndex).toBe(0);
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

    expect(drawImage).toHaveBeenCalledTimes(1);
    const [, x, y, width, height] = drawImage.calls.mostRecent().args;
    // One authored 160px Tristram tile maps to one gameplay tile.
    expect(width / image.naturalWidth).toBeCloseTo(356 / 160, 5);
    expect(height / image.naturalHeight).toBeCloseTo(356 / 160, 5);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it("places Tristram wall sprites at the backdrop scale for depth sorting", () => {
    component.currentAct = 8;
    component.arenaW = 500;
    component.arenaH = 500;
    (component as any).arenaRef = {
      nativeElement: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    };
    (component as any).campaignBackdropImages[8] = {
      complete: true,
      naturalWidth: 3840,
      naturalHeight: 2304,
    };
    (component as any).tristramWallAtlas = { complete: true, naturalWidth: 1024 };
    (component as any).tristramWallLayout = {
      atlasWidth: 1024,
      atlasHeight: 2208,
      backdropWidth: 3840,
      backdropHeight: 2304,
      instances: [{ x: 1900, y: 900, w: 128, h: 160, sx: 0, sy: 0, order: 0 }],
    };

    const draws = (component as any).tristramWallDraws(356);

    expect(draws.length).toBeGreaterThan(0);
    expect(draws[0].dw).toBeCloseTo(128 * 356 / 160, 5);
    expect(draws[0].dh).toBeCloseTo(160 * 356 / 160, 5);
    expect(draws[0].depth).toBeCloseTo(draws[0].dy + draws[0].dh, 5);

    component.currentAct = 7;
    expect((component as any).tristramWallDraws(356)).toEqual([]);
  });

  it("sorts the Worldstone Keep wall strips over the Act V courtyard", () => {
    component.currentAct = 5;
    component.arenaW = 500;
    component.arenaH = 500;
    (component as any).arenaRef = {
      nativeElement: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    };
    (component as any).projectionDpr = 1;
    (component as any).projectionWidth = 800;
    (component as any).projectionCenterX = 400;
    (component as any).projectionCenterY = 300;
    (component as any).currentChunkLocalX = (component as any).chunkTileColumns * 60 / 2;
    (component as any).currentChunkLocalY = (component as any).chunkTileRows * 60 / 2;
    (component as any).campaignBackdropImages[5] = {
      complete: true,
      naturalWidth: 600,
      naturalHeight: 340,
    };
    (component as any).act5WallAtlas = { complete: true, naturalWidth: 512 };
    (component as any).act5WallLayout = {
      atlasWidth: 512,
      atlasHeight: 442,
      backdropWidth: 600,
      backdropHeight: 340,
      instances: [{ x: 300, y: 60, w: 32, h: 80, sx: 0, sy: 0, order: 0, depth: 140 }],
    };

    const draws = (component as any).act5WallDraws(356);
    const geometry = (component as any).campaignAreaBackdropGeometry(356, 600, 340);

    expect(draws.length).toBeGreaterThan(0);
    expect(draws[0].dw).toBeCloseTo(32 * geometry.scale, 5);
    expect(draws[0].dh).toBeCloseTo(80 * geometry.scale, 5);
    expect(draws[0].depth).toBeCloseTo(geometry.top + 140 * geometry.scale, 5);

    component.currentAct = 4;
    expect((component as any).act5WallDraws(356)).toEqual([]);
  });

  it("blocks the Worldstone courtyard walls but leaves the Frigid Highlands spawn open", () => {
    component.currentAct = 5;
    component.currentAreaIndex = 1;
    const mask = { width: 600, height: 340, blocked: new Uint8Array(600 * 340) };
    for (let x = 160; x <= 440; x += 1) mask.blocked[140 * 600 + x] = 1;
    (component as any).campaignCollisionMasks[5] = mask;
    component.playerX = 300;
    component.playerY = 170;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({
      scale: 1, width: 600, height: 340, left: 0, top: 0,
    });
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    expect(component.currentArea.name).toBe("Frigid Highlands");
    expect(component.currentArea.level).toBe(25);
    // The solid north wall stops a step into its stone face away from the gate.
    component.playerX = 250;
    expect((component as any).campaignTerrainBlocks(0, -40)).toBeTrue();
    // The painted central gate is open instead of leaving an invisible wall.
    component.playerX = 300;
    expect((component as any).campaignTerrainBlocks(0, -40)).toBeFalse();
    // The open courtyard around the spawn point stays walkable.
    expect((component as any).campaignTerrainBlocks(0, 40)).toBeFalse();
    const context = (component as any).campaignCollisionContext();
    expect(context).toBeTruthy();
    expect(context.blocksSight).toBeTrue();
  });

  it("opens the Worldstone gate through the Act V north wall", () => {
    const blocked = new Uint8Array(600 * 340);
    blocked.fill(1);
    (component as any).campaignCollisionMasks[5] = { width: 600, height: 340, blocked };
    (component as any).currentAct = 5;
    component.playerX = 300;
    component.playerY = 170;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({
      scale: 1, width: 600, height: 340, left: 0, top: 0,
    });
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    const context = (component as any).campaignCollisionContext();

    // The painted central arch is walkable from the courtyard through the wall.
    expect((component as any).campaignBlockedAt(context, 300, 140)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 300, 120)).toBeFalse();
    // Its jambs and the rest of the north wall still stop the hero.
    expect((component as any).campaignBlockedAt(context, 280, 140)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 250, 140)).toBeTrue();
  });

  it("blocks Uber Tristram's building walls but leaves its streets walkable", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[50 * 100 + 55] = 1;
    (component as any).campaignCollisionMasks[8] = mask;
    (component as any).currentAct = 8;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "tristramBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    expect((component as any).campaignTerrainBlocks(5, 0)).toBeTrue();
    expect((component as any).campaignTerrainBlocks(0, 5)).toBeFalse();
  });

  it("spawns Uber Tristram on the road outside the central ruined house", () => {
    const mask = { width: 3840, height: 2304, blocked: new Uint8Array(3840 * 2304) };
    // The old spawn sat inside this building's solid wall-cell footprint.  Fill
    // its interior too: a full-room block catches any anchor that puts the hero
    // back behind those walls, not merely one touching the wall ring.
    for (let y = 1145; y <= 1343; y += 1) {
      for (let x = 1761; x <= 2239; x += 1) mask.blocked[y * mask.width + x] = 1;
    }
    (component as any).campaignCollisionMasks[8] = mask;
    (component as any).currentAct = 8;
    component.arenaW = 500;
    component.arenaH = 500;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = (component as any).chunkTileColumns * 60 / 2;
    (component as any).currentChunkLocalY = (component as any).chunkTileRows * 60 / 2;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    const context = (component as any).campaignCollisionContext();
    expect(context).toBeTruthy();
    expect((component as any).campaignBlockedSamples(context, 250, 250)).toBe(0);
    expect((component as any).campaignTerrainBlocks(0, 0)).toBeFalse();
    expect((component as any).campaignTerrainBlocks(0, 40)).toBeFalse();

    // The centre of the old house is still solid, proving this test is sensitive
    // to the spawn anchor rather than passing on a completely empty mask.
    const oldSpawnX = context.geometry.left + 1956 * context.geometry.scale;
    const oldSpawnY = context.geometry.top + 1224 * context.geometry.scale;
    expect((component as any).campaignBlockedAt(context, oldSpawnX, oldSpawnY)).toBeTrue();
  });

  it("frees every area's DS1 map except the one being played", () => {
    const oldGround = document.createElement("img");
    oldGround.onload = () => undefined;
    const keptGround = document.createElement("img");
    (component as any).campaignWorlds.set("a1-blood-moor", { ground: oldGround });
    (component as any).campaignWorlds.set("a3-lower-kurast", { ground: document.createElement("img") });
    (component as any).campaignWorlds.set("a1-cold-plains", { ground: keptGround });

    (component as any).releaseCampaignWorldsExcept("a1-cold-plains");

    // The huge decoded grounds of the areas the run has left must not linger.
    expect([...(component as any).campaignWorlds.keys()]).toEqual(["a1-cold-plains"]);
    expect(oldGround.onload).toBeNull();
    expect(oldGround.getAttribute("src")).toBeNull();
  });

  it("drops the previous area's map once the next area's ground is ready", () => {
    component.currentAct = 1;
    component.currentAreaIndex = 1;
    expect(component.currentArea.name).toBe("Cold Plains");
    const previousGround = document.createElement("img");
    previousGround.onload = () => undefined;
    (component as any).campaignWorlds.set("a1-blood-moor", { ground: previousGround });

    // Capture the image elements the loader creates instead of hitting the network.
    const created: Array<{ image: any; src: string }> = [];
    const originalImage = (window as any).Image;
    class FakeImage {
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      naturalWidth = 64;
      naturalHeight = 64;
      set src(value: string) { created.push({ image: this, src: value }); }
      get src(): string { return ""; }
      removeAttribute(): void { /* the element is released */ }
    }
    (window as any).Image = FakeImage;
    spyOn(window, "fetch").and.resolveTo({ ok: false, status: 404 } as Response);
    try {
      const entry = (component as any).currentWorldEntry();
      (component as any).ensureCampaignWorld(entry);
      const ground = created.find((item) => item.src === entry.ground);
      expect(ground).toBeTruthy();
      ground!.image.onload!(new Event("load"));
    } finally {
      (window as any).Image = originalImage;
    }

    expect([...(component as any).campaignWorlds.keys()]).toEqual(["a1-cold-plains"]);
    expect(previousGround.onload).toBeNull();
  });

  it("keeps the previous area's ground on screen while the next map decodes", () => {
    component.currentAct = 1;
    component.currentAreaIndex = 1;
    expect(component.currentArea.name).toBe("Cold Plains");
    const previousGround = document.createElement("img");
    Object.defineProperties(previousGround, {
      naturalWidth: { configurable: true, value: 4160 },
      naturalHeight: { configurable: true, value: 2336 },
    });
    (component as any).campaignWorlds.set("a1-blood-moor", { ground: previousGround });

    // The painted atlas would otherwise paint over the old floor and then be
    // replaced by the real map, which is the double tileset change.
    const held = (component as any).heldCampaignWorld((component as any).currentWorldEntry());
    expect(held?.slug).toBe("a1-blood-moor");
    expect(held?.ground).toBe(previousGround);

    // Once Cold Plains has its own map, nothing of the old area is drawn.
    const coldPlains = document.createElement("img");
    Object.defineProperties(coldPlains, {
      naturalWidth: { configurable: true, value: 4160 },
      naturalHeight: { configurable: true, value: 2336 },
    });
    (component as any).campaignWorlds.set("a1-cold-plains", { ground: coldPlains });
    expect((component as any).heldCampaignWorld((component as any).currentWorldEntry())).toBeUndefined();
  });

  it("centres the hero again when a new area's map finishes loading", () => {
    const entry = (component as any).currentWorldEntry();
    (component as any).campaignWorlds.set(entry.slug, {
      ground: document.createElement("img"),
      layout: { atlasWidth: 1, atlasHeight: 1, backdropWidth: 1, backdropHeight: 1, instances: [], walkable: { x: 1, y: 1, halfWidth: 1, halfHeight: 1 } },
    });
    const centre = spyOn(component as any, "centerPlayerOnCampaignWorld");
    (component as any).campaignWorldPendingCentre = true;

    (component as any).settlePlayerOnCampaignWorld();

    expect(centre).toHaveBeenCalled();
    expect((component as any).campaignWorldPendingCentre).toBeFalse();
  });

  it("keeps the pending centre spawn until the new map's layout arrives", () => {
    (component as any).campaignWorlds.clear();
    const centre = spyOn(component as any, "centerPlayerOnCampaignWorld");
    (component as any).campaignWorldPendingCentre = true;

    (component as any).settlePlayerOnCampaignWorld();

    expect(centre).not.toHaveBeenCalled();
    expect((component as any).campaignWorldPendingCentre).toBeTrue();
  });

  it("resuming a run does not drag the saved position to the area centre", () => {
    spyOn(component as any, "ensureCampaignWorld");
    (component as any).switchCampaignWorld(false);

    expect((component as any).campaignWorldPendingCentre).toBeFalse();
  });

  it("still draws Act V's largest world from its single cached ground", () => {
    component.currentAct = 5;
    component.currentAreaIndex = 12;
    expect(component.currentArea.name).toBe("Throne of Destruction");
    const ground = document.createElement("img");
    Object.defineProperties(ground, {
      naturalWidth: { configurable: true, value: 7520 },
      naturalHeight: { configurable: true, value: 4016 },
    });
    (component as any).campaignWorlds.set("a5-throne-of-destruction", {
      ground,
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 7520, backdropHeight: 4016,
        instances: [], walkable: { x: 3760, y: 2008, halfWidth: 3660, halfHeight: 1860 },
      },
    });
    spyOn(component as any, "campaignWorldGeometry").and.returnValue({
      scale: 0.5, width: 3760, height: 2008, left: -120, top: -80,
    });
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined, drawImage,
      beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined,
      closePath: () => undefined, fill: () => undefined, fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    (component as any).drawCampaignWorldGround(ctx, ground, 356);

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.calls.argsFor(0)[0]).toBe(ground);
    expect(drawImage.calls.argsFor(0)[3]).toBeGreaterThan(1000);
    expect((component as any).campaignWorlds.size).toBe(1);
  });

  it("seals each DS1 area at the edge of its exported map", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 0;
    expect(component.currentArea.name).toBe("Blood Moor");
    // The exported ground is one diamond of 34x34 tiles, so everything outside
    // that diamond is void even when its collision pixel is clear.
    const walkable = { x: 2680, y: 1616, halfWidth: 2680, halfHeight: 1360 };
    (component as any).campaignWorlds.set("a1-blood-moor", {
      ground: { complete: false } as any,
      collision: { width: 5440, height: 2976, blocked: new Uint8Array(5440 * 2976) },
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 5440, backdropHeight: 2976,
        instances: [], walkable,
      },
    });
    spyOn(component as any, "campaignWorldGeometry").and.returnValue({
      scale: 1, width: 5440, height: 2976, left: 0, top: 0,
    });

    const context = (component as any).campaignWorldCollisionContext();
    expect(context.bounds).toEqual(walkable);
    // The middle of the map and its inner tiles stay walkable.
    expect((component as any).campaignBlockedAt(context, 2680, 1616)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 2000, 1616)).toBeFalse();
    // The transparent corners of the exported rectangle are the void beyond it.
    expect((component as any).campaignBlockedAt(context, 0, 300)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 5300, 2600)).toBeTrue();
  });

  it("starts each area with the hero in the middle of its DS1 map", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 1;
    const walkable = { x: 2680, y: 1616, halfWidth: 2680, halfHeight: 1360 };
    (component as any).campaignWorlds.set("a1-cold-plains", {
      ground: { complete: false } as any,
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 5440, backdropHeight: 2976,
        instances: [], walkable,
      },
    });
    expect(component.currentArea.name).toBe("Cold Plains");
    // The hero arrives several chunks away from the map the new area draws.
    (component as any).currentChunkCoordX = 3;
    (component as any).currentChunkCoordY = 2;
    (component as any).currentChunkLocalX = 20;
    (component as any).currentChunkLocalY = 20;
    expect((component as any).outsideCampaignWorld(
      (component as any).campaignWorldDiamond(),
      (component as any).playerWorldPosition().x,
      (component as any).playerWorldPosition().y,
    )).toBeTrue();

    (component as any).centerPlayerOnCampaignWorld();

    const diamond = (component as any).campaignWorldDiamond();
    const position = (component as any).playerWorldPosition();
    expect(position.x).toBeCloseTo(diamond.x, 5);
    expect(position.y).toBeCloseTo(diamond.y, 5);
    expect((component as any).outsideCampaignWorld(diamond, position.x, position.y)).toBeFalse();
  });

  it("starts the hero on the floor cell the exporter names for a room-built map", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 5;
    expect(component.currentArea.name).toBe("Catacombs");
    // The catacomb rooms wall off the exact middle of the grid, so the exporter
    // names a floor cell in the level's largest walkable region instead.
    (component as any).campaignWorlds.set("a1-catacombs", {
      ground: { complete: false } as any,
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 4160, backdropHeight: 2336,
        instances: [],
        walkable: { x: 2040, y: 1296, halfWidth: 2040, halfHeight: 1040 },
        spawn: { x: 2400, y: 1176 },
      },
    });

    (component as any).centerPlayerOnCampaignWorld();

    const position = (component as any).playerWorldPosition();
    // One exported pixel is 60/160 of a world unit; the map is centred on the chunk.
    const chunkWidth = (component as any).chunkTileColumns * 60;
    const chunkHeight = (component as any).chunkTileRows * 60;
    expect(position.x).toBeCloseTo(chunkWidth / 2 + (2400 - 4160 / 2) * 0.375, 5);
    expect(position.y).toBeCloseTo(chunkHeight / 2 + (1176 - 2336 / 2) * 0.375, 5);
  });

  it("centres the hero when the act clock walks into the next area", () => {
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    component.actBossSpawned = false;
    component.actTransitionReady = false;
    component.campaignVictory = false;
    (component as any).campaignWorlds.clear();
    (component as any).campaignWorldFailures.clear();
    const centre = spyOn(component as any, "centerPlayerOnCampaignWorld");

    component.actTime = 600;
    (component as any).updateCampaignArea();

    // The clock picks the last zone straight away, but the hero only moves into
    // it once its map and collision mask are in (see the ready-gate test above).
    const pending = (component as any).pendingWorldEntry();
    expect(component.currentAreaIndex).toBe(0);
    expect(centre).not.toHaveBeenCalled();

    const ground = document.createElement("img");
    Object.defineProperties(ground, {
      naturalWidth: { configurable: true, value: 5440 },
      naturalHeight: { configurable: true, value: 2976 },
    });
    (component as any).campaignWorlds.set(pending.slug, {
      ground,
      collision: { width: 1, height: 1, blocked: new Uint8Array(1) },
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 5440, backdropHeight: 2976, instances: [],
        walkable: { x: 2720, y: 1488, halfWidth: 2600, halfHeight: 1400 },
      },
    });
    (component as any).updateCampaignArea();

    expect(component.currentAreaIndex).toBeGreaterThan(0);
    expect(centre).toHaveBeenCalled();
  });

  it("keeps charge and leap inside the area's DS1 map", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 0;
    (component as any).campaignWorlds.set("a1-blood-moor", {
      ground: { complete: false } as any,
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: 5440, backdropHeight: 2976,
        instances: [], walkable: { x: 2680, y: 1616, halfWidth: 2680, halfHeight: 1360 },
      },
    });
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = 300;
    (component as any).currentChunkLocalY = (component as any).chunkTileRows * 60 / 2;

    // Charge and Leap skip the wall tests, but must still stop at the map rim.
    (component as any).shiftWorldBy(-4000, 0);
    expect((component as any).currentChunkLocalX).toBe(300);

    (component as any).shiftWorldBy(20, 0);
    expect((component as any).currentChunkLocalX).toBe(320);
  });

  it("opens the caves' exterior while keeping enclosed ledges solid", () => {
    const width = 7;
    const height = 7;
    const blocked = new Uint8Array(width * height).fill(1);
    // A walkable floor ring isolates the central white ledge from the white
    // scenery around the cave.
    for (let x = 2; x <= 4; x += 1) {
      blocked[2 * width + x] = 0;
      blocked[4 * width + x] = 0;
    }
    for (let y = 2; y <= 4; y += 1) {
      blocked[y * width + 2] = 0;
      blocked[y * width + 4] = 0;
    }

    (component as any).openCollisionMaskExterior(blocked, width, height);

    // The tomb tiles beyond the painted cave are now walkable.
    expect(blocked[0]).toBe(0);
    expect(blocked[width - 1]).toBe(0);
    // The ledge enclosed by cave floor still blocks movement.
    expect(blocked[3 * width + 3]).toBe(1);
  });

  it("treats the Buried Caves ledges as movement-only walls", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100), blocksSight: false };
    for (let y = 0; y < 100; y += 1) {
      for (let x = 45; x <= 55; x += 1) mask.blocked[y * 100 + x] = 1;
    }
    (component as any).campaignCollisionMasks[2] = mask;
    (component as any).currentAct = 2;
    component.playerX = 10;
    component.playerY = 20;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, width: 100, height: 100, left: 0, top: 0 });
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    const context = (component as any).campaignCollisionContext();
    expect(context.blocksSight).toBeFalse();
    // The ledge stops the hero from walking through it...
    expect((component as any).campaignTerrainBlocks(50, 0)).toBeTrue();
    // ...but arrows and ranged line of sight pass over the low rock.
    expect((component as any).campaignLineBlocked(context, 10, 20, 90, 20)).toBeFalse();
    expect((component as any).campaignLineBlocked({ ...context, blocksSight: true }, 10, 20, 90, 20)).toBeTrue();
  });

  it("seals Uber Tristram at the first town's edge and blocks its river", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    (component as any).campaignCollisionMasks[8] = mask;
    (component as any).currentAct = 8;
    spyOn(component as any, "tristramBackdropGeometry").and.returnValue({ scale: 1, width: 100, height: 100, left: 0, top: 0 } as any);

    const context = (component as any).campaignCollisionContext();

    // The single map ends here; there is no second copy to walk into.
    expect((component as any).campaignBlockedAt(context, -1, 50)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 100, 50)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 95, 50)).toBeFalse();

    // The right-hand river is impassable, while the bank beside it is not.
    expect((component as any).campaignBlockedAt(context, 90, 90)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 70, 90)).toBeFalse();
  });

  it("stops Uber Tristram leap and charge movement at the map edge and river", () => {
    (component as any).campaignCollisionMasks[8] = {
      width: 3840,
      height: 2304,
      blocked: new Uint8Array(3840 * 2304),
    };
    (component as any).currentAct = 8;
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = 360;
    (component as any).currentChunkLocalY = 240;

    // Charge/Leap bypass the normal terrain test, but the world shift itself
    // must still refuse a destination in the river or off the first map.
    (component as any).shiftWorldBy(600, 300);
    expect((component as any).currentChunkLocalX).toBe(360);
    expect((component as any).currentChunkLocalY).toBe(240);
    (component as any).shiftWorldBy(-1000, 0);
    expect((component as any).currentChunkLocalX).toBe(360);

    // Ordinary movement inside the town still works.
    (component as any).shiftWorldBy(20, 0);
    expect((component as any).currentChunkLocalX).toBe(380);
  });

  it("keeps the Tristram backdrop anchored when movement crosses a chunk seam", () => {
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    const image = { naturalWidth: 3840, naturalHeight: 2304 } as HTMLImageElement;
    const chunkWidth = (component as any).chunkTileColumns * 60;
    const chunkHeight = (component as any).chunkTileRows * 60;
    (component as any).projectionDpr = 1;

    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = chunkWidth - 0.01;
    (component as any).currentChunkLocalY = chunkHeight - 0.01;
    (component as any).drawTristramBackdrop(ctx, image, 356);
    const beforeSeam = drawImage.calls.mostRecent().args;

    (component as any).currentChunkCoordX = 1;
    (component as any).currentChunkCoordY = 1;
    (component as any).currentChunkLocalX = 0.01;
    (component as any).currentChunkLocalY = 0.01;
    (component as any).drawTristramBackdrop(ctx, image, 356);
    const afterSeam = drawImage.calls.mostRecent().args;

    expect(afterSeam[1]).toBeCloseTo(beforeSeam[1], 0);
    expect(afterSeam[2]).toBeCloseTo(beforeSeam[2], 0);
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

  it("erupts a real volcano and rains D2's armageddon rocks", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Volcano", "Armageddon"];
    component.skillLevels = { Volcano: 1, Armageddon: 1 };
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 320, y: 250, hp: 10000, maxHp: 10000, speed: 0, r: 14, dmg: 2, cd: 0,
    } as any];

    component.activateOwnedSkill("Volcano");
    component.activateOwnedSkill("Armageddon");

    const showers = (component as any).rockShowers as any[];
    expect(showers.length).toBe(2);
    // The vent opens on the pack, with the extracted volcano art.
    expect(showers[0].kind).toBe("volcano");
    expect(Math.round(showers[0].x)).toBe(320);
    expect(showers[0].rocks[0].fallArt).toBe("d2-volcano_rock");
    expect(showers[0].rocks[0].impactArt).toBe("d2-rock_lava_explosion");
    // Armageddon falls around the druid and travels with him.
    expect(showers[1].kind).toBe("armageddon");
    expect(showers[1].followsPlayer).toBeTrue();
    expect(showers[1].rocks[0].fallArt).toBe("d2-armageddon_rock");
    expect(showers[1].rocks[0].impactArt).toBe("d2-armageddon_fire");
  });

  it("always casts Firestorm as three lines with a straight middle", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    (component as any).castFirestorm(1);

    const trails = (component as any).firestormTrails as any[];
    expect(trails.length).toBe(3);
    expect(trails[1].weave).toBe(0);
    expect(trails[0].weave).toBe(1);
    expect(trails[2].weave).toBe(1);
    expect(trails[1].angle).toBeCloseTo(0, 6);
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

  it("gives Diablo an Ice Punch that damages and chills the player", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).playerChilledRemaining = 0;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 300, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    expect(component.playerHp).toBeLessThan(1000);
    expect((component as any).playerChilledRemaining).toBeGreaterThan(0);
    expect((component as any).diabloThunderEffects).toHaveSize(0);
    expect(diablo.attackAnimationTime).toBeGreaterThan(0);
  });

  it("uses ordinary claw swipes between Diablo's Cold Touches", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).playerChilledRemaining = 0;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 300, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      diabloMeleeCycle: 1,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    expect(component.playerHp).toBeLessThan(1000);
    expect((component as any).playerChilledRemaining).toBe(0);
    expect(diablo.diabloMeleeCycle).toBe(2);
  });

  it("lets Diablo sweep Red Lightning after the hero", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).playerBonePrisonRemaining = 0;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 430, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      diabloSpellCycle: 0,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    const effects = (component as any).diabloThunderEffects as any[];
    expect(effects).toHaveSize(1);
    expect(effects[0].dirX).toBeLessThan(0);
    expect(diablo.diabloChannelRemaining).toBeGreaterThan(0);
    const hpBeforeTick = component.playerHp;
    (component as any).updateDiabloThunderEffects(0.2);
    expect(component.playerHp).toBeLessThan(hpBeforeTick);

    // The beam turns at a limited rate, so a sharp sidestep can break the track.
    component.playerY = 420;
    const dodgedHp = component.playerHp;
    (component as any).updateDiabloThunderEffects(0.2);
    expect(component.playerHp).toBe(dodgedHp);
    expect(diablo.diabloChannelRemaining).toBeGreaterThan(0);
  });

  it("roots the player with Diablo's Bone Prison", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).playerBonePrisonRemaining = 0;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 430, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      diabloSpellCycle: 1,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    expect((component as any).playerBonePrisonRemaining).toBeGreaterThan(0);
    expect((component as any).diabloThunderEffects).toHaveSize(0);
    const prisonX = diablo.x;
    component.keysDown.add("d");
    component.movePlayer(100);
    expect(diablo.x).toBe(prisonX);
    expect((component as any).playerMoveX).toBe(0);

    (component as any).playerBonePrisonRemaining = 0;
    component.movePlayer(100);
    expect(diablo.x).toBeLessThan(prisonX);
    component.keysDown.delete("d");
  });

  it("opens with Firestorm at range instead of walking into claw reach", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 650, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      diabloSpellCycle: 2,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    const firestorms = (component as any).diabloFirestormEffects as any[];
    expect(firestorms).toHaveSize(1);
    expect(component.playerHp).toBe(1000);
    expect(diablo.attackAnimationTime).toBeGreaterThan(0);
    for (let step = 0; step < 17; step += 1) (component as any).updateDiabloSpellEffects(0.1);
    expect(component.playerHp).toBeLessThan(1000);
  });

  it("expands Diablo's Fire Nova out from his body", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 450, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      diabloSpellCycle: 4,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    expect((component as any).diabloFireNovaEffects).toHaveSize(1);
    for (let step = 0; step < 6; step += 1) (component as any).updateDiabloSpellEffects(0.1);
    expect(component.playerHp).toBeLessThan(1000);
  });

  it("plants Diablo's Fire Wall under the player", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 450, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      diabloSpellCycle: 3,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);

    const walls = (component as any).diabloFireWallEffects as any[];
    expect(walls).toHaveSize(1);
    expect(walls[0].x).toBe(component.playerX);
    expect(walls[0].y).toBe(component.playerY);
    (component as any).updateDiabloSpellEffects(0.2);
    expect(component.playerHp).toBeLessThan(1000);
  });

  it("renders every Pandemonium boss effect from imported missile cels", () => {
    (component as any).runActive = true;
    (component as any).projectionDpr = 1;
    (component as any).worldZoom = 1;
    (component as any).projectionCenterX = 1000;
    (component as any).projectionCenterY = 1000;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const draw = spyOn(component as any, "drawImportedMissileFrame");
    const drawsId = (id: string): boolean => draw.calls.allArgs().some((args) => args[1] === id);

    (component as any).diabloThunderEffects = [
      { x: 100, y: 100, dirX: 1, dirY: 0, length: 300, time: 0.1, duration: 1, seed: 1 },
    ];
    (component as any).playerBonePrisonRemaining = 1;
    (component as any).drawDiabloEffects({} as any);
    expect(drawsId("d2-diablolightning")).toBeTrue();
    expect(drawsId("d2-boneshield")).toBeTrue();

    draw.calls.reset();
    (component as any).diabloThunderEffects = [];
    (component as any).playerBonePrisonRemaining = 0;
    (component as any).diabloFireNovaEffects = [
      { x: 100, y: 100, time: 0.5, duration: 2, maxRadius: 80, seed: 0 },
    ];
    (component as any).drawDiabloFireEffects({} as any, 1);
    expect(drawsId("d2-groundfiremedium")).toBeTrue();
    expect(drawsId("d2-firenova")).toBeTrue();

    draw.calls.reset();
    (component as any).mephistoBlizzards = [
      { x: 100, y: 100, radius: 50, time: 0.5, duration: 2, seed: 0 },
    ];
    (component as any).drawMephistoEffects({} as any);
    expect(drawsId("d2-blizzard")).toBeTrue();

    draw.calls.reset();
    (component as any).baalWaveEffects = [
      { x: 100, y: 100, dirX: 1, dirY: 0, speed: 100, maxDistance: 200, time: 0.5, duration: 2, seed: 0 },
    ];
    (component as any).baalTentacleEffects = [
      { time: 0.4, duration: 2, tentacles: [{ x: 120, y: 120, delay: 0.2, seed: 0 }] },
    ];
    (component as any).drawBaalEffects({} as any);
    expect(drawsId("d2-shockwave")).toBeTrue();
    expect(drawsId("d2-baalsummonmissile2")).toBeTrue();
  });

  it("charges toward a distant hero without dealing damage", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const diablo = {
      kind: "boss", species: "diablo", campaignBoss: true, spriteFrame: 0,
      x: 850, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
    } as any;
    component.enemies = [diablo];

    component.updateEnemies(16);
    const chargeStartX = diablo.x;
    expect(diablo.diabloChargeRemaining).toBeGreaterThan(0);
    expect(component.playerHp).toBe(1000);

    component.updateEnemies(500);
    expect(chargeStartX - diablo.x).toBeGreaterThan(40);
    expect(component.playerHp).toBe(1000);
  });

  it("slows the chilled player's movement", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerBonePrisonRemaining = 0;
    (component as any).playerAttackLockRemaining = 0;
    (component as any).playerChilledRemaining = 2;
    component.keysDown.add("d");

    component.movePlayer(100);
    const chilledStep = (component as any).playerMoveX;
    (component as any).playerChilledRemaining = 0;
    component.movePlayer(100);
    const normalStep = (component as any).playerMoveX;

    expect(chilledStep).toBeGreaterThan(0);
    expect(chilledStep).toBeCloseTo(normalStep * 0.5, 5);
    component.keysDown.delete("d");
  });

  it("erupts Baal's tentacles around the player after a ground warning", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 430, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 0,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    const effects = (component as any).baalTentacleEffects as any[];
    expect(effects).toHaveSize(1);
    expect(effects[0].tentacles).toHaveSize(3);
    expect(component.playerHp).toBe(1000);

    (component as any).updateBaalEffects(0.45);
    expect(component.playerHp).toBeLessThan(1000);
    expect((component as any).playerAttackLockRemaining).toBeGreaterThan(0);

    // The eruption stays where it was telegraphed; moving clear avoids the rest.
    const hpAfterFirstStrike = component.playerHp;
    component.playerY = 420;
    (component as any).updateBaalEffects(0.4);
    expect(component.playerHp).toBe(hpAfterFirstStrike);
    expect(baal.attackAnimationTime).toBeGreaterThan(0);
  });

  it("sends Baal's energy wave forward and lets the player dodge it", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 1,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    const effects = (component as any).baalWaveEffects as any[];
    expect(effects).toHaveSize(1);
    expect(effects[0].dirX).toBeLessThan(0);
    expect(component.playerHp).toBe(1000);

    (component as any).updateBaalEffects(0.3);
    expect(component.playerHp).toBe(1000);
    (component as any).updateBaalEffects(0.45);
    expect(component.playerHp).toBeLessThan(1000);
    const hpAfterWave = component.playerHp;
    (component as any).updateBaalEffects(0.4);
    expect(component.playerHp).toBe(hpAfterWave);

    // A fresh wave keeps its cast direction; stepping wide avoids it entirely.
    (component as any).castBaalWave(baal);
    component.playerY = 430;
    const dodgedHp = component.playerHp;
    (component as any).updateBaalEffects(0.6);
    expect(component.playerHp).toBe(dodgedHp);
  });

  it("unleashes Baal's Hoarfrost as a multi-hit V that chills and knocks the hero back", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 2,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    const effects = (component as any).baalHoarfrostEffects as any[];
    expect(effects).toHaveSize(1);
    expect(effects[0].waveHits).toHaveSize(4);
    (component as any).updateBaalEffects(0.8);
    expect(component.playerHp).toBeLessThan(1000);
    expect((component as any).playerChilledRemaining).toBeGreaterThan(0);
    expect(effects[0].waveHits.filter(Boolean).length).toBeGreaterThan(1);
  });

  it("sweeps the chamber with Baal's Incineration Nova fireball ring", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 3,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    const effects = (component as any).baalNovaEffects as any[];
    expect(effects).toHaveSize(1);
    expect(effects[0].maxRadius).toBeGreaterThan(600);
    (component as any).updateBaalEffects(0.22);
    expect(component.playerHp).toBeLessThan(1000);
    const hpAfterRing = component.playerHp;
    (component as any).updateBaalEffects(0.35);
    expect(component.playerHp).toBe(hpAfterRing);
  });

  it("drains half of the hero's current mana with Baal's Mana Rift", () => {
    component.runActive = true;
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    component.playerMana = 40;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 4,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    const effects = (component as any).baalManaRiftEffects as any[];
    expect(effects).toHaveSize(1);
    expect(effects[0].targetX).toBeCloseTo(component.playerX, 5);
    expect(component.playerMana).toBe(20);
    expect(component.playerHp).toBe(1000);
  });

  it("summons a Vile Effigy that shares Baal's health percentage and takes extra damage", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 5,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    const clone = component.enemies.find((enemy: any) => enemy.baalClone) as any;
    expect(clone).toBeDefined();
    expect(clone.baalOriginal).toBe(baal);
    expect(clone.hp / clone.maxHp).toBeCloseTo(baal.hp / baal.maxHp, 5);
    (component as any).queueEnemyDamage(clone, 100, "#fff0a8");
    (component as any).flushPendingDamage();
    expect(baal.hp).toBe(9850);
    expect(clone.hp / clone.maxHp).toBeCloseTo(baal.hp / baal.maxHp, 5);
  });

  it("applies Blood Mana only when maximum mana meets maximum life and charges health per spell", () => {
    component.runActive = true;
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    component.playerMaxMana = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 6,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);
    expect((component as any).playerBloodManaRemaining).toBeGreaterThan(0);
    (component as any).payBloodManaCost();
    expect(component.playerHp).toBe(980);

    (component as any).playerBloodManaRemaining = 0;
    component.playerHp = 1000;
    (component as any).payBloodManaCost();
    expect(component.playerHp).toBe(1000);
  });

  it("lowers defense with Baal's Defense Curse", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).equipmentStatTotal = (key: string) => key === "armor" ? 200 : 0;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 7,
    } as any;
    component.enemies = [baal];
    expect(component.equippedArmor).toBe(200);

    component.updateEnemies(16);

    expect((component as any).playerDefenseCurseRemaining).toBeGreaterThan(0);
    expect(component.equippedArmor).toBe(70);
  });

  it("slows movement and increases damage taken with Decrepify", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    (component as any).playerBonePrisonRemaining = 0;
    (component as any).playerAttackLockRemaining = 0;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 8,
    } as any;
    component.enemies = [baal];
    component.keysDown.add("d");
    component.movePlayer(100);
    const normalStep = (component as any).playerMoveX;

    component.updateEnemies(16);
    expect((component as any).playerDecrepifyRemaining).toBeGreaterThan(0);
    component.movePlayer(100);
    const cursedStep = (component as any).playerMoveX;
    expect(cursedStep).toBeCloseTo(normalStep * 0.55, 5);
    const before = component.playerHp;
    component.playerHp -= (component as any).applyIncomingDamage(100, baal);
    expect(before - component.playerHp).toBeGreaterThan(0);
    component.keysDown.delete("d");
  });

  it("teleports Baal away from the hero and alternates a heavy Destructive Strike in melee", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const baal = {
      kind: "boss", species: "baal", campaignBoss: true, spriteFrame: 0,
      x: 480, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
      baalSpellCycle: 9,
    } as any;
    component.enemies = [baal];

    component.updateEnemies(16);

    expect(baal.x).not.toBe(480);
    expect(Math.hypot(baal.x - component.playerX, baal.y - component.playerY)).toBeGreaterThan(200);
    expect((component as any).baalCastEffects.filter((effect: any) => effect.kind === "teleport")).toHaveSize(2);

    baal.x = component.playerX + 50;
    baal.y = component.playerY;
    baal.cd = 0;
    baal.attackAnimationTime = 0;
    baal.baalSpellCycle = 0;
    component.playerHp = 1000;
    component.updateEnemies(16);
    expect(component.playerHp).toBeLessThan(1000);
  });

  it("hurls Mephisto's Lightning at the player", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const mephisto = {
      kind: "boss", species: "mephisto", campaignBoss: true, spriteFrame: 0,
      x: 470, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
    } as any;
    component.enemies = [mephisto];
    component.attackProjectiles = [];

    component.updateEnemies(16);

    const bolt = component.attackProjectiles[0];
    expect(bolt).toBeDefined();
    expect(bolt.missileId).toBe("d2-lightningbolt");
    expect(bolt.kind).toBe("lightning");
    expect(bolt.damageType).toBe("lightning");
    expect(bolt.targetPlayer).toBeTrue();
    const hpBeforeHit = component.playerHp;

    (component as any).updateAttackProjectiles(2000);

    expect(component.playerHp).toBeLessThan(hpBeforeHit);
    expect(mephisto.attackAnimationTime).toBeGreaterThan(0);
  });

  it("freezes the hero with Mephisto's close-range chilling strike", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const mephisto = {
      kind: "boss", species: "mephisto", campaignBoss: true, spriteFrame: 0,
      x: 290, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
    } as any;
    component.enemies = [mephisto];

    component.updateEnemies(16);

    expect(component.playerHp).toBeLessThan(1000);
    expect((component as any).playerFrozenRemaining).toBeGreaterThan(0);
    expect((component as any).playerChilledRemaining).toBeGreaterThan(0);
    expect(mephisto.attackAnimationTime).toBeGreaterThan(0);

    component.keysDown.add("d");
    const frozenX = component.playerX;
    component.movePlayer(100);
    expect(component.playerX).toBe(frozenX);

    const frozenTargetHp = mephisto.hp;
    (component as any).attackCooldown = 0;
    component.attackNearestEnemy();
    expect(mephisto.hp).toBe(frozenTargetHp);
  });

  it("cycles Mephisto through every ranged and special spell", () => {
    component.runActive = true;
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const mephisto = {
      kind: "boss", species: "mephisto", campaignBoss: true, spriteFrame: 0,
      x: 450, y: 250, hp: 10000, maxHp: 10000, speed: 90, r: 34, dmg: 40, cd: 0,
    } as any;
    component.enemies = [mephisto];

    mephisto.mephistoSpellCycle = 1;
    component.updateEnemies(16);
    expect(component.attackProjectiles).toHaveSize(5);
    expect(component.attackProjectiles.every((shot) => shot.missileId === "d2-chargedbolt")).toBeTrue();
    expect(component.attackProjectiles.every((shot) => shot.damageType === "lightning")).toBeTrue();

    mephisto.cd = 0;
    mephisto.attackAnimationTime = 0;
    mephisto.mephistoSpellCycle = 2;
    component.updateEnemies(16);
    const blizzards = (component as any).mephistoBlizzards as any[];
    expect(blizzards).toHaveSize(1);
    const hpBeforeBlizzard = component.playerHp;
    (component as any).updateMephistoBlizzards(0.3);
    expect(component.playerHp).toBeLessThan(hpBeforeBlizzard);
    expect((component as any).playerChilledRemaining).toBeGreaterThan(0);

    mephisto.cd = 0;
    mephisto.attackAnimationTime = 0;
    mephisto.mephistoSpellCycle = 3;
    component.attackProjectiles = [];
    component.updateEnemies(16);
    const skull = component.attackProjectiles[0];
    expect(skull.missileId).toBe("d2-mephistomissile");
    expect(skull.cold).toBeTrue();
    expect(skull.damageType).toBe("cold");
    const hpBeforeSkull = component.playerHp;
    (component as any).updateAttackProjectiles(2000);
    expect(component.playerHp).toBeLessThan(hpBeforeSkull);
    expect((component as any).playerChilledRemaining).toBeGreaterThan(0);

    mephisto.cd = 0;
    mephisto.attackAnimationTime = 0;
    mephisto.mephistoSpellCycle = 4;
    const hpBeforeFrostNova = component.playerHp;
    component.updateEnemies(16);
    expect(component.playerHp).toBeLessThan(hpBeforeFrostNova);
    expect(((component as any).skillVisualEffects as any[]).some((effect) => effect.frostNova)).toBeTrue();

    mephisto.cd = 0;
    mephisto.attackAnimationTime = 0;
    mephisto.mephistoSpellCycle = 5;
    (component as any).poisonClouds = [];
    component.updateEnemies(16);
    const poisonNova = ((component as any).poisonClouds as any[])[0];
    expect(poisonNova.targetPlayer).toBeTrue();
    expect(poisonNova.growPerSecond).toBeGreaterThan(0);

    // It crawls outward instead of matching the Necromancer's instant ring.
    const startRadius = poisonNova.radius;
    component.playerX = 470;
    (component as any).updatePoisonClouds(1);
    expect(poisonNova.radius).toBeGreaterThan(startRadius);
    expect((component as any).playerPoisonRemaining).toBeGreaterThan(0);
  });

  it("uses each enemy shooter's original Diablo II missile art", () => {
    component.playerX = 250;
    component.playerY = 250;
    const cases = [
      { species: "fetishShaman", x: 340, missileId: "d2-shamanfireball", sourceOnlyArt: undefined },
      { species: "spikeFiend", x: 430, missileId: "d2-spikefiendmissle", sourceOnlyArt: true },
    ];

    for (const { species, x, missileId, sourceOnlyArt } of cases) {
      const enemy = {
        kind: "normal", species, spriteFrame: 0, x, y: 250,
        hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 2, cd: 0,
      } as any;
      component.enemies = [enemy];
      component.attackProjectiles = [];

      component.updateEnemies(16);

      expect(component.attackProjectiles[0]?.missileId).toBe(missileId);
      expect(component.attackProjectiles[0]?.sourceOnlyArt).toBe(sourceOnlyArt);
    }
  });

  it("leaves the original BoneSpearTrail puffs behind the Bone Spear", () => {
    component.selectedClass = "necromancer";
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Bone Spear"];
    component.skillLevels = { "Bone Spear": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Bone Spear");

    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    const spear = component.attackProjectiles[0];
    expect(spear.missileId).toBe("d2-bonespear");
    // The spear itself is drawn from its own cel; the trail is its own missile.
    expect(spear.sourceOnlyArt).toBeTrue();
    // Bone Spear is deliberately quicker than the generic 420 missile speed.
    expect(spear.speed).toBeGreaterThan(420);

    for (let frame = 0; frame < 10; frame += 1) (component as any).updateAttackProjectiles(16);
    const puffs = component.attackProjectiles.filter((projectile) => projectile.missileId === "d2-bonespeartrail");
    expect(puffs.length).toBeGreaterThan(0);
    for (const puff of puffs) {
      expect(puff.cosmeticTrail).toBeTrue();
      expect(puff.speed).toBe(0);
      expect(puff.damage).toBe(0);
    }
    expect(target.hp).toBe(1000);
  });

  it("retargets a Bone Spirit to the nearest living monster when its target dies in flight", () => {
    component.selectedClass = "necromancer";
    component.playerX = 100;
    component.playerY = 250;
    component.ownedSkills = ["Bone Spirit"];
    component.skillLevels = { "Bone Spirit": 1 };
    const marked = { kind: "normal", species: "fallen", spriteFrame: 0, x: 220, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    const replacement = { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 170, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [marked, replacement];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Bone Spirit");

    const spirit = component.attackProjectiles.find((projectile) => projectile.missileId === "d2-bonespirit");
    expect(spirit).toBeDefined();
    expect(spirit!.target).toBe(marked);

    marked.hp = 0;
    (component as any).updateAttackProjectiles(16);

    expect(spirit!.target).toBe(replacement);
    expect(spirit!.targetX).toBe(replacement.x);
    expect(spirit!.targetY).toBe(replacement.y);

    for (let frame = 0; frame < 220; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();
    expect(replacement.hp).toBeLessThan(1000);
  });

  it("draws the original base-item art and falls back to equipment art for names this game added", () => {
    const imageFor = (name: string, slot: "weapon" | "armor" | "charm" | "belt", equipmentType?: string) =>
      component.inventoryItemImage({ name, slot, equipmentType } as any);

    expect(imageFor("Short Sword", "weapon")).toBe("assets/d2survivors/items/d2/invssd.png");
    expect(imageFor("Bone Wand", "weapon")).toBe("assets/d2survivors/items/d2/invbwn.png");
    expect(imageFor("Kris", "weapon")).toBe("assets/d2survivors/items/d2/invkrs.png");
    expect(component.inventoryItemImage({
      name: "Cruel Kris of Quickness", baseName: "Kris", slot: "weapon",
    } as any)).toBe("assets/d2survivors/items/d2/invkrs.png");
    expect(imageFor("Staff", "weapon")).toBe("assets/d2survivors/items/d2/invsst.png");
    expect(component.inventoryItemImage({
      name: "Fine Staff", baseName: "Staff", slot: "weapon",
    } as any)).toBe("assets/d2survivors/items/d2/invsst.png");
    expect(imageFor("Leather Cap", "armor")).toBe("assets/d2survivors/items/d2/invcap.png");
    expect(imageFor("Chain Hauberk", "armor")).toBe("assets/d2survivors/items/d2/invchn.png");
    expect(imageFor("Battle Axe", "weapon")).toBe("assets/d2survivors/items/d2/invbtx.png");
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

  it("uses the close-cropped hair layer under low caps", () => {
    for (const id of ["cap", "skull"] as const) {
      expect(D2_HELMET_VISUALS[id].hair).toBe("full");
    }
  });

  it("keeps a cap upright and its lift vertical on a quarter-turned head bind", () => {
    // Necromancer/Barbarian/Sorceress/Assassin bind the head with local Y
    // pointing forward instead of up, so the mount must cancel that basis.
    const turnedBind = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5);
    const turnedSeat = helmetSeatOffset(D2_HELMET_VISUALS.cap, turnedBind);
    expect(turnedSeat.x).toBeCloseTo(D2_HELMET_VISUALS.cap.lift);
    expect(turnedSeat.y).toBeCloseTo(0.0003);
    expect(turnedSeat.z).toBeCloseTo(0);

    const upright = turnedBind.clone().multiply(helmetMountQuaternion(turnedBind));
    expect(upright.angleTo(new THREE.Quaternion())).toBeCloseTo(0);

    // Standard-basis rigs keep the original seat.
    const standardSeat = helmetSeatOffset(D2_HELMET_VISUALS.cap, new THREE.Quaternion());
    expect(standardSeat.x).toBeCloseTo(0);
    expect(standardSeat.y).toBeCloseTo(D2_HELMET_VISUALS.cap.lift);
    expect(standardSeat.z).toBeCloseTo(0.0003);
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

    expect((component as any).itemSize(found.get("Large Charm"))).toEqual({ width: 1, height: 2 });
    expect((component as any).itemSize(found.get("Grand Charm"))).toEqual({ width: 1, height: 3 });
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

  it("uses a one-column, two-row inventory footprint for Eagle Orbs", () => {
    const eagle = {
      id: "eagle-orb", name: "Eagle Orb", baseName: "Eagle Orb", rarity: "normal",
      slot: "weapon", equipmentType: "orb", width: 1, height: 3, desc: "An eagle orb.", stats: {},
    } as any;
    expect((component as any).itemSize(eagle)).toEqual({ width: 1, height: 2 });
  });

  it("uses a one-column, two-row inventory footprint for Sacred Globes", () => {
    const globe = {
      id: "sacred-globe", name: "Sacred Globe", baseName: "Sacred Globe", rarity: "normal",
      slot: "weapon", equipmentType: "orb", width: 1, height: 3, desc: "A sacred globe.", stats: {},
    } as any;
    expect((component as any).itemSize(globe)).toEqual({ width: 1, height: 2 });
  });

  it("uses a one-column, two-row inventory footprint for Clasped Orbs", () => {
    for (const name of ["Clasped Orb", "Cruel Clasped Orb of Quickness"]) {
      const orb = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: "Clasped Orb", rarity: "normal",
        slot: "weapon", equipmentType: "orb", width: 1, height: 3, desc: "A clasped orb.", stats: {},
      } as any;
      expect((component as any).itemSize(orb)).toEqual({ width: 1, height: 2 });
    }
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

  it("uses D2's narrow and tall dagger footprints", () => {
    const cases: Record<string, { width: number; height: number }> = {
      Dagger: { width: 1, height: 2 },
      Poignard: { width: 1, height: 2 },
      "Bone Knife": { width: 1, height: 2 },
      Dirk: { width: 1, height: 2 },
      Rondel: { width: 1, height: 2 },
      "Mithril Point": { width: 1, height: 2 },
      Kris: { width: 1, height: 3 },
      Kriss: { width: 1, height: 3 },
      Blade: { width: 1, height: 3 },
      Cinquedeas: { width: 1, height: 3 },
      Stilleto: { width: 1, height: 3 },
      "Fanged Knife": { width: 1, height: 3 },
      "Legend Spike": { width: 1, height: 3 },
    };
    for (const [base, expected] of Object.entries(cases)) {
      for (const variant of [
        { name: base, rarity: "normal" },
        { name: `Cruel ${base} of Quickness`, rarity: "rare" },
        { name: `${base} Relic`, rarity: "unique", width: 2, height: 3 },
      ]) {
        const dagger = {
          id: variant.name.toLowerCase().replace(/\s+/g, "-"), ...variant, baseName: base,
          slot: "weapon", equipmentType: "weapon", desc: "A dagger.", stats: {},
        } as any;
        expect((component as any).itemSize(dagger)).withContext(variant.name)
          .toEqual(expected);
      }
    }

    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = {
      id: "dagger-grid", name: "Dagger", baseName: "Dagger", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", desc: "A dagger.", stats: {},
    } as any;
    (component as any).rebuildInventoryGrid();
    const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
    expect(component.inventoryGridStyle(cell)).toEqual({ gridColumn: "1 / span 1", gridRow: "1 / span 2" });
  });

  it("uses a two-column, three-row inventory footprint for Broad Swords and Short Bows", () => {
    for (const baseName of ["Broad Sword", "Short Bow"]) {
      for (const variant of [
        { name: baseName, rarity: "normal" },
        { name: `Cruel ${baseName} of Quickness`, rarity: "rare" },
        { name: `${baseName} Relic`, rarity: "unique", width: 2, height: 4 },
      ]) {
        const item = {
          id: variant.name.toLowerCase().replace(/\s+/g, "-"), ...variant, baseName,
          slot: "weapon", equipmentType: "weapon", desc: baseName === "Short Bow" ? "A bow." : "A sword.", stats: {},
        } as any;
        expect((component as any).itemSize(item)).withContext(variant.name)
          .toEqual({ width: 2, height: 3 });
      }

      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[0] = {
        id: `${baseName}-grid`, name: baseName, baseName, rarity: "normal",
        slot: "weapon", equipmentType: "weapon", desc: `A ${baseName}.`, stats: {},
      } as any;
      (component as any).rebuildInventoryGrid();
      const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
      expect(component.inventoryGridStyle(cell)).withContext(baseName)
        .toEqual({ gridColumn: "1 / span 2", gridRow: "1 / span 3" });
    }
  });

  it("uses a one-column, four-row inventory footprint for Harpoons", () => {
    for (const name of ["Harpoon", "Winged Harpoon", "Cruel Harpoon of Quickness"]) {
      const harpoon = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: "Harpoon", rarity: "normal",
        slot: "weapon", desc: "A long throwing spear.", stats: {},
      } as any;
      expect((component as any).itemSize(harpoon)).toEqual({ width: 1, height: 4 });
    }
  });

  it("uses a two-column, three-row inventory footprint for flails", () => {
    for (const base of ["Flail", "Knout", "Scourge", "Khalim's Flail"]) {
      for (const name of [base, `Cruel ${base} of Quickness`]) {
        const flail = {
          id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: base, rarity: "normal",
          slot: "weapon", desc: "A chained mace.", stats: {},
        } as any;
        expect((component as any).itemSize(flail)).toEqual({ width: 2, height: 3 });
      }
    }
  });

  it("uses the correct inventory footprints for throwing and balanced axes", () => {
    const throwingAxe = {
      id: "throwing-axe", name: "Throwing Axe", baseName: "Throwing Axe", rarity: "normal",
      slot: "weapon", desc: "A throwing axe.", stats: {},
    } as any;
    expect((component as any).itemSize(throwingAxe)).toEqual({ width: 1, height: 2 });

    const affixedThrowingAxe = {
      id: "affixed-throwing-axe", name: "Savage Throwing Axe of Haste",
      baseName: "Throwing Axe", rarity: "rare", slot: "weapon",
      desc: "A throwing axe.", stats: {},
    } as any;
    expect((component as any).itemSize(affixedThrowingAxe)).toEqual({ width: 1, height: 2 });

    for (const name of ["Balanced Axe", "Savage Balanced Axe of Haste"]) {
      const axe = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: "Balanced Axe", rarity: "normal",
        slot: "weapon", desc: "A throwing axe tuned for a clean spin.", stats: {},
      } as any;
      expect((component as any).itemSize(axe)).toEqual({ width: 2, height: 3 });
    }
  });

  it("uses a two-column, three-row inventory footprint for the Axe base", () => {
    const axe = {
      id: "axe", name: "Axe", baseName: "Axe", rarity: "normal",
      slot: "weapon", desc: "A reliable one-handed axe.", stats: {},
    } as any;
    expect((component as any).itemSize(axe)).toEqual({ width: 2, height: 3 });
    expect((component as any).itemSize({ ...axe, name: "Savage Axe of Haste", rarity: "rare" }))
      .toEqual({ width: 2, height: 3 });

    const deathspade = D2_UNIQUE_ITEMS.find((item) => item.baseName === "Axe")!;
    expect((component as any).itemSize((component as any).createNamedItem(deathspade, "unique")))
      .toEqual({ width: 2, height: 3 });
  });

  it("uses a one-column, four-row inventory footprint for Battle Staffs", () => {
    const staff = {
      id: "battle-staff", name: "Battle Staff", baseName: "Battle Staff", rarity: "normal",
      slot: "weapon", desc: "A staff reinforced for close combat.", stats: {},
    } as any;
    expect((component as any).itemSize(staff)).toEqual({ width: 1, height: 4 });
    expect((component as any).itemSize({ ...staff, name: "Savage Battle Staff of Haste", rarity: "rare" }))
      .toEqual({ width: 1, height: 4 });

    const setStaff = D2_SET_ITEMS.find((item) => item.baseName === "Battle Staff")!;
    expect((component as any).itemSize((component as any).createNamedItem(setStaff, "set")))
      .toEqual({ width: 1, height: 4 });
  });

  it("uses a 2x4 inventory footprint for Great Swords", () => {
    for (const name of ["Great Sword", "Cruel Great Sword of Swiftness"]) {
      const sword = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: "Great Sword", rarity: "normal",
        slot: "weapon", equipmentType: "weapon", desc: "A great sword.", stats: {},
      } as any;
      expect((component as any).itemSize(sword)).toEqual({ width: 2, height: 4 });
    }
  });

  it("uses D2's 2x4 and 2x3 maul footprints", () => {
    const cases: Record<string, { width: number; height: number }> = {
      Maul: { width: 2, height: 4 },
      "Ogre Maul": { width: 2, height: 4 },
      "Great Maul": { width: 2, height: 3 },
      "Thunder Maul": { width: 2, height: 3 },
    };
    for (const [base, expected] of Object.entries(cases)) {
      for (const name of [base, `Cruel ${base} of Swiftness`]) {
        const maul = {
          id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: base, rarity: "normal",
          slot: "weapon", equipmentType: "weapon", desc: "A maul.", stats: {},
        } as any;
        expect((component as any).itemSize(maul)).withContext(name).toEqual(expected);
      }
    }
  });

  it("keeps every unique and set item on its base's centralized D2 footprint", () => {
    for (const named of [...D2_UNIQUE_ITEMS, ...D2_SET_ITEMS]) {
      const expected = { width: named.width, height: named.height };
      const baseSize = getD2BaseItemFootprint(named.baseName);
      expect(baseSize).withContext(`${named.name} base ${named.baseName}`).toEqual(expected);

      const item = (component as any).createNamedItem(named, named.rarity);
      expect((component as any).itemSize(item)).withContext(named.name).toEqual(expected);
    }
  });

  it("covers every base used outside the named catalogues", () => {
    const cases: Array<[string, number, number]> = [
      ["Throwing Knife", 1, 2], ["Throwing Axe", 1, 2], ["Balanced Knife", 1, 2], ["Balanced Axe", 2, 3],
      ["Glaive", 1, 4], ["Javelin", 1, 3], ["War Javelin", 1, 3], ["Pilum", 1, 3], ["Harpoon", 1, 4],
      ["Leather Cap", 2, 2], ["Chain Hauberk", 2, 3], ["Kris", 1, 3], ["Mithril Point", 1, 2], ["Staff", 1, 3],
      ["Barbarian Battle Axe", 2, 3], ["Barbarian Great Sword", 2, 4], ["Barbarian Throwing Axe", 1, 2],
      ["Crimson Small Charm", 1, 1], ["Azure Small Charm", 1, 1], ["Gold Amulet", 1, 1],
      ["Ring of the Artisan", 1, 1], ["Soulstone Shard", 1, 1],
      ["Katar", 1, 3], ["Wrist Blade", 1, 3], ["Hatchet Hands", 1, 3], ["Cestus", 1, 3], ["Claws", 1, 3],
      ["Blade Talons", 1, 3], ["Scissors Katar", 1, 3],
      ["Jawbone Cap", 2, 2], ["Fanged Helm", 2, 2], ["Horned Helm", 2, 2], ["Assault Helmet", 2, 2], ["Avenger Guard", 2, 2],
      ["Wolf Head", 2, 2], ["Hawk Helm", 2, 2], ["Antlers", 2, 2], ["Falcon Mask", 2, 2], ["Spirit Mask", 2, 2],
      ["Targe", 2, 2], ["Rondache", 2, 2], ["Heraldic Shield", 2, 4], ["Aerin Shield", 2, 4], ["Crown Shield", 2, 2],
      ["Eagle Orb", 1, 2], ["Sacred Globe", 1, 2], ["Smoked Sphere", 1, 2], ["Clasped Orb", 1, 2], ["Jared's Stone", 1, 3],
      ["Preserved Head", 2, 2], ["Zombie Head", 2, 2], ["Unraveller Head", 2, 2], ["Gargoyle Head", 2, 2], ["Demon Head", 2, 2],
    ];

    for (const [baseName, width, height] of cases) {
      const expected = { width, height };
      expect(getD2BaseItemFootprint(baseName)).withContext(baseName).toEqual(expected);
      expect((component as any).itemSize({ baseName } as any)).withContext(baseName).toEqual(expected);
    }
  });

  it("uses a 1x4 inventory footprint for Claymores", () => {
    for (const name of ["Claymore", "Cruel Claymore of Swiftness"]) {
      const sword = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: "Claymore", rarity: "normal",
        slot: "weapon", equipmentType: "weapon", desc: "A claymore.", stats: {},
      } as any;
      expect((component as any).itemSize(sword)).toEqual({ width: 1, height: 4 });
    }
    const unique = {
      id: "the-grim-reaper", name: "The Grim Reaper", baseName: "Claymore", rarity: "unique",
      slot: "weapon", equipmentType: "weapon", width: 2, height: 4, desc: "A unique claymore.", stats: {},
    } as any;
    expect((component as any).itemSize(unique)).toEqual({ width: 1, height: 4 });
  });

  it("uses a 2x3 inventory footprint for Military Picks", () => {
    for (const name of ["Military Pick", "Cruel Military Pick of Swiftness"]) {
      const pick = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: "Military Pick", rarity: "normal",
        slot: "weapon", equipmentType: "weapon", desc: "A military pick.", stats: {},
      } as any;
      expect((component as any).itemSize(pick)).toEqual({ width: 2, height: 3 });
    }
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

  it("uses a 2x4 inventory footprint for Gothic Shields", () => {
    for (const item of [
      { name: "Gothic Shield", baseName: "Gothic Shield", rarity: "normal", width: undefined, height: undefined },
      { name: "Gothic Shield of Deflecting", baseName: "Gothic Shield", rarity: "magic", width: undefined, height: undefined },
      { name: "The Ward", baseName: "Gothic Shield", rarity: "unique", width: 2, height: 2 },
      { name: "Isenhart's Parry", baseName: "Gothic Shield", rarity: "set", width: 2, height: 2 },
    ]) {
      const shield = {
        id: item.name.toLowerCase().replace(/\s+/g, "-"), ...item,
        slot: "armor", equipmentType: "shield", desc: "A Gothic Shield.", stats: {},
      } as any;
      expect((component as any).itemSize(shield)).withContext(item.name).toEqual({ width: 2, height: 4 });
    }

    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = {
      id: "gothic-shield-grid", name: "Gothic Shield", baseName: "Gothic Shield", rarity: "normal",
      slot: "armor", equipmentType: "shield", desc: "A Gothic Shield.", stats: {},
    } as any;
    (component as any).rebuildInventoryGrid();
    const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
    expect(component.inventoryGridStyle(cell)).toEqual({ gridColumn: "1 / span 2", gridRow: "1 / span 4" });
  });

  it("uses a 2x3 inventory footprint for Tower and Kite Shields", () => {
    const variants: Record<string, Array<{ name: string; rarity: string; width?: number; height?: number }>> = {
      "Tower Shield": [
        { name: "Tower Shield", rarity: "normal" },
        { name: "Tower Shield of Deflecting", rarity: "magic" },
        { name: "Bverrit Keep", rarity: "unique", width: 2, height: 2 },
        { name: "Sigon's Guard", rarity: "set", width: 2, height: 2 },
      ],
      "Kite Shield": [
        { name: "Kite Shield", rarity: "normal" },
        { name: "Kite Shield of Deflecting", rarity: "magic" },
        { name: "Steelclash", rarity: "unique", width: 2, height: 2 },
        { name: "Milabrega's Orb", rarity: "set", width: 2, height: 2 },
      ],
    };
    for (const [baseName, items] of Object.entries(variants)) {
      for (const item of items) {
        const shield = {
          id: item.name.toLowerCase().replace(/\s+/g, "-"), ...item, baseName,
          slot: "armor", equipmentType: "shield", desc: `A ${baseName}.`, stats: {},
        } as any;
        expect((component as any).itemSize(shield)).withContext(item.name).toEqual({ width: 2, height: 3 });
      }

      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[0] = {
        id: `${baseName}-grid`, name: baseName, baseName, rarity: "normal",
        slot: "armor", equipmentType: "shield", desc: `A ${baseName}.`, stats: {},
      } as any;
      (component as any).rebuildInventoryGrid();
      const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
      expect(component.inventoryGridStyle(cell)).withContext(baseName)
        .toEqual({ gridColumn: "1 / span 2", gridRow: "1 / span 3" });
    }
  });

  it("uses a 2x4 inventory footprint for the trident family", () => {
    for (const item of [
      { name: "Trident", baseName: "Trident", rarity: "normal" },
      { name: "Cruel Trident of Quickness", baseName: "Trident", rarity: "magic" },
      { name: "Kelpie Snare", baseName: "Fuscina", rarity: "unique", width: 2, height: 4 },
      { name: "Razortine", baseName: "Trident", rarity: "unique", width: 2, height: 4 },
    ]) {
      const trident = {
        id: item.name.toLowerCase().replace(/\s+/g, "-"), ...item,
        slot: "weapon", equipmentType: "weapon", desc: "A trident.", stats: {},
      } as any;
      expect((component as any).itemSize(trident)).withContext(item.name).toEqual({ width: 2, height: 4 });
    }

    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = {
      id: "trident-grid", name: "Trident", baseName: "Trident", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", desc: "A trident.", stats: {},
    } as any;
    (component as any).rebuildInventoryGrid();
    const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
    expect(component.inventoryGridStyle(cell)).toEqual({ gridColumn: "1 / span 2", gridRow: "1 / span 4" });
  });

  it("uses D2's spear and throwing-spear footprints", () => {
    for (const [item, expected] of [
      [{ name: "Spear", baseName: "Spear", rarity: "normal", width: undefined, height: undefined }, { width: 2, height: 4 }],
      [{ name: "War Spear of Quickness", baseName: "War Spear", rarity: "magic", width: 1, height: 3 }, { width: 2, height: 4 }],
      [{ name: "The Dragon Chang", baseName: "Spear", rarity: "unique", width: 2, height: 4 }, { width: 2, height: 4 }],
      [{ name: "The Impaler", baseName: "War Spear", rarity: "unique", width: 1, height: 3 }, { width: 2, height: 4 }],
      [{ name: "Arioc's Needle", baseName: "Hyperion Spear", rarity: "unique", width: 2, height: 4 }, { width: 2, height: 4 }],
      [{ name: "Stoneraven", baseName: "Matriarchal Spear", rarity: "unique", width: 2, height: 4 }, { width: 2, height: 4 }],
      [{ name: "Demon's Arch", baseName: "Balrog Spear", rarity: "unique", width: 1, height: 3 }, { width: 1, height: 3 }],
    ] as const) {
      const spear = {
        id: item.name.toLowerCase().replace(/\s+/g, "-"), ...item,
        slot: "weapon", equipmentType: "weapon", desc: "A spear.", stats: {},
      } as any;
      expect((component as any).itemSize(spear)).withContext(item.name).toEqual(expected);
    }

    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = {
      id: "spear-grid", name: "Spear", baseName: "Spear", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", desc: "A spear.", stats: {},
    } as any;
    (component as any).rebuildInventoryGrid();
    const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
    expect(component.inventoryGridStyle(cell)).toEqual({ gridColumn: "1 / span 2", gridRow: "1 / span 4" });
  });

  it("uses a 1x4 inventory footprint for the glaive family", () => {
    for (const item of [
      { name: "Glaive", baseName: "Glaive", rarity: "normal", width: undefined, height: undefined },
      { name: "Cruel Glaive of Quickness", baseName: "Glaive", rarity: "magic", width: 2, height: 3 },
      { name: "Wraith Flight", baseName: "Ghost Glaive", rarity: "unique", width: 2, height: 3 },
    ]) {
      const glaive = {
        id: item.name.toLowerCase().replace(/\s+/g, "-"), ...item,
        slot: "weapon", equipmentType: "weapon", desc: "A glaive.", stats: {},
      } as any;
      expect((component as any).itemSize(glaive)).withContext(item.name).toEqual({ width: 1, height: 4 });
    }

    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = {
      id: "glaive-grid", name: "Glaive", baseName: "Glaive", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", desc: "A glaive.", stats: {},
    } as any;
    (component as any).rebuildInventoryGrid();
    const cell = component.inventoryGrid.find((entry) => entry.slotIndex === 0)!;
    expect(component.inventoryGridStyle(cell)).toEqual({ gridColumn: "1 / span 1", gridRow: "1 / span 4" });
  });

  it("uses a 1x3 inventory footprint for the spiked-club family", () => {
    for (const item of [
      { name: "Spiked Club", baseName: "Spiked Club", rarity: "normal", width: undefined, height: undefined },
      { name: "Spiked Club of Swiftness", baseName: "Spiked Club", rarity: "magic", width: undefined, height: undefined },
      { name: "Stoutnail", baseName: "Spiked Club", rarity: "unique", width: 2, height: 3 },
      { name: "Cruel Barbed Club of Quickness", baseName: "Barbed Club", rarity: "rare", width: 2, height: 3 },
      { name: "Fleshrender", baseName: "Barbed Club", rarity: "unique", width: 2, height: 3 },
      { name: "Truncheon", baseName: "Truncheon", rarity: "normal", width: 2, height: 3 },
      { name: "Nord's Tenderizer", baseName: "Truncheon", rarity: "unique", width: 2, height: 3 },
    ]) {
      const club = {
        id: item.name.toLowerCase().replace(/\s+/g, "-"), ...item,
        slot: "weapon", equipmentType: "weapon", desc: "A Spiked Club.", stats: {},
      } as any;
      expect((component as any).itemSize(club)).withContext(item.name).toEqual({ width: 1, height: 3 });
    }
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

  it("clears a stale browser selection before an inventory drag press", () => {
    const selection = {
      rangeCount: 1,
      removeAllRanges: jasmine.createSpy("removeAllRanges"),
    };
    spyOn(window, "getSelection").and.returnValue(selection as unknown as Selection);

    component.onInventoryMouseDown({ button: 0 } as MouseEvent);
    expect(selection.removeAllRanges).toHaveBeenCalledTimes(1);

    selection.rangeCount = 0;
    component.onInventoryMouseDown({ button: 2 } as MouseEvent);
    component.onInventoryMouseDown({ button: 0 } as MouseEvent);
    expect(selection.removeAllRanges).toHaveBeenCalledTimes(1);
  });

  it("uses only the dragged item art as the native inventory drag image", () => {
    const slot = document.createElement("div");
    const art = document.createElement("img");
    art.className = "d2s-inv-art";
    Object.defineProperty(art, "complete", { value: true });
    Object.defineProperty(art, "naturalWidth", { value: 16 });
    Object.defineProperty(art, "naturalHeight", { value: 68 });
    slot.appendChild(art);
    const item = {
      id: "drag-image-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", desc: "A sword.", stats: {},
    } as any;
    component.inventory = Array.from({ length: 40 }, () => null);
    component.inventory[0] = item;
    const transfer = jasmine.createSpyObj<DataTransfer>("DataTransfer", ["setData", "setDragImage"]);
    const event = {
      currentTarget: slot,
      dataTransfer: transfer,
      preventDefault: jasmine.createSpy("preventDefault"),
    } as unknown as DragEvent;

    component.startDrag(0, event);

    expect(component.dragState?.item).toBe(item);
    expect(transfer.setDragImage).toHaveBeenCalledWith(art, 8, 34);
    expect(transfer.setData).toHaveBeenCalledWith("text/plain", item.id);
  });

  it("long-presses a touch inventory item and drags it to another slot", () => {
    jasmine.clock().install();
    try {
      component.inventoryOpen = true;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[0] = {
        id: "mobile-ring", name: "Ring of the Artisan", baseName: "Ring of the Artisan",
        rarity: "normal", slot: "charm", equipmentType: "ring", desc: "A ring.", stats: {},
      } as any;
      (component as any).rebuildInventoryGrid();
      spyOn(component as any, "persistRunProgress");

      const source = document.createElement("div");
      const target = document.createElement("div");
      target.dataset["inventorySlot"] = "5";
      spyOn(document, "elementFromPoint").and.returnValue(target);
      const touchEvent = (x: number, y: number, pointerType = "touch") => ({
        pointerType, pointerId: 7, clientX: x, clientY: y, currentTarget: source,
        preventDefault: jasmine.createSpy("preventDefault"),
      }) as unknown as PointerEvent;

      component.onInventoryPointerDown(0, touchEvent(10, 10));
      jasmine.clock().tick(430);
      expect(component.mobileInventoryDrag?.sourceIndex).toBe(0);
      expect(component.selectedSlotIndex).toBe(0);

      component.onInventoryPointerMove(touchEvent(40, 30));
      expect(component.dragGhostSlotIndex).toBe(5);
      expect(component.inventoryDropPreview?.allowed).toBeTrue();

      component.onInventoryPointerUp(touchEvent(40, 30));
      expect(component.inventory[0]).toBeNull();
      expect(component.inventory[5]?.id).toBe("mobile-ring");
      expect(component.mobileInventoryDrag).toBeNull();
      expect(component.selectedSlotIndex).toBe(5);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("only starts the press-and-drag gesture for touch pointers", () => {
    jasmine.clock().install();
    try {
      component.inventoryOpen = true;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[0] = {
        id: "mouse-ring", name: "Ring of the Artisan", baseName: "Ring of the Artisan",
        rarity: "normal", slot: "charm", equipmentType: "ring", desc: "A ring.", stats: {},
      } as any;
      (component as any).rebuildInventoryGrid();
      const source = document.createElement("div");
      const event = {
        pointerType: "mouse", pointerId: 3, clientX: 10, clientY: 10, currentTarget: source,
        preventDefault: jasmine.createSpy("preventDefault"),
      } as unknown as PointerEvent;

      component.onInventoryPointerDown(0, event);
      jasmine.clock().tick(500);

      expect((component as any).mobileInventoryPress).toBeUndefined();
      expect(component.mobileInventoryDrag).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("cancels the touch hold when the finger moves before the long press completes", () => {
    jasmine.clock().install();
    try {
      component.inventoryOpen = true;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[0] = {
        id: "moving-ring", name: "Ring of the Artisan", baseName: "Ring of the Artisan",
        rarity: "normal", slot: "charm", equipmentType: "ring", desc: "A ring.", stats: {},
      } as any;
      (component as any).rebuildInventoryGrid();
      const source = document.createElement("div");
      const touchEvent = (x: number, y: number) => ({
        pointerType: "touch", pointerId: 9, clientX: x, clientY: y, currentTarget: source,
        preventDefault: jasmine.createSpy("preventDefault"),
      }) as unknown as PointerEvent;

      component.onInventoryPointerDown(0, touchEvent(10, 10));
      component.onInventoryPointerMove(touchEvent(28, 10));
      jasmine.clock().tick(500);

      expect((component as any).mobileInventoryPress).toBeUndefined();
      expect(component.mobileInventoryDrag).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("shows the imported unique and set cels for those rarities", () => {
    const imageFor = (name: string, baseName: string, rarity: "unique" | "set", slot = "weapon", equipmentType?: string) =>
      component.inventoryItemImage({ name, baseName, rarity, slot, equipmentType } as any);

    expect(imageFor("The Gnasher", "Hand Axe", "unique")).toBe("assets/d2survivors/items/d2/invhaxu.png");
    expect(imageFor("Rixot's Keen", "Short Sword", "unique")).toBe("assets/d2survivors/items/unique/rixot-s-keen.png");
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
    expect(groundFor("Battle Axe", "weapon")).toBe("assets/d2survivors/items/ground/flpbtx.png");
    expect(groundFor("Kris", "weapon")).toBe("assets/d2survivors/items/ground/flpkrs.png");
    expect(component.groundItemImage({
      name: "Cruel Kris of Quickness", baseName: "Kris", slot: "weapon",
    } as any)).toBe("assets/d2survivors/items/ground/flpkrs.png");
    expect(groundFor("Staff", "weapon")).toBe("assets/d2survivors/items/ground/flpsst.png");
    expect(component.groundItemImage({
      name: "Fine Staff", baseName: "Staff", slot: "weapon",
    } as any)).toBe("assets/d2survivors/items/ground/flpsst.png");
    expect(groundFor("Stalwart Cap", "armor")).toBe("assets/d2survivors/items/helmet.png");
  });

  it("plays every flippy frame once and holds the final resting frame", () => {
    const animation = component.groundItemAnimation({
      name: "Short Sword", baseName: "Short Sword", slot: "weapon",
    } as any);

    expect(animation?.path).toBe("assets/d2survivors/items/ground-anim/flpssd.png");
    expect(component.groundItemAnimation({
      name: "Cruel Kris of Quickness", baseName: "Kris", slot: "weapon",
    } as any)?.path).toBe("assets/d2survivors/items/ground-anim/flpkrs.png");
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

  it("opens the act portal clear of an unopened boss chest", () => {
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.chests = [{ x: 304, y: 250, bob: 0, open: false, life: 30 }];

    const spawn = (component as any).actPortalSpawnPoint();
    const chest = component.chests[0];
    expect(Math.hypot(spawn.x - chest.x, spawn.y - chest.y)).toBeGreaterThanOrEqual(80);
    expect(Math.hypot(spawn.x - component.playerX, spawn.y - component.playerY)).toBeLessThanOrEqual(110);

    component.chests = [];
    const unobstructed = (component as any).actPortalSpawnPoint();
    expect(unobstructed.x).toBeCloseTo(304, 5);
    expect(unobstructed.y).toBeCloseTo(250, 5);
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

  it("drops items directly for champions and keeps chests for level bosses", () => {
    component.currentAct = 1;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    component.chests = [];
    component.itemDrops = [];
    const item = { id: "champion-drop", name: "Sash", rarity: "magic", slot: "belt", desc: "A sash." } as any;
    spyOn(component as any, "randomItem").and.returnValue(item);

    const champion = {
      kind: "champion",
      species: "fallen",
      championType: "champion",
      spriteFrame: 0,
      x: 260,
      y: 250,
      hp: 0,
      maxHp: 20,
      speed: 0,
      r: 14,
      dmg: 2,
      cd: 0,
    } as any;
    component.enemies = [champion];

    component.updateEnemies(16);

    expect(component.chests).toHaveSize(0);
    expect(component.itemDrops).toHaveSize(1);
    expect(component.itemDrops[0].item).toBe(item);

    const boss = { ...champion, kind: "boss", species: "andariel", x: 270 } as any;
    component.enemies = [boss];
    component.itemDrops = [];

    component.updateEnemies(16);

    expect(component.chests).toHaveSize(1);
    expect(component.itemDrops).toHaveSize(0);
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

  it("renders an equipped weapon at the hand attachment and moves it with the arm during a strike", async () => {
    component.selectedClass = "paladin";
    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    (component as any).heldItemMeshes.set("short_sword", Promise.resolve(null));

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const weapon = hand.children.find((child) => child.name === "equipped_weapon_weapon");
    expect(weapon).toBeDefined();
    expect(weapon?.children.some((child) => (child as THREE.Mesh).isMesh)).toBeTrue();

    (component as any).characterModel = anchor;
    (component as any).characterRig = buildCharacterRig(model, "paladin");
    const upperArmBase = bones["R_upr_arm_bind_jnt"].quaternion.clone();
    (component as any).triggerAttackAnimation();
    (component as any).animatePlayerModel(150);

    expect(bones["R_upr_arm_bind_jnt"].quaternion.angleTo(upperArmBase)).toBeGreaterThan(0.1);
    // The rig moves a cel off the mount onto the joint that drives it, so the
    // grip solve can place it in the posed fist instead of leaving it wherever
    // the mount's bind transform happened to point.
    const gripBone = (component as any).characterRig.hands.find((entry: any) => entry.side === -1)?.bone;
    expect(gripBone).toBeDefined();
    expect(weapon?.parent).toBe(gripBone);
    expect(weapon?.parent).not.toBe(hand);
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

  it("keeps a leaping Sand Leaper in melee reach instead of carrying it through the hero", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    const leaper = {
      kind: "normal", species: "leaper", spriteFrame: 0, x: 350, y: 250,
      hp: 100, maxHp: 100, speed: 400, r: 14, dmg: 2, cd: 0,
      animationState: "move", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [leaper];
    (component as any).rebuildEnemyGrid();

    component.updateEnemies(1000);

    expect(leaper.x).toBeGreaterThan(component.playerX + 40);
    expect(leaper.animationState).toBe("attack");
  });

  it("draws Council Members at humanoid size despite their padded atlas cels", () => {
    const frame = { width: 107, height: 108 } as HTMLCanvasElement;
    (component as any).enemySprites.council = {
      frames: Array.from({ length: 24 }, () => Array.from({ length: 20 }, () => frame)),
      columns: 20,
      rows: 24,
      animated: true,
      contentHeight: 67,
      footFraction: 0.98,
    };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 100, y: 120 });
    spyOn(component as any, "drawGroundShadow");
    spyOn(component as any, "drawHpBar");
    spyOn(component as any, "tintedEnemyFrame").and.returnValue(frame);
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    (component as any).worldZoom = 1;
    const enemy = {
      kind: "normal",
      species: "council",
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

    const spriteCall = drawImage.calls.all().find((call) => call.args[0] === frame);
    expect(spriteCall).toBeDefined();
    if (!spriteCall) throw new Error("Council sprite was not drawn");
    // The body fills 59/108 of the cell; at the shared source scale it draws
    // about 47px before world zoom instead of the old padded-cel ~37px.
    expect(spriteCall.args[4] * 59 / 108).toBeGreaterThan(45);
  });

  it("sizes act bosses from the hero's on-screen height instead of their D2 unit height", () => {
    // Frame height matches the cel's content so the drawn height equals the
    // sprite's target size.
    const bossFrame = { width: 192, height: 154 } as HTMLCanvasElement;
    const normalFrame = { width: 91, height: 75 } as HTMLCanvasElement;
    (component as any).enemySprites.diablo = {
      frames: Array.from({ length: 8 }, () => Array.from({ length: 14 }, () => bossFrame)),
      columns: 14, rows: 8, animated: true, contentHeight: 154, footFraction: 0.85,
    };
    (component as any).enemySprites.fallen = {
      frames: Array.from({ length: 1 }, () => Array.from({ length: 13 }, () => normalFrame)),
      columns: 13, rows: 1, animated: true, contentHeight: 75, footFraction: 0.9,
    };
    // A 1000px-tall arena: the 3D hero covers ~14.5% of it, about 145px.
    (component as any).projectionCenterY = 500;
    (component as any).worldZoom = 2.1;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 300, y: 400 });
    spyOn(component as any, "drawGroundShadow");
    spyOn(component as any, "drawHpBar");
    spyOn(component as any, "tintedEnemyFrame").and.callFake(
      (_species: unknown, _direction: unknown, _index: unknown, frame: HTMLCanvasElement) => frame);
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      ellipse: () => undefined,
      fill: () => undefined,
      stroke: () => undefined,
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    const enemyFor = (kind: "boss" | "normal", species: "diablo" | "fallen") => ({
      kind, species, campaignBoss: kind === "boss", spriteFrame: 0,
      animationState: "move", attackAnimationTime: 0, facingX: 0, facingY: 1,
      x: 300, y: 400, hp: 1000, maxHp: 1000, r: 26, dmg: 20,
    }) as any;

    (component as any).drawEnemy(ctx, enemyFor("boss", "diablo"));
    (component as any).drawEnemy(ctx, enemyFor("normal", "fallen"));

    const bossCall = drawImage.calls.all()[0];
    const normalCall = drawImage.calls.all()[1];
    // Diablo stands 2.6 hero-heights tall, roughly 376px on this canvas instead
    // of the flat 188px the shared source scale gave him.
    expect(bossCall.args[4]).toBeCloseTo(1000 * (72 * 1.16 * Math.cos(Math.PI / 6) / 500) * 2.6, 0);
    expect(bossCall.args[4]).toBeGreaterThan(340);
    // Ordinary monsters keep their D2 unit height: 64px * 0.8 * 2.1.
    expect(normalCall.args[4]).toBeCloseTo(64 * 0.8 * 2.1, 3);
  });

  it("keeps the minotaur at its pre-refactor screen height", () => {
    (component as any).worldZoom = 2.1;
    const height = (component as any).enemySpriteHeight({ kind: "normal", species: "minotaur" });
    const oldNormalHeight = 14 * 4.8 * 2.1 * 1.45;
    // The flat source scale removed the old 1.45 species factor; the minotaur
    // height must put it back so Act V's brutes do not shrink by half.
    expect(Math.abs(height - oldNormalHeight)).toBeLessThan(2);
    expect(height).toBeGreaterThan(
      (component as any).enemySpriteHeight({ kind: "normal", species: "bloodLord" }),
    );
  });

  it("plays the spike fiend's thirteen-cel quill throw, not leftover walk cells", () => {
    const frame = { width: 96, height: 80 } as HTMLCanvasElement;
    (component as any).enemySprites.spikeFiend = {
      frames: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => frame)),
      columns: 16, rows: 16, animated: true, contentHeight: 70, footFraction: 0.9,
    };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 100, y: 120 });
    spyOn(component as any, "drawGroundShadow");
    spyOn(component as any, "drawHpBar");
    const indices: number[] = [];
    spyOn(component as any, "tintedEnemyFrame").and.callFake(
      (_species: unknown, _direction: unknown, index: number) => {
        indices.push(index);
        return frame;
      });
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    (component as any).worldZoom = 1;
    const enemy = {
      kind: "normal", species: "spikeFiend", campaignBoss: false, spriteFrame: 0,
      animationState: "attack", attackDuration: 0.38, attackAnimationTime: 0.01,
      facingX: 1, facingY: 0, x: 100, y: 250, hp: 100, maxHp: 100, r: 14, dmg: 2,
    } as any;

    (component as any).drawEnemy(ctx, enemy);

    // 13 cels: the last one is column 12. The old sixteen-cel table sampled the
    // three cells the importer had filled with repeated walk poses.
    expect(indices).toEqual([12]);
  });

  describe("wall-aware enemy ranged combat", () => {
    const context = () => ({
      mask: { width: 4, height: 4, blocked: new Uint8Array(16) },
      geometry: { scale: 1, width: 4, height: 4, left: 0, top: 0 },
      wraps: true,
      clearance: 6,
    });
    const spikeFiend = () => ({
      kind: "normal", species: "spikeFiend", spriteFrame: 0,
      x: 400, y: 250, hp: 100, maxHp: 100, speed: 120, r: 16, dmg: 2, cd: 0,
      animationState: "move", facingX: -1, facingY: 0,
    }) as any;
    const prepare = () => {
      component.selectedClass = "amazon";
      component.playerX = 250;
      component.playerY = 250;
      component.playerHp = 1000;
      component.playerMaxHp = 1000;
      component.currentAct = 8;
      spyOn(component as any, "campaignCollisionContext").and.returnValue(context());
      spyOn(component as any, "campaignStepBlocked").and.returnValue(false);
    };

    it("detects scenery crossing the line between a shooter and its target", () => {
      const blocked = new Uint8Array(100 * 100);
      for (let y = 0; y < 100; y += 1) blocked[y * 100 + 50] = 1;
      const wall = {
        mask: { width: 100, height: 100, blocked },
        geometry: { scale: 1, width: 100, height: 100, left: 0, top: 0 },
        wraps: false,
        clearance: 6,
      };
      spyOn(component as any, "projectArenaPoint").and.callFake(
        (x: number, y: number) => ({ x, y }));

      expect((component as any).campaignLineBlocked(wall, 10, 10, 90, 10)).toBeTrue();
      expect((component as any).campaignLineBlocked(wall, 10, 10, 40, 10)).toBeFalse();
    });

    it("withholds a spike fiend's quills when a wall covers the hero and advances instead", () => {
      prepare();
      const lineBlocked = spyOn(component as any, "campaignLineBlocked").and.returnValue(true);
      const fiend = spikeFiend();
      component.enemies = [fiend];

      component.updateEnemies(16);

      expect(lineBlocked).toHaveBeenCalled();
      expect(component.attackProjectiles.some((shot) => shot.missileId === "d2-spikefiendmissle")).toBeFalse();
      expect(fiend.x).toBeLessThan(400);
      expect(fiend.animationState).toBe("move");
    });

    it("fires the quill once the hero is back in plain sight", () => {
      prepare();
      spyOn(component as any, "campaignLineBlocked").and.returnValue(false);
      const fiend = spikeFiend();
      component.enemies = [fiend];

      component.updateEnemies(16);

      expect(component.attackProjectiles.filter((shot) => shot.missileId === "d2-spikefiendmissle")).toHaveSize(1);
      expect(fiend.x).toBe(400);
    });

    it("expires an enemy missile that reaches a wall before the hero", () => {
      spyOn(component as any, "campaignCollisionContext").and.returnValue(context());
      spyOn(component as any, "campaignBlockedAt").and.returnValue(true);
      component.attackProjectiles = [{
        x: 250, y: 250, startX: 200, startY: 250, targetX: 300, targetY: 250,
        speed: 0, damage: 1, life: 1, age: 0, radius: 2, color: "#fff", kind: "arrow",
        source: { species: "spikeFiend" } as any, targetPlayer: true,
      } as any];

      (component as any).updateAttackProjectiles(16);

      expect(component.attackProjectiles).toHaveSize(0);
    });

    it("slides a ranged monster sideways around a wall on its chosen side", () => {
      spyOn(component as any, "campaignStepBlocked").and.callFake(
        (_context: unknown, _x: number, _y: number, dx: number, dy: number) => Math.abs(Math.atan2(dy, dx)) < 0.4,
      );
      const fiend = { x: 100, y: 100, pathSide: 1 } as any;

      const step = (component as any).enemyWallAwareStep(context(), fiend, 1, 0, 5, 400, 100);

      expect(step.x).toBeGreaterThan(100);
      expect(step.y).toBeGreaterThan(100);
    });
  });

  it("keeps the Fetish and Council animation loops on populated cels", () => {
    const frame = { width: 91, height: 101 } as HTMLCanvasElement;
    const spriteFor = (columns: number) => ({
      frames: Array.from({ length: 24 }, () => Array.from({ length: columns }, () => frame)),
      columns,
      rows: 24,
      animated: true,
    });
    const sprites = (component as any).enemySprites;
    sprites.fetish = spriteFor(13);
    sprites.boneFetish = spriteFor(13);
    sprites.council = spriteFor(20);

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
      species: "fetish",
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
    const frameIndex = (): number => tinted.calls.mostRecent().args[2] as number;

    const checkSpecies = (species: string, walkFrames: number, idleFrames: number, attackFrames: number): void => {
      enemy.species = species;
      enemy.animationState = "move";
      const walkSamples: number[] = [];
      for (let sample = 0; sample < 24; sample += 1) {
        (component as any).runTime = sample * 0.13;
        (component as any).drawEnemy(ctx, enemy);
        walkSamples.push(frameIndex());
      }
      expect(Math.max(...walkSamples)).toBeLessThan(walkFrames);

      enemy.animationState = "idle";
      const idleSamples: number[] = [];
      for (let sample = 0; sample < 24; sample += 1) {
        (component as any).runTime = sample * 0.21;
        (component as any).drawEnemy(ctx, enemy);
        idleSamples.push(frameIndex());
      }
      expect(Math.max(...idleSamples)).toBeLessThan(idleFrames);

      enemy.animationState = "attack";
      const attackSamples: number[] = [];
      for (const attackAnimationTime of [0.38, 0.3, 0.2, 0.1, 0]) {
        enemy.attackAnimationTime = attackAnimationTime;
        (component as any).drawEnemy(ctx, enemy);
        attackSamples.push(frameIndex());
      }
      expect(Math.max(...attackSamples)).toBeLessThan(attackFrames);
    };

    checkSpecies("fetish", 6, 12, 12);
    checkSpecies("boneFetish", 6, 12, 12);
    checkSpecies("council", 11, 7, 10);
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
    const weapon = { name: "Short Sword", slot: "weapon" };
    const readiness = eligibleAffixes(weapon, 20, "suffix").find((affix) => affix.name === "Readiness");
    expect(readiness).toBeDefined();
    const rolled = rollAffix(readiness!, 99);

    expect(rolled.stats.attackSpeedPercent).toBe(10);
    expect(rolled.text).toContain("Increased Attack Speed");
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

  it("gives Necromancer shrunken heads the voodoo-head staffmod strengths", () => {
    const rolls: number[] = [];
    spyOn(Math, "random").and.callFake(() => rolls.shift() ?? 0);
    const roll = (...values: number[]) => {
      rolls.splice(0, rolls.length, ...values);
      return (component as any).rollNecromancerHeadSkillAffix(1);
    };

    // +1-3 to one skill, +1-2 to a skill tree, +1-2 to all Necromancer skills,
    // independent of the area level that caps a wand's staffmod.
    expect(roll(0.1, 0, 0.99).affix).toBe("+3 to Amplify Damage");
    expect(roll(0.1, 0, 0.99).stats.necromancerSkillLevels).toEqual({ "Amplify Damage": 3 });
    expect(roll(0.6, 0, 0.99).affix).toBe("+2 to Curses Skills");
    expect(roll(0.6, 0, 0.99).stats.necromancerTreeSkillLevels).toEqual({ Curses: 2 });
    expect(roll(0.99, 0.99).affix).toBe("+2 to Necromancer Skill Levels");
    expect(roll(0.99, 0.99).stats.necromancerClassSkillLevel).toBe(2);
  });

  it("rolls class staffmods for wands, orbs, pelts, shrunken heads and paladin shields only", () => {
    expect((component as any).staffmodConfigForBase("wand").classId).toBe("necromancer");
    expect((component as any).staffmodConfigForBase("necromancerHead").classId).toBe("necromancer");
    expect((component as any).staffmodConfigForBase("orb").classId).toBe("sorceress");
    expect((component as any).staffmodConfigForBase("druidPelt").classId).toBe("druid");
    expect((component as any).staffmodConfigForBase("paladinShield").classId).toBe("paladin");
    expect((component as any).staffmodConfigForBase("shield")).toBeUndefined();
    expect((component as any).staffmodConfigForBase("barbarianHelm")).toBeUndefined();
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

  it("casts a gear-granted skill the hero never learned", () => {
    component.selectedClass = "necromancer";
    component.ownedSkills = ["Attack"];
    component.skillLevels = { Attack: 1 };

    // A named "+1 to Bone Armor" wand is a real rank even with no point spent.
    component.equipment.weapon = {
      id: "bone-armor-wand", name: "Bone Wand", baseName: "Wand", rarity: "magic",
      slot: "weapon", equipmentType: "wand", desc: "A wand.",
      stats: { necromancerSkillLevels: { "Bone Armor": 1 } },
    } as any;
    expect(component.skillLevels["Bone Armor"]).toBe(1);
    expect((component as any).canUseSkill("Bone Armor")).toBeTrue();
    expect(component.ownedSkills).not.toContain("Bone Armor");

    (component as any).activateOwnedSkill("Bone Armor");
    expect((component as any).boneArmorRemaining).toBeGreaterThan(0);
    expect((component as any).isBoneArmorActive()).toBeTrue();
    expect(component.equippedSkills).toContain("Bone Armor");

    // Taking the wand off takes the skill with it.
    component.equipment.weapon = null;
    expect(component.skillLevels["Bone Armor"]).toBeUndefined();
    expect((component as any).canUseSkill("Bone Armor")).toBeFalse();
  });

  it("only lets a named staffmod grant an unlearned skill", () => {
    component.selectedClass = "necromancer";
    component.ownedSkills = ["Attack"];
    component.skillLevels = { Attack: 1 };
    component.equipment.weapon = {
      id: "magus-wand", name: "Bone Wand of the Magus", baseName: "Wand", rarity: "rare",
      slot: "weapon", equipmentType: "wand", desc: "A wand.",
      stats: { necromancerTreeSkillLevels: { "Poison and Bone": 2 }, necromancerClassSkillLevel: 2 },
    } as any;

    // Tree and class-wide lines deepen learned skills; they never hand one over.
    expect(component.skillLevels["Bone Wall"]).toBeUndefined();
    expect((component as any).canUseSkill("Bone Wall")).toBeFalse();
    expect((component as any).isBoneArmorActive()).toBeFalse();
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

  it("scales paladin shield staffmods with the item level", () => {
    const rolls: number[] = [];
    spyOn(Math, "random").and.callFake(() => rolls.shift() ?? 0);
    const roll = (itemLevel: number, ...values: number[]) => {
      rolls.splice(0, rolls.length, ...values);
      return (component as any).rollPaladinShieldSkillAffix(itemLevel);
    };

    expect(roll(23, 0.1, 0, 0.99).affix).toBe("+1 to Sacrifice");
    expect(roll(24, 0.1, 0, 0.99).affix).toBe("+2 to Sacrifice");
    expect(roll(43, 0.1, 0, 0.99).affix).toBe("+3 to Sacrifice");
    expect(roll(43, 0.6, 0, 0.99).affix).toBe("+3 to Combat Skills");
    expect(roll(43, 0.99, 0.99).affix).toBe("+2 to Paladin Skill Levels");
  });

  it("applies paladin shield staffmods to effective paladin skill ranks", () => {
    component.selectedClass = "paladin";
    component.ownedSkills = ["Sacrifice", "Might"];
    component.skillLevels = { Sacrifice: 5, Might: 2 };
    component.equipment.shield = {
      id: "staffmod-targe", name: "Targe of the Magus", baseName: "Targe", rarity: "magic",
      slot: "armor", equipmentType: "paladinShield", desc: "A paladin shield.",
      stats: {
        paladinSkillLevels: { Sacrifice: 2 },
        paladinTreeSkillLevels: { "Combat Skills": 1 },
        paladinClassSkillLevel: 1,
      },
    } as any;

    expect(component.skillLevels["Sacrifice"]).toBe(9);
    expect(component.skillLevels["Might"]).toBe(3);
    expect(component.skillLevels["Zeal"]).toBeUndefined();
    expect((component as any).baseSkillLevels.Sacrifice).toBe(5);

    component.equipment.shield = null;
    expect(component.skillLevels["Sacrifice"]).toBe(5);
  });

  it("keeps paladin shield staffmods when a save is sanitized", () => {
    (component as any).restoreRunState({
      selectedClass: "paladin",
      playerLevel: 50,
      equipment: {
        shield: {
          id: "saved-staffmod-targe", name: "Targe of the Magus", baseName: "Targe",
          rarity: "magic", slot: "armor", equipmentType: "paladinShield", desc: "A paladin shield.",
          stats: {
            armor: 16,
            paladinSkillLevels: { Sacrifice: 2 },
            paladinTreeSkillLevels: { "Combat Skills": 1 },
            paladinClassSkillLevel: 1,
          },
          affixes: ["+2 to Sacrifice"],
        },
      },
      inventory: [],
      beltSlots: [],
    });

    const stats = component.equipment.shield?.stats;
    expect(stats?.paladinSkillLevels).toEqual({ Sacrifice: 2 });
    expect(stats?.paladinTreeSkillLevels).toEqual({ "Combat Skills": 1 });
    expect(stats?.paladinClassSkillLevel).toBe(1);
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

  it("hides the item tooltip while an inventory drag is active", () => {
    const item = { name: "Short Sword" } as any;
    component.hoveredItem = item;
    component.selectedItem = item;

    component.dragState = { source: "inventory", slotIndex: 0, item };
    expect(component.itemPreviewItem).toBeNull();

    component.dragState = null;
    component.hoveredItem = null;
    component.mobileInventoryDrag = { pointerId: 1, sourceIndex: 0, item };
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
    // 30px gap: enough to clear the gauntlet cursor sprite as well as the tip.
    expect(component.itemPreviewX).toBe(50);
    expect(component.itemPreviewY).toBe(34);
  });

  it("never centres the item tooltip on the pointer when neither side has room", () => {
    const preview = document.createElement("div");
    spyOn(preview, "getBoundingClientRect").and.returnValue({ width: 340, height: 220 } as DOMRect);
    (component as any).inventoryItemWindow = { nativeElement: preview };
    // Jasmine restores the viewport width when the spec ends.
    spyOnProperty(window, "innerWidth").and.returnValue(400);
    (component as any).positionItemPreviewAt(380, 120);
    // The panel flips to the roomier side and is clamped inside the viewport,
    // so it never covers the spot the mouse is standing on.
    expect(component.itemPreviewLeft).toBeTrue();
    expect(component.itemPreviewX + 340).toBeLessThan(380);
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

  it("retargets the hover tooltip after right-click equip swaps the slot item", () => {
    const newSword = {
      id: "new-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
      stats: { damageMin: 2, damageMax: 5 }, desc: "A short sword.", affixes: [],
    } as any;
    const oldSword = {
      ...newSword, id: "old-sword", name: "Sabre", baseName: "Sabre",
      stats: { damageMin: 3, damageMax: 7 }, desc: "An old sabre.",
    };
    const emptyEquipment = () => ({
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    });
    const event = { preventDefault: () => undefined, clientX: 120, clientY: 140 } as any;
    component.selectedClass = "paladin";
    component.playerLevel = 10;
    component.inventory = Array.from({ length: 40 }, () => null);

    component.inventory[0] = newSword;
    component.equipment = { ...emptyEquipment(), weapon: oldSword };
    component.hoveredItem = newSword;
    component.hoveredSlotIndex = 0;
    component.selectedItem = newSword;
    component.selectedSlotIndex = 0;

    component.onInventoryContextMenu(0, event);

    expect(component.equipment.weapon?.id).toBe("new-sword");
    expect(component.inventory[0]?.id).toBe("old-sword");
    expect(component.hoveredItem?.id).toBe("old-sword");
    expect(component.itemPreviewItem?.id).toBe("old-sword");
    expect(component.selectedItem).toBeNull();

    component.inventory[0] = { ...newSword, id: "second-sword" };
    component.equipment = emptyEquipment();
    component.hoveredItem = component.inventory[0];
    component.hoveredSlotIndex = 0;
    component.selectedItem = component.inventory[0];
    component.selectedSlotIndex = 0;

    component.onInventoryContextMenu(0, event);

    expect(component.inventory[0]).toBeNull();
    expect(component.hoveredItem).toBeNull();
    expect(component.itemPreviewItem).toBeNull();
    expect(component.selectedItem).toBeNull();
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

  it("clears the old Barbarian restriction from a saved Great Sword", () => {
    const stale = {
      id: "stale-restricted-great-sword",
      name: "Cruel Great Sword of Swiftness",
      baseName: "Great Sword",
      rarity: "rare",
      slot: "weapon",
      restrictedClass: "barbarian",
      desc: "A great sword.",
      stats: { damageMin: 8, damageMax: 17 },
    };
    (component as any).restoreRunState({
      selectedClass: "sorceress",
      playerLevel: 99,
      equipment: { weapon: stale },
      inventory: [],
      beltSlots: [],
    });
    const weapon = component.equipment.weapon as any;
    expect(weapon?.baseName).toBe("Great Sword");
    expect(weapon?.restrictedClass).toBeUndefined();
  });

  it("migrates a saved Barbarian Battle Axe to the unrestricted two-handed base", () => {
    const legacy = {
      id: "legacy-barbarian-battle-axe",
      name: "Savage Barbarian Battle Axe of Haste",
      baseName: "Barbarian Battle Axe",
      rarity: "rare",
      slot: "weapon",
      restrictedClass: "barbarian",
      width: 1,
      height: 3,
      desc: "A Barbarian-only battle axe with a brutal edge.",
      stats: { damageMin: 7, damageMax: 15 },
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
    expect(weapon?.name).toBe("Savage Battle Axe of Haste");
    expect(weapon?.baseName).toBe("Battle Axe");
    expect(weapon?.restrictedClass).toBeUndefined();
    expect(weapon?.desc).toBe("A two-handed battle axe that any class can wield.");
    expect((component as any).itemSize(weapon)).toEqual({ width: 2, height: 3 });
    expect(component.itemStatText(weapon)).toContain("Two-Handed — occupies both hands");
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

  it("auto-fires an arrow from a bow while planted instead of walking into melee", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    const target = { x: 300, y: 100, r: 10, hp: 100 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    component.equipment.weapon = { name: "Short Bow", baseName: "Short Bow", slot: "weapon" } as any;

    (component as any).updateBasicAttack();

    expect(target.hp).toBe(100);
    expect(component.attackProjectiles.length).toBe(1);
    expect(component.attackProjectiles[0].kind).toBe("arrow");
    expect(component.attackProjectiles[0].missileId).toBe("d2-arrow");
    expect((component as any).attackAnimationStyle).toBe("bowShot");

    for (let frame = 0; frame < 90 && target.hp === 100; frame += 1) {
      (component as any).updateAttackProjectiles(16);
    }
    expect(target.hp).toBeLessThan(100);
  });

  it("auto-throws a javelin at range without applying melee damage", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    const target = { x: 300, y: 100, r: 10, hp: 100 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    component.equipment.weapon = { name: "War Javelin", baseName: "War Javelin", slot: "weapon" } as any;

    (component as any).updateBasicAttack();

    expect(target.hp).toBe(100);
    expect(component.attackProjectiles.length).toBe(1);
    expect(component.attackProjectiles[0].thrownWeapon).toBe("javelin");
    expect(component.attackProjectiles[0].missileId).toBe("d2-javelin");
    expect(component.attackProjectiles[0].sourceOnlyArt).toBe(true);
    expect((component as any).attackAnimationStyle).toBe("weaponThrow");
  });

  it("fires the original crossbow bolt art when a crossbow is equipped", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    const target = { x: 300, y: 100, r: 10, hp: 100 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    component.equipment.weapon = { name: "Heavy Crossbow", baseName: "Heavy Crossbow", slot: "weapon" } as any;

    (component as any).updateBasicAttack();

    expect(component.attackProjectiles.length).toBe(1);
    expect(component.attackProjectiles[0].missileId).toBe("d2-xbowbolt");
    expect(component.attackProjectiles[0].sourceOnlyArt).toBe(true);
    expect((component as any).missileOverlayId("Multiple Shot")).toBe("d2-xbowbolt");
    expect((component as any).missileOverlayId("Strafe")).toBe("d2-xbowbolt");
  });

  it("jabs with a javelin when the target is already in melee range", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    const target = { x: 116, y: 100, r: 10, hp: 100 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    component.equipment.weapon = { name: "War Javelin", baseName: "War Javelin", slot: "weapon" } as any;

    (component as any).updateBasicAttack();

    expect(component.attackProjectiles.length).toBe(0);
    expect(target.hp).toBeLessThan(100);
    expect((component as any).attackAnimationStyle).toBe("amazonJab");
  });

  it("keeps javelin attacks hybrid: repeated melee up close, then ranged once nothing is in reach", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.pendingLevelUps = 0;
    component.playerX = 100;
    component.playerY = 100;
    const melee = { x: 116, y: 100, r: 10, hp: 100 } as any;
    const distant = { x: 300, y: 100, r: 10, hp: 100 } as any;
    component.enemies = [distant, melee];
    component.attackProjectiles = [];
    component.equipment.weapon = { name: "War Javelin", baseName: "War Javelin", slot: "weapon" } as any;
    (component as any).clickMoveTarget = distant;

    (component as any).updateBasicAttack();

    expect(melee.hp).toBeLessThan(100);
    expect(distant.hp).toBe(100);
    expect(component.attackProjectiles.length).toBe(0);
    expect((component as any).attackAnimationStyle).toBe("amazonJab");

    const hpAfterFirstJab = melee.hp;
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();

    expect(melee.hp).toBeLessThan(hpAfterFirstJab);
    expect(distant.hp).toBe(100);
    expect(component.attackProjectiles.length).toBe(0);

    melee.hp = 0;
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();

    expect(component.attackProjectiles.length).toBe(1);
    expect(component.attackProjectiles[0].target).toBe(distant);
    expect(component.attackProjectiles[0].thrownWeapon).toBe("javelin");
  });

  it("hurls the Double Throw skill projectile at a faster throwing speed", () => {
    component.selectedClass = "barbarian";
    component.playerX = 100;
    component.playerY = 100;
    component.ownedSkills = ["Double Throw"];
    component.skillLevels = { "Double Throw": 1 };
    const target = { x: 400, y: 100, r: 10, hp: 1000, maxHp: 1000, speed: 0, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    component.equipment.weapon = { name: "Javelin", baseName: "Javelin", slot: "weapon" } as any;
    component.equipment.shield = { name: "Throwing Axe", baseName: "Throwing Axe", slot: "weapon" } as any;

    component.activateOwnedSkill("Double Throw");

    expect(component.attackProjectiles.length).toBe(1);
    const projectile = component.attackProjectiles[0];
    expect(projectile.speed).toBeGreaterThan(650);
    (component as any).updateAttackProjectiles(1000);
    expect(target.hp).toBeLessThan(1000);
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
    expect(D2_UNIQUE_ITEMS.length).toBe(415);
    expect(new Set(D2_UNIQUE_ITEMS.map((item) => item.name)).size).toBe(415);
    for (const name of [
      "Earth Shifter",
      "Culwen's Point",
      "Rogue's Bow",
      "Wisp Projector",
      "Latent Black Cleft",
      "Renewed Black Cleft",
      "Rainbow Facet: Cold Death",
    ]) {
      expect(D2_UNIQUE_ITEMS.some((item) => item.name === name)).toBeTrue();
    }
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

  it("rolls elemental damage prefixes on charms", () => {
    const charm = { name: "Grand Charm", slot: "charm", equipmentType: "charm" };
    const elements = [
      { stat: "fireDamage", label: "Fire Damage", prefix: "Ember" },
      { stat: "coldDamage", label: "Cold Damage", prefix: "Snowy" },
      { stat: "lightningDamage", label: "Lightning Damage", prefix: "Static" },
      { stat: "poisonDamage", label: "Poison Damage", prefix: "Septic" },
    ] as const;

    for (const element of elements) {
      const affix = eligibleAffixes(charm, 30, "prefix").find((entry) => entry.name === element.prefix);
      expect(affix).withContext(element.prefix).toBeDefined();
      const rolled = rollAffix(affix!, 99);
      expect((rolled.stats as Record<string, number>)[element.stat]).toBeGreaterThan(0);
      expect(rolled.text.toLowerCase()).toContain(element.label.toLowerCase());
    }
  });

  it("applies elemental damage from charms held in the pack", () => {
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = {
      id: "elemental-charm", name: "Ember Grand Charm of Frost", baseName: "Grand Charm", rarity: "rare",
      slot: "charm", equipmentType: "charm", desc: "A charm crackling with elemental power.",
      stats: { fireDamage: 3, coldDamage: 2, lightningDamage: 5, poisonDamage: 1 },
      affixes: ["+3 Fire Damage (Ember)", "+2 Cold Damage (Frost)", "+5 Lightning Damage (Static)", "+1 Poison Damage (Blight)"],
    } as any;

    expect(component.equippedWeaponDamage).toBe(11);
    expect(component.getItemStatText(component.inventory[0])).toContain("+5 Lightning Damage (Static)");

    component.inventory[0] = null;
    expect(component.equippedWeaponDamage).toBe(0);
  });

  it("applies charm and item Strength to melee attacks", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.skillLevels = {};
    component.ownedSkills = [];
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = {
      id: "strength-charm", name: "Strength Small Charm", baseName: "Small Charm", rarity: "magic",
      slot: "charm", equipmentType: "charm", desc: "A charm that lends its bearer strength.",
      stats: { plusStrength: 25 },
    } as any;
    const target = { x: 260, y: 250, r: 12, hp: 1000 } as any;
    component.enemies = [target];

    expect(component.inventoryAttackDamage).toBe(125);
    component.attackNearestEnemy();
    expect(target.hp).toBe(875);

    target.hp = 1000;
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();
    expect(target.hp).toBe(875);

    component.inventory[0] = null;
    expect(component.inventoryAttackDamage).toBe(100);
    target.hp = 1000;
    (component as any).attackCooldown = 0;
    component.attackNearestEnemy();
    expect(target.hp).toBe(900);
  });

  it("does not apply Strength to bow damage", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.skillLevels = {};
    component.ownedSkills = [];
    component.equipment.weapon = { name: "Short Bow", baseName: "Short Bow", slot: "weapon" } as any;
    component.equipment.shield = null;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = {
      id: "strength-charm", name: "Strength Small Charm", baseName: "Small Charm", rarity: "magic",
      slot: "charm", equipmentType: "charm", desc: "A charm that lends its bearer strength.",
      stats: { plusStrength: 25 },
    } as any;
    const target = { x: 300, y: 250, r: 12, hp: 1000 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];

    expect(component.inventoryAttackDamage).toBe(100);
    (component as any).updateBasicAttack();

    expect(component.attackProjectiles).toHaveSize(1);
    expect(component.attackProjectiles[0].damage).toBe(100);
  });

  it("applies Strength to melee skill damage", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Smite"];
    component.skillLevels = { Smite: 1 };
    component.equipment.weapon = null;
    component.equipment.shield = { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = {
      id: "strength-charm", name: "Strength Small Charm", baseName: "Small Charm", rarity: "magic",
      slot: "charm", equipmentType: "charm", desc: "A charm that lends its bearer strength.",
      stats: { plusStrength: 25 },
    } as any;
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 310, y: 250,
      hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [target];
    component.floatingTexts = [];

    component.activateOwnedSkill("Smite");
    (component as any).flushPendingDamage();

    expect(target.hp).toBeCloseTo(812.5, 5);
  });

  it("applies item Energy to projectile spell damage", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.equipment.helmet = {
      id: "energy-helm", name: "Helm of Focus", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "A helm that focuses spell power.",
      stats: { plusEnergy: 25 },
    } as any;
    component.enemies = [{ x: 300, y: 250, r: 14, hp: 1000 } as any];
    component.attackProjectiles = [];

    expect(component.equippedEnergyBonus).toBe(25);
    expect((component as any).getSkillRankStats("Fire Bolt", "projectile", 1))
      .toContain("187 base damage per hit before skill-specific modifiers");
    component.activateOwnedSkill("Fire Bolt");

    expect(component.attackProjectiles).toHaveSize(1);
    expect(component.attackProjectiles[0].damage).toBe(187.5);
  });

  it("applies item Energy to area spell damage", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Frost Nova"];
    component.skillLevels = { "Frost Nova": 1 };
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.equipment.helmet = {
      id: "energy-helm", name: "Helm of Focus", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "A helm that focuses spell power.",
      stats: { plusEnergy: 25 },
    } as any;
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250,
      hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [target];
    component.floatingTexts = [];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Frost Nova");
    (component as any).flushPendingDamage();

    expect(target.hp).toBeCloseTo(843.75, 5);
  });

  it("applies item Energy to ground spell damage", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Fire Wall"];
    component.skillLevels = { "Fire Wall": 1 };
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.equipment.helmet = {
      id: "energy-helm", name: "Helm of Focus", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "A helm that focuses spell power.",
      stats: { plusEnergy: 25 },
    } as any;
    component.enemies = [];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Fire Wall");

    expect(component.attackProjectiles).toHaveSize(1);
    expect(component.attackProjectiles[0].damage).toBe(37.5);
  });

  it("applies item Energy once to elemental trap damage", () => {
    component.selectedClass = "assassin";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Wake of Inferno"];
    component.skillLevels = { "Wake of Inferno": 1 };
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.equipment.helmet = {
      id: "energy-helm", name: "Helm of Focus", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "A helm that focuses spell power.",
      stats: { plusEnergy: 25 },
    } as any;
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250,
      hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    component.floatingTexts = [];
    (component as any).skillVisualEffects = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Wake of Inferno");
    const trap = component.attackProjectiles[0];
    expect(trap.trapDamage).toBe(43.75);

    trap.shotCooldown = 0;
    (component as any).updateAttackProjectiles(16);
    const cone = (component as any).skillVisualEffects.find((effect: any) => effect.inferno && effect.stationary);
    expect(cone).toBeDefined();
    expect(cone.damagePerTick).toBeCloseTo(10.9375, 5);
  });

  it("does not apply item Energy to melee attacks", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.skillLevels = {};
    component.ownedSkills = [];
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.equipment.helmet = {
      id: "energy-helm", name: "Helm of Focus", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "A helm that focuses spell power.",
      stats: { plusEnergy: 25 },
    } as any;
    const target = { x: 260, y: 250, r: 12, hp: 1000 } as any;
    component.enemies = [target];

    expect(component.inventoryAttackDamage).toBe(100);
    component.attackNearestEnemy();

    expect(target.hp).toBe(900);
  });

  it("does not apply item Energy to bow skills", () => {
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Multiple Shot"];
    component.skillLevels = { "Multiple Shot": 1 };
    component.equipment.weapon = { name: "Short Bow", baseName: "Short Bow", slot: "weapon" } as any;
    component.equipment.shield = null;
    component.equipment.helmet = {
      id: "energy-helm", name: "Helm of Focus", baseName: "Helm", rarity: "magic",
      slot: "armor", equipmentType: "helmet", desc: "A helm that focuses spell power.",
      stats: { plusEnergy: 25 },
    } as any;
    component.enemies = [{ x: 300, y: 250, r: 14, hp: 1000 } as any];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Multiple Shot");

    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.attackProjectiles.every((projectile) => projectile.damage === 150)).toBeTrue();
  });

  it("drops only named items whose required level fits the hero", () => {
    component.playerLevel = 5;
    // This covers the named-item path; the gem/jewel band that rolls ahead of it
    // has its own tests, and a stubbed Math.random would otherwise land there.
    spyOn(component as any, "rollSocketableDrop").and.returnValue(null);
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

  it("places the skill tooltip beside the pointer and flips it left at the viewport edge", () => {
    component.selectedClass = "amazon";
    component.playerLevel = 30;
    const magicArrow = D2_CLASS_SKILL_TREES["amazon"].sections[0].skills[0];
    const tooltip = document.createElement("div");
    spyOn(tooltip, "getBoundingClientRect").and.returnValue({ width: 280, height: 200 } as DOMRect);
    (component as any).skillTooltipRef = { nativeElement: tooltip };

    component.showSkillTooltip(
      { clientX: 100, clientY: 100 } as MouseEvent,
      { ...magicArrow, state: "available" as const, reason: "" },
      "Bow and Crossbow",
    );

    expect(component.hoveredSkillTooltip?.x).toBe(124);
    expect(component.hoveredSkillTooltip?.y).toBe(114);

    const edgeX = window.innerWidth - 20;
    component.showSkillTooltip(
      { clientX: edgeX, clientY: 100 } as MouseEvent,
      { ...magicArrow, state: "available" as const, reason: "" },
      "Bow and Crossbow",
    );

    expect(component.hoveredSkillTooltip?.x).toBe(edgeX - 24 - 280);
    expect(component.hoveredSkillTooltip?.y).toBe(114);
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

  it("orders the barbarian panel with Stun before Double Throw and Taunt before Shout", () => {
    const sections = D2_CLASS_SKILL_TREES["barbarian"].sections;
    const combatNames = sections.find((section) => section.name === "Combat Skills")!.skills.map((skill) => skill.name);
    const warcryNames = sections.find((section) => section.name === "Warcries")!.skills.map((skill) => skill.name);

    expect(combatNames.indexOf("Stun")).toBeLessThan(combatNames.indexOf("Double Throw"));
    expect(warcryNames.indexOf("Taunt")).toBeLessThan(warcryNames.indexOf("Shout"));
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

  it("matches the paladin defensive aura sockets to the painted tree icons", () => {
    const defensive = D2_CLASS_SKILL_TREES["paladin"].sections.find((section) => section.name === "Defensive Auras")!;
    expect(defensive.skills.map((skill) => skill.name)).toEqual([
      "Prayer", "Resist Fire", "Defiance", "Resist Cold", "Cleansing", "Resist Lightning",
      "Vigor", "Meditation", "Redemption", "Salvation",
    ]);
    // The prerequisites stay with their skills after the socket swap.
    expect(defensive.skills.find((skill) => skill.name === "Cleansing")?.prerequisites).toEqual(["Prayer"]);
    expect(defensive.skills.find((skill) => skill.name === "Vigor")?.prerequisites).toContain("Defiance");
  });

  it("matches the other swapped class panels to their painted skill sockets", () => {
    const panels: Array<[string, string, string[]]> = [
      ["amazon", "Bow and Crossbow", [
        "Magic Arrow", "Fire Arrow", "Cold Arrow", "Multiple Shot", "Exploding Arrow",
        "Ice Arrow", "Guided Arrow", "Strafe", "Immolation Arrow", "Freezing Arrow",
      ]],
      ["assassin", "Shadow Disciplines", [
        "Claw Mastery", "Psychic Hammer", "Burst of Speed", "Weapon Block", "Cloak of Shadows",
        "Fade", "Shadow Warrior", "Mind Blast", "Venom", "Shadow Master",
      ]],
      ["druid", "Shape Shifting", [
        "Werewolf", "Lycanthropy", "Werebear", "Maul", "Feral Rage",
        "Fire Claws", "Rabies", "Hunger", "Shock Wave", "Fury",
      ]],
      ["sorceress", "Lightning Spells", [
        "Charged Bolt", "Static Field", "Telekinesis", "Lightning", "Nova",
        "Chain Lightning", "Teleport", "Thunder Storm", "Energy Shield", "Lightning Mastery",
      ]],
    ];

    for (const [classId, sectionName, names] of panels) {
      const section = D2_CLASS_SKILL_TREES[classId].sections.find((entry) => entry.name === sectionName)!;
      expect(section.skills.map((skill) => skill.name))
        .withContext(`${classId} ${sectionName}`)
        .toEqual(names);
    }

    // Prerequisites stay attached to the skill they belong to after each swap.
    const skillFor = (classId: string, sectionName: string, name: string) =>
      D2_CLASS_SKILL_TREES[classId].sections.find((section) => section.name === sectionName)!
        .skills.find((skill) => skill.name === name)!;
    expect(skillFor("amazon", "Bow and Crossbow", "Strafe").prerequisites).toContain("Guided Arrow");
    expect(skillFor("amazon", "Bow and Crossbow", "Immolation Arrow").prerequisites).toContain("Exploding Arrow");
    expect(skillFor("assassin", "Shadow Disciplines", "Weapon Block").prerequisites).toContain("Claw Mastery");
    expect(skillFor("assassin", "Shadow Disciplines", "Cloak of Shadows").prerequisites).toContain("Psychic Hammer");
    expect(skillFor("druid", "Shape Shifting", "Hunger").prerequisites).toContain("Fire Claws");
    expect(skillFor("druid", "Shape Shifting", "Shock Wave").prerequisites).toContain("Maul");
    expect(skillFor("sorceress", "Lightning Spells", "Nova").prerequisites).toContain("Static Field");
    expect(skillFor("sorceress", "Lightning Spells", "Teleport").prerequisites).toContain("Telekinesis");
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
    // The three spirits share one sprite and one species height, so none of them
    // carries a per-skill multiplier any more (1.64 used to make Oak Sage 1.6
    // hero heights tall).
    for (const spirit of ["Oak Sage", "Heart of Wolverine", "Spirit of Barbs"]) {
      expect(lookFor(spirit).sizeScale).toBe(1);
    }
    // The Oak Sage spirit and its aura are warm orange, not the old green.
    const oakLook = lookFor("Oak Sage");
    expect(oakLook.glow[0]).toBeGreaterThan(oakLook.glow[1]);
    expect(oakLook.glow[1]).toBeGreaterThan(oakLook.glow[2]);
    expect(tintFor("Oak Sage")).toContain("hue-rotate(-20deg)");
    expect((component as any).summonBarColor({ summonSkill: "Oak Sage" })).toBe("#e8954a");
  });

  it("fully converts the blue golem atlas to the Clay Golem's tan palette", () => {
    const tint = (component as any).summonSpriteTint("Clay Golem");
    expect(tint).toContain("sepia(1)");
    expect(tint).not.toContain("sepia(0.55)");
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

  it("shifts into the werebear once it is the form the druid has levelled", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.ownedSkills = ["Attack", "Werewolf", "Werebear"];
    component.skillLevels = { Attack: 1, Werewolf: 1, Werebear: 5 };
    (component as any).druidForm = null;
    (component as any).druidFormCooldown = 0;

    (component as any).updateAutomaticSkillCasts(16);

    expect((component as any).druidForm).toBe("werebear");
  });

  it("shifts into a werebear when that is the only form owned", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.ownedSkills = ["Attack", "Werebear"];
    component.skillLevels = { Attack: 1, Werebear: 1 };
    (component as any).druidForm = null;
    (component as any).druidFormCooldown = 0;

    (component as any).updateAutomaticSkillCasts(16);

    expect((component as any).druidForm).toBe("werebear");
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

  it("cycles the skeleton mage's neutral idle clip so its hand glow keeps moving", () => {
    const frame = { width: 158, height: 109 } as HTMLCanvasElement;
    (component as any).enemySprites.skeletalMageCold = {
      frames: Array.from({ length: 24 }, () => Array.from({ length: 16 }, () => frame)),
      columns: 16, rows: 24, animated: true, contentHeight: 109, footFraction: 0.82,
    };
    component.runTime = 10;
    spyOn(component as any, "tintedEnemyFrame").and.returnValue(frame);
    spyOn(component as any, "drawGroundShadow");
    const ctx = {
      save: () => undefined, restore: () => undefined, drawImage: () => undefined,
      fillRect: () => undefined, fillText: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    const mage = {
      kind: "normal", species: "skeletalMageCold", spriteFrame: 0, x: 300, y: 250,
      hp: 95, maxHp: 95, speed: 150, r: 12, dmg: 13, facingX: 1, facingY: 0,
      summonType: "skeleton", summonSkill: "Skeletal Mage", summonElement: "cold",
      animationState: "idle",
    } as any;

    // The neutral clip lives in the first eight rows; its frames keep changing
    // while the servant stands still, which is what animates the hand glow.
    (component as any).drawSummon(ctx, mage, { x: 100, y: 100 });
    const firstIdle = (component as any).tintedEnemyFrame.calls.mostRecent().args;
    expect(firstIdle[1]).toBeLessThan(8);

    component.runTime = 10.2;
    (component as any).drawSummon(ctx, mage, { x: 100, y: 100 });
    const nextIdle = (component as any).tintedEnemyFrame.calls.mostRecent().args;
    expect(nextIdle[1]).toBeLessThan(8);
    expect(nextIdle[2]).not.toBe(firstIdle[2]);

    mage.animationState = "move";
    (component as any).drawSummon(ctx, mage, { x: 100, y: 100 });
    const moving = (component as any).tintedEnemyFrame.calls.mostRecent().args;
    expect(moving[1]).toBeGreaterThanOrEqual(8);
    expect(moving[1]).toBeLessThan(16);
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

  it("gives Sand Maggots a poison goo spit and a melee bite", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 200;
    component.playerMaxHp = 200;
    component.attackProjectiles = [];
    component.maggotEggs = [];
    const farMaggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 430, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 6, cd: 0,
      burrowCooldown: 99, eggCooldown: 99, animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [farMaggot];

    component.updateEnemies(16);

    expect(farMaggot.spriteBlock).toBe(2);
    expect(farMaggot.animationState).toBe("attack");
    expect(component.attackProjectiles).toHaveSize(1);
    expect(component.attackProjectiles[0].missileId).toBe("d2-sandmaggotgoospit");
    expect(component.attackProjectiles[0].damageType).toBe("poison");
    expect(component.attackProjectiles[0].poison).toBeTrue();

    // The projectile itself applies the poison when it reaches the hero.
    component.attackProjectiles = [{
      targetPlayer: true, source: farMaggot, poison: true,
      x: 250, y: 250, startX: 250, startY: 250, targetX: 250, targetY: 250,
      speed: 100, damage: 3, life: 1, age: 0, radius: 6, color: "#9bdb56", kind: "fire",
    } as any];
    (component as any).updateAttackProjectiles(16);
    expect(component.playerPoisonRemaining).toBeGreaterThan(0);

    const nearMaggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 260, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 6, cd: 0,
      burrowCooldown: 99, eggCooldown: 99, animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [nearMaggot];
    component.attackProjectiles = [];
    const hpBeforeBite = component.playerHp;

    component.updateEnemies(16);

    expect(nearMaggot.spriteBlock).toBe(1);
    expect(component.attackProjectiles).toHaveSize(0);
    expect(component.playerHp).toBeLessThan(hpBeforeBite);
  });

  it("turns the life orb green for the full Sand Maggot poison duration", () => {
    component.playerHp = 200;
    component.playerMaxHp = 200;
    component.runActive = true;
    (component as any).applyPlayerPoison({ dmg: 6 } as any);

    expect(component.playerPoisonRemaining).toBe(6);
    expect(component.isPlayerPoisoned).toBeTrue();

    (component as any).tickPlayerPoison(1000);
    expect(component.playerHp).toBeLessThan(200);
    expect(component.isPlayerPoisoned).toBeTrue();

    (component as any).tickPlayerPoison(5100);
    expect(component.playerPoisonRemaining).toBe(0);
    expect(component.isPlayerPoisoned).toBeFalse();
  });

  it("burrows wounded Sand Maggots and surfaces closer to the hero", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    const maggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 470, y: 250,
      hp: 20, maxHp: 100, speed: 80, r: 14, dmg: 6, cd: 2,
      burrowCooldown: 0, eggCooldown: 99, animationState: "move", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [maggot];
    const distanceBefore = Math.hypot(maggot.x - component.playerX, maggot.y - component.playerY);

    component.updateEnemies(16);
    expect(maggot.burrowRemaining).toBeGreaterThan(0);
    expect(maggot.spriteBlock).toBe(3);

    component.updateEnemies(900);
    const distanceAfter = Math.hypot(maggot.x - component.playerX, maggot.y - component.playerY);
    expect(distanceAfter).toBeLessThan(distanceBefore);

    component.updateEnemies(900);
    expect(maggot.burrowRemaining).toBe(0);
    expect(maggot.spriteBlock).toBe(0);
  });

  it("lays eggs that hatch into Sand Maggot Young", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    component.maggotEggs = [];
    component.attackProjectiles = [];
    const maggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 430, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 6, cd: 0,
      burrowCooldown: 99, eggCooldown: 0, animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [maggot];

    component.updateEnemies(16);

    expect(maggot.spriteBlock).toBe(2);
    expect(component.maggotEggs).toHaveSize(1);
    expect(component.attackProjectiles).toHaveSize(0);
    const proxy = component.maggotEggs[0].proxy;
    expect(proxy.eggProxy).toBeTrue();
    expect(component.enemies).toContain(proxy);

    (component as any).updateMaggotEggs(10);
    expect(component.maggotEggs).toHaveSize(0);
    expect(component.enemies).not.toContain(proxy);
    expect(component.enemies.some((enemy) => enemy.species === "sandMaggotYoung")).toBeTrue();
  });

  it("has Sand Maggot Young spit the original animated acid missile at range", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.enemies = [];
    component.attackProjectiles = [];
    const young = {
      kind: "normal", species: "sandMaggotYoung", spriteFrame: 0, x: 360, y: 250,
      hp: 30, maxHp: 30, speed: 60, r: 10, dmg: 4, cd: 0,
      animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [young];
    (component as any).rebuildEnemyGrid();

    component.updateEnemies(16);

    expect(component.attackProjectiles).toHaveSize(1);
    expect(component.attackProjectiles[0].missileId).toBe("d2-sandmaggotgoospit");
    expect(component.attackProjectiles[0].damageType).toBe("poison");
    expect(component.attackProjectiles[0].poison).toBeTrue();
  });

  it("keeps Sand Maggot Young from spitting at its old long range", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.enemies = [];
    component.attackProjectiles = [];
    const young = {
      kind: "normal", species: "sandMaggotYoung", spriteFrame: 0, x: 450, y: 250,
      hp: 30, maxHp: 30, speed: 60, r: 10, dmg: 4, cd: 0,
      animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [young];
    (component as any).rebuildEnemyGrid();

    component.updateEnemies(16);

    expect(component.attackProjectiles).toHaveSize(0);
    expect(young.x).toBeLessThan(450);
  });

  it("makes the maggots crawl slowly and keeps the young advancing between spits", () => {
    component.runActive = true;
    (component as any).worldZoom = 1;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.enemies = [];
    component.attackProjectiles = [];

    const adultSpeed = (component as any).enemyMoveSpeed({ species: "sandMaggot", speed: 120 });
    const youngSpeed = (component as any).enemyMoveSpeed({ species: "sandMaggotYoung", speed: 120 });
    expect(adultSpeed).toBeLessThan(220 * 0.25);
    expect(youngSpeed).toBeLessThan(220 * 0.3);

    // The young used to park at its 130-unit spit range and wait for its
    // cooldown. It should keep closing even when it cannot spit yet.
    const young = {
      kind: "normal", species: "sandMaggotYoung", spriteFrame: 0, x: 380, y: 250,
      hp: 30, maxHp: 30, speed: 60, r: 10, dmg: 4, cd: 2,
      animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [young];
    component.updateEnemies(500);
    expect(young.x).toBeLessThan(375);
  });

  it("makes sand leapers pursue a little faster than the hero", () => {
    component.runActive = true;
    (component as any).worldZoom = 1;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    const leaper = {
      kind: "normal", species: "leaper", spriteFrame: 0, x: 700, y: 250,
      hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 6, cd: 2,
      animationState: "idle", facingX: -1, facingY: 0,
    } as any;

    const speed = (component as any).enemyMoveSpeed(leaper);
    expect(speed).toBeGreaterThan(220);
    expect(speed).toBeLessThan(250);

    component.enemies = [leaper];
    component.updateEnemies(1000);
    expect(leaper.x).toBeLessThan(480);
  });

  it("keeps Sand Maggots advancing and drops eggs on the way in", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    component.maggotEggs = [];
    component.attackProjectiles = [];
    const maggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 700, y: 250,
      hp: 100, maxHp: 100, speed: 120, r: 14, dmg: 6, cd: 0,
      burrowCooldown: 99, eggCooldown: 0, animationState: "idle", facingX: -1, facingY: 0,
    } as any;
    component.enemies = [maggot];

    component.updateEnemies(500);
    expect(maggot.x).toBeLessThan(700);
    expect(component.maggotEggs).toHaveSize(0);

    // It closes to egg-laying range instead of parking at spit range. The
    // crawl is deliberately slow now, so give it enough time to cross the gap,
    // stopping as soon as the egg is laid so it does not hatch mid-test.
    for (let step = 0; step < 40 && component.maggotEggs.length === 0; step += 1) {
      component.updateEnemies(500);
    }
    expect(component.maggotEggs).toHaveSize(1);
  });

  it("lets the hero destroy a Sand Maggot egg before it hatches", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    component.maggotEggs = [];
    const maggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 430, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 6, cd: 0,
      burrowCooldown: 99, eggCooldown: 0, animationState: "idle", facingX: -1, facingY: 0,
    } as any;

    (component as any).laySandMaggotEgg(maggot);
    const egg = component.maggotEggs[0];
    expect(egg.proxy.hp).toBe(8);

    (component as any).queueEnemyDamage(egg.proxy, 8, "#ffffff");
    (component as any).flushPendingDamage();
    expect(egg.proxy.hp).toBeLessThanOrEqual(0);

    (component as any).updateMaggotEggs(0.1);
    expect(component.maggotEggs).toHaveSize(0);
    expect(component.enemies).not.toContain(egg.proxy);
    expect(component.enemies.some((enemy) => enemy.species === "sandMaggotYoung")).toBeFalse();
  });

  it("keeps laid Sand Maggot eggs planted when the camera moves", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    component.maggotEggs = [];
    const maggot = {
      kind: "normal", species: "sandMaggot", spriteFrame: 0, x: 430, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 6, cd: 0,
      burrowCooldown: 99, eggCooldown: 0, animationState: "idle", facingX: -1, facingY: 0,
    } as any;

    (component as any).laySandMaggotEgg(maggot);
    const egg = component.maggotEggs[0];
    const eggX = egg.x;
    const eggY = egg.y;
    const proxyX = egg.proxy.x;
    const proxyY = egg.proxy.y;

    (component as any).shiftWorldBy(40, -20);

    expect(egg.x).toBeCloseTo(eggX - 40);
    expect(egg.y).toBeCloseTo(eggY + 20);
    expect(egg.proxy.x).toBeCloseTo(proxyX - 40);
    expect(egg.proxy.y).toBeCloseTo(proxyY + 20);
    expect(egg.x).toBeCloseTo(egg.proxy.x);
    expect(egg.y).toBeCloseTo(egg.proxy.y);
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

  it("runs Holy Shield as a timed base-Defense buff instead of an attack", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Holy Shield"];
    component.skillLevels = { "Holy Shield": 1 };
    component.equipment = { ...component.equipment, shield: {
      id: "test-shield", name: "Buckler", baseName: "Buckler", slot: "armor",
      equipmentType: "shield", stats: { armor: 20 },
    } as any };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any];
    component.attackProjectiles = [];
    (component as any).holyShieldRemaining = 0;
    (component as any).skillCastCooldowns = {};

    expect((component as any).weaponRequirementForSkill("Holy Shield")).toBe("shield");
    expect((component as any).getSkillRankStats("Holy Shield", "strike", 1)).toContain("+20 base Defense while active");
    expect((component as any).getSkillRankStats("Holy Shield", "strike", 1)).toContain("Active for 12.0s when cast");

    const baseArmor = component.equippedArmor;
    const baseDamage = (component as any).applyIncomingDamage(100);
    component.activateOwnedSkill("Holy Shield");

    expect((component as any).holyShieldRemaining).toBe(12);
    expect(component.attackProjectiles).toHaveSize(0);
    expect(component.enemies[0].hp).toBe(100);
    expect(component.equippedArmor).toBe(baseArmor + 20);
    expect((component as any).applyIncomingDamage(100)).toBeLessThan(baseDamage);

    (component as any).updateSkillVisualEffects(12_100);
    expect((component as any).holyShieldRemaining).toBe(0);
    expect(component.equippedArmor).toBe(baseArmor);
    expect(component.skillCastCooldowns["Holy Shield"]).toBe(8);

    (component as any).updateAutomaticSkillCasts(8_100);
    expect((component as any).holyShieldRemaining).toBe(12);
  });

  it("mounts the original D2R Holy Shield design over the paladin's shield while active", async () => {
    component.selectedClass = "paladin";
    (component as any).heldItemMeshes.set("buckler", Promise.resolve(null));
    component.ownedSkills = ["Holy Shield"];
    component.skillLevels = { "Holy Shield": 1 };
    const shieldItem = {
      id: "holy-shield-test", name: "Buckler", baseName: "Buckler", slot: "armor",
      equipmentType: "shield", stats: { armor: 20 },
    } as any;
    component.equipment = { ...component.equipment, shield: shieldItem };

    const shieldArt = new THREE.Texture();
    shieldArt.image = { width: 100, height: 120 };
    const holyArt = new THREE.Texture();
    holyArt.image = { width: 320, height: 320 };
    (component as any).equippedItemArtTextures.set(component.inventoryItemImage(shieldItem), shieldArt);
    (component as any).equippedItemArtTextures.set("assets/d2survivors/auras/paladin/holy-shield.png", holyArt);

    const model = new THREE.Group();
    const shieldAttach = new THREE.Bone();
    shieldAttach.name = "shield_attach";
    model.add(shieldAttach);
    (component as any).configureClassMeleeWeapon(model, "paladin");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const shield = shieldAttach.children.find((child) => child.name === "equipped_shield_shield") as THREE.Group;
    const overlay = shield?.getObjectByName("holy_shield_overlay") as THREE.Group;
    expect(overlay).toBeDefined();
    expect(overlay.visible).toBeFalse();
    expect(overlay.children).toHaveSize(2);
    for (const face of overlay.children as THREE.Mesh[]) {
      expect(face.geometry).toBeInstanceOf(THREE.PlaneGeometry);
      expect((face.material as THREE.MeshBasicMaterial).map).toBe(holyArt);
    }

    (component as any).holyShieldRemaining = 5;
    (component as any).syncHolyShieldVisual();
    expect(overlay.visible).toBeTrue();

    (component as any).holyShieldRemaining = 0;
    (component as any).syncHolyShieldVisual();
    expect(overlay.visible).toBeFalse();
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

  it("preloads the Blade Sentinel aura sheet during the menu warm-up", async () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    const fetchSpy = spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();
    // The warm-up now feeds URLs through the bounded art queue, so let it drain.
    await new Promise((resolve) => setTimeout(resolve, 0));

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

  it("uses original overlay art for damaging paladin aura ticks", () => {
    expect(Object.keys(D2_PALADIN_AURA_HIT_ART).sort()).toEqual(["holyFire", "holyFreeze", "holyShock"]);
    for (const art of Object.values(D2_PALADIN_AURA_HIT_ART)) {
      expect(art.path).toContain("assets/d2survivors/effects/");
      expect(art.columns).toBeGreaterThan(0);
      expect(art.frameRate).toBeGreaterThan(0);
      expect(art.cellWidth).toBeGreaterThan(0);
      expect(art.cellHeight).toBeGreaterThan(0);
    }
    // These lengths come from the compact per-monster overlays, not the aura
    // rings or the large Hand-of-God bolt.
    expect(D2_PALADIN_AURA_HIT_ART.holyFire.columns).toBe(10);
    expect(D2_PALADIN_AURA_HIT_ART.holyFreeze.columns).toBe(16);
    expect(D2_PALADIN_AURA_HIT_ART.holyShock.columns).toBe(20);
  });

  it("gives enemies the matching elemental overlay when a damaging aura ticks", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    component.skillLevels = { "Holy Fire": 1, "Holy Freeze": 1, "Holy Shock": 1 };
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250,
      hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [enemy];
    (component as any).rebuildEnemyGrid();

    const auras = [
      { skill: "Holy Fire", key: "holyFire" },
      { skill: "Holy Freeze", key: "holyFreeze" },
      { skill: "Holy Shock", key: "holyShock" },
    ] as const;
    for (const aura of auras) {
      (component as any).applyPaladinAuraTick(aura.skill);
      expect(enemy.paladinAuraHit).toBe(aura.key);
      expect(enemy.paladinAuraHitRemaining).toBeCloseTo((component as any).paladinAuraHitDuration(aura.key), 5);
      // The compact hit overlay plays through its authored sheet once.
      expect((component as any).paladinAuraHitDuration(aura.key)).toBeCloseTo(
        D2_PALADIN_AURA_HIT_ART[aura.key].columns / D2_PALADIN_AURA_HIT_ART[aura.key].frameRate, 5,
      );
      enemy.paladinAuraHit = undefined;
      enemy.paladinAuraHitRemaining = undefined;
    }

    enemy.immunities = ["lightning"];
    (component as any).applyPaladinAuraTick("Holy Shock");
    expect(enemy.paladinAuraHit).toBeUndefined();
    expect(enemy.paladinAuraHitRemaining).toBeUndefined();
  });

  it("applies Might only to melee attacks and melee skills, not spells", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.skillLevels = { Might: 5, "Blessed Hammer": 1 };
    component.ownedSkills = ["Might", "Blessed Hammer"];
    (component as any).activePaladinAuras["Might"] = { remaining: 100, tick: 0 };

    expect((component as any).applyPaladinAuraDamage(100, true)).toBe(140);
    expect((component as any).applyPaladinAuraDamage(100)).toBe(100);
    expect((component as any).getSkillRankStats("Might", "aura", 5))
      .toContain("While active: +40% melee damage");

    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250,
      hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [enemy];
    (component as any).attackCooldown = 0;
    component.attackNearestEnemy();
    expect(enemy.hp).toBe(860);

    component.attackProjectiles.length = 0;
    component.activateOwnedSkill("Blessed Hammer");
    expect(component.attackProjectiles[0].damage).toBe(150);
  });

  it("scales Vigor's duration and movement speed with its rank", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    (component as any).worldZoom = 1;
    component.skillLevels = { Vigor: 1 };
    (component as any).activePaladinAuras["Vigor"] = { remaining: 100, tick: 0 };
    component.keysDown.add("d");

    component.movePlayer(1000);
    const rankOneStep = (component as any).playerMoveX as number;
    const rankOneDuration = (component as any).paladinAuraDuration("Vigor") as number;

    component.skillLevels["Vigor"] = 6;
    (component as any).playerMoveX = 0;
    (component as any).playerMoveY = 0;
    component.movePlayer(1000);
    const rankSixStep = (component as any).playerMoveX as number;
    const rankSixDuration = (component as any).paladinAuraDuration("Vigor") as number;

    expect(rankOneDuration).toBe(10);
    expect(rankSixDuration).toBe(20);
    expect(rankSixStep / rankOneStep).toBeCloseTo(1.24 / 1.04, 5);

    const stats = (component as any).getSkillRankStats("Vigor", "aura", 6) as string[];
    expect(stats).toContain("Active duration: 20.00s");
    expect(stats).toContain("While active: +24% movement speed");
  });

  it("extends a running Vigor aura when a skill point raises its rank", () => {
    component.selectedClass = "paladin";
    component.playerLevel = 30;
    component.ownedSkills = ["Prayer", "Cleansing", "Defiance", "Vigor"];
    component.skillLevels = { Vigor: 1 };
    component.pendingLevelUps = 1;
    component.upgradeChoices = [{ id: "class-skill:Vigor", name: "Vigor", kind: "class-skill" } as any];
    (component as any).activePaladinAuras["Vigor"] = { remaining: 5, tick: 0 };
    spyOnProperty(component, "availableClassSkills", "get").and.returnValue([{ name: "Vigor" } as any]);
    spyOn(component as any, "persistRunProgress");

    component.chooseLevelUpgrade(component.upgradeChoices[0]);

    expect(component.skillLevels["Vigor"]).toBe(2);
    expect((component as any).activePaladinAuras["Vigor"].remaining).toBeCloseTo(7, 5);
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

  it("preloads the Bone Armor sheet during the menu warm-up", async () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadArmorAuraImage").and.returnValue(Promise.resolve());
    const fetchSpy = spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadGameAssets();
    // The warm-up now feeds URLs through the bounded art queue, so let it drain.
    await new Promise((resolve) => setTimeout(resolve, 0));

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

  it("uses the baked original Frost Nova ice ring", () => {
    expect(FROST_NOVA_ART.path).toBe("assets/d2survivors/effects/frost-nova-ring.png");
    expect(FROST_NOVA_ART.size).toBe(1024);
    expect(FROST_NOVA_ART.duration).toBeCloseTo(14 / 16, 5);
  });

  it("uses the baked original Nova electric ring", () => {
    expect(NOVA_RING_ART.path).toBe("assets/d2survivors/effects/nova-ring.png");
    expect(NOVA_RING_ART.cell).toBe(512);
    expect(NOVA_RING_ART.frames).toBe(6);
    expect(NOVA_RING_ART.frameRate).toBeGreaterThan(0);
  });

  it("gives Thunder Storm the original 19-frame looping aura sheet", () => {
    expect(THUNDER_STORM_ART.columns).toBe(19);
    expect(THUNDER_STORM_ART.rows).toBe(1);
    expect(THUNDER_STORM_ART.path).toBe("assets/d2survivors/auras/thunderstorm.png");
    expect(THUNDER_STORM_ART.originX).toBeLessThan(THUNDER_STORM_ART.cell);
    expect(THUNDER_STORM_ART.originY).toBeLessThan(THUNDER_STORM_ART.cell);
  });

  it("imports all three original Hydra head variants as 12x16 summon atlases", () => {
    for (const [species, art] of Object.entries(HYDRA_ART)) {
      expect(art.path).withContext(species).toContain(`hydra-${species.slice(-1)}.png`);
      expect(art.columns).withContext(species).toBe(12);
      expect(art.rows).withContext(species).toBe(16);
      expect(art.cellWidth).withContext(species).toBeGreaterThan(0);
      expect(art.cellHeight).withContext(species).toBeGreaterThan(0);
    }
  });

  it("raises three untargetable Hydra heads and fires one bolt from each head per volley", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Hydra"];
    component.skillLevels = { Hydra: 1, "Fire Bolt": 1, "Fire Ball": 1, "Fire Mastery": 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).hydraGroupSequence = 0;

    component.activateOwnedSkill("Hydra");

    const heads = component.enemies.filter((enemy) => enemy.summonType === "hydra");
    expect(heads.length).toBe(3);
    expect(new Set(heads.map((head) => head.species))).toEqual(new Set(["hydra1", "hydra2", "hydra3"]));
    expect(heads.every((head) => head.hydraRemaining === 10)).toBeTrue();
    expect(component.attackProjectiles.length).toBe(0);

    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 340, y: 250,
      hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies.push(target);
    (component as any).rebuildEnemyGrid();
    for (const head of heads) {
      head.hydraStartup = 0;
      head.hydraVolleyCooldown = 0;
      (component as any).updateHydraHead(head, 0.01);
    }

    expect(component.attackProjectiles.length).toBe(3);
    expect(heads.every((head) => head.hydraVolleysFired === 1)).toBeTrue();
    expect(component.attackProjectiles.every((projectile) => projectile.missileId === "d2-firebolt"
      && projectile.damageType === "fire")).toBeTrue();

    // Eight volleys per head: the first fired above, then seven more.
    component.attackProjectiles = [];
    for (let volley = 1; volley < 8; volley += 1) {
      for (const head of heads) {
        head.hydraVolleyCooldown = 0;
        (component as any).updateHydraHead(head, 0.01);
      }
    }
    expect(component.attackProjectiles.length).toBe(21);
    expect(heads.every((head) => head.hydraVolleysFired === 8)).toBeTrue();
    component.attackProjectiles = [];
    for (const head of heads) {
      head.hydraVolleyCooldown = 0;
      (component as any).updateHydraHead(head, 0.01);
    }
    expect(component.attackProjectiles.length).toBe(0);

    for (let cast = 0; cast < 7; cast += 1) component.activateOwnedSkill("Hydra");
    expect(component.enemies.filter((enemy) => enemy.summonType === "hydra").length).toBe(18);
  });

  it("scales Hydra bolts with Fire Bolt, Fire Ball and Fire Mastery ranks", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = { Hydra: 1 };
    const base = (component as any).hydraBoltDamage();
    component.skillLevels = { Hydra: 1, "Fire Bolt": 1 };
    const withFireBolt = (component as any).hydraBoltDamage();
    component.skillLevels = { Hydra: 1, "Fire Bolt": 1, "Fire Ball": 1 };
    const withFireBall = (component as any).hydraBoltDamage();
    component.skillLevels = { Hydra: 1, "Fire Bolt": 1, "Fire Ball": 1, "Fire Mastery": 1 };
    const withMastery = (component as any).hydraBoltDamage();
    expect(withFireBolt).toBeGreaterThan(base);
    expect(withFireBall).toBeGreaterThan(withFireBolt);
    expect(withMastery).toBeGreaterThan(withFireBall);
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
    expect(effect.fieldRadius).toBe(145);
    expect(inside.coldRemaining).toBeGreaterThan(0.9);
    expect(edge.coldRemaining).toBeGreaterThan(0.9);
    expect(outside.coldRemaining).toBeUndefined();
  });

  it("keeps a Thunder Storm aura and bolts a random nearby monster", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Thunder Storm"];
    component.skillLevels = { "Thunder Storm": 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const nearby = { ...base };
    const far = { ...base, x: 700 };
    component.enemies = [nearby, far];
    component.attackProjectiles = [];
    (component as any).thunderStormStrikes.length = 0;
    (component as any).rebuildEnemyGrid();
    const hits: any[] = [];
    spyOn(component as any, "queueEnemyDamage").and.callFake((enemy: any) => hits.push(enemy));

    component.activateOwnedSkill("Thunder Storm");

    expect((component as any).thunderStormRemaining).toBeGreaterThan(0);
    expect(component.attackProjectiles.length).toBe(0);

    (component as any).updateThunderStorm(0.4);

    expect(hits).toEqual([nearby]);
    expect((component as any).thunderStormStrikes.length).toBe(1);
    expect((component as any).thunderStormStrikes[0].x).toBe(nearby.x);

    (component as any).updateThunderStorm((component as any).thunderStormRemaining + 1);

    expect((component as any).thunderStormRemaining).toBe(0);
  });

  it("casts Teeth as bone projectiles instead of skipping them as melee", () => {
    component.selectedClass = "necromancer";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Teeth"];
    component.skillLevels = { Teeth: 5 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Teeth");

    expect(component.attackProjectiles.length).toBe(6);
    expect((component.attackProjectiles as any[]).every((projectile) => projectile.kind === "bone")).toBeTrue();
  });

  it("casts Poison Nova as an original D2 ring that poisons every enemy inside it", () => {
    component.selectedClass = "necromancer";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Poison Nova"];
    component.skillLevels = { "Poison Nova": 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    const edge = { ...base, x: 490 };
    const outside = { ...base, x: 510 };
    component.enemies = [inside, edge, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();
    const hits: any[] = [];
    spyOn(component as any, "queueEnemyDamage").and.callFake((enemy: any) => hits.push(enemy));

    component.activateOwnedSkill("Poison Nova");

    expect(hits).toContain(inside);
    expect(hits).toContain(edge);
    expect(hits).not.toContain(outside);
    expect(component.attackProjectiles.length).toBe(0);
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.poisonNova);
    expect(effect).toBeTruthy();
    expect(effect.stationary).toBeTrue();
    expect(effect.fieldRadius).toBe(230);
    expect(effect.duration).toBeGreaterThan(0.5);
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

  it("makes regular and bone fetishes scurry toward the hero a little faster", () => {
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const fetish = { ...base, species: "fetish" } as any;
    const boneFetish = { ...base, species: "boneFetish" } as any;
    const shaman = { ...base, species: "fetishShaman" } as any;

    expect((component as any).enemyMoveSpeed(base)).toBe(100);
    expect((component as any).enemyMoveSpeed(fetish)).toBe(120);
    expect((component as any).enemyMoveSpeed(boneFetish)).toBe(120);
    expect((component as any).enemyMoveSpeed(shaman)).toBe(100);
  });

  it("keeps monsters out of the wall mask and steers them around it", () => {
    const width = 120;
    const height = 100;
    const blocked = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      blocked[y * width + 50] = 1;
      blocked[y * width + 51] = 1;
    }
    const wallContext = {
      mask: { width, height, blocked },
      geometry: { scale: 1, width, height, left: 0, top: 0 },
      wraps: false,
      clearance: 1,
      blocksSight: true,
    } as any;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const enemy = {
      kind: "normal", species: "fallen", x: 40, y: 50, hp: 100, maxHp: 100,
      speed: 100, r: 14, dmg: 2, pathSide: 1,
    } as any;

    expect((component as any).campaignStepBlocked(wallContext, 45, 50, 10, 0)).toBeTrue();
    const step = (component as any).enemyWallAwareStep(wallContext, enemy, 1, 0, 20, 100, 50);

    expect(step.x).toBeLessThan(50);
    expect(step.y).toBeGreaterThan(50);
  });

  it("does not let a melee monster attack through a wall", () => {
    const width = 120;
    const height = 100;
    const blocked = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      blocked[y * width + 50] = 1;
      blocked[y * width + 51] = 1;
    }
    const wallContext = {
      mask: { width, height, blocked },
      geometry: { scale: 1, width, height, left: 0, top: 0 },
      wraps: false,
      clearance: 1,
      blocksSight: true,
    } as any;
    component.currentAct = 1;
    component.playerX = 56;
    component.playerY = 50;
    component.playerHp = 100;
    component.playerMaxHp = 100;
    component.enemies = [{
      kind: "normal", species: "fallen", x: 45, y: 50, hp: 100, maxHp: 100,
      speed: 0, r: 14, dmg: 5, cd: 0, attackAnimationTime: 0,
    } as any];
    spyOn(component as any, "campaignCollisionContext").and.returnValue(wallContext);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    (component as any).updateEnemies(16);

    expect(component.playerHp).toBe(100);
  });

  it("fires Ice Bolt as a single-target cold projectile", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Ice Bolt"];
    component.skillLevels = { "Ice Bolt": 1 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Ice Bolt");

    const bolt = component.attackProjectiles[0];
    expect(bolt.cold).toBeTrue();
    expect(bolt.impactRadius).toBeUndefined();
    expect(bolt.color).toBe("#8bdcff");
  });

  it("deals Ice Blast damage in an area and freezes every monster caught", () => {
    component.selectedClass = "sorceress";
    (component as any).worldZoom = 1;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Ice Blast"];
    component.skillLevels = { "Ice Blast": 1 };
    const primary = { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const nearby = { ...primary, x: 426 };
    const outside = { ...primary, x: 520 };
    component.enemies = [primary, nearby, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Ice Blast");

    const blast = component.attackProjectiles[0];
    expect(blast.missileId).toBe("d2-iceblast");
    expect(blast.target).toBeUndefined();
    expect(blast.impactRadius).toBe(48);
    expect(blast.freezeSeconds).toBe(1.6);
    expect(blast.color).toBe("#8bdcff");
    for (let frame = 0; frame < 40; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(primary.hp).toBeLessThan(100);
    expect(nearby.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    expect(primary.freezeRemaining).toBeCloseTo(1.6);
    expect(nearby.freezeRemaining).toBeCloseTo(1.6);
    expect(outside.freezeRemaining).toBeUndefined();

    primary.animationState = "attack";
    primary.attackAnimationTime = 0.3;
    const frozenX = primary.x;
    component.updateEnemies(16);
    expect(primary.x).toBe(frozenX);
    expect(primary.animationState).toBe("idle");
    expect(primary.attackAnimationTime).toBe(0);
    expect((component as any).enemyMoveSpeed(primary)).toBe(0);
  });

  it("casts Blizzard as a falling storm over the target pack", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Blizzard"];
    component.skillLevels = { Blizzard: 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Blizzard");

    const storms = (component as any).playerBlizzards as any[];
    expect(component.attackProjectiles).toHaveSize(0);
    expect(storms).toHaveSize(1);
    expect(storms[0].x).toBe(400);
    expect(storms[0].shards).toHaveSize(24);
    expect(storms[0].duration).toBe(2.4);
  });

  it("damages and chills every monster inside the Blizzard storm", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Blizzard"];
    component.skillLevels = { Blizzard: 1 };
    const primary = { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const nearby = { ...primary, x: 450 };
    const outside = { ...primary, x: 600 };
    component.enemies = [primary, nearby, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Blizzard");
    (component as any).rebuildEnemyGrid();
    (component as any).updatePlayerBlizzards(2);
    (component as any).flushPendingDamage();

    expect(primary.hp).toBeLessThan(100);
    expect(nearby.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    expect(primary.coldRemaining).toBeGreaterThan(0);
    expect(nearby.coldRemaining).toBeGreaterThan(0);
    expect(outside.coldRemaining).toBeUndefined();
  });

  it("draws Blizzard with the original falling-shard and impact cels", () => {
    component.runActive = true;
    (component as any).projectionDpr = 1;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "isArenaPointOnScreen").and.returnValue(true);
    const draw = spyOn(component as any, "drawImportedMissileFrame");
    (component as any).playerBlizzards = [{
      x: 250, y: 250, time: 0.35, duration: 2.4, radius: 110, damagePerShard: 10, seed: 0,
      shards: [
        { x: 250, y: 250, delay: 0.55, fallArt: "d2-icestormfallvar01", impactArt: "d2-icestormimpactvar01", hit: false },
        { x: 260, y: 250, delay: 0.25, fallArt: "d2-icestormfallvar02", impactArt: "d2-icestormimpactvar02", hit: true },
      ],
    }];

    (component as any).drawPlayerBlizzards({} as any);

    const arts = draw.calls.allArgs().map((args) => args[1]);
    expect(arts).toContain("d2-icestormfallvar01");
    expect(arts).toContain("d2-icestormimpactvar02");
  });

  it("channels Inferno in a short wide cone and cancels it when the caster moves", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Inferno"];
    component.skillLevels = { Inferno: 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 350, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    // At 32 degrees off-centre this was outside the old 15-degree beam but is
    // inside the new close, wide breath.
    const wide = { ...base, x: 330, y: 300 };
    const far = { ...base, x: 430, y: 250 };
    const behind = { ...base, x: 30 };
    const offCone = { ...base, x: 280, y: 370 };
    component.enemies = [inside, wide, far, behind, offCone];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Inferno");

    expect(component.attackProjectiles.length).toBe(0);
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.inferno);
    expect(effect).toBeTruthy();
    expect(effect.duration).toBeCloseTo(1);
    expect(effect.coneRange).toBe(128);
    expect(effect.coneHalfAngle).toBeCloseTo(Math.PI / 5);

    (component as any).updateSkillVisualEffects(0.6);
    (component as any).flushPendingDamage();

    expect(inside.hp).toBeLessThan(1000);
    expect(wide.hp).toBeLessThan(1000);
    expect(far.hp).toBe(1000);
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

  it("does not fire the basic attack when nothing is in its reach", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).basicAttackSpell = "Fire Bolt";
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).attackCooldown = 0;

    (component as any).updateBasicAttack();
    // Empty arena: the basic-attack spell must not cast down the hero's facing.
    expect(component.attackProjectiles.length).toBe(0);

    // A monster inside the spell's range turns the attack back on.
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0, x: 250 + 300, y: 250,
      hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2, cd: 0,
    } as any];
    (component as any).rebuildEnemyGrid();
    (component as any).updateBasicAttack();
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
  });

  it("gates the basic-attack spell on its own reach instead of one flat range", () => {
    component.playerX = 250;
    component.playerY = 250;
    (component as any).skillCastCooldowns = {};
    const enemyAt = (distance: number) => [{
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 250 + distance, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2, cd: 0,
    } as any];

    // Arctic Blast is a 210-unit cone, so a monster 300 units out is not in it.
    component.selectedClass = "druid";
    component.ownedSkills = ["Arctic Blast"];
    component.skillLevels = { "Arctic Blast": 1 };
    (component as any).basicAttackSpell = "Arctic Blast";
    component.enemies = enemyAt(300);
    expect((component as any).hasEnemyInBasicAttackRange()).toBeFalse();
    component.enemies = enemyAt(180);
    expect((component as any).hasEnemyInBasicAttackRange()).toBeTrue();

    // Inferno only breathes 128 units.
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Inferno"];
    component.skillLevels = { Inferno: 1 };
    (component as any).basicAttackSpell = "Inferno";
    component.enemies = enemyAt(300);
    expect((component as any).hasEnemyInBasicAttackRange()).toBeFalse();
    component.enemies = enemyAt(100);
    expect((component as any).hasEnemyInBasicAttackRange()).toBeTrue();

    // Blaze burns under the sorceress's own feet, so it needs no monster at all.
    component.ownedSkills = ["Blaze"];
    component.skillLevels = { Blaze: 1 };
    (component as any).basicAttackSpell = "Blaze";
    component.enemies = [];
    expect((component as any).hasEnemyInBasicAttackRange()).toBeTrue();

    // A plain missile spell keeps its full travel: 300 units still counts.
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    (component as any).basicAttackSpell = "Fire Bolt";
    component.enemies = enemyAt(300);
    expect((component as any).hasEnemyInBasicAttackRange()).toBeTrue();
  });

  it("shift-click attacks toward the pointer instead of walking there", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.attackProjectiles = [];
    (component as any).attackCooldown = 0;
    // Empty ground: the swing still plays, but nothing is thrown and no move
    // command is left behind.
    component.enemies = [];
    (component as any).attackTowardPoint(400, 250);
    expect(component.attackProjectiles.length).toBe(0);
    expect((component as any).playerFacingX).toBeCloseTo(1, 6);

    // A monster already at weapon length takes the hit without the hero moving.
    const adjacent = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250,
      hp: 400, maxHp: 400, speed: 0, r: 14, dmg: 2, cd: 0,
    } as any;
    component.enemies = [adjacent];
    (component as any).rebuildEnemyGrid();
    (component as any).attackCooldown = 0;
    (component as any).attackTowardPoint(268, 250);
    expect(adjacent.hp).toBeLessThan(400);
    expect(component.playerX).toBe(250);
    expect(component.playerY).toBe(250);

    // With a spell in the basic slot the shift-click casts it at the point, even
    // with no monster nearby.
    component.selectedClass = "sorceress";
    (component as any).basicAttackSpell = "Fire Bolt";
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).attackCooldown = 0;
    (component as any).attackTowardPoint(450, 250);
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.attackProjectiles[0].targetX).toBeGreaterThan(250);
  });

  it("turns a spirit to face the row of the direction it drifts", () => {
    // The spirit sheets now carry eight rows, so a drift up-left or down-right
    // shows its own diagonal instead of snapping to the back or front view.
    // Rows: 0 left, 1 up-left, 2 up, 3 up-right, 4 right, 5 down-right, 6 down,
    // 7 down-left.
    expect(enemySpriteRow("heartOfWolverine", -1, 0.2)).toBe(0);
    expect(enemySpriteRow("heartOfWolverine", 1, -0.2)).toBe(4);
    expect(enemySpriteRow("heartOfWolverine", 0.2, 1)).toBe(6);
    expect(enemySpriteRow("heartOfWolverine", -0.2, -1)).toBe(2);
    // Drifting up-left and down-right use their own diagonal rows instead of
    // snapping back to the front or back view.
    expect(enemySpriteRow("heartOfWolverine", -1, -1)).toBe(1);
    expect(enemySpriteRow("heartOfWolverine", -1, 1)).toBe(7);
    expect(enemySpriteRow("heartOfWolverine", 1, -1)).toBe(3);
    expect(enemySpriteRow("heartOfWolverine", 1, 1)).toBe(5);
    expect(enemySpriteDirectionRow("heartOfWolverine", "move", 8, 1)).toBe(1);
    expect(enemySpriteDirectionRow("heartOfWolverine", "move", 8, 3)).toBe(3);
  });

  it("faces a wereform the way the hero is walking on screen", () => {
    // The hero's facing vector is a world-plane vector, which the arena rotates
    // 45 degrees and squashes 2:1 on the way to the screen. Picking the wereform
    // row from it directly played the opposite horizontal row, so left and right
    // ran backwards. These are the world vectors the movement keys produce.
    // Rows: 0 left, 1 up-left, 2 up, 3 up-right, 4 right, 5 down-right, 6 down,
    // 7 down-left.
    expect(wereformRow(-1, 1)).toBe(0);
    expect(wereformRow(1, -1)).toBe(4);
    expect(wereformRow(-1, -1)).toBe(2);
    expect(wereformRow(1, 1)).toBe(6);
    expect(wereformRow(-1, 0)).toBe(1);
    expect(wereformRow(0, -1)).toBe(3);
    expect(wereformRow(1, 0)).toBe(5);
    expect(wereformRow(0, 1)).toBe(7);
  });

  it("sizes the reviewed monsters from their tallest walk cel", () => {
    // 90 table pixels is one hero height. These four were still on their old
    // guesses and drew shorter than the hero; each now reads its own tallest
    // walk cel (87, 103, 105 and 99 source pixels) converted by 90/77.
    expect(enemyD2PixelHeight("deathMauler")).toBe(102);
    expect(enemyD2PixelHeight("spiderDemon")).toBe(120);
    expect(enemyD2PixelHeight("council")).toBe(123);
    expect(enemyD2PixelHeight("grizzly")).toBe(116);
    for (const species of ["deathMauler", "spiderDemon", "council", "grizzly"] as const) {
      expect(enemyD2PixelHeight(species)).toBeGreaterThanOrEqual(90);
    }
    // The tallest creature in the table still towers over all of them.
    expect(enemyD2PixelHeight("balrog")).toBeGreaterThan(enemyD2PixelHeight("council"));
  });

  it("sizes the remaining single-layer monsters from their tallest walk cel", () => {
    // Same conversion as the reviewed monsters: tallest walk cel * (90 / 77),
    // measured with tools/measure_walk_cels.py. The source heights are 73, 138,
    // 123, 89, 109, 100, 89, 63, 64, 73 and 95 pixels.
    const measured = [
      ["goatman", 85], ["blunderbore", 161], ["sandRaider", 144], ["scarab", 104],
      ["wendigo", 127], ["salamander", 117], ["painWorm", 104], ["wolf", 74],
      ["golem", 75], ["bloodGolem", 85], ["ironGolem", 111],
    ] as const;
    for (const [species, height] of measured) {
      expect(enemyD2PixelHeight(species)).toBe(height);
    }
    // A goatman is a little shorter than the hero, an Act V wendigo is not.
    expect(enemyD2PixelHeight("goatman")).toBeLessThan(90);
    expect(enemyD2PixelHeight("wendigo")).toBeGreaterThan(90);
    expect(enemyD2PixelHeight("blunderbore")).toBeGreaterThan(enemyD2PixelHeight("ironGolem"));
  });

  it("never drops a plain white ring", () => {
    // D2 rings have no unenchanted version, so the ring base always arrives with
    // magic on it instead of as the bare "Ring" in the base pool.
    const rings: any[] = [];
    for (let index = 0; index < 900; index += 1) {
      const item = (component as any).randomItem(40) as any;
      if (item.equipmentType === "ring" || /ring/i.test(item.baseName ?? "")) rings.push(item);
    }
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.every((ring) => ring.rarity !== "normal")).toBeTrue();
  });

  it("never drops a plain white amulet", () => {
    // Amulets have no unenchanted version either, so the "Amulet" base arrives
    // with magic on it instead of as a bare white item.
    const amulets: any[] = [];
    for (let index = 0; index < 900; index += 1) {
      const item = (component as any).randomItem(40) as any;
      if (item.equipmentType === "amulet" || /amulet/i.test(item.baseName ?? "")) amulets.push(item);
    }
    expect(amulets.length).toBeGreaterThan(0);
    expect(amulets.every((amulet) => amulet.rarity !== "normal")).toBeTrue();
    expect(amulets.every((amulet) => ["magic", "rare", "set", "unique"].includes(amulet.rarity)))
      .toBeTrue();
  });

  it("keeps one druid spirit and auto-casts only the best owned one", () => {
    const spiritSkills = (): string[] => (component.enemies as any[])
      .filter((enemy) => enemy.summonType === "druid" && enemy.hp > 0 && enemy.summonSkill)
      .map((enemy) => enemy.summonSkill as string);
    const autoCast = (levels: Record<string, number>): string[] => {
      component.selectedClass = "druid";
      component.ownedSkills = Object.keys(levels);
      component.skillLevels = { ...levels };
      component.enemies = [];
      for (const skill of Object.keys(component.skillCastCooldowns)) delete component.skillCastCooldowns[skill];
      (component as any).updateAutomaticSkillCasts(16);
      return spiritSkills();
    };

    expect(autoCast({ "Oak Sage": 1 })).toEqual(["Oak Sage"]);
    // A point in Heart of Wolverine takes the automatic cast over.
    expect(autoCast({ "Oak Sage": 1, "Heart of Wolverine": 1 })).toEqual(["Heart of Wolverine"]);
    // Spirit of Barbs outranks both, so it is the only one kept up.
    expect(autoCast({ "Oak Sage": 1, "Heart of Wolverine": 1, "Spirit of Barbs": 1 }))
      .toEqual(["Spirit of Barbs"]);

    // Casting an older spirit by hand still works, and it replaces the current
    // spirit without the caster immediately swapping it back.
    component.activateOwnedSkill("Oak Sage");
    expect(spiritSkills()).toEqual(["Oak Sage"]);
    (component as any).updateAutomaticSkillCasts(16);
    expect(spiritSkills()).toEqual(["Oak Sage"]);
  });

  it("casts Firestorm as three lines of ground fire, one of them straight", () => {
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

    // Rank lengthens the run, so two seconds is enough for all three lines to
    // burn out and drop their last patch.
    (component as any).updateSkillVisualEffects(2000);
    const patches = (component as any).blazeFirePatches;
    expect((component as any).firestormTrails.length).toBe(0);
    expect(patches.length).toBeGreaterThan(4);
    const farthest = Math.max(...patches.map((patch: any) => Math.hypot(patch.x - 250, patch.y - 250)));
    expect(farthest).toBeGreaterThan(120);
    expect(farthest).toBeLessThan(260);
    // The two outer lines weave off the straight middle one, which D2 keeps
    // running dead ahead of the druid.
    expect(patches.some((patch: any) => Math.abs(patch.y - 250) > 5)).toBeTrue();
    expect(patches.some((patch: any) => Math.abs(patch.y - 250) <= 5)).toBeTrue();
  });

  it("casts Poison Explosion at range and opens a poison well under the target", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Poison Explosion"];
    component.skillLevels = { "Poison Explosion": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 450, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    const far = { ...target, x: 650 } as any;
    component.enemies = [target, far];
    component.floatingTexts = [];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects.length = 0;
    (component as any).poisonClouds.length = 0;
    (component as any).playerAttackLockRemaining = 0;
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Poison Explosion");

    expect(component.attackProjectiles.length).toBe(0);
    const burst = (component as any).skillVisualEffects.find((effect: any) => effect.poisonExplosion);
    expect(burst).toBeTruthy();
    expect(burst.missileId).toBe("d2-poisonsparks");
    expect(burst.x).toBeCloseTo(target.x);
    expect(burst.y).toBeCloseTo(target.y);
    expect((component as any).poisonClouds.length).toBe(1);
    const cloud = (component as any).poisonClouds[0];
    expect(cloud.x).toBeCloseTo(target.x);
    expect(cloud.y).toBeCloseTo(target.y);
    expect(cloud.radius).toBe(58);

    // The well itself poisons everything inside on its first tick; the cast no
    // longer applies a separate single-target melee hit.
    expect(target.hp).toBe(100);
    (component as any).updatePoisonClouds(0.016);
    (component as any).flushPendingDamage();
    expect(target.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
  });

  it("poisons every enemy inside the Poison Explosion cloud", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Poison Explosion"];
    component.skillLevels = { "Poison Explosion": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 450, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    const inside = { ...target, x: 490 } as any;
    const outside = { ...target, x: 620 } as any;
    component.enemies = [target, inside, outside];
    component.floatingTexts = [];
    (component as any).poisonClouds.length = 0;
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Poison Explosion");
    (component as any).updatePoisonClouds(0.016);
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
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 450, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
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
      .toContain("Ranged cast: a 112-unit poison well opens at the target's location");
  });

  it("keeps the melee attack plus the four most recently cast skills in the HUD", () => {
    component.selectedClass = "necromancer";
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Bone Armor", "Bone Wall", "Corpse Explosion", "Poison Explosion", "Bone Spear"];
    (component as any).isPlayerMoving = false;
    (component as any).playerChargeRemaining = 0;
    component.keysDown.clear();

    for (const skill of ["Bone Armor", "Bone Wall", "Corpse Explosion", "Poison Explosion", "Bone Spear"]) {
      (component as any).recordRecentSkill(skill);
    }

    expect(component.equippedSkills).toEqual(["Bone Wall", "Corpse Explosion", "Poison Explosion", "Bone Spear"]);

    component.activateOwnedSkill("Bone Armor");
    expect(component.equippedSkills).toEqual(["Corpse Explosion", "Poison Explosion", "Bone Spear", "Bone Armor"]);
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

    expect(component.getSkillMissileOverlay("Fire Wall")).toBe("d2-groundfirebig");
    expect(component.attackProjectiles.length).toBe(1);
    const wall = component.attackProjectiles[0] as any;
    expect(wall.fireWall).toBeTrue();
    expect(wall.life).toBe(4);
    expect(wall.missileId).toBe("d2-groundfirebig");
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

  it("draws the original 37-frame groundFireBig strip and advances its animation", () => {
    const frames = Array.from({ length: 37 }, () => ({ width: 63, height: 160 }));
    (component as any).missileOverlayImages.set("d2-groundfirebig", frames);
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
      wallHalfLength: 84, missileId: "d2-groundfirebig",
    } as any;

    (component as any).drawFireWall(ctx, wall);

    expect(drawImage).toHaveBeenCalled();
    expect(frames).toContain(drawImage.calls.mostRecent().args[0]);
    expect(ctx.filter).toBe("");

    const firstAgeFrame = drawImage.calls.argsFor(0)[0];
    wall.age = 1.6;
    (component as any).drawFireWall(ctx, wall);
    expect(drawImage.calls.mostRecent().args[0]).not.toBe(firstAgeFrame);
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

  it("uses both imported 15-frame Inferno strips", () => {
    expect(INFERNO_ART.frames).toBe(30);
    expect(INFERNO_ART.path).toBe("assets/d2survivors/effects/inferno.png");
  });

  it("draws Frost Nova as one expanding ring scaled to the field radius", () => {
    const art = FROST_NOVA_ART;
    const sheet = {
      complete: true,
      naturalWidth: art.size,
      naturalHeight: art.size,
    } as HTMLImageElement;
    spyOn(component as any, "ensureFrostNovaSheet").and.returnValue(sheet);
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const effect = { frostNova: true, x: 300, y: 300, time: 0.5, duration: art.duration, fieldRadius: 132, seed: 0 } as any;

    (component as any).drawFrostNovaRing(ctx, effect, { x: 300, y: 300 });

    const calls = drawImage.calls.allArgs() as any[][];
    expect(calls.length).toBe(1);
    const [image, x, y, width, height] = calls[0];
    expect(image).toBe(sheet);
    expect(x).toBeCloseTo(300 - 132, 5);
    expect(y).toBeCloseTo(300 - 132, 5);
    expect(width).toBeCloseTo(264, 5);
    expect(height).toBeCloseTo(264, 5);
  });

  it("casts Nova as the original ElectricNova ring and damages nearby enemies", () => {
    component.selectedClass = "sorceress";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Nova"];
    component.skillLevels = { Nova: 1 };
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    const outside = { ...base, x: 450 };
    component.enemies = [inside, outside];
    component.attackProjectiles = [];
    (component as any).rebuildEnemyGrid();
    const hits: any[] = [];
    spyOn(component as any, "queueEnemyDamage").and.callFake((enemy: any) => hits.push(enemy));

    component.activateOwnedSkill("Nova");

    expect(hits).toContain(inside);
    expect(hits).not.toContain(outside);
    expect(component.attackProjectiles).toHaveSize(0);
    const effect = (component as any).skillVisualEffects.find((entry: any) => entry.lightningNova);
    expect(effect).toBeTruthy();
    expect(effect.fieldRadius).toBe(145);
    expect(effect.duration).toBeCloseTo(13 * 0.06, 5);
  });

  it("tiles the imported LightningBolt cel down the full screen with forks", () => {
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined,
      translate: () => undefined, rotate: () => undefined,
      drawImage,
    } as any;
    (component as any).skillEffectsCanvasRef = {
      nativeElement: {
        clientWidth: 1000, width: 1000, height: 600,
        getContext: () => ({ clearRect: () => undefined }),
      },
    };
    (component as any).missileOverlayImages.set("d2-lightningbolt", [{ width: 43, height: 98 }]);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const effect = {
      lightningRail: true, x: 100, y: 300, targetX: 5000, targetY: 300,
      time: 0.1, duration: 0.32, seed: 7,
    } as any;

    (component as any).drawLightningRail(ctx, effect);

    const calls = drawImage.calls.allArgs() as any[][];
    const widthOf = (call: any[]) => call[3] as number;
    const heightOf = (call: any[]) => call[4] as number;
    // Each stamp keeps the cel's authored 43x98 proportions; the arc covers the
    // screen by repeating the cel, not by stretching one copy over it.
    for (const call of calls) {
      expect(heightOf(call) / widthOf(call)).toBeCloseTo(98 / 43, 5);
    }
    const mainWidth = 48;
    const main = calls.filter((call) => Math.abs(widthOf(call) - mainWidth) < 0.01);
    const forks = calls.filter((call) => widthOf(call) < mainWidth - 1);
    const tileLength = mainWidth * (98 / 43);
    expect(main.length).toBeGreaterThanOrEqual(10);
    // The tiles start behind the caster and step 80% of their own length, so the
    // last one still starts inside the canvas and reaches the screen edge.
    expect((main.length - 1) * tileLength * 0.8).toBeGreaterThan(900);
    expect((main.length - 1) * tileLength * 0.8).toBeLessThan(1000 + 48);
    expect(forks.length).toBeGreaterThanOrEqual(2);
  });

  it("draws Nova as one animated ring that expands to the field radius", () => {
    const art = NOVA_RING_ART;
    const sheet = {
      complete: true,
      naturalWidth: art.cell * art.frames,
      naturalHeight: art.cell,
    } as HTMLImageElement;
    spyOn(component as any, "ensureNovaRingSheet").and.returnValue(sheet);
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = { save: () => undefined, restore: () => undefined, drawImage } as any;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const effect = { lightningNova: true, x: 300, y: 300, time: 0.3, duration: 0.78, fieldRadius: 132 } as any;

    (component as any).drawLightningNovaRing(ctx, effect, { x: 300, y: 300 });

    const calls = drawImage.calls.allArgs() as any[][];
    expect(calls.length).toBe(1);
    const [image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height] = calls[0];
    const progress = 0.3 / 0.78;
    const reach = 1 - Math.pow(1 - Math.min(1, progress / 0.55), 2.2);
    expect(image).toBe(sheet);
    expect(sourceX).toBe((Math.floor(0.3 * art.frameRate) % art.frames) * art.cell);
    expect(sourceY).toBe(0);
    expect(sourceWidth).toBe(art.cell);
    expect(sourceHeight).toBe(art.cell);
    expect(x).toBeCloseTo(300 - 132 * reach, 5);
    expect(y).toBeCloseTo(300 - 132 * reach, 5);
    expect(width).toBeCloseTo(264 * reach, 5);
    expect(height).toBeCloseTo(264 * reach, 5);
  });

  it("blocks Act III trees and water while leaving bridge decks walkable", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[50 * 100 + 55] = 1;
    mask.blocked[50 * 100 + 50] = 1;
    (component as any).campaignCollisionMasks[3] = mask;
    (component as any).currentAct = 3;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    // The hero is already overlapped by scenery here, so movement toward
    // clearer ground may escape, but stepping onto another blocked pixel may not.
    expect((component as any).campaignTerrainBlocks(-5, 0)).toBeFalse();
    expect((component as any).campaignTerrainBlocks(5, 0)).toBeTrue();

    mask.blocked[50 * 100 + 50] = 0;
    expect((component as any).campaignTerrainBlocks(5, 0)).toBeTrue();
    expect((component as any).campaignTerrainBlocks(0, 5)).toBeFalse();
  });

  it("moves Act III monster spawns out of blocked jungle cells", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[60 * 100 + 60] = 1;
    (component as any).campaignCollisionMasks[3] = mask;
    (component as any).currentAct = 3;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    const spawn = (component as any).campaignClearSpawnPoint(60, 60);

    expect(spawn).not.toEqual({ x: 60, y: 60 });
    const context = (component as any).campaignCollisionContext();
    expect((component as any).campaignBlockedAt(context, spawn.x, spawn.y)).toBeFalse();
    expect((component as any).campaignBlockedSamples(context, spawn.x, spawn.y)).toBe(0);
  });

  it("does not let a monster slide deeper into an Act III water cell", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[50 * 100 + 50] = 1;
    mask.blocked[50 * 100 + 55] = 1;
    (component as any).campaignCollisionMasks[3] = mask;
    (component as any).currentAct = 3;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const context = (component as any).campaignCollisionContext();

    // An enemy already overlapping the bank may walk back to clear ground,
    // but it cannot use the overlap to take another step into the barrier.
    expect((component as any).campaignStepBlocked(context, 50, 50, -5, 0, true)).toBeFalse();
    expect((component as any).campaignStepBlocked(context, 50, 50, 5, 0, true)).toBeTrue();
  });

  it("does not land Leap inside Act III water", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    for (let x = 58; x <= 90; x += 1) {
      for (let y = 45; y <= 55; y += 1) mask.blocked[y * 100 + x] = 1;
    }
    (component as any).campaignCollisionMasks[3] = mask;
    (component as any).currentAct = 3;
    component.playerX = 50;
    component.playerY = 50;
    (component as any).playerLeapDirectionX = 1;
    (component as any).playerLeapDirectionY = 0;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    const travel = (component as any).leapClearTravel(30);

    expect(travel).toBeLessThan(30);
    expect((component as any).campaignBlockedAt(
      (component as any).campaignCollisionContext(),
      component.playerX + travel,
      component.playerY,
    )).toBeFalse();
  });

  it("blocks Act I monastery walls but leaves the courtyard gate passable", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[50 * 100 + 55] = 1;
    (component as any).campaignCollisionMasks[1] = mask;
    (component as any).currentAct = 1;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    expect((component as any).campaignTerrainBlocks(5, 0)).toBeTrue();
    expect((component as any).campaignTerrainBlocks(0, 5)).toBeFalse();

    // The monastery gate is a real opening in the courtyard wall.
    const context = (component as any).campaignCollisionContext();
    expect((component as any).campaignBlockedAt(context, 235, 250)).toBeFalse();
  });

  it("blocks Matron's Den with the monastery wall mask while leaving its gate passable", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[50 * 100 + 55] = 1;
    (component as any).campaignCollisionMasks[1] = mask;
    (component as any).currentAct = 7;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    expect((component as any).campaignTerrainBlocks(5, 0)).toBeTrue();
    expect((component as any).campaignTerrainBlocks(0, 5)).toBeFalse();
  });

  it("opens Matron's Den painted gate through the courtyard wall footprint", () => {
    const blocked = new Uint8Array(520 * 300);
    blocked.fill(1);
    (component as any).campaignCollisionMasks[1] = { width: 520, height: 300, blocked };
    (component as any).currentAct = 7;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);

    const context = (component as any).campaignCollisionContext();

    // Both leaves of the keyed gate threshold are walkable, while the painted
    // central pier and the wall either side still stop the hero.
    expect((component as any).campaignBlockedAt(context, 225, 250)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 289, 250)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 258, 250)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 160, 250)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 320, 250)).toBeTrue();
    // The body fits cleanly through both leaves.
    expect((component as any).campaignBlockedSamples(context, 225, 250)).toBe(0);
    expect((component as any).campaignBlockedSamples(context, 289, 250)).toBe(0);

    // Act I uses the same painted gate opening.
    (component as any).currentAct = 1;
    const actOneContext = (component as any).campaignCollisionContext();
    expect((component as any).campaignBlockedAt(actOneContext, 235, 250)).toBeFalse();
  });

  it("opens Matron's Den gate mouth on the courtyard side", () => {
    const blocked = new Uint8Array(300 * 300);
    blocked.fill(1);
    (component as any).campaignCollisionMasks[1] = { width: 300, height: 300, blocked };
    (component as any).currentAct = 7;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);

    const context = (component as any).campaignCollisionContext();

    // Both passage mouths must reach above the courtyard-side lip of the
    // painted gate; otherwise the hero can only leave by hugging an arch centre.
    expect((component as any).campaignBlockedAt(context, 228, 230)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 228, 208)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 228, 205)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 180, 230)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 258, 230)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 285, 230)).toBeFalse();
  });

  it("opens Matron's Den west and east side doors onto the painted walkways", () => {
    const blocked = new Uint8Array(520 * 300);
    blocked.fill(1);
    (component as any).campaignCollisionMasks[1] = { width: 520, height: 300, blocked };
    (component as any).currentAct = 7;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);

    const context = (component as any).campaignCollisionContext();

    // Both side thresholds line up with the walkways painted outside the walls.
    expect((component as any).campaignBlockedAt(context, 50, 190)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 80, 170)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 472, 158)).toBeFalse();
    expect((component as any).campaignBlockedAt(context, 450, 155)).toBeFalse();
    // The hero's full body fits through either opening, not just its centre.
    expect((component as any).campaignBlockedSamples(context, 50, 190)).toBe(0);
    expect((component as any).campaignBlockedSamples(context, 80, 170)).toBe(0);
    expect((component as any).campaignBlockedSamples(context, 472, 158)).toBe(0);
    // The rest of the wall band stays solid between the doors and the gate.
    expect((component as any).campaignBlockedAt(context, 110, 190)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 420, 158)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 228, 140)).toBeTrue();

    // Act I still uses only its painted gate; the side doors are Matron's Den exits.
    (component as any).currentAct = 1;
    const actOneContext = (component as any).campaignCollisionContext();
    expect((component as any).campaignBlockedAt(actOneContext, 228, 250)).toBeFalse();
    expect((component as any).campaignBlockedAt(actOneContext, 50, 190)).toBeTrue();
    expect((component as any).campaignBlockedAt(actOneContext, 472, 158)).toBeTrue();
  });

  it("keeps Matron's Den courtyard above backing-store size on high-DPI displays", () => {
    (component as any).currentAct = 7;
    component.arenaW = 720;
    component.arenaH = 480;
    (component as any).projectionDpr = 2;
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = 360;
    (component as any).currentChunkLocalY = 240;
    (component as any).arenaRef = {
      nativeElement: { width: 3200, height: 1800, clientWidth: 1600, clientHeight: 900 },
    };

    const geometry = (component as any).campaignAreaBackdropGeometry(356, 520, 300);

    expect(geometry.scale).toBeGreaterThan(4.2);
    expect(geometry.width).toBeGreaterThan(3200);
    expect(geometry.height).toBeGreaterThan(1800);
  });

  it("depth-sorts Matron's Den walls so they cover a hero standing behind them", () => {
    (component as any).currentAct = 7;
    (component as any).act1WallAtlas = { complete: true, naturalWidth: 512 } as any;
    (component as any).act1WallLayout = {
      atlasWidth: 512, atlasHeight: 600, backdropWidth: 520, backdropHeight: 300,
      instances: [{ x: 42, y: 0, w: 32, h: 300, depth: 179, order: 42, sx: 0, sy: 0 }],
    };
    (component as any).campaignBackdropImages[7] = { complete: true, naturalWidth: 520 } as any;
    (component as any).arenaRef = { nativeElement: { width: 800, height: 600 } };
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 2, width: 1040, height: 600, left: 0, top: 0 });

    const draws = (component as any).act1WallDraws(60);

    expect(draws).toHaveSize(1);
    expect(draws[0]).toEqual(jasmine.objectContaining({ dx: 84, dy: 0, dw: 64, dh: 600, depth: 358 }));
  });

  it("blocks Act IV catacombs walls while leaving the sanctuary floor walkable", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[50 * 100 + 55] = 1;
    (component as any).campaignCollisionMasks[4] = mask;
    (component as any).currentAct = 4;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    expect((component as any).campaignTerrainBlocks(5, 0)).toBeTrue();
    expect((component as any).campaignTerrainBlocks(0, 5)).toBeFalse();
  });

  it("uses the buysell cursor over Gheed's shop and the rotate cursor while dragging a preview", () => {
    const componentAny = component as any;
    componentAny.d2CursorEnabled = true;
    const cursor: any = { style: {}, dataset: {}, classList: { add: () => undefined, remove: () => undefined } };
    componentAny.d2CursorRef = { nativeElement: cursor };
    const target = (inShop: boolean) => ({
      closest: (selector: string) => selector === ".d2s" || (inShop && selector === ".d2s-gheeds-shop") ? {} : null,
    });
    const move = (inShop: boolean): void => componentAny.trackD2Cursor({
      pointerType: "mouse", clientX: 100, clientY: 100, target: target(inShop),
    });

    move(true);
    expect(cursor.dataset.mode).toBe("shop");
    expect(cursor.style.transform).toContain("scale(0.55)");

    componentAny.previewDragging = true;
    move(true);
    expect(cursor.dataset.mode).toBe("rotate");

    componentAny.previewDragging = false;
    move(false);
    expect(cursor.dataset.mode).toBe("default");
    const [, cursorX, cursorY] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(cursor.style.transform)!;
    expect(Number(cursorX)).toBeCloseTo(96.7);
    expect(Number(cursorY)).toBeCloseTo(94.5);
  });

  it("leaves Act I's courtyard walls to the painted backdrop", () => {
    const componentWall = component as any;
    componentWall.currentAct = 1;
    componentWall.act1WallAtlas = { complete: true, naturalWidth: 512 };
    componentWall.act1WallLayout = {
      atlasWidth: 512, atlasHeight: 600, backdropWidth: 520, backdropHeight: 300,
      instances: [{ x: 10, y: 20, w: 32, h: 100, sx: 0, sy: 0, order: 4, depth: 120 }],
    };
    componentWall.campaignBackdropImages[1] = { complete: true, naturalWidth: 520, naturalHeight: 300 };
    componentWall.arenaRef = { nativeElement: { width: 800, height: 600 } };

    expect(componentWall.act1WallDraws(80)).toEqual([]);
  });

  it("depth-sorts Act IV catacombs wall strips", () => {
    const componentWall = component as any;
    componentWall.currentAct = 4;
    componentWall.act4WallAtlas = { complete: true, naturalWidth: 512 };
    componentWall.act4WallLayout = {
      atlasWidth: 512, atlasHeight: 522, backdropWidth: 600, backdropHeight: 300,
      instances: [{ x: 10, y: 20, w: 32, h: 100, sx: 0, sy: 0, order: 4, depth: 120 }],
    };
    componentWall.campaignBackdropImages[4] = { complete: true, naturalWidth: 600, naturalHeight: 300 };
    componentWall.arenaRef = { nativeElement: { width: 800, height: 600 } };
    spyOn(componentWall, "campaignAreaBackdropGeometry").and.returnValue({
      left: 100, top: 40, width: 600, height: 300, scale: 1,
    });

    const draws = componentWall.act4WallDraws(80);
    expect(draws).toHaveSize(1);
    expect(draws[0].dx).toBe(110);
    expect(draws[0].dy).toBe(60);
    expect(draws[0].depth).toBe(160);

    componentWall.currentAct = 3;
    expect(componentWall.act4WallDraws(80)).toEqual([]);
  });

  it("uses the dedicated Chaos Sanctuary walls and collision only inside the sanctuary", () => {
    const componentWall = component as any;
    componentWall.currentAct = 4;
    componentWall.currentAreaIndex = 3;
    componentWall.act4WallAtlas = { complete: true, naturalWidth: 512 };
    componentWall.act4WallLayout = {
      atlasWidth: 512, atlasHeight: 522, backdropWidth: 600, backdropHeight: 300,
      instances: [{ x: 10, y: 20, w: 32, h: 100, sx: 0, sy: 0, order: 4, depth: 120 }],
    };
    componentWall.campaignBackdropImages[4] = { complete: true, naturalWidth: 600, naturalHeight: 300 };
    componentWall.chaosSanctuaryWallAtlas = { complete: true, naturalWidth: 512 };
    componentWall.chaosSanctuaryWallLayout = {
      atlasWidth: 512, atlasHeight: 442, backdropWidth: 600, backdropHeight: 340,
      instances: [{ x: 30, y: 40, w: 32, h: 221, sx: 0, sy: 0, order: 8, depth: 146 }],
    };
    componentWall.chaosSanctuaryBackdrop = { complete: true, naturalWidth: 600, naturalHeight: 340 };
    componentWall.arenaRef = { nativeElement: { width: 800, height: 600 } };
    spyOn(componentWall, "campaignAreaBackdropGeometry").and.returnValue({
      left: 100, top: 40, width: 600, height: 340, scale: 1,
    });

    const catacombs = componentWall.act4WallDraws(80);
    expect(catacombs).toHaveSize(1);
    expect(catacombs[0].atlas).toBe(componentWall.act4WallAtlas);

    componentWall.currentAreaIndex = 4;
    const sanctuary = componentWall.act4WallDraws(80);
    expect(sanctuary).toHaveSize(1);
    expect(sanctuary[0].atlas).toBe(componentWall.chaosSanctuaryWallAtlas);
    expect(sanctuary[0].dx).toBe(130);

    const catacombMask = { width: 600, height: 300, blocked: new Uint8Array(600 * 300) };
    const chaosMask = { width: 600, height: 340, blocked: new Uint8Array(600 * 340) };
    componentWall.campaignCollisionMasks[4] = catacombMask;
    componentWall.chaosSanctuaryCollision = chaosMask;

    expect(componentWall.campaignCollisionContext().mask).toBe(chaosMask);
    componentWall.currentAreaIndex = 3;
    expect(componentWall.campaignCollisionContext().mask).toBe(catacombMask);
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

  it("keeps the ambience setting when moving from the main menu to the lobby and hero select", async () => {
    const stopAmbientAudio = spyOn(component as any, "stopAmbientAudio");
    spyOn(component as any, "stopMenuHeroPreview");
    spyOn(component as any, "startClassPreview");
    spyOn(component as any, "loadLobby").and.resolveTo();
    component.ambientAudioEnabled = true;
    component.ambientAudioStatus = "Ambient sound on";
    component.activeTab = "menu";
    component.menuPanel = "main";

    await component.openLobby();

    expect(component.menuPanel).toBe("lobby");
    expect(component.ambientAudioEnabled).toBeTrue();
    expect(component.ambientAudioStatus).toBe("Ambient sound on");

    component.openCharacterSelect();

    expect(component.menuPanel).toBe("characters");
    expect(component.ambientAudioEnabled).toBeTrue();
    expect(component.ambientAudioStatus).toBe("Ambient sound on");
    expect(stopAmbientAudio).not.toHaveBeenCalled();
  });

  it("brings the title theme back by itself when a run returns to a menu screen", () => {
    const startAmbientAudio = spyOn(component as any, "startAmbientAudio").and.resolveTo();
    spyOn(component as any, "stopAmbientAudio").and.callFake(() => {
      (component as any).ambientAudioEnabled = false;
    });
    (component as any).menuSoundPreferred = true;
    component.ambientAudioEnabled = true;

    component.activeTab = "run";
    (component as any).stopAmbientAudio();
    expect(component.ambientAudioEnabled).toBeFalse();

    component.activeTab = "menu";

    expect(component.ambientAudioEnabled).toBeTrue();
    expect(component.ambientAudioStatus).toBe("Starting ambient sound");
    expect(startAmbientAudio).toHaveBeenCalled();
  });

  it("keeps the title theme silent on the menu once the player mutes it", () => {
    const startAmbientAudio = spyOn(component as any, "startAmbientAudio").and.resolveTo();
    (component as any).menuSoundPreferred = false;
    component.ambientAudioEnabled = false;

    component.activeTab = "run";
    component.activeTab = "menu";

    expect(component.ambientAudioEnabled).toBeFalse();
    expect(startAmbientAudio).not.toHaveBeenCalled();
  });

  it("starts with sound on so the title theme plays as soon as it downloads", () => {
    const play = jasmine.createSpy("play").and.resolveTo();
    const audio = {
      loop: true,
      preload: "auto",
      volume: 0,
      play,
      pause: jasmine.createSpy("pause"),
      addEventListener: jasmine.createSpy("addEventListener"),
    } as unknown as HTMLAudioElement;
    (component as any).menuThemeAudio = audio;

    (component as any).beginMenuAudio();

    expect((component as any).menuSoundPreferred).toBeTrue();
    expect(component.ambientAudioEnabled).toBeTrue();
    expect(audio.preload).toBe("auto");
    expect(play).toHaveBeenCalled();
  });

  it("puts a starting weapon and off-hand in every archived hero's hands", () => {
    const attachHeldItemArt = spyOn(component as any, "attachHeldItemArt");
    const buildModel = (): THREE.Group => {
      const model = new THREE.Group();
      for (const name of ["R_weapon_attach", "L_weapon_attach", "shield_attach"]) {
        const bone = new THREE.Object3D();
        bone.name = name;
        model.add(bone);
      }
      return model;
    };

    const paladin = buildModel();
    expect((component as any).attachLeaderboardHeroStockGear(paladin, "paladin")).toBeTrue();
    expect(paladin.getObjectByName("equipped_weapon_weapon")).toBeTruthy();
    expect(paladin.getObjectByName("equipped_shield_shield")).toBeTruthy();

    const barbarian = buildModel();
    expect((component as any).attachLeaderboardHeroStockGear(barbarian, "barbarian")).toBeTrue();
    expect(barbarian.getObjectByName("equipped_weapon_weapon")).toBeTruthy();
    expect(barbarian.getObjectByName("equipped_weapon_offhand_weapon")).toBeTruthy();

    const sorceress = buildModel();
    (component as any).attachLeaderboardHeroStockGear(sorceress, "sorceress");
    expect(sorceress.getObjectByName("equipped_weapon_weapon")).toBeTruthy();

    expect(attachHeldItemArt).toHaveBeenCalled();
  });

  it("dresses each archived hero in the gear their saved loadout carries", () => {
    spyOn(component as any, "attachHeldItemArt");
    const hero = {
      id: 7,
      userId: 3,
      characterName: "Aria",
      classId: "paladin",
      username: "Aria",
      score: 900,
      timeSeconds: 60,
      kills: 4,
      level: 6,
      victory: false,
      died: true,
      createdAt: "2026-01-01T00:00:00Z",
      equipped: JSON.stringify({
        weapon: { id: "run-hammer", name: "Battle Hammer", baseName: "Battle Hammer", rarity: "unique", slot: "weapon", desc: "A hammer of the Horadrim." },
        shield: { id: "run-kite", name: "Kite Shield", baseName: "Kite Shield", rarity: "magic", slot: "armor", equipmentType: "shield", desc: "A broad shield." },
        body: { id: "run-plate", name: "Ancient Armor", baseName: "Ancient Armor", rarity: "unique", slot: "armor", desc: "Plate from the old kingdom." },
      }),
    } as unknown as D2LeaderboardEntry;

    const loadout = (component as any).archiveHeroLoadout(hero);
    expect(loadout.weapon?.name).toBe("Battle Hammer");
    expect(loadout.shield?.id).toBe("run-kite");
    expect(loadout.body?.id).toBe("run-plate");

    const model = new THREE.Group();
    for (const name of ["R_weapon_attach", "L_weapon_attach", "shield_attach"]) {
      const bone = new THREE.Object3D();
      bone.name = name;
      model.add(bone);
    }
    expect((component as any).attachLeaderboardHeroGear(model, "paladin", loadout)).toBeTrue();
    const held = model.getObjectByName("equipped_weapon_weapon")?.userData["d2sHeldItem"];
    expect(held?.name).toContain("Battle Hammer");
    expect(model.getObjectByName("equipped_shield_shield")?.userData["d2sHeldItem"]?.name)
      .toContain("Kite Shield");
  });

  it("falls back to the class stock kit when an archived hero has no saved loadout", () => {
    spyOn(component as any, "attachHeldItemArt");
    const hero = {
      id: 8, userId: 4, characterName: "Bran", classId: "barbarian", username: "Bran",
      score: 800, timeSeconds: 90, kills: 9, level: 8, victory: false, died: true,
      createdAt: "2026-01-01T00:00:00Z", equipped: "not json",
    } as unknown as D2LeaderboardEntry;

    const loadout = (component as any).archiveHeroLoadout(hero);
    expect(loadout.weapon).toBeNull();
    expect(loadout.shield).toBeNull();

    const model = new THREE.Group();
    for (const name of ["R_weapon_attach", "L_weapon_attach", "shield_attach"]) {
      const bone = new THREE.Object3D();
      bone.name = name;
      model.add(bone);
    }
    expect((component as any).attachLeaderboardHeroGear(model, "barbarian", loadout)).toBeTrue();
    expect(model.getObjectByName("equipped_weapon_weapon")).toBeTruthy();
    expect(model.getObjectByName("equipped_weapon_offhand_weapon")).toBeTruthy();
  });

  it("keeps the off hand empty for an archived hero holding a two-handed weapon", () => {
    spyOn(component as any, "attachHeldItemArt");
    const hero = {
      id: 9, userId: 5, characterName: "Kael", classId: "barbarian", username: "Kael",
      score: 700, timeSeconds: 120, kills: 12, level: 9, victory: false, died: true,
      createdAt: "2026-01-01T00:00:00Z",
      equipped: JSON.stringify({
        weapon: { id: "run-pike", name: "Pike", baseName: "Pike", rarity: "normal", slot: "weapon", desc: "A long polearm." },
        shield: { id: "run-hand-axe-off", name: "Hand Axe", baseName: "Hand Axe", rarity: "normal", slot: "weapon", desc: "A compact axe." },
      }),
    } as unknown as D2LeaderboardEntry;
    const loadout = (component as any).archiveHeroLoadout(hero);
    expect(loadout.weapon?.name).toBe("Pike");
    // The save still carries the second axe the hero held before the pike.
    expect(loadout.shield?.name).toBe("Hand Axe");
    const buildModel = (): THREE.Group => {
      const model = new THREE.Group();
      for (const name of ["R_weapon_attach", "L_weapon_attach", "shield_attach"]) {
        const bone = new THREE.Object3D();
        bone.name = name;
        model.add(bone);
      }
      return model;
    };
    const heldWeaponNames = (model: THREE.Group): string[] => {
      const names: string[] = [];
      model.traverse((object) => {
        if (/^equipped_weapon/.test(object.name)) names.push(object.name);
      });
      return names.sort();
    };

    const twoHanded = buildModel();
    expect((component as any).attachLeaderboardHeroGear(twoHanded, "barbarian", loadout)).toBeFalse();
    expect(heldWeaponNames(twoHanded).some((name) => name.startsWith("equipped_weapon_offhand"))).toBeFalse();
    expect(heldWeaponNames(twoHanded).length).toBe(1);

    // A one-handed weapon still leaves the saved off-hand blade in its hand.
    const paired = buildModel();
    const oneHanded = {
      ...loadout,
      weapon: { id: "run-hand-axe", name: "Hand Axe", baseName: "Hand Axe", rarity: "normal", slot: "weapon", desc: "A compact axe." },
    };
    expect((component as any).attachLeaderboardHeroGear(paired, "barbarian", oneHanded)).toBeTrue();
    expect(heldWeaponNames(paired).some((name) => name.startsWith("equipped_weapon_offhand"))).toBeTrue();
  });

  it("sizes the archive scrollbar before the first click or scroll", () => {
    const scroller = document.createElement("div");
    Object.defineProperties(scroller, {
      scrollWidth: { configurable: true, value: 2048 },
      clientWidth: { configurable: true, value: 1024 },
      scrollLeft: { configurable: true, writable: true, value: 512 },
    });
    (component as any).leaderboardScrollRef = { nativeElement: scroller };

    expect(component.leaderboardScrollRange).toBe(0);
    (component as any).observeLeaderboardScrollbar();

    expect(component.leaderboardScrollRange).toBe(1024);
    expect(component.leaderboardScrollThumbPercent).toBe(50);
    expect(component.leaderboardScrollThumbOffsetPercent).toBe(25);
  });

  it("shows each player's characters once in the hero archive, keeping their best run", () => {
    const hero = (overrides: Partial<D2LeaderboardEntry>): D2LeaderboardEntry => ({
      id: 1,
      userId: 1,
      characterName: "Assassin",
      classId: "assassin",
      username: "Max",
      score: 1000,
      timeSeconds: 120,
      kills: 50,
      level: 10,
      victory: false,
      died: true,
      createdAt: "2026-01-01T00:00:00Z",
      ...overrides,
    });
    component.lobbyLeaderboard = [
      hero({ id: 1, score: 1200 }),
      hero({ id: 2, characterName: "Max Assassin Retired", score: 900, level: 9 }),
      hero({ id: 3, characterName: "Sorceress", classId: "sorceress", score: 1100 }),
      hero({ id: 4, userId: 2, username: "Aria", score: 1000 }),
    ];

    const heroes = component.lobbyHeroes;

    expect(heroes.length).toBe(3);
    expect(heroes.map((entry) => entry.score)).toEqual([1200, 1100, 1000]);
    expect(heroes.filter((entry) => entry.username === "Max").length).toBe(2);
    expect(heroes.find((entry) => entry.username === "Max" && entry.classId === "assassin")?.id).toBe(1);
  });

  it("keeps every archive character listed but only builds models near the scroll window", () => {
    component.lobbyLeaderboard = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      userId: index + 1,
      characterName: `Hero ${index + 1}`,
      classId: "amazon",
      username: `Player ${index + 1}`,
      score: 1000 - index,
      timeSeconds: 100 + index,
      kills: 10,
      level: 10,
      victory: false,
      died: true,
      createdAt: "2026-01-01T00:00:00Z",
    }));
    const scroller = document.createElement("div");
    Object.defineProperties(scroller, {
      scrollWidth: { configurable: true, value: 5120 },
      clientWidth: { configurable: true, value: 512 },
      scrollLeft: { configurable: true, writable: true, value: 1280 },
    });
    (component as any).leaderboardScrollRef = { nativeElement: scroller };
    (component as any).leaderboardHeroScene = { add: () => undefined, remove: () => undefined };
    const requested: string[] = [];
    spyOn(component as any, "loadLeaderboardHeroModel")
      .and.callFake((_hero: any, key: string) => requested.push(key));

    (component as any).syncLeaderboardHeroModels();

    // All forty characters stay in the row...
    expect(component.lobbyHeroes.length).toBe(40);
    // ...but only the slots in view, plus the two-slot margin on each side,
    // ask for a 3D model. 128px slots at scrollLeft 1280 put slot 10 at the
    // left edge of the 512px window, so slots 8..15 are warmed.
    expect((component as any).leaderboardVisibleSlotStart).toBe(8);
    expect((component as any).leaderboardVisibleSlotEnd).toBe(15);
    expect(requested.length).toBe(8);
    expect(requested).toEqual(
      Array.from({ length: 8 }, (_, index) => `${index + 9}:amazon`),
    );

    // Scrolling far away releases the old rigs and warms the new window only.
    const removed: any[] = [];
    const stale = { isObject3D: true, name: "stale" };
    (component as any).leaderboardHeroModels.set("9:amazon", { model: stale, rig: {} });
    const scene = (component as any).leaderboardHeroScene;
    spyOn(scene, "remove").and.callFake((model: any) => removed.push(model));
    spyOn(component as any, "disposeLeaderboardHeroGroup");
    scroller.scrollLeft = 4608;
    (component as any).syncLeaderboardHeroModels();

    expect(removed).toContain(stale);
    expect((component as any).leaderboardHeroModels.has("9:amazon")).toBeFalse();
    expect((component as any).leaderboardVisibleSlotStart).toBe(34);
    expect((component as any).leaderboardVisibleSlotEnd).toBe(39);
  });

  it("syncs and drags the custom horizontal scrollbar in the sanctuary hero archive", () => {
    const scroller = document.createElement("div");
    Object.defineProperties(scroller, {
      scrollWidth: { configurable: true, value: 1200 },
      clientWidth: { configurable: true, value: 600 },
      scrollLeft: { configurable: true, writable: true, value: 300 },
    });
    (component as any).leaderboardScrollRef = { nativeElement: scroller };
    (component as any).syncLeaderboardScrollbar();

    expect(component.leaderboardScrollRange).toBe(600);
    expect(component.leaderboardScrollThumbPercent).toBe(50);
    expect(component.leaderboardScrollThumbOffsetPercent).toBe(25);

    const track = document.createElement("div");
    const thumb = document.createElement("span");
    thumb.className = "d2s-hero-lineup-scrollbar-thumb";
    track.appendChild(thumb);
    track.getBoundingClientRect = () => ({ left: 0, width: 300 } as DOMRect);
    thumb.getBoundingClientRect = () => ({ left: 0, width: 100 } as DOMRect);
    spyOn(track, "setPointerCapture").and.callFake(() => undefined);

    (component as any).startLeaderboardScrollbarDrag({
      currentTarget: track, target: thumb, clientX: 50, pointerId: 1, preventDefault: () => undefined,
    } as any);
    (component as any).moveLeaderboardScrollbarDrag({ clientX: 150, pointerId: 1 } as any);

    expect(scroller.scrollLeft).toBe(600);
    expect(component.leaderboardScrollThumbPercent).toBe(50);
    expect(component.leaderboardScrollThumbOffsetPercent).toBe(50);
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

  it("summons the title-screen hero again after Save and Exit", () => {
    spyOn(component as any, "persistRunProgress");
    spyOn(component as any, "flushServerSave").and.resolveTo(undefined as any);
    spyOn(component as any, "stopActivityPing");
    const start = spyOn(component as any, "startMenuHeroPreview");
    component.activeTab = "run";
    component.escapeMenuOpen = true;
    component.campaignVictory = false;

    component.saveRunNow();

    // The run tore the hero canvas down, so the title screen has to start it
    // itself; otherwise the card shows its spinner and never loads a model.
    expect(component.activeTab).toBe("menu");
    expect(component.menuPanel).toBe("main");
    expect(component.escapeMenuOpen).toBeFalse();
    expect(start).toHaveBeenCalled();
  });

  it("returns from Gheed's shop to the main menu with Escape", () => {
    component.activeTab = "menu";
    component.menuPanel = "shop";
    spyOn(component as any, "startMenuHeroPreview");
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });

    component.onGlobalAttackKey(event);

    expect(component.menuPanel).toBe("main");
    expect(event.defaultPrevented).toBeTrue();
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

  it("shows Enchant's actual spell description in its upgrade rank details", () => {
    component.selectedClass = "sorceress";

    const stats = (component as any).getSkillRankStats("Enchant", "aura", 1);

    expect(stats).toEqual(["your fire skills burn 10% harder"]);
    expect(stats.join(" ")).not.toContain("No numeric per-rank combat bonus");
  });

  it("uses actual spell text for aura ranks without a bespoke numeric line", () => {
    component.selectedClass = "sorceress";
    for (const name of ["Shiver Armor", "Chilling Armor"]) {
      const description = component.getSkillDescription(name);
      const stats = (component as any).getSkillRankStats(name, "aura", 4);

      expect(description).toBeTruthy();
      expect(stats).toEqual([description!]);
      expect(stats.join(" ")).not.toContain("No numeric per-rank combat bonus");
    }

    component.selectedClass = "necromancer";
    const lowerResist = component.getSkillDescription("Lower Resist");
    const lowerResistStats = (component as any).getSkillRankStats("Lower Resist", "aura", 4);
    expect(lowerResist).toBeTruthy();
    expect(lowerResistStats).toEqual([lowerResist!]);

    // Passives already used their own text; keep that contract covered too.
    component.selectedClass = "sorceress";
    const warmth = component.getSkillDescription("Warmth");
    expect((component as any).getSkillRankStats("Warmth", "passive", 4)).toEqual([warmth!]);
  });

  it("uses actual spell text for paladin auras whose effects do not scale", () => {
    component.selectedClass = "paladin";
    for (const name of ["Cleansing", "Meditation", "Redemption", "Thorns"]) {
      const description = component.getSkillDescription(name);
      const stats = (component as any).getSkillRankStats(name, "aura", 4);

      expect(description).toBeTruthy();
      expect(stats[0]).toContain("Active duration:");
      expect(stats).toContain(description!);
      expect(stats.join(" ")).not.toContain("No additional rank-scaled gameplay effect");
    }
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

  it("picks up, moves, and throws belt potions without drinking them", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[4] = { kind: "health" };
    component.potionDrops = [];

    component.onBeltSlotClick(4);
    expect(component.heldBeltPotionSlot).toBe(4);
    expect(component.beltSlots[4].kind).toBe("health");

    component.onBeltSlotClick(5);
    expect(component.heldBeltPotionSlot).toBeNull();
    expect(component.beltSlots[4].kind).toBeNull();
    expect(component.beltSlots[5].kind).toBe("health");

    component.onBeltSlotClick(5);
    component.onBeltSlotClick(5);
    expect(component.beltSlots[5].kind).toBeNull();
    expect(component.potionDrops.map((drop) => drop.kind)).toEqual(["health"]);
  });

  it("throws a held belt potion onto the clicked arena floor", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[0] = { kind: "rejuvenation" };
    component.potionDrops = [];
    component.heldBeltPotionSlot = 0;
    const canvas = {
      width: 500, height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    (component as any).projectionCenterX = 250;
    (component as any).projectionCenterY = 250;
    (component as any).projectionDpr = 1;
    (component as any).worldZoom = 2.1;

    component.onArenaPointerDown({
      button: 0, pointerType: "mouse", target: canvas, clientX: 300, clientY: 250,
      preventDefault: () => undefined,
    } as any);

    expect(component.beltSlots[0].kind).toBeNull();
    expect(component.potionDrops).toHaveSize(1);
    expect(component.potionDrops[0].kind).toBe("rejuvenation");
  });

  it("stacks health potions so two bottles heal twice the life over twice the time", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[0] = { kind: "health" };
    component.beltSlots[1] = { kind: "health" };
    component.playerMaxHp = 2000;
    component.playerHp = 0;
    spyOn(component as any, "persistRunProgress");

    component.drinkBeltPotion(0);
    component.drinkBeltPotion(1);

    expect((component as any).potionHealRemaining).toBe(800);

    // The first bottle's five seconds are worth 400 life, not the whole 800.
    for (let tick = 0; tick < 100; tick++) (component as any).tickHealthPotionHeal(50);

    expect(component.playerHp).toBeCloseTo(400, 5);
    expect((component as any).potionHealRemaining).toBeCloseTo(400, 5);

    // The second bottle pays out over another five seconds, doubling the total.
    for (let tick = 0; tick < 100; tick++) (component as any).tickHealthPotionHeal(50);

    expect(component.playerHp).toBeCloseTo(800, 5);
    expect((component as any).potionHealRemaining).toBeCloseTo(0, 5);
  });

  it("drags a belt potion with the mouse and drops it on the arena floor", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[0] = { kind: "health" };
    component.potionDrops = [];
    component.heldBeltPotionSlot = null;
    const canvas = {
      width: 500, height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    (component as any).projectionCenterX = 250;
    (component as any).projectionCenterY = 250;
    (component as any).projectionDpr = 1;
    (component as any).worldZoom = 2.1;

    component.onBeltSlotPointerDown(0, {
      pointerId: 7, pointerType: "mouse", button: 0, clientX: 40, clientY: 40,
      currentTarget: { setPointerCapture: () => undefined },
    } as any);
    expect(component.beltDrag?.slotIndex).toBe(0);
    expect(component.beltDrag?.moved).toBeFalse();

    component.onBeltSlotPointerMove({ pointerId: 7, clientX: 300, clientY: 250 } as any);
    expect(component.beltDrag?.moved).toBeTrue();
    expect(component.beltDragGhostX).toBe(300);
    expect(component.beltDragGhostY).toBe(250);

    spyOn(document, "elementFromPoint").and.returnValue(canvas);
    component.onBeltSlotPointerUp({ pointerId: 7, clientX: 300, clientY: 250 } as any);

    expect(component.beltDrag).toBeNull();
    expect(component.beltSlots[0].kind).toBeNull();
    expect(component.potionDrops).toHaveSize(1);
    expect(component.potionDrops[0].kind).toBe("health");
    expect(component.potionDrops[0].landing).toBeGreaterThan(0);
  });

  it("keeps a dragged belt potion within melee range of the hero", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[0] = { kind: "health" };
    component.potionDrops = [];
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    const canvas = {
      width: 500, height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    (component as any).projectionCenterX = 250;
    (component as any).projectionCenterY = 250;
    (component as any).projectionDpr = 1;
    (component as any).worldZoom = 2.1;
    spyOn(component as any, "persistRunProgress");

    component.onBeltSlotPointerDown(0, {
      pointerId: 11, pointerType: "mouse", button: 0, clientX: 40, clientY: 40,
      currentTarget: { setPointerCapture: () => undefined },
    } as any);
    component.onBeltSlotPointerMove({ pointerId: 11, clientX: 480, clientY: 480 } as any);
    spyOn(document, "elementFromPoint").and.returnValue(canvas);
    component.onBeltSlotPointerUp({ pointerId: 11, clientX: 480, clientY: 480 } as any);

    expect(component.potionDrops).toHaveSize(1);
    const drop = component.potionDrops[0];
    expect(Math.hypot(drop.x - 250, drop.y - 250)).toBeCloseTo(48, 5);
    expect(drop.x).toBeGreaterThan(250);
    expect(drop.y).toBeGreaterThan(250);
  });

  it("drags a belt potion onto another belt slot without picking it up again", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[0] = { kind: "health" };
    component.beltSlots[2] = { kind: "rejuvenation" };
    component.heldBeltPotionSlot = null;
    const slot = document.createElement("button");
    slot.setAttribute("data-belt-slot-index", "2");
    document.body.appendChild(slot);
    try {
      component.onBeltSlotPointerDown(0, {
        pointerId: 9, pointerType: "mouse", button: 0, clientX: 10, clientY: 10,
        currentTarget: { setPointerCapture: () => undefined },
      } as any);
      component.onBeltSlotPointerMove({ pointerId: 9, clientX: 80, clientY: 80 } as any);
      spyOn(document, "elementFromPoint").and.returnValue(slot);
      component.onBeltSlotPointerUp({ pointerId: 9, clientX: 80, clientY: 80 } as any);
    } finally {
      slot.remove();
    }

    expect(component.beltSlots[0].kind).toBe("rejuvenation");
    expect(component.beltSlots[2].kind).toBe("health");
    component.onBeltSlotClick(2);
    expect(component.heldBeltPotionSlot).toBeNull();
  });

  it("consumes belt potions with right-click", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[2] = { kind: "health" };
    component.playerHp = 10;
    const event = { preventDefault: () => undefined, stopPropagation: () => undefined } as any;

    component.onBeltSlotContextMenu(2, event);

    expect(component.beltSlots[2].kind).toBeNull();
  });

  it("picks up a belt potion on a touch long-press", () => {
    jasmine.clock().install();
    try {
      component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
      component.beltSlots[1] = { kind: "health" };
      component.onBeltSlotPointerDown(1, {
        pointerType: "touch", pointerId: 7, clientX: 0, clientY: 0, currentTarget: null,
      } as any);
      jasmine.clock().tick(500);
      expect(component.heldBeltPotionSlot).toBe(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("gives Pandemonium enemies and bosses elemental immunities", () => {
    component.currentAct = 7;
    const fallen = (component as any).makeEnemy("normal", false, "fallen");
    expect(fallen.immunities).toEqual(["fire"]);
    // The immunity is a real 120% resistance, not just a boolean tag.
    expect(fallen.resistances).toEqual({ fire: 120 });

    component.currentAct = 8;
    const mephisto = (component as any).makeEnemy("boss", true, "mephisto");
    expect(mephisto.immunities).toEqual(["lightning"]);
    expect(mephisto.resistances).toEqual({ lightning: 120 });

    component.currentAct = 1;
    const campaignFallen = (component as any).makeEnemy("normal", false, "fallen");
    expect(campaignFallen.immunities).toBeUndefined();
    expect(campaignFallen.resistances).toBeUndefined();
  });

  it("applies Conviction at full strength to non-immune resistance and leaves poison alone", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Conviction"];
    component.skillLevels = { Conviction: 4 };
    (component as any).activePaladinAuras["Conviction"] = { remaining: 100, tick: 0 };

    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250,
      hp: 100, maxHp: 100, speed: 80, r: 14, dmg: 2,
      resistances: { cold: 50, poison: 50 },
    } as any;
    component.enemies = [enemy];

    // Rank 4 is -45%, so 50% cold drops to 5% and 40 damage lands as 38.
    expect((component as any).convictionResistancePenalty(enemy, "cold")).toBe(45);
    expect((component as any).effectiveEnemyResistance(enemy, "cold")).toBe(5);
    (component as any).queueEnemyDamage(enemy, 40, "#a9dcff", "cold");
    (component as any).flushPendingDamage();
    expect(enemy.hp).toBeCloseTo(62, 5);

    // Poison, magic and physical are outside Conviction's schools.
    expect((component as any).enemyResistanceMultiplier(enemy, "poison")).toBe(0.5);
    expect((component as any).getSkillRankStats("Conviction", "aura", 4))
      .toContain("While active: -45% fire, cold and lightning resistance nearby");
  });

  it("breaks a 120% Pandemonium immunity only once Conviction shaves it under 100%", () => {
    component.selectedClass = "paladin";
    component.currentAct = 8;
    component.playerX = 250;
    component.playerY = 250;
    const mephisto = (component as any).makeEnemy("boss", true, "mephisto");
    mephisto.x = 260;
    mephisto.y = 250;
    expect((component as any).isEnemyImmuneTo(mephisto, "lightning")).toBeTrue();

    component.ownedSkills = ["Conviction"];
    component.skillLevels = { Conviction: 10 };
    (component as any).activePaladinAuras["Conviction"] = { remaining: 100, tick: 0 };
    // Only a fifth of -75% reaches an immune monster, leaving 105% and immune.
    expect((component as any).effectiveEnemyResistance(mephisto, "lightning")).toBeCloseTo(105, 5);
    expect((component as any).isEnemyImmuneTo(mephisto, "lightning")).toBeTrue();
    expect(component.getEnemyImmunityLabel(mephisto)).toBe("Lightning");

    component.skillLevels = { Conviction: 20 };
    expect((component as any).effectiveEnemyResistance(mephisto, "lightning")).toBeCloseTo(95, 5);
    expect((component as any).isEnemyImmuneTo(mephisto, "lightning")).toBeFalse();
    expect(component.getEnemyImmunityLabel(mephisto)).toBe("");

    // A broken immunity is not a free hit: 95% resistance still eats 95%.
    (component as any).queueEnemyDamage(mephisto, 100, "#fff27a", "lightning");
    (component as any).flushPendingDamage();
    expect(mephisto.hp).toBeCloseTo(mephisto.maxHp - 5, 5);
  });

  it("draws Mephisto at the shared source scale without smoothing his sprite", () => {
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
      contentHeight: 254,
      footFraction: 0.845,
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
      if (args.length === 5 && Number(args[3]) > 100 && Number(args[4]) > 100) {
        spriteSmoothing = ctx.imageSmoothingEnabled;
      }
      (originalDrawImage as any)(...args);
    };

    (component as any).drawEnemy(ctx, mephisto);

    const spriteCall = calls.find((args) => args.length === 5 && Number(args[3]) > 100 && Number(args[4]) > 100);
    const expectedHeight = 309 * (112 * 0.8 * (component as any).worldZoom) / 254;
    expect(spriteCall).toBeDefined();
    expect(Number(spriteCall![4])).toBeCloseTo(expectedHeight, 4);
    expect(spriteSmoothing).toBeFalse();
  });

  it("plays Mephisto's real walk band in the correct facing while he moves", () => {
    component.currentAct = 3;
    component.playerX = 250;
    component.playerY = 250;
    const mephisto = (component as any).makeEnemy("boss", true, "mephisto");
    mephisto.x = 260;
    mephisto.y = 250;
    mephisto.facingX = 1;
    mephisto.facingY = 0;
    mephisto.animationState = "move";

    const frame = document.createElement("canvas");
    frame.width = 307;
    frame.height = 309;
    (component as any).enemySprites.mephisto = {
      frames: Array.from({ length: 24 }, () => Array.from({ length: 18 }, () => frame)),
      columns: 18,
      rows: 24,
      animated: true,
    };
    const tinted = spyOn(component as any, "tintedEnemyFrame").and.callFake(
      (_species: string, _direction: number, _frameIndex: number, source: HTMLCanvasElement) => source,
    );
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 400, y: 300 });
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;

    (component as any).drawEnemy(canvas.getContext("2d")!, mephisto);

    // East-facing movement uses the DCC-ordered row 7 inside the walk block
    // (row 8), and the loop must stay within MP's thirteen-frame walk clip
    // instead of wandering into the repeated filler columns.
    const [species, direction, frameIndex] = tinted.calls.mostRecent().args;
    expect(species).toBe("mephisto");
    expect(direction).toBe(15);
    expect(frameIndex).toBeLessThan(13);
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
    // Act bosses are an order of magnitude above the old 140 life / 6 damage
    // block, and ramp with the square root of the monster area scaling.
    const bossHealthScale = Math.sqrt((component as any).areaHealthScale());
    const bossDamageScale = Math.sqrt((component as any).areaDamageScale());
    const level83UberBossHealth = Math.round(140 * 10 * bossHealthScale * 4);
    const level83UberBossDamage = Math.ceil(6 * 10 * bossDamageScale * 2.2);

    expect(matronsAndariel.maxHp / level83UberBossHealth).toBeCloseTo(3, 1);
    expect(matronsAndariel.dmg / level83UberBossDamage).toBeCloseTo(2, 1);

    component.currentAct = 1;
    const campaignAndariel = (component as any).makeEnemy("boss", true, "andariel");
    expect(campaignAndariel.maxHp).toBe(1400);
    expect(campaignAndariel.dmg).toBe(60);
  });

  it("triples Uber Tristram monster health and doubles its damage", () => {
    component.currentAct = 8;
    const bossHealthScale = Math.sqrt((component as any).areaHealthScale());
    const bossDamageScale = Math.sqrt((component as any).areaDamageScale());
    const stats = (act: number, kind: "normal" | "champion" | "boss", species: string, campaignBoss = false, championType?: string) => {
      component.currentAct = act;
      return (component as any).makeEnemy(kind, campaignBoss, species, championType);
    };

    // The Tristram multipliers are applied before the area rounding, so the
    // ratios land within a point of 3x / 2x rather than exactly on it.
    const pandemoniumNormal = stats(7, "normal", "fallen");
    const tristramNormal = stats(8, "normal", "fallen");
    expect(tristramNormal.maxHp).toBeCloseTo(pandemoniumNormal.maxHp * 3, -1);
    expect(tristramNormal.dmg).toBeCloseTo(pandemoniumNormal.dmg * 2, -1);

    const pandemoniumChampion = stats(7, "champion", "skeleton", false, "champion");
    const tristramChampion = stats(8, "champion", "skeleton", false, "champion");
    expect(tristramChampion.maxHp).toBeCloseTo(pandemoniumChampion.maxHp * 3, -1);
    expect(tristramChampion.dmg).toBeCloseTo(pandemoniumChampion.dmg * 2, -1);

    const pandemoniumBoss = stats(7, "boss", "mephisto", true);
    const tristramBoss = stats(8, "boss", "mephisto", true);
    expect(tristramBoss.maxHp).toBe(Math.round(140 * 10 * bossHealthScale * 4 * 3));
    expect(tristramBoss.dmg).toBe(Math.ceil(6 * 10 * bossDamageScale * 2.2 * 2));
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

  it("rolls champions with the normal-difficulty stat block and a palette tint", () => {
    component.currentAct = 1;
    const normal = (component as any).makeEnemy("normal", false, "fallen");
    const champion = (component as any).makeEnemy("champion", false, "fallen", "champion");

    expect(champion.kind).toBe("champion");
    expect(champion.championType).toBe("champion");
    expect(champion.championTint).toContain("hue-rotate");
    expect(champion.championLevel).toBe(component.currentArea.level + 2);
    expect(champion.maxHp).toBe(normal.maxHp * 3);
    expect(champion.dmg).toBe(4);
    expect(champion.speed).toBeGreaterThan(90);
  });

  it("applies the Ghostly, Fanatic, Berserker and Possessed champion variations", () => {
    component.currentAct = 1;
    const base = (component as any).makeEnemy("champion", false, "fallen", "champion");
    const ghostly = (component as any).makeEnemy("champion", false, "fallen", "ghostly");
    const fanatic = (component as any).makeEnemy("champion", false, "fallen", "fanatic");
    const berserker = (component as any).makeEnemy("champion", false, "fallen", "berserker");
    const possessed = (component as any).makeEnemy("champion", false, "fallen", "possessed");

    expect(ghostly.resistances?.physical).toBe(80);
    expect(ghostly.speed).toBeLessThan(fanatic.speed);
    expect(ghostly.speed).toBeLessThan(base.speed);
    expect(fanatic.speed).toBeGreaterThan(base.speed);
    expect(berserker.maxHp).toBeLessThan(base.maxHp);
    expect(berserker.dmg).toBeGreaterThan(base.dmg);
    expect(possessed.maxHp).toBeGreaterThan(base.maxHp * 1.9);
  });

  it("chills champions instead of freezing them and only stuns them a tenth of the time", () => {
    component.currentAct = 1;
    const champion = (component as any).makeEnemy("champion", false, "fallen", "champion");

    (component as any).applyEnemyFreeze(champion, 2);
    expect(champion.freezeRemaining).toBeUndefined();
    expect(champion.coldRemaining).toBe(2);

    spyOn(Math, "random").and.returnValue(0.05);
    (component as any).applyEnemyStun(champion, 1);
    expect(champion.stunRemaining).toBe(1);

    champion.stunRemaining = undefined;
    (Math.random as jasmine.Spy).and.returnValue(0.5);
    (component as any).applyEnemyStun(champion, 1);
    expect(champion.stunRemaining).toBeUndefined();
  });

  it("keeps Possessed champions out of curses", () => {
    component.currentAct = 1;
    component.playerX = 100;
    component.playerY = 100;
    component.activeTab = "menu";
    const possessed = (component as any).makeEnemy("champion", false, "fallen", "possessed");
    const normal = (component as any).makeEnemy("normal", false, "fallen");
    possessed.x = 100;
    possessed.y = 100;
    normal.x = 110;
    normal.y = 100;
    component.enemies = [possessed, normal];
    (component as any).skillLevels["Amplify Damage"] = 1;
    spyOn(component as any, "drawSkillVisualEffects");

    (component as any).castNecromancerCurse("Amplify Damage");

    expect(possessed.curseName).toBeUndefined();
    expect(normal.curseName).toBe("Amplify Damage");
  });

  it("shows a champion's blue-name type, stats and resistances in the hover card", () => {
    component.currentAct = 1;
    const ghostly = (component as any).makeEnemy("champion", false, "fallen", "ghostly");

    expect(component.getEnemyDisplayName(ghostly)).toBe("Ghostly Champion Fallen");
    expect(component.getEnemyTraitLabel(ghostly)).toContain("Ghostly");
    expect(component.getEnemyTraitLabel(ghostly)).toContain("Physical resistance 80%");
    expect(component.getEnemyChampionStatLabel(ghostly)).toContain("+90% damage");
    expect(component.getEnemyChampionStatLabel(ghostly)).toContain("level +2");

    component.currentAct = 8;
    const diablo = (component as any).makeEnemy("boss", true, "diablo");
    expect(component.getEnemyResistanceLabel(diablo)).toBe("Resists fire");
  });

  it("paints a floating enemy health bar only while that enemy is focused", () => {
    const enemy = {
      kind: "normal", species: "fallen", x: 250, y: 250,
      hp: 50, maxHp: 100, r: 14, dmg: 2, speed: 80, cd: 0,
    } as any;
    const fillRect = jasmine.createSpy("fillRect");
    const ctx = { fillRect } as unknown as CanvasRenderingContext2D;

    component.hoveredEnemy = null;
    component.drawHpBar(ctx, enemy, "#8a94a6", 60, { x: 100, y: 120 });
    expect(fillRect).not.toHaveBeenCalled();

    component.hoveredEnemy = enemy;
    component.drawHpBar(ctx, enemy, "#8a94a6", 60, { x: 100, y: 120 });
    expect(fillRect).toHaveBeenCalledTimes(2);
  });

  it("shows the enemy under a finger while a touch press is held", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    spyOn(canvas, "getBoundingClientRect").and.returnValue({
      left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    (component as any).arenaRef = { nativeElement: canvas };
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 250, y: 250 });
    const enemy = {
      kind: "normal", species: "fallen", x: 250, y: 250,
      hp: 50, maxHp: 100, r: 14, dmg: 2, speed: 80, cd: 0,
      facingX: 0, facingY: 1, animationState: "idle", spriteFrame: 0,
    } as any;
    component.enemies = [enemy];
    const event = {
      pointerType: "touch", pointerId: 7, button: 0,
      clientX: 250, clientY: 250, target: canvas,
      preventDefault: jasmine.createSpy("preventDefault"),
    } as unknown as PointerEvent;

    component.onArenaPointerDown(event);

    expect(component.hoveredEnemy).toBe(enemy);
    expect((component as any).joystickPointerId).toBe(7);

    component.onArenaPointerEnd(event);
    expect(component.hoveredEnemy).toBeNull();
  });

  it("casts Molten Boulder as one straight rolling boulder", () => {
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
    expect(boulders).toHaveSize(1);
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

  it("ships a reachable affix catalogue for every supported base category", () => {
    const reps = [
      { name: "Short Sword", slot: "weapon" }, { name: "Hand Axe", slot: "weapon" },
      { name: "Club", slot: "weapon" }, { name: "War Hammer", slot: "weapon" },
      { name: "Mace", slot: "weapon" }, { name: "Dagger", slot: "weapon" },
      { name: "Katar", slot: "weapon", equipmentType: "claw" }, { name: "Staff", slot: "weapon" },
      { name: "Wand", slot: "weapon", equipmentType: "wand" }, { name: "Eagle Orb", slot: "weapon", equipmentType: "orb" },
      { name: "Scepter", slot: "weapon" }, { name: "Short Bow", slot: "weapon" },
      { name: "Crossbow", slot: "weapon" }, { name: "Javelin", slot: "weapon" },
      { name: "Spear", slot: "weapon" }, { name: "Throwing Axe", slot: "weapon" },
      { name: "Quilted Armor", slot: "armor", equipmentType: "body" }, { name: "Helm", slot: "armor", equipmentType: "helmet" },
      { name: "Circlet", slot: "armor", equipmentType: "helmet" }, { name: "Buckler", slot: "armor", equipmentType: "shield" },
      { name: "Targe", slot: "armor", equipmentType: "paladinShield" }, { name: "Jawbone Cap", slot: "armor", equipmentType: "barbarianHelm" },
      { name: "Wolf Head", slot: "armor", equipmentType: "druidPelt" }, { name: "Preserved Head", slot: "armor", equipmentType: "necromancerHead" },
      { name: "Leather Gloves", slot: "armor", equipmentType: "gloves" }, { name: "Heavy Boots", slot: "armor", equipmentType: "boots" },
      { name: "Sash", slot: "belt" }, { name: "Ring", slot: "charm", equipmentType: "ring" },
      { name: "Amulet", slot: "charm", equipmentType: "amulet" }, { name: "Jewel", slot: "charm", equipmentType: "jewel" },
      { name: "Small Charm", slot: "charm", equipmentType: "charm" }, { name: "Large Charm", slot: "charm", equipmentType: "charm" },
      { name: "Grand Charm", slot: "charm", equipmentType: "charm" },
    ];
    const reachable = new Set(reps.flatMap((item) => itemAffixTypes(item)));
    const expectedTypes = [
      "weapon", "meleeWeapon", "missileWeapon", "throwingWeapon", "bow", "crossbow", "javelin", "spear",
      "sword", "axe", "club", "hammer", "mace", "dagger", "katar", "staff", "wand", "orb", "rod", "scepter",
      "bodyArmor", "helmet", "circlet", "shield", "paladinShield", "barbarianHelm", "druidPelt", "necromancerHead",
      "gloves", "boots", "belt", "ring", "amulet", "charm", "smallCharm", "largeCharm", "grandCharm", "jewel",
    ];
    for (const type of expectedTypes) expect(reachable.has(type as any)).withContext(type).toBeTrue();
    expect(D2_AFFIXES.length).toBeGreaterThan(800);
    for (const affix of D2_AFFIXES) {
      const reachableAtLevel = reps.some((item) => eligibleAffixes(item, affix.level).includes(affix));
      expect(reachableAtLevel).withContext(`${affix.kind} ${affix.name} @ ${affix.level}`).toBeTrue();
    }
  });

  it("applies socket, class-tree, and chance-to-cast rolls through the shared affix roller", () => {
    const jeweler = D2_AFFIXES.find((affix) => affix.kind === "prefix" && affix.name === "Jeweler's")!;
    const socketRoll = rollAffix(jeweler, 90);
    expect(socketRoll.stats.sockets).toBe(4);
    expect(socketRoll.text).toContain("Socketed (4)");

    const fletcher = D2_AFFIXES.find((affix) => affix.name === "Fletcher's" && affix.level === 20)!;
    const treeRoll = rollAffix(fletcher, 90);
    expect(treeRoll.stats.amazonTreeSkillLevels?.["Bow and Crossbow"]).toBe(1);

    const fireBolts = D2_AFFIXES.find((affix) => affix.name === "of Fire Bolts" && affix.level === 6)!;
    const procRoll = rollAffix(fireBolts, 90);
    expect(procRoll.proc).toEqual(jasmine.objectContaining({ trigger: "attack", chance: 5, skill: "Fire Bolt", level: 3 }));
  });

  it("only offers high-level affixes when the base and item level qualify", () => {
    const armor = { name: "Ancient Armor", slot: "armor", equipmentType: "body" };
    const weapon = { name: "Berserker Axe", slot: "weapon" };
    expect(eligibleAffixes(armor, 10, "prefix").some((affix) => affix.name === "Mechanic's")).toBeTrue();
    expect(eligibleAffixes(armor, 32, "prefix").some((affix) => affix.name === "Artisan's")).toBeFalse();
    expect(eligibleAffixes(armor, 55, "prefix").some((affix) => affix.name === "Jeweler's")).toBeTrue();
    expect(eligibleAffixes(armor, 55, "prefix").some((affix) => affix.name === "Cruel")).toBeFalse();
    expect(eligibleAffixes(weapon, 55, "prefix").some((affix) => affix.name === "Cruel")).toBeTrue();
    expect(eligibleAffixes({ name: "Grand Charm", slot: "charm", equipmentType: "charm" }, 50, "prefix")
      .some((affix) => affix.name === "Fletcher's")).toBeTrue();
    expect(eligibleAffixes({ name: "Jewel", slot: "charm", equipmentType: "jewel" }, 16, "prefix")
      .some((affix) => affix.name === "Shimmering")).toBeTrue();
  });

  it("triggers equipped chance-to-cast affixes on their combat event", () => {
    (component as any).runActive = true;
    component.equipment.weapon = {
      id: "proc-test", name: "Proc Test Sword", rarity: "rare", slot: "weapon", desc: "test",
      procs: [{ trigger: "attack", chance: 100, skill: "Fire Bolt", level: 3 }],
    } as any;
    const cast = spyOn(component as any, "castItemProc");
    (component as any).triggerItemProcs("attack");
    expect(cast).toHaveBeenCalledTimes(1);
    (component as any).triggerItemProcs("struck");
    expect(cast).toHaveBeenCalledTimes(1);
  });

  it("applies demon and undead damage bonuses only to matching monsters", () => {
    component.equipment.weapon = {
      id: "slayer-test", name: "Slayer Test Sword", rarity: "rare", slot: "weapon", desc: "test",
      stats: { damageToDemonsPercent: 100, damageToUndeadPercent: 50 },
    } as any;
    const balrog = { species: "balrog" } as any;
    const skeleton = { species: "skeleton" } as any;
    const fallen = { species: "fallen" } as any;
    expect((component as any).enemyTypeDamageMultiplier(balrog)).toBe(2);
    expect((component as any).enemyTypeDamageMultiplier(skeleton)).toBe(1.5);
    expect((component as any).enemyTypeDamageMultiplier(fallen)).toBe(2);
  });

  describe("held javelin grip anchors", () => {
    /**
     * A bundle cel shaped like the javelin art: the shafts pinch to their
     * narrowest high in the frame, while a heavy scroll low in the frame pulls
     * the mass centre down and away from that pinch.
     */
    const bundleCel = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#c8b183";
      // Shafts taper to four pixels wide at y = 28, then stay slender to y = 39.
      for (let y = 20; y <= 28; y += 1) {
        const span = Math.max(4, 26 - (y - 20) * 3);
        context.fillRect(56 - span / 2, y, span, 1);
      }
      context.fillRect(54, 29, 4, 11);
      context.fillRect(2, 40, 76, 40);
      return new THREE.CanvasTexture(canvas);
    };

    it("detects the shaft pinch instead of the cel's mass centre", () => {
      const frame = (component as any).heldItemCelFrame(bundleCel());
      // The narrowest drawn row is at y = 28 of 80, off the frame's middle: a
      // swapped art file that fell back to the 0.5 defaults would leave both
      // anchors centred and hang the bundle beside the fist again.
      expect(frame.pinchY).toBeCloseTo(1 - 28.5 / 80, 4);
      expect(frame.pinchX).toBeCloseTo(55.5 / 80, 4);
      // The mass centre of the same cel sits in the low scroll, not on the
      // shafts, so the two anchors have to disagree.
      expect(Math.abs(frame.pinchY - frame.gripY)).toBeGreaterThan(0.25);
      expect(Math.abs(frame.pinchX - frame.gripX)).toBeGreaterThan(0.1);
      expect(frame.gripY).toBeLessThan(0.35);
    });

    it("keeps the javelin bundle's length share below the longer weapon families", () => {
      const share = (name: string, kind: "weapon" | "offhand" = "weapon") =>
        heldItemShare({ name, kind } as never);
      expect(share("War Javelin")).toBeCloseTo(0.32, 5);
      expect(share("War Javelin", "offhand")).toBeCloseTo(0.272, 5);
      // Smaller than the polearm family it shares a haft with, and smaller than
      // the sword default a javelin fell through to before that family existed.
      expect(share("War Javelin")).toBeLessThan(share("War Spear"));
      expect(share("War Spear")).toBeCloseTo(0.85, 5);
      expect(share("War Javelin")).toBeLessThan(share("Broad Sword"));
      expect(share("Broad Sword")).toBeCloseTo(0.42, 5);
    });
  });
  it("gives every rune its own extracted inventory cel", () => {
    const rune = (name: string) => ({
      id: `rune-${name}`, name, baseName: name, rarity: "normal" as const,
      slot: "charm" as const, equipmentType: "rune" as const, desc: "", stats: {}, affixes: [],
    });
    expect(component.inventoryItemImage(rune("El"))).toBe("assets/d2survivors/items/d2/invrel.png");
    expect(component.inventoryItemImage(rune("Shael"))).toBe("assets/d2survivors/items/d2/invrshae.png");
    expect(component.inventoryItemImage(rune("Jah"))).toBe("assets/d2survivors/items/d2/invrjo.png");
    expect(component.groundItemImage(rune("Ber"))).toBe("assets/d2survivors/items/ground/flprun.png");
  });
  describe("rune affixes", () => {
    const runeItem = (name: string) => ({
      id: `rune-${name}`, name, baseName: name, rarity: "normal" as const, slot: "charm" as const,
      equipmentType: "rune" as const, desc: "", stats: {}, affixes: [],
    });

    it("reads the rune table's weapon, armor and shield rows", () => {
      const tal = D2_RUNE_BY_NAME["tal"];
      expect(tal.inWeapon.lines).toEqual(["+75 Poison Damage over 5 Seconds"]);
      expect(tal.inArmor.stats.poisonResistPercent).toBe(30);
      // D2 gives shields their own parenthesised figure for the resist runes.
      expect(tal.inShield.stats.poisonResistPercent).toBe(35);
      expect(D2_RUNE_BY_NAME["el"].inWeapon.stats.attackRating).toBe(50);
      expect(D2_RUNE_BY_NAME["el"].inShield.stats.armor).toBe(15);
      expect(D2_RUNE_BY_NAME["eld"].inArmor.stats.maxStaminaPercent).toBe(15);
      expect(D2_RUNE_BY_NAME["eld"].inShield.stats.increasedBlockPercent).toBe(7);
      expect(D2_RUNE_BY_NAME["zod"].inWeapon.stats.indestructible).toBe(1);
    });

    it("applies the host's row when a rune is socketed", () => {
      const el = runeItem("El");
      component.inventory[0] = el as any;
      const sword = {
        id: "el-sword", name: "Broad Sword", baseName: "Broad Sword", rarity: "normal",
        slot: "weapon", equipmentType: "weapon", sockets: 1, desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(0, sword)).toBeTrue();
      expect((sword.stats as Record<string, number>)["attackRating"]).toBe(50);
      expect((sword.stats as Record<string, number>)["lightRadius"]).toBe(1);
      expect((sword.stats as Record<string, number>)["armor"]).toBeUndefined();
      expect(sword.socketed[0].lines).toEqual(["+50 to Attack Rating", "+1 to Light Radius"]);

      const shield = {
        id: "el-shield", name: "Kite Shield", baseName: "Kite Shield", rarity: "normal",
        slot: "armor", equipmentType: "shield", sockets: 1, desc: "", stats: {},
      } as any;
      component.inventory[1] = el as any;
      expect(component.socketInventoryItem(1, shield)).toBeTrue();
      expect((shield.stats as Record<string, number>)["armor"]).toBe(15);
      expect((shield.stats as Record<string, number>)["attackRating"]).toBeUndefined();

      // Tal is the clearest three-column rune: damage in a weapon, 30 in armor
      // and the shield's own 35.
      const tal = runeItem("Tal");
      const armor = {
        id: "tal-armor", name: "Chain Mail", baseName: "Chain Mail", rarity: "normal",
        slot: "armor", equipmentType: "body", sockets: 1, desc: "", stats: {},
      } as any;
      component.inventory[2] = tal as any;
      expect(component.socketInventoryItem(2, armor)).toBeTrue();
      expect((armor.stats as Record<string, number>)["poisonResistPercent"]).toBe(30);
      component.inventory[3] = tal as any;
      const talShield = {
        id: "tal-shield", name: "Kite Shield", baseName: "Kite Shield", rarity: "normal",
        slot: "armor", equipmentType: "shield", sockets: 1, desc: "", stats: {},
      } as any;
      expect(component.socketInventoryItem(3, talShield)).toBeTrue();
      expect((talShield.stats as Record<string, number>)["poisonResistPercent"]).toBe(35);
    });

    it("spells out all three host rows in a rune's own description", () => {
      const runes = Array.from({ length: 40 }, () => (component as any).createRuneItem(20) as any);
      for (const rune of runes) {
        expect(rune.affixes.length).toBe(3);
        expect(rune.affixes[0].startsWith("Weapon: ")).toBeTrue();
        expect(rune.affixes[1].startsWith("Armor: ")).toBeTrue();
        expect(rune.affixes[2].startsWith("Shield: ")).toBeTrue();
        expect(rune.desc).toContain("in a weapon");
        expect(rune.desc).not.toContain("No bonus alone");
      }
    });
  });
});
