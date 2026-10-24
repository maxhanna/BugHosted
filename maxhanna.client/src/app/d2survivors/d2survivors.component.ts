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
import { D2_CLASS_SKILL_TREES, D2SkillDefinition, D2SkillVisual, getAvailableClassSkills, getClassSkills, getD2SkillVisual } from "./d2survivors-skill-tree.data";

const MODEL_BASE = "assets/d2survivors/models";
const RUN_SAVE_KEY = "d2survivors.run.v1";
const RUN_SAVE_VERSION = 1;
const RUN_SAVE_INTERVAL_MS = 2500;
const ACT_BOSS_TIME_SECONDS = 45;
const MISSILE_OVERLAY_BASE = "assets/d2survivors/missiles";
const MISSILE_FRAME_DURATIONS_MS: Record<string, number> = {
  "5": 85, "8": 85, "30": 85, "101": 85,
  firebolt: 85, fireball: 85, acidbolt: 85, bloodcomet: 85, lightning: 85,
  "d2-firebolt": 85, "d2-fireball": 85, "d2-acidbolt": 85, "d2-bloodcomet": 85,
  "d2-lightning": 85, "d2-inferno": 85, "d2-magmaball": 85, "d2-icebolt": 85,
  "d2-poisonbolt": 85, "d2-bloodstar": 85, "d2-shadowbolt": 85,
  "d2-holybolt": 85, "d2-bluestar": 85,
  chargedbolt: 85, inferno: 85, magmaball: 85, icebolt: 85, poisonbolt: 85,
  bloodstar: 85, shadowbolt: 85, holybolt: 85, bluestar: 85,
};
const MISSILE_FRAME_COUNTS: Record<string, number> = {
  "5": 64, "8": 10, "30": 96, "101": 61,
  firebolt: 15, fireball: 15, acidbolt: 8, bloodcomet: 15, lightning: 8,
  "d2-firebolt": 15, "d2-fireball": 15, "d2-acidbolt": 8, "d2-bloodcomet": 15,
  "d2-lightning": 8, "d2-inferno": 20, "d2-magmaball": 16, "d2-icebolt": 16,
  "d2-poisonbolt": 16, "d2-bloodstar": 16, "d2-shadowbolt": 16,
  "d2-holybolt": 16, "d2-bluestar": 16,
  chargedbolt: 8, inferno: 10, magmaball: 10, icebolt: 10, poisonbolt: 10,
  bloodstar: 10, shadowbolt: 10, holybolt: 10, bluestar: 10,
};
const SKILL_MISSILE_OVERLAYS: Record<string, string> = {
  // Prefer a recognizable animation for skills with a close supplied match.
  "Guided Arrow": "5", "Magic Arrow": "5", "Multiple Shot": "5", Strafe: "5",
  "Fire Arrow": "d2-firebolt", "Fire Bolt": "d2-firebolt", "Fire Blast": "d2-firebolt",
  "Exploding Arrow": "d2-fireball", "Fire Ball": "d2-fireball", Inferno: "d2-inferno",
  Blaze: "d2-inferno", "Fire Wall": "d2-inferno", "Wake of Fire": "d2-inferno",
  "Wake of Inferno": "d2-inferno", "Ice Arrow": "d2-icebolt", "Cold Arrow": "d2-icebolt",
  "Ice Bolt": "d2-icebolt", "Ice Blast": "d2-icebolt", "Freezing Arrow": "d2-icebolt",
  "Glacial Spike": "d2-icebolt", "Frozen Orb": "d2-icebolt", Blizzard: "d2-icebolt",
  Lightning: "d2-lightning", "Chain Lightning": "d2-lightning", "Thunder Storm": "d2-lightning",
  "Charged Bolt": "d2-bluestar", "Lightning Bolt": "d2-bluestar", "Lightning Fury": "d2-bluestar",
  "Poison Javelin": "d2-acidbolt", "Plague Javelin": "d2-acidbolt", "Poison Nova": "d2-poisonbolt",
  "Bone Spirit": "d2-bloodstar", "Bone Spear": "d2-bloodstar", Teeth: "d2-shadowbolt",
  "Psychic Hammer": "d2-shadowbolt", "Holy Bolt": "d2-holybolt", "Fist of the Heavens": "d2-holybolt",
  "Fire Mastery": "d2-fireball", Warmth: "d2-firebolt", Enchant: "d2-fireball",
  "Cold Mastery": "d2-icebolt", "Lightning Mastery": "d2-lightning", "Energy Shield": "d2-bluestar",
  "Static Field": "d2-bluestar", "Charged Strike": "d2-bluestar", Teleport: "d2-bluestar",
  "Blessed Hammer": "d2-holybolt", "Holy Shield": "d2-holybolt", Conversion: "d2-holybolt",
  "Frost Nova": "d2-icebolt", "Frozen Armor": "d2-icebolt", "Shiver Armor": "d2-icebolt",
  "Chilling Armor": "d2-icebolt", "Cloak of Shadows": "d2-shadowbolt", "Mind Blast": "d2-shadowbolt",
  "Amplify Damage": "d2-shadowbolt", "Dim Vision": "d2-shadowbolt", Weaken: "d2-shadowbolt",
  "Iron Maiden": "d2-shadowbolt", Terror: "d2-shadowbolt", Confuse: "d2-shadowbolt",
  "Life Tap": "d2-bloodstar", Attract: "d2-shadowbolt", Decrepify: "d2-shadowbolt",
  "Poison Dagger": "d2-poisonbolt", "Poison Explosion": "d2-poisonbolt", "Corpse Explosion": "d2-bloodcomet",
  "Bone Armor": "d2-bloodstar", "Bone Wall": "d2-bloodstar", "Bone Prison": "d2-bloodstar",
  "Raise Skeleton": "d2-bloodstar", "Skeletal Mage": "d2-bloodstar", "Clay Golem": "d2-bloodcomet",
  "Charged Bolt Sentry": "d2-bluestar", "Shock Web": "d2-bluestar", "Blade Sentinel": "101",
  "Death Sentry": "d2-bluestar", "Lightning Sentry": "d2-lightning",
  "Blade Fury": "101", "Blade Shield": "101", "Phoenix Strike": "d2-bloodcomet",
  "Claws of Thunder": "d2-bluestar", "Blades of Ice": "d2-icebolt", "Fists of Fire": "d2-fireball",
  "Dragon Tail": "d2-fireball",
  Bash: "30", "Double Swing": "30", "Double Throw": "30", "Leap Attack": "30", Concentrate: "30",
  Frenzy: "30", Berserk: "d2-bloodstar", Sacrifice: "30", Smite: "d2-holybolt", Zeal: "30",
  Charge: "d2-holybolt", Vengeance: "d2-bloodcomet", Fissure: "d2-magmaball", Hydra: "d2-fireball",
  Nova: "d2-bluestar", "Arctic Blast": "d2-icebolt", Twister: "d2-bloodcomet", "Werewolf": "d2-bloodstar",
  "Werebear": "d2-bloodcomet", Maul: "30", "Feral Rage": "d2-bloodstar", Rabies: "d2-poisonbolt",
  "Shock Wave": "d2-bloodcomet", Fury: "101", Raven: "5", "Summon Spirit Wolf": "d2-bloodcomet",
  "Summon Dire Wolf": "d2-bloodcomet", "Summon Grizzly": "d2-bloodcomet", Valkyrie: "d2-holybolt",
  Decoy: "d2-shadowbolt", "Shadow Warrior": "d2-shadowbolt", "Shadow Master": "d2-shadowbolt",
  "Blood Golem": "d2-bloodcomet", "Iron Golem": "d2-bloodcomet", "Fire Golem": "d2-fireball",
  "Poison Creeper": "d2-poisonbolt", "Carrion Vine": "d2-poisonbolt", "Solar Creeper": "d2-poisonbolt",
  "Firestorm": "d2-magmaball", "Molten Boulder": "d2-magmaball", Volcano: "d2-magmaball",
  Meteor: "d2-bloodcomet", Armageddon: "d2-bloodcomet", Tornado: "d2-bloodcomet",
  Hurricane: "d2-icebolt", Whirlwind: "101",
  Jab: "30", Fend: "30",
  // Keep every class-tree skill tied to a real, animated D2 missile asset;
  // passives and buffs use their matching elemental/curse/holy effect as feedback.
  "Avoid": "d2-bluestar", "Axe Mastery": "30", "Battle Command": "d2-bloodcomet", "Battle Cry": "d2-bloodcomet",
  "Battle Orders": "d2-holybolt", "Blessed Aim": "d2-holybolt", "Burst of Speed": "d2-bluestar", "Claw Mastery": "101",
  "Cleansing": "d2-holybolt", "Cobra Strike": "d2-bloodstar", "Conviction": "d2-shadowbolt",
  "Critical Strike": "d2-bloodstar", "Cyclone Armor": "d2-icebolt", "Defiance": "d2-holybolt", "Dodge": "d2-bluestar",
  "Dragon Flight": "d2-bluestar", "Dragon Talon": "101", "Evade": "d2-bluestar", "Fade": "d2-shadowbolt",
  "Fanaticism": "d2-holybolt", "Find Item": "d2-bloodcomet", "Find Potion": "d2-bloodcomet", "Fire Claws": "d2-fireball",
  "Golem Mastery": "d2-bloodcomet", "Grim Ward": "d2-shadowbolt", "Heart of Wolverine": "d2-bloodcomet", "Howl": "d2-shadowbolt",
  "Hunger": "d2-bloodstar", "Immolation Arrow": "d2-inferno", "Impale": "30", "Increased Speed": "d2-bluestar",
  "Increased Stamina": "d2-bluestar", "Inner Sight": "d2-shadowbolt", "Iron Skin": "d2-holybolt", "Leap": "d2-bluestar",
  "Lightning Strike": "d2-bluestar", "Lower Resist": "d2-shadowbolt", "Lycanthropy": "d2-bloodstar", "Mace Mastery": "30",
  "Meditation": "d2-holybolt", "Might": "d2-holybolt", "Natural Resistance": "d2-holybolt", "Oak Sage": "d2-bloodcomet",
  "Penetrate": "d2-bluestar", "Pierce": "d2-bluestar", "Polearm Mastery": "30", "Prayer": "d2-holybolt",
  "Power Strike": "d2-bluestar", "Redemption": "d2-holybolt", "Resist Cold": "d2-icebolt", "Resist Fire": "d2-firebolt",
  "Resist Lightning": "d2-bluestar", "Revive": "d2-bloodcomet", "Salvation": "d2-holybolt", "Sanctuary": "d2-holybolt",
  "Shout": "d2-bloodcomet", "Skeleton Mastery": "d2-bloodstar", "Slow Missiles": "d2-shadowbolt", "Spear Mastery": "30",
  "Spirit of Barbs": "d2-bloodcomet", "Stun": "30", "Summon Resist": "d2-holybolt", "Sword Mastery": "30",
  "Taunt": "d2-shadowbolt", "Telekinesis": "d2-bluestar", "Thorns": "d2-holybolt", "Throwing Mastery": "30",
  "Tiger Strike": "101", "Venom": "d2-poisonbolt", "Vigor": "d2-bluestar", "War Cry": "d2-bloodcomet",
  "Weapon Block": "101", "Dragon Claw": "101", "Holy Fire": "d2-firebolt", "Holy Freeze": "d2-icebolt",
  "Holy Shock": "d2-bluestar", "Concentration": "d2-holybolt",
};
const SKILL_VISUAL_MISSILES: Record<D2SkillVisual, string> = {
  summon: "d2-bloodcomet",
  aura: "d2-holybolt",
  trap: "d2-bluestar",
  wave: "d2-shadowbolt",
  burst: "d2-bloodcomet",
  movement: "d2-bluestar",
  projectile: "d2-firebolt",
  strike: "101",
};
const BASIC_ATTACK_MISSILE_OVERLAYS: Record<string, string> = {
  "Guided Arrow": "5", "Throwing Knife": "30", "Axe Throw": "30", "Spirit Claw": "101",
  "Bone Bolt": "8", "Holy Bolt": "d2-holybolt", "Fire Bolt": "d2-firebolt",
};
const ATTACK_KIND_MISSILE_OVERLAYS: Record<AttackProjectile["kind"], string> = {
  arrow: "5",
  fire: "d2-fireball",
  lightning: "d2-bluestar",
  blade: "101",
  bone: "d2-bloodstar",
  holy: "d2-holybolt",
  claw: "101",
  melee: "30",
};
interface CampaignAct {
  act: number;
  name: string;
  region: string;
  levelLabel: string;
  map: string;
  mapAlpha: boolean;
  floorTiles: string;
  baseFloorVariant: number;
  enemies: EnemySpecies[];
  boss: EnemySpecies;
}

const CAMPAIGN_ACTS: CampaignAct[] = [
  { act: 1, name: "The Monastery Gate", region: "Rogue Encampment", levelLabel: "Blood Moor", map: "assets/d2survivors/maps/act1-barracks.png", mapAlpha: true, floorTiles: "assets/d2survivors/maps/tiles/act1-floor-tiles.png", baseFloorVariant: 1, enemies: ["fallen", "goatman", "skeleton"], boss: "andariel" },
  { act: 2, name: "The Buried Caves", region: "Lut Gholein", levelLabel: "Rocky Waste", map: "assets/d2survivors/maps/act2-caves.png", mapAlpha: true, floorTiles: "assets/d2survivors/maps/tiles/act2-floor-tiles.png", baseFloorVariant: 0, enemies: ["sandRaider", "sandMaggot", "scarab"], boss: "duriel" },
  { act: 3, name: "The Flayer Jungle", region: "Kurast Docks", levelLabel: "Spider Forest", map: "assets/d2survivors/maps/act3-jungle.png", mapAlpha: true, floorTiles: "assets/d2survivors/maps/tiles/act3-floor-tiles.png", baseFloorVariant: 5, enemies: ["fetish", "fetishShaman", "council"], boss: "council" },
  { act: 4, name: "The Chaos Sanctuary", region: "Pandemonium Fortress", levelLabel: "Outer Steppes", map: "assets/d2survivors/maps/act4-catacombs.png", mapAlpha: true, floorTiles: "assets/d2survivors/maps/tiles/act4-floor-tiles.png", baseFloorVariant: 1, enemies: ["balrog", "vileChild", "vileMother"], boss: "diablo" },
  { act: 5, name: "The Worldstone Keep", region: "Harrogath", levelLabel: "Bloody Foothills", map: "assets/d2survivors/maps/act5-worldstone.png", mapAlpha: true, floorTiles: "assets/d2survivors/maps/tiles/act5-floor-tiles.png", baseFloorVariant: 5, enemies: ["bloodLord", "minotaur", "deathMauler", "wendigo"], boss: "baalsMinion" },
];

const ENEMY_SPRITE_PATHS: Record<EnemySpecies, string> = {
  fallen: "assets/d2survivors/enemies/animated/fallen.png",
  goatman: "assets/d2survivors/enemies/animated/goatman.png",
  skeleton: "assets/d2survivors/enemies/animated/skeleton.png",
  sandRaider: "assets/d2survivors/enemies/sand-raider.png",
  sandMaggot: "assets/d2survivors/enemies/sand-maggot.png",
  scarab: "assets/d2survivors/enemies/animated/scarab.png",
  fetish: "assets/d2survivors/enemies/fetish-knife.png",
  fetishShaman: "assets/d2survivors/enemies/fetish-shaman.png",
  council: "assets/d2survivors/enemies/council-member.png",
  balrog: "assets/d2survivors/enemies/balrog-sword.png",
  vileChild: "assets/d2survivors/enemies/vile-child.png",
  vileMother: "assets/d2survivors/enemies/vile-mother.png",
  bloodLord: "assets/d2survivors/enemies/blood-lord.png",
  minotaur: "assets/d2survivors/enemies/animated/minotaur.png",
  deathMauler: "assets/d2survivors/enemies/animated/death-mauler.png",
  wendigo: "assets/d2survivors/enemies/animated/wendigo.png",
  andariel: "assets/d2survivors/enemies/animated/andariel.png",
  duriel: "assets/d2survivors/enemies/animated/duriel.png",
  diablo: "assets/d2survivors/enemies/animated/diablo.png",
  baalsMinion: "assets/d2survivors/enemies/animated/baals-minion.png",
};

const ENEMY_SPRITE_LAYOUTS: Record<EnemySpecies, { columns: number; rows: number; animated: boolean }> = {
  fallen: { columns: 13, rows: 1, animated: true }, goatman: { columns: 14, rows: 1, animated: true },
  skeleton: { columns: 16, rows: 1, animated: true }, sandRaider: { columns: 1, rows: 1, animated: false },
  sandMaggot: { columns: 1, rows: 1, animated: false }, scarab: { columns: 12, rows: 8, animated: true },
  fetish: { columns: 1, rows: 1, animated: false }, fetishShaman: { columns: 1, rows: 1, animated: false },
  council: { columns: 1, rows: 1, animated: false }, balrog: { columns: 1, rows: 1, animated: false },
  vileChild: { columns: 1, rows: 1, animated: false }, vileMother: { columns: 1, rows: 1, animated: false },
  bloodLord: { columns: 1, rows: 1, animated: false }, minotaur: { columns: 7, rows: 8, animated: true },
  deathMauler: { columns: 16, rows: 8, animated: true }, wendigo: { columns: 23, rows: 8, animated: true },
  andariel: { columns: 12, rows: 8, animated: true }, duriel: { columns: 6, rows: 8, animated: true },
  diablo: { columns: 14, rows: 8, animated: true }, baalsMinion: { columns: 13, rows: 8, animated: true },
};

const ENEMY_SPRITE_CELLS: Record<EnemySpecies, { width: number; height: number }> = {
  fallen: { width: 91, height: 75 }, goatman: { width: 84, height: 97 }, skeleton: { width: 70, height: 86 },
  sandRaider: { width: 114, height: 180 }, sandMaggot: { width: 172, height: 180 }, scarab: { width: 101, height: 100 },
  fetish: { width: 181, height: 180 }, fetishShaman: { width: 151, height: 180 }, council: { width: 214, height: 180 },
  balrog: { width: 290, height: 180 }, vileChild: { width: 195, height: 180 }, vileMother: { width: 273, height: 180 },
  bloodLord: { width: 444, height: 180 }, minotaur: { width: 110, height: 100 }, deathMauler: { width: 84, height: 100 },
  wendigo: { width: 84, height: 100 }, andariel: { width: 240, height: 260 }, duriel: { width: 118, height: 182 },
  diablo: { width: 83, height: 95 }, baalsMinion: { width: 115, height: 100 },
};


const ENEMY_SPECIES: EnemySpecies[] = Object.keys(ENEMY_SPRITE_PATHS) as EnemySpecies[];
const ENEMY_SPECIES_BY_KIND: Record<EnemyKind, EnemySpecies[]> = {
  normal: ["fallen", "goatman", "skeleton", "sandRaider", "sandMaggot", "scarab", "fetish", "fetishShaman", "council", "balrog", "vileChild", "vileMother", "bloodLord", "minotaur", "deathMauler", "wendigo"],
  champion: ["goatman", "skeleton", "scarab", "fetishShaman", "council", "balrog", "vileMother", "bloodLord", "minotaur", "deathMauler", "wendigo"],
  boss: ["andariel", "duriel", "council", "diablo", "baalsMinion"],
};

function sanitizeEnemySpecies(value: unknown, kind: EnemyKind): EnemySpecies {
  return ENEMY_SPECIES.includes(value as EnemySpecies)
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
  skillTreeOpen = false;
  private readonly d2SurvivorsService = inject(D2SurvivorsService);
  @Input() inputtedParentRef?: AppComponent;
  override parentRef?: AppComponent;
  @ViewChild("lobbyChatLog") private lobbyChatLogRef?: ElementRef<HTMLDivElement>;
  @ViewChild("arena") arenaRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("characterCanvas") characterCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("skillEffectsCanvas") private skillEffectsCanvasRef?: ElementRef<HTMLCanvasElement>;

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
  private attackAnimationTime = Number.POSITIVE_INFINITY;
  private attackAnimationSide: -1 | 1 = -1;
  private attackAnimationStyle: AttackAnimationStyle = "amazonJab";
  private attackAnimationFacing = new THREE.Vector2(1, 0);
  private attackAnimationTurn = 0;
  private playerWeaponMeshes: THREE.Object3D[] = [];
  private playerWeaponBaseQuaternions: THREE.Quaternion[] = [];
  private playerWeaponOriginalVisibility = new Map<THREE.Object3D, boolean>();
  private readonly meleeTrailEffects: MeleeTrailEffect[] = [];
  private readonly summonAttackEffects: SummonAttackEffect[] = [];
  private readonly skillVisualEffects: SkillVisualEffect[] = [];
  private loadedModelClass = "";
  private readonly enemySprites: Partial<Record<EnemySpecies, EnemySprite>> = {};
  private readonly animatedSkeletonSprite = new Image();
  private readonly animatedGolemSprite = new Image();
  private animatedSkeletonFrames: HTMLCanvasElement[] = [];
  private animatedGolemFrames: HTMLCanvasElement[] = [];
  private readonly missileOverlayImages = new Map<string, HTMLImageElement[]>();
  private readonly campaignMapImages: Partial<Record<number, HTMLImageElement>> = {};
  private readonly campaignFloorTileImages: Partial<Record<number, HTMLImageElement>> = {};
  private readonly campaignFloorTileOverlayCanvases: Partial<Record<number, HTMLCanvasElement>> = {};
  private readonly campaignBackgroundCanvases: Partial<Record<number, HTMLCanvasElement>> = {};
  private campaignTileBitmaps: Partial<Record<number, HTMLCanvasElement[]>> = {};
  private campaignGeneratedChunks = new Map<string, HTMLCanvasElement>();
  private currentChunkCoordX = 0;
  private currentChunkCoordY = 0;
  private currentChunkLocalX = 0;
  private currentChunkLocalY = 0;
  private readonly worldZoom = 2.1;
  private readonly floorTileScale = 23.5;
  private readonly playerWorldScale = 1.8;
  private readonly chunkTileColumns = 12;
  private readonly chunkTileRows = 8;
  currentAct = 1;
  actTime = 0;
  actTransitionReady = false;
  campaignVictory = false;
  actBossSpawned = false;
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
  private menuHeroPoseBases = new Map<THREE.Bone, THREE.Quaternion>();
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
  private previewAttackTime = Number.POSITIVE_INFINITY;
  private previewAttackSide: -1 | 1 = -1;
  private previewAttackStyle: AttackAnimationStyle = "amazonJab";
  private previewAttackPending = false;
  private previewModelClass?: string;
  private previewLoadingClass?: string;
  private previewWeapons: Array<{ object: THREE.Object3D; baseQuaternion: THREE.Quaternion }> = [];
  private previewAmazonPike?: THREE.Object3D;
  private previewAmazonPikeBase?: THREE.Quaternion;
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
    { name: "Faster Cast Rate", desc: "owned spells cast automatically and their individual cooldowns recover faster" },
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
  menuPanel: "main" | "lobby" | "characters" | "credits" | "shop" = "main";
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
  readonly skillCastCooldowns: Record<string, number> = {};
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
  sanctuaryGold = 0;
  sanctuaryBonuses = { maxLife: 0, attackDamage: 0 };
  sanctuaryStash: D2InventoryItem[] = [];
  private characterProfiles: Record<string, D2CharacterProfile> = {};
  shopMessage = "";
  readonly gheedsShopItems: Array<{ name: string; cost: number; desc: string; item: D2InventoryItem }> = [
    { name: "Stalwart Cap", cost: 180, desc: "A sturdy helm that adds armor.", item: { id: "gheeds-stalwart-cap", name: "Stalwart Leather Cap", baseName: "Leather Cap", rarity: "magic", slot: "armor", equipmentType: "helmet", desc: "Gheed's trustworthy cap, reinforced with old leather.", stats: { armor: 20, requiresStrength: 10 }, affixes: ["+20 Defense"] } },
    { name: "War Pike", cost: 260, desc: "A heavy reach weapon with a powerful opening strike.", item: { id: "gheeds-war-pike", name: "Savage War Pike", baseName: "War Pike", rarity: "magic", slot: "weapon", desc: "A long, heavy spear with excellent reach.", stats: { damageMin: 14, damageMax: 24, plusDamage: 5 }, affixes: ["14–24 Damage", "+5 Maximum Damage"] } },
    { name: "Demonhide Sash", cost: 220, desc: "An exceptional belt with three potion rows.", item: { id: "gheeds-demonhide-sash", name: "Demonhide Sash", rarity: "normal", slot: "belt", beltQuality: "exceptional", desc: "An exceptional belt with room for three rows of potions.", stats: { armor: 8 } } },
    { name: "Soulstone Ring", cost: 320, desc: "An equippable ring with a powerful damage bonus.", item: { id: "gheeds-soulstone-ring", name: "Soulstone Ring", rarity: "rare", slot: "charm", equipmentType: "ring", desc: "A dangerous fragment set in iron, humming with trapped power.", stats: { plusDamage: 8 }, affixes: ["+8 Maximum Damage"] } },
  ];
  ownedSkills: string[] = [];
  skillLevels: Record<string, number> = {};
  private skillOfferSeed = 1;
  selectedClass = "amazon";
  hasSavedRun = false;
  saveStatus = "";
  private lastRunSaveAt = 0;
  private deathRecovery = false;
  private deathCount = 0;
  private readonly classStartingStats: Record<string, { title: string; specialty: string; life: number; mana: number; stamina: number; attributes: [number, number, number, number] }> = {
    amazon: { title: "Spear & Bow Mastery", specialty: "Balanced · Ranged Combat", life: 24, mana: 15, stamina: 84, attributes: [20, 25, 20, 15] },
    assassin: { title: "Shadow Discipline", specialty: "Agile · Traps & Martial Arts", life: 20, mana: 25, stamina: 95, attributes: [20, 20, 20, 25] },
    barbarian: { title: "Master of Arms", specialty: "Melee · Strength & Endurance", life: 30, mana: 10, stamina: 92, attributes: [30, 20, 25, 10] },
    druid: { title: "Keeper of the Wild", specialty: "Nature · Elemental & Summoning", life: 25, mana: 20, stamina: 90, attributes: [25, 20, 25, 20] },
    necromancer: { title: "Lord of the Dead", specialty: "Dark Arts · Bone & Summoning", life: 15, mana: 25, stamina: 80, attributes: [15, 25, 15, 25] },
    paladin: { title: "Holy Warrior", specialty: "Melee · Auras & Defense", life: 25, mana: 15, stamina: 90, attributes: [25, 15, 25, 15] },
    sorceress: { title: "Elemental Adept", specialty: "Spellcaster · Fire, Cold & Lightning", life: 10, mana: 35, stamina: 74, attributes: [10, 25, 10, 35] },
  };

  get currentActDetails(): CampaignAct {
    return CAMPAIGN_ACTS[this.currentAct - 1] ?? CAMPAIGN_ACTS[0];
  }

  get actProgress(): number {
    return this.actBossSpawned ? 100 : Math.min(100, this.actTime / ACT_BOSS_TIME_SECONDS * 100);
  }

  get actSecondsRemaining(): number {
    return Math.max(0, ACT_BOSS_TIME_SECONDS - this.actTime);
  }

  private loadCampaignMaps(): void {
    for (const act of CAMPAIGN_ACTS) {
      const mapImage = new Image();
      const tileImage = new Image();
      const redrawWhenReady = (): void => {
        if (!this.campaignMapImages[act.act] || !this.campaignFloorTileImages[act.act]) return;
        this.renderCampaignBackground(act);
        if (this.activeTab === "run" && this.currentAct === act.act) {
          this.draw();
          this.renderCharacter();
          this.drawSkillVisualEffects();
        }
      };
      mapImage.onload = () => {
        this.campaignMapImages[act.act] = mapImage;
        redrawWhenReady();
      };
      mapImage.onerror = () => console.warn(`Could not load Act ${act.act} map art: ${act.map}`);
      tileImage.onload = () => {
        this.campaignFloorTileImages[act.act] = tileImage;
        this.campaignFloorTileOverlayCanvases[act.act] = this.createKeyedFloorTileOverlay(tileImage);
        this.campaignTileBitmaps[act.act] = this.extractCampaignTileBitmaps(act, tileImage);
        this.campaignGeneratedChunks.clear();
        redrawWhenReady();
      };
      tileImage.onerror = () => console.warn(`Could not load Act ${act.act} floor tiles: ${act.floorTiles}`);
      mapImage.src = act.map;
      tileImage.src = act.floorTiles;
    }
  }

  private createKeyedFloorTileOverlay(source: HTMLImageElement): HTMLCanvasElement {
    const overlay = document.createElement("canvas");
    overlay.width = source.naturalWidth;
    overlay.height = source.naturalHeight;
    const context = overlay.getContext("2d", { willReadFrequently: true });
    if (!context) return overlay;
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, overlay.width, overlay.height);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const isBlackKey = red === 0 && green === 0 && blue === 0;
      const isLightBlueKey = (red === 0 && green === 255 && blue === 255)
        || (red === 173 && green === 216 && blue === 230);
      const isPinkKey = red === 255 && green === 0 && blue === 255;
      if (isBlackKey || isLightBlueKey || isPinkKey) pixels[index + 3] = 0;
    }
    context.putImageData(image, 0, 0);
    return overlay;
  }

  private renderCampaignBackground(act: CampaignAct): void {
    const map = this.campaignMapImages[act.act];
    const floorTiles = this.campaignFloorTileImages[act.act];
    const arenaCanvas = this.arenaRef?.nativeElement;
    if (!map || !floorTiles || !arenaCanvas) return;

    const background = document.createElement("canvas");
    background.width = arenaCanvas.width;
    background.height = arenaCanvas.height;
    const ctx = background.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, background.width, background.height);

    // Generated world chunks are kept procedural and loaded on demand by draw().
    // Keep this legacy-sized backing canvas ready only as a safe interim fallback.
    ctx.imageSmoothingEnabled = false;
    const tiles = this.campaignTileBitmaps[act.act] ?? this.extractCampaignTileBitmaps(act, floorTiles);
    this.campaignTileBitmaps[act.act] = tiles;
    const baseTile = tiles[Math.max(0, Math.min(15, act.baseFloorVariant))];
    if (baseTile) {
      for (let y = 0; y < background.height; y += 48) {
        for (let x = 0; x < background.width; x += 48) ctx.drawImage(baseTile, x, y, 68, 34);
      }
    }
    const mapScale = Math.min(background.width / map.naturalWidth, background.height / map.naturalHeight);
    const mapWidth = map.naturalWidth * mapScale;
    const mapHeight = map.naturalHeight * mapScale;
    if (act.mapAlpha) ctx.drawImage(map, (background.width - mapWidth) / 2, (background.height - mapHeight) / 2, mapWidth, mapHeight);
    else ctx.drawImage(map, 0, 0, background.width, background.height);
    this.campaignBackgroundCanvases[act.act] = background;
  }

  private extractCampaignTileBitmaps(act: CampaignAct, floorTiles: HTMLImageElement): HTMLCanvasElement[] {
    const atlasColumns = 4;
    const tileWidth = Math.floor(floorTiles.naturalWidth / atlasColumns);
    const tileHeight = Math.floor(floorTiles.naturalHeight / atlasColumns);
    const sheet = document.createElement("canvas");
    sheet.width = floorTiles.naturalWidth;
    sheet.height = floorTiles.naturalHeight;
    const context = sheet.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(floorTiles, 0, 0);
    const baseIndex = Math.max(0, Math.min(15, act.baseFloorVariant));
    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = tileWidth;
    baseCanvas.height = tileHeight;
    const baseContext = baseCanvas.getContext("2d", { willReadFrequently: true });
    if (!baseContext) return [];
    baseContext.drawImage(sheet, (baseIndex % atlasColumns) * tileWidth, Math.floor(baseIndex / atlasColumns) * tileHeight, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
    const basePixels = baseContext.getImageData(0, 0, tileWidth, tileHeight).data;
    const centerOffset = (Math.floor(tileHeight / 2) * tileWidth + Math.floor(tileWidth / 2)) * 4;
    const groundColor = [basePixels[centerOffset], basePixels[centerOffset + 1], basePixels[centerOffset + 2]];
    const result: HTMLCanvasElement[] = [];
    for (let index = 0; index < atlasColumns * atlasColumns; index += 1) {
      const tile = document.createElement("canvas");
      tile.width = tileWidth;
      tile.height = tileHeight;
      const tileContext = tile.getContext("2d", { willReadFrequently: true });
      if (!tileContext) continue;
      tileContext.drawImage(sheet, (index % atlasColumns) * tileWidth,
        Math.floor(index / atlasColumns) * tileHeight, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
      const pixels = tileContext.getImageData(0, 0, tileWidth, tileHeight);
      const overlayPixels = pixels.data;
      for (let offset = 0; offset < overlayPixels.length; offset += 4) {
        const red = overlayPixels[offset], green = overlayPixels[offset + 1], blue = overlayPixels[offset + 2];
        if ((red <= 8 && green <= 8 && blue <= 8) || (red === 0 && green === 255 && blue === 255)
            || (red === 173 && green === 216 && blue === 230) || (red === 255 && green === 0 && blue === 255)) {
          overlayPixels[offset] = groundColor[0];
          overlayPixels[offset + 1] = groundColor[1];
          overlayPixels[offset + 2] = groundColor[2];
          overlayPixels[offset + 3] = 0;
        }
      }
      tileContext.putImageData(pixels, 0, 0);
      result.push(tile);
    }
    return result;
  }

  private getCampaignChunkCanvas(act: CampaignAct, chunkX: number, chunkY: number): HTMLCanvasElement {
    const key = `${act.act}:${chunkX}:${chunkY}`;
    const cached = this.campaignGeneratedChunks.get(key);
    if (cached) return cached;
    const tileWorldSize = 48;
    const tileWidth = tileWorldSize * Math.SQRT2;
    const tileHeight = tileWorldSize / Math.SQRT2;
    const width = this.chunkTileColumns * tileWorldSize;
    const height = this.chunkTileRows * tileWorldSize;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * Math.SQRT2);
    canvas.height = Math.ceil((width + height) / Math.SQRT2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tiles = this.campaignTileBitmaps[act.act] ?? [];
    const minColumn = -this.chunkTileRows - 2;
    const maxColumn = this.chunkTileColumns + this.chunkTileRows + 2;
    const minRow = -2;
    const maxRow = this.chunkTileRows + 2;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const worldTileX = chunkX * this.chunkTileColumns + column;
        const worldTileY = chunkY * this.chunkTileRows + row;
        const localX = column * tileWorldSize + this.chunkTileRows * tileWorldSize;
        const localY = row * tileWorldSize;
        const screenX = (localX - localY) * 0.7071 + canvas.width / 2;
        const screenY = (localX + localY) * 0.35355 + tileHeight;
        if (screenX + tileWidth < 0 || screenX - tileWidth > canvas.width ||
            screenY + tileHeight < 0 || screenY - tileHeight > canvas.height) continue;
        const variant = this.connectedTileVariant(act.act, worldTileX, worldTileY, tiles.length);
        const image = tiles[variant] ?? tiles[Math.max(0, Math.min(15, act.baseFloorVariant))];
        if (image) ctx.drawImage(image, screenX - tileWidth / 2, screenY - tileHeight / 2, tileWidth, tileHeight);
      }
    }
    this.campaignGeneratedChunks.set(key, canvas);
    if (this.campaignGeneratedChunks.size > 36) {
      const oldest = this.campaignGeneratedChunks.keys().next().value;
      if (oldest) this.campaignGeneratedChunks.delete(oldest);
    }
    return canvas;
  }

  private getTileCenterColor(tile: HTMLCanvasElement | undefined): string {
    if (!tile) return "#383028";
    const context = tile.getContext("2d", { willReadFrequently: true });
    if (!context) return "#383028";
    const pixel = context.getImageData(Math.floor(tile.width / 2), Math.floor(tile.height / 2), 1, 1).data;
    return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  }

  private connectedTileVariant(actId: number, worldTileX: number, worldTileY: number, tileCount: number): number {
    if (tileCount <= 1) return 0;
    const hash = (x: number, y: number, salt: number): number => {
      let value = Math.imul(x ^ (actId * 0x45d9f3b), 0x27d4eb2d) ^ Math.imul(y ^ salt, 0x165667b1);
      value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
      value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
      return (value ^ (value >>> 16)) >>> 0;
    };
    const base = actId === 1 ? 1 : actId === 2 ? 0 : actId === 3 ? 5 : actId === 4 ? 1 : 5;
    const transition = hash(Math.floor(worldTileX / 4), Math.floor(worldTileY / 4), 101) % 5;
    const candidates = [base, (base + 1) % 16, (base + 5) % 16, (base + 3) % 16, (base + 4) % 16];
    const choose = hash(worldTileX, worldTileY, 211) % candidates.length;
    return candidates[(choose + transition) % candidates.length] ?? base;
  }

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
    return `${className} · ${Math.floor(this.runTime)} seconds survived${this.deathRecovery ? " · revived by the Necromancer" : ""}`;
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
      const preferredClass = this.selectedClass;
      const savedRun = isRecord(save.run) ? save.run : null;
      const savedBonuses = isRecord(save.sanctuaryBonuses) ? save.sanctuaryBonuses : {};
      const boundedInteger = (value: unknown, fallback: number, max: number): number =>
        typeof value === "number" && Number.isFinite(value) ? Math.floor(Math.max(0, Math.min(max, value))) : fallback;
        const legacyGold = boundedInteger(save.sanctuaryGold, boundedInteger(savedRun?.["playerGold"], 0, 1_000_000_000), 1_000_000_000);
      this.sanctuaryGold = legacyGold;
      this.characterProfiles = {};
      if (isRecord(save.characterProfiles)) {
        for (const [classId, profile] of Object.entries(save.characterProfiles)) {
          if (CLASS_MODEL[classId]) {
            const sanitized = sanitizeCharacterProfile(profile);
            if (sanitized) this.characterProfiles[classId] = sanitized;
          }
        }
      }
      this.sanctuaryBonuses = {
        maxLife: boundedInteger(savedBonuses["maxLife"], 0, 20),
        attackDamage: boundedInteger(savedBonuses["attackDamage"], 0, 20),
      };
      this.sanctuaryStash = Array.isArray(save.sanctuaryStash)
        ? save.sanctuaryStash.slice(0, 200).map((item) => sanitizeInventoryItem(item)).filter((item): item is D2InventoryItem => !!item)
        : [];
      if (savedRun && typeof save.run === "object" && !Array.isArray(save.run)) {
        const legacyRun = save.run as Partial<D2SavedRun>;
        this.restoreRunState(legacyRun);
        const runClass = this.selectedClass;
        if (this.characterProfiles[runClass]) this.loadCharacterProfile(runClass);
        else this.saveCharacterProfile(runClass);
        this.selectedClass = preferredClass;
        this.hasSavedRun = true;
        if (preferredClass !== runClass) {
          this.loadCharacterProfile(preferredClass, 0);
          this.runActive = false;
        }
      } else {
        this.hasSavedRun = false;
        this.runActive = false;
        const hasProfile = this.loadCharacterProfile(preferredClass, legacyGold);
        this.playerGold = this.sanctuaryGold;
        if (!hasProfile && this.sanctuaryStash.length) {
          const remainingStash: D2InventoryItem[] = [];
          for (const item of this.sanctuaryStash) {
            if (!this.addInventoryItem({ ...item, stats: item.stats ? { ...item.stats } : undefined })) remainingStash.push(item);
          }
          this.sanctuaryStash = remainingStash;
          this.saveCharacterProfile(preferredClass);
        }
      }
      this.persistRunProgress(true);
    } catch (error) {
      console.warn("Could not restore saved D2 Survivors progress", error);
    }
  }

  private getSavedRunWithCharacterProfile(): D2SavedRun | null {
    const saved = this.savedRun;
    if (!saved || saved.selectedClass !== this.selectedClass) return saved;
    const profile = this.characterProfiles[this.selectedClass];
    return profile ? {
      ...saved,
      playerGold: profile.gold,
      inventory: profile.inventory,
      equipment: profile.equipment,
      beltSlots: profile.beltSlots,
      equippedBelt: profile.equipment.belt,
    } : saved;
  }

  private loadCharacterProfile(classId: string, fallbackGold = 0): boolean {
    const profile = this.characterProfiles[classId];
    this.sanctuaryGold = Math.max(0, Math.min(1_000_000_000, Math.floor(profile?.gold ?? fallbackGold)));
    this.playerGold = this.sanctuaryGold;
    this.inventory = Array.from({ length: this.inventoryColumns * this.inventoryRows }, () => null);
    this.equipment = createEmptyEquipment();
    this.beltSlots = Array.from({ length: 16 }, (_, index) => ({ kind: profile?.beltSlots[index]?.kind ?? null }));
    if (profile) {
      for (let index = 0; index < Math.min(this.inventory.length, profile.inventory.length); index += 1) {
        const item = profile.inventory[index];
        if (item && this.canPlaceItemAt(item, index)) this.inventory[index] = item;
      }
      for (const slot of PAPERDOLL_SLOTS) {
        const item = profile.equipment[slot];
        if (item && isCompatibleWithEquipment(item, slot)) this.equipment[slot] = item;
      }
    }
    this.normalizeBeltSlots();
    this.rebuildInventoryGrid();
    return !!profile;
  }

  private saveCharacterProfile(classId = this.selectedClass): void {
    if (!CLASS_MODEL[classId]) return;
    const equipment = createEmptyEquipment();
    for (const slot of PAPERDOLL_SLOTS) {
      const item = sanitizeInventoryItem(this.equipment[slot]);
      if (item && isCompatibleWithEquipment(item, slot)) equipment[slot] = item;
    }
    if (classId === this.selectedClass) {
      this.characterProfiles[classId] = {
        gold: Math.max(0, Math.min(1_000_000_000, Math.floor(this.playerGold))),
        inventory: this.inventory.slice(0, this.inventoryColumns * this.inventoryRows).map((item) => item ? sanitizeInventoryItem(item) : null),
        equipment,
        beltSlots: Array.from({ length: 16 }, (_, index) => ({ kind: this.beltSlots[index]?.kind ?? null })),
      };
    }
  }

  private restoreRunState(saved: Partial<D2SavedRun>): void {
    const numberValue = (value: unknown, fallback: number, min: number, max: number): number =>
      typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    const savedClass = typeof saved.selectedClass === "string" && CLASS_MODEL[saved.selectedClass]
      ? saved.selectedClass
      : this.selectedClass;
    this.selectedClass = savedClass;
    const startingStats = this.classStartingStats[savedClass] ?? this.classStartingStats["amazon"];
    this.lobbyRunId = typeof saved.runId === "string" && saved.runId ? saved.runId : createRunId();
    this.runKillCount = typeof saved.runKillCount === "number" && Number.isFinite(saved.runKillCount) ? Math.max(0, Math.floor(saved.runKillCount)) : 0;
    const basicAttack = this.basicAttackForClass(savedClass);
    this.selectedClass = savedClass;
    this.playerLevel = Math.floor(numberValue(saved.playerLevel, 1, 1, 10000));
    this.playerXp = Math.floor(numberValue(saved.playerXp, 0, 0, 1_000_000_000));
    this.pendingLevelUps = Math.floor(numberValue(saved.pendingLevelUps, 0, 0, 10000));
    this.skillOfferSeed = Math.floor(numberValue(saved.skillOfferSeed, 1, 0, 2_147_483_647));
    this.xpToNextLevel = Math.floor(numberValue(saved.xpToNextLevel, this.xpForLevel(this.playerLevel), 1, 1_000_000));
    this.basicAttackName = typeof saved.basicAttackName === "string" && BASIC_ATTACK_NAMES.includes(saved.basicAttackName) ? saved.basicAttackName : basicAttack.name;
    if (saved.basicAttackName === "Fire Bolt" && savedClass === "sorceress") this.basicAttackName = "Attack";
    this.basicAttackCooldown = numberValue(saved.basicAttackCooldown, basicAttack.cooldown, 0.18, 5);
    this.basicAttackDamage = numberValue(saved.basicAttackDamage, basicAttack.damage, 1, 100000);
    this.attackCooldown = 0;
    this.attackProjectiles = [];
    this.skillTreeOpen = false;
    this.arenaW = numberValue(saved.arenaW, 500, 100, 5000);
    this.arenaH = numberValue(saved.arenaH, 500, 100, 5000);
    this.playerX = numberValue(saved.playerX, this.arenaW / 2, 32, this.arenaW - 32);
    this.playerY = numberValue(saved.playerY, this.arenaH / 2, 32, this.arenaH - 32);
    this.currentChunkCoordX = Math.floor(numberValue(saved.currentChunkCoordX, 0, -1_000_000, 1_000_000));
    this.currentChunkCoordY = Math.floor(numberValue(saved.currentChunkCoordY, 0, -1_000_000, 1_000_000));
    this.currentChunkLocalX = numberValue(saved.currentChunkLocalX, this.chunkTileColumns * 48 / 2, 0, this.chunkTileColumns * 48);
    this.currentChunkLocalY = numberValue(saved.currentChunkLocalY, this.chunkTileRows * 48 / 2, 0, this.chunkTileRows * 48);
    // Old saves used the original 10–30 HP class stats; give returning runs the
    // same survivable baseline as new runs while preserving their saved health ratio.
    const savedMaxHp = numberValue(saved.playerMaxHp, startingStats.life, 1, 10000);
    this.playerMaxHp = Math.max(400, savedMaxHp);
    this.playerMaxMana = numberValue(saved.playerMaxMana, startingStats.mana, 1, 10000);
    const savedHp = numberValue(saved.playerHp, savedMaxHp, 0, savedMaxHp);
    this.playerHp = savedMaxHp < this.playerMaxHp
      ? Math.max(1, Math.ceil(savedHp / savedMaxHp * this.playerMaxHp))
      : Math.min(this.playerMaxHp, savedHp);
    this.deathRecovery = saved.deathRecovery === true || this.playerHp <= 0;
    this.deathCount = Math.floor(numberValue(saved.deathCount, 0, 0, 1_000_000));
    this.playerMana = this.playerMaxMana;
    this.playerGold = Math.floor(numberValue(saved.playerGold, 0, 0, 1_000_000_000));
    this.runTime = numberValue(saved.runTime, 0, 0, 1_000_000_000);
    this.currentAct = Math.floor(numberValue(saved.currentAct, 1, 1, CAMPAIGN_ACTS.length));
    this.actTime = numberValue(saved.actTime, 0, 0, 1_000_000_000);
    this.actTransitionReady = saved.actTransitionReady === true;
    this.campaignVictory = false;
    this.actBossSpawned = saved.actBossSpawned === true || this.actTime >= ACT_BOSS_TIME_SECONDS;
    if (this.actBossSpawned && !this.actTransitionReady && !saved.enemies?.some((enemy) => isRecord(enemy) && enemy["campaignBoss"] === true)) {
      this.actTransitionReady = true;
    }
    this.spawnAcc = numberValue(saved.spawnAcc, 0, 0, 1);
    this.chestTimer = numberValue(saved.chestTimer, 0, -3600, 3600);
    this.nextChestInterval = numberValue(saved.nextChestInterval, 8, 1, 3600);
    this.enemies = Array.isArray(saved.enemies)
      ? saved.enemies.slice(0, 220).filter(isRecord).map((enemy) => {
          const kind: EnemyKind = enemy["kind"] === "boss" || enemy["kind"] === "champion" ? enemy["kind"] : "normal";
          return {
            kind,
            species: sanitizeEnemySpecies(enemy["species"], kind),
            campaignBoss: enemy["campaignBoss"] === true,
        summonType: enemy["summonType"] === "skeleton" || enemy["summonType"] === "golem" ? enemy["summonType"] : undefined,
        summonSkill: typeof enemy["summonSkill"] === "string" ? enemy["summonSkill"] : undefined,
            summonAttackCooldown: numberValue(enemy["summonAttackCooldown"], 0, 0, 60),
            spriteFrame: numberValue(enemy["spriteFrame"], 0, 0, 47),
            x: numberValue(enemy["x"], 250, -40, this.arenaW + 40),
            y: numberValue(enemy["y"], 250, -40, this.arenaH + 40),
          hp: numberValue(enemy["hp"], 1, 0, 1_000_000),
          maxHp: numberValue(enemy["maxHp"], 1, 1, 1_000_000),
          speed: numberValue(enemy["speed"], 80, 0, 10_000),
          r: numberValue(enemy["r"], 14, 1, 100),
          dmg: numberValue(enemy["dmg"], 1, 0, 1_000_000),
          cd: typeof enemy["cd"] === "number"
            ? numberValue(enemy["cd"], 0, 0, 3600)
            : enemy["kind"] === "boss" ? 1.1 : enemy["kind"] === "champion" ? 0.9 : 0.8,
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
          kind: drop["kind"] === "rejuvenation" ? "rejuvenation" as const : "health" as const,
          bob: numberValue(drop["bob"], 0, 0, 1_000_000),
          life: numberValue(drop["life"], drop["kind"] === "rejuvenation" ? 40 : 25, 0, 3600),
          pickupDelay: numberValue(drop["pickupDelay"], 0, 0, 3600),
          notifiedFull: drop["notifiedFull"] === true,
          collected: drop["collected"] === true,
        }))
      : [];
    this.goldDrops = Array.isArray(saved.goldDrops)
      ? saved.goldDrops.slice(0, 500).filter(isRecord).map((drop) => ({
          x: numberValue(drop["x"], this.playerX, -40, this.arenaW + 40),
          y: numberValue(drop["y"], this.playerY, -40, this.arenaH + 40),
          amount: Math.floor(numberValue(drop["amount"], 1, 1, 1_000_000)),
          bob: numberValue(drop["bob"], 0, 0, 1_000_000),
          life: numberValue(drop["life"], 18, 0, 3600),
          pickupDelay: numberValue(drop["pickupDelay"], 0, 0, 3600),
        }))
      : [];
    const savedPlayerOffsetX = this.playerX - this.arenaW / 2;
    const savedPlayerOffsetY = this.playerY - this.arenaH / 2;
    this.translateWorldEntities(-savedPlayerOffsetX, -savedPlayerOffsetY);
    this.playerX = this.arenaW / 2;
    this.playerY = this.arenaH / 2;
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
    this.beltSlots = Array.from({ length: 16 }, (_, index) => {
      const kind = saved.beltSlots?.[index]?.kind;
      return { kind: kind === "health" || kind === "rejuvenation" ? kind : null };
    });
    this.normalizeBeltSlots();
    const classSkills = new Set(getClassSkills(savedClass).map((definition) => definition.name));
    this.ownedSkills = Array.isArray(saved.ownedSkills)
      ? saved.ownedSkills.filter((name): name is string => typeof name === "string" && (classSkills.has(name) || name in UPGRADE_DESCRIPTIONS || name === this.basicAttackName)).slice(0, 100)
      : [this.basicAttackName];

    this.skillLevels = {};
    if (isRecord(saved.skillLevels)) {
      for (const [name, level] of Object.entries(saved.skillLevels)) {
        if ((this.ownedSkills.includes(name) || classSkills.has(name) || name in UPGRADE_DESCRIPTIONS) && typeof level === "number" && Number.isFinite(level)) {
          this.skillLevels[name] = Math.floor(Math.max(1, Math.min(20, level)));
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
    if (!this.characterProfiles[savedClass]) {
      const restoredItemIds = new Set([
        ...restoredInventory.filter((item): item is D2InventoryItem => !!item).map((item) => item.id),
        ...Object.values(this.equipment).filter((item): item is D2InventoryItem => !!item).map((item) => item.id),
      ]);
      this.sanctuaryStash = this.sanctuaryStash.filter((item) => !restoredItemIds.has(item.id));
    }
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
      this.saveCharacterProfile();
      const run: D2SavedRun | null = this.runActive || this.activeTab === "run"
        ? this.hasSavedRun ? {
        hasSavedRun: true,
        runId: this.lobbyRunId || createRunId(),
        selectedClass: this.runActive || this.activeTab === "run" ? this.selectedClass : this.savedRunClass,
        arenaW: this.arenaW,
        arenaH: this.arenaH,
        playerX: this.playerX,
        playerY: this.playerY,
        playerHp: this.playerHp,
        playerMaxHp: this.playerMaxHp,
        deathRecovery: this.deathRecovery,
        deathCount: this.deathCount,
        currentChunkCoordX: this.currentChunkCoordX,
        currentChunkCoordY: this.currentChunkCoordY,
        currentChunkLocalX: this.currentChunkLocalX,
        currentChunkLocalY: this.currentChunkLocalY,
        playerMana: this.playerMaxMana,
        playerMaxMana: this.playerMaxMana,
        playerGold: this.playerGold,
        runTime: this.runTime,
        currentAct: this.currentAct,
        actTime: this.actTime,
        actBossSpawned: this.actBossSpawned,
        actTransitionReady: this.actTransitionReady,
        runKillCount: this.runKillCount,
        playerLevel: this.playerLevel,
        playerXp: this.playerXp,
        pendingLevelUps: this.pendingLevelUps,
        xpToNextLevel: this.xpToNextLevel,
        skillOfferSeed: this.skillOfferSeed,
        basicAttackName: this.basicAttackName,
        basicAttackCooldown: this.basicAttackCooldown,
        basicAttackDamage: this.basicAttackDamage,
        ownedSkills: this.ownedSkills,
        skillLevels: this.skillLevels,
        enemies: this.enemies,
        chests: this.chests,
        potionDrops: this.potionDrops,
        goldDrops: this.goldDrops,
        beltSlots: this.beltSlots,
        equippedBelt: this.equippedBelt,
        equipment: this.equipment,
        inventory: this.inventory,
        spawnAcc: this.spawnAcc,
        chestTimer: this.chestTimer,
        nextChestInterval: this.nextChestInterval,
      } : null
        : this.hasSavedRun && this.deathRecovery ? this.getSavedRunWithCharacterProfile() : null;
      const serialized = JSON.stringify({
        version: RUN_SAVE_VERSION,
        selectedClass: this.selectedClass,
        sanctuaryGold: this.sanctuaryGold,
        sanctuaryBonuses: this.sanctuaryBonuses,
        sanctuaryStash: this.sanctuaryStash,
        characterProfiles: this.characterProfiles,
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
    if (this.campaignVictory) {
      this.finishCampaign();
      return;
    }
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
    const savedRun = this.getSavedRunWithCharacterProfile();
    if (!savedRun) {
      this.hasSavedRun = false;
      return;
    }
    const recoveringNecromancer = savedRun.deathRecovery === true && savedRun.selectedClass === "necromancer";
    this.restoreRunState(savedRun);
    if (recoveringNecromancer) {
      this.playerHp = this.playerMaxHp;
      this.actTransitionReady = false;
      this.enemies = [];
      this.chests = [];
      this.potionDrops = [];
      this.goldDrops = [];
      this.deathRecovery = false;
      this.persistRunProgress(true);
    }
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
    if (this.lobbyRunId && !this.runActive && this.playerHp <= 0 && !(this.deathRecovery && this.selectedClass === "necromancer")) void this.recordCompletedCharacter(false);
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
    if (!session) {        this.lastRecordedRunId = "";
        this.saveStatus = "Sign in and return to the lobby to archive this completed hero.";
      if (this.recordRetryTimer !== undefined) window.clearTimeout(this.recordRetryTimer);
      this.recordRetryTimer = window.setTimeout(() => {
        this.recordRetryTimer = undefined;
        if (this.lobbyRunId === runId && !this.runActive && !(this.deathRecovery && this.selectedClass === "necromancer")) void this.recordCompletedCharacter(victory, true);
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
      const retainNecromancerRun = !victory && this.deathRecovery && this.selectedClass === "necromancer";
      this.hasSavedRun = retainNecromancerRun;
      if (!retainNecromancerRun) this.lobbyRunId = "";
      this.persistRunProgress(true);
      this.activeTab = "menu";
      this.menuPanel = "lobby";
      await this.refreshLeaderboard();
    } else {
      if (this.recordRetryTimer !== undefined) window.clearTimeout(this.recordRetryTimer);
      this.recordRetryTimer = window.setTimeout(() => {
        this.recordRetryTimer = undefined;
        if (this.lobbyRunId === runId && !(this.deathRecovery && this.selectedClass === "necromancer")) void this.recordCompletedCharacter(victory, true);
      }, 5000);
      this.saveStatus = "Character record could not reach the server. Retrying…";
    }
  }

  openCharacterSelect(): void {
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
    if (classId !== this.selectedClass) {
      this.persistRunProgress(true);
      this.selectedClass = classId;
      this.loadCharacterProfile(classId, 0);
      this.persistRunProgress(true);
    }
    if (this.menuPanel === "characters") {
      this.previewAttackStyle = CLASS_ATTACK_ANIMATION[classId] ?? "amazonJab";
      this.previewAttackSide = this.previewAttackSide === -1 ? 1 : -1;
      if (this.previewModel && this.previewModelClass === classId) {
        this.previewAttackTime = 0;
        this.previewAttackPending = false;
      } else {
        this.previewAttackPending = true;
        if (this.previewLoadingClass !== classId) this.loadPreviewModel();
      }
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
    this.menuHeroPoseBases.clear();
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
        this.menuHeroPoseBases = new Map(this.menuHeroPoseBones.map((pose) => [pose.bone, pose.baseQuaternion.clone()]));
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
        const sway = this.reducedMotion ? 0 : Math.sin(time * 1.15 + pose.phase) * 0.006;
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.side * sway * fadeIn);
        const base = this.menuHeroPoseBases.get(pose.bone) ?? pose.baseQuaternion;
        pose.bone.quaternion.copy(base).multiply(rotation);
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
    this.menuHeroPoseBones = [];
    this.menuHeroPoseBases.clear();
    this.previewAmazonPike = undefined;
    this.previewAmazonPikeBase = undefined;
    this.previewWeapons = [];
    this.previewAttackTime = Number.POSITIVE_INFINITY;
    this.previewAttackPending = false;
    this.previewModelClass = undefined;
    this.previewLoadingClass = undefined;
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
    this.previewModelClass = undefined;
    this.previewWeapons = [];
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
    this.previewLoadingClass = modelClass;
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
        this.normalizeCharacterModel(model, 88, modelClass === "amazon");
        this.previewPoseBones = this.getPreviewPoseBones(model);
        this.previewAmazonPike = modelClass === "amazon"
          ? model.getObjectByName("pikeShape_0") ?? undefined
          : undefined;
        this.previewAmazonPikeBase = this.previewAmazonPike?.quaternion.clone();
        this.previewWeapons = [];
        model.traverse((object) => {
          if (!(object as THREE.Mesh).isMesh || !/pike|spear|staff|weapon/i.test(object.name)) return;
          this.previewWeapons.push({ object, baseQuaternion: object.quaternion.clone() });
        });
        this.previewModel = model;
        this.previewModelClass = modelClass;
        this.previewLoadingClass = undefined;
        if (this.previewAttackPending) {
          this.previewAttackStyle = CLASS_ATTACK_ANIMATION[modelClass] ?? "amazonJab";
          this.previewAttackSide = this.previewAttackSide === -1 ? 1 : -1;
          this.previewAttackTime = 0;
          this.previewAttackPending = false;
        }
        this.previewScene?.add(model);
        this.previewLoadError = false;
      } catch (error: unknown) {
        disposeModel();
        if (requestId !== this.previewModelRequest) return;
        this.previewLoadingClass = undefined;
        this.previewAttackPending = false;
        console.error(`Could not apply ${modelClass} class textures`, error);
        this.previewLoadError = true;
      }
    }, undefined, (error: unknown) => {
      if (requestId !== this.previewModelRequest) {
        return;
      }
      this.previewLoadingClass = undefined;
      this.previewAttackPending = false;
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
      const attackProfile = ATTACK_ANIMATION_PROFILES[this.previewAttackStyle];
      const attackActive = this.previewAttackTime < attackProfile.duration;
      const attackProgress = attackActive ? Math.max(0, Math.min(1, this.previewAttackTime / attackProfile.duration)) : 1;
      const attackMotion = attackActive ? attackMotionCurve(attackProgress, this.previewAttackStyle) * (this.reducedMotion ? 0.45 : 1) : 0;
      const attackFollowThrough = attackActive ? Math.sin(Math.PI * attackProgress) * (this.reducedMotion ? 0.45 : 1) : 0;
      this.previewAttackTime += dt;
      const turn = attackActive && attackProfile.spin ? attackProgress * Math.PI * 2 : 0;
      this.previewModel.rotation.y = this.previewRotation + (this.previewDragging ? 0 : Math.sin(time * 0.25) * 0.012 * idleMotion) + turn;
      this.previewModel.rotation.z = 0;
      this.previewModel.position.y = Math.sin(time * 1.1) * 0.16 * idleMotion;
      for (const weapon of this.previewWeapons) {
        const isPike = weapon.object === this.previewAmazonPike;
        const gripSettle = isPike && !this.previewDragging ? Math.sin(time * 0.9) * 0.012 * idleMotion : 0;
        const settle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), gripSettle);
        const attack = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          attackMotion * attackProfile.weaponPitch,
          0,
          attackMotion * attackProfile.weaponRoll * (this.previewAttackSide < 0 ? -1 : 1),
          "XYZ",
        ));
        weapon.object.quaternion.copy(weapon.baseQuaternion).multiply(settle).multiply(attack);
      }
      // The supplied class rigs have no clips, so give the selection preview a grounded,
      // slightly asymmetrical idle instead of leaving the hero in its rigid bind pose.
      // Reduced-motion users keep the settled pose but skip its breathing and turntable sway.
      const fadeIn = this.reducedMotion ? 1 : Math.min(1, time / 0.45);
      const classPose = this.selectedClass;
      const locomotion = this.reducedMotion ? 0 : 1;
      for (const pose of this.previewPoseBones) {
        const sway = Math.sin(time * 1.05 + pose.phase) * 0.006 * fadeIn * locomotion;
        const isLead = pose.side === this.previewAttackSide;
        let rotation: THREE.Quaternion;
        switch (pose.role) {
        case "arm": {
          const restArmPitch = classPose === "amazon" || classPose === "sorceress" || classPose === "necromancer" ? -0.11 : -0.16;
          const barbarian = classPose === "barbarian";
          const attackPitch =      attackMotion * (isLead ? attackProfile.leadArm : attackProfile.offArm) * (barbarian ? 0.42 : 0.72);
          const attackSweep = attackFollowThrough * (isLead ? attackProfile.armSweep : -attackProfile.armSweep * 0.4);
          rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            restArmPitch + sway * 0.45 + attackPitch,
            attackSweep * (barbarian ? 0.42 : 1),
            pose.side * sway + attackMotion * attackProfile.shoulderRoll * (isLead ? -0.7 : 0.5) * (barbarian ? 0.5 : 1),
            "XYZ",
          ));
          break;
        }
        case "forearm": {
          const barbarian = classPose === "barbarian";
          const bend = Math.max(0, attackMotion) * (isLead ? attackProfile.elbowBend : attackProfile.offElbowBend) * (barbarian ? 0.38 : 0.65);
          rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend + Math.max(0, sway) * 0.15);
          break;
        }
        case "leg": {
          const poseSideSwing = classPose === "assassin" ? -0.05 : classPose === "barbarian" ? -0.025 : -0.035;
          rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), poseSideSwing * pose.side + sway);
          break;
        }
        case "knee":
          rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.025 + Math.max(0, sway));
          break;
        case "foot":
          rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sway * 0.45);
          break;
        case "pelvis":
          rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway * 0.25);
          break;
        case "spine":
          const barbarian = classPose === "barbarian";
          const attackDrive = barbarian ? Math.max(0, attackMotion) : attackMotion;
          rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            -0.012 + sway * 0.25 - attackDrive * attackProfile.lean * (barbarian ? 1.25 : 0.55),
            attackDrive * attackProfile.torsoTwist * (barbarian ? 0.72 : 0.6),
            sway * 0.2,
            "XYZ",
          ));
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
  beltSlots: Array<{ kind: "health" | "rejuvenation" | null }> = Array.from({ length: 16 }, () => ({ kind: null }));
  get beltRows(): number {
    return this.equippedBelt?.beltQuality === "exceptional" ? 3
      : this.equippedBelt?.beltQuality === "elite" ? 4
        : this.equippedBelt?.slot === "belt" ? 2
          : 1;
  }
  get visibleBeltSlots(): Array<{ kind: "health" | "rejuvenation" | null }> {
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
  goldDrops: GoldDrop[] = [];
  openChestCount = 0;
  floatingTexts: FloatingText[] = [];
  runTime = 0;
  lastTime = 0;
  rafId = 0;
  keysDown = new Set<string>();
  arenaW = 500;
  arenaH = 500;
  virtualJoystickVisible = false;
  joystickX = 0;
  joystickY = 0;
  joystickKnobX = 0;
  joystickKnobY = 0;
  private joystickPointerId: number | null = null;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private readonly joystickRadius = 54;
  private arenaResizeObserver?: ResizeObserver;
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

  get shopItemsForSale(): Array<{ item: D2InventoryItem; source: string; inventoryIndex?: number; equipmentSlot?: PaperdollSlot }> {
    const items: Array<{ item: D2InventoryItem; source: string; inventoryIndex?: number; equipmentSlot?: PaperdollSlot }> = [];
    const representedIds = new Set<string>();
    this.inventory.forEach((item, inventoryIndex) => {
      if (item) {
        items.push({ item, source: "Pack", inventoryIndex });
        representedIds.add(item.id);
      }
    });
    for (const slot of PAPERDOLL_SLOTS) {
      const item = this.equipment[slot];
      if (item) {
        items.push({ item, source: slot === "ringLeft" || slot === "ringRight" ? "Ring" : slot, equipmentSlot: slot });
        representedIds.add(item.id);
      }
    }
    for (const item of this.sanctuaryStash) {
      if (!representedIds.has(item.id)) items.push({ item, source: "Stash" });
    }
    return items;
  }

  openGheedsShop(): void {
    this.stopMenuHeroPreview();
    this.shopMessage = "Gheed eyes your purse with a knowing grin.";
    this.menuPanel = "shop";
  }

  openShopFromRun(): void {
    this.persistRunProgress(true);
    this.runActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.activeTab = "menu";
    this.openGheedsShop();
  }

  closeGheedsShop(): void {
    this.menuPanel = "main";
    this.startMenuHeroPreview();
  }

  buyGheedsItem(offer: (typeof this.gheedsShopItems)[number]): void {
    if (!this.gheedsShopItems.includes(offer)) return;
    if (this.sanctuaryGold < offer.cost) {
      this.shopMessage = `You need ${offer.cost - this.sanctuaryGold} more gold for ${offer.name}.`;
      return;
    }
    const item: D2InventoryItem = { ...offer.item, id: createRunId(), stats: offer.item.stats ? { ...offer.item.stats } : undefined };
    if (!this.addInventoryItem(item)) {
      this.shopMessage = "Your hero's pack is full. Make room before buying this item.";
      return;
    }
    this.sanctuaryGold -= offer.cost;
    this.playerGold = Math.max(0, this.playerGold - offer.cost);
    this.shopMessage = `${item.name} purchased and added to ${this.selectedClassName}'s pack.`;
    this.persistRunProgress(true);
  }

  getSanctuaryUpgradeCost(upgrade: "maxLife" | "attackDamage"): number {
    return 250 + this.sanctuaryBonuses[upgrade] * 175;
  }

  get canCollectShopItem(): boolean {
    return this.sanctuaryStash.length > 0;
  }

  takeItemFromSanctuaryStash(item: D2InventoryItem): void {
    if (!this.sanctuaryStash.some((owned) => owned.id === item.id)) return;
    const packItem = { ...item, stats: item.stats ? { ...item.stats } : undefined };
    if (!this.addInventoryItem(packItem)) {
      this.shopMessage = "Your hero's pack is full. Make room before collecting this stash item.";
      return;
    }
    this.sanctuaryStash = this.sanctuaryStash.filter((owned) => owned.id !== item.id);
    this.shopMessage = `${item.name} moved into your hero's pack.`;
    this.persistRunProgress(true);
  }

  buySanctuaryUpgrade(upgrade: "maxLife" | "attackDamage"): void {
    if (upgrade !== "maxLife" && upgrade !== "attackDamage") return;
    const level = this.sanctuaryBonuses[upgrade];
    const maxLevel = 20;
    if (level >= maxLevel) {
      this.shopMessage = "Gheed has no further improvement to offer.";
      return;
    }
    const cost = this.getSanctuaryUpgradeCost(upgrade);
    if (this.sanctuaryGold < cost) {
      this.shopMessage = `You need ${cost - this.sanctuaryGold} more gold.`;
      return;
    }
    this.sanctuaryGold -= cost;
    this.playerGold = Math.max(0, this.playerGold - cost);
    this.sanctuaryBonuses[upgrade] += 1;
    const bonus = upgrade === "maxLife" ? "+50 starting life" : "+2 starting attack damage";
    this.shopMessage = `${bonus} permanently acquired · rank ${this.sanctuaryBonuses[upgrade]}/${maxLevel}.`;
    this.persistRunProgress(true);
  }

  sellShopItem(entry: { item: D2InventoryItem; source: string; inventoryIndex?: number; equipmentSlot?: PaperdollSlot }): void {
    const { item } = entry;
    if (entry.source === "Stash" && !this.sanctuaryStash.some((owned) => owned.id === item.id)) return;
    if (entry.inventoryIndex !== undefined && this.inventory[entry.inventoryIndex]?.id !== item.id) return;
    if (entry.equipmentSlot && this.equipment[entry.equipmentSlot]?.id !== item.id) return;
    if (entry.equipmentSlot === "belt" && this.beltSlots.some((potion) => potion.kind !== null)) {
      this.shopMessage = "Use or move all belt potions before selling this belt.";
      return;
    }
    this.sanctuaryStash = this.sanctuaryStash.filter((owned) => owned.id !== item.id);
    if (entry.inventoryIndex !== undefined) this.inventory[entry.inventoryIndex] = null;
    if (entry.equipmentSlot) {
      this.equipment[entry.equipmentSlot] = null;
      if (entry.equipmentSlot === "weapon" && this.characterModel) this.configureClassMeleeWeapon(this.characterModel, this.selectedClass);
      this.normalizeBeltSlots();
    }
    const value = this.getItemSellValue(item);
    this.sanctuaryGold = Math.min(1_000_000_000, this.sanctuaryGold + value);
    this.playerGold = Math.min(1_000_000_000, this.playerGold + value);
    this.rebuildInventoryGrid();
    this.shopMessage = `${item.name} sold to Gheed for ${value} gold.`;
    this.persistRunProgress(true);
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

  onArenaPointerDown(event: PointerEvent): void {
    if (event.pointerType !== "touch" || this.activeTab !== "run" || !this.runActive || this.escapeMenuOpen || this.inventoryOpen || this.skillTreeOpen || this.pendingLevelUps > 0 || this.actTransitionReady || this.campaignVictory) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("button, a, input, textarea, select, [role='button'], [role='dialog'], .d2s-classic-hud, .d2s-act-banner, .d2s-experience-progress")) return;
    if (this.joystickPointerId !== null) return;
    const rect = this.arenaRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    this.joystickPointerId = event.pointerId;
    this.joystickCenterX = event.clientX - rect.left;
    this.joystickCenterY = event.clientY - rect.top;
    this.joystickX = this.joystickCenterX;
    this.joystickY = this.joystickCenterY;
    this.joystickKnobX = 0;
    this.joystickKnobY = 0;
    this.virtualJoystickVisible = true;
    this.updateJoystickDirection(event);
    event.preventDefault();
  }

  onArenaPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) return;
    this.updateJoystickDirection(event);
    event.preventDefault();
  }

  onArenaPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) return;
    this.joystickPointerId = null;
    this.virtualJoystickVisible = false;
    this.joystickKnobX = 0;
    this.joystickKnobY = 0;
    this.keysDown.delete("w");
    this.keysDown.delete("a");
    this.keysDown.delete("s");
    this.keysDown.delete("d");
  }

  private updateJoystickDirection(event: PointerEvent): void {
    const rect = this.arenaRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const deltaX = event.clientX - rect.left - this.joystickCenterX;
    const deltaY = event.clientY - rect.top - this.joystickCenterY;
    const distance = Math.hypot(deltaX, deltaY);
    const scale = distance > this.joystickRadius ? this.joystickRadius / distance : 1;
    this.joystickKnobX = deltaX * scale;
    this.joystickKnobY = deltaY * scale;
    const deadZone = 9;
    const normalizedX = distance > deadZone ? deltaX / distance : 0;
    const normalizedY = distance > deadZone ? deltaY / distance : 0;
    this.keysDown.delete("w");
    this.keysDown.delete("a");
    this.keysDown.delete("s");
    this.keysDown.delete("d");
    if (normalizedY < -0.35) this.keysDown.add("w");
    if (normalizedY > 0.35) this.keysDown.add("s");
    if (normalizedX < -0.35) this.keysDown.add("a");
    if (normalizedX > 0.35) this.keysDown.add("d");
  }

  onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === "t") {
      event.preventDefault();
      this.toggleSkillTree();
      return;
    }
    if (this.escapeMenuOpen || this.inventoryOpen || this.skillTreeOpen || this.pendingLevelUps > 0) return;
    if (["1", "2", "3", "4"].includes(key)) {
      event.preventDefault();
      this.drinkBeltRow(Number(key) - 1);
      return;
    }
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

  drinkBeltRow(rowIndex: number): void {
    if (rowIndex < 0 || rowIndex >= this.beltRows) return;
    const firstSlot = rowIndex * 4;
    const slotIndex = this.beltSlots.findIndex((slot, index) => index >= firstSlot && index < firstSlot + 4 && slot.kind !== null);
    if (slotIndex >= 0) this.drinkBeltPotion(slotIndex);
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
    } else if (slot.kind === "rejuvenation") {
      this.playerHp = this.playerMaxHp;
      slot.kind = null;
      this.combatOrbsTime = 2.5;
      this.floatingTexts.push({ x: this.playerX, y: this.playerY - 28, text: "FULL REJUVENATION", color: "#d68cff", life: 1.8 });
      this.persistRunProgress(true);
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

  @HostListener("window:keyup", ["$event"])
  onGlobalMovementKeyUp(event: KeyboardEvent): void {
    this.keysDown.delete(event.key.toLowerCase());
  }

  @HostListener("window:blur")
  onWindowBlur(): void {
    this.keysDown.clear();
    this.joystickPointerId = null;
    this.virtualJoystickVisible = false;
    this.joystickKnobX = 0;
    this.joystickKnobY = 0;
  }

  @HostListener("window:keydown", ["$event"])
  onGlobalAttackKey(event: KeyboardEvent): void {
    if (this.activeTab !== "run" || !this.runActive || event.repeat) return;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    const isEditable = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (key === "escape") {
      event.preventDefault();
      if (this.skillTreeOpen) {
        this.skillTreeOpen = false;
      } else if (this.inventoryOpen) {
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
      this.skillTreeOpen = false;
      this.keysDown.clear();
      requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
      return;
    }
    if (key === "t") {
      event.preventDefault();
      this.toggleSkillTree();
      return;
    }
    if (this.escapeMenuOpen || this.inventoryOpen || this.skillTreeOpen || this.pendingLevelUps > 0) return;
    if (["1", "2", "3", "4"].includes(key)) {
      event.preventDefault();
      this.drinkBeltRow(Number(key) - 1);
      return;
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      this.keysDown.add(key);
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
      this.skillTreeOpen = false;
      this.keysDown.clear();
    }
    requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
  }

  toggleSkillTree(): void {
    if (this.activeTab !== "run" || !this.runActive || this.escapeMenuOpen || this.inventoryOpen) return;
    this.skillTreeOpen = !this.skillTreeOpen;
    if (this.skillTreeOpen) {
      this.escapeMenuOpen = false;
      this.inventoryOpen = false;
      this.keysDown.clear();
    }
    requestAnimationFrame(() => this.arenaRef?.nativeElement.focus());
  }

  get skillTreeSections(): Array<{ name: string; skills: Array<D2SkillDefinition & { state: "learned" | "available" | "locked"; reason: string }> }> {
    const tree = D2_CLASS_SKILL_TREES[this.selectedClass];
    const available = new Set(this.availableClassSkills.map((entry) => entry.name));
    return (tree?.sections ?? []).map((section) => ({
      name: section.name,
      skills: section.skills.map((entry) => {
        const rank = this.skillLevels[entry.name] ?? 0;
        const state = rank > 0 ? "learned" : available.has(entry.name) ? "available" : "locked";
        const missing = entry.prerequisites.filter((name) => !this.ownedSkills.includes(name));
        const reason = rank > 0 ? `Rank ${rank}/20 · character level ${entry.level}+` : entry.level > this.playerLevel
          ? `Unlocks at character level ${entry.level}`
          : missing.length ? `Requires ${missing.join(", ")}` : "Available on a level-up";
        return { ...entry, state, reason };
      }),
    }));
  }

  get availableClassSkills(): D2SkillDefinition[] {
    return getAvailableClassSkills(this.selectedClass, this.playerLevel, this.ownedSkills, this.skillLevels);
  }

  get equippedWeaponName(): string {
    return this.equipment.weapon?.baseName ?? this.equipment.weapon?.name ?? "bare hands";
  }

  showEscapeMenu(): void {
    this.escapeMenuOpen = true;
    this.inventoryOpen = false;
    this.skillTreeOpen = false;
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
    return this.ownedSkills.filter((name) => name !== this.basicAttackName && getClassSkills(this.selectedClass).some((skill) => skill.name === name)).slice(0, 4);
  }

  skillCastProgress(skill: string): number {
    const interval = this.getSkillCastInterval(skill);
    const cooldown = this.skillCastCooldowns[skill] ?? 0;
    return Number.isFinite(cooldown) ? Math.max(0, Math.min(1, cooldown / interval)) : 0;
  }

  getSkillCastLabel(skill: string): string {
    return `${this.getSkillCastInterval(skill).toFixed(1)}s`;
  }

  getSkillCastInterval(skill: string): number {
    const definition = getClassSkills(this.selectedClass).find((entry) => entry.name === skill);
    const visual = definition?.visual ?? getD2SkillVisual(skill);
    const baseIntervals: Record<D2SkillVisual, number> = {
      summon: 7.5,
      aura: 0,
      trap: 5.5,
      wave: 4.8,
      burst: 4.6,
      movement: 3.8,
      projectile: 3.2,
      strike: 2.7,
    };
    const unlockDelay = Math.max(0, (definition?.level ?? 1) - 1) * 0.035;
    const rank = this.skillLevels[skill] ?? 1;
    const rankBonus = Math.max(0.65, 1 - Math.max(0, rank - 1) * 0.025);
    const castRateRank = this.skillLevels["Faster Cast Rate"] ?? 0;
    const globalRate = Math.max(0.4, 1 - castRateRank * 0.1);
    return Math.max(0.65, (baseIntervals[visual] + unlockDelay) * rankBonus * globalRate);
  }

  get emptySkillSlots(): number[] {
    return Array.from({ length: Math.max(0, 4 - this.equippedSkills.length) }, (_, index) => index);
  }

  get equippedWeaponDamage(): number {
    const item = this.equipment.weapon;
    const weaponName = this.equippedWeaponName.toLowerCase();
    const permitted = this.selectedClass === "amazon"
      ? weaponName.includes("pike") || weaponName.includes("spear") || weaponName.includes("javelin")
      : this.selectedClass === "sorceress" ? weaponName.includes("staff") : true;
    const damageBonus = Object.values(this.equipment).reduce((total, equipped) => total + (equipped?.stats?.plusDamage ?? 0), 0);
    return (permitted && item ? Math.floor(((item.stats?.damageMin ?? 0) + (item.stats?.damageMax ?? 0)) / 2) : 0) + damageBonus;
  }

  get equippedArmor(): number {
    return Object.values(this.equipment).reduce((total, item) => total + (item?.stats?.armor ?? 0), 0);
  }

  get basicAttackIcon(): string {
    return BASIC_ATTACK_MISSILE_OVERLAYS[this.basicAttackName] ? "" : this.skillIcon(this.basicAttackName);
  }

  get basicAttackMissileOverlay(): string {
    return BASIC_ATTACK_MISSILE_OVERLAYS[this.basicAttackName] ?? ATTACK_KIND_MISSILE_OVERLAYS[this.basicAttackForClass(this.selectedClass).kind];
  }

  missileOverlayPath(id: string): string {
    return `${MISSILE_OVERLAY_BASE}/${id}${(MISSILE_FRAME_COUNTS[id] ?? 1) > 1 ? "/0000.webp" : ".webp"}`;
  }

  getSkillMissileOverlay(skill: string): string {
    return this.missileOverlayId(skill) ?? ATTACK_KIND_MISSILE_OVERLAYS[this.basicAttackForClass(this.selectedClass).kind];
  }

  skillIcon(skill: string): string {
    if (this.missileOverlayId(skill)) return "";
    const icons: Record<string, string> = {
      "Faster Attacks": "»", Vitality: "♥", "Arcane Focus": "◉", "Weapon Mastery": "⚔",
    };
    const visualIcons: Record<D2SkillVisual, string> = {
      summon: "♟", aura: "✧", trap: "⌘", wave: "〰", burst: "✹", movement: "➤", projectile: "➶", strike: "⚔",
    };
    return icons[skill] ?? visualIcons[getD2SkillVisual(skill)];
  }

  activateOwnedSkill(skill: string): void {
    if (!this.ownedSkills.includes(skill)) return;
    if (this.isPersistentSummonSkill(skill)) {
      this.summonCompanion(skill);
      this.addSkillVisualEffect(skill);
      this.triggerAttackAnimation(this.selectedClass === "necromancer" ? "necromancerCast" : "cast");
      return;
    }
    const skillVisual = getClassSkills(this.selectedClass).find((entry) => entry.name === skill)?.visual ?? getD2SkillVisual(skill);
    if (skillVisual === "aura") {
      this.addSkillVisualEffect(skill);
      this.triggerAttackAnimation(this.selectedClass === "sorceress" ? "sorceressCast" : "cast");
      return;
    }
    const castAnimation: AttackAnimationStyle = this.selectedClass === "sorceress" ? "sorceressCast" : this.selectedClass === "necromancer" ? "necromancerCast" : "cast";
    const visualMissile = this.missileOverlayId(skill) ?? ATTACK_KIND_MISSILE_OVERLAYS[this.basicAttackForClass(this.selectedClass).kind];
    const nearest = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((a, b) => Math.hypot(a.x - this.playerX, a.y - this.playerY) - Math.hypot(b.x - this.playerX, b.y - this.playerY))[0];
    if (!nearest) {
      this.addSkillVisualEffect(skill);
      this.triggerAttackAnimation(castAnimation);
      return;
    }
    const distanceToTarget = Math.hypot(nearest.x - this.playerX, nearest.y - this.playerY) || 1;
    this.playerFacingX = (nearest.x - this.playerX) / distanceToTarget;
    this.playerFacingY = (nearest.y - this.playerY) / distanceToTarget;
    const attack = this.basicAttackForClass(this.selectedClass);
    const multiplier = Math.max(1, this.skillLevels[skill] ?? 1);
    const damage = this.basicAttackDamage * (skill === this.basicAttackName ? 1 : 1.5) + (multiplier - 1) * 3;
    const distance = Math.hypot(nearest.x - this.playerX, nearest.y - this.playerY);
    this.playerFacingX = (nearest.x - this.playerX) / Math.max(1, distance);
    this.playerFacingY = (nearest.y - this.playerY) / Math.max(1, distance);
    this.addSkillVisualEffect(skill, nearest);

    if (skill === "Whirlwind" && this.selectedClass === "barbarian") {
      const targets = this.enemies.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY) <= 115);
      if (!targets.length) return;
      for (const target of targets) {
        target.hp -= damage * 1.6;
        this.floatingTexts.push({ x: target.x, y: target.y - target.r, text: `-${Math.floor(damage * 1.6)}`, color: attack.color, life: 0.8 });
      }
      this.triggerAttackAnimation("spin");
      return;
    }

    const rangedSpell = (skill === "Fire Bolt" && this.selectedClass === "sorceress")
      || (skill === "Teeth" && this.selectedClass === "necromancer");
    const missileId = this.missileOverlayId(skill);
    const rangedSkills = new Set([
      "Fire Bolt", "Fire Ball", "Inferno", "Blaze", "Fire Wall", "Wake of Inferno", "Wake of Fire",
      "Ice Bolt", "Cold Arrow", "Ice Arrow", "Frozen Orb", "Glacial Spike", "Blizzard",
      "Lightning", "Charged Bolt", "Charged Bolt Sentry", "Chain Lightning", "Thunder Storm",
      "Lightning Bolt", "Static Field", "Firestorm", "Fissure", "Poison Nova", "Poison Javelin",
      "Plague Javelin", "Bone Spear", "Bone Spirit", "Teeth", "Holy Bolt", "Fist of the Heavens",
      "Psychic Hammer", "Mind Blast", "Meteor", "Molten Boulder", "Volcano", "Armageddon",
      "Tornado", "Hurricane", "Lightning Fury", "Lightning Strike", "Charged Strike",
      "Immolation Arrow", "Phoenix Strike", "Claws of Thunder", "Blades of Ice", "Zakarum's Hand",
    ]);
    if (rangedSpell || (missileId && rangedSkills.has(skill)) || skillVisual === "projectile") {
      const kind: AttackProjectile["kind"] = visualMissile === "d2-bluestar" || visualMissile === "d2-lightning" ? "lightning"
        : visualMissile === "d2-holybolt" ? "holy" : visualMissile === "d2-bloodstar" || visualMissile === "d2-shadowbolt" ? "bone" : "fire";
      const boltCount = skill === "Teeth" ? 5 : skill === "Charged Bolt" ? 5 : skill === "Lightning Fury" ? 6 : skill === "Blizzard" ? 3 : 1;
      const color = kind === "lightning" ? "#a9dcff" : kind === "holy" ? "#fff0a8" : kind === "bone" ? "#ddd5c5" : "#ff9c50";
      const perpendicularX = -this.playerFacingY;
      const perpendicularY = this.playerFacingX;
      for (let index = 0; index < boltCount; index += 1) {
        const spread = (index - (boltCount - 1) / 2) * (skill === "Teeth" ? 0.14 : 13);
        const rayX = skill === "Teeth" ? this.playerFacingX + perpendicularX * spread : 0;
        const rayY = skill === "Teeth" ? this.playerFacingY + perpendicularY * spread : 0;
        const rayLength = Math.hypot(rayX, rayY) || 1;
        const teethRange = Math.max(distance + 80, 240);
        this.attackProjectiles.push({
          x: this.playerX, y: this.playerY - 8, startX: this.playerX, startY: this.playerY - 8,
          targetX: skill === "Teeth" ? this.playerX + rayX / rayLength * teethRange : nearest.x + spread,
          targetY: skill === "Teeth" ? this.playerY + rayY / rayLength * teethRange : nearest.y,
          target: skill === "Teeth" ? undefined : nearest, targetId: this.attackSequence++,
          teethFan: skill === "Teeth" ? spread : undefined,
          teethDirectionX: skill === "Teeth" ? this.playerFacingX : undefined,
          teethDirectionY: skill === "Teeth" ? this.playerFacingY : undefined,
          speed: 700, damage: damage * (skill === "Teeth" ? 0.55 : 1), life: Math.max(3, distance / 700 + 1),
          radius: 5, color, kind, missileId: visualMissile,
        });
      }
      this.triggerAttackAnimation(castAnimation);
      return;
    }

    if (distance <= nearest.r + 28) {
      nearest.hp -= damage;
      this.triggerAttackAnimation(castAnimation);
      this.floatingTexts.push({ x: nearest.x, y: nearest.y - nearest.r, text: `-${Math.floor(damage)}`, color: attack.color, life: 0.8 });
    }
  }

  @HostListener("window:pagehide")
  saveProgressBeforeLeaving(): void {
    this.persistRunProgress(true);
  }

  ngAfterViewInit(): void {
    this.loadEnemySprites();
    this.loadSummonSprites();
    this.loadMissileOverlays();
    this.loadCampaignMaps();
    const arenaWrap = this.arenaRef?.nativeElement.parentElement;
    if (arenaWrap && typeof ResizeObserver !== "undefined") {
      this.arenaResizeObserver = new ResizeObserver(() => this.resizeRunCanvases());
      this.arenaResizeObserver.observe(arenaWrap);
    }
    if (this.activeTab === "menu" && this.menuPanel !== "characters") this.startMenuHeroPreview();
  }

  private resizeRunCanvases(): void {
    const arena = this.arenaRef?.nativeElement;
    const character = this.characterCanvasRef?.nativeElement;
    const skillEffects = this.skillEffectsCanvasRef?.nativeElement;
    if (!arena || !character) return;
    const rect = arena.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * Math.min(window.devicePixelRatio || 1, 2)));
    const height = Math.max(1, Math.round(rect.height * Math.min(window.devicePixelRatio || 1, 2)));
    if (arena.width !== width || arena.height !== height) {
      arena.width = width;
      arena.height = height;
    }
    if (character.width !== width || character.height !== height) {
      character.width = width;
      character.height = height;
      this.characterRenderer?.setSize(rect.width, rect.height, false);
    }
    if (skillEffects && (skillEffects.width !== width || skillEffects.height !== height)) {
      skillEffects.width = width;
      skillEffects.height = height;
      skillEffects.getContext("2d", { alpha: true });
    }
    if (this.characterCamera && rect.width > 0 && rect.height > 0) {
      const halfHeight = 250;
      const halfWidth = halfHeight * rect.width / rect.height;
      this.characterCamera.left = -halfWidth;
      this.characterCamera.right = halfWidth;
      this.characterCamera.top = halfHeight;
      this.characterCamera.bottom = -halfHeight;
      this.characterCamera.updateProjectionMatrix();
    }
    this.draw();
    this.renderCharacter();
    this.drawSkillVisualEffects();
  }

  private loadMissileOverlays(): void {
    const missileIds = new Set([
      ...Object.values(SKILL_MISSILE_OVERLAYS),
      ...Object.values(SKILL_VISUAL_MISSILES),
      ...Object.values(BASIC_ATTACK_MISSILE_OVERLAYS),
      ...Object.values(ATTACK_KIND_MISSILE_OVERLAYS),
    ]);
    for (const id of missileIds) {
      const images: HTMLImageElement[] = [];
      this.missileOverlayImages.set(id, images);
      const frameCount = MISSILE_FRAME_COUNTS[id] ?? 1;
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          if (this.activeTab === "run") {
            this.draw();
            this.drawSkillVisualEffects();
          }
        };
        image.onerror = () => {
          if (frameIndex === 0) console.warn(`Could not load missile animation ${id}: ${MISSILE_OVERLAY_BASE}/${id}.webp`);
        };
        image.src = frameCount === 1
          ? `${MISSILE_OVERLAY_BASE}/${id}.webp`
          : `${MISSILE_OVERLAY_BASE}/${id}/${String(frameIndex).padStart(4, "0")}.webp`;
        images.push(image);
      }
    }
  }

  private missileOverlayId(skill: string): string | undefined {
    return SKILL_MISSILE_OVERLAYS[skill]
      ?? SKILL_VISUAL_MISSILES[getD2SkillVisual(skill)]
      ?? BASIC_ATTACK_MISSILE_OVERLAYS[skill];
  }

  private loadSummonSprites(): void {
    const loadSheet = (image: HTMLImageElement, url: string, onReady: (sheet: HTMLCanvasElement) => void): void => {
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          console.warn(`Invalid summon animation sheet: ${url}`);
          return;
        }
        const sheet = document.createElement("canvas");
        sheet.width = image.naturalWidth;
        sheet.height = image.naturalHeight;
        const context = sheet.getContext("2d");
        if (!context) return;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, sheet.width, sheet.height);
        const visited = new Uint8Array(sheet.width * sheet.height);
        const queue: number[] = [];
        const enqueueBackdropPixel = (x: number, y: number): void => {
          const index = y * sheet.width + x;
          if (visited[index]) return;
          visited[index] = 1;
          queue.push(index);
        };
        for (let x = 0; x < sheet.width; x += 1) {
          enqueueBackdropPixel(x, 0);
          enqueueBackdropPixel(x, sheet.height - 1);
        }
        for (let y = 0; y < sheet.height; y += 1) {
          enqueueBackdropPixel(0, y);
          enqueueBackdropPixel(sheet.width - 1, y);
        }
        const rgba = pixels.data;
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const index = queue[cursor];
          const offset = index * 4;
          if (rgba[offset + 3] === 0 || Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]) > 12) continue;
          rgba[offset + 3] = 0;
          const x = index % sheet.width;
          const y = Math.floor(index / sheet.width);
          if (x > 0) enqueueBackdropPixel(x - 1, y);
          if (x + 1 < sheet.width) enqueueBackdropPixel(x + 1, y);
          if (y > 0) enqueueBackdropPixel(x, y - 1);
          if (y + 1 < sheet.height) enqueueBackdropPixel(x, y + 1);
        }
        context.putImageData(pixels, 0, 0);
        onReady(sheet);
        if (this.activeTab === "run") this.draw();
      };
      image.onerror = () => console.warn(`Could not load summon animation: ${url}`);
      image.src = url;
    };
    // The animated skeleton sheet is a single 16-frame walk row.
    loadSheet(this.animatedSkeletonSprite, "assets/d2survivors/enemies/animated/skeleton.png", (sheet) => {
      this.animatedSkeletonFrames = [sheet];
    });
    // Use the supplied D2 skeleton walk sheet for the golem too, recolored with
    // the golem's elemental tint. The imported minotaur atlas has no usable palette.
    loadSheet(this.animatedGolemSprite, "assets/d2survivors/enemies/animated/skeleton.png", (sheet) => {
      const tintedSheet = document.createElement("canvas");
      tintedSheet.width = sheet.width;
      tintedSheet.height = sheet.height;
      const context = tintedSheet.getContext("2d");
      if (!context) return;
      context.drawImage(sheet, 0, 0);
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = "rgba(158, 111, 77, 0.7)";
      context.fillRect(0, 0, tintedSheet.width, tintedSheet.height);
      this.animatedGolemFrames = [tintedSheet];
    });
  }

  private loadEnemySprites(): void {
    for (const species of ENEMY_SPECIES) {
      const layout = ENEMY_SPRITE_LAYOUTS[species];
      const cell = ENEMY_SPRITE_CELLS[species];
      const source = new Image();
      source.onload = () => {
        const columns = layout.columns;
        const rows = layout.rows;
        if (layout.animated && (source.naturalWidth % columns !== 0 || source.naturalHeight % rows !== 0)) {
          console.warn(`Invalid animation sheet layout for ${species}`, source.naturalWidth, source.naturalHeight);
          return;
        }
        const cellSize = layout.animated
          ? { width: source.naturalWidth / columns, height: source.naturalHeight / rows }
          : cell;
        const expectedWidth = columns * cellSize.width;
        const expectedHeight = rows * cellSize.height;
        const canvas = document.createElement("canvas");
        canvas.width = expectedWidth;
        canvas.height = expectedHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (layout.animated) {
          context.drawImage(source, 0, 0, expectedWidth, expectedHeight);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const rgba = pixels.data;
          const cellArea = cellSize.width * cellSize.height;
          for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
              const visited = new Uint8Array(cellArea);
              const queue: number[] = [];
              const enqueue = (x: number, y: number): void => {
                const index = y * cellSize.width + x;
                if (visited[index]) return;
                visited[index] = 1;
                queue.push(index);
              };
              for (let x = 0; x < cellSize.width; x += 1) {
                enqueue(x, 0);
                enqueue(x, cellSize.height - 1);
              }
              for (let y = 0; y < cellSize.height; y += 1) {
                enqueue(0, y);
                enqueue(cellSize.width - 1, y);
              }
              const originX = column * cellSize.width;
              const originY = row * cellSize.height;
              for (let cursor = 0; cursor < queue.length; cursor += 1) {
                const index = queue[cursor];
                const x = index % cellSize.width;
                const y = Math.floor(index / cellSize.width);
                const offset = ((originY + y) * canvas.width + originX + x) * 4;
                if (rgba[offset + 3] === 0 || rgba[offset] >= 12 || rgba[offset + 1] >= 12 || rgba[offset + 2] >= 12) continue;
                rgba[offset + 3] = 0;
                if (x > 0) enqueue(x - 1, y);
                if (x + 1 < cellSize.width) enqueue(x + 1, y);
                if (y > 0) enqueue(x, y - 1);
                if (y + 1 < cellSize.height) enqueue(x, y + 1);
              }
            }
          }
          context.putImageData(pixels, 0, 0);
        } else {
          context.drawImage(source, 0, 0);
        }
        this.enemySprites[species] = {
          image: canvas,
          ...layout,
          columns,
          rows,
          cell: cellSize,
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
    void this.d2SurvivorsService.disconnectLobby();    this.runActive = false;
    this.arenaResizeObserver?.disconnect();
    this.arenaResizeObserver = undefined;
    this.playerWeaponMeshes = [];
    this.playerWeaponBaseQuaternions = [];
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
    const skillEffectsContext = this.skillEffectsCanvasRef?.nativeElement.getContext("2d");
    skillEffectsContext?.clearRect(0, 0, this.skillEffectsCanvasRef?.nativeElement.width ?? 0, this.skillEffectsCanvasRef?.nativeElement.height ?? 0);
    this.skillVisualEffects.length = 0;
    this.stopClassPreview();
    this.stopMenuHeroPreview();
    this.stopAmbientAudio();
    void this.audioContext?.close();
    this.audioContext = undefined;
  }

  private triggerAttackAnimation(style: AttackAnimationStyle = CLASS_ATTACK_ANIMATION[this.selectedClass] ?? "amazonJab"): void {
    this.attackAnimationStyle = style;
    this.attackAnimationTime = 0;
    this.attackAnimationSide = this.attackAnimationSide === -1 ? 1 : -1;
    this.attackAnimationFacing.set(this.playerFacingX, this.playerFacingY).normalize();
    this.attackAnimationTurn = 0;
    const profile = ATTACK_ANIMATION_PROFILES[style];
    if (profile.trail) {
      this.meleeTrailEffects.push({
        style,
        facingX: this.attackAnimationFacing.x,
        facingY: this.attackAnimationFacing.y,
        side: this.attackAnimationSide,
        time: 0,
        duration: profile.duration,
        color: profile.trail,
      });
    }
  }

  private basicAttackForClass(classId: string): { name: string; kind: AttackProjectile["kind"]; color: string; damage: number; cooldown: number } {
    const attacks: Record<string, { name: string; kind: AttackProjectile["kind"]; color: string; damage: number; cooldown: number }> = {
      amazon: { name: "Jab", kind: "melee", color: "#ffd78a", damage: 18, cooldown: 0.72 },
      assassin: { name: "Attack", kind: "melee", color: "#b9d5ff", damage: 16, cooldown: 0.58 },
      barbarian: { name: "Attack", kind: "melee", color: "#ffb36b", damage: 23, cooldown: 0.82 },
      druid: { name: "Attack", kind: "melee", color: "#9dffb1", damage: 17, cooldown: 0.68 },
      necromancer: { name: "Attack", kind: "melee", color: "#e4e0ce", damage: 17, cooldown: 0.72 },
      paladin: { name: "Attack", kind: "melee", color: "#fff0a8", damage: 17, cooldown: 0.72 },
      sorceress: { name: "Attack", kind: "melee", color: "#ffb35c", damage: 16, cooldown: 0.66 },
    };
    return attacks[classId] ?? attacks["amazon"];
  }

  private xpForLevel(level: number): number {
    return 5 + Math.max(0, level - 1) * 3;
  }

  private isKnownSkill(name: string, classId = this.selectedClass): boolean {
    return getClassSkills(classId).some((skill) => skill.name === name) || this.skills.some((skill) => skill.name === name) || name in UPGRADE_DESCRIPTIONS || BASIC_ATTACK_NAMES.includes(name);
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
    if (this.pendingLevelUps > 0) {
      this.keysDown.clear();
      this.prepareUpgradeChoices();
    }
    this.persistRunProgress(true);
  }

  private prepareUpgradeChoices(): void {
    if (this.pendingLevelUps <= 0) { this.upgradeChoices = []; return; }
    const choices: SkillUpgrade[] = [
      { id: "attack-damage", name: `${this.basicAttackName} + damage`, description: `Increase melee attack damage by 6 (currently ${this.basicAttackDamage}).`, kind: "attack" },
      { id: "attack-speed", name: "Faster Attacks", description: `Reduce melee attack cooldown by 10% (currently ${this.basicAttackCooldown.toFixed(2)}s).`, kind: "attack" },
      { id: "multishot", name: "Multishot", description: `Strike one additional nearby monster with your basic attack (rank ${this.skillLevels["Multishot"] ?? 0}).`, kind: "attack" },
      { id: "vitality", name: "Vitality", description: `Gain 5 maximum life and heal 5 life (currently ${this.playerMaxHp}).`, kind: "stat" },
      { id: "weapon-mastery", name: "Weapon Mastery", description: `Increase all melee damage by 4 (rank ${this.skillLevels["Weapon Mastery"] ?? 0}).`, kind: "attack" },
    ];
    const eligibleSkills = this.availableClassSkills;
    const shuffled = eligibleSkills.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      this.skillOfferSeed = (Math.imul(this.skillOfferSeed, 1664525) + 1013904223) >>> 0;
      const swapIndex = this.skillOfferSeed % (index + 1);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    const skillChoices = shuffled.slice(0, 3).map((entry): SkillUpgrade => ({
      id: `class-skill:${entry.name}`,
      name: entry.name,
      description: `Diablo II ${this.selectedClassName} · level ${entry.level} · ${entry.prerequisites.length ? `Requires ${entry.prerequisites.join(", ")}` : "No prerequisites"}. ${this.getSkillDescription(entry.name) ?? "Unlock this class skill."}`,
      kind: "class-skill",
    }));
    const castRateRank = this.skillLevels["Faster Cast Rate"] ?? 0;
    const castRateChoice: SkillUpgrade = {
      id: "cast-rate",
      name: "Faster Cast Rate",
      description: `Reduce every spell's cooldown by 10% (rank ${castRateRank}/6; each spell keeps its own timer).`,
      kind: "attack",
    };
    const randomChoices = [...skillChoices, ...(castRateRank < 6 ? [castRateChoice] : [])];
    for (let index = randomChoices.length - 1; index > 0; index -= 1) {
      this.skillOfferSeed = (Math.imul(this.skillOfferSeed, 1664525) + 1013904223) >>> 0;
      const swapIndex = this.skillOfferSeed % (index + 1);
      [randomChoices[index], randomChoices[swapIndex]] = [randomChoices[swapIndex], randomChoices[index]];
    }
    const fallback = choices.slice().sort((a, b) => hashString(`${this.playerLevel}:${a.id}`) - hashString(`${this.playerLevel}:${b.id}`));
    const offer = randomChoices.slice(0, 3);
    for (const choice of fallback) {
      if (offer.length >= 3) break;
      offer.push(choice);
    }
    this.upgradeChoices = offer;
    this.levelUpNotice = `Level ${this.playerLevel} reached — choose an upgrade.`;
  }

  private updateAutomaticSkillCasts(dt: number): void {
    const seconds = dt / 1000;
    const classSkills = getClassSkills(this.selectedClass);
    const activeSkills = this.ownedSkills.filter((skill) =>
      skill !== this.basicAttackName && classSkills.some((definition) => definition.name === skill),
    );
    const livingEnemies = this.enemies.filter((enemy) => enemy.hp > 0);
    for (const skill of activeSkills) {
      if (this.isPersistentSummonSkill(skill)) {
        const existing = this.enemies.some((enemy) => enemy.summonSkill === skill && enemy.hp > 0);
        if (!existing) this.activateOwnedSkill(skill);
        this.skillCastCooldowns[skill] = Number.POSITIVE_INFINITY;
        continue;
      }
      const cooldown = Math.max(0, (this.skillCastCooldowns[skill] ?? 0) - seconds);
      this.skillCastCooldowns[skill] = cooldown;
      if (cooldown > 0) continue;
      const visual = classSkills.find((definition) => definition.name === skill)?.visual ?? getD2SkillVisual(skill);
      // Auras and buffs activate once and stay active; combat skills wait for a target.
      if (visual !== "aura" && !livingEnemies.some((enemy) => enemy.hp > 0)) continue;
      this.activateOwnedSkill(skill);
      this.skillCastCooldowns[skill] = visual === "aura" ? Number.POSITIVE_INFINITY : this.getSkillCastInterval(skill);
    }
    for (const skill of Object.keys(this.skillCastCooldowns)) {
      if (!activeSkills.includes(skill)) delete this.skillCastCooldowns[skill];
    }
  }

  private updateBasicAttack(): void {
    if (!this.runActive || this.pendingLevelUps > 0 || this.attackCooldown > 0) return;
    const target = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((a, b) => Math.hypot(a.x - this.playerX, a.y - this.playerY) - Math.hypot(b.x - this.playerX, b.y - this.playerY))[0];
    if (!target) return;

    const attack = this.basicAttackForClass(this.selectedClass);
    const attackLevel = this.skillLevels[this.basicAttackName] ?? 1;
    const damage = this.basicAttackDamage + (attackLevel - 1) * 2 + (this.skillLevels["Weapon Mastery"] ?? 0) * 4 + this.equippedWeaponDamage;
    const distance = Math.hypot(target.x - this.playerX, target.y - this.playerY);
    this.playerFacingX = (target.x - this.playerX) / Math.max(1, distance);
    this.playerFacingY = (target.y - this.playerY) / Math.max(1, distance);
    if (distance <= target.r + 28) {
      target.hp -= damage;
      this.triggerAttackAnimation();
      this.floatingTexts.push({ x: target.x, y: target.y - target.r - 8, text: `-${damage}`, color: attack.color, life: 0.65 });
      this.attackCooldown = this.basicAttackCooldown;
    } else {
      // Move into weapon range before applying damage: a melee basic attack never becomes a missile.
      this.attackCooldown = Math.min(0.12, this.basicAttackCooldown);
    }
  }

  chooseLevelUpgrade(choice: SkillUpgrade): void {
    if (!this.upgradeChoices.some((candidate) => candidate.id === choice.id) || this.pendingLevelUps <= 0) return;
    if (choice.id.startsWith("class-skill:")) {
      const skillName = choice.id.slice("class-skill:".length);
      if (!this.availableClassSkills.some((entry) => entry.name === skillName)) return;
      this.skillLevels[skillName] = Math.min(20, (this.skillLevels[skillName] ?? 0) + 1);
      if (!this.ownedSkills.includes(skillName)) {
        this.ownedSkills.push(skillName);
        this.skillCastCooldowns[skillName] = this.getSkillCastInterval(skillName);
      }
      this.pendingLevelUps -= 1;
      this.upgradeChoices = [];
      this.levelUpNotice = this.pendingLevelUps > 0 ? `${this.pendingLevelUps} more level upgrade${this.pendingLevelUps === 1 ? "" : "s"} to choose.` : "Skill point spent.";
      if (this.pendingLevelUps > 0) this.prepareUpgradeChoices();
      this.persistRunProgress(true);
      return;
    }
    switch (choice.id) {
      case "attack-damage": this.basicAttackDamage += 6; this.skillLevels[this.basicAttackName] = (this.skillLevels[this.basicAttackName] ?? 1) + 1; break;
      case "attack-speed": this.basicAttackCooldown = Math.max(0.18, this.basicAttackCooldown * 0.9); this.skillLevels["Faster Attacks"] = (this.skillLevels["Faster Attacks"] ?? 0) + 1; break;
      case "cast-rate": {
        const nextRank = Math.min(6, (this.skillLevels["Faster Cast Rate"] ?? 0) + 1);
        this.skillLevels["Faster Cast Rate"] = nextRank;
        for (const skill of this.ownedSkills) {
          if (skill !== this.basicAttackName) {
            this.skillCastCooldowns[skill] = Math.min(this.skillCastCooldowns[skill] ?? 0, this.getSkillCastInterval(skill));
          }
        }
        break;
      }
      case "multishot": this.skillLevels["Multishot"] = (this.skillLevels["Multishot"] ?? 0) + 1; break;
      case "vitality": this.playerMaxHp += 5; this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 5); this.skillLevels["Vitality"] = (this.skillLevels["Vitality"] ?? 0) + 1; break;
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
    const damage = this.basicAttackDamage + (attackLevel - 1) * 2 + (this.skillLevels["Weapon Mastery"] ?? 0) * 4 + this.equippedWeaponDamage;
    let landedMeleeAttack = false;
    for (const target of targets) {
      const distance = Math.hypot(target.x - this.playerX, target.y - this.playerY);
      this.playerFacingX = (target.x - this.playerX) / Math.max(1, distance);
      this.playerFacingY = (target.y - this.playerY) / Math.max(1, distance);
      if (distance <= target.r + 28) {
        target.hp -= damage;
        landedMeleeAttack = true;
        this.floatingTexts.push({ x: target.x, y: target.y - target.r - 8, text: `-${damage}`, color: attack.color, life: 0.65 });
      }
    }
    if (landedMeleeAttack) this.triggerAttackAnimation();
    this.attackCooldown = this.basicAttackCooldown;
  }

  private updateAttackProjectiles(dt: number): void {
    const seconds = dt / 1000;
    for (const projectile of this.attackProjectiles) {
      projectile.life -= seconds;
      if (projectile.teethFan !== undefined) {
        const deltaX = projectile.targetX - projectile.x;
        const deltaY = projectile.targetY - projectile.y;
        const distance = Math.hypot(deltaX, deltaY);
        const step = projectile.speed * seconds / this.worldZoom;
        const travel = Math.min(step, distance);
        const nextX = projectile.x + (distance > 0 ? deltaX / distance * travel : 0);
        const nextY = projectile.y + (distance > 0 ? deltaY / distance * travel : 0);
        const segmentX = nextX - projectile.x;
        const segmentY = nextY - projectile.y;
        const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
        const hit = this.enemies
          .filter((enemy) => enemy.hp > 0)
          .map((enemy) => {
            const relativeX = enemy.x - projectile.x;
            const relativeY = enemy.y - projectile.y;
            const along = segmentLengthSquared > 0
              ? Math.max(0, Math.min(1, (relativeX * segmentX + relativeY * segmentY) / segmentLengthSquared))
              : 0;
            const miss = Math.hypot(relativeX - along * segmentX, relativeY - along * segmentY);
            return { enemy, along, miss };
          })
          .filter(({ enemy, miss }) => miss <= enemy.r + 7)
          .sort((a, b) => a.along - b.along)[0]?.enemy;
        if (hit) {
          hit.hp -= projectile.damage;
          projectile.life = 0;
          this.floatingTexts.push({ x: hit.x, y: hit.y - hit.r - 8, text: `-${Math.floor(projectile.damage)}`, color: projectile.color, life: 0.65 });
        } else if (distance <= step) {
          projectile.life = 0;
        } else {
          projectile.x = nextX;
          projectile.y = nextY;
        }
        continue;
      }
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
        projectile.x += dx / distance * step / this.worldZoom;
        projectile.y += dy / distance * step / this.worldZoom;
      }
    }
    this.attackProjectiles = this.attackProjectiles.filter((projectile) => projectile.life > 0);
  }

  private drawMeleeTrail(ctx: CanvasRenderingContext2D, effect: MeleeTrailEffect): void {
    const progress = Math.max(0, Math.min(1, effect.time / effect.duration));
    const strike = attackMotionCurve(progress, effect.style);
    const fade = Math.sin(Math.PI * progress);
    if (fade <= 0.01) return;
    const center = this.projectArenaPoint(this.playerX, this.playerY);
    const facing = this.projectArenaPoint(this.playerX + effect.facingX, this.playerY + effect.facingY);
    const angle = Math.atan2(facing.y - center.y, facing.x - center.x);
    const profile = ATTACK_ANIMATION_PROFILES[effect.style];
    const arc = profile.trailArc ?? 1.6;
    const sweep = strike * (effect.style === "barbarianCleave" ? 0.42 : 0.24) * effect.side;
    const startAngle = effect.style === "spin" ? 0 : angle - arc / 2 + sweep;
    const endAngle = effect.style === "spin" ? Math.PI * 2 : angle + arc / 2 + sweep;
    const radius = effect.style === "barbarianCleave" ? 36 + Math.max(0, strike) * 12 : 31 + Math.max(0, strike) * 10;
    ctx.save();
    ctx.globalAlpha = Math.min(0.88, fade * 0.9);
    ctx.lineCap = "round";
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 13;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = effect.style === "barbarianCleave" || effect.style === "spin" ? 3.5 : 3;
    ctx.beginPath();
    ctx.arc(center.x, center.y - 12, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff4d2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center.x, center.y - 12, radius - 3, startAngle + 0.12, endAngle - 0.12);
    ctx.stroke();
    ctx.restore();
  }

  private drawAttackProjectile(ctx: CanvasRenderingContext2D, projectile: AttackProjectile): void {
    if (projectile.kind === "melee") return;
    const point = this.projectArenaPoint(projectile.x, projectile.y);
    const start = this.projectArenaPoint(projectile.startX, projectile.startY);
    const missileId = projectile.missileId ?? ATTACK_KIND_MISSILE_OVERLAYS[projectile.kind];
    if (projectile.teethFan !== undefined) {
      this.drawBoneTooth(ctx, point, start, projectile);
      return;
    }
    const overlays = this.missileOverlayImages.get(missileId);
    const frameDuration = MISSILE_FRAME_DURATIONS_MS[missileId] ?? 85;
    const desiredFrame = overlays?.length ? Math.floor(performance.now() / frameDuration) % overlays.length : 0;
    let overlay = overlays?.[desiredFrame];
    if (!overlay?.complete || overlay.naturalWidth === 0) {
      overlay = overlays?.find((image) => image.complete && image.naturalWidth > 0);
    }
    if (overlay?.complete && overlay.naturalWidth > 0) {
      const direction = Math.atan2(projectile.targetY - projectile.startY, projectile.targetX - projectile.startX);
      const maxFrameSize = ["fireball", "bloodcomet"].includes(missileId) ? 72 : 54;
      const frameScale = Math.min(1.25, Math.max(0.42, maxFrameSize / Math.max(overlay.naturalWidth, overlay.naturalHeight)));
      const imageWidth = overlay.naturalWidth * frameScale * this.worldZoom;
      const imageHeight = overlay.naturalHeight * frameScale * this.worldZoom;
      ctx.save();
      ctx.translate(point.x, point.y - 8);
      ctx.rotate(direction);
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 7;
      // DCC uses a grayscale default palette until the native game palette is supplied.
      ctx.drawImage(overlay, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
      ctx.restore();
      return;
    }
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

  private drawBoneTooth(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    start: { x: number; y: number },
    projectile: AttackProjectile,
  ): void {
    const progress = Math.min(1, Math.hypot(projectile.x - projectile.startX, projectile.y - projectile.startY)
      / (Math.hypot(projectile.targetX - projectile.startX, projectile.targetY - projectile.startY) || 1));
    const directionX = projectile.teethDirectionX ?? 1;
    const directionY = projectile.teethDirectionY ?? 0;
    const fan = (projectile.teethFan ?? 0) * progress;
    const x = point.x - directionY * fan * this.worldZoom * 0.7071;
    const y = point.y + directionX * fan * this.worldZoom * 0.35355;
    const angle = Math.atan2(y - start.y, x - start.x);
    const length = (24 + Math.min(9, Math.abs(projectile.teethFan ?? 0) * 0.32)) * this.worldZoom;
    const width = 7 * this.worldZoom;

    ctx.save();
    ctx.translate(x, y - 8);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "#d7c8a8";
    ctx.shadowBlur = 5;
    ctx.fillStyle = "#d8ccb1";
    ctx.strokeStyle = "#665943";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(length * 0.72, 0);
    ctx.lineTo(length * 0.05, -width * 0.5);
    ctx.lineTo(-length * 0.18, -width * 0.22);
    ctx.lineTo(-length * 0.62, 0);
    ctx.lineTo(-length * 0.18, width * 0.22);
    ctx.lineTo(length * 0.05, width * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f5ecd7";
    ctx.beginPath();
    ctx.moveTo(length * 0.62, 0);
    ctx.lineTo(-length * 0.12, -width * 0.14);
    ctx.lineTo(-length * 0.48, 0);
    ctx.lineTo(-length * 0.12, width * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  startRun(): void {
    this.hasSavedRun = true;
    this.runActive = false;
    this.persistRunProgress(true);
    this.deathRecovery = false;
    this.deathCount = 0;
    this.lobbyRunId = createRunId();
    this.runKillCount = 0;
    this.stopMenuHeroPreview();
    this.runActive = false;
    this.saveStatus = "";
    this.stopClassPreview();
    this.stopAmbientAudio();
    this.ambientAudioStatus = "Ambience muted";
    this.runActive = false;
    this.activeTab = "run";
    this.menuPanel = "main";
    this.currentAct = 1;
    this.actTime = 0;
    this.actTransitionReady = false;
    this.campaignVictory = false;
    this.actBossSpawned = false;
    this.currentChunkCoordX = 0;
    this.currentChunkCoordY = 0;
    this.currentChunkLocalX = this.chunkTileColumns * 48 / 2;
    this.currentChunkLocalY = this.chunkTileRows * 48 / 2;
    this.playerX = this.arenaW / 2;
    this.playerY = this.arenaH / 2;
    const startingStats = this.classStartingStats[this.selectedClass] ?? this.classStartingStats["amazon"];
    this.playerMaxHp = Math.max(400, startingStats.life) + this.sanctuaryBonuses.maxLife * 50;
    this.playerMaxMana = startingStats.mana;
    this.playerHp = this.playerMaxHp;
    this.playerMana = this.playerMaxMana;
    this.playerGold = this.sanctuaryGold;
    const basicAttack = this.basicAttackForClass(this.selectedClass);
    this.playerLevel = 1;
    this.playerXp = 0;
    this.pendingLevelUps = 0;
    this.skillOfferSeed = Math.floor(Math.random() * 0x7fffffff);
    this.xpToNextLevel = this.xpForLevel(1);
    this.basicAttackName = basicAttack.name;
    this.basicAttackCooldown = basicAttack.cooldown;
    this.basicAttackDamage = basicAttack.damage + this.sanctuaryBonuses.attackDamage * 2;
    this.attackCooldown = 0;
    this.attackSequence = 0;
    this.attackProjectiles = [];
    this.skillTreeOpen = false;
    this.attackAnimationTime = Number.POSITIVE_INFINITY;
    this.attackAnimationStyle = CLASS_ATTACK_ANIMATION[this.selectedClass] ?? "amazonJab";
    this.attackAnimationSide = -1;
    this.upgradeChoices = [];
    this.levelUpNotice = "";
    this.ownedSkills = [this.basicAttackName];
    for (const skill of Object.keys(this.skillCastCooldowns)) delete this.skillCastCooldowns[skill];
    this.skillLevels = { [this.basicAttackName]: 1 };
    this.enemies = [];
    for (let index = 0; index < 5; index += 1) this.enemies.push(this.makeEnemy("normal"));
    this.chests = [];
    this.potionDrops = [];
    this.goldDrops = [];
    this.floatingTexts = [];
    this.activeBottleSlot = Math.min(this.activeBottleSlot, this.beltRows * 4 - 1);
    this.escapeMenuOpen = false;
    this.inventoryOpen = false;
    this.skillTreeOpen = false;
    this.combatOrbsTime = 0;
    this.rebuildInventoryGrid();
    const transferredStashIds = new Set<string>();
    for (const item of this.sanctuaryStash) {
      if (this.addInventoryItem({ ...item, stats: item.stats ? { ...item.stats } : undefined })) transferredStashIds.add(item.id);
    }
    this.sanctuaryStash = this.sanctuaryStash.filter((item) => !transferredStashIds.has(item.id));
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
    this.restoreSummonsFromOwnedSkills();
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
      if (this.campaignVictory) this.draw();
      if (this.skillVisualEffects.length && this.activeTab !== "run") {
        this.skillVisualEffects.length = 0;
        this.drawSkillVisualEffects();
        this.rafId = 0;
        return;
      }
      for (const effect of this.skillVisualEffects) effect.time += dt / 1000;
      for (let index = this.skillVisualEffects.length - 1; index >= 0; index -= 1) {
        if (this.skillVisualEffects[index].time >= this.skillVisualEffects[index].duration) this.skillVisualEffects.splice(index, 1);
      }
      this.drawSkillVisualEffects();
      if (this.skillVisualEffects.length) {
        this.rafId = requestAnimationFrame((time) => this.loop(time));
      } else {
        this.rafId = 0;
      }
      return;
    }
    if (!this.escapeMenuOpen && !this.inventoryOpen && !this.skillTreeOpen && !this.actTransitionReady && !this.campaignVictory && this.pendingLevelUps === 0) this.update(dt);
    else {
      this.isPlayerMoving = false;
      this.playerMoveX = 0;
      this.playerMoveY = 0;
    }
    this.playerAnimationDelta = dt;
    this.draw();
    this.renderCharacter();
    this.drawSkillVisualEffects();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt: number): void {
    this.runTime += dt / 1000;
    this.actTime += dt / 1000;
    this.combatOrbsTime = Math.max(0, this.combatOrbsTime - dt / 1000);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt / 1000);

    this.movePlayer(dt);

    this.updateAttackProjectiles(dt);
    if (this.pendingLevelUps > 0 && this.upgradeChoices.length === 0) this.prepareUpgradeChoices();
    if (this.pendingLevelUps > 0) this.attackProjectiles = [];
    else {
      this.updateBasicAttack();
      this.updateAutomaticSkillCasts(dt);
    }

    this.updateSummonAttacks(dt);
    this.updateEnemies(dt);
    this.updateChests(dt);
    this.updatePotionDrops(dt);
    this.updateGoldDrops(dt);
    this.updateFloatingTexts(dt);
    this.updateSkillVisualEffects(dt);
    this.spawnEnemies(dt);
    this.spawnChests(dt);
    this.persistRunProgress();
  }

  movePlayer(dt: number): void {
    const speed = 220 / this.worldZoom;
    const move = speed * (dt / 1000);
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
    const chunkWidth = this.chunkTileColumns * 48;
    const chunkHeight = this.chunkTileRows * 48;
    // Floor coordinates are tile-grid units, while entities use gameplay units.
    // Convert camera motion to tile-grid units so the scaled floor and loot move together.
    this.currentChunkLocalX += dx / this.floorTileScale;
    this.currentChunkLocalY += dy / this.floorTileScale;
    while (this.currentChunkLocalX < 0) { this.currentChunkLocalX += chunkWidth; this.currentChunkCoordX -= 1; }
    while (this.currentChunkLocalX >= chunkWidth) { this.currentChunkLocalX -= chunkWidth; this.currentChunkCoordX += 1; }
    while (this.currentChunkLocalY < 0) { this.currentChunkLocalY += chunkHeight; this.currentChunkCoordY -= 1; }
    while (this.currentChunkLocalY >= chunkHeight) { this.currentChunkLocalY -= chunkHeight; this.currentChunkCoordY += 1; }
    this.translateWorldEntities(-dx, -dy);
    this.playerX = this.arenaW / 2;
    this.playerY = this.arenaH / 2;
    this.playerMoveX = dx;
    this.playerMoveY = dy;
    this.isPlayerMoving = Math.hypot(dx, dy) > 0.01;
    if (this.isPlayerMoving) {
      this.playerFacingX = this.playerMoveX / Math.hypot(this.playerMoveX, this.playerMoveY);
      this.playerFacingY = this.playerMoveY / Math.hypot(this.playerMoveX, this.playerMoveY);
    }
  }

  private translateWorldEntities(offsetX: number, offsetY: number): void {
    if (!offsetX && !offsetY) return;
    for (const enemy of this.enemies) {
      enemy.x += offsetX;
      enemy.y += offsetY;
    }
    for (const chest of this.chests) {
      chest.x += offsetX;
      chest.y += offsetY;
    }
    for (const drop of this.potionDrops) {
      drop.x += offsetX;
      drop.y += offsetY;
    }
    for (const drop of this.goldDrops) {
      drop.x += offsetX;
      drop.y += offsetY;
    }
    for (const projectile of this.attackProjectiles) {
      projectile.x += offsetX;
      projectile.y += offsetY;
      projectile.startX += offsetX;
      projectile.startY += offsetY;
      projectile.targetX += offsetX;
      projectile.targetY += offsetY;
    }
    for (const text of this.floatingTexts) {
      text.x += offsetX;
      text.y += offsetY;
    }
  }

  private isPersistentSummonSkill(skill: string): boolean {
    return this.selectedClass === "necromancer" && /^(Raise Skeleton|Skeletal Mage|Clay Golem|Blood Golem|Iron Golem|Fire Golem|Revive)$/.test(skill);
  }

  private restoreSummonsFromOwnedSkills(): void {
    for (const skill of this.ownedSkills) {
      if (this.isPersistentSummonSkill(skill) && !this.enemies.some((enemy) => enemy.summonSkill === skill && enemy.hp > 0)) {
        this.summonCompanion(skill);
      }
    }
  }

  private summonCompanion(skill: string): void {
    if (!this.isPersistentSummonSkill(skill) || this.enemies.some((enemy) => enemy.summonSkill === skill && enemy.hp > 0)) return;
    const rank = this.skillLevels[skill] ?? 1;
    const playerMastery = this.skillLevels["Skeleton Mastery"] ?? 0;
    const golemMastery = this.skillLevels["Golem Mastery"] ?? 0;
    const isGolem = /Golem$/.test(skill);
    const isMage = skill === "Skeletal Mage";
    const baseHealth = skill === "Fire Golem" ? 220 : skill === "Iron Golem" ? 280 : skill === "Blood Golem" ? 320 : isGolem ? 260 : isMage ? 95 : 125;
    const health = Math.round(baseHealth * (1 + (rank - 1) * 0.18 + (isGolem ? golemMastery * 0.25 : playerMastery * 0.2)));
    const damage = Math.round((isGolem ? 17 : isMage ? 13 : 15) * (1 + (rank - 1) * 0.12 + (isGolem ? golemMastery * 0.1 : playerMastery * 0.2)));
    const position = this.summonFollowPosition(this.enemies.filter((enemy) => enemy.summonType));
    const companion: Enemy = {
      kind: "normal",
      species: isGolem ? "minotaur" : "skeleton",
      campaignBoss: false,
      spriteFrame: 0,
      summonType: isGolem ? "golem" : "skeleton",
      summonSkill: skill,
      summonAttackCooldown: 0.45 + Math.random() * 0.25,
      x: position.x,
      y: position.y,
      hp: health,
      maxHp: health,
      speed: isGolem ? 135 : 155,
      r: isGolem ? 19 : 12,
      dmg: damage,
    };
    this.enemies.push(companion);
    this.floatingTexts.push({ x: position.x, y: position.y - 18, text: skill.toUpperCase(), color: "#d7c5aa", life: 1.2 });
  }

  private summonFollowPosition(summons: Enemy[]): { x: number; y: number } {
    const index = summons.length;
    const angle = index * Math.PI * 0.72 + Math.PI * 0.25;
    const radius = 66 + (index % 2) * 22;
    return { x: this.playerX + Math.cos(angle) * radius, y: this.playerY + Math.sin(angle) * radius };
  }

  updateEnemies(dt: number): void {
    const livingEnemies = this.enemies.filter((enemy) => !enemy.summonType && enemy.hp > 0);
    const summons = this.enemies.filter((enemy) => !!enemy.summonType && enemy.hp > 0);
    for (let index = 0; index < summons.length; index += 1) {
      const summon = summons[index];
      summon.summonAttackCooldown = Math.max(0, (summon.summonAttackCooldown ?? 0) - dt / 1000);
      const target = livingEnemies
        .filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY) < 360)
        .sort((a, b) => Math.hypot(a.x - summon.x, a.y - summon.y) - Math.hypot(b.x - summon.x, b.y - summon.y))[0];
      let targetX: number;
      let targetY: number;
      if (target) {
        targetX = target.x;
        targetY = target.y;
        const distance = Math.hypot(target.x - summon.x, target.y - summon.y) || 1;
        const attackRange = summon.summonType === "golem" ? 38 : summon.summonSkill === "Skeletal Mage" ? 150 : 34;
        if (distance > attackRange) {
          const step = summon.speed * dt / 1000 / this.worldZoom;
          summon.x += (target.x - summon.x) / distance * Math.min(step, distance - attackRange * 0.7);
          summon.y += (target.y - summon.y) / distance * Math.min(step, distance - attackRange * 0.7);
        } else if (summon.summonAttackCooldown <= 0) {
          this.summonAttack(summon, target);
        }
      } else {
        const desired = this.summonFollowPosition(summons.slice(0, index));
        targetX = desired.x;
        targetY = desired.y;
        const distance = Math.hypot(targetX - summon.x, targetY - summon.y);
        if (distance > 25) {
          const step = summon.speed * dt / 1000 / this.worldZoom;
          summon.x += (targetX - summon.x) / distance * Math.min(step, distance);
          summon.y += (targetY - summon.y) / distance * Math.min(step, distance);
        }
      }
    }

    for (const enemy of this.enemies) {
      if (enemy.summonType) continue;
      const dx = this.playerX - enemy.x;
      const dy = this.playerY - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const speed = enemy.speed * (dt / 1000) / this.worldZoom;
      enemy.x += (dx / distance) * speed;
      enemy.y += (dy / distance) * speed;
      if (enemy.cd !== undefined) enemy.cd = Math.max(0, enemy.cd - dt / 1000);
      if (distance < enemy.r + 18 && (enemy.cd === undefined || enemy.cd <= 0)) {
        const armorReduction = this.equippedArmor / (this.equippedArmor + 100);
        this.playerHp -= Math.max(1, enemy.dmg * (1 - armorReduction));
        enemy.cd = enemy.kind === "boss" ? 1.1 : enemy.kind === "champion" ? 0.9 : 0.8;
      }
    }
    const defeatedEnemies = this.enemies.filter((enemy) => !enemy.summonType && enemy.hp <= 0);
    for (const enemy of defeatedEnemies) {
      this.grantExperience(enemy.kind === "boss" ? 8 : enemy.kind === "champion" ? 3 : 1);
      this.maybeDropGold(enemy);
    }
    this.runKillCount += defeatedEnemies.length;
    if (defeatedEnemies.some((enemy) => enemy.campaignBoss)) {
      this.actTransitionReady = true;
      this.floatingTexts.push({ x: this.playerX, y: this.playerY - 48, text: `ACT ${this.currentAct} BOSS DEFEATED`, color: "#ffd27a", life: 3 });
      this.persistRunProgress(true);
    }
    if (this.playerHp <= 0 && !this.consumeRejuvenationPotion()) {
      this.endRun(false);
    }
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0 && this.playerHp > 0);
  }

  updateChests(dt: number): void {
    this.openChestCount = 0;
    for (const chest of this.chests) {
      if (!chest.open) {
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
      this.floatingTexts.push({ x: drop.x, y: drop.y - 18, text: `${drop.kind.toUpperCase()} POTION`, color: drop.kind === "health" ? "#ff7171" : "#d68cff", life: 2 });
    }
    this.potionDrops = this.potionDrops.filter((drop) => !drop.collected && drop.life > 0);
  }

  updateGoldDrops(dt: number): void {
    let collectedGold = false;
    for (const drop of this.goldDrops) {
      drop.bob += dt / 1000;
      drop.life -= dt / 1000;
      drop.pickupDelay = Math.max(0, drop.pickupDelay - dt / 1000);
      if (drop.pickupDelay > 0 || Math.hypot(this.playerX - drop.x, this.playerY - drop.y) >= 34) continue;
      this.playerGold = Math.min(1_000_000_000, this.playerGold + drop.amount);
      this.sanctuaryGold = Math.min(1_000_000_000, this.sanctuaryGold + drop.amount);
      drop.life = 0;
      collectedGold = true;
      this.floatingTexts.push({ x: drop.x, y: drop.y - 20, text: `+${drop.amount} gold`, color: "#ffd45e", life: 1.4 });
    }
    this.goldDrops = this.goldDrops.filter((drop) => drop.life > 0);
    if (collectedGold) this.persistRunProgress(true);
  }

  private addSkillVisualEffect(skillName: string, target?: Enemy): void {
    const definition = getClassSkills(this.selectedClass).find((entry) => entry.name === skillName);
    const kind = definition?.visual ?? getD2SkillVisual(skillName);
    const targetDistance = target ? Math.hypot(target.x - this.playerX, target.y - this.playerY) || 1 : 1;
    const facingX = target ? (target.x - this.playerX) / targetDistance : this.playerFacingX;
    const facingY = target ? (target.y - this.playerY) / targetDistance : this.playerFacingY;
    const visualTargetDistance = Math.min(targetDistance, 220);
    this.skillVisualEffects.push({
      name: skillName,
      kind,
      x: this.playerX,
      y: this.playerY,
      targetX: this.playerX + facingX * visualTargetDistance,
      targetY: this.playerY + facingY * visualTargetDistance,
      facingX,
      facingY,
      targetEnemy: !!target && (kind === "projectile" || kind === "strike"),
      time: 0,
      duration: kind === "summon" ? 1.8 : kind === "projectile" ? target ? Math.min(0.9, Math.max(0.32, targetDistance / 520)) : 0.9 : 1.25,
      color: this.skillVisualColorForName(skillName, kind),
      seed: hashString(skillName) % 628,
    });
    if (this.skillVisualEffects.length > 24) this.skillVisualEffects.splice(0, this.skillVisualEffects.length - 24);
    this.drawSkillVisualEffects();
    if (this.activeTab === "run" && !this.rafId) {
      this.rafId = requestAnimationFrame((time) => this.loop(time));
    }
  }

  private skillVisualColor(kind: D2SkillVisual): string {
    if (kind === "aura") return this.selectedClass === "paladin" ? "#ffe8a0" : "#9dcaff";
    if (kind === "summon") return this.selectedClass === "necromancer" ? "#d7c7ff" : "#b9f09a";
    if (kind === "trap") return "#ffc56e";
    if (kind === "wave") return this.selectedClass === "barbarian" ? "#ffbd6d" : "#b7c8ff";
    if (kind === "burst") return this.selectedClass === "sorceress" ? "#8edbff" : "#ff9d62";
    if (kind === "movement") return "#f5d58f";
    if (kind === "projectile") return this.selectedClass === "sorceress" ? "#ffab62" : "#a9dcff";
    return this.selectedClass === "barbarian" ? "#ffc06a" : "#e7d5ad";
  }

  private skillVisualColorForName(skillName: string, kind: D2SkillVisual): string {
    const name = skillName.toLowerCase();
    if (/fire|inferno|blaze|meteor|volcano|molten/.test(name)) return "#ff8a32";
    if (/cold|ice|frost|freeze|blizzard|hurricane/.test(name)) return "#8bdcff";
    if (/lightning|thunder|shock|charged|static/.test(name)) return "#a5c9ff";
    if (/poison|rabies|creeper|vine/.test(name)) return "#9bdb56";
    if (/bone|skeleton|golem|revive|raise/.test(name)) return "#d7c5aa";
    if (/holy|blessed|paladin|prayer|redemption|sanctuary/.test(name)) return "#ffe28a";
    if (/shadow|curse|terror|confuse|vision|taunt|howl/.test(name)) return "#b99cff";
    return this.skillVisualColor(kind);
  }

  private updateSkillVisualEffects(dt: number): void {
    const seconds = dt / 1000;
    for (const effect of this.skillVisualEffects) {
      effect.time += seconds;
      effect.x = this.playerX;
      effect.y = this.playerY;
      if (!effect.targetEnemy) {
        effect.targetX = this.playerX + effect.facingX * 110;
        effect.targetY = this.playerY + effect.facingY * 110;
      }
    }
    for (let index = this.skillVisualEffects.length - 1; index >= 0; index -= 1) {
      if (this.skillVisualEffects[index].time >= this.skillVisualEffects[index].duration) this.skillVisualEffects.splice(index, 1);
    }
    this.drawSkillVisualEffects();
  }

  private drawSkillVisualEffects(): void {
    const canvas = this.skillEffectsCanvasRef?.nativeElement;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const effect of this.skillVisualEffects) this.drawSkillVisualEffect(ctx, effect);
  }

  private drawSkillVisualEffect(ctx: CanvasRenderingContext2D, effect: SkillVisualEffect): void {
    const canvas = this.skillEffectsCanvasRef?.nativeElement;
    if (!canvas) return;
    const progress = Math.max(0, Math.min(1, effect.time / effect.duration));
    const fade = effect.kind === "projectile" ? 0.9 * (1 - progress * 0.25) : Math.sin(Math.PI * progress);
    if (fade <= 0.01) return;
    const origin = this.projectArenaPoint(effect.x, effect.y);
    const target = this.projectArenaPoint(effect.targetX, effect.targetY);
    const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
    const animationFrame = Math.floor(performance.now() / 60);
    const missileId = this.missileOverlayId(effect.name) ?? ATTACK_KIND_MISSILE_OVERLAYS[this.basicAttackForClass(this.selectedClass).kind];
    const missileFrames = missileId ? this.missileOverlayImages.get(missileId) : undefined;
    const frameCount = missileFrames?.length ?? 0;
    const frameDuration = MISSILE_FRAME_DURATIONS_MS[missileId ?? ""] ?? 85;
    const frameIndex = frameCount > 1
      ? Math.floor(performance.now() / frameDuration) % frameCount
      : 0;
    let missileFrame = effect.name === "Teeth" ? undefined : frameCount ? missileFrames?.[frameIndex] : undefined;
    if (effect.name !== "Teeth" && (!missileFrame?.complete || missileFrame.naturalWidth === 0)) {
      missileFrame = missileFrames?.find((image) => image.complete && image.naturalWidth > 0);
    }
    const icon = this.skillIcon(effect.name);
    const label = effect.name.toUpperCase();
    const radius = 22 + progress * (effect.kind === "wave" || effect.kind === "burst" ? 76 : 42);
    ctx.save();
    ctx.translate(origin.x, origin.y - 10);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.min(0.95, fade);
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = effect.kind === "aura" ? 16 : 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (effect.kind === "projectile" && effect.name === "Teeth") {
      // Teeth is rendered as individual bone shards on the arena canvas below.
      // Do not layer the unrelated purple-star missile over the skill effect.
    } else if (effect.kind === "projectile") {
      const projectileProgress = effect.targetEnemy
        ? Math.min(1, Math.max(0.08, effect.time / effect.duration))
        : progress;
      const x = (target.x - origin.x) * projectileProgress;
      const y = (target.y - origin.y) * projectileProgress;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke();
      if (missileFrame?.complete && missileFrame.naturalWidth > 0) {
        const size = effect.name === "Meteor" ? 42 : 34;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.shadowBlur = 0;
        ctx.drawImage(missileFrame, x - size / 2, y - size / 2, size, size); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, y, 7 + 3 * fade, 0, Math.PI * 2); ctx.fill();
      }
      for (let trail = 1; trail <= 4; trail += 1) {
        const tail = Math.max(0, projectileProgress - trail * 0.045);
        ctx.globalAlpha = fade * (1 - trail * 0.18);
        ctx.beginPath(); ctx.arc((target.x - origin.x) * tail, (target.y - origin.y) * tail, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (effect.targetEnemy && effect.time >= effect.duration * 0.88) {
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(target.x - origin.x, target.y - origin.y, 14 + progress * 22, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (effect.kind === "aura") {
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.globalAlpha = fade * (0.7 - ring * 0.16);
        ctx.lineWidth = ring === 0 ? 3 : 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 27 + ring * 8 + Math.sin(animationFrame * 0.025 + ring) * 3, 12 + ring * 4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (let spark = 0; spark < 6; spark += 1) {
        const theta = effect.seed / 100 + spark * Math.PI / 3 + animationFrame * 0.012;
        ctx.beginPath(); ctx.arc(Math.cos(theta) * (24 + 5 * Math.sin(animationFrame * 0.018)), Math.sin(theta) * 11 - 5, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (effect.kind === "summon") {
      ctx.globalAlpha = fade * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 18 + progress * 19, 8 + progress * 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-9, -13 - 18 * progress); ctx.lineTo(0, -8 - 18 * progress); ctx.lineTo(9, -13 - 18 * progress); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -18 - 18 * progress, 6, 0, Math.PI * 2); ctx.stroke();
      for (let spark = 0; spark < 4; spark += 1) {
        const theta = spark * Math.PI / 2 + animationFrame * 0.02;
        ctx.beginPath(); ctx.arc(Math.cos(theta) * (18 + progress * 18), Math.sin(theta) * 9 - 5, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (effect.kind === "trap") {
      ctx.globalAlpha = fade;
      ctx.rotate(animationFrame * 0.008);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-radius * 0.55, -radius * 0.55, radius * 1.1, radius * 1.1);
      ctx.beginPath(); ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); ctx.moveTo(0, -radius); ctx.lineTo(0, radius); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, radius * (0.35 + 0.12 * Math.sin(animationFrame * 0.045)), 0, Math.PI * 2); ctx.stroke();
    } else if (effect.kind === "wave" || effect.kind === "burst") {
      const rings = effect.kind === "burst" ? 3 : 2;
      for (let ring = 0; ring < rings; ring += 1) {
        ctx.globalAlpha = fade * (1 - ring * 0.24);
        ctx.lineWidth = effect.kind === "burst" ? 2.5 : 3;
        ctx.beginPath(); ctx.ellipse(0, 0, radius * (0.45 + ring * 0.22), radius * (0.2 + ring * 0.1), 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (effect.kind === "burst") {
        for (let ray = 0; ray < 8; ray += 1) {
          const theta = ray * Math.PI / 4 + effect.seed / 100;
          ctx.beginPath(); ctx.moveTo(Math.cos(theta + animationFrame * 0.01) * radius * 0.35, Math.sin(theta + animationFrame * 0.01) * radius * 0.18); ctx.lineTo(Math.cos(theta) * radius, Math.sin(theta + animationFrame * 0.01) * radius * 0.48); ctx.stroke();
        }
      }
    } else if (effect.kind === "movement") {
      ctx.lineWidth = 5 * fade;
      const trailPhase = Math.sin(animationFrame * 0.018);
      ctx.beginPath(); ctx.arc(-trailPhase * 8, 0, 30 + progress * 18, -Math.PI * 0.72, Math.PI * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(28 + progress * 34, -12); ctx.lineTo(28 + progress * 34, 12); ctx.closePath(); ctx.fill();
    } else {
      ctx.lineWidth = 5 * fade;
      ctx.beginPath(); ctx.arc(20, 0, 26 + progress * 12, -1.15 + progress * 1.5, 1.15 + progress * 1.5); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(34 + progress * 24, 0); ctx.stroke();
    }
    if ((effect.kind !== "projectile" || effect.targetEnemy) && missileFrame?.complete && missileFrame.naturalWidth > 0) {
      const size = effect.kind === "burst" ? 42 : 32;
      const effectX = effect.kind === "projectile" && effect.targetEnemy
        ? target.x - origin.x
        : effect.kind === "aura" || effect.kind === "summon" || effect.kind === "trap" || effect.kind === "burst"
          ? 0
          : Math.min(1, progress * 2) * (target.x - origin.x);
      const effectY = effect.kind === "projectile" && effect.targetEnemy
        ? target.y - origin.y
        : effect.kind === "aura" || effect.kind === "summon" || effect.kind === "trap" || effect.kind === "burst"
          ? 0
          : Math.min(1, progress * 2) * (target.y - origin.y);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = fade * 0.92;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 8;
      ctx.drawImage(missileFrame, effectX - size / 2, effectY - radius * 0.4 - size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.font = "bold 12px Georgia, serif";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#08090b";
    ctx.fillStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 5;
    const title = `${icon ? `${icon} ` : ""}${label}`;
    ctx.strokeText(title, origin.x, origin.y - 42 - progress * 12);
    ctx.fillText(title, origin.x, origin.y - 42 - progress * 12);
    ctx.restore();
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
  hoveredItem: D2InventoryItem | null = null;
  hoveredSlotIndex: number | null = null;
  hoveredEquipmentSlot: PaperdollSlot | null = null;
  itemPreviewX = 0;
  itemPreviewY = 0;
  itemPreviewLeft = false;
  itemPreviewBelow = false;
  itemPreviewAbove = false;
  private selectedItemPreviewX = 0;
  private selectedItemPreviewY = 0;
  private selectedItemPreviewLeft = false;
  private selectedItemPreviewBelow = false;
  private selectedItemPreviewAbove = false;

  get itemPreviewItem(): D2InventoryItem | null {
    return this.hoveredItem ?? this.selectedItem;
  }
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
    if (slot === "weapon" && this.characterModel) this.configureClassMeleeWeapon(this.characterModel, this.selectedClass);
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
    if (slot === "weapon" && this.characterModel) this.configureClassMeleeWeapon(this.characterModel, this.selectedClass);
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
    const anchor = this.getItemAnchorAt(slotIndex);
    const item = anchor >= 0 ? this.inventory[anchor] : null;
    if (!item) return;
    const compatibleSlots = PAPERDOLL_SLOTS.filter((candidate) => isCompatibleWithEquipment(item, candidate));
    const target = slot ?? compatibleSlots.find((candidate) => !this.equipment[candidate]) ?? compatibleSlots[0];
    if (!target) return;
    this.dragState = { source: "inventory", slotIndex: anchor, item };
    this.onEquipmentDrop(target, { preventDefault: () => undefined } as DragEvent);
  }

  onInventoryItemClick(slotIndex: number, item: D2InventoryItem | null, event: MouseEvent): void {
    if (event.ctrlKey && item) {
      event.preventDefault();
      this.sellInventoryItem(slotIndex);
      return;
    }
    this.selectInventoryItem(slotIndex, item, event);
  }

  onInventoryItemHover(slotIndex: number, item: D2InventoryItem | null, event: MouseEvent): void {
    if (!item || (event instanceof PointerEvent && event.pointerType === "touch")) return;
    this.hoveredItem = item;
    this.hoveredSlotIndex = slotIndex;
    this.hoveredEquipmentSlot = null;
    this.moveItemPreviewTo(event.clientX, event.clientY);
  }

  onEquipmentItemHover(slot: PaperdollSlot, event: MouseEvent): void {
    const item = this.equipment[slot];
    if (!item) return;
    this.hoveredItem = item;
    this.hoveredSlotIndex = null;
    this.hoveredEquipmentSlot = slot;
    this.moveItemPreviewTo(event.clientX, event.clientY);
  }

  onItemPreviewMove(event: MouseEvent): void {
    if (this.hoveredItem) this.moveItemPreviewTo(event.clientX, event.clientY);
  }

  onItemPreviewLeave(): void {
    this.hoveredItem = null;
    this.hoveredSlotIndex = null;
    this.hoveredEquipmentSlot = null;
    if (this.selectedItem) {
      this.itemPreviewX = this.selectedItemPreviewX;
      this.itemPreviewY = this.selectedItemPreviewY;
      this.itemPreviewLeft = this.selectedItemPreviewLeft;
      this.itemPreviewBelow = this.selectedItemPreviewBelow;
      this.itemPreviewAbove = this.selectedItemPreviewAbove;
    }
  }

  private moveItemPreviewTo(x: number, y: number, pin = false): void {
    this.itemPreviewX = Math.max(12, Math.min(x, window.innerWidth - 12));
    this.itemPreviewY = Math.max(12, Math.min(y, window.innerHeight - 12));
    this.itemPreviewLeft = x > window.innerWidth - 360;
    this.itemPreviewBelow = y < window.innerHeight * 0.52;
    this.itemPreviewAbove = !this.itemPreviewBelow;
    if (pin) {
      this.selectedItemPreviewX = x;
      this.selectedItemPreviewY = y;
      this.selectedItemPreviewLeft = this.itemPreviewLeft;
      this.selectedItemPreviewBelow = this.itemPreviewBelow;
      this.selectedItemPreviewAbove = this.itemPreviewAbove;
    }
  }

  onInventoryContextMenu(slotIndex: number, event: MouseEvent): void {
    event.preventDefault();
    const anchor = this.getItemAnchorAt(slotIndex);
    const item = anchor >= 0 ? this.inventory[anchor] : null;
    if (!item) return;
    const type = getEquipmentType(item);
    if (type === "belt") {
      this.equipBeltFromInventory(anchor);
    } else if (type === "weapon" || ["helmet", "body", "shield", "gloves", "boots"].includes(type)) {
      this.equipSelectedItem(anchor);
    } else {
      this.selectInventoryItem(anchor, item);
    }
  }

  onEquipmentItemClick(slot: PaperdollSlot, event: MouseEvent): void {
    if (event.ctrlKey && this.equipment[slot]) {
      event.preventDefault();
      this.sellEquippedItem(slot);
      return;
    }
    this.selectEquipmentItem(slot, event);
  }

  getItemSellValue(item: D2InventoryItem): number {
    const rarityMultiplier = item.rarity === "rare" ? 4 : item.rarity === "magic" ? 2 : 1;
    const stats = item.stats;
    const statValue = Math.floor((stats?.damageMin ?? 0) + (stats?.damageMax ?? 0)
      + (stats?.armor ?? 0) + (stats?.plusDamage ?? 0) * 3
      + (stats?.plusStrength ?? 0) * 2 + (stats?.plusVitality ?? 0) * 2);
    return Math.max(1, Math.min(100_000, (5 + statValue) * rarityMultiplier));
  }

  sellInventoryItem(slotIndex: number): void {
    if (!this.runActive || this.activeTab !== "run") return;
    const anchor = this.getItemAnchorAt(slotIndex);
    if (anchor < 0) return;
    const item = this.inventory[anchor];
    if (!item) return;
    const value = this.getItemSellValue(item);
    this.inventory[anchor] = null;
    this.playerGold = Math.min(1_000_000_000, this.playerGold + value);
    this.sanctuaryGold = this.playerGold;
    this.sanctuaryStash = this.sanctuaryStash.filter((owned) => owned.id !== item.id);
    this.rebuildInventoryGrid();
    if (this.selectedItem?.id === item.id) {
      this.selectedItem = null;
      this.selectedSlotIndex = null;
      this.selectedEquipmentSlot = null;
    }
    this.inventoryStatus = `${item.name} sold for ${value} gold.`;
    this.persistRunProgress(true);
  }

  sellEquippedItem(slot: PaperdollSlot): void {
    if (!this.runActive || this.activeTab !== "run") return;
    const item = this.equipment[slot];
    if (!item) return;
    if (slot === "belt" && this.beltSlots.slice(4).some((potion) => potion.kind !== null)) {
      this.inventoryStatus = "Use or move potions from the extra rows before selling this belt.";
      return;
    }
    const value = this.getItemSellValue(item);
    this.equipment[slot] = null;
    if (slot === "weapon" && this.characterModel) this.configureClassMeleeWeapon(this.characterModel, this.selectedClass);
    this.normalizeBeltSlots();
    this.playerGold = Math.min(1_000_000_000, this.playerGold + value);
    this.sanctuaryGold = this.playerGold;
    this.sanctuaryStash = this.sanctuaryStash.filter((owned) => owned.id !== item.id);
    this.rebuildInventoryGrid();
    this.selectedItem = null;
    this.selectedSlotIndex = null;
    this.selectedEquipmentSlot = null;
    this.inventoryStatus = `${item.name} sold for ${value} gold.`;
    this.persistRunProgress(true);
  }

  sellSelectedItem(): void {
    if (this.selectedEquipmentSlot) {
      this.sellEquippedItem(this.selectedEquipmentSlot);
    } else if (this.selectedSlotIndex !== null) {
      this.sellInventoryItem(this.selectedSlotIndex);
    }
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

  selectInventoryItem(slotIndex: number, item: D2InventoryItem | null, event?: MouseEvent): void {
    this.selectedItem = item;
    this.selectedSlotIndex = item ? slotIndex : null;
    this.selectedEquipmentSlot = null;
    if (item && !event && this.hoveredItem?.id === item.id) {
      this.moveItemPreviewTo(this.itemPreviewX, this.itemPreviewY, true);
    }
    if (!item) {
      this.onItemPreviewLeave();
    } else if (event) {
      this.moveItemPreviewTo(event.clientX, event.clientY, true);
    }
  }

  selectEquipmentItem(slot: PaperdollSlot, event?: MouseEvent): void {
    this.selectedEquipmentSlot = slot;
    this.selectedItem = this.equipment[slot];
    this.selectedSlotIndex = null;
    if (this.selectedItem && event) this.moveItemPreviewTo(event.clientX, event.clientY, true);
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
    if (slot === "weapon" && this.characterModel) this.configureClassMeleeWeapon(this.characterModel, this.selectedClass);
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
    if (!this.actBossSpawned && this.actTime >= ACT_BOSS_TIME_SECONDS) {
      this.actBossSpawned = true;
      this.spawnAcc = 0;
      if (this.enemies.length >= 220) this.enemies.splice(0, this.enemies.length - 219);
      this.enemies.push(this.makeEnemy("boss", true));
      this.floatingTexts.push({ x: this.playerX, y: this.playerY - 54, text: `${this.currentActDetails.boss.toUpperCase()} APPROACHES`, color: "#ff9c63", life: 3 });
    }
    if (this.enemies.length < 220) {
      const waveInterval = this.runTime < 20 ? 1.5 : 1.2;
      this.spawnAcc += dt / 1000;
      while (this.spawnAcc >= waveInterval && this.enemies.length < 220) {
        this.spawnAcc -= waveInterval;
        const packSize = this.runTime < 20 ? 2 : 3;
        for (let index = 0; index < packSize && this.enemies.length < 220; index += 1) {
          this.enemies.push(this.makeEnemy("normal"));
        }
        if (this.enemies.length < 60 && Math.random() < 0.06) {
          this.enemies.push(this.makeEnemy("champion"));
        }
      }
    }
    this.enemies = this.enemies.slice(0, 220);
  }

  advanceAct(): void {
    if (!this.actTransitionReady || this.campaignVictory) return;
    if (this.currentAct >= CAMPAIGN_ACTS.length) {
      this.campaignVictory = true;
      this.runActive = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      this.draw();
      return;
    }
    this.currentAct += 1;
    this.currentChunkCoordX = 0;
    this.currentChunkCoordY = 0;
    this.currentChunkLocalX = this.chunkTileColumns * 48 / 2;
    this.currentChunkLocalY = this.chunkTileRows * 48 / 2;
    this.runActive = true;
    this.lastTime = performance.now();
    this.actTime = 0;
    this.actBossSpawned = false;
    this.actTransitionReady = false;
    this.enemies = [];
    this.attackProjectiles = [];
    this.chests = [];
    this.potionDrops = [];
    this.goldDrops = [];
    this.spawnAcc = 0;
    this.playerX = this.arenaW / 2;
    this.playerY = this.arenaH / 2;
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + Math.ceil(this.playerMaxHp * 0.25));
    this.floatingTexts = [{ x: this.playerX, y: this.playerY - 48, text: `ENTERING ACT ${this.currentAct}`, color: "#ffd27a", life: 2.5 }];
    this.persistRunProgress(true);
    this.draw();
    this.renderCharacter();
    this.drawSkillVisualEffects();
    this.rafId = requestAnimationFrame((time) => this.loop(time));
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

  makeEnemy(kind: "normal" | "champion" | "boss", campaignBoss = false): Enemy {
    const actSpecies = this.currentActDetails.enemies;
    const speciesOptions = kind === "boss" ? [this.currentActDetails.boss] : actSpecies;
    const species = speciesOptions[Math.floor(Math.random() * speciesOptions.length)] ?? this.currentActDetails.enemies[0];
    const actDifficulty = 1 + (this.currentAct - 1) * 0.18;
    const randomFloorPosition = (): { x: number; y: number } => {
      const angle = Math.random() * Math.PI * 2;
      // Keep the initial wave outside immediate contact range; clamping to the arena
      // edge must not collapse distant spawns onto the hero near a screen corner.
      const minimumDistance = Math.max(180, Math.min(this.arenaW, this.arenaH) * 0.42);
      const distance = Math.max(minimumDistance, Math.max(this.arenaW, this.arenaH) * 0.67);
      return {
        x: this.playerX + Math.cos(angle) * distance,
        y: this.playerY + Math.sin(angle) * distance,
      };
    };
    const spawnPosition = randomFloorPosition();
    const normalHealth = Math.round(18 * actDifficulty);
    const base: Enemy = {
      kind: "normal",
      species,
      campaignBoss,
      spriteFrame: Math.floor(Math.random() * ENEMY_SPRITE_LAYOUTS[species].columns),
      x: spawnPosition.x,
      y: spawnPosition.y,
      hp: normalHealth,
      maxHp: normalHealth,
      speed: 80 + Math.random() * 40,
      r: 14,
      dmg: 2,
      cd: 0.8,
    };
    if (kind === "boss") {
      return {
        ...base,
        hp: Math.round(140 * actDifficulty),
        maxHp: Math.round(140 * actDifficulty),
        speed: 70,
        r: 26,
        dmg: Math.ceil(6 * actDifficulty),
        cd: 1.1,
        kind: "boss",
      };
    }
    if (kind === "champion") {
      const championHealth = Math.round(50 * actDifficulty);
      return {
        ...base,
        hp: championHealth,
        maxHp: championHealth,
        speed: 110,
        r: 18,
        dmg: 4,
        cd: 0.9,
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
    const chestGold = Math.floor((8 + Math.random() * 9) * (1 + (this.currentAct - 1) * 0.75));
    this.goldDrops.push({ x: c.x, y: c.y, amount: chestGold, bob: 0, life: 18, pickupDelay: 0.4 });

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
    this.persistRunProgress(true);
  }

  private spawnPotionDrops(x: number, y: number): void {
    if (Math.random() < 0.015) {
      this.addPotionDrop(x, y, "rejuvenation", 0);
      return;
    }
    if (Math.random() >= 0.35) return;
    const dropCount = Math.random() < 0.35 ? 2 : 1;
    for (let index = 0; index < dropCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 24 + index * 12;
      this.addPotionDrop(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, "health", 0.9);
    }
  }

  private addPotionDrop(x: number, y: number, kind: PotionDrop["kind"], pickupDelay: number): void {
    this.potionDrops.push({
      x: Math.max(18, Math.min(this.arenaW - 18, x)),
      y: Math.max(18, Math.min(this.arenaH - 18, y)),
      kind,
      bob: 0,
      life: kind === "rejuvenation" ? 40 : 25,
      pickupDelay,
      notifiedFull: false,
      collected: false,
    });
  }

  private maybeDropGold(enemy: Enemy): void {
    const difficulty = Math.max(1, enemy.maxHp / 18);
    const chance = enemy.kind === "boss" ? 0.9 : enemy.kind === "champion" ? 0.48 : Math.min(0.65, 0.16 + (difficulty - 1) * 0.04);
    if (Math.random() >= chance) return;
    const actScale = 1 + (this.currentAct - 1) * 0.75;
    const monsterScale = enemy.kind === "boss" ? 12 : enemy.kind === "champion" ? 4 : difficulty;
    const gold = Math.max(1, Math.floor((2 + Math.random() * 5) * actScale * monsterScale));
    this.goldDrops.push({ x: enemy.x, y: enemy.y, amount: gold, bob: 0, life: 18, pickupDelay: 0.4 });
  }

  private consumeRejuvenationPotion(): boolean {
    for (let index = 0; index < this.beltRows * 4; index += 1) {
      const slot = this.beltSlots[index];
      if (slot?.kind !== "rejuvenation") continue;
      slot.kind = null;
      this.playerHp = this.playerMaxHp;
      this.combatOrbsTime = 2.5;
      this.floatingTexts.push({ x: this.playerX, y: this.playerY - 42, text: "REJUVENATION!", color: "#d68cff", life: 2.2 });
      this.persistRunProgress(true);
      return true;
    }
    return false;
  }

  endRun(victory: boolean): void {
    if (!this.runActive) return;
    if (!victory && this.consumeRejuvenationPotion()) return;
    this.runActive = false;
    if (!victory) {
      this.deathRecovery = this.selectedClass === "necromancer";
      this.deathCount += 1;
      this.potionDrops = [];
      this.goldDrops = [];
      this.playerHp = 0;
      // A dead hero must not leave a resumable, zero-health run behind. The
      // character profile still retains that hero's independent gold and gear.
      this.hasSavedRun = this.deathRecovery;
    } else {
      this.deathRecovery = false;
      this.hasSavedRun = true;
    }
    this.persistRunProgress(true);
    if (victory || !this.deathRecovery) void this.recordCompletedCharacter(victory);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (!victory) {
      this.activeTab = "menu";
      this.menuPanel = "lobby";
      this.escapeMenuOpen = false;
      this.inventoryOpen = false;
      this.skillTreeOpen = false;
      this.stopAmbientAudio();
      void this.openLobby();
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
      CLASS_SKILL_DESCRIPTIONS[name] ??
      (name === this.basicAttackName ? `Your automatic melee ${name.toLowerCase()} strikes in weapon range.` : UPGRADE_DESCRIPTIONS[name]);
  }

  finishCampaign(): void {
    if (!this.campaignVictory) return;
    this.campaignVictory = false;
    this.hasSavedRun = false;
    this.persistRunProgress(true);
    this.activeTab = "menu";
    this.menuPanel = "lobby";
    void this.recordCompletedCharacter(true);
    void this.refreshLeaderboard();
  }

  private projectArenaPoint(x: number, y: number): { x: number; y: number } {
    const worldCenterX = this.arenaW / 2;
    const worldCenterY = this.arenaH / 2;
    const canvas = this.arenaRef?.nativeElement;
    const screenCenterX = (canvas?.width ?? 800) / 2;
    const screenCenterY = (canvas?.height ?? 500) / 2;
    const dx = (x - worldCenterX) * this.worldZoom;
    const dy = (y - worldCenterY) * this.worldZoom;
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
    ctx.imageSmoothingEnabled = false;

    const act = this.currentActDetails;
    const tileWorldSize = 48;
    const tileWorldScale = this.worldZoom * this.floorTileScale;
    const tileSpacingScale = this.floorTileScale;
    const tileScreenSize = tileWorldSize * tileWorldScale;
    const tileWidth = tileScreenSize * Math.SQRT2;
    const tileHeight = tileScreenSize / Math.SQRT2;
    const tiles = this.campaignTileBitmaps[act.act] ?? [];
    const baseTile = tiles[Math.max(0, Math.min(15, act.baseFloorVariant))];
    const groundColor = this.getTileCenterColor(baseTile);
    const reach = canvas.width / (4 * 0.7071 * this.worldZoom * tileSpacingScale)
      + canvas.height / (4 * 0.35355 * this.worldZoom * tileSpacingScale)
      + tileWorldSize;
    const minColumn = Math.floor((this.currentChunkLocalX - reach) / tileWorldSize);
    const maxColumn = Math.ceil((this.currentChunkLocalX + reach) / tileWorldSize);
    const minRow = Math.floor((this.currentChunkLocalY - reach) / tileWorldSize);
    const maxRow = Math.ceil((this.currentChunkLocalY + reach) / tileWorldSize);
    ctx.save();
    // Ground textures are enlarged far beyond their native sprite resolution;
    // smooth their sampling so the floor doesn't render as harsh nearest-neighbor blocks.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const worldTileX = this.currentChunkCoordX * this.chunkTileColumns + column;
        const worldTileY = this.currentChunkCoordY * this.chunkTileRows + row;
        const relativeX = (column * tileWorldSize + tileWorldSize / 2 - this.currentChunkLocalX) * tileSpacingScale;
        const relativeY = (row * tileWorldSize + tileWorldSize / 2 - this.currentChunkLocalY) * tileSpacingScale;
        const point = this.projectArenaPoint(this.arenaW / 2 + relativeX, this.arenaH / 2 + relativeY);
        const variant = this.connectedTileVariant(act.act, worldTileX, worldTileY, tiles.length);
        const image = tiles[variant] ?? baseTile;
        if (image) {
          ctx.fillStyle = groundColor;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y - tileScreenSize * 0.35355 - 1);
          ctx.lineTo(point.x + tileScreenSize * 0.7071 + 1, point.y);
          ctx.lineTo(point.x, point.y + tileScreenSize * 0.35355 + 1);
          ctx.lineTo(point.x - tileScreenSize * 0.7071 - 1, point.y);
          ctx.closePath();
          ctx.fill();
          // Extend each transparent diamond beyond its nominal cell to hide sampling seams.
          ctx.drawImage(image, point.x - tileWidth / 2 - 3, point.y - tileHeight / 2 - 3, tileWidth + 6, tileHeight + 6);
        } else {
          const halfW = tileScreenSize * 0.7071;
          const halfH = tileScreenSize * 0.35355;
          ctx.fillStyle = (worldTileX + worldTileY) % 2 === 0 ? "#17191f" : "#12141a";
          ctx.beginPath();
          ctx.moveTo(point.x, point.y - halfH);
          ctx.lineTo(point.x + halfW, point.y);
          ctx.lineTo(point.x, point.y + halfH);
          ctx.lineTo(point.x - halfW, point.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
    if (!this.campaignTileBitmaps[this.currentAct]?.length) {
      const tile = 48;
      const first = this.projectArenaPoint(0, 0);
      const last = this.projectArenaPoint(this.arenaW, this.arenaH);
      const halfW = tile * 0.7071 * tileWorldScale;
      const halfH = tile * 0.35355 * tileWorldScale;
      ctx.save();
      const fallbackReach = canvas.width / (4 * 0.7071 * this.worldZoom * tileSpacingScale)
        + canvas.height / (4 * 0.35355 * this.worldZoom * tileSpacingScale)
        + tile;
      const minTile = -Math.ceil(fallbackReach / tile);
      const maxTile = Math.ceil(fallbackReach / tile);
      for (let row = minTile; row <= maxTile; row += 1) {
        for (let column = minTile; column <= maxTile; column += 1) {
        const worldX = column * tile;
        const worldY = row * tile;
        const point = this.projectArenaPoint(
          this.arenaW / 2 + (worldX - this.currentChunkLocalX) * tileSpacingScale,
          this.arenaH / 2 + (worldY - this.currentChunkLocalY) * tileSpacingScale,
        );
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
      ctx.restore();
    }

    const drawOrder = [
      ...this.enemies.map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawEnemy(ctx, entity) })),
      ...this.chests.filter((chest) => !chest.open).map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawChest(ctx, entity) })),
      ...this.potionDrops.map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawPotionDrop(ctx, entity) })),
      ...this.goldDrops.map((entity) => ({ depth: this.projectArenaPoint(entity.x, entity.y).y, draw: () => this.drawGoldDrop(ctx, entity) })),
    ].sort((a, b) => a.depth - b.depth);
    for (const entity of drawOrder) entity.draw();

    for (const projectile of this.attackProjectiles) this.drawAttackProjectile(ctx, projectile);
    for (const effect of this.meleeTrailEffects) this.drawMeleeTrail(ctx, effect);
    for (const effect of this.summonAttackEffects) this.drawSummonAttackEffect(ctx, effect);
    for (const floatingText of this.floatingTexts) {
      const point = this.projectArenaPoint(floatingText.x, floatingText.y);
      ctx.fillStyle = floatingText.color;
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(floatingText.text, point.x, point.y);
    }
    if (this.runActive && this.enemies.length === 0 && !this.actBossSpawned) {
      ctx.save();
      ctx.fillStyle = "#d4c49b";
      ctx.textAlign = "center";
      ctx.font = "bold 14px Georgia, serif";
      ctx.fillText("Monsters approaching…", canvas.width / 2, canvas.height / 2);
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
      const rect = canvas.getBoundingClientRect();
      this.characterRenderer.setSize(rect.width || canvas.width, rect.height || canvas.height, false);
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
        this.selectedClass = modelClass;
        this.configureClassMeleeWeapon(model, modelClass);
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
      (error: unknown) => {          if (requestId !== this.modelLoadRequest) {

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

  private configureClassMeleeWeapon(model: THREE.Group, classId: string): void {
    this.playerWeaponMeshes = [];
    this.playerWeaponBaseQuaternions = [];
    const nameContainsClassMeleeWeapon = (name: string): boolean => {
      const lowerName = name.toLowerCase();
      return classId === "amazon" ? /pike|polearm|spear|javelin/.test(lowerName)
        : classId === "sorceress" ? /staff|horadric/.test(lowerName)
        : classId === "barbarian" ? /axe|sword|mace|weapon|hammer|blade/.test(lowerName) && !/shield|armor/.test(lowerName)
        : false;
    };
    model.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const mesh = object as THREE.Mesh;
      const name = `${mesh.name} ${mesh.parent?.name ?? ""}`.toLowerCase();
      const isPikeOrStaff = /pike|polearm|spear|staff/.test(name);
      const isBow = /bow|crossbow/.test(name);
      if (classId === "amazon" && (isPikeOrStaff || isBow || /weapon|javelin/.test(name))) {
        const showPike = isPikeOrStaff && !isBow;
        mesh.visible = showPike;
        mesh.userData["d2sHiddenByWeapon"] = !showPike;
        if (showPike) {
          this.playerWeaponMeshes.push(mesh);
          this.playerWeaponBaseQuaternions.push(mesh.quaternion.clone());
          mesh.userData["d2sWeaponSide"] = -1;
        }
        return;
      }
      if (classId === "sorceress" && isPikeOrStaff) {
        const hasStaff = this.equippedWeaponName.toLowerCase().includes("staff");
        if (!hasStaff) {
          mesh.visible = false;
          mesh.userData["d2sHiddenByWeapon"] = true;
          return;
        }
        this.playerWeaponMeshes.push(mesh);
        this.playerWeaponBaseQuaternions.push(mesh.quaternion.clone());
        mesh.userData["d2sWeaponSide"] = -1;
        return;
      }
      if (nameContainsClassMeleeWeapon(name)) {
        this.playerWeaponMeshes.push(mesh);
        this.playerWeaponBaseQuaternions.push(mesh.quaternion.clone());
        mesh.userData["d2sWeaponSide"] = -1;
      }
    });
  }

  private getPlayerRigBones(model: THREE.Group): PlayerRigBones {
    const bones: PlayerRigBones = { legs: [], knees: [], feet: [], arms: [], forearms: [] };
    model.traverse((object) => {
      if (!(object instanceof THREE.Bone)) return;
      const name = object.name.toLowerCase();
      const side = this.rigBoneSide(name);
      if ((/(?:^|[_-])(?:pelvis|hips?)(?:[_-]|$)/.test(name)
        || (this.selectedClass === "assassin" && /^root_main_00_m_jnt$/.test(name))) && !bones.pelvis) {
        bones.pelvis = object;
        bones.pelvisBaseQuaternion = object.quaternion.clone();
      }
      if ((/(?:^|[_-])spine[_-]?(?:01|1)(?:[_-]|$)/.test(name)
        || (this.selectedClass === "assassin" && /^spine_01_m_jnt$/.test(name))) && !bones.spine) {
        bones.spine = object;
        bones.spineBaseQuaternion = object.quaternion.clone();
      }
      const legRoot = /^(?:l|r|left|right)[_-](?:leg[_-]?01|upper[_-]?leg|thigh)(?:[_-].*)?$/.test(name)
        || /^(?:hip|upper[_-]?leg|thigh)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name)
        || /^(?:hip[_-]?(?:l|r|left|right)|(?:l|r|left|right)[_-]hip)(?:[_-].*)?$/.test(name)
        || (this.selectedClass === "assassin" && /^hip_[lr]_jnt$/.test(name))
        || (this.selectedClass === "sorceress" && /^(?:l|r)[_-]thigh$/.test(name));
      const lowerLeg = /^(?:l|r|left|right)[_-](?:leg[_-]?02|lower[_-]?leg|calf|shin|knee)(?:[_-].*)?$/.test(name)
        || /^(?:knee|calf|shin)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name)
        || (this.selectedClass === "assassin" && /^knee_[lr]_jnt$/.test(name))
        || (this.selectedClass === "sorceress" && /^(?:l|r)[_-]calf$/.test(name));
      const foot = /^(?:l|r|left|right)[_-](?:foot|ankle)(?:[_-].*)?$/.test(name)
        || (this.selectedClass === "assassin" && /^ankle_[lr]_jnt$/.test(name))
        || (this.selectedClass === "sorceress" && /^(?:l|r)[_-]foot$/.test(name))
        || /^(?:foot|ankle)[_-](?:l|r|left|right)(?:[_-].*)?$/.test(name);
      const isTwistOrHelperLeg = /twist|helper|pad|armor|cord/.test(name);
      const hasExplicitLegSide = /^(?:l|r|left|right)[_-]/.test(name)
        || /[_-](?:l|r|left|right)(?:[_-]|$)/.test(name)
        || (this.selectedClass === "assassin" && /_(?:l|r)_jnt$/.test(name));
      if (side && legRoot && hasExplicitLegSide && !isTwistOrHelperLeg) {
        bones.legs?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      } else if (side && lowerLeg && hasExplicitLegSide && !isTwistOrHelperLeg) {
        bones.knees?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      } else if (side && foot && hasExplicitLegSide && !isTwistOrHelperLeg) {
        bones.feet?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      }
      const shoulder = /(?:^|[_-])(?:l|left|r|right)[_-]?shoulder(?:[_-].*)?/.test(name)
        || /(?:^|[_-])shoulder[_-]?(?:l|r)(?:[_-].*)?/.test(name);
      const upperArm = /(?:^|[_-])(?:l|left|r|right)[_-]?(?:upr|upper)[_-]?arm(?:[_-].*)?/.test(name)
        || /^(?:l|r)_(?:upperarm|clavicle)$/.test(name)
        || (this.selectedClass === "assassin" && /^shoulder_[lr]_jnt$/.test(name));
      const forearm = /(?:^|[_-])(?:l|left|r|right)[_-]?(?:forearm|fore[_-]?arm|lower[_-]?arm)(?:[_-].*)?/.test(name)
        || /(?:^|[_-])(?:l|left|r|right)[_-]?(?:elbow)(?:[_-].*)?/.test(name)
        || (this.selectedClass === "assassin" && /^elbow_[lr]_jnt$/.test(name));
      if (side && (shoulder || upperArm) && !/twist|pad|plate|helper/.test(name)) {
        bones.arms?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      }
      if (side && forearm && !/twist|helper|pad|plate|armor|cord/.test(name)) {
        bones.forearms?.push({ bone: object, baseQuaternion: object.quaternion.clone(), side });
      }
    });
    // Pick one real pivot per side. Child segments and helper joints in several GLBs
    // were previously animated together, which made the preview limbs appear doubled.
    const choosePrimaryPerSide = (entries: RigAnimationBone[] | undefined, score: (entry: RigAnimationBone) => number): RigAnimationBone[] =>
      (entries ?? []).filter((entry, index, all) => {
        const peers = all.filter((candidate) => candidate.side === entry.side);
        const bestScore = Math.max(...peers.map(score));
        return score(entry) === bestScore && peers.find((candidate) => score(candidate) === bestScore) === entry;
      });
    bones.arms = choosePrimaryPerSide(bones.arms, (entry) => {
      const name = entry.bone.name.toLowerCase();
      return /shoulder|clavicle/.test(name) ? 3 : /upper.?arm|upr_arm/.test(name) ? 2 : 1;
    });
    bones.forearms = choosePrimaryPerSide(bones.forearms, (entry) => {
      const name = entry.bone.name.toLowerCase();
      if (/^(?:l|r)_?fore_?arm(?:_jnt)?$/.test(name) || /^elbow_[lr]_jnt$/.test(name)) return 3;
      return /forearm|fore_arm|elbow/.test(name) ? 2 : 1;
    });
    return bones;
  }

  private rigBoneSide(name: string): -1 | 1 | undefined {
    if (/^(?:r|right)[_-]/.test(name) || /[_-](?:r|right)(?:[_-]|$)/.test(name)
      || /(?:^|_)r_jnt$/.test(name)) return -1;
    if (/^(?:l|left)[_-]/.test(name) || /[_-](?:l|left)(?:[_-]|$)/.test(name)
      || /(?:^|_)l_jnt$/.test(name)) return 1;
    return undefined;
  }

  private animatePlayerModel(dt: number): void {
    if (!this.characterModel) return;
    const seconds = Math.max(0, dt / 1000);
    this.playerAnimationTime += seconds;
    const targetBlend = this.isPlayerMoving ? 1 : 0;
    this.playerMotionBlend += (targetBlend - this.playerMotionBlend) * (1 - Math.exp(-seconds * 8));
    const moving = this.playerMotionBlend;
    const isSorceress = this.selectedClass === "sorceress";
    const isBarbarian = this.selectedClass === "barbarian";
    const phase = this.playerAnimationTime * (2.1 + moving * (isSorceress ? 4.6 : isBarbarian ? 5.2 : 6.4));
    const stride = Math.sin(phase);
    const oppositeStride = -stride;
    const hipAmplitude = moving * (isSorceress ? 0.095 : isBarbarian ? 0.34 : 0.16);

    // These class rigs ship in bind pose without clips. Keep procedural motion deliberately
    // small and animate only the actual left/right leg chains; broad bone matching can swing
    // duplicate armor/helper joints and creates the appearance of extra legs.
    for (const leg of this.playerRigBones.legs ?? []) {
      const swing = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.sin(phase + (leg.side < 0 ? Math.PI : 0)) * hipAmplitude,
      );
      leg.bone.quaternion.copy(leg.baseQuaternion).multiply(swing);
    }
    for (const knee of this.playerRigBones.knees ?? []) {
      const legPhase = phase + (knee.side < 0 ? Math.PI : 0);
      const bend = moving * (isSorceress ? 0.13 : isBarbarian ? 0.48 : 0.22) * Math.max(0, Math.sin(legPhase + Math.PI * (isBarbarian ? 0.18 : 0.35)));
      const flex = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend);
      knee.bone.quaternion.copy(knee.baseQuaternion).multiply(flex);
    }
    for (const foot of this.playerRigBones.feet ?? []) {
      const legPhase = phase + (foot.side < 0 ? Math.PI : 0);
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.sin(legPhase) * moving * (isSorceress ? 0.035 : isBarbarian ? 0.11 : 0.06));
      foot.bone.quaternion.copy(foot.baseQuaternion).multiply(roll);
    }
    this.attackAnimationTime += seconds;
    const attackProfile = ATTACK_ANIMATION_PROFILES[this.attackAnimationStyle];
    const attackProgress = Math.max(0, Math.min(1, this.attackAnimationTime / attackProfile.duration));
    const attackActive = this.attackAnimationTime < attackProfile.duration;
    const attackMotion = attackActive ? attackMotionCurve(attackProgress, this.attackAnimationStyle) : 0;
    const attackFollowThrough = attackActive ? Math.sin(Math.PI * attackProgress) : 0;
    this.attackAnimationTurn = attackActive && attackProfile.spin ? attackProgress * Math.PI * 2 : 0;
    for (const effect of this.meleeTrailEffects) effect.time += seconds;
    for (let index = this.meleeTrailEffects.length - 1; index >= 0; index -= 1) {
      if (this.meleeTrailEffects[index].time >= this.meleeTrailEffects[index].duration) this.meleeTrailEffects.splice(index, 1);
    }
    for (const arm of this.playerRigBones.arms ?? []) {
      const lead = arm.side === this.attackAnimationSide;
      const armAmplitude = lead ? attackProfile.leadArm : attackProfile.offArm;
      const locomotionSwing = (arm.side < 0 ? oppositeStride : stride) * moving * (isSorceress ? 0.035 : isBarbarian ? 0.2 : 0.08);
      const attackDrive = isBarbarian ? Math.max(0, attackMotion) : attackMotion;
      const pitch = locomotionSwing + attackDrive * armAmplitude * (isBarbarian ? 0.62 : 1);
      const sweep = attackFollowThrough * (lead ? attackProfile.armSweep : -attackProfile.armSweep * 0.55) * (isBarbarian ? 0.7 : 1);
      const roll = attackDrive * attackProfile.shoulderRoll * (lead ? -1 : 1) * (isBarbarian ? 0.55 : 1);
      const shoulderMotion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, sweep, roll, "XYZ"));
      arm.bone.quaternion.copy(arm.baseQuaternion).multiply(shoulderMotion);
    }
    for (const forearm of this.playerRigBones.forearms ?? []) {
      const lead = forearm.side === this.attackAnimationSide;
      const locomotionBend = Math.max(0, Math.sin(phase + (forearm.side < 0 ? Math.PI : 0))) * moving * (isSorceress ? 0.025 : isBarbarian ? 0.12 : 0.06);
      const attackDrive = Math.max(0, attackMotion);
      const bend = locomotionBend + attackDrive * (lead ? attackProfile.elbowBend : attackProfile.offElbowBend) * (isBarbarian ? 0.7 : 1);
      const flex = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend);
      forearm.bone.quaternion.copy(forearm.baseQuaternion).multiply(flex);
    }
    for (let index = 0; index < this.playerWeaponMeshes.length; index += 1) {
      const side = this.playerWeaponMeshes[index].userData["d2sWeaponSide"] as number;
      const weaponDrive = isBarbarian ? Math.max(0, attackMotion) : attackMotion;
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(weaponDrive * attackProfile.weaponPitch, 0, weaponDrive * attackProfile.weaponRoll * (side < 0 ? -1 : 1), "XYZ"));
      this.playerWeaponMeshes[index].quaternion.copy(this.playerWeaponBaseQuaternions[index]).multiply(turn);
    }
    if (this.playerRigBones.pelvis) {

      const base = this.playerRigBones.pelvisBaseQuaternion ?? this.playerRigBones.pelvis.quaternion;
      const sway = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(phase) * moving * (isSorceress ? 0.014 : isBarbarian ? 0.045 : 0.025));
      this.playerRigBones.pelvis.quaternion.copy(base).multiply(sway);
    }
    if (this.playerRigBones.spine) {
      const base = this.playerRigBones.spineBaseQuaternion ?? this.playerRigBones.spine.quaternion;
      const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        -(isSorceress ? 0.008 : isBarbarian ? 0.035 : 0.018) * moving + Math.sin(phase * 2) * moving * (isSorceress ? 0.003 : isBarbarian ? 0.012 : 0.006) - (isBarbarian ? Math.max(0, attackMotion) : attackMotion) * attackProfile.lean * (isBarbarian ? 1.25 : 1),
        (isBarbarian ? Math.max(0, attackMotion) : attackMotion) * attackProfile.torsoTwist * (isBarbarian ? 0.72 : 1),
        Math.sin(phase) * moving * (isSorceress ? 0.003 : isBarbarian ? 0.012 : 0.006),
        "XYZ",
      ));
      this.playerRigBones.spine.quaternion.copy(base).multiply(lean);
    }
    const yawTarget = this.isPlayerMoving ? Math.atan2(this.playerMoveX, this.playerMoveY) : Math.atan2(this.playerFacingX, this.playerFacingY);
    const yawDelta = Math.atan2(Math.sin(yawTarget - this.characterModel.rotation.y), Math.cos(yawTarget - this.characterModel.rotation.y));
    this.characterModel.rotation.y += yawDelta * (1 - Math.exp(-seconds * 10));
    const modelRoot = this.characterModel.children[0];
    if (modelRoot) modelRoot.rotation.y = this.attackAnimationTurn;
    // Keep footfalls subtle so the model stays grounded instead of hovering between steps.
    const barbarianCrouch = isBarbarian && attackActive ? Math.max(0, -attackMotion) * 0.1 : 0;
    const barbarianDrive = isBarbarian ? Math.max(0, attackMotion) : Math.max(0, attackMotion);
    this.characterModel.position.y = Math.abs(Math.sin(phase * 2)) * moving * (isSorceress ? 0.035 : isBarbarian ? 0.14 : 0.08) - barbarianCrouch + barbarianDrive * attackProfile.bodyLift;
  }

  private getPreviewPoseBones(model: THREE.Group): PreviewPoseBone[] {
    const rig = this.getPlayerRigBones(model);
    const poses: PreviewPoseBone[] = [];
    const add = (entry: RigAnimationBone | undefined, role: PreviewPoseBone["role"]): void => {
      if (entry) poses.push({ ...entry, role, phase: poses.length * 0.75 });
    };
    for (const arm of rig.arms ?? []) add(arm, "arm");
    for (const forearm of rig.forearms ?? []) add(forearm, "forearm");
    for (const leg of rig.legs ?? []) add(leg, "leg");
    for (const knee of rig.knees ?? []) add(knee, "knee");
    for (const foot of rig.feet ?? []) add(foot, "foot");
    if (rig.pelvis) add({ bone: rig.pelvis, baseQuaternion: rig.pelvis.quaternion.clone(), side: 1 }, "pelvis");
    if (rig.spine) add({ bone: rig.spine, baseQuaternion: rig.spine.quaternion.clone(), side: 1 }, "spine");
    return poses;
  }

  private normalizeCharacterModel(model: THREE.Group, targetHeight: number, excludeAmazonWeaponFromBounds = false): void {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    if (excludeAmazonWeaponFromBounds) {
      // The Amazon's long pike is a separate, stretched mesh. Including it in the
      // character bounds shifts her body sideways and makes her stance look canted.
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible || /pike|weapon|valkyrie_vfx/i.test(mesh.name)) return;
        bounds.expandByObject(mesh);
      });
    } else {
      bounds.setFromObject(model);
    }
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
        this.characterModel.position.x = (this.playerX - this.arenaW / 2) / this.worldZoom;
      this.characterModel.position.z = (this.playerY - this.arenaH / 2) / this.worldZoom;
      this.characterModel.scale.setScalar(this.playerWorldScale);
    }
    this.characterRenderer.render(this.characterScene, this.characterCamera);
  }

  drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const ground = this.projectArenaPoint(e.x, e.y);
    if (e.summonType) {
      this.drawSummon(ctx, e, ground);
      return;
    }
    const sprite = this.enemySprites[e.species];
    const color = e.kind === "boss" ? "#ffb347" : e.kind === "champion" ? "#ffd27a" : "#8a94a6";
    const size = e.r * (e.kind === "boss" ? 4.2 : e.kind === "champion" ? 4.4 : 4.8) * this.worldZoom;
    const dx = this.playerX - e.x;
    const dy = this.playerY - e.y;

    let spriteDrawn = false;
    if (sprite && sprite.image.width > 0 && sprite.image.height > 0) {
      const direction = enemySpriteRow(e.species, dx, dy);
      const frame = enemySpriteFrame(e.species, e.x, e.y, this.runTime);
      const sheetIndex = frame % sprite.columns;
      const cell = sprite.cell;
      const sourceRow = direction % sprite.rows;
      const bounds = enemySpriteCellBounds(e.species, sprite, sheetIndex, sourceRow);
      if (bounds) {
        const drawHeight = size * (e.kind === "boss" ? 1.35 : 1);
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

  private drawSummon(ctx: CanvasRenderingContext2D, summon: Enemy, ground: { x: number; y: number }): void {
    const isGolem = summon.summonType === "golem";
    const frames = isGolem ? this.animatedGolemFrames : this.animatedSkeletonFrames;
    const sheet = frames[0];
    const frameWidth = isGolem ? 110 : 70;
    const frameHeight = 86;
    const columns = 16;
    const dx = this.playerX - summon.x;
    const strideFrame = Math.floor(this.runTime * 10) % columns;
    const height = (isGolem ? 84 : 66) * this.worldZoom;
    const width = height * frameWidth / frameHeight;
    const mirror = !isGolem && dx < 0;
    ctx.save();
    ctx.fillStyle = "#050505";
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y + 2, width * 0.34, height * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sheet) {
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (mirror) {
        ctx.translate(ground.x, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        sheet,
        strideFrame * frameWidth,
        0,
        frameWidth,
        frameHeight,
        (mirror ? -ground.x : ground.x) - width / 2,
        ground.y - height * 0.82,
        width,
        height,
      );
      ctx.restore();
    } else {
      const glow = isGolem ? "#f07a31" : "#c7d6df";
      ctx.fillStyle = glow;
      ctx.strokeStyle = isGolem ? "#e6b45c" : "#e2edf2";
      ctx.lineWidth = 3;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y - height * 0.48, width * 0.26, height * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (isGolem && summon.summonSkill === "Fire Golem") {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff6c16";
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y - height * 0.42, width * 0.28, height * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const hpRatio = Math.max(0, summon.hp / summon.maxHp);
    const barWidth = Math.max(30, width * 0.65);
    const barY = ground.y - height * 0.88 - 7;
    ctx.fillStyle = "#171311";
    ctx.fillRect(ground.x - barWidth / 2, barY, barWidth, 4);
    ctx.fillStyle = isGolem ? summon.summonSkill === "Fire Golem" ? "#ff8136" : "#83bdb4" : "#b9d8e7";
    ctx.fillRect(ground.x - barWidth / 2, barY, barWidth * hpRatio, 4);
    ctx.fillStyle = isGolem ? "#f4bf76" : "#ded3bf";
    ctx.font = "bold 9px Georgia, serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "#08090b";
    ctx.shadowBlur = 3;
    ctx.fillText(summon.summonSkill ?? "Summon", ground.x, barY - 3);
    ctx.shadowBlur = 0;
  }

  private summonAttack(summon: Enemy, target: Enemy): void {
    summon.summonAttackCooldown = summon.summonType === "golem" ? 0.9 : summon.summonSkill === "Skeletal Mage" ? 1.25 : 0.72;
    this.summonAttackEffects.push({
      summon,
      target,
      time: 0,
      duration: summon.summonType === "golem" ? 0.38 : 0.3,
      damage: summon.dmg,
    });
  }

  private updateSummonAttacks(dt: number): void {
    for (const effect of this.summonAttackEffects) {
      effect.time += dt / 1000;
      if (effect.time < effect.duration || effect.target.hp <= 0) continue;
      effect.target.hp -= effect.damage;
      this.floatingTexts.push({
        x: effect.target.x,
        y: effect.target.y - effect.target.r - 8,
        text: `-${effect.damage}`,
        color: effect.summon.summonType === "golem" ? "#d9aa68" : "#d1e2e8",
        life: 0.65,
      });
      effect.time = effect.duration + 1;
    }
    for (let index = this.summonAttackEffects.length - 1; index >= 0; index -= 1) {
      if (this.summonAttackEffects[index].time >= this.summonAttackEffects[index].duration + 1) this.summonAttackEffects.splice(index, 1);
    }
  }

  private drawSummonAttackEffect(ctx: CanvasRenderingContext2D, effect: SummonAttackEffect): void {
    if (effect.time > effect.duration || effect.target.hp <= 0) return;
    const progress = Math.min(1, effect.time / effect.duration);
    const source = this.projectArenaPoint(effect.summon.x, effect.summon.y);
    const target = this.projectArenaPoint(effect.target.x, effect.target.y);
    const isMage = effect.summon.summonSkill === "Skeletal Mage";
    const color = effect.summon.summonType === "golem" ? (effect.summon.summonSkill === "Fire Golem" ? "#ff7135" : "#d9aa68") : "#d7e5eb";
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    if (isMage) {
      const x = source.x + (target.x - source.x) * progress;
      const y = source.y + (target.y - source.y) * progress - 12;
      ctx.beginPath();
      ctx.arc(x, y, 5 + 3 * Math.sin(progress * Math.PI), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff3dc";
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.stroke();
    } else {
      const x = source.x + (target.x - source.x) * progress;
      const y = source.y + (target.y - source.y) * progress - 10;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - 9, y + 8);
      ctx.lineTo(x + 9, y - 8);
      ctx.stroke();
      ctx.strokeStyle = "#fff3dc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 7);
      ctx.lineTo(x + 8, y - 7);
      ctx.stroke();
    }
    ctx.restore();
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
    const scale = this.worldZoom;
    const y = ground.y - 3 * scale + Math.sin(drop.bob * 5) * 2 * scale;
    const potionColor = drop.kind === "health" ? "#e52b3c" : "#b24ee8";
    ctx.save();
    ctx.shadowColor = potionColor;
    ctx.shadowBlur = 9;
    ctx.fillStyle = "#a69b82";
    ctx.fillRect(x - 3 * scale, y - 9 * scale, 6 * scale, 4 * scale);
    ctx.fillStyle = potionColor;
    ctx.beginPath();
    ctx.moveTo(x - 5 * scale, y - 5 * scale);
    ctx.lineTo(x + 5 * scale, y - 5 * scale);
    ctx.lineTo(x + 4 * scale, y + 5 * scale);
    ctx.lineTo(x + 2 * scale, y + 8 * scale);
    ctx.lineTo(x - 2 * scale, y + 8 * scale);
    ctx.lineTo(x - 4 * scale, y + 5 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#d6c7a4";
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
    ctx.fillStyle = "#f4e7cb";
    ctx.font = `bold ${8 * scale}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(drop.kind === "health" ? "LIFE" : "REJUV", x, y + 19 * scale);
    ctx.restore();
  }

  drawGoldDrop(ctx: CanvasRenderingContext2D, drop: GoldDrop): void {
    const point = this.projectArenaPoint(drop.x, drop.y);
    const scale = this.worldZoom;
    const bob = Math.sin(drop.bob * 5) * 1.5 * scale;
    const x = point.x;
    const groundY = point.y;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // A soft ground shadow and irregular overlapping coin silhouettes make this
    // read as a little spill of loot rather than a single flat coin/orb.
    ctx.fillStyle = "#080807";
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.ellipse(x, groundY + 3 * scale, 12 * scale, 5 * scale, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const coins = [
      { x: -7, y: 0, rx: 5.5, ry: 3.4, angle: -0.3 },
      { x: -2, y: -2.5, rx: 6, ry: 3.7, angle: 0.16 },
      { x: 4, y: -1, rx: 5.4, ry: 3.3, angle: -0.24 },
      { x: 7, y: 1.1, rx: 4.4, ry: 2.8, angle: 0.32 },
      { x: 0, y: 0.4, rx: 5.7, ry: 3.4, angle: 0.08 },
    ];
    ctx.shadowColor = "#dc9b22";
    ctx.shadowBlur = 5 * scale;
    for (const coin of coins) {
      const coinX = x + coin.x * scale;
      const coinY = groundY + coin.y * scale + bob;
      ctx.save();
      ctx.translate(coinX, coinY);
      ctx.rotate(coin.angle);
      ctx.fillStyle = "#80500d";
      ctx.beginPath();
      ctx.ellipse(0, 1.2 * scale, coin.rx * scale, coin.ry * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e6a92d";
      ctx.strokeStyle = "#9a6415";
      ctx.lineWidth = 1 * scale;
      ctx.beginPath();
      ctx.ellipse(0, 0, coin.rx * scale, coin.ry * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffe293";
      ctx.lineWidth = 0.8 * scale;
      ctx.beginPath();
      ctx.ellipse(0, -0.45 * scale, coin.rx * 0.72 * scale, coin.ry * 0.52 * scale, 0, Math.PI * 1.08, Math.PI * 1.88);
      ctx.stroke();
      ctx.restore();
    }

    // A small raised medallion on the top coin gives the pile a readable D2-style glint.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f6d46f";
    ctx.strokeStyle = "#986016";
    ctx.lineWidth = 0.8 * scale;
    ctx.beginPath();
    ctx.ellipse(x - 1 * scale, groundY - 2.3 * scale + bob, 2.7 * scale, 1.7 * scale, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fff0b2";
    ctx.lineWidth = 0.7 * scale;
    ctx.beginPath();
    ctx.moveTo(x - 2 * scale, groundY - 2.3 * scale + bob);
    ctx.lineTo(x, groundY - 2.3 * scale + bob);
    ctx.stroke();
    ctx.restore();
  }

  drawChest(ctx: CanvasRenderingContext2D, c: Chest): void {
    const ground = this.projectArenaPoint(c.x, c.y);
    const x = ground.x;
    const y = ground.y;
    const scale = this.worldZoom;
    const halfWidth = 20 * scale;
    const depth = 11 * scale;
    const bodyHeight = 17 * scale;
    const lidHeight = 7 * scale;
    const topY = y - bodyHeight - lidHeight;

    const polygon = (points: Array<[number, number]>): void => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
      ctx.closePath();
    };

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Dark contact shadow anchors the chest to the floor.
    ctx.fillStyle = "#050505";
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * scale, 25 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Front and right sides give the container a solid, three-dimensional body.
    polygon([[x - halfWidth, topY + lidHeight], [x + halfWidth, topY + lidHeight], [x + halfWidth, y], [x - halfWidth, y]]);
    ctx.fillStyle = "#68401d";
    ctx.fill();
    ctx.strokeStyle = "#2b1a10";
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    polygon([[x + halfWidth, topY + lidHeight], [x + halfWidth + depth, topY + lidHeight - 3 * scale], [x + halfWidth + depth, y - 3 * scale], [x + halfWidth, y]]);
    ctx.fillStyle = "#432713";
    ctx.fill();
    ctx.stroke();

    // Individual front boards and dark seams suggest a carved wooden coffer.
    for (let plank = 0; plank < 5; plank += 1) {
      const plankX = x - halfWidth + (plank * 2 + 1) * halfWidth / 5;
      ctx.strokeStyle = plank % 2 ? "#8b5928" : "#4d2d17";
      ctx.lineWidth = 1.15 * scale;
      ctx.beginPath();
      ctx.moveTo(plankX, topY + lidHeight + 3 * scale);
      ctx.lineTo(plankX, y - 2 * scale);
      ctx.stroke();
      ctx.strokeStyle = "#a6753b";
      ctx.lineWidth = 0.65 * scale;
      ctx.beginPath();
      ctx.moveTo(plankX + 1.5 * scale, topY + lidHeight + 5 * scale);
      ctx.lineTo(plankX + 1.5 * scale, y - 4 * scale);
      ctx.stroke();
    }

    // Heavy lid: a beveled top plane, front fascia, and short end caps.
    polygon([[x - halfWidth - 2 * scale, topY + 2 * scale], [x + halfWidth, topY], [x + halfWidth + depth + 2 * scale, topY + 3 * scale], [x - halfWidth + depth, topY + 6 * scale]]);
    ctx.fillStyle = "#a66d2b";
    ctx.fill();
    ctx.strokeStyle = "#35200f";
    ctx.lineWidth = 1.8 * scale;
    ctx.stroke();

    polygon([[x - halfWidth - 2 * scale, topY + 2 * scale], [x - halfWidth + depth, topY + 6 * scale], [x - halfWidth + depth, topY + lidHeight + 2 * scale], [x - halfWidth - 2 * scale, topY + lidHeight]]);
    ctx.fillStyle = "#74451e";
    ctx.fill();
    ctx.stroke();

    polygon([[x - halfWidth - 2 * scale, topY + lidHeight], [x - halfWidth + depth, topY + lidHeight + 4 * scale], [x + halfWidth + depth + 2 * scale, topY + lidHeight + scale], [x + halfWidth, topY + lidHeight - 2 * scale]]);
    ctx.fillStyle = "#8a5423";
    ctx.fill();
    ctx.stroke();

    // Iron bands wrap the front and right face; the central latch reads clearly at game scale.
    ctx.strokeStyle = "#302c28";
    ctx.lineWidth = 3.4 * scale;
    for (const bandX of [x - halfWidth + 4 * scale, x + halfWidth - 4 * scale]) {
      ctx.beginPath();
      ctx.moveTo(bandX, topY + lidHeight);
      ctx.lineTo(bandX, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#b19460";
    ctx.lineWidth = 1.1 * scale;
    for (const bandX of [x - halfWidth + 4 * scale, x + halfWidth - 4 * scale]) {
      ctx.beginPath();
      ctx.moveTo(bandX, topY + lidHeight + 2 * scale);
      ctx.lineTo(bandX, y - scale);
      ctx.stroke();
    }

    ctx.fillStyle = "#3c3325";
    ctx.strokeStyle = "#c6a45f";
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.roundRect(x - 4 * scale, topY + lidHeight + 5 * scale, 8 * scale, 12 * scale, 1.5 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e1c47b";
    ctx.beginPath();
    ctx.arc(x, topY + lidHeight + 9 * scale, 1.4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d2ad63";
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.moveTo(x, topY + lidHeight + 10.5 * scale);
    ctx.lineTo(x, topY + lidHeight + 14 * scale);
    ctx.stroke();

    // A narrow gold-colored rim and corner studs finish the lid without a floating label.
    ctx.strokeStyle = "#c4934c";
    ctx.lineWidth = 1.2 * scale;
    polygon([[x - halfWidth - scale, topY + 2.5 * scale], [x - halfWidth + depth, topY + 6.5 * scale], [x + halfWidth + depth + scale, topY + 3.5 * scale]]);
    ctx.stroke();
    ctx.fillStyle = "#d6b46d";
    for (const studX of [x - halfWidth + 4 * scale, x + halfWidth - 4 * scale]) {
      for (const studY of [topY + lidHeight + 4 * scale, y - 4 * scale]) {
        ctx.beginPath();
        ctx.arc(studX, studY, 1.15 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

interface D2SurvivorsSave {
  version: number;
  selectedClass: string;
  sanctuaryGold?: number;
  sanctuaryBonuses?: { maxLife?: number; attackDamage?: number };
  sanctuaryStash?: unknown[];
  characterProfiles?: Record<string, unknown>;
  run: D2SavedRun | null;
}

interface D2CharacterProfile {
  gold: number;
  inventory: Array<D2InventoryItem | null>;
  equipment: Record<PaperdollSlot, D2InventoryItem | null>;
  beltSlots: Array<{ kind: "health" | "rejuvenation" | null }>;
}

interface D2SavedRun {
  hasSavedRun: true;
  selectedClass: string;
  arenaW: number;
  arenaH: number;
  playerX: number;
  playerY: number;
  currentChunkCoordX?: number;
  currentChunkCoordY?: number;
  currentChunkLocalX?: number;
  currentChunkLocalY?: number;
  playerHp: number;
  playerMaxHp: number;
  deathRecovery?: boolean;
  deathCount?: number;
  playerMana: number;
  playerMaxMana: number;
  playerGold: number;
  runTime: number;
  runId: string;
  currentAct?: number;
  actTime?: number;
  actBossSpawned?: boolean;
  actTransitionReady?: boolean;
  runKillCount: number;
  playerLevel?: number;
  playerXp?: number;
  pendingLevelUps?: number;
  xpToNextLevel?: number;
  basicAttackName?: string;
  basicAttackCooldown?: number;
  basicAttackDamage?: number;
  skillOfferSeed?: number;
  ownedSkills: string[];
  skillLevels: Record<string, number>;
  enemies: Enemy[];
  chests: Chest[];
  potionDrops: PotionDrop[];
  goldDrops?: GoldDrop[];
  beltSlots: Array<{ kind: "health" | "rejuvenation" | null }>;
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

function sanitizeCharacterProfile(value: unknown): D2CharacterProfile | null {
  if (!isRecord(value)) return null;
  const gold = typeof value["gold"] === "number" && Number.isFinite(value["gold"])
    ? Math.floor(Math.max(0, Math.min(1_000_000_000, value["gold"])))
    : 0;
  const inventory = Array.isArray(value["inventory"])
    ? value["inventory"].slice(0, 40).map((item) => sanitizeInventoryItem(item))
    : [];
  const equipment = createEmptyEquipment();
  if (isRecord(value["equipment"])) {
    for (const slot of PAPERDOLL_SLOTS) {
      const item = sanitizeInventoryItem(value["equipment"][slot]);
      if (item && isCompatibleWithEquipment(item, slot)) equipment[slot] = item;
    }
  }
  const beltSlots: D2CharacterProfile["beltSlots"] = Array.from({ length: 16 }, (_, index) => {
    const slot = Array.isArray(value["beltSlots"]) ? value["beltSlots"][index] : undefined;
    const kind: "health" | "rejuvenation" | null = isRecord(slot) && (slot["kind"] === "health" || slot["kind"] === "rejuvenation") ? slot["kind"] : null;
    return { kind };
  });
  return { gold, inventory, equipment, beltSlots };
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
type EnemySpecies = "fallen" | "goatman" | "skeleton" | "sandRaider" | "sandMaggot" | "scarab" | "fetish" | "fetishShaman" | "council" | "balrog" | "vileChild" | "vileMother" | "bloodLord" | "minotaur" | "deathMauler" | "wendigo" | "andariel" | "duriel" | "diablo" | "baalsMinion";

function enemySpriteFrame(species: EnemySpecies, x: number, y: number, runTime: number): number {
  const layout = ENEMY_SPRITE_LAYOUTS[species];
  if (!layout.animated) return 0;
  const phase = Math.floor(runTime * 8 + x * 0.09 + y * 0.05);
  return ((phase % layout.columns) + layout.columns) % layout.columns;
}

function enemySpriteRow(species: EnemySpecies, dx: number, dy: number): number {
  const directions = ENEMY_SPRITE_LAYOUTS[species].rows;
  if (directions === 4) return dy > 0 ? 0 : dy < 0 ? 2 : dx < 0 ? 1 : 3;
  if (directions === 8) {
    const angle = Math.atan2(dy, dx);
    return (Math.round((angle + Math.PI) / (Math.PI / 4)) + 8) % 8;
  }
  return 0;
}

function enemySpriteCellBounds(_species: EnemySpecies, sprite: EnemySprite, frame: number, row: number): EnemySpriteBounds | null {
  const key = `${frame}:${row}`;
  if (sprite.bounds.has(key)) {
    return sprite.bounds.get(key) ?? null;
  }
  const cell = sprite.cell;
  const context = sprite.image.getContext("2d", { willReadFrequently: true });
  const pixels = context?.getImageData(frame * cell.width, row * cell.height, cell.width, cell.height).data;
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

const BASIC_ATTACK_NAMES = ["Guided Arrow", "Throwing Knife", "Axe Throw", "Spirit Claw", "Bone Bolt", "Holy Bolt", "Fire Bolt", "Jab", "Attack"];
type AttackAnimationStyle = "amazonJab" | "assassinSlash" | "barbarianCleave" | "druidClaw" | "necromancerCast" | "paladinStrike" | "sorceressCast" | "spin" | "cast";
interface AttackAnimationProfile {
  duration: number;
  leadArm: number;
  offArm: number;
  armSweep: number;
  shoulderRoll: number;
  elbowBend: number;
  offElbowBend: number;
  weaponPitch: number;
  weaponRoll: number;
  lean: number;
  torsoTwist: number;
  bodyLift: number;
  spin: boolean;
  trail?: string;
  trailArc?: number;
}
const ATTACK_ANIMATION_PROFILES: Record<AttackAnimationStyle, AttackAnimationProfile> = {
  amazonJab: { duration: 0.34, leadArm: 1.35, offArm: 0.12, armSweep: 0.08, shoulderRoll: 0.08, elbowBend: 0.16, offElbowBend: 0.08, weaponPitch: -0.9, weaponRoll: -0.08, lean: 0.1, torsoTwist: 0.03, bodyLift: 0.015, spin: false, trail: "#f6d28b", trailArc: 0.52 },
  assassinSlash: { duration: 0.38, leadArm: 1.12, offArm: 0.2, armSweep: 0.62, shoulderRoll: 0.22, elbowBend: 0.82, offElbowBend: 0.12, weaponPitch: -0.6, weaponRoll: 0.5, lean: 0.05, torsoTwist: 0.22, bodyLift: 0.015, spin: false, trail: "#a8cfff", trailArc: 2.35 },
  barbarianCleave: { duration: 0.64, leadArm: 0.82, offArm: 0.16, armSweep: -0.9, shoulderRoll: 0.12, elbowBend: 0.62, offElbowBend: 0.08, weaponPitch: -0.42, weaponRoll: -0.18, lean: 0.22, torsoTwist: 0.18, bodyLift: 0.012, spin: false, trail: "#ffc06a", trailArc: 1.9 },
  druidClaw: { duration: 0.44, leadArm: 1.08, offArm: 0.72, armSweep: 0.42, shoulderRoll: 0.12, elbowBend: 0.48, offElbowBend: 0.28, weaponPitch: -0.45, weaponRoll: 0.3, lean: 0.06, torsoTwist: 0.2, bodyLift: 0.02, spin: false, trail: "#9dffb1", trailArc: 1.8 },
  necromancerCast: { duration: 0.56, leadArm: 0.9, offArm: 0.48, armSweep: 0.2, shoulderRoll: 0.26, elbowBend: 0.75, offElbowBend: 0.5, weaponPitch: -0.28, weaponRoll: 0.16, lean: 0.04, torsoTwist: 0.12, bodyLift: 0.025, spin: false, trail: "#c6e5ff", trailArc: 0.95 },
  paladinStrike: { duration: 0.46, leadArm: 1.38, offArm: 0.26, armSweep: -0.2, shoulderRoll: 0.1, elbowBend: 0.28, offElbowBend: 0.1, weaponPitch: -0.8, weaponRoll: -0.18, lean: 0.12, torsoTwist: 0.16, bodyLift: 0.02, spin: false, trail: "#fff0a8", trailArc: 1.7 },
  sorceressCast: { duration: 0.58, leadArm: 1.02, offArm: 0.52, armSweep: 0.35, shoulderRoll: 0.32, elbowBend: 0.72, offElbowBend: 0.46, weaponPitch: -0.35, weaponRoll: 0.22, lean: 0.03, torsoTwist: 0.08, bodyLift: 0.035, spin: false, trail: "#ffb35c", trailArc: 0.9 },
  spin: { duration: 0.68, leadArm: 1.35, offArm: 1.2, armSweep: 1.2, shoulderRoll: 0.5, elbowBend: 0.72, offElbowBend: 0.72, weaponPitch: -0.6, weaponRoll: 1.1, lean: 0, torsoTwist: 0.1, bodyLift: 0.02, spin: true, trail: "#ffce76", trailArc: Math.PI * 2 },
  cast: { duration: 0.48, leadArm: 0.82, offArm: 0.35, armSweep: 0.25, shoulderRoll: 0.18, elbowBend: 0.55, offElbowBend: 0.24, weaponPitch: -0.25, weaponRoll: 0.12, lean: 0.03, torsoTwist: 0.08, bodyLift: 0.02, spin: false, trail: "#e6ddff", trailArc: 1.2 },

};
function attackMotionCurve(progress: number, style?: AttackAnimationStyle): number {
  if (style === "barbarianCleave") {
    if (progress < 0.34) return -Math.sin(progress / 0.34 * Math.PI / 2);
    if (progress < 0.62) {
      const strike = (progress - 0.34) / 0.28;
      return -1 + 2 * (strike * strike * (3 - 2 * strike));
    }
    const recovery = (progress - 0.62) / 0.38;
    return Math.cos(Math.PI * 0.5 * recovery) * (1 - recovery);
  }
  if (progress < 0.22) return -0.35 * Math.sin(progress / 0.22 * Math.PI / 2);
  if (progress < 0.48) {
    const strike = (progress - 0.22) / 0.26;
    return -0.35 + 1.35 * (strike * strike * (3 - 2 * strike));
  }
  return Math.cos(Math.PI / 2 * (progress - 0.48) / 0.52);
}
const CLASS_ATTACK_ANIMATION: Record<string, AttackAnimationStyle> = {
  amazon: "amazonJab", assassin: "assassinSlash", barbarian: "barbarianCleave",
  druid: "druidClaw", necromancer: "necromancerCast", paladin: "paladinStrike", sorceress: "sorceressCast",
};
const CLASS_SKILL_DESCRIPTIONS: Record<string, string> = {
  "Fire Bolt": "Level 1 Sorceress fire projectile.", Teeth: "Level 1 Necromancer bone shards fan out through enemies.",
  "Whirlwind": "Level 30 Barbarian spins through nearby enemies, striking repeatedly.",
  Jab: "A rapid melee thrust with a spear or pike.", Bash: "A forceful melee strike that staggers an enemy.", Smite: "Shield bash that knocks enemies back.", Sacrifice: "A powerful melee attack that costs a little life.",
  "Raise Skeleton": "Raise a fallen monster as a skeleton warrior.", "Bone Spear": "A piercing spear of bone strikes enemies in a line.",
  "Fire Ball": "Hurl an explosive ball of flame.", "Charged Bolt": "Release a spray of lightning bolts.", "Frost Nova": "A ring of frost bursts outward and chills nearby enemies.",
};

const UPGRADE_DESCRIPTIONS: Record<string, string> = {
  "Faster Attacks": "Basic attacks recharge faster.",
  "Faster Cast Rate": "Owned active spells cast automatically, each on its own cooldown. Each rank reduces all spell cooldowns by 10%, up to rank 6.",
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
  kind: "attack" | "stat" | "class-skill";
}

interface SkillVisualEffect {
  name: string;
  targetEnemy?: boolean;
  kind: D2SkillVisual;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facingX: number;
  facingY: number;
  time: number;
  duration: number;
  color: string;
  seed: number;
}

interface MeleeTrailEffect {
  style: AttackAnimationStyle;
  facingX: number;
  facingY: number;
  side: -1 | 1;
  time: number;
  duration: number;
  color: string;
}

interface SummonAttackEffect {
  summon: Enemy;
  target: Enemy;
  time: number;
  duration: number;
  damage: number;
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
  missileId?: string;
  teethFan?: number;
  teethDirectionX?: number;
  teethDirectionY?: number;
  speed: number;
  damage: number;
  life: number;
  radius: number;
  color: string;
  kind: "arrow" | "fire" | "lightning" | "blade" | "bone" | "holy" | "claw" | "melee";
}

interface RigAnimationBone {
  bone: THREE.Bone;
  baseQuaternion: THREE.Quaternion;
  side: -1 | 1;
}

interface PreviewPoseBone extends RigAnimationBone {
  phase: number;
  role: "arm" | "forearm" | "leg" | "knee" | "foot" | "pelvis" | "spine";
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
  forearms?: RigAnimationBone[];
}

interface Enemy {
  kind: EnemyKind;
  species: EnemySpecies;
  campaignBoss?: boolean;
  summonType?: "skeleton" | "golem";
  summonSkill?: string;
  summonAttackCooldown?: number;
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
  kind: "health" | "rejuvenation";
  bob: number;
  life: number;
  pickupDelay: number;
  notifiedFull: boolean;
  collected: boolean;
}

interface GoldDrop {
  x: number;
  y: number;
  amount: number;
  bob: number;
  life: number;
  pickupDelay: number;
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
