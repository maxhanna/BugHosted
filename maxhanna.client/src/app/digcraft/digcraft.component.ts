import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectorRef
} from '@angular/core';
import { ChildComponent } from '../child.component';
import { DigcraftService } from '../../services/digcraft.service';
import {
  BlockId, ItemId, CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE,
  InvSlot, RECIPES, CraftRecipe, BLOCK_DROPS, ITEM_NAMES, ITEM_COLORS,
  isPlaceable, getMiningSpeed, getItemDurability, getBlockHealth, DCPlayer, DCBlockChange, DCJoinResponse, SHRUB_GROW_TIME_MS,
  SEA_LEVEL
} from './digcraft-types';
import { NETHER_HEIGHT } from './digcraft-types';
import { Chunk, generateChunk, applyChanges, NETHER_TOP } from './digcraft-world';
import { BiomeId } from './digcraft-biome';
import { DigCraftRenderer, buildMVP } from './digcraft-renderer';
import { onKeyDown, onKeyUp, onMouseMove, onMouseDown, onPointerLockChange, onTouchStart, onTouchMove, onTouchEnd, getJoystickKnobTransform, requestPointerLock } from './digcraft-input';
import { PromptComponent } from '../prompt/prompt.component';
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-digcraft',
  templateUrl: './digcraft.component.html',
  styleUrl: './digcraft.component.css',
  standalone: false,
})
export class DigCraftComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('componentMain', { static: false }) componentMainRef?: ElementRef<HTMLDivElement>;
  @ViewChild('starCanvas', { static: false }) starCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('joystick', { static: false }) joystickRef?: ElementRef<HTMLDivElement>;
  @ViewChild('chatPrompt', { static: false }) chatPrompt?: PromptComponent;
  @ViewChild('avatarPreviewCanvas', { static: false }) avatarPreviewCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('fovInput') fovInput?: ElementRef<HTMLInputElement>;
  @ViewChild('viewDistanceInput') viewDistanceInput?: ElementRef<HTMLInputElement>;
  @ViewChild('mouseSensitivityInput') mouseSensitivityInput?: ElementRef<HTMLInputElement>;

  Math = Math;

  // ─── State ───
  loading = true;
  private _loadingMessage = 'Loading DigCraft...';

  get loadingDisplayMessage(): string {
    return this._loadingMessage ?? 'Loading DigCraft...';
  }
  joined = false;
  worldId = 1;
  defaultWorldId = 1;
  seed = 42;
  playerId = 0;

  // Camera / player
  camX = 8; camY = 40; camZ = 8;
  yaw = 0; pitch = 0;
  bodyYaw = 0; // Direction body is facing (movement direction)
  velY = 0;
  onGround = false;
  // Field of view in degrees (user-configurable). Default will be set on init.
  fovDeg: number = 70;
  private readonly FOV_KEY = 'digcraft.fov';
  // View distance in chunks (user-configurable). Stored locally and optionally on server.
  private readonly VIEW_DIST_KEY = 'digcraft.viewDistance';
  viewDistanceChunks: number = RENDER_DISTANCE;
  // Mouse sensitivity multiplier (stored as integer 1-20, displayed as 0.1x-2.0x)
  private readonly MOUSE_SENS_KEY = 'digcraft.mouseSensitivity';
  mouseSensitivity: number = 10;
  private readonly PLAYER_ATTACK_MAX_RANGE = 2.2; // blocks (allows reaching 2 blocks away)
  public readonly MAX_VIEW_DISTANCE = 24;

  // Inventory: 36 slots (0-8 = hotbar)
  inventory: InvSlot[] = [];
  selectedSlot = 0;
  private _showInventory = false;
  public get showInventory(): boolean { return this._showInventory; }
  public set showInventory(v: boolean) {
    this._showInventory = v;
    this.onMenuStateChanged();
    if (!v) {
      this.selectedInventoryIndex = null;
      this.disposeAvatarPreviewRenderer();
    } else {
      setTimeout(() => this.ensureAvatarPreviewRenderer(), 0);
    }
  }
  public get currentUser(): User { return this.parentRef?.user ?? new User(0, 'Anonymous'); }
  private _showCrafting = false;
  public get showCrafting(): boolean { return this._showCrafting; }
  public set showCrafting(v: boolean) { this._showCrafting = v; this.onMenuStateChanged(); }
  availableRecipes: CraftRecipe[] = [];
  craftingProgress = 0;
  craftingRecipeName = '';
  // Last crafted item id (used to scroll the recipe list to the crafted entry)
  lastCraftedItemId?: number;
  private craftScrollTimeout: any = null;
  private readonly CRAFT_SCROLL_DELAY_MS = 300;

  // Health / hunger
  health = 20;
  // Damage flash visual state (screen red flash when taking damage)
  isDamageFlash = false;
  private damageFlashTimeout: any = null;
  hunger = 20;

  // Level / Experience
  level = 1;
  exp = 0;
  private getExpForLevel(lvl: number): number {
    return lvl * 100;
  }
  get expForNextLevel(): number {
    return this.getExpForLevel(this.level + 1);
  }
  get expProgress(): number {
    const needed = this.expForNextLevel;
    return needed > 0 ? (this.exp / needed) * 100 : 0;
  }

  /** Display Y coordinate. Shows negative values in the Nether (below NETHER_TOP), positive above. */
  displayY(y: number): number {
    return Math.floor(y - NETHER_TOP);
  }

  // Celestial (sun/moon) overlay state
  celestialX = 0;
  celestialY = 0;
  celestialSize = 72;
  celestialIsDay = true;

  // Multiplayer
  otherPlayers: DCPlayer[] = [];
  get otherPlayersExcludingSelf(): DCPlayer[] {
    return this.otherPlayers.filter(p => p.userId !== this.currentUser.id);
  }
  partyMembers: { userId: number; username: string; isLeader?: boolean }[] = [];
  get partyMembersExcludingSelf(): { userId: number; username: string; isLeader?: boolean }[] {
    const myId = this.currentUser.id ?? 0;
    return this.partyMembers.filter(member => member.userId !== myId);
  }
  get hasParty(): boolean {
    return this.partyMembers.length > 0;
  }
  // Party invites
  pendingReceivedInvites: Map<number, { fromUserId: number; username: string; expiresAt: number }> = new Map();
  pendingSentInvites: Map<number, number> = new Map();
  private invitePollInterval: any = null;
  readonly INVITE_TIMEOUT_MS = 30000;
  readonly INVITE_POLL_INTERVAL_MS = 5000;
  showInvitePrompt = false;
  inviteFromUser: { userId: number; username: string } | null = null;
  // Client-side mobs (procedurally spawned, rendered like players)
  mobs: Array<any> = [];
  private mobIdCounter = 1;
  private readonly MOB_MAX = 48;
  private readonly MOB_AGGRO_RANGE = 12; // blocks
  private readonly MOB_ATTACK_RANGE = 1.0; // melee reach - must be adjacent
  private readonly MOB_ATTACK_COOLDOWN_MS = 900;

  // Block interaction
  targetBlock: { wx: number; wy: number; wz: number } | null = null;
  placementBlock: { wx: number; wy: number; wz: number } | null = null;
  /** First water block along the look ray (for bucket pickup) */
  waterRayTarget: { wx: number; wy: number; wz: number } | null = null;
  /** True when camera/body is inside water (swimming / boat) */
  isInWater = false;
  lastHitNonSolid: { wx: number; wy: number; wz: number; id: number } | null = null;
  breakingProgress = 0;
  breakingTarget: string | null = null;

  // Chunks
  chunks: Map<string, Chunk> = new Map();

  // Expose nether offset for UI mapping
  readonly NETHER_HEIGHT = NETHER_HEIGHT;
  // Track planted shrubs for growth (worldX, worldZ) -> plantedTime
  plantedShrubs: Map<string, number> = new Map();

  // Internal
  private renderer!: DigCraftRenderer;
  private avatarPreviewRenderer?: DigCraftRenderer;
  private animFrameId = 0;
  private lastTime = 0;
  private keys: Set<string> = new Set();
  initialLoad = true;
  private avatarPreviewYaw = -0.55;
  private avatarPreviewPitch = -0.08;
  private avatarPreviewDragging = false;
  private avatarPreviewPointerId: number | null = null;
  private avatarPreviewLastX = 0;
  private avatarPreviewLastY = 0;


  // Armor equipment (client-only slots)
  typeArmorSlots: Array<'helmet' | 'chest' | 'legs' | 'boots'> = ['helmet', 'chest', 'legs', 'boots'];
  equippedArmor: Record<'helmet' | 'chest' | 'legs' | 'boots', number> = { helmet: 0, chest: 0, legs: 0, boots: 0 };

  // Weapon equipment (client-only)
  equippedWeapon: number = 0;
  // Durability tracking for equipped items
  equippedWeaponDurability: number = 0;
  equippedArmorDurability: Record<'helmet' | 'chest' | 'legs' | 'boots', number> = { helmet: 0, chest: 0, legs: 0, boots: 0 };
  // whether the local player's first-person weapon should bob (movement)
  isWeaponBobbing: boolean = false;
  // whether a local swing animation is active
  isSwinging: boolean = false;
  // whether the local player is currently performing an attack (sent to server briefly)
  isAttacking: boolean = false;
  private attackTimeout: any = null;
  // whether to render the first-person weapon using WebGL (true) or CSS overlay (false)
  // default to false to preserve the visible CSS overlay while GL-first-person is debugged
  useGLFirstPersonWeapon: boolean = true;
  // Bonfires placed by this player (server-synced)
  bonfires: Array<{ id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }> = [];
  showBonfirePanel: boolean = false;
  // Chests placed by this player (server-synced)
  chests: Array<{ id: number; wx: number; wy: number; wz: number; nickname: string; items: Array<{ itemId: number; quantity: number }>; worldId: number }> = [];
  showChestPanel: boolean = false;

  // timestamp when the current swing started (ms)
  swingStartTime: number = 0;
  // whether the players popup panel is visible
  private _showPlayersPanel: boolean = false;
  public get showPlayersPanel(): boolean { return this._showPlayersPanel; }
  public set showPlayersPanel(v: boolean) { this._showPlayersPanel = v; this.onMenuStateChanged(); }

  // World selection popup state
  private _showWorldPanel: boolean = false;
  public get showWorldPanel(): boolean { return this._showWorldPanel; }
  public set showWorldPanel(v: boolean) { this._showWorldPanel = v; this.onMenuStateChanged(); }

  // Cached world list for the world selection panel
  worlds: Array<{ id: number; seed: number; modifiedBlocks: number; playersOnline: number }> = [];
  // World selection helpers
  selectedWorldForChange: number | null = null;
  editWorldId: number | null = null;

  // Inventory drag/drop state
  dragging = false;
  dragGhostX = 0;
  dragGhostY = 0;
  dragGhostItemId = 0;
  private slotPointerDownIndex: number | null = null;
  private slotPointerId: number | null = null;
  private slotPointerStartX = 0;
  private slotPointerStartY = 0;
  private slotPointerCaptureEl: Element | null = null;
  private boundSlotPointerMove = (e: PointerEvent) => this.onSlotPointerMove(e);
  private boundSlotPointerUp = (e: PointerEvent) => this.onSlotPointerUp(e);
  private draggingIndex: number | null = null;
  private dragTargetIndex: number | null = null;
  private dragSource: 'inventory' | 'chest' | null = null;
  // Inventory selection for drop UI
  selectedInventoryIndex: number | null = null;
  dropCount: number = 1;

  // Starfield cache for night sky (stored as spherical coords so it's seeded/stable)
  private stars: { az: number; alt: number; r: number; baseA: number; phase: number; spd: number }[] = [];

  // Player interpolation snapshots and smoothed array for rendering
  private playerSnapshots: Map<number, Array<{ posX: number; posY: number; posZ: number; yaw: number; pitch: number; bodyYaw?: number; health: number; username?: string; weapon?: number; color?: string; helmet?: number; chest?: number; legs?: number; boots?: number; isAttacking?: boolean; t: number }>> = new Map();
  private smoothedPlayers: DCPlayer[] = [];
  // Mob interpolation snapshots and smoothed array for rendering (used when serverAuthoritativeMobs=true)
  private mobSnapshots: Map<number, Array<{ id: number; posX: number; posY: number; posZ: number; yaw: number; health: number; type?: string; color?: string; t: number }>> = new Map();
  private smoothedMobs: Array<{ id: number; posX: number; posY: number; posZ: number; yaw: number; health: number; type?: string; color?: string }> = [];
  // render behind server time to allow interpolation (ms)
  private interpDelayMs = 300;
  // max extrapolation allowed beyond last snapshot (ms)
  private maxExtrapolateMs = 400;

  // adaptive timeouts for polling players and chats (use setTimeout so we can vary frequency)
  private playerPollInterval: ReturnType<typeof setTimeout> | undefined;
  private mobPollInterval: ReturnType<typeof setTimeout> | undefined;
  private serverAuthoritativeMobs: boolean = false;
  // Debug: track which server mob ids we've logged to avoid spamming console
  private debugLoggedMobIds: Set<number> = new Set();
  // Debug: avoid spamming console each frame when authoritative mobs missing
  private warnedNoAuthoritativeMobs: boolean = false;
  private inventorySaveTimeout: ReturnType<typeof setTimeout> | undefined;
  private chunkPollInterval: ReturnType<typeof setInterval> | undefined;
  private pollingChunks = false;
  // index used to round-robin poll loaded chunks to avoid flooding the server
  private chunkPollIndex = 0;
  private chatPollInterval: ReturnType<typeof setTimeout> | undefined;
  // fall/fall-damage tracking
  private fallStartY: number | null = null;
  /** Seconds between water flow simulation steps (base) */
  /** Seconds between lava flow simulation steps (base) */
  // Adaptive/current tick intervals (may be increased on low-end devices)

  // Pending chunk rebuild queue (throttle GPU work across frames)
  private pendingChunkRebuilds: Set<string> = new Set();
  // Deduplicated set of scheduled fluid-settle source keys to avoid double work
  private _lastChunkX = Infinity;
  private _lastChunkZ = Infinity;
  private _lastFogIsDay: boolean | null = null;
  // Rebuilds to process per frame (lower on low-end devices)
  private rebuildsPerFrame = 4;
  // Low-end adaptive mode (reduces fluid fidelity)
  private lowEndFluidMode = false;
  // Placeholder toggle: offload fluid sim to a worker (future)
  private useFluidWorker = false;

  // damage popups shown near crosshair
  damagePopups: { text: string; id: number }[] = [];
  private damagePopupCounter = 0;

  // Poll frequency settings (ms)
  private PLAYER_POLL_FAST_MS = 1000;
  private PLAYER_POLL_SLOW_MS = 5000;
  private CHAT_POLL_FAST_MS = 1000;
  private CHAT_POLL_SLOW_MS = 5000;
  private _showChatPrompt = false;
  public get showChatPrompt(): boolean { return this._showChatPrompt; }
  public set showChatPrompt(v: boolean) { this._showChatPrompt = v; this.onMenuStateChanged(); }

  private _isShowingLoginPanel = false;
  public get isShowingLoginPanel(): boolean { return this._isShowingLoginPanel; }
  public set isShowingLoginPanel(v: boolean) { this._isShowingLoginPanel = v; this.onMenuStateChanged(); }

  private _showColorPrompt = false;
  public get showColorPrompt(): boolean { return this._showColorPrompt; }
  public set showColorPrompt(v: boolean) { this._showColorPrompt = v; this.onMenuStateChanged(); }
  playerColor: string = '#cccccc';
  // Respawn prompt shown when local player reaches 0 health
  private _showRespawnPrompt = false;
  public get showRespawnPrompt(): boolean { return this._showRespawnPrompt; }
  public set showRespawnPrompt(v: boolean) { this._showRespawnPrompt = v; this.onMenuStateChanged(); }
  // Respawn in-progress flag (disables respawn button while awaiting server)
  isRespawning = false;
  // active chat messages (client-side)
  private chatMessages: { userId: number; username?: string; text: string; expiresAt: number; createdAt?: string }[] = [];
  // cached bubble positions in pixels
  chatPositions: { [userId: number]: { left: number; top: number } } = {};
  // cached name tag positions in pixels
  namePositions: { [userId: number]: { left: number; top: number } } = {};
  // center-screen chat messages (stacked under crosshair)
  private centerChatMessages: { userId: number; username?: string; text: string; expiresAt: number; createdAt?: string }[] = [];
  private savedChatMessages: { userId: number; username?: string; text: string; expiresAt: number; createdAt?: string }[] = [];

  // Recently-seen local chat keys to avoid server re-adding the same message repeatedly
  private recentChatKeys: Map<string, number> = new Map();

  // Cache of userId -> username to avoid repeated lookups
  private userNameCache: Map<number, string> = new Map();

  // Touch state (ignore "unused variable" warnings since these are used in digcraft-input handlers)
  private touchMoveId: number | null = null;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchLookId: number | null = null;
  private touchLookStartX = 0;
  private touchLookStartY = 0;
  private touchStartedOnJoystick: boolean = false;
  private touchStartedOnCanvas: boolean = false;

  // Pending place-block batching (throttled flush to server)
  private pendingPlaceItems: { chunkX: number; chunkZ: number; localX: number; localY: number; localZ: number; blockId: number }[] = [];
  private placeFlushInterval: ReturnType<typeof setInterval> | undefined;
  private readonly PLACE_FLUSH_MS = 500; // flush up to 2 times per second
  // Prevent re-entrant toggles from duplicate events
  private togglingDoorWindow: boolean = false;

  // Menu popup state
  private _isMenuPanelOpen = false;
  public get isMenuPanelOpen(): boolean { return this._isMenuPanelOpen; }
  public set isMenuPanelOpen(v: boolean) { this._isMenuPanelOpen = v; this.onMenuStateChanged(); }

  // Bound handlers for cleanup (delegates moved to digcraft-input.ts)
  private boundKeyDown = (e: KeyboardEvent): void => onKeyDown(this, e, this.parentRef?.user?.id ?? 0);
  private boundKeyUp = (e: KeyboardEvent): void => onKeyUp(this, e);
  private boundMouseMove = (e: MouseEvent): void => onMouseMove(this, e);
  private boundMouseDown = (e: MouseEvent): void => {
    // Prevent context menu on right click
    if (e.button === 2) { try { e.preventDefault(); e.stopPropagation(); } catch { } }
    // If any UI/menu is open, do NOT prevent or stop propagation here so
    // overlay UI elements (inputs, sliders, buttons) can receive desktop mouse
    // events. When no UI is open, forward the event to the game input handler.
    if (this.isAnyMenuOpen()) {
      return;
    }

    onMouseDown(this, e);
  };
  private boundContextMenu = (e: Event): void => e.preventDefault();
  private boundPointerLockChange = (): void => onPointerLockChange(this);
  private boundTouchStart = (e: TouchEvent): void => onTouchStart(this, e);
  private boundTouchMove = (e: TouchEvent): void => onTouchMove(this, e);
  private boundTouchEnd = (e: TouchEvent): void => onTouchEnd(this, e);

  constructor(private digcraftService: DigcraftService, private userService: UserService, private cd: ChangeDetectorRef) {
    super();
    this.inventory = new Array(36).fill(null).map(() => ({ itemId: 0, quantity: 0 }));
  }

  ngOnInit(): void {
    if (!this.parentRef?.user?.id) {
      this.isShowingLoginPanel = true;
      this.parentRef?.showOverlay();
    } else {
      this.parentRef.preventShowSecurityPopup = true;
    }
  }

  ngAfterViewInit(): void {
    this.joinWorld();
  }

  ngOnDestroy(): void {
    this.cleanup();
    if (this.parentRef) {
      this.parentRef.preventShowSecurityPopup = false;
    }
  }

  // ═══════════════════════════════════════
  // Join / Init
  // ═══════════════════════════════════════
  async joinWorld(): Promise<void> {
    const userId = this.parentRef?.user?.id;
    if (!userId) { this.loading = false; this._loadingMessage = ''; return; }
    this._loadingMessage = 'Joining world...';
    const res: DCJoinResponse | null = await this.digcraftService.joinWorld(userId, this.worldId);
    if (!res) {
      // If the server join fails (network/server error), fall back to a deterministic
      // per-world client seed so the client still generates visible terrain instead
      // of leaving the player staring at an empty skybox.
      console.warn(`DigCraft: joinWorld failed for world ${this.worldId}, falling back to local seed`);
      this.seed = 42 + Number(this.worldId || 0);
      this.playerId = userId;
      // safe default camera/spawn
      this.camX = 8; this.camY = 40; this.camZ = 8;
      this.yaw = 0; this.pitch = 0;
      this.applyLocalHealth(20, true);
      this.hunger = 20;
      this.joined = true;
      this.loading = false;
      this._loadingMessage = '';
      this.findSafeSpawnHeight();
      setTimeout(async () => {
        await this.initGame();
        this.initialLoad = false;
        await this.fetchBonfires();
      }, 50);
      return;
    }

    this.seed = res.world.seed;
    this.playerId = res.player.id;
    this.camX = res.player.posX;
    this.camY = res.player.posY;
    this.camZ = res.player.posZ;
    this.yaw = res.player.yaw;
    this.pitch = res.player.pitch;
    this.applyLocalHealth(res.player.health, true);
    this.hunger = res.player.hunger;
    // load player color if provided by server
    try { this.playerColor = (res.player as any).color ?? this.playerColor; } catch (e) { }
    // load level and exp if provided by server
    console.log('[onJoin] res.player:', res.player, 'exp:', (res.player as any).exp, 'level:', (res.player as any).level);
    try { this.level = (res.player as any).level ?? 1; } catch (e) { this.level = 1; }
    try { this.exp = (res.player as any).exp ?? 0; } catch (e) { this.exp = 0; }

    // Load inventory from server
    for (const slot of res.inventory) {
      if (slot.slot >= 0 && slot.slot < 36) {
        this.inventory[slot.slot] = { itemId: slot.itemId, quantity: slot.quantity };
      }
    }

    // Load equipped armor if provided
    if ((res as any).equipment) {
      const eq = (res as any).equipment;
      this.equippedArmor.helmet = eq.helmet ?? 0;
      this.equippedArmor.chest = eq.chest ?? 0;
      this.equippedArmor.legs = eq.legs ?? 0;
      this.equippedArmor.boots = eq.boots ?? 0;
      // Load weapon if server provided it (optional)
      this.equippedWeapon = (eq as any).weapon ?? 0;

      // Initialize durability for equipped items
      const weaponDur = getItemDurability(this.equippedWeapon);
      this.equippedWeaponDurability = weaponDur ? weaponDur.maxDurability : 0;

      for (const slot of this.typeArmorSlots) {
        const armorDur = getItemDurability(this.equippedArmor[slot]);
        this.equippedArmorDurability[slot] = armorDur ? armorDur.maxDurability : 0;
      }
    }

    // Ensure we won't spawn inside solid blocks: this is handled in initGame after chunks are loaded

    this.joined = true;
    this.loading = false;
    this._loadingMessage = '';

    // Wait for canvas to render and then initialize the game.
    // Do NOT force a client-side spawn height here; prefer the server-provided
    // position and only correct it after server chunk changes are applied.
    setTimeout(async () => {
      this._loadingMessage = 'Initializing game...';
      await this.initGame();
      this.initialLoad = false;
      this._loadingMessage = 'Loading bonfires...';
      await this.fetchBonfires();
      this._loadingMessage = '';
    }, 50);
  }

  /** Generate the spawn chunk and place the player on top of the surface. */
  private findSafeSpawnHeight(): void {
    this.camY = this.computeSafeY(this.camX, this.camZ) ?? (NETHER_TOP + 2 + 1.6 + 0.5);
    this.velY = 0;
    this.onGround = true;
  }

  /**
   * Scan downward from the top of the overworld at (wx, wz) and return a safe
   * camera Y (eye height) where the player has at least 2 clear blocks above
   * their feet. Uses getWorldBlock so server-applied changes are respected.
   * Returns null if no safe position found.
   */
  private computeSafeY(wx: number, wz: number): number | null {
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    // Ensure the chunk is loaded
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    if (!this.chunks.has(key)) {
      try {
        const chunk = generateChunk(this.seed, cx, cz, !this.onMobile());
        this.chunks.set(key, chunk);
      } catch (e) { return null; }
    }

    const isSolid = (b: number) => b !== BlockId.AIR && b !== BlockId.WATER
      && b !== BlockId.LEAVES && b !== BlockId.TALLGRASS && b !== BlockId.SHRUB
      && b !== BlockId.TREE && b !== BlockId.BONFIRE && b !== BlockId.CHEST
      && b !== BlockId.WINDOW_OPEN && b !== BlockId.DOOR_OPEN;

    for (let y = WORLD_HEIGHT - 1; y >= NETHER_TOP + 2; y--) {
      if (!isSolid(this.getWorldBlock(ix, y, iz))) continue;
      // Found a solid block at y. Need y+1 and y+2 to be clear.
      if (isSolid(this.getWorldBlock(ix, y + 1, iz))) continue;
      if (isSolid(this.getWorldBlock(ix, y + 2, iz))) continue;
      // Feet land at y+1, eyes at y+1+1.6
      return y + 1 + 1.6;
    }
    return null;
  }

  /**
   * Ensure the player position at (x,y,z) is in free space (not colliding).
   * If currently colliding, attempt to move the player upward until a free
   * space is found. If upward relocation fails, fallback to scanning the
   * surface at the given X/Z and place the player on top of it.
   */
  private async ensureFreeSpaceAt(x: number, y: number, z: number): Promise<void> {
    try {
      await this.loadChunksAround(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    } catch (e) { /* ignore load errors and continue best-effort */ }

    const eyeH = 1.6;
    const hw = 0.25;
    const playerH = 1.7;

    // If already free, apply position and return
    if (!this.collidesAt(x, y - eyeH, z, hw, playerH)) {
      this.camX = x; this.camY = y; this.camZ = z;
      return;
    }

    // Try moving upward up to 32 blocks to find non-colliding space
    for (let dy = 1; dy <= 32; dy++) {
      const tryY = y + dy;
      if (!this.collidesAt(x, tryY - eyeH, z, hw, playerH)) {
        this.camX = x; this.camY = tryY; this.camZ = z;
        return;
      }
    }

    // Fallback: surface scan using getWorldBlock (respects server deltas)
    const safeY = this.computeSafeY(x, z);
    if (safeY !== null) {
      this.camX = x; this.camY = safeY; this.camZ = z;
      this.velY = 0; this.onGround = true;
      return;
    }

    // Last fallback
    this.camX = x; this.camZ = z;
    this.camY = NETHER_TOP + 2 + 1.6 + 0.5;
    this.velY = 0; this.onGround = true;
  }

  private async initGame(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const mobile = this.onMobile();

    this._loadingMessage = 'Rendering...';
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    this.renderer = new DigCraftRenderer(canvas);
    // On mobile: use opaque water rendering to skip the expensive transparent pass
    if (this.onMobile()) (this.renderer as any).lowEndMode = true;
    try {
      if (!mobile && this.parentRef?.user?.id) {
        try {
          this._loadingMessage = 'Fetching user settings...';
          this.userService.getUserSettings(this.parentRef.user.id)
            .then(res => {
              try {
                const fv = res && res.digcraftFovDistance != null ? Number(res.digcraftFovDistance) : NaN;
                if (!isNaN(fv) && fv >= 60 && fv <= 120) {
                  this.fovDeg = Math.round(fv);
                  try { if (this.renderer) (this.renderer as any).fovDeg = this.fovDeg; } catch { }
                }
                const vd = res && res.digcraftViewDistance != null ? Number(res.digcraftViewDistance) : NaN;
                if (!isNaN(vd) && vd >= 1 && vd <= this.MAX_VIEW_DISTANCE) {
                  this.viewDistanceChunks = Math.max(1, Math.round(vd));
                  try { if (this.renderer) (this.renderer as any).renderDistanceChunks = this.viewDistanceChunks; } catch { }
                }
              } catch (ee) { /* ignore */ }
            })
            .catch(() => { });
        } catch (err) { /* ignore */ }
      }

      const storedFov = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(this.FOV_KEY) : null;
      if (storedFov) this.fovDeg = Number(storedFov) || this.fovDeg;
      else this.fovDeg = mobile ? 70 : 100;

      const storedVd = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(this.VIEW_DIST_KEY) : null;
      if (storedVd) this.viewDistanceChunks = Number(storedVd) || this.viewDistanceChunks;
      // Mobile: start with 2 chunks, expand after game loop starts
      else this.viewDistanceChunks = mobile ? 2 : RENDER_DISTANCE;

      const storedSens = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(this.MOUSE_SENS_KEY) : null;
      if (storedSens) this.mouseSensitivity = Number(storedSens) || this.mouseSensitivity;
      else this.mouseSensitivity = 10;
    } catch (e) { this.fovDeg = mobile ? 70 : 100; this.viewDistanceChunks = mobile ? 2 : RENDER_DISTANCE; this.mouseSensitivity = 10; }
    try { if (this.renderer) { (this.renderer as any).fovDeg = this.fovDeg; (this.renderer as any).renderDistanceChunks = this.viewDistanceChunks; } } catch (e) { }

    // Generate initial chunks — on mobile only load the immediate 3×3 around spawn first
    const spawnCX = Math.floor(this.camX / CHUNK_SIZE);
    const spawnCZ = Math.floor(this.camZ / CHUNK_SIZE);
    await this.loadChunksAround(spawnCX, spawnCZ);

    // After server deltas are applied, ensure the player isn't inside solid blocks
    try {
      const eyeH = 1.6;
      const hw = 0.25;
      const playerH = 1.7;
      if (this.collidesAt(this.camX, this.camY - eyeH, this.camZ, hw, playerH)) {
        let relocated = false;
        for (let dy = 1; dy <= 32; dy++) {
          const tryY = this.camY + dy;
          if (!this.collidesAt(this.camX, tryY - eyeH, this.camZ, hw, playerH)) {
            this.camY = tryY;
            relocated = true;
            break;
          }
        }
        if (!relocated) {
          const safeY = this.computeSafeY(this.camX, this.camZ);
          if (safeY !== null) { this.camY = safeY; this.velY = 0; this.onGround = true; }
          else this.findSafeSpawnHeight();
        }
      }
    } catch (e) { }

    // On mobile: skip synchronous mob spawn at startup — server will provide mobs via pollMobs
    if (!mobile) {
      try { this.spawnInitialMobs(); } catch (e) { }
    }

    // Expand view distance to full after a short delay on mobile (game loop already running)
    if (mobile) {
      setTimeout(() => {
        this.viewDistanceChunks = 3;
        try { if (this.renderer) (this.renderer as any).renderDistanceChunks = 3; } catch { }
        this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE))
          .catch(() => { });
      }, 2000);
    }

    // Bind input
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('contextmenu', this.boundContextMenu);
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    // Use document-level touch handlers so an overlay joystick (pointer-events: auto)
    // doesn't prevent the handlers from receiving events. Handlers will decide
    // if a touch is a joystick touch via bounding-rect checks.
    document.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);

    // Start game loop
    this.lastTime = performance.now();
    // Detect device tier and adapt fluid/mesh rebuild settings
    try {
      const tier = this.deviceTier(); // 0=high, 1=mid, 2=low/mobile
      this.lowEndFluidMode = tier >= 1;
      // Tick intervals: high=0.5s, mid=1.0s, low=2.0s
      const waterMult = tier === 0 ? 1.0 : tier === 1 ? 2.0 : 4.0;
      const lavaMult  = tier === 0 ? 1.0 : tier === 1 ? 2.0 : 4.0;
      // Chunk rebuilds per frame: high=2, mid=1, low=1
      this.rebuildsPerFrame = tier === 0 ? 2 : 1;
    } catch (e) { /* ignore detection errors and use defaults */ }

    this.gameLoop(this.lastTime);
    this.startFluidSim();

    // Stagger poll loop starts on mobile to avoid simultaneous network requests at startup
    const pollDelay = this.onMobile() ? 1500 : 0;
    setTimeout(() => this.pollPlayers().catch(err => console.error('DigCraft: pollPlayers error', err)), 0);
    setTimeout(() => this.pollChats().catch(err => console.error('DigCraft: pollChats error', err)), pollDelay);
    setTimeout(() => this.pollMobs().catch(err => console.error('DigCraft: pollMobs error', err)), pollDelay * 2);
    // Poll server for chunk changes — slower on mobile to reduce network/rebuild pressure
    const chunkPollMs = this.onMobile() ? 5000 : 1000;
    this.chunkPollInterval = setInterval(() => this.pollChunkChanges().catch(err => console.error('DigCraft: pollChunkChanges error', err)), chunkPollMs);
  }

  private cleanup(): void {
    cancelAnimationFrame(this.animFrameId);
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    document.removeEventListener('mousedown', this.boundMouseDown);
    document.removeEventListener('contextmenu', this.boundContextMenu);
    // remove document touch handlers
    document.removeEventListener('touchstart', this.boundTouchStart);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
    // remove pointer drag handlers
    document.removeEventListener('pointermove', this.boundSlotPointerMove as any);
    document.removeEventListener('pointerup', this.boundSlotPointerUp as any);
    if (this.playerPollInterval) clearTimeout(this.playerPollInterval);
    if (this.mobPollInterval) clearTimeout(this.mobPollInterval);
    if (this.chunkPollInterval) clearInterval(this.chunkPollInterval);
    if (this.chatPollInterval) clearTimeout(this.chatPollInterval);
    if (this.inventorySaveTimeout) clearTimeout(this.inventorySaveTimeout);
    if (this.invitePollInterval) clearInterval(this.invitePollInterval);
    if (this.placeFlushInterval) { clearInterval(this.placeFlushInterval); this.placeFlushInterval = undefined; }
    if (this.renderer) this.renderer.dispose();
    this.disposeAvatarPreviewRenderer();
    // Clear chunk cache so a subsequent world join will regenerate chunks for the new seed
    try { this.chunks.clear(); this.pendingChunkRebuilds.clear(); } catch (e) { }
    this.stopFluidSim();
    // Remove reference to disposed renderer
    try { (this as any).renderer = undefined; } catch (e) { }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private async pollMobs(): Promise<void> {
    try {
      //console.debug(`DigCraft: pollMobs requesting world ${this.worldId}`);
      const res: any = await this.digcraftService.getMobs(this.worldId);
      //console.debug('DigCraft: pollMobs response', res && (res.mobs ? `count=${res.mobs.length}` : (Array.isArray(res) ? `count=${res.length}` : res)));

      let nextDelay = 600;

      if (Array.isArray(res)) {
        // Legacy server returning array -> continue using client-side deterministic mobs
        this.serverAuthoritativeMobs = false;
        if (!this.mobs || this.mobs.length === 0) this.spawnInitialMobs();
      } else if (res && res.mobs) {
        const serverMobs = res.mobs as any[];
        const tickMs = (typeof res.mobTickMs === 'number') ? res.mobTickMs : 500;
        // If server returns mobs, treat them as authoritative
        if (serverMobs.length > 0) {
          this.serverAuthoritativeMobs = true;
          //console.info(`DigCraft: received ${serverMobs.length} server mobs`);
          // map server mobs to client mob shape
          const mapped = serverMobs.map(m => {
            const px = (m.posX ?? m.PosX) || 0;
            const pz = (m.posZ ?? m.PosZ) || 0;
            let py = (m.posY ?? m.PosY);
            try {
              const gx = Math.floor(px);
              const gz = Math.floor(pz);
              const cx = Math.floor(gx / CHUNK_SIZE);
              const cz = Math.floor(gz / CHUNK_SIZE);
              const chunkKey = `${cx},${cz}`;
              // Ensure we have a chunk available so we can align mobs to the surface
              if (!this.chunks.has(chunkKey)) {
                try {
                  const chunk = generateChunk(this.seed, cx, cz, !this.onMobile());
                  this.chunks.set(chunkKey, chunk);
                } catch (genErr) { /* ignore spawn errors */ }
              }
              // If chunk is present, find top solid block and align mob to it
              if (this.chunks.has(chunkKey)) {
                let gy = -1;
                for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
                  const b = this.getWorldBlock(gx, y, gz);
                  if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LEAVES) { gy = y; break; }
                }
                if (gy >= 0) py = gy + 1 + 1.6;
                else if (py === undefined || py === null) py = 2 + 1.6;
              } else {
                if (py === undefined || py === null) py = 2 + 1.6;
              }
            } catch (e) { if (py === undefined || py === null) py = 2 + 1.6; }

            return {
              id: m.id ?? m.Id,
              type: m.type ?? m.Type,
              posX: px,
              posY: py,
              posZ: pz,
              yaw: m.yaw ?? m.Yaw ?? 0,
              pitch: 0,
              health: m.health ?? m.Health ?? 20,
              maxHealth: m.maxHealth ?? m.MaxHealth ?? 20,
              color: (m.type === 'Zombie' ? '#339966' : (m.type === 'Skeleton' ? '#CFCFCF' : '#ffffff')),
              lastAttack: 0,
              hostile: m.hostile ?? m.Hostile ?? false,
              vx: 0, vz: 0
            } as any;
          });
          // If server returns mobs, they are alive. Mark mobs that disappeared from server as dead.
          const oldMobs = this.mobs || [];
          const serverMobIds = new Set(mapped.map((m: any) => m.id));
          // Mobs that were in old list but not in server list died/despawned
          oldMobs.forEach((old: any) => {
            if (old.id && !serverMobIds.has(old.id)) {
              old.dead = true;
            }
          });
          // Keep old mobs (with updated dead flags) + new mobs from server
          const deadOldMobs = oldMobs.filter((m: any) => m.dead);
          this.mobs = [...mapped, ...deadOldMobs];
          try { this.updateMobSnapshots(mapped); } catch (e) { /* ignore snapshot errors */ }
          // ensure id counter avoids collisions
          try { this.mobIdCounter = Math.max(this.mobIdCounter, ...(this.mobs.map((mm: any) => mm.id || 0))) + 1; } catch { }
          nextDelay = tickMs;
        } else {
          // Server returned empty list - mobs that existed before but are now gone
          // should be marked as dead (they died or were removed by server)
          const oldMobs = this.mobs || [];
          const serverMobIds = new Set(serverMobs.map((m: any) => m.id ?? m.Id));
          this.mobs = oldMobs.map((m: any) => {
            // If mob was in old list but not in server list, it died/despawned
            if (!serverMobIds.has(m.id)) {
              m.dead = true;
            }
            return m;
          });
        }
      } else {
        // Unexpected response -> fallback deterministic
        this.serverAuthoritativeMobs = false;
        if (!this.mobs || this.mobs.length === 0) this.spawnInitialMobs();
      }

      if (this.mobPollInterval) clearTimeout(this.mobPollInterval);
      this.mobPollInterval = setTimeout(() => this.pollMobs().catch(err => console.error('DigCraft: pollMobs error', err)), Math.max(100, nextDelay));
    } catch (err) {
      console.error('DigCraft: pollMobs error', err);
      if (this.mobPollInterval) clearTimeout(this.mobPollInterval);
      this.mobPollInterval = setTimeout(() => this.pollMobs().catch(err => console.error('DigCraft: pollMobs error', err)), 2000);
    }
  }

  private _frameCount = 0;

  // ═══════════════════════════════════════
  // Game Loop — fluid physics removed entirely
  // ═══════════════════════════════════════
  private gameLoop(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this._frameCount++;

    this.updatePhysics(dt);
    // Mobile: mob AI every 3rd frame; desktop: every other frame
    const mobSkip = this.lowEndFluidMode ? 3 : 2;
    if ((this._frameCount % mobSkip) === 0) {
      try { this.updateMobs(dt * mobSkip); } catch (e) { }
    }
    this.updateRaycast();

    // One chunk rebuild per frame max — deferred to avoid stutter
    if (this.pendingChunkRebuilds.size > 0) {
      const camCX = Math.floor(this.camX / CHUNK_SIZE);
      const camCZ = Math.floor(this.camZ / CHUNK_SIZE);
      const renderDist = this.viewDistanceChunks ?? 4;
      for (const key of this.pendingChunkRebuilds) {
        this.pendingChunkRebuilds.delete(key);
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - camCX) <= renderDist + 1 && Math.abs(cz - camCZ) <= renderDist + 1) {
          this.rebuildSingleChunkMesh(cx, cz);
        }
        break;
      }
    }

    this.renderFrame();
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // Fluid cells/accumulators — removed, server handles all fluid dynamics

  // Procedural mob spawning for the client and simple local AI.
  // This is intentionally lightweight: mobs are visual and locally simulated.
  private spawnInitialMobs(): void {
    try {
      // Deterministic, world-seeded mob spawning so all clients generate the
      // same initial mob positions/types independent of camera.
      this.mobs = [];
      this.mobIdCounter = 1;

      const globalSeed = Math.abs(Math.floor(Number(this.seed) || 42)) || 1;
      const dayTypes = ['Pig', 'Cow', 'Sheep'];
      const nightTypes = ['Zombie', 'Skeleton'];
      const isDay = !!this.celestialIsDay;
      const types = isDay ? dayTypes : nightTypes;

      // Spawn radius (world-space) — kept reasonable so mobs appear near players
      // without being camera-dependent. Uses a fixed radius derived from render distance.
      const spawnRadius = Math.max(48, RENDER_DISTANCE * CHUNK_SIZE * 2);

      for (let mi = 0; this.mobs.length < this.MOB_MAX && mi < this.MOB_MAX * 3; mi++) {
        const rng = this.seededRng(globalSeed ^ (mi * 1664525));
        const ang = rng() * Math.PI * 2;
        const r = Math.floor(rng() * spawnRadius);
        // Place relative to world origin (0,0) so all clients agree on coords
        const wx = Math.floor(Math.cos(ang) * r);
        const wz = Math.floor(Math.sin(ang) * r);

        // Ensure we have the chunk generated for this coordinate so height lookup is deterministic
        // On mobile: only spawn on already-loaded chunks to avoid generating extra chunks at startup
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const key = `${cx},${cz}`;
        if (!this.chunks.has(key)) {
          if (this.onMobile()) continue; // skip — don't generate new chunks just for mob spawning
          const chunk = generateChunk(this.seed, cx, cz, !this.onMobile());
          this.chunks.set(key, chunk);
        }

        // find top solid block at this x,z
        let topY = -1;
        for (let yy = WORLD_HEIGHT - 1; yy >= 0; yy--) {
          const b = this.getWorldBlock(wx, yy, wz);
          if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LEAVES) { topY = yy; break; }
        }
        if (topY < 0) continue;
        const spawnY = topY + 1;
        if (spawnY <= 1 || spawnY >= WORLD_HEIGHT - 1) continue;
        if (this.getWorldBlock(wx, spawnY, wz) !== BlockId.AIR) continue;
        const below = this.getWorldBlock(wx, spawnY - 1, wz);
        if (below === BlockId.WATER) continue;

        // Also check that the spawn position is not over water (no water at spawn height or above)
        let hasWaterAbove = false;
        for (let wy = spawnY; wy <= topY + 10 && wy < WORLD_HEIGHT; wy++) {
          if (this.getWorldBlock(wx, wy, wz) === BlockId.WATER) { hasWaterAbove = true; break; }
        }
        if (hasWaterAbove) continue;

        // Biome-aware mob selection
        const chunkForBiome = this.chunks.get(`${Math.floor(wx / CHUNK_SIZE)},${Math.floor(wz / CHUNK_SIZE)}`);
        const biome = chunkForBiome ? chunkForBiome.getBiome(((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE) : BiomeId.PLAINS;
        const isNetherY = topY < NETHER_TOP;
        const isHighAlt = (topY - NETHER_TOP) > SEA_LEVEL + 35;
        const isHotBiome = biome === BiomeId.DESERT || biome === BiomeId.BADLANDS || biome === BiomeId.ERODED_BADLANDS || biome === BiomeId.WOODED_BADLANDS || biome === BiomeId.SAVANNA || biome === BiomeId.SAVANNA_PLATEAU || biome === BiomeId.WINDSWEPT_SAVANNA;
        const isMountainBiome = biome === BiomeId.JAGGED_PEAKS || biome === BiomeId.FROZEN_PEAKS || biome === BiomeId.STONY_PEAKS || biome === BiomeId.SNOWY_SLOPES || biome === BiomeId.WINDSWEPT_HILLS;
        const isJungleBiome = biome === BiomeId.JUNGLE || biome === BiomeId.BAMBOO_JUNGLE || biome === BiomeId.SPARSE_JUNGLE;
        const isSnowyBiome = biome === BiomeId.SNOWY_PLAINS || biome === BiomeId.ICE_PLAINS || biome === BiomeId.ICE_SPIKE_PLAINS || biome === BiomeId.FROZEN_PEAKS || biome === BiomeId.SNOWY_TAIGA || biome === BiomeId.FROZEN_OCEAN || biome === BiomeId.FROZEN_RIVER;
        const isForestBiome = biome === BiomeId.FOREST || biome === BiomeId.BIRCH_FOREST || biome === BiomeId.DARK_FOREST || biome === BiomeId.FLOWER_FOREST || biome === BiomeId.OLD_GROWTH_BIRCH_FOREST || biome === BiomeId.TAIGA || biome === BiomeId.OLD_GROWTH_SPRUCE_TAIGA || biome === BiomeId.OLD_GROWTH_PINE_TAIGA;
        const isSwampBiome = biome === BiomeId.SWAMP || biome === BiomeId.MANGROVE_SWAMP;
        const isOceanBiome = biome === BiomeId.OCEAN || biome === BiomeId.DEEP_OCEAN || biome === BiomeId.COLD_OCEAN || biome === BiomeId.LUKWARM_OCEAN || biome === BiomeId.WARM_OCEAN || biome === BiomeId.BEACH || biome === BiomeId.SNOWY_BEACH;
        const isPlainsBiome = biome === BiomeId.PLAINS || biome === BiomeId.SUNFLOWER_PLAINS || biome === BiomeId.MEADOW || biome === BiomeId.CHERRY_GROVE;

        let t: string;
        if (isNetherY) {
          const netherTypes = ['Blaze', 'WitherSkeleton', 'Ghast', 'Strider', 'Hoglin'];
          t = netherTypes[Math.floor(rng() * netherTypes.length)];
        } else if (isDay) {
          const r2 = rng();
          if (isHotBiome)          t = r2 > 0.5 ? 'Camel' : 'Armadillo';
          else if (isMountainBiome || isHighAlt) t = r2 > 0.5 ? 'Goat' : 'Llama';
          else if (isJungleBiome)  t = r2 > 0.5 ? 'Parrot' : 'Ocelot';
          else if (isSnowyBiome)   t = r2 > 0.5 ? 'PolarBear' : 'Fox';
          else if (isForestBiome)  t = r2 > 0.5 ? 'Wolf' : 'Deer';
          else if (isSwampBiome)   t = r2 > 0.5 ? 'Frog' : 'Axolotl';
          else if (isOceanBiome) {
            // Dolphins spawn at water level, turtles on land/beach
            if (topY >= SEA_LEVEL - 2 && topY <= SEA_LEVEL + 2) {
              t = r2 > 0.5 ? 'Turtle' : 'Dolphin';
            } else if (topY < SEA_LEVEL) {
              t = 'Dolphin'; // In water - dolphin
            } else {
              t = 'Turtle'; // On land - turtle
            }
          }
          else if (isPlainsBiome)  t = r2 > 0.5 ? 'Horse' : 'Rabbit';
          else t = dayTypes[Math.floor(rng() * dayTypes.length)];
        } else {
          t = nightTypes[Math.floor(rng() * nightTypes.length)];
        }

        const hostile = t === 'Zombie' || t === 'Skeleton' || t === 'WitherSkeleton' || t === 'Blaze' || t === 'Ghast' || t === 'Hoglin';
        const mobColors: Record<string, string> = {
          Zombie: '#339966', Skeleton: '#CFCFCF', WitherSkeleton: '#222222',
          Blaze: '#FFAA00', Ghast: '#F0F0F0', Strider: '#CC4444', Hoglin: '#8B4513',
          Pig: '#FF9EA6', Cow: '#CFCFEE', Sheep: '#BFEFBF',
          Camel: '#C8A060', Goat: '#D0C8B0', Armadillo: '#A08060', Llama: '#D4C090',
          Parrot: '#22CC44', Ocelot: '#D4A820', PolarBear: '#F0F0F0', Fox: '#D06020',
          Wolf: '#888888', Deer: '#C08040', Frog: '#448844', Axolotl: '#FF88AA',
          Turtle: '#44AA44', Dolphin: '#6688CC', Horse: '#A66B2D', Rabbit: '#C8A070',
        };
        const color = mobColors[t] ?? '#FFFFFF';
        const mobHealth: Record<string, number> = {
          Zombie: 20, Skeleton: 20, WitherSkeleton: 35, Blaze: 20, Ghast: 10, Strider: 20, Hoglin: 40,
          Pig: 10, Cow: 10, Sheep: 10, Camel: 32, Goat: 10, Armadillo: 12, Llama: 15,
          Parrot: 6, Ocelot: 10, PolarBear: 30, Fox: 10, Wolf: 8, Deer: 10,
          Frog: 10, Axolotl: 14, Turtle: 30, Dolphin: 10, Horse: 15, Rabbit: 3,
        };
        const health = mobHealth[t] ?? 10;

        const mob: any = {
          id: this.mobIdCounter++,
          type: t,
          posX: wx + 0.5,
          // store mob posY as camera/eye Y (consistent with player posY),
          // so renderer and collision math treat mob the same as players.
          posY: spawnY + 1.6,
          posZ: wz + 0.5,
          yaw: rng() * Math.PI * 2,
          pitch: 0,
          health,
          color,
          lastAttack: 0,
          hostile,
          vx: 0,
          vz: 0,
          // deterministic wander phase / frequency so movement is repeatable
          _phase: rng() * Math.PI * 2,
          _freq: 0.6 + rng() * 1.2,
        };
        this.mobs.push(mob);
      }

      try { this.cd.detectChanges(); } catch (e) { /* noop */ }
      //console.info(`DigCraft: spawnInitialMobs spawned ${this.mobs.length} mobs (deterministic)`);
    } catch (err) {
      console.error('DigCraft: spawnInitialMobs error', err);
    }
  }

  // ═══════════════════════════════════════
  // Bucket interactions — fluid dynamics handled by both client (visual) and server (persistent)
  // ═══════════════════════════════════════

  /** Lightweight fluid simulation — runs via setTimeout, never blocks frames */
  private _fluidHandle: ReturnType<typeof setTimeout> | null = null;

  private startFluidSim(): void {
    if (this._fluidHandle !== null) return;
    const mobile = this.onMobile();
    const tick = () => {
      if (!this.joined) return;
      try { this.tickFluid(); } catch (e) { }
      this._fluidHandle = setTimeout(tick, mobile ? 1200 : 400);
    };
    this._fluidHandle = setTimeout(tick, mobile ? 2000 : 600);
  }

  private stopFluidSim(): void {
    if (this._fluidHandle !== null) { clearTimeout(this._fluidHandle); this._fluidHandle = null; }
  }

  /**
   * Minecraft-style fluid tick: scan a small radius around the player,
   * find water/lava that can flow, move one block. Persists to server.
   */
  private tickFluid(): void {
    const px = Math.floor(this.camX), py = Math.floor(this.camY), pz = Math.floor(this.camZ);
    const R = this.onMobile() ? 12 : 24;
    const yR = 6;

    // Scan for a flowing fluid block — stop at first one found
    for (let dx = -R; dx <= R; dx += 2) {
      for (let dz = -R; dz <= R; dz += 2) {
        for (let dy = -yR; dy <= yR; dy++) {
          const wx = px + dx, wy = py + dy, wz = pz + dz;
          if (wy < 1 || wy >= WORLD_HEIGHT) continue;
          const b = this.getWorldBlock(wx, wy, wz);
          if (b !== BlockId.WATER && b !== BlockId.LAVA) continue;

          // Try to flow down
          if (this.getWorldBlock(wx, wy - 1, wz) === BlockId.AIR) {
            this.setWorldBlock(wx, wy - 1, wz, b, true, true);
            return;
          }

          // Try to spread horizontally (water spreads up to 7 blocks, lava 4)
          const maxL = b === BlockId.WATER ? 7 : 4;
          const level = this.getWorldWaterLevel(wx, wy, wz) || maxL;
          if (level <= 1) continue;

          const dirs = [[1,0],[-1,0],[0,1],[0,-1]] as const;
          for (const [ddx, ddz] of dirs) {
            const nx = wx + ddx, nz = wz + ddz;
            if (this.getWorldBlock(nx, wy, nz) !== BlockId.AIR) continue;
            const under = this.getWorldBlock(nx, wy - 1, nz);
            if (under === BlockId.AIR) continue;
            if (b === BlockId.LAVA && under === BlockId.WATER) continue;
            this.setWorldBlock(nx, wy, nz, b, true, true);
            return;
          }
        }
      }
    }
  }

  private collectWaterWithBucket(wx: number, wy: number, wz: number): boolean {
    const block = this.getWorldBlock(wx, wy, wz);
    if (block !== BlockId.WATER) return false;
    const slot = this.inventory[this.selectedSlot];
    if (!slot || slot.quantity <= 0 || slot.itemId !== ItemId.EMPTY_BUCKET) return false;
    slot.itemId = ItemId.WATER_BUCKET;
    slot.quantity = 1;
    this.scheduleInventorySave();
    this.setWorldBlock(wx, wy, wz, BlockId.AIR, true, true);
    return true;
  }

  private placeWaterFromBucket(wx: number, wy: number, wz: number): boolean {
    const slot = this.inventory[this.selectedSlot];
    if (!slot || slot.itemId !== ItemId.WATER_BUCKET || slot.quantity < 1) return false;
    const targetBlock = this.getWorldBlock(wx, wy, wz);
    if (targetBlock === BlockId.AIR || targetBlock === BlockId.WATER) {
      // Place the source block — server will simulate fluid spread via block_changes
      this.setWorldBlock(wx, wy, wz, BlockId.WATER, true, true);
      slot.itemId = ItemId.EMPTY_BUCKET;
      slot.quantity = 1;
      this.scheduleInventorySave();
      return true;
    }
    return false;
  }

  getWorldWaterLevel(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return 0;
    return chunk.getWaterLevel(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  /** Feet or body in water — used for fall damage and swimming */
  public isPlayerInWater(): boolean {
    const px = Math.floor(this.camX);
    const pz = Math.floor(this.camZ);
    const eyeH = 1.6;
    const feetY = this.camY - eyeH;
    const samples = [feetY + 0.1, feetY + 0.9, this.camY - 0.1];
    for (const y of samples) {
      const b = this.getWorldBlock(px, Math.floor(y), pz);
      if (b === BlockId.WATER) return true;
    }
    return false;
  }

  private updateMobs(dt: number): void {
    if (!this.mobs || this.mobs.length === 0) return;
    if (this.serverAuthoritativeMobs) return;
    if (this.showInventory || this.showCrafting) return;

    // Filter dead mobs — only when there are actually dead ones
    if (this.mobs.some(m => (m as any).dead)) {
      this.mobs = this.mobs.filter(m => !(m as any).dead);
    }

    const now = Date.now();
    const playersList: DCPlayer[] = (this.smoothedPlayers.length ? this.smoothedPlayers.slice() : this.otherPlayers.slice());
    const localId = this.parentRef?.user?.id ?? 0;
    if (localId) {
      const snaps = this.playerSnapshots.get(localId);
      if (snaps && snaps.length > 0) {
        const last = snaps[snaps.length - 1];
        const me: DCPlayer = { userId: localId, posX: last.posX, posY: last.posY, posZ: last.posZ, yaw: last.yaw ?? 0, pitch: last.pitch ?? 0, bodyYaw: last.bodyYaw ?? last.yaw ?? 0, health: last.health ?? 0, username: last.username ?? "Unknown", weapon: last.weapon, color: last.color, helmet: last.helmet, chest: last.chest, legs: last.legs, boots: last.boots };
        const idx = playersList.findIndex(p => p.userId === localId);
        if (idx >= 0) playersList[idx] = me; else playersList.push(me);
      } else {
        const idx = playersList.findIndex(p => p.userId === localId);
        if (idx >= 0) {
          playersList[idx].posX = this.camX; playersList[idx].posY = this.camY; playersList[idx].posZ = this.camZ;
        } else {
          playersList.push({ userId: localId, posX: this.camX, posY: this.camY, posZ: this.camZ, yaw: this.yaw, pitch: this.pitch, bodyYaw: this.bodyYaw, health: this.health, username: (this.parentRef?.user?.username ?? 'You') } as DCPlayer);
        }
      }
    }
    const allPlayers: DCPlayer[] = playersList;
    const minDist2 = 0.75 * 0.75;

    // Entity overlap check — inline to avoid closure allocation per call
    const entityCollides = (x: number, z: number, excludeId: number): boolean => {
      for (const p of allPlayers) {
        const dx = p.posX - x, dz = p.posZ - z;
        if (dx * dx + dz * dz < minDist2) return true;
      }
      for (const om of this.mobs) {
        if (om.id === excludeId) continue;
        const dx = om.posX - x, dz = om.posZ - z;
        if (dx * dx + dz * dz < minDist2) return true;
      }
      return false;
    };

    const speedFor = (type: string) => {
      switch (type) {
        case 'Zombie': return 1.1; case 'Skeleton': return 1.3; case 'WitherSkeleton': return 1.2;
        case 'Blaze': return 1.4; case 'Ghast': return 0.8; case 'Hoglin': return 1.2;
        case 'Strider': return 0.6; case 'Camel': return 0.7; case 'Goat': return 1.1;
        case 'Llama': return 0.8; case 'Horse': return 1.3; case 'Wolf': return 1.1;
        case 'PolarBear': return 0.9; case 'Fox': return 1.2; case 'Ocelot': return 1.1;
        case 'Dolphin': return 1.2; case 'Deer': return 1.1; case 'Rabbit': return 1.3;
        default: return 0.9;
      }
    };
    const attackFor = (type: string) => {
      switch (type) {
        case 'Zombie': return 4; case 'Skeleton': return 3; case 'WitherSkeleton': return 8;
        case 'Blaze': return 5; case 'Ghast': return 6; case 'Hoglin': return 6;
        case 'Wolf': return 3; case 'PolarBear': return 5; default: return 0;
      }
    };

    // Ground-align helper: scan downward from mob's current Y (not from WORLD_HEIGHT)
    // This is the key perf fix — was scanning 320 blocks, now scans ~10
    const groundY = (mx: number, my: number, mz: number): number => {
      const gx = Math.floor(mx), gz = Math.floor(mz);
      // Start scan from just below current feet, not from top of world
      const startY = Math.min(Math.floor(my - 1.6) + 4, WORLD_HEIGHT - 1);
      for (let y = startY; y >= 0; y--) {
        const b = this.getWorldBlock(gx, y, gz);
        if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LEAVES) return y;
      }
      return -1;
    };

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob: any = this.mobs[i];
      if (!mob) continue;
      if (mob.health <= 0) { (mob as any).dead = true; continue; }

      let best: DCPlayer | null = null;
      let bestDist2 = Infinity;
      const aggroR2 = this.MOB_AGGRO_RANGE * this.MOB_AGGRO_RANGE;
      for (const p of allPlayers) {
        if (!p) continue;
        const dx = p.posX - mob.posX, dz = p.posZ - mob.posZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDist2 && d2 <= aggroR2) { bestDist2 = d2; best = p; }
      }

      if (best && mob.hostile) {
        const dx = best.posX - mob.posX, dz = best.posZ - mob.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        const step = speedFor(mob.type) * dt;
        const feetY = mob.posY - 1.6;
        const dirX = dx / dist, dirZ = dz / dist;
        for (const f of [1, 0.6, 0.35, 0.15]) {
          const cx = mob.posX + dirX * step * f, cz = mob.posZ + dirZ * step * f;
          if (!this.collidesAt(cx, feetY, cz, 0.3, 1.6) && !entityCollides(cx, cz, mob.id)) {
            mob.posX = cx; mob.posZ = cz; break;
          }
        }
        mob.yaw = Math.atan2(-(dx / dist), -(dz / dist));
        const gy = groundY(mob.posX, mob.posY, mob.posZ);
        if (gy >= 0) mob.posY = gy + 1 + 1.6;

        if (dist <= this.MOB_ATTACK_RANGE) {
          if (!mob.lastAttack || (now - mob.lastAttack) >= this.MOB_ATTACK_COOLDOWN_MS) {
            mob.lastAttack = now;
            const dmg = attackFor(mob.type);
            if (best.userId === localId && dmg > 0) {
              const uid = localId;
              this.digcraftService.mobAttack(uid, this.worldId, mob.type, dmg)
                .then(res => { if (res?.ok && typeof res.health === 'number') this.applyLocalHealth(res.health, false, res.damage); })
                .catch(() => { });
            }
          }
        }
      } else {
        const t = (now / 1000) * (mob._freq || 1.0) + (mob._phase || 0);
        mob.vx = Math.cos(t) * 0.4;
        mob.vz = Math.sin(t) * 0.4;
        const feetY = mob.posY - 1.6;
        const mvLen = Math.sqrt(mob.vx * mob.vx + mob.vz * mob.vz) || 1;
        const ndx = mob.vx / mvLen, ndz = mob.vz / mvLen;
        const mvStep = mvLen * dt;
        for (const f of [1, 0.6, 0.35, 0.15]) {
          const cx = mob.posX + ndx * mvStep * f, cz = mob.posZ + ndz * mvStep * f;
          if (!this.collidesAt(cx, feetY, cz, 0.3, 1.6) && !entityCollides(cx, cz, mob.id)) {
            mob.posX = cx; mob.posZ = cz; break;
          }
        }
        mob.yaw = Math.atan2(-mob.vx, -mob.vz);
        const gy = groundY(mob.posX, mob.posY, mob.posZ);
        if (gy >= 0) mob.posY = gy + 1 + 1.6;
      }
    }
  }

  // ═══════════════════════════════════════
  // Physics / Movement
  // ═══════════════════════════════════════
  private updatePhysics(dt: number): void {
    if (this.showInventory || this.showCrafting) return;

    const slot = this.inventory[this.selectedSlot];
    const boat = slot?.itemId === ItemId.BOAT;
    this.isInWater = this.isPlayerInWater();

    let speed = 5.5;
    if (this.isInWater) {
      speed *= boat ? 1.85 : 0.48;
    }
    let mx = 0, mz = 0;

    // Keyboard movement (W = forward, S = back; A = left, D = right)
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;

    // Touch movement
    if (this.touchMoveId !== null) {
      mx += this.touchMoveX;
      mz += this.touchMoveY;
    }

    // Normalize
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0) { mx /= len; mz /= len; }
    // enable small bob when player is moving
    this.isWeaponBobbing = len > 0.01;

    // Update body rotation based on movement direction
    if (len > 0.01) {
      const moveAngle = Math.atan2(mx, mz); // angle relative to camera
      this.bodyYaw = this.yaw + moveAngle;
    }

    // Camera-relative using forward/right vectors (keeps movement aligned with raycast)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fx = -sinY; // forward.x
    const fz = -cosY; // forward.z
    const rx = cosY;  // right.x
    const rz = -sinY; // right.z
    const dx = (fx * mz + rx * mx) * speed * dt;
    const dz = (fz * mz + rz * mx) * speed * dt;

    // Gravity / buoyancy (Minecraft-like swim or boat)
    if (this.isInWater) {
      this.velY -= 20 * dt * (boat ? 0.28 : 0.38);
      this.velY += (boat ? 11 : 7) * dt;
      this.velY *= boat ? 0.84 : 0.87;
      this.velY = Math.max(-2.4, Math.min(this.velY, boat ? 3.2 : 2.6));
    } else {
      this.velY -= 20 * dt;
    }
    let dy = this.velY * dt;

    // Collision detection
    const hw = 0.25; // half-width
    const playerH = 1.7;
    const eyeH = 1.6;

    // Try move X
    if (dx !== 0) {
      const nx = this.camX + dx;
      if (!this.collidesAt(nx, this.camY - eyeH, this.camZ, hw, playerH)) {
        this.camX = nx;
      }
    }
    // Try move Z
    if (dz !== 0) {
      const nz = this.camZ + dz;
      if (!this.collidesAt(this.camX, this.camY - eyeH, nz, hw, playerH)) {
        this.camZ = nz;
      }
    }
    // Try move Y
    const ny = this.camY + dy;
    if (!this.collidesAt(this.camX, ny - eyeH, this.camZ, hw, playerH)) {
      // leaving ground: record start Y for fall distance
      if (this.onGround) this.fallStartY = this.camY;
      this.camY = ny;
      this.onGround = false;
    } else {
      if (dy < 0) {
        // Snap feet to top of the solid block we collided with
        this.camY = Math.floor(ny - eyeH) + 1 + eyeH;
        // landing: if we recorded a fall start, compute fall distance and request server damage
        if (!this.onGround && this.fallStartY !== null) {
          const fallDistance = this.fallStartY - this.camY;
          // reset start
          this.fallStartY = null;
          // Check if player landed in water - reduces fall damage
          const inWater = this.isPlayerInWater();
          if (fallDistance > 0.5) {
            // call server non-blocking
            const uid = this.parentRef?.user?.id ?? 0;
            if (uid > 0) {
              // Reduce effective fall distance if in water (splash damage)
              const effectiveFallDistance = inWater ? Math.max(0, fallDistance - 3) : fallDistance;
              if (effectiveFallDistance > 0.5) {
                this.digcraftService.applyFallDamage(uid, this.worldId, effectiveFallDistance, this.camX, this.camY, this.camZ, inWater)
                  .then(res => {
                    if (res && res.ok) {
                      if (typeof res.health === 'number') this.applyLocalHealth(res.health, false, res.damage);
                    }
                  })
                  .catch(err => console.error('DigCraft: fallDamage error', err));
              }
            }
          }
        }
        this.onGround = true;
      }
      this.velY = 0;
    }

    // Don't fall below the Nether bedrock floor
    if (this.camY < 2) { this.camY = 2; this.velY = 0; this.onGround = true; }

    // Update chunks only when player crosses a chunk boundary
    const ccx = Math.floor(this.camX / CHUNK_SIZE);
    const ccz = Math.floor(this.camZ / CHUNK_SIZE);
    if (ccx !== this._lastChunkX || ccz !== this._lastChunkZ) {
      this._lastChunkX = ccx; this._lastChunkZ = ccz;
      this.loadChunksAround(ccx, ccz);
    }
  }

  private collidesAt(x: number, feetY: number, z: number, hw: number, h: number): boolean {
    // Check corners + center at feet and head
    const checks = [
      [x - hw, feetY, z - hw], [x + hw, feetY, z - hw],
      [x - hw, feetY, z + hw], [x + hw, feetY, z + hw],
      [x - hw, feetY + h, z - hw], [x + hw, feetY + h, z - hw],
      [x - hw, feetY + h, z + hw], [x + hw, feetY + h, z + hw],
      [x, feetY + h * 0.5, z],
    ];
    for (const [cx, cy, cz] of checks) {
      const b = this.getWorldBlock(Math.floor(cx), Math.floor(cy), Math.floor(cz));
      // treat open windows/doors and leaves/water/air as non-solid
      if (b !== BlockId.AIR
        && b !== BlockId.WATER
        && b !== BlockId.LEAVES
        && b !== BlockId.WINDOW_OPEN
        && b !== BlockId.DOOR_OPEN
        && b !== BlockId.SHRUB
        && b !== BlockId.TREE
        && b !== BlockId.TALLGRASS
        && b !== BlockId.BONFIRE
        && b !== BlockId.CHEST)
        return true;
    }
    return false;
  }

  // ═══════════════════════════════════════
  // Raycasting (DDA algorithm)
  // ═══════════════════════════════════════
  private updateRaycast(): void {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const dirX = -sy * cp;
    const dirY = sp;
    const dirZ = -cy * cp;

    const maxDist = 6;
    let ox = this.camX, oy = this.camY, oz = this.camZ;
    let bx = Math.floor(ox), by = Math.floor(oy), bz = Math.floor(oz);

    const stepX = dirX >= 0 ? 1 : -1;
    const stepY = dirY >= 0 ? 1 : -1;
    const stepZ = dirZ >= 0 ? 1 : -1;

    const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : 1e9;
    const tDeltaY = dirY !== 0 ? Math.abs(1 / dirY) : 1e9;
    const tDeltaZ = dirZ !== 0 ? Math.abs(1 / dirZ) : 1e9;

    let tMaxX = dirX !== 0 ? ((dirX > 0 ? bx + 1 - ox : ox - bx) / Math.abs(dirX)) : 1e9;
    let tMaxY = dirY !== 0 ? ((dirY > 0 ? by + 1 - oy : oy - by) / Math.abs(dirY)) : 1e9;
    let tMaxZ = dirZ !== 0 ? ((dirZ > 0 ? bz + 1 - oz : oz - bz) / Math.abs(dirZ)) : 1e9;

    let prevX = bx, prevY = by, prevZ = bz;

    this.targetBlock = null;
    this.placementBlock = null;
    this.lastHitNonSolid = null;
    this.waterRayTarget = null;

    for (let i = 0; i < maxDist * 3; i++) {
      const block = this.getWorldBlock(bx, by, bz);
      if (block === BlockId.WATER && !this.waterRayTarget) {
        this.waterRayTarget = { wx: bx, wy: by, wz: bz };
      }
      if (block === BlockId.BONFIRE || block === BlockId.TALLGRASS || block === BlockId.CHEST) {
        this.lastHitNonSolid = { wx: bx, wy: by, wz: bz, id: block };
      }
      if (block !== BlockId.AIR && block !== BlockId.WATER && block !== BlockId.TALLGRASS && block !== BlockId.BONFIRE && block !== BlockId.CHEST) {
        this.targetBlock = { wx: bx, wy: by, wz: bz };
        this.placementBlock = { wx: prevX, wy: prevY, wz: prevZ };
        return;
      }
      prevX = bx; prevY = by; prevZ = bz;
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { bx += stepX; tMaxX += tDeltaX; }
        else { bz += stepZ; tMaxZ += tDeltaZ; }
      } else {
        if (tMaxY < tMaxZ) { by += stepY; tMaxY += tDeltaY; }
        else { bz += stepZ; tMaxZ += tDeltaZ; }
      }
    }
  }

  // ═══════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════
  private renderFrame(): void {
    if (!this.renderer) return;

    const canvas = this.canvasRef?.nativeElement;
    if (canvas && (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      this.renderer.resize(canvas.width, canvas.height);
    }

    const userId = this.parentRef?.user?.id ?? 0;
    const basePlayers = this.smoothedPlayers.length ? this.smoothedPlayers : this.otherPlayers;
    // Compute smoothed mobs for rendering when server authoritative
    try { if (this.serverAuthoritativeMobs) this.computeSmoothedMobs(); } catch (e) { /* ignore */ }
    const mobSource = (this.serverAuthoritativeMobs && this.smoothedMobs && this.smoothedMobs.length) ? this.smoothedMobs : this.mobs;
    // Map mobs into the DCPlayer shape so renderer can draw them (filter out dead mobs)
    const mobPlayers = (mobSource || []).map(m => m.dead ? null : ({ userId: -(1000 + (m.id || 0)), posX: m.posX, posY: m.posY, posZ: m.posZ, yaw: m.yaw || 0, pitch: m.pitch || 0, health: m.health || 20, username: (m as any).type || 'Mob', color: (m as any).color || '#ffffff', maxHealth: (m as any).maxHealth || 20 } as DCPlayer)).filter((p): p is DCPlayer => !!p);
    const renderPlayers = basePlayers.concat(mobPlayers);
    // Update fog color only when day/night changes (not every frame)
    try {
      const segmentMs = 10 * 60 * 1000;
      const isDayNow = (Math.floor(Date.now() / segmentMs) % 2) === 0;
      if (isDayNow !== this._lastFogIsDay) {
        this._lastFogIsDay = isDayNow;
        if (this.renderer) {
          if (isDayNow) this.renderer.setFogColor(0.53, 0.81, 0.92);
          else this.renderer.setFogColor(0.019607843, 0.062745098, 0.149019608);
        }
      }
    } catch (e) { }

    // Debug: log counts so we can confirm mobs are present client-side
    // try {
    //   if (this.serverAuthoritativeMobs) {
    //     console.info(`DigCraft: renderFrame players=${basePlayers.length} mobs=${mobPlayers.length}`);
    //     if (mobPlayers.length > 0) console.info('DigCraft: first mob', mobPlayers[0]);
    //   }
    // } catch (e) { /* ignore debug errors */ }
    this.renderer.render(this.camX, this.camY, this.camZ, this.yaw, this.pitch, renderPlayers, userId);

    // Update sun/moon position based on a 10-minute toggle cycle. Project the
    // celestial body from world-space into screen-space so it does not remain
    // anchored to the viewport (which made it appear to "follow" the mouse).
    try {
      if (canvas) {
        const cw = canvas.clientWidth || (canvas.width || 800);
        const ch = canvas.clientHeight || (canvas.height || 600);
        const segmentMs = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();
        const idx = Math.floor(now / segmentMs) % 2; // alternate every segment
        this.celestialIsDay = idx === 0;
        const phaseProgress = (now % segmentMs) / segmentMs; // 0..1 through the segment

        // Build a distant world-space position for the sun/moon anchored to
        // the world (relative to the player position). Project that point
        // into screen space with the same MVP used for name/chat overlays.
        const orbitAngle = phaseProgress * Math.PI * 2; // full circle orbit
        // Keep the celestial bodies within the renderer's far plane so projection works
        const radius = 120; // world units from player
        const arc = Math.sin(phaseProgress * Math.PI); // 0->1->0 for elevation
        const worldX = this.camX + Math.cos(orbitAngle) * radius;
        const worldZ = this.camZ + Math.sin(orbitAngle) * radius;
        const worldY = this.camY + 60 + arc * 40; // height above player (kept small to remain inside frustum)

        const aspect = (cw / ch) || 1;
        const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
        const clip = this.transformVec4(mvp, [worldX, worldY, worldZ, 1]);

        if (clip[3] !== 0 && (clip[2] / clip[3]) <= 1) {
          const ndcX = clip[0] / clip[3];
          const ndcY = clip[1] / clip[3];
          const sx = (ndcX * 0.5 + 0.5) * cw;
          const sy = (1 - (ndcY * 0.5 + 0.5)) * ch;
          this.celestialX = Math.round(sx);
          this.celestialY = Math.round(sy);
        } else {
          // Off-screen when behind camera
          this.celestialX = -9999;
          this.celestialY = -9999;
        }

        this.celestialSize = Math.round(this.celestialIsDay ? Math.min(140, ch * 0.12) : Math.min(96, ch * 0.09));
      }
    } catch (e) { /* keep rendering even if overlay calc fails */ }

    // Update stars canvas (night sky)
    try { this.updateStarCanvas(); } catch (e) { /* ignore star draw errors */ }

    // Compute smoothed/extrapolated player positions for rendering and UI
    try { this.computeSmoothedPlayers(); } catch (e) { /* ignore smoothing errors */ }

    // Update chat bubble positions after rendering
    this.updateChatPositions();

    // Draw block highlight
    if (this.targetBlock) {
      const aspect = (canvas?.width ?? 800) / (canvas?.height ?? 600);
      const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect, this.fovDeg);
      this.renderer.drawHighlight(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, mvp);
    }

    // Draw player/mob highlight based on health if targeted and in range
    const targetedPlayer = this.findAimedPlayer();
    if (targetedPlayer && targetedPlayer.health < (targetedPlayer.maxHealth || 20)) {
      const dx = targetedPlayer.posX - this.camX;
      const dy = targetedPlayer.posY - this.camY;
      const dz = targetedPlayer.posZ - this.camZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= this.PLAYER_ATTACK_MAX_RANGE) {
        const ratio = (targetedPlayer.health ?? 20) / (targetedPlayer.maxHealth || 20);
        const green = Math.floor(255 * ratio);
        const red = Math.floor(255 * (1 - ratio));
        const mvp2 = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, (canvas?.width ?? 800) / (canvas?.height ?? 600), this.fovDeg);
        this.renderer.drawHighlight(targetedPlayer.posX, targetedPlayer.posY - 1.6, targetedPlayer.posZ, mvp2, false, red, green, 0);
      }
    }

    // Draw mob highlight if targeted and in range
    const targetedMob = this.findAimedMob();
    if (targetedMob) {
      const mobMaxHealth = (targetedMob as any).maxHealth || (targetedMob as any).health || 20;
      if ((targetedMob as any).health < mobMaxHealth) {
        const dx = targetedMob.posX - this.camX;
        const dy = targetedMob.posY - this.camY;
        const dz = targetedMob.posZ - this.camZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= this.PLAYER_ATTACK_MAX_RANGE) {
          const mobRatio = ((targetedMob as any).health || 20) / mobMaxHealth;
          const green = Math.floor(255 * mobRatio);
          const red = Math.floor(255 * (1 - mobRatio));
          const mvp3 = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, (canvas?.width ?? 800) / (canvas?.height ?? 600), this.fovDeg);
          this.renderer.drawHighlight(targetedMob.posX, targetedMob.posY - 1.6, targetedMob.posZ, mvp3, false, red, green, 0);
        }
      }
    }

    // Render first-person weapon using WebGL (on top of world/highlight)
    if (this.useGLFirstPersonWeapon && this.equippedWeapon && this.joined && !this.showInventory && !this.showCrafting) {
      try {
        this.renderer.renderFirstPersonWeapon(this.equippedWeapon, this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.isWeaponBobbing, this.isSwinging, this.swingStartTime);
      } catch (err) {
        console.error('Error rendering first-person weapon', err);
      }
    }

    this.renderAvatarPreview();
  }

  private showDamagePopup(text: string, ttl = 900): void {
    const id = ++this.damagePopupCounter;
    this.damagePopups.push({ text, id });
    setTimeout(() => { this.damagePopups = this.damagePopups.filter(d => d.id !== id); }, ttl);
  }

  private buildAvatarPreviewPlayer(): DCPlayer {
    return {
      userId: this.currentUser.id ?? 1,
      posX: 0,
      posY: 1.6,
      posZ: 0,
      yaw: this.avatarPreviewYaw,
      pitch: 0,
      health: this.health,
      maxHealth: 20,
      username: this.currentUser.username ?? 'Player',
      color: this.playerColor,
      weapon: this.equippedWeapon,
      helmet: this.equippedArmor.helmet,
      chest: this.equippedArmor.chest,
      legs: this.equippedArmor.legs,
      boots: this.equippedArmor.boots,
    };
  }

  private ensureAvatarPreviewRenderer(): void {
    if (!this.showInventory) return;
    const canvas = this.avatarPreviewCanvasRef?.nativeElement;
    if (!canvas) return;

    const width = Math.max(180, Math.floor(canvas.clientWidth || 240));
    const height = Math.max(220, Math.floor(canvas.clientHeight || 260));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const currentCanvas = this.avatarPreviewRenderer ? (this.avatarPreviewRenderer.gl.canvas as HTMLCanvasElement) : null;
    if (!this.avatarPreviewRenderer || currentCanvas !== canvas) {
      this.disposeAvatarPreviewRenderer();
      this.avatarPreviewRenderer = new DigCraftRenderer(canvas);
      this.avatarPreviewRenderer.setFogColor(0.07, 0.09, 0.13);
    } else {
      this.avatarPreviewRenderer.resize(width, height);
    }
  }

  private disposeAvatarPreviewRenderer(): void {
    if (this.avatarPreviewRenderer) {
      try { this.avatarPreviewRenderer.dispose(); } catch { }
      this.avatarPreviewRenderer = undefined;
    }
    this.avatarPreviewDragging = false;
    this.avatarPreviewPointerId = null;
  }

  private renderAvatarPreview(): void {
    if (!this.showInventory) return;
    this.ensureAvatarPreviewRenderer();
    if (!this.avatarPreviewRenderer) return;

    const canvas = this.avatarPreviewCanvasRef?.nativeElement;
    if (!canvas) return;
    const width = Math.max(180, Math.floor(canvas.clientWidth || 240));
    const height = Math.max(220, Math.floor(canvas.clientHeight || 260));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.avatarPreviewRenderer.resize(width, height);
    }

    if (!this.avatarPreviewDragging) this.avatarPreviewYaw += 0.01;
    this.avatarPreviewRenderer.renderAvatarPreview(this.buildAvatarPreviewPlayer(), this.avatarPreviewYaw, this.avatarPreviewPitch, performance.now() / 1000);
  }

  onAvatarPreviewPointerDown(event: PointerEvent): void {
    this.avatarPreviewDragging = true;
    this.avatarPreviewPointerId = event.pointerId;
    this.avatarPreviewLastX = event.clientX;
    this.avatarPreviewLastY = event.clientY;
    try { (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId); } catch { }
    try { event.preventDefault(); event.stopPropagation(); } catch { }
  }

  onAvatarPreviewPointerMove(event: PointerEvent): void {
    if (!this.avatarPreviewDragging || this.avatarPreviewPointerId !== event.pointerId) return;
    const dx = event.clientX - this.avatarPreviewLastX;
    const dy = event.clientY - this.avatarPreviewLastY;
    this.avatarPreviewLastX = event.clientX;
    this.avatarPreviewLastY = event.clientY;
    this.avatarPreviewYaw += dx * 0.015;
    this.avatarPreviewPitch = Math.max(-0.35, Math.min(0.2, this.avatarPreviewPitch + dy * 0.0025));
    try { event.preventDefault(); event.stopPropagation(); } catch { }
  }

  onAvatarPreviewPointerUp(event: PointerEvent): void {
    if (this.avatarPreviewPointerId !== event.pointerId) return;
    this.avatarPreviewDragging = false;
    this.avatarPreviewPointerId = null;
    try { (event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId); } catch { }
    try { event.preventDefault(); event.stopPropagation(); } catch { }
  }

  // ═══════════════════════════════════════
  // Chat handling
  // ═══════════════════════════════════════
  async onChatSubmit(text: string): Promise<void> {
    this.showChatPrompt = false;
    if (!text || text.trim().length === 0) return;
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    // Post to server
    try {
      await this.digcraftService.postChat(userId, this.worldId, text.trim());
    } catch (err) {
      console.error('DigCraft: postChat error', err);
    }
    // Add local bubble immediately (include username so it doesn't show as ": message")
    const now = Date.now();
    const createdNow = new Date().toISOString();
    const trimmed = text.trim();
    const username = (this.parentRef?.user as any)?.username ? (this.parentRef!.user as any).username : `User${userId}`;
    this.chatMessages.push({ userId, username, text: trimmed, expiresAt: now + 8000, createdAt: createdNow });
    // Also show centered chat stack for 10s
    this.centerChatMessages.push({ userId, username, text: trimmed, expiresAt: now + 10000, createdAt: createdNow });
    this.savedChatMessages.push({ userId, username, text: trimmed, expiresAt: now + 10000, createdAt: createdNow });
    // Track this message so the server poll doesn't re-add it while it's still recent
    try { this.recentChatKeys.set(`${userId}|${trimmed}`, now); } catch (e) { }
  }

  private async pollChats(): Promise<void> {
    try {
      const chats = await this.digcraftService.getChats(this.worldId);
      const now = Date.now();
      // prune recently-seen keys older than 30s
      const seenCutoff = now - 30000;
      for (const [k, ts] of Array.from(this.recentChatKeys.entries())) {
        if (ts < seenCutoff) this.recentChatKeys.delete(k);
      }
      for (const c of chats) {
        // Avoid re-adding a message we've recently seen locally (keyed by userId|text)
        const key = `${c.userId}|${c.message}`;
        const exists = this.chatMessages.some(m => m.userId === c.userId && (m.createdAt === c.createdAt || m.text === c.message));
        if (this.recentChatKeys.has(key) && !exists) {
          // If we've seen this locally but a server copy is arriving, update any local entries with the resolved username
          let username = this.userNameCache.get(c.userId);
          if (!username) {
            try {
              const u = await this.userService.getUserById(c.userId);
              username = (u && (u as any).username) ? (u as any).username : `User${c.userId}`;
            } catch (err) {
              username = `User${c.userId}`;
            }
            if (username) this.userNameCache.set(c.userId, username);
          }
          if (username) {
            for (const m of this.chatMessages) {
              if (m.userId === c.userId && m.text === c.message && !m.username) m.username = username;
            }
            for (const m of this.centerChatMessages) {
              if (m.userId === c.userId && m.text === c.message && !m.username) m.username = username;
            }
          }
          continue; // skip adding a duplicate server copy
        }
        if (!exists) {
          // resolve username (cache first)
          let username = this.userNameCache.get(c.userId);
          if (!username) {
            try {
              const u = await this.userService.getUserById(c.userId);
              username = (u && (u as any).username) ? (u as any).username : `User${c.userId}`;
            } catch (err) {
              username = `User${c.userId}`;
            }
            if (username) this.userNameCache.set(c.userId, username);
          }
          // parse server timestamp robustly; fall back to now if parsing fails or timestamp is in the future
          let created = Date.parse(c.createdAt as string);
          if (isNaN(created)) created = Date.now();
          const nowMs = Date.now();
          if (created > nowMs + 2000) created = nowMs;
          this.chatMessages.push({ userId: c.userId, username, text: c.message, expiresAt: created + 8000, createdAt: c.createdAt });
          // also add to center stack for 10s
          this.centerChatMessages.push({ userId: c.userId, username, text: c.message, expiresAt: created + 10000, createdAt: c.createdAt });
          this.savedChatMessages.push({ userId: c.userId, username, text: c.message, expiresAt: created + 10000, createdAt: c.createdAt });

          // mark as seen so further polls won't re-add it
          try { this.recentChatKeys.set(key, Date.now()); } catch (e) { }
        }
      }
      // prune expired
      this.chatMessages = this.chatMessages.filter(m => m.expiresAt > now);
      // prune center stack expired (non-destructive for short-lived list)
      this.centerChatMessages = this.centerChatMessages.filter(m => m.expiresAt > now);
      this.savedChatMessages = this.savedChatMessages.slice(-50);
      // schedule next chat poll depending on whether there are other players
      const myId = this.parentRef?.user?.id ?? 0;
      const hasOtherPlayers = (this.otherPlayers && this.otherPlayers.some(p => p.userId !== myId));
      const nextDelay = hasOtherPlayers ? this.CHAT_POLL_FAST_MS : this.CHAT_POLL_SLOW_MS;
      if (this.chatPollInterval) clearTimeout(this.chatPollInterval);
      this.chatPollInterval = setTimeout(() => this.pollChats().catch(err => console.error('DigCraft: pollChats error', err)), nextDelay);
    } catch (err) {
      console.error('DigCraft: pollChats failed', err);
      if (this.chatPollInterval) clearTimeout(this.chatPollInterval);
      this.chatPollInterval = setTimeout(() => this.pollChats().catch(err => console.error('DigCraft: pollChats error', err)), this.CHAT_POLL_SLOW_MS);
    }
  }

  // Expose center messages for template (stacked under crosshair)
  get activeCenterChatMessages() {
    const now = Date.now();
    return this.centerChatMessages.filter(m => m.expiresAt > now);
  }

  /** Deterministic seeded RNG (LCG) returning 0..1 — used for repeatable mob behavior. */
  private seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  private updateChatPositions(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const aspect = canvas.width / canvas.height;
    const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
    const now = Date.now();
    const active = this.chatMessages.filter(m => m.expiresAt > now);
    this.chatPositions = {};
    for (const m of active) {
      // find player position
      let px = this.camX, py = this.camY, pz = this.camZ;
      if (m.userId === (this.parentRef?.user?.id ?? 0)) {
        px = this.camX; py = this.camY - 1.6; pz = this.camZ; // position at feet height
      } else {
        const p = this.getSmoothedPlayerById(m.userId);
        if (!p) continue;
        px = p.posX; py = p.posY; pz = p.posZ;
      }
      // lift above head
      const worldY = py + 1.9; // approx top of head
      const clip = this.transformVec4(mvp, [px, worldY, pz, 1]);
      if (clip[3] === 0) continue;
      const ndcX = clip[0] / clip[3];
      const ndcY = clip[1] / clip[3];
      // only show if in front of camera
      if (clip[2] / clip[3] > 1) continue;
      const screenX = (ndcX * 0.5 + 0.5) * canvas.width;
      const screenY = (1 - (ndcY * 0.5 + 0.5)) * canvas.height;
      this.chatPositions[m.userId] = { left: Math.round(screenX), top: Math.round(screenY) };
    }

    // compute name tag positions for players (anchored under their feet) using smoothed positions
    this.namePositions = {};
    const myId = this.parentRef?.user?.id ?? 0;
    const players = this.smoothedPlayers.length ? this.smoothedPlayers : (this.otherPlayers || []);
    for (const p of players) {
      if (p.userId === myId) continue; // don't show own name tag
      const px = p.posX;
      const pyFeet = p.posY - 1.6; // player's feet (client stores camera/eye Y)
      const pz = p.posZ;
      // Place name tag near the player's head (eye Y + small offset)
      const worldYName = p.posY + 0.35;
      const clipN = this.transformVec4(mvp, [px, worldYName, pz, 1]);
      if (clipN[3] === 0) continue;
      // only show if in front of camera
      if (clipN[2] / clipN[3] > 1) continue;
      const ndcXN = clipN[0] / clipN[3];
      const ndcYN = clipN[1] / clipN[3];
      const screenXN = (ndcXN * 0.5 + 0.5) * canvas.width;
      const screenYN = (1 - (ndcYN * 0.5 + 0.5)) * canvas.height;
      this.namePositions[p.userId] = { left: Math.round(screenXN), top: Math.round(screenYN) };
    }
  }

  private transformVec4(m: Float32Array, v: number[]): number[] {
    // column-major multiplication: result = m * v
    const r = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      r[i] = m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3];
    }
    return r;
  }

  /** Draw a twinkling starfield to the star canvas during night. */
  private updateStarCanvas(): void {
    const starEl = this.starCanvasRef?.nativeElement;
    const gameEl = this.canvasRef?.nativeElement;
    if (!starEl || !gameEl) return;
    const w = gameEl.width || gameEl.clientWidth || 800;
    const h = gameEl.height || gameEl.clientHeight || 600;
    if (starEl.width !== w || starEl.height !== h) {
      starEl.width = w;
      starEl.height = h;
      // match CSS size to canvas client size if available
      if (gameEl.clientWidth) starEl.style.width = `${gameEl.clientWidth}px`;
      if (gameEl.clientHeight) starEl.style.height = `${gameEl.clientHeight}px`;
      this.stars = [];
    }
    const ctx = starEl.getContext('2d');
    if (!ctx) return;

    // Draw sky background (day / night) into the 2D canvas which sits behind
    // the transparent WebGL canvas. World geometry drawn in WebGL will occlude
    // whatever we draw here automatically.
    ctx.clearRect(0, 0, w, h);

    if (this.celestialIsDay) {
      // Day gradient
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#a8d9ff');
      g.addColorStop(1, '#dff3ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Sun (soft radial glow)
      const sx = this.celestialX;
      const sy = this.celestialY;
      const sr = Math.max(8, this.celestialSize);
      const sg = ctx.createRadialGradient(sx, sy, Math.max(2, sr * 0.08), sx, sy, sr);
      sg.addColorStop(0, 'rgba(255,255,220,1)');
      sg.addColorStop(0.25, 'rgba(255,220,120,0.9)');
      sg.addColorStop(1, 'rgba(255,180,40,0.0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // No stars during day
      return;
    }

    // Night gradient
    const ng = ctx.createLinearGradient(0, 0, 0, h);
    ng.addColorStop(0, '#051026');
    ng.addColorStop(1, '#040718');
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, w, h);

    // Moon (soft radial)
    const mx = this.celestialX;
    const my = this.celestialY;
    const mr = Math.max(6, Math.round(this.celestialSize * 0.85));
    const mg = ctx.createRadialGradient(mx, my, Math.max(2, mr * 0.08), mx, my, mr);
    mg.addColorStop(0, 'rgba(255,255,255,0.98)');
    mg.addColorStop(0.4, 'rgba(230,230,230,0.6)');
    mg.addColorStop(1, 'rgba(200,200,200,0.0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

    // Time for animations
    const t = performance.now() / 1000;

    // Generate a seeded, spherical starfield once per canvas size. Stars are
    // placed on a sky-dome (azimuth/altitude) using the world's seed so the
    // pattern is deterministic between sessions/worlds.
    if (this.stars.length === 0) {
      const desired = Math.max(60, Math.min(800, Math.floor((w * h) / 6000)));
      // simple seeded LCG
      const seed = Math.abs(Math.floor(Number(this.seed) || 42)) || 1;
      let s = seed >>> 0;
      const rng = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };

      const altMin = 6; // degrees above horizon
      const altMax = 85; // degrees
      const altStep = 7; // degrees (grid spacing)
      const azStep = 10; // degrees
      const rows = Math.ceil((altMax - altMin) / altStep);
      const cols = Math.ceil(360 / azStep);
      const totalCells = rows * cols;
      const p = Math.min(1, desired / Math.max(1, totalCells));

      for (let a = altMin; a <= altMax; a += altStep) {
        for (let az = 0; az < 360; az += azStep) {
          if (rng() > p) continue;
          const jitterAz = (rng() - 0.5) * azStep * 0.7;
          const jitterAlt = (rng() - 0.5) * altStep * 0.7;
          const finalAz = az + jitterAz;
          const finalAlt = Math.max(0.5, Math.min(89.5, a + jitterAlt));
          const r = 0.5 + rng() * 1.8;
          const baseA = 0.25 + rng() * 0.75;
          const phase = rng() * Math.PI * 2;
          const spd = 0.4 + rng() * 1.6;
          this.stars.push({ az: finalAz, alt: finalAlt, r, baseA, phase, spd });
        }
      }
    }

    // Project and draw stars each frame so they remain anchored to world
    // directions (they won't "follow" the cursor when you rotate the camera).
    const aspect = (gameEl.width / Math.max(1, gameEl.height)) || 1;
    const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
    const starRadius = 140; // distance to place stars at (inside frustum)
    for (const s of this.stars) {
      const azR = s.az * Math.PI / 180;
      const altR = s.alt * Math.PI / 180;
      const dirX = Math.cos(altR) * Math.cos(azR);
      const dirY = Math.sin(altR);
      const dirZ = Math.cos(altR) * Math.sin(azR);
      const worldX = this.camX + dirX * starRadius;
      const worldY = this.camY + dirY * starRadius;
      const worldZ = this.camZ + dirZ * starRadius;
      const clip = this.transformVec4(mvp, [worldX, worldY, worldZ, 1]);
      if (clip[3] === 0) continue;
      // Cull if behind far plane
      if ((clip[2] / clip[3]) > 1) continue;
      const ndcX = clip[0] / clip[3];
      const ndcY = clip[1] / clip[3];
      const sx = (ndcX * 0.5 + 0.5) * w;
      const sy = (1 - (ndcY * 0.5 + 0.5)) * h;
      const aVal = s.baseA + Math.sin(t * s.spd + s.phase) * (0.35 * s.baseA);
      const alpha = Math.max(0, Math.min(1, aVal));
      if (s.r > 1.2) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
        ctx.arc(sx, sy, s.r * 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Update the snapshot buffers with the latest server positions. */
  private updatePlayerSnapshots(players: DCPlayer[]): void {
    const now = Date.now();
    const present = new Set<number>();
    for (const p of players) {
      present.add(p.userId);
      const snaps = this.playerSnapshots.get(p.userId) || [];
      snaps.push({ posX: p.posX, posY: p.posY, posZ: p.posZ, yaw: p.yaw ?? 0, pitch: p.pitch ?? 0, bodyYaw: (p as any).bodyYaw, health: p.health ?? 0, username: p.username, weapon: p.weapon, color: (p as any).color, helmet: (p as any).helmet, chest: (p as any).chest, legs: (p as any).legs, boots: (p as any).boots, isAttacking: (p as any).isAttacking, t: now });
      // limit history
      while (snaps.length > 6) snaps.shift();
      this.playerSnapshots.set(p.userId, snaps);
    }
    // prune old snapshots for players that disappeared
    for (const id of Array.from(this.playerSnapshots.keys())) {
      if (!present.has(id)) {
        const snaps = this.playerSnapshots.get(id);
        if (!snaps || snaps.length === 0) { this.playerSnapshots.delete(id); continue; }
        const last = snaps[snaps.length - 1];
        if (Date.now() - last.t > 8000) this.playerSnapshots.delete(id);
      }
    }
  }

  /** Update the snapshot buffers with the latest server mob positions. */
  private updateMobSnapshots(mobs: Array<any>): void {
    const now = Date.now();
    const present = new Set<number>();
    for (const m of mobs) {
      const id = m.id ?? m.Id ?? 0;
      present.add(id);
      const snaps = this.mobSnapshots.get(id) || [];
      snaps.push({ id, posX: m.posX, posY: m.posY, posZ: m.posZ, yaw: m.yaw ?? 0, health: m.health ?? 0, type: (m as any).type, color: (m as any).color, t: now });
      while (snaps.length > 6) snaps.shift();
      this.mobSnapshots.set(id, snaps);
    }
    // prune old snapshots for mobs that disappeared
    for (const id of Array.from(this.mobSnapshots.keys())) {
      if (!present.has(id)) {
        const snaps = this.mobSnapshots.get(id);
        if (!snaps || snaps.length === 0) { this.mobSnapshots.delete(id); continue; }
        const last = snaps[snaps.length - 1];
        if (Date.now() - last.t > 8000) this.mobSnapshots.delete(id);
      }
    }
  }

  /** Compute smoothed/extrapolated player list used for rendering and UI. */
  private computeSmoothedPlayers(): void {
    const renderTime = Date.now() - this.interpDelayMs;
    const list: DCPlayer[] = [];
    const myId = this.parentRef?.user?.id ?? 0;
    for (const [userId, snaps] of this.playerSnapshots) {
      if (userId === myId) continue; // skip local player
      if (!snaps || snaps.length === 0) continue;
      // ensure sorted by time
      const s = snaps.slice().sort((a, b) => a.t - b.t);
      let outX = s[0].posX, outY = s[0].posY, outZ = s[0].posZ;
      let outYaw = s[0].yaw, outPitch = s[0].pitch, outHealth = s[0].health;
      let outBodyYaw = s[0].bodyYaw ?? s[0].yaw;
      if (s.length === 1) {
        // single snapshot
        outX = s[0].posX; outY = s[0].posY; outZ = s[0].posZ; outYaw = s[0].yaw; outPitch = s[0].pitch; outHealth = s[0].health; outBodyYaw = s[0].bodyYaw ?? s[0].yaw;
      } else {
        // find interval
        let i = 0;
        while (i < s.length - 1 && s[i + 1].t < renderTime) i++;
        if (i < s.length - 1 && s[i].t <= renderTime && renderTime <= s[i + 1].t) {
          const a = s[i], b = s[i + 1];
          const dt = (b.t - a.t) || 1;
          const alpha = Math.max(0, Math.min(1, (renderTime - a.t) / dt));
          outX = a.posX + (b.posX - a.posX) * alpha;
          outY = a.posY + (b.posY - a.posY) * alpha;
          outZ = a.posZ + (b.posZ - a.posZ) * alpha;
          outYaw = a.yaw + (b.yaw - a.yaw) * alpha;
          outPitch = a.pitch + (b.pitch - a.pitch) * alpha;
          outHealth = Math.round(a.health + (b.health - a.health) * alpha);
          outBodyYaw = (a.bodyYaw ?? a.yaw) + ((b.bodyYaw ?? b.yaw) - (a.bodyYaw ?? a.yaw)) * alpha;
        } else {
          // renderTime is after last snapshot -> extrapolate using last velocity
          const last = s[s.length - 1];
          const prev = s.length >= 2 ? s[s.length - 2] : last;
          if (last.t === prev.t) {
            outX = last.posX; outY = last.posY; outZ = last.posZ; outYaw = last.yaw; outPitch = last.pitch; outHealth = last.health; outBodyYaw = last.bodyYaw ?? last.yaw;
          } else {
            const dt = last.t - prev.t;
            const vx = (last.posX - prev.posX) / dt;
            const vy = (last.posY - prev.posY) / dt;
            const vz = (last.posZ - prev.posZ) / dt;
            const dtEx = Math.min(renderTime - last.t, this.maxExtrapolateMs);
            outX = last.posX + vx * dtEx;
            outY = last.posY + vy * dtEx;
            outZ = last.posZ + vz * dtEx;
            outYaw = last.yaw; outPitch = last.pitch; outHealth = last.health;
            outBodyYaw = last.bodyYaw ?? last.yaw;
          }
        }
      }
      const username = (s[s.length - 1].username) ?? `User${userId}`;
      const weapon = s[s.length - 1].weapon;
      const color = s[s.length - 1].color;
      const helmet = s[s.length - 1].helmet;
      const chest = s[s.length - 1].chest;
      const legs = s[s.length - 1].legs;
      const boots = s[s.length - 1].boots;
      const isAttacking = !!(s[s.length - 1].isAttacking);
      list.push({ userId, posX: outX, posY: outY, posZ: outZ, yaw: outYaw, pitch: outPitch, bodyYaw: outBodyYaw, health: outHealth, username, weapon, color, helmet, chest, legs, boots, isAttacking });
    }
    this.smoothedPlayers = list;
  }

  /** Compute smoothed/extrapolated mob list used for rendering when server-authoritative mobs are enabled. */
  private computeSmoothedMobs(): void {
    const renderTime = Date.now() - this.interpDelayMs;
    const list: any[] = [];
    for (const [id, snaps] of this.mobSnapshots) {
      if (!snaps || snaps.length === 0) continue;
      const s = snaps.slice().sort((a, b) => a.t - b.t);
      let outX = s[0].posX, outY = s[0].posY, outZ = s[0].posZ;
      let outYaw = s[0].yaw, outHealth = s[0].health;
      if (s.length === 1) {
        outX = s[0].posX; outY = s[0].posY; outZ = s[0].posZ; outYaw = s[0].yaw; outHealth = s[0].health;
      } else {
        let i = 0;
        while (i < s.length - 1 && s[i + 1].t < renderTime) i++;
        if (i < s.length - 1 && s[i].t <= renderTime && renderTime <= s[i + 1].t) {
          const a = s[i], b = s[i + 1];
          const dt = (b.t - a.t) || 1;
          const alpha = Math.max(0, Math.min(1, (renderTime - a.t) / dt));
          outX = a.posX + (b.posX - a.posX) * alpha;
          outY = a.posY + (b.posY - a.posY) * alpha;
          outZ = a.posZ + (b.posZ - a.posZ) * alpha;
          outYaw = a.yaw + (b.yaw - a.yaw) * alpha;
          outHealth = Math.round(a.health + (b.health - a.health) * alpha);
        } else {
          const last = s[s.length - 1];
          const prev = s.length >= 2 ? s[s.length - 2] : last;
          if (last.t === prev.t) {
            outX = last.posX; outY = last.posY; outZ = last.posZ; outYaw = last.yaw; outHealth = last.health;
          } else {
            const dt = last.t - prev.t;
            const vx = (last.posX - prev.posX) / dt;
            const vy = (last.posY - prev.posY) / dt;
            const vz = (last.posZ - prev.posZ) / dt;
            const dtEx = Math.min(renderTime - last.t, this.maxExtrapolateMs);
            outX = last.posX + vx * dtEx;
            outY = last.posY + vy * dtEx;
            outZ = last.posZ + vz * dtEx;
            outYaw = last.yaw; outHealth = last.health;
          }
        }
      }
      const last = s[s.length - 1];
      // Check if this mob was marked dead in the original mobs array
      const existingMob = this.mobs.find((e: any) => e.id === id);
      const isDead = existingMob ? !!existingMob.dead : false;
      list.push({ id, posX: outX, posY: outY, posZ: outZ, yaw: outYaw, health: outHealth, type: last.type, color: last.color, dead: isDead });
    }
    // Also include mobs that were marked dead but have no snapshots (handled separately)
    const deadMobsWithoutSnapshots = (this.mobs || []).filter((m: any) => m.dead && !this.mobSnapshots.has(m.id));
    for (const m of deadMobsWithoutSnapshots) {
      list.push({ id: m.id, posX: m.posX, posY: m.posY, posZ: m.posZ, yaw: m.yaw || 0, health: 0, type: m.type, color: m.color, dead: true });
    }
    this.smoothedMobs = list;
  }

  async onColorSubmit(color: string): Promise<void> {
    this.showColorPrompt = false;
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || !color) return;
    try {
      const res = await this.digcraftService.changeColor(userId, this.worldId, color);
      if (res && (res as any).ok) {
        this.playerColor = (res as any).color ?? color;
        // update local copies so UI updates immediately
        const me = this.otherPlayers.find(p => p.userId === userId);
        if (me) (me as any).color = this.playerColor;
        const snaps = this.playerSnapshots.get(userId);
        if (snaps && snaps.length > 0) { snaps[snaps.length - 1].color = this.playerColor; this.playerSnapshots.set(userId, snaps); }
      }
    } catch (err) {
      console.error('DigCraft: change color failed', err);
    } finally { try { this.cd.detectChanges(); } catch (e) { } }
  }

  private getSmoothedPlayerById(userId: number): DCPlayer | undefined {
    return this.smoothedPlayers.find(p => p.userId === userId) || this.otherPlayers.find(p => p.userId === userId);
  }

  async teleportToPlayer(player?: DCPlayer): Promise<void> {
    if (!player || !this.otherPlayers || this.otherPlayers.length === 0) return;
    this.camX = player.posX;
    this.camY = player.posY;
    this.camZ = player.posZ;
    try {
      await this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE));
      await this.ensureFreeSpaceAt(this.camX, this.camY, this.camZ);
    } catch (e) { /* ignore */ }
  }

  isInParty(userId: number): boolean {
    return this.partyMembers.some(m => m.userId === userId);
  }

  getPartyMemberName(userId: number): string {
    if (userId === (this.currentUser.id ?? 0)) return this.currentUser.username ?? 'You';
    const partyMember = this.partyMembers.find(member => member.userId === userId);
    if (partyMember?.username) return partyMember.username;
    const player = this.otherPlayers.find(other => other.userId === userId);
    return player?.username || this.userNameCache.get(userId) || `User${userId}`;
  }

  private syncInvitePromptWithPendingInvites(): void {
    const now = Date.now();
    for (const [userId, invite] of Array.from(this.pendingReceivedInvites.entries())) {
      if (!invite || invite.expiresAt <= now) this.pendingReceivedInvites.delete(userId);
    }

    if (this.inviteFromUser && this.pendingReceivedInvites.has(this.inviteFromUser.userId)) {
      const activeInvite = this.pendingReceivedInvites.get(this.inviteFromUser.userId)!;
      this.inviteFromUser = { userId: activeInvite.fromUserId, username: activeInvite.username };
      this.showInvitePrompt = true;
      return;
    }

    const nextInvite = Array.from(this.pendingReceivedInvites.values())
      .filter(invite => invite.expiresAt > now)
      .sort((a, b) => a.expiresAt - b.expiresAt)[0];
    if (nextInvite) {
      this.inviteFromUser = { userId: nextInvite.fromUserId, username: nextInvite.username };
      this.showInvitePrompt = true;
      return;
    }

    this.showInvitePrompt = false;
    this.inviteFromUser = null;
  }

  private async refreshPartyMembers(): Promise<void> {
    const myId = this.currentUser.id ?? 0;
    if (!myId) {
      this.partyMembers = [];
      return;
    }
    this.partyMembers = await this.digcraftService.getPartyMembers(myId) ?? [];
  }

  hasPendingInvite(userId: number): boolean {
    return this.pendingReceivedInvites.has(userId) || this.pendingSentInvites.has(userId);
  }

  isInvitePendingTo(userId: number): boolean {
    const expiresAt = this.pendingSentInvites.get(userId);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  isInvitePendingFrom(userId: number): boolean {
    const invite = this.pendingReceivedInvites.get(userId);
    return invite !== undefined && invite.expiresAt > Date.now();
  }

  startInvitePolling(): void {
    this.stopInvitePolling();
    setTimeout(() => {
      this.invitePollInterval = setInterval(() => this.checkInviteStatus(), this.INVITE_POLL_INTERVAL_MS);
    }, 50);
  }

  stopInvitePolling(): void {
    if (this.invitePollInterval) {
      clearInterval(this.invitePollInterval);
      this.invitePollInterval = null;
    }
  }

  private async checkInviteStatus(): Promise<void> {
    const myId = this.parentRef?.user?.id ?? 0;
    if (!myId) return;
    // Check sent invites - if they're now in party, accept and clear
    const toCheck = Array.from(this.pendingSentInvites.entries());
    for (const [targetUserId, expiresAt] of toCheck) {
      if (this.isInParty(targetUserId)) {
        this.pendingSentInvites.delete(targetUserId);
        continue;
      }
      if (expiresAt <= Date.now()) {
        this.pendingSentInvites.delete(targetUserId);
        continue;
      }
    }
    // Poll server for pending invites received
    try {
      const res = await this.digcraftService.getPendingInvites(myId);
      this.pendingReceivedInvites.clear();
      if (res && res.length > 0) {
        const now = Date.now();
        for (const inv of res) {
          if (inv.expiresAt && inv.expiresAt > now) {
            this.pendingReceivedInvites.set(inv.fromUserId, { fromUserId: inv.fromUserId, username: inv.username, expiresAt: inv.expiresAt });
          }
        }
      }
    } catch (err) {
      // Ignore error, polling will retry
    }
    this.syncInvitePromptWithPendingInvites();
  }

  async sendPartyInvite(userId: number): Promise<void> {
    const myId = this.currentUser.id ?? 0;
    if (!myId || !userId) return;
    if (this.hasPendingInvite(userId)) {
      console.warn('DigCraft: already have pending invite to/from this user');
      return;
    }

    console.log(`DigCraft: sending party invite from ${myId} to ${userId}`);
    const expiresAt = Date.now() + this.INVITE_TIMEOUT_MS;
    await this.digcraftService.sendPartyInvite(myId, userId);
    this.pendingSentInvites.set(userId, expiresAt);
  }

  async acceptInvite(fromUserId: number): Promise<void> {
    this.pendingReceivedInvites.delete(fromUserId);
    await this.addToParty(fromUserId);
    await this.refreshPartyMembers();
    const myId = this.currentUser.id ?? 0;
    if (myId > 0) {
      await this.digcraftService.clearPartyInvite(fromUserId, myId);
    }
    this.closeInvitePrompt();
   // await this.pollPartyInvites();
  }

  async denyInvite(fromUserId: number): Promise<void> {
    const myId = this.currentUser.id ?? 0;
    this.pendingReceivedInvites.delete(fromUserId);
    if (myId > 0) {
      await this.digcraftService.clearPartyInvite(fromUserId, myId);
    }
    this.closeInvitePrompt();
    //await this.pollPartyInvites();
  }

  receiveInvite(fromUserId: number, username: string): void {
    if (this.hasPendingInvite(fromUserId)) return;
    const expiresAt = Date.now() + this.INVITE_TIMEOUT_MS;
    this.pendingReceivedInvites.set(fromUserId, { fromUserId, username, expiresAt });
    this.showInvitePrompt = true;
    this.inviteFromUser = { userId: fromUserId, username };
  }

  closeInvitePrompt(): void {
    this.pendingReceivedInvites.delete(this.inviteFromUser?.userId ?? 0);
    this.syncInvitePromptWithPendingInvites();
  }

  isPartyLeader(): boolean {
    const myId = this.parentRef?.user?.id ?? 0;
    return this.partyMembers.some(member => member.userId === myId && !!member.isLeader);
  }

  isPartyLeaderOf(userId: number): boolean {
    return this.isPartyLeader();
  }

  async addToParty(userId: number): Promise<void> {
    const myId = this.parentRef?.user?.id ?? 0;
    if (!myId || !userId) return;
    const res = await this.digcraftService.addToParty(myId, userId);
    if (res?.ok) {
      this.pendingSentInvites.delete(userId);
      await this.refreshPartyMembers();
    }
  }

  async removeFromParty(userId: number): Promise<void> {
    const myId = this.parentRef?.user?.id ?? 0;
    if (!myId || !userId) return;
    const res = await this.digcraftService.removeFromParty(myId, userId);
    if (res?.ok) await this.refreshPartyMembers();
  }

  async leaveParty(): Promise<void> {
    const myId = this.currentUser.id ?? 0;
    if (!myId) return;
    const res = await this.digcraftService.leaveParty(myId);
    if (res?.ok) {
      this.pendingSentInvites.clear();
      this.pendingReceivedInvites.clear();
      this.showInvitePrompt = false;
      this.inviteFromUser = null;
      await this.refreshPartyMembers();
    }
  }

  async toggleFullScreen(): Promise<void> {
    try {
      const el: any = this.componentMainRef?.nativeElement ?? document.documentElement;
      if (!el) return;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
        else if ((document as any).msExitFullscreen) await (document as any).msExitFullscreen();
      }
    } catch (err) {
      console.error('DigCraft: toggleFullScreen error', err);
    }
  }

  onFovChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target) return;
    const val = target.valueAsNumber;
    if (isNaN(val)) return;
    // Clamp to reasonable range
    const clamped = Math.max(60, Math.min(120, Math.round(val)));
    this.fovDeg = clamped;
    try { if (this.renderer) (this.renderer as any).fovDeg = this.fovDeg; } catch (err) { }
    try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(this.FOV_KEY, String(this.fovDeg)); } catch (err) { }
    // Persist user setting when available and not on mobile
    try {
      const uid = this.parentRef?.user?.id ?? 0;
      if (uid && !this.onMobile()) {
        this.userService.updateUserSettings(uid, [{ settingName: 'digcraft_fov_distance' as any, value: String(this.fovDeg) }])
          .catch(err => console.error('DigCraft: failed to update digcraft_fov_distance', err));
      }
    } catch (err) { /* ignore */ }
  }

  onViewDistanceChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target) return;
    const val = target.valueAsNumber;
    if (isNaN(val)) return;
    const clamped = Math.max(1, Math.min(this.MAX_VIEW_DISTANCE, Math.round(val)));
    this.viewDistanceChunks = clamped;
    try { if (this.renderer) (this.renderer as any).renderDistanceChunks = this.viewDistanceChunks; } catch (err) { }
    try { this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE)); } catch (err) { }
    try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(this.VIEW_DIST_KEY, String(this.viewDistanceChunks)); } catch (err) { }
    try {
      const uid = this.parentRef?.user?.id ?? 0;
      if (uid && !this.onMobile()) {
        this.userService.updateUserSettings(uid, [{ settingName: 'digcraft_view_distance' as any, value: String(this.viewDistanceChunks) }])
          .catch(err => console.error('DigCraft: failed to update digcraft_view_distance', err));
      }
    } catch (err) { /* ignore */ }
  }

  onMouseSensitivityChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target) return;
    const val = target.valueAsNumber;
    if (isNaN(val)) return;
    const clamped = Math.max(1, Math.min(20, Math.round(val)));
    this.mouseSensitivity = clamped;
    try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(this.MOUSE_SENS_KEY, String(this.mouseSensitivity)); } catch (err) { }
    try {
      const uid = this.parentRef?.user?.id ?? 0;
      if (uid && !this.onMobile()) {
        this.userService.updateUserSettings(uid, [{ settingName: 'digcraft_mouse_sensitivity' as any, value: String(this.mouseSensitivity) }])
          .catch(err => console.error('DigCraft: failed to update digcraft_mouse_sensitivity', err));
      }
    } catch (err) { /* ignore */ }
  }

  loadDefaultSettings(): void {
    this.fovDeg = this.onMobile() ? 70 : 100;
    this.viewDistanceChunks = this.onMobile() ? 3 : RENDER_DISTANCE;
    this.mouseSensitivity = 10;
    try { if (this.renderer) { (this.renderer as any).fovDeg = this.fovDeg; (this.renderer as any).renderDistanceChunks = this.viewDistanceChunks; } } catch (e) { }
    try { this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE)); } catch (err) { }
    try { if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.removeItem(this.FOV_KEY); window.localStorage.removeItem(this.VIEW_DIST_KEY); window.localStorage.removeItem(this.MOUSE_SENS_KEY); } } catch (err) { }
    try {
      const uid = this.parentRef?.user?.id ?? 0;
      if (uid && !this.onMobile()) {
        const settings = [
          { settingName: 'digcraft_fov_distance' as any, value: String(this.fovDeg) },
          { settingName: 'digcraft_view_distance' as any, value: String(this.viewDistanceChunks) },
          { settingName: 'digcraft_mouse_sensitivity' as any, value: String(this.mouseSensitivity) }
        ];
        this.userService.updateUserSettings(uid, settings).catch(err => console.error('DigCraft: failed to reset digcraft settings', err));
      }
    } catch (err) { /* ignore */ }
  }

  // Menu/input helpers
  private isAnyMenuOpen(): boolean {
    return this._showInventory || this._showCrafting || this._showPlayersPanel || this._showWorldPanel || this._showRespawnPrompt || this._showChatPrompt || this._showColorPrompt || this._isMenuPanelOpen || this._isShowingLoginPanel;
  }

  private onMenuStateChanged(): void {
    const canvas = this.canvasRef?.nativeElement;
    const anyOpen = this.isAnyMenuOpen();
    if (anyOpen) {
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
      if (canvas) {
        try { canvas.style.pointerEvents = 'none'; } catch (e) { }
        try { (canvas as any).blur(); } catch (e) { }
      }
    } else {
      if (canvas) {
        try { canvas.style.pointerEvents = ''; } catch (e) { }
      }
    }
  }

  // Safe accessors used by template bindings to avoid reading properties of undefined
  public getChatLeft(userId: number): number | null {
    const pos = this.chatPositions[userId];
    return pos ? pos.left : null;
  }

  public getChatTop(userId: number): number | null {
    const pos = this.chatPositions[userId];
    return pos ? pos.top : null;
  }

  public getNameLeft(userId: number): number | null {
    const pos = this.namePositions[userId];
    return pos ? pos.left : null;
  }

  public getNameTop(userId: number): number {
    const pos = this.namePositions[userId];
    return pos ? pos.top : 1;
  }

  // Expose active messages for template
  get activeChatMessages() {
    const now = Date.now();
    return this.chatMessages.filter(m => m.expiresAt > now);
  }

  /** Return a single string listing recent active chat messages (one per line). */
  public get chatMessageListString(): string {
    const msgs = this.savedChatMessages;
    // limit to last 8 messages to avoid huge strings
    const last = msgs.slice(Math.max(0, msgs.length - 8));
    const messageString = last.map(m => {
      const name = m.username ?? `User${m.userId}`;
      return `${name}: ${m.text}`;
    }).join('\n');
    return messageString ?? 'Enter chat message💬';
  }

  // ═══════════════════════════════════════
  // Chunk management
  // ═══════════════════════════════════════
  private async loadChunksAround(ccx: number, ccz: number): Promise<void> {
    const fetchPromises: Promise<void>[] = [];
    const needed = new Set<string>();
    const mobile = this.onMobile();

    for (let dx = -this.viewDistanceChunks; dx <= this.viewDistanceChunks; dx++) {
      for (let dz = -this.viewDistanceChunks; dz <= this.viewDistanceChunks; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = `${cx},${cz}`;
        needed.add(key);
        if (!this.chunks.has(key)) {
          const chunk = generateChunk(this.seed, cx, cz, !this.onMobile());
          this.chunks.set(key, chunk);
          fetchPromises.push(this.fetchChunkChanges(cx, cz, chunk));
        }
      }
    }

    // Evict chunks that are now out of range
    const evictDist = this.viewDistanceChunks + 2;
    for (const key of Array.from(this.chunks.keys())) {
      if (needed.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > evictDist || Math.abs(cz - ccz) > evictDist) {
        this.chunks.delete(key);
                this.pendingChunkRebuilds.delete(key);
      }
    }

    if (fetchPromises.length > 0) {
      if (mobile) {
        // On mobile: batch fetches 4 at a time to avoid overwhelming the network
        for (let i = 0; i < fetchPromises.length; i += 4) {
          try { await Promise.allSettled(fetchPromises.slice(i, i + 4)); } catch (e) { }
        }
      } else {
        try { await Promise.allSettled(fetchPromises); } catch (e) { }
      }
    }

    this.rebuildChunkMeshes();
  }

  private async fetchChunkChanges(cx: number, cz: number, chunk: Chunk): Promise<void> {
    const changes: DCBlockChange[] = await this.digcraftService.getChunkChanges(this.worldId, cx, cz);
    if (changes.length > 0) {
      applyChanges(chunk, changes);
      // Queue rebuild instead of doing it synchronously — prevents stutter
      this.pendingChunkRebuilds.add(`${cx},${cz}`);
    }
  }

  private rebuildChunkMeshes(): void {
    for (const [, chunk] of this.chunks) {
      const key = `${chunk.cx},${chunk.cz}`;
      if (!this.renderer.meshes.has(key)) {
        // Queue for deferred building to avoid blocking the main thread at startup
        this.pendingChunkRebuilds.add(key);
      }
    }
  }

  private rebuildSingleChunkMesh(cx: number, cz: number): void {
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return;
    this.renderer.buildChunkMesh(chunk, (wx, wy, wz) => this.getWorldBlock(wx, wy, wz));
  }

  /** Poll chunks within render distance for server-side changes and apply them. */
  private async pollChunkChanges(): Promise<void> {
    if (this.pollingChunks) return;
    this.pollingChunks = true;
    try {
      const keys = Array.from(this.chunks.keys());
      if (keys.length === 0) return;

      // On mobile: poll fewer chunks per tick to reduce rebuild pressure
      const MAX_PER_POLL = this.onMobile() ? 3 : 12;
      const toFetch = Math.min(MAX_PER_POLL, keys.length);
      const promises: Promise<void>[] = [];
      for (let i = 0; i < toFetch; i++) {
        const idx = (this.chunkPollIndex + i) % keys.length;
        const key = keys[idx];
        const parts = key.split(',');
        const cx = parseInt(parts[0], 10);
        const cz = parseInt(parts[1], 10);
        const chunk = this.chunks.get(key);
        if (chunk) promises.push(this.fetchChunkChanges(cx, cz, chunk));
      }

      // advance round-robin index
      this.chunkPollIndex = (this.chunkPollIndex + toFetch) % keys.length;

      await Promise.allSettled(promises);
    } catch (err) {
      console.error('DigCraft: pollChunkChanges error', err);
    } finally {
      this.pollingChunks = false;
    }
  }

  getWorldBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BlockId.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return BlockId.AIR;
    return chunk.getBlock(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  /** Detect low-end/mobile devices heuristically so we can reduce fluid fidelity. */
  private detectLowEndDevice(): boolean {
    try {
      const nav: any = navigator as any;
      const hw = nav.hardwareConcurrency || 4;
      const mem = nav.deviceMemory || 4;
      const mobile = this.onMobile();
      // Low-end: mobile, or <=2 CPU threads, or <=2GB RAM
      if (mobile || hw <= 2 || mem <= 2) return true;
      return false;
    } catch (e) { return this.onMobile(); }
  }

  /** 0 = high-end, 1 = mid-range, 2 = low-end/mobile */
  private deviceTier(): 0 | 1 | 2 {
    try {
      const nav: any = navigator as any;
      const hw = nav.hardwareConcurrency || 4;
      const mem = nav.deviceMemory || 4;
      const mobile = this.onMobile();
      if (mobile || hw <= 2 || mem <= 2) return 2;
      if (hw <= 4 || mem <= 4) return 1;
      return 0;
    } catch (e) { return this.onMobile() ? 2 : 1; }
  }

  /** Process pending chunk rebuilds with a frame-time budget and distance culling. */
  private processPendingChunkRebuilds(): void { /* replaced by game loop inline */ }

  getWorldBlockHealth(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return 0;
    return chunk.getBlockHealth(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  setWorldBlockHealth(wx: number, wy: number, wz: number, health: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return;
    chunk.setBlockHealth(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE, health);
  }

  private setWorldBlock(wx: number, wy: number, wz: number, blockId: number, persist = true, rebuild = true, waterLevel?: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, blockId, undefined, waterLevel);

    if (rebuild) {
      const rebuildKeys = [`${cx},${cz}`];
      if (lx === 0) rebuildKeys.push(`${cx - 1},${cz}`);
      if (lx === CHUNK_SIZE - 1) rebuildKeys.push(`${cx + 1},${cz}`);
      if (lz === 0) rebuildKeys.push(`${cx},${cz - 1}`);
      if (lz === CHUNK_SIZE - 1) rebuildKeys.push(`${cx},${cz + 1}`);
      if (this.lowEndFluidMode) {
        for (const k of rebuildKeys) this.pendingChunkRebuilds.add(k);
      } else {
        for (const k of rebuildKeys) {
          const [rcx, rcz] = k.split(',').map(Number);
          this.rebuildSingleChunkMesh(rcx, rcz);
        }
      }
    }

    if (persist) {
      const userId = this.parentRef?.user?.id;
      if (userId) {
        this.enqueuePlaceChange({ chunkX: cx, chunkZ: cz, localX: lx, localY: wy, localZ: lz, blockId });
      }
    }
  }

  // Input handlers moved to `digcraft-input.ts` (onKeyDown/onKeyUp/onMouseMove/onMouseDown/onPointerLockChange/onTouchStart/onTouchMove/onTouchEnd)

  // ═══════════════════════════════════════
  // Block Interaction
  // ═══════════════════════════════════════
  breakBlock(): void {
    if (!this.targetBlock) return;
    const { wx, wy, wz } = this.targetBlock;
    const block = this.getWorldBlock(wx, wy, wz);
    if (block === BlockId.AIR || block === BlockId.WATER || block === BlockId.BEDROCK) return;

    // Only allow breaking blocks adjacent to player
    const wyCenter = wy + 0.5;
    if (!this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5)) return;

    // Reduce weapon durability when breaking blocks
    this.reduceEquippedDurability('block');

    // Drop item into inventory
    const drop = BLOCK_DROPS[block];
    if (drop) {
      this.addToInventory(drop.itemId, drop.quantity);
      // Grant small EXP for gathering resources
      this.exp += 1;
      this.checkLevelUp();
    }

    // Remove block (reset health to 0)
    this.setWorldBlock(wx, wy, wz, BlockId.AIR);
    this.setWorldBlockHealth(wx, wy, wz, 0);
  }

  damageBlock(wx: number, wy: number, wz: number): void {
    const block = this.getWorldBlock(wx, wy, wz);
    if (block === BlockId.AIR || block === BlockId.WATER || block === BlockId.BEDROCK) return;

    // Only allow breaking blocks adjacent to player
    const wyCenter = wy + 0.5;
    if (!this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5)) return;

    const currentHealth = this.getWorldBlockHealth(wx, wy, wz);
    if (currentHealth <= 0) return; // Already broken

    const maxHealth = getBlockHealth(block);
    if (maxHealth <= 0) return; // Unbreakable

    // Calculate damage based on tool
    const miningSpeed = getMiningSpeed(this.equippedWeapon);
    const damage = Math.max(1, miningSpeed);

    const remaining = currentHealth - damage;
    this.setWorldBlockHealth(wx, wy, wz, remaining);

    // Reduce weapon durability when breaking blocks
    this.reduceEquippedDurability('block');

    // If block is broken
    if (remaining <= 0) {
      // Drop item into inventory
      const drop = BLOCK_DROPS[block];
      if (drop) {
        this.addToInventory(drop.itemId, drop.quantity);
        this.exp += 1;
        this.checkLevelUp();
      }
      // Remove block
      this.setWorldBlock(wx, wy, wz, BlockId.AIR);
    } else {
      // Show damage indicator (particle effect could be added later)
      // For now, block stays until broken
    }
  }

  private reduceEquippedDurability(reason: 'block' | 'hit'): void {
    // Reduce weapon durability
    if (this.equippedWeapon > 0) {
      const dur = getItemDurability(this.equippedWeapon);
      if (dur) {
        const loss = reason === 'block' ? dur.durabilityLossOnBlock : dur.durabilityLossOnHit;
        if (loss > 0) {
          this.equippedWeaponDurability = Math.max(0, (this.equippedWeaponDurability || dur.maxDurability) - loss);
          // Check if weapon broke
          if (this.equippedWeaponDurability <= 0) {
            this.unequipWeapon();
            this.equippedWeapon = 0;
            this.equippedWeaponDurability = 0;
          }
        }
      }
    }

    // Reduce armor durability
    for (const slot of this.typeArmorSlots) {
      const armorId = this.equippedArmor[slot];
      if (armorId > 0) {
        const dur = getItemDurability(armorId);
        if (dur && dur.durabilityLossOnHit > 0) {
          this.equippedArmorDurability[slot] = Math.max(0, (this.equippedArmorDurability[slot] || dur.maxDurability) - dur.durabilityLossOnHit);
          if (this.equippedArmorDurability[slot] <= 0) {
            this.unequipArmor(slot);
            this.equippedArmor[slot] = 0;
            this.equippedArmorDurability[slot] = 0;
          }
        }
      }
    }
  }

  // Bonfire management
  placeBonfire(): void {
    let wx: number, wy: number, wz: number;

    // If we have a placement block from raycasting, use it; otherwise use player's feet position
    if (this.placementBlock) {
      wx = this.placementBlock.wx;
      wy = this.placementBlock.wy;
      wz = this.placementBlock.wz;
    } else {
      // Fall back to player's feet position
      wx = Math.floor(this.camX);
      wy = Math.floor(this.camY - 1.6); // feet level
      wz = Math.floor(this.camZ);
    }

    // Check if block is empty (or bonfire) - allow placing on solid blocks below
    const existingBlock = this.getWorldBlock(wx, wy, wz);
    if (existingBlock !== BlockId.AIR && existingBlock !== BlockId.BONFIRE && existingBlock !== BlockId.CHEST) return;

    // Check there's a solid block below to place on
    const belowBlock = this.getWorldBlock(wx, wy - 1, wz);
    if (belowBlock === BlockId.AIR || belowBlock === BlockId.WATER || belowBlock === BlockId.LEAVES) return;

    // Place bonfire locally
    this.setWorldBlock(wx, wy, wz, BlockId.BONFIRE);

    // Add to server
    this.placeBonfireServer(wx, wy, wz);
  }

  private async placeBonfireServer(wx: number, wy: number, wz: number): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    try {
      const res = await this.digcraftService.placeBonfire(userId, this.worldId, wx, wy, wz);
      if (res && res.success) {
        this.bonfires.push({
          id: res.id || Date.now(),
          wx, wy, wz,
          nickname: `Bonfire ${this.bonfires.length + 1}`,
          worldId: this.worldId
        });
      }
    } catch (e) { console.error('placeBonfireServer error', e); }
  }

  async fetchBonfires(): Promise<void> {
    const userId = this.currentUser?.id;
    if (!userId) {
      this.bonfires = [];
      return;
    }
    try {
      const bonfires = await this.digcraftService.getBonfires(this.worldId, userId);
      // Reset array before assigning to prevent duplicates
      this.bonfires = [];
      this.bonfires = bonfires.map(b => ({
        id: b.id,
        wx: b.x, wy: b.y, wz: b.z,
        nickname: b.nickname,
        worldId: this.worldId
      }));
    } catch (e) { console.error('fetchBonfires error', e); }
  }

  async fetchChests(): Promise<void> {
    const userId = this.currentUser?.id;
    if (!userId) {
      this.chests = [];
      return;
    }
    try {
      const chests = await this.digcraftService.getChests(this.worldId, userId);
      // Reset array before assigning to prevent duplicates
      this.chests = [];
      this.chests = chests.map(c => ({
        id: c.id,
        wx: c.x, wy: c.y, wz: c.z,
        nickname: c.nickname,
        items: c.items || [],
        worldId: this.worldId
      }));
    } catch (e) { console.error('fetchChests error', e); }
  }

  async deleteBonfire(bf: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    if (!confirm(`Delete bonfire "${bf.nickname}"?`)) return;
    try {
      const res = await this.digcraftService.deleteBonfire(userId, this.worldId, bf.id);
      if (res && res.success) {
        this.bonfires = this.bonfires.filter(b => b.id !== bf.id);
        this.setWorldBlock(bf.wx, bf.wy, bf.wz, BlockId.AIR);
      }
    } catch (e) { console.error('deleteBonfire error', e); }
  }

  async renameBonfireServer(bf: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    const newName = prompt('Enter new nickname for this bonfire:', bf.nickname);
    if (!newName || !newName.trim()) return;
    try {
      const res = await this.digcraftService.renameBonfire(userId, this.worldId, bf.id, newName.trim());
      if (res && res.success) {
        bf.nickname = newName.trim();
      }
    } catch (e) { console.error('renameBonfire error', e); }
  }

  teleportToBonfire(bf: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): void {
    if (bf.worldId !== this.worldId) return;
    // Teleport to bonfire position (slightly above it)
    this.camX = bf.wx + 0.5;
    this.camY = bf.wy + 1.6;
    this.camZ = bf.wz + 0.5;
    this.showBonfirePanel = false;
  }

  // Chest management
  placeChest(): void {
    if (!this.placementBlock) return;
    const { wx, wy, wz } = this.placementBlock;

    // Check if block is empty (or chest) - allow placing on solid blocks below
    const existingBlock = this.getWorldBlock(wx, wy, wz);
    if (existingBlock !== BlockId.AIR && existingBlock !== BlockId.CHEST) return;

    // Check there's a solid block below to place on
    const belowBlock = this.getWorldBlock(wx, wy - 1, wz);
    if (belowBlock === BlockId.AIR || belowBlock === BlockId.WATER || belowBlock === BlockId.LEAVES) return;

    // Place chest
    this.setWorldBlock(wx, wy, wz, BlockId.CHEST);

    // Add to server
    this.placeChestServer(wx, wy, wz);
  }

  private async placeChestServer(wx: number, wy: number, wz: number): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    try {
      const res = await this.digcraftService.placeChest(userId, this.worldId, wx, wy, wz);
      if (res && res.success) {
        this.chests.push({
          id: res.id || Date.now(),
          wx, wy, wz,
          nickname: `Chest ${this.chests.length + 1}`,
          items: [],
          worldId: this.worldId
        });
      }
    } catch (e) { console.error('placeChestServer error', e); }
  }


  async deleteChestServer(ch: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    if (!confirm(`Delete chest "${ch.nickname}"?`)) return;
    try {
      const res = await this.digcraftService.deleteChest(userId, this.worldId, ch.id);
      if (res && res.success) {
        this.chests = this.chests.filter(c => c.id !== ch.id);
        this.setWorldBlock(ch.wx, ch.wy, ch.wz, BlockId.AIR);
      }
    } catch (e) { console.error('deleteChest error', e); }
  }

  async renameChestServer(ch: { id: number; wx: number; wy: number; wz: number; nickname: string; items: any[]; worldId: number }): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    const newName = prompt('Enter new nickname for this chest:', ch.nickname);
    if (!newName || !newName.trim()) return;
    try {
      const res = await this.digcraftService.renameChest(userId, this.worldId, ch.id, newName.trim());
      if (res && res.success) {
        ch.nickname = newName.trim();
      }
    } catch (e) { console.error('renameChest error', e); }
  }

  teleportToChest(ch: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): void {
    if (ch.worldId !== this.worldId) return;
    // Teleport to chest position (slightly above it)
    this.camX = ch.wx + 0.5;
    this.camY = ch.wy + 1.6;
    this.camZ = ch.wz + 0.5;
    this.showChestPanel = false;
  }

  openBonfirePanel(): void {
    const closed = this.closeAllPanels();
    if (closed.includes('bonfire')) return;
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => {
      this.showBonfirePanel = true;
      this.fetchBonfires();
    }, 10);
  }

  closeBonfirePanel(): void {
    setTimeout(() => {
      this.showBonfirePanel = false;
      this.canvasRef?.nativeElement?.requestPointerLock();
    }, 50);
  }

  openChestPanel(): void {
    const closed = this.closeAllPanels();
    if (closed.includes('chest') || !this.lastHitNonSolid) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const wx = this.lastHitNonSolid.wx;
    const wy = this.lastHitNonSolid.wy;
    const wz = this.lastHitNonSolid.wz;
    this.chestLoading = true;
    this._loadingMessage = 'Loading chests...';
    this.selectedChest = { id: 0, wx, wy, wz, nickname: 'Chest', items: [], worldId: this.worldId };
    this.chestInventory = Array(27).fill(null);
    this.showChestPanel = true;
    this.fetchChests().then(() => {
      this.chestLoading = false;
      this._loadingMessage = '';
      // Find the chest at this position and use its ID
      const existingChest = this.chests.find(c => c.wx === wx && c.wy === wy && c.wz === wz);
      if (existingChest) {
        this.selectedChest = existingChest;
        // Load saved items into chestInventory
        if (existingChest.items && existingChest.items.length > 0) {
          this.chestInventory = existingChest.items.concat(Array(27 - existingChest.items.length).fill(null));
        }
      }
    });
  }

  openChest(ch: { id: number; wx: number; wy: number; wz: number; nickname: string; items: any[]; worldId: number }): void {
    const closed = this.closeAllPanels();
    if (closed.includes('chest')) return;

    if (document.pointerLockElement) document.exitPointerLock();
    this.selectedChest = ch;
    // Initialize chest inventory with saved items or empty slots
    this.chestInventory = (ch.items || []).concat(Array(27 - (ch.items?.length || 0)).fill(null).map((_, i) => ch.items ? ch.items[i] : null));
    setTimeout(() => this.showChestPanel = true, 10);
  }

  closeChestPanel(): void {
    setTimeout(() => {
      this.selectedChest = null;
      this.showChestPanel = false;
      this.canvasRef?.nativeElement?.requestPointerLock();
    }, 50);
  }

  moveItemToChest(slotIndex: number): void {
    const invSlot = this.inventory[slotIndex];
    if (!invSlot || !invSlot.itemId) return;

    // Find first empty chest slot
    const emptySlot = this.chestInventory.findIndex(s => !s || !s.itemId);
    if (emptySlot === -1) return;

    this.chestInventory[emptySlot] = { ...invSlot };
    this.inventory[slotIndex] = { itemId: 0, quantity: 0 };
  }

  moveItemFromChest(slotIndex: number): void {
    const chestSlot = this.chestInventory[slotIndex];
    if (!chestSlot || !chestSlot.itemId) return;

    // Find first empty inventory slot
    const emptySlot = this.inventory.findIndex(s => !s || !s.itemId);
    if (emptySlot === -1) return;

    this.inventory[emptySlot] = { ...chestSlot };
    this.chestInventory[slotIndex] = null;
  }

  async saveChestItems(): Promise<void> {
    if (!this.selectedChest) return;
    const userId = this.currentUser.id;
    if (!userId) return;
    try {
      const items = this.chestInventory.filter(i => i).map(item => ({ itemId: item!.itemId, quantity: item!.quantity })).filter(i => i.quantity > 0);
      await this.digcraftService.updateChestItems(userId, this.worldId, this.selectedChest.id, items);
      this.selectedChest.items = items;
      setTimeout(() => {
        this.closeChestPanel();
      }, 50);
    } catch (e) { console.error('saveChestItems error', e); }
  }

  selectedChest: { id: number; wx: number; wy: number; wz: number; nickname: string; items: any[]; worldId: number } | null = null;
  chestInventory: Array<{ itemId: number; quantity: number } | null> = [];
  chestLoading = false;

  placeBlock(): void {
    if (!this.placementBlock) return;
    const held = this.inventory[this.selectedSlot];
    if (!held || held.quantity <= 0) return;

    // Check if bonfire is selected in hotbar
    if (held.itemId === BlockId.BONFIRE) {
      this.placeBonfire();
      if (this.getWorldBlock(this.placementBlock.wx, this.placementBlock.wy, this.placementBlock.wz) === BlockId.BONFIRE) {
        held.quantity--;
        if (held.quantity <= 0) { held.itemId = 0; held.quantity = 0; }
        this.scheduleInventorySave();
      }
      return;
    }

    // Check if chest is selected in hotbar
    if (held.itemId === BlockId.CHEST) {
      this.placeChest();
      if (this.getWorldBlock(this.placementBlock.wx, this.placementBlock.wy, this.placementBlock.wz) === BlockId.CHEST) {
        held.quantity--;
        if (held.quantity <= 0) { held.itemId = 0; held.quantity = 0; }
        this.scheduleInventorySave();
      }
      return;
    }

    if (!isPlaceable(held.itemId)) return;

    const { wx, wy, wz } = this.placementBlock;

    // Don't allow replacing bonfires or chests - must destroy it first
    const existingBlock = this.getWorldBlock(wx, wy, wz);
    if (existingBlock === BlockId.BONFIRE || existingBlock === BlockId.CHEST) return;

    // Don't place inside player
    const dx = wx + 0.5 - this.camX;
    const dy = wy + 0.5 - this.camY;
    const dz = wz + 0.5 - this.camZ;
    if (Math.abs(dx) < 0.8 && Math.abs(dz) < 0.8 && dy > -2 && dy < 0.5) return;

    // Only allow placing blocks adjacent to player
    const wyCenter = wy + 0.5;
    if (!this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5)) return;

    this.setWorldBlock(wx, wy, wz, held.itemId);
    // If placing fluid, immediately settle it to final state
    if (held.itemId === BlockId.WATER || held.itemId === BlockId.LAVA) {
    }
    held.quantity--;
    if (held.quantity <= 0) { held.itemId = 0; held.quantity = 0; }
    this.scheduleInventorySave();
    // Grant small EXP for placing blocks
    this.exp += 1;
    this.checkLevelUp();
  }
  handleLeftClick(e?: any): void {
    // trigger local swing animation if equipped weapon is a sword/pickaxe
    try { this.triggerSwing(); } catch (err) { }
    // If the player has a weapon and is aiming at another player or a mob,
    // treat this as an attack and prevent the click from passing through
    // to block-breaking. Otherwise, perform block breaking as before.
    let handled = false;
    try {
      if (this.equippedWeapon) {
        let aimedPlayer = null;
        let aimedMob = null;
        try { if (typeof this.findAimedPlayer === 'function') aimedPlayer = this.findAimedPlayer(); } catch (e) { aimedPlayer = null; }
        try { if (!aimedPlayer && typeof this.findAimedMob === 'function') aimedMob = this.findAimedMob(); } catch (e) { aimedMob = null; }
        if (aimedPlayer || aimedMob) {
          try { if (typeof this.attemptAttack === 'function') this.attemptAttack().catch((err: any) => console.error('DigCraft: attack error', err)); } catch (err) { }
          handled = true;
        }
      }
    } catch (err) { /* ignore detection errors */ }

    if (!handled && this.targetBlock) this.damageBlock(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz);
  }
  handleRightClick(e?: any): void {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    // Check if right-clicking on bonfire (non-solid block)
    if (this.lastHitNonSolid && this.lastHitNonSolid.id === BlockId.BONFIRE) {
      this.openBonfirePanel();
      return;
    }
    // Check if right-clicking on chest (non-solid block)
    if (this.lastHitNonSolid && this.lastHitNonSolid.id === BlockId.CHEST) {
      this.openChestPanel();
      return;
    }
    // Empty bucket: first water along ray (not only solid target)
    if (this.waterRayTarget) {
      const { wx, wy, wz } = this.waterRayTarget;
      const wyCenter = wy + 0.5;
      if (this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5) && this.collectWaterWithBucket(wx, wy, wz)) return;
    }

    // Water bucket: place into adjacent air cell (crevices / holes), same as block placement
    if (this.placementBlock) {
      const pw = this.placementBlock.wx;
      const py = this.placementBlock.wy;
      const pz = this.placementBlock.wz;
      const pyCenter = py + 0.5;
      if (this.isWithinReachOfBody(pw + 0.5, pyCenter, pz + 0.5) && this.placeWaterFromBucket(pw, py, pz)) return;
    }

    if (this.targetBlock) {
      const { wx, wy, wz } = this.targetBlock;
      const b = this.getWorldBlock(wx, wy, wz);

      // Toggle doors/windows
      if (b === BlockId.DOOR || b === BlockId.DOOR_OPEN || b === BlockId.WINDOW || b === BlockId.WINDOW_OPEN) {
        this.toggleConnectedDoorWindow(wx, wy, wz);
        return;
      }
    }
    // Default behavior: place block under crosshair
    this.placeBlock();
  }

  handleSpaceBar(e?: any): void {
    if (this.isInWater) {
      this.velY = Math.max(this.velY ?? 0, 4.2);
      e.preventDefault();
    } else if (this.onGround) {
      this.velY = 7;
      this.onGround = false;
    }
  }

  // ═══════════════════════════════════════
  // Inventory
  // ═══════════════════════════════════════
  addToInventory(itemId: number, quantity: number): boolean {
    // First try stacking
    for (const slot of this.inventory) {
      if (slot.itemId === itemId && slot.quantity > 0 && slot.quantity < 64) {
        const add = Math.min(quantity, 64 - slot.quantity);
        slot.quantity += add;
        quantity -= add;
        if (quantity <= 0) { this.scheduleInventorySave(); return true; }
      }
    }
    // Then find empty slot
    for (const slot of this.inventory) {
      if (slot.quantity <= 0 || slot.itemId === 0) {
        slot.itemId = itemId;
        slot.quantity = Math.min(quantity, 64);
        quantity -= slot.quantity;
        if (quantity <= 0) { this.scheduleInventorySave(); return true; }
      }
    }
    this.scheduleInventorySave();
    return quantity <= 0;
  }

  private scheduleInventorySave(): void {
    if (this.inventorySaveTimeout) clearTimeout(this.inventorySaveTimeout);
    this.inventorySaveTimeout = setTimeout(() => this.saveInventory(), 3000);
  }

  private saveInventory(): void {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const slots = this.inventory
      .map((s, i) => ({ slot: i, itemId: s.itemId, quantity: s.quantity }))
      .filter(s => s.quantity > 0);
    const equipment = { helmet: this.equippedArmor.helmet, chest: this.equippedArmor.chest, legs: this.equippedArmor.legs, boots: this.equippedArmor.boots, weapon: this.equippedWeapon };
    this.digcraftService.saveInventory(userId, this.worldId, slots, equipment);
  }

  getItemName(id: number): string {
    return ITEM_NAMES[id] ?? `Item ${id}`;
  }

  getItemColor(id: number): string {
    return ITEM_COLORS[id] ?? '#888';
  }

  getWeaponDurabilityString(): string {
    if (!this.equippedWeapon || this.equippedWeapon <= 0) return '';
    const dur = getItemDurability(this.equippedWeapon);
    if (!dur) return '';
    return `${this.equippedWeaponDurability || dur.maxDurability} / ${dur.maxDurability}`;
  }

  getArmorDurabilityString(slot: 'helmet' | 'chest' | 'legs' | 'boots'): string {
    const armorId = this.equippedArmor[slot];
    if (!armorId || armorId <= 0) return '';
    const dur = getItemDurability(armorId);
    if (!dur) return '';
    return `${this.equippedArmorDurability[slot] || dur.maxDurability} / ${dur.maxDurability}`;
  }

  selectHotbarSlot(index: number, event?: PointerEvent): void {
    event?.preventDefault();
    this.selectedSlot = index;
  }

  // ═══════════════════════════════════════
  // Crafting
  // ═══════════════════════════════════════
  updateAvailableRecipes(): void {
    this.availableRecipes = RECIPES.filter(r => this.canCraft(r));
  }

  canCraft(recipe: CraftRecipe): boolean {
    // Check ingredients
    for (const ing of recipe.ingredients) {
      let have = 0;
      for (const slot of this.inventory) {
        if (slot.itemId === ing.itemId) have += slot.quantity;
      }
      if (have < ing.quantity) return false;
    }

    // Check if the result would auto-equip to an empty armor slot (no inventory space needed)
    const armorSlotMap: Partial<Record<number, 'helmet' | 'chest' | 'legs' | 'boots'>> = {
      [ItemId.LEATHER_HELMET]: 'helmet',  [ItemId.IRON_HELMET]: 'helmet',
      [ItemId.DIAMOND_HELMET]: 'helmet',  [ItemId.NETHERITE_HELMET]: 'helmet',
      [ItemId.LEATHER_CHEST]: 'chest',    [ItemId.IRON_CHEST]: 'chest',
      [ItemId.DIAMOND_CHEST]: 'chest',    [ItemId.NETHERITE_CHEST]: 'chest',
      [ItemId.LEATHER_LEGS]: 'legs',      [ItemId.IRON_LEGS]: 'legs',
      [ItemId.DIAMOND_LEGS]: 'legs',      [ItemId.NETHERITE_LEGS]: 'legs',
      [ItemId.LEATHER_BOOTS]: 'boots',    [ItemId.IRON_BOOTS]: 'boots',
      [ItemId.DIAMOND_BOOTS]: 'boots',    [ItemId.NETHERITE_BOOTS]: 'boots',
    };
    const armorSlot = armorSlotMap[recipe.result.itemId];
    if (armorSlot && this.equippedArmor[armorSlot] === 0) return true; // will auto-equip

    // Check if result can stack onto an existing slot
    const resultId = recipe.result.itemId;
    const resultQty = recipe.result.quantity;
    for (const slot of this.inventory) {
      if (slot.itemId === resultId && slot.quantity > 0 && slot.quantity + resultQty <= 64) return true;
    }

    // Check if there's a free inventory slot
    for (const slot of this.inventory) {
      if (slot.quantity <= 0 || slot.itemId === 0) return true;
    }

    return false; // inventory full, no room for result
  }

  craft(recipe: CraftRecipe): void {
    if (!this.canCraft(recipe)) return;
    if (this.craftingProgress > 0) return;
    this.craftingRecipeName = recipe.name;
    this.craftingProgress = 0;
    const duration = 2000;
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      this.craftingProgress = Math.min(1, elapsed / duration);
      if (this.craftingProgress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.completeCraft(recipe);
        this.craftingProgress = 0;
        this.craftingRecipeName = '';
      }
    };
    requestAnimationFrame(animate);
  }

  private completeCraft(recipe: CraftRecipe): void {
    for (const ing of recipe.ingredients) {
      let need = ing.quantity;
      for (const slot of this.inventory) {
        if (slot.itemId === ing.itemId && need > 0) {
          const take = Math.min(need, slot.quantity);
          slot.quantity -= take;
          need -= take;
          if (slot.quantity <= 0) { slot.itemId = 0; slot.quantity = 0; }
        }
      }
    }

    // Auto-equip armor if the appropriate slot is empty
    const armorSlotMap: Partial<Record<number, 'helmet' | 'chest' | 'legs' | 'boots'>> = {
      [ItemId.LEATHER_HELMET]: 'helmet',  [ItemId.IRON_HELMET]: 'helmet',
      [ItemId.DIAMOND_HELMET]: 'helmet',  [ItemId.NETHERITE_HELMET]: 'helmet',
      [ItemId.LEATHER_CHEST]: 'chest',    [ItemId.IRON_CHEST]: 'chest',
      [ItemId.DIAMOND_CHEST]: 'chest',    [ItemId.NETHERITE_CHEST]: 'chest',
      [ItemId.LEATHER_LEGS]: 'legs',      [ItemId.IRON_LEGS]: 'legs',
      [ItemId.DIAMOND_LEGS]: 'legs',      [ItemId.NETHERITE_LEGS]: 'legs',
      [ItemId.LEATHER_BOOTS]: 'boots',    [ItemId.IRON_BOOTS]: 'boots',
      [ItemId.DIAMOND_BOOTS]: 'boots',    [ItemId.NETHERITE_BOOTS]: 'boots',
    };
    const armorSlot = armorSlotMap[recipe.result.itemId];
    if (armorSlot && this.equippedArmor[armorSlot] === 0) {
      // Equip directly instead of adding to inventory
      this.equippedArmor[armorSlot] = recipe.result.itemId;
      const dur = getItemDurability(recipe.result.itemId);
      this.equippedArmorDurability[armorSlot] = dur ? dur.maxDurability : 0;
      this.scheduleInventorySave();
    } else {
      this.addToInventory(recipe.result.itemId, recipe.result.quantity);
    }

    this.updateAvailableRecipes();
    // remember last crafted item and schedule an instant scroll to it after the craft animation
    try {
      this.lastCraftedItemId = recipe.result.itemId;
      if (this.craftScrollTimeout) clearTimeout(this.craftScrollTimeout);
      this.craftScrollTimeout = setTimeout(() => {
        this.scrollToLastCrafted(this.lastCraftedItemId);
        this.craftScrollTimeout = null;
      }, this.CRAFT_SCROLL_DELAY_MS);
    } catch (e) {
      // ignore any scroll errors
    }
  }

  private scrollToLastCrafted(itemId?: number): void {
    if (!itemId) return;
    // only attempt to scroll if crafting overlay is visible
    if (!this.showCrafting) return;
    const el = document.getElementById(`recipe-${itemId}`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (e) {
      try { (el as any).scrollIntoView(); } catch (_) { }
    }
  }

  // ═══════════════════════════════════════
  // Multiplayer sync
  // ═══════════════════════════════════════


  private async pollPlayers(): Promise<void> {
    try {
      const userId = this.parentRef?.user?.id;
      let players = [] as DCPlayer[];
      if (!userId) {
        console.log('[pollPlayers] No userId, returning early');
        return
      }
      // console.log('[pollPlayers] Calling syncPlayers with userId:', userId, 'worldId:', this.worldId);
      players = await this.digcraftService.syncPlayers(userId, this.worldId, this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.bodyYaw, this.isAttacking);
      //  console.log('[pollPlayers] syncPlayers returned, players count:', players.length, 'first few:', players.slice(0, 3).map((p: any) => ({ userId: p.userId, exp: p.exp, level: p.level })));
      // record server snapshot for interpolation, keep raw server list as well
      try { this.updatePlayerSnapshots(players); } catch (e) { /* ignore snapshot errors */ }
      this.otherPlayers = players;

      // Load party members
      const myId = this.currentUser.id ?? 0;
      if (myId > 0) {
        await this.refreshPartyMembers();
      }

      const me = players.find(p => p.userId === myId);
      if (me && typeof me.health === 'number') this.applyLocalHealth(me.health);
      // update local player color if server provided it
      if (me && (me as any).color) this.playerColor = (me as any).color;
      // update local player level and exp if server provided it
      if (me) {
        const serverExp = (me as any).exp;
        const serverLevel = (me as any).level;
        //console.log('[pollPlayers] syncPlayers returned players count:', players.length, 'myId:', myId, 'serverExp:', serverExp, 'serverLevel:', serverLevel);
        if (typeof serverLevel === 'number') this.level = serverLevel;
        if (typeof serverExp === 'number') this.exp = serverExp;
      } else {
        console.log('[pollPlayers] me NOT FOUND in players, myId:', myId, 'players:', players.map((p: any) => ({ userId: p.userId, exp: p.exp, level: p.level })));
      }

      // consider other players only (exclude self) when deciding polling rate
      const hasOtherPlayers = players && players.some(p => p.userId !== myId);
      const nextDelay = hasOtherPlayers ? this.PLAYER_POLL_FAST_MS : this.PLAYER_POLL_SLOW_MS;
      if (this.playerPollInterval) clearTimeout(this.playerPollInterval);
      this.playerPollInterval = setTimeout(() => this.pollPlayers().catch(err => console.error('DigCraft: pollPlayers error', err)), nextDelay);
    } catch (err) {
      console.error('DigCraft: pollPlayers error', err);
      this.otherPlayers = [];
      if (this.playerPollInterval) clearTimeout(this.playerPollInterval);
      this.playerPollInterval = setTimeout(() => this.pollPlayers().catch(err => console.error('DigCraft: pollPlayers error', err)), this.PLAYER_POLL_SLOW_MS);
    }
  }

  // ═══════════════════════════════════════
  // Touch action buttons
  // ═══════════════════════════════════════

  /**
   * Apply a health update for the local player. If health decreased, trigger
   * a brief red flash and optionally show a damage popup.
   * @param newHealth new health value from server
   * @param suppressFlash when true, don't flash (useful on join)
   * @param damage optional damage amount to show in popup
   */
  private applyLocalHealth(newHealth: number, suppressFlash = false, damage?: number): void {
    const prev = typeof this.health === 'number' ? this.health : 0;
    this.health = newHealth;
    // If health dropped, trigger flash and popup
    if (!suppressFlash && typeof newHealth === 'number' && newHealth < prev) {
      this.triggerDamageFlash();
      if (typeof damage === 'number' && damage > 0) this.showDamagePopup(`-${damage}`);
    }

    // If we've died, show the forced respawn prompt (block other actions)
    if (typeof newHealth === 'number' && newHealth <= 0) {
      // ensure pointer is released so the overlay can capture input
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
      this.showRespawnPrompt = true;
    }

    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
  }

  async confirmRespawn(): Promise<void> {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || this.isRespawning) return;
    this.isRespawning = true;
    try {
      const res = await this.digcraftService.respawn(userId, this.worldId);
      if (res && res.player) {
        // apply server-provided respawn state
        this.camX = res.player.posX ?? this.camX;
        this.camY = res.player.posY ?? this.camY;
        this.camZ = res.player.posZ ?? this.camZ;
        this.yaw = res.player.yaw ?? this.yaw;
        this.pitch = res.player.pitch ?? this.pitch;
        this.applyLocalHealth(typeof res.player.health === 'number' ? res.player.health : 20, true);
        this.hunger = typeof res.player.hunger === 'number' ? res.player.hunger : this.hunger;

        // Clear client-side inventory/equipment to match server
        this.inventory = new Array(36).fill(null).map(() => ({ itemId: 0, quantity: 0 }));
        this.equippedWeapon = 0;
        this.equippedArmor = { helmet: 0, chest: 0, legs: 0, boots: 0 };

        // move camera chunks to spawn and ensure we are in free space
        try {
          await this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE));
          await this.ensureFreeSpaceAt(this.camX, this.camY, this.camZ);
        } catch (e) { /* ignore chunk/load errors */ }
      }
    } catch (err) {
      console.error('DigCraft: respawn failed', err);
    } finally {
      this.isRespawning = false;
      this.showRespawnPrompt = false;
      try { this.cd.detectChanges(); } catch (e) { }
    }
  }

  private triggerDamageFlash(duration = 320): void {
    if (this.damageFlashTimeout) clearTimeout(this.damageFlashTimeout);
    this.isDamageFlash = true;
    try { this.cd.detectChanges(); } catch (e) { /* noop */ }
    this.damageFlashTimeout = setTimeout(() => {
      this.isDamageFlash = false;
      try { this.cd.detectChanges(); } catch (e) { /* noop */ }
      this.damageFlashTimeout = null;
    }, duration);
  }
  onTouchBreak(): void {
    // Mobile left-click: trigger swing animation and attack players/mobs, then damage block
    this.triggerSwing();
    if (this.targetBlock) {
      this.damageBlock(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz);
    }
  }

  async onTouchPlace(): Promise<void> {
    // Mobile build button: toggle bonfire panel
    this.showBonfirePanel = !this.showBonfirePanel;

    if (this.showBonfirePanel) {
      await this.fetchBonfires();
      return;
    }

    if (this.targetBlock) {
      const { wx, wy, wz } = this.targetBlock;
      const b = this.getWorldBlock(wx, wy, wz);
      if (b === BlockId.DOOR || b === BlockId.DOOR_OPEN || b === BlockId.WINDOW || b === BlockId.WINDOW_OPEN) {
        if (this.togglingDoorWindow) return;
        this.togglingDoorWindow = true;
        try {
          await this.toggleConnectedDoorWindow(wx, wy, wz);
        } finally {
          this.togglingDoorWindow = false;
        }
        return;
      }
      this.placeBlock();
    }
  }

  // Toggle a window/door and all connected same-type neighbours (6-connected: sides and stacked)
  async toggleConnectedDoorWindow(startWx: number, startWy: number, startWz: number): Promise<void> {
    const startBlock = this.getWorldBlock(startWx, startWy, startWz);
    let kind: 'DOOR' | 'WINDOW' | null = null;
    if (startBlock === BlockId.DOOR || startBlock === BlockId.DOOR_OPEN) kind = 'DOOR';
    else if (startBlock === BlockId.WINDOW || startBlock === BlockId.WINDOW_OPEN) kind = 'WINDOW';
    if (!kind) return;

    const isOpen = (startBlock === BlockId.DOOR_OPEN || startBlock === BlockId.WINDOW_OPEN);
    const targetId = kind === 'DOOR' ? (isOpen ? BlockId.DOOR : BlockId.DOOR_OPEN) : (isOpen ? BlockId.WINDOW : BlockId.WINDOW_OPEN);

    const q: Array<[number, number, number]> = [[startWx, startWy, startWz]];
    const visited = new Set<string>([`${startWx},${startWy},${startWz}`]);
    const toToggle: Array<{ wx: number; wy: number; wz: number }> = [];
    const MAX = 512; // safety cap

    while (q.length > 0 && toToggle.length < MAX) {
      const [cx, cy, cz] = q.shift()!;
      toToggle.push({ wx: cx, wy: cy, wz: cz });
      const neigh = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (const d of neigh) {
        const nx = cx + d[0];
        const ny = cy + d[1];
        const nz = cz + d[2];
        const key = `${nx},${ny},${nz}`;
        if (visited.has(key)) continue;
        const b = this.getWorldBlock(nx, ny, nz);
        if (kind === 'DOOR' && (b === BlockId.DOOR || b === BlockId.DOOR_OPEN)) {
          visited.add(key);
          q.push([nx, ny, nz]);
        } else if (kind === 'WINDOW' && (b === BlockId.WINDOW || b === BlockId.WINDOW_OPEN)) {
          visited.add(key);
          q.push([nx, ny, nz]);
        }
      }
    }

    // Local apply: set blocks without triggering per-block server calls or per-block rebuilds
    const batchItems: { chunkX: number; chunkZ: number; localX: number; localY: number; localZ: number; blockId: number }[] = [];
    const touchedChunks = new Set<string>();
    for (const c of toToggle) {
      const cx = Math.floor(c.wx / CHUNK_SIZE);
      const cz = Math.floor(c.wz / CHUNK_SIZE);
      const lx = c.wx - cx * CHUNK_SIZE;
      const lz = c.wz - cz * CHUNK_SIZE;
      this.setWorldBlock(c.wx, c.wy, c.wz, targetId, false, false);
      batchItems.push({ chunkX: cx, chunkZ: cz, localX: lx, localY: c.wy, localZ: lz, blockId: targetId });
      touchedChunks.add(`${cx},${cz}`);
    }

    // Rebuild affected chunks and neighbors once
    for (const ch of Array.from(touchedChunks)) {
      const parts = ch.split(',');
      const sx = parseInt(parts[0], 10);
      const sz = parseInt(parts[1], 10);
      this.rebuildSingleChunkMesh(sx, sz);
      this.rebuildSingleChunkMesh(sx - 1, sz);
      this.rebuildSingleChunkMesh(sx + 1, sz);
      this.rebuildSingleChunkMesh(sx, sz - 1);
      this.rebuildSingleChunkMesh(sx, sz + 1);
    }

    // Persist batch to server; if batch fails, fall back to per-block requests
    const userId = this.parentRef?.user?.id;
    if (userId && batchItems.length > 0) {
      try {
        const res = await this.digcraftService.placeBlocks(userId, this.worldId, batchItems);
        if (!res) {
          // fallback: send single requests
          for (const it of batchItems) {
            this.digcraftService.placeBlock(userId, this.worldId, it.chunkX, it.chunkZ, it.localX, it.localY, it.localZ, it.blockId);
          }
        }
      } catch (e) {
        // best-effort fallback
        for (const it of batchItems) {
          this.digcraftService.placeBlock(userId, this.worldId, it.chunkX, it.chunkZ, it.localX, it.localY, it.localZ, it.blockId);
        }
      }
    }
  }

  onTouchJump(e?: any): void {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    this.handleSpaceBar(e);
  }

  requestPointerLock(): void {
    return requestPointerLock(this);
  }

  // Joystick knob transform delegates to shared handler
  getJoystickKnobTransform(): string {
    return getJoystickKnobTransform(this);
  }

  // Enqueue a block change for batched, throttled persistence
  private enqueuePlaceChange(item: { chunkX: number; chunkZ: number; localX: number; localY: number; localZ: number; blockId: number }): void {
    // Replace any existing pending change for the same coord so last-write wins
    const idx = this.pendingPlaceItems.findIndex(p => p.chunkX === item.chunkX && p.chunkZ === item.chunkZ && p.localX === item.localX && p.localY === item.localY && p.localZ === item.localZ);
    if (idx >= 0) {
      this.pendingPlaceItems[idx] = item;
    } else {
      this.pendingPlaceItems.push(item);
    }

    // Start the periodic flush if not running
    if (!this.placeFlushInterval) {
      this.placeFlushInterval = setInterval(() => {
        this.flushPendingPlaceItems().catch(err => console.error('DigCraft: flushPendingPlaceItems error', err));
      }, this.PLACE_FLUSH_MS);
    }
  }

  // Flush pending place items to the server (batched). Runs at most twice per second.
  private async flushPendingPlaceItems(): Promise<void> {
    if (this.pendingPlaceItems.length === 0) {
      if (this.placeFlushInterval) { clearInterval(this.placeFlushInterval); this.placeFlushInterval = undefined; }
      return;
    }

    // Drain queue (send snapshot)
    const itemsToSend = this.pendingPlaceItems.splice(0, this.pendingPlaceItems.length);

    const userId = this.parentRef?.user?.id;
    if (!userId) return;

    try {
      const res = await this.digcraftService.placeBlocks(userId, this.worldId, itemsToSend);
      if (!res) {
        // Fallback: send individual requests if batch failed
        for (const it of itemsToSend) {
          this.digcraftService.placeBlock(userId, this.worldId, it.chunkX, it.chunkZ, it.localX, it.localY, it.localZ, it.blockId);
        }
      }
    } catch (e) {
      // Best-effort fallback
      for (const it of itemsToSend) {
        this.digcraftService.placeBlock(userId, this.worldId, it.chunkX, it.chunkZ, it.localX, it.localY, it.localZ, it.blockId);
      }
    }
  }

  private getArmorType(itemId: number): 'helmet' | 'chest' | 'legs' | 'boots' | null {
    switch (itemId) {
      case ItemId.LEATHER_HELMET: case ItemId.IRON_HELMET: case ItemId.DIAMOND_HELMET: case ItemId.NETHERITE_HELMET:
        return 'helmet';
      case ItemId.LEATHER_CHEST: case ItemId.IRON_CHEST: case ItemId.DIAMOND_CHEST: case ItemId.NETHERITE_CHEST:
        return 'chest';
      case ItemId.LEATHER_LEGS: case ItemId.IRON_LEGS: case ItemId.DIAMOND_LEGS: case ItemId.NETHERITE_LEGS:
        return 'legs';
      case ItemId.LEATHER_BOOTS: case ItemId.IRON_BOOTS: case ItemId.DIAMOND_BOOTS: case ItemId.NETHERITE_BOOTS:
        return 'boots';
      default:
        return null;
    }
  }

  isArmorItem(itemId: number): boolean {
    return this.getArmorType(itemId) !== null;
  }

  // Weapon helpers
  isWeaponItem(itemId: number): boolean {
    return this.isSwordItem(itemId) || this.isPickaxeItem(itemId) || this.isAxeItem(itemId);
  }

  isSwordItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_SWORD: case ItemId.STONE_SWORD: case ItemId.IRON_SWORD: case ItemId.DIAMOND_SWORD: case ItemId.NETHERITE_SWORD:
        return true;
      default: return false;
    }
  }

  isPickaxeItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_PICKAXE: case ItemId.STONE_PICKAXE: case ItemId.IRON_PICKAXE: case ItemId.DIAMOND_PICKAXE: case ItemId.NETHERITE_PICKAXE:
        return true;
      default: return false;
    }
  }

  isAxeItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_AXE: case ItemId.STONE_AXE: case ItemId.IRON_AXE: case ItemId.DIAMOND_AXE: case ItemId.NETHERITE_AXE:
        return true;
      default: return false;
    }
  }

  weaponTypeClass(): string {
    const id = this.equippedWeapon;
    if (!id) return '';
    if (this.isSwordItem(id)) return 'sword';
    if (this.isPickaxeItem(id)) return 'pickaxe';
    if (this.isAxeItem(id)) return 'axe';
    return '';
  }

  equipItem(slotIndex: number): void {
    const slot = this.inventory[slotIndex];
    if (!slot || slot.quantity <= 0) return;
    const armorSlot = this.getArmorType(slot.itemId);
    if (!armorSlot) return;

    const itemId = slot.itemId;
    const prevEquipped = this.equippedArmor[armorSlot];

    // Remove one from inventory
    slot.quantity--;
    if (slot.quantity <= 0) { slot.itemId = 0; slot.quantity = 0; }

    // If something was equipped, try to return it to inventory. If it doesn't fit, revert.
    if (prevEquipped && prevEquipped > 0) {
      const ok = this.addToInventory(prevEquipped, 1);
      if (!ok) {
        // revert inventory change
        if (slot.itemId === 0) slot.itemId = itemId;
        slot.quantity++;
        return;
      }
    }

    // Equip new item
    this.equippedArmor[armorSlot] = itemId;
    this.scheduleInventorySave();
  }

  equipWeapon(slotIndex: number): void {
    const slot = this.inventory[slotIndex];
    if (!slot || slot.quantity <= 0) return;
    if (!this.isWeaponItem(slot.itemId)) return;

    const itemId = slot.itemId;
    const prevEquipped = this.equippedWeapon;

    // Remove one from inventory
    slot.quantity--;
    if (slot.quantity <= 0) { slot.itemId = 0; slot.quantity = 0; }

    // If something was equipped, try to return it to inventory. If it doesn't fit, revert.
    if (prevEquipped && prevEquipped > 0) {
      const ok = this.addToInventory(prevEquipped, 1);
      if (!ok) {
        // revert inventory change
        if (slot.itemId === 0) slot.itemId = itemId;
        slot.quantity++;
        return;
      }
    }

    this.equippedWeapon = itemId;
    this.scheduleInventorySave();
  }

  unequipWeapon(): void {
    const itemId = this.equippedWeapon;
    if (!itemId || itemId === 0) return;
    const ok = this.addToInventory(itemId, 1);
    if (ok) this.equippedWeapon = 0;
    if (ok) this.scheduleInventorySave();
  }

  unequipArmor(slotType: 'helmet' | 'chest' | 'legs' | 'boots'): void {
    const itemId = this.equippedArmor[slotType];
    if (!itemId || itemId === 0) return;
    const ok = this.addToInventory(itemId, 1);
    if (ok) this.equippedArmor[slotType] = 0;
    if (ok) this.scheduleInventorySave();
  }

  // Pointer-based drag handlers for inventory reordering
  onSlotPointerDown(index: number, e: PointerEvent): void {
    // Prevent default browser gestures and start tracking drag
    try { e.preventDefault(); } catch { }
    e.stopPropagation();
    this.slotPointerDownIndex = index;
    this.slotPointerId = e.pointerId;
    this.slotPointerStartX = e.clientX;
    this.slotPointerStartY = e.clientY;
    // Capture pointer on the element that has the listener (currentTarget) so
    // moves/up are reliably delivered even when the pointer leaves the element.
    try {
      this.slotPointerCaptureEl = (e.currentTarget as Element) || (e.target as Element);
      if (this.slotPointerCaptureEl) (this.slotPointerCaptureEl as Element).setPointerCapture(e.pointerId);
    } catch (err) { this.slotPointerCaptureEl = null; }
    document.addEventListener('pointermove', this.boundSlotPointerMove, { passive: false } as AddEventListenerOptions);
    document.addEventListener('pointerup', this.boundSlotPointerUp);
    document.addEventListener('pointercancel', this.boundSlotPointerUp);
  }

  onChestSlotPointerDown(index: number, e: PointerEvent): void {
    try { e.preventDefault(); } catch { }
    e.stopPropagation();
    this.slotPointerDownIndex = index;
    this.slotPointerId = e.pointerId;
    this.slotPointerStartX = e.clientX;
    this.slotPointerStartY = e.clientY;
    this.dragSource = 'chest';
    try {
      this.slotPointerCaptureEl = (e.currentTarget as Element) || (e.target as Element);
      if (this.slotPointerCaptureEl) (this.slotPointerCaptureEl as Element).setPointerCapture(e.pointerId);
    } catch (err) { this.slotPointerCaptureEl = null; }
    document.addEventListener('pointermove', this.boundSlotPointerMove, { passive: false } as AddEventListenerOptions);
    document.addEventListener('pointerup', this.boundSlotPointerUp);
    document.addEventListener('pointercancel', this.boundSlotPointerUp);
  }

  async closeLoginPanel() {
    this.isShowingLoginPanel = false;
    this.parentRef?.closeOverlay();
    setTimeout(async () => {
      await this.ngOnInit();
      if (this.currentUser.id) {
        await this.joinWorld();
      }
    }, 50); 
  }

  safeExit() {
    const closed = this.closeAllPanels();
    if (closed.length === 0) {
      this.remove_me('DigCraftComponent');
    }
  }

  /**
 * Close all open panels and return a list of which panels were closed. This is used to ensure that when opening a new panel, any existing open panel is closed first, and if the requested panel was already open, it won't be reopened after closing all panels.
 * Also ensures pointer lock is re-engaged after closing panels.
 * @returns list of panel names that were closed
 */
  closeAllPanels(): string[] {
    const closed: string[] = [];
    if (this.showInventory) { this.showInventory = false; closed.push('inventory'); }
    if (this.showCrafting) { this.showCrafting = false; closed.push('crafting'); }
    if (this.showPlayersPanel) { this.showPlayersPanel = false; closed.push('players'); }
    if (this.showWorldPanel) { this.showWorldPanel = false; closed.push('world'); }
    if (this.showBonfirePanel) { this.showBonfirePanel = false; closed.push('bonfire'); }
    if (this.showChestPanel) { this.showChestPanel = false; closed.push('chest'); }
    if (this.isMenuPanelOpen) { this.isMenuPanelOpen = false; closed.push('menu'); }
    this.canvasRef?.nativeElement?.requestPointerLock();
    return closed;
  }

  openPanel(panel: 'inventory' | 'crafting' | 'players' | 'world' | 'bonfire' | 'chest' | 'menu', e?: Event): void {
    if (e && typeof (e as Event).preventDefault === 'function') try { (e as Event).preventDefault(); } catch { }

    console.log(`openPanel called: ${panel}, showInventory=${this.showInventory}, showCrafting=${this.showCrafting}`);
    const closed = this.closeAllPanels();
    console.log(`openPanel: closed panels =`, closed);
    if (closed.includes(panel)) {
      console.log(`Panel "${panel}" was already open, closed it and not reopening`);
      return;
    }
    setTimeout(() => {
      switch (panel) {
        case 'inventory': {
          this.showInventory = true;
          console.log(`openPanel: set showInventory = true`);
          break;
        }
        case 'crafting': {
          this.updateAvailableRecipes();
          console.log(`openPanel: calling setTimeout for crafting`);
          setTimeout(() => {
            this.showCrafting = true;
            console.log(`openPanel: set showCrafting = true`);
          }, 50);
          break;
        }
        case 'players': {
          this.showPlayersPanel = true;
          this.refreshPartyMembers();
          this.startInvitePolling();
          break
        };
        case 'world': {
          this.showWorldPanel = true;
          this.fetchWorlds().catch(err => console.error('DigCraft: fetchWorlds error', err));
          break;
        }
        case 'menu': this.isMenuPanelOpen = true; break;
      }
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      console.log(`openPanel: requested "${panel}", closed panels =`, closed);
    }, 10);
  }

  closePanel(panel: 'inventory' | 'crafting' | 'players' | 'world' | 'bonfire' | 'chest' | 'menu'): void {
    console.log(`closePanel: requested "${panel}"`);
    setTimeout(() => {
      switch (panel) {
        case 'inventory': this.showInventory = false; break;
        case 'crafting': this.showCrafting = false; break;
        case 'players': {
          this.showPlayersPanel = false;
          this.stopInvitePolling();
          break;
        }
        case 'world': this.showWorldPanel = false; break;
        case 'menu': this.isMenuPanelOpen = false; break;
      }
      this.canvasRef?.nativeElement?.requestPointerLock();
    }, 10);
  }

  async pollPartyInvites(): Promise<void> {
    const myId = this.currentUser.id ?? 0;
    if (!myId) return;
    try {
      const invites = await this.digcraftService.getPendingInvites(myId);
      this.pendingReceivedInvites.clear();
      if (invites && invites.length > 0) {
        const now = Date.now();
        const validInvites = invites.filter(inv => inv.expiresAt > now);
        for (const inv of validInvites) {
          this.pendingReceivedInvites.set(inv.fromUserId, inv);
        }
      }
      this.syncInvitePromptWithPendingInvites();
    } catch (e) { /* ignore poll errors */ }
  }

  // trackBy for otherPlayers ngFor so the `app-user-tag` element is preserved
  // and not recreated when the players array is refreshed each tick.
  trackByUserId(index: number, p: { userId: number }): number {
    return p ? p.userId : index;
  }

  trackByBonfire(index: number, b: { id: number }): number {
    return b ? b.id : index;
  }

  trackByChest(index: number, c: { id: number }): number {
    return c ? c.id : index;
  }

  async fetchWorlds(): Promise<void> {
    try {
      this.worlds = await this.digcraftService.getWorlds();
      try { this.cd.detectChanges(); } catch (e) { }
    } catch (err) {
      console.error('DigCraft: getWorlds failed', err);
      this.worlds = [];
    }
  }

  selectWorldForChange(w: { id: number; seed: number }): void {
    this.selectedWorldForChange = w.id;
    this.editWorldId = w.id;
  }

  onSelectWorldId(e: Event): void {
    const target = e && (e.target as HTMLInputElement | null);
    const v = target ? target.value : '';
    this.editWorldId = v === '' ? null : Number(v);
  }

  async applyWorldChange(): Promise<void> {
    if (this.editWorldId == null) return;
    try {
      // Switch the player to the requested world id
      await this.switchWorld(Number(this.editWorldId));
      this.showWorldPanel = false;
    } catch (err) {
      console.error('DigCraft: switchWorld failed', err);
    }
  }

  async switchWorld(newWorldId: number): Promise<void> {
    if (!confirm("Switch to world " + newWorldId + "?")) return;
    try {
      // clean up current game state
      this.cleanup();
      this.joined = false;
      this.loading = true;
      this.worldId = newWorldId;
      // join the new world
      await this.joinWorld();
    } catch (err) {
      console.error('DigCraft: switchWorld error', err);
    }
  }

  getPlayerName(p: DCPlayer): string {
    if (!p) return '';
    if (p.username && p.username.length > 0) return p.username;
    const cached = this.userNameCache.get(p.userId);
    return cached ?? `User${p.userId}`;
  }

  private onSlotPointerMove(e: PointerEvent): void {
    if (this.slotPointerId !== e.pointerId) return;
    const dx = e.clientX - this.slotPointerStartX;
    const dy = e.clientY - this.slotPointerStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const START_THRESHOLD = 6; // pixels
    if (!this.dragging && dist > START_THRESHOLD && this.slotPointerDownIndex !== null) {
      // start dragging
      this.dragging = true;
      this.draggingIndex = this.slotPointerDownIndex;
      if (this.dragSource === 'chest') {
        const slot = this.chestInventory[this.draggingIndex!];
        this.dragGhostItemId = slot?.itemId ?? 0;
      } else {
        this.dragGhostItemId = this.inventory[this.draggingIndex!]?.itemId ?? 0;
      }
      this.dragGhostX = e.clientX;
      this.dragGhostY = e.clientY;
    }
    if (this.dragging) {
      this.dragGhostX = e.clientX;
      this.dragGhostY = e.clientY;
      // find element under pointer and locate data-index or data-chest-index
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      let node: HTMLElement | null = el;
      let found: number | null = null;
      while (node) {
        if (node.hasAttribute) {
          if (node.hasAttribute('data-chest-index')) {
            found = parseInt(node.getAttribute('data-chest-index') || '0', 10);
            break;
          }
          if (node.hasAttribute('data-chest-inv-index')) {
            found = parseInt(node.getAttribute('data-chest-inv-index') || '0', 10);
            break;
          }
          if (node.hasAttribute('data-index')) {
            const v = node.getAttribute('data-index');
            if (v !== null) found = parseInt(v, 10);
            break;
          }
        }
        node = node.parentElement as HTMLElement | null;
      }
      this.dragTargetIndex = found;
    }
  }

  private onSlotPointerUp(e: PointerEvent): void {
    if (this.slotPointerId !== e.pointerId) return;
    document.removeEventListener('pointermove', this.boundSlotPointerMove);
    document.removeEventListener('pointerup', this.boundSlotPointerUp);
    document.removeEventListener('pointercancel', this.boundSlotPointerUp);
    try {
      if (this.slotPointerCaptureEl) (this.slotPointerCaptureEl as Element).releasePointerCapture(e.pointerId);
    } catch (err) { }
    this.slotPointerCaptureEl = null;

    if (this.dragging) {
      if (this.draggingIndex !== null && this.dragTargetIndex !== null && this.draggingIndex !== this.dragTargetIndex) {
        // Handle drag between chest and inventory
        if (this.dragSource === 'chest') {
          // Dragging from chest - check if target is inventory or chest
          const isTargetInventory = this.isInventorySlot(e.clientX, e.clientY);
          if (isTargetInventory) {
            // Swap chest slot with inventory slot
            const a = this.chestInventory[this.draggingIndex];
            const b = this.inventory[this.dragTargetIndex];
            this.chestInventory[this.draggingIndex] = b ? { itemId: b.itemId, quantity: b.quantity } : null;
            this.inventory[this.dragTargetIndex] = a ? { itemId: a.itemId, quantity: a.quantity } : { itemId: 0, quantity: 0 };
            this.scheduleInventorySave();
          } else {
            // Swap within chest
            const a = this.chestInventory[this.draggingIndex];
            this.chestInventory[this.draggingIndex] = this.chestInventory[this.dragTargetIndex];
            this.chestInventory[this.dragTargetIndex] = a;
          }
        } else {
          // Dragging from inventory - check if target is chest or inventory
          const isTargetInventory = this.isInventorySlot(e.clientX, e.clientY);
          if (isTargetInventory) {
            // Swap within inventory
            const a = this.inventory[this.draggingIndex];
            this.inventory[this.draggingIndex] = this.inventory[this.dragTargetIndex];
            this.inventory[this.dragTargetIndex] = a;
            this.scheduleInventorySave();
          } else {
            // Swap inventory slot with chest slot
            const a = this.inventory[this.draggingIndex];
            const b = this.chestInventory[this.dragTargetIndex];
            this.inventory[this.draggingIndex] = b ? { itemId: b.itemId, quantity: b.quantity } : { itemId: 0, quantity: 0 };
            this.chestInventory[this.dragTargetIndex] = a ? { itemId: a.itemId, quantity: a.quantity } : null;
            this.scheduleInventorySave();
          }
        }
      }
      // clear drag state
      this.dragging = false;
      this.draggingIndex = null;
      this.dragTargetIndex = null;
      this.dragGhostItemId = 0;
      this.dragSource = null;
    } else {
      // treat as click
      if (this.slotPointerDownIndex !== null) {
        // If inventory overlay is open, select the inventory slot for drop UI
        if (this.showInventory) {
          this.selectedInventoryIndex = this.slotPointerDownIndex;
          const s = this.inventory[this.selectedInventoryIndex];
          this.dropCount = (s && s.quantity > 0) ? 1 : 1;
        } else {
          this.selectHotbarSlot(this.slotPointerDownIndex);
        }
      }
    }

    this.slotPointerDownIndex = null;
    this.slotPointerId = null;
  }

  private isInventorySlot(clientX: number, clientY: number): boolean {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return false;
    let node: HTMLElement | null = el;
    while (node) {
      if (node.hasAttribute) {
        if (node.hasAttribute('data-chest-inv-index') || node.hasAttribute('data-index')) {
          return true;
        }
        if (node.hasAttribute('data-chest-index')) {
          return false;
        }
      }
      node = node.parentElement as HTMLElement | null;
    }
    return false;
  }

  // Trigger a short first-person swing animation when the player clicks with a weapon
  triggerSwing(): void {
    // Only swing for swords and pickaxes
    if (!this.equippedWeapon) return;
    if (!this.isSwordItem(this.equippedWeapon) && !this.isPickaxeItem(this.equippedWeapon)) return;
    if (this.isSwinging) return; // avoid overlapping swings
    this.swingStartTime = performance.now();
    this.isSwinging = true;
    // mark attack state for networking so other clients can see an attack pose
    this.isAttacking = true;
    if (this.attackTimeout) clearTimeout(this.attackTimeout);
    // keep attack flag active slightly longer than the local swing so polling catches it
    this.attackTimeout = setTimeout(() => { this.isAttacking = false; this.attackTimeout = null; }, 900);
    // Clear first-person swing after animation duration (ms)
    setTimeout(() => { this.isSwinging = false; }, 380);
    // Attack action is handled in handleLeftClick()/attemptAttack(), not here
  }

  onDropCountInput(e: Event): void {
    const target = e && (e.target as HTMLInputElement | null);
    if (!target) return;
    const val = parseInt(target.value, 10);
    if (isNaN(val) || val < 1) this.dropCount = 1;
    else if (this.selectedInventoryIndex === null) this.dropCount = Math.max(1, val);
    else {
      const max = this.inventory[this.selectedInventoryIndex]?.quantity ?? val;
      this.dropCount = Math.max(1, Math.min(max, val));
    }
  }

  dropAllSelected(): void { 
    if (this.selectedInventoryIndex === null) return;
    const idx = this.selectedInventoryIndex;
    const slot = this.inventory[idx];
    const count = slot.quantity ?? 0;
    if (count > 0) {
      slot.quantity = 0;
      slot.itemId = 0;
      this.saveInventory();
    }
  }

  dropSelected(count?: number): void {
    if (this.selectedInventoryIndex === null) return;
    const idx = this.selectedInventoryIndex;
    const slot = this.inventory[idx];
    if (!slot || slot.quantity <= 0) { this.selectedInventoryIndex = null; return; }
    const toDrop = count === undefined ? this.dropCount : Math.max(1, Math.min(slot.quantity, count));
    slot.quantity -= toDrop;
    if (slot.quantity <= 0) { slot.itemId = 0; slot.quantity = 0; }
    // persist immediately
    this.saveInventory();
    this.selectedInventoryIndex = null;
  }

  clearSelectedInventory(): void {
    this.selectedInventoryIndex = null;
  }

  private checkLevelUp(): void {
    while (this.exp >= this.expForNextLevel) {
      this.exp -= this.expForNextLevel;
      this.level++;
      this.showDamagePopup(`Level Up! ⭐`);
    }
  }

  private isWithinReachOfBody(x: number, y: number, z: number): boolean {
    const eyeH = 1.6;
    const feetY = this.camY - eyeH;
    for (let bodyY = feetY; bodyY <= this.camY; bodyY += 0.8) {
      const dx = x - this.camX;
      const dy = y - bodyY;
      const dz = z - this.camZ;
      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2 && Math.abs(dz) <= 2) {
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= 4) return true;
      }
    }
    return false;
  }

  private findAimedPlayer(): DCPlayer | null {
    const myId = this.parentRef?.user?.id ?? 0;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const dirX = -sy * cp;
    const dirY = sp;
    const dirZ = -cy * cp;

    const maxRange = this.PLAYER_ATTACK_MAX_RANGE;
    const hitRadius = 0.9;
    let best: DCPlayer | null = null;
    let bestPerp = Number.POSITIVE_INFINITY;
    const candidates = this.smoothedPlayers.length ? this.smoothedPlayers : this.otherPlayers;
    for (const p of candidates) {
      if (!p || p.userId === myId) continue;
      if (!this.isWithinReachOfBody(p.posX, p.posY, p.posZ)) continue;
      const dx = p.posX - this.camX;
      const dy = p.posY - this.camY;
      const dz = p.posZ - this.camZ;
      const proj = dx * dirX + dy * dirY + dz * dirZ;
      if (proj <= 0 || proj > maxRange) continue;
      const distSq = dx * dx + dy * dy + dz * dz;
      const perp2 = Math.max(0, distSq - proj * proj);
      if (perp2 <= hitRadius * hitRadius) {
        if (perp2 < bestPerp) { bestPerp = perp2; best = p; }
      }
    }
    return best;
  }

  private findAimedMob(): any | null {
    const myId = this.parentRef?.user?.id ?? 0;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const dirX = -sy * cp;
    const dirY = sp;
    const dirZ = -cy * cp;

    const maxRange = this.PLAYER_ATTACK_MAX_RANGE;
    const hitRadius = 0.9;
    let best: any | null = null;
    let bestPerp = Number.POSITIVE_INFINITY;
    const candidates = this.mobs || [];
    for (const m of candidates) {
      if (!m) continue;
      // Skip dead mobs
      if ((m as any).dead) continue;
      const mobY = m.posY || 0;
      if (!this.isWithinReachOfBody(m.posX, mobY, m.posZ)) continue;
      const dx = m.posX - this.camX;
      const dy = mobY - this.camY;
      const dz = m.posZ - this.camZ;
      const proj = dx * dirX + dy * dirY + dz * dirZ;
      if (proj <= 0 || proj > maxRange) continue;
      const distSq = dx * dx + dy * dy + dz * dz;
      const perp2 = Math.max(0, distSq - proj * proj);
      if (perp2 <= hitRadius * hitRadius) {
        if (perp2 < bestPerp) { bestPerp = perp2; best = m; }
      }
    }
    return best;
  }

  private async attemptAttack(): Promise<void> {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;
    const target = this.findAimedPlayer();
    if (target) {
      try {
        const res = await this.digcraftService.attack(userId, target.userId, this.worldId, this.equippedWeapon, this.camX, this.camY, this.camZ);
        if (res && res.ok) {
          const p = this.otherPlayers.find(x => x.userId === res.targetUserId);
          if (p) p.health = res.health;
          if (res.damage && res.damage > 0) this.showDamagePopup(`-${res.damage}`);
          // Reduce weapon durability when hitting players
          this.reduceEquippedDurability('hit');
        }
      } catch (err) {
        console.error('DigCraft: attack failed', err);
      }
      return;
    }

    // If no player targeted, try mobs (server-authoritative)
    const mob = this.findAimedMob();
    if (!mob) return;

    // Don't update local health optimistically - server is authoritative
    // Send attack to server and wait for response

    try {
      const res = await this.digcraftService.attackMob(userId, this.worldId, mob.id, this.equippedWeapon, this.camX, this.camY, this.camZ, true);
      if (!res) {
        console.warn('DigCraft: attackMob returned null');
        return;
      }
      if (!res.ok) {
        console.warn('DigCraft: attackMob failed:', res);
        return;
      }
      // Reduce weapon durability when hitting mobs
      this.reduceEquippedDurability('hit');
      // update local mob list from server response
      const localIdx = this.mobs.findIndex((m: any) => m.id === res.mobId);
      if (localIdx >= 0) {
        if (res.dead) {
          (this.mobs[localIdx] as any).dead = true;
          // Mark as dead in smoothed mobs
          if (this.smoothedMobs) {
            const smoothIdx = this.smoothedMobs.findIndex((m: any) => m.id === res.mobId);
            if (smoothIdx >= 0) (this.smoothedMobs[smoothIdx] as any).dead = true;
          }
          this.mobs[localIdx].health = res.health;
          // Update smoothed mobs if present
          if (this.smoothedMobs) {
            const smoothMob = this.smoothedMobs.find((m: any) => m.id === res.mobId);
            if (smoothMob) smoothMob.health = res.health;
          }
        }
      }
      if (res.damage && res.damage > 0) this.showDamagePopup(`-${res.damage}`);
    } catch (err) {
      console.error('DigCraft: attackMob failed', err);
    }
  }
}
