import {
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";

const MODEL_BASE = "assets/d2-models";
const CLASS_MODEL: Record<
  string,
  { body: string; head: string; hair?: string; armor?: string; weapon?: string }
> = {
  amazon: {
    body: `${MODEL_BASE}/amazon/textures/amazon_body_alb.png`,
    head: `${MODEL_BASE}/amazon/textures/amazon_head_alb.png`,
    hair: `${MODEL_BASE}/amazon/textures/amazon_hair_alb.png`,
    armor: `${MODEL_BASE}/amazon/textures/amazon_armormed_alb.png`,
    weapon: `${MODEL_BASE}/amazon/textures/weapon_pike_albout.png`,
  },
  assassin: {
    body: `${MODEL_BASE}/assassin/textures/assassins_body_alb.png`,
    head: `${MODEL_BASE}/assassin/textures/assassin_face_alb.png`,
    hair: `${MODEL_BASE}/assassin/textures/assassin_hair_alb.png`,
    armor: `${MODEL_BASE}/assassin/textures/assassin_armormed_alb.png`,
  },
  barbarian: {
    body: `${MODEL_BASE}/barbarian/textures/body_alb.png`,
    head: `${MODEL_BASE}/barbarian/textures/head_alb.png`,
    hair: `${MODEL_BASE}/barbarian/textures/barbarian_hair_new_alb.png`,
    armor: `${MODEL_BASE}/barbarian/textures/barb_armormed_alb.png`,
  },
  druid: {
    body: `${MODEL_BASE}/druid/textures/body_alb.png`,
    head: `${MODEL_BASE}/druid/textures/face_alb.png`,
    hair: `${MODEL_BASE}/druid/textures/druid_hair_white_alb.png`,
    armor: `${MODEL_BASE}/druid/textures/druid_armormed_alb.png`,
  },
  necromancer: {
    body: `${MODEL_BASE}/necromancer/textures/necro_body_alb.png`,
    head: `${MODEL_BASE}/necromancer/textures/necro_head_alb.png`,
    hair: `${MODEL_BASE}/necromancer/textures/necro_hair_alb.png`,
    armor: `${MODEL_BASE}/necromancer/textures/necro_armormed_alb.png`,
  },
  paladin: {
    body: `${MODEL_BASE}/paladin/textures/paladin_body_alb.png`,
    head: `${MODEL_BASE}/paladin/textures/paladin_face_alb.png`,
    hair: `${MODEL_BASE}/paladin/textures/paladin_hair_alb.png`,
    armor: `${MODEL_BASE}/paladin/textures/paladin_armormed_alb.png`,
  },
  sorceress: {
    body: `${MODEL_BASE}/sorceress/textures/sorceress_body_albedo.png`,
    head: `${MODEL_BASE}/sorceress/textures/sorceress_head_albedo.png`,
    hair: `${MODEL_BASE}/sorceress/textures/sorceress_hair_alb.png`,
    armor: `${MODEL_BASE}/sorceress/textures/sorceress_lightarmor_albedo.png`,
    weapon: `${MODEL_BASE}/sorceress/textures/weapon_horadric_staff_albout.png`,
  },
};

@Component({
  selector: "app-d2-survivors",
  standalone: false,
  templateUrl: "./d2survivors.component.html",
  styleUrls: ["./d2survivors.component.css"],
})
export class D2SurvivorsComponent implements OnInit, OnDestroy {
  @ViewChild("arena") arenaRef?: ElementRef<HTMLCanvasElement>;

  // Static lore page state
  classes = [
    {
      id: "amazon",
      name: "Amazon",
      desc: "Bows, javelins and a warrior’s reflexes",
    },
    {
      id: "assassin",
      name: "Assassin",
      desc: "Martial arts, traps and shadow disciplines",
    },
    {
      id: "necromancer",
      name: "Necromancer",
      desc: "Bone, poison, curses and the raised dead",
    },
    {
      id: "barbarian",
      name: "Barbarian",
      desc: "Weapon masteries, war cries and Whirlwind",
    },
    {
      id: "paladin",
      name: "Paladin",
      desc: "Holy auras, combat skills and the Blessed Hammer",
    },
    { id: "sorceress", name: "Sorceress", desc: "Fire, cold and lightning" },
    {
      id: "druid",
      name: "Druid",
      desc: "Elemental storms, summoned beasts and shape shifting",
    },
  ];

  skills = [
    {
      name: "Ice Arrow",
      desc: "arrows that freeze what they hit solid for 5s, 90 damage",
    },
    {
      name: "Strafe",
      desc: "a rapid volley of 6 arrows spread over the monsters around you, 25 damage each",
    },
    {
      name: "Fend",
      desc: "a spear thrust at every monster around you in turn (up to 5), 60 damage each",
    },
    {
      name: "Charged Strike",
      desc: "a charged thrust at the toughest monster in reach, 100 damage; 3 bolts crackle on from it, 50 each",
    },
    {
      name: "Lightning Strike",
      desc: "a thrust at the toughest monster in reach, 120 damage; lightning chains on through 4 more, 110 each",
    },
    {
      name: "Plague Javelin",
      desc: "4 javelins trailing poison that burst into a spreading cloud, 240 poison over 5s to all within 180",
    },
    {
      name: "Lightning Fury",
      desc: "6 javelins that burst into lightning forking to 3 monsters, 75 damage each",
    },
    {
      name: "Freezing Arrow",
      desc: "5 arrows that burst into freezing ice, 90 damage around what they hit and a 3s chill",
    },
    {
      name: "Immolation Arrow",
      desc: "5 arrows that explode for 90 damage and leave the ground burning for 3s",
    },
    {
      name: "Widowmaker",
      desc: "2 guided arrows that hunt through 6 monsters each, 65 damage",
    },
    {
      name: "Critical Strike",
      desc: "+10% chance for her attacks to deal double damage",
    },
    { name: "Penetrate", desc: "her attacks deal 10% more damage" },
    {
      name: "Pierce",
      desc: "+20% chance for arrows and javelins to fly on through what they hit",
    },
    { name: "Dodge", desc: "+8% chance to sidestep a monster's hit entirely" },
    {
      name: "Avoid",
      desc: "+4% chance to sidestep a monster's missile entirely",
    },
    {
      name: "Evade",
      desc: "+8% chance to sidestep a monster's hit while you're on the move",
    },
    {
      name: "Decoy",
      desc: "every few seconds a double of you appears nearby, drawing monsters",
    },
    {
      name: "Inner Sight",
      desc: "monsters near her take 6% more damage (except those with an immunity)",
    },
    { name: "Slow Missiles", desc: "monsters' missiles fly 15% slower" },
    {
      name: "Fire Ball",
      desc: "3 fire balls at the nearest monsters, bursting on impact for 55 damage around",
    },
    {
      name: "Meteor",
      desc: "meteors crash onto 3 monsters, 90 damage, and leave the ground burning",
    },
    {
      name: "Frozen Orb",
      desc: "an orb that sprays chilling ice shards in every direction, 22 damage each",
    },
    {
      name: "Chain Lightning",
      desc: "2 bolts that jump between up to 8 monsters, 45 damage each",
    },
    {
      name: "Thunder Storm",
      desc: "lightning keeps striking monsters around you, 70 damage",
    },
    {
      name: "Fire Wall",
      desc: "a wall of fire across the path ahead that burns for 4s",
    },
    {
      name: "Glacial Spike",
      desc: "2 spikes at the nearest monsters burst for 110 damage, freezing all in the burst for 1.5s",
    },
    {
      name: "Blizzard",
      desc: "ice shards rain on the nearest pack for 2.4s, 24 shards of 35 damage each, chilling what they hit",
    },
    {
      name: "Shiver Armor",
      desc: "15s: melee attackers take 55 cold and a 2.5s chill; 12% of their blows miss",
    },
    {
      name: "Chilling Armor",
      desc: "15s: melee attackers take 70 cold, chilled 3s; shooters a 60 ice bolt; 14% miss",
    },
    { name: "Energy Shield", desc: "take 8% less damage" },
    { name: "Fire Mastery", desc: "+10% fire damage" },
    { name: "Cold Mastery", desc: "+10% cold damage" },
    { name: "Lightning Mastery", desc: "+10% lightning damage" },
    { name: "Warmth", desc: "skills recharge 15% faster" },
    { name: "Enchant", desc: "your fire skills burn 10% harder" },
    {
      name: "Bone Spear",
      desc: "3 spears of bone that pierce every monster in their path, 120 damage",
    },
    {
      name: "Bone Spirit",
      desc: "3 bone spirits, each hunting down one of the nearest monsters, 90 damage",
    },
    {
      name: "Poison Nova",
      desc: "a ring of poison out to 230: 180 poison over 6s to everything it touches",
    },
    {
      name: "Decrepify",
      desc: "curse: monsters within range slow by half, deal less damage and take more",
    },
    {
      name: "Revive",
      desc: "an army: up to 4 skeletons, and slain monsters rise to fight for you",
    },
    {
      name: "Blood Golem",
      desc: "a golem of blood, 900 life, 25 damage; every blow it lands heals you",
    },
    {
      name: "Iron Golem",
      desc: "a golem of iron, 700 life, 20 damage, with a Thorns aura",
    },
    {
      name: "Fire Golem",
      desc: "a golem of fire, 600 life, 30 damage, with a Holy Fire aura that burns everything near it",
    },
    { name: "Bone Armor", desc: "take 8% less damage" },
    { name: "Bone Wall", desc: "+10% magic damage" },
    { name: "Lower Resist", desc: "+10% poison damage" },
    {
      name: "Skeleton Mastery",
      desc: "skeletons, mages and revives get +20% life and damage",
    },
    {
      name: "Golem Mastery",
      desc: "golems get +25% life, +10% damage and +8% speed",
    },
    {
      name: "Summon Resist",
      desc: "summons take less damage from monsters whose blows carry fire, cold, lightning or poison",
    },
    {
      name: "Wake of Fire",
      desc: "a trap sends out 5 waves of fire, 30 damage to all they pass",
    },
    {
      name: "Wake of Inferno",
      desc: "a trap breathes fire at monsters 10 times, 5 flames of 35 damage",
    },
    {
      name: "Lightning Sentry",
      desc: "a sentry fires lightning through monsters in line 10 times, 40 damage",
    },
    {
      name: "Death Sentry",
      desc: "a sentry fires lightning 5 times and blows up a corpse near it each time",
    },
    {
      name: "Blade Fury",
      desc: "6 blades thrown at the monsters around you, 36 damage each, passing through one",
    },
    {
      name: "Blade Shield",
      desc: "blades spin around you, 28 damage to all beside you and fly off at monsters",
    },
    {
      name: "Phoenix Strike",
      desc: "claws, 36 damage: a meteor, chain lightning, then chaos ice",
    },
    {
      name: "Claws of Thunder",
      desc: "claws, 36 damage; every fourth blow a thunder nova, 50 damage",
    },
    {
      name: "Blades of Ice",
      desc: "claws, 36 damage; every fourth blow shatters ice and a long chill",
    },
    {
      name: "Dragon Claw",
      desc: "two claw blows at the toughest in reach, 44 damage each, releasing all charges",
    },
    {
      name: "Dragon Tail",
      desc: "a kick at the toughest in reach, 48 damage, exploding in fire around",
    },
    {
      name: "Dragon Flight",
      desc: "blink to the toughest monster ahead and kick it, 40 damage",
    },
    {
      name: "Mind Blast",
      desc: "a blast of the mind over the nearest pack, 90 damage and a 2s stun",
    },
    {
      name: "Shadow Master",
      desc: "a shadow master, 80 damage, 700 life; every third blow a fire, lightning or ice kick",
    },
    {
      name: "Claw Mastery",
      desc: "+10% physical damage and +10% chance of a critical strike",
    },
    {
      name: "Weapon Block",
      desc: "+10% chance to block a monster's hit with your claws",
    },
    {
      name: "Burst of Speed",
      desc: "+7% movement speed and 4% shorter cooldowns",
    },
    {
      name: "Fade",
      desc: "take 6% less damage; poison and chill wear off faster",
    },
    {
      name: "Venom",
      desc: "your claws and blades poison, 8 damage a second for 3s",
    },
    {
      name: "Frenzy",
      desc: "two blows in a wide reach, 45 damage each; hits speed your swings and steps",
    },
    {
      name: "Concentrate",
      desc: "a focused blow at the toughest monster in reach, 200 damage, splashing 60",
    },
    {
      name: "Berserk",
      desc: "a reckless magic blow at the toughest in reach, 420 damage; you take 30% more for a moment",
    },
    {
      name: "Leap Attack",
      desc: "leap where you run and strike: 320 damage, 100 around",
    },
    {
      name: "Lacerator",
      desc: "6 axes thrown at the monsters around you, 55 damage each, passing through 3",
    },
    {
      name: "Battle Orders",
      desc: "you take 30% less damage and have 35% more life, renewed every 12s",
    },
    {
      name: "Battle Command",
      desc: "battle orders, and +1 to all your skills",
    },
    {
      name: "Axe Mastery",
      desc: "+12% physical damage and +10% chance of a critical strike",
    },
    {
      name: "Throwing Mastery",
      desc: "thrown axes deal 15% more damage and have +15% chance to fly on through",
    },
    { name: "Iron Skin", desc: "take 7% less damage" },
    { name: "Increased Stamina", desc: "+20% maximum life" },
    {
      name: "Natural Resistance",
      desc: "take 4% less damage; poison and chill wear off faster",
    },
    { name: "Increased Speed", desc: "+8% movement speed" },
    {
      name: "Find Potion",
      desc: "slain monsters have a chance to leave a healing potion",
    },
    {
      name: "Find Item",
      desc: "slain monsters have a chance to leave gold and now and then an item",
    },
    {
      name: "Zakarum's Hand",
      desc: "the Hammerdin: 4 blessed hammers at once, whirling faster and wider",
    },
    {
      name: "Fist of the Heavens",
      desc: "lightning strikes the toughest monster nearby and one more, 110 damage",
    },
    {
      name: "Passion",
      desc: "6 frenzied blows over the monsters in a wide reach, 26 damage each",
    },
    {
      name: "Herald of Zakarum",
      desc: "charge 3 times along your path, 60 damage in the way, a holy burst at each stop",
    },
    {
      name: "Exile",
      desc: "holy shield at its height for good; a holy blast every 4s throws monsters back, 50 damage",
    },
    { name: "Might", desc: "aura: +10% physical damage" },
    {
      name: "Holy Fire",
      desc: "aura: burns every monster around you each second",
    },
    {
      name: "Holy Freeze",
      desc: "aura: monsters around you are slowed by half and chilled each second",
    },
    {
      name: "Holy Shock",
      desc: "aura: lightning jolts every monster around you each second",
    },
    { name: "Concentration", desc: "aura: +10% magic damage" },
    {
      name: "Fanaticism",
      desc: "aura: skills recharge faster, +4% physical damage",
    },
    {
      name: "Conviction",
      desc: "aura: monsters around you take 10% more damage from everything",
    },
    {
      name: "Thorns",
      desc: "aura: monsters that strike you in melee take back some of the blow",
    },
    {
      name: "Blessed Aim",
      desc: "aura: +10% chance of a critical strike with zeal, smite, charge and sacrifice",
    },
    { name: "Vigor", desc: "aura: +4% movement speed" },
    { name: "Defiance", desc: "aura: take 6% less damage" },
    { name: "Prayer", desc: "aura: heal 4 life a second" },
    { name: "Resist Fire", desc: "aura: +10% fire resistance" },
    {
      name: "Resist Cold",
      desc: "aura: +10% cold resistance; chill wears off faster",
    },
    { name: "Resist Lightning", desc: "aura: +10% lightning resistance" },
    {
      name: "Salvation",
      desc: "aura: +10% fire, cold and lightning resistance; chill wears off faster",
    },
    { name: "Cleansing", desc: "aura: poison and chill wear off faster" },
    { name: "Meditation", desc: "aura: skills recharge faster" },
    {
      name: "Redemption",
      desc: "aura: monsters slain near you heal you sometimes",
    },
    {
      name: "Sanctuary",
      desc: "aura: monsters close to you are hurt and thrown out twice a second",
    },
    {
      name: "Molten Boulder",
      desc: "2 molten boulders roll through all in their path, 95 damage, knockback, leaving fire",
    },
    {
      name: "Volcano",
      desc: "a volcano under the nearest pack for 5s, raining burning rocks, 65 damage each",
    },
    {
      name: "Armageddon",
      desc: "for 5s burning rocks fall around you, the toughest monsters most, 90 damage each",
    },
    {
      name: "Tornado",
      desc: "3 tornadoes wander the horde, 80 damage and a stun to each monster they pass",
    },
    {
      name: "Hurricane",
      desc: "for 6s a storm rages within 200 yards: cold damage and chilling",
    },
    {
      name: "Summon Spirit Wolf",
      desc: "up to 5 spirit wolves fight beside you",
    },
    { name: "Summon Dire Wolf", desc: "up to 3 dire wolves" },
    {
      name: "Summon Grizzly",
      desc: "a grizzly, with the pack doing more damage",
    },
    {
      name: "Carrion Vine",
      desc: "a carrion vine eats corpses near you, each healing life",
    },
    {
      name: "Solar Creeper",
      desc: "a solar creeper eats corpses and speeds recharge",
    },
    {
      name: "Spirit of Barbs",
      desc: "monsters that strike you take back some of the damage",
    },
    {
      name: "Fury",
      desc: "werewolf for 15s: a flurry of blows at all in reach",
    },
    {
      name: "Maul",
      desc: "werebear for 15s: blows of 55, each more a charge up to 13",
    },
    {
      name: "Shock Wave",
      desc: "maul as a werebear; every third swing a stomp, stunning",
    },
    { name: "Lycanthropy", desc: "wereform lasts longer and gives more life" },
    {
      name: "Feral Rage",
      desc: "+10% physical damage; as a werewolf, faster run",
    },
    {
      name: "Rabies",
      desc: "wereform blows add poison; a bitten monster that dies passes it to others",
    },
    {
      name: "Hunger",
      desc: "werewolf and werebear blows heal some of their damage",
    },
    {
      name: "Fire Claws",
      desc: "+10% fire damage; wereform claws burn with it",
    },
    { name: "Cyclone Armor", desc: "+10% cold damage and take 5% less damage" },
    {
      name: "Ravenlore",
      desc: "ravens, wolves, the grizzly and creepers get more life and damage",
    },
    {
      name: "Spirit Keeper",
      desc: "spirits' boons and vines' meals are stronger",
    },
    { name: "Vitality", desc: "+20 maximum life" },
    { name: "Faster Cast Rate", desc: "skills recharge faster" },
    { name: "Faster Run/Walk", desc: "+10% movement speed" },
    { name: "Replenish Life", desc: "regenerate 1 life per second" },
    { name: "Telekinesis", desc: "pick things up from 40% farther away" },
    { name: "Gold Find", desc: "+10% gold per rank" },
    { name: "Magic Find", desc: "+10% better chance of magic items per rank" },
    { name: "Damage Reduced", desc: "2% less damage taken per rank" },
    { name: "Replenish Life", desc: "+0.5 life per second per rank" },
    { name: "Resurrect", desc: "come back at half life once more per run" },
  ];

  mapAreas = [
    "Blood Moor",
    "Cold Plains",
    "Stony Field",
    "Dark Wood",
    "Tamoe Highland",
    "Catacombs",
    "Rocky Waste",
    "Dry Hills",
    "Far Oasis",
    "Lost City",
    "Valley of Snakes",
    "Claw Viper Temple",
    "Arcane Sanctuary",
    "Tal Rasha's Tomb",
    "Spider Forest",
    "Great Marsh",
    "Flayer Jungle",
    "Lower Kurast",
    "Kurast Bazaar",
    "Upper Kurast",
    "Kurast Causeway",
    "Travincal",
    "Durance of Hate",
    "Outer Steppes",
    "Plains of Despair",
    "City of the Damned",
    "River of Flame",
    "Chaos Sanctuary",
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
  ];

  itemProperties = [
    "application/javascript",
    "f32",
    "mat3x3<f32>",
    "vec4<f32>",
    "vec2<f32>",
    "renderable",
    "superUnique",
    "ring",
    "unique",
    "swarm",
    "champion",
    "pois",
    "cold",
    "ltng",
    "fire",
    "magic",
    "chest",
    "rare",
    "actCleared",
    "weapon",
    "normal",
    "potion",
    "gold",
    "attribute",
    "tree",
    "passive",
    "skill",
    "respec",
    "banner",
    "act",
  ];

  // Mini-run state
  activeTab: "lore" | "run" = "lore";
  runActive = false;
  playerX = 250;
  playerY = 250;
  playerHp = 20;
  playerMaxHp = 20;
  playerGold = 0;
  ownedSkills: string[] = [];
  skillLevels: Record<string, number> = {};
  selectedClass = "amazon";
  loadedClassTextures: Record<string, HTMLImageElement | null> = {};
  bodyImg: HTMLImageElement | null = null;
  headImg: HTMLImageElement | null = null;
  hairImg: HTMLImageElement | null = null;
  armorImg: HTMLImageElement | null = null;
  weaponImg: HTMLImageElement | null = null;
  textureLoadError = false;
  enemies: Enemy[] = [];
  chests: Chest[] = [];
  openChestCount = 0;
  floatingTexts: FloatingText[] = [];
  runTime = 0;
  lastTime = 0;
  rafId = 0;
  keysDown = new Set<string>();
  arenaW = 500;
  arenaH = 500;
  spawnAcc = 0;
  nextChestInterval = 8;
  chestTimer = 0;
  inventory: D2InventoryItem[] = [];
  inventoryGrid: Array<{ item?: D2InventoryItem }> = [];
  inventoryColumns = 4;
  inventoryRows = 10;

  private rebuildInventoryGrid(): void {
    const grid: Array<{ item?: D2InventoryItem }> = [];
    for (let i = 0; i < this.inventoryColumns * this.inventoryRows; i++) {
      grid.push({ item: this.inventory[i] ?? undefined });
    }
    this.inventoryGrid = grid;
  }

  private randomItem(): D2InventoryItem {
    const names = [
      "Steel Shortsword",
      "Iron Helm",
      "Cloth Armor",
      "Health Potion",
      "Soulstone",
      "Small Charm",
      "Scroll of Lightning",
      "Gold Amulet",
      "Ring of the Artisan",
      "Quill of the Fates",
    ];
    const name = names[Math.floor(Math.random() * names.length)];
    const rarity =
      Math.random() < 0.08 ? "rare" : Math.random() < 0.35 ? "magic" : "normal";
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
      name,
      rarity,
      slot: "charm",
      desc:
        rarity === "rare"
          ? "Unusual item"
          : rarity === "magic"
            ? "Magical item"
            : "Simple item",
    };
  }

  onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    ) {
      event.preventDefault();
      this.keysDown.add(key);
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    this.keysDown.delete(event.key.toLowerCase());
  }

  ngOnInit(): void {
    this.loadSelectedClassTextures();
    this.startRun();
  }

  ngOnDestroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  startRun(): void {
    this.runActive = true;
    this.activeTab = "run";
    this.playerX = 250;
    this.playerY = 250;
    this.playerHp = this.playerMaxHp;
    this.playerGold = 0;
    this.ownedSkills = ["Fire Ball", "Chain Lightning", "Blade Fury"];
    this.skillLevels = {
      "Fire Ball": 1,
      "Chain Lightning": 1,
      "Blade Fury": 1,
    };
    this.enemies = [];
    this.chests = [];
    this.floatingTexts = [];
    this.inventory = [];
    this.rebuildInventoryGrid();
    this.runTime = 0;
    this.spawnAcc = 0;
    this.chestTimer = 0;
    this.lastTime = performance.now();
    this.loadSelectedClassTextures();
    this.loop(this.lastTime);
  }

  loadSelectedClassTextures(): void {
    this.textureLoadError = false;
    const def = CLASS_MODEL[this.selectedClass];
    if (!def) {
      return;
    }
    this.loadedClassTextures = {};
    this.bodyImg = null;
    this.headImg = null;
    this.hairImg = null;
    this.armorImg = null;
    this.weaponImg = null;
    if (def.body) {
      this.bodyImg = this.loadImage(def.body);
      this.loadedClassTextures[def.body] = this.bodyImg;
    }
    if (def.head) {
      this.headImg = this.loadImage(def.head);
      this.loadedClassTextures[def.head] = this.headImg;
    }
    if (def.hair) {
      this.hairImg = this.loadImage(def.hair);
      this.loadedClassTextures[def.hair] = this.hairImg;
    }
    if (def.armor) {
      this.armorImg = this.loadImage(def.armor);
      this.loadedClassTextures[def.armor] = this.armorImg;
    }
    if (def.weapon) {
      this.weaponImg = this.loadImage(def.weapon);
      this.loadedClassTextures[def.weapon] = this.weaponImg;
    }
    if (!this.bodyImg && !this.headImg && !this.hairImg) {
      this.textureLoadError = true;
    }
  }

  private loadImage(url: string): HTMLImageElement | null {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      return img;
    }
    return img;
  }

  loop(now: number): void {
    const dt = Math.min(50, now - this.lastTime);
    this.lastTime = now;
    if (!this.runActive) {
      return;
    }
    this.update(dt);
    this.draw();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt: number): void {
    this.runTime += dt / 1000;

    this.movePlayer(dt);
    this.updateEnemies(dt);
    this.updateChests(dt);
    this.updateFloatingTexts(dt);
    this.spawnEnemies(dt);
    this.spawnChests(dt);
  }

  movePlayer(dt: number): void {
    const speed = 220;
    const move = speed * (dt / 1000);
    let dx = 0;
    let dy = 0;
    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) dy -= move;
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown")) dy += move;
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft")) dx -= move;
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) dx += move;
    this.playerX = Math.max(32, Math.min(this.arenaW - 32, this.playerX + dx));
    this.playerY = Math.max(32, Math.min(this.arenaH - 32, this.playerY + dy));
  }

  updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      const t = this.playerX;
      const ty = this.playerY;
      const ex = e.x;
      const ey = e.y;
      const ddx = t - ex;
      const ddy = ty - ey;
      const dist = Math.hypot(ddx, ddy) || 1;
      const spd = e.speed * (dt / 1000);
      e.x += (ddx / dist) * spd;
      e.y += (ddy / dist) * spd;
      if (e.kind !== "normal") {
        if (dist < 36) {
          this.playerHp -= e.dmg * (dt / 1000);
          e.cd = 0.4;
        }
      }
      if (e.cd !== undefined) {
        e.cd = Math.max(0, e.cd - dt / 1000);
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0 && this.playerHp > 0);
    if (this.playerHp <= 0) {
      this.endRun(false);
    }
  }

  updateChests(dt: number): void {
    this.openChestCount = 0;
    for (const c of this.chests) {
      if (!c.open) {
        c.bob += dt / 1000;
        this.openChestCount += 1;
        const ddx = this.playerX - c.x;
        const ddy = this.playerY - c.y;
        if (Math.hypot(ddx, ddy) < 42) {
          this.openChest(c);
        }
      }
    }
    this.chests = this.chests.filter((c) => !c.open || c.life > 0);
  }

  updateFloatingTexts(dt: number): void {
    for (const f of this.floatingTexts) {
      f.y -= 0.25 * (dt / 1000) * 60;
      f.life -= dt / 1000;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);
  }

  selectedItem: D2InventoryItem | null = null;
  selectedSlotIndex: number | null = null;
  dragState: DragState | null = null;
  dragGhostSlotIndex: number | null = null;

  readonly selectedItemDisplay: D2InventoryItem | null = null;
  getItemStatText(item: D2InventoryItem | null): string[] {
    if (!item) {
      return [];
    }
    const lines: string[] = [];
    lines.push(`${item.name} (${item.rarity})`);
    if (item.stats) {
      const s = item.stats;
      if (s.damageMin != null && s.damageMax != null) {
        lines.push(`Damage: ${s.damageMin} to ${s.damageMax}`);
      }
      if (s.armor != null) {
        lines.push(`Armor: ${s.armor}`);
      }
      if (s.plusDamage != null && s.plusDamage > 0) {
        lines.push(`+${s.plusDamage} to Maximum Damage`);
      }
      if (s.plusStrength != null && s.plusStrength > 0) {
        lines.push(`+${s.plusStrength} Strength`);
      }
      if (s.plusVitality != null && s.plusVitality > 0) {
        lines.push(`+${s.plusVitality} to Maximum Life`);
      }
      if (s.requiresStrength != null && s.requiresStrength > 0) {
        lines.push(`Requires ${s.requiresStrength} Strength`);
      }
    }
    if (item.affixes && item.affixes.length) {
      lines.push('Affixes');
      for (const a of item.affixes) {
        lines.push(`  ${a}`);
      }
    }
    if (!lines.length) {
      lines.push(item.desc || 'No stats');
    }
    return lines;
  }

  readonly itemStatText = this.getItemStatText.bind(this);

  spawnEnemies(dt: number): void {
    const spawnRate = this.runTime < 20 ? 0.12 : 0.22;
    this.spawnAcc += spawnRate * (dt / 1000);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.enemies.push(this.makeEnemy("normal"));
      if (this.enemies.length < 60 && Math.random() < 0.02) {
        this.enemies.push(this.makeEnemy("champion"));
      }
      if (this.enemies.length < 40 && Math.random() < 0.005) {
        this.enemies.push(this.makeEnemy("boss"));
      }
    }
    this.enemies = this.enemies.slice(0, 220);
  }

  spawnChests(dt: number): void {
    this.chestTimer -= dt / 1000;
    if (
      this.chestTimer <= 0 &&
      this.enemies.some((e) => e.kind === "boss" || e.kind === "champion")
    ) {
      this.chestTimer = this.nextChestInterval;
      const eligible = this.enemies.filter(
        (e) => e.kind === "boss" || e.kind === "champion",
      );
      if (eligible.length) {
        const src = eligible[Math.floor(Math.random() * eligible.length)];
        this.chests.push({
          x: src.x,
          y: src.y,
          bob: 0,
          open: false,
          life: 30,
        });
      }
    }
  }

  makeEnemy(kind: "normal" | "champion" | "boss"): Enemy {
    const base: Enemy = {
      kind: "normal",
      x: 30 + Math.random() * (this.arenaW - 60),
      y: -40,
      hp: 18,
      maxHp: 18,
      speed: 80 + Math.random() * 40,
      r: 14,
      dmg: 2,
    };
    if (kind === "boss") {
      return {
        ...base,
        hp: 140,
        maxHp: 140,
        speed: 70,
        r: 26,
        dmg: 6,
        kind: "boss",
      };
    }
    if (kind === "champion") {
      return {
        ...base,
        hp: 50,
        maxHp: 50,
        speed: 110,
        r: 18,
        dmg: 4,
        kind: "champion",
      };
    }
    return base;
  }

  openChest(c: Chest): void {
    c.open = true;
    c.life = 0;
    const owned = this.ownedSkills.filter(
      (s) => this.skillLevels[s] !== undefined,
    );
    let chosen = owned[Math.floor(Math.random() * owned.length)];
    if (!chosen && this.ownedSkills.length) {
      chosen =
        this.ownedSkills[Math.floor(Math.random() * this.ownedSkills.length)];
    }
    if (chosen) {
      this.skillLevels[chosen] = (this.skillLevels[chosen] ?? 0) + 1;
      this.floatingTexts.push({
        x: c.x,
        y: c.y - 20,
        text: "+1 " + chosen,
        color: "#ffd27a",
        life: 2.4,
      });
    } else {
      this.floatingTexts.push({
        x: c.x,
        y: c.y - 20,
        text: "chest (no owned skill)",
        color: "#ff6b6b",
        life: 2.4,
      });
    }

    if (Math.random() < 0.25) {
      this.inventory.push(this.randomItem());
    }
  }

  endRun(victory: boolean): void {
    this.runActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  getSkillLevel(name: string): number {
    return this.skillLevels[name] ?? 0;
  }

  getOwnedSkills(): string[] {
    return this.ownedSkills.slice();
  }

  getSkillDescription(name: string): string | undefined {
    return this.skills.find((s) => s.name === name)?.desc;
  }

  draw(): void {
    const canvas = this.arenaRef?.nativeElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.fillStyle = "#0e0f14";
    ctx.fillRect(0, 0, this.arenaW, this.arenaH);

    // Diablo-style tiled floor
    const tileX = 48;
    const tileY = 48;
    ctx.save();
    for (let y = 0; y < this.arenaH + tileY; y += tileY) {
      for (let x = 0; x < this.arenaW + tileX; x += tileX) {
        const shaded = (x / tileX + y / tileY) % 2 === 0;
        ctx.fillStyle = shaded ? "#12141a" : "#0e0f14";
        ctx.fillRect(x, y, tileX, tileY);
      }
    }
    ctx.restore();

    ctx.strokeStyle = "#1b1e26";
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.arenaW; x += tileX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.arenaH);
      ctx.stroke();
    }
    for (let y = 0; y <= this.arenaH; y += tileY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.arenaW, y);
      ctx.stroke();
    }

    for (const e of this.enemies) {
      this.drawEnemy(ctx, e);
    }

    for (const c of this.chests) {
      this.drawChest(ctx, c);
    }

    // player model
    if (!this.textureLoadError) {
      this.drawPlayerModel(ctx, this.playerX, this.playerY);
    } else {
      ctx.fillStyle = "#ffd27a";
      ctx.beginPath();
      ctx.arc(this.playerX, this.playerY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a4a00";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // hp bar
    const hpPct = Math.max(0, this.playerHp / this.playerMaxHp);
    ctx.fillStyle = "#2a1a12";
    ctx.fillRect(this.playerX - 22, this.playerY - 32, 44, 6);
    ctx.fillStyle =
      hpPct > 0.5 ? "#4caf50" : hpPct > 0.25 ? "#ff9800" : "#f44336";
    ctx.fillRect(this.playerX - 22, this.playerY - 32, 44 * hpPct, 6);

    for (const f of this.floatingTexts) {
      ctx.fillStyle = f.color;
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    }
  }

  drawPlayerModel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const scale = 1.4;
    const baseSize = 64;
    const pw = baseSize * scale;
    const ph = baseSize * scale;
    const ox = x - pw / 2;
    const oy = y - ph + 12;

    if (this.bodyImg) {
      this.drawTiledSprite(ctx, this.bodyImg, ox, oy, pw, ph);
    }
    if (this.headImg) {
      const headW = pw * 0.36;
      const headH = ph * 0.4;
      this.drawTiledSprite(
        ctx,
        this.headImg,
        x - headW / 2,
        oy - headH + 6,
        headW,
        headH,
      );
    }
    if (this.hairImg) {
      const hairW = pw * 0.36;
      const hairH = ph * 0.4;
      this.drawTiledSprite(
        ctx,
        this.hairImg,
        x - hairW / 2,
        oy - hairH + 6,
        hairW,
        hairH,
      );
    }
    if (this.armorImg) {
      const armorW = pw * 0.52;
      const armorH = ph * 0.52;
      this.drawTiledSprite(
        ctx,
        this.armorImg,
        x - armorW / 2,
        oy + ph * 0.22,
        armorW,
        armorH,
      );
    }
    if (this.weaponImg) {
      const weaponW = pw * 1.2;
      const weaponH = ph * 0.5;
      this.drawTiledSprite(
        ctx,
        this.weaponImg,
        x - weaponW / 2 + ph * 0.2,
        oy + ph * 0.2,
        weaponW,
        weaponH,
      );
    }
  }

  private drawTiledSprite(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    if (!img || img.naturalWidth === 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    if (e.kind === "boss") {
      ctx.fillStyle = "#6b3a1a";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffb347";
      ctx.lineWidth = 3;
      ctx.stroke();
      this.drawHpBar(ctx, e, "#ffb347");
      return;
    }
    if (e.kind === "champion") {
      ctx.fillStyle = "#9a6b3a";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 2;
      ctx.stroke();
      this.drawHpBar(ctx, e, "#ffd27a");
      return;
    }
    ctx.fillStyle = "#3a4250";
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a6470";
    ctx.lineWidth = 1;
    ctx.stroke();
    this.drawHpBar(ctx, e, "#8a94a6");
  }

  drawHpBar(ctx: CanvasRenderingContext2D, e: Enemy, color: string): void {
    const w = e.r * 2 + 4;
    const h = 4;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "#1a1c22";
    ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * pct, h);
  }

  drawChest(ctx: CanvasRenderingContext2D, c: Chest): void {
    const x = c.x;
    const y = c.y + Math.sin(c.bob * 4) * 4;
    ctx.fillStyle = "#7a5a2a";
    ctx.fillRect(x - 12, y - 10, 24, 20);
    ctx.fillStyle = "#5a3f1a";
    ctx.fillRect(x - 12, y - 10, 24, 4);
    ctx.fillStyle = "#cbb07c";
    ctx.fillRect(x - 3, y - 4, 6, 8);
    ctx.strokeStyle = "#ffd27a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 12, y - 10, 24, 20);
    ctx.fillStyle = "#ffd27a";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("chest", x, y - 16);
  }
}

interface Enemy {
  kind: "normal" | "champion" | "boss";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  r: number;
  dmg: number;
  cd?: number;
}

interface Chest {
  x: number;
  y: number;
  bob: number;
  open: boolean;
  life: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface D2InventoryItem {
  id: string;
  name: string;
  rarity: "normal" | "magic" | "rare";
  slot: "weapon" | "armor" | "charm";
  desc: string;
  stats?: D2ItemStats;
  affixes?: string[];
}

interface D2ItemStats {
  damageMin?: number;
  damageMax?: number;
  armor?: number;
  plusDamage?: number;
  plusStrength?: number;
  plusVitality?: number;
  requiresStrength?: number;
}

interface DragState {
  slotIndex: number;
  clientX: number;
  clientY: number;
  item?: D2InventoryItem;
}
