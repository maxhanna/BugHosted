import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  HostListener,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL_BASE = "assets/d2-models";
const CLASS_MODEL: Record<
  string,
  { model: string; body: string; head: string; hair?: string; armor?: string; weapon?: string }
> = {
  amazon: {
    model: `${MODEL_BASE}/amazon/amazon.glb`,
    body: `${MODEL_BASE}/amazon/textures/amazon_body_alb.png`,
    head: `${MODEL_BASE}/amazon/textures/amazon_head_alb.png`,
    hair: `${MODEL_BASE}/amazon/textures/amazon_hair_alb.png`,
    armor: `${MODEL_BASE}/amazon/textures/amazon_armormed_alb.png`,
    weapon: `${MODEL_BASE}/amazon/textures/weapon_pike_albout.png`,
  },
  assassin: {
    model: `${MODEL_BASE}/assassin/assassin.glb`,
    body: `${MODEL_BASE}/assassin/textures/assassins_body_alb.png`,
    head: `${MODEL_BASE}/assassin/textures/assassin_face_alb.png`,
    hair: `${MODEL_BASE}/assassin/textures/assassin_hair_alb.png`,
    armor: `${MODEL_BASE}/assassin/textures/assassin_armormed_alb.png`,
  },
  barbarian: {
    model: `${MODEL_BASE}/barbarian/barbarian.glb`,
    body: `${MODEL_BASE}/barbarian/textures/body_alb.png`,
    head: `${MODEL_BASE}/barbarian/textures/head_alb.png`,
    hair: `${MODEL_BASE}/barbarian/textures/barbarian_hair_new_alb.png`,
    armor: `${MODEL_BASE}/barbarian/textures/barb_armormed_alb.png`,
  },
  druid: {
    model: `${MODEL_BASE}/druid/druid.glb`,
    body: `${MODEL_BASE}/druid/textures/body_alb.png`,
    head: `${MODEL_BASE}/druid/textures/face_alb.png`,
    hair: `${MODEL_BASE}/druid/textures/druid_hair_white_alb.png`,
    armor: `${MODEL_BASE}/druid/textures/druid_armormed_alb.png`,
  },
  necromancer: {
    model: `${MODEL_BASE}/necromancer/necromancer.glb`,
    body: `${MODEL_BASE}/necromancer/textures/necro_body_alb.png`,
    head: `${MODEL_BASE}/necromancer/textures/necro_head_alb.png`,
    hair: `${MODEL_BASE}/necromancer/textures/necro_hair_alb.png`,
    armor: `${MODEL_BASE}/necromancer/textures/necro_armormed_alb.png`,
  },
  paladin: {
    model: `${MODEL_BASE}/paladin/paladin.glb`,
    body: `${MODEL_BASE}/paladin/textures/paladin_body_alb.png`,
    head: `${MODEL_BASE}/paladin/textures/paladin_face_alb.png`,
    hair: `${MODEL_BASE}/paladin/textures/paladin_hair_alb.png`,
    armor: `${MODEL_BASE}/paladin/textures/paladin_armormed_alb.png`,
  },
  sorceress: {
    model: `${MODEL_BASE}/sorceress/sorceress.glb`,
    body: `${MODEL_BASE}/sorceress/textures/sorceress_body_albedo.png`,
    head: `${MODEL_BASE}/sorceress/textures/sorceress_head_albedo.png`,
    hair: `${MODEL_BASE}/sorceress/textures/sorceress_hair_alb.png`,
    armor: `${MODEL_BASE}/sorceress/textures/sorceress_lightarmor_albedo.png`,
    weapon: `${MODEL_BASE}/sorceress/textures/weapon_horadric_staff_albout.png`,
  },
};

@Component({
  selector: "app-d2-survivors",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./d2survivors.component.html",
  styleUrls: ["./d2survivors.component.css"],
})
export class D2SurvivorsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("arena") arenaRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("characterCanvas") characterCanvasRef?: ElementRef<HTMLCanvasElement>;

  private characterRenderer?: THREE.WebGLRenderer;
  private characterScene?: THREE.Scene;
  private characterCamera?: THREE.OrthographicCamera;
  private characterModel?: THREE.Group;
  private loadedModelClass = "";
  modelLoadError = false;
  @ViewChild("classPreviewCanvas") private classPreviewCanvasRef?: ElementRef<HTMLCanvasElement>;
  private previewRenderer?: THREE.WebGLRenderer;
  private previewScene?: THREE.Scene;
  private previewCamera?: THREE.PerspectiveCamera;
  previewModel?: THREE.Group;
  previewLoadError = false;
  private previewFrameId = 0;
  private previewModelRequest = 0;
  private previewLastFrameAt = 0;
  private readonly reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  ambientAudioEnabled = false;
  ambientAudioStatus = "Ambience muted";
  private audioContext?: AudioContext;
  private ambientMasterGain?: GainNode;
  private ambientAudioNodes: OscillatorNode[] = [];
  private ambientAudioTimeout?: number;
  private ambienceRequestId = 0;

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

  // Menu and mini-run state
  activeTab: "menu" | "lore" | "run" = "menu";
  menuPanel: "main" | "characters" | "credits" = "main";
  runActive = false;
  playerX = 250;
  playerY = 250;
  playerHp = 20;
  playerMaxHp = 20;
  playerMana = 20;
  playerMaxMana = 20;
  playerGold = 0;
  ownedSkills: string[] = [];
  skillLevels: Record<string, number> = {};
  selectedClass = "amazon";
  private readonly classStartingStats: Record<string, { title: string; specialty: string; life: number; mana: number; stamina: number; attributes: [number, number, number, number] }> = {
    amazon: { title: "Spear & Bow Mastery", specialty: "Balanced · Ranged Combat", life: 24, mana: 15, stamina: 84, attributes: [20, 25, 20, 15] },
    assassin: { title: "Shadow Discipline", specialty: "Agile · Traps & Martial Arts", life: 20, mana: 25, stamina: 95, attributes: [20, 20, 20, 25] },
    barbarian: { title: "Master of Arms", specialty: "Melee · Strength & Endurance", life: 30, mana: 10, stamina: 92, attributes: [30, 20, 25, 10] },
    druid: { title: "Keeper of the Wild", specialty: "Nature · Elemental & Summoning", life: 25, mana: 20, stamina: 90, attributes: [25, 20, 25, 20] },
    necromancer: { title: "Lord of the Dead", specialty: "Dark Arts · Bone & Summoning", life: 15, mana: 25, stamina: 80, attributes: [15, 25, 15, 25] },
    paladin: { title: "Holy Warrior", specialty: "Melee · Auras & Defense", life: 25, mana: 15, stamina: 90, attributes: [25, 15, 25, 15] },
    sorceress: { title: "Elemental Adept", specialty: "Spellcaster · Fire, Cold & Lightning", life: 10, mana: 35, stamina: 74, attributes: [10, 25, 10, 35] },
  };

  get selectedClassStats(): { title: string; specialty: string; life: number; mana: number; stamina: number; attributes: Array<{ name: string; value: number }> } {
    const stats = this.classStartingStats[this.selectedClass] ?? this.classStartingStats["amazon"];
    return {
      ...stats,
      attributes: ["Strength", "Dexterity", "Vitality", "Energy"].map((name, index) => ({ name, value: stats.attributes[index] })),
    };
  }

  get selectedClassName(): string {
    return this.classes.find((characterClass) => characterClass.id === this.selectedClass)?.name ?? "Amazon";
  }

  get selectedClassDescription(): string {
    return this.classes.find((characterClass) => characterClass.id === this.selectedClass)?.desc ?? "Choose a hero to begin.";
  }

  returnToMenu(): void {
    this.activeTab = "menu";
    this.menuPanel = "main";
    this.runActive = false;
  }

  openLore(): void {
    this.stopAmbientAudio();
    this.activeTab = "lore";
  }

  toggleAmbientAudio(): void {
    if (this.ambientAudioEnabled) {
      this.stopAmbientAudio();
      this.ambientAudioStatus = "Ambience muted";
      return;
    }

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      this.ambientAudioStatus = "Ambient audio is not supported in this browser";
      return;
    }

    this.ambientAudioEnabled = true;
    this.ambientAudioStatus = "Starting ambient sound";
    const requestId = ++this.ambienceRequestId;
    void this.startAmbientAudio(requestId);
  }

  private async startAmbientAudio(requestId: number): Promise<void> {
    try {
      this.audioContext ??= new window.AudioContext();
      await this.audioContext.resume();
      if (!this.ambientAudioEnabled || requestId !== this.ambienceRequestId) {
        return;
      }

      const context = this.audioContext;
      const master = context.createGain();
      master.gain.setValueAtTime(0, context.currentTime);
      master.gain.linearRampToValueAtTime(0.12, context.currentTime + 2.5);
      master.connect(context.destination);
      this.ambientMasterGain = master;

      const droneFilter = context.createBiquadFilter();
      droneFilter.type = "lowpass";
      droneFilter.frequency.value = 180;
      droneFilter.connect(master);
      [55, 82.41].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const voiceGain = context.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        voiceGain.gain.value = index === 0 ? 0.55 : 0.16;
        oscillator.connect(voiceGain);
        voiceGain.connect(droneFilter);
        oscillator.start();
        this.ambientAudioNodes.push(oscillator);
      });

      this.ambientAudioStatus = "Ambient sound on";
      this.scheduleAmbientChime(requestId);
    } catch (error) {
      if (requestId === this.ambienceRequestId) {
        console.warn("Could not start title-screen ambience", error);
        this.stopAmbientAudio();
        this.ambientAudioStatus = "Ambient audio could not start";
      }
    }
  }

  private scheduleAmbientChime(requestId: number): void {
    if (!this.ambientAudioEnabled || requestId !== this.ambienceRequestId || !this.audioContext || !this.ambientMasterGain) {
      return;
    }

    const delay = 8000 + Math.random() * 7000;
    this.ambientAudioTimeout = window.setTimeout(() => {
      if (!this.audioContext || !this.ambientMasterGain || !this.ambientAudioEnabled || requestId !== this.ambienceRequestId) {
        return;
      }

      const context = this.audioContext;
      const chime = context.createOscillator();
      const envelope = context.createGain();
      const tone = [329.63, 392, 493.88, 587.33][Math.floor(Math.random() * 4)];
      const now = context.currentTime;
      chime.type = "sine";
      chime.frequency.setValueAtTime(tone, now);
      chime.frequency.exponentialRampToValueAtTime(tone * 0.997, now + 1.8);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.04, now + 0.08);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      chime.connect(envelope);
      envelope.connect(this.ambientMasterGain);
      chime.onended = () => {
        chime.disconnect();
        envelope.disconnect();
      };
      chime.start(now);
      chime.stop(now + 2.25);
      this.scheduleAmbientChime(requestId);
    }, delay);
  }

  private stopAmbientAudio(): void {
    this.ambientAudioEnabled = false;
    this.ambienceRequestId++;
    if (this.ambientAudioTimeout !== undefined) {
      window.clearTimeout(this.ambientAudioTimeout);
      this.ambientAudioTimeout = undefined;
    }
    if (this.audioContext && this.ambientMasterGain) {
      const context = this.audioContext;
      const master = this.ambientMasterGain;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, 0.06);
      window.setTimeout(() => master.disconnect(), 250);
    }
    for (const oscillator of this.ambientAudioNodes) {
      try {
        oscillator.stop();
        oscillator.disconnect();
      } catch {
        // Oscillators already stopped after a rapid toggle.
      }
    }
    this.ambientAudioNodes = [];
    this.ambientMasterGain = undefined;
  }

  resumeRun(): void {
    this.activeTab = "run";
    this.runActive = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  openCharacterSelect(): void {
    this.stopAmbientAudio();
    this.ambientAudioStatus = "Ambience muted";
    this.menuPanel = "characters";
    this.startClassPreview();
  }

  closeCharacterSelect(): void {
    this.menuPanel = "main";
    this.startClassPreview();
  }

  selectClass(classId: string): void {
    if (!CLASS_MODEL[classId]) {
      return;
    }
    this.selectedClass = classId;
    if (this.menuPanel === "characters") {
      this.loadPreviewModel();
    }
  }

  private startClassPreview(): void {
    if (!this.classPreviewCanvasRef) {
      requestAnimationFrame(() => this.startClassPreview());
      return;
    }
    if (this.previewRenderer?.domElement === this.classPreviewCanvasRef.nativeElement) {
      this.resizeClassPreview();
      return;
    }
    this.stopClassPreview();
    try {
      const canvas = this.classPreviewCanvasRef.nativeElement;
      this.previewRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.previewRenderer.setClearColor(0x000000, 0);
      this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.previewScene = new THREE.Scene();
      this.previewCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
      this.previewCamera.position.set(0, 115, 260);
      this.previewCamera.lookAt(0, 58, 0);
      this.previewScene.add(new THREE.HemisphereLight(0xe7eaff, 0x2e1b16, 2.5));
      const keyLight = new THREE.DirectionalLight(0xffe1b5, 3.4);
      keyLight.position.set(-140, 240, 180);
      this.previewScene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9bcaff, 2.2);
      fillLight.position.set(150, 130, -140);
      this.previewScene.add(fillLight);
      this.resizeClassPreview();
      this.loadPreviewModel();
      this.previewLastFrameAt = performance.now();
      this.animateClassPreview(this.previewLastFrameAt);
    } catch (error) {
      console.error("Could not initialize the class preview", error);
      this.previewLoadError = true;
    }
  }

  private stopClassPreview(): void {
    if (this.previewFrameId) {
      cancelAnimationFrame(this.previewFrameId);
      this.previewFrameId = 0;
    }
    this.previewModelRequest++;
    this.disposePreviewModel();
    this.previewRenderer?.dispose();
    this.previewRenderer = undefined;
    this.previewScene = undefined;
    this.previewCamera = undefined;
  }

  private disposePreviewModel(): void {
    if (!this.previewModel) {
      return;
    }
    this.previewScene?.remove(this.previewModel);
    this.previewModel.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.previewModel = undefined;
  }

  @HostListener("window:resize")
  private resizeClassPreview(): void {
    const canvas = this.classPreviewCanvasRef?.nativeElement;
    if (!canvas || !this.previewRenderer || !this.previewCamera) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    this.previewRenderer.setSize(rect.width, rect.height, false);
    this.previewCamera.aspect = rect.width / rect.height;
    this.previewCamera.updateProjectionMatrix();
  }

  private loadPreviewModel(): void {
    if (!this.previewScene || !this.previewCamera || !this.previewRenderer) {
      return;
    }
    const definition = CLASS_MODEL[this.selectedClass];
    if (!definition) {
      return;
    }
    const requestId = ++this.previewModelRequest;
    const modelClass = this.selectedClass;
    this.previewLoadError = false;
    this.disposePreviewModel();
    new GLTFLoader().load(definition.model, (gltf) => {
      const model = gltf.scene;
      if (!this.previewScene || requestId !== this.previewModelRequest || modelClass !== this.selectedClass || this.menuPanel !== "characters") {
        model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) {
            return;
          }
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        });
        return;
      }
      this.applyClassTextures(model, modelClass);
      this.normalizeCharacterModel(model, 148);
      this.previewModel = model;
      this.previewScene.add(model);
      this.previewLoadError = false;
    }, undefined, (error: unknown) => {
      if (requestId !== this.previewModelRequest) {
        return;
      }
      console.error(`Could not load the ${modelClass} class preview`, error);
      this.previewLoadError = true;
    });
  }

  private animateClassPreview(now: number): void {
    if (!this.previewRenderer || !this.previewScene || !this.previewCamera) {
      return;
    }
    const dt = Math.min(50, now - this.previewLastFrameAt) / 1000;
    this.previewLastFrameAt = now;
    if (this.previewModel && !this.reducedMotion) {
      this.previewModel.rotation.y += dt * 0.28;
      this.previewModel.position.y = Math.sin(now / 850) * 2.4;
    }
    this.resizeClassPreview();
    this.previewRenderer.render(this.previewScene, this.previewCamera);
    this.previewFrameId = requestAnimationFrame((time) => this.animateClassPreview(time));
  }

  private modelLoadRequest = 0;
  beltSlots: Array<{ kind: "health" | "mana" | null }> = [
    { kind: "health" }, { kind: "mana" }, { kind: "health" }, { kind: "mana" },
    { kind: "health" }, { kind: "mana" }, { kind: "health" }, { kind: "mana" },
    { kind: null }, { kind: null }, { kind: null }, { kind: null },
    { kind: null }, { kind: null }, { kind: null }, { kind: null },
  ];
  activeBottleSlot = 0;
  combatOrbsTime = 0;
  loadedClassTextures: Record<string, HTMLImageElement | null> = {};
  bodyImg: HTMLImageElement | null = null;
  headImg: HTMLImageElement | null = null;
  hairImg: HTMLImageElement | null = null;
  armorImg: HTMLImageElement | null = null;
  weaponImg: HTMLImageElement | null = null;
  textureLoadError = false;
  enemies: Enemy[] = [];
  chests: Chest[] = [];
  potionDrops: PotionDrop[] = [];
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
  inventory: Array<D2InventoryItem | null> = [];
  inventoryGrid: Array<{ item?: D2InventoryItem }> = [];
  inventoryColumns = 4;
  inventoryRows = 10;
  inventoryStatus = "";

  private rebuildInventoryGrid(): void {
    const slotCount = this.inventoryColumns * this.inventoryRows;
    this.inventory = Array.from({ length: slotCount }, (_, index) => this.inventory[index] ?? null);
    this.inventoryGrid = this.inventory.map((item) => ({ item: item ?? undefined }));
  }

  private addInventoryItem(item: D2InventoryItem): boolean {
    const slotIndex = this.inventory.findIndex((slot) => slot === null);
    if (slotIndex < 0) {
      this.inventoryStatus = "Inventory full — item could not be picked up.";
      return false;
    }
    this.inventory[slotIndex] = item;
    this.inventoryGrid[slotIndex].item = item;
    this.inventoryStatus = "";
    return true;
  }

  private randomItem(): D2InventoryItem {
    const bases: Array<Pick<D2InventoryItem, "name" | "slot" | "stats" | "desc">> = [
      { name: "Short Sword", slot: "weapon", stats: { damageMin: 3, damageMax: 7 }, desc: "A balanced blade suited to quick strikes." },
      { name: "War Pike", slot: "weapon", stats: { damageMin: 5, damageMax: 12 }, desc: "A long, heavy spear with excellent reach." },
      { name: "Leather Cap", slot: "armor", stats: { armor: 8, requiresStrength: 10 }, desc: "A simple cap reinforced with boiled leather." },
      { name: "Chain Hauberk", slot: "armor", stats: { armor: 18, requiresStrength: 20 }, desc: "Interlocking rings offer dependable protection." },
      { name: "Crimson Small Charm", slot: "charm", stats: { plusVitality: 4 }, desc: "A palm-sized charm warm to the touch." },
      { name: "Azure Small Charm", slot: "charm", stats: { plusStrength: 2 }, desc: "A blue charm etched with a protective rune." },
      { name: "Gold Amulet", slot: "charm", stats: { plusVitality: 3 }, desc: "An old amulet bearing a faint golden glow." },
      { name: "Ring of the Artisan", slot: "charm", stats: { plusDamage: 2 }, desc: "A finely worked ring made for a master craftsperson." },
      { name: "Soulstone Shard", slot: "charm", stats: { plusStrength: 1, plusVitality: 2 }, desc: "A dangerous fragment that hums with trapped power." },
      { name: "Quill of the Fates", slot: "charm", stats: { plusDamage: 1, plusVitality: 2 }, desc: "An ink-dark quill said to record every bargain." },
    ];
    type Affix = { name: string; stat: "plusDamage" | "plusStrength" | "plusVitality"; label: string; min: number; max: number };
    const prefixes: Affix[] = [
      { name: "Stalwart", stat: "plusVitality", label: "Life", min: 2, max: 6 },
      { name: "Savage", stat: "plusDamage", label: "Maximum Damage", min: 2, max: 6 },
      { name: "Mighty", stat: "plusStrength", label: "Strength", min: 1, max: 4 },
      { name: "Vigorous", stat: "plusVitality", label: "Life", min: 3, max: 7 },
      { name: "Keen", stat: "plusDamage", label: "Maximum Damage", min: 1, max: 4 },
    ];
    const suffixes: Affix[] = [
      { name: "of Might", stat: "plusStrength", label: "Strength", min: 1, max: 4 },
      { name: "of the Fox", stat: "plusVitality", label: "Life", min: 2, max: 5 },
      { name: "of Haste", stat: "plusDamage", label: "Maximum Damage", min: 1, max: 3 },
      { name: "of the Bear", stat: "plusVitality", label: "Life", min: 3, max: 6 },
      { name: "of Precision", stat: "plusDamage", label: "Maximum Damage", min: 2, max: 5 },
    ];
    const base = bases[Math.floor(Math.random() * bases.length)];
    const roll = Math.random();
    const rarity: D2InventoryItem["rarity"] = roll < 0.12 ? "rare" : roll < 0.48 ? "magic" : "normal";
    const stats: D2ItemStats = { ...base.stats };
    const affixes: string[] = [];
    let prefixName = "";
    let suffixName = "";
    const applyAffix = (affix: Affix): void => {
      const amount = affix.min + Math.floor(Math.random() * (affix.max - affix.min + 1));
      stats[affix.stat] = (stats[affix.stat] ?? 0) + amount;
      affixes.push(`+${amount} ${affix.label} (${affix.name})`);
    };

    if (rarity === "magic") {
      if (Math.random() < 0.5) {
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        prefixName = prefix.name;
        applyAffix(prefix);
      } else {
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        suffixName = suffix.name;
        applyAffix(suffix);
      }
    } else if (rarity === "rare") {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      prefixName = prefix.name;
      suffixName = suffix.name;
      applyAffix(prefix);
      applyAffix(suffix);
    }

    const displayName = rarity === "normal"
      ? base.name
      : `${prefixName ? prefixName + " " : ""}${base.name}${suffixName ? " " + suffixName : ""}`;
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
      name: displayName,
      baseName: base.name,
      rarity,
      slot: base.slot,
      desc: base.desc,
      stats,
      affixes,
    };
  }

  onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      this.keysDown.add(key);
      return;
    }
    if (/^[1-4]$/.test(key)) {
      this.drinkBeltPotion(Number(key) - 1);
      this.drinkBeltPotion(Number(key) + 3);
      this.drinkBeltPotion(Number(key) + 7);
      this.drinkBeltPotion(Number(key) + 11);
    } else if (key === "p") {
      this.drinkBeltPotion(this.activeBottleSlot);
    }
  }

  drinkBeltPotion(slotIndex: number): void {
    const slot = this.beltSlots[slotIndex];
    if (!slot?.kind) {
      return;
    }
    if (slot.kind === "health" && this.playerHp < this.playerMaxHp) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 8);
      slot.kind = null;
      this.combatOrbsTime = 2.5;
    } else if (slot.kind === "mana" && this.playerMana < this.playerMaxMana) {
      this.playerMana = Math.min(this.playerMaxMana, this.playerMana + 8);
      slot.kind = null;
      this.combatOrbsTime = 2.5;
    }
  }

  selectBottle(slotIndex: number): void {
    this.activeBottleSlot = slotIndex;
    this.arenaRef?.nativeElement.focus();
  }

  get healthOrbFill(): number {
    return Math.max(0, Math.min(1, this.playerHp / this.playerMaxHp));
  }

  get manaOrbFill(): number {
    return Math.max(0, Math.min(1, this.playerMana / this.playerMaxMana));
  }

  onKeyUp(event: KeyboardEvent): void {
    this.keysDown.delete(event.key.toLowerCase());
  }

  ngOnInit(): void {
    this.runActive = false;
    this.activeTab = "menu";
    this.rebuildInventoryGrid();
  }

  ngAfterViewInit(): void {
    // Keep class selection lightweight; the selected model is loaded once gameplay starts.
  }

  ngOnDestroy(): void {
    this.runActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.characterModel?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material?.dispose();
      }
    });
    this.characterRenderer?.dispose();
    this.stopClassPreview();
    this.stopAmbientAudio();
    void this.audioContext?.close();
    this.audioContext = undefined;
  }

  startRun(): void {
    this.stopClassPreview();
    this.stopAmbientAudio();
    this.ambientAudioStatus = "Ambience muted";
    this.runActive = false;
    this.activeTab = "run";
    this.menuPanel = "main";
    this.playerX = 250;
    this.playerY = 250;
    const startingStats = this.classStartingStats[this.selectedClass] ?? this.classStartingStats["amazon"];
    this.playerMaxHp = startingStats.life;
    this.playerMaxMana = startingStats.mana;
    this.playerHp = this.playerMaxHp;
    this.playerMana = this.playerMaxMana;
    this.playerGold = 0;
    this.ownedSkills = ["Fire Ball", "Chain Lightning", "Blade Fury"];
    this.skillLevels = {
      "Fire Ball": 1,
      "Chain Lightning": 1,
      "Blade Fury": 1,
    };
    this.enemies = [];
    this.chests = [];
    this.potionDrops = [];
    this.floatingTexts = [];
    this.beltSlots = [
      { kind: "health" }, { kind: "mana" }, { kind: "health" }, { kind: "mana" },
      { kind: "health" }, { kind: "mana" }, { kind: "health" }, { kind: "mana" },
      { kind: null }, { kind: null }, { kind: null }, { kind: null },
      { kind: null }, { kind: null }, { kind: null }, { kind: null },
    ];
    this.activeBottleSlot = 0;
    this.combatOrbsTime = 0;
    this.inventory = [];
    this.rebuildInventoryGrid();
    this.selectedItem = null;
    this.selectedSlotIndex = null;
    this.dragState = null;
    this.dragGhostSlotIndex = null;
    this.inventoryStatus = "";
    this.runTime = 0;
    this.spawnAcc = 0;
    this.chestTimer = 0;
    this.lastTime = performance.now();
    this.initializeCharacterRenderer();
    if (this.characterRenderer && this.characterScene && this.loadedModelClass !== this.selectedClass) {
      this.loadCharacterModel();
    } else if (!this.characterRenderer || !this.characterScene) {
      this.modelLoadError = true;
    }
    this.runActive = true;
    this.loop(this.lastTime);
  }

  loadSelectedClassTextures(): void {
    // FBX class models include the correctly rigged meshes and their materials.
    // Kept as the existing class-selection hook, now loading that actual model.
    this.loadCharacterModel();
  }

  loop(now: number): void {
    const dt = Math.min(50, now - this.lastTime);
    this.lastTime = now;
    if (!this.runActive) {
      return;
    }
    this.update(dt);
    this.draw();
    this.renderCharacter();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt: number): void {
    this.runTime += dt / 1000;
    this.combatOrbsTime = Math.max(0, this.combatOrbsTime - dt / 1000);
    this.playerMana = Math.min(this.playerMaxMana, this.playerMana + dt * 0.0015);

    this.movePlayer(dt);
    this.updateEnemies(dt);
    this.updateChests(dt);
    this.updatePotionDrops(dt);
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

  updatePotionDrops(dt: number): void {
    for (const drop of this.potionDrops) {
      drop.bob += dt / 1000;
      drop.life -= dt / 1000;
      drop.pickupDelay = Math.max(0, drop.pickupDelay - dt / 1000);
      if (drop.pickupDelay > 0 || Math.hypot(this.playerX - drop.x, this.playerY - drop.y) >= 28) {
        continue;
      }
      const slot = this.beltSlots.find((candidate) => candidate.kind === null);
      if (!slot) {
        if (!drop.notifiedFull) {
          this.floatingTexts.push({
            x: drop.x,
            y: drop.y - 18,
            text: "BELT FULL",
            color: "#ffcf72",
            life: 1.8,
          });
          drop.notifiedFull = true;
        }
        continue;
      }
      slot.kind = drop.kind;
      drop.collected = true;
      this.floatingTexts.push({
        x: drop.x,
        y: drop.y - 18,
        text: `${drop.kind.toUpperCase()} POTION`,
        color: drop.kind === "health" ? "#ff7171" : "#73c9ff",
        life: 2,
      });
    }
    this.potionDrops = this.potionDrops.filter((drop) => !drop.collected && drop.life > 0);
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

  getItemStatText(item: D2InventoryItem | null): string[] {
    if (!item) {
      return [];
    }
    const lines: string[] = [];
    if (item.stats) {
      const stats = item.stats;
      if (stats.damageMin != null && stats.damageMax != null) {
        lines.push(`Damage: ${stats.damageMin} to ${stats.damageMax}`);
      }
      if (stats.armor != null) {
        lines.push(`Armor: ${stats.armor}`);
      }
      if (stats.plusDamage != null && stats.plusDamage > 0) {
        lines.push(`+${stats.plusDamage} to Maximum Damage`);
      }
      if (stats.plusStrength != null && stats.plusStrength > 0) {
        lines.push(`+${stats.plusStrength} Strength`);
      }
      if (stats.plusVitality != null && stats.plusVitality > 0) {
        lines.push(`+${stats.plusVitality} to Maximum Life`);
      }
      if (stats.requiresStrength != null && stats.requiresStrength > 0) {
        lines.push(`Requires ${stats.requiresStrength} Strength`);
      }
    }
    if (item.affixes?.length) {
      lines.push(...item.affixes);
    }
    return lines.length ? lines : ["No additional bonuses"] ;
  }

  readonly itemStatText = this.getItemStatText.bind(this);

  getItemAtSlot(slotIndex: number): D2InventoryItem | undefined {
    return this.inventoryGrid[slotIndex]?.item;
  }

  getInventorySlotIndexFromElement(target: EventTarget | null): number {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-inventory-slot]") : null;
    if (!element) {
      return -1;
    }
    const slotIndex = Number(element.dataset["inventorySlot"]);
    return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < this.inventoryGrid.length
      ? slotIndex
      : -1;
  }

  internalCanDrop(sourceIndex: number, targetIndex: number, sourceItem?: D2InventoryItem): boolean {
    if (sourceIndex < 0 || sourceIndex >= this.inventoryGrid.length || targetIndex < 0 || targetIndex >= this.inventoryGrid.length || sourceIndex === targetIndex) {
      return false;
    }
    const source = this.inventoryGrid[sourceIndex]?.item;
    const heldItem = sourceItem ?? source;
    if (!heldItem || source?.id !== heldItem.id) {
      return false;
    }
    // This is a bag grid rather than an equipment layout, so any item may move to any other cell.
    // Dropping on an occupied cell swaps its contents.
    return true;
  }

  startDrag(slotIndex: number, event: DragEvent): void {
    const item = this.getItemAtSlot(slotIndex);
    if (!item) {
      event.preventDefault();
      return;
    }
    this.dragState = { slotIndex, item };
    this.selectedItem = item;
    this.selectedSlotIndex = slotIndex;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    }
  }

  onInventoryDragOver(slotIndex: number, event: DragEvent): void {
    if (!this.dragState) {
      return;
    }
    if (this.internalCanDrop(this.dragState.slotIndex, slotIndex, this.dragState.item)) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      this.dragGhostSlotIndex = slotIndex;
      return;
    }
    this.dragGhostSlotIndex = slotIndex;
  }

  onInventoryDrop(slotIndex: number, event: DragEvent): void {
    event.preventDefault();
    const drag = this.dragState;
    if (!drag || !this.internalCanDrop(drag.slotIndex, slotIndex, drag.item)) {
      this.inventoryStatus = "That item cannot be placed there.";
      this.clearDragState();
      return;
    }
    const targetItem = this.inventoryGrid[slotIndex].item;
    this.inventory[drag.slotIndex] = targetItem ?? null;
    this.inventoryGrid[drag.slotIndex].item = targetItem;
    this.inventory[slotIndex] = drag.item;
    this.inventoryGrid[slotIndex].item = drag.item;
    this.selectedItem = drag.item;
    this.selectedSlotIndex = slotIndex;
    this.inventoryStatus = "";
    this.clearDragState();
  }

  onInventoryDragEnd(): void {
    this.clearDragState();
  }

  private clearDragState(): void {
    this.dragState = null;
    this.dragGhostSlotIndex = null;
  }

  selectInventoryItem(slotIndex: number, item: D2InventoryItem | null): void {
    this.selectedItem = item;
    this.selectedSlotIndex = item ? slotIndex : null;
  }

  canDropOnSlot(sourceIndex: number, targetIndex: number, sourceItem?: D2InventoryItem): boolean {
    return this.internalCanDrop(sourceIndex, targetIndex, sourceItem);
  }


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

    this.spawnPotionDrops(c.x, c.y);

    const droppedItem = this.randomItem();
    if (this.addInventoryItem(droppedItem)) {
      this.floatingTexts.push({
        x: c.x,
        y: c.y - 34,
        text: droppedItem.name,
        color: droppedItem.rarity === "rare" ? "#ffd27a" : droppedItem.rarity === "magic" ? "#78bbff" : "#ded8cb",
        life: 3,
      });
    }
  }

  private spawnPotionDrops(x: number, y: number): void {
    const dropCount = Math.random() < 0.35 ? 2 : 1;
    for (let index = 0; index < dropCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 24 + index * 12;
      this.potionDrops.push({
        x: Math.max(18, Math.min(this.arenaW - 18, x + Math.cos(angle) * distance)),
        y: Math.max(18, Math.min(this.arenaH - 18, y + Math.sin(angle) * distance)),
        kind: Math.random() < 0.5 ? "health" : "mana",
        bob: 0,
        life: 25,
        pickupDelay: 0.9,
        notifiedFull: false,
        collected: false,
      });
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

    for (const drop of this.potionDrops) {
      this.drawPotionDrop(ctx, drop);
    }

    // The player is rendered as a lit FBX model on the transparent WebGL overlay.

    for (const f of this.floatingTexts) {
      ctx.fillStyle = f.color;
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    }
  }

  private initializeCharacterRenderer(): void {
    if (this.characterRenderer && this.characterScene && this.characterCamera) {
      const canvas = this.characterCanvasRef?.nativeElement;
      if (canvas && this.characterRenderer.domElement !== canvas) {
        this.characterRenderer.dispose();
        this.characterRenderer = undefined;
      } else {
        return;
      }
    }
    const canvas = this.characterCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    try {
      this.characterRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      this.characterRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.characterRenderer.setSize(this.arenaW, this.arenaH, false);
      this.characterRenderer.setClearColor(0x000000, 0);
      this.characterRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.characterScene = new THREE.Scene();
      this.characterCamera = new THREE.OrthographicCamera(-250, 250, 250, -250, 0.1, 2000);
      this.characterCamera.position.set(0, 600, 150);
      this.characterCamera.lookAt(0, 0, 0);
      this.characterScene.add(new THREE.HemisphereLight(0xdce7ff, 0x30251b, 2.4));
      const keyLight = new THREE.DirectionalLight(0xffe1b0, 3.2);
      keyLight.position.set(-180, 360, 240);
      this.characterScene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9abaff, 1.6);
      fillLight.position.set(180, 180, -240);
      this.characterScene.add(fillLight);
    } catch (error) {
      console.error("Could not initialize the character renderer", error);
      this.modelLoadError = true;
    }
  }

  private loadCharacterModel(): void {
    const definition = CLASS_MODEL[this.selectedClass];
    if (!definition || !this.characterScene || !this.characterRenderer) {
      return;
    }
    this.modelLoadError = false;
    const requestId = ++this.modelLoadRequest;
    const modelClass = this.selectedClass;
    const loader = new GLTFLoader();
    loader.load(
      definition.model,
      (gltf) => {
        const model = gltf.scene;
        if (!this.characterScene || requestId !== this.modelLoadRequest || modelClass !== this.selectedClass) {
          model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) {
              return;
            }
            mesh.geometry?.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => material.dispose());
          });
          return;
        }
        if (this.characterModel) {
          this.characterScene.remove(this.characterModel);
          this.characterModel.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) {
              return;
            }
            mesh.geometry?.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => material.dispose());
          });
          this.characterModel = undefined;
          this.loadedModelClass = "";
        }
        this.applyClassTextures(model, modelClass);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        if (size.y <= 0 || !Number.isFinite(size.y)) {
          model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.geometry?.dispose();
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              materials.forEach((material) => material.dispose());
            }
          });
          this.modelLoadError = true;
          return;
        }
        this.normalizeCharacterModel(model, 72);
        model.rotation.y = 0;

        // Keep the normalized model offset separate from the world-space player anchor.
        // Replacing the GLTF root position directly while moving discards its centering offset.
        const playerAnchor = new THREE.Group();
        playerAnchor.add(model);
        this.characterModel = playerAnchor;
        this.characterScene.add(playerAnchor);
        this.loadedModelClass = modelClass;
        this.modelLoadError = false;
        this.renderCharacter();
      },
      undefined,
      (error: unknown) => {
        if (requestId !== this.modelLoadRequest) {
          return;
        }
        console.error(`Could not load the ${modelClass} 3D character model`, error);
        this.characterModel = undefined;
        this.loadedModelClass = "";
        this.modelLoadError = true;
      },
    );
  }

  private applyClassTextures(model: THREE.Group, modelClass: string): void {
    const definition = CLASS_MODEL[modelClass];
    if (!definition) {
      return;
    }
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.side = THREE.DoubleSide;
        const texturedMaterial = material as THREE.MeshStandardMaterial;
        if (texturedMaterial.map) {
          // The source model exports placeholder maps; replace them with this class's atlas.
          const texturePath = this.getTextureForMesh(object.name, modelClass, definition);
          if (texturePath) {
            texturedMaterial.map.dispose();
            const texture = new THREE.TextureLoader().load(texturePath);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.previewRenderer?.capabilities.getMaxAnisotropy()
              ?? this.characterRenderer?.capabilities.getMaxAnisotropy()
              ?? 1;
            texturedMaterial.map = texture;
          }
          texturedMaterial.map.colorSpace = THREE.SRGBColorSpace;
          texturedMaterial.map.anisotropy = this.previewRenderer?.capabilities.getMaxAnisotropy()
            ?? this.characterRenderer?.capabilities.getMaxAnisotropy()
            ?? 1;
          texturedMaterial.map.needsUpdate = true;
        }
        if (material instanceof THREE.MeshPhongMaterial) {
          material.color.set(0xffffff);
          material.emissive.set(0x111111);
        }
        material.needsUpdate = true;
      }
    });
  }

  private normalizeCharacterModel(model: THREE.Group, targetHeight: number): void {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (size.y <= 0 || !Number.isFinite(size.y)) {
      throw new Error("Character model has invalid dimensions.");
    }
    model.scale.setScalar(targetHeight / size.y);
    model.position.set(-center.x * model.scale.x, -bounds.min.y * model.scale.y, -center.z * model.scale.z);
  }

  private getTextureForMesh(meshName: string, modelClass: string, definition: (typeof CLASS_MODEL)[string]): string | null {
    const textureRoot = `${MODEL_BASE}/${modelClass}/textures/`;
    const name = meshName.toLowerCase();
    if (name.includes("hair")) {
      return definition.hair ?? definition.head;
    }
    if (name.includes("head") || name.includes("eye_") || name.includes("teeth") || name.includes("tongue") || name.includes("face")) {
      return definition.head;
    }
    if (name.includes("pike") || name.includes("weapon")) {
      return definition.weapon ?? definition.body;
    }
    if (name.includes("armor") || name.includes("shoulder") || name.includes("skirt") || name.includes("tabard") || name.includes("pants")) {
      return definition.armor ?? definition.body;
    }
    if (name.includes("body") || name.includes("legs") || name.includes("arm")) {
      return definition.body;
    }
    return definition.body || `${textureRoot}${modelClass}_body_alb.png`;
  }

  private renderCharacter(): void {
    if (!this.characterRenderer || !this.characterScene || !this.characterCamera) {
      return;
    }
    if (this.characterModel) {
      const cameraHeight = this.characterCamera.position.y;
      const cameraDepth = this.characterCamera.position.z;
      const groundDepthScale = Math.hypot(cameraHeight, cameraDepth) / Math.abs(cameraHeight);
      this.characterModel.position.set(
        this.playerX - this.arenaW / 2,
        0,
        -(this.playerY - this.arenaH / 2) * groundDepthScale,
      );
    }
    this.characterRenderer.render(this.characterScene, this.characterCamera);
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

  drawPotionDrop(ctx: CanvasRenderingContext2D, drop: PotionDrop): void {
    const x = drop.x;
    const y = drop.y + Math.sin(drop.bob * 5) * 2;
    const potionColor = drop.kind === "health" ? "#e52b3c" : "#36a8f0";
    ctx.save();
    ctx.shadowColor = potionColor;
    ctx.shadowBlur = 9;
    ctx.fillStyle = "#a69b82";
    ctx.fillRect(x - 3, y - 9, 6, 4);
    ctx.fillStyle = potionColor;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 5);
    ctx.lineTo(x + 5, y - 5);
    ctx.lineTo(x + 4, y + 5);
    ctx.lineTo(x + 2, y + 8);
    ctx.lineTo(x - 2, y + 8);
    ctx.lineTo(x - 4, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#d6c7a4";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f4e7cb";
    ctx.font = "bold 8px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(drop.kind === "health" ? "LIFE" : "MANA", x, y + 19);
    ctx.restore();
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

interface PotionDrop {
  x: number;
  y: number;
  kind: "health" | "mana";
  bob: number;
  life: number;
  pickupDelay: number;
  notifiedFull: boolean;
  collected: boolean;
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
  baseName?: string;
  rarity: "normal" | "magic" | "rare";
  slot: "weapon" | "armor" | "charm";
  desc: string;
  stats?: D2ItemStats;
  affixes?: string[];
}

type InventoryCellItem = D2InventoryItem | null;

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
  item: D2InventoryItem;
}
