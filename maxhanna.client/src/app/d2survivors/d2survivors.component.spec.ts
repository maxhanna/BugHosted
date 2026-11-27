import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import * as THREE from "three";
import { type D2LeaderboardEntry, D2SurvivorsService } from "../../services/d2survivors.service";
import {
  BERSERK_SIGIL_HEAD_CLEARANCE,
  BERSERK_SIGIL_SWIRL_CENTRE_X,
  BERSERK_SIGIL_SWIRL_CENTRE_Y,
  BERSERK_SIGIL_SWIRL_RADIUS,
  D2SurvivorsComponent, characterBodyHeight, enemyD2PixelHeight, enemySpriteDirectionRow, enemySpriteRow, wereformAttackRowScale, wereformRow,
} from "./d2survivors.component";

import { D2_ITEM_ART, D2_SET_ITEMS, D2_UNIQUE_ITEMS } from "./d2-item-assets.generated";
import { getD2BaseItemFootprint } from "./d2-item-footprints";
import { D2_HELMET_VISUALS, getHelmetVisualForItem } from "./d2-helmet-visuals.generated";
import { getWeaponVisualForItem } from "./d2-weapon-visuals.generated";
import { helmetHeadFit, helmetMountQuaternion, helmetSeatOffset, helmetSeatScale } from "./d2-helmet-mount";
import { D2_SKILL_ICON_PATHS } from "./d2-skill-icons.generated";
import { PALADIN_AURA_ART } from "./d2-paladin-auras.generated";
import { D2_PALADIN_AURA_HIT_ART } from "./d2-paladin-aura-hits.generated";
import { ARMOR_AURA_ART } from "./d2-armor-auras.generated";
import { BARBARIAN_WARCRY_AURA_ART } from "./d2-barbarian-auras.generated";
import { WARCRY_VOICE_LINES, hasWarcryVoice } from "./d2-warcry-voice";
import { SKILL_IMPACT_SOUNDS, SKILL_SOUNDS } from "./d2-skill-sounds.generated";
import { ITEM_GOLD_SOUNDS } from "./d2-ui-sounds.generated";
import { BONE_ARMOR_ART } from "./d2-bone-armor.generated";
import { FROST_NOVA_ART } from "./d2-frost-nova.generated";
import { NOVA_RING_ART } from "./d2-nova-ring.generated";
import { THUNDER_STORM_ART } from "./d2-thunderstorm.generated";
import { HYDRA_ART } from "./d2-hydra.generated";
import { INFERNO_ART } from "./d2-inferno.generated";
import { ASSASSIN_AURA_ART } from "./d2-assassin-auras.generated";
import { DRUID_SPIRIT_AURA_ART } from "./d2-druid-auras.generated";
import { D2_CLASS_SKILL_TREES, getClassSkills, isPassiveSkill } from "./d2survivors-skill-tree.data";
import { ATTACK_CLIP_INFO, buildCharacterRig, gaitForClass, heldItemShare, heldMeshLength, poseCharacterRig } from "./character-animation";
import { D2_AFFIXES, affixClass, classLockedBase, eligibleAffixes, itemAffixTypes, rollAffix } from "./d2-item-affixes";
import { D2_RUNE_BY_NAME } from "./d2-runes";
import { socketCapacityForBase } from "./d2-socket-caps";
import { AREA_COMPLETE_VOICE_EVENTS, AREA_VOICE_EVENTS, BOSS_VOICE_EVENTS, HERO_VOICE_LINES, heroVoiceLine } from "./d2-hero-voice";
import { GHEED_VOICE_LINES, randomGheedVoiceLine } from "./d2-gheed-voice";

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
    // Every cast charges mana now. These tests are about what a spell does, not
    // about affording it, so they start with an orb no single assertion drains.
    component.playerMaxMana = 1000;
    component.playerMana = 1000;
    // The suite runs in headless Chrome, which reports a precise pointer, so the
    // device default is the desktop scheme. These tests describe the touch
    // caster's behaviour unless they are about the desktop one.
    component.spellsAutoCastOnDevice = true;
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
    expect((component as any).skillCastCooldowns["Fire Bolt"] ?? 0).withContext("Fire Bolt has no recharge").toBe(0);
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

  it("swings on its own only for the touch scheme, never for a desktop pointer", () => {
    component.spellsAutoCastOnDevice = false;
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).isPlayerMoving = false;
    (component as any).attackCooldown = 0;
    const enemy = { kind: "normal", species: "fallen", spriteFrame: 0, x: 262, y: 250, hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [enemy];
    const swing = spyOn(component as any, "performBasicAttack").and.callThrough();

    (component as any).updateBasicAttack();
    expect(swing).withContext("a mouse hero does not swing on his own").not.toHaveBeenCalled();
    expect(enemy.hp).toBe(500);

    // The touch scheme's caster still rotates the idle hand.
    component.spellsAutoCastOnDevice = true;
    (component as any).updateBasicAttack();
    expect(swing).toHaveBeenCalled();

    // A desktop click order is the player's own, so it still swings.
    component.spellsAutoCastOnDevice = false;
    (component as any).attackCooldown = 0;
    (component as any).clickMoveTarget = enemy;
    (component as any).updateBasicAttack();
    expect(swing).toHaveBeenCalledTimes(2);
  });

  it("keeps the automatic caster from firing spells for a desktop pointer", () => {
    component.spellsAutoCastOnDevice = false;
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Battle Orders"];
    component.skillLevels = { "Battle Orders": 1 };
    (component as any).shoutRemaining = 0;
    (component as any).battleOrdersRemaining = 0;
    (component as any).battleCommandRemaining = 0;

    component.activateOwnedSkill("Battle Orders", undefined, undefined, true);
    expect((component as any).battleOrdersRemaining).withContext("no automatic cast").toBe(0);

    // The player's own cast of the same skill still lands.
    component.activateOwnedSkill("Battle Orders");
    expect((component as any).battleOrdersRemaining).toBeGreaterThan(0);
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

  it("drops socketed white helmets like any other base", () => {
    const socketedHelms: any[] = [];
    for (let index = 0; index < 400; index += 1) {
      const item = (component as any).randomItem(40);
      if (item && item.rarity === "normal" && (item.sockets ?? 0) > 0
        && ["helmet", "druidPelt", "barbarianHelm"].includes(item.equipmentType)) {
        socketedHelms.push(item);
      }
    }

    expect(socketedHelms.length).toBeGreaterThan(0);
  });

  it("sets a rune into a socketed druid pelt dropped on it", () => {
    const pelt = {
      id: "pelt-1", name: "Wolf Head", baseName: "Wolf Head", rarity: "normal",
      slot: "armor", equipmentType: "druidPelt", sockets: 2, desc: "", stats: { armor: 8 },
    } as any;
    const rune = {
      id: "rune-el", name: "El", baseName: "El", rarity: "normal",
      slot: "charm", equipmentType: "rune", desc: "", stats: {},
    } as any;
    component.inventory[0] = pelt;
    component.inventory[5] = rune;
    component.dragState = { source: "inventory", slotIndex: 5, item: rune } as any;

    component.onInventoryDrop(0, { preventDefault: () => undefined } as DragEvent);

    expect(component.socketedCount(pelt)).toBe(1);
    expect(component.inventory[5]).toBeNull();
  });

  it("sets a rune into a socketed helmet worn on the character", () => {
    const worn = {
      id: "worn-pelt", name: "Wolf Head", baseName: "Wolf Head", rarity: "normal",
      slot: "armor", equipmentType: "druidPelt", sockets: 2, desc: "", stats: { armor: 8 },
    } as any;
    const rune = {
      id: "rune-eld", name: "Eld", baseName: "Eld", rarity: "normal",
      slot: "charm", equipmentType: "rune", desc: "", stats: {},
    } as any;
    component.equipment.helmet = worn;
    component.inventory[5] = rune;
    component.dragState = { source: "inventory", slotIndex: 5, item: rune } as any;

    component.onEquipmentDrop("helmet", { preventDefault: () => undefined } as DragEvent);

    expect(component.socketedCount(worn)).toBe(1);
    expect(component.inventory[5]).toBeNull();
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

  const socketQuestPack = (item: any, itemLevel = 60): void => {
    component.sanctuaryGold = 40_000;
    component.playerGold = 40_000;
    (component as any).characterProfiles = {};
    component.hasSavedRun = false;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.inventory[0] = item;
    spyOnProperty(component, "currentArea", "get").and.returnValue({ level: itemLevel } as any);
  };

  it("drills a white base to its item-level maximum at Gheed's socket work", () => {
    const sword = { id: "socket-sword", name: "Broad Sword", baseName: "Broad Sword", rarity: "normal", slot: "weapon", desc: "A blade." } as any;
    socketQuestPack(sword);

    // A Broad Sword is 3/4/4 on the master socket table.
    expect(component.socketQuestCapacity(sword)).toBe(4);
    expect(component.socketQuestSummary(sword)).toContain("4 sockets");
    const cost = component.socketQuestCost(sword);

    component.buySocketQuest(sword);

    expect(sword.sockets).toBe(4);
    expect(component.sanctuaryGold).toBe(40_000 - cost);
    expect(component.shopMessage).toContain("Gheed drills 4 sockets");
  });

  it("limits sockets by the master table's item-level brackets", () => {
    const staff = { id: "socket-staff", name: "War Staff", baseName: "War Staff", rarity: "normal", slot: "weapon", desc: "A staff." } as any;
    const dagger = { id: "socket-dagger", name: "Dagger", baseName: "Dagger", rarity: "normal", slot: "weapon", desc: "A dagger." } as any;
    const monarch = { id: "socket-monarch", name: "Monarch", baseName: "Monarch", rarity: "normal", slot: "armor", equipmentType: "shield", desc: "A shield." } as any;
    socketQuestPack(staff, 20);
    const itemLevel = spyOn(component as any, "socketQuestItemLevel").and.returnValue(25);
    // War Staff is 5/6/6: five sockets until item level 26, six from there on.
    expect(component.socketQuestCapacity(staff)).toBe(5);
    itemLevel.and.returnValue(26);
    expect(component.socketQuestCapacity(staff)).toBe(6);
    // A Dagger is 1/1/1 and a Monarch 3/3/4.
    expect(component.socketQuestCapacity(dagger)).toBe(1);
    itemLevel.and.returnValue(40);
    expect(component.socketQuestCapacity(monarch)).toBe(3);
    itemLevel.and.returnValue(41);
    expect(component.socketQuestCapacity(dagger)).toBe(1);
    expect(component.socketQuestCapacity(monarch)).toBe(4);
  });

  it("gives a low item level base the sockets the table allows it", () => {
    const sword = { id: "socket-low", name: "Broad Sword", baseName: "Broad Sword", rarity: "normal", slot: "weapon", desc: "A blade." } as any;
    socketQuestPack(sword, 5);

    expect(component.socketQuestCapacity(sword)).toBe(3);
    component.buySocketQuest(sword);
    expect(sword.sockets).toBe(3);
  });

  it("reads the master socket table's column for the item level", () => {
    // The table's three brackets are 1-25, 26-40 and 41+.
    expect(socketCapacityForBase("War Staff", 20)).toBe(5);
    expect(socketCapacityForBase("War Staff", 25)).toBe(5);
    expect(socketCapacityForBase("War Staff", 26)).toBe(6);
    expect(socketCapacityForBase("War Staff", 41)).toBe(6);
    expect(socketCapacityForBase("Dagger", 41)).toBe(1);
    expect(socketCapacityForBase("Monarch", 30)).toBe(3);
    expect(socketCapacityForBase("Monarch", 41)).toBe(4);
    expect(socketCapacityForBase("Chain Mail", 60)).toBe(2);
    expect(socketCapacityForBase("Aegis", 60)).toBe(4);
    expect(socketCapacityForBase("Wand", 60)).toBe(1);
    expect(socketCapacityForBase("Circlet", 41)).toBe(2);
    expect(socketCapacityForBase("Diadem", 30)).toBe(2);
    expect(socketCapacityForBase("Diadem", 41)).toBe(3);
    // Spelling variants in this game's catalogue find the same row, and bases
    // the table does not list fall back to their family allowance.
    expect(socketCapacityForBase("Kris", 41)).toBe(3);
    expect(socketCapacityForBase("Succubus Skull", 41)).toBe(2);
    expect(socketCapacityForBase("Mithral Point", 41)).toBe(1);
    expect(socketCapacityForBase("Blasphemous Grimoire", 41)).toBeUndefined();
  });

  it("rolls one or two sockets into a magic base", () => {
    const first = { id: "socket-magic-1", name: "Cruel Broad Sword", baseName: "Broad Sword", rarity: "magic", slot: "weapon", desc: "A blade." } as any;
    const second = { id: "socket-magic-2", name: "Cruel Broad Sword", baseName: "Broad Sword", rarity: "magic", slot: "weapon", desc: "A blade." } as any;
    socketQuestPack(first);
    (spyOn(Math, "random") as jasmine.Spy).and.returnValue(0.2);
    component.buySocketQuest(first);
    expect(first.sockets).toBe(2);

    component.inventory[0] = second;
    (Math.random as jasmine.Spy).and.returnValue(0.9);
    component.buySocketQuest(second);
    expect(second.sockets).toBe(1);
  });

  it("gives rarer items exactly one socket and refuses unusable ones", () => {
    const rare = { id: "socket-rare", name: "Rare Broad Sword", baseName: "Broad Sword", rarity: "rare", slot: "weapon", desc: "A blade." } as any;
    const ring = { id: "socket-ring", name: "Soulstone Ring", baseName: "Ring", rarity: "unique", slot: "charm", equipmentType: "ring", desc: "A ring." } as any;
    const already = { id: "socket-already", name: "Chain Mail", baseName: "Chain Mail", rarity: "normal", slot: "armor", equipmentType: "body", sockets: 2, desc: "Mail." } as any;
    socketQuestPack(rare);

    expect(component.socketQuestCapacity(rare)).toBe(4);
    component.buySocketQuest(rare);
    expect(rare.sockets).toBe(1);

    expect(component.socketQuestCapacity(ring)).toBe(0);
    expect(component.socketQuestCapacity(already)).toBe(0);
    expect(component.socketQuestSummary(already)).toContain("already has 2 sockets");

    component.inventory[0] = already;
    const gold = component.sanctuaryGold;
    component.buySocketQuest(already);
    expect(already.sockets).toBe(2);
    expect(component.sanctuaryGold).toBe(gold);
    expect(component.shopMessage).toContain("cannot take sockets");
  });

  it("imbues a white base into a rare rolled at character level plus four", () => {
    const plate = {
      id: "imbue-plate", name: "Chain Mail", baseName: "Chain Mail", rarity: "normal",
      slot: "armor", equipmentType: "body", desc: "Mail.", stats: { defense: 60 },
    } as any;
    socketQuestPack(plate);
    component.playerLevel = 22;

    expect(component.imbueItemLevel).toBe(26);
    expect(component.imbueEligible(plate)).toBeTrue();
    const cost = component.imbueCost;
    component.imbueItem(plate);

    expect(plate.rarity).toBe("rare");
    expect(plate.affixes.length).toBeGreaterThan(0);
    expect(plate.name).not.toBe("Chain Mail");
    expect(plate.stats.defense).toBeTruthy();
    expect(component.sanctuaryGold).toBe(40_000 - cost);
    expect(component.shopMessage).toContain("now rare");
  });

  it("refuses to imbue anything but an unsocketed white weapon or armour", () => {
    const magic = { id: "imbue-magic", name: "Cruel Chain Mail", baseName: "Chain Mail", rarity: "magic", slot: "armor", equipmentType: "body", desc: "Mail." } as any;
    const socketed = { id: "imbue-socketed", name: "Chain Mail", baseName: "Chain Mail", rarity: "normal", slot: "armor", equipmentType: "body", sockets: 2, desc: "Mail." } as any;
    const ring = { id: "imbue-ring", name: "Ring", baseName: "Ring", rarity: "normal", slot: "charm", equipmentType: "ring", desc: "A ring." } as any;
    const charm = { id: "imbue-charm", name: "Grand Charm", baseName: "Grand Charm", rarity: "normal", slot: "charm", equipmentType: "charm", desc: "A charm." } as any;
    const jewel = { id: "imbue-jewel", name: "Jewel", baseName: "Jewel", rarity: "normal", slot: "charm", equipmentType: "jewel", desc: "A jewel." } as any;
    socketQuestPack(ring);

    expect(component.imbueEligible(magic)).toBeFalse();
    expect(component.imbueEligible(socketed)).toBeFalse();
    expect(component.imbueEligible(ring)).toBeFalse();
    expect(component.imbueEligible(charm)).toBeFalse();
    expect(component.imbueEligible(jewel)).toBeFalse();

    const gold = component.sanctuaryGold;
    component.imbueItem(ring);
    expect(ring.rarity).toBe("normal");
    expect(component.sanctuaryGold).toBe(gold);
    expect(component.shopMessage).toContain("cannot be imbued");
  });

  it("will not imbue an item the purse cannot pay for", () => {
    const plate = { id: "imbue-broke", name: "Chain Mail", baseName: "Chain Mail", rarity: "normal", slot: "armor", equipmentType: "body", desc: "Mail." } as any;
    socketQuestPack(plate);
    component.sanctuaryGold = component.imbueCost - 1;

    component.imbueItem(plate);

    expect(plate.rarity).toBe("normal");
    expect(component.shopMessage).toContain("more gold for the imbue");
  });

  it("arms a quest tool and asks before it touches the clicked item", () => {
    const sword = { id: "quest-arm", name: "Broad Sword", baseName: "Broad Sword", rarity: "normal", slot: "weapon", desc: "A blade." } as any;
    socketQuestPack(sword);
    component.menuPanel = "shop";

    component.armQuestReward("socket");
    expect(component.questRewardMode).toBe("socket");
    expect(component.questRewardConfirm).toBeNull();

    component.onInventoryItemClick(0, sword, new MouseEvent("click"));

    expect(component.questRewardConfirm?.mode).toBe("socket");
    expect(component.questRewardConfirm?.item).toBe(sword);
    expect(component.questRewardConfirmText).toContain("socket Broad Sword");
    expect(sword.sockets).toBeUndefined();

    component.cancelQuestReward();
    expect(component.questRewardConfirm).toBeNull();
    expect(component.questRewardMode).toBeNull();
    expect(sword.sockets).toBeUndefined();
  });

  it("runs the imbue only after the confirmation", () => {
    const plate = { id: "quest-confirm", name: "Chain Mail", baseName: "Chain Mail", rarity: "normal", slot: "armor", equipmentType: "body", desc: "Mail.", stats: { defense: 40 } } as any;
    socketQuestPack(plate);
    component.menuPanel = "shop";
    component.playerLevel = 22;
    const gold = component.sanctuaryGold;

    component.armQuestReward("imbue");
    component.onInventoryItemClick(0, plate, new MouseEvent("click"));
    expect(plate.rarity).toBe("normal");
    expect(component.sanctuaryGold).toBe(gold);

    component.confirmQuestReward();

    expect(plate.rarity).toBe("rare");
    expect(component.sanctuaryGold).toBe(gold - component.imbueCost);
    expect(component.questRewardMode).toBeNull();
    expect(component.questRewardConfirm).toBeNull();
  });

  it("turns the armed tool away from an item it cannot work on", () => {
    const ring = { id: "quest-ring", name: "Ring", baseName: "Ring", rarity: "normal", slot: "charm", equipmentType: "ring", desc: "A ring." } as any;
    socketQuestPack(ring);
    component.menuPanel = "shop";

    component.armQuestReward("imbue");
    component.onInventoryItemClick(0, ring, new MouseEvent("click"));

    expect(component.questRewardConfirm).toBeNull();
    expect(component.questRewardMode).toBe("imbue");
    expect(component.shopMessage).toContain("cannot be imbued");
  });

  it("greets the player in his own voice when Gheed's shop opens", () => {
    spyOn(component as any, "stopMenuHeroPreview");
    spyOn(component as any, "startMenuHeroPreview");
    (component as any).menuSoundPreferred = false;
    component.gheedSpeech = null;

    component.openGheedsShop();

    expect(component.menuPanel).toBe("shop");
    expect(GHEED_VOICE_LINES.map((line) => line.text)).toContain(component.gheedSpeech!);

    component.closeGheedsShop();
    expect(component.gheedSpeech).toBeNull();
  });

  it("ships only Gheed greetings whose voice file and subtitle agree", () => {
    expect(GHEED_VOICE_LINES.length).toBeGreaterThan(0);
    for (const line of GHEED_VOICE_LINES) {
      expect(line.path).toContain("/voice/gheed/");
      expect(line.text.length).toBeGreaterThan(0);
    }
    expect(randomGheedVoiceLine(() => 0)).toBe(GHEED_VOICE_LINES[0]);
    expect(randomGheedVoiceLine(() => 0.999999)).toBe(GHEED_VOICE_LINES[GHEED_VOICE_LINES.length - 1]);
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
    // Only a mouse-button slot casts on its own, so the spell under test sits in
    // the left slot.
    component.basicAttackSpell = "Charged Bolt";
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any,
    ];
    component.attackProjectiles = [];
    component.keysDown.add("d");

    (component as any).updateBasicAttack();
    component.activateOwnedSkill("Charged Bolt");

    expect(component.attackProjectiles.length).toBe(0);

    component.keysDown.delete("d");
    (component as any).updateBasicAttack();

    expect(component.attackProjectiles.length).toBeGreaterThan(0);
  });

  it("holds automatic and direct spells until the hero reaches a clicked enemy", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 1 };
    component.basicAttackSpell = "Charged Bolt";
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
    (component as any).updateBasicAttack();
    component.activateOwnedSkill("Charged Bolt");
    expect(component.attackProjectiles).toHaveSize(0);

    // Once the hero is at the click stop distance, combat may cast again.
    target.x = 130;
    expect((component as any).playerChasingClickedTarget).toBeFalse();
    (component as any).updateBasicAttack();
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
  });

  it("casts only the two mouse-slot spells on its own, never the rest of the book", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Bolt", "Ice Bolt"];
    component.skillLevels = { "Charged Bolt": 1, "Ice Bolt": 1 };
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2 } as any,
    ];
    component.attackProjectiles = [];
    component.basicAttackSpell = null;
    component.secondaryAttackSpell = null;

    for (let frame = 0; frame < 240; frame += 1) (component as any).updateBasicAttack();
    expect(component.attackProjectiles).toHaveSize(0);

    component.basicAttackSpell = "Charged Bolt";
    for (let frame = 0; frame < 240; frame += 1) (component as any).updateBasicAttack();
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    // The spell that never made it into a slot stays in the book, ready.
    expect(component.skillCastCooldowns["Ice Bolt"]).toBeUndefined();
  });


  it("alternates the two mouse hands when nothing is clicked", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Bolt", "Ice Bolt"];
    component.skillLevels = { "Charged Bolt": 1, "Ice Bolt": 1 };
    component.basicAttackSpell = "Charged Bolt";
    component.secondaryAttackSpell = "Ice Bolt";
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 330, y: 250, hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2 } as any,
    ];
    component.attackProjectiles = [];
    for (const key of Object.keys(component.skillCastCooldowns)) delete component.skillCastCooldowns[key];
    (component as any).clickMoveTarget = null;
    const casts: string[] = [];
    const cast = component.activateOwnedSkill.bind(component);
    spyOn(component, "activateOwnedSkill").and.callFake((skill: string, preferred?: any, groundPoint?: any) => {
      casts.push(skill);
      cast(skill, preferred, groundPoint);
    });

    for (let turn = 0; turn < 3; turn += 1) {
      (component as any).attackCooldown = 0;
      for (const key of Object.keys(component.skillCastCooldowns)) delete component.skillCastCooldowns[key];
      (component as any).updateBasicAttack();
    }

    // Left, right, left: neither hand monopolises the fight.
    expect(casts).toEqual(["Charged Bolt", "Ice Bolt", "Charged Bolt"]);
  });

  it("uses only the left hand while a monster is left-clicked", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Bolt", "Ice Bolt"];
    component.skillLevels = { "Charged Bolt": 1, "Ice Bolt": 1 };
    component.basicAttackSpell = "Charged Bolt";
    component.secondaryAttackSpell = "Ice Bolt";
    // Already at the click stop distance, so the fight is live rather than a walk.
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).clickMoveTarget = target;
    const casts: string[] = [];
    const cast = component.activateOwnedSkill.bind(component);
    spyOn(component, "activateOwnedSkill").and.callFake((skill: string, preferred?: any, groundPoint?: any) => {
      casts.push(skill);
      cast(skill, preferred, groundPoint);
    });

    for (let turn = 0; turn < 3; turn += 1) {
      (component as any).attackCooldown = 0;
      for (const key of Object.keys(component.skillCastCooldowns)) delete component.skillCastCooldowns[key];
      (component as any).updateBasicAttack();
    }

    // The right hand never answers a left click.
    expect(casts).toEqual(["Charged Bolt", "Charged Bolt", "Charged Bolt"]);
    expect(component.attackProjectiles.every((projectile) => projectile.missileId === "d2-chargedbolt")).toBeTrue();
  });

  it("never answers a right click with the left hand", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Attack", "Fire Bolt"];
    component.skillLevels = { Attack: 1, "Fire Bolt": 1 };
    component.selectAttackSpellForSlot("secondary", "Fire Bolt");
    component.skillCastCooldowns["Fire Bolt"] = 5;
    const arena = document.createElement("canvas");
    arena.className = "d2s-arena";
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
    Object.defineProperty(event, "target", { value: arena });
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any,
    ];
    component.attackProjectiles = [];
    component.floatingTexts = [];
    (component as any).attackCooldown = 0;
    const leftAttack = spyOn(component, "attackNearestEnemy");

    // The right spell is still recharging, so the right click simply passes.
    component.onArenaContextMenu(event);

    expect(leftAttack).not.toHaveBeenCalled();
    expect(component.attackProjectiles).toHaveSize(0);
    expect(component.floatingTexts).toHaveSize(0);
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

  it("casts the right-button attack on a right-click at the cursor", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Attack", "Charged Bolt"];
    component.skillLevels = { Attack: 1, "Charged Bolt": 1 };
    component.selectAttackSpellForSlot("secondary", "Charged Bolt");
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
    component.selectAttackSpellForSlot("secondary", null);
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
    component.selectAttackSpellForSlot("secondary", "Fire Bolt");
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

  it("keeps a spell on each mouse button from the picker that is open", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Fire Bolt", "Ice Bolt"];

    // The left button keeps its spell while the right button takes its own.
    component.toggleBasicAttackPicker("basic");
    expect(component.basicAttackPickerTitle).toBe("Basic attack");
    component.selectAttackSpell("Fire Bolt");
    component.toggleBasicAttackPicker("secondary");
    expect(component.basicAttackPickerOpen).toBeTrue();
    expect(component.basicAttackPickerTitle).toBe("Right attack");
    expect(component.basicAttackPickerSelected).toBeNull();
    component.selectAttackSpell("Ice Bolt");

    expect(component.basicAttackSpell).toBe("Fire Bolt");
    expect(component.secondaryAttackSpell).toBe("Ice Bolt");
    expect(component.basicAttackSlotSkill).toBe("Fire Bolt");
    expect(component.secondaryAttackSlotSkill).toBe("Ice Bolt");
    expect(component.secondaryAttackSlotTitle).toContain("Ice Bolt");

    // Opening the left slot again shows the left spell, not the right one.
    component.toggleBasicAttackPicker("basic");
    expect(component.basicAttackPickerSelected).toBe("Fire Bolt");
    component.selectAttackSpell(null);
    expect(component.basicAttackSpell).toBeNull();
    expect(component.secondaryAttackSpell).toBe("Ice Bolt");
  });

  it("binds F1-F8 to the pointed spell and equips it on the right button", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Fire Bolt", "Ice Bolt"];
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      component.onGlobalAttackKey(event);
      return event;
    };

    // F1 on a spell row while the picker is open binds that key to the spell.
    component.toggleBasicAttackPicker("secondary");
    component.basicAttackPickerHoveredSkill = "Ice Bolt";
    const bindEvent = press("F1");
    expect(bindEvent.defaultPrevented).toBeTrue();
    expect(component.attackSlotKeyBinds[1]).toBe("Ice Bolt");
    expect(component.attackBindLabel("Ice Bolt")).toBe("F1");
    expect(component.basicAttackPickerOpen).toBeTrue();

    // A spell only carries one key: binding it to F2 moves it off F1.
    press("F2");
    expect(component.attackSlotKeyBinds[1]).toBeUndefined();
    expect(component.attackSlotKeyBinds[2]).toBe("Ice Bolt");
    expect(component.attackBindLabel("Ice Bolt")).toBe("F2");

    // A press on the weapon row clears that key instead of binding "Attack".
    component.basicAttackPickerHoveredSkill = "Attack";
    press("F3");
    expect(component.attackSlotKeyBinds[3]).toBeUndefined();

    // With the list closed the key drops its spell onto the right button.
    component.closeBasicAttackPicker();
    expect(component.secondaryAttackSpell).toBeNull();
    press("F2");
    expect(component.secondaryAttackSpell).toBe("Ice Bolt");
    expect(component.basicAttackSpell).toBeNull();

    // An unbound key changes nothing.
    press("F8");
    expect(component.secondaryAttackSpell).toBe("Ice Bolt");
  });

  it("drops F-key binds the hero can no longer cast when a save loads", () => {
    component.selectedClass = "sorceress";
    component.basicAttackName = "Attack";
    component.ownedSkills = ["Attack", "Fire Bolt", "Frost Nova"];
    const classSkills = new Set(["Attack", "Fire Bolt", "Frost Nova"]);
    const cleaned = (component as any).sanitizeAttackSlotKeyBinds(
      { 1: "Fire Bolt", 2: "Frost Nova", 3: "Meteor", 9: "Fire Bolt", 4: 42 },
      classSkills,
    );
    expect(cleaned).toEqual({ 1: "Fire Bolt", 2: "Frost Nova" });
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

  it("sends Twister in a straight path through enemies to the screen edge", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Twister"];
    component.skillLevels = { Twister: 1 };
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any;
    const far = { kind: "normal", species: "fallen", spriteFrame: 0, x: 410, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any;
    component.enemies = [near, far];
    (component as any).rebuildEnemyGrid();
    component.activateOwnedSkill("Twister");
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
  });

  it("pulses a Tornado's radial damage five times over a three-second life", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Tornado"];
    component.skillLevels = { Tornado: 1 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100000, maxHp: 100000, speed: 0, r: 14, dmg: 0 } as any];
    (component as any).rebuildEnemyGrid();
    component.attackProjectiles = [];

    component.activateOwnedSkill("Tornado");
    const tornado = component.attackProjectiles[0];
    expect(tornado.life).toBeCloseTo(3, 5);
    expect(tornado.pulseSeconds).toBeCloseTo(0.6, 5);
    expect(tornado.pulseRadius).toBeGreaterThan(0);
    expect(tornado.stopsAtWalls).toBeTrue();
    // It weaves toward the aim point rather than tracing a straight ray.
    expect(tornado.driftStrength).toBeGreaterThan(0);
    expect(tornado.driftFrequency).toBeCloseTo(3.2, 5);
    const pathSeed = tornado.driftSeed;

    const pulses = spyOn(component as any, "applyTornadoPulse").and.callThrough();
    for (let frame = 0; frame < 200; frame += 1) (component as any).updateAttackProjectiles(16);

    // Five pulses: the cast frame and every 15 frames after it.
    expect(pulses).toHaveBeenCalledTimes(5);
    expect(component.attackProjectiles.length).toBe(0);

    // Aiming at the same point again replays the same path.
    component.activateOwnedSkill("Tornado");
    expect(component.attackProjectiles[0].driftSeed).toBe(pathSeed);
  });

  it("stops a Tornado at a wall instead of crossing it", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Tornado"];
    component.skillLevels = { Tornado: 1 };
    // A monster has to be in view or the cast falls back to a plain bolt.
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 800, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 0 } as any];
    (component as any).rebuildEnemyGrid();
    spyOn(component as any, "campaignCollisionContext").and.returnValue({ clearance: 8, blocksSight: true } as any);
    spyOn(component as any, "campaignLineBlocked").and.callFake(
      (_context: any, _x: number, _y: number, toX: number) => toX > 300,
    );
    component.attackProjectiles = [];
    component.activateOwnedSkill("Tornado");

    for (let frame = 0; frame < 40; frame += 1) (component as any).updateAttackProjectiles(16);

    // Spent on the wall well before the three seconds are up.
    expect(component.attackProjectiles.length).toBe(0);
  });

  it("keeps player attacks aimed at monsters instead of friendly summons", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.skillPoints = 0;
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

  it("resolves an HD held mesh for every base whose family the extraction ships", () => {
    // D2R's hd/items/items.json names the mesh each base is held as; the
    // normcode column only says which base an exceptional item scales from, so
    // orbs, claws and shields used to land on a family that had no mesh and
    // fell back to the flat inventory cel in the menu and in game.
    for (const base of ["Jared's Stone", "Swirling Crystal", "Dimensional Shard", "Cestus", "Wrist Blade",
      "Blade Talons", "Great Sword", "Small Shield"]) {
      expect(getWeaponVisualForItem({ baseName: base, name: base })?.id).withContext(base).toBeTruthy();
    }
    expect(getWeaponVisualForItem({ baseName: "Jared's Stone", name: "Jared's Stone" })?.id).toBe("dragon_stone");
    expect(getWeaponVisualForItem({ baseName: "Wrist Blade", name: "Wrist Blade" })?.id).toBe("katar");
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

  it("sizes a mounted crossbow by its stock instead of its limb thickness", () => {
    // D2R lays a crossbow out flat: 0.98 across the limbs, 0.20 thick and 1.21
    // along the stock. Measuring the mesh's height sized the stock to half the
    // hero's height and the limbs to more than the hero's width.
    expect(heldMeshLength("crossbow", { x: 0.978, y: 0.203, z: 1.212 })).toBeCloseTo(1.212, 5);
    expect(heldMeshLength("light_crossbow", { x: 1.112, y: 0.172, z: 0.997 })).toBeCloseTo(1.112, 5);
    // Every other family stands on end, so its own height is its length.
    expect(heldMeshLength("hunters_bow", { x: 0.09, y: 1.998, z: 1.203 })).toBeCloseTo(1.998, 5);
    expect(heldMeshLength("long_sword", { x: 0.047, y: 1.182, z: 0.221 })).toBeCloseTo(1.182, 5);
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

  it("keeps a socketed gem's cel in the hole it fills", () => {
    const host = {
      id: "armor-3holes", name: "Ring Mail", baseName: "Ring Mail", rarity: "normal",
      slot: "armor", equipmentType: "body", sockets: 3, desc: "", stats: { armor: 20 },
    } as any;
    const skull = {
      id: "gem-skull", name: "Perfect Skull", baseName: "Perfect Skull", rarity: "normal",
      slot: "charm", equipmentType: "gem", desc: "", stats: {},
    } as any;
    component.inventory[0] = host;
    component.inventory[1] = skull;

    expect((component as any).socketedArt(host, 0)).toBeNull();
    expect(component.socketInventoryItem(1, host)).toBeTrue();

    // One skull fills the first hole; the other two stay open.
    expect((component as any).socketedArt(host, 0)).toBe((component as any).inventoryItemImage(skull));
    expect((component as any).socketedArt(host, 1)).toBeNull();
    expect((component as any).socketedArt(host, 2)).toBeNull();
    expect((component as any).socketedArt(null, 0)).toBeNull();

    // The cel is stored with the item, so the hole stays filled across a reload.
    const saved = JSON.parse(JSON.stringify(host));
    expect((component as any).socketedArt(saved, 0)).toBe((component as any).inventoryItemImage(skull));
  });

  it("sets a jewel into a socketed druid pelt, in the pack and worn", () => {
    const pelt = {
      id: "pelt-1", name: "Wolf Head", baseName: "Wolf Head", rarity: "rare",
      slot: "armor", equipmentType: "druidPelt", restrictedClass: "druid",
      sockets: 1, desc: "", stats: { armor: 20 },
    } as any;
    const jewel = {
      id: "jewel-rare", name: "Jewel of Fervor", baseName: "Jewel", rarity: "rare",
      slot: "charm", equipmentType: "jewel", desc: "",
      stats: { increasedAttackSpeedPercent: 15 }, affixes: ["+15% Increased Attack Speed"],
    } as any;
    component.inventory[0] = pelt;
    component.inventory[1] = jewel;
    expect(component.socketInventoryItem(1, pelt)).toBeTrue();
    expect(component.socketedCount(pelt)).toBe(1);
    expect(pelt.socketed[0].name).toBe("Jewel of Fervor");
    expect(component.inventory[1]).toBeNull();

    // Dropping on the pelt's body, not its top-left cell, still finds the host.
    const dropped = { ...pelt, id: "pelt-drop", socketed: undefined, stats: { armor: 20 } } as any;
    const dropJewel = { ...jewel, id: "jewel-drop" } as any;
    (component as any).rebuildInventoryGrid();
    component.inventory[10] = dropped;
    component.inventory[0] = dropJewel;
    (component as any).dragState = { source: "inventory", slotIndex: 0, item: dropJewel };
    component.onInventoryDragOver(11, { preventDefault: () => undefined } as DragEvent);
    component.onInventoryDrop(11, { preventDefault: () => undefined } as DragEvent);
    expect(component.socketedCount(dropped)).toBe(1);
    expect(component.inventory[0]).toBeNull();

    // A worn pelt takes the same jewel through the paperdoll drop.
    const worn = { ...pelt, id: "pelt-2", socketed: undefined, stats: { armor: 20 } } as any;
    const second = { ...jewel, id: "jewel-rare-2" } as any;
    component.inventory[2] = worn;
    component.inventory[3] = second;
    (component as any).equipment.helmet = worn;
    (component as any).dragState = { source: "inventory", slotIndex: 3, item: second };
    component.onEquipmentDrop("helmet", { preventDefault: () => undefined } as DragEvent);
    expect(component.socketedCount(worn)).toBe(1);
    expect(component.inventory[3]).toBeNull();

    // The generated named jewels carry `equipmentType: "charm"`; they are
    // jewels all the same and must set into a socket.
    const namedJewel = {
      id: "defenders-bile", name: "Defender's Bile", baseName: "Colossal Jewel",
      rarity: "unique", slot: "charm", equipmentType: "charm", desc: "",
      stats: { magicFindPercent: 35 }, affixes: ["35% Better Chance of Getting Magic Items"],
    } as any;
    expect(component.isSocketable(namedJewel)).toBeTrue();
    expect((component as any).getEquipmentType(namedJewel)).toBe("jewel");
    // The "Jeweler's" armour prefix is not a jewel.
    expect((component as any).getEquipmentType({
      id: "jewelers-sword", name: "Jeweler's Short Sword", baseName: "Short Sword",
      rarity: "magic", slot: "weapon", desc: "",
    } as any)).toBe("weapon");
    const thirdPelt = { ...pelt, id: "pelt-3", socketed: undefined, stats: { armor: 20 } } as any;
    component.inventory[4] = thirdPelt;
    component.inventory[5] = namedJewel;
    expect(component.socketInventoryItem(5, thirdPelt)).toBeTrue();
    expect(thirdPelt.socketed[0].name).toBe("Defender's Bile");
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
    // A wide base (a shield, a body armour) takes the two-column layout.
    for (const sockets of [1, 2, 3, 4, 5, 6]) {
      const holes = (component as any).socketHoles({ sockets, baseName: "Kite Shield" } as any) as Array<{ left: number; top: number }>;
      expect(holes.length).toBe(sockets);
      for (const hole of holes) {
        expect(hole.left).toBeGreaterThan(10);
        expect(hole.left).toBeLessThan(90);
        expect(hole.top).toBeGreaterThan(10);
        expect(hole.top).toBeLessThan(90);
        // Only the centres are laid out here: every hole is one fixed size in
        // CSS, so a socket no longer shrinks with the item it was punched into.
        expect(Object.keys(hole).sort()).toEqual(["left", "top"]);
      }
      expect(new Set(holes.map((hole) => `${hole.left},${hole.top}`)).size).toBe(sockets);
    }
  });

  it("runs the sockets down the art of a one-cell-wide weapon", () => {
    // A staff is one cell wide, so a row of holes was squeezed into that single
    // column and the slot box clipped it. The holes run down its length instead,
    // centred on its width and spread over the whole box.
    const staff = (component as any).socketHoles({ sockets: 3, baseName: "Battle Staff" } as any) as Array<{ left: number; top: number }>;
    expect(staff.length).toBe(3);
    expect(staff.every((hole) => hole.left === 50)).toBeTrue();
    expect(staff[0].top).toBeLessThan(staff[1].top);
    expect(staff[1].top).toBeLessThan(staff[2].top);
    expect(staff[0].top).toBeLessThanOrEqual(25);
    expect(staff[2].top).toBeGreaterThanOrEqual(75);

    const axe = (component as any).socketHoles({ sockets: 2, baseName: "Hand Axe" } as any) as Array<{ left: number; top: number }>;
    expect(axe).toHaveSize(2);
    expect(axe.every((hole) => hole.left === 50)).toBeTrue();
    expect(axe[0].top).toBeLessThan(axe[1].top);

    // A dirk is two cells tall and one wide: its two holes stack well apart.
    const dirk = (component as any).socketHoles({ sockets: 2, baseName: "Dirk" } as any) as Array<{ left: number; top: number }>;
    expect(dirk).toHaveSize(2);
    expect(dirk.every((hole) => hole.left === 50)).toBeTrue();
    expect(dirk[1].top - dirk[0].top).toBeGreaterThanOrEqual(30);
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

  it("turns a held weapon with the hero instead of pinning it to one world direction", () => {
    component.selectedClass = "barbarian";
    component.equipment.weapon = { id: "main", name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    component.equipment.shield = null;
    const { model } = buildBiped();
    const anchor = new THREE.Group();
    anchor.add(model);
    const attach = new THREE.Bone();
    attach.name = "R_weapon_attach";
    model.add(attach);
    (component as any).configureClassMeleeWeapon(model, "barbarian");
    const rig = buildCharacterRig(model, "barbarian");
    const weapon = model.getObjectByName("equipped_weapon_weapon");
    expect(weapon).toBeDefined();
    const pose = (): void => {
      poseCharacterRig(rig, {
        time: 0.4,
        walkPhase: 0,
        walk: 0,
        attackTime: Number.POSITIVE_INFINITY,
        attackSide: -1,
        gait: gaitForClass("barbarian"),
      });
    };
    const worldQuaternion = (): THREE.Quaternion => weapon!.getWorldQuaternion(new THREE.Quaternion());

    anchor.updateMatrixWorld(true);
    pose();
    const facingForward = worldQuaternion();

    // The hero turned a quarter turn, so the blade has to turn with him.
    anchor.rotation.y = Math.PI / 2;
    anchor.updateMatrixWorld(true);
    pose();
    expect(facingForward.angleTo(worldQuaternion())).toBeCloseTo(Math.PI / 2, 2);
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

  it("treats every polearm as two-handed, even in a Barbarian's off hand", () => {
    component.selectedClass = "barbarian";
    component.playerLevel = 30;
    const polearms = [
      "Bardiche", "Voulge", "Scythe", "Poleaxe", "Halberd", "War Scythe",
      "Lochaber Axe", "Bill", "Battle Scythe", "Partizan", "Grim Scythe",
      "Ogre Axe", "Colossus Voulge", "Thresher", "Great Poleaxe", "Cryptic Axe", "Giant Thresher",
    ];
    for (const name of polearms) {
      const item = {
        id: name.toLowerCase().replace(/\s+/g, "-"), name, baseName: name, rarity: "normal",
        slot: "weapon", equipmentType: "weapon", requiredLevel: 1, desc: "A long-hafted weapon.",
      } as any;
      expect(component.itemStatText(item)).toContain("Two-Handed — occupies both hands");
    }

    // The unique Partizan's own name hides its base, so the base name has to
    // decide; otherwise a Barbarian could hang a second weapon beside it.
    const partizan = {
      id: "partizan", name: "Pierre Tombale Couant", baseName: "Partizan", rarity: "unique",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1, desc: "A unique Partizan.",
    } as any;
    const sword = {
      id: "polearm-offhand-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1, desc: "A short blade.",
    } as any;
    expect(component.itemStatText(partizan)).toContain("Two-Handed — occupies both hands");

    component.inventory = Array.from({ length: 40 }, () => null);
    component.equipment = { weapon: partizan, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
    component.inventory[0] = sword;
    component.equipSelectedItem(0);
    expect(component.equipment.shield).toBeNull();
    expect(component.inventory[0]?.id).toBe("polearm-offhand-sword");
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

    // Axe Mastery rank 5 is +48% weapon damage from the guidebook table.
    expect(component.inventoryAttackDamage).toBe(149);
    expect(masteryLine?.label).toContain("Hand Axe");
    expect(masteryLine?.value).toBe("+48% damage, 21% critical strike");
    expect(tooltip.lines.find((line) => line.label === "Weapon & damage gear")?.value).toBe("+1");
    expect(tooltip.lines.find((line) => line.total)?.value).toBe("149");
  });

  it("follows the Combat Masteries tables for damage, attack and critical strike", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = {
      "Blade Mastery": 20, "Axe Mastery": 5, "Polearm Mastery": 1, "Spear Mastery": 1,
      "Throwing Mastery": 5, "Iron Skin": 3, "Increased Stamina": 5, "Increased Speed": 5,
      "Natural Resistance": 5,
    };

    expect(component.masteryDamagePercentForRank(1)).toBe(28);
    expect(component.masteryDamagePercentForRank(20)).toBe(123);
    expect(component.masteryAttackPercentForRank("Axe Mastery", 20)).toBe(192);
    // Polearms, spears and throwing weapons open at 44% instead of 40%.
    expect(component.masteryAttackPercentForRank("Polearm Mastery", 1)).toBe(44);
    expect(component.masteryAttackPercentForRank("Spear Mastery", 1)).toBe(44);
    expect(component.masteryCritPercentForRank(1)).toBe(5);
    expect(component.masteryCritPercentForRank(20)).toBe(29);

    // Critical strike is the table plus a fifth of the attack bonus.
    component.equipment.weapon = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", stats: { damageMin: 1, damageMax: 1 } } as any;
    component.equipment.shield = null;
    expect(component.activeWeaponMastery).toEqual({ skill: "Axe Mastery", rank: 5 });
    expect(component.criticalStrikeChance).toBeCloseTo(17 + 72 * 0.05);

    // Daggers count for Blade Mastery after the remaster's rename.
    component.equipment.weapon = { name: "Dagger", baseName: "Dagger", slot: "weapon", stats: { damageMin: 1, damageMax: 1 } } as any;
    expect(component.activeWeaponMastery).toEqual({ skill: "Blade Mastery", rank: 20 });
    expect(component.weaponMasteryDamagePercent).toBe(123);

    // Iron Skin's permanent Defense feeds the same dodge roll as Shout.
    component.equipment.weapon = null;
    expect(component.ironSkinDefensePercent).toBe(50);
    expect(component.combatDefenseAvoidChance).toBeCloseTo(Math.min(45, 50 * 0.18) / 100);
  });

  it("lands a mastery critical strike for double damage on a physical blow", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = { "Axe Mastery": 5 };
    component.equipment.weapon = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", stats: { damageMin: 1, damageMax: 1 } } as any;
    component.equipment.shield = null;
    component.floatingTexts = [];
    const enemy = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0 } as any;

    const random = spyOn(Math, "random").and.returnValue(0);
    const critical = (component as any).dealMeleeDamage(enemy, 100);
    expect(enemy.hp).toBe(800);
    // The crit only doubles the figure the caller floats; it never adds a
    // separate CRITICAL line beside the pre-crit number.
    expect(critical).toBe(200);
    expect(component.floatingTexts).toHaveSize(0);

    random.and.returnValue(0.99);
    enemy.hp = 1000;
    component.floatingTexts = [];
    const plain = (component as any).dealMeleeDamage(enemy, 100);
    expect(enemy.hp).toBe(900);
    expect(plain).toBe(100);
    expect(component.floatingTexts).toHaveSize(0);
  });

  it("floats the damage a critical blow actually removed, not the pre-crit figure", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.skillLevels = { "Axe Mastery": 5 };
    component.equipment.weapon = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon", stats: { damageMin: 1, damageMax: 1 } } as any;
    component.equipment.shield = null;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).isPlayerMoving = false;
    (component as any).attackCooldown = 0;
    const enemy = { kind: "normal", species: "fallen", spriteFrame: 0, x: 262, y: 250, hp: 5000, maxHp: 5000, speed: 0, r: 14, dmg: 0 } as any;
    component.enemies = [enemy];
    component.floatingTexts = [];
    spyOn(Math, "random").and.returnValue(0);

    component.attackNearestEnemy(enemy);

    const removed = 5000 - enemy.hp;
    expect(removed).toBeGreaterThan(0);
    // One number, and it is the doubled crit: the hit costs 200 and reads 200.
    const numbers = component.floatingTexts.filter((text) => /^-\d+$/.test(text.text));
    expect(numbers).toHaveSize(1);
    expect(numbers[0].text).toBe(`-${Math.ceil(removed)}`);
    expect(component.floatingTexts.some((text) => text.text === "CRITICAL")).toBeFalse();
  });

  it("turns the remaining masteries into life, speed and resistances", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = { "Increased Stamina": 5, "Increased Speed": 5, "Natural Resistance": 5 };
    component.playerMaxHp = 1000;
    component.equipment.weapon = null;
    component.equipment.shield = null;

    // 90% stamina at rank 5 becomes 9% maximum Life.
    expect(component.increasedStaminaPercent).toBe(90);
    expect(component.effectivePlayerMaxHp).toBe(1090);
    // The speed table's rank-5 step.
    expect(component.increasedSpeedPercent).toBe(28);
    expect(component.increasedSpeedMultiplier).toBeCloseTo(1.28);
    // Natural Resistance rank 5 is 40% to all four elemental resistances, the
    // guidebook's own column (12/21/28/35/40 ... 62/64/64/65/66/67).
    expect(component.naturalResistancePercent).toBe(40);
    expect(component.equippedFireResistance).toBe(40);
    expect(component.equippedColdResistance).toBe(40);
    expect(component.equippedLightningResistance).toBe(40);
    expect(component.equippedPoisonResistance).toBe(40);

    component.skillLevels = { "Natural Resistance": 1 };
    expect(component.naturalResistancePercent).toBe(12);
    component.skillLevels = { "Natural Resistance": 15 };
    expect(component.naturalResistancePercent).toBe(62);
    component.skillLevels = { "Natural Resistance": 20 };
    expect(component.naturalResistancePercent).toBe(67);
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

  it("explains the Combat attributes in tooltips without the stat blocks blocking hovers", () => {
    component.inventoryOpen = true;
    component.playerLevel = 8;

    for (const stat of ["damage", "attackRating", "defense", "stamina"] as const) {
      component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, stat);
      const tooltip = component.hoveredStatTooltip!;
      expect(tooltip.title).withContext(stat).not.toBe("");
      expect(tooltip.description.length).withContext(stat).toBeGreaterThan(20);
      expect(tooltip.lines.length).withContext(stat).toBeGreaterThan(1);
      expect(tooltip.lines.some((line) => line.total)).withContext(stat).toBeTrue();
    }

    component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, "attackRating");
    expect(component.hoveredStatTooltip!.lines.find((line) => line.label === "Level & Dexterity")).toBeDefined();
    component.showStatTooltip({ clientX: 10, clientY: 10 } as MouseEvent, "stamina");
    expect(component.hoveredStatTooltip!.lines.find((line) => line.total)?.value).toBe(`${component.effectiveStamina}`);
  });

  it("opens the character sheet with C as well as I", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.inventoryOpen = false;

    component.onGlobalAttackKey(new KeyboardEvent("keydown", { key: "c" }));
    expect(component.inventoryOpen).toBeTrue();

    component.onGlobalAttackKey(new KeyboardEvent("keydown", { key: "c" }));
    expect(component.inventoryOpen).toBeFalse();

    component.onGlobalAttackKey(new KeyboardEvent("keydown", { key: "i" }));
    expect(component.inventoryOpen).toBeTrue();
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
    expect((component as any).hasRequiredWeaponForSkill("Frenzy")).toBeFalse();
    expect(component.getSkillRequirementLabel("Double Swing")).toBe("Requires a weapon in each hand");
    expect(component.getSkillRequirementLabel("Double Throw")).toBe("Requires a throwing weapon in each hand");
    expect(component.getSkillRequirementLabel("Frenzy")).toBe("Requires a weapon in each hand");

    component.equipment.weapon = { name: "Short Sword", baseName: "Short Sword", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Swing")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Double Throw")).toBeFalse();
    expect((component as any).hasRequiredWeaponForSkill("Frenzy")).toBeFalse();

    component.equipment.shield = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;
    expect((component as any).hasRequiredWeaponForSkill("Double Swing")).toBeTrue();
    expect((component as any).hasRequiredWeaponForSkill("Frenzy")).toBeTrue();
    expect(component.getSkillRequirementLabel("Double Swing")).toBe("");
    expect(component.getSkillRequirementLabel("Frenzy")).toBe("");
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
    expect((component as any).hasRequiredWeaponForSkill("Frenzy")).toBeFalse();
    expect(component.getSkillRequirementLabel("Double Throw")).toBe("Requires a throwing weapon in each hand");
    expect(component.getSkillRequirementLabel("Frenzy")).toBe("Requires a weapon in each hand");
  });

  it("swings twice for Double Swing, adding each hand's weapon damage", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Bash", "Double Swing"];
    component.skillLevels = { Bash: 1, "Double Swing": 1 };
    component.equipment.weapon = {
      name: "Short Sword", baseName: "Short Sword", slot: "weapon",
      stats: { damageMin: 4, damageMax: 8 },
    } as any;
    component.equipment.shield = {
      name: "Hand Axe", baseName: "Hand Axe", slot: "weapon",
      stats: { damageMin: 3, damageMax: 6 },
    } as any;
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 276, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0,
    } as any;
    component.enemies = [enemy];
    component.floatingTexts = [];

    component.activateOwnedSkill("Double Swing", enemy);

    // A rank-1 Double Swing adds its 15% and Bash's 10% to the 150 base before
    // Strength; the opening blow is 70% of that plus the main-hand sword.
    expect(enemy.hp).toBeCloseTo(1000 - (150 * 1.25 * 0.7 + 6), 5);
    expect((component as any).doubleSwingRemaining).toBe(1);
    expect((component as any).doubleSwingSide).toBe(1);
    expect((component as any).attackAnimationStyle).toBe("swordSlash");

    (component as any).updateDoubleSwingStrikes(400);

    // The second swing lands with the off-hand axe, so both weapons hit and the
    // cast out-damages a single-hand blow.
    expect(enemy.hp).toBeCloseTo(1000 - (150 * 1.25 * 0.7 + 6) - (150 * 1.25 * 0.7 + 4.5), 5);
    expect((component as any).doubleSwingRemaining).toBe(0);
    expect((component as any).attackAnimationSide).toBe(1);
    expect(component.floatingTexts).toHaveSize(2);
  });

  it("does not cast Double Swing with a weapon in only one hand", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Bash", "Double Swing"];
    component.skillLevels = { Bash: 1, "Double Swing": 1 };
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 276, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0,
    } as any;

    for (const weapon of [
      null,
      { name: "Short Sword", baseName: "Short Sword", slot: "weapon" },
    ]) {
      component.equipment.weapon = weapon as any;
      // A shield is not a second weapon, and neither is an empty off hand.
      component.equipment.shield = weapon
        ? { name: "Buckler", baseName: "Buckler", slot: "armor", equipmentType: "shield" } as any
        : null;
      component.enemies = [enemy];
      enemy.hp = 1000;
      component.floatingTexts = [];

      component.activateOwnedSkill("Double Swing", enemy);

      expect(enemy.hp).toBe(1000);
      expect((component as any).doubleSwingRemaining).toBe(0);
      expect(component.floatingTexts).toHaveSize(0);
    }
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

  it("places Fangskin at the Claw Viper Temple altar", () => {
    component.currentAct = 2;
    component.currentAreaIndex = 6;
    component.actTime = 95;
    component.miniBossSpawned = true;
    component.enemies = [];

    component.spawnEnemies(16);

    const fangskin = component.enemies.find((enemy) => enemy.customName === "Fangskin");
    expect(component.currentArea.name).toBe("Claw Viper Temple");
    expect(fangskin).toBeTruthy();
    expect(fangskin!.species).toBe("salamander");
    expect(fangskin!.miniBoss).toBeTrue();
    expect(fangskin!.lightningEnchanted).toBeTrue();
    // Extra Fast: the Salamander moves well past its ordinary pace.
    expect(fangskin!.speed).toBe(92);
    expect(component.getEnemyDisplayName(fangskin!)).toBe("Fangskin");
  });

  it("leaves Fangskin out of Act II's other areas", () => {
    component.currentAct = 2;
    component.currentAreaIndex = 5;
    component.actTime = 95;
    component.miniBossSpawned = true;
    component.enemies = [];

    component.spawnEnemies(16);

    expect(component.currentArea.name).toBe("Valley of Snakes");
    expect(component.enemies.some((enemy) => enemy.customName === "Fangskin")).toBeFalse();
  });

  it("sprays charged bolts from Fangskin whenever he is struck", () => {
    component.currentAct = 2;
    component.runTime = 10;
    component.enemies = [];
    component.attackProjectiles = [];
    const fangskin = (component as any).makeMiniBoss({
      name: "Fangskin", species: "salamander", time: 94, announcement: "", color: "#fff",
      health: 130, damage: 6, radius: 24, speed: 92, lightningEnchanted: true,
    });
    fangskin.x = 200;
    fangskin.y = 200;
    component.enemies.push(fangskin);

    (component as any).maybeReleaseLightningEnchanted(fangskin);
    expect(component.attackProjectiles.length).toBe(8);
    expect(component.attackProjectiles.every((bolt) => bolt.kind === "lightning" && bolt.targetPlayer)).toBeTrue();

    // A fast weapon cannot fire the volley again inside its cooldown.
    (component as any).maybeReleaseLightningEnchanted(fangskin);
    expect(component.attackProjectiles.length).toBe(8);
  });

  it("casts the right-hand spell at the bare ground the player clicked", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Ice Bolt"];
    component.skillLevels = { "Ice Bolt": 1 };
    component.secondaryAttackSpell = "Ice Bolt";
    component.playerMana = 100;
    component.playerX = 250;
    component.playerY = 250;
    // A monster elsewhere on the map must not steal the spell from the click.
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0, x: 150, y: 150,
      hp: 100, maxHp: 100, speed: 90, r: 14, dmg: 2,
    } as any];
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    canvas.className = "d2s-arena";
    Object.defineProperty(canvas, "clientWidth", { value: 500 });
    Object.defineProperty(canvas, "clientHeight", { value: 500 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 500 } as any);
    (component as any).arenaRef = { nativeElement: canvas };
    (component as any).projectArenaPoint(0, 0);
    const world = (component as any).arenaWorldPointAt(360, 260);
    expect(world).toBeTruthy();
    const event = {
      pointerType: "mouse", button: 2, clientX: 360, clientY: 260,
      target: canvas, pointerId: 1, shiftKey: false,
      preventDefault: () => undefined,
    } as any;

    component.onArenaPointerDown(event);

    expect(component.attackProjectiles.length).toBe(1);
    const missile = component.attackProjectiles[0];
    expect(missile.targetX).toBeCloseTo(world!.x, 1);
    expect(missile.targetY).toBeCloseTo(world!.y, 1);
    // The press is spent: the context menu that follows must not cast again.
    component.onArenaContextMenu(event as any);
    expect(component.attackProjectiles.length).toBe(1);
  });

  it("leaps a barbarian to bare ground on a right click", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    component.secondaryAttackSpell = "Leap";
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    canvas.className = "d2s-arena";
    Object.defineProperty(canvas, "clientWidth", { value: 500 });
    Object.defineProperty(canvas, "clientHeight", { value: 500 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 500 } as any);
    (component as any).arenaRef = { nativeElement: canvas };

    component.onArenaPointerDown({
      pointerType: "mouse", button: 2, clientX: 330, clientY: 300,
      target: canvas, pointerId: 1, shiftKey: false,
      preventDefault: () => undefined,
    } as any);

    expect((component as any).playerLeapRemaining).toBeGreaterThan(0);
    expect((component as any).playerLeapDistance).toBeGreaterThan(0);
  });

  it("casts the left-hand spell at bare ground on a shift click", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    component.basicAttackSpell = "Fire Bolt";
    component.playerMana = 100;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0, x: 150, y: 150,
      hp: 100, maxHp: 100, speed: 90, r: 14, dmg: 2,
    } as any];
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    canvas.className = "d2s-arena";
    Object.defineProperty(canvas, "clientWidth", { value: 500 });
    Object.defineProperty(canvas, "clientHeight", { value: 500 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 500 } as any);
    (component as any).arenaRef = { nativeElement: canvas };
    (component as any).projectArenaPoint(0, 0);
    const world = (component as any).arenaWorldPointAt(340, 280);
    expect(world).toBeTruthy();

    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, clientX: 340, clientY: 280,
      target: canvas, pointerId: 1, shiftKey: true,
      preventDefault: () => undefined,
    } as any);

    expect(component.attackProjectiles.length).toBe(1);
    const missile = component.attackProjectiles[0];
    expect(missile.targetX).toBeCloseTo(world!.x, 1);
    expect(missile.targetY).toBeCloseTo(world!.y, 1);
  });

  it("lifts the darkness over a warcry ring instead of glowing over monsters", () => {
    const stops: string[] = [];
    const gradient = { addColorStop: (_offset: number, color: string) => stops.push(color) };
    const created: unknown[] = [];
    const fill = jasmine.createSpy("fill");
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      globalCompositeOperation: "source-over",
      createRadialGradient: () => { created.push(gradient); return gradient; },
      beginPath: () => undefined,
      arc: () => undefined,
      fill,
      fillStyle: null,
    } as any;
    (component as any).warcryAuraEffects.length = 0;
    (component as any).warcryAuraEffects.push({ skill: "War Cry", x: 250, y: 250, time: 0.2 });

    (component as any).liftDarknessForWarcryRings(ctx);

    // The hole is cut out of the darkness layer, not painted over the sprites.
    expect(ctx.globalCompositeOperation).toBe("destination-out");
    expect(created.length).toBe(1);
    expect(stops.length).toBe(4);
    expect(fill).toHaveBeenCalled();
  });

  it("leaves the darkness alone when no warcry ring is up", () => {
    const create = jasmine.createSpy("createRadialGradient");
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      globalCompositeOperation: "source-over",
      createRadialGradient: create,
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      fillStyle: null,
    } as any;
    (component as any).warcryAuraEffects.length = 0;

    (component as any).liftDarknessForWarcryRings(ctx);

    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the leap's animation lock through a click order", () => {
    component.activeTab = "run";
    component.runActive = true;
    (component as any).playerLeapRemaining = 0.4;
    (component as any).playerAttackLockRemaining = 0.4;
    (component as any).attackAnimationLockRemaining = 0.4;
    (component as any).clickMoveTarget = { x: 400, y: 400, hp: 10, r: 14, species: "fallen" } as any;

    (component as any).cancelAttackAnimation();

    expect((component as any).playerAttackLockRemaining).toBeCloseTo(0.4, 5);
    expect((component as any).attackAnimationLockRemaining).toBeCloseTo(0.4, 5);
  });

  it("ignores movement input while the barbarian is airborne", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).isPlayerMoving = false;
    (component as any).playerLeapRemaining = 0.4;
    (component as any).playerLeapDuration = 0.6;
    (component as any).keysDown.add("w");

    component.movePlayer(16);

    expect((component as any).isPlayerMoving).toBeFalse();
    expect((component as any).playerMoveX).toBe(0);
    expect((component as any).playerMoveY).toBe(0);
    (component as any).keysDown.clear();
  });

  it("holds every cast and swing until the leap lands", () => {
    component.activeTab = "run";
    component.runActive = true;
    (component as any).playerLeapRemaining = 0.4;
    const spell = spyOn(component as any, "tryBasicAttackSpell");

    expect((component as any).tryAttackSlotSpell("secondary")).toBeFalse();
    component.attackNearestEnemy();

    expect(spell).not.toHaveBeenCalled();
  });

  it("leaps the whole distance to a clicked monster, past its rank range", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    component.playerX = 100;
    component.playerY = 100;
    const far = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 900, y: 100,
      hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [far];

    (component as any).startLeap(undefined, far);

    const rankRange = (component as any).leapRangeForRank(1);
    expect(rankRange).toBeLessThan(700);
    // A named monster is a deliberate leap order: the barbarian crosses the
    // whole distance instead of the rank's reach.
    expect((component as any).playerLeapDistance).toBeCloseTo(900 - 100 - (14 + 16), 5);
  });

  it("walks a held right-click order into melee range instead of casting at floor", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    component.basicAttackSpell = null;
    component.secondaryAttackSpell = null;
    const far = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 600, y: 100,
      hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [far];
    (component as any).heldAttackTarget = { enemy: far, hand: "secondary" };

    (component as any).updateBasicAttack();

    expect((component as any).clickMoveTarget).toBe(far);
    expect(component.attackProjectiles).toHaveSize(0);
  });

  it("casts the held right hand's spell at the monster it named", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    component.secondaryAttackSpell = "Ice Bolt";
    const near = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 220, y: 100,
      hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [near];
    (component as any).heldAttackTarget = { enemy: near, hand: "secondary" };
    spyOn(component as any, "heldAttackReach").and.returnValue(Number.POSITIVE_INFINITY);
    const cast = spyOn(component as any, "tryAttackSlotSpell").and.returnValue(true);

    (component as any).updateBasicAttack();

    expect(cast).toHaveBeenCalledWith("secondary", near);
  });

  it("suppresses every other automatic cast while an attack order is held", () => {
    component.activeTab = "run";
    component.runActive = true;
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 120, y: 100, hp: 10, maxHp: 10, r: 14, dmg: 1 } as any;
    component.enemies = [near];
    (component as any).heldAttackTarget = { enemy: near, hand: "basic" };
    const cast = spyOn(component as any, "activateOwnedSkill");

    (component as any).updateAutomaticSkillCasts(16);

    expect(cast).not.toHaveBeenCalled();
  });

  it("keeps a clicked monster named after the mouse button comes up", () => {
    const near = { kind: "normal", species: "fallen", x: 120, y: 100, hp: 10, r: 14 } as any;
    (component as any).heldAttackTarget = { enemy: near, hand: "basic" };
    (component as any).heldMouseButton = 0;

    component.onArenaPointerEnd({ pointerType: "mouse", buttons: 0, pointerId: 9 } as any);

    // Diablo II: one click chases and attacks that monster until it dies. The
    // release ends the button hold, not the name-lock.
    expect((component as any).heldAttackTarget).toEqual({ enemy: near, hand: "basic" });
    expect((component as any).heldMouseButton).toBeNull();
  });

  it("keeps swinging through a pack while the left button is held", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    const dead = { kind: "normal", species: "fallen", spriteFrame: 0, x: 120, y: 100, hp: 0, maxHp: 10, r: 14, dmg: 1 } as any;
    const next = { kind: "normal", species: "fallen", spriteFrame: 0, x: 130, y: 100, hp: 40, maxHp: 40, r: 14, dmg: 1 } as any;
    component.enemies = [dead, next];
    (component as any).heldAttackTarget = { enemy: dead, hand: "basic" };
    (component as any).heldMouseButton = 0;
    const swing = spyOn(component as any, "performBasicAttack").and.returnValue(true);

    (component as any).updateHeldAttackCommand();

    expect((component as any).heldAttackTarget.enemy).toBe(next);
    expect(swing).toHaveBeenCalledWith(next);
  });

  it("swings at a monster in reach when the button is held with nothing named", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 125, y: 100, hp: 40, maxHp: 40, r: 14, dmg: 1 } as any;
    component.enemies = [near];
    (component as any).heldAttackTarget = null;
    (component as any).heldMouseButton = 0;
    const swing = spyOn(component as any, "performBasicAttack").and.returnValue(true);

    expect((component as any).updateHeldAttackCommand()).toBeTrue();
    expect(swing).toHaveBeenCalledWith(near);
  });

  it("stops the held hand when nothing is left in reach", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 100;
    const dying = { kind: "normal", species: "fallen", spriteFrame: 0, x: 900, y: 900, hp: 0, maxHp: 40, r: 14, dmg: 1 } as any;
    component.enemies = [dying];
    (component as any).heldAttackTarget = { enemy: dying, hand: "basic" };
    (component as any).heldMouseButton = 0;
    const swing = spyOn(component as any, "performBasicAttack").and.returnValue(true);

    (component as any).updateHeldAttackCommand();

    // The click's monster died and the pack is clear: the hero stops instead of
    // walking onto the corpse's ground.
    expect((component as any).heldAttackTarget).toBeNull();
    expect((component as any).clickMoveTarget).toBeNull();
    expect(swing).not.toHaveBeenCalled();
  });

  it("leaps to a clicked floor spot beyond a monster", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Leap"];
    component.skillLevels = { Leap: 1 };
    const blocker = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [blocker];
    (component as any).clickMoveTarget = blocker;

    component.activateOwnedSkill("Leap", undefined, { x: 350, y: 250 });

    // The monster in the way is flown over; the clicked spot is the landing.
    expect((component as any).playerLeapDistance).toBeCloseTo(100, 5);
    for (let frame = 0; frame < 80; frame += 1) (component as any).updatePlayerLeap(16);
    // The camera holds the hero still and scrolls the world, so the 100-unit
    // leap shows as the monster sliding back 100 units under him.
    expect(blocker.x).toBeCloseTo(200, 5);
  });

  it("stops a leap at a wall instead of crossing it", () => {
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerLeapDirectionX = 1;
    (component as any).playerLeapDirectionY = 0;
    const blocked = new Uint8Array(500 * 500);
    for (let y = 0; y < 500; y += 1) {
      for (let x = 290; x <= 310; x += 1) blocked[y * 500 + x] = 1;
    }
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "campaignCollisionContext").and.returnValue({
      mask: { width: 500, height: 500, blocked },
      geometry: { scale: 1, width: 500, height: 500, left: 0, top: 0 },
      wraps: false,
      clearance: 8,
      blocksSight: true,
      edgeBlocks: true,
    } as any);

    const travelled = (component as any).leapClearTravel(112) as number;

    // The ground past the wall is open, but the arc is not: Leap is not Teleport.
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(40);
  });

  it("leaps over a river to the far bank but never lands in the water", () => {
    component.playerX = 150;
    component.playerY = 250;
    (component as any).playerLeapDirectionX = 1;
    (component as any).playerLeapDirectionY = 0;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "campaignCollisionContext").and.returnValue({
      mask: { width: 500, height: 500, blocked: new Uint8Array(500 * 500) },
      geometry: { scale: 1, width: 500, height: 500, left: 0, top: 0 },
      wraps: false,
      clearance: 8,
      blocksSight: true,
      edgeBlocks: true,
      waterPolygons: [[[0.4, 0], [0.48, 0], [0.48, 1], [0.4, 1]]],
    } as any);

    // The far bank is a landing even though the arc crosses the river.
    expect((component as any).leapClearTravel(112)).toBeGreaterThan(90);
    // A spot in the river is not a landing: the leap stops on the near bank.
    expect((component as any).leapClearTravel(70)).toBeLessThan(50);
  });

  it("treats a painted water layer as low ground: walk stops, leap clears", () => {
    const width = 100;
    const height = 100;
    const blocked = new Uint8Array(width * height);
    const water = new Uint8Array(width * height);
    // A river down the middle, painted into the wall footprint like the Act III one.
    for (let y = 0; y < height; y += 1) {
      for (let x = 44; x <= 52; x += 1) {
        blocked[y * width + x] = 1;
        water[y * width + x] = 1;
      }
    }
    // A stone wall further along, with no water layer.
    for (let y = 70; y < 90; y += 1) {
      for (let x = 70; x < 90; x += 1) blocked[y * width + x] = 1;
    }
    const context = {
      mask: { width, height, blocked, water },
      geometry: { scale: 1, width, height, left: 0, top: 0 },
      wraps: false,
      clearance: 4,
      blocksSight: true,
    } as any;

    // On foot the river is impassable...
    expect((component as any).campaignBlockedAt(context, 48, 20)).toBeTrue();
    // ...but a leap reads the same pixel as low water.
    expect((component as any).campaignBlockedAt(context, 48, 20, true)).toBeFalse();
    // A wall stays a wall to both, water layer or not.
    expect((component as any).campaignBlockedAt(context, 80, 80)).toBeTrue();
    expect((component as any).campaignBlockedAt(context, 80, 80, true)).toBeTrue();
    // The bank is only blocked where the mask covers it.
    expect((component as any).campaignBlockedAt(context, 60, 20)).toBeFalse();
  });

  it("leaps the painted Act III river to the far bank but never lands in it", () => {
    component.playerX = 20;
    component.playerY = 50;
    (component as any).playerLeapDirectionX = 1;
    (component as any).playerLeapDirectionY = 0;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const width = 100;
    const height = 100;
    const blocked = new Uint8Array(width * height);
    const water = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 44; x <= 52; x += 1) {
        blocked[y * width + x] = 1;
        water[y * width + x] = 1;
      }
    }
    spyOn(component as any, "campaignCollisionContext").and.returnValue({
      mask: { width, height, blocked, water },
      geometry: { scale: 1, width, height, left: 0, top: 0 },
      wraps: false,
      clearance: 4,
      blocksSight: true,
    } as any);

    // The far bank is a landing even though the arc crosses the river...
    expect((component as any).leapClearTravel(112)).toBeGreaterThan(80);
    // ...and a leap that would come down in the river stops on the near bank.
    expect((component as any).leapClearTravel(32)).toBeLessThan(24);
  });

  it("samples Holy Freeze once per simulation step, not once per enemy", () => {
    component.selectedClass = "paladin";
    component.skillLevels = { "Holy Freeze": 1 };
    (component as any).activePaladinAuras["Holy Freeze"] = { remaining: 10, tick: 0 };
    component.playerX = 250;
    component.playerY = 250;
    const radius = spyOn(component as any, "paladinAuraRadius").and.callThrough();
    const crowd = Array.from({ length: 40 }, (_, index) => ({
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 260 + index, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2,
    }) as any);

    // The first enemy of the pass takes the snapshot; the other 39 read it.
    for (const enemy of crowd) (component as any).enemyMoveSpeed(enemy);
    expect(radius).toHaveBeenCalledTimes(1);

    // The slow itself is unchanged, and it still only reaches the aura's radius.
    expect((component as any).enemyMoveSpeed(crowd[0])).toBeCloseTo(70, 5);
    const farAway = { ...crowd[0], x: 4000 } as any;
    expect((component as any).enemyMoveSpeed(farAway)).toBeCloseTo(100, 5);

    // A new simulation step samples the aura again, still once for the crowd.
    (component as any).simulationStep += 1;
    for (const enemy of crowd) (component as any).enemyMoveSpeed(enemy);
    expect(radius).toHaveBeenCalledTimes(2);
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
    // The guidebook starts Zeal at two swings, not one.
    for (let beat = 0; beat < 4; beat += 1) (component as any).updateZealStrikes(160);
    expect(component.floatingTexts.length).toBe(2);
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
    // Rank 4 is five swings: one more remains after the first blow on the new target.
    expect((component as any).zealStrikeRemaining).toBe(1);
    (component as any).updateZealStrikes(160);
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
    // The swing itself costs Smite's 5 mana, and the leech is paid back on top.
    expect(component.playerMana).toBeCloseTo(100 - 5 + damage * 0.05, 5);
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
    // Ranged spells never leech, but the 25-mana cast still leaves the orb.
    expect(component.playerMana).toBe(100 - 25);
  });

  it("cuts only a cursed monster's melee blows, never its spells", () => {
    component.runActive = true;
    component.selectedClass = "necromancer";
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    component.playerMaxHp = 1000;
    const swing = (curse?: "Weaken" | "Decrepify") => {
      const enemy = {
        kind: "normal", species: "fallen", spriteFrame: 0,
        x: 262, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 30, cd: 0,
        curseName: curse, curseRemaining: curse ? 10 : undefined,
      } as any;
      component.enemies = [enemy];
      component.playerHp = 1000;
      component.updateEnemies(16);
      return 1000 - component.playerHp;
    };

    const plainLoss = swing();
    expect(plainLoss).toBeGreaterThan(0);
    expect(swing("Weaken")).toBeCloseTo(plainLoss * 0.67, 4);
    expect(swing("Decrepify")).toBeCloseTo(plainLoss * 0.5, 4);

    // The melee rule never touches a spell: a cursed caster's bolt keeps its
    // full damage.
    const caster = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 520, y: 250,
      hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 30, cd: 0,
      curseName: "Weaken", curseRemaining: 10,
    } as any;
    component.enemies = [caster];
    component.attackProjectiles = [];
    (component as any).castMephistoChargedBolt(caster, 250, 250, undefined);
    const bolt = component.attackProjectiles.find((projectile: any) => projectile.targetPlayer)!;
    expect(bolt.damage).toBeCloseTo(caster.dmg * 0.42, 5);
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
    (component as any).corpses = [{ x: 270, y: 250, maxHp: 500, life: 10, seed: 0.25 }];

    component.updateEnemies(16);

    const damage = 1000 - component.playerHp;
    expect(damage).toBeGreaterThanOrEqual(50);
    expect(damage).toBeLessThanOrEqual(100);
    expect((component as any).corpses).toHaveSize(0);
    expect(component.floatingTexts.some((entry) => entry.text === "CORPSE EXPLOSION")).toBeTrue();
  });

  it("leaves a corpse for every monster that falls", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    const fallen = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 300, y: 250, hp: 0, maxHp: 60, speed: 0, r: 14, dmg: 2, cd: 1,
      facingX: 1, facingY: 0, championTint: undefined,
    } as any;
    component.enemies = [fallen];
    (component as any).corpses = [];

    component.updateEnemies(16);

    expect(component.enemies).toHaveSize(0);
    const corpses = (component as any).corpses as any[];
    expect(corpses).toHaveSize(1);
    expect(corpses[0].species).toBe("fallen");
    expect(corpses[0].maxHp).toBe(60);
    expect(corpses[0].facingX).toBe(1);
    // No Nihlathak and no Death Sentry: the body is still there to be blown up.
    (component as any).updateCorpses(1);
    expect((component as any).corpses).toHaveSize(1);
  });

  it("reads each corpse from the death block appended to its sheet", () => {
    // The goatman atlas is eight walk rows, eight attack rows, eight idle rows and
    // the death block this session appended below them.
    expect(enemySpriteDirectionRow("goatman", "death", 32, 7)).toBe(31);
    expect(enemySpriteDirectionRow("goatman", "move", 32, 7)).toBe(7);
    expect(enemySpriteDirectionRow("goatman", "attack", 32, 7)).toBe(15);
    // Fallen is a one-row strip: the walk row stays 0 and the death block is 1-8.
    expect(enemySpriteDirectionRow("fallen", "move", 9, 0)).toBe(0);
    expect(enemySpriteDirectionRow("fallen", "death", 9, 0)).toBe(1);
    // The appended block does not change the facing maths of the living blocks.
    expect(enemySpriteRow("goatman", 1, 0)).toBe(7);
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

  it("adds fire, cold and lightning on top of the Vengeance blow", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Vengeance"];
    component.skillLevels = { Vengeance: 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.floatingTexts = [];

    // The physical blow still lands, and each element adds 70% of it at rank 1.
    target.hp = 1000;
    component.activateOwnedSkill("Vengeance");
    const fullDamage = 1000 - target.hp;
    expect(fullDamage).toBeGreaterThan(0);

    target.hp = 1000;
    target.immunities = ["fire"];
    component.floatingTexts = [];
    component.activateOwnedSkill("Vengeance");
    const fireImmune = 1000 - target.hp;
    expect(fireImmune).toBeGreaterThan(0);
    expect(fireImmune).toBeLessThan(fullDamage);

    // Immunity to all three elements cannot stop the physical part.
    target.hp = 1000;
    target.immunities = ["fire", "cold", "lightning"];
    component.floatingTexts = [];
    component.activateOwnedSkill("Vengeance");
    expect(1000 - target.hp).toBeGreaterThan(0);
    expect((component as any).getSkillRankStats("Vengeance", "strike", 1))
      .toContain("+70% fire, cold and lightning damage added to the blow");
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

  it("stops the hero walking through a monster's body", () => {
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    // Screen-right is world (+x, -y), so this body sits directly on the step.
    const blocker = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 266, y: 234, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2, cd: 1,
    } as any;
    component.enemies = [blocker];
    (component as any).rebuildEnemyGrid();
    component.keysDown.add("d");

    component.movePlayer(100);

    // 22 px away is inside the 30 px body, so neither axis may move.
    expect(blocker.x).toBe(266);
    expect((component as any).playerMoveX).toBe(0);
    expect((component as any).playerMoveY).toBe(0);

    blocker.x = 400;
    blocker.y = 250;
    (component as any).rebuildEnemyGrid();
    component.movePlayer(100);

    expect((component as any).playerMoveX).toBeGreaterThan(0);
    component.keysDown.delete("d");
  });

  it("pushes stacked monsters apart instead of letting them share a spot", () => {
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    const first = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 380, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2, cd: 1,
    } as any;
    const second = { ...first, x: 384 };
    component.enemies = [first, second];

    for (let frame = 0; frame < 30; frame += 1) (component as any).separateEnemyBodies();

    // Two 14 px bodies end up a gap apart instead of drawing as one monster.
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(29.5);
    expect(first.x).toBeLessThan(second.x);
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

  it("never swings into his own Bone Wall but strikes a hostile one in the way", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    (component as any).attackCooldown = 0;
    const monster = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 288, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    const wall = {
      x: 262, y: 250, startX: 262, startY: 250, targetX: 262, targetY: 250,
      speed: 0, damage: 0, life: Number.POSITIVE_INFINITY, age: 0, radius: 10,
      color: "#d9d0b5", kind: "bone", boneWall: true,
      wallNormalX: 1, wallNormalY: 0, wallHalfLength: 100, wallHealth: 1000, wallMaxHealth: 1000,
      wallOwner: "player",
    } as any;
    component.enemies = [monster];
    component.attackProjectiles = [wall];
    component.floatingTexts = [];
    (component as any).meleeTrailEffects.length = 0;
    (component as any).rebuildEnemyGrid();

    (component as any).updateBasicAttack();

    // His own barricade is not a target: no swing, no damage to either side.
    expect(wall.wallHealth).toBe(1000);
    expect(monster.hp).toBe(100);
    expect((component as any).meleeTrailEffects).toHaveSize(0);

    // A hostile wall standing in his way is the thing his swing lands on.
    wall.wallOwner = "enemy";
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();

    expect(wall.wallHealth).toBeLessThan(1000);
    expect(monster.hp).toBe(100);
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

  it("flies out for Leap Attack and lands the combat table's blow with a knockback", () => {
    component.selectedClass = "barbarian";
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.ownedSkills = ["Leap Attack"];
    component.skillLevels = { Leap: 1, "Leap Attack": 1 };
    component.playerMaxHp = 1000;
    component.playerHp = 500;
    spyOn<any>(component as any, "rollMasteryCritical").and.returnValue(false);
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 330, y: 250, hp: 5000, maxHp: 5000, speed: 100, r: 14, dmg: 2, cd: 0 } as any;
    component.enemies = [target];

    // Rank one carries the +200% table, so the landing hits around three times
    // as hard as the same swing without the skill's multiplier.
    const landingDamage = (component as any).skillCastDamage("Leap Attack");
    expect(landingDamage).toBeGreaterThan(component.basicAttackDamage * 1.5 * 2.5);

    component.activateOwnedSkill("Leap Attack", target);
    expect((component as any).playerLeapRemaining).toBeGreaterThan(0);
    expect(component.skillCastCooldowns["Leap Attack"] ?? 0).withContext("no recharge on the leap").toBe(0);
    expect(target.hp).withContext("the blow waits for the landing").toBe(5000);

    let xBeforeLanding = target.x;
    while ((component as any).playerLeapRemaining > 0) {
      xBeforeLanding = target.x;
      (component as any).updatePlayerLeap(16);
    }

    expect(target.hp).toBeCloseTo(5000 - landingDamage);
    expect(target.x).withContext("the landing shoves the monster away").toBeGreaterThan(xBeforeLanding + 40);
    expect(target.stunRemaining ?? 0).withContext("Leap Attack knocks back instead of dazing").toBe(0);
    expect(component.floatingTexts.some((entry) => entry.text === (component as any).floatingDamageText(landingDamage))).toBeTrue();
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

  it("gives every barbarian warcry its own ring and a recorded shout", () => {
    component.selectedClass = "barbarian";
    component.playerX = 300;
    component.playerY = 200;
    const warcries = Object.keys(BARBARIAN_WARCRY_AURA_ART);
    const voice = spyOn<any>(component as any, "playWarcryVoice");

    for (const skill of warcries) {
      component.ownedSkills = [skill];
      component.skillLevels = { [skill]: 1 };
      (component as any).warcryAuraEffects.length = 0;

      component.activateOwnedSkill(skill);

      expect((component as any).warcryAuraEffects)
        .withContext(`${skill} should raise its ring on the hero`)
        .toEqual([jasmine.objectContaining({ skill, x: 300, y: 200, time: 0 })]);
      expect(voice).toHaveBeenCalledWith(skill);
      expect(WARCRY_VOICE_LINES[skill]?.length ?? 0)
        .withContext(`${skill} should have a recorded shout`)
        .toBeGreaterThan(0);
      expect(BARBARIAN_WARCRY_AURA_ART[skill].columns)
        .withContext(`${skill} should have an animation`)
        .toBeGreaterThan(0);
    }
  });

  it("plays a barbarian shout clip of its own for every warcry", () => {
    component.selectedClass = "barbarian";
    component.playerX = 300;
    component.playerY = 200;
    component.skillLevels = {
      Howl: 1, Taunt: 1, Shout: 1, "Battle Cry": 1, "Battle Orders": 1, "Battle Command": 1, "War Cry": 1, "Grim Ward": 1,
    };
    // An axe in hand must not turn a shout into a chop: the warcry clips are
    // explicit skill animations, never a weapon-family swing.
    component.equipment.weapon = { name: "Hand Axe", baseName: "Hand Axe", slot: "weapon" } as any;
    const clips: Record<string, "warcryShout" | "warcryWarCry" | "warcryGrimWard"> = {
      Howl: "warcryShout",
      Taunt: "warcryShout",
      Shout: "warcryShout",
      "Battle Cry": "warcryShout",
      "Battle Orders": "warcryShout",
      "Battle Command": "warcryShout",
      "War Cry": "warcryWarCry",
      "Grim Ward": "warcryGrimWard",
    };

    for (const [skill, clip] of Object.entries(clips)) {
      component.ownedSkills = [skill];
      (component as any).shoutRemaining = 0;
      (component as any).battleOrdersRemaining = 0;
      (component as any).battleCommandRemaining = 0;
      (component as any).grimWards.length = 0;
      (component as any).warcryCorpses.length = 0;
      (component as any).warcryCorpses.push({ x: 300, y: 200, time: 0 });

      component.activateOwnedSkill(skill);

      expect((component as any).attackAnimationStyle).withContext(skill).toBe(clip);
      expect((component as any).playerAttackLockRemaining)
        .withContext(`${skill} should hold its shout for the clip`)
        .toBeCloseTo(ATTACK_CLIP_INFO[clip].duration / component.playerAttackSpeedMultiplier);
    }

    // The three gestures are separate clips with their own timing.
    expect(ATTACK_CLIP_INFO.warcryShout.duration).not.toBe(ATTACK_CLIP_INFO.warcryWarCry.duration);
    expect(ATTACK_CLIP_INFO.warcryGrimWard.duration).not.toBe(ATTACK_CLIP_INFO.warcryWarCry.duration);
    expect(ATTACK_CLIP_INFO.warcryShout.trail ?? null).toBeNull();
    expect(ATTACK_CLIP_INFO.warcryWarCry.trail ?? null).toBeNull();
    expect(ATTACK_CLIP_INFO.warcryGrimWard.trail ?? null).toBeNull();
  });

  it("brings Life and Mana down with Battle Orders when the shout lapses", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = { "Battle Orders": 1 };
    component.ownedSkills = ["Battle Orders"];
    (component as any).shoutRemaining = 0;
    (component as any).battleCommandRemaining = 0;
    component.playerMaxHp = 400;
    component.playerMaxMana = 200;

    component.activateOwnedSkill("Battle Orders");
    const boostedLife = component.effectivePlayerMaxHp;
    const boostedMana = component.effectivePlayerMaxMana;
    const remaining = (component as any).battleOrdersRemaining;
    expect(boostedLife).withContext("the shout raises the cap").toBeGreaterThan(400);
    expect(boostedMana).toBeGreaterThan(200);
    expect(remaining).toBeGreaterThan(0);

    // The orbs are full under the shout, which used to leave 564 / 400 behind.
    component.playerHp = boostedLife;
    component.playerMana = boostedMana;

    (component as any).updateWarcryBuffs(remaining + 1);

    expect((component as any).battleOrdersRemaining).toBe(0);
    expect(component.effectivePlayerMaxHp).toBe(400);
    expect(component.playerHp).toBe(400);
    expect(component.playerMana).toBe(200);
  });

  it("keeps the hero's share of a partly filled pool when Battle Orders lapses", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = { "Battle Orders": 1 };
    component.ownedSkills = ["Battle Orders"];
    (component as any).shoutRemaining = 0;
    (component as any).battleCommandRemaining = 0;
    component.playerMaxHp = 400;
    component.playerMaxMana = 200;

    component.activateOwnedSkill("Battle Orders");
    const boostedLife = component.effectivePlayerMaxHp;
    const boostedMana = component.effectivePlayerMaxMana;
    const remaining = (component as any).battleOrdersRemaining;
    component.playerHp = Math.round(boostedLife * 0.5);
    component.playerMana = boostedMana * 0.25;

    (component as any).updateWarcryBuffs(remaining + 1);

    // Half a pool stays half a pool: the expiry scales the pool with the cap
    // instead of dumping the hero to full or leaving him over it.
    expect(component.playerHp).toBeLessThan(component.effectivePlayerMaxHp);
    expect(component.playerHp / component.effectivePlayerMaxHp).toBeCloseTo(0.5, 2);
    expect(component.playerMana / component.effectivePlayerMaxMana).toBeCloseTo(0.25, 2);
  });

  it("keeps Shout's Defense bonus and its synergy duration from the D2 table", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Shout"];
    component.skillLevels = { Shout: 1, "Battle Orders": 4, "Battle Command": 2 };
    (component as any).shoutRemaining = 0;
    component.activateOwnedSkill("Shout");

    // 30s base + 5s per rank of Battle Orders (4) and Battle Command (2).
    expect((component as any).shoutRemaining).toBeCloseTo(60);
    expect((component as any).shoutDefensePercentForRank(1)).toBe(100);
    expect((component as any).shoutDefensePercentForRank(5)).toBe(140);
    // 100% Defense avoids 18% of the hits that land.
    expect(component.shoutAvoidChance).toBeCloseTo(0.18);
    expect(component.activeWarcryBuffs.map((buff) => buff.name)).toEqual(["Shout"]);
  });

  it("keeps the Battle Orders orbs at the same percentage when the maximum rises", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Battle Orders"];
    component.skillLevels = { "Battle Orders": 1 };
    component.playerMaxHp = 400;
    component.playerMaxMana = 100;
    component.playerHp = 200;
    component.playerMana = 50;
    (component as any).battleOrdersRemaining = 0;

    component.activateOwnedSkill("Battle Orders");

    expect(component.effectivePlayerMaxHp).toBe(540);
    expect(component.playerHp).toBeCloseTo(270);
    expect(component.effectivePlayerMaxMana).toBe(135);
    // The shout costs its 12 mana before the orbs grow, so 38/100 stays 38%.
    expect(component.playerMana).toBeCloseTo(38 / 100 * 135, 5);
  });

  it("gives every owned skill +1 while Battle Command runs and restores them after", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Battle Command", "Shout", "Howl"];
    component.skillLevels = { "Battle Command": 1, Shout: 2, Howl: 3 };
    (component as any).battleCommandRemaining = 0;

    component.activateOwnedSkill("Battle Command");
    expect(component.skillLevels["Shout"]).toBe(3);
    expect(component.skillLevels["Howl"]).toBe(4);

    // Recasting while it runs adds its own rank to the duration synergy.
    const firstCast = (component as any).battleCommandRemaining;
    (component as any).battleCommandRemaining = 1;
    component.activateOwnedSkill("Battle Command");
    expect((component as any).battleCommandRemaining).toBeGreaterThan(firstCast);

    (component as any).updateWarcryBuffs(999);
    expect(component.skillLevels["Shout"]).toBe(2);
    expect(component.skillLevels["Howl"]).toBe(3);
  });

  it("makes War Cry damage and stun the pack around the barbarian", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["War Cry"];
    component.skillLevels = { "War Cry": 1, Howl: 2, Taunt: 1, "Battle Cry": 1 };
    component.playerX = 250;
    component.playerY = 250;
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 400, maxHp: 400, speed: 100, r: 14, dmg: 2 } as any;
    const far = { ...near, x: 700, hp: 400, maxHp: 400 };
    component.enemies = [near, far];

    component.activateOwnedSkill("War Cry");

    // 20-30 base damage plus 6% a rank from Howl, Taunt and Battle Cry.
    const expected = (25 + 4 * 0.06) * (1 + 4 * 0.06);
    expect((component as any).pendingDamage.get(near)?.damage ?? 0).toBeGreaterThan(expected * 0.9);
    expect(near.stunRemaining).toBeCloseTo(1);
    expect(far.stunRemaining).toBeUndefined();
    expect(far.hp).toBe(400);
  });

  it("plants Grim Ward only on a corpse, then slows and exposes what stands in it", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Grim Ward"];
    component.skillLevels = { "Grim Ward": 1 };
    component.playerX = 250;
    component.playerY = 250;
    (component as any).warcryCorpses.length = 0;
    (component as any).grimWards.length = 0;

    component.activateOwnedSkill("Grim Ward");
    expect((component as any).grimWards.length).toBe(0);

    (component as any).recordWarcryCorpse({ x: 300, y: 250 });
    component.activateOwnedSkill("Grim Ward");
    const ward = (component as any).grimWards[0];
    expect(ward).toEqual(jasmine.objectContaining({ x: 300, y: 250 }));
    expect(ward.remaining).toBeCloseTo(40);
    expect((component as any).warcryCorpses.length).toBe(0);

    const inside = { kind: "normal", species: "fallen", spriteFrame: 0, x: 320, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    component.enemies = [inside];
    (component as any).updateGrimWards(0.1);
    expect(inside.wardSlowPercent).toBeCloseTo(11);
    expect(inside.wardVulnerableRemaining).toBeGreaterThan(0);
    expect((component as any).enemyWardSlowPercent(inside)).toBeCloseTo(11);
    expect((component as any).enemyResistanceMultiplier(inside, "physical")).toBeCloseTo(1.2);

    (component as any).updateGrimWards(41);
    expect((component as any).grimWards.length).toBe(0);
  });

  it("reads the combat skill tables for damage, stun and synergies", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = {
      "Double Swing": 5, Bash: 2, "Double Throw": 3, Stun: 3, "War Cry": 4,
      "Leap Attack": 2, Leap: 3, Concentrate: 2, "Battle Orders": 1,
      Frenzy: 2, Taunt: 1, Howl: 2, Whirlwind: 1, Berserk: 2,
    };

    // Double Swing: +15% +5%/rank, plus Bash's +10%/rank.
    expect((component as any).barbarianCombatDamageMultiplier("Double Swing", 5)).toBeCloseTo(1.55);
    // Double Throw: +16% +8%/rank, plus Double Swing's +8%/rank (five ranks).
    expect((component as any).barbarianCombatDamageMultiplier("Double Throw", 3)).toBeCloseTo(1.72);
    // Stun: +15% +5%/rank, plus Bash's +8%/rank.
    expect((component as any).barbarianCombatDamageMultiplier("Stun", 3)).toBeCloseTo(1.41);
    // Leap Attack: +200% +30%/rank, plus Leap's +10%/rank.
    expect((component as any).barbarianCombatDamageMultiplier("Leap Attack", 2)).toBeCloseTo(3.6);
    // Concentrate: +70% +5%/rank, Bash +5%, Battle Orders +10%.
    expect((component as any).barbarianCombatDamageMultiplier("Concentrate", 2)).toBeCloseTo(1.95);
    // Frenzy: +90% +5%/rank, Double Swing +8% a rank (none here), Taunt +8%.
    expect((component as any).barbarianCombatDamageMultiplier("Frenzy", 2)).toBeCloseTo(2.43);
    // Whirlwind starts at -50% and gains 8% a rank.
    expect((component as any).barbarianCombatDamageMultiplier("Whirlwind", 1)).toBeCloseTo(0.5);
    expect((component as any).barbarianCombatDamageMultiplier("Whirlwind", 8)).toBeCloseTo(1.06);
    // Berserk: +150% +15%/rank, Howl and Battle Orders +10% a rank each.
    expect((component as any).barbarianCombatDamageMultiplier("Berserk", 2)).toBeCloseTo(2.95);

    // 1.2s at rank 1, +0.2s a rank, +5% a rank of War Cry.
    expect((component as any).stunSecondsForRank(3)).toBeCloseTo(1.92);
  });

  it("builds Frenzy charges that quicken the barbarian and then fall away", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = { Frenzy: 5, "Increased Stamina": 2 };
    component.ownedSkills = ["Frenzy"];
    (component as any).frenzyStacks = 0;
    (component as any).frenzyRemaining = 0;

    expect((component as any).frenzyMaxStacks).toBe(3);
    expect((component as any).frenzyDurationSeconds).toBeCloseTo(6.8);

    const baseAttackSpeed = component.playerAttackSpeedMultiplier;
    for (let hit = 0; hit < 5; hit += 1) (component as any).addFrenzyCharge();
    expect((component as any).frenzyStacks).toBe(3);
    expect(component.playerAttackSpeedMultiplier).toBeCloseTo(baseAttackSpeed + 0.21);
    expect((component as any).frenzyMoveMultiplier).toBeCloseTo(1.3);

    (component as any).updateBarbarianCombatState(7);
    expect((component as any).frenzyStacks).toBe(0);
    expect(component.playerAttackSpeedMultiplier).toBeCloseTo(baseAttackSpeed);
  });

  it("hangs the Berserk sigil above the head for as long as the Defense is gone", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    const canvas = {
      width: 900, height: 900,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 900 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    (component as any).projectionWidth = 900;
    (component as any).projectionCenterX = 450;
    (component as any).projectionCenterY = 450;
    (component as any).projectionDpr = 1;
    (component as any).worldZoom = 2.1;
    (component as any).berserkRemaining = 0;

    expect((component as any).berserkStateIconPlacement()).toBeNull();

    (component as any).berserkRemaining = 3;
    const placement = (component as any).berserkStateIconPlacement() as { x: number; y: number; size: number };
    const ground = (component as any).projectArenaPoint(250, 250);
    const heroHeight = (component as any).playerScreenHeight();

    expect(placement).not.toBeNull();
    // The swirl, not its mostly empty cell, is what hangs over the head: its
    // centroid sits on the hero's centreline and its halo's lower edge clears
    // the crown by the fixed gap.
    const swirlCenterX = placement.x + placement.size * BERSERK_SIGIL_SWIRL_CENTRE_X;
    const swirlCenterY = placement.y + placement.size * BERSERK_SIGIL_SWIRL_CENTRE_Y;
    const haloBottomY = swirlCenterY + placement.size * BERSERK_SIGIL_SWIRL_RADIUS;
    expect(swirlCenterX).toBeCloseTo(ground.x, 5);
    expect(haloBottomY).toBeCloseTo(ground.y - heroHeight - BERSERK_SIGIL_HEAD_CLEARANCE, 5);
    expect(swirlCenterY).toBeLessThan(ground.y - heroHeight);
    expect(placement.size).toBeGreaterThan(heroHeight);

    // The sigil belongs to the exposed window, so it goes when the rage ends.
    (component as any).berserkRemaining = 0;
    expect((component as any).berserkStateIconPlacement()).toBeNull();
  });

  it("raises Defense with Concentrate and lets Berserk throw it away", () => {
    component.selectedClass = "barbarian";
    component.skillLevels = { Concentrate: 3, Shout: 3, Berserk: 1 };
    (component as any).shoutRemaining = 0;
    (component as any).concentrateDefenseRemaining = 0;
    (component as any).berserkRemaining = 0;

    (component as any).concentrateDefenseRemaining = 3;
    expect(component.concentrateDefensePercent).toBe(120);
    // 120% Defense avoids 21.6% of hits, under the 45% cap.
    expect(component.combatDefenseAvoidChance).toBeCloseTo(0.216);

    component.playerHp = component.effectivePlayerMaxHp;
    (component as any).applyIncomingDamage(100);
    const guardedLoss = component.effectivePlayerMaxHp - component.playerHp;

    (component as any).berserkRemaining = 2.7;
    component.playerHp = component.effectivePlayerMaxHp;
    (component as any).applyIncomingDamage(100);
    const exposedLoss = component.effectivePlayerMaxHp - component.playerHp;
    // Berserk's exposure adds 30% damage taken on top of the lost Dodge.
    expect(exposedLoss).toBeCloseTo(guardedLoss * 1.3, 5);
  });

  it("spins Whirlwind through every monster in reach without full-rank damage", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Whirlwind"];
    component.skillLevels = { Whirlwind: 1 };
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.playerMaxMana = 500;
    component.runActive = true;
    component.equipment.weapon = {
      name: "Short Sword", baseName: "Short Sword", slot: "weapon",
      stats: { damageMin: 4, damageMax: 8 },
    } as any;
    (component as any).whirlwindOverlayRemaining = 0;
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 900, maxHp: 900, speed: 100, r: 14, dmg: 2 } as any;
    const behind = { ...near, x: 250, y: 320, hp: 900, maxHp: 900 };
    const far = { ...near, x: 700, hp: 900, maxHp: 900 };
    component.enemies = [near, behind, far];

    component.activateOwnedSkill("Whirlwind");

    // The rank-one table cuts at half a normal blow, but it hits both sides.
    expect((component as any).pendingDamage.get(near)?.damage ?? 0).toBeGreaterThan(0);
    expect((component as any).pendingDamage.get(behind)?.damage ?? 0).toBeGreaterThan(0);
    expect((component as any).pendingDamage.get(far)).toBeUndefined();
    expect((component as any).whirlwindOverlayRemaining).toBeGreaterThan(0);
  });

  it("whirls to the clicked floor and keeps spinning while the button is held", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Whirlwind"];
    component.skillLevels = { Whirlwind: 1 };
    component.secondaryAttackSpell = "Whirlwind";
    component.playerX = 250;
    component.playerY = 250;
    component.playerMaxMana = 60;
    component.playerMana = 60;
    component.runActive = true;
    component.enemies = [];
    component.equipment.weapon = {
      name: "Short Sword", baseName: "Short Sword", slot: "weapon",
      stats: { damageMin: 4, damageMax: 8 },
    } as any;
    (component as any).currentChunkLocalX = 0;
    (component as any).whirlwindOverlayRemaining = 0;
    (component as any).whirlwindHoldCooldown = 0;

    // A right click on bare floor is an order to that spot, not just a swing.
    component.activateOwnedSkill("Whirlwind", undefined, { x: 400, y: 250 });
    expect((component as any).whirlwindDashTarget).toEqual({ x: 400, y: 250 });
    const afterCast = component.playerMana;
    expect(afterCast).toBeLessThan(60);

    // Holding the button keeps the spin going, and the spin carries him there.
    (component as any).heldWhirlwindGround = { x: 400, y: 250 };
    (component as any).whirlwindHoldCooldown = 0;
    (component as any).updateWhirlwindSpin(16);
    expect(component.playerMana).toBeLessThan(afterCast);
    expect((component as any).currentChunkLocalX).toBeGreaterThan(0);

    // The orb is what ends the order: the button is still down.
    for (let frame = 0; frame < 400; frame += 1) (component as any).updateWhirlwindSpin(16);
    expect(component.playerMana).toBeLessThan(12);
    expect((component as any).heldWhirlwindGround).toBeNull();
  });

  it("ends a held whirlwind on a monster when the orb runs dry", () => {
    component.selectedClass = "barbarian";
    component.ownedSkills = ["Whirlwind"];
    component.skillLevels = { Whirlwind: 1 };
    component.secondaryAttackSpell = "Whirlwind";
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 24;
    component.playerMaxMana = 24;
    component.runActive = true;
    component.equipment.weapon = {
      name: "Short Sword", baseName: "Short Sword", slot: "weapon",
      stats: { damageMin: 4, damageMax: 8 },
    } as any;
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 700, y: 250,
      hp: 900, maxHp: 900, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [enemy];

    // A monster across the room is whirled into, not walked at.
    (component as any).heldAttackTarget = { enemy, hand: "secondary" };
    (component as any).whirlwindHoldCooldown = 0;
    (component as any).updateHeldAttackCommand();
    expect((component as any).whirlwindDashTarget).toEqual({ x: 700, y: 250 });
    expect(component.playerMana).toBe(12);

    component.playerMana = 0;
    (component as any).whirlwindHoldCooldown = 0;
    (component as any).heldAttackTarget = { enemy, hand: "secondary" };
    (component as any).updateHeldAttackCommand();
    expect((component as any).heldAttackTarget).toBeNull();
  });

  it("remembers the main-menu sound toggle for the next tab", () => {
    try {
      window.localStorage.removeItem("d2survivors.menu-sound.v1");
      (component as any).menuSoundPreferred = true;
      (component as any).ambientAudioEnabled = true;
      component.toggleAmbientAudio();
      expect(window.localStorage.getItem("d2survivors.menu-sound.v1")).toBe("off");

      // A fresh tab starts from the stored value instead of the default.
      (component as any).menuSoundPreferred = true;
      (component as any).loadMenuSoundPreference();
      expect((component as any).menuSoundPreferred).toBeFalse();

      (component as any).ambientAudioEnabled = false;
      (component as any).toggleAmbientAudio();
      expect(window.localStorage.getItem("d2survivors.menu-sound.v1")).toBe("on");
      expect((component as any).menuSoundPreferred).toBeTrue();
    } finally {
      window.localStorage.removeItem("d2survivors.menu-sound.v1");
    }
  });

  it("plays a warcry shout only while game audio is enabled", () => {
    const play = jasmine.createSpy("play").and.returnValue(Promise.resolve());
    const realAudio = (window as any).Audio;
    (window as any).Audio = function AudioMock() { return { play, pause: () => undefined, src: "", volume: 1 }; };
    try {
      (component as any).menuSoundPreferred = true;
      (component as any).playWarcryVoice("Shout");
      expect(play).toHaveBeenCalled();
      const calls = play.calls.count();
      (component as any).menuSoundPreferred = false;
      (component as any).playWarcryVoice("Shout");
      expect(play.calls.count()).toBe(calls);
    } finally {
      (window as any).Audio = realAudio;
    }
  });

  it("ships a recorded sound for every castable skill of every class", () => {
    for (const classId of ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"]) {
      const sounds = SKILL_SOUNDS[classId];
      expect(sounds).withContext(`${classId} should ship spell sounds`).toBeDefined();
      const castable = getClassSkills(classId).filter((definition) => !isPassiveSkill(definition.name));
      expect(castable.length).withContext(`${classId} castable skills`).toBeGreaterThan(10);
      const silent = castable
        .filter((definition) => !(sounds[definition.name]?.length) && !hasWarcryVoice(definition.name))
        .map((definition) => definition.name);
      expect(silent).withContext(`${classId} skills without a sound`).toEqual([]);
      for (const takes of Object.values(sounds)) {
        for (const path of takes) {
          expect(path).withContext(`${classId} sound path`).toMatch(/^assets\/d2survivors\/audio\/skills\//);
        }
      }
    }
  });

  it("plays the class's own spell sound on a cast and stays silent for passives", () => {
    const realAudio = (window as any).Audio;
    const play = jasmine.createSpy("play").and.returnValue(Promise.resolve());
    const created: any[] = [];
    (window as any).Audio = function AudioStub(this: any) {
      const element = { pause: jasmine.createSpy("pause"), play, volume: 1, src: "" };
      created.push(element);
      return element;
    } as any;
    try {
      (component as any).menuSoundPreferred = true;
      component.selectedClass = "sorceress";
      (component as any).playSkillSound("Fire Bolt");
      expect(play).toHaveBeenCalled();
      expect(created[0].src).toContain("assets/d2survivors/audio/skills/sorceress/");
      expect(created[0].src).toContain("firebolt");

      const casts = play.calls.count();
      (component as any).playSkillSound("Warmth");
      expect(play.calls.count()).withContext("passives are silent").toBe(casts);

      component.selectedClass = "barbarian";
      (component as any).playSkillSound("War Cry");
      expect(play.calls.count()).withContext("warcries keep their recorded shout").toBe(casts);

      (component as any).menuSoundPreferred = false;
      component.selectedClass = "sorceress";
      (component as any).playSkillSound("Fire Bolt");
      expect(play.calls.count()).withContext("muted audio plays nothing").toBe(casts);
    } finally {
      (window as any).Audio = realAudio;
    }
  });

  it("sounds each cast through the class spell-sound player", () => {
    const sound = spyOn<any>(component as any, "playSkillSound");
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    (component as any).playerMana = 500;
    (component as any).playerMaxMana = 500;
    component.equipment.weapon = null;
    component.equipment.shield = null;
    component.enemies = [{ x: 300, y: 250, r: 14, hp: 1000 } as any];

    component.activateOwnedSkill("Fire Bolt");

    expect(sound).toHaveBeenCalledWith("Fire Bolt");
  });

  it("ships a recorded landing sound for the spells that blast or strike", () => {
    const blasts: Array<[string, readonly string[]]> = [
      ["Fire Ball", SKILL_IMPACT_SOUNDS["sorceress"]?.["Fire Ball"] ?? []],
      ["Frozen Orb", SKILL_IMPACT_SOUNDS["sorceress"]?.["Frozen Orb"] ?? []],
      ["Blessed Hammer", SKILL_IMPACT_SOUNDS["paladin"]?.["Blessed Hammer"] ?? []],
    ];
    for (const [name, takes] of blasts) {
      expect(takes.length).withContext(`${name} landing takes`).toBeGreaterThan(0);
      for (const path of takes) {
        expect(path).withContext(`${name} landing path`).toMatch(/^assets\/d2survivors\/audio\/impacts\//);
        expect(path.endsWith(".ogg")).withContext(`${name} landing take is encoded`).toBeTrue();
      }
    }
    // A cast-only spell such as Teleport has no do/target/hit sound of its own.
    expect(SKILL_IMPACT_SOUNDS["sorceress"]?.["Teleport"]).toBeUndefined();
  });

  it("plays a spell's landing sound once where its missile hits", () => {
    const realAudio = (window as any).Audio;
    const play = jasmine.createSpy("play").and.returnValue(Promise.resolve());
    const created: any[] = [];
    (window as any).Audio = function AudioStub(this: any) {
      const element = { pause: jasmine.createSpy("pause"), play, volume: 1, src: "" };
      created.push(element);
      return element;
    } as any;
    try {
      (component as any).menuSoundPreferred = true;
      component.selectedClass = "sorceress";
      const fireBall = { skill: "Fire Ball" } as any;
      (component as any).playProjectileImpactSound(fireBall);
      (component as any).playProjectileImpactSound(fireBall);
      expect(play.calls.count()).withContext("one blast is heard once").toBe(1);
      expect(created[0].src).toContain("assets/d2survivors/audio/impacts/");

      (component as any).playProjectileImpactSound({ skill: "Frozen Orb" } as any);
      expect(play.calls.count()).withContext("the next blast is heard").toBe(2);

      (component as any).playProjectileImpactSound({ skill: "Teleport" } as any);
      expect(play.calls.count()).withContext("no landing take, no sound").toBe(2);
    } finally {
      (window as any).Audio = realAudio;
    }
  });


  it("ships Diablo II's own coin sound for gold changing hands", () => {
    expect(ITEM_GOLD_SOUNDS.length).toBeGreaterThan(0);
    for (const path of ITEM_GOLD_SOUNDS) {
      expect(path).toMatch(/^assets\/d2survivors\/audio\/ui\/item-gold\.ogg$/);
    }
  });

  it("rattles the coins when an item is sold", () => {
    const realAudio = (window as any).Audio;
    const play = jasmine.createSpy("play").and.returnValue(Promise.resolve());
    const created: any[] = [];
    (window as any).Audio = function AudioStub(this: any) {
      const element = { pause: jasmine.createSpy("pause"), play, volume: 1, src: "" };
      created.push(element);
      return element;
    } as any;
    try {
      const sword = {
        id: "sold-sword", name: "Sabre", baseName: "Sabre", rarity: "normal",
        slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
        stats: { damageMin: 3, damageMax: 7 }, desc: "An old sabre.", affixes: [],
      } as any;
      component.activeTab = "run";
      component.runActive = true;
      component.inventoryOpen = true;
      (component as any).menuSoundPreferred = true;
      component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
      component.equipment = {
        weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
        ringRight: null, gloves: null, body: null, boots: null, belt: null,
      } as any;
      spyOn(component as any, "persistRunProgress");

      component.inventory[0] = sword;
      (component as any).rebuildInventoryGrid();
      component.sellInventoryItem(0);

      expect(play).toHaveBeenCalled();
      expect(created[0].src).toContain("assets/d2survivors/audio/ui/item-gold.ogg");

      // Muted audio sells silently, exactly like casts and impacts.
      component.inventory[0] = { ...sword, id: "sold-sword-2" };
      (component as any).menuSoundPreferred = false;
      component.sellInventoryItem(0);
      expect(play.calls.count()).withContext("muted audio is silent").toBe(1);
    } finally {
      (window as any).Audio = realAudio;
    }
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

  it("stands still with its idle clip when scenery blocks every step toward the hero", () => {
    component.playerX = 250;
    component.playerY = 250;
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 340, y: 250,
      hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2, cd: 0,
    } as any;
    component.enemies = [enemy];
    spyOn(component as any, "campaignCollisionContext").and.returnValue({
      clearance: 8,
      blocksSight: false,
      geometry: { left: 0, top: 0, scale: 1 },
      mask: { width: 500, height: 500, data: new Uint8Array(500 * 500) },
    } as any);
    // Every heading is blocked, so the wall slide walks the monster nowhere.
    const blocked = spyOn(component as any, "campaignStepBlocked").and.returnValue(true);

    component.updateEnemies(100);

    expect(enemy.x).toBe(340);
    expect(enemy.y).toBe(250);
    expect(enemy.animationState).toBe("idle");

    // The same monster walks again once a heading opens up.
    blocked.and.returnValue(false);
    component.updateEnemies(100);

    expect(enemy.x).toBeLessThan(340);
    expect(enemy.animationState).toBe("move");
  });

  it("keeps a ghostly champion walking through a 60 fps frame", () => {
    // A ghostly champion moves at half speed, which is under half a world pixel
    // in a 16 ms frame. The step check used to call that a blocked step, so its
    // walk clip was cut back to the idle frame several times a second.
    component.currentAct = 1;
    component.playerX = 250;
    component.playerY = 250;
    const ghostly = (component as any).makeEnemy("champion", false, "fallen", "ghostly");
    ghostly.x = 340;
    ghostly.y = 250;
    ghostly.hp = 100;
    ghostly.attackAnimationTime = 0;
    component.enemies = [ghostly];
    spyOn(component as any, "campaignCollisionContext").and.returnValue({
      clearance: 8,
      blocksSight: false,
      geometry: { left: 0, top: 0, scale: 1 },
      mask: { width: 500, height: 500, data: new Uint8Array(500 * 500) },
    } as any);
    spyOn(component as any, "campaignStepBlocked").and.returnValue(false);

    for (let frame = 0; frame < 12; frame += 1) component.updateEnemies(16);

    expect(ghostly.x).toBeLessThan(340);
    expect(ghostly.animationState).toBe("move");
  });

  it("has a fetish shaman breathe Inferno on a hero who closes to melee range", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 500;
    (component as any).playerLeapRemaining = 0;
    const shaman = {
      kind: "normal", species: "fetishShaman", spriteFrame: 0, x: 300, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 18, dmg: 10, cd: 0,
    } as any;
    component.enemies = [shaman];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects.length = 0;

    component.updateEnemies(16);

    const breath = (component as any).skillVisualEffects.find((effect: any) => effect.inferno && effect.playerConeDamage);
    expect(breath).toBeDefined();
    expect(breath!.coneRange).toBe(96);
    expect(breath!.sourceEnemy).toBe(shaman);
    // In the hero's face the shaman breathes instead of throwing a fireball.
    expect(component.attackProjectiles.length).toBe(0);
    expect(shaman.animationState).toBe("attack");
    expect(shaman.cd).toBeGreaterThan(0);

    const hpBefore = component.playerHp;
    (component as any).updateSkillVisualEffects(220);
    expect(component.playerHp).toBeLessThan(hpBefore);

    // Stepping out of the cone stops the burn even while the breath lasts.
    const hpOutside = component.playerHp;
    component.playerY = 250 + 400;
    (component as any).updateSkillVisualEffects(220);
    expect(component.playerHp).toBe(hpOutside);

    // Out past the flame's trigger the shaman is back to its fireball.
    component.playerY = 150;
    (component as any).skillVisualEffects.length = 0;
    shaman.cd = 0;
    shaman.attackAnimationTime = 0;
    component.updateEnemies(16);
    expect(component.attackProjectiles.some((projectile) => projectile.source === shaman)).toBeTrue();
  });

  it("draws belt potions with the imported D2 potion cels", () => {
    // The red Healing Potion and the purple Rejuvenation Potion cels the pack
    // uses, straight from the extract's invrps/invvps art.
    expect(component.beltPotionArt("health")).toBe("assets/d2survivors/items/d2/invrps.png");
    expect(component.beltPotionArt("rejuvenation")).toBe("assets/d2survivors/items/d2/invvps.png");
    // The blue Mana Potion is D2's invbps cel.
    expect(component.beltPotionArt("mana")).toBe("assets/d2survivors/items/d2/invbps.png");
  });

  it("pours a blue mana potion's class pool back over 5.12 seconds", () => {
    spyOn(component as any, "persistRunProgress");
    // No crit: the roll sits above every Energy's chance here.
    spyOn(Math, "random").and.returnValue(0.999);
    component.selectedClass = "sorceress";
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as any }));
    component.beltSlots[0] = { kind: "mana" };
    component.playerMaxMana = 400;
    component.playerMana = 0;

    component.drinkBeltPotion(0);
    expect(component.beltSlots[0].kind).toBeNull();
    expect(component.playerMana).toBe(0);

    // Half the potion's time is worth half of the Sorceress's 160 Mana.
    (component as any).tickManaPotionRestore(2560);
    expect(component.playerMana).toBeCloseTo(80, 5);

    (component as any).tickManaPotionRestore(2560);
    expect(component.playerMana).toBeCloseTo(160, 5);
    expect((component as any).potionManaRemaining).toBeCloseTo(0, 5);

    // A full orb leaves the next bottle in the belt instead of pouring it away.
    component.beltSlots[1] = { kind: "mana" };
    component.playerMana = component.effectivePlayerMaxMana;
    component.drinkBeltPotion(1);
    expect(component.beltSlots[1].kind).toBe("mana");

    // And a potion already running is dropped once the orb fills itself.
    component.playerMana = component.effectivePlayerMaxMana - 200;
    component.beltSlots[1] = { kind: "mana" };
    component.drinkBeltPotion(1);
    expect(component.beltSlots[1].kind).toBeNull();
    component.playerMana = component.effectivePlayerMaxMana;
    (component as any).tickManaPotionRestore(1000);
    expect(component.playerMana).toBe(component.effectivePlayerMaxMana);
    expect((component as any).potionManaRemaining).toBe(0);
  });

  it("doubles a mana potion on an Energy critical and prices the odds by Energy", () => {
    spyOn(component as any, "persistRunProgress");
    spyOn(Math, "random").and.returnValue(0);
    component.selectedClass = "barbarian";
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as any }));
    component.beltSlots[0] = { kind: "mana" };
    component.playerMaxMana = 1000;
    component.playerMana = 0;

    component.drinkBeltPotion(0);
    (component as any).tickManaPotionRestore(5120);

    // The Barbarian's 80 Mana, doubled by the critical.
    expect(component.playerMana).toBeCloseTo(160, 5);

    // Guidebook odds: even under 201 is (Energy - 2) / 4, odd is (Energy - 1)^2 /
    // (Energy * 4), and above 200 it is 100 * (Energy - 101) / Energy.
    component.spentAttributes = [0, 0, 0, 0];
    component.equipment = {
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    } as any;
    // A Barbarian starts at 10 Energy; six placed points bring it to 16, even.
    component.spentAttributes = [0, 0, 0, 6];
    expect(component.manaPotionCritChancePercent).toBeCloseTo(3.5, 5);
    component.spentAttributes = [0, 0, 0, 7];
    expect(component.manaPotionCritChancePercent).toBeCloseTo(256 / 68, 5);
    component.spentAttributes = [0, 0, 0, 200];
    expect(component.manaPotionCritChancePercent).toBeCloseTo(100 * 109 / 210, 5);
  });

  it("multiplies hard Energy, +Mana and levels, then adds soft Energy and +Mana per level", () => {
    component.selectedClass = "sorceress";
    component.playerLevel = 3;
    component.playerMaxHp = 400;
    component.playerMaxMana = 100;
    component.spentAttributes = [0, 0, 0, 10];
    component.equipment = {
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    } as any;
    component.equipment.amulet = {
      id: "mana-amulet", name: "Amulet of the Magus", slot: "charm", equipmentType: "amulet",
      stats: { plusMana: 50, plusEnergy: 10, manaPerLevel: 5, manaPercent: 100 },
    } as any;

    // The Sorceress's table is 2 Mana a level and 2 Mana an Energy.
    expect(component.levelManaBonus).toBe(4);
    expect(component.attributePointManaBonus).toBe(20);
    expect(component.equippedEnergyManaBonus).toBe(20);
    expect(component.equippedManaPerLevelBonus).toBe(15);
    // Increase Maximum Mana covers 100 base + 50 +Mana + 100% of the base + the
    // 20 from placed Energy. Gear Energy and +Mana per level join afterwards.
    expect(component.effectivePlayerMaxMana).toBe(274 + 20 + 15);
  });

  it("drops and picks up blue mana potions like the other belt potions", () => {
    spyOn(component as any, "persistRunProgress");
    component.potionDrops = [];
    (component as any).addPotionDrop(100, 100, "mana", 0);
    expect(component.potionDrops[0].kind).toBe("mana");
    expect(component.potionDrops[0].life).toBe(25);

    // Walking over it puts the blue vial in the belt with a blue cue.
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as any }));
    component.playerX = 100;
    component.playerY = 100;
    component.floatingTexts = [];
    // Half a second covers the vial's drop-in fall before it can be grabbed.
    (component as any).updatePotionDrops(500);
    expect(component.beltSlots[0].kind).toBe("mana");
    expect(component.floatingTexts.some((text) => text.text === "MANA POTION")).toBeTrue();
  });

  it("swaps a barbarian's two worn weapons by dragging one hand onto the other", () => {
    const mainHand = {
      id: "main-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
      stats: { damageMin: 2, damageMax: 5 }, desc: "A short sword.", affixes: [],
    } as any;
    const offHand = { ...mainHand, id: "off-sword", name: "Sabre", baseName: "Sabre" };
    component.selectedClass = "barbarian";
    component.playerLevel = 10;
    component.equipment.weapon = mainHand;
    component.equipment.shield = offHand;
    spyOn(component as any, "persistRunProgress");
    const event = { preventDefault: () => undefined } as any;

    component.startEquipmentDrag("weapon", event);
    component.onEquipmentDrop("shield", event);

    // Both hands trade in place: nothing passes through the pack.
    expect(component.equipment.shield?.id).toBe("main-sword");
    expect(component.equipment.weapon?.id).toBe("off-sword");
    expect(component.inventoryStatus).toContain("swapped");
  });

  it("swaps the two ring slots by dragging one ring onto the other", () => {
    const leftRing = {
      id: "left-ring", name: "Ring", baseName: "Ring", rarity: "magic",
      slot: "ring", equipmentType: "ring", requiredLevel: 1, affixes: [], desc: "A ring.",
    } as any;
    const rightRing = { ...leftRing, id: "right-ring", name: "Ring of Might" };
    component.selectedClass = "paladin";
    component.playerLevel = 10;
    component.equipment.ringLeft = leftRing;
    component.equipment.ringRight = rightRing;
    spyOn(component as any, "persistRunProgress");
    const event = { preventDefault: () => undefined } as any;

    component.startEquipmentDrag("ringLeft", event);
    component.onEquipmentDrop("ringRight", event);

    expect(component.equipment.ringLeft?.id).toBe("right-ring");
    expect(component.equipment.ringRight?.id).toBe("left-ring");
  });

  it("refuses an equipment drag when the target slot cannot wear the item", () => {
    const sword = {
      id: "paladin-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
      stats: { damageMin: 2, damageMax: 5 }, desc: "A short sword.", affixes: [],
    } as any;
    const shield = {
      id: "targe", name: "Targe", baseName: "Targe", rarity: "normal",
      slot: "armor", equipmentType: "paladinShield", requiredLevel: 1,
      stats: { armor: 8 }, desc: "A paladin shield.", affixes: [],
    } as any;
    component.selectedClass = "paladin";
    component.playerLevel = 10;
    component.equipment.weapon = sword;
    component.equipment.shield = shield;
    spyOn(component as any, "persistRunProgress");
    const event = { preventDefault: () => undefined } as any;

    component.startEquipmentDrag("weapon", event);
    component.onEquipmentDrop("shield", event);

    expect(component.equipment.weapon?.id).toBe("paladin-sword");
    expect(component.equipment.shield?.id).toBe("targe");
    expect(component.inventoryStatus).toContain("cannot go in the");
  });

  it("moves a worn weapon into an empty off hand without using the pack", () => {
    const sword = {
      id: "spare-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
      stats: { damageMin: 2, damageMax: 5 }, desc: "A short sword.", affixes: [],
    } as any;
    component.selectedClass = "barbarian";
    component.playerLevel = 10;
    component.equipment.weapon = sword;
    component.equipment.shield = null;
    component.inventory = Array.from({ length: 40 }, () => null);
    spyOn(component as any, "persistRunProgress");
    const event = { preventDefault: () => undefined } as any;

    component.startEquipmentDrag("weapon", event);
    component.onEquipmentDrop("shield", event);

    expect(component.equipment.weapon).toBeNull();
    expect((component.equipment.shield as any)?.id).toBe("spare-sword");
    // The pack stayed empty: the weapon never left the paperdoll.
    expect(component.inventory.filter(Boolean).length).toBe(0);
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
    expect((component as any).getSkillRankStats("Telekinesis", "strike", 1))
      .toContain("Stun 1.2s, pickup reach +40%");
    expect((component as any).getSkillRankStats("Telekinesis", "strike", 1))
      .toContain("1-2 lightning damage at range");
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
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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

  it("flies Frozen Orb through the pack, spraying ice bolts and bursting into a rosette", () => {
    const componentAny = component as any;
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.activeTab = "run";
    component.playerX = 250;
    component.playerY = 250;
    component.arenaW = 500;
    component.arenaH = 500;
    component.enemies = [];
    component.attackProjectiles = [];
    componentAny.playerFacingX = 1;
    componentAny.playerFacingY = 0;

    componentAny.castPlayerFrozenOrb({ x: 450, y: 250 }, 100);
    const orb = component.attackProjectiles[0] as any;
    expect(orb.missileId).toBe("d2-iceorb");
    expect(orb.frozenOrb).toBeTrue();

    // The orb sheds ice bolts while it flies.
    componentAny.updateAttackProjectiles(100);
    expect(component.attackProjectiles.filter((projectile: any) => projectile.missileId === "d2-icebolt").length)
      .toBeGreaterThan(0);

    // It only breaks at the end of its range, into a full rosette of bolts.
    let guard = 0;
    while (component.attackProjectiles.some((projectile: any) => projectile.frozenOrb) && guard < 400) {
      componentAny.updateAttackProjectiles(50);
      guard += 1;
    }
    expect(component.attackProjectiles.some((projectile: any) => projectile.frozenOrb)).toBeFalse();
    expect(component.attackProjectiles.filter((projectile: any) => projectile.missileId === "d2-icebolt").length)
      .toBeGreaterThanOrEqual(18);
    expect(component.attackProjectiles.some((projectile: any) => projectile.missileId === "d2-iceorbexplode")).toBeTrue();
  });

  it("drops the cast still playing when the floor is clicked", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.skillPoints = 0;
    component.playerX = 250;
    component.playerY = 250;
    const arena = { width: 500, height: 500 } as any;
    (component as any).arenaRef = { nativeElement: arena };
    spyOn(component as any, "updateHoveredEnemy").and.callFake(() => { component.hoveredEnemy = null; });
    spyOn(component as any, "updateHoveredGroundPickup").and.callFake(() => { component.hoveredGroundPickup = null; });
    spyOn(component as any, "arenaWorldPointAt").and.returnValue({ x: 340, y: 250 });
    spyOn(component as any, "planClickGroundPath").and.returnValue([{ x: 340, y: 250 }]);
    // Mid-cast: the spell's stance lock would otherwise keep the hero planted
    // until the flourish ends, so the click would not start the walk.
    (component as any).attackAnimationLockRemaining = 0.4;
    (component as any).playerAttackLockRemaining = 0.4;

    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, target: arena, clientX: 350, clientY: 250,
      preventDefault: () => undefined,
    } as any);

    expect((component as any).clickGroundTarget).toEqual({ x: 340, y: 250 });
    expect((component as any).playerAttackLockRemaining).toBe(0);
    expect((component as any).attackAnimationLockRemaining).toBe(0);
  });

  it("keeps an enemy stun on the hero when a move order cancels the cast", () => {
    const componentAny = component as any;
    // Baal's tentacles raise the same stance lock as a cast, but above it: a
    // walk order may not shake that stun off.
    componentAny.attackAnimationLockRemaining = 0.2;
    componentAny.playerAttackLockRemaining = 0.32;

    componentAny.cancelAttackAnimation();

    expect(componentAny.playerAttackLockRemaining).toBeCloseTo(0.32);
    expect(componentAny.attackAnimationLockRemaining).toBe(0);
  });

  it("aims a portal click at the doorway instead of the painted frame", () => {
    const componentAny = component as any;
    component.activeTab = "run";
    component.runActive = true;
    component.skillPoints = 0;
    component.playerX = 250;
    component.playerY = 250;
    component.actPortalOpen = true;
    componentAny.actPortalX = 340;
    componentAny.actPortalY = 250;
    const arena = {
      width: 500, height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    componentAny.arenaRef = { nativeElement: arena };
    spyOn(componentAny, "updateHoveredEnemy").and.callFake(() => { component.hoveredEnemy = null; });
    spyOn(componentAny, "updateHoveredGroundPickup").and.callFake(() => { component.hoveredGroundPickup = null; });
    spyOn(componentAny, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    // A fresh array per call: the move command empties the one it is handed.
    spyOn(componentAny, "planClickGroundPath").and.callFake(() => [{ x: 340, y: 250 }]);

    // The press lands on the portal's upper frame, not on its ground point.
    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, target: arena, clientX: 340, clientY: 150,
      preventDefault: () => undefined,
    } as any);

    expect(componentAny.clickGroundTarget).toEqual({ x: 340, y: 250 });

    // A press on bare floor beside the portal keeps its own spot.
    componentAny.clearClickMoveCommands();
    spyOn(componentAny, "arenaWorldPointAt").and.returnValue({ x: 200, y: 300 });
    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, target: arena, clientX: 200, clientY: 300,
      preventDefault: () => undefined,
    } as any);
    expect(componentAny.clickGroundTarget).toEqual({ x: 200, y: 300 });
  });

  it("walks to the blue area portal when its frame is clicked", () => {
    const componentAny = component as any;
    component.activeTab = "run";
    component.runActive = true;
    component.skillPoints = 0;
    component.playerX = 250;
    component.playerY = 250;
    component.zonePortalOpen = true;
    componentAny.zonePortalX = 300;
    componentAny.zonePortalY = 300;
    const arena = {
      width: 500, height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    componentAny.arenaRef = { nativeElement: arena };
    spyOn(componentAny, "updateHoveredEnemy").and.callFake(() => { component.hoveredEnemy = null; });
    spyOn(componentAny, "updateHoveredGroundPickup").and.callFake(() => { component.hoveredGroundPickup = null; });
    spyOn(componentAny, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(componentAny, "planClickGroundPath").and.callFake(() => [{ x: 300, y: 300 }]);

    component.onArenaPointerDown({
      pointerType: "mouse", button: 0, target: arena, clientX: 300, clientY: 200,
      preventDefault: () => undefined,
    } as any);

    expect(componentAny.clickGroundTarget).toEqual({ x: 300, y: 300 });
  });

  it("does not attack or cast while walking to a floor destination", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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
    expect((component as any).getSkillRankStats("Teleport", "passive", 20)).toContain("48% chance to slip away when hit");
    expect((component as any).getSkillRankStats("Teleport", "passive", 20)).toContain("Instantly rematerialises up to 320 units away");
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
    // Three bolts at rank one, exactly as the guidebook's column says.
    expect(bolts).toHaveSize(3);
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

  it("sells a pack item from a ctrl-click in Gheed's inventory panel", () => {
    component.selectedClass = "sorceress";
    component.sanctuaryGold = 0;
    component.playerGold = 0;
    (component as any).characterProfiles = {};
    component.hasSavedRun = false;
    component.runActive = false;
    component.activeTab = "menu";
    component.menuPanel = "shop";
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    const packItem = { id: "ctrl-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal", slot: "weapon", desc: "A blade." } as any;
    component.inventory[3] = packItem;
    const value = component.getItemSellValue(packItem);

    component.onInventoryItemClick(3, packItem, { ctrlKey: true, preventDefault: () => undefined } as unknown as MouseEvent);

    expect(component.inventory[3]).toBeNull();
    expect(component.sanctuaryGold).toBe(value);
    expect(component.shopMessage).toContain("sold to Gheed");
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
      expect(component.attackProjectiles.length).toBe(2 + rank);
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

    // A ready map is still not a teleport: the blue area portal opens and the
    // hero changes zone by walking through it.
    expect(component.zonePortalOpen).toBeTrue();
    expect(component.currentAreaIndex).toBe(0);
    expect(component.currentArea.name).toBe("Blood Moor");
    expect((component as any).zonePortalAreaIndex).toBe(3);
    expect((component as any).pendingCampaignAreaIndex).toBeNull();

    component.playerX = (component as any).zonePortalX;
    component.playerY = (component as any).zonePortalY;
    (component as any).crossZonePortal();

    expect(component.zonePortalOpen).toBeFalse();
    expect(component.currentAreaIndex).toBe(3);
    expect(component.currentArea.name).toBe("Dark Wood");
    expect([...(component as any).campaignWorlds.keys()]).toEqual([pending.slug]);
  });

  it("sweeps the ground loot when the hero steps through the blue area portal", () => {
    spyOn(component as any, "persistRunProgress");
    spyOn(component as any, "campaignWorldReady").and.returnValue(true);
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    component.actTime = 45;
    (component as any).updateCampaignArea();
    expect(component.zonePortalOpen).toBeTrue();

    component.itemDrops.push({ x: 100, y: 100, item: { id: "portal-loot", name: "Short Sword" } } as any);
    component.goldDrops.push({ x: 120, y: 100, amount: 25 } as any);
    component.potionDrops.push({ x: 140, y: 100, kind: "health" } as any);

    component.playerX = (component as any).zonePortalX;
    component.playerY = (component as any).zonePortalY;
    (component as any).crossZonePortal();

    expect(component.itemDrops.length).toBe(0);
    expect(component.goldDrops.length).toBe(0);
    expect(component.potionDrops.length).toBe(0);
  });

  it("sweeps the ground loot when the red act portal is taken", () => {
    spyOn(component as any, "persistRunProgress");
    spyOn(component as any, "switchCampaignWorld");
    component.actTransitionReady = true;
    component.actPortalOpen = true;
    component.currentAct = 1;
    component.itemDrops.push({ x: 90, y: 90, item: { id: "portal-loot", name: "Buckler" } } as any);
    component.goldDrops.push({ x: 90, y: 100, amount: 10 } as any);
    component.potionDrops.push({ x: 90, y: 110, kind: "mana" } as any);

    component.advanceAct();

    expect(component.currentAct).toBe(2);
    expect(component.itemDrops.length).toBe(0);
    expect(component.goldDrops.length).toBe(0);
    expect(component.potionDrops.length).toBe(0);
  });

  it("opens a blue area portal instead of porting the hero into the next zone", () => {
    spyOn(component as any, "persistRunProgress");
    spyOn(component as any, "campaignWorldReady").and.returnValue(true);
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    component.actTime = 45;
    const playerX = component.playerX;
    const playerY = component.playerY;

    (component as any).updateCampaignArea();

    expect(component.zonePortalOpen).toBeTrue();
    const leading = (component as any).zonePortalAreaIndex;
    expect(leading).toBeGreaterThan(0);
    expect(component.currentAreaIndex).toBe(0);
    expect(component.playerX).toBe(playerX);
    expect(component.playerY).toBe(playerY);
    // The door stands near the hero, not across the arena.
    expect(Math.hypot((component as any).zonePortalX - playerX, (component as any).zonePortalY - playerY))
      .toBeLessThan(160);

    // While it stands, even a clock far into the next zones cannot move the door's
    // destination: one crossing is one area.
    component.actTime = 200;
    (component as any).updateCampaignArea();
    expect((component as any).zonePortalAreaIndex).toBe(leading);
    expect(component.currentAreaIndex).toBe(0);
  });

  it("keeps the blue area portal standing on its patch as the hero walks", () => {
    spyOn(component as any, "persistRunProgress");
    spyOn(component as any, "campaignWorldReady").and.returnValue(true);
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    component.actTime = 45;

    (component as any).updateCampaignArea();
    expect(component.zonePortalOpen).toBeTrue();

    const portalX = (component as any).zonePortalX as number;
    const portalY = (component as any).zonePortalY as number;
    const playerX = component.playerX;
    const playerY = component.playerY;
    const chest = { x: portalX + 140, y: portalY + 90, open: false } as any;
    component.chests = [chest];

    // A step keeps the hero's anchor and scrolls the map under them, so every
    // ground anchor shifts with the world. The blue door used to be left out,
    // which pinned it to the screen and made it travel beside the hero.
    (component as any).translateWorldEntities(-12, -7);

    expect((component as any).zonePortalX).toBeCloseTo(portalX - 12, 5);
    expect((component as any).zonePortalY).toBeCloseTo(portalY - 7, 5);
    // It moves with the rest of the map's ground anchors, so it keeps its patch.
    expect(chest.x).toBeCloseTo(portalX + 140 - 12, 5);
    expect(chest.y).toBeCloseTo(portalY + 90 - 7, 5);
    expect(component.playerX).toBe(playerX);
    expect(component.playerY).toBe(playerY);
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

  it("lifts the roof of the hut the hero is standing in", () => {
    component.currentAct = 3;
    component.currentAreaIndex = 3;
    expect(component.currentArea.name).toBe("Lower Kurast");
    component.arenaW = 500;
    component.arenaH = 500;
    (component as any).arenaRef = {
      nativeElement: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    };
    (component as any).projectionDpr = 1;
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "campaignWorldGeometry").and.returnValue({
      scale: 1, width: 4000, height: 4000, left: 0, top: 0,
    });
    const layout = {
      atlasWidth: 64,
      atlasHeight: 64,
      backdropWidth: 4000,
      backdropHeight: 4000,
      tileWidth: 160,
      tileHeight: 80,
      instances: [
        { x: 140, y: 120, w: 64, h: 96, sx: 0, sy: 0, order: 0, roof: 1, hut: 0, core: 1, hx: 200, hy: 200 },
        // A roof cell on the eaves: over the hut, but not its inside.
        { x: 200, y: 120, w: 64, h: 96, sx: 0, sy: 0, order: 1, roof: 1, hut: 0, hx: 280, hy: 240 },
        // The next hut along the street, whose thatch must keep drawing.
        { x: 400, y: 300, w: 64, h: 96, sx: 0, sy: 0, order: 2, depth: 2500, roof: 1, hut: 1, core: 1, hx: 460, hy: 380 },
        { x: 400, y: 260, w: 64, h: 96, sx: 0, sy: 0, order: 3, roof: 1, hut: 1, hx: 460, hy: 340 },
      ],
    };
    (component as any).campaignWorlds.set("a3-lower-kurast", {
      walls: { complete: true, naturalWidth: 64 },
      layout,
    });
    const geometry = { scale: 1, left: 0, top: 0 };

    (component as any).currentChunkLocalX = 200;
    (component as any).currentChunkLocalY = 200;
    expect((component as any).campaignWorldRoofedHut(layout, geometry)).toBe(0);
    const inside = (component as any).campaignWorldWallDraws(160) as Array<{ hut?: number; depth: number }>;
    expect(inside.some((draw) => draw.hut === 0)).toBeFalse();
    expect(inside.filter((draw) => draw.hut === 1).length).toBe(2);
    // The roof of the next hut keeps the depth its hut's front cell gives it, so
    // it draws above that hut's own walls instead of sinking into them.
    expect(inside.find((draw) => draw.hut === 1)!.depth).toBe(2500);

    // Under the eaves is not inside: the roof stays.
    (component as any).currentChunkLocalX = 280;
    (component as any).currentChunkLocalY = 240;
    expect((component as any).campaignWorldRoofedHut(layout, geometry)).toBeNull();
    expect((component as any).campaignWorldWallDraws(160).length).toBe(4);
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

  it("never walls a drawn DS1 field with the painted courtyard mask", () => {
    component.currentAct = 1;
    component.currentAreaIndex = 0;
    expect(component.currentArea.name).toBe("Blood Moor");
    // The hand-drawn monastery mask blocks its whole wall band.  Blood Moor's
    // field is on screen now, so that mask would fence the hero inside a
    // courtyard drawn nowhere on the map: the invisible wall halfway in.
    (component as any).campaignCollisionMasks[1] = {
      width: 520, height: 300, blocked: new Uint8Array(520 * 300).fill(1),
    };
    const ground = document.createElement("img");
    Object.defineProperties(ground, {
      naturalWidth: { configurable: true, value: 8160 },
      naturalHeight: { configurable: true, value: 4336 },
    });
    (component as any).campaignWorlds.set("a1-blood-moor", { ground });
    component.playerX = 250;
    component.playerY = 250;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    expect((component as any).campaignCollisionContext()).toBeNull();
    expect((component as any).campaignTerrainBlocks(0, 40)).toBeFalse();
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
    // The exported ground is one diamond of floor tiles, so everything outside
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
      (component as any).playerWorldPosition().x,
      (component as any).playerWorldPosition().y,
    )).toBeTrue();

    (component as any).centerPlayerOnCampaignWorld();

    const centre = (component as any).campaignImagePointToWorld(walkable.x, walkable.y);
    const position = (component as any).playerWorldPosition();
    expect(position.x).toBeCloseTo(centre.x, 5);
    expect(position.y).toBeCloseTo(centre.y, 5);
    expect((component as any).outsideCampaignWorld(position.x, position.y)).toBeFalse();
  });

  it("starts the hero on the floor cell the exporter names for a room-built map", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 5;
    expect(component.currentArea.name).toBe("Catacombs");
    // The catacomb rooms wall off the exact middle of the grid, so the exporter
    // names a floor cell in the level's largest walkable region instead.
    const entry = (component as any).currentWorldEntry();
    const spawn = { x: entry.imageWidth / 2, y: entry.imageHeight / 2 + 128 };
    (component as any).campaignWorlds.set("a1-catacombs", {
      ground: { complete: false } as any,
      layout: {
        atlasWidth: 1, atlasHeight: 1,
        backdropWidth: entry.imageWidth, backdropHeight: entry.imageHeight,
        instances: [],
        walkable: {
          x: entry.imageWidth / 2, y: entry.imageHeight / 2,
          halfWidth: entry.imageWidth / 2, halfHeight: entry.imageHeight / 2,
        },
        spawn,
      },
    });

    (component as any).centerPlayerOnCampaignWorld();

    const position = (component as any).playerWorldPosition();
    // One exported pixel is 60/160 of a world unit, and the isometric image
    // axes are the world's diagonals, so the pixel maps through that rotation.
    const chunkWidth = (component as any).chunkTileColumns * 60;
    const chunkHeight = (component as any).chunkTileRows * 60;
    const offsetX = spawn.x - entry.imageWidth / 2;
    const offsetY = spawn.y - entry.imageHeight / 2;
    expect(position.x).toBeCloseTo(chunkWidth / 2 + (offsetX + 2 * offsetY) * 0.375, 5);
    expect(position.y).toBeCloseTo(chunkHeight / 2 + (2 * offsetY - offsetX) * 0.375, 5);
  });

  it("puts the hero on the exported spawn pixel of the drawn map", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 5;
    expect(component.currentArea.name).toBe("Catacombs");
    const entry = (component as any).currentWorldEntry();
    const spawn = { x: 1200, y: 900 };
    (component as any).campaignWorlds.set("a1-catacombs", {
      ground: { complete: false } as any,
      layout: {
        atlasWidth: 1, atlasHeight: 1,
        backdropWidth: entry.imageWidth, backdropHeight: entry.imageHeight,
        instances: [],
        walkable: {
          x: entry.imageWidth / 2, y: entry.imageHeight / 2,
          halfWidth: entry.imageWidth / 2, halfHeight: entry.imageHeight / 2,
        },
        spawn,
      },
    });

    (component as any).centerPlayerOnCampaignWorld();

    // The drawn map has to put that spawn pixel under the hero's fixed camera
    // spot.  If the image-to-world projection disagrees with the geometry the
    // map is drawn with, the hero is moved to a different pixel than the one
    // the exporter picked - a wall, or a room with no exit.
    const tileWidth = 60 * (component as any).worldZoom * Math.SQRT2;
    const geometry = (component as any).campaignWorldGeometry(tileWidth, entry.imageWidth, entry.imageHeight);
    const hero = (component as any).projectArenaPoint(component.arenaW / 2, component.arenaH / 2);
    expect(geometry.left + spawn.x * geometry.scale).toBeCloseTo(hero.x, 1);
    expect(geometry.top + spawn.y * geometry.scale).toBeCloseTo(hero.y, 1);
  });

  it("keeps a coarser tiled zone's DS1 map on the pixel grid its spawn uses", () => {
    component.currentAct = 2;
    const tombIndex = component.currentActDetails.areas
      .findIndex((area) => area.name === "Tal Rasha's Tomb");
    expect(tombIndex).toBeGreaterThanOrEqual(0);
    component.currentAreaIndex = tombIndex;
    const area = component.currentArea;
    expect(area.floorTileScale).toBe(2);
    const entry = (component as any).currentWorldEntry();
    const spawn = { x: 1840, y: 1616 };
    (component as any).campaignWorlds.set(entry.slug, {
      ground: { complete: false } as any,
      layout: {
        atlasWidth: 1, atlasHeight: 1,
        backdropWidth: entry.imageWidth, backdropHeight: entry.imageHeight,
        instances: [],
        walkable: {
          x: entry.imageWidth / 2, y: entry.imageHeight / 2,
          halfWidth: entry.imageWidth / 2, halfHeight: entry.imageHeight / 2,
        },
        spawn,
      },
    });

    // The zone's painted-tile grid is twice as coarse, which must not stretch its
    // DS1 art.  Drawn at the tiled width the map slid half a map away from the
    // floor the collision mask and the spawn cell use, leaving the hero on the
    // black rock outside the rooms.
    const tiledWidth = 60 * (area.floorTileScale ?? 1) * (component as any).worldZoom * Math.SQRT2;
    const worldWidth = (component as any).campaignWorldTileWidth(area, tiledWidth);
    expect(worldWidth).toBeCloseTo(tiledWidth / 2, 5);

    (component as any).centerPlayerOnCampaignWorld();

    const geometry = (component as any).campaignWorldGeometry(worldWidth, entry.imageWidth, entry.imageHeight);
    const hero = (component as any).projectArenaPoint(component.arenaW / 2, component.arenaH / 2);
    expect(geometry.left + spawn.x * geometry.scale).toBeCloseTo(hero.x, 1);
    expect(geometry.top + spawn.y * geometry.scale).toBeCloseTo(hero.y, 1);
  });

  it("pulls the hero off ground a rebuilt map walls over", () => {
    (component as any).currentAct = 1;
    component.currentAreaIndex = 5;
    expect(component.currentArea.name).toBe("Catacombs");
    // A run saved before the rebuild resumes on the coordinates it was left at,
    // and the new map can have built a wall there.  The movement rule never lets
    // the hero's centre step out of scenery, so the collision mask has to move
    // them to clear floor instead of leaving them boxed in.
    const width = 400;
    const height = 400;
    const blockedPixels = new Uint8Array(width * height);
    for (let y = 180; y < 220; y += 1) {
      for (let x = 180; x < 220; x += 1) blockedPixels[y * width + x] = 1;
    }
    (component as any).campaignWorlds.set("a1-catacombs", {
      ground: { complete: true, naturalWidth: width, naturalHeight: height } as any,
      collision: { width, height, blocked: blockedPixels },
      layout: {
        atlasWidth: 1, atlasHeight: 1, backdropWidth: width, backdropHeight: height,
        instances: [],
        walkable: { x: width / 2, y: height / 2, halfWidth: width / 2, halfHeight: height / 2 },
        spawn: { x: 40, y: 40 },
      },
    });
    spyOn(component as any, "campaignWorldGeometry").and.returnValue({
      scale: 1, width, height, left: 0, top: 0,
    });
    // The fixture's little mask is not the area's real map, so only its walls
    // matter here: the hero is inside the area and sitting on one.
    spyOn(component as any, "outsideCampaignWorld").and.returnValue(false);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    (component as any).currentChunkCoordX = 0;
    (component as any).currentChunkCoordY = 0;
    (component as any).currentChunkLocalX = 200;
    (component as any).currentChunkLocalY = 200;

    (component as any).ensurePlayerInsideCampaignWorld();

    const position = (component as any).playerWorldPosition();
    const context = (component as any).campaignWorldCollisionContext();
    expect((component as any).campaignBlockedAt(context, position.x, position.y)).toBeFalse();
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

    // Even with the map ready the hero stays put: the blue portal is the door.
    expect(component.zonePortalOpen).toBeTrue();
    expect(component.currentAreaIndex).toBe(0);
    expect(centre).not.toHaveBeenCalled();

    component.playerX = (component as any).zonePortalX;
    component.playerY = (component as any).zonePortalY;
    (component as any).crossZonePortal();

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

  it("breaks a Molten Boulder on an act boss instead of shoving it", () => {
    (component as any).arenaW = 1000;
    (component as any).arenaH = 1000;
    component.playerX = 100;
    component.playerY = 250;
    const boss = {
      kind: "boss", species: "andariel", campaignBoss: true, spriteFrame: 0,
      x: 350, y: 250, hp: 1000, maxHp: 1000, speed: 90, r: 34, dmg: 20, cd: 0,
    } as any;
    component.enemies = [boss];
    const projectile = {
      x: 300, y: 250, targetX: 600, targetY: 250,
      speed: 300, radius: 24, damage: 30, life: 10, age: 0, color: "#ff9c50", kind: "fire",
      boulder: true,
    } as any;

    (component as any).updateMoltenBoulder(projectile, 0.1);

    expect(boss.x).toBe(350);
    expect(boss.y).toBe(250);
    expect(projectile.boulder).toBeFalse();

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
    // Mounted on the seven class rigs, the human pieces all sat one brow low:
    // the cap's face opening, the helm/full/skull brow, the fanged and jawbone
    // plates and the mask/bone eye holes cut across the eyes. The seat moved up
    // to 0.0012 head-local, and the bands to 0.0011, so the brow clears the eyes.
    const seatedIds = [
      "cap", "skull", "helm", "full", "great", "bone", "mask", "assault", "avenger", "fanged", "horned",
    ] as const;
    for (const id of seatedIds) {
      expect(D2_HELMET_VISUALS[id].lift).toBeGreaterThanOrEqual(0.0012);
    }
    for (const id of ["circlet", "coronet", "tiara"] as const) {
      expect(D2_HELMET_VISUALS[id].lift).toBeGreaterThanOrEqual(0.0011);
    }
    expect(D2_HELMET_VISUALS.diadem.lift).toBeGreaterThanOrEqual(0.0011);
    expect(D2_HELMET_VISUALS.crown.lift).toBeGreaterThanOrEqual(0.0012);

    // The beast masks keep their authored seat: their eye holes already line up
    // with the eyes, and lifting them would move the holes above them.
    for (const id of ["wolf", "hawk", "antlers", "falcon", "spirit"] as const) {
      expect(D2_HELMET_VISUALS[id].lift).toBeGreaterThanOrEqual(0.0009);
      expect(D2_HELMET_VISUALS[id].lift).toBeLessThan(D2_HELMET_VISUALS.cap.lift);
    }
  });

  it("uses the close-cropped hair layer under low caps", () => {
    for (const id of ["cap", "skull"] as const) {
      expect(D2_HELMET_VISUALS[id].hair).toBe("full");
    }
  });

  it("scales the great helm's bowl to the skull and lifts it clear of the chin", () => {
    // The rip's bowl is 0.36 units wide against 0.75-0.95 for the pieces that
    // seat on the skull, so the shared scale buried the bowl and only its crest
    // showed. The crest also drags the mesh bounds centre up, so a bowl-scaled
    // helm on the shared lift sat centred on the jaw; the extra lift puts the
    // bowl back on the skull. It opts out of the skull-envelope clamp, whose
    // bound is measured on the crest rather than on the bowl.
    expect(D2_HELMET_VISUALS.great.scale).toBeCloseTo(D2_HELMET_VISUALS.full.scale * 2, 5);
    // Two and a half times a full helm's seat: the shared seat moved up to
    // 0.0012, while the bucket's own value is set from its bowl offset.
    expect(D2_HELMET_VISUALS.great.lift).toBeGreaterThan(D2_HELMET_VISUALS.full.lift * 2);
    expect(D2_HELMET_VISUALS.great.noFit).toBeTrue();
    expect(D2_HELMET_VISUALS.great.hair).toBe("full");
  });

  it("lifts the avenger guard's bowl onto the barbarian's crown", () => {
    // Its wings inflate the mesh bounds, so the bounds-centred seat sat low with
    // the skull showing over the rim; the piece is lifted, widened past the skull
    // and exempt from the envelope clamp that its own wings would trigger.
    expect(D2_HELMET_VISUALS.avenger.lift).toBeGreaterThan(D2_HELMET_VISUALS.full.lift);
    expect(D2_HELMET_VISUALS.avenger.scale).toBeGreaterThan(D2_HELMET_VISUALS.full.scale);
    expect(D2_HELMET_VISUALS.avenger.noFit).toBeTrue();
  });

  it("fits a helmet to the body the hero was normalized to, not to later gear", () => {
    // The character preview attaches the weapon before the helmet's mesh
    // resolves, and a pike stands over the hero's head. Measuring the model's
    // bounding box at that point reported the pike, so the helmet fit scaled
    // itself up by that ratio; only the great helm, exempt from the skull
    // envelope clamp, was visibly huge. The normalized body height wins.
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(20, 72, 10));
    body.position.y = 36;
    model.add(body);
    (component as any).normalizeCharacterModel(model, 72);
    expect(characterBodyHeight(model)).toBe(72);

    // The character preview attaches the weapon before normalizing, so the fit
    // above was measured against a bounding box that included this pike: the
    // recorded height has to be the body that was actually scaled.
    const armed = new THREE.Group();
    const armedBody = new THREE.Mesh(new THREE.BoxGeometry(20, 72, 10));
    armedBody.position.y = 36;
    armedBody.name = "torso";
    const pike = new THREE.Mesh(new THREE.BoxGeometry(2, 140, 2));
    pike.name = "pikeShape_0";
    pike.position.y = 70;
    armed.add(armedBody, pike);
    (component as any).normalizeCharacterModel(armed, 88);
    const armedHeight = characterBodyHeight(armed);
    expect(armedHeight).toBeLessThan(88);
    expect(armedHeight).toBeGreaterThan(40);

    // A pike that arrives later cannot change it back.
    const latePike = new THREE.Mesh(new THREE.BoxGeometry(2, 140, 2));
    latePike.name = "pikeShape_0";
    latePike.position.y = 70;
    model.add(latePike);
    expect(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y).toBeGreaterThan(100);
    expect(characterBodyHeight(model)).toBe(72);

    // A model that was never normalized still falls back to its own bounds.
    const bare = new THREE.Group();
    bare.add(new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4)));
    expect(characterBodyHeight(bare)).toBeCloseTo(30, 5);
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

  it("seats a helmet by each class's own head fit, not by a fixed head-local lift", () => {
    // The rigs bind the head between 3104 (druid) and 4181 (sorceress) at a
    // 72-unit body, and every lift in the table is authored against the
    // paladin's 3182. A bare head-local lift therefore moved the same hat by a
    // different distance on each class: the great helm's bowl rode ~35% higher
    // on the sorceress than on the druid, which read as the helmet floating
    // above her head while it sat right on his.
    const upright = new THREE.Quaternion();
    const seat = (headScaleAt72: number, classScale: number) =>
      helmetSeatOffset(D2_HELMET_VISUALS.great, upright, helmetSeatScale(3182 / headScaleAt72, classScale)).y;
    // Model-space travel of the seat, which is what the eye compares against a
    // helmet whose own size is normalised to the head bone.
    const travel = (headScaleAt72: number, classScale: number) => seat(headScaleAt72, classScale) * headScaleAt72;

    const unscaled = (headScaleAt72: number) => D2_HELMET_VISUALS.great.lift * headScaleAt72;
    expect(unscaled(4181) / unscaled(3103.9)).toBeCloseTo(1.347, 3);

    expect(travel(4181, 0.95) / travel(3103.9, 1)).toBeGreaterThan(0.9);
    expect(travel(4181, 0.95) / travel(3103.9, 1)).toBeLessThan(1.05);
    expect(travel(3495.6, 1.03) / travel(3103.9, 1)).toBeGreaterThan(0.9);
    expect(travel(3495.6, 1.03) / travel(3103.9, 1)).toBeLessThan(1.15);

    // Relative to the helmet's own scale the seat is the authored lift on every
    // class, so the fit both sizes the mesh and places it.
    for (const [headScaleAt72, classScale] of [[3103.9, 1], [4181, 0.95], [3495.6, 1.03], [3231.9, 0.93]] as const) {
      const fit = helmetSeatScale(3182 / headScaleAt72, classScale);
      expect(seat(headScaleAt72, classScale) / fit).toBeCloseTo(D2_HELMET_VISUALS.great.lift, 6);
    }

    // A quarter-turned bind still receives a vertical lift of the same size.
    const turned = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5);
    expect(helmetSeatOffset(D2_HELMET_VISUALS.great, turned, 0.8).x).toBeCloseTo(D2_HELMET_VISUALS.great.lift * 0.8, 6);
  });

  it("sizes a helmet from the head it sits on, at whatever scale the hero is drawn", () => {
    // The rips normalize to an 88-unit menu portrait and a 72-unit arena hero,
    // and the model group is scaled again for the arena. The body height is
    // stored in the model's own units while the head bone scale is world units,
    // so the ratio may only be taken after both are in the same space: mixing
    // them took the model's whole scale into the fit and made every helmet in
    // the previews thousands of times too large or too small.
    const worldScale = 3950.07;
    const localBodyHeight = 88 / worldScale;
    const headScale = 3182 * (88 / 72);
    expect(helmetHeadFit(localBodyHeight * worldScale, headScale)).toBeCloseTo(1, 6);
    // A hero drawn twice as large wears the same helmet.
    expect(helmetHeadFit(localBodyHeight * worldScale * 2, headScale * 2)).toBeCloseTo(1, 6);
    // Each class's own head scale is normalised to the reference.
    expect(helmetHeadFit(88, (3182 * 88) / 72 * 1.31)).toBeCloseTo(1 / 1.31, 6);
    // Never hand it a model-local height against a world head scale.
    expect(helmetHeadFit(localBodyHeight, headScale)).toBeLessThan(0.001);
    // A degenerate rig keeps the shared scale instead of dividing by zero.
    expect(helmetHeadFit(0, headScale)).toBe(1);
    expect(helmetHeadFit(88, 0)).toBe(1);
  });

  it("records the hero's body height in the model's own units", () => {
    // Box3.expandByObject only refreshes each mesh's own matrix, so measuring
    // the body straight after setting model.scale recorded the pre-scale height
    // (0.022 for an 88-unit hero) and the helmet fit divided by it.
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.022, 1));
    model.add(body);
    (component as any).normalizeCharacterModel(model, 88);
    const recorded = characterBodyHeight(model);
    expect(recorded).toBeCloseTo(88 / model.getWorldScale(new THREE.Vector3()).x, 5);
    expect(recorded * model.getWorldScale(new THREE.Vector3()).x).toBeCloseTo(88, 3);

    // Re-scaling the model (the arena's world scale) keeps the stored height.
    model.scale.multiplyScalar(1.16);
    expect(characterBodyHeight(model)).toBeCloseTo(recorded, 6);
    expect(characterBodyHeight(model) * model.getWorldScale(new THREE.Vector3()).x).toBeCloseTo(88 * 1.16, 3);
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
      ["Ring of the Artisan", 1, 1],
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
    spyOn(component as any, "portalArtImage").and.callFake((art: { path: string }) => {
      const image = new Image();
      image.src = (component as any).portalArtUrl(art);
      return image;
    });

    (component as any).drawActPortal(ctx);

    const draw = draws[0]!;
    expect(draw.source ?? "").toContain("assets/d2survivors/objects/red-portal.png?v=2");
    expect(draw.sw).toBe(109);
    expect(draw.dw).toBeGreaterThan(0);
    expect(draw.dh).toBeGreaterThan(draw.dw);
    expect(shadow).toHaveBeenCalled();

    // The blue area door is the same loop from its own sheet.
    draws.length = 0;
    (component as any).drawZonePortal(ctx);

    const zoneDraw = draws[0]!;
    expect(zoneDraw.source ?? "").toContain("assets/d2survivors/objects/blue-portal.png?v=2");
    expect(zoneDraw.sw).toBe(109);
    expect(zoneDraw.dh).toBeGreaterThan(zoneDraw.dw);
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

  it("never opens a portal inside a wall", () => {
    component.playerX = 250;
    component.playerY = 250;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;

    // A wall column right where the door would open: the spawn steps aside.
    spyOn(component as any, "portalSpawnClear").and.callFake(
      (x: number, y: number) => !(x > 290 && x < 320 && y > 200 && y < 300),
    );
    const aside = (component as any).actPortalSpawnPoint() as { x: number; y: number };
    expect((component as any).portalSpawnClear(aside.x, aside.y)).toBeTrue();
    expect(Math.hypot(aside.x - 250, aside.y - 250)).toBeLessThanOrEqual(110);

    // Walled in on every side: the door lands on the hero's own floor rather
    // than in the wall, even when that is the only clear ground left.
    (component as any).portalSpawnClear.and.returnValue(false);
    const pinned = (component as any).actPortalSpawnPoint() as { x: number; y: number };
    expect(pinned.x).toBeCloseTo(250, 5);
    expect(pinned.y).toBeCloseTo(250, 5);
  });

  it("carries the hero through a clicked portal the walk could not reach", () => {
    component.playerX = 250;
    component.playerY = 250;
    (component as any).clickedPortalTone = "zone";

    // Standing next to the door with no route left: the click still carries.
    component.playerX = 250 + 60;
    expect((component as any).withinPortalEntry(250, 250, "zone")).toBeTrue();
    // Same spot, but the order named the other door.
    expect((component as any).withinPortalEntry(250, 250, "act")).toBeFalse();
    // A door across the map is not carried by a click alone.
    component.playerX = 250 + 300;
    expect((component as any).withinPortalEntry(250, 250, "zone")).toBeFalse();
    // Walking there is left to the walk: the click only fills in at the end.
    component.playerX = 250 + 60;
    (component as any).isPlayerMoving = true;
    expect((component as any).withinPortalEntry(250, 250, "zone")).toBeFalse();
    (component as any).isPlayerMoving = false;
    (component as any).clickGroundTarget = { x: 300, y: 250 };
    expect((component as any).withinPortalEntry(250, 250, "zone")).toBeFalse();

    // Walking into it needs no click at all.
    (component as any).clickedPortalTone = null;
    (component as any).clickGroundTarget = null;
    component.playerX = 250 + 20;
    expect((component as any).withinPortalEntry(250, 250, "zone")).toBeTrue();
  });

  it("names every potion, pile of gold and item on the floor while ALT is held", () => {
    component.activeTab = "run";
    component.runActive = true;
    (component as any).worldZoom = 1;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(component as any, "itemDropImage").and.returnValue({ naturalHeight: 28 } as HTMLImageElement);
    const canvas = {
      width: 500,
      height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    component.potionDrops = [{ x: 100, y: 200, kind: "health", bob: 0, life: 20, pickupDelay: 0, notifiedFull: false, collected: false }];
    component.goldDrops = [{ x: 300, y: 220, amount: 1250, bob: 0, life: 20, pickupDelay: 0 }];
    component.itemDrops = [{ x: 400, y: 260, item: { name: "Short Sword" } as any, bob: 0, life: 20, pickupDelay: 0, notifiedFull: false }];

    // Nothing is shown until ALT is held.
    expect(component.altLootLabels).toEqual([]);

    component.onGlobalAttackKey({ key: "Alt", repeat: false, target: canvas, preventDefault: () => undefined } as any);
    expect(component.altLootLabelsHeld).toBe(true);
    const labels = component.altLootLabels;
    expect(labels.map((label) => label.text)).toEqual(["Health Potion", "1,250 Gold", "Short Sword"]);
    // Each label sits above the art it names, on the drop's own ground point.
    expect(labels[0].x).toBe(100);
    expect(labels[0].y).toBeLessThan(200);
    expect(labels[2].y).toBeLessThan(260);

    component.onGlobalMovementKeyUp({ key: "Alt" } as any);
    expect(component.altLootLabelsHeld).toBe(false);
    expect(component.altLootLabels).toEqual([]);

    // A window switch would otherwise swallow the keyup and strand the labels.
    component.altLootLabelsHeld = true;
    component.onWindowBlur();
    expect(component.altLootLabelsHeld).toBe(false);
  });

  it("names each floor item with its own rarity so the label can wear its colour", () => {
    component.activeTab = "run";
    component.runActive = true;
    (component as any).worldZoom = 1;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const canvas = {
      width: 500,
      height: 500,
      focus: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    const drop = (name: string, rarity: string, x: number) => ({
      x, y: 200, item: { name, rarity } as any, bob: 0, life: 20, pickupDelay: 0, notifiedFull: false,
    });
    component.potionDrops = [{ x: 40, y: 200, kind: "health", bob: 0, life: 20, pickupDelay: 0, notifiedFull: false, collected: false }];
    component.itemDrops = [
      drop("Leather Boots", "normal", 100),
      drop("Boots of Tangerine", "magic", 160),
      drop("Bloodletter", "rare", 220),
      drop("Tal Rasha's Adjudication", "set", 280),
      drop("Doombreaker", "unique", 340),
    ];
    component.altLootLabelsHeld = true;

    // The template colours each name from this field, so a normal base keeps the
    // plain label colour while magic, rare, set and unique names take their own.
    expect(component.altLootLabels.map((label) => [label.text, label.rarity])).toEqual([
      ["Health Potion", undefined],
      ["Leather Boots", "normal"],
      ["Boots of Tangerine", "magic"],
      ["Bloodletter", "rare"],
      ["Tal Rasha's Adjudication", "set"],
      ["Doombreaker", "unique"],
    ]);
  });

  it("keeps the ALT floor labels off the arena while a menu owns the screen", () => {
    component.activeTab = "run";
    component.runActive = true;
    (component as any).worldZoom = 1;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const canvas = {
      width: 500,
      height: 500,
      focus: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    component.potionDrops = [{ x: 100, y: 200, kind: "health", bob: 0, life: 20, pickupDelay: 0, notifiedFull: false, collected: false }];
    component.onGlobalAttackKey({ key: "Alt", repeat: false, target: canvas, preventDefault: () => undefined } as any);
    expect(component.altLootLabels.length).toBe(1);

    component.showEscapeMenu();
    expect(component.altLootLabels).toEqual([]);
    component.closeEscapeMenu();
    // ALT is still down, so the names come back once the arena is playable again.
    expect(component.altLootLabels.length).toBe(1);

    component.inventoryOpen = true;
    expect(component.altLootLabels).toEqual([]);
    component.inventoryOpen = false;
    component.skillTreeOpen = true;
    expect(component.altLootLabels).toEqual([]);
    component.skillTreeOpen = false;
    // An unspent skill point no longer pauses the arena, so the labels stay up.
    expect(component.altLootLabels.length).toBe(1);
  });

  it("names the red portal and its destination when the doorway is hovered", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.actPortalOpen = true;
    component.currentAct = 2;
    (component as any).actPortalX = 250;
    (component as any).actPortalY = 250;
    (component as any).worldZoom = 2.1;
    (component as any).projectionDpr = 1;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 250, y: 320 });
    const canvas = {
      width: 500,
      height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    // Middle of the 109x159 cel drawn from the portal's ground anchor.
    const scale = 2.1 * 1 * 0.64;
    const hoverX = 250 - 54 * scale + 109 * scale / 2;
    const hoverY = 320 - 120 * scale + 159 * scale / 2;
    const move = (clientX: number, clientY: number): void => component.onArenaPointerMove({
      pointerType: "mouse", pointerId: 1, clientX, clientY, target: canvas,
      preventDefault: () => undefined,
    } as any);

    move(hoverX, hoverY);
    const portal = component.hoveredPortal!;
    expect(portal.title).toBe("Red Portal");
    expect(portal.lines[0]).toContain("Act 3");
    expect(portal.lines[1]).toContain("Walk into the portal");

    // The empty floor beside the doorway has no tooltip.
    move(hoverX - 300, hoverY);
    expect(component.hoveredPortal).toBeNull();

    // The last act's portal finishes the campaign instead of naming another act.
    component.currentAct = 8;
    move(hoverX, hoverY);
    expect(component.hoveredPortal!.lines[0]).toContain("finish the campaign");

    component.onArenaPointerLeave();
    expect(component.hoveredPortal).toBeNull();
  });

  it("names the same next act in the portal hint as in the portal tooltip", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.actPortalOpen = true;
    (component as any).actPortalX = 250;
    (component as any).actPortalY = 250;
    (component as any).worldZoom = 2.1;
    (component as any).projectionDpr = 1;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 250, y: 320 });
    const canvas = {
      width: 500,
      height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    const scale = 2.1 * 1 * 0.64;
    const hoverX = 250 - 54 * scale + 109 * scale / 2;
    const hoverY = 320 - 120 * scale + 159 * scale / 2;

    for (let act = 1; act <= 8; act += 1) {
      component.currentAct = act;
      component.onArenaPointerMove({
        pointerType: "mouse", pointerId: 1, clientX: hoverX, clientY: hoverY, target: canvas,
        preventDefault: () => undefined,
      } as any);
      const tooltip = component.hoveredPortal!;
      // The HUD hint interpolates this same phrase, so the two cannot drift.
      expect(component.actPortalLead).toBe(tooltip.lines[0].replace(/^Enter to /, "").replace(/\.$/, ""));
      if (act < 8) expect(component.actPortalLead).toContain(`Act ${act + 1}`);
    }

    // Act VIII is the end of the campaign, past the Worldstone of Act V.
    expect(component.actPortalLead).toBe("finish the campaign");
  });

  it("names the blue area portal and the area it opens when the doorway is hovered", () => {
    component.activeTab = "run";
    component.runActive = true;
    component.currentAct = 2;
    component.currentAreaIndex = 0;
    (component as any).zonePortalAreaIndex = 1;
    component.zonePortalOpen = true;
    (component as any).zonePortalX = 250;
    (component as any).zonePortalY = 250;
    (component as any).worldZoom = 2.1;
    (component as any).projectionDpr = 1;
    spyOn(component as any, "projectArenaPoint").and.returnValue({ x: 250, y: 320 });
    const canvas = {
      width: 500,
      height: 500,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as any;
    (component as any).arenaRef = { nativeElement: canvas };
    // Both portal cels share the same 109x159 frame and ground anchor.
    const scale = 2.1 * 1 * 0.64;
    const hoverX = 250 - 54 * scale + 109 * scale / 2;
    const hoverY = 320 - 120 * scale + 159 * scale / 2;
    const move = (clientX: number, clientY: number): void => component.onArenaPointerMove({
      pointerType: "mouse", pointerId: 1, clientX, clientY, target: canvas,
      preventDefault: () => undefined,
    } as any);

    move(hoverX, hoverY);
    const portal = component.hoveredPortal!;
    // The card wears the door's own colour, so the blue area door does not read
    // as the act portal.
    expect(portal.tone).toBe("zone");
    expect(portal.title).toBe("Blue Portal");
    const destination = component.currentActDetails.areas[1];
    expect(portal.lines[0]).toContain(destination.name);
    expect(portal.lines[0]).toContain(String(destination.level));
    expect(portal.lines[1]).toContain("Walk into the portal");
    expect(component.zonePortalLead).toBe(portal.lines[0].replace(/^Enter to /, "").replace(/\.$/, ""));

    // The empty floor beside the doorway has no tooltip.
    move(hoverX - 300, hoverY);
    expect(component.hoveredPortal).toBeNull();
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
    expect((component as any).skillVisualEffects.some((effect: any) => effect.boneFetishDeath)).toBeTrue();
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

  it("plays each monster's own neutral clip while it stands still", () => {
    const frame = { width: 170, height: 158 } as HTMLCanvasElement;
    (component as any).enemySprites.goatman = {
      frames: Array.from({ length: 24 }, () => Array.from({ length: 14 }, () => frame)),
      columns: 14,
      rows: 24,
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
      species: "goatman",
      campaignBoss: false,
      spriteFrame: 0,
      animationState: "idle",
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

    // Standing still reads the appended neutral block (rows 16-23), not the walk
    // band, so a waiting monster is not a frozen picture.
    (component as any).runTime = 0;
    (component as any).drawEnemy(ctx, enemy);
    expect(tinted.calls.mostRecent().args[1]).toBe(20);
    const firstIdleFrame = tinted.calls.mostRecent().args[2] as number;
    (component as any).runTime = 0.5;
    (component as any).drawEnemy(ctx, enemy);
    expect(tinted.calls.mostRecent().args[1]).toBe(20);
    expect(tinted.calls.mostRecent().args[2]).not.toBe(firstIdleFrame);

    enemy.animationState = "move";
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

    it("holds a ranged monster still when the wall offers it no detour", () => {
      spyOn(component as any, "campaignStepBlocked").and.returnValue(true);
      (component as any).detourSearchesLeft = 1;
      const fiend = { x: 100, y: 100, pathSide: 1 } as any;

      const step = (component as any).enemyWallAwareStep(context(), fiend, 1, 0, 5, 400, 100);

      // No route inside the detour box: the monster waits rather than sliding.
      expect(step.x).toBe(100);
      expect(step.y).toBe(100);
      expect(fiend.detourRetry).toBeGreaterThan(0);
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

  it("clears the item tooltip when the hovered item is sold", () => {
    const sword = {
      id: "sold-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
      stats: { damageMin: 2, damageMax: 5 }, desc: "A short sword.", affixes: [],
    } as any;
    const emptyEquipment = () => ({
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    });
    component.activeTab = "run";
    component.runActive = true;
    component.inventoryOpen = true;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.equipment = emptyEquipment() as any;
    component.inventory[0] = sword;
    (component as any).rebuildInventoryGrid();
    component.hoveredItem = sword;
    component.hoveredSlotIndex = 0;
    component.selectedItem = sword;
    component.selectedSlotIndex = 0;
    spyOn(component as any, "persistRunProgress");

    component.sellInventoryItem(0);

    expect(component.inventory[0]).toBeNull();
    expect(component.hoveredItem).toBeNull();
    expect(component.selectedItem).toBeNull();
    expect(component.itemPreviewItem).toBeNull();
  });

  it("clears the item tooltip when the hovered worn item is sold", () => {
    const sword = {
      id: "worn-sword", name: "Sabre", baseName: "Sabre", rarity: "normal",
      slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
      stats: { damageMin: 3, damageMax: 7 }, desc: "An old sabre.", affixes: [],
    } as any;
    component.activeTab = "run";
    component.runActive = true;
    component.inventoryOpen = true;
    component.inventory = Array.from({ length: component.inventoryColumns * component.inventoryRows }, () => null);
    component.equipment.weapon = sword;
    component.hoveredItem = sword;
    component.hoveredEquipmentSlot = "weapon";
    component.selectedItem = sword;
    component.selectedEquipmentSlot = "weapon";
    spyOn(component as any, "persistRunProgress");

    component.sellEquippedItem("weapon");

    expect(component.equipment.weapon).toBeNull();
    expect(component.hoveredItem).toBeNull();
    expect(component.selectedItem).toBeNull();
    expect(component.itemPreviewItem).toBeNull();
  });

  it("keys the stun loop's black backdrop out when it loads", () => {
    const source = document.createElement("canvas");
    source.width = 3;
    source.height = 1;
    const context = source.getContext("2d")!;
    context.fillStyle = "rgb(4, 4, 4)";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "rgb(200, 200, 200)";
    context.fillRect(1, 0, 1, 1);

    const keyed = (component as any).keyOutEffectBackdrop(source) as HTMLCanvasElement;
    const pixels = keyed.getContext("2d")!.getImageData(0, 0, 3, 1).data;

    // The near-black backdrop becomes fully transparent...
    expect(pixels[3]).toBe(0);
    // ...while the bright star pixels keep their alpha.
    expect(pixels[7]).toBe(255);
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

  it("hides a clicked item's tooltip as soon as the pointer leaves the item", () => {
    jasmine.clock().install();
    try {
      const item = {
        id: "picked-sword", name: "Short Sword", baseName: "Short Sword", rarity: "normal",
        slot: "weapon", equipmentType: "weapon", requiredLevel: 1,
        stats: { damageMin: 2, damageMax: 5 }, desc: "A short sword.", affixes: [],
      } as any;
      component.inventoryOpen = true;
      component.inventory = Array.from({ length: 40 }, () => null);
      component.inventory[2] = item;
      const event = { clientX: 100, clientY: 120, ctrlKey: false, preventDefault: () => undefined } as any;

      component.onInventoryItemHover(2, item, event);
      component.onInventoryItemClick(2, item, event);
      expect(component.itemPreviewItem?.id).toBe("picked-sword");

      component.onItemPreviewLeave();
      jasmine.clock().tick(200);

      expect(component.itemPreviewItem).toBeNull();
      // Only the tooltip goes; the slot stays selected for sell/equip.
      expect(component.selectedItem?.id).toBe("picked-sword");
      expect(component.selectedSlotIndex).toBe(2);

      // Hovering the item again brings its tooltip straight back.
      component.onInventoryItemHover(2, item, event);
      expect(component.itemPreviewItem?.id).toBe("picked-sword");
    } finally {
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
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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
    component.skillPoints = 0;
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

    // Double Throw sends both weapons, one after the other.
    expect(component.attackProjectiles.length).toBe(2);
    for (const projectile of component.attackProjectiles) expect(projectile.speed).toBeGreaterThan(650);
    (component as any).updateAttackProjectiles(1000);
    expect(target.hp).toBeLessThan(1000);
  });

  it("auto-throws a throwing weapon from range without applying melee damage", () => {
    component.runActive = true;
    (component as any).attackCooldown = 0;
    component.skillPoints = 0;
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
    // Hsarus' pieces ask for level 3; below it they stay worn but inert, so this
    // set-logic test starts at the level the pieces are made for.
    component.playerLevel = 3;
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
    // The Paladin's table: +4 Vitality is 12 Life, +2 Energy is 3 Mana.
    expect(component.getPreviewItemStatDelta("life")).toBe(12);
    expect(component.getPreviewItemStatDelta("mana")).toBe(3);

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
    // The Amazon's table pays 3 Life a Vitality, so the charm's 4 add 12.
    expect(component.effectivePlayerMaxHp).toBe(112);

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

    // Smite rank 1 is +15% on top of the 1.5x skill base and the Strength bonus.
    expect(target.hp).toBeCloseTo(784.375, 5);
  });

  it("uses the guidebook's cold damage tables and synergies", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = { "Ice Bolt": 1 };
    expect((component as any).sorceressColdSkillDamage("Ice Bolt")).toBeCloseTo(4, 5);
    expect((component as any).sorceressColdLength("Ice Bolt")).toBeCloseTo(6, 5);

    component.skillLevels = { "Ice Bolt": 20 };
    expect((component as any).sorceressColdSkillDamage("Ice Bolt")).toBeCloseTo(43.5, 5);
    expect((component as any).sorceressColdLength("Ice Bolt")).toBeCloseTo(32.6, 5);

    // Frost Nova adds 15% per level to Ice Bolt, and carries its own table.
    component.skillLevels = { "Ice Bolt": 1, "Frost Nova": 1 };
    expect((component as any).sorceressColdSkillDamage("Ice Bolt")).toBeCloseTo(4.6, 5);
    expect((component as any).sorceressColdSkillDamage("Frost Nova")).toBeCloseTo(3, 5);

    component.skillLevels = { Blizzard: 1 };
    expect((component as any).sorceressColdSkillDamage("Blizzard")).toBeCloseTo(68.5, 5);

    component.skillLevels = { "Frozen Orb": 1, "Ice Bolt": 1 };
    expect((component as any).sorceressColdSkillDamage("Frozen Orb")).toBeCloseTo(42.5 * 1.02, 5);
  });

  it("stacks Blizzard storms and pours in the table's per-second damage", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Blizzard"];
    component.skillLevels = { Blizzard: 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 5000, maxHp: 5000, speed: 0, r: 14, dmg: 0 } as any;
    component.enemies = [target];
    (component as any).playerBlizzards.length = 0;

    component.activateOwnedSkill("Blizzard", target);
    component.activateOwnedSkill("Blizzard", target);
    const storms = (component as any).playerBlizzards;
    expect(storms).toHaveSize(2);
    // 68.5 damage per second over four seconds, split across 24 shards.
    expect(storms[0].damagePerShard).toBeCloseTo(68.5 * 4 / 24, 5);
    expect(storms[1].damagePerShard).toBeCloseTo(68.5 * 4 / 24, 5);
  });

  it("keeps one cold armor up and answers the attacks each one covers", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 500;
    (component as any).playerMaxHp = 500;
    component.ownedSkills = ["Frozen Armor", "Shiver Armor", "Chilling Armor"];
    component.skillLevels = { "Frozen Armor": 1, "Shiver Armor": 1, "Chilling Armor": 1 };
    // No shield and no lucky block roll: the blows these armors answer land.
    component.equipment.shield = null;
    spyOn(Math, "random").and.returnValue(0.99);
    const monster = () => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 500, maxHp: 500,
      speed: 0, r: 14, dmg: 10, resistances: { cold: 0 }, immunities: [],
    }) as any;

    component.activateOwnedSkill("Shiver Armor");
    expect((component as any).coldArmorSkill).toBe("Shiver Armor");
    expect((component as any).coldArmorRemaining).toBe(130);
    expect(component.coldArmorDefensePercent).toBe(45);
    const biter = monster();
    component.enemies = [biter];
    (component as any).rebuildEnemyGrid();
    (component as any).applyIncomingDamage(10, biter, "melee");
    (component as any).flushPendingDamage();
    expect(biter.hp).toBeLessThan(500);
    expect(biter.coldRemaining).toBeCloseTo(4, 5);

    // Frozen Armor replaces it and freezes melee attackers instead.
    component.activateOwnedSkill("Frozen Armor");
    expect((component as any).coldArmorSkill).toBe("Frozen Armor");
    // Shiver Armor adds ten seconds to Frozen Armor's duration.
    expect((component as any).coldArmorRemaining).toBe(140);
    const frozen = monster();
    component.enemies = [frozen];
    (component as any).rebuildEnemyGrid();
    (component as any).applyIncomingDamage(10, frozen, "melee");
    // 1.2s from the table, +5% because one rank of Shiver Armor is learned.
    expect(frozen.freezeRemaining).toBeCloseTo(1.32, 5);

    // Chilling Armor only answers missiles, so a melee blow passes untouched.
    component.activateOwnedSkill("Chilling Armor");
    expect((component as any).coldArmorSkill).toBe("Chilling Armor");
    expect((component as any).coldArmorDefensePercent).toBe(45);
    const melee = monster();
    component.enemies = [melee];
    (component as any).rebuildEnemyGrid();
    (component as any).applyIncomingDamage(10, melee, "melee");
    expect(melee.hp).toBe(500);
    const archer = monster();
    archer.x = 270;
    component.enemies = [archer];
    (component as any).rebuildEnemyGrid();
    (component as any).applyIncomingDamage(10, archer, "missile");
    (component as any).flushPendingDamage();
    expect(archer.hp).toBeLessThan(500);
  });

  it("pierces cold resistance with Cold Mastery but never cold immunity", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = { "Cold Mastery": 1 };
    const vulnerable = { kind: "normal", species: "fallen", resistances: { cold: 75 } } as any;
    const immune = { kind: "normal", species: "fallen", resistances: { cold: 100 } } as any;
    expect((component as any).enemyResistanceMultiplier(vulnerable, "cold")).toBeCloseTo(0.45, 5);
    expect((component as any).enemyResistanceMultiplier(immune, "cold")).toBe(0);

    component.skillLevels = { "Cold Mastery": 20 };
    expect((component as any).effectiveEnemyResistance(vulnerable, "cold")).toBe(-40);
  });

  it("uses the guidebook's fire tables, synergies and Fire Mastery", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = { "Fire Bolt": 1 };
    expect((component as any).sorceressFireSkillDamage("Fire Bolt")).toBeCloseTo(4.5, 5);

    component.skillLevels = { "Fire Bolt": 20 };
    expect((component as any).sorceressFireSkillDamage("Fire Bolt")).toBeCloseTo(52.5, 5);

    // Fire Ball adds 16% per level to Fire Bolt; Fire Mastery adds 30% at rank one.
    component.skillLevels = { "Fire Bolt": 1, "Fire Ball": 1 };
    expect((component as any).sorceressFireSkillDamage("Fire Bolt")).toBeCloseTo(4.5 * 1.16, 5);
    component.skillLevels = { "Fire Bolt": 1, "Fire Mastery": 1 };
    expect((component as any).sorceressFireSkillDamage("Fire Bolt")).toBeCloseTo(4.5 * 1.3, 5);

    // Hydra's per-bolt column, and its own synergy.
    component.skillLevels = { Hydra: 1, "Fire Bolt": 1 };
    expect((component as any).hydraBoltDamage()).toBeCloseTo(16.5 * 1.03, 5);

    // Inferno's reach grows with the guidebook's yard table.
    expect((component as any).infernoRangeForRank(1)).toBeCloseTo(66, 5);
    expect((component as any).infernoRangeForRank(20)).toBeCloseTo(252, 5);
  });

  it("burns Blaze, Fire Wall and Meteor with their own columns", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Blaze", "Fire Wall", "Meteor"];
    component.skillLevels = { Blaze: 1, "Fire Wall": 1, Meteor: 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).blazeFirePatches.length = 0;
    (component as any).playerAttackLockRemaining = 0;

    component.activateOwnedSkill("Blaze");
    expect((component as any).blazeRemaining).toBeCloseTo(4.6, 5);
    // 18-37 damage per second, paid on the half-second fire tick.
    // 18-37 per second, +1% because one rank of Fire Wall is learned.
    expect((component as any).blazeDamagePerTick).toBeCloseTo((18 + 37) / 2 * 1.01 * 0.5, 5);

    component.activateOwnedSkill("Fire Wall");
    const wall = component.attackProjectiles[0] as any;
    expect(wall.life).toBeCloseTo(3.6, 5);
    expect(wall.wallHalfLength).toBe(80);
    expect(wall.damage).toBeCloseTo((70 + 94) / 2 * 0.5, 5);

    (component as any).blazeFirePatches.length = 0;
    component.activateOwnedSkill("Meteor", undefined, { x: 300, y: 250 });
    const meteor = component.attackProjectiles[component.attackProjectiles.length - 1] as any;
    expect(meteor.impactRadius).toBe(80);
    expect((component as any).blazeFirePatches).toHaveSize(1);
    expect((component as any).blazeFirePatches[0].damagePerTick)
      .toBeCloseTo((35 + 58) / 2 * 0.5, 5);
  });

  it("casts Enchant as a timed weapon buff", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Enchant"];
    component.skillLevels = { Enchant: 1 };
    component.basicAttackDamage = 100;
    component.basicAttackName = "Attack";

    component.activateOwnedSkill("Enchant");
    expect((component as any).enchantRemaining).toBe(144);
    expect((component as any).enchantFireDamage).toBeCloseTo(9, 5);
    expect((component as any).enchantAttackRatingPercent).toBe(20);
    expect((component as any).skillCastDamage("Attack")).toBeCloseTo(100 + 9, 5);

    (component as any).updateSkillVisualEffects(200_000);
    expect((component as any).enchantRemaining).toBe(0);
    expect((component as any).skillCastDamage("Attack")).toBeCloseTo(100, 5);
  });

  it("describes the sorceress fire and cold passives as they actually work", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = { Warmth: 1, Enchant: 1, "Fire Mastery": 1, "Cold Mastery": 1, "Lightning Mastery": 1 };

    // Tree and level-up card text: no cast-speed Warmth, no invented Enchant
    // buff to fire skills, and the masteries use their real rank-one values.
    const warmth = component.getSkillDescription("Warmth") ?? "";
    expect(warmth).toContain("mana regenerates 30% faster at rank 1, +12% each rank");
    expect(warmth).not.toContain("recharge");
    expect(component.getSkillDescription("Enchant") ?? "").toContain("sets your weapon alight for 144s");
    expect(component.getSkillDescription("Fire Mastery") ?? "").toContain("+30% fire damage at rank 1, +7% each rank");
    expect(component.getSkillDescription("Cold Mastery") ?? "").toContain("-20% enemy cold resistance at rank 1");
    expect(component.getSkillDescription("Lightning Mastery") ?? "").toContain("+50% lightning damage at rank 1");

    // Tooltips carry the same numbers.
    expect(((component as any).getSkillRankStats("Fire Mastery", "passive", 1) as string[])[0])
      .toBe("+30% fire damage");
    expect(((component as any).getSkillRankStats("Cold Mastery", "passive", 1) as string[])[0])
      .toBe("-20% enemy cold resistance");
    expect((component as any).getSkillRankStats("Warmth", "passive", 1))
      .toContain("Its ranks also feed Inferno (+13%), Blaze and Fire Wall (+4%) and Enchant (+9%)");
    const frozenArmor = (component as any).getSkillRankStats("Frozen Armor", "passive", 1) as string[];
    expect(frozenArmor[0]).toBe("+30% Defense");
    expect(frozenArmor.join(" ")).toContain("Freezes a melee attacker");
  });

  it("enforces skills.txt's casting delays before the next cast", () => {
    // Every non-zero localdelay in skills.txt, in seconds (frames / 25). These
    // are the only spells in the game with a recharge.
    const delays: [string, number][] = [
      ["Fire Wall", 1.4],
      ["Blizzard", 1.8],
      ["Meteor", 1.2],
      ["Frozen Orb", 1],
      ["Molten Boulder", 1],
      ["Volcano", 4],
      ["Fist of the Heavens", 0.4],
      ["Firestorm", 0.6],
    ];
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.enemies = [];
    component.attackProjectiles = [];
    const ground = { x: 300, y: 250 };

    for (const [skill, delay] of delays) {
      component.ownedSkills = [skill];
      component.skillLevels = { [skill]: 1 };
      component.secondaryAttackSpell = skill;
      component.playerMana = 1000;
      (component as any).attackCooldown = 0;
      (component as any).skillCastCooldowns = {};

      // The delay is fixed: rank, Faster Cast Rate and gear do not shorten it.
      expect(component.getSkillCastInterval(skill)).toBeCloseTo(delay, 5);
      component.skillLevels = { [skill]: 20, "Faster Cast Rate": 5 };
      expect(component.getSkillCastInterval(skill)).toBeCloseTo(delay, 5);
      component.skillLevels = { [skill]: 1 };

      expect((component as any).canBasicAttackCastSpell(skill)).withContext(`${skill}: gate before cast`).toBeTrue();
      expect((component as any).tryAttackSlotSpell("secondary", undefined, ground)).withContext(`${skill}: first cast`).toBeTrue();
      expect((component as any).skillCastCooldowns[skill]).toBeCloseTo(delay, 5);

      // The next cast is refused until the delay elapses, and the refusal does
      // not eat the remaining cooldown.
      expect((component as any).tryAttackSlotSpell("secondary", undefined, ground)).withContext(`${skill}: second cast refused`).toBeFalse();
      (component as any).tickSkillCastCooldowns(delay - 0.05);
      expect((component as any).skillCastCooldowns[skill]).toBeGreaterThan(0);
      expect((component as any).tryAttackSlotSpell("secondary", undefined, ground)).withContext(`${skill}: still refused`).toBeFalse();
      (component as any).tickSkillCastCooldowns(0.1);
      expect((component as any).skillCastCooldowns[skill]).toBe(0);
      expect((component as any).tryAttackSlotSpell("secondary", undefined, ground)).withContext(`${skill}: cast after delay`).toBeTrue();
    }

    // The rest of the book has no recharge: the next cast is ready immediately,
    // and only mana and the cast animation stand in its way.
    for (const skill of ["Fire Bolt", "Hydra", "Nova", "Ice Bolt", "Teeth"]) {
      expect(component.getSkillCastInterval(skill)).withContext(`${skill} has no cast delay`).toBe(0);
    }
  });

  it("shortens the cast animation with Faster Cast Rate instead of inventing a recharge", () => {
    component.selectedClass = "sorceress";
    let fasterCast = 0;
    spyOnProperty(component, "equippedFasterCastPercent").and.callFake(() => fasterCast);

    (component as any).triggerAttackAnimation("sorceressCast");
    const unhurried = (component as any).playerAttackLockRemaining;

    fasterCast = 50;
    (component as any).triggerAttackAnimation("sorceressCast");
    const hurried = (component as any).playerAttackLockRemaining;

    expect(hurried).withContext("cast rate shortens the cast itself").toBeLessThan(unhurried);
    expect((component as any).attackAnimationRate).toBeCloseTo(1.5, 5);
    // Cast rate never touches a real casting delay, and never creates one.
    expect(component.getSkillCastInterval("Frozen Orb")).toBe(1);
    expect(component.getSkillCastInterval("Fire Bolt")).toBe(0);
  });

  it("uses the guidebook's lightning tables, synergies and Lightning Mastery", () => {
    component.selectedClass = "sorceress";
    component.skillLevels = { "Charged Bolt": 1 };
    expect((component as any).sorceressLightningSkillDamage("Charged Bolt")).toBeCloseTo(3, 5);
    component.skillLevels = { "Charged Bolt": 1, Lightning: 1 };
    expect((component as any).sorceressLightningSkillDamage("Charged Bolt")).toBeCloseTo(3 * 1.06, 5);

    // Lightning's 1-43 has a 22 average, and its three synergies add 8% each.
    component.skillLevels = { Lightning: 1 };
    expect((component as any).sorceressLightningSkillDamage("Lightning")).toBeCloseTo(22, 5);
    component.skillLevels = { Lightning: 1, "Charged Bolt": 1, Nova: 1, "Chain Lightning": 1 };
    expect((component as any).sorceressLightningSkillDamage("Lightning")).toBeCloseTo(22 * 1.24, 5);

    component.skillLevels = { Nova: 1 };
    expect((component as any).sorceressLightningSkillDamage("Nova")).toBeCloseTo(10.5, 5);
    component.skillLevels = { "Chain Lightning": 1 };
    expect((component as any).sorceressLightningSkillDamage("Chain Lightning")).toBeCloseTo(20.5, 5);

    // Lightning Mastery starts at +50%.
    component.skillLevels = { Nova: 1, "Lightning Mastery": 1 };
    expect((component as any).sorceressLightningSkillDamage("Nova")).toBeCloseTo(10.5 * 1.5, 5);
  });

  it("absorbs damage into mana with Energy Shield", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    (component as any).playerMaxHp = 1000;
    component.playerMana = 500;
    component.ownedSkills = ["Energy Shield", "Telekinesis"];
    component.skillLevels = { "Energy Shield": 1, Telekinesis: 0 };
    component.equipment.shield = null;
    component.enemies = [];

    component.activateOwnedSkill("Energy Shield");
    expect((component as any).energyShieldRemaining).toBe(144);
    expect((component as any).energyShieldAbsorbPercent).toBe(20);

    // 20% of a 100-point hit is absorbed at 2 mana per point.
    const taken = (component as any).applyIncomingDamage(100);
    expect(taken).toBeLessThan(100);
    expect(component.playerMana).toBeLessThan(500);

    // Eight Telekinesis points lower the ratio to 1.5 mana per point.
    component.skillLevels = { "Energy Shield": 1, Telekinesis: 8 };
    expect((component as any).energyShieldManaRatio()).toBeCloseTo(1.5, 5);
    component.skillLevels = { "Energy Shield": 1, Telekinesis: 16 };
    expect((component as any).energyShieldManaRatio()).toBeCloseTo(1, 5);
  });

  it("teleports to a clicked point and runs Thunder Storm for its table duration", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 150;
    component.playerY = 150;
    component.ownedSkills = ["Teleport", "Thunder Storm"];
    component.skillLevels = { Teleport: 1, "Thunder Storm": 1 };
    component.enemies = [];
    (component as any).skillCastCooldowns = {};

    component.activateOwnedSkill("Teleport", undefined, { x: 350, y: 150 });
    // The world shifts under the hero, who stays centred on screen.
    expect(component.playerX).toBeCloseTo((component as any).arenaW / 2, 5);
    expect((component as any).playerMoveX).not.toBeUndefined();

    component.activateOwnedSkill("Thunder Storm");
    expect((component as any).thunderStormRemaining).toBe(32);
    expect((component as any).getSkillRankStats("Thunder Storm", "aura", 1))
      .toContain("1-100 lightning damage per bolt");
  });

  it("uses the guidebook's druid elemental tables and synergies", () => {
    component.selectedClass = "druid";
    component.skillLevels = { Firestorm: 1 };
    expect((component as any).druidElementalSkillDamage("Firestorm")).toBeCloseTo(5, 5);
    component.skillLevels = { Twister: 1 };
    expect((component as any).druidElementalSkillDamage("Twister")).toBeCloseTo(7, 5);
    component.skillLevels = { Tornado: 1 };
    expect((component as any).druidElementalSkillDamage("Tornado")).toBeCloseTo(30, 5);
    component.skillLevels = { Hurricane: 1 };
    expect((component as any).druidElementalSkillDamage("Hurricane")).toBeCloseTo(37.5, 5);
    component.skillLevels = { Armageddon: 1 };
    expect((component as any).druidElementalSkillDamage("Armageddon")).toBeCloseTo(50, 5);
    component.skillLevels = { Volcano: 1 };
    expect((component as any).druidElementalSkillDamage("Volcano")).toBeCloseTo(9, 5);
    component.skillLevels = { Fissure: 1 };
    expect((component as any).druidElementalSkillDamage("Fissure")).toBeCloseTo(20, 5);
    component.skillLevels = { "Molten Boulder": 1 };
    expect((component as any).druidElementalSkillDamage("Molten Boulder")).toBeCloseTo(9, 5);

    // Arctic Blast's synergies add 15% each; Hurricane pulls its own duration.
    component.skillLevels = { "Arctic Blast": 1, Hurricane: 1, "Cyclone Armor": 1 };
    expect((component as any).druidElementalSkillDamage("Arctic Blast")).toBeCloseTo(11.5 * 1.3, 5);
    expect((component as any).hurricaneDurationSeconds()).toBe(12);
    component.skillLevels = { Hurricane: 1, Fissure: 3 };
    expect((component as any).armageddonDurationSeconds()).toBe(16);
  });

  it("casts Fissure vents and a Hurricane that follows the druid", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Fissure", "Hurricane", "Cyclone Armor"];
    component.skillLevels = { Fissure: 1, Hurricane: 1, "Cyclone Armor": 1 };
    component.enemies = [];
    component.attackProjectiles = [];
    (component as any).skillCastCooldowns = {};
    (component as any).blazeFirePatches.length = 0;

    component.activateOwnedSkill("Fissure", undefined, { x: 320, y: 250 });
    expect((component as any).blazeFirePatches).toHaveSize(3);
    expect((component as any).blazeFirePatches[0].life).toBeCloseTo(3.2, 5);
    expect((component as any).blazeFirePatches[0].damagePerTick).toBeCloseTo(20 * 0.5, 5);

    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0, resistances: { cold: 0 }, immunities: [] } as any;
    component.enemies = [target];
    (component as any).rebuildEnemyGrid();
    component.activateOwnedSkill("Hurricane");
    expect((component as any).hurricaneRemaining).toBe(12);
    (component as any).updateHurricane(0.6);
    (component as any).flushPendingDamage();
    expect(target.hp).toBeLessThan(1000);
  });

  it("absorbs a flat pool with Cyclone Armor and absorbs it before life", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerHp = 1000;
    (component as any).playerMaxHp = 1000;
    component.ownedSkills = ["Cyclone Armor"];
    component.skillLevels = { "Cyclone Armor": 1 };
    component.equipment.shield = null;
    component.enemies = [];
    (component as any).skillCastCooldowns = {};

    component.activateOwnedSkill("Cyclone Armor");
    expect((component as any).cycloneArmorAbsorptionRemaining).toBe(40);
    // The shield only soaks elemental damage, so the test hit is a fire one.
    expect((component as any).applyIncomingDamage(100, undefined, "melee", "fire")).toBeCloseTo(60, 5);
    expect((component as any).cycloneArmorAbsorptionRemaining).toBe(0);

    // Twister ranks add 7% to the pool.
    component.skillLevels = { "Cyclone Armor": 1, Twister: 2 };
    expect((component as any).cycloneArmorAbsorbForRank(1)).toBe(46);
  });

  it("locks the elemental spells out of wereform, but not Armageddon", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Werewolf", "Firestorm", "Armageddon"];
    component.skillLevels = { Werewolf: 1, Firestorm: 1, Armageddon: 1 };
    (component as any).skillCastCooldowns = {};
    (component as any).playerMana = 500;
    (component as any).playerMaxMana = 500;
    (component as any).firestormTrails.length = 0;
    (component as any).rockShowers.length = 0;

    component.activateOwnedSkill("Werewolf");
    expect((component as any).druidForm).toBe("werewolf");

    component.activateOwnedSkill("Firestorm");
    expect((component as any).firestormTrails).toHaveSize(0);

    component.activateOwnedSkill("Armageddon");
    expect((component as any).rockShowers).toHaveSize(1);
  });

  it("grounds the hero with one cached shadow blit per frame", () => {
    const calls: Array<{ image: unknown; x: number; y: number; w: number; h: number }> = [];
    const ctx = {
      save: jasmine.createSpy("save"),
      restore: jasmine.createSpy("restore"),
      drawImage: (image: unknown, x: number, y: number, w: number, h: number) => calls.push({ image, x, y, w, h }),
    } as any;

    (component as any).projectionCenterY = 350;
    component.drawPlayerShadow(ctx, { x: 200, y: 300 });

    expect(calls).toHaveSize(1);
    const shadow = calls[0];
    expect(shadow.w).toBeGreaterThan(12);
    expect(shadow.h).toBeCloseTo(shadow.w * 0.42, 5);
    expect(shadow.x).toBeCloseTo(200 - shadow.w / 2, 5);
    expect(shadow.y).toBeLessThan(300);

    // Second frame reuses the same raster instead of rebuilding a gradient.
    component.drawPlayerShadow(ctx, { x: 210, y: 300 });
    expect(calls).toHaveSize(2);
    expect(calls[1].image).toBe(calls[0].image);
  });

  it("draws a worn item's sockets over its art, not its slot", () => {
    const helmet = {
      id: "test-socketed-helm", name: "Great Helm", baseName: "Great Helm", rarity: "normal",
      slot: "armor", equipmentType: "helmet", sockets: 2, stats: { armor: 20 },
    } as any;
    const holes = (component as any).socketHoles(helmet);
    expect(holes).toHaveSize(2);

    const placed = (component as any).placeEquipmentSocketHoles(
      holes,
      { left: 100, top: 50, width: 40, height: 30 },
      { left: 90, top: 40 },
    );
    expect(placed).toHaveSize(2);
    expect(placed[0].left).toBeCloseTo(10 + 40 * holes[0].left / 100, 5);
    expect(placed[0].top).toBeCloseTo(10 + 30 * holes[0].top / 100, 5);
    expect(placed[0].size).toBe(9);
    expect(placed[1].left).toBeGreaterThan(placed[0].left);
  });

  it("sockets a rune into a socketed axe and explains when an axe has no holes", () => {
    const rune = {
      id: "test-eld-rune", name: "Eld", baseName: "Eld", rarity: "normal",
      slot: "charm", equipmentType: "rune", stats: {}, affixes: [],
    } as any;
    const socketedAxe = {
      id: "test-socketed-axe", name: "Hand Axe", baseName: "Hand Axe", rarity: "normal",
      slot: "weapon", sockets: 2, stats: { damageMin: 3, damageMax: 6 },
    } as any;
    const plainAxe = {
      id: "test-plain-axe", name: "Consecrated Hand Axe of Blight", baseName: "Hand Axe",
      rarity: "rare", slot: "weapon", stats: { damageMin: 3, damageMax: 8 }, affixes: ["+66% Damage to Undead"],
    } as any;

    (component as any).inventory = [socketedAxe, plainAxe, rune, null];
    (component as any).dragState = { source: "inventory", slotIndex: 2, item: rune };
    (component as any).onInventoryDrop(0, { preventDefault: () => undefined } as DragEvent);
    expect(component.socketedCount(socketedAxe)).toBe(1);
    expect((component as any).inventory[2]).toBeNull();

    // A second rune dropped on a hole-less rare gets a specific message.
    const second = { ...rune, id: "test-eld-rune-2" } as any;
    (component as any).inventory = [plainAxe, second, null, null];
    (component as any).dragState = { source: "inventory", slotIndex: 1, item: second };
    (component as any).onInventoryDrop(0, { preventDefault: () => undefined } as DragEvent);
    expect(component.socketedCount(plainAxe)).toBe(0);
    expect(component.inventoryStatus).toContain("has no sockets");
    expect(component.inventoryStatus).toContain("Gheed's socket reward");
  });

  it("uses the guidebook's druid summoning tables", () => {
    component.selectedClass = "druid";
    component.skillLevels = { Raven: 3, "Summon Spirit Wolf": 5, "Summon Dire Wolf": 3, "Summon Grizzly": 1 };
    const stats = (name: string, rank: number) => (component as any).druidSummonTableStats(name, rank);

    expect(stats("Raven", 3).damage).toBe(5);
    expect(stats("Summon Spirit Wolf", 5).damage).toBe(8.5);
    expect(stats("Summon Spirit Wolf", 5).health).toBe(142);
    expect(stats("Summon Dire Wolf", 3).health).toBe(228);
    expect(stats("Summon Grizzly", 1).health).toBe(1300);
    expect(stats("Summon Grizzly", 1).damage).toBe(70);
    expect(stats("Oak Sage", 1).health).toBe(60);
    expect(stats("Spirit of Barbs", 1).health).toBe(213);

    expect((component as any).summonLimitForSkill("Raven")).toBe(3);
    expect((component as any).summonLimitForSkill("Summon Spirit Wolf")).toBe(5);
    expect((component as any).summonLimitForSkill("Summon Dire Wolf")).toBe(3);
    expect((component as any).summonLimitForSkill("Summon Grizzly")).toBe(1);
  });

  it("keeps one wolf family and one vine at a time", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.enemies = [];
    component.skillLevels = { "Summon Spirit Wolf": 1, "Summon Dire Wolf": 1, "Summon Grizzly": 1, "Poison Creeper": 1, "Carrion Vine": 1 };
    const count = (skill: string) => component.enemies.filter((enemy) => enemy.summonSkill === skill).length;

    (component as any).summonCompanion("Summon Spirit Wolf");
    expect(count("Summon Spirit Wolf")).toBe(1);
    (component as any).summonCompanion("Summon Dire Wolf");
    expect(count("Summon Spirit Wolf")).toBe(0);
    (component as any).summonCompanion("Summon Grizzly");
    expect(count("Summon Dire Wolf")).toBe(0);
    expect(count("Summon Grizzly")).toBe(1);

    (component as any).summonCompanion("Poison Creeper");
    (component as any).summonCompanion("Carrion Vine");
    expect(count("Poison Creeper")).toBe(0);
    expect(count("Carrion Vine")).toBe(1);
  });

  it("gives each raven the guidebook's Hits budget", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.enemies = [];
    component.skillLevels = { Raven: 1 };

    (component as any).summonCompanion("Raven");
    const raven = component.enemies.find((enemy) => enemy.summonSkill === "Raven")!;
    expect(raven.summonHitsRemaining).toBe(12);
    expect((component as any).getSummonRankStats("Raven", 1).join(" "))
      .toContain("Hits before it leaves: 12");

    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250,
      hp: 10_000, maxHp: 10_000, speed: 0, r: 14, dmg: 2,
    } as any;
    spyOn(component as any, "queueEnemyDamage");
    spyOn(Math, "random").and.returnValue(0.99);

    for (let peck = 1; peck <= 11; peck += 1) {
      (component as any).summonAttack(raven, target);
      (component as any).updateSummonAttacks(1000);
      expect(raven.summonHitsRemaining).withContext(`after ${peck} pecks`).toBe(12 - peck);
      expect(raven.hp).toBeGreaterThan(0);
    }

    // The twelfth peck lands, then the raven flies off instead of staying on.
    (component as any).summonAttack(raven, target);
    (component as any).updateSummonAttacks(1000);
    expect(raven.summonHitsRemaining).toBe(0);
    expect(raven.hp).toBe(0);
    expect(component.enemies).not.toContain(raven);
    expect((component as any).activeSummonCount("Raven")).toBe(0);
  });

  it("soaks only fire, cold and lightning in Cyclone Armor", () => {
    component.selectedClass = "druid";
    component.skillLevels = { "Cyclone Armor": 1 };
    (component as any).cycloneArmorRemaining = 10;
    (component as any).cycloneArmorAbsorptionRemaining = 60;
    const pool = () => (component as any).cycloneArmorAbsorptionRemaining;

    // Physical blows reach life and spend none of the shield.
    expect((component as any).applyIncomingDamage(25, undefined, "melee", "physical")).toBeGreaterThan(0);
    expect(pool()).toBe(60);
    // Untyped damage is physical as well.
    expect((component as any).applyIncomingDamage(25)).toBeGreaterThan(0);
    expect(pool()).toBe(60);
    // Poison is not elemental here either.
    expect((component as any).applyIncomingDamage(25, undefined, "area", "poison")).toBeGreaterThan(0);
    expect(pool()).toBe(60);

    // Fire, cold and lightning are absorbed into the pool.
    (component as any).applyIncomingDamage(25, undefined, "melee", "fire");
    expect(pool()).toBeLessThan(60);
    const afterFire = pool();
    (component as any).applyIncomingDamage(25, undefined, "area", "cold");
    expect(pool()).toBeLessThan(afterFire);
    const afterCold = pool();
    (component as any).applyIncomingDamage(25, undefined, "area", "lightning");
    expect(pool()).toBeLessThan(afterCold);

    // The tooltip now promises exactly that.
    const lines = (component as any).getSkillRankStats("Cyclone Armor", "passive", 1).join(" ");
    expect(lines).toContain("fire, cold and lightning");
    expect(lines).toContain("Physical and poison damage pass straight through to life");
  });

  it("relocates a monster wedged by its body, not only by its centre", () => {
    component.playerX = 200;
    component.playerY = 200;
    const context = { clearance: 12 } as any;
    const centre = (component as any).projectArenaPoint(200, 200);
    // Answer the mask probes by their offset from the monster, in body radii.
    const blocked = new Set<string>();
    const probe = spyOn(component as any, "campaignBlockedAt").and.callFake((_context: any, x: number, y: number) => {
      const key = `${Math.round((x - centre.x) / 12)},${Math.round((y - centre.y) / 12)}`;
      return blocked.has(key);
    });
    const clearSpawn = spyOn(component as any, "campaignClearSpawnPoint").and.returnValue({ x: 777, y: 888 });
    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 200, y: 200,
      hp: 10, maxHp: 10, speed: 0, r: 14, dmg: 2,
    } as any;

    // Clear ground: the centre plus four shoulders, so at most five reads, and
    // no relocation.
    (component as any).campaignRelocateEnemyOutOfScenery(context, enemy);
    expect(clearSpawn).not.toHaveBeenCalled();
    expect(probe.calls.count()).toBe(5);

    // A single shoulder through a doorway is a squeeze, not a wedge.
    blocked.add("1,0");
    probe.calls.reset();
    (component as any).campaignRelocateEnemyOutOfScenery(context, enemy);
    expect(clearSpawn).not.toHaveBeenCalled();
    expect(probe.calls.count()).toBe(5);

    // Both shoulders inside scenery: the body is wedged and gets pulled clear.
    blocked.add("-1,0");
    probe.calls.reset();
    (component as any).campaignRelocateEnemyOutOfScenery(context, enemy);
    expect(clearSpawn).toHaveBeenCalled();
    expect(enemy.x).toBe(777);
    expect(enemy.y).toBe(888);
    // It stops at the second shoulder instead of reading all four.
    expect(probe.calls.count()).toBeLessThanOrEqual(3);

    // A blocked centre still relocates on its own, with a single read.
    enemy.x = 200;
    enemy.y = 200;
    blocked.clear();
    blocked.add("0,0");
    probe.calls.reset();
    (component as any).campaignRelocateEnemyOutOfScenery(context, enemy);
    expect(enemy.x).toBe(777);
    expect(probe.calls.count()).toBe(1);
  });

  it("locks elemental spells in wereform but keeps Armageddon castable", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 1000;
    component.playerMaxMana = 1000;
    component.ownedSkills = ["Tornado", "Armageddon", "Hurricane"];
    component.skillLevels = { Tornado: 1, Armageddon: 1, Hurricane: 1 };
    // Hurricane aims at a body, so the test needs one standing nearby.
    component.enemies = [{
      kind: "normal", species: "fallen", spriteFrame: 0, x: 330, y: 250,
      hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2,
    } as any];
    component.attackProjectiles = [];
    (component as any).skillCastCooldowns = {};
    (component as any).rockShowers = [];

    // Human hands: the elemental tree casts.
    component.activateOwnedSkill("Hurricane");
    expect((component as any).hurricaneRemaining).toBeGreaterThan(0);

    // Werewolf: the same cast is refused, and the slot says why.
    (component as any).druidForm = "werewolf";
    (component as any).hurricaneRemaining = 0;
    (component as any).skillCastCooldowns = {};
    expect((component as any).canBasicAttackCastSpell("Tornado")).toBeFalse();
    expect(component.getSkillRequirementLabel("Tornado")).toBe("Cannot be cast in Werewolf or Werebear form");
    component.activateOwnedSkill("Hurricane");
    expect((component as any).hurricaneRemaining).toBe(0);

    // Armageddon is the guide's stated exception.
    expect((component as any).canBasicAttackCastSpell("Armageddon")).toBeTrue();
    expect(component.getSkillRequirementLabel("Armageddon")).toBe("");
    component.activateOwnedSkill("Armageddon");
    expect((component as any).rockShowers).toHaveSize(1);
    expect(((component as any).getSkillRankStats("Armageddon", "burst", 1) as string[]).join(" "))
      .toContain("still casts in Werewolf and Werebear form");

    // Werebear follows the same rule, and leaving the form restores the spell.
    (component as any).druidForm = "werebear";
    (component as any).hurricaneRemaining = 0;
    (component as any).skillCastCooldowns = {};
    component.activateOwnedSkill("Hurricane");
    expect((component as any).hurricaneRemaining).toBe(0);
    (component as any).druidForm = null;
    (component as any).skillCastCooldowns = {};
    component.activateOwnedSkill("Hurricane");
    expect((component as any).hurricaneRemaining).toBeGreaterThan(0);

    // The form's own tooltip states the rule and its exception.
    expect(((component as any).getSkillRankStats("Werewolf", "movement", 1) as string[]).join(" "))
      .toContain("Armageddon is the only exception");
  });

  it("gives Spirit Wolf's attack rating and defense to the wolves and grizzly", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.enemies = [];
    component.floatingTexts = [];
    component.skillLevels = { "Summon Spirit Wolf": 1 };

    (component as any).summonCompanion("Summon Spirit Wolf");
    const wolf = component.enemies.find((enemy) => enemy.summonSkill === "Summon Spirit Wolf")!;
    expect(wolf.summonAttackRatingPercent).toBe(50);
    expect(wolf.summonDefensePercent).toBe(50);

    // The tooltip says what those numbers do instead of leaving them abstract.
    const tooltip = (component as any).getSummonRankStats("Summon Spirit Wolf", 1).join(" ");
    expect(tooltip).toContain("3% critical strike");
    expect(tooltip).toContain("9% of the blows");

    // Attack rating lands as critical weight: 50% reads as 2.5% critical strike.
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250,
      hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 2,
    } as any;
    const blows: number[] = [];
    spyOn(component as any, "queueEnemyDamage").and.callFake((_enemy: any, damage: number) => blows.push(damage));
    spyOn(Math, "random").and.returnValue(0); // both rolls come up a hit
    wolf.dmg = 20;
    (component as any).summonAttack(wolf, target);
    (component as any).updateSummonAttacks(1000);
    expect(blows).toEqual([40]);

    // Defense lands as a chance to avoid: 50% reads as 9% of blows slipping off.
    const fullHp = wolf.hp;
    expect((component as any).damageSummon(wolf, 30)).toBe(0);
    expect(wolf.hp).toBe(fullHp);
    expect(component.floatingTexts.some((entry) => entry.text === "MISS")).toBeTrue();

    // Without the passive the same wolf is a plain attacker again.
    wolf.summonAttackRatingPercent = undefined;
    wolf.summonDefensePercent = undefined;
    (component as any).summonAttack(wolf, target);
    blows.length = 0;
    (component as any).updateSummonAttacks(1000);
    expect(blows).toEqual([20]);
    expect((component as any).damageSummon(wolf, 30)).toBe(30);

    // The grizzly takes the same passive from the same Spirit Wolf rank.
    (component as any).summonCompanion("Summon Grizzly");
    const bear = component.enemies.find((enemy) => enemy.summonSkill === "Summon Grizzly")!;
    expect(bear.summonAttackRatingPercent).toBe(50);
    expect(bear.summonDefensePercent).toBe(50);
  });

  it("gives Heart of Wolverine's damage and Spirit of Barbs' reflection", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.enemies = [];
    component.skillLevels = { Firestorm: 1, "Heart of Wolverine": 1, "Spirit of Barbs": 1 };
    const plain = (component as any).skillCastDamage("Firestorm");
    (component as any).summonCompanion("Heart of Wolverine");
    expect((component as any).skillCastDamage("Firestorm") / plain).toBeCloseTo(1.2, 5);

    (component as any).summonCompanion("Spirit of Barbs");
    expect(component.enemies.filter((enemy) => enemy.summonSkill === "Heart of Wolverine")).toHaveSize(0);
    expect((component as any).spiritOfBarbsReflectPercent()).toBe(50);

    const attacker = { kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 10, resistances: { cold: 0 }, immunities: [] } as any;
    component.enemies.push(attacker);
    component.equipment.shield = null;
    (component as any).playerHp = 1000;
    (component as any).playerMaxMana = 500;
    (component as any).rebuildEnemyGrid();
    spyOn(Math, "random").and.returnValue(0.99);
    (component as any).applyIncomingDamage(100, attacker);
    (component as any).flushPendingDamage();
    expect(attacker.hp).toBeCloseTo(950, 5);
  });

  it("charges the orb for every cast and refuses one the pool cannot cover", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMaxMana = 35;
    component.playerMana = 35;
    component.ownedSkills = ["Ice Bolt"];
    component.skillLevels = { "Ice Bolt": 1 };
    component.enemies = [
      { kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250, hp: 500, maxHp: 500, speed: 0, r: 14, dmg: 1 } as any,
    ];
    component.attackProjectiles = [];
    component.floatingTexts = [];

    component.activateOwnedSkill("Ice Bolt");
    expect(component.attackProjectiles.length).toBe(1);
    expect(component.playerMana).toBe(30);

    // D2 charges up front: a bolt the orb cannot pay for never leaves the hand.
    component.playerMana = 4;
    (component as any).skillCastCooldowns = {};
    component.activateOwnedSkill("Ice Bolt");
    expect(component.attackProjectiles.length).toBe(1);
    expect(component.playerMana).toBe(4);
    expect(component.floatingTexts.some((entry) => entry.text.includes("NOT ENOUGH MANA"))).toBeTrue();
  });

  it("prices every class's actives and leaves passives, auras and Magic Arrow free", () => {
    component.selectedClass = "sorceress";
    expect(component.skillManaCost("Ice Bolt")).toBe(5);
    expect(component.skillManaCost("Meteor")).toBe(20);
    // Warmth is a passive and Teleport is a real cast, even though both are
    // listed as passive escapes in the skill data.
    expect(component.skillManaCost("Warmth")).toBe(0);
    expect(component.skillManaCost("Teleport")).toBe(24);

    component.selectedClass = "paladin";
    expect(component.skillManaCost("Might")).toBe(0);
    expect(component.skillManaCost("Holy Bolt")).toBe(5);

    component.selectedClass = "amazon";
    expect(component.skillManaCost("Magic Arrow")).toBe(0);
    expect(component.skillManaCost("Strafe")).toBe(12);

    component.selectedClass = "barbarian";
    expect(component.skillManaCost("Whirlwind")).toBe(12);

    component.selectedClass = "necromancer";
    expect(component.skillManaCost("Raise Skeleton")).toBe(9);

    component.selectedClass = "druid";
    expect(component.skillManaCost("Shock Wave")).toBe(12);

    component.selectedClass = "assassin";
    expect(component.skillManaCost("Phoenix Strike")).toBe(6);
  });

  it("does not bill a cast the hero's state turns into nothing", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.playerMaxMana = 100;
    component.playerMana = 100;
    component.ownedSkills = ["Cyclone Armor"];
    component.skillLevels = { "Cyclone Armor": 1 };

    component.activateOwnedSkill("Cyclone Armor");
    expect(component.playerMana).toBe(90);

    // The armor is already up, so the second click is free and stays refused.
    component.activateOwnedSkill("Cyclone Armor");
    expect(component.playerMana).toBe(90);
  });

  it("refills the orb on its own, faster with Warmth and never past the maximum", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerMaxMana = 100;
    component.playerMana = 0;

    // An empty orb refills over two minutes whatever its size.
    (component as any).updateManaRegeneration(120);
    expect(component.playerMana).toBeCloseTo(100, 5);

    component.playerMana = 0;
    component.skillLevels = { Warmth: 1 };
    (component as any).updateManaRegeneration(1);
    expect(component.playerMana).toBeCloseTo(100 / 120 * 1.3, 5);

    component.playerMana = 99;
    (component as any).updateManaRegeneration(60);
    expect(component.playerMana).toBe(100);
  });

  it("refills both life and mana with a full rejuvenation potion", () => {
    component.beltSlots = Array.from({ length: 16 }, () => ({ kind: null as "health" | "rejuvenation" | null }));
    component.beltSlots[0] = { kind: "rejuvenation" };
    component.playerMaxHp = 800;
    component.playerHp = 10;
    component.playerMaxMana = 60;
    component.playerMana = 2;
    spyOn(component as any, "persistRunProgress");

    component.drinkBeltPotion(0);

    expect(component.playerHp).toBe(component.effectivePlayerMaxHp);
    expect(component.playerMana).toBe(component.effectivePlayerMaxMana);
    expect(component.beltSlots[0].kind).toBeNull();
  });

  it("charges the sorceress for a teleport like any other cast", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerMaxMana = 30;
    component.playerMana = 30;
    component.ownedSkills = ["Teleport"];
    component.skillLevels = { Teleport: 1 };

    component.activateOwnedSkill("Teleport", undefined, { x: 400, y: 250 });

    expect(component.playerMana).toBe(6);
  });

  it("prices the sorceress lightning tree per rank", () => {
    component.selectedClass = "sorceress";
    const costAt = (skill: string, rank: number) => {
      component.skillLevels = { [skill]: rank };
      return component.skillManaCost(skill);
    };

    // Charged Bolt climbs from 3 to 12 across the twenty ranks.
    expect(costAt("Charged Bolt", 1)).toBe(3);
    expect(costAt("Charged Bolt", 9)).toBe(7);
    expect(costAt("Charged Bolt", 10)).toBe(7.5);
    expect(costAt("Charged Bolt", 20)).toBe(12);
    // Teleport runs the other way: 24 down to 5.
    expect(costAt("Teleport", 1)).toBe(24);
    expect(costAt("Teleport", 20)).toBe(5);
    // Lightning adds half a point a rank, Nova and Chain Lightning a whole one.
    expect(costAt("Lightning", 1)).toBe(8);
    expect(costAt("Lightning", 20)).toBe(17);
    expect(costAt("Nova", 1)).toBe(15);
    expect(costAt("Nova", 20)).toBe(34);
    expect(costAt("Chain Lightning", 1)).toBe(9);
    expect(costAt("Chain Lightning", 20)).toBe(28);
    // These four charge the same at every rank.
    expect(costAt("Static Field", 1)).toBe(9);
    expect(costAt("Static Field", 20)).toBe(9);
    expect(costAt("Telekinesis", 1)).toBe(7);
    expect(costAt("Thunder Storm", 1)).toBe(19);
    expect(costAt("Thunder Storm", 20)).toBe(19);
    expect(costAt("Energy Shield", 1)).toBe(5);
    expect(costAt("Energy Shield", 20)).toBe(5);

    // A non-sorceress keeps the flat prices from the shared table.
    component.selectedClass = "barbarian";
    component.skillLevels = { Teleport: 20 };
    expect(component.skillManaCost("Teleport")).toBe(24);
  });

  it("refuses a lightning cast the orb cannot cover", () => {
    component.selectedClass = "sorceress";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Bolt"];
    component.skillLevels = { "Charged Bolt": 10 };
    const target = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 400, y: 250,
      hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).skillCastCooldowns = {};

    // Rank 10 asks 7.5, so 7 mana is a dry orb: no cast, no cooldown, no charge.
    component.playerMaxMana = 100;
    component.playerMana = 7;
    component.activateOwnedSkill("Charged Bolt", target);
    expect(component.attackProjectiles).toHaveSize(0);
    expect(component.playerMana).toBe(7);
    expect((component as any).skillCastCooldowns["Charged Bolt"] ?? 0).toBe(0);

    // One more point of mana pays for it, and only the exact price leaves the orb.
    component.playerMana = 8;
    component.activateOwnedSkill("Charged Bolt", target);
    expect(component.attackProjectiles.length).toBeGreaterThan(0);
    expect(component.playerMana).toBeCloseTo(0.5, 5);
  });

  it("hands out five attribute points per level and spends them on demand", () => {
    component.playerLevel = 1;
    expect(component.attributePointsRemaining).toBe(0);

    component.playerLevel = 2;
    expect(component.attributePointsEarned).toBe(5);
    expect(component.attributePointsRemaining).toBe(5);

    component.spendAttributePoint("strength");
    expect(component.spentAttributes[0]).toBe(1);
    expect(component.attributePointsRemaining).toBe(4);
    expect(component.attributeStrength).toBe(component.attributeBaseValue(0) + component.equippedStrengthBonus);

    // Back at level 1 the same point is not available any more.
    component.playerLevel = 1;
    expect(component.attributePointsRemaining).toBe(0);
    component.spendAttributePoint("strength");
    expect(component.spentAttributes[0]).toBe(1);
  });

  it("credits the level-up with both skill and attribute points", () => {
    component.runActive = true;
    component.playerLevel = 1;
    component.playerXp = 0;
    component.xpToNextLevel = (component as any).xpForLevel(1);

    (component as any).grantExperience(component.xpToNextLevel);

    expect(component.playerLevel).toBe(2);
    expect(component.skillPoints).toBe(1);
    expect(component.attributePointsRemaining).toBe(5);
    expect(component.levelUpNotice).toContain("attribute point");
  });

  it("turns placed points into melee damage, attack rating, life and mana", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerLevel = 3;
    component.playerMaxHp = 400;
    component.playerMaxMana = 20;

    const meleeBefore = (component as any).applyStrengthToMeleeDamage(100);
    const ratingBefore = component.inventoryAttackRating;
    const lifeBefore = component.effectivePlayerMaxHp;
    const manaBefore = component.effectivePlayerMaxMana;

    for (let point = 0; point < 3; point += 1) component.spendAttributePoint("strength");
    for (let point = 0; point < 2; point += 1) component.spendAttributePoint("dexterity");
    for (let point = 0; point < 3; point += 1) component.spendAttributePoint("vitality");
    for (let point = 0; point < 2; point += 1) component.spendAttributePoint("energy");

    expect(component.attributePointsRemaining).toBe(0);
    // Strength is 1% melee damage a point, Dexterity 5 Attack Rating, and the
    // Barbarian's table pays 4 Life a Vitality and 1 Mana an Energy. Energy is
    // also 1% spell damage a point.
    expect((component as any).applyStrengthToMeleeDamage(100)).toBeCloseTo(meleeBefore + 3, 5);
    expect(component.inventoryAttackRating).toBe(ratingBefore + 10);
    expect(component.effectivePlayerMaxHp).toBe(lifeBefore + 12);
    expect(component.effectivePlayerMaxMana).toBe(manaBefore + 2);
    expect((component as any).applyEnergyToSpellDamage(100)).toBeCloseTo(102, 5);
  });

  it("grows Life and Mana by the class's fixed D2 table each level", () => {
    // Four level-ups for the Amazon: +2 Life and +1.5 Mana a level.
    component.selectedClass = "amazon";
    component.playerLevel = 5;
    expect(component.levelLifeBonus).toBe(8);
    expect(component.levelManaBonus).toBe(6);

    // Fractions count: two levels of +1.5 Mana are exactly 3, no rounding drift.
    component.playerLevel = 3;
    expect(component.levelLifeBonus).toBe(4);
    expect(component.levelManaBonus).toBe(3);

    // The Sorceress trades Life for Mana; a Barbarian Vitality point is 4 Life.
    component.selectedClass = "sorceress";
    expect(component.levelLifeBonus).toBe(2);
    expect(component.levelManaBonus).toBe(4);
    component.selectedClass = "barbarian";
    component.spentAttributes = [0, 0, 1, 0];
    expect(component.attributePointLifeBonus).toBe(4);
    expect(component.attributePointManaBonus).toBe(0);
  });

  it("adds Life from worn Vitality outside the +% maximum Life effects", () => {
    component.selectedClass = "sorceress";
    component.playerLevel = 1;
    component.playerMaxHp = 400;
    component.playerMaxMana = 100;
    component.equipment = {
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    } as any;
    component.equipment.amulet = {
      id: "gold-amulet", name: "Gold Amulet", slot: "charm", equipmentType: "amulet",
      stats: { plusVitality: 10, plusEnergy: 10 },
    } as any;

    // The Sorceress's table: 2 Life a Vitality, 2 Mana an Energy.
    expect(component.equippedVitalityLifeBonus).toBe(20);
    expect(component.equippedEnergyManaBonus).toBe(20);
    expect(component.effectivePlayerMaxHp).toBe(420);
    expect(component.effectivePlayerMaxMana).toBe(120);
  });

  it("keeps worn gear inert until its requirements are met", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerLevel = 1;
    component.equipment = {
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    } as any;
    // A barbarian starts at 30 Strength; this plate asks for 32.
    component.equipment.body = {
      id: "field-plate", name: "Field Plate", baseName: "Field Plate", slot: "armor",
      equipmentType: "body", requiredLevel: 1, stats: { armor: 100, requiresStrength: 32 },
    } as any;

    expect(component.equippedArmor).toBe(0);
    expect(component.equipmentSlotRequirementsUnmet("body")).toBeTrue();

    component.playerLevel = 2;
    component.spendAttributePoint("strength");
    expect(component.attributeStrength).toBe(31);
    expect(component.equippedArmor).toBe(0);

    component.spendAttributePoint("strength");
    expect(component.attributeStrength).toBe(32);
    expect(component.equippedArmor).toBe(100);
    expect(component.equipmentSlotRequirementsUnmet("body")).toBeFalse();

    // The level requirement gates the same way.
    component.equipment.body = null;
    component.equipment.helmet = {
      id: "great-helm", name: "Great Helm", baseName: "Great Helm", slot: "armor",
      equipmentType: "helmet", requiredLevel: 5, stats: { armor: 20 },
    } as any;
    expect(component.equippedArmor).toBe(0);
    component.playerLevel = 5;
    expect(component.equippedArmor).toBe(20);
  });

  it("lets wearable gear's Strength lift a heavier piece, never the piece's own", () => {
    component.selectedClass = "barbarian";
    component.runActive = true;
    component.playerLevel = 1;
    component.equipment = {
      weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null,
      ringRight: null, gloves: null, body: null, boots: null, belt: null,
    } as any;
    component.equipment.body = {
      id: "heavy-plate", name: "Ancient Armor", baseName: "Ancient Armor", slot: "armor",
      equipmentType: "body", requiredLevel: 1,
      stats: { armor: 100, requiresStrength: 32, plusStrength: 10 },
    } as any;

    // Its own +10 Strength cannot lift it, so it stays inert at 30 Strength.
    expect(component.equippedArmor).toBe(0);

    component.equipment.ringLeft = {
      id: "plain-ring", name: "Ring", baseName: "Ring", slot: "armor",
      equipmentType: "ring", stats: { plusStrength: 2 },
    } as any;

    // Another piece's +2 takes the hero to exactly 32 and the plate wakes up.
    expect(component.equippedArmor).toBe(100);
    expect(component.equipmentSlotRequirementsUnmet("body")).toBeFalse();
    // 30 class Strength + the ring's 2 + the plate's own 10 once it is on.
    expect(component.attributeStrength).toBe(42);

    component.equipment.ringLeft = null;
    expect(component.equippedArmor).toBe(0);
  });

  it("heals with Carrion Vine's corpses and speeds Solar Creeper's mana", () => {
    component.selectedClass = "druid";
    component.runActive = true;
    component.enemies = [];
    component.skillLevels = { "Carrion Vine": 1, "Solar Creeper": 1 };
    (component as any).playerMaxHp = 1000;
    (component as any).playerHp = 500;
    (component as any).playerMaxMana = 1000;
    (component as any).playerMana = 0;

    (component as any).summonCompanion("Carrion Vine");
    const victim = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 250, hp: 10, maxHp: 10, speed: 0, r: 14, dmg: 1, resistances: { cold: 0 }, immunities: [] } as any;
    component.enemies.push(victim);
    (component as any).queueEnemyDamage(victim, 9999);
    (component as any).flushPendingDamage();
    expect((component as any).playerHp).toBeCloseTo(540, 5);

    (component as any).summonCompanion("Solar Creeper");
    expect(component.enemies.filter((enemy) => enemy.summonSkill === "Carrion Vine")).toHaveSize(0);
    // A rank 1 Solar Creeper adds 2% to the two-minute refill's rate.
    (component as any).updateManaRegeneration(1);
    expect((component as any).playerMana).toBeCloseTo(1000 / 120 * 1.02, 5);
  });

  it("applies the curse tables to radius, duration and resistances", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Amplify Damage", "Decrepify", "Lower Resist", "Dim Vision", "Terror"];
    component.skillLevels = { "Amplify Damage": 1, Decrepify: 1, "Lower Resist": 1, "Dim Vision": 1, Terror: 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 10_000, maxHp: 10_000, speed: 100, r: 14, dmg: 20, resists: {} } as any;
    const boss = { kind: "boss", species: "andariel", spriteFrame: 0, x: 310, y: 250, hp: 10_000, maxHp: 10_000, speed: 100, r: 20, dmg: 40 } as any;
    component.enemies = [target, boss];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Amplify Damage");
    expect(target.curseName).toBe("Amplify Damage");
    expect(target.curseRemaining).toBe(8);
    // 100 physical resistance stripped: the physical multiplier doubles.
    expect((component as any).enemyResistanceMultiplier(target, "physical")).toBeCloseTo(2, 5);
    // And it works on bosses, unlike the blinding curses.
    expect(boss.curseName).toBe("Amplify Damage");

    component.activateOwnedSkill("Lower Resist");
    expect((component as any).enemyResistanceMultiplier(target, "fire")).toBeCloseTo(1.31, 5);

    component.activateOwnedSkill("Decrepify");
    // Decrepify halves the monster's speed and adds 50 to its physical exposure.
    expect((component as any).enemyMoveSpeed(target)).toBeCloseTo(50, 5);
    expect((component as any).enemyResistanceMultiplier(target, "physical")).toBeCloseTo(1.5, 5);

    component.activateOwnedSkill("Dim Vision");
    expect(target.curseName).toBe("Dim Vision");
    // Decrepify reaches bosses; the blinding curse just cast did not.
    expect(boss.curseName).toBe("Decrepify");
  });

  it("returns Iron Maiden blows and heals with Life Tap", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Iron Maiden", "Life Tap"];
    component.skillLevels = { "Iron Maiden": 1, "Life Tap": 1 };
    component.playerHp = 100;
    (component as any).playerMaxHp = 1000;
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 20 } as any;
    component.enemies = [target];
    (component as any).rebuildEnemyGrid();

    component.activateOwnedSkill("Iron Maiden");
    expect(target.curseName).toBe("Iron Maiden");
    expect(target.curseRemaining).toBe(12);
    expect((component as any).getSkillRankStats("Iron Maiden", "curse", 1))
      .toContain("Returns 200% of the melee damage it deals, as physical damage");

    component.activateOwnedSkill("Life Tap");
    const before = component.playerHp;
    (component as any).queueEnemyDamage(target, 100, "#ef6476", "physical");
    (component as any).flushPendingDamage();
    expect(component.playerHp).toBeGreaterThan(before);
  });

  it("fires the guidebook's teeth and adds their bone synergies", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Teeth", "Bone Wall", "Bone Spear"];
    component.skillLevels = { Teeth: 1, "Bone Wall": 1, "Bone Spear": 1 };
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 520, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any];
    (component as any).rebuildEnemyGrid();
    component.attackProjectiles = [];

    component.activateOwnedSkill("Teeth");
    // Two teeth at rank one, each 3 magic raised 15% by Bone Wall and Bone Spear.
    expect(component.attackProjectiles.length).toBe(2);
    expect(component.attackProjectiles[0].damage).toBeGreaterThan(0);
    expect((component as any).necromancerBoneDamage("Teeth")).toBeCloseTo(3 * 1.3, 5);

    component.skillLevels = { Teeth: 20, "Bone Wall": 1, "Bone Spear": 1 };
    component.attackProjectiles = [];
    component.activateOwnedSkill("Teeth");
    expect(component.attackProjectiles.length).toBe(21);
  });

  it("absorbs with Bone Armor, rings a Bone Prison and blasts corpses", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Bone Armor", "Bone Wall", "Bone Prison", "Corpse Explosion", "Poison Nova"];
    component.skillLevels = { "Bone Armor": 1, "Bone Wall": 2, "Bone Prison": 1, "Corpse Explosion": 1, "Poison Nova": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 320, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];

    (component as any).boneArmorAbsorptionRemaining = 0;
    component.activateOwnedSkill("Bone Armor");
    // 20 from the table, plus 15 a rank of Bone Wall and Bone Prison.
    expect((component as any).boneArmorAbsorptionRemaining).toBe(20 + 15 * 2 + 15);

    expect((component as any).corpseExplosionRadiusForRank(1)).toBeCloseTo(52, 5);
    expect((component as any).necromancerBoneDamage("Poison Nova")).toBeCloseTo(72.5, 5);

    component.activateOwnedSkill("Bone Prison");
    const cage = component.attackProjectiles.find((projectile: any) => projectile.bonePrison)!;
    expect(cage).toBeTruthy();
    expect(cage.life).toBe(24);
    expect(cage.wallHealth).toBe(Math.round(22 * 8 * (1 + 0.08 * (1 + 2))));
    expect(target.bonePrisonRemaining).toBe(24);

    (component as any).rebuildEnemyGrid();
    (component as any).updateAttackProjectiles(16);
    expect(target.stunRemaining).toBeGreaterThan(0);
  });

  it("gives the bone cage real life that pinned monsters break", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Bone Prison"];
    component.skillLevels = { "Bone Prison": 1 };
    const prisoner = { kind: "normal", species: "fallen", spriteFrame: 0, x: 320, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 30 } as any;
    const outsider = { kind: "normal", species: "fallen", spriteFrame: 0, x: 700, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 30 } as any;
    component.enemies = [prisoner, outsider];
    component.attackProjectiles = [];

    expect((component as any).getSkillRankStats("Bone Prison", "burst", 1))
      .toContain("Cage life 176, holds for 24s");

    component.activateOwnedSkill("Bone Prison");
    const cage: any = component.attackProjectiles.find((projectile: any) => projectile.bonePrison)!;
    expect(cage.wallHealth).toBe(176);
    expect(cage.wallMaxHealth).toBe(176);

    // One second of hammering costs the cage the prisoner's damage.
    (component as any).rebuildEnemyGrid();
    (component as any).updateAttackProjectiles(1000);
    expect(cage.wallHealth).toBe(146);
    expect(prisoner.stunRemaining).toBeGreaterThan(0);

    // It falls after six blows: 176 / 30.
    for (let step = 0; step < 8 && cage.wallHealth > 0; step += 1) {
      (component as any).rebuildEnemyGrid();
      (component as any).updateAttackProjectiles(1000);
    }
    expect(cage.wallHealth).toBe(0);
    expect(cage.life).toBe(0);
    expect(prisoner.bonePrisonRemaining).toBe(0);
    expect(prisoner.stunRemaining).toBe(0);
    // A monster beyond the ring never touched it.
    expect(outsider.bonePrisonRemaining).toBeUndefined();
  });

  it("raises the guidebook's skeletons and applies Skeleton Mastery after base life", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Raise Skeleton", "Skeleton Mastery", "Skeletal Mage", "Summon Resist"];
    component.skillLevels = { "Raise Skeleton": 1, "Skeleton Mastery": 1, "Skeletal Mage": 1, "Summon Resist": 1 };
    component.enemies = [];

    component.activateOwnedSkill("Raise Skeleton");
    const skeleton = component.enemies.find((enemy: any) => enemy.summonSkill === "Raise Skeleton")!;
    expect(skeleton).toBeTruthy();
    expect(skeleton.maxHp).toBeGreaterThanOrEqual(21 + 8);
    expect(skeleton.dmg).toBe(4);
    expect(skeleton.summonResistPercent).toBe(28);
    expect((component as any).summonLimitForSkill("Raise Skeleton")).toBe(1);

    component.skillLevels = { "Raise Skeleton": 3, "Skeleton Mastery": 1, "Skeletal Mage": 1, "Summon Resist": 1 };
    expect((component as any).summonLimitForSkill("Raise Skeleton")).toBe(3);

    component.activateOwnedSkill("Skeletal Mage");
    const mage = component.enemies.find((enemy: any) => enemy.summonSkill === "Skeletal Mage")!;
    expect(mage.maxHp).toBeGreaterThanOrEqual(61 + 8);
  });

  it("builds the golems and revives with the guidebook's tables", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 5000;
    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Iron Golem", "Fire Golem", "Revive", "Skeleton Mastery"];
    component.skillLevels = { "Clay Golem": 1, "Golem Mastery": 1, "Iron Golem": 1, "Fire Golem": 1, Revive: 2, "Skeleton Mastery": 2 };
    component.enemies = [];

    // Only the best golem skill the hero owns can be cast, so each one is
    // summoned before the next is learned.
    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Skeleton Mastery"];
    component.activateOwnedSkill("Clay Golem");
    const clay = component.enemies.find((enemy: any) => enemy.summonSkill === "Clay Golem")!;
    expect(clay.maxHp).toBeGreaterThanOrEqual(120);
    expect(clay.dmg).toBe(4);
    expect(clay.summonSlowPercent).toBe(11);

    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Iron Golem", "Skeleton Mastery"];
    component.activateOwnedSkill("Iron Golem");
    // A new golem replaces the old one, never joining it.
    expect(component.enemies.filter((enemy: any) => enemy.summonType === "golem").length).toBe(1);
    const iron = component.enemies.find((enemy: any) => enemy.summonSkill === "Iron Golem")!;
    expect(iron.summonThornsPercent).toBe(150);
    expect(iron.maxHp).toBeGreaterThanOrEqual(321);

    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Iron Golem", "Fire Golem", "Skeleton Mastery"];
    component.activateOwnedSkill("Fire Golem");
    const fire = component.enemies.find((enemy: any) => enemy.summonSkill === "Fire Golem")!;
    expect(fire.dmg).toBe(67);
    expect(fire.summonFireAbsorbPercent).toBe(36);

    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Iron Golem", "Fire Golem", "Revive", "Skeleton Mastery"];
    component.activateOwnedSkill("Revive");
    const revive = component.enemies.find((enemy: any) => enemy.summonSkill === "Revive")!;
    expect(revive.summonExpireSeconds).toBe(180);
    expect(revive.maxHp).toBeGreaterThanOrEqual(480);
    expect((component as any).summonLimitForSkill("Revive")).toBe(2);
  });

  it("puts the golem mechanics into combat: slow, holy fire, fire absorb and the 70/30 share", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 5000;
    component.playerHp = 100;
    component.playerMaxHp = 500;
    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Blood Golem", "Fire Golem", "Iron Golem"];
    component.skillLevels = { "Clay Golem": 1, "Golem Mastery": 1, "Blood Golem": 1, "Fire Golem": 1, "Iron Golem": 1 };
    component.enemies = [];
    const monster = (x: number): any => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y: 250,
      hp: 100_000, maxHp: 100_000, speed: 100, r: 14, dmg: 2,
    });

    // Clay Golem: Slows Target on its own blows, and on a monster that strikes it.
    component.ownedSkills = ["Clay Golem", "Golem Mastery"];
    component.activateOwnedSkill("Clay Golem");
    const clay = component.enemies.find((enemy: any) => enemy.summonSkill === "Clay Golem")!;
    const victim = monster(300);
    component.enemies.push(victim);
    (component as any).summonAttackEffects = [];
    (component as any).summonAttack(clay, victim);
    (component as any).updateSummonAttacks(1000);
    expect(victim.golemSlowPercent).withContext("rank 1 slows 11%").toBe(11);
    expect(victim.golemSlowRemaining).toBe(30);
    // Slows Target drags velocity and attack rate by the same percentage.
    expect((component as any).enemyMoveSpeed(victim)).toBeCloseTo(89, 5);
    expect((component as any).enemyCooldownStep(victim, 1)).toBeCloseTo(0.89, 5);
    const biter = monster(320);
    (component as any).damageSummon(clay, 10, "physical", biter);
    expect(biter.golemSlowPercent).withContext("striking the golem slows the attacker").toBe(11);

    // Fire Golem: Holy Fire burns everything around it once a second.
    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Blood Golem", "Fire Golem", "Iron Golem"];
    component.activateOwnedSkill("Fire Golem");
    const fire = component.enemies.find((enemy: any) => enemy.summonSkill === "Fire Golem")!;
    fire.x = 250;
    fire.y = 250;
    const scorched = monster(290);
    component.enemies.push(scorched);
    (component as any).updateFireGolemHolyFire(fire, 1);
    (component as any).flushPendingDamage();
    // Rank 1 Holy Fire is 5 radial fire damage.
    expect(100_000 - scorched.hp).withContext("the aura burns monsters in reach").toBeCloseTo(5, 5);
    const outOfReach = monster(560);
    component.enemies.push(outOfReach);
    (component as any).updateFireGolemHolyFire(fire, 1);
    (component as any).flushPendingDamage();
    expect(outOfReach.hp).withContext("and only those in reach").toBe(100_000);

    // Fire absorb turns part of the fire that reaches the golem back into life,
    // capped at the guidebook's 40% for summons.
    fire.hp = 50;
    (component as any).damageSummon(fire, 100, "fire");
    expect(fire.hp).withContext("rank 1 absorbs 36, takes 64").toBeCloseTo(22, 5);
    // The column runs to 88%, but the guidebook caps a summon's absorb at 40%.
    fire.summonFireAbsorbPercent = 88;
    fire.hp = 50;
    (component as any).damageSummon(fire, 100, "fire");
    expect(fire.hp).withContext("the absorb is capped, so the golem still burns").toBeCloseTo(30, 5);
    fire.hp = 50;
    (component as any).damageSummon(fire, 100, "physical");
    expect(fire.hp).withContext("physical damage gets no absorb").toBeCloseTo(-50, 5);

    // Blood Golem: 86% of its damage comes back as life, 70% to the golem and
    // 30% to the necromancer. Only the best golem skill owned can be cast, so the
    // higher golems are dropped from the book for this part.
    component.ownedSkills = ["Clay Golem", "Golem Mastery", "Blood Golem"];
    component.activateOwnedSkill("Blood Golem");
    const blood = component.enemies.find((enemy: any) => enemy.summonSkill === "Blood Golem")!;
    const meal = monster(300);
    component.enemies.push(meal);
    blood.hp = 20;
    (component as any).summonAttackEffects = [];
    (component as any).summonAttack(blood, meal);
    (component as any).updateSummonAttacks(1000);
    const leech = blood.dmg * 0.86;
    expect(blood.hp).withContext("the golem keeps 70%").toBeCloseTo(20 + leech * 0.7, 5);
    expect(component.playerHp).withContext("the necromancer gets 30%").toBeCloseTo(100 + leech * 0.3, 5);
  });

  it("returns Iron Maiden damage when a cursed monster hits a servant", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.skillLevels = { "Iron Maiden": 1, "Raise Skeleton": 1, "Skeleton Mastery": 1 };
    const summon = { kind: "normal", species: "skeleton", spriteFrame: 0, summonType: "skeleton", summonSkill: "Raise Skeleton", x: 260, y: 250, hp: 100, maxHp: 100, speed: 0, r: 12, dmg: 10 } as any;
    const cursed = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 40, curseName: "Iron Maiden", curseRemaining: 10 } as any;
    const plain = { kind: "normal", species: "fallen", spriteFrame: 0, x: 320, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 40 } as any;
    component.enemies = [summon, cursed, plain];
    (component as any).pendingDamage.clear();

    // The servant takes the blow, and 200% of it (rank 1) comes back to the
    // cursed attacker as physical damage.
    expect((component as any).damageSummon(summon, cursed.dmg, "physical", cursed)).toBe(40);
    expect(summon.hp).toBe(60);
    (component as any).flushPendingDamage();
    expect(cursed.hp).toBe(1000 - 80);

    // An uncursed attacker is not punished for the same blow.
    (component as any).damageSummon(summon, plain.dmg, "physical", plain);
    (component as any).flushPendingDamage();
    expect(plain.hp).toBe(1000);

    // A golem's resisted fire blow still returns the blow's own damage, like
    // the hit on the hero does.
    const golem = { kind: "normal", species: "golem", spriteFrame: 0, summonType: "golem", summonSkill: "Fire Golem", x: 250, y: 250, hp: 200, maxHp: 200, speed: 0, r: 14, dmg: 10, summonFireAbsorbPercent: 36 } as any;
    component.enemies = [golem, cursed];
    cursed.hp = 1000;
    (component as any).damageSummon(golem, 50, "fire", cursed);
    (component as any).flushPendingDamage();
    expect(cursed.hp).toBe(1000 - 100);
  });

  it("gives raised skeletons the guidebook's shield roll and block", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 5000;
    component.ownedSkills = ["Raise Skeleton", "Skeleton Mastery"];
    component.skillLevels = { "Raise Skeleton": 1, "Skeleton Mastery": 1 };
    component.enemies = [];

    expect((component as any).getSkillRankStats("Raise Skeleton", "summon", 1))
      .toContain("5% of them carry a shield that blocks 3% of blows");

    const roll = spyOn(Math, "random").and.returnValue(0.9);
    component.activateOwnedSkill("Raise Skeleton");
    const bare = component.enemies.find((enemy: any) => enemy.summonSkill === "Raise Skeleton")!;
    expect(bare.summonShield).withContext("a roll outside the 5% leaves no shield").toBeUndefined();

    // A second raise needs an empty field and a fresh cast delay.
    component.enemies = [];
    for (const key of Object.keys((component as any).skillCastCooldowns)) delete (component as any).skillCastCooldowns[key];
    roll.and.returnValue(0.04);
    component.activateOwnedSkill("Raise Skeleton");
    const shielded = component.enemies.find((enemy: any) => enemy.summonSkill === "Raise Skeleton")!;
    expect(shielded.summonShield).withContext("a roll inside the 5% raises a shield bearer").toBeTrue();

    // The shield turns aside 3% of the blows aimed at the skeleton.
    roll.and.returnValue(0.02);
    const before = shielded.hp;
    (component as any).damageSummon(shielded, 10, "physical");
    expect(shielded.hp).withContext("a block turns the blow away entirely").toBe(before);
    expect(component.floatingTexts.some((entry) => entry.text === "BLOCK")).toBeTrue();

    roll.and.returnValue(0.2);
    (component as any).damageSummon(shielded, 10, "physical");
    expect(shielded.hp).withContext("outside the block roll the skeleton takes the hit").toBeLessThan(before);
  });

  it("plants sentries and blade traps with the guidebook's shot counts", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Charged Bolt Sentry", "Lightning Sentry", "Blade Fury", "Blade Shield", "Fire Blast"];
    component.skillLevels = { "Charged Bolt Sentry": 1, "Lightning Sentry": 1, "Blade Fury": 1, "Blade Shield": 1, "Fire Blast": 1 };
    component.attackProjectiles = [];
    component.enemies = [{ kind: "normal", species: "fallen", spriteFrame: 0, x: 320, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any];

    component.activateOwnedSkill("Charged Bolt Sentry");
    const sentry = component.attackProjectiles.find((projectile: any) => projectile.chargedSentryTrap)!;
    expect(sentry).toBeTruthy();
    expect(sentry.ammoRemaining).toBe(5);
    // 1-7 lightning, raised 6% by the Fire Blast and Lightning Sentry ranks here.
    expect(sentry.trapDamage).toBeCloseTo(4.48, 5);

    component.attackProjectiles = [];
    component.activateOwnedSkill("Lightning Sentry");
    const lightning = component.attackProjectiles.find((projectile: any) => projectile.lightningSentryTrap)!;
    expect(lightning.ammoRemaining).toBe(10);

    component.attackProjectiles = [];
    component.activateOwnedSkill("Blade Fury");
    expect(component.attackProjectiles.length).toBe(3);
    expect(component.attackProjectiles[0].damage).toBeCloseTo(100 * 0.75 + 9, 5);

    component.activateOwnedSkill("Blade Shield");
    expect((component as any).bladeShieldRemaining).toBe(20);
    expect((component as any).getSkillRankStats("Blade Shield", "aura", 1))
      .toContain("Spins for 20s, cutting anything within two yards");
  });

  it("blows corpses up with the Death Sentry across its radius column", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Death Sentry"];
    spyOn(Math, "random").and.returnValue(0.5);

    const run = (rank: number, monsterX: number): { damage: number; ammo: number } => {
      for (const key of Object.keys(component.skillCastCooldowns)) delete component.skillCastCooldowns[key];
      component.attackProjectiles = [];
      component.skillLevels = { "Death Sentry": rank };
      const monster = {
        kind: "normal", species: "fallen", spriteFrame: 0, x: monsterX, y: 250,
        hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2,
      } as any;
      component.enemies = [monster];
      (component as any).corpses = [{ x: 280, y: 250, maxHp: 1000, life: 10, seed: 0.25 }];

      component.activateOwnedSkill("Death Sentry");
      const trap = component.attackProjectiles.find((projectile: any) => projectile.deathSentryTrap) as any;
      expect(trap).withContext(`rank ${rank} plants a sentry`).toBeTruthy();
      (component as any).updateTrap(trap, 0.5);
      (component as any).flushPendingDamage();
      return { damage: 100_000 - monster.hp, ammo: trap.ammoRemaining };
    };

    // A roll of 0.5 sits in the middle of the 40-80% band: 60% of the body's
    // 1000 life, half fire and half physical.
    const first = run(1, 300);
    expect(first.damage).withContext("the body gives up 60% of its life").toBeCloseTo(600, 5);
    expect(first.ammo).withContext("the blast spends the corpse, not a bolt").toBe(5);
    expect((component as any).corpses).withContext("the corpse is consumed").toHaveSize(0);

    // Rank 1's 3.3 yards leaves a monster 150 units from the body alone...
    expect(run(1, 430).damage).toBe(0);
    // ...while rank 20's 9.6 yards reaches it.
    expect(run(20, 430).damage).withContext("the radius column grows with rank").toBeCloseTo(600, 5);
  });

  it("runs Burst of Speed and Fade one at a time and coats the claws with Venom", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Burst of Speed", "Fade", "Venom"];
    component.skillLevels = { "Burst of Speed": 1, "Fade": 1, Venom: 1 };

    component.activateOwnedSkill("Burst of Speed");
    expect((component as any).burstOfSpeedRemaining).toBe(120);
    expect((component as any).burstOfSpeedMoveMultiplier).toBeCloseTo(1.23, 5);

    component.activateOwnedSkill("Fade");
    expect((component as any).burstOfSpeedRemaining).toBe(0);
    expect((component as any).fadeRemaining).toBe(120);
    expect((component as any).fadeResistPercent).toBe(19);
    expect((component as any).fadePhysicalPercent).toBe(1);

    component.activateOwnedSkill("Burst of Speed");
    expect((component as any).fadeRemaining).toBe(0);

    component.activateOwnedSkill("Venom");
    expect((component as any).venomRemaining).toBe(120);
    expect((component as any).getSkillRankStats("Venom", "melee", 1))
      .toContain("70 poison over 0.4s on every claw strike");
  });

  it("shrouds the battlefield, blocks with two claws and keeps one shadow", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.equipment.weapon = {
      id: "katar", name: "Katar", baseName: "Katar", slot: "weapon", equipmentType: "claw", stats: {},
    } as any;
    component.equipment.shield = {
      id: "katar-2", name: "Katar", baseName: "Katar", slot: "weapon", equipmentType: "claw", stats: {},
    } as any;
    component.ownedSkills = ["Cloak of Shadows", "Weapon Block", "Shadow Warrior", "Shadow Master"];
    component.skillLevels = { "Cloak of Shadows": 1, "Weapon Block": 1, "Shadow Warrior": 1, "Shadow Master": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 320, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];

    component.activateOwnedSkill("Cloak of Shadows");
    expect(target.cloakOfShadowsRemaining).toBe(8);
    expect((component as any).cloakOfShadowsDefensePercent).toBe(10);
    expect((component as any).weaponBlockChance).toBe(26);

    component.activateOwnedSkill("Shadow Warrior");
    const warriors = component.enemies.filter((enemy: any) => enemy.summonSkill === "Shadow Warrior");
    expect(warriors.length).toBe(1);
    expect(warriors[0].maxHp).toBeGreaterThanOrEqual(376);
    // The double draws its own assassin-shadow sheet, not Nihlathak's servant art.
    expect(warriors[0].species).toBe("shadowWarrior");

    component.activateOwnedSkill("Shadow Master");
    expect(component.enemies.filter((enemy: any) => enemy.summonSkill === "Shadow Warrior").length).toBe(0);
    const master = component.enemies.find((enemy: any) => enemy.summonSkill === "Shadow Master")!;
    expect(master.maxHp).toBeGreaterThanOrEqual(376);
    expect(master.summonResistPercent).toBe(5);
    expect(master.species).toBe("shadowMaster");
    // Hero-sized, and a plain walk-over-attack sheet: walking stays on the
    // direction row while the attack comes from the band eight rows below.
    expect(enemyD2PixelHeight("shadowWarrior")).toBe(80);
    expect(enemySpriteDirectionRow("shadowWarrior", "move", 16, 3)).toBe(3);
    expect(enemySpriteDirectionRow("shadowWarrior", "attack", 16, 3)).toBe(11);
  });

  it("lets the shadows cast assassin skills, the Master at half her rank plus one", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.ownedSkills = ["Shadow Warrior", "Mind Blast", "Fire Blast"];
    component.skillLevels = { "Shadow Warrior": 10, "Shadow Master": 20, "Mind Blast": 20, "Psychic Hammer": 3, "Fire Blast": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100000, maxHp: 100000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];

    component.activateOwnedSkill("Shadow Warrior");
    const warrior = component.enemies.find((enemy: any) => enemy.summonSkill === "Shadow Warrior") as any;
    expect(warrior).withContext("the Warrior is summoned").toBeTruthy();
    // The Warrior knows the readied skills and rotates through them.
    expect((component as any).shadowReadySkill(warrior)).toBe("Mind Blast");

    // A monster in reach draws a cast at the assassin's own rank for that skill.
    warrior.x = 270;
    warrior.y = 250;
    warrior.summonAttackCooldown = 0;
    warrior.summonSkillCooldown = 0;
    component.attackProjectiles = [];
    component.updateEnemies(16);
    expect(component.attackProjectiles.length).withContext("she casts instead of swinging").toBe(1);
    expect(component.attackProjectiles[0].damage).toBe(101);
    expect(component.attackProjectiles[0].impactStunSeconds).toBe(5.8);
    expect(component.attackProjectiles[0].mindBlastConvertPercent).toBe(36);

    // Inside the cooldown she goes back to her ordinary blow, never a second cast.
    component.attackProjectiles = [];
    component.updateEnemies(16);
    expect(component.attackProjectiles.length).toBe(0);

    // Once it lapses she casts again, with the next skill in her rotation.
    component.updateEnemies(2400);
    expect(component.attackProjectiles.length).withContext("she casts again after the cooldown").toBe(1);
    expect(component.attackProjectiles[0].damage).toBeCloseTo(3.5);

    // With nothing readied she has no skill to throw and only fights.
    component.ownedSkills = ["Shadow Warrior"];
    expect((component as any).shadowReadySkill(warrior)).toBeUndefined();

    // The Master reaches the whole tree, at half her rank plus one: rank 20
    // means Psychic Hammer at 11 and Mind Blast at 11.
    component.ownedSkills = ["Shadow Warrior", "Shadow Master"];
    component.activateOwnedSkill("Shadow Master");
    const master = component.enemies.find((enemy: any) => enemy.summonSkill === "Shadow Master") as any;
    expect(master).withContext("the Master is summoned").toBeTruthy();
    expect((component as any).shadowSkillRank(master, "Psychic Hammer")).toBe(11);
    expect((component as any).shadowReadySkill(master)).toBe("Mind Blast");
    component.attackProjectiles = [];
    (component as any).castShadowSkill(master, target, "Mind Blast");
    expect(component.attackProjectiles[0].damage).toBe(44);
  });

  it("banks martial charges and spends them on a finisher", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.equipment.weapon = {
      id: "katar", name: "Katar", baseName: "Katar", slot: "weapon", equipmentType: "claw", stats: {},
    } as any;
    component.equipment.shield = {
      id: "katar-2", name: "Katar", baseName: "Katar", slot: "weapon", equipmentType: "claw", stats: {},
    } as any;
    component.ownedSkills = ["Tiger Strike", "Dragon Claw", "Claws of Thunder", "Dragon Talon"];
    component.skillLevels = { "Tiger Strike": 1, "Dragon Claw": 1, "Claws of Thunder": 1, "Dragon Talon": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 290, y: 250, hp: 500_000, maxHp: 500_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];

    component.activateOwnedSkill("Tiger Strike");
    expect((component as any).martialCharges.length).toBe(1);
    component.activateOwnedSkill("Tiger Strike");
    expect((component as any).martialCharges.length).toBe(2);
    expect((component as any).martialChargeRemaining).toBe(10);

    const before = target.hp;
    component.activateOwnedSkill("Dragon Claw");
    (component as any).flushPendingDamage();
    expect((component as any).martialCharges.length).toBe(0);
    // Two claw rakes plus the released Tiger Strike charge must beat one blow.
    expect(before - target.hp).toBeGreaterThan((component as any).skillCastDamage("Dragon Claw"));
    expect((component as any).martialChargeRemaining).toBe(0);
  });

  it("kicks for the boot's damage, never for the weapon in hand", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Dragon Talon", "Dragon Flight"];
    component.skillLevels = { "Dragon Talon": 1, "Dragon Flight": 1 };

    component.equipment.boots = { name: "Heavy Boots", baseName: "Heavy Boots", slot: "armor", equipmentType: "boots", stats: { armor: 4 } } as any;
    expect((component as any).kickDamageRange).toEqual([4, 10]);
    component.equipment.boots = { name: "Myrmidon Greaves", baseName: "Myrmidon Greaves", slot: "armor", equipmentType: "boots", stats: {} } as any;
    expect((component as any).kickDamageRange).toEqual([83, 149]);
    component.equipment.boots = null;
    expect((component as any).kickDamageRange).toEqual([1, 2]);

    // Heavy boots, a weak weapon and a brutal one: the kick is unchanged while
    // the weapon-based skill damage swings wildly.
    component.equipment.boots = { name: "Heavy Boots", baseName: "Heavy Boots", slot: "armor", equipmentType: "boots", stats: { armor: 4 } } as any;
    spyOn(Math, "random").and.returnValue(0.5);
    component.equipment.weapon = { id: "w1", name: "Short Sword", baseName: "Short Sword", slot: "weapon", equipmentType: "sword", stats: { damageMin: 1, damageMax: 1 } } as any;
    const weakKick = (component as any).kickSkillDamage("Dragon Talon");
    component.equipment.weapon = { id: "w2", name: "War Sword", baseName: "War Sword", slot: "weapon", equipmentType: "sword", stats: { damageMin: 200, damageMax: 200 } } as any;
    const strongKick = (component as any).kickSkillDamage("Dragon Talon");
    expect(strongKick).toBeCloseTo(weakKick);
    // A 200-damage sword never enters the kick: heavy boots and the rank-one
    // table stay far below what that blade would swing for.
    expect(strongKick).toBeLessThan(100);
  });

  it("lands Dragon Talon and Dragon Flight for boot damage whatever the weapon", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.ownedSkills = ["Dragon Talon", "Dragon Flight"];
    component.skillLevels = { "Dragon Talon": 1, "Dragon Flight": 1 };
    component.equipment.boots = { name: "Heavy Boots", baseName: "Heavy Boots", slot: "armor", equipmentType: "boots", stats: { armor: 4 } } as any;
    spyOn<any>(component as any, "rollMasteryCritical").and.returnValue(false);
    spyOn(Math, "random").and.returnValue(0.5);

    const damageWith = (weaponStats: { damageMin: number; damageMax: number }, skill: string): number => {
      component.equipment.weapon = {
        id: "kick-sword", name: "Sword", baseName: "Sword", slot: "weapon", equipmentType: "sword", stats: weaponStats,
      } as any;
      const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 280, y: 250, hp: 500_000, maxHp: 500_000, speed: 0, r: 14, dmg: 2 } as any;
      component.enemies = [target];
      for (const key of Object.keys(component.skillCastCooldowns)) delete component.skillCastCooldowns[key];
      (component as any).martialCharges = [];
      component.activateOwnedSkill(skill, target);
      (component as any).flushPendingDamage();
      return 500_000 - target.hp;
    };

    for (const skill of ["Dragon Talon", "Dragon Flight"]) {
      const weak = damageWith({ damageMin: 1, damageMax: 1 }, skill);
      const strong = damageWith({ damageMin: 400, damageMax: 400 }, skill);
      expect(weak).withContext(skill).toBeGreaterThan(0);
      expect(strong).withContext(`${skill} ignores the weapon`).toBeCloseTo(weak, 3);
    }
  });

  it("gives Mind Blast its own 10-20 to 96-106 column, apart from Psychic Hammer", () => {
    component.selectedClass = "assassin";
    component.ownedSkills = ["Psychic Hammer", "Mind Blast"];
    component.skillLevels = { "Psychic Hammer": 1, "Mind Blast": 1 };
    const gap = (): number => (component as any).skillCastDamage("Mind Blast")
      - (component as any).skillCastDamage("Psychic Hammer");

    // Rank one: Mind Blast's 10-20 against Psychic Hammer's 2-5.
    expect(gap()).toBeCloseTo(15 - 3.5, 5);

    // Rank twenty: 96-106 against 29-32.
    component.skillLevels = { "Psychic Hammer": 20, "Mind Blast": 20 };
    expect(gap()).toBeCloseTo(101 - 30.5, 5);
    expect((component as any).skillCastDamage("Psychic Hammer"))
      .withContext("Psychic Hammer keeps its smaller column")
      .toBeLessThan((component as any).skillCastDamage("Mind Blast"));
  });

  it("spends the banked charges on an ordinary weapon swing as well", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.equipment.weapon = {
      id: "katar", name: "Katar", baseName: "Katar", slot: "weapon", equipmentType: "claw", stats: {},
    } as any;
    component.ownedSkills = ["Tiger Strike"];
    component.skillLevels = { "Tiger Strike": 1 };
    spyOn<any>(component as any, "rollMasteryCritical").and.returnValue(false);
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 280, y: 250, hp: 500_000, maxHp: 500_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];

    component.activateOwnedSkill("Tiger Strike");
    component.activateOwnedSkill("Tiger Strike");
    (component as any).flushPendingDamage();
    expect((component as any).martialCharges.length).toBe(2);

    const before = target.hp;
    expect((component as any).performWeaponAttack(target)).toBeTrue();
    (component as any).flushPendingDamage();
    const chargedSwing = before - target.hp;
    expect((component as any).martialCharges.length).toBe(0);
    expect((component as any).martialChargeRemaining).toBe(0);

    // The same swing with an empty stack is strictly weaker: the difference is
    // the Tiger Strike share the plain attack released.
    const plainBefore = target.hp;
    (component as any).performWeaponAttack(target);
    (component as any).flushPendingDamage();
    expect(chargedSwing).toBeGreaterThan(plainBefore - target.hp);
  });

  it("releases Claws of Thunder and Blades of Ice at their charge strength", () => {
    component.selectedClass = "assassin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.equipment.weapon = {
      id: "katar", name: "Katar", baseName: "Katar", slot: "weapon", equipmentType: "claw", stats: {},
    } as any;
    component.ownedSkills = ["Claws of Thunder", "Blades of Ice", "Dragon Talon"];
    component.skillLevels = { "Claws of Thunder": 1, "Blades of Ice": 1, "Dragon Talon": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 290, y: 250, hp: 500_000, maxHp: 500_000, speed: 0, r: 14, dmg: 2 } as any;
    const neighbour = { kind: "normal", species: "fallen", spriteFrame: 0, x: 310, y: 262, hp: 500_000, maxHp: 500_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target, neighbour];

    component.activateOwnedSkill("Claws of Thunder");
    component.activateOwnedSkill("Claws of Thunder");
    component.activateOwnedSkill("Claws of Thunder");
    expect((component as any).martialCharges.length).toBe(3);

    const neighbourBefore = neighbour.hp;
    component.activateOwnedSkill("Dragon Talon");
    (component as any).flushPendingDamage();
    // The nova and the charged bolts reach the second monster.
    expect(neighbourBefore - neighbour.hp).toBeGreaterThan(0);

    component.activateOwnedSkill("Blades of Ice");
    component.activateOwnedSkill("Blades of Ice");
    component.activateOwnedSkill("Blades of Ice");
    component.activateOwnedSkill("Dragon Talon");
    (component as any).flushPendingDamage();
    expect((component as any).enemyFreezeTimers?.get?.(target) ?? target.freezeRemaining ?? 0).toBeGreaterThan(0);
  });

  it("adds the bow tables' elemental damage and multiplies volleys by three quarters", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.equipment.weapon = {
      id: "amazon-bow", name: "Short Bow", baseName: "Short Bow", slot: "weapon",
      equipmentType: "weapon", stats: { damageMin: 4, damageMax: 9 },
    } as any;
    component.ownedSkills = ["Magic Arrow", "Fire Arrow", "Multiple Shot", "Ice Arrow", "Freezing Arrow"];
    component.skillLevels = { "Magic Arrow": 1, "Fire Arrow": 1, "Multiple Shot": 1, "Ice Arrow": 1, "Freezing Arrow": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 480, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];

    expect((component as any).amazonBowFlatDamage("Magic Arrow")).toBe(1);
    expect((component as any).amazonBowFlatDamage("Fire Arrow")).toBeCloseTo(2.5, 5);
    expect((component as any).amazonBowFlatDamage("Ice Arrow")).toBeCloseTo(8, 5);
    expect((component as any).amazonBowFlatDamage("Freezing Arrow")).toBeCloseTo(45, 5);
    expect((component as any).amazonCombatDamageMultiplier("Multiple Shot", 1)).toBeCloseTo(0.75, 5);

    component.activateOwnedSkill("Multiple Shot");
    expect(component.attackProjectiles.length).toBe(2);
    expect(component.attackProjectiles[0].damage)
      .toBeCloseTo((component as any).skillCastDamage("Multiple Shot"), 4);

    component.attackProjectiles = [];
    component.activateOwnedSkill("Ice Arrow");
    expect(component.attackProjectiles[0].freezeSeconds).toBe(2);

    component.attackProjectiles = [];
    component.activateOwnedSkill("Freezing Arrow");
    expect(component.attackProjectiles[0].impactRadius).toBe(66);
    expect((component as any).getSkillRankStats("Freezing Arrow", "projectile", 1))
      .toContain("Freezes everything within 3.3 yards for 2s");
  });

  it("strafes at multiple monsters with the guidebook's minimum shots", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.equipment.weapon = {
      id: "amazon-bow", name: "Short Bow", baseName: "Short Bow", slot: "weapon",
      equipmentType: "weapon", stats: { damageMin: 4, damageMax: 9 },
    } as any;
    component.ownedSkills = ["Strafe"];
    component.skillLevels = { Strafe: 1 };
    const first = { kind: "normal", species: "fallen", spriteFrame: 0, x: 420, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    const second = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 430, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [first, second];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Strafe");
    // Two targets each get an arrow, and the minimum of two is already met.
    expect(component.attackProjectiles.length).toBe(2);
    expect((component as any).amazonCombatDamageMultiplier("Strafe", 1)).toBeCloseTo(0.75 * 1.05, 5);
    // Three quarters of real weapon damage plus Strafe's own 5% (100 -> 78.75).
    expect(component.attackProjectiles[0].damage).toBeCloseTo(78.75, 5);

    // A lone monster eats the minimum number of arrows: 2 + floor(rank / 4).
    component.enemies = [first];
    component.attackProjectiles = [];
    component.skillLevels = { Strafe: 8 };
    component.activateOwnedSkill("Strafe");
    expect(component.attackProjectiles.length).toBe(4);
    expect((component as any).getSkillRankStats("Strafe", "projectile", 1))
      .toContain("Fires at up to 5 targets");
  });

  it("burns Immolation Arrow's ground fire for its table's per-second total", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 500;
    component.basicAttackDamage = 100;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.equipment.weapon = {
      id: "amazon-bow", name: "Short Bow", baseName: "Short Bow", slot: "weapon",
      equipmentType: "weapon", stats: { damageMin: 4, damageMax: 9 },
    } as any;
    component.equipment.shield = null;
    component.ownedSkills = ["Immolation Arrow"];
    component.skillLevels = { "Immolation Arrow": 1, "Fire Arrow": 0, "Exploding Arrow": 0 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 420, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).blazeFirePatches.length = 0;
    (component as any).playerAttackLockRemaining = 0;

    component.activateOwnedSkill("Immolation Arrow");
    const arrow = component.attackProjectiles[0] as any;
    expect(arrow.immolationFire).withContext("the arrow carries its ground fire").toBeTruthy();
    const perSecond = arrow.immolationFire.damagePerSecond;
    const seconds = arrow.immolationFire.seconds;
    expect(perSecond).toBe(9);

    // Fly the arrow home so the blast plants the patch under the monster.
    for (let step = 0; step < 40 && (component as any).blazeFirePatches.length === 0; step += 1) {
      (component as any).rebuildEnemyGrid();
      (component as any).updateAttackProjectiles(50);
    }
    const patches = (component as any).blazeFirePatches;
    expect(patches.length).withContext("the patch is planted").toBe(1);
    const patch = patches[0];
    expect(patch.tickInterval).toBeCloseTo(0.5, 5);
    expect(patch.life).toBeCloseTo(seconds, 5);
    expect(patch.damagePerTick).withContext("a tick pays half a second of the table")
      .toBeCloseTo(perSecond * 0.5, 5);

    // Burn the patch out under the monster in game-sized frames: eight ticks
    // of 4.5 make the table's 9 a second for 4 seconds, never twice that.
    (component as any).flushPendingDamage();
    const before = target.hp;
    for (let step = 0; step < 200 && (component as any).blazeFirePatches.length > 0; step += 1) {
      (component as any).rebuildEnemyGrid();
      (component as any).updateBlazeFirePatches(0.05);
      (component as any).flushPendingDamage();
    }
    expect((component as any).blazeFirePatches.length).withContext("the fire has burned out").toBe(0);
    expect(before - target.hp).toBeCloseTo(perSecond * seconds, 5);
  });

  it("applies the amazon passive tables for crit, dodge and pierce", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.skillLevels = { "Critical Strike": 1, Penetrate: 18, Dodge: 1, Avoid: 1, Evade: 1, Pierce: 1 };
    (component as any).playerMoveX = 0;
    (component as any).playerMoveY = 0;

    // Critical Strike rank 1 is 16%, and Penetrate rank 18 adds 205 AR read at 5%.
    expect(component.amazonCriticalStrikeChance).toBeCloseTo(16 + 205 * 0.05, 5);
    expect(component.amazonPierceChance).toBeCloseTo(23, 5);

    spyOn(Math, "random").and.returnValue(0);
    // Standing still: a melee blow meets Dodge, a missile meets Avoid.
    expect((component as any).applyIncomingDamage(100)).toBe(0);
    expect((component as any).applyIncomingDamage(100, undefined, "missile")).toBe(0);

    (component as any).playerMoveX = 4;
    component.skillLevels = { Dodge: 0, Avoid: 0, Evade: 1 };
    expect((component as any).rollAmazonDodge("melee")).toBe("Evade");
  });

  it("casts Inner Sight on nearby monsters and slows enemy missiles", () => {
    component.selectedClass = "amazon";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Inner Sight", "Slow Missiles"];
    component.skillLevels = { "Inner Sight": 1, "Slow Missiles": 1 };
    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    const far = { kind: "normal", species: "fallen", spriteFrame: 0, x: 900, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [near, far];

    component.activateOwnedSkill("Inner Sight");
    expect(near.innerSightRemaining).toBe(8);
    expect(near.innerSightDefense).toBe(40);
    expect(far.innerSightRemaining).toBeUndefined();

    component.activateOwnedSkill("Slow Missiles");
    expect((component as any).slowMissilesRemaining).toBe(12);
    expect((component as any).getSkillRankStats("Inner Sight", "aura", 1))
      .toContain("Lowers the Defense of monsters within 13.3 yards by 40");
  });

  it("summons a Valkyrie from her table and a stationary Decoy from yours", () => {
    component.selectedClass = "amazon";
    component.skillLevels = { Valkyrie: 1, Decoy: 1 };
    component.playerMaxHp = 1000;
    component.enemies = [];

    (component as any).summonCompanion("Valkyrie");
    const valkyrie = component.enemies.find((enemy) => enemy.summonSkill === "Valkyrie");
    expect(valkyrie).toBeDefined();
    // The guidebook's 528 base, raised by any summon-life bonus in play.
    expect(valkyrie!.maxHp).toBeGreaterThanOrEqual(528);
    expect(valkyrie!.hp).toBe(valkyrie!.maxHp);

    (component as any).summonCompanion("Decoy");
    const decoy = component.enemies.find((enemy) => enemy.summonSkill === "Decoy");
    expect(decoy).toBeDefined();
    expect(decoy!.maxHp).toBe(1100);
    expect(decoy!.summonStationary).toBeTrue();
    expect(decoy!.summonExpireSeconds).toBe(10);
    expect(decoy!.dmg).toBe(0);
  });

  it("jabs twice and impales with the guidebook's spear tables", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Jab", "Impale", "Fend"];
    component.skillLevels = { Jab: 1, Impale: 1, Fend: 1 };
    component.equipment.weapon = {
      id: "amazon-javelin", name: "Javelin", baseName: "Javelin", slot: "weapon",
      equipmentType: "weapon", stats: { damageMin: 4, damageMax: 9 },
    } as any;
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.floatingTexts = [];

    expect((component as any).amazonCombatDamageMultiplier("Jab", 1)).toBeCloseTo(0.85, 5);
    expect((component as any).amazonCombatDamageMultiplier("Impale", 1)).toBeCloseTo(4, 5);
    expect((component as any).amazonCombatDamageMultiplier("Fend", 1)).toBeCloseTo(1.7, 5);

    component.activateOwnedSkill("Jab");
    // A spear thrust, not the generic cast gesture.
    expect((component as any).attackAnimationStyle).toBe("amazonJab");
    (component as any).flushPendingDamage();
    // Jab is the amazon basic attack: one thrust carrying its rank's damage column.
    expect(100_000 - target.hp).toBeCloseTo((component as any).skillCastDamage("Jab"), 4);
    expect(component.floatingTexts.length).toBe(1);

    // Fend turns on every monster in reach, not just the nearest one.
    const second = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 274, hp: 10_000, maxHp: 10_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target, second];
    component.activateOwnedSkill("Fend");
    // Every amazon melee skill jabs; none of them plays the cast lift.
    expect((component as any).attackAnimationStyle).toBe("amazonJab");
    (component as any).flushPendingDamage();
    expect(second.hp).toBeLessThan(10_000);

    expect((component as any).getSkillRankStats("Impale", "strike", 1))
      .toContain("+300% damage on a single thrust");
  });

  it("releases Charged Strike bolts and chains Lightning Strike", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Charged Strike", "Lightning Strike", "Power Strike", "Lightning Bolt"];
    component.skillLevels = { "Charged Strike": 1, "Lightning Strike": 1, "Power Strike": 1, "Lightning Bolt": 1 };
    component.equipment.weapon = {
      id: "amazon-javelin", name: "Javelin", baseName: "Javelin", slot: "weapon",
      equipmentType: "weapon", stats: { damageMin: 4, damageMax: 9 },
    } as any;
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    const neighbour = { kind: "normal", species: "fallen", spriteFrame: 0, x: 250, y: 276, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target, neighbour];
    component.attackProjectiles = [];

    component.activateOwnedSkill("Charged Strike");
    expect(component.attackProjectiles.length).toBe(3);
    expect(component.attackProjectiles.every((projectile) => projectile.kind === "lightning")).toBeTrue();

    component.attackProjectiles = [];
    component.activateOwnedSkill("Lightning Strike");
    (component as any).flushPendingDamage();
    // Lightning Strike hits the monster and arcs on to its neighbour.
    expect(component.floatingTexts.some((text: any) => text.x === neighbour.x)).toBeTrue();
  });

  it("throws poison and lightning javelins from the guidebook tables", () => {
    component.selectedClass = "amazon";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Lightning Bolt", "Poison Javelin", "Plague Javelin", "Lightning Fury"];
    component.skillLevels = { "Lightning Bolt": 1, "Poison Javelin": 1, "Plague Javelin": 1, "Lightning Fury": 1 };
    component.equipment.weapon = {
      id: "amazon-javelin", name: "Javelin", baseName: "Javelin", slot: "weapon",
      equipmentType: "weapon", stats: { damageMin: 4, damageMax: 9 },
    } as any;
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 420, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    const neighbour = { kind: "normal", species: "fallen", spriteFrame: 0, x: 440, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target, neighbour];
    component.attackProjectiles = [];
    (component as any).poisonClouds.length = 0;

    component.activateOwnedSkill("Lightning Bolt");
    // Rank 1 Lightning Bolt is 1-40, and the Lightning Fury point adds its 3%.
    expect(component.attackProjectiles[0].damage).toBeCloseTo(20.5 * 1.03, 5);
    expect(component.attackProjectiles[0].damageType).toBe("lightning");

    component.attackProjectiles = [];
    component.activateOwnedSkill("Poison Javelin");
    expect((component as any).poisonClouds.length).toBe(3);
    const poisonTotal = (component as any).poisonClouds
      .reduce((total: number, cloud: any) => total + cloud.damagePerTick * cloud.life, 0);
    // Rank 1 Poison Javelin is 25-37, raised 12% by the Plague Javelin point.
    expect(poisonTotal).toBeCloseTo(31 * 1.12, 4);

    component.attackProjectiles = [];
    component.activateOwnedSkill("Lightning Fury");
    (component as any).flushPendingDamage();
    expect(component.attackProjectiles.length).toBeGreaterThan(1);
    expect(100_000 - target.hp).toBeGreaterThan(0);
  });

  it("trades life for Sacrifice damage at the guidebook's 8%", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.basicAttackDamage = 100;
    component.playerHp = 500;
    component.playerMaxHp = 500;
    component.ownedSkills = ["Sacrifice"];
    component.skillLevels = { Sacrifice: 1 };
    component.equipment.weapon = null;
    component.equipment.shield = null;
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250, hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2 } as any;
    component.enemies = [target];
    component.floatingTexts = [];

    component.activateOwnedSkill("Sacrifice");
    (component as any).flushPendingDamage();

    const dealt = 100_000 - target.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(component.playerHp).toBeCloseTo(500 - dealt * 0.08, 4);
    expect(component.playerHp).toBeLessThan(500);
    expect((component as any).getSkillRankStats("Sacrifice", "strike", 1))
      .toContain("+180% damage, no mana");
  });

  it("converts a monster so it strikes its former comrades instead of the paladin", () => {
    spyOn(Math, "random").and.returnValue(0);
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Conversion"];
    component.skillLevels = { Conversion: 1 };
    const converted = { kind: "normal", species: "fallen", spriteFrame: 0, x: 268, y: 250, hp: 5000, maxHp: 5000, speed: 100, r: 14, dmg: 30 } as any;
    const victim = { kind: "normal", species: "fallen", spriteFrame: 0, x: 286, y: 250, hp: 5000, maxHp: 5000, speed: 100, r: 14, dmg: 30 } as any;
    component.enemies = [converted, victim];
    component.floatingTexts = [];

    component.activateOwnedSkill("Conversion");
    (component as any).flushPendingDamage();

    expect(converted.convertedRemaining).toBe(16);
    expect((component as any).applyIncomingDamage(100, converted)).toBe(0);

    (component as any).updateConvertedMonsters(1.1);
    (component as any).flushPendingDamage();
    expect(converted.convertedRemaining).toBeCloseTo(14.9, 5);
    expect(victim.hp).toBeLessThan(5000);
    expect((component as any).getSkillRankStats("Conversion", "strike", 1))
      .toContain("7% chance to convert the monster struck");
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
      .toContain("3-6 fire damage");
    component.activateOwnedSkill("Fire Bolt");

    expect(component.attackProjectiles).toHaveSize(1);
    // 4.5 from the Fire Bolt table, 25% harder from the helm's Energy.
    expect(component.attackProjectiles[0].damage).toBeCloseTo(4.5 * 1.25, 5);
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

    // 3 cold from the Frost Nova table, 25% harder from the helm's Energy.
    expect(target.hp).toBeCloseTo(1000 - 3 * 1.25, 5);
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
    // Half of the table's 70-94 per second, 25% harder from the helm's Energy.
    expect(component.attackProjectiles[0].damage).toBeCloseTo((70 + 94) / 2 * 0.5 * 1.25, 5);
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
    // Wake of Inferno's table starts at 12-30 fire a second (21 average) and the
    // helm's Energy scales it once.
    expect(trap.trapDamage).toBe(26.25);

    trap.shotCooldown = 0;
    (component as any).updateAttackProjectiles(16);
    const cone = (component as any).skillVisualEffects.find((effect: any) => effect.inferno && effect.stationary);
    expect(cone).toBeDefined();
    expect(cone.damagePerTick).toBeCloseTo(6.5625, 5);
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
    // Three quarters of real weapon damage, not of the 1.5x skill base (100 -> 75).
    expect(component.attackProjectiles.every((projectile) => projectile.damage === 75)).toBeTrue();
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

  it("keeps one tooltip model while the pointer crosses the same skill socket", () => {
    component.selectedClass = "amazon";
    component.playerLevel = 30;
    const magicArrow = D2_CLASS_SKILL_TREES["amazon"].sections[0].skills[0];
    const socket = { ...magicArrow, state: "available" as const, reason: "" };

    component.showSkillTooltip({ clientX: 100, clientY: 100 } as MouseEvent, socket, "Bow and Crossbow");
    const firstPanel = component.hoveredSkillTooltip;
    component.showSkillTooltip({ clientX: 140, clientY: 120 } as MouseEvent, socket, "Bow and Crossbow");

    // Pointer moves inside one socket must not rebuild the panel: the custom
    // cursor keeps its frame and only the window follows the pointer.
    expect(component.hoveredSkillTooltip).toBe(firstPanel);
    expect(component.hoveredSkillTooltip?.x).toBeGreaterThan(124);
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

    expect(component.hoveredSkillTooltip?.x).toBe(148);
    expect(component.hoveredSkillTooltip?.y).toBe(114);

    const edgeX = window.innerWidth - 20;
    component.showSkillTooltip(
      { clientX: edgeX, clientY: 100 } as MouseEvent,
      { ...magicArrow, state: "available" as const, reason: "" },
      "Bow and Crossbow",
    );

    expect(component.hoveredSkillTooltip?.x).toBe(edgeX - 24 - 280);
    expect(component.hoveredSkillTooltip?.y).toBe(114);

    // The card rides the same pointer moves as the custom cursor, so it keeps
    // following the mouse instead of freezing where the socket left it.
    (component as any).trackD2Cursor({ clientX: 300, clientY: 200, pointerType: "mouse" } as PointerEvent);
    expect(component.hoveredSkillTooltip?.x).toBe(348);
    expect(component.hoveredSkillTooltip?.y).toBe(214);
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

  it("tracks skill sockets by name so a hover cannot rebuild the socket mid-click", () => {
    // The sockets used to be re-created on every change detection, so a click's
    // mousedown and mouseup landed on different nodes and no point was ever
    // spent. Tracking by name keeps one element per skill.
    expect(component.trackBySkillName(0, { name: "Fire Bolt" })).toBe("Fire Bolt");
    expect(component.trackBySkillName(4, { name: "Ice Bolt" })).toBe("Ice Bolt");
  });

  it("shows the points spent in the socket badge once a skill is learned", () => {
    component.skillLevels = {};
    expect(component.skillSocketBadge("Fire Bolt", 1)).toBe("1");
    expect(component.skillSocketBadge("Frozen Orb", 30)).toBe("30");
    component.skillLevels = { "Fire Bolt": 3 };
    expect(component.skillSocketBadge("Fire Bolt", 1)).toBe("3");
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

  it("brings a loaded druid back in human form instead of the werebear it was saved in", () => {
    // A wereform is a timed buff of the live run, not part of the save.
    (component as any).restoreRunState({ selectedClass: "druid", druidForm: "werebear", druidFormRemaining: 9 });
    expect((component as any).druidForm).toBeNull();
    expect((component as any).druidFormRemaining).toBe(0);
    // The form starts on its cooldown, so the automatic shift cannot snap the
    // druid straight back into the bear on the first frame of the load.
    expect((component as any).druidFormCooldown).toBeGreaterThan(0);

    (component as any).restoreRunState({ selectedClass: "druid" });
    expect((component as any).druidForm).toBeNull();
    expect((component as any).druidFormCooldown).toBe(0);
  });

  it("walks the wereform instead of holding its attack cel while the hero moves", () => {
    const frames: HTMLCanvasElement[][] = [];
    for (let row = 0; row < 16; row += 1) {
      frames.push([]);
      for (let column = 0; column < 13; column += 1) {
        const cel = document.createElement("canvas");
        cel.width = 4;
        cel.height = 4;
        frames[row].push(cel);
      }
    }
    (component as any).druidAnimations.werebear = { frames, columns: 13, rows: 16, frameDurationMs: 85 };
    (component as any).druidForm = "werebear";
    (component as any).druidFormAttackTime = 0.4;
    (component as any).runTime = 0;
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    const ctx = jasmine.createSpyObj<CanvasRenderingContext2D>("ctx", ["save", "restore", "beginPath", "ellipse", "fill", "drawImage"]);
    const row = wereformRow(1, 0);
    const drawnCel = (): unknown => ctx.drawImage.calls.mostRecent().args[0];

    (component as any).isPlayerMoving = true;
    (component as any).drawDruidForm(ctx);
    expect(drawnCel()).toBe(frames[row][0]);

    (component as any).isPlayerMoving = false;
    ctx.drawImage.calls.reset();
    (component as any).drawDruidForm(ctx);
    expect(frames[row + 8] as unknown[]).toContain(drawnCel());
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
    // The mage table only allows four bodies from rank nine upward.
    component.skillLevels = { "Skeletal Mage": 9 };
    component.enemies = [];

    for (let index = 0; index < 4; index += 1) (component as any).summonCompanion("Skeletal Mage");

    const mages = component.enemies.filter((enemy) => enemy.summonSkill === "Skeletal Mage");
    expect(mages.map((enemy) => enemy.summonElement)).toEqual(["cold", "fire", "lightning", "poison"]);
    expect(mages.map((enemy) => enemy.species)).toEqual([
      "skeletalMageCold", "skeletalMageFire", "skeletalMageLightning", "skeletalMagePoison",
    ]);
    expect(mages.every((enemy) => enemy.summonType === "skeleton")).toBeTrue();
  });

  it("plays the summon glow on the raised skeleton instead of the necromancer", () => {
    component.selectedClass = "necromancer";
    component.playerX = 250;
    component.playerY = 250;
    component.ownedSkills = ["Raise Skeleton"];
    component.skillLevels = { "Raise Skeleton": 1 };
    component.enemies = [];
    (component as any).skillVisualEffects.length = 0;
    (component as any).meleeTrailEffects.length = 0;

    component.activateOwnedSkill("Raise Skeleton");

    const skeleton = component.enemies.find((enemy) => enemy.summonSkill === "Raise Skeleton");
    expect(skeleton).toBeTruthy();
    // The caster only performs the gesture: no cast impact flashes on him.
    expect((component as any).meleeTrailEffects).toHaveSize(0);
    const rise = (component as any).skillVisualEffects.find((effect: { summonRise?: boolean }) => effect.summonRise);
    expect(rise).toBeTruthy();
    // The imported summon overlay is anchored on the servant's own ground point,
    // so it stays there while the hero moves instead of following him.
    expect(rise.x).toBeCloseTo(skeleton!.x, 5);
    expect(rise.y).toBeCloseTo(skeleton!.y, 5);
    expect(rise.stationary).toBeTrue();
    expect(Math.hypot(rise.x - component.playerX, rise.y - component.playerY)).toBeGreaterThan(30);
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
    expect(egg.proxy.hp).toBe(30);
    expect(egg.proxy.maxHp).toBe(30);

    (component as any).queueEnemyDamage(egg.proxy, 30, "#ffffff");
    (component as any).flushPendingDamage();
    expect(egg.proxy.hp).toBeLessThanOrEqual(0);

    (component as any).updateMaggotEggs(0.1);
    expect(component.maggotEggs).toHaveSize(0);
    expect(component.enemies).not.toContain(egg.proxy);
    expect(component.enemies.some((enemy) => enemy.species === "sandMaggotYoung")).toBeFalse();
    // Laying and cracking an egg stay silent in the combat log.
    expect(component.floatingTexts.some((text) => /EGG (LAID|DESTROYED)/i.test(text.text))).toBeFalse();
  });

  it("leaves a Sand Maggot egg untouched when the hero merely walks past it", () => {
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
    const fullHp = egg.proxy.hp;
    expect(fullHp).toBeGreaterThan(0);

    // Standing on top of the egg never swings at it: eggs are not auto-attack
    // targets, so stepping over one leaves it brooding.
    egg.proxy.x = component.playerX + 8;
    egg.proxy.y = component.playerY;
    (component as any).clickMoveTarget = null;
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();
    expect(egg.proxy.hp).toBe(fullHp);
    expect(component.maggotEggs).toHaveSize(1);

    // Clicking the egg is a deliberate attack, and that is what cracks it.
    (component as any).clickMoveTarget = egg.proxy;
    (component as any).attackCooldown = 0;
    (component as any).updateBasicAttack();
    expect(egg.proxy.hp).toBeLessThan(fullHp);
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

  it("runs Cyclone Armor as a timed, rank-scaling damage shield with no recast delay", () => {
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
    const unshielded = (component as any).applyIncomingDamage(100, undefined, "melee", "cold");
    (component as any).cycloneArmorRemaining = duration;
    const shielded = (component as any).applyIncomingDamage(100, undefined, "melee", "cold");
    expect(shielded).toBeLessThan(unshielded);

    // The hero's hands are free again: the cast animation had finished.
    (component as any).playerAttackLockRemaining = 0;
    (component as any).updateAutomaticSkillCasts((duration + 0.05) * 1000);
    expect((component as any).cycloneArmorRemaining).toBe(0);
    // No recast delay: the shield goes straight back up, paying its mana.
    expect(component.getSkillCastInterval("Cyclone Armor")).toBe(0);
    (component as any).playerAttackLockRemaining = 0;
    (component as any).updateAutomaticSkillCasts(16);
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
    expect((component as any).getSkillRankStats("Holy Shield", "strike", 1)).toContain("+25% Defense while active (+0% from Defiance)");
    expect((component as any).getSkillRankStats("Holy Shield", "strike", 1)).toContain("Active for 30.0s when cast");
    expect((component as any).getSkillRankStats("Holy Shield", "strike", 1)).toContain("+14% successful blocking");

    const baseArmor = component.equippedArmor;
    const baseDamage = (component as any).applyIncomingDamage(100);
    component.activateOwnedSkill("Holy Shield");

    expect((component as any).holyShieldRemaining).toBe(30);
    expect(component.attackProjectiles).toHaveSize(0);
    expect(component.enemies[0].hp).toBe(100);
    expect(component.equippedArmor).toBe(baseArmor + 25);
    expect((component as any).applyIncomingDamage(100)).toBeLessThan(baseDamage);

    (component as any).updateSkillVisualEffects(30_100);
    expect((component as any).holyShieldRemaining).toBe(0);
    expect(component.equippedArmor).toBe(baseArmor);
    expect(component.skillCastCooldowns["Holy Shield"] ?? 0).withContext("no recast delay").toBe(0);

    (component as any).playerAttackLockRemaining = 0;
    (component as any).updateAutomaticSkillCasts(16);
    expect((component as any).holyShieldRemaining).toBe(30);
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

  it("streams the Blade Sentinel aura sheet when an assassin run opens", async () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    const fetchSpy = spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadRunAssets("assassin");
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

  it("adds the offensive auras' attack columns to weapon hits", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.skillLevels = {
      "Holy Fire": 1, "Holy Freeze": 1, "Holy Shock": 1,
      "Resist Fire": 0, "Resist Cold": 0, "Resist Lightning": 0, Salvation: 0,
    };
    spyOn<any>(component as any, "rollMasteryCritical").and.returnValue(false);
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    const monster = (x: number) => ({
      kind: "normal", species: "fallen", spriteFrame: 0, x, y: 250,
      hp: 100_000, maxHp: 100_000, speed: 0, r: 14, dmg: 2,
    } as any);
    const swingTotal = (aura: string | undefined, damage: number): number => {
      for (const key of Object.keys(auras)) delete auras[key];
      if (aura) auras[aura] = { remaining: 999, tick: 0 };
      const enemy = monster(270);
      component.enemies = [enemy];
      const before = enemy.hp;
      (component as any).dealMeleeDamage(enemy, damage);
      (component as any).flushPendingDamage();
      return before - enemy.hp;
    };

    // Each aura adds its guidebook column on top of the 100-damage swing:
    // Holy Fire 6-18, Holy Freeze 10-15 and Holy Shock 1-60.
    expect(swingTotal("Holy Fire", 100)).toBeCloseTo(100 + 12, 5);
    expect(swingTotal("Holy Freeze", 100)).toBeCloseTo(100 + 12.5, 5);
    expect(swingTotal("Holy Shock", 100)).toBeCloseTo(100 + 30.5, 5);
    // With no offensive aura running the swing is worth only itself.
    expect(swingTotal(undefined, 100)).toBeCloseTo(100, 5);

    // Synergies scale the added element: four Resist Lightning ranks add 48%.
    component.skillLevels = { ...component.skillLevels, "Resist Lightning": 4 };
    expect(swingTotal("Holy Shock", 100)).toBeCloseTo(100 + 30.5 * 1.48, 5);
    component.skillLevels = { ...component.skillLevels, "Resist Lightning": 0 };

    // Ranged weapon hits carry it as well: a bow shot lands physical + the
    // aura's own element.
    for (const key of Object.keys(auras)) delete auras[key];
    auras["Holy Shock"] = { remaining: 999, tick: 0 };
    const arrowed = monster(320);
    component.enemies = [arrowed];
    component.attackProjectiles = [];
    (component as any).fireBowAt(arrowed, 100);
    for (let step = 0; step < 20 && arrowed.hp >= 100_000; step += 1) {
      (component as any).rebuildEnemyGrid();
      (component as any).updateAttackProjectiles(20);
      (component as any).flushPendingDamage();
    }
    expect(100_000 - arrowed.hp).withContext("the arrow carries the aura").toBeCloseTo(100 + 30.5, 5);
  });

  it("takes every offensive aura's numbers from its guidebook column", () => {
    component.selectedClass = "paladin";
    component.runActive = true;
    component.skillLevels = {
      Might: 20, Concentration: 20, Fanaticism: 20, "Blessed Aim": 20, Thorns: 20,
      Conviction: 20, Sanctuary: 20, "Holy Fire": 20, "Holy Freeze": 20, "Holy Shock": 20,
    };
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    const only = (skill: string): void => {
      for (const key of Object.keys(auras)) delete auras[key];
      auras[skill] = { remaining: 999, tick: 0 };
    };
    const stats = (skill: string, rank: number): string =>
      (component as any).getSkillRankStats(skill, "aura", rank).join(" | ");

    // Might: 40% at rank 1, 230% at rank 20, melee only.
    only("Might");
    expect((component as any).applyPaladinAuraDamage(100, true)).toBeCloseTo(330, 5);
    expect((component as any).applyPaladinAuraDamage(100)).toBeCloseTo(100, 5);
    expect(stats("Might", 1)).toContain("+40% melee damage");

    // Concentration: 60% at rank 1, 345% at rank 20, half to Blessed Hammer.
    only("Concentration");
    expect((component as any).applyPaladinAuraDamage(100, true)).toBeCloseTo(445, 5);
    expect((component as any).applyPaladinAuraDamage(100)).toBeCloseTo(272.5, 5);
    expect(stats("Concentration", 1)).toContain("+60% damage to every attack");

    // Fanaticism: 50/14/40 at rank 1, 373/35/135 at rank 20.
    only("Fanaticism");
    expect((component as any).applyPaladinAuraDamage(100, true)).toBeCloseTo(473, 5);
    expect(stats("Fanaticism", 1)).toContain("+50% damage to you");
    expect(stats("Fanaticism", 20)).toContain("+35% attack speed");
    expect(stats("Fanaticism", 20)).toContain("+135% Attack Rating");

    // Blessed Aim: 75% at rank 1, 360% at rank 20, 5% a hard point when off.
    only("Blessed Aim");
    expect(stats("Blessed Aim", 1)).toContain("+75% Attack Rating");
    expect(stats("Blessed Aim", 20)).toContain("+360% Attack Rating");
    expect(stats("Blessed Aim", 20)).toContain("Keeps +100% Attack Rating (5.0% critical strike)");

    // Thorns: 250% at rank 1, 1010% at rank 20.
    only("Thorns");
    expect(component.thornsDamagePercent).toBe(1010);
    expect(stats("Thorns", 1)).toContain("250% of melee damage taken returned");

    // Conviction: -49%/-90% Defense, -30%/-125% resistances, capped at -150%.
    only("Conviction");
    expect(component.convictionDefenseReductionPercent).toBe(90);
    expect(stats("Conviction", 1)).toContain("-49% Defense");
    expect(stats("Conviction", 1)).toContain("-30% fire, cold and lightning resistance nearby");
    expect(stats("Conviction", 20)).toContain("-90% Defense");
    expect(stats("Conviction", 20)).toContain("-125% fire, cold and lightning resistance nearby");
    expect((component as any).convictionResistanceReduction(25)).toBe(150);
    expect((component as any).convictionResistanceReduction(40)).toBe(150);

    // Sanctuary: 8-16 magic at rank 1, 88-108 at rank 20 (98 stored), and the
    // 150% to 720% column against the undead.
    expect(stats("Sanctuary", 1)).toContain("12 magic damage a second");
    expect(stats("Sanctuary", 1)).toContain("150% melee damage against the undead");
    expect(stats("Sanctuary", 20)).toContain("98 magic damage a second");
    expect(stats("Sanctuary", 20)).toContain("720% melee damage against the undead");

    // The elemental auras carry both of their columns: the pulse and the
    // damage they add to every attack.
    expect(stats("Holy Fire", 1)).toContain("2 fire damage a second");
    expect(stats("Holy Fire", 1)).toContain("Adds 12 fire damage to every attack");
    expect(stats("Holy Fire", 20)).toContain("19.5 fire damage a second");
    expect(stats("Holy Fire", 20)).toContain("Adds 118 fire damage to every attack");

    expect(stats("Holy Freeze", 1)).toContain("2.5 cold damage a second");
    expect(stats("Holy Freeze", 1)).toContain("Slows enemies by 30%");
    expect(stats("Holy Freeze", 20)).toContain("37.5 cold damage a second");
    expect(stats("Holy Freeze", 20)).toContain("Adds 187.5 cold damage to every attack");
    expect(stats("Holy Freeze", 20)).toContain("Slows enemies by 54%");

    expect(stats("Holy Shock", 1)).toContain("5.5 lightning damage a second");
    expect(stats("Holy Shock", 1)).toContain("Adds 30.5 lightning damage to every attack");
    expect(stats("Holy Shock", 20)).toContain("78.5 lightning damage a second");
    expect(stats("Holy Shock", 20)).toContain("Adds 468.5 lightning damage to every attack");
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

    // Might rank 5 is +80% melee damage from the guidebook table.
    expect((component as any).applyPaladinAuraDamage(100, true)).toBe(180);
    expect((component as any).applyPaladinAuraDamage(100)).toBe(100);
    expect((component as any).getSkillRankStats("Might", "aura", 5))
      .toContain("+80% melee damage to you and your servants");

    const enemy = {
      kind: "normal", species: "fallen", spriteFrame: 0, x: 260, y: 250,
      hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2,
    } as any;
    component.enemies = [enemy];
    (component as any).attackCooldown = 0;
    component.attackNearestEnemy();
    expect(enemy.hp).toBe(820);

    component.attackProjectiles.length = 0;
    component.activateOwnedSkill("Blessed Hammer");
    // Might is melee-only, and Blessed Hammer uses its own 12-16 spell table.
    expect(component.attackProjectiles[0].damage).toBe(14);
  });

  it("follows the offensive aura tables for damage, speed and thorns", () => {
    component.selectedClass = "paladin";
    component.skillLevels = { Might: 1, Concentration: 1, Fanaticism: 1, "Blessed Aim": 4, Thorns: 1, "Holy Freeze": 1, Conviction: 1 };
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    for (const key of Object.keys(auras)) delete auras[key];

    auras["Might"] = { remaining: 10, tick: 0 };
    expect((component as any).applyPaladinAuraDamage(100, true)).toBe(140);
    expect((component as any).applyPaladinAuraDamage(100)).toBe(100);
    delete auras["Might"];

    // Concentration rank 1 is +60% to attacks, half of it to Blessed Hammer.
    auras["Concentration"] = { remaining: 10, tick: 0 };
    expect((component as any).applyPaladinAuraDamage(100, true)).toBe(160);
    expect((component as any).applyPaladinAuraDamage(100)).toBe(130);
    delete auras["Concentration"];

    // Fanaticism rank 1 is +50% damage, +14% attack speed and +40% attack.
    auras["Fanaticism"] = { remaining: 10, tick: 0 };
    expect((component as any).applyPaladinAuraDamage(100, true)).toBe(150);
    const fanaticCooldown = (component as any).paladinAuraAttackCooldown();
    expect(fanaticCooldown).toBeCloseTo(component.basicAttackCooldown * 0.86 / component.playerAttackSpeedMultiplier, 5);
    delete auras["Fanaticism"];

    // Blessed Aim's attack rating becomes critical-strike weight, and keeps a
    // 5%-a-hard-point passive while switched off.
    auras["Blessed Aim"] = { remaining: 10, tick: 0 };
    // Rank 4 is +120% attack rating, read as 6% critical strike.
    expect(component.paladinAuraCriticalBonus).toBeCloseTo(120 * 0.05);
    expect(component.criticalStrikeChance).toBeCloseTo(6);
    delete auras["Blessed Aim"];
    expect(component.paladinAuraCriticalBonus).toBeCloseTo(4 * 5 * 0.05);

    // Thorns rank 1 returns 250% of the melee damage taken.
    auras["Thorns"] = { remaining: 10, tick: 0 };
    expect(component.thornsDamagePercent).toBe(250);
    delete auras["Thorns"];

    // Holy Freeze rank 1 slows by 30%; Conviction rank 1 strips 49% Defense.
    auras["Holy Freeze"] = { remaining: 10, tick: 0 };
    component.playerX = 250;
    component.playerY = 250;
    const slowed = { kind: "normal", species: "fallen", spriteFrame: 0, x: 300, y: 250, hp: 100, maxHp: 100, speed: 100, r: 14, dmg: 2 } as any;
    expect((component as any).enemyMoveSpeed(slowed)).toBeCloseTo(70);
    delete auras["Holy Freeze"];
    auras["Conviction"] = { remaining: 10, tick: 0 };
    expect(component.convictionDefenseReductionPercent).toBe(49);
    delete auras["Conviction"];
  });

  it("burns, shocks and redeems the undead with the aura ticks", () => {
    component.selectedClass = "paladin";
    component.playerX = 250;
    component.playerY = 250;
    component.runActive = true;
    component.skillLevels = { "Holy Fire": 1, "Resist Fire": 2, Salvation: 1, Sanctuary: 1, Cleansing: 2 };
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    for (const key of Object.keys(auras)) delete auras[key];

    const near = { kind: "normal", species: "fallen", spriteFrame: 0, x: 270, y: 250, hp: 500, maxHp: 500, speed: 100, r: 14, dmg: 2 } as any;
    const undead = { ...near, species: "skeleton" };
    component.enemies = [near, undead];
    (component as any).rebuildEnemyGrid();
    (component as any).pendingDamage.clear();

    auras["Holy Fire"] = { remaining: 10, tick: 0 };
    (component as any).applyPaladinAuraTick("Holy Fire");
    // 2 base at rank 1, +36% from two Resist Fire ranks and +6% from Salvation.
    expect((component as any).pendingDamage.get(near)?.damage ?? 0).toBeCloseTo(2 * 1.42);

    // Sanctuary rank 1 burns the undead for 150% of its 12 magic damage,
    // plus 7% a rank of Cleansing.
    (component as any).pendingDamage.clear();
    (component as any).rebuildEnemyGrid();
    auras["Sanctuary"] = { remaining: 10, tick: 0 };
    (component as any).applyPaladinAuraTick("Sanctuary");
    expect((component as any).pendingDamage.get(undead)?.damage ?? 0).toBeCloseTo(12 * 1.14 * 2.5);
    expect((component as any).pendingDamage.get(near)?.damage ?? 0).toBeCloseTo(12 * 1.14);
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
    // The guidebook's walk/run column: +13% at rank 1, +30% at rank 6.
    expect(rankSixStep / rankOneStep).toBeCloseTo(1.30 / 1.13, 5);

    const stats = (component as any).getSkillRankStats("Vigor", "aura", 6) as string[];
    expect(stats).toContain("Active duration: 20.00s");
    expect(stats).toContain("+30% walk and run speed");
  });

  it("follows the defensive aura tables for radius, resistance and Defense", () => {
    component.selectedClass = "paladin";
    component.skillLevels = {
      "Resist Fire": 10, "Resist Cold": 1, Salvation: 1, Defiance: 5, Vigor: 20, VigorCheck: 0,
    };
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    for (const key of Object.keys(auras)) delete auras[key];

    // Radius columns, in the arena's 20-units-per-yard scale.
    expect((component as any).paladinAuraRadius("Prayer", 1)).toBe(212);
    expect((component as any).paladinAuraRadius("Prayer", 20)).toBe(720);
    expect((component as any).paladinAuraRadius("Meditation", 1)).toBe(146);
    expect((component as any).paladinAuraRadius("Vigor", 20)).toBe(960);

    // Resist Fire rank 10 is +113% and +10 maximum resistance while it runs.
    auras["Resist Fire"] = { remaining: 10, tick: 0 };
    expect(component.paladinFireResistanceBonus).toBe(113);
    // The aura's own +10 maximum resistance lifts the 75% cap to 85%.
    expect(component.equippedFireResistance).toBe(85);
    expect(component.paladinMaxFireResistanceBonus).toBe(10);

    // Switched off, the paladin keeps half the maximum-resistance bonus.
    delete auras["Resist Fire"];
    expect(component.paladinFireResistanceBonus).toBe(0);
    expect(component.paladinMaxFireResistanceBonus).toBe(5);

    // Salvation covers fire, cold and lightning at +60% from rank 1.
    auras["Salvation"] = { remaining: 10, tick: 0 };
    expect(component.paladinFireResistanceBonus).toBe(60);
    expect(component.paladinColdResistanceBonus).toBe(60);
    expect(component.paladinLightningResistanceBonus).toBe(60);

    // Defiance rank 5 is +110% Defense, which avoids 19.8% of hits.
    auras["Defiance"] = { remaining: 10, tick: 0 };
    expect(component.defianceDefensePercent).toBe(110);
    // The one Defense roll every guard source feeds into is this one.
    expect(component.combatDefenseAvoidChance).toBeCloseTo(Math.min(45, 110 * 0.18) / 100);

    // Vigor's walk/run table ends at +43%.
    expect((component as any).vigorMovementSpeedMultiplier(1)).toBeCloseTo(1.13);
    expect((component as any).vigorMovementSpeedMultiplier(20)).toBeCloseTo(1.43);
  });

  it("heals, cleanses and restores mana from the auras' own ticks", () => {
    component.selectedClass = "paladin";
    component.skillLevels = { Prayer: 5, Cleansing: 1, Meditation: 1, Vigor: 1 };
    component.playerMaxHp = 500;
    component.playerHp = 400;
    component.playerMaxMana = 100;
    component.playerMana = 50;
    component.playerPoisonRemaining = 5;
    (component as any).playerChilledRemaining = 5;
    component.enemies = [];
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    for (const key of Object.keys(auras)) delete auras[key];

    auras["Prayer"] = { remaining: 10, tick: 0 };
    (component as any).applyPaladinAuraTick("Prayer");
    // Rank 5 heals 6 a second and costs 1.7 mana a second.
    expect(component.playerHp).toBe(406);
    expect(component.playerMana).toBeCloseTo(48.3);

    // Cleansing rank 1 shortens poison and chill by 39% and carries Prayer.
    auras["Cleansing"] = { remaining: 10, tick: 0 };
    (component as any).applyPaladinAuraTick("Cleansing");
    expect(component.playerPoisonRemaining).toBeLessThan(5);
    expect((component as any).playerChilledRemaining).toBeLessThan(5);
    expect(component.playerHp).toBeGreaterThan(406);

    // Meditation rank 1 restores 6% of the pool a second.
    component.playerMana = 50;
    auras["Meditation"] = { remaining: 10, tick: 0 };
    (component as any).applyPaladinAuraTick("Meditation");
    expect(component.playerMana).toBeCloseTo(56);

    // Only one aura may burn: focusing Prayer drops the others.
    auras["Vigor"] = { remaining: 10, tick: 0 };
    (component as any).focusPaladinAura("Prayer");
    expect(Object.keys(auras)).toEqual(["Prayer"]);
  });

  it("reads Redemption's chance and recovery from its table", () => {
    component.selectedClass = "paladin";
    component.skillLevels = { Redemption: 1 };
    const auras = (component as any).activePaladinAuras as Record<string, { remaining: number; tick: number }>;
    for (const key of Object.keys(auras)) delete auras[key];
    expect(component.redemptionChancePercent).toBe(0);
    expect(component.redemptionRecovery).toBe(0);

    auras["Redemption"] = { remaining: 10, tick: 0 };
    expect(component.redemptionChancePercent).toBe(23);
    expect(component.redemptionRecovery).toBe(25);

    component.skillLevels = { Redemption: 20 };
    expect(component.redemptionChancePercent).toBe(85);
    expect(component.redemptionRecovery).toBe(120);
  });

  it("extends a running Vigor aura when a skill point raises its rank", () => {
    component.selectedClass = "paladin";
    component.playerLevel = 30;
    component.ownedSkills = ["Prayer", "Cleansing", "Defiance", "Vigor"];
    component.skillLevels = { Vigor: 1 };
    component.skillPoints = 1;
    (component as any).activePaladinAuras["Vigor"] = { remaining: 5, tick: 0 };
    spyOnProperty(component, "availableClassSkills", "get").and.returnValue([{ name: "Vigor" } as any]);
    spyOn(component as any, "persistRunProgress");

    component.spendSkillPoint("Vigor");

    expect(component.skillLevels["Vigor"]).toBe(2);
    expect((component as any).activePaladinAuras["Vigor"].remaining).toBeCloseTo(7, 5);
  });

  it("preloads and decodes every paladin aura when a paladin run opens", () => {
    const preload = spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadRunAssets("paladin");

    expect(preload.calls.allArgs().map((args) => args[0]).sort()).toEqual(Object.keys(PALADIN_AURA_ART).sort());
    expect(component.assetsTotal).toBeGreaterThanOrEqual(Object.keys(PALADIN_AURA_ART).length);
  });

  it("keeps class-specific aura sheets out of the menu warm-up", () => {
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));
    const paladinPreload = spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());

    (component as any).preloadMenuAssets();

    expect(paladinPreload).not.toHaveBeenCalled();
    expect(component.assetsReady).toBeTrue();
  });

  it("holds the run behind the loading cel until its own class art is in", async () => {
    const preload = spyOn(component as any, "preloadRunAssets").and.returnValue(Promise.resolve());
    component.selectedClass = "barbarian";

    (component as any).beginRunLoadingScreen();

    expect(component.loadingScreenActive).toBeTrue();
    expect(preload).toHaveBeenCalledWith("barbarian");
    expect(component.loadingScreenArt.frames).toBe(10);

    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(component.loadingScreenActive).toBeFalse();
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
    component.runActive = true;
    component.ownedSkills = ["Frozen Armor"];
    component.skillLevels = { "Frozen Armor": 1 };
    expect((component as any).activeArmorAuraSkill()).toBeNull();

    component.activateOwnedSkill("Frozen Armor");
    expect((component as any).activeArmorAuraSkill()).toBe("Frozen Armor");

    component.ownedSkills.push("Shiver Armor");
    component.skillLevels["Shiver Armor"] = 1;
    component.activateOwnedSkill("Shiver Armor");
    expect((component as any).activeArmorAuraSkill()).toBe("Shiver Armor");

    component.ownedSkills.push("Chilling Armor");
    component.skillLevels["Chilling Armor"] = 1;
    component.activateOwnedSkill("Chilling Armor");
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

  it("streams the Bone Armor sheet when a run opens", async () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadArmorAuraImage").and.returnValue(Promise.resolve());
    const fetchSpy = spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadRunAssets("necromancer");
    // The warm-up now feeds URLs through the bounded art queue, so let it drain.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy.calls.allArgs().map((args) => args[0])).toContain(BONE_ARMOR_ART.path);
  });

  it("preloads all three armor aura sheets when a run opens", () => {
    spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    const preload = spyOn(component as any, "preloadArmorAuraImage").and.returnValue(Promise.resolve());
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadRunAssets("amazon");

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
    const poisonings: any[] = [];
    spyOn(component as any, "applyEnemyPoison").and.callFake((enemy: any) => poisonings.push(enemy));

    component.activateOwnedSkill("Poison Nova");

    expect(poisonings).toContain(inside);
    expect(poisonings).toContain(edge);
    expect(poisonings).not.toContain(outside);
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
    // Rank one reaches 3.3 yards (66 units), so 64 units is in and 90 is out.
    const edge = { ...base, x: 314 };
    const outside = { ...base, x: 340 };
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
    expect(effect.fieldRadius).toBe(66);
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
    expect(effect.fieldRadius).toBe(120);
    expect((component as any).getSkillRankStats("Static Field", "burst", 5)).toContain("Blast radius: 6 yards");
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
      // A doorway further down the wall gives the detour somewhere to go. It is
      // wider than the detour grid's cell so a node lands inside it.
      if (y >= 52 && y <= 84) continue;
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
    (component as any).detourSearchesLeft = 4;
    const step = (component as any).enemyWallAwareStep(wallContext, enemy, 1, 0, 20, 100, 50);

    // The monster walks a planned detour toward the doorway instead of grinding
    // straight into the brickwork.
    expect(step.x).not.toBe(40);
    expect(step.y).toBeGreaterThan(50);
    expect((component as any).campaignBlockedSamples(wallContext, step.x, step.y)).toBe(0);
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
    expect(blast.freezeSeconds).toBe(3);
    expect(blast.color).toBe("#8bdcff");
    for (let frame = 0; frame < 40; frame += 1) (component as any).updateAttackProjectiles(16);
    (component as any).flushPendingDamage();

    expect(primary.hp).toBeLessThan(100);
    expect(nearby.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    // Rank-one Ice Blast freezes for the guidebook's 3 seconds.
    expect(primary.freezeRemaining).toBeCloseTo(3);
    expect(nearby.freezeRemaining).toBeCloseTo(3);
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
    const base = { kind: "normal", species: "fallen", spriteFrame: 0, x: 310, y: 250, hp: 1000, maxHp: 1000, speed: 100, r: 14, dmg: 2 } as any;
    const inside = { ...base };
    // At 32 degrees off-centre this was outside the old 15-degree beam but is
    // inside the new close, wide breath.
    const wide = { ...base, x: 300, y: 284 };
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
    expect(effect.coneRange).toBe(66);
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
    expect((component as any).blazeRemaining).toBeCloseTo(4.6, 5);
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
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeFalse();
    component.enemies = enemyAt(180);
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeTrue();

    // Inferno breathes the guidebook's 3.3 yards at rank one (66 units) and
    // 12.6 yards at rank twenty (252).
    component.selectedClass = "sorceress";
    component.ownedSkills = ["Inferno"];
    component.skillLevels = { Inferno: 1 };
    (component as any).basicAttackSpell = "Inferno";
    component.enemies = enemyAt(100);
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeFalse();
    component.enemies = enemyAt(60);
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeTrue();
    component.skillLevels = { Inferno: 20 };
    component.enemies = enemyAt(240);
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeTrue();
    component.enemies = enemyAt(300);
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeFalse();

    // Blaze burns under the sorceress's own feet, so it needs no monster at all.
    component.ownedSkills = ["Blaze"];
    component.skillLevels = { Blaze: 1 };
    (component as any).basicAttackSpell = "Blaze";
    component.enemies = [];
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeTrue();

    // A plain missile spell keeps its full travel: 300 units still counts.
    component.ownedSkills = ["Fire Bolt"];
    component.skillLevels = { "Fire Bolt": 1 };
    (component as any).basicAttackSpell = "Fire Bolt";
    component.enemies = enemyAt(300);
    expect((component as any).hasEnemyInSlotReach(component.basicAttackSpell)).toBeTrue();
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

  it("reads one eight-row block per clip for every stacked sheet", () => {
    // Walk, attack and the appended idle block each own one eight-row band.
    expect(enemySpriteDirectionRow("goatman", "move", 24, 3)).toBe(3);
    expect(enemySpriteDirectionRow("goatman", "attack", 24, 3)).toBe(11);
    expect(enemySpriteDirectionRow("goatman", "idle", 24, 3)).toBe(19);

    // The skeleton draws the same 16x24 atlas as the skeleton warrior: walk on
    // the direction row, attack one band down, and the appended idle block below.
    expect(enemySpriteDirectionRow("skeleton", "move", 24, 5)).toBe(5);
    expect(enemySpriteDirectionRow("skeleton", "attack", 24, 5)).toBe(13);
    expect(enemySpriteDirectionRow("skeleton", "idle", 24, 5)).toBe(21);

    // The pets, golems and Duriel carry an appended idle block too, so waiting
    // reads the block below the attack band instead of a frozen walk cel.
    for (const species of ["wolf", "grizzly", "bloodGolem", "fireGolem", "ironGolem", "duriel"]) {
      expect(enemySpriteDirectionRow(species as any, "move", 24, 2)).withContext(species).toBe(2);
      expect(enemySpriteDirectionRow(species as any, "attack", 24, 2)).withContext(species).toBe(10);
      expect(enemySpriteDirectionRow(species as any, "idle", 24, 2)).withContext(species).toBe(18);
    }

    // Every stacked sheet still resolves a real direction instead of falling back
    // to row 0, which is what a missing layout entry would do.
    const stacked = [
      "goatman", "skeletonWarrior", "balrog", "bloodLord", "spiderDemon", "spikeFiend",
      "fetishShaman", "scarab", "sandRaider", "sandMaggotYoung", "salamander", "regurgitator",
      "nihlathak", "minotaur", "leaper", "blunderbore", "siegeBeast", "vileChild", "vileMother",
      "skeleton", "wolf", "grizzly", "bloodGolem", "fireGolem", "ironGolem", "duriel",
    ];
    // A sheet whose layout still says sixteen rows would divide into five and a
    // third and fall back to row 0, so this loop catches a missing one.

    for (const species of stacked) {
      const row = enemySpriteRow(species as any, 1, 0);
      expect(row).withContext(species).toBeGreaterThanOrEqual(0);
      expect(row).withContext(species).toBeLessThan(8);
    }
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

  it("scales a smaller wereform attack row back to the walk body size", () => {
    // Measured from werewolf.png: the walk rows carry a ~106px body, while the
    // left-facing attack row only carries ~65px, so the wolf used to shrink for
    // the whole swing. Big differences are corrected, small ones barely at all.
    expect(wereformAttackRowScale(106, 65)).toBe(1.6);
    expect(wereformAttackRowScale(106, 70)).toBeCloseTo(1.514, 3);
    expect(wereformAttackRowScale(106, 104)).toBeCloseTo(1.019, 3);
    // A row already at walk size is left alone, and an empty cel never scales.
    expect(wereformAttackRowScale(106, 106)).toBe(1);
    expect(wereformAttackRowScale(106, 120)).toBe(1);
    expect(wereformAttackRowScale(106, 0)).toBe(1);
  });

  it("draws the wereform attack at the walk body size and foot line", () => {
    const frames: HTMLCanvasElement[][] = [];
    for (let row = 0; row < 16; row += 1) {
      frames.push([]);
      for (let column = 0; column < 13; column += 1) {
        const cel = document.createElement("canvas");
        cel.width = 4;
        cel.height = 4;
        frames[row].push(cel);
      }
    }
    const rowScales = new Array(16).fill(1);
    const rowFootRatios = new Array(16).fill(0.94);
    // The attack row is sliced at about two thirds of the walk body size.
    rowScales[13] = wereformAttackRowScale(106, 70);
    rowFootRatios[13] = 1;
    (component as any).druidAnimations.werebear = {
      frames, columns: 13, rows: 16, frameDurationMs: 85, rowScales, rowFootRatios,
    };
    (component as any).druidForm = "werebear";
    (component as any).playerFacingX = 1;
    (component as any).playerFacingY = 0;
    component.playerX = 250;
    component.playerY = 250;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const ctx = jasmine.createSpyObj<CanvasRenderingContext2D>("ctx", ["save", "restore", "beginPath", "ellipse", "fill", "drawImage"]);
    const height = 92 * (component as any).worldZoom;
    const scale = wereformAttackRowScale(106, 70);

    (component as any).druidFormAttackTime = 0.5;
    (component as any).isPlayerMoving = false;
    (component as any).drawDruidForm(ctx);

    const attack = ctx.drawImage.calls.mostRecent().args as unknown as number[];
    expect(attack[3]).toBeCloseTo(height * scale, 5);
    expect(attack[4]).toBeCloseTo(height * scale, 5);
    // The cel's foot line still lands on the walk ground line, not above it.
    expect((attack[2] as number) + height * scale).toBeCloseTo(250 + height * 0.14, 5);

    ctx.drawImage.calls.reset();
    (component as any).druidFormAttackTime = 0;
    (component as any).isPlayerMoving = true;
    (component as any).drawDruidForm(ctx);

    const walk = ctx.drawImage.calls.mostRecent().args as unknown as number[];
    expect(walk[3]).toBeCloseTo(height, 5);
    expect(walk[2]).toBeCloseTo(250 - height * 0.86, 5);
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

  it("never drops a white, rare or set charm", () => {
    // Diablo II only has magic charms and the named unique ones (Gheed's
    // Fortune, Hellfire Torch, the sunder charms), so a charm base that rolls
    // any other rarity arrives with one magic prefix and/or suffix instead.
    const charms: any[] = [];
    for (let index = 0; index < 900; index += 1) {
      const item = (component as any).randomItem(40) as any;
      if (item.slot === "charm" && item.equipmentType === "charm") charms.push(item);
    }
    expect(charms.length).toBeGreaterThan(0);
    expect(charms.every((charm) => charm.rarity === "magic" || charm.rarity === "unique")).toBeTrue();
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

    // The well poisons what it catches for the guidebook's seconds; the cast
    // itself pays out nothing at once.
    expect(target.hp).toBe(100);
    expect(target.poisonRemaining).toBe(2);
    expect(target.poisonDps).toBeCloseTo((component as any).necromancerBoneDamage("Poison Explosion") / 2, 5);
    expect(far.poisonRemaining).toBeUndefined();
    expect(cloud.life).toBe(2);
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

    expect(inside.poisonRemaining).toBe(2);
    expect((component as any).poisonClouds[0].damagePerTick).toBe(0);
    expect(outside.poisonRemaining).toBeUndefined();
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
    // The guidebook's 2s, plus 0.4 a rank.
    expect(low.life).toBe(2);
    expect(high.life).toBeCloseTo(5.6, 5);
    expect((component as any).getSkillRankStats("Poison Explosion", "burst", 10))
      .toContain("Ranged cast: a 112-unit poison well opens at the target's location");
  });

  it("ticks poison over its guidebook seconds and refreshes instead of stacking", () => {
    component.selectedClass = "necromancer";
    component.runActive = true;
    component.playerX = 250;
    component.playerY = 250;
    component.playerMana = 5000;
    component.ownedSkills = ["Poison Nova", "Poison Dagger"];
    component.skillLevels = { "Poison Nova": 1, "Poison Dagger": 1 };
    const target = { kind: "normal", species: "fallen", spriteFrame: 0, x: 262, y: 250, hp: 1000, maxHp: 1000, speed: 0, r: 14, dmg: 0 } as any;
    component.enemies = [target];
    component.attackProjectiles = [];
    (component as any).skillVisualEffects.length = 0;
    (component as any).playerAttackLockRemaining = 0;
    (component as any).attackCooldown = 0;
    (component as any).rebuildEnemyGrid();

    // Poison Nova lands nothing at once: its packet is paid across two seconds.
    const novaPacket = (component as any).necromancerBoneDamage("Poison Nova");
    component.activateOwnedSkill("Poison Nova");
    expect(target.hp).toBe(1000);
    expect(target.poisonRemaining).toBe(2);
    expect(target.poisonDps).toBeCloseTo(novaPacket / 2, 5);

    for (let tick = 0; tick < 4; tick += 1) (component as any).updateEnemyPoison(target, 0.5);
    (component as any).flushPendingDamage();
    expect(target.hp).toBeCloseTo(1000 - novaPacket, 5);
    expect(target.poisonRemaining).toBe(0);

    // A second dose refreshes the timer and the rate rather than stacking.
    (component as any).applyEnemyPoison(target, 100, 2);
    (component as any).updateEnemyPoison(target, 1);
    (component as any).applyEnemyPoison(target, 60, 2);
    expect(target.poisonRemaining).toBe(2);
    expect(target.poisonDps).toBe(30);

    // Poison Dagger splits the stab from its poison packet.
    const packet = (component as any).necromancerBoneDamage("Poison Dagger");
    const weaponHit = (component as any).skillCastDamage("Poison Dagger");
    const before = target.hp;
    (component as any).skillCastCooldowns = {};
    component.activateOwnedSkill("Poison Dagger", target);
    expect(before - target.hp).toBeCloseTo(weaponHit, 5);
    expect(target.poisonRemaining).toBe(2);
    expect(target.poisonDps).toBeCloseTo(packet / 2, 5);
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
    expect(wall.life).toBeCloseTo(3.6, 5);
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
    (component as any).updateAttackProjectiles(3500);
    expect(component.attackProjectiles).toContain(wall);
    (component as any).updateAttackProjectiles(200);
    expect(component.attackProjectiles).not.toContain(wall);
  });

  it("flies the shaman's fireball nose-first and turns its blue cels orange", () => {
    const frames = Array.from({ length: 3 }, () => ({ width: 51, height: 38 }));
    (component as any).missileOverlayImages.set("d2-shamanfireball", frames);
    (component as any).worldZoom = 1;
    (component as any).projectionDpr = 1;
    (component as any).projectionCenterX = 400;
    (component as any).projectionCenterY = 400;
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const drawImage = jasmine.createSpy("drawImage");
    const rotate = jasmine.createSpy("rotate");
    const ctx = {
      save: () => undefined, restore: () => undefined, translate: () => undefined, rotate,
      drawImage, globalAlpha: 1, filter: "", shadowColor: "", shadowBlur: 0,
      globalCompositeOperation: "source-over",
    } as any;
    const fireball = {
      x: 300, y: 260, startX: 200, startY: 260, targetX: 300, targetY: 260,
      speed: 235, damage: 4, life: 2, age: 0.1, radius: 7,
      color: "#ff7433", kind: "fire", missileId: "d2-shamanfireball",
    } as any;
    component.attackProjectiles = [fireball];

    (component as any).drawAttackProjectile(ctx, fireball);

    expect(drawImage).toHaveBeenCalled();
    // The cel's head sits lower-left, so the flight vector needs Fire Ball's
    // own -135 degree correction or the fireball travels tail-first.
    expect(rotate).toHaveBeenCalledWith(-3 * Math.PI / 4);
    // The DCC's blue palette is recoloured to the missile's fire orange.
    expect(ctx.filter).toBe("hue-rotate(180deg) saturate(1.45) brightness(1.12)");
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
    // The guidebook's rank one wave: 5-10 fire, a 7.5 average a fireball.
    expect(fireballs.every((projectile) => projectile.damage === 7.5)).toBeTrue();
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

  it("draws Lightning as one jagged arc from the caster, not a bundle of branches", () => {
    // The reference bolt is a single thin white core with a soft blue halo and a
    // couple of finger-length spurs. Stamping the LightningBolt cel over itself
    // drew parallel streaks that read as branches, so the rail is now one
    // midpoint-displaced polyline stroked halo-first.
    const paths: Array<Array<{ x: number; y: number }>> = [];
    const widths: number[] = [];
    let current: Array<{ x: number; y: number }> = [];
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined,
      beginPath: () => { current = []; },
      moveTo: (x: number, y: number) => { current.push({ x, y }); },
      lineTo: (x: number, y: number) => { current.push({ x, y }); },
      stroke: () => { paths.push(current); widths.push(ctx.lineWidth); },
      drawImage,
      lineWidth: 1, strokeStyle: "", globalAlpha: 1, lineJoin: "", lineCap: "",
      globalCompositeOperation: "", imageSmoothingEnabled: false,
    } as any;
    (component as any).skillEffectsCanvasRef = {
      nativeElement: {
        clientWidth: 1000, width: 1000, height: 600,
        getContext: () => ({ clearRect: () => undefined }),
      },
    };
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const effect = {
      lightningRail: true, x: 100, y: 300, targetX: 5000, targetY: 300,
      time: 0.1, duration: 0.32, seed: 7,
    } as any;

    (component as any).drawLightningRail(ctx, effect);

    expect(drawImage).not.toHaveBeenCalled();
    // Four halo-to-core passes over the arc, then two spurs at two passes each.
    expect(paths.length).toBe(8);
    expect(widths.slice(0, 4)).toEqual([14, 7, 3.4, 1.6]);

    const boltLength = 984;
    const arc = paths[0];
    expect(arc[0].x).toBeCloseTo(80, 5);
    expect(arc[0].y).toBeCloseTo(300, 5);
    expect(arc[arc.length - 1].x).toBeCloseTo(80 + boltLength, 5);
    expect(arc[arc.length - 1].y).toBeCloseTo(300, 5);
    expect(arc.length).toBe(15);
    // Every vertex is a bend of the one arc: the walk stays inside the allowed
    // spread, so nothing strays far off the aim line, and every glow pass reuses
    // the same vertices.
    for (const point of arc) expect(Math.abs(point.y - 300)).toBeLessThanOrEqual(80);
    for (const pass of paths.slice(1, 4)) expect(pass).toEqual(arc);

    // The spurs are finger-length offshoots, not long forks.
    for (const spur of paths.slice(4)) {
      const reach = Math.hypot(spur[spur.length - 1].x - spur[0].x, spur[spur.length - 1].y - spur[0].y);
      expect(reach).toBeGreaterThan(12);
      expect(reach).toBeLessThan(0.13 * boltLength);
    }
  });

  it("arcs Chain Lightning hops as the same jagged bolt, thinned for a jump", () => {
    const paths: Array<Array<{ x: number; y: number }>> = [];
    const widths: number[] = [];
    let current: Array<{ x: number; y: number }> = [];
    const drawImage = jasmine.createSpy("drawImage");
    const ctx = {
      save: () => undefined, restore: () => undefined,
      beginPath: () => { current = []; },
      moveTo: (x: number, y: number) => { current.push({ x, y }); },
      lineTo: (x: number, y: number) => { current.push({ x, y }); },
      stroke: () => { paths.push(current); widths.push(ctx.lineWidth); },
      drawImage,
      lineWidth: 1, strokeStyle: "", globalAlpha: 1, lineJoin: "", lineCap: "",
      globalCompositeOperation: "",
    } as any;

    (component as any).drawChainLightningHopArc(ctx, { x: 200, y: 300 }, { x: 420, y: 340 }, 0.25);

    // The hop is no longer a stamped cel: it is the Lightning skill's own arc
    // from the monster just struck to the bolt's current position.
    expect(drawImage).not.toHaveBeenCalled();
    expect(paths.length).toBe(6);
    const arc = paths[0];
    expect(arc[0]).toEqual({ x: 200, y: 300 });
    expect(arc[arc.length - 1]).toEqual({ x: 420, y: 340 });
    expect(arc.length).toBeGreaterThan(4);
    expect(widths[0]).toBeCloseTo(8.4, 5);
    expect(widths[1]).toBeCloseTo(4.2, 5);
    expect(widths[2]).toBeCloseTo(2.04, 5);
    expect(widths[3]).toBeCloseTo(0.96, 5);
    for (const pass of paths.slice(1, 4)) expect(pass).toEqual(arc);

    // One short spur, not branches.
    const spur = paths[4];
    const spurReach = Math.hypot(spur[spur.length - 1].x - spur[0].x, spur[spur.length - 1].y - spur[0].y);
    expect(spurReach).toBeGreaterThan(10);
    expect(spurReach).toBeLessThan(0.15 * Math.hypot(220, 40));
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

  it("plans a short detour around a house instead of grinding on its wall", () => {
    const mask = { width: 160, height: 160, blocked: new Uint8Array(160 * 160) };
    for (let y = 60; y <= 100; y += 1) {
      for (let column = 70; column <= 90; column += 1) mask.blocked[y * 160 + column] = 1;
    }
    (component as any).campaignCollisionMasks[2] = mask;
    (component as any).currentAct = 2;
    component.playerX = 120;
    component.playerY = 80;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const context = (component as any).campaignCollisionContext();

    const route = (component as any).planEnemyDetour(context, { x: 40, y: 80 }, { x: 120, y: 80 });

    expect(route).not.toBeNull();
    expect(route.length).toBeGreaterThan(0);
    for (const point of route) {
      expect((component as any).campaignBlockedSamples(context, point.x, point.y)).toBe(0);
    }
    const last = route[route.length - 1];
    expect(Math.hypot(last.x - 120, last.y - 80)).toBeLessThan(30);
    expect(route.some((point: { y: number }) => point.y < 60 || point.y > 100)).toBeTrue();
  });

  it("keeps a boxed-in monster idle when no detour reaches the hero", () => {
    const mask = { width: 160, height: 160, blocked: new Uint8Array(160 * 160) };
    for (let y = 60; y <= 100; y += 1) {
      for (let column = 40; column <= 80; column += 1) {
        const border = column <= 43 || column >= 77 || y <= 63 || y >= 97;
        if (border) mask.blocked[y * 160 + column] = 1;
      }
    }
    (component as any).campaignCollisionMasks[2] = mask;
    (component as any).currentAct = 2;
    component.playerX = 140;
    component.playerY = 80;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    const context = (component as any).campaignCollisionContext();

    const enemy = (component as any).makeEnemy("normal", false, "fallen");
    enemy.x = 60;
    enemy.y = 80;
    enemy.detourPoints = undefined;
    enemy.detourRetry = 0;
    (component as any).detourSearchesLeft = 2;

    const step = (component as any).enemyWallAwareStep(context, enemy, 1, 0, 40, 140, 80, 0.016);

    expect(step.x).toBe(60);
    expect(step.y).toBe(80);
    expect(enemy.detourPoints).toBeUndefined();
    expect(enemy.detourRetry).toBeGreaterThan(0);
  });

  it("clears monster spawns against the wall mask in every act", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[60 * 100 + 60] = 1;
    (component as any).campaignCollisionMasks[1] = mask;
    (component as any).currentAct = 1;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));
    spyOn(Math, "random").and.returnValue(0.42);

    const enemy = (component as any).makeEnemy("normal", false, "fallen");
    const context = (component as any).campaignCollisionContext();

    expect((component as any).campaignBlockedSamples(context, enemy.x, enemy.y)).toBe(0);
  });

  it("moves a hatchling placed near its parent out of the wall", () => {
    const mask = { width: 100, height: 100, blocked: new Uint8Array(100 * 100) };
    mask.blocked[60 * 100 + 60] = 1;
    (component as any).campaignCollisionMasks[2] = mask;
    (component as any).currentAct = 2;
    component.playerX = 50;
    component.playerY = 50;
    spyOn(component as any, "campaignAreaBackdropGeometry").and.returnValue({ scale: 1, left: 0, top: 0 } as any);
    spyOn(component as any, "projectArenaPoint").and.callFake((x: number, y: number) => ({ x, y }));

    const young = (component as any).makeEnemy("normal", false, "sandMaggotYoung");
    young.x = 60;
    young.y = 60;
    (component as any).placeSpawnedEnemy(young);

    const context = (component as any).campaignCollisionContext();
    expect((component as any).campaignBlockedSamples(context, young.x, young.y)).toBe(0);
    expect({ x: young.x, y: young.y }).not.toEqual({ x: 60, y: 60 });
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

    // A skill socket and its open card live inside the game UI as well, so the
    // gauntlet has to keep tracking over them instead of freezing on the last
    // spot outside the panel.
    componentAny.hoveredSkillTooltip = {
      name: "Fire Bolt", art: "", x: 0, y: 0,
      currentStats: [], nextStats: [], prerequisites: [], reason: "",
    };
    componentAny.trackD2Cursor({
      pointerType: "mouse", clientX: 300, clientY: 200,
      target: { closest: (selector: string) => selector === ".d2s" || selector === ".d2s-tree-skill" ? {} : null },
    });
    expect(cursor.dataset.mode).toBe("default");
    expect(cursor.style.opacity).toBe("1");
    const [, socketX, socketY] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(cursor.style.transform)!;
    expect(Number(socketX)).toBeCloseTo(296.7);
    expect(Number(socketY)).toBeCloseTo(194.5);
    componentAny.hoveredSkillTooltip = null;
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

  it("preloads and decodes both druid spirit auras when a druid run opens", () => {
    const paladinPreload = spyOn(component as any, "preloadPaladinAuraImage").and.returnValue(Promise.resolve());
    const druidPreload = spyOn(component as any, "preloadDruidSpiritAuraImage").and.returnValue(Promise.resolve());
    spyOn(window, "fetch").and.returnValue(Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response));

    (component as any).preloadRunAssets("druid");

    expect(druidPreload.calls.allArgs().map((args) => args[0]).sort()).toEqual(Object.keys(DRUID_SPIRIT_AURA_ART).sort());
    expect(component.assetsTotal).toBeGreaterThanOrEqual(Object.keys(DRUID_SPIRIT_AURA_ART).length);
    expect(paladinPreload).not.toHaveBeenCalled();
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

  it("offers the saved journey only to the character on the select screen", () => {
    // One journey is saved at a time, so the select screen may only offer it for
    // the hero that owns it: picking another class must leave just the fresh
    // Act I button instead of resuming a stranger's run.
    const saved = {
      hasSavedRun: true, selectedClass: "barbarian", runId: "run-1",
      playerHp: 120, deathRecovery: false, runTime: 143,
    };
    spyOnProperty(component as any, "savedRun", "get").and.returnValue(saved);

    component.selectedClass = "barbarian";
    expect(component.canResumeSavedRun).toBeTrue();
    expect(component.canResumeSelectedRun).toBeTrue();
    expect(component.canResumeRunFromCharacterSelect).toBeTrue();
    expect(component.savedRunSummary).toContain("Barbarian");

    component.selectedClass = "amazon";
    expect(component.canResumeSavedRun).toBeTrue();
    expect(component.canResumeSelectedRun).toBeFalse();
    expect(component.canResumeRunFromCharacterSelect).toBeFalse();
  });

  it("speaks the class's line for the area the hero steps into", () => {
    component.selectedClass = "barbarian";
    (component as any).menuSoundPreferred = false;
    (component as any).speakHeroVoice(AREA_VOICE_EVENTS["Blood Moor"]);

    expect(component.heroSpeech?.speaker).toBe("Barbarian");
    expect(component.heroSpeech?.text).toBe("Beware foul demons and beasts.");

    (component as any).stopHeroVoice();
    expect(component.heroSpeech).toBeNull();
  });

  it("stays quiet in areas the original game gave no entry line", () => {
    component.selectedClass = "barbarian";
    (component as any).menuSoundPreferred = false;
    (component as any).speakHeroVoice(AREA_VOICE_EVENTS["Cold Plains"]);

    expect(component.heroSpeech).toBeNull();
  });

  it("has a recorded line for every class, area entry and act boss it triggers", () => {
    for (const classId of ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"]) {
      for (const boss of Object.keys(BOSS_VOICE_EVENTS)) {
        expect(heroVoiceLine(classId, BOSS_VOICE_EVENTS[boss])?.path).withContext(`${classId} ${boss}`).toContain("/voice/");
      }
      // Only the druid and the assassin recorded a Durance of Hate line, so
      // the object zones are the ones every class has to answer for.
      for (const area of ["Stony Field", "Dark Wood"]) {
        expect(heroVoiceLine(classId, AREA_VOICE_EVENTS[area])?.path).withContext(`${classId} ${area}`).toContain("/voice/");
      }
      for (const area of Object.keys(AREA_COMPLETE_VOICE_EVENTS)) {
        expect(heroVoiceLine(classId, AREA_COMPLETE_VOICE_EVENTS[area])?.path).withContext(`${classId} ${area}`).toContain("/voice/");
      }
      expect(heroVoiceLine(classId, AREA_VOICE_EVENTS["Blood Moor"])).withContext(classId).toBeTruthy();
      expect(heroVoiceLine(classId, AREA_VOICE_EVENTS["Catacombs"])).withContext(classId).toBeTruthy();
      expect(Object.keys(HERO_VOICE_LINES[classId]).length).toBeGreaterThan(30);
    }
  });

  it("finds the Cairn Stones and the Tree of Inifuss in the zones that hold them", () => {
    component.selectedClass = "barbarian";
    (component as any).menuSoundPreferred = false;
    (component as any).speakHeroVoice(AREA_VOICE_EVENTS["Stony Field"]);
    expect(component.heroSpeech?.text).toBe("These magic stones are ancient.");

    (component as any).speakHeroVoice(AREA_VOICE_EVENTS["Dark Wood"]);
    expect(component.heroSpeech?.text).toBe("This tree is one of a kind!");

    (component as any).stopHeroVoice();
  });

  it("says the quest line when the hero leaves a zone whose objective it belongs to", () => {
    const speak = spyOn(component as any, "speakHeroVoice");
    spyOn(component as any, "draw");

    component.currentAct = 2;
    component.currentAreaIndex = 0;
    (component as any).openZonePortal(1);
    expect(speak).toHaveBeenCalledWith("act2_complete_radamentlair");

    component.currentAct = 4;
    component.currentAreaIndex = 1;
    (component as any).openZonePortal(2);
    expect(speak).toHaveBeenCalledWith("act4_free_izual");

    component.currentAct = 5;
    component.currentAreaIndex = 0;
    (component as any).openZonePortal(1);
    expect(speak).toHaveBeenCalledWith("act5_complete_stopsiege");
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

  it("returns from the Sanctuary lobby to the main menu with Escape", () => {
    component.activeTab = "menu";
    component.menuPanel = "lobby";
    spyOn(component as any, "stopLeaderboardHeroLineup");
    spyOn(component as any, "startMenuHeroPreview");
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });

    component.onGlobalAttackKey(event);

    expect(component.menuPanel).toBe("main");
    expect((component as any).stopLeaderboardHeroLineup).toHaveBeenCalled();
    expect(event.defaultPrevented).toBeTrue();
  });

  it("spends a skill point only on a skill the tree has unlocked", () => {
    component.selectedClass = "sorceress";
    component.playerLevel = 1;
    component.ownedSkills = ["Ice Bolt"];
    component.skillLevels = { "Ice Bolt": 3 };
    component.skillPoints = 1;

    expect(component.canSpendSkillPoint("Ice Bolt")).toBeTrue();
    // Frozen Orb is a level-30 skill, so the point cannot go there yet.
    expect(component.canSpendSkillPoint("Frozen Orb")).toBeFalse();

    component.spendSkillPoint("Frozen Orb");
    expect(component.skillPoints).toBe(1);
    expect(component.skillLevels["Frozen Orb"]).toBeUndefined();

    component.spendSkillPoint("Ice Bolt");
    expect(component.skillLevels["Ice Bolt"]).toBe(4);
    expect(component.skillPoints).toBe(0);

    component.spendSkillPoint("Ice Bolt");
    expect(component.skillLevels["Ice Bolt"]).toBe(4);
  });

  it("grants one skill point per level instead of offering upgrade choices", () => {
    component.runActive = true;
    component.playerLevel = 1;
    component.playerXp = 0;
    component.xpToNextLevel = 5;
    component.skillPoints = 0;
    spyOn(component as any, "persistRunProgress");

    (component as any).grantExperience(5);

    expect(component.playerLevel).toBe(2);
    expect(component.skillPoints).toBe(1);
    expect(component.levelUpNotice).toContain("skill point");
  });

  it("shows Enchant's actual spell description in its upgrade rank details", () => {
    component.selectedClass = "sorceress";

    const stats = (component as any).getSkillRankStats("Enchant", "aura", 1);

    expect(stats[0]).toContain("+8-10 fire damage on the weapon");
    expect(stats[1]).toContain("+20% Attack Rating");
    expect(stats[2]).toBe("Lasts 144s");
    expect(stats.join(" ")).not.toContain("No numeric per-rank combat bonus");
  });

  it("uses actual spell text for aura ranks without a bespoke numeric line", () => {
    component.selectedClass = "sorceress";
    const shiverDescription = component.getSkillDescription("Shiver Armor");
    const shiverStats = (component as any).getSkillRankStats("Shiver Armor", "aura", 4);
    expect(shiverDescription).toBeTruthy();
    expect(shiverStats[0]).toContain("+63% Defense");
    expect(shiverStats[1]).toContain("13-16 cold damage to melee attackers");
    expect(shiverStats[1]).toContain("chilled 4s");

    const chillingStats = (component as any).getSkillRankStats("Chilling Armor", "aura", 4);
    expect(chillingStats[0]).toContain("+60% Defense");
    expect(chillingStats[1]).toContain("7-11 cold damage to ranged attackers");

    component.selectedClass = "necromancer";
    const lowerResist = component.getSkillDescription("Lower Resist");
    const lowerResistStats = (component as any).getSkillRankStats("Lower Resist", "aura", 4);
    expect(lowerResist).toBeTruthy();
    expect(lowerResistStats[0]).toContain("Resist all -44%");
    expect(lowerResistStats[1]).toContain("Radius 6.6 yards");

    // Warmth states its own running total instead of its flat spell text, so the
    // upgrade card cannot print "15% faster" at every rank.
    component.selectedClass = "sorceress";
    const rankFour = (component as any).getSkillRankStats("Warmth", "passive", 4) as string[];
    const rankFive = (component as any).getSkillRankStats("Warmth", "passive", 5) as string[];
    expect(rankFour).toContain("Mana regenerates 66% faster");
    expect(rankFive).toContain("Mana regenerates 78% faster");
    expect(rankFive).not.toEqual(rankFour);
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
      .toContain("-45% fire, cold and lightning resistance nearby (never poison or magic)");
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
    // The real MoltenBoulderRoll cel from the extract, not a re-used rock.
    expect(boulders.every((projectile) => projectile.missileId === "d2-moltenboulderroll")).toBeTrue();
    expect(boulders.every((projectile) => projectile.radius === 24)).toBeTrue();
    expect(boulders.every((projectile) => projectile.target === undefined)).toBeTrue();
    const startX = boulders[0].x;
    const startY = boulders[0].y;
    for (let frame = 0; frame < 20; frame += 1) (component as any).updateAttackProjectiles(16);

    expect(boulders[0].x).toBeGreaterThan(startX);
    expect(Math.abs(boulders[0].y - startY)).toBeLessThan(5);
  });

  it("rolls a Molten Boulder along its line and lays a Blaze trail behind it", () => {
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).arenaW = 2000;
    (component as any).arenaH = 2000;
    component.enemies = [];
    component.attackProjectiles = [{
      x: 100, y: 250, startX: 100, startY: 250, targetX: 900, targetY: 250,
      speed: 300, damage: 95, life: 10, age: 0, radius: 24, color: "#ff9c50", kind: "fire",
      missileId: "d2-moltenboulderroll", boulder: true,
    } as any];
    (component as any).blazeFirePatches.length = 0;

    for (let frame = 0; frame < 30; frame += 1) (component as any).updateAttackProjectiles(16);

    const patches = (component as any).blazeFirePatches;
    expect(patches.length).toBeGreaterThan(2);
    // The fire stays on the line the rock has already rolled over.
    expect(patches.every((patch: any) => Math.abs(patch.y - 250) < 30)).toBeTrue();
    expect(patches.every((patch: any) => patch.x >= 100)).toBeTrue();
    expect(patches.every((patch: any) => patch.x <= component.attackProjectiles[0].x + 1)).toBeTrue();
    expect(patches.every((patch: any) => patch.damagePerTick > 0)).toBeTrue();
  });

  it("throws a monster away from the druid rather than along the boulder's path", () => {
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).arenaW = 2000;
    (component as any).arenaH = 2000;
    const monster = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 330, y: 270, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies = [monster];
    const projectile = {
      x: 300, y: 250, targetX: 900, targetY: 250,
      speed: 300, damage: 40, life: 10, age: 0, radius: 24, color: "#ff9c50", kind: "fire",
      boulder: true,
    } as any;

    (component as any).updateMoltenBoulder(projectile, 0.016);

    // D2 shoves along the line from the caster, not off the rock's flank, and a
    // monster too small to stop it does not end the roll.
    expect(monster.x).toBeGreaterThan(360);
    expect(monster.y).toBeGreaterThan(252);
    expect(monster.y).toBeLessThan(290);
    expect(projectile.boulder).toBeTrue();
  });

  it("hits the same small monster again once its NextDelay expires", () => {
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).arenaW = 2000;
    (component as any).arenaH = 2000;
    const monster = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 330, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies = [monster];
    const projectile = {
      x: 300, y: 250, targetX: 900, targetY: 250,
      speed: 300, damage: 10, life: 10, age: 0, radius: 24, color: "#ff9c50", kind: "fire",
      boulder: true,
    } as any;
    const strikes = spyOn(component as any, "queueEnemyDamage").and.callThrough();

    for (let frame = 0; frame < 90; frame += 1) {
      // The monster runs back into the rock every time it is thrown clear.
      monster.x = projectile.x + 30;
      monster.y = projectile.y;
      (component as any).updateMoltenBoulder(projectile, 0.016);
    }

    const hits = strikes.calls.allArgs().filter((args: any[]) => args[0] === monster);
    expect(hits.length).toBeGreaterThan(1);
    expect(projectile.boulder).toBeTrue();
  });

  it("breaks a Molten Boulder on a monster bigger than the druid", () => {
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).arenaW = 2000;
    (component as any).arenaH = 2000;
    const brute = {
      kind: "normal", species: "blunderbore", spriteFrame: 0,
      x: 330, y: 250, hp: 100, maxHp: 100, speed: 0, r: 20, dmg: 2,
    } as any;
    const small = {
      kind: "normal", species: "fallen", spriteFrame: 0,
      x: 380, y: 250, hp: 100, maxHp: 100, speed: 0, r: 14, dmg: 2,
    } as any;
    component.enemies = [brute, small];
    const projectile = {
      x: 300, y: 250, targetX: 900, targetY: 250,
      speed: 300, damage: 40, life: 10, age: 0, radius: 24, color: "#ff9c50", kind: "fire",
      boulder: true,
    } as any;

    (component as any).updateMoltenBoulder(projectile, 0.016);

    expect(projectile.boulder).toBeFalse();
    expect(small.x).toBe(380);
    (component as any).flushPendingDamage();
    expect(brute.hp).toBeLessThan(100);
  });

  it("stops a Molten Boulder at scenery it cannot cross", () => {
    component.runActive = true;
    component.playerX = 100;
    component.playerY = 250;
    (component as any).arenaW = 2000;
    (component as any).arenaH = 2000;
    component.enemies = [];
    spyOn(component as any, "campaignCollisionContext").and.returnValue({ clearance: 12, blocksSight: true } as any);
    spyOn(component as any, "campaignLineBlocked").and.returnValue(true);
    const projectile = {
      x: 300, y: 250, targetX: 900, targetY: 250,
      speed: 300, damage: 40, life: 10, age: 0, radius: 24, color: "#ff9c50", kind: "fire",
      boulder: true,
    } as any;

    (component as any).updateMoltenBoulder(projectile, 0.016);

    expect(projectile.boulder).toBeFalse();
    expect(projectile.x).toBe(300);
  });

  it("takes Volcano and Firestorm ranks into Molten Boulder's damage", () => {
    component.selectedClass = "druid";
    component.skillLevels = { "Molten Boulder": 1 };
    const plain = (component as any).skillCastDamage("Molten Boulder");
    component.skillLevels = { "Molten Boulder": 1, Volcano: 2, Firestorm: 3 };

    // Volcano adds 10% and Firestorm 8% per rank to Molten Boulder.
    expect((component as any).skillCastDamage("Molten Boulder") / plain).toBeCloseTo(1 + 0.10 * 2 + 0.08 * 3, 5);

    // The synergy is the druid's own: those ranks mean nothing to a sorceress.
    component.selectedClass = "sorceress";
    const sorceressPlain = (component as any).skillCastDamage("Molten Boulder");
    component.skillLevels = { "Molten Boulder": 1 };
    expect((component as any).skillCastDamage("Molten Boulder")).toBeCloseTo(sorceressPlain, 5);
  });

  it("pays Molten Boulder ranks back into the other druid fire skills", () => {
    component.selectedClass = "druid";
    component.skillLevels = { Volcano: 1, Armageddon: 1, "Fire Claws": 1 };
    const volcano = (component as any).skillCastDamage("Volcano");
    const armageddon = (component as any).skillCastDamage("Armageddon");
    const claws = (component as any).skillCastDamage("Fire Claws");
    component.skillLevels = { Volcano: 1, Armageddon: 1, "Fire Claws": 1, "Molten Boulder": 5 };

    // Armageddon's rank was already in the baseline synergy, so it cancels out.
    expect((component as any).skillCastDamage("Volcano") / volcano).toBeCloseTo((1 + 0.12 * 6) / (1 + 0.12 * 1), 5);
    expect((component as any).skillCastDamage("Armageddon") / armageddon).toBeCloseTo((1 + 0.14 * 6) / (1 + 0.14 * 1), 5);
    expect((component as any).skillCastDamage("Fire Claws") / claws).toBeCloseTo(1 + 5 * 0.22, 5);
  });

  it("adds Molten Boulder ranks to Firestorm's burn", () => {
    component.selectedClass = "druid";
    component.playerX = 250;
    component.playerY = 250;
    component.skillLevels = { Firestorm: 1 };
    (component as any).firestormTrails.length = 0;
    (component as any).castFirestorm(1);
    const plain = (component as any).firestormTrails[0].damagePerTick;
    (component as any).firestormTrails.length = 0;
    component.skillLevels = { Firestorm: 1, "Molten Boulder": 5 };
    (component as any).castFirestorm(1);

    expect((component as any).firestormTrails[0].damagePerTick / plain).toBeCloseTo(1 + 5 * 0.23, 3);
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

  it("never rolls another class's skill tree on a class-only base", () => {
    type AffixClass = ReturnType<typeof affixClass>;
    const bases: Array<{ base: { name: string; slot: string; equipmentType: string }; owner: AffixClass }> = [
      { base: { name: "Jawbone Cap", slot: "armor", equipmentType: "barbarianHelm" }, owner: "barbarian" },
      { base: { name: "Wolf Head", slot: "armor", equipmentType: "druidPelt" }, owner: "druid" },
      { base: { name: "Targe", slot: "armor", equipmentType: "paladinShield" }, owner: "paladin" },
      { base: { name: "Preserved Head", slot: "armor", equipmentType: "necromancerHead" }, owner: "necromancer" },
      { base: { name: "Katar", slot: "weapon", equipmentType: "claw" }, owner: "assassin" },
      { base: { name: "Eagle Orb", slot: "weapon", equipmentType: "orb" }, owner: "sorceress" },
    ];

    for (const { base, owner } of bases) {
      const pool = eligibleAffixes(base, 99);
      const classAffixes = pool.filter((affix) => affixClass(affix) !== undefined);
      expect(classAffixes.length).withContext(base.name).toBeGreaterThan(0);
      for (const affix of classAffixes) {
        expect(affixClass(affix)).withContext(`${base.name}: ${affix.name}`).toBe(owner);
      }
      // The offending combination: an Assassin tree on a Barbarian-only helm.
      // A Katar is the one base that legitimately rolls it.
      if (owner !== "assassin") {
        expect(pool.some((affix) => affix.name === "Mentalist's")).withContext(base.name).toBeFalse();
      }
    }

    // A base anyone can wear keeps its full affix pool; only the class-only
    // bases are pruned to their own tree.
    const plainHelm = { name: "Helm", slot: "armor", equipmentType: "helmet" };
    expect(classLockedBase(itemAffixTypes(plainHelm))).toBeUndefined();
    expect(eligibleAffixes(plainHelm, 99).some((affix) => affixClass(affix) !== undefined)).toBeTrue();
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

    it("sizes a spiked club as a one-handed mace instead of a pike", () => {
      const share = (name: string) => heldItemShare({ name, kind: "weapon" } as never);
      // "Spiked" contains "pike", so an unbounded pike test handed the club the
      // polearm share: Stoutnail hung from the fist to the hero's head in the
      // character preview, almost as tall as the character.
      expect(share("Spiked Club Stoutnail")).toBeCloseTo(0.4, 5);
      expect(share("Spiked Club")).toBeCloseTo(0.4, 5);
      expect(share("Barbed Club")).toBeCloseTo(0.4, 5);
      // A real pike keeps the polearm share.
      expect(share("War Pike")).toBeCloseTo(0.85, 5);
      expect(share("Maiden Pike")).toBeCloseTo(0.85, 5);
    });

    it("hangs the polearm family on a full-length haft", () => {
      const share = (name: string, kind: "weapon" | "offhand" = "weapon") =>
        heldItemShare({ name, kind } as never);
      // A Partizan and the rest of the polearm family reach the spear share;
      // before they fell through to the one-handed sword default and read as a
      // short blade in the hero's fist.
      for (const name of [
        "Partizan", "Poleaxe", "Halberd", "Voulge", "Bardiche", "War Scythe",
        "Lochaber Axe", "Bill", "Battle Scythe", "Grim Scythe", "Ogre Axe",
        "Colossus Voulge", "Thresher", "Great Poleaxe", "Cryptic Axe", "Giant Thresher",
        // The base name rides ahead of a unique's own name on the mounted item.
        "Partizan Pierre Tombale Couant",
      ]) {
        expect(share(name)).toBeCloseTo(0.85, 5);
        expect(share(name)).toBeGreaterThan(share("Broad Sword"));
      }
      expect(share("Partizan", "offhand")).toBeCloseTo(0.7225, 5);
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
