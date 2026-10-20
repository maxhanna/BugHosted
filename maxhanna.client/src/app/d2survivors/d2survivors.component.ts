import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  HostListener,
  ViewChild,
  ElementRef,
  Input,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Subscription } from "rxjs";
import { D2LeaderboardEntry, D2LobbyMessage, D2RecordCharacterRequest, D2SurvivorsService } from "../../services/d2survivors.service";
import { User } from "../../services/datacontracts/user/user";
import { AppComponent } from "../app.component";
import { ChildComponent } from "../child.component";

const MODEL_BASE = "assets/d2-models";
const RUN_SAVE_KEY = "d2survivors.run.v1";
const RUN_SAVE_VERSION = 1;
const RUN_SAVE_INTERVAL_MS = 2500;

function createRunId(): string {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Run IDs are identifiers, not credentials; keep older/insecure browser contexts usable.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (marker) => {
    const value = Math.floor(Math.random() * 16);
    return (marker === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

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
  imports: [CommonModule, FormsModule],
  templateUrl: "./d2survivors.component.html",
  styleUrls: ["./d2survivors.component.css"],
})
export class D2SurvivorsComponent extends ChildComponent implements OnInit, AfterViewInit, OnDestroy {
  constructor() { super(); }
  escapeMenuOpen = false;
  inventoryOpen = false;
  private readonly d2SurvivorsService = inject(D2SurvivorsService);
  @Input() inputtedParentRef?: AppComponent;
  override parentRef?: AppComponent;
  @ViewChild("lobbyChatLog") private lobbyChatLogRef?: ElementRef<HTMLDivElement>;
  @ViewChild("arena") arenaRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("characterCanvas") characterCanvasRef?: ElementRef<HTMLCanvasElement>;

  private characterRenderer?: THREE.WebGLRenderer;
  private characterScene?: THREE.Scene;
  private characterCamera?: THREE.OrthographicCamera;
  private characterModel?: THREE.Group;
  private playerRigBones: PlayerRigBones = {};
  private playerAnimationTime = 0;
  private playerAnimationDelta = 16;
  private playerMotionBlend = 0;
  private playerMoveX = 0;
  private playerMoveY = 0;
  private playerFacingX = 1;
  private playerFacingY = 0;
  private isPlayerMoving = false;
  private loadedModelClass = "";
  private readonly enemySprites: Partial<Record<EnemySpecies, EnemySprite>> = {};
  modelLoadError = false;
  @ViewChild("classPreviewCanvas") private classPreviewCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("menuHeroCanvas") private menuHeroCanvasRef?: ElementRef<HTMLCanvasElement>;
  private menuHeroRenderer?: THREE.WebGLRenderer;
  private menuHeroScene?: THREE.Scene;
  private menuHeroCamera?: THREE.PerspectiveCamera;
  menuHeroModel?: THREE.Group;
  menuHeroLoadError = false;
  private menuHeroFrameId = 0;
  private menuHeroModelRequest = 0;
  private menuHeroLastFrameAt = 0;
  private menuHeroElapsed = 0;
  private menuHeroPoseBones: Array<{ bone: THREE.Bone; baseQuaternion: THREE.Quaternion; phase: number; side: -1 | 1 }> = [];
  menuHeroZoom = 1.55;
  private menuHeroRotation = 0;
  private menuHeroDragPointer?: number;
  private menuHeroLastPointerX = 0;
  menuHeroDragging = false;
  private previewRenderer?: THREE.WebGLRenderer;
  private previewScene?: THREE.Scene;
  private previewCamera?: THREE.PerspectiveCamera;
  previewModel?: THREE.Group;
  previewLoadError = false;
  private previewFrameId = 0;
  private previewModelRequest = 0;
  private previewLastFrameAt = 0;
  private previewElapsed = 0;
  private previewPoseBones: PreviewPoseBone[] = [];
  private previewZoom = 1;
  private previewRotation = 0.18;
  private previewDragPointer?: number;
  private previewLastPointerX = 0;
  previewDragging = false;
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
  menuPanel: "main" | "lobby" | "characters" | "credits" = "main";
  lobbyLeaderboard: D2LeaderboardEntry[] = [];
  lobbyMessages: D2LobbyMessage[] = [];
  lobbyMessageDraft = "";
  lobbyLoading = false;
  lobbyError = "";
  lobbyChatError = "";
  lobbySending = false;
  private lobbyLoaded = false;
  private lobbyMessageSubscription?: Subscription;
  private leaderboardSubscription?: Subscription;
  private leaderboardRefreshTimer?: number;
  private lobbyRefreshTimer?: number;
  private lobbySession?: { userId: number; token: string; username: string };
  private lobbyRunId = "";
  private lastRecordedRunId = "";
  private recordRetryTimer?: number;
  private runKillCount = 0;
  private lastLeaderboardRefreshAt = 0;
  private attackCooldown = 0;
  private attackSequence = 0;
  xpToNextLevel = 5;
  runActive = false;
  playerLevel = 1;
  playerXp = 0;
  pendingLevelUps = 0;
  basicAttackName = "Basic Attack";
  basicAttackCooldown = 0.55;
  basicAttackDamage = 12;
  attackProjectiles: AttackProjectile[] = [];
  upgradeChoices: SkillUpgrade[] = [];
  levelUpNotice = "";
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
  hasSavedRun = false;
  saveStatus = "";
  private lastRunSaveAt = 0;
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

  get savedRunSummary(): string {
    const savedClass = this.savedRunClass;
    const className = this.classes.find((characterClass) => characterClass.id === savedClass)?.name ?? this.selectedClassName;
    return `${className} · ${Math.floor(this.runTime)} seconds survived`;
  }

  get isLobbySignedIn(): boolean {
    return !!(this.inputtedParentRef?.user ?? this.parentRef?.user);
  }

  private get savedRunClass(): string {
    return this.savedRun?.selectedClass ?? this.selectedClass;
  }

  private get savedRun(): D2SavedRun | null {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(RUN_SAVE_KEY);
      if (!raw) {
        return null;
      }
      const save = JSON.parse(raw) as Partial<D2SurvivorsSave>;
      return save.version === RUN_SAVE_VERSION && save.run && typeof save.run === "object" && !Array.isArray(save.run)
        ? save.run as D2SavedRun
        : null;
    } catch {
      return null;
    }
  }

  private readSavedProgress(): void {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(RUN_SAVE_KEY);
      if (!raw) {
        return;
      }
      const save = JSON.parse(raw) as Partial<D2SurvivorsSave>;
      if (save.version !== RUN_SAVE_VERSION) {
        return;
      }
      if (typeof save.selectedClass === "string" && CLASS_MODEL[save.selectedClass]) {
        this.selectedClass = save.selectedClass;
      }
      if (!save.run || typeof save.run !== "object" || Array.isArray(save.run)) {
        return;
      }
      this.restoreRunState(save.run as Partial<D2SavedRun>);
    } catch (error) {
      console.warn("Could not restore saved D2 Survivors progress", error);
    }
  }

  private restoreRunState(saved: Partial<D2SavedRun>): void {
    const numberValue = (value: unknown, fallback: number, min: number, max: number): number =>
      typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    const savedClass = typeof saved.selectedClass === "string" && CLASS_MODEL[saved.selectedClass]
      ? saved.selectedClass
      : this.selectedClass;
    const startingStats = this.classStartingStats[savedClass] ?? this.classStartingStats["amazon"];
    this.lobbyRunId = typeof saved.runId === "string" && saved.runId ? saved.runId : createRunId();
    this.runKillCount = typeof saved.runKillCount === "number" && Number.isFinite(saved.runKillCount) ? Math.max(0, Math.floor(saved.runKillCount)) : 0;
    const basicAttack = this.basicAttackForClass(savedClass);
    this.playerLevel = Math.floor(numberValue(saved.playerLevel, 1, 1, 10000));
    this.playerXp = Math.floor(numberValue(saved.playerXp, 0, 0, 1_000_000_000));
    this.pendingLevelUps = Math.floor(numberValue(saved.pendingLevelUps, 0, 0, 10000));
    this.xpToNextLevel = Math.floor(numberValue(saved.xpToNextLevel, this.xpForLevel(this.playerLevel), 1, 1_000_000));
    this.basicAttackName = typeof saved.basicAttackName === "string" && BASIC_ATTACK_NAMES.includes(saved.basicAttackName) ? saved.basicAttackName : basicAttack.name;
    this.basicAttackCooldown = numberValue(saved.basicAttackCooldown, basicAttack.cooldown, 0.18, 5);
    this.basicAttackDamage = numberValue(saved.basicAttackDamage, basicAttack.damage, 1, 100000);
    this.attackCooldown = 0;
    this.attackProjectiles = [];
    this.arenaW = numberValue(saved.arenaW, 500, 100, 5000);
    this.arenaH = numberValue(saved.arenaH, 500, 100, 5000);
    this.playerX = numberValue(saved.playerX, this.arenaW / 2, 32, this.arenaW - 32);
    this.playerY = numberValue(saved.playerY, this.arenaH / 2, 32, this.arenaH - 32);
    this.playerMaxHp = numberValue(saved.playerMaxHp, startingStats.life, 1, 10000);
    this.playerMaxMana = numberValue(saved.playerMaxMana, startingStats.mana, 1, 10000);
    this.playerHp = numberValue(saved.playerHp, this.playerMaxHp, 0, this.playerMaxHp);
    this.playerMana = numberValue(saved.playerMana, this.playerMaxMana, 0, this.playerMaxMana);
    this.playerGold = Math.floor(numberValue(saved.playerGold, 0, 0, 1_000_000_000));
    this.runTime = numberValue(saved.runTime, 0, 0, 1_000_000_000);
    this.spawnAcc = numberValue(saved.spawnAcc, 0, 0, 1);
    this.chestTimer = numberValue(saved.chestTimer, 0, -3600, 3600);
    this.nextChestInterval = numberValue(saved.nextChestInterval, 8, 1, 3600);
    this.enemies = Array.isArray(saved.enemies)
      ? saved.enemies.slice(0, 220).filter(isRecord).map((enemy) => {
          const kind: EnemyKind = enemy["kind"] === "boss" || enemy["kind"] === "champion" ? enemy["kind"] : "normal";
          return {
          kind,
          species: sanitizeEnemySpecies(enemy["species"], kind),
          spriteFrame: numberValue(enemy["spriteFrame"], 0, 0, 47),
          x: numberValue(enemy["x"], 250, 0, this.arenaW),
          y: numberValue(enemy["y"], 250, 0, this.arenaH),
          hp: numberValue(enemy["hp"], 1, 0, 1_000_000),
          maxHp: numberValue(enemy["maxHp"], 1, 1, 1_000_000),
          speed: numberValue(enemy["speed"], 80, 0, 10_000),
          r: numberValue(enemy["r"], 14, 1, 100),
          dmg: numberValue(enemy["dmg"], 1, 0, 1_000_000),
          ...(typeof enemy["cd"] === "number" ? { cd: numberValue(enemy["cd"], 0, 0, 3600) } : {}),
        };
        })
      : [];
    this.chests = Array.isArray(saved.chests)
      ? saved.chests.slice(0, 300).filter(isRecord).map((chest) => ({
          x: numberValue(chest["x"], 250, 0, this.arenaW),
          y: numberValue(chest["y"], 250, 0, this.arenaH),
          bob: numberValue(chest["bob"], 0, 0, 1_000_000),
          open: chest["open"] === true,
          life: numberValue(chest["life"], 30, 0, 3600),
        }))
      : [];
    this.potionDrops = Array.isArray(saved.potionDrops)
      ? saved.potionDrops.slice(0, 300).filter(isRecord).map((drop) => ({
          x: numberValue(drop["x"], 250, 0, this.arenaW),
          y: numberValue(drop["y"], 250, 0, this.arenaH),
          kind: drop["kind"] === "mana" ? "mana" : "health",
          bob: numberValue(drop["bob"], 0, 0, 1_000_000),
          life: numberValue(drop["life"], 25, 0, 3600),
          pickupDelay: numberValue(drop["pickupDelay"], 0, 0, 3600),
          notifiedFull: drop["notifiedFull"] === true,
          collected: drop["collected"] === true,
        }))
      : [];
    this.equipment = createEmptyEquipment();
    if (saved.equipment && typeof saved.equipment === "object") {
      for (const slot of PAPERDOLL_SLOTS) {
        const item = sanitizeInventoryItem(saved.equipment[slot]);
        if (item && isCompatibleWithEquipment(item, slot)) this.equipment[slot] = item;
      }
    }
    const equippedBelt = sanitizeInventoryItem(saved.equippedBelt);
    if (!saved.equipment && equippedBelt?.slot === "belt" && equippedBelt.beltQuality) {
      this.equipment.belt = equippedBelt;
    }
    this.beltSlots = Array.isArray(saved.beltSlots)
      ? Array.from({ length: 16 }, (_, index) => {
          const kind = saved.beltSlots?.[index]?.kind;
          return { kind: kind === "health" || kind === "mana" ? kind : null };
        })
      : this.beltSlots;
    this.normalizeBeltSlots();
    this.ownedSkills = Array.isArray(saved.ownedSkills)
      ? saved.ownedSkills.filter((name): name is string => typeof name === "string" && this.isKnownSkill(name)).slice(0, 100)
      : [this.basicAttackName];

    this.skillLevels = {};
    if (isRecord(saved.skillLevels)) {
      for (const [name, level] of Object.entries(saved.skillLevels)) {
        if ((this.ownedSkills.includes(name) || this.isKnownSkill(name)) && typeof level === "number" && Number.isFinite(level)) {
          this.skillLevels[name] = Math.floor(Math.max(1, Math.min(100, level)));
        }
      }
    }
    if (!this.ownedSkills.includes(this.basicAttackName)) this.ownedSkills.unshift(this.basicAttackName);
    this.skillLevels[this.basicAttackName] = Math.max(1, this.skillLevels[this.basicAttackName] ?? 1);
    this.upgradeChoices = [];
    if (this.pendingLevelUps > 0) this.prepareUpgradeChoices();
    const restoredInventory = Array.isArray(saved.inventory)
      ? saved.inventory.slice(0, this.inventoryColumns * this.inventoryRows).map((item) => sanitizeInventoryItem(item))
      : [];
    this.inventory = Array.from({ length: this.inventoryColumns * this.inventoryRows }, () => null);
    for (let oldIndex = 0; oldIndex < restoredInventory.length; oldIndex += 1) {
      const item = restoredInventory[oldIndex];
      if (!item) continue;
      const index = this.canPlaceItemAt(item, oldIndex) ? oldIndex : this.findInventoryPlacement(item);
      if (index >= 0) this.inventory[index] = item;
    }
    this.rebuildInventoryGrid();
    this.openChestCount = this.chests.filter((chest) => !chest.open).length;
    this.hasSavedRun = true;
    this.runActive = false;
  }

  private persistRunProgress(force = false): void {
    if (typeof window === "undefined") {
      return;
    }
    const now = performance.now();
    if (!force && now - this.lastRunSaveAt < RUN_SAVE_INTERVAL_MS) {
      return;
    }
    try {
      const run: D2SavedRun | null = this.hasSavedRun ? {
        hasSavedRun: true,
        runId: this.lobbyRunId || createRunId(),
        selectedClass: this.runActive || this.activeTab === "run" ? this.selectedClass : this.savedRunClass,
        arenaW: this.arenaW,
        arenaH: this.arenaH,
        playerX: this.playerX,
        playerY: this.playerY,
        playerHp: this.playerHp,
        playerMaxHp: this.playerMaxHp,
        playerMana: this.playerMana,
        playerMaxMana: this.playerMaxMana,
        playerGold: this.playerGold,
        runTime: this.runTime,
        runKillCount: this.runKillCount,
        playerLevel: this.playerLevel,
        playerXp: this.playerXp,
        pendingLevelUps: this.pendingLevelUps,
        xpToNextLevel: this.xpToNextLevel,
        basicAttackName: this.basicAttackName,
        basicAttackCooldown: this.basicAttackCooldown,
        basicAttackDamage: this.basicAttackDamage,
        ownedSkills: this.ownedSkills,
        skillLevels: this.skillLevels,
        enemies: this.enemies,
        chests: this.chests,
        potionDrops: this.potionDrops,
        beltSlots: this.beltSlots,
        equippedBelt: this.equippedBelt,
        equipment: this.equipment,
        inventory: this.inventory,
        spawnAcc: this.spawnAcc,
        chestTimer: this.chestTimer,
        nextChestInterval: this.nextChestInterval,
      } : null;
      const serialized = JSON.stringify({
        version: RUN_SAVE_VERSION,
        selectedClass: this.selectedClass,
        run,
      } satisfies D2SurvivorsSave);
      window.localStorage.setItem(RUN_SAVE_KEY, serialized);
      this.hasSavedRun = run !== null;
      this.lastRunSaveAt = now;
    } catch (error) {
      console.warn("Could not save D2 Survivors progress", error);
      this.saveStatus = "Unable to save progress in this browser.";
    }
  }

  saveRunNow(): void {
    this.persistRunProgress(true);
    this.escapeMenuOpen = false;
    this.inventoryOpen = false;
    this.runActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.saveStatus = "Journey saved. You can resume from the title screen.";
    this.activeTab = "menu";
    this.menuPanel = "main";
  }

  returnToMenu(): void {
    this.persistRunProgress(true);
    this.activeTab = "menu";
    this.menuPanel = "main";
    this.runActive = false;
    this.startMenuHeroPreview();
  }

  openLore(): void {
    this.stopAmbientAudio();
    this.ambientAudioStatus = "Ambience muted";
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
        oscillator.onended = () => {
          oscillator.disconnect();
          voiceGain.disconnect();
        };
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
    const stopAt = this.audioContext ? this.audioContext.currentTime + 0.22 : undefined;
    for (const oscillator of this.ambientAudioNodes) {
      try {
        oscillator.stop(stopAt);
      } catch {
        // Oscillators can already be stopping after a rapid toggle.
      }
    }
    this.ambientAudioNodes = [];
    this.ambientMasterGain = undefined;
  }

  resumeRun(): void {
    if (!this.hasSavedRun || this.runActive) {
      return;
    }
    const savedRun = this.savedRun;
    if (!savedRun) {
      this.hasSavedRun = false;
      return;
    }
    this.restoreRunState(savedRun);
    if (CLASS_MODEL[savedRun.selectedClass]) {
      this.selectedClass = savedRun.selectedClass;
    }
    this.activeTab = "run";
    this.menuPanel = "main";
    this.initializeCharacterRenderer();
    if (this.characterRenderer && this.characterScene && this.loadedModelClass !== this.selectedClass) {
      this.loadCharacterModel();
    }
    this.selectedClass = savedRun.selectedClass;
    this.selectedClass = savedRun.selectedClass;
    this.persistRunProgress(true);
    this.lastTime = performance.now();
    this.runActive = true;
    this.loop(this.lastTime);
  }

  async openLobby(): Promise<void> {
    this.stopMenuHeroPreview();
    this.stopAmbientAudio();
    this.ambientAudioStatus = "Ambience muted";
    this.menuPanel = "lobby";
    await this.loadLobby();
    if (this.lobbyRunId && !this.runActive && this.playerHp <= 0) void this.recordCompletedCharacter(false);
  }

  returnToMainMenu(): void {
    this.menuPanel = "main";
    this.startMenuHeroPreview();
  }

  returnToLobby(): void {
    this.closeCharacterSelect();
  }

  private async getLobbySession(): Promise<{ userId: number; token: string; username: string } | null> {
    const app = this.inputtedParentRef ?? this.parentRef;
    const user = app?.user as User | undefined;
    const userId = Number(user?.id ?? 0);
    if (!userId || !app) return null;
    const token = await app.getSessionToken();
    return token ? { userId, token, username: user?.username?.trim() || "Hero" } : null;
  }

  private async loadLobby(): Promise<void> {
    this.lobbyLoading = true;
    this.lobbyError = "";
    const [leaderboard, history, connected] = await Promise.all([
      this.d2SurvivorsService.getLeaderboard(12),
      this.d2SurvivorsService.getLobbyHistory(60),
      this.d2SurvivorsService.connectLobby(),
    ]);
    if (leaderboard.ok && leaderboard.data) this.lobbyLeaderboard = leaderboard.data;
    else this.lobbyError = "Rankings are temporarily unavailable. Retrying…";
    if (history.ok && history.data) this.lobbyMessages = history.data;
    else this.lobbyChatError = "Chat history is temporarily unavailable.";
    if (!connected && !this.lobbyError) this.lobbyError = "Live lobby connection is unavailable; reconnecting…";
    this.lobbyLoaded = true;
    this.lobbyLoading = false;
    this.lobbySession = await this.getLobbySession() ?? undefined;
    if (this.menuPanel === "lobby") this.scrollLobbyChatToBottom();
  }

  private async refreshLeaderboard(): Promise<void> {
    const now = Date.now();
    if (now - this.lastLeaderboardRefreshAt < 1000) return;
    this.lastLeaderboardRefreshAt = now;
    const result = await this.d2SurvivorsService.getLeaderboard(12);
    if (result.ok && result.data) {
      this.lobbyLeaderboard = result.data;
      this.lobbyError = "";
    }
  }

  private async refreshLobbyHistory(): Promise<void> {
    if (!this.lobbyLoaded) return;
    const result = await this.d2SurvivorsService.getLobbyHistory(60);
    if (result.ok && result.data) {
      this.lobbyMessages = result.data;
      if (this.menuPanel === "lobby") this.scrollLobbyChatToBottom();
    }
  }

  private addLobbyMessage(message: D2LobbyMessage): void {
    if (this.lobbyMessages.some((existing) => existing.id === message.id)) return;
    this.lobbyMessages = [...this.lobbyMessages, message].slice(-60);
    if (this.menuPanel === "lobby") this.scrollLobbyChatToBottom();
  }

  private scrollLobbyChatToBottom(): void {
    requestAnimationFrame(() => {
      const log = this.lobbyChatLogRef?.nativeElement;
      if (log) log.scrollTop = log.scrollHeight;
    });
  }

  async sendLobbyMessage(): Promise<void> {
    const message = this.lobbyMessageDraft.trim();
    if (!message || this.lobbySending) return;
    const session = await this.getLobbySession();
    if (!session) {
      this.lobbyChatError = "Sign in to speak in the Sanctuary lobby.";
      return;
    }
    this.lobbySending = true;
    this.lobbyChatError = "";
    const result = await this.d2SurvivorsService.sendLobbyMessage(session.userId, message, session.token);
    if (result.ok && result.data) {
      this.lobbyMessageDraft = "";
      this.addLobbyMessage(result.data);
    } else {
      this.lobbyChatError = "Message could not be sent. Please try again.";
    }
    this.lobbySending = false;
  }

  getCharacterName(): string {
    const accountName = this.lobbySession?.username ?? "Wanderer";
    return `${accountName} ${this.selectedClassName}`.slice(0, 48);
  }

  private async recordCompletedCharacter(victory: boolean, retry = false): Promise<void> {
    const runId = this.lobbyRunId;
    if (!runId || (!retry && this.lastRecordedRunId === runId)) return;
    this.lastRecordedRunId = runId;
    const session = await this.getLobbySession();
    if (!session) {
      this.lastRecordedRunId = "";
      this.saveStatus = "Sign in and return to the lobby to archive this completed hero.";
      if (this.recordRetryTimer !== undefined) window.clearTimeout(this.recordRetryTimer);
      this.recordRetryTimer = window.setTimeout(() => {
        this.recordRetryTimer = undefined;
        if (this.lobbyRunId === runId && !this.runActive) void this.recordCompletedCharacter(victory, true);
      }, 15000);
      return;
    }
    const request: D2RecordCharacterRequest = {
      runId,
      userId: session.userId,
      characterName: this.getCharacterName(),
      classId: this.selectedClass,
      timeSeconds: Math.floor(this.runTime),
      kills: this.runKillCount,
      level: 1 + Object.values(this.skillLevels).reduce((sum, level) => sum + Math.max(0, level - 1), 0),
      victory,
    };
    const result = await this.d2SurvivorsService.recordCharacter(request, session.token);
    if (result.ok) {
      this.hasSavedRun = false;
      this.lobbyRunId = "";
      this.persistRunProgress(true);
      this.activeTab = "menu";
      this.menuPanel = "lobby";
      await this.refreshLeaderboard();
    } else {
      if (this.recordRetryTimer !== undefined) window.clearTimeout(this.recordRetryTimer);
      this.recordRetryTimer = window.setTimeout(() => {
        this.recordRetryTimer = undefined;
        if (this.lobbyRunId === runId) void this.recordCompletedCharacter(victory, true);
      }, 5000);
      this.saveStatus = "Character record could not reach the server. Retrying…";
    }
  }

  openCharacterSelect(): void {
    if (this.hasSavedRun && this.playerHp > 0) {
      this.stopMenuHeroPreview();
      this.resumeRun();
      return;
    }
    this.stopAmbientAudio();
    this.ambientAudioStatus = "Ambience muted";
    this.menuPanel = "characters";
    this.stopMenuHeroPreview();
    this.startClassPreview();
  }

  closeCharacterSelect(): void {
    this.menuPanel = "lobby";
    this.stopClassPreview();
    this.stopMenuHeroPreview();
  }

  selectClass(classId: string): void {
    if (!CLASS_MODEL[classId]) {
      return;
    }
    this.selectedClass = classId;
    if (this.menuPanel === "characters") {
      this.loadPreviewModel();
    }
    if (this.activeTab === "menu" && this.menuPanel !== "characters") {
      this.loadMenuHeroModel();
    }
  }

  private startMenuHeroPreview(): void {
    if (this.activeTab !== "menu" || this.menuPanel === "characters") return;
    if (!this.menuHeroCanvasRef) {
      requestAnimationFrame(() => this.startMenuHeroPreview());
      return;
    }
    if (this.menuHeroRenderer?.domElement === this.menuHeroCanvasRef.nativeElement) {
      this.resizeMenuHeroPreview();
      return;
    }
    this.stopMenuHeroPreview();
    try {
      const canvas = this.menuHeroCanvasRef.nativeElement;
      this.menuHeroRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      this.menuHeroRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.menuHeroRenderer.setClearColor(0x000000, 0);
      this.menuHeroRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.menuHeroScene = new THREE.Scene();
      this.menuHeroCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
      this.menuHeroCamera.position.set(0, 68, 430);
      this.menuHeroCamera.lookAt(0, 44, 0);
      this.updateMenuHeroZoom();
      this.menuHeroScene.add(new THREE.HemisphereLight(0xe7eaff, 0x2e1b16, 0.75));
      const keyLight = new THREE.DirectionalLight(0xffe1b5, 1.25);
      keyLight.position.set(-140, 240, 180);
      this.menuHeroScene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9bcaff, 0.45);
      fillLight.position.set(150, 130, -140);
      this.menuHeroScene.add(fillLight);
      this.resizeMenuHeroPreview();
      this.loadMenuHeroModel();
      this.menuHeroLastFrameAt = performance.now();
      this.animateMenuHeroPreview(this.menuHeroLastFrameAt);
    } catch (error) {
      console.error("Could not initialize the main-menu hero preview", error);
      this.menuHeroLoadError = true;
    }
  }

  private stopMenuHeroPreview(): void {
    if (this.menuHeroFrameId) {
      cancelAnimationFrame(this.menuHeroFrameId);
      this.menuHeroFrameId = 0;
    }
    this.menuHeroModelRequest++;
    this.menuHeroPoseBones = [];
    this.menuHeroElapsed = 0;
    this.disposeMenuHeroModel();
    this.menuHeroLoadError = false;
    this.menuHeroRenderer?.dispose();
    this.menuHeroRenderer = undefined;
    this.menuHeroScene = undefined;
    this.menuHeroCamera = undefined;
  }

  private disposeMenuHeroModel(): void {
    if (!this.menuHeroModel) return;
    this.menuHeroScene?.remove(this.menuHeroModel);
    this.menuHeroModel.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      });
    });
    this.menuHeroModel = undefined;
  }

  zoomMenuHero(direction: -1 | 1): void {
    this.menuHeroZoom = THREE.MathUtils.clamp(this.menuHeroZoom + direction * 0.15, 0.7, 1.9);
    this.updateMenuHeroZoom();
  }

  onMenuHeroWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY !== 0) this.zoomMenuHero(event.deltaY < 0 ? 1 : -1);
  }

  onMenuHeroPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.menuHeroDragPointer = event.pointerId;
    this.menuHeroLastPointerX = event.clientX;
    this.menuHeroDragging = true;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  }

  onMenuHeroPointerMove(event: PointerEvent): void {
    if (!this.menuHeroDragging || this.menuHeroDragPointer !== event.pointerId) return;
    this.menuHeroRotation += (event.clientX - this.menuHeroLastPointerX) * 0.012;
    this.menuHeroLastPointerX = event.clientX;
    if (this.menuHeroModel) this.menuHeroModel.rotation.y = this.menuHeroRotation;
  }

  onMenuHeroPointerUp(event: PointerEvent): void {
    if (this.menuHeroDragPointer !== event.pointerId) return;
    this.menuHeroDragPointer = undefined;
    this.menuHeroDragging = false;
  }

  private updateMenuHeroZoom(): void {
    if (!this.menuHeroCamera) return;
    this.menuHeroCamera.fov = 30 / this.menuHeroZoom;
    this.menuHeroCamera.updateProjectionMatrix();
  }

  @HostListener("window:resize")
  private resizeMenuHeroPreview(): void {
    const canvas = this.menuHeroCanvasRef?.nativeElement;
    if (!canvas || !this.menuHeroRenderer || !this.menuHeroCamera) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.menuHeroRenderer.setSize(rect.width, rect.height, false);
    this.menuHeroCamera.aspect = rect.width / rect.height;
    this.menuHeroCamera.updateProjectionMatrix();
  }

  private loadMenuHeroModel(): void {
    if (!this.menuHeroScene || !this.menuHeroCamera || !this.menuHeroRenderer) return;
    const definition = CLASS_MODEL[this.selectedClass];
    if (!definition) return;
    const requestId = ++this.menuHeroModelRequest;
    const modelClass = this.selectedClass;
    this.menuHeroLoadError = false;
    this.disposeMenuHeroModel();
    new GLTFLoader().load(definition.model, async (gltf) => {
      const model = gltf.scene;
      const isStale = (): boolean => !this.menuHeroScene || requestId !== this.menuHeroModelRequest
        || modelClass !== this.selectedClass || this.activeTab !== "menu" || this.menuPanel === "characters";
      const disposeModel = (): void => model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
          material.dispose();
        });
      });
      if (isStale()) { disposeModel(); return; }
      try {
        await this.applyClassTextures(model, modelClass);
        if (isStale()) { disposeModel(); return; }
        this.normalizeCharacterModel(model, 88);
        model.rotation.y = this.menuHeroRotation;
        this.menuHeroPoseBones = this.getPreviewPoseBones(model);
        this.menuHeroModel = model;
        this.menuHeroScene?.add(model);
      } catch (error: unknown) {
        disposeModel();
        if (requestId !== this.menuHeroModelRequest) return;
        console.error(`Could not apply ${modelClass} main-menu hero textures`, error);
        this.menuHeroLoadError = true;
      }
    }, undefined, (error: unknown) => {
      if (requestId !== this.menuHeroModelRequest) return;
      console.error(`Could not load the ${modelClass} main-menu hero model`, error);
      this.menuHeroLoadError = true;
    });
  }

  private animateMenuHeroPreview(now: number): void {
    if (!this.menuHeroRenderer || !this.menuHeroScene || !this.menuHeroCamera) return;
    const dt = Math.min(50, now - this.menuHeroLastFrameAt) / 1000;
    this.menuHeroLastFrameAt = now;
    if (this.menuHeroModel) {
      if (!this.reducedMotion) this.menuHeroElapsed += dt;
      const time = this.menuHeroElapsed;
      this.menuHeroModel.rotation.y = this.menuHeroRotation + (this.reducedMotion ? 0 : Math.sin(time * 0.45) * 0.035);
      this.menuHeroModel.position.y = this.reducedMotion ? 0 : Math.sin(time * 1.6) * 0.8;
      const fadeIn = this.reducedMotion ? 1 : Math.min(1, time / 0.8);
      for (const pose of this.menuHeroPoseBones) {
        const sway = this.reducedMotion ? 0 : Math.sin(time * 1.7 + pose.phase) * 0.018;
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.side * (0.16 + sway) * fadeIn);
        pose.bone.quaternion.copy(pose.baseQuaternion).multiply(rotation);
      }
    }
    this.resizeMenuHeroPreview();
    this.menuHeroRenderer.render(this.menuHeroScene, this.menuHeroCamera);
    this.menuHeroFrameId = requestAnimationFrame((time) => this.animateMenuHeroPreview(time));
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
      this.previewCamera.position.set(0, 92, 430);
      this.previewCamera.lookAt(0, 68, 0);
      this.updateClassPreviewZoom();
      this.previewScene.add(new THREE.HemisphereLight(0xe7eaff, 0x2e1b16, 0.75));
      const keyLight = new THREE.DirectionalLight(0xffe1b5, 1.25);
      keyLight.position.set(-140, 240, 180);
      this.previewScene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9bcaff, 0.45);
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
    this.previewPoseBones = [];
    this.previewElapsed = 0;
    this.previewDragPointer = undefined;
    this.previewDragging = false;
    this.disposePreviewModel();
    this.previewLoadError = false;
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

  zoomClassPreview(direction: -1 | 1): void {
    this.previewZoom = THREE.MathUtils.clamp(this.previewZoom + direction * 0.15, 0.7, 1.9);
    this.updateClassPreviewZoom();
  }

  onClassPreviewWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY !== 0) this.zoomClassPreview(event.deltaY < 0 ? 1 : -1);
  }

  onClassPreviewPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.previewDragPointer = event.pointerId;
    this.previewLastPointerX = event.clientX;
    this.previewDragging = true;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  }

  onClassPreviewPointerMove(event: PointerEvent): void {
    if (!this.previewDragging || this.previewDragPointer !== event.pointerId) return;
    this.previewRotation += (event.clientX - this.previewLastPointerX) * 0.012;
    this.previewLastPointerX = event.clientX;
    if (this.previewModel) this.previewModel.rotation.y = this.previewRotation;
  }

  onClassPreviewPointerUp(event: PointerEvent): void {
    if (this.previewDragPointer !== event.pointerId) return;
    this.previewDragPointer = undefined;
    this.previewDragging = false;
  }

  private updateClassPreviewZoom(): void {
    if (!this.previewCamera) return;
    this.previewCamera.fov = 30 / this.previewZoom;
    this.previewCamera.updateProjectionMatrix();
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
    new GLTFLoader().load(definition.model, async (gltf) => {
      const model = gltf.scene;
      const isStale = (): boolean => !this.previewScene || requestId !== this.previewModelRequest || modelClass !== this.selectedClass || this.menuPanel !== "characters";
      const disposeModel = (): void => model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
          material.dispose();
        });
      });
      if (isStale()) {
        disposeModel();
        return;
      }
      try {
        await this.applyClassTextures(model, modelClass);
        if (isStale()) {
          disposeModel();
          return;
        }
        this.normalizeCharacterModel(model, 88);
        this.previewPoseBones = this.getPreviewPoseBones(model);
        this.previewModel = model;
        this.previewScene?.add(model);
        this.previewLoadError = false;
      } catch (error: unknown) {
        disposeModel();
        if (requestId !== this.previewModelRequest) return;
        console.error(`Could not apply ${modelClass} class textures`, error);
        this.previewLoadError = true;
      }
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
    if (this.previewModel) {
      this.previewElapsed += dt;
      const time = this.previewElapsed;
      const idleMotion = this.reducedMotion ? 0 : 1;
      this.previewModel.rotation.y = this.previewRotation + (this.previewDragging ? 0 : Math.sin(time * 0.35) * 0.025 * idleMotion);
      this.previewModel.position.y = Math.sin(time * 1.4) * 0.55 * idleMotion;
      // The supplied class rigs have no clips, so give the selection preview a grounded,
      // slightly asymmetrical idle instead of leaving the hero in its rigid bind pose.
      // Reduced-motion users keep the settled pose but skip its breathing and turntable sway.
      const fadeIn = this.reducedMotion ? 1 : Math.min(1, time / 0.45);
      for (const pose of this.previewPoseBones) {
        const sway = Math.sin(time * 1.35 + pose.phase) * 0.018 * fadeIn * idleMotion;
        let rotation: THREE.Quaternion;
        switch (pose.role) {
          case "arm":
            rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.34 + sway)
              .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.side * (0.12 + sway)));
            break;
          case "leg":
            rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.side * 0.035 + sway);
            break;
          case "knee":
            rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.045 + Math.max(0, sway));
            break;
          case "foot":
            rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sway * 0.7);
            break;
          case "pelvis":
            rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway * 0.5);
            break;
          case "spine":
            rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.035 + sway * 0.4);
            break;
        }
        const settled = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), rotation, fadeIn);
        pose.bone.quaternion.copy(pose.baseQuaternion).multiply(settled);
      }
    }
    this.resizeClassPreview();
    this.previewRenderer.render(this.previewScene, this.previewCamera);
    this.previewFrameId = requestAnimationFrame((time) => this.animateClassPreview(time));
  }

  private modelLoadRequest = 0;
  beltSlots: Array<{ kind: "health" | "mana" | null }> = [
    { kind: "health" }, { kind: "mana" }, { kind: "health" }, { kind: "mana" },
    ...Array.from({ length: 12 }, () => ({ kind: null })),
  ];
  get beltRows(): number {
    return this.equippedBelt?.beltQuality === "exceptional" ? 3
      : this.equippedBelt?.beltQuality === "elite" ? 4
        : this.equippedBelt?.slot === "belt" ? 2
          : 1;
  }
  get visibleBeltSlots(): Array<{ kind: "health" | "mana" | null }> {
    return this.beltSlots.slice(0, this.beltRows * 4);
  }
  private normalizeBeltSlots(): void {
    this.beltSlots = Array.from({ length: 16 }, (_, index) => this.beltSlots[index] ?? { kind: null });
    this.activeBottleSlot = Math.min(this.activeBottleSlot, this.beltRows * 4 - 1);
  }

  getBeltRows(item: D2InventoryItem | null | undefined): number {
    return item?.beltQuality === "exceptional" ? 3
      : item?.beltQuality === "elite" ? 4
        : item?.slot === "belt" ? 2
          : 1;
  }

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
  inventoryGrid: InventoryGridCell[] = [];
  inventoryColumns = 10;
  inventoryRows = 4;
  inventoryStatus = "";
  equipment: Record<PaperdollSlot, D2InventoryItem | null> = createEmptyEquipment();
  readonly paperdollLayout: Array<{ slot: PaperdollSlot; label: string; icon: string; position: string }> = [
    { slot: "helmet", label: "Helm", icon: "♙", position: "helmet" },
    { slot: "weapon", label: "Weapon", icon: "⚔", position: "weapon" },
    { slot: "amulet", label: "Amulet", icon: "◇", position: "amulet" },
    { slot: "shield", label: "Shield", icon: "◈", position: "shield" },
    { slot: "ringLeft", label: "Ring", icon: "○", position: "ring-left" },
    { slot: "body", label: "Armor", icon: "♜", position: "body" },
    { slot: "ringRight", label: "Ring", icon: "○", position: "ring-right" },
    { slot: "gloves", label: "Gloves", icon: "♧", position: "gloves" },
    { slot: "belt", label: "Belt", icon: "▤", position: "belt" },
    { slot: "boots", label: "Boots", icon: "♢", position: "boots" },
  ];

  get equippedBelt(): D2InventoryItem | null {
    return this.equipment.belt;
  }

  set equippedBelt(item: D2InventoryItem | null) {
    this.equipment.belt = item;
  }

  getEquipmentItem(slot: PaperdollSlot): D2InventoryItem | null {
    return this.equipment[slot];
  }

  getEquipmentType(item: D2InventoryItem): EquipmentType {
    return getEquipmentType(item);
  }

  equipmentItemIcon(item: D2InventoryItem): string {
    const icons: Record<EquipmentType, string> = { weapon: "⚔", helmet: "♙", body: "♜", shield: "◈", gloves: "♧", boots: "♢", belt: "▤", ring: "○", amulet: "◇", charm: "✦" };
    return icons[getEquipmentType(item)];
  }

  private rebuildInventoryGrid(): void {
    const slotCount = this.inventoryColumns * this.inventoryRows;
    this.inventory = Array.from({ length: slotCount }, (_, index) => this.inventory[index] ?? null);
    const cells: InventoryGridCell[] = [];
    for (let index = 0; index < slotCount; index += 1) {
      const item = this.inventory[index];
      if (item) {
        const { width, height } = this.itemSize(item);
        cells.push({ slotIndex: index, item, width, height });
      } else if (this.getItemAnchorAt(index) < 0) {
        cells.push({ slotIndex: index, width: 1, height: 1 });
      }
    }
    this.inventoryGrid = cells;
  }

  inventoryGridStyle(cell: InventoryGridCell): Record<string, string> {
    const column = cell.slotIndex % this.inventoryColumns + 1;
    const row = Math.floor(cell.slotIndex / this.inventoryColumns) + 1;
    return {
      gridColumn: `${column} / span ${cell.width}`,
      gridRow: `${row} / span ${cell.height}`,
    };
  }

  private itemSize(item: D2InventoryItem): { width: number; height: number } {
    if (item.width && item.height) return { width: item.width, height: item.height };
    switch (getEquipmentType(item)) {
      case "body": return { width: 2, height: 3 };
      case "helmet": case "shield": case "gloves": case "boots": return { width: 2, height: 2 };
      case "belt": return { width: 2, height: 1 };
      case "weapon": return /pike|polearm|staff|bow/i.test(item.baseName ?? item.name) ? { width: 2, height: 4 } : { width: 1, height: 3 };
      default: return { width: 1, height: 1 };
    }
  }

  private canPlaceItemAt(item: D2InventoryItem, index: number, ignoredAnchors: number[] = []): boolean {
    if (index < 0 || index >= this.inventoryColumns * this.inventoryRows) return false;
    const { width, height } = this.itemSize(item);
    const column = index % this.inventoryColumns;
    const row = Math.floor(index / this.inventoryColumns);
    if (column + width > this.inventoryColumns || row + height > this.inventoryRows) return false;
    const ignored = new Set(ignoredAnchors);
    for (let y = row; y < row + height; y += 1) {
      for (let x = column; x < column + width; x += 1) {
        for (let anchor = 0; anchor < this.inventory.length; anchor += 1) {
          const existing = this.inventory[anchor];
          if (!existing || ignored.has(anchor)) continue;
          const existingSize = this.itemSize(existing);
          const existingColumn = anchor % this.inventoryColumns;
          const existingRow = Math.floor(anchor / this.inventoryColumns);
          if (x >= existingColumn && x < existingColumn + existingSize.width && y >= existingRow && y < existingRow + existingSize.height) return false;
        }
      }
    }
    return true;
  }

  private findInventoryPlacement(item: D2InventoryItem, startAt = 0, ignoredAnchors: number[] = []): number {
    for (let index = startAt; index < this.inventoryColumns * this.inventoryRows; index += 1) {
      if (this.canPlaceItemAt(item, index, ignoredAnchors)) return index;
    }
    for (let index = 0; index < startAt; index += 1) {
      if (this.canPlaceItemAt(item, index, ignoredAnchors)) return index;
    }
    return -1;
  }

  private addInventoryItem(item: D2InventoryItem): boolean {
    const slotIndex = this.findInventoryPlacement(item);
    if (slotIndex < 0) {
      this.inventoryStatus = "Inventory full — make room for this item’s footprint.";
      return false;
    }
    this.inventory[slotIndex] = item;
    this.rebuildInventoryGrid();
    this.inventoryStatus = "";
    return true;
  }

  equipBeltFromInventory(slotIndex: number): void {
    const belt = this.inventory[slotIndex];
    if (!belt || belt.slot !== "belt" || !belt.beltQuality) {
      return;
    }
    if (this.beltSlots.slice(this.getBeltRows(belt) * 4).some((slot) => slot.kind !== null)) {
      this.inventoryStatus = "Drink or move potions from the extra rows before equipping this smaller belt.";
      return;
    }
    this.dragState = { source: "inventory", slotIndex, item: belt };
    this.onEquipmentDrop("belt", { preventDefault: () => undefined } as DragEvent);
    this.selectedItem = null;
    this.selectedSlotIndex = null;
  }

  unequipBelt(): void {
    if (!this.equippedBelt) {
      return;
    }
    if (this.beltSlots.slice(4).some((slot) => slot.kind !== null)) {
      this.inventoryStatus = "Drink or move potions from the extra rows before unequipping this belt.";
      return;
    }
    const slotIndex = this.findInventoryPlacement(this.equippedBelt);
    if (slotIndex < 0) {
      this.inventoryStatus = "Inventory full — make room before unequipping your belt.";
      return;
    }
    this.inventory[slotIndex] = this.equippedBelt;
    this.equippedBelt = null;
    this.normalizeBeltSlots();
    this.rebuildInventoryGrid();
    this.persistRunProgress(true);
    this.inventoryStatus = "Belt unequipped.";
  }

  private randomItem(): D2InventoryItem {
    const bases: Array<Pick<D2InventoryItem, "name" | "slot" | "stats" | "desc"> & { equipmentType?: EquipmentType; beltQuality?: BeltQuality }> = [
      { name: "Sash", slot: "belt", beltQuality: "normal", stats: { armor: 2 }, desc: "A simple sash that holds two rows of potions." },
      { name: "Demonhide Sash", slot: "belt", beltQuality: "exceptional", stats: { armor: 5 }, desc: "An exceptional belt with room for three rows of potions." },
      { name: "Sharkskin Belt", slot: "belt", beltQuality: "exceptional", stats: { armor: 5 }, desc: "An exceptional belt with room for three rows of potions." },
      { name: "Vampirefang Belt", slot: "belt", beltQuality: "elite", stats: { armor: 8 }, desc: "An elite belt with room for four rows of potions." },
      { name: "Short Sword", slot: "weapon", stats: { damageMin: 3, damageMax: 7 }, desc: "A balanced blade suited to quick strikes." },
      { name: "War Pike", slot: "weapon", stats: { damageMin: 5, damageMax: 12 }, desc: "A long, heavy spear with excellent reach." },
      { name: "Leather Cap", slot: "armor", equipmentType: "helmet", stats: { armor: 8, requiresStrength: 10 }, desc: "A simple cap reinforced with boiled leather." },
      { name: "Chain Hauberk", slot: "armor", equipmentType: "body", stats: { armor: 18, requiresStrength: 20 }, desc: "Interlocking rings offer dependable protection." },
      { name: "Buckler", slot: "armor", equipmentType: "shield", stats: { armor: 12, requiresStrength: 12 }, desc: "A small shield that turns aside incoming blows." },
      { name: "Leather Gloves", slot: "armor", equipmentType: "gloves", stats: { armor: 3 }, desc: "Worn leather gloves protect the hands." },
      { name: "Heavy Boots", slot: "armor", equipmentType: "boots", stats: { armor: 4 }, desc: "Sturdy boots made for a long journey." },
      { name: "Crimson Small Charm", slot: "charm", equipmentType: "charm", stats: { plusVitality: 4 }, desc: "A palm-sized charm warm to the touch." },
      { name: "Azure Small Charm", slot: "charm", equipmentType: "charm", stats: { plusStrength: 2 }, desc: "A blue charm etched with a protective rune." },
      { name: "Gold Amulet", slot: "charm", equipmentType: "amulet", stats: { plusVitality: 3 }, desc: "An old amulet bearing a faint golden glow." },
      { name: "Ring of the Artisan", slot: "charm", equipmentType: "ring", stats: { plusDamage: 2 }, desc: "A finely worked ring made for a master craftsperson." },
      { name: "Soulstone Shard", slot: "charm", equipmentType: "charm", stats: { plusStrength: 1, plusVitality: 2 }, desc: "A dangerous fragment that hums with trapped power." },
      { name: "Quill of the Fates", slot: "charm", equipmentType: "charm", stats: { plusDamage: 1, plusVitality: 2 }, desc: "An ink-dark quill said to record every bargain." },
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
      id: createRunId(),
      name: displayName,
      baseName: base.name,
      rarity,
      slot: base.slot,
      ...(base.equipmentType ? { equipmentType: base.equipmentType } : {}),
      ...(base.beltQuality ? { beltQuality: base.beltQuality } : {}),
      desc: base.desc,
      stats,
      affixes,
    };
  }

  onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (this.escapeMenuOpen || this.inventoryOpen || this.pendingLevelUps > 0) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      this.keysDown.add(key);
      return;
    }
    if (key === " " || key === "j" || key === "f") {
      event.preventDefault();
      this.attackNearestEnemy();
      return;
    }
    if (key === "p") this.drinkBeltPotion(this.activeBottleSlot);
  }

  drinkBeltPotion(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= this.beltRows * 4) {
      return;
    }
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

  @HostListener("window:keydown", ["$event"])
  onGlobalAttackKey(event: KeyboardEvent): void {
    if (this.activeTab !== "run" || !this.runActive || event.repeat) return;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    const isEditable = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (key === "escape") {
      event.preventDefault();
      if (this.inventoryOpen) {
        this.inventoryOpen = false;
        this.escapeMenuOpen = true;
      } else {
        this.escapeMenuOpen = !this.escapeMenuOpen;
      }
      this.keysDown.clear();
      requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
      return;
    }
    if (isEditable) return;
    if (key === "i") {
      event.preventDefault();
      this.inventoryOpen = !this.inventoryOpen;
      this.escapeMenuOpen = false;
      this.keysDown.clear();
      requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
      return;
    }
    if (this.escapeMenuOpen || this.inventoryOpen) return;
    if (["1", "2", "3", "4"].includes(key)) {
      event.preventDefault();
      this.useSkillHotkey(Number(key) - 1);
      return;
    }
    if (![" ", "j", "f"].includes(key)) return;
    event.preventDefault();
    this.attackNearestEnemy();
  }

  async ngOnInit(): Promise<void> {
    this.runActive = false;
    this.activeTab = "menu";
    this.rebuildInventoryGrid();
    this.readSavedProgress();
    this.lobbyMessageSubscription = this.d2SurvivorsService.lobbyMessage$.subscribe((message) => this.addLobbyMessage(message));
    this.leaderboardSubscription = this.d2SurvivorsService.leaderboardUpdated$.subscribe(() => void this.refreshLeaderboard());
    await this.loadLobby();
    this.leaderboardRefreshTimer = window.setInterval(() => void this.refreshLeaderboard(), 15000);
    this.lobbyRefreshTimer = window.setInterval(() => void this.refreshLobbyHistory(), 5000);
  }

  toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    if (this.inventoryOpen) {
      this.escapeMenuOpen = false;
      this.keysDown.clear();
    }
    requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
  }

  showEscapeMenu(): void {
    this.escapeMenuOpen = true;
    this.inventoryOpen = false;
    this.keysDown.clear();
    if (this.pendingLevelUps > 0 && this.upgradeChoices.length === 0) this.prepareUpgradeChoices();
  }

  closeEscapeMenu(): void {
    this.escapeMenuOpen = false;
    this.keysDown.clear();
    if (this.pendingLevelUps > 0 && this.upgradeChoices.length === 0) this.prepareUpgradeChoices();
    requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
  }

  get equippedSkills(): string[] {
    return this.ownedSkills.filter((name) => name !== this.basicAttackName).slice(0, 4);
  }

  get emptySkillSlots(): number[] {
    return Array.from({ length: Math.max(0, 4 - this.equippedSkills.length) }, (_, index) => index);
  }

  get basicAttackIcon(): string {
    return this.skillIcon(this.basicAttackName);
  }

  skillIcon(skill: string): string {
    const icons: Record<string, string> = {
      "Guided Arrow": "➶", "Throwing Knife": "⟋", "Axe Throw": "⚒", "Spirit Claw": "✦",
      "Bone Bolt": "☠", "Holy Bolt": "✧", "Fire Bolt": "♨", Multishot: "➶",
      "Faster Attacks": "»", Vitality: "♥", "Arcane Focus": "◉", "Weapon Mastery": "⚔",
    };
    return icons[skill] ?? skill.charAt(0).toUpperCase();
  }

  useSkillHotkey(slot: number): void {
    const skill = this.equippedSkills[slot];
    if (skill) this.activateOwnedSkill(skill);
  }

  activateOwnedSkill(skill: string): void {
    const nearest = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((a, b) => Math.hypot(a.x - this.playerX, a.y - this.playerY) - Math.hypot(b.x - this.playerX, b.y - this.playerY))[0];
    if (!nearest) return;
    const attack = this.basicAttackForClass(this.selectedClass);
    const multiplier = Math.max(1, this.skillLevels[skill] ?? 1);
    const distance = Math.hypot(nearest.x - this.playerX, nearest.y - this.playerY);
    const damage = this.basicAttackDamage * (skill === this.basicAttackName ? 1 : 1.5) + (multiplier - 1) * 3;
    if (distance <= nearest.r + 12) {
      nearest.hp -= damage;
      this.floatingTexts.push({ x: nearest.x, y: nearest.y - nearest.r, text: `-${Math.floor(damage)}`, color: attack.color, life: 0.8 });
    } else {
      this.attackProjectiles.push({
        x: this.playerX, y: this.playerY, startX: this.playerX, startY: this.playerY,
        targetX: nearest.x, targetY: nearest.y, targetId: this.attackSequence++, speed: 700,
        damage, life: Math.max(3, distance / 700 + 1), radius: 5, color: attack.color, kind: attack.kind,
      });
    }
    this.attackCooldown = Math.max(this.attackCooldown, this.basicAttackCooldown * 0.65);
  }

  @HostListener("window:pagehide")
  saveProgressBeforeLeaving(): void {
    this.persistRunProgress(true);
  }

  ngAfterViewInit(): void {
    this.loadEnemySprites();
    if (this.activeTab === "menu" && this.menuPanel !== "characters") this.startMenuHeroPreview();
  }

  private loadEnemySprites(): void {
    for (const species of ENEMY_SPECIES) {
      const layout = ENEMY_SPRITE_LAYOUTS[species];
      const cell = ENEMY_SPRITE_CELLS[species];
      if (!cell) {
        continue;
      }
      const source = new Image();
      source.onload = () => {
        const columns = layout.columns;
        const rows = layout.rows;
        if (source.naturalWidth % columns !== 0 || source.naturalHeight % rows !== 0) {
          console.warn(`Invalid sprite-sheet layout for ${species}`, source.naturalWidth, source.naturalHeight);
          return;
        }
        const actualCell = { width: source.naturalWidth / columns, height: source.naturalHeight / rows };
        const canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          return;
        }
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0);
        this.enemySprites[species] = {
          image: canvas,
          ...layout,
          columns,
          rows,
          cell: actualCell,
          bounds: new Map(),
        };
      };
      source.onerror = () => console.warn(`Could not load enemy sprite asset: ${ENEMY_SPRITE_PATHS[species]}`);
      source.src = ENEMY_SPRITE_PATHS[species];
    }
  }

  ngOnDestroy(): void {
    this.persistRunProgress(true);
    this.lobbyMessageSubscription?.unsubscribe();
    this.leaderboardSubscription?.unsubscribe();
    if (this.leaderboardRefreshTimer !== undefined) window.clearInterval(this.leaderboardRefreshTimer);
    if (this.lobbyRefreshTimer !== undefined) window.clearInterval(this.lobbyRefreshTimer);
    if (this.recordRetryTimer !== undefined) window.clearTimeout(this.recordRetryTimer);
    void this.d2SurvivorsService.disconnectLobby();
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
    this.stopMenuHeroPreview();
    this.stopAmbientAudio();
    void this.audioContext?.close();
    this.audioContext = undefined;
  }

  private basicAttackForClass(classId: string): { name: string; kind: AttackProjectile["kind"]; color: string; damage: number; cooldown: number } {
    const attacks: Record<string, { name: string; kind: AttackProjectile["kind"]; color: string; damage: number; cooldown: number }> = {
      amazon: { name: "Guided Arrow", kind: "arrow", color: "#ffd78a", damage: 18, cooldown: 0.72 },
      assassin: { name: "Throwing Knife", kind: "blade", color: "#b9d5ff", damage: 16, cooldown: 0.58 },
      barbarian: { name: "Axe Throw", kind: "blade", color: "#ffb36b", damage: 23, cooldown: 0.82 },
      druid: { name: "Spirit Claw", kind: "claw", color: "#9dffb1", damage: 17, cooldown: 0.68 },
      necromancer: { name: "Bone Bolt", kind: "bone", color: "#e4e0ce", damage: 17, cooldown: 0.72 },
      paladin: { name: "Holy Bolt", kind: "holy", color: "#fff0a8", damage: 17, cooldown: 0.72 },
      sorceress: { name: "Fire Bolt", kind: "fire", color: "#ff7645", damage: 16, cooldown: 0.66 },
    };
    return attacks[classId] ?? attacks["amazon"];
  }

  private xpForLevel(level: number): number {
    return 5 + Math.max(0, level - 1) * 3;
  }

  private isKnownSkill(name: string): boolean {
    return this.skills.some((skill) => skill.name === name) || name in UPGRADE_DESCRIPTIONS || BASIC_ATTACK_NAMES.includes(name);
  }

  private grantExperience(amount: number): void {
    if (!this.runActive || amount <= 0) return;
    this.playerXp += amount;
    while (this.playerXp >= this.xpToNextLevel) {
      this.playerXp -= this.xpToNextLevel;
      this.playerLevel += 1;
      this.pendingLevelUps += 1;
      this.xpToNextLevel = this.xpForLevel(this.playerLevel);
    }
    if (this.pendingLevelUps > 0) this.prepareUpgradeChoices();
    this.persistRunProgress(true);
  }

  private prepareUpgradeChoices(): void {
    if (this.pendingLevelUps <= 0) { this.upgradeChoices = []; return; }
    // Keep the basic damage upgrade in every offer so a level can always improve the
    // character's starting attack, even after other skills have been learned.
    const choices: SkillUpgrade[] = [
      { id: "attack-damage", name: `${this.basicAttackName} + damage`, description: `Increase basic attack damage by 6 (currently ${this.basicAttackDamage}).`, kind: "attack" },
      { id: "attack-speed", name: "Faster Attacks", description: `Reduce basic attack cooldown by 10% (currently ${this.basicAttackCooldown.toFixed(2)}s).`, kind: "attack" },
      { id: "multishot", name: "Multishot", description: `Fire at one additional nearby monster (rank ${this.skillLevels["Multishot"] ?? 0}).`, kind: "attack" },
      { id: "vitality", name: "Vitality", description: `Gain 5 maximum life and heal 5 life (currently ${this.playerMaxHp}).`, kind: "stat" },
      { id: "focus", name: "Arcane Focus", description: `Gain 5 maximum mana and restore 5 mana (currently ${this.playerMaxMana}).`, kind: "stat" },
      { id: "weapon-mastery", name: "Weapon Mastery", description: `Increase all basic attack damage by 4 (rank ${this.skillLevels["Weapon Mastery"] ?? 0}).`, kind: "attack" },
    ];
    const optionalChoices = choices.slice(1).sort((a, b) => hashString(`${this.playerLevel}:${a.id}`) - hashString(`${this.playerLevel}:${b.id}`));
    this.upgradeChoices = [choices[0], ...optionalChoices.slice(0, 2)];
    this.levelUpNotice = `Level ${this.playerLevel} reached — choose an upgrade.`;
  }

  private updateBasicAttack(): void {
    if (!this.runActive || this.pendingLevelUps > 0 || this.attackCooldown > 0) return;
    const target = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((a, b) => Math.hypot(a.x - this.playerX, a.y - this.playerY) - Math.hypot(b.x - this.playerX, b.y - this.playerY))[0];
    if (!target) return;

    const attack = this.basicAttackForClass(this.selectedClass);
    const attackLevel = this.skillLevels[this.basicAttackName] ?? 1;
    const damage = this.basicAttackDamage + (attackLevel - 1) * 2 + (this.skillLevels["Weapon Mastery"] ?? 0) * 4;
    const distance = Math.hypot(target.x - this.playerX, target.y - this.playerY);
    if (distance <= target.r + 12) {
      target.hp -= damage;
      this.floatingTexts.push({ x: target.x, y: target.y - target.r - 8, text: `-${damage}`, color: attack.color, life: 0.65 });
    } else {
      this.attackSequence += 1;
      this.attackProjectiles.push({
        x: this.playerX, y: this.playerY - 8, startX: this.playerX, startY: this.playerY - 8,
        targetX: target.x, targetY: target.y, target, speed: 700,
        damage, life: Math.max(3, distance / 700 + 1), radius: 5, color: attack.color, kind: attack.kind,
      });
    }
    this.attackCooldown = this.basicAttackCooldown;
  }

  chooseLevelUpgrade(choice: SkillUpgrade): void {
    if (!this.upgradeChoices.some((candidate) => candidate.id === choice.id) || this.pendingLevelUps <= 0) return;
    switch (choice.id) {
      case "attack-damage": this.basicAttackDamage += 6; this.skillLevels[this.basicAttackName] = (this.skillLevels[this.basicAttackName] ?? 1) + 1; break;
      case "attack-speed": this.basicAttackCooldown = Math.max(0.18, this.basicAttackCooldown * 0.9); this.skillLevels["Faster Attacks"] = (this.skillLevels["Faster Attacks"] ?? 0) + 1; break;
      case "multishot": this.skillLevels["Multishot"] = (this.skillLevels["Multishot"] ?? 0) + 1; break;
      case "vitality": this.playerMaxHp += 5; this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 5); this.skillLevels["Vitality"] = (this.skillLevels["Vitality"] ?? 0) + 1; break;
      case "focus": this.playerMaxMana += 5; this.playerMana = Math.min(this.playerMaxMana, this.playerMana + 5); this.skillLevels["Arcane Focus"] = (this.skillLevels["Arcane Focus"] ?? 0) + 1; break;
      case "weapon-mastery": this.skillLevels["Weapon Mastery"] = (this.skillLevels["Weapon Mastery"] ?? 0) + 1; this.basicAttackDamage += 4; break;
    }
    if (!this.ownedSkills.includes(choice.name)) this.ownedSkills.push(choice.name);
    this.pendingLevelUps -= 1;
    this.upgradeChoices = [];
    this.levelUpNotice = this.pendingLevelUps > 0 ? `${this.pendingLevelUps} more level upgrade${this.pendingLevelUps === 1 ? "" : "s"} to choose.` : "Upgrade applied.";
    if (this.pendingLevelUps > 0) this.prepareUpgradeChoices();
    this.persistRunProgress(true);
  }

  attackNearestEnemy(): void {
    if (!this.runActive || this.pendingLevelUps > 0 || this.attackCooldown > 0 || this.enemies.length === 0) return;
    const targets = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((a, b) => Math.hypot(a.x - this.playerX, a.y - this.playerY) - Math.hypot(b.x - this.playerX, b.y - this.playerY))
      .slice(0, 1 + (this.skillLevels["Multishot"] ?? 0));
    if (!targets.length) return;
    const attack = this.basicAttackForClass(this.selectedClass);
    const attackLevel = this.skillLevels[this.basicAttackName] ?? 1;
    const damage = this.basicAttackDamage + (attackLevel - 1) * 2 + (this.skillLevels["Weapon Mastery"] ?? 0) * 4;
    for (const target of targets) {
      const distance = Math.hypot(target.x - this.playerX, target.y - this.playerY);
      if (distance <= target.r + 12) {
        target.hp -= damage;
        this.floatingTexts.push({ x: target.x, y: target.y - target.r - 8, text: `-${damage}`, color: attack.color, life: 0.65 });
        continue;
      }
      this.attackSequence += 1;
      this.attackProjectiles.push({
        x: this.playerX, y: this.playerY - 8, startX: this.playerX, startY: this.playerY - 8,
        targetX: target.x, targetY: target.y, target, speed: 700,
        damage, life: Math.max(3, distance / 700 + 1), radius: 5, color: attack.color, kind: attack.kind,
      });
    }
    this.attackCooldown = this.basicAttackCooldown;
  }

  private updateAttackProjectiles(dt: number): void {
    const seconds = dt / 1000;
    for (const projectile of this.attackProjectiles) {
      projectile.life -= seconds;
      const target = projectile.target;
      const targetIsAlive = !!target && this.enemies.includes(target) && target.hp > 0;
      if (targetIsAlive) {
        projectile.targetX = target.x;
        projectile.targetY = target.y;
      }
      const dx = projectile.targetX - projectile.x;
      const dy = projectile.targetY - projectile.y;
      const distance = Math.hypot(dx, dy);
      const step = projectile.speed * seconds;
      if (distance <= step + (targetIsAlive ? target.r : 4)) {
        if (targetIsAlive) target.hp -= projectile.damage;
        projectile.life = 0;
        this.floatingTexts.push({ x: projectile.targetX, y: projectile.targetY - 12, text: targetIsAlive ? `-${projectile.damage}` : "Miss", color: projectile.color, life: 0.65 });
      } else if (distance > 0) {
        projectile.x += dx / distance * step;
        projectile.y += dy / distance * step;
      }
    }
    this.attackProjectiles = this.attackProjectiles.filter((projectile) => projectile.life > 0);
  }

  private drawAttackProjectile(ctx: CanvasRenderingContext2D, projectile: AttackProjectile): void {
    const point = this.projectArenaPoint(projectile.x, projectile.y);
    const start = this.projectArenaPoint(projectile.startX, projectile.startY);
    ctx.save();
    ctx.strokeStyle = projectile.color;
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = projectile.kind === "lightning" ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 8);
    ctx.lineTo(point.x, point.y - 8);
    ctx.stroke();
    if (projectile.kind === "lightning") {
      ctx.beginPath(); ctx.moveTo(point.x - 5, point.y - 12); ctx.lineTo(point.x + 5, point.y - 4); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(point.x, point.y - 8, projectile.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  startRun(): void {
    this.lobbyRunId = createRunId();
    this.runKillCount = 0;
    this.hasSavedRun = true;
    this.stopMenuHeroPreview();
    this.runActive = false;
    this.saveStatus = "";
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
    const basicAttack = this.basicAttackForClass(this.selectedClass);
    this.playerLevel = 1;
    this.playerXp = 0;
    this.pendingLevelUps = 0;
    this.xpToNextLevel = this.xpForLevel(1);
    this.basicAttackName = basicAttack.name;
    this.basicAttackCooldown = basicAttack.cooldown;
    this.basicAttackDamage = basicAttack.damage;
    this.attackCooldown = 0;
    this.attackSequence = 0;
    this.attackProjectiles = [];
    this.upgradeChoices = [];
    this.levelUpNotice = "";
    this.ownedSkills = [this.basicAttackName];
    this.skillLevels = { [this.basicAttackName]: 1 };
    this.enemies = [];
    this.chests = [];
    this.potionDrops = [];
    this.floatingTexts = [];
    this.beltSlots = [
      { kind: "health" }, { kind: "mana" }, { kind: "health" }, { kind: "mana" },
      ...Array.from({ length: 12 }, () => ({ kind: null })),
    ];
    this.equipment = createEmptyEquipment();
    this.activeBottleSlot = 0;
    this.escapeMenuOpen = false;
    this.inventoryOpen = false;
    this.combatOrbsTime = 0;
    this.inventory = [];
    this.rebuildInventoryGrid();
    this.selectedItem = null;
    this.selectedSlotIndex = null;
    this.dragState = null;
    this.dragGhostSlotIndex = null;
    this.inventoryStatus = "";
    this.selectedEquipmentSlot = null;
    this.runTime = 0;
    this.spawnAcc = 0;
    this.chestTimer = 0;
    this.lastTime = performance.now();
    this.lastRunSaveAt = 0;
    this.initializeCharacterRenderer();
    if (this.characterRenderer && this.characterScene && this.loadedModelClass !== this.selectedClass) {
      this.loadCharacterModel();
    } else if (!this.characterRenderer || !this.characterScene) {
      this.modelLoadError = true;
    }
    this.runActive = true;
    this.persistRunProgress(true);
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
    if (!this.escapeMenuOpen && !this.inventoryOpen) this.update(dt);
    else {
      this.isPlayerMoving = false;
      this.playerMoveX = 0;
      this.playerMoveY = 0;
    }
    this.playerAnimationDelta = dt;
    this.draw();
    this.renderCharacter();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt: number): void {
    this.runTime += dt / 1000;
    this.combatOrbsTime = Math.max(0, this.combatOrbsTime - dt / 1000);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt / 1000);
    this.playerMana = Math.min(this.playerMaxMana, this.playerMana + dt * 0.0015);

    this.movePlayer(dt);

    this.updateAttackProjectiles(dt);
    if (this.pendingLevelUps > 0 && this.upgradeChoices.length === 0) this.prepareUpgradeChoices();
    if (this.pendingLevelUps > 0) this.attackProjectiles = [];
    else this.updateBasicAttack();

    this.updateEnemies(dt);
    this.updateChests(dt);
    this.updatePotionDrops(dt);
    this.updateFloatingTexts(dt);
    this.spawnEnemies(dt);
    this.spawnChests(dt);
    this.persistRunProgress();
  }

  movePlayer(dt: number): void {
    const speed = 220;
    const move = speed * (dt / 1000);
    const previousX = this.playerX;
    const previousY = this.playerY;
    // Translate screen-relative input into the square world plane used by gameplay.
    // With the isometric projection, world-left/up-left points screen-up-left; compensate
    // along the depth axis so A remains strictly horizontal on screen.
    let screenX = 0;
    let screenY = 0;
    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) screenY -= move;
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown")) screenY += move;
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft")) screenX -= move;
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) screenX += move;
    const diagonalLength = Math.hypot(screenX, screenY);
    if (diagonalLength > move && move > 0) {
      screenX *= move / diagonalLength;
      screenY *= move / diagonalLength;
    }
    const projectionScale = 0.7071;
    const dx = (screenX + 2 * screenY) / (2 * projectionScale);
    const dy = (2 * screenY - screenX) / (2 * projectionScale);
    this.playerX = Math.max(32, Math.min(this.arenaW - 32, this.playerX + dx));
    this.playerY = Math.max(32, Math.min(this.arenaH - 32, this.playerY + dy));
    this.playerMoveX = this.playerX - previousX;
    this.playerMoveY = this.playerY - previousY;
    this.isPlayerMoving = Math.hypot(this.playerMoveX, this.playerMoveY) > 0.01;
    if (this.isPlayerMoving) {
      this.playerFacingX = this.playerMoveX / Math.hypot(this.playerMoveX, this.playerMoveY);
      this.playerFacingY = this.playerMoveY / Math.hypot(this.playerMoveX, this.playerMoveY);
    }
  }

  updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      const dx = this.playerX - enemy.x;
      const dy = this.playerY - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const speed = enemy.speed * (dt / 1000);
      enemy.x += (dx / distance) * speed;
      enemy.y += (dy / distance) * speed;
      if (enemy.kind !== "normal" && distance < 36) this.playerHp -= enemy.dmg * (dt / 1000);
      if (enemy.cd !== undefined) enemy.cd = Math.max(0, enemy.cd - dt / 1000);
    }
    const defeatedEnemies = this.enemies.filter((enemy) => enemy.hp <= 0);
    for (const enemy of defeatedEnemies) this.grantExperience(enemy.kind === "boss" ? 8 : enemy.kind === "champion" ? 3 : 1);
    this.runKillCount += defeatedEnemies.length;
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0 && this.playerHp > 0);
    if (this.playerHp <= 0) this.endRun(false);
  }

  updateChests(dt: number): void {
    this.openChestCount = 0;
    for (const chest of this.chests) {
      if (!chest.open) {
        chest.bob += dt / 1000;
        this.openChestCount += 1;
        if (Math.hypot(this.playerX - chest.x, this.playerY - chest.y) < 42) this.openChest(chest);
      }
    }
    this.chests = this.chests.filter((chest) => !chest.open || chest.life > 0);
  }

  updatePotionDrops(dt: number): void {
    for (const drop of this.potionDrops) {
      drop.bob += dt / 1000;
      drop.life -= dt / 1000;
      drop.pickupDelay = Math.max(0, drop.pickupDelay - dt / 1000);
      if (drop.pickupDelay > 0 || Math.hypot(this.playerX - drop.x, this.playerY - drop.y) >= 28) continue;
      const slot = this.beltSlots.slice(0, this.beltRows * 4).find((candidate) => candidate.kind === null);
      if (!slot) {
        if (!drop.notifiedFull) {
          this.floatingTexts.push({ x: drop.x, y: drop.y - 18, text: "BELT FULL", color: "#ffcf72", life: 1.8 });
          drop.notifiedFull = true;
        }
        continue;
      }
      slot.kind = drop.kind;
      drop.collected = true;
      this.floatingTexts.push({ x: drop.x, y: drop.y - 18, text: `${drop.kind.toUpperCase()} POTION`, color: drop.kind === "health" ? "#ff7171" : "#73c9ff", life: 2 });
    }
    this.potionDrops = this.potionDrops.filter((drop) => !drop.collected && drop.life > 0);
  }

  updateFloatingTexts(dt: number): void {
    for (const floatingText of this.floatingTexts) {
      floatingText.y -= 0.25 * (dt / 1000) * 60;
      floatingText.life -= dt / 1000;
    }
    this.floatingTexts = this.floatingTexts.filter((floatingText) => floatingText.life > 0);
  }

  selectedItem: D2InventoryItem | null = null;
  selectedSlotIndex: number | null = null;
  selectedEquipmentSlot: PaperdollSlot | null = null;
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
    return this.inventory[slotIndex] ?? undefined;
  }

  getInventorySlotIndexFromElement(target: EventTarget | null): number {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-inventory-slot]") : null;
    if (!element) return -1;
    const slotIndex = Number(element.dataset["inventorySlot"]);
    return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < this.inventory.length ? slotIndex : -1;
  }

  private getItemAnchorAt(index: number): number {
    for (let anchor = 0; anchor < this.inventory.length; anchor += 1) {
      const item = this.inventory[anchor];
      if (!item) continue;
      const size = this.itemSize(item);
      const column = index % this.inventoryColumns;
      const row = Math.floor(index / this.inventoryColumns);
      const itemColumn = anchor % this.inventoryColumns;
      const itemRow = Math.floor(anchor / this.inventoryColumns);
      if (column >= itemColumn && column < itemColumn + size.width && row >= itemRow && row < itemRow + size.height) return anchor;
    }
    return -1;
  }

  internalCanDrop(sourceIndex: number, targetIndex: number, sourceItem?: D2InventoryItem): boolean {
    if (targetIndex < 0 || targetIndex >= this.inventory.length) return false;
    if (this.dragState?.source === "equipment") return this.canPlaceItemAt(this.dragState.item, targetIndex);
    if (sourceIndex < 0 || sourceIndex >= this.inventory.length || sourceIndex === targetIndex) return false;
    const source = this.inventory[sourceIndex];
    const heldItem = sourceItem ?? source;
    if (!heldItem || source?.id !== heldItem.id) return false;
    const targetAnchor = this.getItemAnchorAt(targetIndex);
    if (targetAnchor === sourceIndex) return false;
    const ignored = targetAnchor >= 0 ? [sourceIndex, targetAnchor] : [sourceIndex];
    if (!this.canPlaceItemAt(heldItem, targetIndex, ignored)) return false;
    if (targetAnchor < 0) return true;
    const targetItem = this.inventory[targetAnchor];
    return !!targetItem && this.canPlaceItemAt(targetItem, sourceIndex, ignored);
  }

  startDrag(slotIndex: number, event: DragEvent): void {
    const anchor = this.getItemAnchorAt(slotIndex);
    const item = anchor >= 0 ? this.inventory[anchor] : null;
    if (!item) {
      event.preventDefault();
      return;
    }
    this.dragState = { source: "inventory", slotIndex: anchor, item };
    this.selectedItem = item;
    this.selectedSlotIndex = anchor;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    }
  }

  startEquipmentDrag(slot: PaperdollSlot, event: DragEvent): void {
    const item = this.equipment[slot];
    if (!item) { event.preventDefault(); return; }
    this.dragState = { source: "equipment", slotIndex: -1, equipmentSlot: slot, item };
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }
  }

  onEquipmentDrop(slot: PaperdollSlot, event: DragEvent): void {
    event.preventDefault();
    const drag = this.dragState;
    if (!drag || drag.source !== "inventory" || !isCompatibleWithEquipment(drag.item, slot)) {
      this.inventoryStatus = "That item cannot be equipped there.";
      this.clearDragState();
      return;
    }
    if (slot === "belt" && this.beltSlots.slice(this.getBeltRows(drag.item) * 4).some((potion) => potion.kind !== null)) {
      this.inventoryStatus = "Move or use potions from the extra rows before equipping a smaller belt.";
      this.clearDragState();
      return;
    }
    const oldEquipment = this.equipment[slot];
    const sourceAnchor = drag.slotIndex;
    this.inventory[sourceAnchor] = null;
    if (oldEquipment && !this.canPlaceItemAt(oldEquipment, sourceAnchor)) {
      const replacement = this.findInventoryPlacement(oldEquipment);
      if (replacement < 0) {
        this.inventory[sourceAnchor] = drag.item;
        this.inventoryStatus = "Inventory full — make room for the equipped item first.";
        this.clearDragState();
        return;
      }
      this.inventory[replacement] = oldEquipment;
    } else if (oldEquipment) {
      this.inventory[sourceAnchor] = oldEquipment;
    }
    this.equipment[slot] = drag.item;
    this.normalizeBeltSlots();
    this.rebuildInventoryGrid();
    this.selectedEquipmentSlot = slot;
    this.selectedItem = drag.item;
    this.selectedSlotIndex = null;
    this.persistRunProgress(true);
    this.inventoryStatus = `${drag.item.name} equipped.`;
    this.clearDragState();
  }

  dropEquipmentToInventory(slot: PaperdollSlot, targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    const item = this.equipment[slot];
    if (slot === "belt" && this.beltSlots.slice(4).some((potion) => potion.kind !== null)) {
      this.inventoryStatus = "Move or use potions from the extra rows before removing your belt.";
      this.clearDragState();
      return;
    }
    const targetAnchor = this.getItemAnchorAt(targetIndex);
    const targetItem = targetAnchor >= 0 ? this.inventory[targetAnchor] : null;
    if (!item || !this.canPlaceItemAt(item, targetIndex, targetAnchor >= 0 ? [targetAnchor] : [])) {
      this.inventoryStatus = "That item will not fit in that inventory space.";
      this.clearDragState();
      return;
    }
    if (targetItem && targetAnchor >= 0) {
      this.inventory[targetAnchor] = null;
      this.inventory[targetIndex] = item;
      const replacement = this.findInventoryPlacement(targetItem);
      if (replacement < 0) {
        this.inventory[targetIndex] = null;
        this.inventory[targetAnchor] = targetItem;
        this.inventoryStatus = "Inventory full — make room for the displaced item.";
        this.clearDragState();
        return;
      }
      this.inventory[replacement] = targetItem;
    } else {
      this.inventory[targetIndex] = item;
    }
    this.equipment[slot] = null;
    this.normalizeBeltSlots();
    this.rebuildInventoryGrid();
    this.selectedItem = item;
    this.selectedSlotIndex = targetIndex;
    this.selectedEquipmentSlot = null;
    this.persistRunProgress(true);
    this.inventoryStatus = `${item.name} moved to inventory.`;
    this.clearDragState();
  }

  equipSelectedItem(slotIndex: number, slot?: PaperdollSlot): void {
    const item = this.inventory[slotIndex];
    if (!item) return;
    const compatibleSlots = PAPERDOLL_SLOTS.filter((candidate) => isCompatibleWithEquipment(item, candidate));
    const target = slot ?? compatibleSlots.find((candidate) => !this.equipment[candidate]) ?? compatibleSlots[0];
    if (!target) return;
    this.dragState = { source: "inventory", slotIndex, item };
    this.onEquipmentDrop(target, { preventDefault: () => undefined } as DragEvent);
  }

  onInventoryDragOver(slotIndex: number, event: DragEvent): void {
    if (!this.dragState) return;
    if (this.internalCanDrop(this.dragState.slotIndex, slotIndex, this.dragState.item)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
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
    if (drag.source === "equipment" && drag.equipmentSlot) {
      this.dropEquipmentToInventory(drag.equipmentSlot, slotIndex, event);
      return;
    }
    const targetAnchor = this.getItemAnchorAt(slotIndex);
    const targetItem = targetAnchor >= 0 ? this.inventory[targetAnchor] : null;
    this.inventory[drag.slotIndex] = null;
    if (targetItem && targetAnchor >= 0) this.inventory[targetAnchor] = null;
    this.inventory[slotIndex] = drag.item;
    if (targetItem && targetAnchor >= 0) this.inventory[drag.slotIndex] = targetItem;
    this.rebuildInventoryGrid();
    this.selectedItem = drag.item;
    this.selectedSlotIndex = slotIndex;
    this.inventoryStatus = "";
    this.persistRunProgress(true);
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
    this.selectedEquipmentSlot = null;
  }

  selectEquipmentItem(slot: PaperdollSlot): void {
    this.selectedEquipmentSlot = slot;
    this.selectedItem = this.equipment[slot];
    this.selectedSlotIndex = null;
  }

  unequipEquipmentSlot(slot: PaperdollSlot, event: MouseEvent): void {
    event.preventDefault();
    this.unequipItem(slot);
  }

  unequipItem(slot: PaperdollSlot): void {
    const item = this.equipment[slot];
    if (!item) return;
    if (slot === "belt" && this.beltSlots.slice(4).some((potion) => potion.kind !== null)) {
      this.inventoryStatus = "Move or use potions from the extra rows before unequipping your belt.";
      return;
    }
    const index = this.findInventoryPlacement(item);
    if (index < 0) { this.inventoryStatus = "Inventory full — make room before unequipping this item."; return; }
    this.inventory[index] = item;
    this.equipment[slot] = null;
    this.normalizeBeltSlots();
    this.rebuildInventoryGrid();
    this.selectedEquipmentSlot = null;
    this.selectedItem = null;
    this.persistRunProgress(true);
    this.inventoryStatus = `${item.name} moved to inventory.`;
  }

  canDropOnSlot(sourceIndex: number, targetIndex: number, sourceItem?: D2InventoryItem): boolean {
    if (this.dragState?.source === "equipment") return this.canPlaceItemAt(this.dragState.item, targetIndex);
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
    const speciesOptions = ENEMY_SPECIES_BY_KIND[kind];
    const species = speciesOptions[Math.floor(Math.random() * speciesOptions.length)];
    const base: Enemy = {
      kind: "normal",
      species,
      spriteFrame: Math.floor(Math.random() * ENEMY_SPRITE_LAYOUTS[species].columns),
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
    this.grantExperience(4);
    this.skillLevels[this.basicAttackName] = (this.skillLevels[this.basicAttackName] ?? 1) + 1;
    this.basicAttackDamage += 2;
    this.floatingTexts.push({ x: c.x, y: c.y - 20, text: `+1 ${this.basicAttackName}`, color: "#ffd27a", life: 2.4 });

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
    if (!this.runActive) return;
    this.runActive = false;
    void this.recordCompletedCharacter(victory);
    if (!victory) {
      this.hasSavedRun = false;
      this.persistRunProgress(true);
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  getSkillLevel(name: string): number {
    return this.skillLevels[name] ?? 0;
  }

  get levelXpFill(): number {
    return this.xpToNextLevel > 0 ? Math.max(0, Math.min(1, this.playerXp / this.xpToNextLevel)) : 0;
  }

  getOwnedSkills(): string[] {
    return this.ownedSkills.slice();
  }

  getSkillDescription(name: string): string | undefined {
    return this.skills.find((s) => s.name === name)?.desc ??
      (name === this.basicAttackName ? `Your automatic ${name.toLowerCase()} hits the nearest monster.` : UPGRADE_DESCRIPTIONS[name]);
  }

  private projectArenaPoint(x: number, y: number): { x: number; y: number } {
    const worldCenterX = this.arenaW / 2;
    const worldCenterY = this.arenaH / 2;
    const canvas = this.arenaRef?.nativeElement;
    const screenCenterX = (canvas?.width ?? 800) / 2;
    const screenCenterY = (canvas?.height ?? 500) / 2;
    const dx = x - worldCenterX;
    const dy = y - worldCenterY;
    // 2:1 diamond projection, calibrated to the orthographic 3D character camera.
    return {
      x: screenCenterX + (dx - dy) * 0.7071,
      y: screenCenterY + (dx + dy) * 0.35355,
    };
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
    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the floor as a diamond grid: world coordinates remain square for movement/combat,
    // while only rendering is projected into the familiar Diablo-style isometric view.
    const tile = 48;
    ctx.save();
    const first = this.projectArenaPoint(0, 0);
    const last = this.projectArenaPoint(this.arenaW, this.arenaH);
    const halfW = tile * 0.7071;
    const halfH = tile * 0.35355;
    for (let row = -2; row <= Math.ceil(this.arenaH / tile) + 2; row += 1) {
      for (let column = -2; column <= Math.ceil(this.arenaW / tile) + 2; column += 1) {
        const worldX = column * tile;
        const worldY = row * tile;
        const point = this.projectArenaPoint(worldX, worldY);
        ctx.fillStyle = (column + row) % 2 === 0 ? "#17191f" : "#12141a";
        ctx.beginPath();
        ctx.moveTo(point.x, point.y - halfH);
        ctx.lineTo(point.x + halfW, point.y);
        ctx.lineTo(point.x, point.y + halfH);
        ctx.lineTo(point.x - halfW, point.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#242630";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Frame the projected play space so its diamond boundaries read clearly.
    ctx.strokeStyle = "#65523a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(this.projectArenaPoint(this.arenaW, 0).x, this.projectArenaPoint(this.arenaW, 0).y);
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(this.projectArenaPoint(0, this.arenaH).x, this.projectArenaPoint(0, this.arenaH).y);
    ctx.closePath();
    ctx.stroke();

    const drawOrder = [
      ...this.enemies.map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawEnemy(ctx, entity) })),
      ...this.chests.filter((chest) => !chest.open).map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawChest(ctx, entity) })),
      ...this.potionDrops.map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawPotionDrop(ctx, entity) })),
    ].sort((a, b) => a.depth - b.depth);
    for (const entity of drawOrder) entity.draw();

    for (const projectile of this.attackProjectiles) this.drawAttackProjectile(ctx, projectile);
    for (const floatingText of this.floatingTexts) {
      const point = this.projectArenaPoint(floatingText.x, floatingText.y);
      ctx.fillStyle = floatingText.color;
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(floatingText.text, point.x, point.y);
    }
    if (this.runActive && this.enemies.length === 0) {
      ctx.save();
      ctx.fillStyle = "#d4c49b";
      ctx.textAlign = "center";
      ctx.font = "bold 14px Georgia, serif";
      ctx.fillText("Monsters approaching…", this.arenaW / 2, 38);
      ctx.restore();
    }

    // The player is rendered as a lit FBX model on the transparent WebGL overlay.

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
      this.characterRenderer.setSize(canvas.width, canvas.height, false);
      this.characterRenderer.setClearColor(0x000000, 0);
      this.characterRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.characterScene = new THREE.Scene();
      this.characterCamera = new THREE.OrthographicCamera(-400, 400, 250, -250, 0.1, 2000);
      this.characterCamera.position.set(600, 490, 600);
      this.characterCamera.lookAt(0, 0, 0);
      this.characterScene.add(new THREE.HemisphereLight(0xdce7ff, 0x30251b, 0.75));
      const keyLight = new THREE.DirectionalLight(0xffe1b0, 1.2);
      keyLight.position.set(-180, 360, 240);
      this.characterScene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x9abaff, 0.45);
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
      async (gltf) => {
        const model = gltf.scene;
        const disposeModel = (): void => model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
            material.dispose();
          });
        });
        if (!this.characterScene || requestId !== this.modelLoadRequest || modelClass !== this.selectedClass) {
          disposeModel();
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
        try {
          await this.applyClassTextures(model, modelClass);
        } catch (error: unknown) {
          disposeModel();
          if (requestId === this.modelLoadRequest) {
            console.error(`Could not apply ${modelClass} character textures`, error);
            this.modelLoadError = true;
          }
          return;
        }
        if (!this.characterScene || requestId !== this.modelLoadRequest || modelClass !== this.selectedClass) {
          disposeModel();
          return;
        }
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        if (size.y <= 0 || !Number.isFinite(size.y)) {
          disposeModel();
          this.modelLoadError = true;
          return;
        }
        this.normalizeCharacterModel(model, 72);
        model.rotation.y = 0;
        this.playerRigBones = this.getPlayerRigBones(model);
        this.playerAnimationTime = 0;
        this.playerMotionBlend = 0;
        this.playerMoveX = 0;
        this.playerMoveY = 0;
        this.playerFacingX = 1;
        this.playerFacingY = 0;
        this.isPlayerMoving = false;

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

  private async applyClassTextures(model: THREE.Group, modelClass: string): Promise<void> {
    const definition = CLASS_MODEL[modelClass];
    if (!definition) return;

    const anisotropy = this.previewRenderer?.capabilities.getMaxAnisotropy()
      ?? this.characterRenderer?.capabilities.getMaxAnisotropy()
      ?? 1;
    const texturePaths = new Set<string>();
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (modelClass === "amazon" && this.isInactiveAmazonArmorVariant(object.name)) {
        // The Amazon GLB contains heavy, medium, and light equipment meshes together.
        // Keep the medium look used by this character and hide the other overlapping tiers.
        mesh.visible = false;
        return;
      }
      const texturePath = this.getTextureForMesh(object.name, modelClass, definition);
      if (texturePath) texturePaths.add(texturePath);
    });

    // Wait for atlas image data before cloning textures: cloning a TextureLoader result before
    // onLoad copies its still-empty image and leaves the character sampling blank materials.
    const textureEntries = await Promise.all([...texturePaths].map(async (path) => {
      const atlas = await new THREE.TextureLoader().loadAsync(path);
      atlas.flipY = false;
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.anisotropy = anisotropy;
      return [path, atlas] as const;
    }));
    const atlases = new Map(textureEntries);
    const mappedTextures = new Map<string, THREE.Texture>();

    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.side = THREE.DoubleSide;
        const texturedMaterial = material as THREE.MeshStandardMaterial;
        const texturePath = this.getTextureForMesh(object.name, modelClass, definition);
        if (texturePath) {
          const atlas = atlases.get(texturePath);
          if (!atlas) return;
          const sourceMap = texturedMaterial.map;
          const transformKey = sourceMap
            ? JSON.stringify([sourceMap.channel, sourceMap.mapping, sourceMap.wrapS, sourceMap.wrapT,
              sourceMap.offset.toArray(), sourceMap.repeat.toArray(), sourceMap.center.toArray(), sourceMap.rotation])
            : "default";
          const textureKey = `${texturePath}|${transformKey}`;
          let colorMap = mappedTextures.get(textureKey);
          if (!colorMap) {
            // Keep UV transforms independent, while sharing identical material maps.
            colorMap = atlas.clone();
            colorMap.flipY = false;
            colorMap.colorSpace = THREE.SRGBColorSpace;
            colorMap.anisotropy = anisotropy;
            if (sourceMap) {
              colorMap.channel = sourceMap.channel;
              colorMap.mapping = sourceMap.mapping;
              colorMap.wrapS = sourceMap.wrapS;
              colorMap.wrapT = sourceMap.wrapT;
              colorMap.offset.copy(sourceMap.offset);
              colorMap.repeat.copy(sourceMap.repeat);
              colorMap.center.copy(sourceMap.center);
              colorMap.rotation = sourceMap.rotation;
            }
            colorMap.needsUpdate = true;
            mappedTextures.set(textureKey, colorMap);
          }
          texturedMaterial.map = colorMap;
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
            material.color.set(0xffffff);
          }
        }
        if (material instanceof THREE.MeshPhongMaterial) material.emissive.set(0x000000);
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissive.set(0x000000);
          material.metalness = Math.min(material.metalness, 0.08);
          material.roughness = Math.max(material.roughness, 0.72);
        }
        material.needsUpdate = true;
      }
    });
  }

  private getPlayerRigBones(model: THREE.Group): PlayerRigBones {
    const bones: PlayerRigBones = { legs: [], knees: [], feet: [], arms: [] };
    model.traverse((object) => {
      if (!(object instanceof THREE.Bone)) return;
      const name = object.name.toLowerCase();
      const side = this.rigBoneSide(name);
      if (/(?:^|[_-])(?:pelvis|hips?)(?:[_-]|$)/.test(name) && !bones.pelvis) {
        bones.pelvis = object;
        bones.pelvisBaseQuaternion = object.quaternion.clone();
      }
      if (/(?:^|[_-])spine[_-]?(?:01|1)(?:[_-]|$)/.test(name) && !bones.spine) {
        bones.spine = object;
        bones.spineBaseQuaternion = object.quaternion.clone();
      }
      const legRoot = /^(?:l|r|left|right)[_-](?:leg[_-]?01|upper[_-]?leg|thigh)(?:[_-].*)?$/.test(name)
        || /^(?:hip|upper[_-]?leg|thigh)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name)
        || /^(?:hip[_-]?(?:l|r|left|right)|(?:l|r|left|right)[_-]hip)(?:[_-].*)?$/.test(name);
      const lowerLeg = /^(?:l|r|left|right)[_-](?:leg[_-]?02|lower[_-]?leg|calf|shin|knee)(?:[_-].*)?$/.test(name)
        || /^(?:knee|calf|shin)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name);
      const foot = /^(?:l|r|left|right)[_-](?:foot|ankle)(?:[_-].*)?$/.test(name)
        || /^(?:foot|ankle)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name);
      if (side && legRoot && !/twist|helper|pad|armor/.test(name)) {
        bones.legs?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      } else if (side && lowerLeg && !/twist|helper|pad|armor|cord/.test(name)) {
        bones.knees?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      } else if (side && foot && !/helper/.test(name)) {
        bones.feet?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      }
      const shoulder = /(?:^|[_-])(?:l|left|r|right)[_-]?shoulder(?:[_-].*)?/.test(name)
        || /(?:^|[_-])shoulder[_-]?(?:l|r)(?:[_-].*)?/.test(name);
      const upperArm = /(?:^|[_-])(?:l|left|r|right)[_-]?(?:upr|upper)[_-]?arm(?:[_-].*)?/.test(name)
        || /^(?:l|r)_(?:upperarm|clavicle)$/.test(name);
      if (side && (shoulder || upperArm) && !/twist|pad|plate|helper/.test(name)) {
        bones.arms?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      }
    });
    // Prefer the shoulder pivot for arm swing when both shoulder and upper-arm joints exist.
    bones.arms = bones.arms?.filter((entry, index, all) =>
      !all.slice(0, index).some((prior) => prior.side === entry.side && /shoulder/.test(prior.bone.name.toLowerCase())));
    return bones;
  }

  private rigBoneSide(name: string): -1 | 1 | undefined {
    if (/^(?:r|right)[_-]/.test(name) || /[_-](?:r|right)(?:[_-]|$)/.test(name)) return -1;
    if (/^(?:l|left)[_-]/.test(name) || /[_-](?:l|left)(?:[_-]|$)/.test(name)) return 1;
    return undefined;
  }

  private animatePlayerModel(dt: number): void {
    if (!this.characterModel) return;
    const seconds = Math.max(0, dt / 1000);
    this.playerAnimationTime += seconds;
    const targetBlend = this.isPlayerMoving ? 1 : 0;
    this.playerMotionBlend += (targetBlend - this.playerMotionBlend) * (1 - Math.exp(-seconds * 8));
    const moving = this.playerMotionBlend;
    const phase = this.playerAnimationTime * (2.1 + moving * 6.4);
    const stride = Math.sin(phase);
    const oppositeStride = -stride;
    const hipAmplitude = 0.035 + moving * 0.34;

    // These class rigs ship in bind pose without clips. Animate the hip, knee, foot, and
    // shoulder joints together for a grounded Diablo-style gait while preserving bind poses.
    for (const leg of this.playerRigBones.legs ?? []) {
      const swing = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.sin(phase + (leg.side < 0 ? Math.PI : 0)) * hipAmplitude,
      );
      leg.bone.quaternion.copy(leg.baseQuaternion).multiply(swing);
    }
    for (const knee of this.playerRigBones.knees ?? []) {
      const legPhase = phase + (knee.side < 0 ? Math.PI : 0);
      const bend = (0.06 + moving * 0.48) * Math.max(0, Math.sin(legPhase + Math.PI * 0.35));
      const flex = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend);
      knee.bone.quaternion.copy(knee.baseQuaternion).multiply(flex);
    }
    for (const foot of this.playerRigBones.feet ?? []) {
      const legPhase = phase + (foot.side < 0 ? Math.PI : 0);
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.sin(legPhase) * moving * 0.12);
      foot.bone.quaternion.copy(foot.baseQuaternion).multiply(roll);
    }
    for (const arm of this.playerRigBones.arms ?? []) {
      // Relax the arms from their bind pose and counter-swing them against each leg.
      const relax = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.2);
      const swing = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        (arm.side < 0 ? oppositeStride : stride) * moving * 0.16,
      );
      arm.bone.quaternion.copy(arm.baseQuaternion).multiply(relax).multiply(swing);
    }
    if (this.playerRigBones.pelvis) {
      const base = this.playerRigBones.pelvisBaseQuaternion ?? this.playerRigBones.pelvis.quaternion;
      const sway = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(phase) * moving * 0.025);
      this.playerRigBones.pelvis.quaternion.copy(base).multiply(sway);
    }
    if (this.playerRigBones.spine) {
      const base = this.playerRigBones.spineBaseQuaternion ?? this.playerRigBones.spine.quaternion;
      const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.035 * moving + Math.sin(phase * 2) * moving * 0.012);
      this.playerRigBones.spine.quaternion.copy(base).multiply(lean);
    }
    const yawTarget = this.isPlayerMoving ? Math.atan2(this.playerMoveX, this.playerMoveY) : Math.atan2(this.playerFacingX, this.playerFacingY);
    const yawDelta = Math.atan2(Math.sin(yawTarget - this.characterModel.rotation.y), Math.cos(yawTarget - this.characterModel.rotation.y));
    this.characterModel.rotation.y += yawDelta * (1 - Math.exp(-seconds * 10));
    // Keep footfalls subtle so the model stays grounded instead of hovering between steps.
    this.characterModel.position.y = Math.abs(Math.sin(phase * 2)) * moving * 0.35;
  }

  private getPreviewPoseBones(model: THREE.Group): PreviewPoseBone[] {
    const rig = this.getPlayerRigBones(model);
    const poses: PreviewPoseBone[] = [];
    const add = (entry: RigAnimationBone | undefined, role: PreviewPoseBone["role"]): void => {
      if (entry) poses.push({ ...entry, role, phase: poses.length * 0.75 });
    };
    for (const arm of rig.arms ?? []) add(arm, "arm");
    for (const leg of rig.legs ?? []) add(leg, "leg");
    for (const knee of rig.knees ?? []) add(knee, "knee");
    for (const foot of rig.feet ?? []) add(foot, "foot");
    if (rig.pelvis) add({ bone: rig.pelvis, baseQuaternion: rig.pelvis.quaternion.clone(), side: 1 }, "pelvis");
    if (rig.spine) add({ bone: rig.spine, baseQuaternion: rig.spine.quaternion.clone(), side: 1 }, "spine");
    return poses;
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

  private isInactiveAmazonArmorVariant(meshName: string): boolean {
    const name = meshName.toLowerCase();
    return /(?:^|[_-])(?:hvy|heavy|lit|light)(?:[_-]|shape|$)/.test(name)
      || /(?:full|half)helmet|valkyrie_vfx/.test(name);
  }

  private getTextureForMesh(meshName: string, modelClass: string, definition: (typeof CLASS_MODEL)[string]): string | null {
    const textureRoot = `${MODEL_BASE}/${modelClass}/textures/`;
    const name = meshName.toLowerCase();
    const texture = (file: string | undefined, fallback?: string): string | null =>
      file ? `${textureRoot}${file}` : fallback ?? null;
    const isHeavyArmor = /hvy|heavy/.test(name);
    const isMediumArmor = /med/.test(name);
    const isLightArmor = /lit|light/.test(name);

    if (/pike|weapon|staff|bow/.test(name)) return definition.weapon ?? definition.body;
    if (/hair|hairtie/.test(name) || (modelClass === "amazon" && /headband/.test(name))) return definition.hair ?? definition.head;
    // Some armor mesh names include "opposite_faces" as a surface marker; keep those on their
    // armor tier atlas instead of mistaking the word "faces" for facial skin.
    if (/head|eye_|teeth|tongue|face|earring|eyelash/.test(name) && !/shoulder/.test(name)) return definition.head;
    // The rigs name skin meshes explicitly (for example larm_body_hvy), while armor meshes
    // often omit "armor" entirely (larm_hvy, legs_med). Resolve body first, then tiered armor.
    if (/body|skin|underwear/.test(name)) return definition.body;

    if (/armor|shoulder|skirt|tabard|pants|leg_plates|legplates|buckle|strap|(?:hvy|heavy|med|medium|lit|light)/.test(name)) {
      if (isHeavyArmor) {
        return texture({
          amazon: "amazon_armorhvy_alb.png",
          assassin: "assassin_armorhvy_alb.png",
          barbarian: "barb_armorheavy_alb.png",
          druid: "druid_armorhvy_alb.png",
          necromancer: "necro_armorhvy_alb.png",
          paladin: "paladin_armorhvy_alb.png",
          sorceress: "sorceress_heavyarmor_alb.png",
        }[modelClass], definition.armor ?? definition.body);
      }
      if (isLightArmor) {
        return texture({
          amazon: "amazon_armorlit_alb.png",
          assassin: "assassin_armorlit_alb.png",
          barbarian: "armors_alb.png",
          druid: "armors_alb.png",
          paladin: "paladin_armorlit_alb.png",
          sorceress: "sorceress_lightarmor_albedo.png",
        }[modelClass], definition.armor ?? definition.body);
      }
      if (isMediumArmor) {
        return texture({
          amazon: "amazon_armormed_alb.png",
          assassin: "assassin_armormed_alb.png",
          barbarian: "barb_armormed_alb.png",
          druid: "druid_armormed_alb.png",
          necromancer: "necro_armormed_alb.png",
          paladin: "paladin_armormed_alb.png",
          sorceress: "sorc_armormed_alb.png",
        }[modelClass], definition.armor ?? definition.body);
      }
      return definition.armor ?? definition.body;
    }

    return definition.body ?? `${textureRoot}${modelClass}_body_alb.png`;
  }

  private renderCharacter(): void {
    if (!this.characterRenderer || !this.characterScene || !this.characterCamera) {
      return;
    }
    if (this.characterModel) {
      this.animatePlayerModel(this.playerAnimationDelta);
      this.characterModel.position.x = this.playerX - this.arenaW / 2;
      this.characterModel.position.z = this.playerY - this.arenaH / 2;
    }
    this.characterRenderer.render(this.characterScene, this.characterCamera);
  }

  drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const ground = this.projectArenaPoint(e.x, e.y);
    const sprite = this.enemySprites[e.species];
    const color = e.kind === "boss" ? "#ffb347" : e.kind === "champion" ? "#ffd27a" : "#8a94a6";
    const size = e.r * (e.kind === "boss" ? 3.5 : e.kind === "champion" ? 3 : 2.65);
    const dx = this.playerX - e.x;
    const dy = this.playerY - e.y;

    let spriteDrawn = false;
    if (sprite && sprite.image.width > 0 && sprite.image.height > 0) {
      const direction = enemySpriteSourceDirection(e.species, enemySpriteRow(e.species, dx, dy));
      const frame = enemySpriteSourceFrame(e.species, enemySpriteFrame(e.species, e.x, e.y, this.runTime));
      const sheetIndex = enemySpriteSheetIndex(e.species, sprite, frame, direction);
      const cell = sprite.cell;
      const sourceRow = enemySpriteSourceRow(e.species, direction);
      const bounds = enemySpriteCellBounds(e.species, sprite, sheetIndex, sourceRow);
      if (bounds) {
        const drawHeight = size;
        const drawWidth = drawHeight * bounds.width / bounds.height;
        const drawX = ground.x - drawWidth / 2;
        const drawY = ground.y - drawHeight * 0.78;

        if (e.kind !== "normal") {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(ground.x, ground.y - e.r * 0.12, size * 0.42, e.r * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          sprite.image,
          sheetIndex * cell.width + bounds.x,
          sourceRow * cell.height + bounds.y,
          bounds.width,
          bounds.height,
          drawX,
          drawY,
          drawWidth,
          drawHeight,
        );
        spriteDrawn = true;

        if (e.kind !== "normal") {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = e.kind === "boss" ? 3 : 2;
          ctx.shadowColor = color;
          ctx.shadowBlur = e.kind === "boss" ? 14 : 8;
          ctx.beginPath();
          ctx.ellipse(ground.x, ground.y - e.r * 0.12, size * 0.42, e.r * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    if (!spriteDrawn) {
      ctx.fillStyle = e.kind === "boss" ? "#6b3a1a" : e.kind === "champion" ? "#9a6b3a" : "#3a4250";
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y - e.r * 0.12, e.r, e.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = e.kind === "boss" ? 3 : e.kind === "champion" ? 2 : 1;
      ctx.stroke();
    }

    this.drawHpBar(ctx, e, color, size, ground);
  }

  drawHpBar(ctx: CanvasRenderingContext2D, e: Enemy, color: string, spriteSize = e.r * 2, ground = this.projectArenaPoint(e.x, e.y)): void {
    const w = Math.max(e.r * 2 + 4, spriteSize * 0.8);
    const h = e.kind === "boss" ? 5 : 4;
    const pct = Math.max(0, e.hp / e.maxHp);
    const barY = ground.y - spriteSize * 0.78 - 8;
    ctx.fillStyle = "#1a1c22";
    ctx.fillRect(ground.x - w / 2, barY, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(ground.x - w / 2, barY, w * pct, h);
  }

  drawPotionDrop(ctx: CanvasRenderingContext2D, drop: PotionDrop): void {
    const ground = this.projectArenaPoint(drop.x, drop.y);
    const x = ground.x;
    const y = ground.y - 3 + Math.sin(drop.bob * 5) * 2;
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
    const ground = this.projectArenaPoint(c.x, c.y);
    const x = ground.x;
    const y = ground.y - 8 + Math.sin(c.bob * 4) * 4;
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

interface D2SurvivorsSave {
  version: number;
  selectedClass: string;
  run: D2SavedRun | null;
}

interface D2SavedRun {
  hasSavedRun: true;
  selectedClass: string;
  arenaW: number;
  arenaH: number;
  playerX: number;
  playerY: number;
  playerHp: number;
  playerMaxHp: number;
  playerMana: number;
  playerMaxMana: number;
  playerGold: number;
  runTime: number;
  runId: string;
  runKillCount: number;
  playerLevel?: number;
  playerXp?: number;
  pendingLevelUps?: number;
  xpToNextLevel?: number;
  basicAttackName?: string;
  basicAttackCooldown?: number;
  basicAttackDamage?: number;
  ownedSkills: string[];
  skillLevels: Record<string, number>;
  enemies: Enemy[];
  chests: Chest[];
  potionDrops: PotionDrop[];
  beltSlots: Array<{ kind: "health" | "mana" | null }>;
  equippedBelt?: D2InventoryItem | null;
  equipment?: Partial<Record<PaperdollSlot, D2InventoryItem | null>>;
  inventory: Array<D2InventoryItem | null>;
  spawnAcc: number;
  chestTimer: number;
  nextChestInterval: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeInventoryItem(value: unknown): D2InventoryItem | null {
  if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["name"] !== "string" ||
      typeof value["desc"] !== "string" ||
      (value["rarity"] !== "normal" && value["rarity"] !== "magic" && value["rarity"] !== "rare") ||
      (value["slot"] !== "weapon" && value["slot"] !== "armor" && value["slot"] !== "charm" && value["slot"] !== "belt") ||
      (value["slot"] === "belt" && value["beltQuality"] !== "normal" && value["beltQuality"] !== "exceptional" && value["beltQuality"] !== "elite")) {
    return null;
  }

  const stats: D2ItemStats = {};
  if (isRecord(value["stats"])) {
    const statKeys: Array<keyof D2ItemStats> = ["damageMin", "damageMax", "armor", "plusDamage", "plusStrength", "plusVitality", "requiresStrength"];
    for (const key of statKeys) {
      const stat = value["stats"][key];
      if (typeof stat === "number" && Number.isFinite(stat)) {
        stats[key] = Math.max(0, Math.min(1_000_000, stat));
      }
    }
  }
  const affixes = Array.isArray(value["affixes"])
    ? value["affixes"].filter((affix): affix is string => typeof affix === "string").slice(0, 12)
    : undefined;
  const equipmentTypes: EquipmentType[] = ["weapon", "helmet", "body", "shield", "gloves", "boots", "belt", "ring", "amulet", "charm"];
  return {
    id: value["id"].slice(0, 100),
    name: value["name"].slice(0, 160),
    ...(typeof value["baseName"] === "string" ? { baseName: value["baseName"].slice(0, 160) } : {}),
    rarity: value["rarity"],
    slot: value["slot"],
    ...(equipmentTypes.includes(value["equipmentType"] as EquipmentType) ? { equipmentType: value["equipmentType"] as EquipmentType } : {}),
    ...(typeof value["width"] === "number" && Number.isInteger(value["width"]) ? { width: Math.max(1, Math.min(2, value["width"])) } : {}),
    ...(typeof value["height"] === "number" && Number.isInteger(value["height"]) ? { height: Math.max(1, Math.min(4, value["height"])) } : {}),
    ...(value["beltQuality"] === "normal" || value["beltQuality"] === "exceptional" || value["beltQuality"] === "elite"
      ? { beltQuality: value["beltQuality"] }
      : {}),
    desc: value["desc"].slice(0, 500),
    ...(Object.keys(stats).length ? { stats } : {}),
    ...(affixes?.length ? { affixes } : {}),
  };
}

type BeltQuality = "normal" | "exceptional" | "elite";
type EquipmentType = "weapon" | "helmet" | "body" | "shield" | "gloves" | "boots" | "belt" | "ring" | "amulet" | "charm";
type PaperdollSlot = "weapon" | "helmet" | "shield" | "ringLeft" | "amulet" | "ringRight" | "gloves" | "body" | "boots" | "belt";

const PAPERDOLL_SLOTS: PaperdollSlot[] = ["weapon", "helmet", "shield", "ringLeft", "amulet", "ringRight", "gloves", "body", "boots", "belt"];

function createEmptyEquipment(): Record<PaperdollSlot, D2InventoryItem | null> {
  return { weapon: null, helmet: null, shield: null, ringLeft: null, amulet: null, ringRight: null, gloves: null, body: null, boots: null, belt: null };
}

function getEquipmentType(item: D2InventoryItem): EquipmentType {
  if (item.equipmentType) return item.equipmentType;
  const name = `${item.baseName ?? ""} ${item.name}`.toLowerCase();
  if (item.slot === "weapon") return "weapon";
  if (item.slot === "belt") return "belt";
  if (item.slot === "armor") return /cap|helm|crown|mask|circlet/.test(name) ? "helmet" : "body";
  if (/ring/.test(name)) return "ring";
  if (/amulet/.test(name)) return "amulet";
  return "charm";
}

function isCompatibleWithEquipment(item: D2InventoryItem, slot: PaperdollSlot): boolean {
  const type = getEquipmentType(item);
  return type === slot || (type === "ring" && (slot === "ringLeft" || slot === "ringRight"));
}

type EnemyKind = "normal" | "champion" | "boss";
type EnemySpecies = "fallen" | "zombie" | "skeleton" | "demon" | "lord" | "acidbeast" | "goatman" | "succubus" | "knight" | "clawviper" | "darkmage" | "gargoyle";

const ENEMY_SPRITE_PATHS: Record<EnemySpecies, string> = {
  fallen: "assets/d2survivors/monster-fallen.png",
  zombie: "assets/d2survivors/monster-zombie.png",
  skeleton: "assets/d2survivors/monster-skeleton.png",
  demon: "assets/d2survivors/monster-demon.png",
  lord: "assets/d2survivors/monster-lord.png",
  acidbeast: "assets/d2survivors/monster-acidbeast.png",
  goatman: "assets/d2survivors/monster-goatman.png",
  succubus: "assets/d2survivors/monster-succubus.png",
  knight: "assets/d2survivors/monster-knight.png",
  clawviper: "assets/d2survivors/monster-clawviper.png",
  darkmage: "assets/d2survivors/monster-darkmage.png",
  gargoyle: "assets/d2survivors/monster-gargoyle.png",
};

// Converted from the locally supplied DCC/COF files with an intentionally approximate generated
// palette, because no base game palette was supplied. Sheets use 1x COF composition: direction rows,
// animation frames across columns. Their cell bounds are obtained from the transparent gutters.
const ENEMY_SPRITE_LAYOUTS: Record<EnemySpecies, { columns: number; rows: number; animated: boolean }> = {
  fallen: { columns: 11, rows: 8, animated: true },
  zombie: { columns: 24, rows: 8, animated: true },
  skeleton: { columns: 8, rows: 8, animated: true },
  demon: { columns: 14, rows: 8, animated: true },
  lord: { columns: 6, rows: 8, animated: true },
  acidbeast: { columns: 12, rows: 8, animated: true },
  goatman: { columns: 10, rows: 8, animated: true },
  succubus: { columns: 16, rows: 8, animated: true },
  knight: { columns: 16, rows: 8, animated: true },
  clawviper: { columns: 13, rows: 8, animated: true },
  darkmage: { columns: 21, rows: 8, animated: true },
  gargoyle: { columns: 14, rows: 8, animated: true },
};

const ENEMY_SPRITE_CELLS: Partial<Record<EnemySpecies, { width: number; height: number }>> = {
  fallen: { width: 89, height: 63 },
  zombie: { width: 47, height: 80 },
  skeleton: { width: 56, height: 78 },
  demon: { width: 83, height: 95 },
  lord: { width: 118, height: 182 },
  acidbeast: { width: 1, height: 1 },
  goatman: { width: 1, height: 1 },
  succubus: { width: 1, height: 1 },
  knight: { width: 1, height: 1 },
  clawviper: { width: 1, height: 1 },
  darkmage: { width: 1, height: 1 },
  gargoyle: { width: 1, height: 1 },
};

const ENEMY_SPRITE_ROWS: Partial<Record<EnemySpecies, number[]>> = {
  fallen: [0, 1, 2, 3, 4, 5, 6, 7],
  zombie: [0, 1, 2, 3, 4, 5, 6, 7],
  skeleton: [0, 1, 2, 3, 4, 5, 6, 7],
  demon: [0, 1, 2, 3, 4, 5, 6, 7],
  lord: [0, 1, 2, 3, 4, 5, 6, 7],
  acidbeast: [0, 1, 2, 3, 4, 5, 6, 7],
  goatman: [0, 1, 2, 3, 4, 5, 6, 7],
  succubus: [0, 1, 2, 3, 4, 5, 6, 7],
  knight: [0, 1, 2, 3, 4, 5, 6, 7],
  clawviper: [0, 1, 2, 3, 4, 5, 6, 7],
  darkmage: [0, 1, 2, 3, 4, 5, 6, 7],
  gargoyle: [0, 1, 2, 3, 4, 5, 6, 7],
};
const ENEMY_DEMON_SPRITE_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

const ENEMY_SPRITE_DIRECTIONS: Record<EnemySpecies, number> = {
  fallen: 8,
  zombie: 8,
  skeleton: 8,
  demon: 8,
  lord: 8,
  acidbeast: 8,
  goatman: 8,
  succubus: 8,
  knight: 8,
  clawviper: 8,
  darkmage: 8,
  gargoyle: 8,
};
const ENEMY_SPECIES: EnemySpecies[] = ["fallen", "zombie", "skeleton", "demon", "lord", "acidbeast", "goatman", "succubus", "knight", "clawviper", "darkmage", "gargoyle"];
const ENEMY_SPECIES_BY_KIND: Record<EnemyKind, EnemySpecies[]> = {
  normal: ["fallen", "zombie", "skeleton", "demon", "acidbeast", "goatman", "succubus", "knight", "clawviper", "darkmage", "gargoyle"],
  champion: ["demon", "skeleton", "fallen", "succubus", "knight", "clawviper", "darkmage", "gargoyle"],
  boss: ["lord", "demon"],
};

function sanitizeEnemySpecies(value: unknown, kind: EnemyKind): EnemySpecies {
  return ENEMY_SPECIES.includes(value as EnemySpecies) && ENEMY_SPECIES_BY_KIND[kind].includes(value as EnemySpecies)
    ? value as EnemySpecies
    : ENEMY_SPECIES_BY_KIND[kind][0];
}

interface EnemySpriteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EnemySprite {
  image: HTMLCanvasElement;
  columns: number;
  rows: number;
  animated: boolean;
  cell: { width: number; height: number };
  bounds: Map<string, EnemySpriteBounds | null>;
}

function enemySpriteFrame(species: EnemySpecies, x: number, y: number, runTime: number): number {
  const layout = ENEMY_SPRITE_LAYOUTS[species];
  if (!layout.animated) {
    return 0;
  }
  const phase = Math.floor(runTime * 8 + x * 0.09 + y * 0.05);
  return ((phase % layout.columns) + layout.columns) % layout.columns;
}

function enemySpriteRow(species: EnemySpecies, dx: number, dy: number): number {
  const directions = ENEMY_SPRITE_DIRECTIONS[species] ?? ENEMY_SPRITE_LAYOUTS[species].rows;
  if (directions === 4) {
    return dy > 0 ? 0 : dy < 0 ? 2 : dx < 0 ? 1 : 3;
  }
  if (directions === 8) {
    const angle = Math.atan2(dy, dx);
    return (Math.round((angle + Math.PI) / (Math.PI / 4)) + 8) % 8;
  }
  return 0;
}

function enemySpriteSourceRow(species: EnemySpecies, direction: number): number {
  return ENEMY_SPRITE_ROWS[species]?.[direction] ?? direction;
}

function enemySpriteSourceFrame(_species: EnemySpecies, frame: number): number {
  return frame;
}

function enemySpriteSourceDirection(_species: EnemySpecies, direction: number): number {
  return direction;
}

function enemySpriteSheetIndex(species: EnemySpecies, _sprite: EnemySprite, frame: number, _direction: number): number {
  return frame % ENEMY_SPRITE_LAYOUTS[species].columns;
}

function enemySpriteCellBounds(species: EnemySpecies, sprite: EnemySprite, frame: number, row: number): EnemySpriteBounds | null {
  const key = `${frame}:${row}`;
  if (sprite.bounds.has(key)) {
    return sprite.bounds.get(key) ?? null;
  }
  const cell = sprite.cell;
  const context = sprite.image.getContext("2d", { willReadFrequently: true });
  const sourceRow = ENEMY_SPRITE_ROWS[species]?.[row] ?? row;
  const pixels = context?.getImageData(frame * cell.width, sourceRow * cell.height, cell.width, cell.height).data;
  if (!pixels) {
    return null;
  }
  let minX = cell.width;
  let minY = cell.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      if (pixels[(y * cell.width + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const bounds = maxX >= minX && maxY >= minY
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
  sprite.bounds.set(key, bounds);
  return bounds;
}

const BASIC_ATTACK_NAMES = ["Guided Arrow", "Throwing Knife", "Axe Throw", "Spirit Claw", "Bone Bolt", "Holy Bolt", "Fire Bolt"];
const UPGRADE_DESCRIPTIONS: Record<string, string> = {
  "Faster Attacks": "Basic attacks recharge faster.",
  Multishot: "Basic attacks target additional nearby monsters.",
  Vitality: "Increases maximum life.",
  "Arcane Focus": "Increases maximum mana.",
  "Weapon Mastery": "Basic attacks deal additional damage.",
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  return hash >>> 0;
}

interface SkillUpgrade {
  id: string;
  name: string;
  description: string;
  kind: "attack" | "stat";
}

interface AttackProjectile {
  target?: Enemy;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  targetId?: number;
  speed: number;
  damage: number;
  life: number;
  radius: number;
  color: string;
  kind: "arrow" | "fire" | "lightning" | "blade" | "bone" | "holy" | "claw";
}

interface RigAnimationBone {
  bone: THREE.Bone;
  baseQuaternion: THREE.Quaternion;
  side: -1 | 1;
}

interface PreviewPoseBone extends RigAnimationBone {
  phase: number;
  role: "arm" | "leg" | "knee" | "foot" | "pelvis" | "spine";
}

interface PlayerRigBones {
  pelvis?: THREE.Bone;
  pelvisBaseQuaternion?: THREE.Quaternion;
  spine?: THREE.Bone;
  spineBaseQuaternion?: THREE.Quaternion;
  legs?: RigAnimationBone[];
  knees?: RigAnimationBone[];
  feet?: RigAnimationBone[];
  arms?: RigAnimationBone[];
}

interface Enemy {
  kind: EnemyKind;
  species: EnemySpecies;
  spriteFrame: number;
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
  slot: "weapon" | "armor" | "charm" | "belt";
  equipmentType?: EquipmentType;
  width?: number;
  height?: number;
  beltQuality?: BeltQuality;
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

interface InventoryGridCell {
  slotIndex: number;
  item?: D2InventoryItem;
  width: number;
  height: number;
}

interface DragState {
  source: "inventory" | "equipment";
  slotIndex: number;
  equipmentSlot?: PaperdollSlot;
  item: D2InventoryItem;
}
