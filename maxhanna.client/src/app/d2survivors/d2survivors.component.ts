import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppModule } from '../app.module';
import { ChildComponent } from '../child.component';
import { D2SurvivorsService, D2HighScore } from '../../services/d2survivors.service';

// Original Diablo-inspired survivor game. All art is drawn procedurally on a
// canvas; no Blizzard or third-party sprites, sounds or code are used.

type Phase = 'select' | 'playing' | 'paused' | 'levelup' | 'shop' | 'gameover' | 'victory';
type Slot = 'weapon' | 'armor' | 'charm';
type Rarity = 'normal' | 'magic' | 'rare';
type StatKey = 'damage' | 'maxHp' | 'speed' | 'area' | 'cooldown' | 'magnet' | 'armor' | 'regen';
type WeaponKey = 'bolt' | 'orbit' | 'nova' | 'arc';
type EnemyKind = 'skeleton' | 'fallen' | 'zombie' | 'bat' | 'lord';

interface Item { id: number; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<StatKey, number>>; value: number; }
interface GroundItem { x: number; y: number; item: Item; age: number; }
interface Enemy {
  kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; speed: number; r: number;
  dmg: number; xp: number; gold: number; boss: boolean; flash: number; orbitCd: number; phase: number;
  /** Pyromancer ember stacks on this foe (see addBrand). */
  brand?: number;
}
interface Projectile { x: number; y: number; vx: number; vy: number; dmg: number; life: number; }
interface Mine { x: number; y: number; life: number; arm: number; }
interface Drop { x: number; y: number; v: number; kind: 'xp' | 'gold'; }
interface Effect { kind: 'ring' | 'arc'; x: number; y: number; r: number; pts: number[]; life: number; maxLife: number; }
interface Floater { x: number; y: number; text: string; color: string; life: number; }
interface Choice { kind: 'weapon' | 'stat'; key: WeaponKey | StatKey; label: string; desc: string; }
interface ShopItem { id: 'potion' | 'crate' | 'rare'; name: string; price: number; desc: string; }
/** Roguelite progress that survives death and New run. */
interface MetaSave { gold: number; potions: number; inventory: Item[]; equipped: Partial<Record<Slot, Item>>; }
/** The in-progress run, saved on the server so a refresh resumes it. */
interface RunSnapshot {
  heroId: string; time: number; kills: number; level: number; xp: number;
  weapons: Record<WeaponKey, number>; weaponTimers: Record<WeaponKey, number>; orbitAngle: number;
  upgrades: Record<StatKey, number>; hp: number; x: number; y: number; facing: number;
  pendingLevelUps: number; spawnAcc: number; nextBossIndex: number;
}

const TILE = 64;
const META_KEY = 'd2survivors.meta.v1';
const PLAYER_R = 13;
const RUN_SECONDS = 600;
const BOSS_TIMES = [150, 300, 450];
const MAX_ENEMIES = 260;
const MAX_INVENTORY = 12;
const MAX_WEAPON_LEVEL = 5;
const POTION_HEAL = 35;
const TAU = Math.PI * 2;

// CC0 sprite sheets (see assets/d2survivors/CREDITS.md). Each spec gives frame size,
// frame count, animation speed and which sheet row to use.
type SpriteKey = 'hero' | 'skeleton' | 'fallen' | 'zombie' | 'bat' | 'lord' | 'floor';
interface SpriteSpec { file: string; fw: number; fh: number; frames: number; fps: number; row: number; ox?: number; oy?: number; }
const SPRITE_SPECS: Record<SpriteKey, SpriteSpec> = {
  hero: { file: 'assets/d2survivors/hero.png', fw: 128, fh: 128, frames: 1, fps: 1, row: 0 },
  skeleton: { file: 'assets/d2survivors/skeleton.png', fw: 128, fh: 128, frames: 1, fps: 1, row: 0 },
  fallen: { file: 'assets/d2survivors/denzi_monsters.png', fw: 32, fh: 48, frames: 1, fps: 1, row: 0, ox: 0, oy: 96 },
  floor: { file: 'assets/d2survivors/denzi_tiles.png', fw: 32, fh: 32, frames: 1, fps: 1, row: 0, ox: 0, oy: 96 },
  zombie: { file: 'assets/d2survivors/zombie.png', fw: 31, fh: 36, frames: 4, fps: 6, row: 0 },
  bat: { file: 'assets/d2survivors/bat.gif', fw: 32, fh: 32, frames: 5, fps: 12, row: 0 },
  lord: { file: 'assets/d2survivors/denzi_monsters.png', fw: 32, fh: 48, frames: 1, fps: 1, row: 0, ox: 224, oy: 192 },
};
const ENEMY_SPRITE: Record<EnemyKind, SpriteKey> = {
  skeleton: 'skeleton', fallen: 'fallen', zombie: 'zombie', bat: 'bat', lord: 'lord',
};
const ENEMY_SPRITE_HEIGHT: Record<EnemyKind, number> = {
  skeleton: 30, fallen: 34, zombie: 34, bat: 24, lord: 110,
};

const WEAPON_INFO: Record<WeaponKey, { name: string; desc: string }> = {
  bolt: { name: 'Sorcery Bolt', desc: 'Fires bolts at the nearest foes.' },
  orbit: { name: 'Whirling Blades', desc: 'Blades orbit you and cut anything they touch.' },
  nova: { name: 'Nova Burst', desc: 'Periodic shockwave around you.' },
  arc: { name: 'Storm Arc', desc: 'Lightning that leaps between nearby foes.' },
};

const STAT_UPGRADES: { key: StatKey; label: string; amount: number }[] = [
  { key: 'damage', label: '+10% damage', amount: 0.1 },
  { key: 'maxHp', label: '+15 max life', amount: 15 },
  { key: 'speed', label: '+12 move speed', amount: 12 },
  { key: 'area', label: '+10% area', amount: 0.1 },
  { key: 'cooldown', label: '+6% attack speed', amount: 0.06 },
  { key: 'magnet', label: '+25 pickup range', amount: 25 },
];

const BASE_STATS: Record<StatKey, number> = {
  damage: 0, maxHp: 100, speed: 150, area: 0, cooldown: 0, magnet: 60, armor: 0, regen: 0,
};

const ENEMY_INFO: Record<EnemyKind, { name: string; hp: number; speed: number; r: number; dmg: number; xp: number }> = {
  skeleton: { name: 'Skeleton', hp: 18, speed: 62, r: 11, dmg: 7, xp: 1 },
  fallen: { name: 'Fallen', hp: 12, speed: 98, r: 9, dmg: 5, xp: 1 },
  zombie: { name: 'Zombie', hp: 45, speed: 40, r: 14, dmg: 11, xp: 2 },
  bat: { name: 'Bat', hp: 9, speed: 120, r: 8, dmg: 4, xp: 1 },
  lord: { name: 'Mausoleum Lord', hp: 700, speed: 58, r: 30, dmg: 22, xp: 40 },
};

const STAT_POOLS: Record<Slot, { key: StatKey; min: number; max: number }[]> = {
  weapon: [{ key: 'damage', min: 0.08, max: 0.2 }, { key: 'area', min: 0.05, max: 0.12 }, { key: 'cooldown', min: 0.04, max: 0.1 }],
  armor: [{ key: 'maxHp', min: 8, max: 22 }, { key: 'armor', min: 1, max: 3 }, { key: 'regen', min: 0.3, max: 0.9 }],
  charm: [{ key: 'speed', min: 8, max: 20 }, { key: 'magnet', min: 15, max: 40 }, { key: 'cooldown', min: 0.03, max: 0.08 }],
};

const BASE_NAMES: Record<Slot, string[]> = {
  weapon: ['Hatchet', 'Short Sword', 'War Club', 'Falchion'],
  armor: ['Quilted Vest', 'Chain Mail', 'Ring Mail', 'Plate Armor'],
  charm: ['Small Charm', 'Large Charm', 'Grand Charm'],
};
const PREFIXES = ['Sharp', 'Brutal', 'Swift', 'Sturdy', 'Vicious'];
const SUFFIXES = ['of Fury', 'of the Wolf', 'of Vigor', 'of Haste'];
const RARITY_RANK: Record<Rarity, number> = { normal: 0, magic: 1, rare: 2 };
const RARITY_STATS: Record<Rarity, number> = { normal: 1, magic: 2, rare: 3 };
const RARITY_VALUE: Record<Rarity, number> = { normal: 6, magic: 22, rare: 70 };

const SHOP_STOCK: ShopItem[] = [
  { id: 'potion', name: 'Healing Potion', price: 25, desc: `Restores ${POTION_HEAL} life. Press H in battle.` },
  { id: 'crate', name: 'Common Crate', price: 60, desc: 'A random normal or magic item.' },
  { id: 'rare', name: 'Rare Crate', price: 150, desc: 'A random item of at least magic quality.' },
];

interface HeroClass { id: string; name: string; desc: string; color: string; start: WeaponKey; bonus: Partial<Record<StatKey, number>>; }

const HERO_CLASSES: HeroClass[] = [
  { id: 'knight', name: 'Knight', desc: 'Sturdy and slow. Ward cuts damage taken by 15%. Starts with Whirling Blades.', color: '#7a8594', start: 'orbit', bonus: { maxHp: 40, speed: -15 } },
  { id: 'pyromancer', name: 'Pyromancer', desc: 'Frail caster. Every third bolt on a foe bursts in flame. Starts with Sorcery Bolt.', color: '#c4502a', start: 'bolt', bonus: { damage: 0.15, maxHp: -25 } },
  { id: 'rogue', name: 'Rogue', desc: 'Quick and light. Drops snare mines as it moves. Starts with Storm Arc.', color: '#4f7a4a', start: 'arc', bonus: { speed: 25, cooldown: 0.08 } },
  { id: 'warden', name: 'Warden', desc: 'Steady guardian. A spirit strikes the nearest foe. Starts with Nova Burst.', color: '#6b5a8a', start: 'nova', bonus: { armor: 2, area: 0.1 } },
];

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function hashTile(ix: number, iy: number): number {
  return Math.abs(Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663));
}

@Component({
  selector: 'app-d2survivors',
  templateUrl: './d2survivors.component.html',
  styleUrl: './d2survivors.component.css',
  standalone: true,
  imports: [AppModule, CommonModule, FormsModule],
})
export class D2SurvivorsComponent extends ChildComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly slots: Slot[] = ['weapon', 'armor', 'charm'];
  readonly shopStock = SHOP_STOCK;
  readonly maxInventory = MAX_INVENTORY;
  readonly weaponInfo = WEAPON_INFO;

  // Session state
  phase: Phase = 'select';
  selectedClass: HeroClass = HERO_CLASSES[0];
  readonly heroClasses = HERO_CLASSES;
  private beforeModal: Phase = 'playing';
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  gold = 0;
  potions = 0;
  message = '';
  private messageTimer = 0;
  choices: Choice[] = [];
  selectedItem: Item | null = null;

  // Settings (toggles in the toolbar)
  soundOn = true;
  musicOn = false;
  muted = false;
  autoStats = false;

  // World state
  player = { x: 0, y: 0, hp: 100, invuln: 0, facing: 0 };
  weapons: Record<WeaponKey, number> = { bolt: 0, orbit: 0, nova: 0, arc: 0 };
  private weaponTimers: Record<WeaponKey, number> = { bolt: 0, orbit: 0, nova: 0, arc: 0 };
  private orbitAngle = 0;
  mines: Mine[] = [];
  private mineTimer = 0;
  private spiritTimer = 0;
  private spiritAngle = 0;
  upgrades: Record<StatKey, number> = { damage: 0, maxHp: 0, speed: 0, area: 0, cooldown: 0, magnet: 0, armor: 0, regen: 0 };
  equipped: Partial<Record<Slot, Item>> = {};
  inventory: Item[] = [];
  groundItems: GroundItem[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  drops: Drop[] = [];
  effects: Effect[] = [];
  floaters: Floater[] = [];
  private spawnAcc = 0;
  private nextBossIndex = 0;
  private pendingLevelUps = 0;
  private nextItemId = 1;

  private keys = new Set<string>();
  private raf = 0;
  private lastTime = 0;
  private audioCtx: AudioContext | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private lastSfxAt = 0;
  private sprites: Partial<Record<SpriteKey, HTMLImageElement>> = {};
  highScores: D2HighScore[] = [];
  private authToken = '';
  private serverReady = false;
  private serverSaveTimer: any;
  private runSaveInterval: any;

  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef, private d2sService: D2SurvivorsService) {
    super();
  }

  ngAfterViewInit(): void {
    this.loadMeta();
    this.newRun();
    this.phase = 'select';
    this.loadSprites();
    this.loadHighScores();
    void this.restoreFromServer();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.ngZone.runOutsideAngular(() => {
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.frame);
      // Snapshot the run every few seconds so a refresh resumes it.
      this.runSaveInterval = setInterval(() => {
        if (this.isRunActive()) void this.pushToServer(false);
      }, 5000);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.saveMeta();
    void this.pushToServer(true);
    clearInterval(this.runSaveInterval);
    clearTimeout(this.serverSaveTimer);
    this.stopDrone();
    this.audioCtx?.close();
    this.audioCtx = null;
  }

  get timeText(): string {
    const remaining = Math.max(0, Math.floor(this.time));
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  get xpNeeded(): number {
    return 10 + this.level * 8;
  }

  // ---------- Saved progress ----------

  /** Restores gold, potions, inventory and equipped items from the last save. */
  private loadMeta(): void {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return;
      this.applyMeta(JSON.parse(raw) as Partial<MetaSave>);
    } catch (err) {
      console.warn('D2 Survivors: could not load saved progress.', err);
    }
  }

  /** Applies saved gold, potions, inventory and equipment. */
  private applyMeta(meta: Partial<MetaSave>): void {
    this.gold = typeof meta.gold === 'number' && meta.gold >= 0 ? Math.floor(meta.gold) : 0;
    this.potions = typeof meta.potions === 'number' && meta.potions >= 0 ? Math.floor(meta.potions) : 0;
    this.inventory = Array.isArray(meta.inventory) ? meta.inventory.slice(0, MAX_INVENTORY) : [];
    this.equipped = meta.equipped ?? {};
    const ids = [...this.inventory, ...Object.values(this.equipped)]
      .filter((item): item is Item => !!item)
      .map(item => item.id);
    this.nextItemId = Math.max(0, ...ids) + 1;
  }

  private get userId(): number {
    return this.parentRef?.user?.id ?? 0;
  }

  private parseJson<T>(text: string | undefined | null, fallback: T): T {
    if (!text) return fallback;
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }

  /** Loads gold, inventory and any in-progress run from the server for a logged-in player. */
  private async restoreFromServer(): Promise<void> {
    if (!this.userId) return;
    this.authToken = (await this.parentRef?.getSessionToken()) ?? '';
    const res = await this.d2sService.getSave(this.userId, this.authToken);
    if (!res.ok || !res.data) return;
    this.serverReady = true;
    const data = res.data;
    if (!data.exists) {
      // First sync for this player: push local progress up to the server.
      this.saveMeta();
      return;
    }
    this.applyMeta({
      gold: data.gold,
      potions: data.potions,
      inventory: this.parseJson<Item[]>(data.inventory, []),
      equipped: this.parseJson<Partial<Record<Slot, Item>>>(data.equipped, {}),
    });
    this.saveMeta();
    if (data.runSnapshot && this.restoreRun(data.runSnapshot)) {
      if (this.pendingLevelUps > 0) {
        this.choices = this.buildChoices();
        this.setPhase('levelup');
      } else {
        this.setPhase('paused');
      }
      this.toast('Run restored from the server.');
    }
  }

  /** Sends meta and any in-progress run to the server. Guests and failed loads are skipped. */
  private async pushToServer(keepalive: boolean): Promise<void> {
    if (!this.serverReady || !this.userId) return;
    await this.d2sService.save({
      userId: this.userId,
      gold: this.gold,
      potions: this.potions,
      inventory: JSON.stringify(this.inventory),
      equipped: JSON.stringify(this.equipped),
      runSnapshot: this.isRunActive() ? JSON.stringify(this.captureRun()) : null,
    }, this.authToken, keepalive);
  }

  private scheduleServerSave(): void {
    if (!this.serverReady || !this.userId) return;
    clearTimeout(this.serverSaveTimer);
    this.serverSaveTimer = setTimeout(() => void this.pushToServer(false), 800);
  }

  private isRunActive(): boolean {
    return this.phase === 'playing' || this.phase === 'paused' || this.phase === 'levelup' || this.phase === 'shop';
  }

  private captureRun(): RunSnapshot {
    return {
      heroId: this.selectedClass.id, time: this.time, kills: this.kills, level: this.level, xp: this.xp,
      weapons: { ...this.weapons }, weaponTimers: { ...this.weaponTimers }, orbitAngle: this.orbitAngle,
      upgrades: { ...this.upgrades }, hp: this.player.hp, x: this.player.x, y: this.player.y,
      facing: this.player.facing, pendingLevelUps: this.pendingLevelUps, spawnAcc: this.spawnAcc,
      nextBossIndex: this.nextBossIndex,
    };
  }

  /** Rebuilds a run from a saved snapshot. Enemies are not saved, so the field starts clear. */
  private restoreRun(text: string): boolean {
    const s = this.parseJson<Partial<RunSnapshot> | null>(text, null);
    if (!s) return false;
    const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    this.selectedClass = HERO_CLASSES.find(h => h.id === s.heroId) ?? HERO_CLASSES[0];
    this.newRun();
    this.time = num(s.time);
    this.kills = Math.max(0, Math.floor(num(s.kills)));
    this.level = Math.min(200, Math.max(1, Math.floor(num(s.level, 1))));
    this.xp = Math.max(0, num(s.xp));
    this.weapons = { bolt: num(s.weapons?.bolt), orbit: num(s.weapons?.orbit), nova: num(s.weapons?.nova), arc: num(s.weapons?.arc) };
    this.weaponTimers = { bolt: 0, orbit: 0, nova: 0, arc: 0 };
    this.orbitAngle = num(s.orbitAngle);
    this.upgrades = {
      damage: num(s.upgrades?.damage), maxHp: num(s.upgrades?.maxHp), speed: num(s.upgrades?.speed), area: num(s.upgrades?.area),
      cooldown: num(s.upgrades?.cooldown), magnet: num(s.upgrades?.magnet), armor: num(s.upgrades?.armor), regen: num(s.upgrades?.regen),
    };
    this.pendingLevelUps = Math.max(0, Math.floor(num(s.pendingLevelUps)));
    this.spawnAcc = num(s.spawnAcc);
    this.nextBossIndex = Math.max(0, Math.floor(num(s.nextBossIndex)));
    this.player = {
      x: num(s.x), y: num(s.y), hp: Math.min(this.maxHp, Math.max(1, num(s.hp, this.maxHp))), invuln: 0, facing: num(s.facing),
    };
    return true;
  }

  /** Records a finished run for logged-in players. Guest runs stay local. */
  private async recordRunRemote(victory: boolean): Promise<void> {
    if (this.userId && this.serverReady) {
      await this.d2sService.recordRun({
        userId: this.userId, timeSeconds: Math.floor(this.time), kills: this.kills, level: this.level, victory,
      }, this.authToken);
    }
    await this.loadHighScores();
  }

  /** Top runs from the server, shown on the hero select screen. */
  async loadHighScores(): Promise<void> {
    const res = await this.d2sService.getHighScores(10);
    if (res.ok && res.data) {
      this.highScores = res.data;
      this.ngZone.run(() => this.cdr.detectChanges());
    }
  }

  /** Writes the roguelite progress so it survives death, New run and page reloads. */
  private saveMeta(): void {
    const meta: MetaSave = { gold: this.gold, potions: this.potions, inventory: this.inventory, equipped: this.equipped };
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (err) {
      console.warn('D2 Survivors: could not save progress.', err);
    }
    this.scheduleServerSave();
  }

  // ---------- Run lifecycle ----------

  newRun(): void {
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.message = '';
    this.messageTimer = 0;
    this.choices = [];
    this.selectedItem = null;
    this.player = { x: 0, y: 0, hp: 0, invuln: 0, facing: 0 };
    this.weapons = { bolt: 0, orbit: 0, nova: 0, arc: 0 };
    this.weapons[this.selectedClass.start] = 1;
    this.weaponTimers = { bolt: 0, orbit: 0, nova: 0, arc: 0 };
    this.orbitAngle = 0;
    this.upgrades = { damage: 0, maxHp: 0, speed: 0, area: 0, cooldown: 0, magnet: 0, armor: 0, regen: 0 };
    this.player.hp = this.maxHp;
    this.groundItems = [];
    this.enemies = [];
    this.projectiles = [];
    this.mines = [];
    this.mineTimer = 0;
    this.spiritTimer = 0;
    this.spiritAngle = 0;
    this.drops = [];
    this.effects = [];
    this.floaters = [];
    this.spawnAcc = 0;
    this.nextBossIndex = 0;
    this.pendingLevelUps = 0;
    this.keys.clear();
    this.phase = 'playing';
    this.toast('Survive the Mausoleum for ten minutes.');
    this.syncMusic();
  }

  private endRun(victory: boolean): void {
    this.setPhase(victory ? 'victory' : 'gameover');
    this.sfx(victory ? 660 : 110, 0.6, 'triangle', 0.08);
    void this.recordRunRemote(victory);
  }

  private setPhase(next: Phase): void {
    this.phase = next;
    this.saveMeta();
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  private toast(text: string): void {
    this.message = text;
    this.messageTimer = 2.5;
  }

  // ---------- Stats ----------

  stat(key: StatKey): number {
    let total = BASE_STATS[key] + this.upgrades[key] + (this.selectedClass.bonus[key] ?? 0);
    for (const slot of this.slots) {
      total += this.equipped[slot]?.stats[key] ?? 0;
    }
    return total;
  }

  get maxHp(): number {
    return this.stat('maxHp');
  }

  // ---------- Input ----------

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
    this.ensureAudio();
    this.keys.add(key);
    if (key === 'escape') {
      if (this.phase === 'shop') this.closeShop();
      else this.togglePause();
    } else if (key === 'p') {
      this.togglePause();
    } else if (key === 'c') {
      this.openShop();
    } else if (key === 'h') {
      this.drinkPotion();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBeforeUnload = (): void => {
    this.saveMeta();
    void this.pushToServer(true);
  };

  // ---------- Hero select ----------

  openSelect(): void {
    this.setPhase('select');
    this.loadHighScores();
  }

  chooseHero(index: number): void {
    const hero = HERO_CLASSES[index];
    if (!hero) return;
    this.selectedClass = hero;
    this.newRun();
  }

  /** Draws the hero select scene: heroes gathered around a campfire in a dark settlement. */
  private drawFirePit(ctx: CanvasRenderingContext2D): void {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const t = performance.now() / 1000;
    const cx = W / 2;
    const cy = H * 0.5;
    const groundY = H * 0.42;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#060508';
    ctx.fillRect(0, 0, W, H);

    // Dark stone buildings with a few flickering windows.
    for (let i = 0; i < 9; i++) {
      const x = (i / 9) * W;
      const bw = W / 9 + 4;
      const bh = H * (0.22 + ((i * 37) % 11) / 60);
      ctx.fillStyle = '#100c09';
      ctx.fillRect(x, groundY - bh, bw, bh);
      if (i % 2 === 0) {
        ctx.fillStyle = `rgba(214, 140, 60, ${0.35 * (0.6 + 0.4 * Math.sin(t * 3 + i))})`;
        ctx.fillRect(x + bw * 0.3, groundY - bh * 0.7, 8, 10);
      }
    }

    // Ground: dimmed floor tiles.
    ctx.fillStyle = '#1a140e';
    ctx.fillRect(0, groundY, W, H - groundY);
    const floor = this.sprites.floor;
    if (floor && floor.complete && floor.naturalWidth > 0) {
      const spec = SPRITE_SPECS.floor;
      ctx.globalAlpha = 0.5;
      for (let x = 0; x < W; x += TILE) {
        for (let y = groundY; y < H; y += TILE) {
          const v = hashTile(Math.floor(x / TILE), Math.floor(y / TILE)) % 3;
          ctx.drawImage(floor, v * spec.fw + (spec.ox ?? 0), spec.oy ?? 0, spec.fw, spec.fh, x, y, TILE, TILE);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Warm light spilling from the fire.
    const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(W, H) * 0.5);
    glow.addColorStop(0, 'rgba(255, 140, 50, 0.55)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Stone ring and logs.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      ctx.fillStyle = '#2d2822';
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 46, cy + 4 + Math.sin(a) * 16, 9, 7, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#3b2414';
    ctx.save(); ctx.translate(cx, cy + 4); ctx.rotate(-0.25); ctx.fillRect(-34, -5, 68, 10); ctx.restore();
    ctx.save(); ctx.translate(cx, cy + 4); ctx.rotate(0.3); ctx.fillRect(-30, -4, 60, 9); ctx.restore();

    // Flames rising from the logs.
    for (let i = 0; i < 28; i++) {
      const seed = i * 0.37;
      const life = (t * 0.7 + seed) % 1;
      const x = cx + Math.sin(seed * 9.1 + t * 4) * (4 + life * 10);
      const y = cy - 4 - life * 74;
      ctx.globalAlpha = 0.9 * (1 - life);
      ctx.fillStyle = life < 0.3 ? '#ffe68a' : life < 0.65 ? '#ff8c2e' : '#b8320f';
      ctx.beginPath();
      ctx.arc(x, y, 3 + 9 * (1 - life), 0, TAU);
      ctx.fill();
    }

    // Embers drifting up.
    for (let i = 0; i < 12; i++) {
      const life = (t * 0.25 + i * 0.13) % 1;
      const x = cx + Math.sin(i * 5.3 + t + life * 4) * (20 + life * 60);
      const y = cy - 20 - life * 200;
      ctx.globalAlpha = 0.8 * (1 - life);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Heroes gathered around the fire.
    const spacing = Math.min(150, W / (this.heroClasses.length + 1));
    this.heroClasses.forEach((hero, i) => {
      const x = cx + (i - (this.heroClasses.length - 1) / 2) * spacing;
      this.drawHeroFigure(ctx, hero, x, cy + 20, t, i);
    });
  }

  private drawHeroFigure(ctx: CanvasRenderingContext2D, hero: HeroClass, x: number, y: number, t: number, index: number): void {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 2 + index * 1.3) * 1.5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 14, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b1612';
    ctx.fillRect(-7, 12, 5, 16);
    ctx.fillRect(2, 12, 5, 16);
    ctx.fillStyle = hero.color;
    ctx.fillRect(-10, -6, 20, 20);
    ctx.fillStyle = '#c9a27a';
    ctx.beginPath();
    ctx.arc(0, -14, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hero.color;
    ctx.beginPath();
    ctx.arc(0, -15, 8, Math.PI, 0);
    ctx.fill();
    // Class gear.
    switch (hero.id) {
      case 'knight':
        ctx.fillStyle = '#c8ccd4';
        ctx.fillRect(12, -18, 3, 26);
        break;
      case 'pyromancer':
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(-14, -20, 2, 30);
        ctx.fillStyle = '#ff8c2e';
        ctx.beginPath();
        ctx.arc(-13, -22, 4, 0, TAU);
        ctx.fill();
        break;
      case 'rogue':
        ctx.fillStyle = '#c8ccd4';
        ctx.fillRect(10, -2, 8, 2);
        break;
      default:
        ctx.fillStyle = '#6b5a8a';
        ctx.beginPath();
        ctx.arc(-14, 2, 7, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
  }

  togglePause(): void {
    if (this.phase === 'playing') this.setPhase('paused');
    else if (this.phase === 'paused') this.setPhase('playing');
  }

  openShop(): void {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.beforeModal = this.phase;
    this.setPhase('shop');
  }

  closeShop(): void {
    if (this.phase !== 'shop') return;
    this.setPhase(this.beforeModal);
  }

  onCanvasClick(event: MouseEvent): void {
    this.ensureAudio();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || (this.phase !== 'playing' && this.phase !== 'paused')) return;
    const rect = canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (event.clientY - rect.top) * (canvas.height / rect.height);
    const wx = this.player.x + sx - canvas.width / 2;
    const wy = this.player.y + sy - canvas.height / 2;
    let best: GroundItem | null = null;
    let bestDist = 40;
    for (const g of this.groundItems) {
      const d = Math.hypot(g.x - wx, g.y - wy);
      if (d < bestDist) { bestDist = d; best = g; }
    }
    if (!best) return;
    if (this.inventory.length >= MAX_INVENTORY) {
      this.toast('Inventory is full.');
      return;
    }
    this.inventory.push(best.item);
    this.groundItems = this.groundItems.filter(g => g !== best);
    this.sfx(520, 0.08, 'sine', 0.05);
    this.toast(`Picked up ${best.item.name}.`);
  }

  // ---------- Shop, inventory and items ----------

  buy(entry: ShopItem): void {
    if (this.gold < entry.price) {
      this.toast('Not enough gold.');
      return;
    }
    if (entry.id === 'potion') {
      this.gold -= entry.price;
      this.potions++;
      this.toast('Bought a Healing Potion.');
      return;
    }
    if (this.inventory.length >= MAX_INVENTORY) {
      this.toast('Inventory is full.');
      return;
    }
    this.gold -= entry.price;
    const minRarity: Rarity = entry.id === 'rare' ? 'magic' : 'normal';
    const item = this.generateItem(minRarity);
    this.inventory.push(item);
    this.toast(`Charsi hands you ${item.name}.`);
  }

  onInventoryClick(item: Item, event: MouseEvent): void {
    if (event.shiftKey) {
      this.sell(item);
      return;
    }
    this.selectedItem = item;
  }

  onInventoryRightClick(item: Item, event: MouseEvent): void {
    event.preventDefault();
    this.equip(item);
  }

  onEquippedClick(slot: Slot): void {
    const current = this.equipped[slot];
    if (!current) return;
    if (this.inventory.length >= MAX_INVENTORY) {
      this.toast('Inventory is full.');
      return;
    }
    delete this.equipped[slot];
    this.inventory.push(current);
  }

  equip(item: Item): void {
    const index = this.inventory.indexOf(item);
    if (index < 0) return;
    this.inventory.splice(index, 1);
    const previous = this.equipped[item.slot];
    if (previous) this.inventory.push(previous);
    this.equipped[item.slot] = item;
    this.selectedItem = item;
    this.toast(`Equipped ${item.name}.`);
  }

  sell(item: Item): void {
    const index = this.inventory.indexOf(item);
    if (index < 0) return;
    this.inventory.splice(index, 1);
    this.gold += item.value;
    if (this.selectedItem === item) this.selectedItem = null;
    this.sfx(330, 0.1, 'triangle', 0.05);
    this.toast(`Sold ${item.name} for ${item.value} gold.`);
  }

  drinkPotion(): void {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    if (this.potions <= 0) {
      this.toast('No potions left.');
      return;
    }
    if (this.player.hp >= this.maxHp) {
      this.toast('Life is already full.');
      return;
    }
    this.potions--;
    this.player.hp = Math.min(this.maxHp, this.player.hp + POTION_HEAL);
    this.sfx(740, 0.15, 'sine', 0.05);
  }

  describeStat(key: StatKey, value: number): string {
    switch (key) {
      case 'damage': return `+${Math.round(value * 100)}% damage`;
      case 'area': return `+${Math.round(value * 100)}% area`;
      case 'cooldown': return `+${Math.round(value * 100)}% attack speed`;
      case 'maxHp': return `+${Math.round(value)} life`;
      case 'regen': return `+${value.toFixed(1)} life/sec`;
      case 'armor': return `+${Math.round(value)} armor`;
      case 'speed': return `+${Math.round(value)} move speed`;
      case 'magnet': return `+${Math.round(value)} pickup range`;
    }
  }

  describeItem(item: Item): string {
    const lines = [`${item.name} (${item.rarity})`];
    for (const key of Object.keys(item.stats) as StatKey[]) {
      lines.push(this.describeStat(key, item.stats[key] ?? 0));
    }
    lines.push(`Sells for ${item.value} gold`);
    return lines.join('\n');
  }

  private generateItem(minRarity: Rarity = 'normal'): Item {
    const slot: Slot = (['weapon', 'armor', 'charm'] as Slot[])[randInt(0, 2)];
    const roll = Math.random();
    let rarity: Rarity = roll < 0.7 ? 'normal' : roll < 0.95 ? 'magic' : 'rare';
    if (RARITY_RANK[rarity] < RARITY_RANK[minRarity]) rarity = minRarity;

    const pool = [...STAT_POOLS[slot]].sort(() => Math.random() - 0.5);
    const stats: Partial<Record<StatKey, number>> = {};
    for (const entry of pool.slice(0, RARITY_STATS[rarity])) {
      const value = entry.min + Math.random() * (entry.max - entry.min);
      stats[entry.key] = Math.round(value * 100) / 100;
    }

    const bases = BASE_NAMES[slot];
    const base = bases[randInt(0, bases.length - 1)];
    const prefix = PREFIXES[randInt(0, PREFIXES.length - 1)];
    const suffix = SUFFIXES[randInt(0, SUFFIXES.length - 1)];
    const name = rarity === 'normal' ? base : rarity === 'magic' ? `${prefix} ${base}` : `${prefix} ${base} ${suffix}`;
    return {
      id: this.nextItemId++,
      name,
      slot,
      rarity,
      stats,
      value: RARITY_VALUE[rarity] + Object.keys(stats).length * 2,
    };
  }

  // ---------- Level ups ----------

  private buildChoices(): Choice[] {
    const pool: Choice[] = [];
    (Object.keys(WEAPON_INFO) as WeaponKey[]).forEach(key => {
      const level = this.weapons[key];
      if (level >= MAX_WEAPON_LEVEL) return;
      const info = WEAPON_INFO[key];
      pool.push({
        kind: 'weapon',
        key,
        label: level === 0 ? `Learn ${info.name}` : `${info.name} to level ${level + 1}`,
        desc: info.desc,
      });
    });
    for (const upgrade of STAT_UPGRADES) {
      pool.push({ kind: 'stat', key: upgrade.key, label: upgrade.label, desc: 'Permanent upgrade.' });
    }
    return pool.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  chooseUpgrade(index: number): void {
    const choice = this.choices[index];
    if (!choice) return;
    this.applyChoice(choice);
    this.pendingLevelUps--;
    if (this.pendingLevelUps > 0) {
      this.choices = this.buildChoices();
    } else {
      this.choices = [];
      this.setPhase('playing');
    }
  }

  private applyChoice(choice: Choice): void {
    if (choice.kind === 'weapon') {
      const key = choice.key as WeaponKey;
      if (this.weapons[key] === 0) this.weaponTimers[key] = 0;
      this.weapons[key]++;
      this.sfx(880, 0.12, 'triangle', 0.05);
      return;
    }
    const key = choice.key as StatKey;
    const upgrade = STAT_UPGRADES.find(u => u.key === key);
    if (!upgrade) return;
    this.upgrades[key] += upgrade.amount;
    if (key === 'maxHp') this.player.hp += upgrade.amount;
    this.sfx(880, 0.12, 'triangle', 0.05);
  }

  private openLevelUp(): void {
    if (this.autoStats) {
      while (this.pendingLevelUps > 0) {
        const pick = this.buildChoices()[0];
        if (!pick) break;
        this.applyChoice(pick);
        this.pendingLevelUps--;
      }
      this.pendingLevelUps = 0;
      return;
    }
    this.choices = this.buildChoices();
    this.setPhase('levelup');
  }

  private addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.pendingLevelUps++;
      this.floaters.push({ x: this.player.x, y: this.player.y - 30, text: 'Level up!', color: '#ffd34d', life: 1.4 });
    }
  }

  // ---------- Audio ----------

  toggleMusic(): void {
    this.musicOn = !this.musicOn;
    this.ensureAudio();
    this.syncMusic();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.ensureAudio();
    this.syncMusic();
  }

  toggleSound(): void {
    this.soundOn = !this.soundOn;
    this.ensureAudio();
  }

  private ensureAudio(): void {
    if (!this.audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      this.audioCtx = new Ctor();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    this.syncMusic();
  }

  private sfx(freq: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.audioCtx || !this.soundOn || this.muted) return;
    const now = performance.now();
    if (now - this.lastSfxAt < 35) return;
    this.lastSfxAt = now;
    const ctx = this.audioCtx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  private syncMusic(): void {
    const shouldPlay = !!this.audioCtx && this.musicOn && !this.muted;
    if (shouldPlay && this.droneOscs.length === 0) {
      const ctx = this.audioCtx!;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0.025;
      filter.connect(gain);
      gain.connect(ctx.destination);
      for (const freq of [55, 82.4]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start();
        this.droneOscs.push(osc);
      }
      this.droneGain = gain;
    } else if (!shouldPlay && this.droneOscs.length > 0) {
      this.stopDrone();
    }
  }

  private stopDrone(): void {
    for (const osc of this.droneOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    this.droneOscs = [];
    this.droneGain?.disconnect();
    this.droneGain = null;
  }

  // ---------- Game loop ----------

  private frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        if (this.phase === 'playing') this.update(dt, canvas);
        if (this.phase === 'select') this.drawFirePit(ctx);
        else this.render(ctx);
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number, canvas: HTMLCanvasElement): void {
    this.time += dt;
    if (this.time >= RUN_SECONDS) {
      this.endRun(true);
      return;
    }
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.updatePlayer(dt);
    this.updateSpawns(dt, canvas);
    this.updateWeapons(dt);
    this.updateClassMechanics(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.updateDrops(dt);
    this.updateEffects(dt);
    if (this.pendingLevelUps > 0 && this.phase === 'playing') this.openLevelUp();
    if (this.player.hp <= 0) this.endRun(false);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      p.facing = Math.atan2(dy, dx);
      const speed = this.stat('speed');
      p.x += dx * speed * dt;
      p.y += dy * speed * dt;
    }
    p.invuln = Math.max(0, p.invuln - dt);
    const regen = this.stat('regen');
    if (regen > 0) p.hp = Math.min(this.maxHp, p.hp + regen * dt);
  }

  private spawnRadius(canvas: HTMLCanvasElement): number {
    return Math.hypot(canvas.width, canvas.height) / 2 + 40;
  }

  private updateSpawns(dt: number, canvas: HTMLCanvasElement): void {
    this.spawnAcc += dt * Math.min(14, 1.3 + this.time / 40);
    while (this.spawnAcc >= 1 && this.enemies.length < MAX_ENEMIES) {
      this.spawnAcc -= 1;
      this.spawnEnemy(this.pickEnemyKind(), canvas, false);
    }
    this.spawnAcc = Math.min(this.spawnAcc, 1);

    if (this.nextBossIndex < BOSS_TIMES.length && this.time >= BOSS_TIMES[this.nextBossIndex]) {
      this.nextBossIndex++;
      this.spawnEnemy('lord', canvas, true);
      this.sfx(90, 0.9, 'sawtooth', 0.08);
      this.toast('The Mausoleum Lord has risen!');
    }
  }

  private pickEnemyKind(): EnemyKind {
    const pool: EnemyKind[] = ['skeleton', 'skeleton', 'skeleton'];
    if (this.time >= 30) pool.push('zombie', 'zombie');
    if (this.time >= 45) pool.push('fallen', 'fallen', 'fallen');
    if (this.time >= 90) pool.push('bat', 'bat');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private spawnEnemy(kind: EnemyKind, canvas: HTMLCanvasElement, boss: boolean): void {
    const info = ENEMY_INFO[kind];
    const angle = Math.random() * TAU;
    const dist = this.spawnRadius(canvas);
    const hp = boss ? info.hp * (1 + this.time / 300) : info.hp * (1 + this.time / 150);
    this.enemies.push({
      kind,
      x: this.player.x + Math.cos(angle) * dist,
      y: this.player.y + Math.sin(angle) * dist,
      hp,
      maxHp: hp,
      speed: info.speed,
      r: info.r,
      dmg: info.dmg * (1 + this.time / 300),
      xp: info.xp,
      gold: boss ? 60 : 0,
      boss,
      flash: 0,
      orbitCd: 0,
      phase: Math.random() * TAU,
    });
  }

  private nearestEnemies(count: number, range: number): Enemy[] {
    const p = this.player;
    return this.enemies
      .filter(e => e.hp > 0)
      .map(e => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
      .filter(entry => entry.d <= range)
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map(entry => entry.e);
  }

  private damageEnemy(e: Enemy, amount: number): void {
    e.hp -= amount;
    e.flash = 0.08;
    this.floaters.push({ x: e.x, y: e.y - e.r, text: String(Math.max(1, Math.round(amount))), color: '#fff3d6', life: 0.6 });
    if (this.floaters.length > 150) this.floaters.splice(0, this.floaters.length - 150);
  }

  private updateWeapons(dt: number): void {
    const cooldownMul = Math.max(0.35, 1 - this.stat('cooldown'));
    const areaMul = 1 + this.stat('area');
    const damageMul = 1 + this.stat('damage');

    if (this.weapons.bolt > 0) {
      this.weaponTimers.bolt -= dt;
      if (this.weaponTimers.bolt <= 0) {
        this.weaponTimers.bolt = 0.8 * cooldownMul;
        this.fireBolts(this.weapons.bolt, damageMul);
      }
    }
    if (this.weapons.nova > 0) {
      this.weaponTimers.nova -= dt;
      if (this.weaponTimers.nova <= 0) {
        this.weaponTimers.nova = 2.2 * cooldownMul;
        this.fireNova(this.weapons.nova, damageMul, areaMul);
      }
    }
    if (this.weapons.arc > 0) {
      this.weaponTimers.arc -= dt;
      if (this.weaponTimers.arc <= 0) {
        this.weaponTimers.arc = 1.6 * cooldownMul;
        this.fireArc(this.weapons.arc, damageMul, areaMul);
      }
    }
    if (this.weapons.orbit > 0) {
      this.orbitAngle += dt * 2.6;
      const blades = this.weapons.orbit;
      const radius = (58 + blades * 6) * areaMul;
      const damage = (6 + blades * 3) * damageMul;
      for (let i = 0; i < blades; i++) {
        const angle = this.orbitAngle + (i * TAU) / blades;
        const bx = this.player.x + Math.cos(angle) * radius;
        const by = this.player.y + Math.sin(angle) * radius;
        for (const e of this.enemies) {
          if (e.hp > 0 && e.orbitCd <= 0 && Math.hypot(e.x - bx, e.y - by) < e.r + 8) {
            this.damageEnemy(e, damage);
            e.orbitCd = 0.5;
          }
        }
      }
    }
  }

  /** Pyromancer: every third bolt on the same foe bursts in flame around it. */
  private addBrand(e: Enemy, dmg: number): void {
    e.brand = (e.brand ?? 0) + 1;
    if (e.brand < 3) {
      this.floaters.push({ x: e.x, y: e.y - e.r - 10, text: `Ember ${e.brand}`, color: '#ffb347', life: 0.5 });
      return;
    }
    e.brand = 0;
    const radius = 70 * (1 + this.stat('area'));
    for (const other of this.enemies) {
      if (other.hp > 0 && Math.hypot(other.x - e.x, other.y - e.y) <= radius + other.r) {
        this.damageEnemy(other, dmg * 1.5);
      }
    }
    this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: radius, pts: [], life: 0.4, maxLife: 0.4 });
    this.sfx(330, 0.12, 'sawtooth', 0.03);
  }

  /** Rogue lays snare mines as it moves; Warden is accompanied by a guardian spirit. */
  private updateClassMechanics(dt: number): void {
    const id = this.selectedClass.id;
    const damageMul = 1 + this.stat('damage');
    const cooldownMul = Math.max(0.35, 1 - this.stat('cooldown'));

    if (id === 'rogue') {
      this.mineTimer -= dt;
      if (this.mineTimer <= 0) {
        this.mineTimer = 4 * cooldownMul;
        this.mines.push({ x: this.player.x, y: this.player.y, life: 12, arm: 0.6 });
        if (this.mines.length > 20) this.mines.shift();
      }
    }
    for (const m of this.mines) {
      m.life -= dt;
      m.arm -= dt;
      if (m.arm > 0 || m.life <= 0) continue;
      if (!this.enemies.some(e => e.hp > 0 && Math.hypot(e.x - m.x, e.y - m.y) < e.r + 10)) continue;
      m.life = 0;
      const radius = 50 * (1 + this.stat('area'));
      for (const e of this.enemies) {
        if (e.hp > 0 && Math.hypot(e.x - m.x, e.y - m.y) <= radius + e.r) {
          this.damageEnemy(e, (24 + 4 * this.level) * damageMul);
        }
      }
      this.effects.push({ kind: 'ring', x: m.x, y: m.y, r: radius, pts: [], life: 0.35, maxLife: 0.35 });
      this.sfx(90, 0.15, 'square', 0.03);
    }
    this.mines = this.mines.filter(m => m.life > 0);

    if (id === 'warden') {
      this.spiritAngle += dt * 1.8;
      this.spiritTimer -= dt;
      if (this.spiritTimer <= 0) {
        const target = this.nearestEnemies(1, 200)[0];
        if (!target) {
          this.spiritTimer = 0.25;
        } else {
          this.spiritTimer = 1.2 * cooldownMul;
          const spirit = this.spiritPos();
          this.damageEnemy(target, (10 + 3 * this.level) * damageMul);
          this.effects.push({ kind: 'arc', x: 0, y: 0, r: 0, pts: [spirit.x, spirit.y, target.x, target.y], life: 0.2, maxLife: 0.2 });
          this.sfx(900, 0.05, 'triangle', 0.02);
        }
      }
    }
  }

  private spiritPos(): { x: number; y: number } {
    const rx = 46 + this.stat('area') * 40;
    return {
      x: this.player.x + Math.cos(this.spiritAngle) * rx,
      y: this.player.y + Math.sin(this.spiritAngle) * rx * 0.6,
    };
  }

  private drawClassMechanics(ctx: CanvasRenderingContext2D): void {
    for (const m of this.mines) {
      const armed = m.arm <= 0;
      ctx.save();
      ctx.fillStyle = armed ? '#e05555' : '#7a5a5a';
      if (armed) {
        ctx.shadowColor = '#ff4040';
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (this.selectedClass.id === 'warden') {
      const s = this.spiritPos();
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#b39ddb';
      ctx.shadowColor = '#7e57c2';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private fireBolts(level: number, damageMul: number): void {
    const targets = this.nearestEnemies(level, 900);
    if (targets.length === 0) return;
    for (let i = 0; i < level; i++) {
      const target = targets[i % targets.length];
      const dx = target.x - this.player.x;
      const dy = target.y - this.player.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 520;
      this.projectiles.push({
        x: this.player.x,
        y: this.player.y,
        vx: (dx / d) * speed,
        vy: (dy / d) * speed,
        dmg: (12 + 5 * level) * damageMul,
        life: 1.2,
      });
    }
    this.sfx(620, 0.05, 'square', 0.025);
  }

  private fireNova(level: number, damageMul: number, areaMul: number): void {
    const radius = (110 + 18 * level) * areaMul;
    for (const e of this.enemies) {
      if (e.hp > 0 && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= radius + e.r) {
        this.damageEnemy(e, (14 + 6 * level) * damageMul);
      }
    }
    this.effects.push({ kind: 'ring', x: this.player.x, y: this.player.y, r: radius, pts: [], life: 0.5, maxLife: 0.5 });
    this.sfx(180, 0.25, 'sawtooth', 0.04);
  }

  private fireArc(level: number, damageMul: number, areaMul: number): void {
    const range = 170 * areaMul;
    const first = this.nearestEnemies(1, range)[0];
    if (!first) return;
    const hit = new Set<Enemy>();
    const pts: number[] = [this.player.x, this.player.y];
    let current: Enemy | undefined = first;
    const chains = 2 + level;
    for (let i = 0; i < chains && current; i++) {
      hit.add(current);
      this.damageEnemy(current, (10 + 4 * level) * damageMul);
      pts.push(current.x, current.y);
      let next: Enemy | undefined;
      let best = 140 * areaMul;
      for (const e of this.enemies) {
        if (hit.has(e) || e.hp <= 0) continue;
        const d = Math.hypot(e.x - current.x, e.y - current.y);
        if (d < best) { best = d; next = e; }
      }
      current = next;
    }
    this.effects.push({ kind: 'arc', x: 0, y: 0, r: 0, pts, life: 0.2, maxLife: 0.2 });
    this.sfx(1200, 0.06, 'sawtooth', 0.02);
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      for (const e of this.enemies) {
        if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 5) {
          this.damageEnemy(e, p.dmg);
          if (this.selectedClass.id === 'pyromancer') this.addBrand(e, p.dmg);
          p.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  private updateEnemies(dt: number): void {
    const alive: Enemy[] = [];
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0) {
        this.onEnemyKilled(e);
        continue;
      }
      e.flash = Math.max(0, e.flash - dt);
      e.orbitCd = Math.max(0, e.orbitCd - dt);
      e.phase += dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let vx = (dx / d) * e.speed;
      let vy = (dy / d) * e.speed;
      if (e.kind === 'bat') {
        const wobble = Math.sin(e.phase * 6) * 0.8 * e.speed;
        vx += (-dy / d) * wobble;
        vy += (dx / d) * wobble;
      }
      e.x += vx * dt;
      e.y += vy * dt;
      if (d < e.r + PLAYER_R && p.invuln <= 0) {
        this.damagePlayer(e.dmg);
      }
      alive.push(e);
    }
    this.enemies = alive;
  }

  private damagePlayer(amount: number): void {
    // Knight's Ward: a constant 15% reduction before armor.
    const ward = this.selectedClass.id === 'knight' ? 0.85 : 1;
    const taken = Math.max(1, amount * ward - this.stat('armor'));
    this.player.hp -= taken;
    this.player.invuln = 0.5;
    this.floaters.push({ x: this.player.x, y: this.player.y - 20, text: `-${Math.round(taken)}`, color: '#ff6b6b', life: 0.7 });
    this.sfx(160, 0.08, 'square', 0.04);
  }

  private onEnemyKilled(e: Enemy): void {
    this.kills++;
    this.drops.push({ x: e.x, y: e.y, v: e.xp, kind: 'xp' });
    if (e.boss) {
      this.drops.push({ x: e.x, y: e.y, v: e.gold, kind: 'gold' });
      this.toast('The Mausoleum Lord is slain!');
      this.sfx(440, 0.5, 'triangle', 0.08);
      for (let i = 0; i < 2; i++) this.dropItem(e.x, e.y, 'magic');
    } else {
      if (Math.random() < 0.35) {
        this.drops.push({ x: e.x, y: e.y, v: randInt(1, 3), kind: 'gold' });
      }
      if (Math.random() < 0.035) this.dropItem(e.x, e.y, 'normal');
    }
    this.sfx(260 + Math.random() * 120, 0.05, 'square', 0.02);
  }

  private dropItem(x: number, y: number, minRarity: Rarity): void {
    const item = this.generateItem(minRarity);
    this.groundItems.push({ x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, item, age: 0 });
    if (this.groundItems.length > 40) this.groundItems.shift();
  }

  private updateDrops(dt: number): void {
    const p = this.player;
    const magnet = this.stat('magnet');
    const remaining: Drop[] = [];
    for (const d of this.drops) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < magnet) {
        const pull = 420 + (magnet - dist) * 4;
        d.x += (dx / (dist || 1)) * pull * dt;
        d.y += (dy / (dist || 1)) * pull * dt;
      }
      if (Math.hypot(p.x - d.x, p.y - d.y) < 14) {
        if (d.kind === 'xp') this.addXp(d.v);
        else this.gold += d.v;
      } else {
        remaining.push(d);
      }
    }
    this.drops = remaining;
    for (const g of this.groundItems) g.age += dt;
  }

  private updateEffects(dt: number): void {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 30 * dt;
    }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  // ---------- Sprites ----------

  private loadSprites(): void {
    (Object.keys(SPRITE_SPECS) as SpriteKey[]).forEach(key => {
      const img = new Image();
      img.src = SPRITE_SPECS[key].file;
      this.sprites[key] = img;
    });
  }

  /** Draws one animation frame centred on (cx, cy). Returns false until the sheet has loaded. */
  private drawSpriteFrame(
    ctx: CanvasRenderingContext2D, key: SpriteKey, t: number,
    cx: number, cy: number, height: number, flip: boolean,
  ): boolean {
    const img = this.sprites[key];
    if (!img || !img.complete || img.naturalWidth === 0) return false;
    const spec = SPRITE_SPECS[key];
    const frame = Math.floor(t * spec.fps) % spec.frames;
    const width = height * (spec.fw / spec.fh);
    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, (spec.ox ?? 0) + frame * spec.fw, (spec.oy ?? 0) + spec.row * spec.fh, spec.fw, spec.fh, -width / 2, -height / 2, width, height);
    ctx.restore();
    return true;
  }

  // ---------- Rendering ----------

  private render(ctx: CanvasRenderingContext2D): void {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const camX = this.player.x - W / 2;
    const camY = this.player.y - H / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(0, 0, W, H);
    this.drawGround(ctx, W, H, camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);
    this.drawDrops(ctx);
    this.drawGroundItems(ctx);
    for (const e of this.enemies) this.drawEnemy(ctx, e);
    this.drawPlayer(ctx);
    this.drawWeaponsWorld(ctx);
    this.drawClassMechanics(ctx);
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Torchlight falloff: darkens the edges of the screen around the hero.
    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    this.drawHud(ctx, W, H);
  }

  private drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, camX: number, camY: number): void {
    const x0 = Math.floor(camX / TILE) - 1;
    const x1 = Math.floor((camX + W) / TILE) + 1;
    const y0 = Math.floor(camY / TILE) - 1;
    const y1 = Math.floor((camY + H) / TILE) + 1;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const h = hashTile(ix, iy);
        const sx = ix * TILE - camX;
        const sy = iy * TILE - camY;
        const floor = this.sprites.floor;
        if (floor && floor.complete && floor.naturalWidth > 0) {
          const spec = SPRITE_SPECS.floor;
          ctx.drawImage(floor, (h % 3) * spec.fw + (spec.ox ?? 0), spec.oy ?? 0, spec.fw, spec.fh, sx, sy, TILE, TILE);
          continue;
        }
        ctx.fillStyle = h % 3 === 0 ? '#2b2118' : '#241b13';
        ctx.fillRect(sx, sy, TILE, TILE);
        if (h % 7 === 0) {
          ctx.fillStyle = '#4a3a26';
          ctx.fillRect(sx + ((h >> 3) % 50) + 6, sy + ((h >> 7) % 50) + 6, 3, 3);
        }
        if (h % 11 === 0) {
          ctx.fillStyle = '#17110b';
          ctx.fillRect(sx + ((h >> 5) % 40) + 8, sy + ((h >> 9) % 40) + 8, 6, 2);
        }
      }
    }
  }

  private drawDrops(ctx: CanvasRenderingContext2D): void {
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.kind === 'xp' ? 4 : 3.5, 0, TAU);
      ctx.fillStyle = d.kind === 'xp' ? '#6fd3ff' : '#f5c542';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private rarityColor(rarity: Rarity): string {
    return rarity === 'normal' ? '#e8e8e8' : rarity === 'magic' ? '#6a8cff' : '#ffd34d';
  }

  private drawGroundItems(ctx: CanvasRenderingContext2D): void {
    for (const g of this.groundItems) {
      const bob = Math.sin(g.age * 4) * 2;
      const color = this.rarityColor(g.item.rarity);
      ctx.save();
      ctx.translate(g.x, g.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(g.item.name, g.x, g.y + bob - 10);
      ctx.fillStyle = color;
      ctx.fillText(g.item.name, g.x, g.y + bob - 10);
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const flash = e.flash > 0;
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (!flash && this.drawSpriteFrame(ctx, ENEMY_SPRITE[e.kind], e.phase, 0, 0, ENEMY_SPRITE_HEIGHT[e.kind], e.x > this.player.x)) {
      ctx.restore();
      this.drawEnemyHealth(ctx, e);
      return;
    }
    switch (e.kind) {
      case 'skeleton': {
        ctx.fillStyle = flash ? '#ffffff' : '#d8d2c0';
        ctx.beginPath();
        ctx.arc(0, -2, r * 0.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a3428';
        ctx.fillRect(-r * 0.6, r * 0.4, r * 1.2, r * 0.6);
        ctx.fillStyle = '#b01212';
        ctx.fillRect(-4, -4, 3, 3);
        ctx.fillRect(1, -4, 3, 3);
        break;
      }
      case 'zombie': {
        ctx.fillStyle = flash ? '#ffffff' : '#5c8a3a';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2e4a1e';
        ctx.beginPath();
        ctx.arc(-r * 0.4, -r * 0.2, r * 0.25, 0, TAU);
        ctx.arc(r * 0.3, r * 0.3, r * 0.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(-r * 0.5, -r * 0.3, 3, 3);
        ctx.fillRect(r * 0.2, -r * 0.3, 3, 3);
        break;
      }
      case 'fallen': {
        ctx.fillStyle = flash ? '#ffffff' : '#a0281e';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e8d9b5';
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.4);
        ctx.lineTo(-r * 1.1, -r * 1.2);
        ctx.lineTo(-r * 0.2, -r * 0.7);
        ctx.moveTo(r * 0.7, -r * 0.4);
        ctx.lineTo(r * 1.1, -r * 1.2);
        ctx.lineTo(r * 0.2, -r * 0.7);
        ctx.fill();
        break;
      }
      case 'bat': {
        const flap = Math.sin(e.phase * 20) * 0.6 + 0.6;
        ctx.fillStyle = flash ? '#ffffff' : '#5b3a7a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-r * 2.4, -r * flap * 1.4);
        ctx.lineTo(-r * 1.2, r * 0.3);
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 2.4, -r * flap * 1.4);
        ctx.lineTo(r * 1.2, r * 0.3);
        ctx.fill();
        ctx.fillStyle = flash ? '#ffffff' : '#2a1a33';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, TAU);
        ctx.fill();
        break;
      }
      case 'lord': {
        const pulse = 0.6 + Math.sin(e.phase * 3) * 0.2;
        const aura = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2);
        aura.addColorStop(0, `rgba(200,30,20,${pulse * 0.5})`);
        aura.addColorStop(1, 'rgba(200,30,20,0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = flash ? '#ffffff' : '#2d1414';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#8a1e14';
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.45;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.12) * r * 0.9, Math.sin(a - 0.12) * r * 0.9);
          ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
          ctx.lineTo(Math.cos(a + 0.12) * r * 0.9, Math.sin(a + 0.12) * r * 0.9);
          ctx.fill();
        }
        ctx.fillStyle = '#ff3b1f';
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.2, 3, 0, TAU);
        ctx.arc(r * 0.35, -r * 0.2, 3, 0, TAU);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
    this.drawEnemyHealth(ctx, e);
  }

  private drawEnemyHealth(ctx: CanvasRenderingContext2D, e: Enemy): void {
    if (e.hp >= e.maxHp && !e.boss) return;
    const width = e.boss ? 120 : e.r * 2.2;
    const frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x - width / 2, e.y - e.r - 9, width, 4);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(e.x - width / 2, e.y - e.r - 9, width * frac, 4);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    const blink = p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, PLAYER_R, 12, 5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (!this.drawSpriteFrame(ctx, 'hero', this.time, 0, 0, 44, Math.cos(p.facing) < 0)) {
      ctx.fillStyle = '#3d6d9c';
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d4bb7e';
      ctx.beginPath();
      ctx.arc(0, -3, PLAYER_R * 0.55, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.facing) * PLAYER_R * 0.8, Math.sin(p.facing) * PLAYER_R * 0.8);
    ctx.lineTo(Math.cos(p.facing) * (PLAYER_R + 12), Math.sin(p.facing) * (PLAYER_R + 12));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawWeaponsWorld(ctx: CanvasRenderingContext2D): void {
    const areaMul = 1 + this.stat('area');
    for (const pr of this.projectiles) {
      ctx.save();
      ctx.fillStyle = '#ffb347';
      ctx.shadowColor = '#ff7a00';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (this.weapons.orbit > 0) {
      const blades = this.weapons.orbit;
      const radius = (58 + blades * 6) * areaMul;
      for (let i = 0; i < blades; i++) {
        const angle = this.orbitAngle + (i * TAU) / blades;
        ctx.save();
        ctx.translate(this.player.x + Math.cos(angle) * radius, this.player.y + Math.sin(angle) * radius);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillStyle = '#cfd8dc';
        ctx.shadowColor = '#90caf9';
        ctx.shadowBlur = 6;
        ctx.fillRect(-2, -7, 4, 14);
        ctx.restore();
      }
    }
    for (const fx of this.effects) {
      const t = 1 - fx.life / fx.maxLife;
      if (fx.kind === 'ring') {
        ctx.save();
        ctx.strokeStyle = `rgba(120,220,255,${1 - t})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (0.3 + 0.7 * t), 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.strokeStyle = '#9fe9ff';
        ctx.shadowColor = '#4fc3f7';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx.pts[0], fx.pts[1]);
        for (let i = 2; i < fx.pts.length; i += 2) {
          const jx = (Math.random() - 0.5) * 12;
          const jy = (Math.random() - 0.5) * 12;
          ctx.lineTo(fx.pts[i] + jx, fx.pts[i + 1] + jy);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    // XP bar along the top edge.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = '#8e6bff';
    ctx.fillRect(0, 0, W * Math.min(1, this.xp / this.xpNeeded), 6);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e6d2';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(this.timeText, W / 2, 30);
    ctx.font = '14px sans-serif';
    ctx.fillText(`Level ${this.level} · ${this.kills} kills`, W / 2, 50);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f5c542';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${this.gold} gold`, W - 16, 28);
    ctx.fillStyle = '#e8dcc4';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Potions: ${this.potions}`, W - 16, 46);

    ctx.textAlign = 'left';
    const active = (Object.keys(this.weapons) as WeaponKey[])
      .filter(k => this.weapons[k] > 0)
      .map(k => `${WEAPON_INFO[k].name} ${this.weapons[k]}`);
    ctx.fillStyle = '#c9b99a';
    ctx.font = '12px sans-serif';
    ctx.fillText(active.join('  ·  '), 16, 28);

    const barW = Math.min(320, W - 40);
    const barX = W / 2 - barW / 2;
    const barY = H - 30;
    const maxHp = this.maxHp;
    ctx.fillStyle = '#2a0a0a';
    ctx.fillRect(barX, barY, barW, 14);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(barX, barY, barW * Math.max(0, this.player.hp / maxHp), 14);
    ctx.strokeStyle = '#6b4a2b';
    ctx.strokeRect(barX, barY, barW, 14);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Life ${Math.ceil(Math.max(0, this.player.hp))} / ${maxHp}`, W / 2, barY + 11);

    if (this.messageTimer > 0 && this.message) {
      ctx.globalAlpha = Math.min(1, this.messageTimer);
      ctx.fillStyle = '#ffd34d';
      ctx.font = '14px sans-serif';
      ctx.fillText(this.message, W / 2, H - 50);
      ctx.globalAlpha = 1;
    }

    if (this.player.hp / maxHp < 0.3 && this.phase === 'playing') {
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      vignette.addColorStop(0, 'rgba(180,0,0,0)');
      vignette.addColorStop(1, 'rgba(180,0,0,0.35)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
