import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectorRef
} from '@angular/core';
import { ChildComponent } from '../child.component';
import { DigcraftService } from '../../services/digcraft.service';
import {
  BlockId, ItemId, CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE, MAX_STACK_SIZE,
  InvSlot, RECIPES, CraftRecipe, BLOCK_DROPS, ITEM_NAMES, ITEM_COLORS, ITEM_ICONS, BLOCK_ICONS, FOOD_VALUES,
  isPlaceable, getMiningSpeed, getItemDurability, getBlockHealth, DCPlayer, DCBlockChange, DCJoinResponse, SHRUB_GROW_TIME_MS, BLOCK_COLORS,
  MAX_INVENTORY_LENGTH, MAX_VIEW_DISTANCE, PLAYER_ATTACK_MAX_RANGE, BOW_ATTACK_MAX_RANGE, SEA_LEVEL, NETHER_HEIGHT, INVULNERABLE_BLOCKS,
  isFluidBlock, WATER_SOURCE_STRENGTH, LAVA_SOURCE_STRENGTH, REGENERATIVE_BLOCKS, UNSTACKABLE_BLOCKS
} from './digcraft-types';
import { Chunk, generateChunk, applyChanges, NETHER_TOP } from './digcraft-world';
import { BiomeId } from './digcraft-biome';
import { DigCraftRenderer, buildMVP, perspectiveMatrix, lookAtFPS, multiplyMat4 } from './digcraft-renderer';
import { onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp, onPointerLockChange, onTouchStart, onTouchMove, onTouchEnd, getJoystickKnobTransform, requestPointerLock } from './digcraft-input';
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
  @ViewChild('renameBonfirePrompt', { static: false }) renameBonfirePrompt?: PromptComponent;
  @ViewChild('renameChestPrompt', { static: false }) renameChestPrompt?: PromptComponent;
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
  // Third-person/orbit camera state (toggled with middle mouse)
  thirdPerson: boolean = false;
  thirdPersonDistance: number = 4.0;
  thirdPersonYaw: number = 0;
  thirdPersonPitch: number = 0;
  // Field of view in degrees (user-configurable). Default will be set on init.
  fovDeg: number = 70;
  private readonly FOV_KEY = 'digcraft.fov';
  // View distance in chunks (user-configurable). Stored locally and optionally on server.
  private readonly VIEW_DIST_KEY = 'digcraft.viewDistance';
  viewDistanceChunks: number = RENDER_DISTANCE;
  // Mouse sensitivity multiplier (stored as integer 1-20, displayed as 0.1x-2.0x)
  private readonly MOUSE_SENS_KEY = 'digcraft.mouseSensitivity';
  mouseSensitivity: number = 10;

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
  // Current crafting type: 'general' (default), 'smithing', or 'furnace'
  craftingType: 'general' | 'smithing' | 'furnace' = 'general';
  // Last crafted item id (used to scroll the recipe list to the crafted entry)
  lastCraftedItemId?: number;
  private craftScrollTimeout: any = null;
  private readonly CRAFT_SCROLL_DELAY_MS = 300;

  // Health / hunger
  health = 20;
  // Damage flash visual state (screen red flash when taking damage)
  isDamageFlash = false;
  invulnerableUntil = 0; // timestamp until which player is invulnerable
  get isInvulnerable(): boolean {
    return performance.now() < this.invulnerableUntil;
  }
  get invulnSecondsLeft(): number {
    return Math.max(0, Math.ceil((this.invulnerableUntil - performance.now()) / 1000));
  }
  private damageFlashTimeout: any = null;
  hunger = 20;
  private miningExhaustion = 0;

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

  getInvulnSecondsLeft(): number {
    return Math.max(0, Math.ceil((this.invulnerableUntil - performance.now()) / 1000));
  }

  // Celestial (sun/moon) overlay state
  celestialX = 0;
  celestialY = 0;
  celestialSize = 72;
  celestialIsDay = true;

  // Multiplayer
  otherPlayers: DCPlayer[] = [];
  stableOtherPlayers: Array<DCPlayer & { missingCount: number }> = [];
  private _syncCounter = 0;
  // Knockback velocities for smooth push-back animation
  private playerKnockback: Map<number, { vx: number; vz: number; startTime: number }> = new Map();
  // Track watch block positions for special rendering
  private watchBlocks: Map<string, number> = new Map();
  // Track last server positions to detect knockback
  private lastServerPos: Map<number, { x: number; y: number; z: number; time: number }> = new Map();
  // Crumbling block particles
  private crumblingBlocks: Array<{ wx: number; wy: number; wz: number; color: { r: number; g: number; b: number }; startTime: number }> = [];
  get otherPlayersExcludingSelf(): DCPlayer[] {
    return this.otherPlayers.filter(p => p.userId !== this.currentUser.id);
  }
  get stableOtherPlayersExcludingSelf(): Array<DCPlayer & { missingCount: number }> {
    return this.stableOtherPlayers.filter(p => p.userId !== this.currentUser.id);
  }
  // Track damage flash — map userId to flash end timestamp
  private playerDamageFlash: Map<number, number> = new Map();
  // Track mob damage flash — map mob entity index to flash end timestamp
  private mobDamageFlash: Map<number, number> = new Map();
  // Track health to detect drops for flash
  private playerLastHealth: Map<number, number> = new Map();
  private mobLastHealth: Map<number, number> = new Map();
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
  readonly INVITE_TIMEOUT_MS = 180000;
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
  targetBlock: { wx: number; wy: number; wz: number; id?: number } | null = null;
  targetName: string | null = null; // What the player is targeting (block name, player name, or mob name)
  placementBlock: { wx: number; wy: number; wz: number } | null = null;
  /** First water block along the look ray (for bucket pickup) */
  waterRayTarget: { wx: number; wy: number; wz: number } | null = null;
  lavaRayTarget: { wx: number; wy: number; wz: number } | null = null;
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
  isTypingMode = false;
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
  isDefending: boolean = false;
  leftHand: number = 0; // ItemId.TORCH or ItemId.SHIELD or 0
  // Arrow projectiles from bow
  arrows: Array<{ wx: number; wy: number; wz: number; vx: number; vy: number; vz: number; firedBy: number; startTime: number; lastUpdateTime: number }> = [];
  private attackTimeout: any = null;
  // whether to render the first-person weapon using WebGL (true) or CSS overlay (false)
  // default to false to preserve the visible CSS overlay while GL-first-person is debugged
  useGLFirstPersonWeapon: boolean = true;
  // Bonfires placed by this player (server-synced)
  bonfires: Array<{ id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }> = [];
  showBonfirePanel: boolean = false;
  isPlacingBonfire = false;
  // Chests placed by this player (server-synced)
  chests: Array<{ id: number; wx: number; wy: number; wz: number; nickname: string; items: Array<{ itemId: number; quantity: number }>; worldId: number }> = [];
  showChestPanel: boolean = false;
  selectedChest: { id: number; wx: number; wy: number; wz: number; nickname: string; items: any[]; worldId: number } | null = null;
  chestInventory: Array<{ itemId: number; quantity: number } | null> = [];
  chestLoading = false;
  chestSaving = false;
  // timestamp when the current swing started (ms)
  swingStartTime: number = 0;
  // whether the players popup panel is visible
  private _showPlayersPanel: boolean = false;
  public get showPlayersPanel(): boolean { return this._showPlayersPanel; }
  public set showPlayersPanel(v: boolean) { this._showPlayersPanel = v; this.onMenuStateChanged(); }

  // Interval IDs for holding mouse buttons (attack/build)
  private leftClickHoldInterval: any = null;
  private rightClickHoldInterval: any = null;
  // Interval IDs for touch button holding (mobile)
  private touchJumpHoldInterval: any = null;
  private touchAttackHoldInterval: any = null;
  private touchPlaceHoldInterval: any = null;
  private readonly HOLD_INTERVAL_MS = 500;

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
  private playerSnapshots: Map<number, Array<{ posX: number; posY: number; posZ: number; yaw: number; pitch: number; bodyYaw?: number; health: number; username?: string; weapon?: number; color?: string; helmet?: number; chest?: number; legs?: number; boots?: number; isAttacking?: boolean; isDefending?: boolean; face?: string; t: number }>> = new Map();
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
  private inventorySaveTimeout: ReturnType<typeof setTimeout> | undefined;
  private chunkPollInterval: ReturnType<typeof setInterval> | undefined;
  private pollingChunks = false;
  private chunkPollIndex = 0;
  private chatPollInterval: ReturnType<typeof setTimeout> | undefined;
  private fallStartY: number | null = null;
  private pendingChunkRebuilds: Set<string> = new Set();
  // Queue of chunk keys to generate (cx,cz) — processed one per frame to avoid stutter
  private pendingChunkGenerations: Array<[number, number]> = [];
  // Nearby light source cache
  private _lastLightScanX = Infinity;
  private _lastLightScanY = Infinity;
  private _lastLightScanZ = Infinity;
  private readonly LIGHT_SCAN_RADIUS = 10; // reduced radius for performance
  private _cachedPtLights: Array<{ x: number; y: number; z: number; radius: number }> = [];
  private _ptLightsDirty = true;
  private _lastHeldTorch = false;
  private readonly MAX_POINT_LIGHTS = 3; // fewer point lights reduces GPU/CPU work
  private _lastChunkX = Infinity;
  private _lastChunkZ = Infinity;
  private _lastFogIsDay: boolean | null = null;
  private _lastPhaseKey = '';
  // Precomputed shells for layered light scanning (chebyshev shells)
  private _lightScanShells: Array<Array<[number, number, number]>> = [];
  // Temporary fixed-size buffer for scanning results to avoid allocations
  private _tmpPtLights: Array<{ x: number; y: number; z: number; radius: number }> = [];
  // Render throttling: avoid running full render every RAF if not needed
  private _lastRenderAt = 0;
  private readonly RENDER_FPS_DESKTOP = 45;
  private readonly RENDER_FPS_MOBILE = 30;
  damagePopups: { text: string; id: number }[] = [];
  private damagePopupCounter = 0;  

  private PLAYER_POLL_FAST_MS = 250;
  private PLAYER_POLL_SLOW_MS = 2000;
  private CHUNK_POLL_SLOW_MS = 500;
  private CHUNK_POLL_FAST_MS = 250;
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
  private _showFaceCreator = false;
  showFacePicker = false;
  public get showFaceCreator(): boolean { return this._showFaceCreator; }
  public set showFaceCreator(v: boolean) { this._showFaceCreator = v; this.onMenuStateChanged(); }
  private _showRenameBonfirePrompt = false;
  public get showRenameBonfirePrompt(): boolean { return this._showRenameBonfirePrompt; }
  public set showRenameBonfirePrompt(v: boolean) { this._showRenameBonfirePrompt = v; this.onMenuStateChanged(); }
  isLoadingBonfires = false;
  private _showRenameChestPrompt = false;
  public get showRenameChestPrompt(): boolean { return this._showRenameChestPrompt; }
  public set showRenameChestPrompt(v: boolean) { this._showRenameChestPrompt = v; this.onMenuStateChanged(); }
  private _showDeleteBonfirePrompt = false;
  public get showDeleteBonfirePrompt(): boolean { return this._showDeleteBonfirePrompt; }
  public set showDeleteBonfirePrompt(v: boolean) { this._showDeleteBonfirePrompt = v; this.onMenuStateChanged(); } 

  renameBonfireTarget: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number } | null = null;
  renameChestTarget: { id: number; wx: number; wy: number; wz: number; nickname: string; items?: any[]; worldId: number } | null = null;
  deleteBonfireTarget: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number } | null = null;
  playerColor: string = '#cccccc';
  playerFace: string = 'default';
  facePickerTab: string = 'available';
  craftingMode: 'crafting' | 'recipes' = 'crafting';
  knownRecipeIds: Set<number> = new Set();
  userFaces: { id: number; name: string; emoji: string; gridData: string; paletteData: string; creatorUserId?: number }[] = [];
  // Face creator state
  creatorGrid: string[] = Array(64).fill('.');
  creatorPalette: { [key: string]: string } = { '1': '#000000', '.': '' };
  creatorName: string = '';
  creatorEmoji: string = '😊';
  creatorSelectedColor: string = '1';
  creatorEmojiError: string = '';
  newCreatorColor: string = '#ff0000'; 
  availableFaces: { id: string; label: string }[] = [
    { id: 'default', label: '😐' },
    { id: 'smile', label: '🙂' },
    { id: 'wink', label: '😉' },
    { id: 'sad', label: '😢' },
    { id: 'angry', label: '😠' },
    { id: 'cool', label: '😎' },
    { id: 'surprised', label: '😮' },
    { id: 'sick', label: '🤢' },
    { id: 'tongue', label: '👅' },
    { id: 'monocle', label: '🧐' },
    { id: 'glasses', label: '👓' },
    { id: 'bandana', label: '🧣' },
    { id: 'robot', label: '🤖' },
    { id: 'alien', label: '👽' },
    { id: 'cat', label: '🐱' },
    { id: 'dog', label: '🐶' },
    { id: 'skull', label: '💀' },
    { id: 'pirate', label: '🦜' },
    { id: 'moustache', label: '🫡' },
    { id: 'hero', label: '🦸' },
    { id: 'villain', label: '👿' },
    { id: 'bunny', label: '🐰' },
    { id: 'ghost', label: '👻' },
    { id: 'zombie', label: '🧟' },
    { id: 'vampire', label: '🧛' },
    { id: 'ninja', label: '🥷' },
    { id: 'dragon', label: '🐲' },
    { id: 'demon', label: '👺' },
    { id: 'angel', label: '👼' },
    { id: 'spark', label: '✨' },
    { id: 'love', label: '💕' },
    { id: 'confuse', label: '😵' },
    { id: 'meh', label: '😑' },
    { id: 'shy', label: '😳' },
    { id: 'winkTongue', label: '😜' },
    { id: 'coolSunglasses', label: '🕶️' },
    { id: 'cyber', label: '🤖' },
    { id: 'clown', label: '🤡' },
    { id: 'mask', label: '😷' },
    { id: 'samurai', label: '⚔️' },
    { id: 'wizard', label: '🧙' },
    { id: 'pirateEye', label: '🏴‍☠️' },
    { id: 'vampireTeeth', label: '🧛' },
    { id: 'werewolf', label: '🐺' },
    { id: 'alien2', label: '👾' },
    { id: 'robot2', label: '🔧' },
    { id: 'creeper', label: '🌿' },
    { id: 'slime', label: '🟢' },
    { id: 'ghost2', label: '👻' },
    { id: 'pumpkin', label: '🎃' },
    { id: 'snowman', label: '⛄' },
    { id: 'heartEyes', label: '😍' },
    { id: 'crying', label: '😭' },
    { id: 'sleeping', label: '😴' },
    { id: 'dizzy', label: '😵‍💫' },
    { id: 'rich', label: '🤑' },
    { id: 'brain', label: '🧠' },
    { id: 'alien3', label: '👁️' },
    { id: 'fire', label: '🔥' },
    { id: 'flower', label: '🌸' },
    { id: 'leaf', label: '🍃' },
    { id: 'star', label: '⭐' }
  ];
  // Respawn prompt shown when local player reaches 0 health
  private _showRespawnPrompt = false;
  public get showRespawnPrompt(): boolean { return this._showRespawnPrompt; }
  public set showRespawnPrompt(v: boolean) { this._showRespawnPrompt = v; this.onMenuStateChanged(); }
  private _showRespawnConfirmPrompt = false;
  public get showRespawnConfirmPrompt(): boolean { return this._showRespawnConfirmPrompt; }
  public set showRespawnConfirmPrompt(v: boolean) { this._showRespawnConfirmPrompt = v; this.onMenuStateChanged(); }
  // Respawn in-progress flag (disables respawn button while awaiting server)
  isRespawning = false;
  // Teleport in-progress flag (disables teleport buttons while teleporting)
  isTeleporting = false;
  // Party loading state (when accepting invite and fetching new party data)
  isLoadingParty = false;
  partyErrorMessage = '';
  // Worlds panel loading states
  isLoadingWorlds = false;
  isSwitchingWorld = false;
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
  private pendingPlaceItems: { chunkX: number; chunkZ: number; localX: number; localY: number; localZ: number; blockId: number, waterLevel?: number; fluidIsSource?: boolean, previousBlockId?: number, aboveBlockId?: number, belowBlockId?: number, rightBlockId?: number, leftBlockId?: number }[] = [];
  private placeFlushInterval: ReturnType<typeof setInterval> | undefined;
  private readonly PLACE_FLUSH_MS = 500; // flush up to 2 times per second
  // Track locally modified blocks to prevent server from overwriting them prematurely.
  // Key: "cx,cz,lx,ly,lz"  Value: { blockId: our local value, expiresAt: timestamp after which server wins }
  // Server updates for a position are suppressed until expiresAt, then the server is trusted.
  private localBlockChanges: Map<string, { blockId: number; expiresAt: number }> = new Map();
  private readonly LOCAL_BLOCK_GRACE_MS = 4000; // suppress server for 4s after a local change
  // Prevent re-entrant toggles from duplicate events
  private togglingDoorWindow: boolean = false;
  // Mobile attack cooldown to prevent double-tap
  private lastAttackTime = 0;
  private readonly ATTACK_COOLDOWN_MS = 200;

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
  private boundMouseUp = (e: MouseEvent): void => {
    onMouseUp(this, e);
  };
  private boundContextMenu = (e: Event): void => e.preventDefault();
  private boundPointerLockChange = (): void => onPointerLockChange(this);
  private boundTouchStart = (e: TouchEvent): void => onTouchStart(this, e);
  private boundTouchMove = (e: TouchEvent): void => onTouchMove(this, e);
  private boundTouchEnd = (e: TouchEvent): void => onTouchEnd(this, e);

  constructor(private digcraftService: DigcraftService, private userService: UserService, private cdr: ChangeDetectorRef) {
    super();
    this.inventory = new Array(MAX_INVENTORY_LENGTH).fill(null).map(() => ({ itemId: 0, quantity: 0 }));
  }

  ngOnInit(): void {
    if (!this.parentRef?.user?.id) {
      this.isShowingLoginPanel = true;
      //this.parentRef?.showOverlay();
    } else {
      this.parentRef.preventShowSecurityPopup = true;
    }
  }

  // Toggle third-person orbit/look-back camera. When enabled, the camera orbits
  // around the player's eye position and the local player model is rendered.
  toggleThirdPerson(): void {
    this.thirdPerson = !this.thirdPerson;
    if (this.thirdPerson) {
      // Initialize orbit angles to look back at the player by default
      this.thirdPersonYaw = this.yaw + Math.PI;
      this.thirdPersonPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    } else {
      // Sync player's view to the orbit camera when exiting
      this.yaw = this.thirdPersonYaw;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.thirdPersonPitch));
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
  async joinWorld(forcedWorldId?: number): Promise<void> {
    const userId = this.parentRef?.user?.id;
    if (!userId) { this.loading = false; this._loadingMessage = ''; return; }
    this._loadingMessage = 'Getting Last World ID...';
    let tmpWorldId = forcedWorldId;
    if (!tmpWorldId) {
      const wres = await this.digcraftService.getLastWorldId(userId);
      if (wres && wres.id) {
        tmpWorldId = wres.id;
      }
    }
    this.worldId = tmpWorldId ?? 1;
    this._loadingMessage = 'Joining world...';
    const res: DCJoinResponse | null = await this.digcraftService.joinWorld(userId, tmpWorldId ?? 1);
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
      //this.findSafeSpawnHeight();

      this.cdr.detectChanges();
      this._loadingMessage = 'Initializing game...';
      this.cdr.detectChanges();
      await this.initGame();
      this.initialLoad = false;
      this._loadingMessage = 'Fetching bonfires...';
      this.cdr.detectChanges();
      await this.fetchBonfires();
      
      return;
    }

    this.seed = res.world.seed;
    this.playerId = res.player.id;
    this.camX = res.player.posX;
    this.camY = res.player.posY;
    this.camZ = res.player.posZ;
    this.yaw = res.player.yaw;
    this.pitch = res.player.pitch;
    this._loadingMessage = 'Applying player state...';
    this.applyLocalHealth(res.player.health, true);
    this.hunger = res.player.hunger;
    // load player color if provided by server
    try { this.playerColor = (res.player as any).color ?? this.playerColor; } catch (e) { }
    // load player face if provided by server
    try { this.playerFace = (res.player as any).face ?? this.playerFace; } catch (e) { }
    // load level and exp if provided by server
    console.log('[onJoin] res.player:', res.player, 'exp:', (res.player as any).exp, 'level:', (res.player as any).level);
    try { this.level = (res.player as any).level ?? 1; } catch (e) { this.level = 1; }
    try { this.exp = (res.player as any).exp ?? 0; } catch (e) { this.exp = 0; }

    // Load inventory from server
    for (const slot of res.inventory) {
      if (slot.slot >= 0 && slot.slot < MAX_INVENTORY_LENGTH) {
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

      // Load left hand item (torch or shield)
      this.leftHand = (eq as any).leftHand ?? 0;

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

    this.cdr.detectChanges();
    this._loadingMessage = 'Initializing game...';
    this.cdr.detectChanges();
    await this.initGame();
    this.initialLoad = false;
    this._loadingMessage = 'Loading bonfires...';
    this.cdr.detectChanges();
    await this.fetchBonfires();
    this._loadingMessage = 'Loading inventory data...';
    this.cdr.detectChanges();
    await this.loadInventoryData();
    this._loadingMessage = '';
    this.cdr.detectChanges(); 
    this.setInvulnerabilitySeconds(60);
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

    const isSolid = (b: number) => b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LAVA
      && b !== BlockId.LEAVES && b !== BlockId.TALLGRASS && b !== BlockId.SHRUB
      && b !== BlockId.TREE && b !== BlockId.BONFIRE && b !== BlockId.CHEST
      && b !== BlockId.TORCH // TORCH
      && b !== BlockId.WINDOW_OPEN && b !== BlockId.DOOR_OPEN;

    for (let y = WORLD_HEIGHT - 1; y >= NETHER_TOP + 2; y--) {
      const blockHere = this.getWorldBlock(ix, y, iz);
      const blockAbove = this.getWorldBlock(ix, y + 1, iz);

      // Found lava at y+1 - treat as walkable surface like water
      if (blockAbove === BlockId.LAVA) {
        if (isSolid(this.getWorldBlock(ix, y + 2, iz))) continue;
        return y + 2 + 1.6;
      }

      if (!isSolid(blockHere)) continue;
      // Found solid block at y - need y+1 and y+2 to be clear (lava is non-solid, so allows walking)
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
    if (!this.collidesAt(x, y - 2, z, hw, playerH)) {
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

    this.renderer = new DigCraftRenderer(canvas, this.userFaces);
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
                if (!isNaN(vd) && vd >= 1 && vd <= MAX_VIEW_DISTANCE) {
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


    this._loadingMessage = 'Ensuring spawn location...';
    this.ensureFreeSpaceAt(this.camX, this.camY, this.camZ);


    // On mobile: skip synchronous mob spawn at startup — server will provide mobs via pollMobs
    // if (!mobile) {
    //   try { this.spawnInitialMobs(); } catch (e) { }
    // } 

    // Bind input
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('mouseup', this.boundMouseUp);
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

    this.gameLoop(this.lastTime);

    // Stagger poll loop starts on mobile to avoid simultaneous network requests at startup
    const pollDelay = this.onMobile() ? 1500 : 0;
    setTimeout(() => this.pollPlayers().catch(err => console.error('DigCraft: pollPlayers error', err)), 0);
    setTimeout(() => this.pollChats().catch(err => console.error('DigCraft: pollChats error', err)), pollDelay);
    setTimeout(() => this.pollMobs().catch(err => console.error('DigCraft: pollMobs error', err)), pollDelay * 2);
    // Poll server for chunk changes — slower on mobile to reduce network/rebuild pressure
    const chunkPollMs = this.onMobile() ? this.CHUNK_POLL_SLOW_MS : this.CHUNK_POLL_FAST_MS;
    this.chunkPollInterval = setInterval(() => this.pollChunkChanges().catch(err => console.error('DigCraft: pollChunkChanges error', err)), chunkPollMs);
  }

  private cleanup(): void {
    cancelAnimationFrame(this.animFrameId);
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    document.removeEventListener('mousedown', this.boundMouseDown);
    document.removeEventListener('mouseup', this.boundMouseUp);
    document.removeEventListener('contextmenu', this.boundContextMenu);
    // remove document touch handlers
    document.removeEventListener('touchstart', this.boundTouchStart);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
    // remove pointer drag handlers
    document.removeEventListener('pointermove', this.boundSlotPointerMove as any);
    document.removeEventListener('pointerup', this.boundSlotPointerUp as any);
    // clear holding intervals
    if (this.leftClickHoldInterval) { clearInterval(this.leftClickHoldInterval); this.leftClickHoldInterval = null; }
    if (this.rightClickHoldInterval) { clearInterval(this.rightClickHoldInterval); this.rightClickHoldInterval = null; }
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
    try { this.chunks.clear(); this.pendingChunkRebuilds.clear(); this.pendingChunkGenerations = []; } catch (e) { }
    // Remove reference to disposed renderer
    try { (this as any).renderer = undefined; } catch (e) { }
    this.exitPointerLock();
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
            // Trust the server's Y — it handles ground alignment with a 16-block scan.
            // Only fall back to a surface scan if Y is completely missing.
            let py = (m.posY ?? m.PosY);
            if (py === undefined || py === null) {
              try {
                const gx = Math.floor(px), gz = Math.floor(pz);
                const cx = Math.floor(gx / CHUNK_SIZE), cz = Math.floor(gz / CHUNK_SIZE);
                const chunkKey = `${cx},${cz}`;
                if (!this.chunks.has(chunkKey)) {
                  try { this.chunks.set(chunkKey, generateChunk(this.seed, cx, cz, !this.onMobile())); } catch { }
                }
                if (this.chunks.has(chunkKey)) {
                  let gy = -1;
                  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
                    const b = this.getWorldBlock(gx, y, gz);
                    if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LEAVES
                        && b !== BlockId.TALLGRASS && b !== BlockId.SHRUB) { gy = y; break; }
                  }
                  py = gy >= 0 ? gy + 1 + 1.6 : 2 + 1.6;
                } else {
                  py = 2 + 1.6;
                }
              } catch { py = 2 + 1.6; }
            }
            // Detect mob damage for flash effect
            const lastHealthVal: number | undefined = this.mobLastHealth.get(m.id);
            const currentHealth = m.health ?? m.Health ?? 20;
            if (lastHealthVal && currentHealth < lastHealthVal) {
              this.mobDamageFlash.set(m.id, performance.now() + 200);
            }
            this.mobLastHealth.set(m.id, currentHealth);
            
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
          this.updateMobSnapshots(mapped);
          // ensure id counter avoids collisions
          this.mobIdCounter = Math.max(this.mobIdCounter, ...(this.mobs.map((mm: any) => mm.id || 0))) + 1;
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
  // Game Loop  
  // ═══════════════════════════════════════
  private gameLoop(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    const frameBudgetMs = this.onMobile() ? 12 : 8; // ms budget for chunk work per frame
    this.lastTime = time;
    this._frameCount++;

    this.updatePhysics(dt);
    // Mobile: mob AI every 3rd frame; desktop: every other frame
    const mobSkip = this.onMobile() ? 3 : 2;
    if ((this._frameCount % mobSkip) === 0) {
      this.updateMobs(dt * mobSkip);
    }
    this.updateRaycast();

    // Chunk work: time-budgeted so we never block the frame for too long
    const chunkWorkStart = performance.now();

    // One deferred chunk generation per frame — avoids stutter from bulk generateChunk calls
    if (this.pendingChunkGenerations.length > 0 && (performance.now() - chunkWorkStart) < frameBudgetMs) {
      const [cx, cz] = this.pendingChunkGenerations.shift()!;
      const key = `${cx},${cz}`;
      if (!this.chunks.has(key)) {
        const chunk = generateChunk(this.seed, cx, cz, !this.onMobile());
        this.chunks.set(key, chunk);
        this.fetchChunkChanges(cx, cz, chunk).catch(() => {});
        this.pendingChunkRebuilds.add(key);
      }
    }

    // One chunk rebuild per frame max — skip if we're already over budget
    if (this.pendingChunkRebuilds.size > 0 && (performance.now() - chunkWorkStart) < frameBudgetMs) {
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

    // Throttle rendering to a target FPS to reduce CPU/GPU load on slower machines.
    const minRenderMs = this.onMobile() ? (1000 / this.RENDER_FPS_MOBILE) : (1000 / this.RENDER_FPS_DESKTOP);
    if ((time - this._lastRenderAt) >= minRenderMs) {
      this.renderFrame();
      this._lastRenderAt = time;
    }
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }
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
      const caveType = ['Troglodite'];
      const waterTypes = ['Salmon', 'Cod'];
      const deepSeaType = ['GlowSquid'];
      const grassType = ['Donkey'];
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

        // Detect if this is a cave (enclosed space with air, like inside a mountain)
        // Check for solid blocks above, to the sides, and open air below
        const isInCave = this.isCavePosition(wx, wz, spawnY);
        const isNether = topY < NETHER_TOP;
        // Only spawn Troglodites in caves (not on surface/grass, not in nether, not during day)
        if (isInCave && !isNether && !isDay) {
          // Spawn Troglodite in caves at night
          const t = 'Troglodite';
          const mobColors: Record<string, string> = {
            Troglodite: '#708090', // Grayish alien color
          };
          const color = mobColors[t] ?? '#708090';
          const mobHealth: Record<string, number> = {
            Troglodite: 15,
          };
          const health = mobHealth[t] ?? 15;

          const mob: any = {
            id: this.mobIdCounter++,
            type: t,
            posX: wx + 0.5,
            posY: spawnY + 1.6,
            posZ: wz + 0.5,
            yaw: rng() * Math.PI * 2,
            pitch: 0,
            health,
            color,
            lastAttack: 0,
            hostile: false, // peaceful
            vx: 0,
            vz: 0,
            wanderPhase: rng() * Math.PI * 2,
            wanderFreq: 0.5 + rng() * 0.5,
          };
          this.mobs.push(mob);
          // Also spawn Slime in caves at night (neutral, not hostile)
          if (rng() > 0.6) {
            const sl = 'Slime';
            const slimeMob: any = {
              id: this.mobIdCounter++,
              type: sl,
              posX: wx + 0.5 + (rng() - 0.5) * 2,
              posY: spawnY + 1.6,
              posZ: wz + 0.5 + (rng() - 0.5) * 2,
              yaw: rng() * Math.PI * 2,
              pitch: 0,
              health: 20,
              color: '#57FF57',
              lastAttack: 0,
              hostile: false, // neutral
              vx: 0,
              vz: 0,
              wanderPhase: rng() * Math.PI * 2,
              wanderFreq: 0.5 + rng() * 0.5,
            };
            this.mobs.push(slimeMob);
          }
          continue;
        }

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
        const isDeepOceanBiome = biome === BiomeId.DEEP_OCEAN;
        const isPlainsBiome = biome === BiomeId.PLAINS || biome === BiomeId.SUNFLOWER_PLAINS || biome === BiomeId.MEADOW || biome === BiomeId.CHERRY_GROVE;

        let t: string;
        const isLavaNearby = this.isLavaNearby(wx, wz);
        const isShallowWater = topY >= SEA_LEVEL - 2 && topY <= SEA_LEVEL && this.getWorldBlock(wx, topY, wz) === BlockId.WATER;
        const isCave = this.isCaveBlock(wx, topY, wz);
        if (isNetherY) {
          // Enderman spawns in nether at night
          if (!isDay && rng() > 0.5) {
            t = 'Enderman';
          } else if (isLavaNearby) {
            t = 'Strider';
          } else {
            const netherTypes = ['Blaze', 'WitherSkeleton', 'Ghast', 'Strider', 'Hoglin'];
            t = netherTypes[Math.floor(rng() * netherTypes.length)];
          }
        } else if (!isDay) {
          // Night spawning - Enderman in overworld
          if (rng() > 0.6) {
            t = 'Enderman';
          } else if (isCave) {
            t = rng() > 0.5 ? 'CaveSpider' : 'Spider';
          } else {
            t = 'Spider';
          }
        } else if (isDay) {
          const r2 = rng();
          if (isHotBiome) t = r2 > 0.5 ? 'Camel' : 'Armadillo';
          else if (isMountainBiome || isHighAlt) t = r2 > 0.5 ? 'Goat' : 'Llama';
          else if (isJungleBiome) t = r2 > 0.5 ? 'Parrot' : 'Ocelot';
          else if (isSnowyBiome) t = r2 > 0.5 ? 'PolarBear' : 'Fox';
          else if (isForestBiome) t = r2 > 0.5 ? 'Wolf' : 'Deer';
          else if (isSwampBiome) t = r2 > 0.5 ? 'Frog' : 'Axolotl';
          else if (isDeepOceanBiome && topY < SEA_LEVEL) {
            t = 'GlowSquid';
          }
          else if (isOceanBiome && topY < SEA_LEVEL) {
            t = r2 > 0.5 ? 'Salmon' : 'Cod';
          }
          else if (isPlainsBiome) {
            // Donkey spawns in plains alongside horse/rabbit
            if (r2 > 0.6) t = 'Donkey';
            else if (r2 > 0.3) t = 'Horse';
            else t = 'Rabbit';
          }
          else t = dayTypes[Math.floor(rng() * dayTypes.length)];
        } else {
          t = nightTypes[Math.floor(rng() * nightTypes.length)];
        }

        const hostile = t === 'Zombie' || t === 'Skeleton' || t === 'WitherSkeleton' || t === 'Blaze' || t === 'Ghast' || t === 'Hoglin' || t === 'Wither';
        const mobColors: Record<string, string> = {
          Zombie: '#339966', Skeleton: '#CFCFCF', WitherSkeleton: '#222222',
          Blaze: '#FFAA00', Ghast: '#F0F0F0', Strider: '#8B4513', Hoglin: '#8B4513',
          Pig: '#FF9EA6', Cow: '#CFCFEE', Sheep: '#BFEFBF',
          Camel: '#C8A060', Goat: '#D0C8B0', Armadillo: '#A08060', Llama: '#D4C090',
          Parrot: '#22CC44', Ocelot: '#D4A820', PolarBear: '#F0F0F0', Fox: '#D06020',
          Wolf: '#888888', Deer: '#C08040', Frog: '#448844', Axolotl: '#FF88AA',
          Turtle: '#44AA44', Dolphin: '#6688CC', Horse: '#A66B2D', Rabbit: '#C8A070',
          Salmon: '#E8A088', Cod: '#B8C8D8', Donkey: '#8B6B4B', GlowSquid: '#88FFAA',
          Tadpole: '#444444', Bee: '#FFD700', CaveSpider: '#1A1A2E', Enderman: '#0A0A0A',
          Panda: '#F5F5F5', WoodsWolf: '#8B6914', SavannahWolf: '#C4A35A', MountainWolf: '#D0D0D8',
          Slime: '#57FF57', Wither: '#1A1A3A',
        };
        const color = mobColors[t] ?? '#FFFFFF';
        const mobHealth: Record<string, number> = {
          Zombie: 20, Skeleton: 20, WitherSkeleton: 35, Blaze: 20, Ghast: 10, Strider: 20, Hoglin: 40,
          Pig: 10, Cow: 10, Sheep: 10, Camel: 32, Goat: 10, Armadillo: 12, Llama: 15,
          Parrot: 6, Ocelot: 10, PolarBear: 30, Fox: 10, Wolf: 8, Deer: 10,
          Frog: 10, Axolotl: 14, Turtle: 30, Dolphin: 10, Horse: 15, Rabbit: 3,
          Salmon: 6, Cod: 6, Donkey: 25, GlowSquid: 8,
          Tadpole: 4, Bee: 8, CaveSpider: 12, Enderman: 40, Panda: 20,
          WoodsWolf: 8, SavannahWolf: 8, MountainWolf: 8,
          Slime: 20, Wither: 300,
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

      try { this.cdr.detectChanges(); } catch (e) { /* noop */ }
      //console.info(`DigCraft: spawnInitialMobs spawned ${this.mobs.length} mobs (deterministic)`);
    } catch (err) {
      console.error('DigCraft: spawnInitialMobs error', err);
    }
  }

  // ═══════════════════════════════════════
  // Bucket interactions — fluid dynamics handled by both client (visual) and server (persistent)
  // ═══════════════════════════════════════
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

  private collectLavaWithBucket(wx: number, wy: number, wz: number): boolean {
    const block = this.getWorldBlock(wx, wy, wz);
    if (block !== BlockId.LAVA) return false;
    const slot = this.inventory[this.selectedSlot];
    if (!slot || slot.quantity <= 0 || slot.itemId !== ItemId.EMPTY_BUCKET) return false;
    slot.itemId = ItemId.LAVA_BUCKET;
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
      this.setWorldBlock(wx, wy, wz, BlockId.WATER, true, true, WATER_SOURCE_STRENGTH, true, true);
      slot.itemId = ItemId.EMPTY_BUCKET;
      slot.quantity = 1;
      this.scheduleInventorySave();
      return true;
    }
    return false;
  }

  private placeLavaFromBucket(wx: number, wy: number, wz: number): boolean {
    const slot = this.inventory[this.selectedSlot];
    if (!slot || slot.itemId !== ItemId.LAVA_BUCKET || slot.quantity < 1) return false;
    const targetBlock = this.getWorldBlock(wx, wy, wz);
    if (targetBlock === BlockId.AIR) {
      this.setWorldBlock(wx, wy, wz, BlockId.LAVA, true, true, LAVA_SOURCE_STRENGTH, true, true);
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

  getWorldFluidSource(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return false;
    return chunk.isFluidSource(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  private getLocalFluidFlow(wx: number, wy: number, wz: number): { x: number; z: number } {
    const centerBlock = this.getWorldBlock(wx, wy, wz);
    if (!isFluidBlock(centerBlock)) return { x: 0, z: 0 };
    const centerLevel = this.getWorldWaterLevel(wx, wy, wz);
    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];
    let fx = 0, fz = 0;
    for (const dir of dirs) {
      const nbBlock = this.getWorldBlock(wx + dir.dx, wy, wz + dir.dz);
      const nbLevel = nbBlock === centerBlock ? this.getWorldWaterLevel(wx + dir.dx, wy, wz + dir.dz) : 0;
      const delta = centerLevel - nbLevel;
      fx += dir.dx * delta;
      fz += dir.dz * delta;
      if (!isFluidBlock(this.getWorldBlock(wx + dir.dx, wy - 1, wz + dir.dz))) continue;
    }
    const mag = Math.sqrt(fx * fx + fz * fz);
    if (mag <= 0.001) return { x: 0, z: 0 };
    return { x: fx / mag, z: fz / mag };
  }

  /** Feet or body in water or lava — used for fall damage and swimming */
  public isPlayerInWater(): boolean {
    const px = Math.floor(this.camX);
    const pz = Math.floor(this.camZ);
    const eyeH = 1.6;
    const feetY = this.camY - eyeH;
    const samples = [feetY + 0.1, feetY + 0.9, this.camY - 0.1];
    for (const y of samples) {
      const b = this.getWorldBlock(px, Math.floor(y), pz);
      if (b === BlockId.WATER || b === BlockId.LAVA) return true;
    }
    return false;
  }

  public isPlayerInLava(): boolean {
    const px = Math.floor(this.camX);
    const pz = Math.floor(this.camZ);
    const eyeH = 1.6;
    const feetY = this.camY - eyeH;
    const samples = [feetY + 0.1, feetY + 0.9, this.camY - 0.1];
    for (const y of samples) {
      const b = this.getWorldBlock(px, Math.floor(y), pz);
      if (b === BlockId.LAVA) return true;
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

        // if (dist <= this.MOB_ATTACK_RANGE) {
        //   if (!mob.lastAttack || (now - mob.lastAttack) >= this.MOB_ATTACK_COOLDOWN_MS) {
        //     mob.lastAttack = now;
        //     const dmg = attackFor(mob.type);
        //     if (best.userId === localId && dmg > 0) {
        //       const uid = localId;
        //       this.digcraftService.mobAttack(uid, this.worldId, mob.type, dmg)
        //         .then(res => { if (res?.ok && typeof res.health === 'number') this.applyLocalHealth(res.health, false, res.damage); })
        //         .catch(() => { });
        //     }
        //   }
        // }
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

    // Compute forward/right vectors from camera yaw for world-space movement
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fx = -sinY; // forward.x
    const fz = -cosY; // forward.z
    const rx = cosY;  // right.x
    const rz = -sinY; // right.z

    // Update body rotation: smoothly track the direction of movement.
    // Use a fixed lerp factor rather than a snapFactor that scales with speed,
    // which was causing rubber-band oscillation at low speeds.
    if (len > 0.01) {
      const worldMoveDirX = fx * mz + rx * mx;
      const worldMoveDirZ = fz * mz + rz * mx;
      const targetBodyYaw = Math.atan2(-worldMoveDirX, -worldMoveDirZ);

      // Shortest-path angular difference
      let diff = targetBodyYaw - this.bodyYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // Constant lerp: body catches up in ~4 frames at 60fps (≈67 ms)
      const lerpRate = Math.min(1.0, dt * 15);
      this.bodyYaw += diff * lerpRate;
    }
    // When stationary, body yaw stays where it was — no snap-back.

    // Camera-relative using forward/right vectors (keeps movement aligned with raycast)
    let dx = (fx * mz + rx * mx) * speed * dt;
    let dz = (fz * mz + rz * mx) * speed * dt;

    if (this.isInWater) {
      const flow = this.getLocalFluidFlow(Math.floor(this.camX), Math.floor(this.camY - 0.9), Math.floor(this.camZ));
      dx += flow.x * dt * 1.15;
      dz += flow.z * dt * 1.15;
    }

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
        // Ensure player isn't stuck inside block after landing - check surrounding area for valid position
        if (this.collidesAt(this.camX, this.camY - eyeH, this.camZ, hw, playerH)) {
          // Try pushing up or to sides to find valid position
          for (let offset = 0; offset <= 2; offset++) {
            const testY = this.camY + offset;
            if (!this.collidesAt(this.camX, testY - eyeH, this.camZ, hw, playerH)) {
              this.camY = testY;
              break;
            }
            for (const ox of [-0.5, 0.5]) {
              if (!this.collidesAt(this.camX + ox, testY - eyeH, this.camZ, hw, playerH)) { this.camX += ox; this.camY = testY; break; }
              if (!this.collidesAt(this.camX, testY - eyeH, this.camZ + ox, hw, playerH)) { this.camZ += ox; this.camY = testY; break; }
            }
          }
        }
        // landing: if we recorded a fall start, compute fall distance and request server damage
        if (!this.onGround && this.fallStartY !== null) {
          const fallDistance = this.fallStartY - this.camY;
          // reset start
          this.fallStartY = null;
          // Check if player landed in water or lava - no fall damage
          const inWater = this.isPlayerInWater();
          const inLava = this.isPlayerInLava();
          if (fallDistance > 0.5 && !inWater && !inLava) {
            // call server non-blocking
            const uid = this.parentRef?.user?.id ?? 0;
            if (uid > 0) {
              if (fallDistance > 0.5 && !this.isInvulnerable) {
                this.digcraftService.applyFallDamage(uid, this.worldId, fallDistance, this.camX, this.camY, this.camZ, inWater)
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
      // treat open windows/doors and leaves/water/air/lava as non-solid
      if (b !== BlockId.AIR
        && b !== BlockId.WATER
        && b !== BlockId.LAVA
        && b !== BlockId.LEAVES
        && b !== BlockId.WINDOW_OPEN
        && b !== BlockId.DOOR_OPEN
        && b !== BlockId.SHRUB
        && b !== BlockId.TREE
        && b !== BlockId.TALLGRASS
        && b !== BlockId.BONFIRE
        && b !== BlockId.TORCH
        && b !== BlockId.CAULDRON
        && b !== BlockId.CAULDRON_LAVA)
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
    this.lavaRayTarget = null;
    //this.targetName = null;

    for (let i = 0; i < maxDist * 3; i++) {
      const block = this.getWorldBlock(bx, by, bz);
      if (block === BlockId.WATER && !this.waterRayTarget) {
        this.waterRayTarget = { wx: bx, wy: by, wz: bz };
      }
      if (block === BlockId.LAVA && !this.lavaRayTarget) {
        this.lavaRayTarget = { wx: bx, wy: by, wz: bz };
      }
      if (block === BlockId.BONFIRE || block === BlockId.TALLGRASS || block === BlockId.CHEST) {
        this.lastHitNonSolid = { wx: bx, wy: by, wz: bz, id: block };
      }
      if (block !== BlockId.AIR && block !== BlockId.WATER && block !== BlockId.TALLGRASS) {
        this.targetBlock = { wx: bx, wy: by, wz: bz, id: block };
        this.placementBlock = { wx: prevX, wy: prevY, wz: prevZ };
        // If this coordinate was recorded as a placed watch, prefer the Watch label
        const watchKey = `${bx},${by},${bz}`;
        if (this.watchBlocks.has(watchKey)) {
          this.changeTargetName(ITEM_NAMES[BlockId.WATCH] ?? 'Watch', 0);
        } else {
          this.changeTargetName(ITEM_NAMES[block] ?? `Block ${block}`, 0);
        }
        return;
      } else {
        this.changeTargetName(null, 0);
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

    // Knockback animation
    const now = performance.now();
    for (const p of basePlayers) {
      const kb = this.playerKnockback.get(p.userId);
      if (kb) {
        const elapsed = now - kb.startTime;
        if (elapsed < 200) {
          const easeOut = 1 - Math.pow(1 - elapsed / 200, 3);
          p.posX += kb.vx * (1 - easeOut);
          p.posZ += kb.vz * (1 - easeOut);
        } else {
          this.playerKnockback.delete(p.userId);
        }
      }
    }

    // Smoothed mobs (server-authoritative)
    if (this.serverAuthoritativeMobs) this.computeSmoothedMobs();
    const mobSource = (this.serverAuthoritativeMobs && this.smoothedMobs?.length) ? this.smoothedMobs : this.mobs;
    const mobPlayers = (mobSource || [])
      .filter(m => !m.dead)
      .map(m => ({ userId: -(1000 + (m.id || 0)), posX: m.posX, posY: m.posY, posZ: m.posZ, yaw: m.yaw || 0, pitch: 0, health: m.health || 20, username: (m as any).type || 'Mob', color: '#ffffff', maxHealth: (m as any).maxHealth || 20 } as DCPlayer));
    const renderPlayers = basePlayers.concat(mobPlayers);

    // ── Progressive day/night/dusk/dawn cycle ──
    // Each 10-min segment = day or night. First+last 2 min = dusk/dawn transition.
    try {
      const segmentMs = 10 * 60 * 1000;
      const transitionMs = 2 * 60 * 1000; // 2 min dusk/dawn
      const nowMs = Date.now();
      const segIdx = Math.floor(nowMs / segmentMs);
      const isDaySegment = (segIdx % 2) === 0;
      const posInSegment = nowMs % segmentMs; // 0..segmentMs

      // t=0 at segment start, t=1 at segment end
      // dawnT: 0→1 during first transitionMs (dawn/dusk-in)
      // duskT: 0→1 during last transitionMs (dusk/dawn-out)
      const dawnT = Math.min(1, posInSegment / transitionMs);
      const duskT = Math.min(1, Math.max(0, (posInSegment - (segmentMs - transitionMs)) / transitionMs));

      // Blend factor: 0=full night colours, 1=full day colours
      // During day segment: dawn fades in (0→1), dusk fades out (1→0)
      // During night segment: opposite
      let dayBlend: number;
      if (isDaySegment) {
        dayBlend = dawnT * (1 - duskT); // 0→1 at start, 1→0 at end
      } else {
        dayBlend = (1 - dawnT) * duskT; // stays 0 except... actually night is just 0
        // Simpler: night segment = 0 blend, day segment = blend based on position
        dayBlend = 0;
      }
      if (isDaySegment) {
        // Ease in/out: smooth the transition
        const eased = (t: number) => t * t * (3 - 2 * t);
        dayBlend = eased(dawnT) * (1 - eased(duskT));
      }

      // Colour keyframes
      // Night:  fog=#051026 (dark blue),  ambient=0.15
      // Dusk/Dawn: fog=#e8703a (orange),  ambient=0.55, tint warm
      // Day:    fog=#87ceeb (sky blue),   ambient=1.0
      const nightFog  = [0.020, 0.063, 0.149];
      const dawnFog   = [0.91,  0.44,  0.23];  // warm orange
      const dayFog    = [0.53,  0.81,  0.92];

      let fogR: number, fogG: number, fogB: number, ambient: number;

      if (isDaySegment) { 
        if (dawnT < 1 && duskT === 0) {
          // Dawn transition
          if (dawnT < 0.5) {
            // night → orange
            const t2 = dawnT * 2;
            fogR = nightFog[0] + (dawnFog[0] - nightFog[0]) * t2;
            fogG = nightFog[1] + (dawnFog[1] - nightFog[1]) * t2;
            fogB = nightFog[2] + (dawnFog[2] - nightFog[2]) * t2;
            ambient = 0.15 + (0.55 - 0.15) * t2;
          } else {
            // orange → day
            const t2 = (dawnT - 0.5) * 2;
            fogR = dawnFog[0] + (dayFog[0] - dawnFog[0]) * t2;
            fogG = dawnFog[1] + (dayFog[1] - dawnFog[1]) * t2;
            fogB = dawnFog[2] + (dayFog[2] - dawnFog[2]) * t2;
            ambient = 0.55 + (1.0 - 0.55) * t2;
          }
        } else if (duskT > 0) {
          // Dusk transition
          if (duskT < 0.5) {
            // day → orange
            const t2 = duskT * 2;
            fogR = dayFog[0] + (dawnFog[0] - dayFog[0]) * t2;
            fogG = dayFog[1] + (dawnFog[1] - dayFog[1]) * t2;
            fogB = dayFog[2] + (dawnFog[2] - dayFog[2]) * t2;
            ambient = 1.0 + (0.55 - 1.0) * t2;
          } else {
            // orange → night
            const t2 = (duskT - 0.5) * 2;
            fogR = dawnFog[0] + (nightFog[0] - dawnFog[0]) * t2;
            fogG = dawnFog[1] + (nightFog[1] - dawnFog[1]) * t2;
            fogB = dawnFog[2] + (nightFog[2] - dawnFog[2]) * t2;
            ambient = 0.55 + (0.15 - 0.55) * t2;
          }
        } else {
          // Full day
          fogR = dayFog[0]; fogG = dayFog[1]; fogB = dayFog[2]; ambient = 1.0;
        }
      } else {
        // Full night
        fogR = nightFog[0]; fogG = nightFog[1]; fogB = nightFog[2]; ambient = 0.15;
      }

      // Only update when values change meaningfully (every ~3s is fine)
      const newPhaseKey = `${Math.round(fogR * 100)},${Math.round(fogG * 100)},${Math.round(ambient * 100)}`;
      if (newPhaseKey !== this._lastPhaseKey) {
        this._lastPhaseKey = newPhaseKey;
        this._lastFogIsDay = isDaySegment;
        if (this.renderer) {
          this.renderer.setFogColor(fogR, fogG, fogB);
          this.renderer.setAmbient(ambient);
        }
      }
    } catch (e) { }

    // Damage flash timers
    const flashNow = now;
    for (const uid of this.playerDamageFlash.keys()) {
      if (this.playerDamageFlash.get(uid)! < flashNow) this.playerDamageFlash.delete(uid);
    }
    for (const id of this.mobDamageFlash.keys()) {
      if (this.mobDamageFlash.get(id)! < flashNow) this.mobDamageFlash.delete(id);
    }
    for (const p of renderPlayers) {
      const flashEnd = p.userId < 0 ? this.mobDamageFlash.get(p.userId + 1000) : this.playerDamageFlash.get(p.userId);
      (p as any).isFlashing = flashEnd !== undefined && flashEnd > flashNow;
    }

    // Crumbling + arrows (skip if empty)
    if (this.crumblingBlocks.length > 0) this.updateCrumblingBlocks();
    if (this.arrows.length > 0) this.updateArrows();

    // ── Nearby light sources: point lights for placed torches/lava/bonfires ──
    {
      const px = Math.floor(this.camX), py = Math.floor(this.camY), pz = Math.floor(this.camZ);
      const heldInRight = this.equippedWeapon === BlockId.TORCH || this.equippedWeapon === ItemId.TORCH;
      const heldInLeft = this.leftHand === ItemId.TORCH || this.leftHand === BlockId.TORCH;
      const heldInSlot = (this.inventory[this.selectedSlot]?.itemId === BlockId.TORCH || this.inventory[this.selectedSlot]?.itemId === ItemId.TORCH);
      const heldTorch = heldInRight || heldInLeft || heldInSlot;
      // Always push held-torch uniform — it drives the personal torch light on both desktop and mobile
      this._lastHeldTorch = heldTorch;
      const _rend = (this.renderer as any);
      if (_rend && _rend.gl && typeof _rend.uHeldTorchLight !== 'undefined') {
        _rend.gl.uniform1f(_rend.uHeldTorchLight, heldTorch ? 0.9 : 0.0);
      }

      // Rescan only when player moves >2 blocks in any axis, or dirty flag is set by setWorldBlock
      // Require slightly larger movement before re-scanning light sources to reduce work
      const movedFar = Math.abs(px - this._lastLightScanX) > 3
        || Math.abs(py - this._lastLightScanY) > 3
        || Math.abs(pz - this._lastLightScanZ) > 3;

      if (movedFar || this._ptLightsDirty) {
        this._lastLightScanX = px; this._lastLightScanY = py; this._lastLightScanZ = pz;
        // Layered shell scan (chebyshev shells) — finds nearby lights earlier and avoids scanning entire cube
        this._ensureLightScanState();
        let found = 0;
        const R = this.LIGHT_SCAN_RADIUS;
        for (let r = 0; r <= R && found < this.MAX_POINT_LIGHTS; r++) {
          const shell = this._lightScanShells[r];
          for (let si = 0; si < shell.length && found < this.MAX_POINT_LIGHTS; si++) {
            const off = shell[si];
            const wx = px + off[0], wy = py + off[1], wz = pz + off[2];
            const bid = this.getWorldBlock(wx, wy, wz);
            let radius = 0;
            if (bid === BlockId.LAVA || bid === BlockId.GLOWSTONE) radius = (this.LIGHT_SCAN_RADIUS - 2);
            else if (bid === BlockId.TORCH || bid === BlockId.BONFIRE) radius = (this.LIGHT_SCAN_RADIUS - 4);
            if (radius > 0) {
              const t = this._tmpPtLights[found];
              t.x = wx + 0.5; t.y = wy + 0.5; t.z = wz + 0.5; t.radius = radius;
              found++;
            }
          }
        }
        // Only mark uniforms dirty if the light list actually changed
        if (!this._lightListEquals(this._tmpPtLights, found, this._cachedPtLights)) {
          this._copyTmpToCached(this._tmpPtLights, found);
          this._ptLightsDirty = true;
        } else {
          this._ptLightsDirty = false;
        }
      }

      // Push uniforms only when the light list changed (torch light handled unconditionally above)
      if (this._ptLightsDirty) {
        this._ptLightsDirty = false;
        this.renderer.setPointLights(this._cachedPtLights);
      }
    }

    // Compute render camera (supports third-person/orbit look)
    let renderCamX = this.camX, renderCamY = this.camY, renderCamZ = this.camZ;
    let renderYaw = this.yaw, renderPitch = this.pitch;
    let playersToRender = renderPlayers;
    if (this.thirdPerson) {
      const cy = Math.cos(this.thirdPersonYaw), sy = Math.sin(this.thirdPersonYaw);
      const cp = Math.cos(this.thirdPersonPitch), sp = Math.sin(this.thirdPersonPitch);
      const fx = sy * cp, fy = -sp, fz = cy * cp;
      renderCamX = this.camX - fx * this.thirdPersonDistance;
      renderCamY = this.camY - fy * this.thirdPersonDistance;
      renderCamZ = this.camZ - fz * this.thirdPersonDistance;
      renderYaw = this.thirdPersonYaw;
      renderPitch = this.thirdPersonPitch;
      // Add a fake player entry so the renderer draws the local player model
      const fakeId = -(1000000 + (userId || 0));
      const fakePlayer: any = {
        userId: fakeId,
        posX: this.camX,
        posY: this.camY - 1.6,
        posZ: this.camZ,
        yaw: this.bodyYaw ?? this.yaw,
        pitch: this.pitch,
        health: (this as any).health ?? 20,
        maxHealth: 20,
        username: this.parentRef?.user?.username ?? 'Player'
      };
      playersToRender = renderPlayers.concat([fakePlayer]);
    }

    // Main WebGL render (use computed camera)
    this.renderer.render(renderCamX, renderCamY, renderCamZ, renderYaw, renderPitch, playersToRender, userId);

    // Particles + arrows (skip if empty) - render in same camera space as above
    if (this.crumblingBlocks.length > 0 || this.arrows.length > 0) {
      const aspect = this.renderer.width / this.renderer.height;
      const proj = perspectiveMatrix(this.renderer.fovDeg * Math.PI / 180, aspect, 0.1, 200);
      const view = lookAtFPS(renderCamX, renderCamY, renderCamZ, renderYaw, renderPitch);
      const mvp = multiplyMat4(proj, view);
      if (this.crumblingBlocks.length > 0) this.renderer.renderCrumblingParticles(this.crumblingBlocks, mvp);
      if (this.arrows.length > 0) this.renderer.renderArrows(this.arrows, mvp);
    }

    // Celestial + star canvas — throttled to every 3rd frame (imperceptible at 60fps)
    if (!this._lastStarUpdate || now - this._lastStarUpdate >= 1000 / 60) {
      this._lastStarUpdate = now;
      this.updateCelestialAndStars(canvas);
    } 

    // Smoothed players — throttled to every 2nd frame
    if ((this._frameCount & 1) === 0) {
      this.computeSmoothedPlayers();
    }

    // Chat bubbles — throttled to every 4th frame
    if ((this._frameCount & 3) === 0) {
      this.updateChatPositions();
    }


    // Block/player/mob highlights — build MVP once and reuse
    if (this.targetBlock || this._lastFogIsDay !== null) {
      const aspect = (canvas?.width ?? 800) / (canvas?.height ?? 600);
      const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect, this.fovDeg);

      // Prioritize player/mob names over block names when targeting both
      const targetedPlayer = this.findAimedPlayer();
      if (targetedPlayer) {
        this.changeTargetName(targetedPlayer.username || `Player ${targetedPlayer.userId}`, 1);
        if (targetedPlayer.health < (targetedPlayer.maxHealth || 20)) {
          const dx = targetedPlayer.posX - this.camX, dy = targetedPlayer.posY - this.camY, dz = targetedPlayer.posZ - this.camZ;
          if (dx * dx + dy * dy + dz * dz <= this.getAttackRange() ** 2) {
            const ratio = (targetedPlayer.health ?? 20) / (targetedPlayer.maxHealth || 20);
            this.renderer.drawHighlight(targetedPlayer.posX, targetedPlayer.posY - 1.6, targetedPlayer.posZ, mvp, false, Math.floor(255 * (1 - ratio)), Math.floor(255 * ratio), 0);
          }
        } else if (this.targetBlock) {
          // Player at full health - show block highlight as fallback
          this.renderer.drawHighlight(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, mvp);
        }
      } else {
        const targetedMob = this.findAimedMob();
        if (targetedMob) {
          this.changeTargetName((targetedMob as any).type || 'Mob', 1);
          const mobMaxHealth = (targetedMob as any).maxHealth || 20;
          if ((targetedMob as any).health < mobMaxHealth) {
            const dx = targetedMob.posX - this.camX, dy = targetedMob.posY - this.camY, dz = targetedMob.posZ - this.camZ;
            if (dx * dx + dy * dy + dz * dz <= this.getAttackRange() ** 2) {
              const ratio = ((targetedMob as any).health || 20) / mobMaxHealth;
              this.renderer.drawHighlight(targetedMob.posX, targetedMob.posY - 1.6, targetedMob.posZ, mvp, false, Math.floor(255 * (1 - ratio)), Math.floor(255 * ratio), 0);
            }
          } else if (this.targetBlock) {
            // Mob at full health - show block highlight as fallback
            this.renderer.drawHighlight(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, mvp);
          }
        } else if (this.targetBlock) {
          // Only show block name when not targeting any player or mob
          // Reset priority so block name from updateRaycast can show
          this._targetNamePriority = 0;
          // targetName is already set in computeTarget()
          this.renderer.drawHighlight(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, mvp);
        } else {
          // No target - reset priority to allow next block name to show
          this._targetNamePriority = 0;
          this.changeTargetName(null);
        }
      }
    }

    // First-person weapon
    if (!this.thirdPerson && this.useGLFirstPersonWeapon && (this.equippedWeapon || this.isSwinging) && this.joined && !this.showInventory && !this.showCrafting) {
      try {
        this.renderer.renderFirstPersonWeapon(this.equippedWeapon, this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.isWeaponBobbing, this.isSwinging, this.swingStartTime);
      } catch (err) { }
    }

    // First-person left-hand item (torch/shield)
    if (!this.thirdPerson && this.useGLFirstPersonWeapon && this.leftHand && this.joined && !this.showInventory && !this.showCrafting) {
      try {
        (this.renderer as any).renderFirstPersonLeftItem(this.leftHand, this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.isWeaponBobbing, this.isDefending);
      } catch (err) { }
    }

    this.renderAvatarPreview();
  }

  private _lastStarUpdate = 0;

  /** Celestial body projection + star canvas — called every 3rd frame */
  private updateCelestialAndStars(canvas: HTMLCanvasElement | null): void {
    if (canvas) {
      const cw = canvas.clientWidth || canvas.width || 800;
      const ch = canvas.clientHeight || canvas.height || 600;
      const segmentMs = 10 * 60 * 1000;
      const nowMs = Date.now();
      // celestialIsDay = true during day AND dusk/dawn transitions
      const segIdx2 = Math.floor(nowMs / segmentMs);
      const isDaySeg = (segIdx2 % 2) === 0;
      const posInSeg = nowMs % segmentMs;
      const transMs = 2 * 60 * 1000;
      this.celestialIsDay = isDaySeg || posInSeg < transMs || posInSeg > segmentMs - transMs;
      const phaseProgress = (nowMs % segmentMs) / segmentMs;
      const orbitAngle = phaseProgress * Math.PI * 2;
      const arc = Math.sin(phaseProgress * Math.PI);
      const worldX = this.camX + Math.cos(orbitAngle) * 120;
      const worldZ = this.camZ + Math.sin(orbitAngle) * 120;
      const worldY = this.camY + 60 + arc * 40;
      const aspect = (cw / ch) || 1;
      const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
      const clip = this.transformVec4(mvp, [worldX, worldY, worldZ, 1]);
      if (clip[3] !== 0 && (clip[2] / clip[3]) <= 1) {
        this.celestialX = Math.round((clip[0]/clip[3] * 0.5 + 0.5) * cw);
        this.celestialY = Math.round((1 - (clip[1]/clip[3] * 0.5 + 0.5)) * ch);
      } else {
        this.celestialX = -9999; this.celestialY = -9999;
      }
      this.celestialSize = Math.round(this.celestialIsDay ? Math.min(140, ch * 0.12) : Math.min(96, ch * 0.09));
    }
    try { this.updateStarCanvas(); } catch (e) { }
  }
 
  /** Celestial body projection + star canvas — called every 3rd frame */

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
      face: this.playerFace,
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
      // Set user faces for avatar preview
      if (this.userFaces.length > 0) {
        (this.avatarPreviewRenderer as any).setUserFaces(this.userFaces);
      }
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
  get actionIcon(): string {
    return this.targetName == 'Bonfire' ? BLOCK_ICONS[BlockId.BONFIRE]
      : this.targetName == 'Chest' ? BLOCK_ICONS[BlockId.CHEST]
      : this.inventory[this.selectedInventoryIndex ?? 0].itemId === ItemId.TORCH ? ITEM_ICONS[ItemId.TORCH]
      : this.inventory[this.selectedInventoryIndex ?? 0].itemId === ItemId.WATER_BUCKET ? ITEM_ICONS[ItemId.WATER_BUCKET]
      : this.inventory[this.selectedInventoryIndex ?? 0].itemId === ItemId.LAVA_BUCKET ? ITEM_ICONS[ItemId.LAVA_BUCKET]
      : '🧱'
  }

  get displayedTargetName(): string {
    if (this.targetName === 'Watch') {
      return this.targetName + ' [' + this.getGameTimeString() + ']';
    }
    return this.targetName ?? '';
  }

  get activeCenterChatMessages() {
    const now = Date.now();
    return this.centerChatMessages.filter(m => m.expiresAt > now);
  }

  /** Deterministic seeded RNG (LCG) returning 0..1 — used for repeatable mob behavior. */
  private seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  } 

  // Compare a fixed temporary buffer (first `count` entries) against cached list
  private _lightListEquals(
    tmp: Array<{ x: number; y: number; z: number; radius: number }>,
    count: number,
    cached: Array<{ x: number; y: number; z: number; radius: number }>
  ): boolean {
    if (cached.length !== count) return false;
    for (let i = 0; i < count; i++) {
      const a = tmp[i];
      const b = cached[i];
      if (a.x !== b.x || a.y !== b.y || a.z !== b.z || a.radius !== b.radius) return false;
    }
    return true;
  }

  // Copy the first `count` entries from tmp buffer into the cached list reusing objects when possible
  private _copyTmpToCached(tmp: Array<{ x: number; y: number; z: number; radius: number }>, count: number): void {
    // Resize cached to `count` and copy values without allocating new objects when possible
    while (this._cachedPtLights.length > count) this._cachedPtLights.pop();
    for (let i = 0; i < count; i++) {
      const t = tmp[i];
      if (i < this._cachedPtLights.length) {
        const c = this._cachedPtLights[i];
        c.x = t.x; c.y = t.y; c.z = t.z; c.radius = t.radius;
      } else {
        this._cachedPtLights.push({ x: t.x, y: t.y, z: t.z, radius: t.radius });
      }
    }
  }

  // Precompute chebyshev shells for layered scanning
  private _ensureLightScanState(): void {
    const R = this.LIGHT_SCAN_RADIUS;
    if (this._lightScanShells && this._lightScanShells.length > R) return;
    this._lightScanShells = new Array(R + 1);
    for (let r = 0; r <= R; r++) {
      const shell: Array<[number, number, number]> = [];
      if (r === 0) {
        shell.push([0, 0, 0]);
        this._lightScanShells[r] = shell;
        continue;
      }
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            shell.push([dx, dy, dz]);
          }
        }
      }
      // Prefer shells closer to player Y-level first (sort by |dy|, then |dx|, then |dz|)
      shell.sort((a, b) => {
        const c = Math.abs(a[1]) - Math.abs(b[1]); if (c !== 0) return c;
        const c2 = Math.abs(a[0]) - Math.abs(b[0]); if (c2 !== 0) return c2;
        return Math.abs(a[2]) - Math.abs(b[2]);
      });
      this._lightScanShells[r] = shell;
    }

    // Prepare temporary point-light buffer
    this._tmpPtLights = new Array(this.MAX_POINT_LIGHTS);
    for (let i = 0; i < this.MAX_POINT_LIGHTS; i++) this._tmpPtLights[i] = { x: 0, y: 0, z: 0, radius: 0 };
  }

  /** Check if a position is inside a cave (surrounded by solid blocks, has air and floor). */
  private isCavePosition(wx: number, wz: number, spawnY: number): boolean {
    // Must have air at spawn position
    if (this.getWorldBlock(wx, spawnY, wz) !== BlockId.AIR) return false;
    // Must have solid floor
    const below = this.getWorldBlock(wx, spawnY - 1, wz);
    if (below === BlockId.AIR || below === BlockId.WATER) return false;

    // Check if there's a "roof" above (solid blocks that would indicate being inside a cave/mountain)
    // For a cave, there should be solid blocks fairly close above
    let roofCount = 0;
    for (let y = spawnY + 1; y <= spawnY + 5 && y < WORLD_HEIGHT; y++) {
      const b = this.getWorldBlock(wx, y, wz);
      if (b !== BlockId.AIR && b !== BlockId.WATER) roofCount++;
    }
    // If there's not much roof, it's likely surface - not a cave
    if (roofCount < 2) return false;

    // Check if there are solid blocks on at least 2 sides (walls)
    let wallCount = 0;
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of directions) {
      for (let y = spawnY; y <= spawnY + 2 && y < WORLD_HEIGHT; y++) {
        const b = this.getWorldBlock(wx + dx, y, wz + dz);
        if (b !== BlockId.AIR && b !== BlockId.WATER) {
          wallCount++;
          break;
        }
      }
    }
    // Need at least 2 walls to be considered a cave
    return wallCount >= 2;
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

  /** Draw a twinkling starfield to the star canvas during night.
   *  Only redraws when camera yaw/pitch changes by >0.5° to avoid per-frame canvas work. */
  private _lastStarYaw = Infinity;
  private _lastStarPitch = Infinity;
  private _lastStarDay: boolean | null = null;
  private _lastCelestialX = -1;
  private _lastCelestialY = -1;

  private updateStarCanvas(): void {
    const starEl = this.starCanvasRef?.nativeElement;
    const gameEl = this.canvasRef?.nativeElement;
    if (!starEl || !gameEl) return;
    const w = gameEl.width || gameEl.clientWidth || 800;
    const h = gameEl.height || gameEl.clientHeight || 600;
    if (starEl.width !== w || starEl.height !== h) {
      starEl.width = w; starEl.height = h;
      if (gameEl.clientWidth) starEl.style.width = `${gameEl.clientWidth}px`;
      if (gameEl.clientHeight) starEl.style.height = `${gameEl.clientHeight}px`;
      this.stars = [];
      this._lastStarYaw = Infinity; // force redraw on resize
    }
    const ctx = starEl.getContext('2d');
    if (!ctx) return;

    // Only redraw if camera rotated >0.5° or day/night changed or celestial moved >2px
    const yawDeg = this.yaw * 180 / Math.PI;
    const pitchDeg = this.pitch * 180 / Math.PI;
    const celestialMoved = Math.abs(this.celestialX - this._lastCelestialX) > 2 || Math.abs(this.celestialY - this._lastCelestialY) > 2;
    const cameraRotated = Math.abs(yawDeg - this._lastStarYaw) > 0.5 || Math.abs(pitchDeg - this._lastStarPitch) > 0.5;
    const dayChanged = this.celestialIsDay !== this._lastStarDay;
    if (!cameraRotated && !celestialMoved && !dayChanged) return;

    this._lastStarYaw = yawDeg; this._lastStarPitch = pitchDeg;
    this._lastStarDay = this.celestialIsDay;
    this._lastCelestialX = this.celestialX; this._lastCelestialY = this.celestialY;

    ctx.clearRect(0, 0, w, h);

    if (this.celestialIsDay) {
      // Day/dusk/dawn sky — use current fog color as the sky gradient base
      // This makes the sky match the fog (orange at dusk, blue at day)
      const fogR = Math.round(this.renderer.skyR * 255);
      const fogG = Math.round(this.renderer.skyG * 255);
      const fogB = Math.round(this.renderer.skyB * 255);
      const topR = Math.max(0, fogR - 30), topG = Math.max(0, fogG - 20), topB = Math.max(0, fogB - 10);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgb(${topR},${topG},${topB})`);
      g.addColorStop(1, `rgb(${fogR},${fogG},${fogB})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // Sun
      const sr = Math.max(8, this.celestialSize);
      const sg = ctx.createRadialGradient(this.celestialX, this.celestialY, sr * 0.08, this.celestialX, this.celestialY, sr);
      sg.addColorStop(0, 'rgba(255,255,220,1)'); sg.addColorStop(0.25, 'rgba(255,220,120,0.9)'); sg.addColorStop(1, 'rgba(255,180,40,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(this.celestialX, this.celestialY, sr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    // Night sky
    ctx.fillStyle = '#051026'; ctx.fillRect(0, 0, w, h);
    // Moon
    const mr = Math.max(6, Math.round(this.celestialSize * 0.85));
    const mg = ctx.createRadialGradient(this.celestialX, this.celestialY, mr * 0.08, this.celestialX, this.celestialY, mr);
    mg.addColorStop(0, 'rgba(255,255,255,0.98)'); mg.addColorStop(0.4, 'rgba(230,230,230,0.6)'); mg.addColorStop(1, 'rgba(200,200,200,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(this.celestialX, this.celestialY, mr, 0, Math.PI * 2); ctx.fill();

    // Generate stars once
    if (this.stars.length === 0) {
      const desired = Math.max(60, Math.min(400, Math.floor((w * h) / 8000))); // cap at 400
      const seed = Math.abs(Math.floor(Number(this.seed) || 42)) || 1;
      let s = seed >>> 0;
      const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let a = 6; a <= 85; a += 7) {
        for (let az = 0; az < 360; az += 10) {
          if (rng() > Math.min(1, desired / 500)) continue;
          this.stars.push({
            az: az + (rng()-0.5)*7, alt: Math.max(0.5, Math.min(89.5, a + (rng()-0.5)*7)),
            r: 0.5 + rng() * 1.5, baseA: 0.3 + rng() * 0.7, phase: rng() * Math.PI * 2, spd: 0.4 + rng() * 1.2
          });
        }
      }
    }

    // Project + draw stars — batched by alpha bucket to reduce fillStyle changes
    const aspect = (w / Math.max(1, h)) || 1;
    const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
    const t = performance.now() / 1000;
    const starRadius = 140;

    // Draw all stars in two passes: glow then core (avoids per-star fillStyle)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    for (const s of this.stars) {
      const azR = s.az * Math.PI / 180, altR = s.alt * Math.PI / 180;
      const dx = Math.cos(altR) * Math.cos(azR), dy = Math.sin(altR), dz = Math.cos(altR) * Math.sin(azR);
      const clip = this.transformVec4(mvp, [this.camX + dx*starRadius, this.camY + dy*starRadius, this.camZ + dz*starRadius, 1]);
      if (clip[3] === 0 || (clip[2]/clip[3]) > 1) continue;
      const sx = (clip[0]/clip[3] * 0.5 + 0.5) * w;
      const sy = (1 - (clip[1]/clip[3] * 0.5 + 0.5)) * h;
      if (s.r > 1.2) { ctx.moveTo(sx + s.r*2, sy); ctx.arc(sx, sy, s.r*2, 0, Math.PI*2); }
    }
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    for (const s of this.stars) {
      const azR = s.az * Math.PI / 180, altR = s.alt * Math.PI / 180;
      const dx = Math.cos(altR) * Math.cos(azR), dy = Math.sin(altR), dz = Math.cos(altR) * Math.sin(azR);
      const clip = this.transformVec4(mvp, [this.camX + dx*starRadius, this.camY + dy*starRadius, this.camZ + dz*starRadius, 1]);
      if (clip[3] === 0 || (clip[2]/clip[3]) > 1) continue;
      const sx = (clip[0]/clip[3] * 0.5 + 0.5) * w;
      const sy = (1 - (clip[1]/clip[3] * 0.5 + 0.5)) * h;
      ctx.moveTo(sx + s.r, sy); ctx.arc(sx, sy, s.r, 0, Math.PI*2);
    }
    ctx.fill();
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

  // Angular helpers: shortest-path interpolation of angles (radians)
  private lerpAngle(a: number, b: number, t: number): number {
    if (typeof a !== 'number' || typeof b !== 'number') return b ?? a ?? 0;
    let diff = b - a;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return a + diff * t;
  }

  // Compute yaw (radians) from horizontal velocity vector. Falls back to provided value when velocity is near-zero.
  private yawFromVelocity(vx: number, vz: number, fallback = 0): number {
    if (Math.abs(vx) < 1e-6 && Math.abs(vz) < 1e-6) return fallback;
    return Math.atan2(-vx, -vz);
  }

  /** Compute smoothed/extrapolated player list used for rendering and UI. */
  private computeSmoothedPlayers(): void {
    const renderTime = Date.now() - this.interpDelayMs;
    const list: DCPlayer[] = [];
    const myId = this.parentRef?.user?.id ?? 0;

    for (const [userId, snaps] of this.playerSnapshots) {
      if (userId === myId) continue;
      if (!snaps || snaps.length === 0) continue;

      // Ensure sorted by time
      const s = snaps.slice().sort((a, b) => a.t - b.t);

      let outX = s[0].posX, outY = s[0].posY, outZ = s[0].posZ;
      let outYaw = s[s.length - 1].yaw;
      let outPitch = s[s.length - 1].pitch ?? 0;
      let outBodyYaw = s[s.length - 1].bodyYaw ?? s[s.length - 1].yaw;
      let outHealth = s[s.length - 1].health;

      if (s.length >= 2) {
        // Calculate velocities from recent positions for better extrapolation
        const lastIdx = s.length - 1;
        const prevIdx = Math.max(0, s.length - 3); // Use 2 frames back for velocity
        const dt = s[lastIdx].t - s[prevIdx].t;
        
        let vx = 0, vy = 0, vz = 0;
        if (dt > 0) {
          vx = (s[lastIdx].posX - s[prevIdx].posX) / dt;
          vy = (s[lastIdx].posY - s[prevIdx].posY) / dt;
          vz = (s[lastIdx].posZ - s[prevIdx].posZ) / dt;
        }

        // Find the bracketing interval
        let i = 0;
        while (i < s.length - 2 && s[i + 1].t <= renderTime) i++;

        if (s[i].t <= renderTime && renderTime <= s[i + 1].t) {
          // Interpolate position using smoothstep for smooth trajectory
          const a = s[i], b = s[i + 1];
          const interpDt = (b.t - a.t) || 1;
          const rawAlpha = Math.max(0, Math.min(1, (renderTime - a.t) / interpDt));
          // Use smoothstep interpolation for smooth position transitions
          const alpha = rawAlpha * rawAlpha * (3 - 2 * rawAlpha);
          outX = a.posX + (b.posX - a.posX) * alpha;
          outY = a.posY + (b.posY - a.posY) * alpha;
          outZ = a.posZ + (b.posZ - a.posZ) * alpha;
          outHealth = Math.round(a.health + (b.health - a.health) * rawAlpha);
          // Rotations: interpolate yaw via shortest-path to smooth turning
          const aYaw = (a.yaw ?? outYaw);
          const bYaw = (b.yaw ?? outYaw);
          outYaw = this.lerpAngle(aYaw, bYaw, alpha);
          outPitch = (typeof a.pitch === 'number' && typeof b.pitch === 'number') ? (a.pitch + (b.pitch - a.pitch) * alpha) : (b.pitch ?? outPitch);
          const aBodyYaw = (a.bodyYaw ?? aYaw);
          const bBodyYaw = (b.bodyYaw ?? bYaw);
          outBodyYaw = this.lerpAngle(aBodyYaw, bBodyYaw, alpha);
        } else if (renderTime > s[s.length - 1].t) {
          // renderTime is beyond last snapshot → extrapolation with velocity damping
          const last = s[s.length - 1];
          const dtEx = Math.min(renderTime - last.t, this.maxExtrapolateMs);
          // Apply damping factor to reduce overshoot (0.7 = 30% damping)
          const damping = 0.7;
          outX = last.posX + vx * dtEx * damping;
          outY = last.posY + vy * dtEx * damping;
          outZ = last.posZ + vz * dtEx * damping;
          
          // Clamp Y to prevent floating/sinking
          outY = Math.max(1.6, outY);
          
          // Use velocity-derived heading blended with last snapshot yaw for smooth extrapolation
          const last2 = s[s.length - 1];
          const predictedYaw = this.yawFromVelocity(vx, vz, last2.yaw ?? outYaw);
          const yawBlend = Math.min(1, dtEx / Math.max(1, this.maxExtrapolateMs));
          outYaw = this.lerpAngle(last2.yaw ?? predictedYaw, predictedYaw, yawBlend);
          outPitch = last2.pitch ?? outPitch;
          outBodyYaw = this.lerpAngle(last2.bodyYaw ?? (last2.yaw ?? outBodyYaw), predictedYaw, yawBlend);
          outHealth = last2.health;
        } else {
          // renderTime is before first snapshot - use first position
          outX = s[0].posX;
          outY = s[0].posY;
          outZ = s[0].posZ;
          outYaw = s[0].yaw ?? outYaw;
          outPitch = s[0].pitch ?? outPitch;
          outBodyYaw = s[0].bodyYaw ?? s[0].yaw ?? outBodyYaw;
          outHealth = s[0].health;
        }
      }

      const last = s[s.length - 1];
      list.push({
        userId,
        posX: outX, posY: outY, posZ: outZ,
        yaw: outYaw,
        pitch: outPitch,
        bodyYaw: outBodyYaw,
        health: outHealth,
        username: last.username ?? `User${userId}`,
        weapon: last.weapon,
        color: last.color,
        helmet: last.helmet,
        chest: last.chest,
        legs: last.legs,
        boots: last.boots,
        isAttacking: !!(last.isAttacking),
        isDefending: !!(last.isDefending),
        face: last.face,
      });
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
      
      if (s.length >= 2) {
        // Calculate velocities from recent positions for better extrapolation
        const lastIdx = s.length - 1;
        const prevIdx = Math.max(0, s.length - 3);
        const dt = s[lastIdx].t - s[prevIdx].t;
        
        let vx = 0, vy = 0, vz = 0;
        if (dt > 0) {
          vx = (s[lastIdx].posX - s[prevIdx].posX) / dt;
          vy = (s[lastIdx].posY - s[prevIdx].posY) / dt;
          vz = (s[lastIdx].posZ - s[prevIdx].posZ) / dt;
        }

        let i = 0;
        while (i < s.length - 1 && s[i + 1].t < renderTime) i++;
        if (i < s.length - 1 && s[i].t <= renderTime && renderTime <= s[i + 1].t) {
          const a = s[i], b = s[i + 1];
          const interpDt = (b.t - a.t) || 1;
          const rawAlpha = Math.max(0, Math.min(1, (renderTime - a.t) / interpDt));
          // Use smoothstep interpolation for smooth position transitions
          const alpha = rawAlpha * rawAlpha * (3 - 2 * rawAlpha);
          outX = a.posX + (b.posX - a.posX) * alpha;
          outY = a.posY + (b.posY - a.posY) * alpha;
          outZ = a.posZ + (b.posZ - a.posZ) * alpha;
          // Interpolate yaw via shortest-path for smooth turning
          const aYaw = (a.yaw ?? outYaw);
          const bYaw = (b.yaw ?? outYaw);
          outYaw = this.lerpAngle(aYaw, bYaw, alpha);
          outHealth = Math.round(a.health + (b.health - a.health) * rawAlpha);
        } else if (renderTime > s[s.length - 1].t) {
          // Extrapolation beyond last snapshot with velocity damping
          const last = s[s.length - 1];
          const dtEx = Math.min(renderTime - last.t, this.maxExtrapolateMs);
          // Apply damping factor to reduce overshoot (0.6 = 40% damping for mobs)
          const damping = 0.6;
          outX = last.posX + vx * dtEx * damping;
          outY = last.posY + vy * dtEx * damping;
          outZ = last.posZ + vz * dtEx * damping;
          
          // Clamp Y to prevent floating/sinking (mobs stay grounded)
          outY = Math.max(1.6, outY);
          
          // Blend towards a velocity-derived heading for smooth extrapolation
          const predictedYaw = this.yawFromVelocity(vx, vz, last.yaw ?? outYaw);
          const yawBlend = Math.min(1, dtEx / Math.max(1, this.maxExtrapolateMs));
          outYaw = this.lerpAngle(last.yaw ?? predictedYaw, predictedYaw, yawBlend);
          outHealth = last.health;
        } else if (renderTime < s[0].t) {
          // Before first snapshot - use first position
          outX = s[0].posX;
          outY = s[0].posY;
          outZ = s[0].posZ;
          outYaw = s[0].yaw;
          outHealth = s[0].health;
        } else {
          // Shouldn't normally reach here, but fallback
          const last = s[s.length - 1];
          outX = last.posX;
          outY = last.posY;
          outZ = last.posZ;
          outYaw = last.yaw;
          outHealth = last.health;
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
    } finally { try { this.cdr.detectChanges(); } catch (e) { } }
  }

  async onFaceSubmit(face: string): Promise<void> {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || !face) return;
    try {
      const res = await this.digcraftService.changeFace(userId, this.worldId, face);
      if (res && (res as any).ok) {
        this.playerFace = (res as any).face ?? face;
        const me = this.otherPlayers.find(p => p.userId === userId);
        if (me) (me as any).face = this.playerFace;
        const snaps = this.playerSnapshots.get(userId);
        if (snaps && snaps.length > 0) { snaps[snaps.length - 1].face = this.playerFace; this.playerSnapshots.set(userId, snaps); }
      }
    } catch (err) {
      console.error('DigCraft: change face failed', err);
    } finally { try { this.cdr.detectChanges(); } catch (e) { } }
  }

  async selectFace(face: string): Promise<void> {
    await this.onFaceSubmit(face);
  }

  getCreatorCellColor(index: number): string {
    const key = this.creatorGrid[index];
    if (!key || key === '.') return 'transparent';
    return this.creatorPalette[key] || 'transparent';
  }

  onCreatorCellClick(index: number): void {
    this.creatorGrid[index] = this.creatorSelectedColor;
  }

  clearCreatorGrid(): void {
    this.creatorGrid = Array(64).fill('.');
    this.creatorPalette = { '1': '#000000', '.': '' };
    this.creatorSelectedColor = '1';
  }

  addCreatorColor(): void {
    if (!this.newCreatorColor) return;
    this.creatorEmojiError = '';
    // Find the next available key
    let key = '2';
    while (this.creatorPalette[key] || key === '.') {
      key = String(Number(key) + 1);
    }
    if (parseInt(key) >= 10) {
      this.creatorEmojiError = 'Maximum of 9 colors allowed in palette.';
      return;
    }
    this.creatorPalette[key] = this.newCreatorColor;
    this.creatorSelectedColor = key;
    this.newCreatorColor = '#ff0000';
  }

  onCreatorEmojiChange(emoji: string): void {
    this.creatorEmoji = emoji;
    // Check if user already has a face with this emoji - load for editing
    const userId = this.parentRef?.user?.id ?? 0;
    const existingFace = this.userFaces.find(f => f.emoji === emoji);
    if (existingFace && existingFace.id) {
      this.creatorName = existingFace.name || '';
      // Parse grid data (64 chars)
      const grid = existingFace.gridData || '';
      this.creatorGrid = grid.split('').length === 64 ? grid.split('') : Array(64).fill('.');
      // Parse palette data (format: "1:#000000,2:#ffffff,...")
      const palette: { [key: string]: string } = { '.': '' };
      const paletteParts = (existingFace.paletteData || '').split(',');
      for (const part of paletteParts) {
        const [key, color] = part.split(':');
        if (key && color) palette[key] = color;
      }
      this.creatorPalette = palette;
      // Set selected color to first non-empty key
      const keys = Object.keys(palette).filter(k => k !== '.');
      if (keys.length > 0) this.creatorSelectedColor = keys[0];
    }
  }

  async saveCreatedFace(): Promise<void> {
    this.creatorEmojiError = '';
    const name = (this.creatorName || '').trim();
    if (!name) {
      this.creatorEmojiError = 'Please enter a face name';
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(name)) {
      this.creatorEmojiError = 'Name must be alphanumeric only';
      return;
    }
    const emoji = this.creatorEmoji;
    if (!emoji) {
      this.creatorEmojiError = 'Please select an emoji';
      return;
    }
    const gridData = this.creatorGrid.join('');
    const paletteKeys = Object.keys(this.creatorPalette).filter(k => k !== '.');
    const paletteData = paletteKeys.map(k => k + ':' + (this.creatorPalette[k] || '')).join(',');
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) {
      this.creatorEmojiError = 'You must be logged in';
      return;
    }
    // Check for duplicate emoji owned by another user (allow updating your own face)
    const existingWithEmoji = this.userFaces.find(f => f.emoji === emoji && f.creatorUserId !== userId);
    if (existingWithEmoji) {
      this.creatorEmojiError = 'This emoji is already used by another face';
      return;
    }
    try {
      const res = await this.digcraftService.saveUserFace(userId, name, emoji, gridData, paletteData);
      if (res && res.ok) {
        // Check if face already exists - update or add. Ensure creatorUserId is set.
        const existingIndex = this.userFaces.findIndex(f => f.emoji === emoji || f.id === res.id);
        if (existingIndex >= 0) {
          this.userFaces[existingIndex] = { id: res.id, name, emoji, gridData, paletteData, creatorUserId: userId };
        } else {
          this.userFaces.push({ id: res.id, name, emoji, gridData, paletteData, creatorUserId: userId });
        }
        this.updateAvailableFacesWithUserFaces();
        // Auto-select the newly created face
        this.playerFace = String(res.id);
        this.onFaceSubmit(String(res.id));
        this.showFaceCreator = false;
        this.isTypingMode = false;
        this.creatorGrid = Array(64).fill('.');
        this.creatorName = '';
        this.creatorEmoji = '😊';
      } else {
        this.creatorEmojiError = 'Failed to save face';
      }
    } catch (err) {
      console.error('DigCraft: save face error', err);
      this.creatorEmojiError = 'Error saving face';
    }
  }

  async loadInventoryData(): Promise<void> {
    try {
      const faces = await this.digcraftService.getUserFaces(this.currentUser.id ?? 0);
      if (faces && Array.isArray(faces)) {
        this.userFaces = faces;
        this.updateAvailableFacesWithUserFaces();
        // Update renderer with user faces
        if (this.renderer) {
          (this.renderer as any).setUserFaces(this.userFaces);
        }
        // Also update avatar preview renderer if present
        if (this.avatarPreviewRenderer) {
          (this.avatarPreviewRenderer as any).setUserFaces(this.userFaces);
        }
      }
      // Load known recipes from server
      try {
        const res = await this.digcraftService.getKnownRecipes(this.currentUser.id ?? 0);
        if (res?.recipeIds) {
          this.knownRecipeIds = new Set(res.recipeIds);
        }
      } catch (e) { /* ignore recipes load error */ }
    } catch (err) {
      console.error('DigCraft: loadInventoryData error', err);
    }
  }

  private updateAvailableFacesWithUserFaces(): void {
    // Note: User faces are shown in "My Faces" section via the myUserFaces getter
    // Only update renderers so numeric user faces render correctly in previews
    if (this.renderer) (this.renderer as any).setUserFaces(this.userFaces);
    if (this.avatarPreviewRenderer) (this.avatarPreviewRenderer as any).setUserFaces(this.userFaces);
  }

  private getSmoothedPlayerById(userId: number): DCPlayer | undefined {
    return this.smoothedPlayers.find(p => p.userId === userId) || this.otherPlayers.find(p => p.userId === userId);
  }

  async teleportToPlayer(player?: DCPlayer): Promise<void> {
    if (!player || !this.otherPlayers || this.otherPlayers.length === 0) return;
    this.isTeleporting = true; 
    this.cdr.detectChanges(); 
    this.camX = player.posX;
    this.camY = player.posY;
    this.camZ = player.posZ;
    try {
      await this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE));
      await this.ensureFreeSpaceAt(this.camX, this.camY, this.camZ);
    } catch (e) { /* ignore */ }
    this.isTeleporting = false; 
    this.cdr.detectChanges();
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
    this.partyErrorMessage = '';
    const myId = this.currentUser.id ?? 0;
    if (!myId || !userId) return;
    if (this.hasPendingInvite(userId)) {
      console.warn('DigCraft: already have pending invite to/from this user');
      return;
    }

    console.log(`DigCraft: sending party invite from ${myId} to ${userId}`);
    const res = await this.digcraftService.sendPartyInvite(myId, userId);
    if (!res?.ok) {
      this.partyErrorMessage = res?.message || 'Failed to send invite';
      return;
    }
    this.partyErrorMessage = '';
    const expiresAt = Date.now() + this.INVITE_TIMEOUT_MS;
    this.pendingSentInvites.set(userId, expiresAt);
  }

  async acceptInvite(fromUserId: number): Promise<void> {
    this.partyErrorMessage = '';
    this.isLoadingParty = true;
    this.pendingReceivedInvites.delete(fromUserId);
    await this.digcraftService.acceptPartyInvite(this.currentUser?.id ?? 0, fromUserId);
    await this.refreshPartyMembers();
    this.isLoadingParty = false;
    this.closeInvitePrompt();
  }

  async denyInvite(fromUserId: number): Promise<void> {
    const myId = this.currentUser?.id ?? 0;
    this.pendingReceivedInvites.delete(fromUserId);
    if (myId > 0) {
      await this.digcraftService.clearPartyInvite(fromUserId, myId);
    }
    this.closeInvitePrompt();
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
    const clamped = Math.max(1, Math.min(MAX_VIEW_DISTANCE, Math.round(val)));
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
    return this._showInventory || this._showCrafting || this._showPlayersPanel || this._showWorldPanel || this._showRespawnPrompt || this._showChatPrompt || this._showColorPrompt || this._showFaceCreator || this._isMenuPanelOpen || this._isShowingLoginPanel;
  }

  private onMenuStateChanged(): void {
    const canvas = this.canvasRef?.nativeElement;
    const anyOpen = this.isAnyMenuOpen();
    if (anyOpen) {
      this.exitPointerLock();
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
    const needed = new Set<string>();
    const mobile = this.onMobile();

    // Sort chunks by distance from player so closest load first
    const toLoad: Array<[number, number, number]> = []; // [cx, cz, dist²]
    for (let dx = -this.viewDistanceChunks; dx <= this.viewDistanceChunks; dx++) {
      for (let dz = -this.viewDistanceChunks; dz <= this.viewDistanceChunks; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = `${cx},${cz}`;
        needed.add(key);
        if (!this.chunks.has(key)) {
          toLoad.push([cx, cz, dx * dx + dz * dz]);
        }
      }
    }
    toLoad.sort((a, b) => a[2] - b[2]);

    // Immediate: generate only the chunk the player is standing in synchronously.
    // Everything else is deferred to the generation queue.
    const immediateCount = Math.min(1, toLoad.length);
    const fetchPromises: Promise<void>[] = [];
    for (let i = 0; i < immediateCount; i++) {
      const [cx, cz] = toLoad[i];
      const key = `${cx},${cz}`;
      if (!this.chunks.has(key)) {
        const chunk = generateChunk(this.seed, cx, cz, !mobile);
        this.chunks.set(key, chunk);
        fetchPromises.push(this.fetchChunkChanges(cx, cz, chunk));
      }
    }

    // Deferred: enqueue the rest — processed one per frame in the game loop
    for (let i = immediateCount; i < toLoad.length; i++) {
      const [cx, cz] = toLoad[i];
      const key = `${cx},${cz}`;
      if (!this.chunks.has(key) && !this.pendingChunkGenerations.some(([qx, qz]) => qx === cx && qz === cz)) {
        this.pendingChunkGenerations.push([cx, cz]);
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
    // Also prune generation queue for evicted chunks
    this.pendingChunkGenerations = this.pendingChunkGenerations.filter(
      ([cx, cz]) => Math.abs(cx - ccx) <= evictDist && Math.abs(cz - ccz) <= evictDist
    );

    if (fetchPromises.length > 0) {
      if (mobile) {
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
    const changes: DCBlockChange[] = await this.digcraftService.getChunkChanges(this.worldId, cx, cz).catch(err => {
      console.error(`DigCraft: failed to fetch chunk changes for ${cx},${cz}`, err);
      return [];
    });
    const now = Date.now();

    // Expire any stale local-change guards for this chunk
    for (const [key, entry] of this.localBlockChanges) {
      if (now >= entry.expiresAt) {
        const [kcx, kcz] = key.split(',').map(Number);
        if (kcx === cx && kcz === cz) this.localBlockChanges.delete(key);
      }
    }

    const toApply: DCBlockChange[] = [];
    for (const c of changes) {
      const localKey = `${cx},${cz},${c.localX},${c.localY},${c.localZ}`;
      const pending = this.localBlockChanges.get(localKey);
      if (pending !== undefined) {
        // Still within grace period — suppress server update entirely.
        // If server now agrees with us, we can clear early.
        if (c.blockId === pending.blockId) this.localBlockChanges.delete(localKey);
        continue;
      }
      toApply.push(c);
    }

    if (toApply.length > 0) {
      applyChanges(chunk, toApply);
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
    try {
      this.renderer.setWatchBlocks(this.watchBlocks);
      // Gather neighbor chunk data (3x3 area) and send to worker
      const neighborChunks: Record<string, any> = {};
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ncx = cx + dx;
          const ncz = cz + dz;
          const nkey = `${ncx},${ncz}`;
          const nch = this.chunks.get(nkey);
          if (nch) {
            neighborChunks[nkey] = {
              cx: ncx,
              cz: ncz,
              blocks: nch.blocks,
              biomeColumn: nch.biomeColumn,
              waterLevel: nch.waterLevel,
              fluidIsSource: nch.fluidIsSource
            };
          }
        }
      }
      this.renderer.buildChunkMeshAsync(chunk, neighborChunks);
    } catch (e) {
      console.error('DigCraft: chunk mesh build failed', cx, cz, e);
    }
  }

  /** Poll chunks within render distance for server-side changes and apply them. */
  private async pollChunkChanges(): Promise<void> {
    if (this.pollingChunks) return;
    this.pollingChunks = true;
    try {
      const camCX = Math.floor(this.camX / CHUNK_SIZE);
      const camCZ = Math.floor(this.camZ / CHUNK_SIZE);

      // Always poll the chunks closest to the player first (within 2-chunk radius),
      // then fall back to round-robin for the rest. This ensures fluid blocks placed
      // by the server near the player are picked up quickly.
      const nearKeys: string[] = [];
      const farKeys: string[] = [];
      for (const key of this.chunks.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        const d = Math.max(Math.abs(cx - camCX), Math.abs(cz - camCZ));
        if (d <= 2) nearKeys.push(key);
        else farKeys.push(key);
      }

      // Always fetch all near chunks; round-robin a few far ones
      const MAX_FAR = this.onMobile() ? 4 : 12;
      const farToFetch = farKeys.slice(this.chunkPollIndex % Math.max(1, farKeys.length),
        (this.chunkPollIndex % Math.max(1, farKeys.length)) + MAX_FAR);
      this.chunkPollIndex = (this.chunkPollIndex + MAX_FAR) % Math.max(1, farKeys.length);

      const toFetch = [...nearKeys, ...farToFetch];
      const promises: Promise<void>[] = toFetch.map(key => {
        const [cx, cz] = key.split(',').map(Number);
        const chunk = this.chunks.get(key);
        return chunk ? this.fetchChunkChanges(cx, cz, chunk) : Promise.resolve();
      });

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

  private setWorldBlock(wx: number, wy: number, wz: number, blockId: number, persist = true, rebuild = true, waterLevel?: number, fluidIsSource?: boolean, immediate = false, previousBlockId?: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    try { console.debug('[digcraft] setWorldBlock', { wx, wy, wz, blockId, persist, rebuild, immediate, previousBlockId }); } catch (err) { }
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    // Invalidate point-light cache when a light-emitting block changes within scan radius
    const _dlx = wx - Math.floor(this.camX);
    const _dly = wy - Math.floor(this.camY);
    const _dlz = wz - Math.floor(this.camZ);
    if (Math.abs(_dlx) <= 8 && Math.abs(_dly) <= 8 && Math.abs(_dlz) <= 8) {
      this._ptLightsDirty = true;
    }
    // Debug: log when WATCH is set locally (helps diagnose mismatches)
    if (blockId === BlockId.WATCH) console.debug('[setWorldBlock] setting WATCH locally at', wx, wy, wz);
    
    // Read previous block before overwriting (needed for regrow detection)
    let aboveBlockId = 0;
    let belowBlockId = 0;
    let leftBlockId = 0;
    let rightBlockId = 0;

    if (previousBlockId && REGENERATIVE_BLOCKS.includes(previousBlockId)) {
      aboveBlockId = this.pendingPlaceItems.find(p => p.chunkX === cx && p.chunkZ === cz && p.localX === lx && p.localY === (wy + 1) && p.localZ === lz)?.previousBlockId ?? chunk.getBlock(lx, wy + 1, lz);
      belowBlockId = this.pendingPlaceItems.find(p => p.chunkX === cx && p.chunkZ === cz && p.localX === lx && p.localY === (wy - 1) && p.localZ === lz)?.previousBlockId ?? chunk.getBlock(lx, wy - 1, lz);
      // Handle left/right neighbors across chunk boundaries
      if (lx === 0) {
        const leftChunk = this.chunks.get(`${cx - 1},${cz}`);
        leftBlockId = leftChunk ? leftChunk.getBlock(CHUNK_SIZE - 1, wy, lz) : BlockId.AIR;
      } else {
        leftBlockId = chunk.getBlock(lx - 1, wy, lz);
      }
      if (lx === CHUNK_SIZE - 1) {
        const rightChunk = this.chunks.get(`${cx + 1},${cz}`);
        rightBlockId = rightChunk ? rightChunk.getBlock(0, wy, lz) : BlockId.AIR;
      } else {
        rightBlockId = chunk.getBlock(lx + 1, wy, lz);
      }
    }

    chunk.setBlock(lx, wy, lz, blockId, undefined, waterLevel, fluidIsSource);

    if (rebuild) {
      const rebuildKeys = [`${cx},${cz}`];
      if (lx === 0) rebuildKeys.push(`${cx - 1},${cz}`);
      if (lx === CHUNK_SIZE - 1) rebuildKeys.push(`${cx + 1},${cz}`);
      if (lz === 0) rebuildKeys.push(`${cx},${cz - 1}`);
      if (lz === CHUNK_SIZE - 1) rebuildKeys.push(`${cx},${cz + 1}`);

      if (immediate) {
        for (const k of rebuildKeys) {
          const [rcx, rcz] = k.split(',').map(Number);
          this.rebuildSingleChunkMesh(rcx, rcz);
        }
      } else {
        for (const k of rebuildKeys) this.pendingChunkRebuilds.add(k);
      }
    }

    if (persist) {
      const userId = this.parentRef?.user?.id;
      if (userId) {
        // Track this block as locally modified to prevent server from overwriting prematurely.
        // Reset expiry whenever we intentionally change the block.
        const localKey = `${cx},${cz},${lx},${wy},${lz}`;
        this.localBlockChanges.set(localKey, { blockId, expiresAt: Date.now() + this.LOCAL_BLOCK_GRACE_MS });
        this.enqueuePlaceChange({ chunkX: cx, chunkZ: cz, localX: lx, localY: wy, localZ: lz, blockId, waterLevel, fluidIsSource, previousBlockId, aboveBlockId, belowBlockId, leftBlockId, rightBlockId });
      }
    }
  }

  private spawnCrumblingBlocks(wx: number, wy: number, wz: number, blockId: number): void {
    const colors = BLOCK_COLORS[blockId];
    if (!colors) {
      return;
    }
    const color = colors.top || colors;
    const now = performance.now();
    const numParticles = 8;
    for (let i = 0; i < numParticles; i++) {
      this.crumblingBlocks.push({
        wx: wx + (Math.random() * 0.6 + 0.2),
        wy: wy + (Math.random() * 0.6 + 0.2),
        wz: wz + (Math.random() * 0.6 + 0.2),
        color: { r: color.r, g: color.g, b: color.b },
        startTime: now
      });
    }
    const MAX_CRUMBLING = 1000;
    if (this.crumblingBlocks.length > MAX_CRUMBLING) {
      this.crumblingBlocks.splice(0, this.crumblingBlocks.length - MAX_CRUMBLING);
    }
  }

  private updateCrumblingBlocks(): void {
    const now = performance.now();
    const duration = 500;
    this.crumblingBlocks = this.crumblingBlocks.filter(p => now - p.startTime < duration);
  }

  private collectConnectedWood(startX: number, startY: number, startZ: number): Array<{ x: number; y: number; z: number }> {
    const results: Array<{ x: number; y: number; z: number }> = [];
    const visited = new Set<string>();
    const stack: Array<{ x: number; y: number; z: number }> = [{ x: startX, y: startY, z: startZ }];
    const startBlock = this.getWorldBlock(startX, startY, startZ);
    if (startBlock !== BlockId.WOOD) return results;

    // Only collect blocks at or above where the tree was hit (allowing bottom to remain if cut mid-trunk)
    const hitY = startY;
    const maxWood = 12; // Max trunk blocks (typical tree height)
    const maxLeaves = 20; // Max leaf blocks
    let woodCount = 0;
    let leavesCount = 0;

    while (stack.length > 0) {
      const pos = stack.pop()!;
      const key = `${pos.x},${pos.y},${pos.z}`;
      if (visited.has(key)) continue;
      // Only collect blocks at or above the hit point
      if (pos.y < hitY) continue;
      visited.add(key);
      
      const block = this.getWorldBlock(pos.x, pos.y, pos.z);
      if (block !== BlockId.WOOD && block !== BlockId.LEAVES) continue;
      
      // Enforce limits
      if (block === BlockId.WOOD) {
        if (woodCount >= maxWood) continue;
        woodCount++;
      } else {
        if (leavesCount >= maxLeaves) continue;
        leavesCount++;
      }
      
      results.push(pos);
      
      // Search vertically within same X/Z column only
      const neighbors = [
        { x: pos.x, y: pos.y + 1, z: pos.z },
        { x: pos.x, y: pos.y - 1, z: pos.z },
      ];
      
      for (const n of neighbors) {
        const nKey = `${n.x},${n.y},${n.z}`;
        if (!visited.has(nKey)) {
          stack.push(n);
        }
      }
    }
    
    return results;
  }

  private collectConnectedDripstone(startX: number, startY: number, startZ: number): Array<{ x: number; y: number; z: number }> {
    const results: Array<{ x: number; y: number; z: number }> = [];
    const startBlock = this.getWorldBlock(startX, startY, startZ);
    if (startBlock !== BlockId.NETHER_STALACTITE && startBlock !== BlockId.NETHER_STALAGMITE) return results;

    const MAX_LEN = 64; // safety cap

    if (startBlock === BlockId.NETHER_STALACTITE) {
      // Stalactite: collect downward from the hit point (toward the tip).
      for (let y = startY; y >= 0 && results.length < MAX_LEN; y--) {
        const b = this.getWorldBlock(startX, y, startZ);
        if (b !== BlockId.NETHER_STALACTITE) break;
        results.push({ x: startX, y: y, z: startZ });
      }
    } else {
      // Stalagmite: collect upward from the hit point (toward the tip).
      for (let y = startY; y < WORLD_HEIGHT && results.length < MAX_LEN; y++) {
        const b = this.getWorldBlock(startX, y, startZ);
        if (b !== BlockId.NETHER_STALAGMITE) break;
        results.push({ x: startX, y: y, z: startZ });
      }
    }

    return results;
  }

  damageBlock(wx: number, wy: number, wz: number, blockId: number): void { 
    if (INVULNERABLE_BLOCKS.includes(blockId)) {
      return; 
    }
    // Only allow breaking blocks adjacent to player
    const wyCenter = wy + 0.5;
    if (!this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5)) { 
      return;
    }
    const currentHealth = this.getWorldBlockHealth(wx, wy, wz);
    if (currentHealth <= 0) { 
      return; // Already broken
    }

    const maxHealth = getBlockHealth(blockId);
    if (maxHealth <= 0) { 
      return; // Unbreakable
    }

    // Calculate damage based on tool
    const miningSpeed = getMiningSpeed(this.equippedWeapon);
    const damage = Math.max(1, miningSpeed);

    const remaining = currentHealth - damage;

    // Reduce weapon durability when breaking blocks
    this.reduceEquippedDurability('hit');

    // If block is broken
    if (remaining <= 0) {
      this.applyMiningExhaustion(Math.min(0.5, Math.max(0.15, getBlockHealth(blockId) / 16)));
      // Auto-collect connected wood and leaves if destroying wood block
      if (blockId === BlockId.WOOD) {
        const collected = this.collectConnectedWood(wx, wy, wz);
        for (const pos of collected) {
          const b = this.getWorldBlock(pos.x, pos.y, pos.z);
          if (b === BlockId.AIR) {
            continue;
          }
          const drop = BLOCK_DROPS[b];
          if (drop) {
            this.addToInventory(drop.itemId, drop.quantity);
            this.exp += 1;
          }
          this.setWorldBlock(pos.x, pos.y, pos.z, BlockId.AIR, true, true, undefined, undefined, true, blockId);
        }
        this.checkLevelUp();
      }
      // Auto-collect full dripstone column when breaking the base block
      else if (blockId === BlockId.NETHER_STALACTITE || blockId === BlockId.NETHER_STALAGMITE) {
        const collected = this.collectConnectedDripstone(wx, wy, wz);
        if (collected.length > 0) {
          for (const pos of collected) {
            const b = this.getWorldBlock(pos.x, pos.y, pos.z);
            if (b === BlockId.AIR) continue;
            const drop = BLOCK_DROPS[b];
            if (drop) {
              this.addToInventory(drop.itemId, drop.quantity);
              this.exp += 1;
            }
            this.setWorldBlock(pos.x, pos.y, pos.z, BlockId.AIR, true, true, undefined, undefined, true);
          }
          this.checkLevelUp();
        } else {
          // Not the base block — only break this single block
          const drop = BLOCK_DROPS[blockId];
          if (drop) {
            this.addToInventory(drop.itemId, drop.quantity);
            this.exp += 1;
            this.checkLevelUp();
          }
          this.setWorldBlock(wx, wy, wz, BlockId.AIR, true, true, undefined, undefined, true);
        }
      } else {
        // Drop item into inventory
        const drop = BLOCK_DROPS[blockId];
        if (drop) {
          this.addToInventory(drop.itemId, drop.quantity);
          this.exp += 1;
          this.checkLevelUp();
        }
        // Remove block - this triggers rebuild via setWorldBlock
        this.setWorldBlock(wx, wy, wz, BlockId.AIR, true, true, undefined, undefined, true);
      }

      this.spawnCrumblingBlocks(wx, wy, wz, blockId);
    } else {
      // Update block health and rebuild to show damage overlay
      this.setWorldBlockHealth(wx, wy, wz, remaining);
      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const chunk = this.chunks.get(`${cx},${cz}`);
      if (chunk) {
        this.renderer.setWatchBlocks(this.watchBlocks);
        // gather neighbors and offload mesh rebuild
        const cx = chunk.cx;
        const cz = chunk.cz;
        const neighborChunks: Record<string, any> = {};
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ncx = cx + dx;
            const ncz = cz + dz;
            const nkey = `${ncx},${ncz}`;
            const nch = this.chunks.get(nkey);
            if (nch) {
              neighborChunks[nkey] = { cx: ncx, cz: ncz, blocks: nch.blocks, biomeColumn: nch.biomeColumn, waterLevel: nch.waterLevel, fluidIsSource: nch.fluidIsSource };
            }
          }
        }
        this.renderer.buildChunkMeshAsync(chunk, neighborChunks);
      }
    }
  }

  private async reduceEquippedDurability(reason: 'block' | 'hit'): Promise<void> {
    if (this.equippedWeapon > 0) {
      const dur = getItemDurability(this.equippedWeapon);
      if (dur) {
        const loss = reason === 'block' ? dur.durabilityLossOnBlock : dur.durabilityLossOnHit;
        if (loss > 0) {
          this.equippedWeaponDurability = Math.max(0, this.equippedWeaponDurability - loss);
          if (this.equippedWeaponDurability <= 0) {
            const tmpWeaponId = +this.equippedWeapon;
            this.unequipWeapon(true);
            this.consumeInventoryItem(tmpWeaponId, 1);
            this.showDamagePopup(`❌ ${this.getItemName(tmpWeaponId)} broke!`);
          } 
        }
      }
    }
  }

  async placeNewBonfire(): Promise<void> {
    this.isPlacingBonfire = true; 
    this.cdr.detectChanges();
    const bonfire = this.lastHitNonSolid;
    if (bonfire) {
      const x = bonfire.wx;
      const y = bonfire.wy;
      const z = bonfire.wz;
      await this.placeBonfireServerAndRename(x, y, z);
    } else {
      console.warn('No valid bonfire placement found at target position');
    }
    this.isPlacingBonfire = false; 
    this.cdr.detectChanges();
  }
  // Bonfire management
  async placeBonfire(placementBlock: { wx: number; wy: number; wz: number } | null): Promise<void> {
    let wx: number, wy: number, wz: number;

    // If we have a placement block from raycasting, use it; otherwise use player's feet position
    if (this.placementBlock) {
      wx = this.placementBlock.wx;
      wy = this.placementBlock.wy;
      wz = this.placementBlock.wz;
    } else if (placementBlock) {
      // Use the provided placement block
      wx = placementBlock.wx;
      wy = placementBlock.wy;
      wz = placementBlock.wz;
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
    this.setWorldBlock(wx, wy, wz, BlockId.BONFIRE, true, true, undefined, undefined, true);

    // Add to server and open rename prompt after placing
    await this.placeBonfireServerAndRename(wx, wy, wz);
  }

  private async placeBonfireServerAndRename(wx: number, wy: number, wz: number): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId) return;
    try {
      const res = await this.digcraftService.placeBonfire(userId, this.worldId, wx, wy, wz);
      if (res) {
        // Re-fetch from server so we get the canonical id and nickname
        await this.fetchBonfires();
        // Find the newly placed bonfire and open rename prompt automatically
        const newBonfire = this.bonfires.find(b => b.wx === wx && b.wy === wy && b.wz === wz);
        if (newBonfire) {
          this.bonfirePanelOpenAt = { wx, wy, wz };
          this.renameBonfireServer(newBonfire);
        } else {
          console.warn('Placed bonfire but could not find it on fetchBonfires');
        }
      }
    } catch (e) { console.error('placeBonfireServer error', e); }
  }

  async fetchBonfires(): Promise<void> {
    const userId = this.currentUser?.id;
    if (!userId) {
      this.bonfires = [];
      return;
    }
    this.isLoadingBonfires = true; 
    this.cdr.detectChanges();
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
    }
    catch (e) { console.error('fetchBonfires error', e); }
    finally {
      this.isLoadingBonfires = false;
      this.cdr.detectChanges();
    } 
  } 

  async deleteBonfire(bf: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId || !bf?.id) return;
    this.deleteBonfireTarget = { ...bf };
    this.showDeleteBonfirePrompt = true;
  }

  async onDeleteBonfireSubmit(result: string): Promise<void> {
    const bf = this.deleteBonfireTarget;
    const userId = this.currentUser.id;
    if (!bf || result !== 'yes' || !userId || !bf.id) return;
    this.showDeleteBonfirePrompt = false;
    try {
      const res = await this.digcraftService.deleteBonfire(userId, this.worldId, bf.id);
      if (res && res.success) {
        this.bonfires = this.bonfires.filter(b => b.id !== bf.id);
      }
    } catch (e) { console.error('deleteBonfire error', e); }
    this.deleteBonfireTarget = null as any;
  }

  async renameBonfireServer(bf: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): Promise<void> {
    const userId = this.currentUser.id;
    if (!userId || !bf?.id) return;

    // Store the bonfire ID (not the object reference) so we can find it after any fetchBonfires refresh
    this.renameBonfireTarget = { ...bf }; // snapshot to avoid stale reference issues
    this.showRenameBonfirePrompt = true;
    this.isTypingMode = true;
    this.exitPointerLock();
    setTimeout(() => { 
      if (this.renameBonfirePrompt) {
        this.renameBonfirePrompt.textValue = bf.nickname || '';
        this.renameBonfirePrompt.focusInput();
      } 
    }, 50);
  }

  async teleportToBonfire(bf: { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number }): Promise<void> {
    if (bf.worldId !== this.worldId) return;
    this.isTeleporting = true;
    this.cdr.detectChanges();
    // Teleport to bonfire position (slightly above it)
    this.camX = bf.wx + 0.5;
    this.camY = bf.wy + 1.6;
    this.camZ = bf.wz + 0.5; 
    await this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE));
    await this.ensureFreeSpaceAt(this.camX, this.camY, this.camZ); 
    this.isTeleporting = false;
    this.showBonfirePanel = false;
    this.cdr.detectChanges();
  }

  // Chest management
  placeChest(): void {
    if (!this.placementBlock) return;
    const { wx, wy, wz } = this.placementBlock;
    
    const existingBlock = this.getWorldBlock(wx, wy, wz);
    if (existingBlock !== BlockId.AIR) return; 
    const belowBlock = this.getWorldBlock(wx, wy - 1, wz);
    if (belowBlock === BlockId.AIR || belowBlock === BlockId.WATER || belowBlock === BlockId.LEAVES) return; 

    this.setWorldBlock(wx, wy, wz, BlockId.CHEST, true, true, undefined, undefined, true); 
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


  watchPlacedAt(wx: number, wy: number, wz: number): void {
    const key = `${wx},${wy},${wz}`;
    this.watchBlocks.set(key, this.getGameTimeTicks()); 
  }

  private getGameTimeTicks(): number {
    const segmentMs = 10 * 60 * 1000;
    const nowMs = Date.now();
    const segIdx = Math.floor(nowMs / segmentMs);
    const posInSeg = nowMs % segmentMs;
    const phase = posInSeg / segmentMs;
    const ticksInSeg = segIdx % 2 === 0 ? phase * 12000 : phase * 12000;
    return Math.floor(ticksInSeg);
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

    // Open in-app prompt instead of native prompt
    this.renameChestTarget = ch;
    this.showRenameChestPrompt = true;
    this.isTypingMode = true; // Prevent other panels from opening while typing
    this.exitPointerLock();
    setTimeout(() => {
      try {
        if (this.renameChestPrompt) {
          this.renameChestPrompt.textValue = ch.nickname || '';
          this.renameChestPrompt.focusInput();
        }
      } catch { }
    }, 50);
  }

  async onRenameBonfireSubmit(val: string): Promise<void> {
    const newName = (val ?? '').trim();
    if (!newName || !this.renameBonfireTarget) return;
    const userId = this.currentUser.id;
    if (!userId) return;
    const targetId = this.renameBonfireTarget.id;
    try {
      const res = await this.digcraftService.renameBonfire(userId, this.worldId, targetId, newName);
      if (res && res.success) {
        // Find by id in the live array (not via stale reference) and update
        const live = this.bonfires.find(b => b.id === targetId);
        if (live) live.nickname = newName;
      }
    } catch (e) { console.error('renameBonfire error', e); }
    finally {
      this.showRenameBonfirePrompt = false;
      this.renameBonfireTarget = null as any;
      this.isTypingMode = false;
    }
  }

  async onRenameChestSubmit(val: string): Promise<void> {
    const newName = (val ?? '').trim();
    if (!newName || !this.renameChestTarget) return;
    const userId = this.currentUser.id;
    if (!userId) return;
    try {
      const res = await this.digcraftService.renameChest(userId, this.worldId, this.renameChestTarget.id, newName);
      if (res && res.success) {
        this.renameChestTarget.nickname = newName;
      }
    } catch (e) { console.error('renameChest error', e); }
    finally {
      this.showRenameChestPrompt = false;
      this.renameChestTarget = null as any;
    }
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
    const closed = this.closeAllPanels(true);
    if (closed.includes('bonfire')) return;
    setTimeout(() => {
      this.exitPointerLock();
      // Store the position where the user right-clicked so we know if there's already a bonfire there
      if (this.lastHitNonSolid && this.lastHitNonSolid.id === BlockId.BONFIRE) {
        this.bonfirePanelOpenAt = { wx: this.lastHitNonSolid.wx, wy: this.lastHitNonSolid.wy, wz: this.lastHitNonSolid.wz };
      } else {
        this.bonfirePanelOpenAt = null;
      }
      setTimeout(() => {
        this.showBonfirePanel = true;
        this.fetchBonfires();
      }, 10);
    }, 10);
  }

  bonfirePanelOpenAt: { wx: number; wy: number; wz: number } | null = null;

  get bonfireAtLastHitPosition(): { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number } | undefined {
    if (!this.bonfirePanelOpenAt) return undefined;
    return this.bonfires.find(b => b.wx === this.bonfirePanelOpenAt?.wx && b.wy === this.bonfirePanelOpenAt?.wy && b.wz === this.bonfirePanelOpenAt?.wz);
  }

  get bonfireAtTargetPosition(): { id: number; wx: number; wy: number; wz: number; nickname: string; worldId: number } | undefined {
    // Check if player is looking at a bonfire that exists in the DB bonfire list
    if (this.lastHitNonSolid && this.lastHitNonSolid.id === BlockId.BONFIRE) {
      const wx = this.lastHitNonSolid.wx;
      const wy = this.lastHitNonSolid.wy;
      const wz = this.lastHitNonSolid.wz;
      // Check if this bonfire position exists in the server bonfire list
      return this.bonfires.find(b => b.wx === wx && b.wy === wy && b.wz === wz);
    }
    return undefined;
  }

  async openChestPanel(): Promise<void> {
    const closed = this.closeAllPanels(true);
    if (closed.includes('chest') || !this.lastHitNonSolid) return;
    
    // Wait for any pending save/load to complete first
    if (this.chestLoading || this.chestSaving) {
      this.parentRef?.showNotification('Please wait...');
      return;
    }
    
    this._loadingMessage = 'Loading chest...';
    this.chestLoading = true;
    setTimeout(() => {
      if (!this.lastHitNonSolid) { this.chestLoading = false; return; }
      this.exitPointerLock();
      const wx = this.lastHitNonSolid.wx;
      const wy = this.lastHitNonSolid.wy;
      const wz = this.lastHitNonSolid.wz;
      setTimeout(async () => {
        this.selectedChest = { id: 0, wx, wy, wz, nickname: 'Chest', items: [], worldId: this.worldId };
        this.chestInventory = Array(27).fill(null);
        // Fetch this chest from database only (no creation)
        const userId = this.parentRef?.user?.id ?? 0;
        await this.digcraftService.getChest(this.worldId, userId, wx, wy, wz).then(chest => {
          this.chestLoading = false;
          this._loadingMessage = '';
          // Only open panel if chest exists in database
          if (chest && chest.id > 0) {
            this.selectedChest = { id: chest.id, wx: chest.x, wy: chest.y, wz: chest.z, nickname: chest.nickname || 'Chest', items: chest.items || [], worldId: this.worldId };
            // Load saved items into chestInventory
            if (chest.items && chest.items.length > 0) {
              this.chestInventory = chest.items.concat(Array(27 - chest.items.length).fill(null));
            }
            this.showChestPanel = true;
          } else {
            // No chest at this location - don't open panel
            this.parentRef?.showNotification('No chest at this location');
          }
        }).catch(() => {
          this.chestLoading = false;
          this._loadingMessage = '';
        });
      }, 10); 
    }, 10);
  }

  openChest(ch: { id: number; wx: number; wy: number; wz: number; nickname: string; items: any[]; worldId: number }): void {
    const closed = this.closeAllPanels(true);
    if (closed.includes('chest')) return;
    
    // Wait for any pending save/load to complete first
    if (this.chestLoading || this.chestSaving) {
      this.parentRef?.showNotification('Please wait...');
      return;
    }
    
    setTimeout(() => {
      this.exitPointerLock();
      this.selectedChest = ch;
      // Initialize chest inventory with saved items or empty slots
      this.chestInventory = (ch.items || []).concat(Array(27 - (ch.items?.length || 0)).fill(null).map((_, i) => ch.items ? ch.items[i] : null));
      setTimeout(() => this.showChestPanel = true, 10);
    }, 10);
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
    if (!this.selectedChest || this.chestSaving) return;
    const userId = this.currentUser.id;
    if (!userId) return;

    // Save current chest state to temp variables before closing panel
    const tempChestId = this.selectedChest.id;
    const tempChestX = this.selectedChest.wx;
    const tempChestY = this.selectedChest.wy;
    const tempChestZ = this.selectedChest.wz;
    const tempItems = this.chestInventory.filter(i => i).map(item => ({ itemId: item!.itemId, quantity: item!.quantity })).filter(i => i.quantity > 0);

    // Close panel immediately so player can move
    this.selectedChest = null;
    this.showChestPanel = false;
    this.chestSaving = true;
    this.cdr.detectChanges();

    try {
      // Continue with saved temp variables
      let chestId = tempChestId;

      // Ensure we have a server chest id — try to find one or create it if missing
      if (!chestId || chestId === 0) {
        const existingChest = this.chests.find(c => c.wx === tempChestX && c.wy === tempChestY && c.wz === tempChestZ);
        if (existingChest) {
          chestId = existingChest.id;
        } else {
          const res = await this.digcraftService.placeChest(userId, this.worldId, tempChestX, tempChestY, tempChestZ);
          if (res && res.success) {
            const newChest = {
              id: res.id || Date.now(),
              wx: tempChestX,
              wy: tempChestY,
              wz: tempChestZ,
              nickname: `Chest ${this.chests.length + 1}`,
              items: [],
              worldId: this.worldId
            };
            this.chests.push(newChest);
            chestId = newChest.id;
          } else {
            console.error('Failed to create chest on server');
            return;
          }
        }
      }

      await this.digcraftService.updateChestItems(userId, this.worldId, chestId, tempItems);

      // Update local chest data if found
      const localChest = this.chests.find(c => c.id === chestId);
      if (localChest) {
        localChest.items = tempItems;
      }
    } catch (e) { console.error('saveChestItems error', e); }
    finally {
      this.chestSaving = false;
      this.cdr.detectChanges();
    }
  }


  placeBlock(): void {
    try { console.debug('[digcraft] placeBlock called', { placementBlock: this.placementBlock, selectedSlot: this.selectedSlot, held: this.inventory[this.selectedSlot] }); } catch (err) { }
    if (!this.placementBlock) { try { console.debug('[digcraft] placeBlock aborted: no placementBlock'); } catch (err) { } return; }
    const held = this.inventory[this.selectedSlot];
    if (!held || held.quantity <= 0) { try { console.debug('[digcraft] placeBlock aborted: nothing held or quantity <= 0', { held }); } catch (err) { } return; }

    // Check if bonfire is selected in hotbar
    if (held.itemId === BlockId.BONFIRE) {
      this.placeBonfire(this.placementBlock);
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

    // Watch - placeable decorative block with time display on top
    if (held.itemId === ItemId.WATCH) {
      const { wx, wy, wz } = this.placementBlock;
      const existingBlock = this.getWorldBlock(wx, wy, wz);
      if (INVULNERABLE_BLOCKS.includes(existingBlock)) return;
      if (!this.isWithinReachOfBody(wx + 0.5, wy + 0.5, wz + 0.5)) return;
      // Place the proper WATCH block (was incorrectly placing PLANK)
      this.setWorldBlock(wx, wy, wz, BlockId.WATCH, true, true, undefined, undefined, true);
      this.watchPlacedAt(wx, wy, wz);
      held.quantity--;
      if (held.quantity <= 0) { held.itemId = 0; held.quantity = 0; }
      this.scheduleInventorySave();
      this.exp += 1;
      this.checkLevelUp();
      return;
    }

    if (!isPlaceable(held.itemId)) { try { console.debug('[digcraft] placeBlock aborted: item not placeable', { itemId: held.itemId }); } catch (err) { } return; }

    const { wx, wy, wz } = this.placementBlock;

    // Don't allow placing on top of unstackable blocks (chest, bonfire) - must destroy first
    const existingBlock = this.getWorldBlock(wx, wy, wz);
    if (UNSTACKABLE_BLOCKS.includes(existingBlock)) { try { console.debug('[digcraft] placeBlock aborted: existing block unstackable', { existingBlock, wx, wy, wz }); } catch (err) { } return; }
 
    // Don't place inside player
    const dx = wx + 0.5 - this.camX;
    const dy = wy + 0.5 - this.camY;
    const dz = wz + 0.5 - this.camZ;
    if (Math.abs(dx) < 0.8 && Math.abs(dz) < 0.8 && dy > -2 && dy < 0.5) { try { console.debug('[digcraft] placeBlock aborted: placement inside player bounds', { dx, dy, dz }); } catch (err) { } return; }

    // Only allow placing blocks adjacent to player
    const wyCenter = wy + 0.5;
    if (!this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5)) { try { console.debug('[digcraft] placeBlock aborted: out of reach', { wx, wyCenter, wz }); } catch (err) { } return; }

    this.setWorldBlock(wx, wy, wz, held.itemId, true, true, undefined, undefined, true);
    try { console.debug('[digcraft] placeBlock after setWorldBlock', { wx, wy, wz, itemId: held.itemId }); } catch (err) { }
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
    // Can't attack while blocking with shield
    if (this.isDefending && this.leftHand === ItemId.SHIELD) return;
    // Mobile attack cooldown to prevent double-tap
    const now = performance.now();
    if (now - this.lastAttackTime < this.ATTACK_COOLDOWN_MS) return;
    this.lastAttackTime = now;
    // trigger local swing animation if equipped weapon is a sword/pickaxe (not bow)
    try { this.triggerSwing(); } catch (err) { }
    // Check if bow is equipped - bow fires arrows instead of breaking blocks
    if (this.equippedWeapon === ItemId.BOW) {
      this.fireBow().catch((err: any) => console.error('DigCraft: bow fire error', err));
      return;
    }
    // If the player has a weapon and is aiming at another player or a mob,
    // treat this as an attack and prevent the click from passing through
    // to block-breaking. Otherwise, perform block breaking as before.
    let handled = false;
    try {
      if (this.equippedWeapon) {
        let aimedPlayer = null;
        let aimedMob = null;
        aimedPlayer = this.findAimedPlayer();
        if (!aimedPlayer) {
          aimedMob = this.findAimedMob();
        }
        if (aimedPlayer || aimedMob) { 
          this.attemptAttack().catch((err: any) => console.error('DigCraft: attack error', err));  
          handled = true;
        }
      }
    } catch (err) { /* ignore detection errors */ }

    if (!handled && this.targetBlock && !INVULNERABLE_BLOCKS.includes(this.targetBlock.id ?? BlockId.AIR)) {
      this.damageBlock(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, this.targetBlock.id ?? BlockId.AIR);
    }
  }
  private getAttackRange(weaponId: number = this.equippedWeapon): number {
    return weaponId === ItemId.BOW ? BOW_ATTACK_MAX_RANGE : PLAYER_ATTACK_MAX_RANGE;
  }

  private getLookDirection(): { x: number; y: number; z: number } {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return {
      x: -sy * cp,
      y: sp,
      z: -cy * cp,
    };
  }

  private async fireBow(): Promise<void> {
    // Check if player has arrows
    const hasArrow = this.inventory.some(slot => slot && slot.itemId === ItemId.ARROW && slot.quantity > 0);
    if (!hasArrow) return;
    // Remove one arrow
    for (const slot of this.inventory) {
      if (slot && slot.itemId === ItemId.ARROW && slot.quantity > 0) {
        slot.quantity--;
        if (slot.quantity <= 0) slot.itemId = 0;
        break;
      }
    }
    // Reduce bow durability
    this.reduceEquippedDurability('hit');
    // Calculate arrow direction from camera
    const speed = 25;
    const look = this.getLookDirection();
    const dirX = look.x;
    const dirY = look.y;
    const dirZ = look.z;
    const now = performance.now();
    // Spawn arrow from slightly in front of player
    this.arrows.push({
      wx: this.camX + dirX * 0.35,
      wy: this.camY + dirY * 0.35,
      wz: this.camZ + dirZ * 0.35,
      vx: dirX * speed,
      vy: dirY * speed,
      vz: dirZ * speed,
      firedBy: this.currentUser.id ?? 0,
      startTime: now,
      lastUpdateTime: now
    });
    this.scheduleInventorySave();

    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return;

    const target = this.findAimedPlayer(this.getAttackRange(ItemId.BOW));
    if (target) {
      try {
        const res = await this.digcraftService.attack(userId, target.userId, this.worldId, this.equippedWeapon, this.camX, this.camY, this.camZ);
        if (res?.ok) {
          const p = this.otherPlayers.find(x => x.userId === res.targetUserId);
          if (p) p.health = res.health;
          if (res.damage && res.damage > 0) this.showDamagePopup(`-${res.damage}`);
        }
      } catch (err) {
        console.error('DigCraft: bow attack failed', err);
      }
      return;
    }

    const mob = this.findAimedMob(this.getAttackRange(ItemId.BOW));
    if (!mob) return;
    try {
      const res = await this.digcraftService.attackMob(userId, this.worldId, mob.id, this.equippedWeapon, this.camX, this.camY, this.camZ, true);
      if (!res?.ok) return;
      if (res.drops && Array.isArray(res.drops)) {
        for (const drop of res.drops) {
          if (drop && typeof drop.itemId === 'number' && typeof drop.quantity === 'number' && drop.quantity > 0) {
            let remaining = drop.quantity;
            for (const slot of this.inventory) {
              if (remaining <= 0) break;
              if (slot.itemId === drop.itemId && slot.quantity < MAX_STACK_SIZE) {
                const canAdd = Math.min(MAX_STACK_SIZE - slot.quantity, remaining);
                slot.quantity += canAdd;
                remaining -= canAdd;
              }
            }
            while (remaining > 0) {
              const empty = this.inventory.find(slot => !slot.itemId || slot.quantity <= 0);
              if (!empty) break;
              const placed = Math.min(MAX_STACK_SIZE, remaining);
              empty.itemId = drop.itemId;
              empty.quantity = placed;
              remaining -= placed;
            }
          }
        }
      }
      const localMob = this.mobs.find((m: any) => m && m.id === res.mobId);
      if (localMob) {
        localMob.health = res.health;
        if (res.dead) (localMob as any).dead = true;
      }
      if (res.damage && res.damage > 0) this.showDamagePopup(`-${res.damage}`);
    } catch (err) {
      console.error('DigCraft: bow mob attack failed', err);
    }
  }
  private updateArrows(): void {
    const now = performance.now();
    const gravity = 9.8;
    for (const arrow of this.arrows) {
      const dt = Math.max(0, (now - (arrow.lastUpdateTime || arrow.startTime)) / 1000);
      arrow.wx += arrow.vx * dt;
      arrow.wy += arrow.vy * dt;
      arrow.wz += arrow.vz * dt;
      arrow.vy -= gravity * dt;
      arrow.lastUpdateTime = now;
    }
    // Remove arrows older than 3 seconds or below world
    this.arrows = this.arrows.filter(a => now - a.startTime < 3000 && a.wy >= 0);
  }
  handleRightClick(e?: any): void {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try { console.debug('[digcraft] handleRightClick', { targetBlock: this.targetBlock, placementBlock: this.placementBlock, lastHitNonSolid: this.lastHitNonSolid }); } catch (err) { }
    // Place torch from left hand if holding torch in left (and not torch in right hand)
    const rightHeld = this.inventory[this.selectedSlot]?.itemId;
    const rightIsTorch = rightHeld === ItemId.TORCH || rightHeld === BlockId.TORCH;
    if (!rightIsTorch && (this.leftHand === ItemId.TORCH || this.leftHand === BlockId.TORCH) && this.targetBlock) {
      const { wx, wy, wz } = this.targetBlock;
      if (this.getWorldBlock(wx, wy, wz) === BlockId.AIR && !INVULNERABLE_BLOCKS.includes(this.getWorldBlock(wx, wy - 1, wz))) {
        this.setWorldBlock(wx, wy, wz, BlockId.TORCH, true, true, undefined, undefined, true);
        this.exp += 1;
        this.checkLevelUp();
        // Consume torch: first from inventory, then left hand as last resort
        let consumed = false;
        for (const slot of this.inventory) {
          if (slot.itemId === ItemId.TORCH && slot.quantity > 0) {
            slot.quantity--;
            if (slot.quantity <= 0) { slot.itemId = 0; slot.quantity = 0; }
            consumed = true;
            break;
          }
        }
        if (!consumed) {
          // Use the left hand torch
          this.leftHand = 0;
        }
        this.scheduleInventorySave();
        return;
      }
    }
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
    // Check if targetBlock is a non-solid block (bonfire can also be in targetBlock)
    if (this.targetBlock && (this.targetBlock.id === BlockId.BONFIRE || this.targetBlock.id === BlockId.CHEST)) {
      if (this.targetBlock.id === BlockId.BONFIRE) {
        this.openBonfirePanel();
        return;
      }
      if (this.targetBlock.id === BlockId.CHEST) {
        this.openChestPanel();
        return;
      }
    }
    // Check if right-clicking on crafting table (solid block, placed by player)
    if (this.targetBlock && this.targetBlock.id === BlockId.CRAFTING_TABLE) {
      this.openPanel('crafting', undefined, 'general');
      return;
    }
    // Check if right-clicking on smithing table (solid block)
    if (this.targetBlock && this.targetBlock.id === BlockId.SMITHING_TABLE) {
      this.openPanel('crafting', undefined, 'smithing');
      return;
    }
    // Check if right-clicking on furnace (solid block)
    if (this.targetBlock && this.targetBlock.id === BlockId.FURNACE) {
      this.openPanel('crafting', undefined, 'furnace');
      return;
    }
    // Cauldron interaction: lava bucket + cauldron = cauldron_lava + empty bucket
    if (this.targetBlock && this.targetBlock.id === BlockId.CAULDRON) {
      const { wx, wy, wz } = this.targetBlock;
      const held = this.inventory[this.selectedSlot];
      if (held && held.itemId === ItemId.LAVA_BUCKET && held.quantity > 0) {
        this.setWorldBlock(wx, wy, wz, BlockId.CAULDRON_LAVA, true, true, undefined, undefined, true);
        held.itemId = ItemId.EMPTY_BUCKET;
        held.quantity = 1;
        this.scheduleInventorySave();
        return;
      }
    }
    // Cauldron + water bucket = cauldron_water + empty bucket
    if (this.targetBlock && this.targetBlock.id === BlockId.CAULDRON) {
      const { wx, wy, wz } = this.targetBlock;
      const held = this.inventory[this.selectedSlot];
      if (held && held.itemId === ItemId.WATER_BUCKET && held.quantity > 0) {
        this.setWorldBlock(wx, wy, wz, BlockId.CAULDRON_WATER, true, true, undefined, undefined, true);
        held.itemId = ItemId.EMPTY_BUCKET;
        held.quantity = 1;
        this.scheduleInventorySave();
        return;
      }
    }
    // Cauldron_lava interaction: empty bucket + cauldron_lava = lava bucket + cauldron
    if (this.targetBlock && this.targetBlock.id === BlockId.CAULDRON_LAVA) {
      const { wx, wy, wz } = this.targetBlock;
      const held = this.inventory[this.selectedSlot];
      if (held && held.itemId === ItemId.EMPTY_BUCKET && held.quantity > 0) {
        this.setWorldBlock(wx, wy, wz, BlockId.CAULDRON, true, true, undefined, undefined, true);
        held.itemId = ItemId.LAVA_BUCKET;
        held.quantity = 1;
        this.scheduleInventorySave();
        return;
      }
    }
    // Cauldron_water interaction: empty bucket + cauldron_water = water bucket + cauldron
    if (this.targetBlock && this.targetBlock.id === BlockId.CAULDRON_WATER) {
      const { wx, wy, wz } = this.targetBlock;
      const held = this.inventory[this.selectedSlot];
      if (held && held.itemId === ItemId.EMPTY_BUCKET && held.quantity > 0) {
        this.setWorldBlock(wx, wy, wz, BlockId.CAULDRON, true, true, undefined, undefined, true);
        held.itemId = ItemId.WATER_BUCKET;
        held.quantity = 1;
        this.scheduleInventorySave();
        return;
      }
    }
    const heldSlot = this.inventory[this.selectedSlot];
    if (heldSlot && heldSlot.quantity > 0 && this.isFoodItem(heldSlot.itemId)) {
      this.eatFromInventorySlot(this.selectedSlot);
      return;
    }
    // Empty bucket: first water along ray (not only solid target)
    if (this.waterRayTarget) {
      const { wx, wy, wz } = this.waterRayTarget;
      const wyCenter = wy + 0.5;
      if (this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5) && this.collectWaterWithBucket(wx, wy, wz)) return;
    }

    // Lava bucket: collect lava
    if (this.lavaRayTarget) {
      const { wx, wy, wz } = this.lavaRayTarget;
      const wyCenter = wy + 0.5;
      if (this.isWithinReachOfBody(wx + 0.5, wyCenter, wz + 0.5) && this.collectLavaWithBucket(wx, wy, wz)) return;
    }

    // Water bucket: place into adjacent air cell (crevices / holes), same as block placement
    if (this.placementBlock) {
      const pw = this.placementBlock.wx;
      const py = this.placementBlock.wy;
      const pz = this.placementBlock.wz;
      const pyCenter = py + 0.5;
      if (this.isWithinReachOfBody(pw + 0.5, pyCenter, pz + 0.5) && this.placeWaterFromBucket(pw, py, pz)) return;
    }

    // Lava bucket: place into adjacent air cell
    if (this.placementBlock) {
      const pw = this.placementBlock.wx;
      const py = this.placementBlock.wy;
      const pz = this.placementBlock.wz;
      const pyCenter = py + 0.5;
      if (this.isWithinReachOfBody(pw + 0.5, pyCenter, pz + 0.5) && this.placeLavaFromBucket(pw, py, pz)) return;
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
    // Torch in left hand: can still open non-solid panels (bonfire/chest), or place torch from left hand
    if (this.leftHand === ItemId.TORCH || this.leftHand === BlockId.TORCH) {
      // Check if targeting a bonfire — open its panel first
      if (this.lastHitNonSolid && this.lastHitNonSolid.id === BlockId.BONFIRE) {
        this.openBonfirePanel();
        return;
      }
      // Check if targeting a chest — open its panel first
      if (this.lastHitNonSolid && this.lastHitNonSolid.id === BlockId.CHEST) {
        this.openChestPanel();
        return;
      }
      // Try to place torch block from left hand at targeted block position
      if (this.placementBlock) {
        const { wx, wy, wz } = this.placementBlock;
        const existingBlock = this.getWorldBlock(wx, wy, wz);
        if (!INVULNERABLE_BLOCKS.includes(existingBlock) && isPlaceable(BlockId.TORCH)) {
          const dx = wx + 0.5 - this.camX;
          const dy = wy + 0.5 - this.camY;
          const dz = wz + 0.5 - this.camZ;
          if (Math.abs(dx) < 0.8 && Math.abs(dz) < 0.8 && dy > -2 && dy < 0.5) return; // don't place inside player
          if (this.isWithinReachOfBody(wx + 0.5, wy + 0.5, wz + 0.5)) {
            this.setWorldBlock(wx, wy, wz, BlockId.TORCH, true, true, undefined, undefined, true);
            // Consume one torch from left hand (left hand holds itemId, not quantity, so just clear it)
            this.leftHand = 0;
            this.scheduleInventorySave();
            return;
          }
        }
      }
      return;
    }
    try { console.debug('[digcraft] handleRightClick aboutToPlace', { leftHand: this.leftHand, selectedSlot: this.selectedSlot, held: this.inventory[this.selectedSlot], placementBlock: this.placementBlock }); } catch (err) { }
    this.placeBlock();
  }

  handleSpaceBar(e?: any): void {
    if (this.isInWater) {
      this.velY = Math.max(this.velY ?? 0, 7.5);
      e.preventDefault();
    } else if (this.onGround) {
      this.velY = 9;
      this.onGround = false;
    }
  }

  // ═══════════════════════════════════════
  // Inventory
  // ═══════════════════════════════════════
  private applyMiningExhaustion(amount: number): void {
    if (amount <= 0) return;
    this.miningExhaustion += amount;
    const hungerLoss = Math.floor(this.miningExhaustion);
    if (hungerLoss <= 0) return;
    this.miningExhaustion -= hungerLoss;
    this.hunger = Math.max(0, this.hunger - hungerLoss);
    this.scheduleInventorySave();
  }

  private eatFromInventorySlot(index: number): void {
    const slot = this.inventory[index];
    if (!slot || slot.quantity <= 0) return;
    const food = FOOD_VALUES[slot.itemId];
    if (!food || this.hunger >= 20) return;
    const restored = Math.min(food.hungerRestored, 20 - this.hunger);
    if (restored <= 0) return;

    this.hunger += restored;
    slot.quantity -= 1;
    if (slot.quantity <= 0) {
      slot.itemId = 0;
      slot.quantity = 0;
    }

    this.showDamagePopup(`+${restored} food`);
    this.scheduleInventorySave();
  }

  consumeInventoryItem(itemId: number, quantity: number): boolean {  
    let remaining = quantity;
    let slotsToClear: InvSlot[] = [];
    for (const slot of this.inventory) {
      if (slot.itemId === itemId && slot.quantity > 0) {
        const consume = Math.min(slot.quantity, remaining);
        slot.quantity -= consume;
        remaining -= consume;
        if (slot.quantity <= 0) {
          slotsToClear.push(slot);
        }
      }
    }

    if (remaining <= 0) { 
      for (const slot of slotsToClear) {
        slot.itemId = 0;
        slot.quantity = 0;
      }
      this.scheduleInventorySave();
      return true;
    } else { 
      return false;
    }
  }

  eatSelectedInventoryItem(): void {
    if (this.selectedInventoryIndex === null) return;
    this.eatFromInventorySlot(this.selectedInventoryIndex);
  }

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

  /**
   * Sorts the player's inventory by consolidating stacks per item into as many full
   * stacks as possible, followed by a remainder stack if needed, and packs
   * all item stacks to the leftmost slots. Weapons and armor are placed last.
   */
  sortInventory(): void {
    // Phase 1: accumulate totals, separating non-weapon/armor from weapons/armor
    const totalsNon: Map<number, number> = new Map();
    const totalsWA: Map<number, number> = new Map(); 
    for (const slot of this.inventory) {
      const id = slot.itemId;
      if (!id || slot.quantity <= 0) continue;
      const qty = slot.quantity;
      const isWeap = typeof this.isWeaponItem === 'function' ? this.isWeaponItem(id) : false;
      const isArmor = typeof this.isArmorItem === 'function' ? this.isArmorItem(id) : false;
      const isShield = (id === ItemId.SHIELD);
      const isFood = typeof this.isFoodItem === 'function' ? this.isFoodItem(id) : false;
      if (isWeap || isArmor || isFood || isShield) {
        totalsWA.set(id, (totalsWA.get(id) ?? 0) + qty); 
      } else {
        totalsNon.set(id, (totalsNon.get(id) ?? 0) + qty);
      }
    }

    // Phase 2: determine first-seen order for non-weapon/armor
    const nonWeapOrder: number[] = [];
    const seenNon: Set<number> = new Set();
    for (const slot of this.inventory) {
      const id = slot.itemId;
      if (!id) continue;
      if (seenNon.has(id)) continue;
      const isWeap = typeof this.isWeaponItem === 'function' ? this.isWeaponItem(id) : false;
      const isArmor = typeof this.isArmorItem === 'function' ? this.isArmorItem(id) : false;
      const isFood = typeof this.isFoodItem === 'function' ? this.isFoodItem(id) : false;
      const isShield = (id === ItemId.SHIELD);
      if (!(isWeap || isArmor || isFood || isShield)) {
        seenNon.add(id);
        nonWeapOrder.push(id);
      }
    }

    // Phase 3: determine first-seen order for weapon/armor/food items
    const waOrder: number[] = [];
    const seenWA: Set<number> = new Set();
    for (const slot of this.inventory) {
      const id = slot.itemId;
      if (!id) continue;
      if (seenWA.has(id)) continue;
      const isWeap = typeof this.isWeaponItem === 'function' ? this.isWeaponItem(id) : false;
      const isArmor = typeof this.isArmorItem === 'function' ? this.isArmorItem(id) : false;
      const isFood = typeof this.isFoodItem === 'function' ? this.isFoodItem(id) : false;
      const isShield = (id === ItemId.SHIELD);
      if (isWeap || isArmor || isFood || isShield) {
        seenWA.add(id);
        waOrder.push(id);
      }
    }

    // Phase 4: build new inventory based on the two orders, consolidating stacks
    const newInv: InvSlot[] = [];
    // Non-weapon/armor/food items first
    for (const id of nonWeapOrder) {
      const total = totalsNon.get(id) ?? 0;
      if (total <= 0) continue;
      const fullStacks = Math.floor(total / MAX_STACK_SIZE);
      const rem = total % MAX_STACK_SIZE;
      for (let i = 0; i < fullStacks; i++) newInv.push({ itemId: id, quantity: MAX_STACK_SIZE });
      if (rem > 0) newInv.push({ itemId: id, quantity: rem });
    }
    // Then weapons/armor/food
    for (const id of waOrder) {
      const total = totalsWA.get(id) ?? 0;
      if (total <= 0) continue;
      const fullStacks = Math.floor(total / MAX_STACK_SIZE);
      const rem = total % MAX_STACK_SIZE;
      for (let i = 0; i < fullStacks; i++) newInv.push({ itemId: id, quantity: MAX_STACK_SIZE });
      if (rem > 0) newInv.push({ itemId: id, quantity: rem });
    }

    // Pad to fixed inventory length
    while (newInv.length < MAX_INVENTORY_LENGTH) newInv.push({ itemId: 0, quantity: 0 });
    if (newInv.length > MAX_INVENTORY_LENGTH) newInv.length = MAX_INVENTORY_LENGTH;

    this.inventory = newInv;
    this.scheduleInventorySave();
    this.selectedInventoryIndex = null;
  }

  openRespawnConfirmPrompt() {
    this.closePanel('inventory');
    setTimeout(() => {
      this.showRespawnConfirmPrompt = true;
      this.exitPointerLock();
    }, 150);
  }

  async onRespawnConfirmSubmit(result: string): Promise<void> {
    if (result !== 'yes') {
      this.openPanel('inventory');
      return;
    } else {
      this.closePanel('inventory');
    }
    this.isRespawning = true;

    setTimeout(async () => {
      const userId = this.currentUser.id ?? 0;
      setTimeout(async () => {
        await this.digcraftService.killPlayer(userId, this.worldId);
        this.showRespawnConfirmPrompt = false;
        this.isRespawning = false;
      }, 10);
    }, 150);
  }

  private async saveInventory(): Promise<void> {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    const slots = this.inventory
      .map((s, i) => ({ slot: i, itemId: s.itemId, quantity: s.quantity }))
      .filter(s => s.quantity > 0);
    const equipment = { helmet: this.equippedArmor.helmet, chest: this.equippedArmor.chest, legs: this.equippedArmor.legs, boots: this.equippedArmor.boots, weapon: this.equippedWeapon, leftHand: this.leftHand };
    await this.digcraftService.saveInventory(userId, this.worldId, slots, equipment, this.hunger);
  }

  getItemName(id: number): string {
    return ITEM_NAMES[id] ?? `Item ${id}`;
  }

  getItemTooltip(id: number): string {
    if (id === ItemId.WATCH) {
      const timeStr = this.getGameTimeString();
      return `${ITEM_NAMES[id] ?? `Item ${id}`}\n🕐 ${timeStr}`;
    }
    return ITEM_NAMES[id] ?? `Item ${id}`;
  }

  getGameTimeString(): string {
    const segmentMs = 10 * 60 * 1000;
    const nowMs = Date.now();
    const segIdx = Math.floor(nowMs / segmentMs);
    const isDaySeg = (segIdx % 2) === 0;
    const posInSeg = nowMs % segmentMs;
    const phase = posInSeg / segmentMs;
    const halfPhase = phase * 2;
    if (isDaySeg) {
      const ticks = Math.floor(halfPhase * 12000);
      const hour = Math.floor(ticks / 1000);
      const minute = Math.floor((ticks % 1000) / 1000 * 60);
      return `${hour}:${minute.toString().padStart(2, '0')} AM`;
    } else {
      const ticks = Math.floor(halfPhase * 12000);
      const hour = Math.floor(ticks / 1000);
      const minute = Math.floor((ticks % 1000) / 1000 * 60);
      return `${hour}:${minute.toString().padStart(2, '0')} PM`;
    }
  }

  getItemColor(id: number): string {
    return ITEM_COLORS[id] ?? '#888';
  }

  getItemIcon(id: number): string {
    // Items 0-99 are placeable blocks (same as BlockId), 100+ are tools/armor/items
    if (id < 100) {
      return BLOCK_ICONS[id] ?? '';
    }
    return ITEM_ICONS[id] ?? '';
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
  /** When a recipe becomes available, add it to the known recipes set and save to server if it's new */
  addRecipeToKnown(recipeId: number): void {
    if (!this.knownRecipeIds.has(recipeId)) {
      this.knownRecipeIds.add(recipeId);
      this.digcraftService.addKnownRecipe(this.currentUser.id ?? 0, recipeId).catch(() => {
        console.error('Failed to save known recipe to server');
      });
    }
  }

  updateAvailableRecipes(): void {
    // Filter by crafting type if not general
    let recipes = RECIPES;
    if (this.craftingType !== 'general') {
      recipes = RECIPES.filter(r => r.recipeType === this.craftingType);
    }
    // Track known recipes
    const craftable = recipes.filter(r => this.canCraft(r));
    for (const r of craftable) {
      this.addRecipeToKnown(r.id);
    }
    // In crafting mode: only show craftable
    // In recipes mode: show all known (or craftable if no known yet)
    let recipesToShow: CraftRecipe[];
    if (this.craftingMode === 'crafting') {
      recipesToShow = craftable;
    } else {
      // Show all recipes that have been discovered
      const known = recipes.filter(r => this.knownRecipeIds.has(r.id));
      recipesToShow = known.length > 0 ? known : craftable;
    }
    // Sort alphabetically by recipe name
    this.availableRecipes = recipesToShow.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  canCraft(recipe: CraftRecipe): boolean {
    // Check ingredients from inventory + equipped armor + equipped weapon
    for (const ing of recipe.ingredients) {
      let have = 0;
      for (const slot of this.inventory) {
        if (slot.itemId === ing.itemId) have += slot.quantity;
      }
      // Check equipped armor
      if (ing.itemId === this.equippedArmor.helmet) have++;
      if (ing.itemId === this.equippedArmor.chest) have++;
      if (ing.itemId === this.equippedArmor.legs) have++;
      if (ing.itemId === this.equippedArmor.boots) have++;
      // Check equipped weapon
      if (ing.itemId === this.equippedWeapon) have++;
      if (have < ing.quantity) return false;
    }

    // Check if result would fit in inventory
    const resultId = recipe.result.itemId;
    const resultQty = recipe.result.quantity;
    for (const slot of this.inventory) {
      if (slot.itemId === resultId && slot.quantity + resultQty <= 64) return true;
    }
    for (const slot of this.inventory) {
      if (slot.quantity <= 0) return true;
    }
    return false;
  }

  hasIngredient(ing: { itemId: number; quantity: number }): boolean {
    let have = 0;
    for (const slot of this.inventory) {
      if (slot.itemId === ing.itemId) have += slot.quantity;
    }
    if (ing.itemId === this.equippedArmor.helmet) have++;
    if (ing.itemId === this.equippedArmor.chest) have++;
    if (ing.itemId === this.equippedArmor.legs) have++;
    if (ing.itemId === this.equippedArmor.boots) have++;
    if (ing.itemId === this.equippedWeapon) have++;
    return have >= ing.quantity;
  }

  canCraftAtStation(recipe: CraftRecipe): boolean {
    if (!this.canCraft(recipe)) return false;
    // Check station requires
    if (recipe.requiresFurnace && this.craftingType !== 'furnace') return false;
    if (recipe.requiresSmithingTable && this.craftingType !== 'smithing') return false;
    if (this.craftingType !== 'general' && this.craftingType !== recipe.recipeType && !recipe.requiresFurnace && !recipe.requiresSmithingTable) return false;
    return true;
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
    // Check which ingredients are equipped so we don't add them back after swapping
    const equippedItemsUsedAsIngredient = new Set<number>();
    for (const ing of recipe.ingredients) {
      if (ing.itemId === this.equippedArmor.helmet ||
        ing.itemId === this.equippedArmor.chest ||
        ing.itemId === this.equippedArmor.legs ||
        ing.itemId === this.equippedArmor.boots ||
        ing.itemId === this.equippedWeapon) {
        equippedItemsUsedAsIngredient.add(ing.itemId);
      }
    }

    // Consume ingredients from inventory
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
      // If still need more and equipped item matches, mark it as consumed (will be swapped out)
      if (need > 0 && equippedItemsUsedAsIngredient.has(ing.itemId)) {
        // equipped item will be consumed by the swap below
      }
    }

    // Auto-equip armor: swap with existing if equipped, or equip to empty slot
    const armorSlot = this.getArmorType(recipe.result.itemId);
    if (armorSlot) {
      const existingArmor = this.equippedArmor[armorSlot];
      this.equippedArmor[armorSlot] = recipe.result.itemId;
      const dur = getItemDurability(recipe.result.itemId);
      this.equippedArmorDurability[armorSlot] = dur ? dur.maxDurability : 0;
      // Only add back to inventory if it wasn't used as an ingredient
      if (existingArmor !== 0 && !equippedItemsUsedAsIngredient.has(existingArmor)) {
        this.addToInventory(existingArmor, 1);
      }
      const restQty = recipe.result.quantity - 1;
      if (restQty > 0) this.addToInventory(recipe.result.itemId, restQty);
      this.scheduleInventorySave();
    } else if (this.isWeaponItem(recipe.result.itemId)) {
      const existingWeapon = this.equippedWeapon;
      this.equippedWeapon = recipe.result.itemId;
      const dur = getItemDurability(recipe.result.itemId);
      this.equippedWeaponDurability = dur ? dur.maxDurability : 0;
      // Only add back to inventory if it wasn't used as an ingredient
      if (existingWeapon !== 0 && !equippedItemsUsedAsIngredient.has(existingWeapon)) {
        this.addToInventory(existingWeapon, 1);
      }
      const restQty = recipe.result.quantity - 1;
      if (restQty > 0) this.addToInventory(recipe.result.itemId, restQty);
      this.scheduleInventorySave();
    } else if (recipe.result.itemId === ItemId.SHIELD || recipe.result.itemId === ItemId.TORCH || recipe.result.itemId === BlockId.TORCH) {
      // Auto-equip to left hand if empty, add rest to inventory
      // Normalise block-based torches/watch to their item IDs so inventory
      // consumption (which looks for ItemId.TORCH) works correctly.
      let equipId = recipe.result.itemId;
      let invId = recipe.result.itemId;
      if (recipe.result.itemId === BlockId.TORCH || recipe.result.itemId === ItemId.TORCH) { equipId = ItemId.TORCH; invId = ItemId.TORCH; }
      if (this.leftHand === 0) {
        this.leftHand = equipId;
        const restQty = recipe.result.quantity - 1;
        if (restQty > 0) this.addToInventory(invId, restQty);
      } else {
        this.addToInventory(invId, recipe.result.quantity);
      }
      this.scheduleInventorySave();
    } else {
      this.addToInventory(recipe.result.itemId, recipe.result.quantity);
    }

    this.addRecipeToKnown(recipe.id);
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
      console.error('Error scheduling scroll to last crafted item', e);
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
      console.error('Error scrolling to last crafted item', e);
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
      players = await this.digcraftService.syncPlayers(
        userId, this.worldId, this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.bodyYaw,
        this.isAttacking, this.isDefending, this.leftHand,
        this.equippedWeaponDurability,
        this.equippedArmorDurability.helmet,
        this.equippedArmorDurability.chest,
        this.equippedArmorDurability.legs,
        this.equippedArmorDurability.boots
      );
      let brokenItems: Array<{ itemId: number; slot: string }> = [];
      if (Array.isArray((players as any).players)) {
        brokenItems = (players as any).brokenItems || [];
        players = (players as any).players as DCPlayer[];
      }

      // Handle broken item notifications from server
      for (const broken of brokenItems) {
        const name = this.getItemName(broken.itemId);
        this.showDamagePopup(`❌ ${name} broke!`, 2000);
        if (broken.slot === 'weapon') {
          this.equippedWeapon = 0;
          this.equippedWeaponDurability = 0;
        } else if (broken.slot === 'helmet') {
          this.equippedArmor.helmet = 0;
          this.equippedArmorDurability.helmet = 0;
        } else if (broken.slot === 'chest') {
          this.equippedArmor.chest = 0;
          this.equippedArmorDurability.chest = 0;
        } else if (broken.slot === 'legs') {
          this.equippedArmor.legs = 0;
          this.equippedArmorDurability.legs = 0;
        } else if (broken.slot === 'boots') {
          this.equippedArmor.boots = 0;
          this.equippedArmorDurability.boots = 0;
        }
      }
      
      // Detect knockback from health drop + position change (not just position change)
      const now = performance.now();
      for (const p of players) {
        const last = this.lastServerPos.get(p.userId);
        const prevPlayer = this.otherPlayers.find(op => op.userId === p.userId);
        if (last && prevPlayer && now - last.time < 1000) {
          const dx = p.posX - last.x;
          const dz = p.posZ - last.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const healthDropped = (prevPlayer.health || 20) > (p.health || 20);
          if (dist > 0.3 && healthDropped) {
            this.playerKnockback.set(p.userId, { vx: dx, vz: dz, startTime: now });
          }
        }
        this.lastServerPos.set(p.userId, { x: p.posX, y: p.posY, z: p.posZ, time: now });
      }
      this._syncCounter++;
      const myId = this.currentUser.id ?? 0;
      const serverPlayers = players.filter(p => p.userId !== myId);

      if (this._syncCounter % 5 === 1) {
        const stable: Array<DCPlayer & { missingCount: number }> = [];
        for (const sp of serverPlayers) {
          const existing = this.stableOtherPlayers.find(o => o.userId === sp.userId);
          if (existing) {
            stable.push({ ...sp, missingCount: 0 });
          } else {
            stable.push({ ...sp, missingCount: 0 });
          }
        }
        for (const existing of this.stableOtherPlayers) {
          if (!serverPlayers.find(sp => sp.userId === existing.userId)) {
            existing.missingCount++;
            if (existing.missingCount < 5) {
              stable.push(existing);
            }
          }
        }
        this.stableOtherPlayers = stable;
      } else {
        for (const sp of serverPlayers) {
          const existing = this.stableOtherPlayers.find(o => o.userId === sp.userId);
          if (existing) {
            Object.assign(existing, sp);
            existing.missingCount = 0;
          }
        }
      }

      this.otherPlayers = players;

      // Load party members
      if (myId > 0) {
        await this.refreshPartyMembers();
      }

      const me = players.find(p => p.userId === myId);
      if (me && typeof me.health === 'number') this.applyLocalHealth(me.health);
      // Don't overwrite hunger if client has higher value (e.g. just ate). 
      // Server saves hunger every ~3s, but polls every 250ms, so client is often fresher.
      if (me && typeof me.hunger === 'number') {
        if (this.hunger < me.hunger) {
          this.hunger = me.hunger;
        }
        // Detect player damage for flash effect
        const prevHealth: number|undefined = this.playerLastHealth.get(myId);
        if (prevHealth !== undefined && me.health < prevHealth) {
          // Player took damage - flash red for 200ms
          this.playerDamageFlash.set(myId, performance.now() + 200);
        }
        this.playerLastHealth.set(myId, me.health);
      }
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
    // Skip damage if player is invulnerable
    if (!suppressFlash && newHealth < this.health && this.isInvulnerable) {
      return; // ignore damage while invulnerable
    }
    const prev = typeof this.health === 'number' ? this.health : 0;
    this.health = newHealth;
    // If health dropped, trigger flash and popup
    if (!suppressFlash && typeof newHealth === 'number' && newHealth < prev) {
      this.triggerDamageFlash();
      if (typeof damage === 'number' && damage > 0) this.showDamagePopup(`-${damage}`);
    }

    // If we've died, show the forced respawn prompt (block other actions)
    if (typeof newHealth === 'number' && newHealth <= 0) {
      console.log(`Player died, health=${newHealth}, showRespawnPrompt was=${this.showRespawnPrompt}`);
      // ensure pointer is released so the overlay can capture input
      this.exitPointerLock();
      this._showRespawnPrompt = true;
      this.onMenuStateChanged();
      try { this.cdr.detectChanges(); } catch (e) { /* noop */ }
      console.log(`Player died, showRespawnPrompt now=${this.showRespawnPrompt}`);
      return;
    }

    try { this.cdr.detectChanges(); } catch (e) { /* noop */ }
  }

  async confirmRespawn(): Promise<void> {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || this.isRespawning) return;
    this.isRespawning = true;
    this.cdr.detectChanges();
    setTimeout(async () => {
      try {
        const res = await this.digcraftService.respawn(userId, this.worldId);
        console.log(`respawn response:`, res);
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
          this.inventory = new Array(MAX_INVENTORY_LENGTH).fill(null).map(() => ({ itemId: 0, quantity: 0 }));
          this.equippedWeapon = 0;
          this.equippedArmor = { helmet: 0, chest: 0, legs: 0, boots: 0 };
          await this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE));
          await this.ensureFreeSpaceAt(this.camX, this.camY, this.camZ);
        }
      } catch (err) {
        console.error('DigCraft: respawn failed', err);
      } finally {
        this.isRespawning = false;
        this.showRespawnPrompt = false;

        this.setInvulnerabilitySeconds(60);
        this.cdr.detectChanges();
      }
    }, 10);
  }

  private setInvulnerabilitySeconds(seconds: number): void {
    this.invulnerableUntil = performance.now() + (seconds * 1000);
  }
  private triggerDamageFlash(duration = 320): void {
    if (this.damageFlashTimeout) clearTimeout(this.damageFlashTimeout);
    this.isDamageFlash = true;
    try { this.cdr.detectChanges(); } catch (e) { /* noop */ }
    this.damageFlashTimeout = setTimeout(() => {
      this.isDamageFlash = false;
      try { this.cdr.detectChanges(); } catch (e) { /* noop */ }
      this.damageFlashTimeout = null;
    }, duration);
  }
  onTouchBreak(): void {
    // Mobile attack cooldown to prevent double-tap
    const now = performance.now();
    if (now - this.lastAttackTime < this.ATTACK_COOLDOWN_MS) return;
    this.lastAttackTime = now;
    // Mobile left-click: trigger swing animation and attack players/mobs, then damage block
    this.triggerSwing();
    if (this.targetBlock) {
      this.damageBlock(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, this.targetBlock.id ?? BlockId.AIR);
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
        await this.digcraftService.placeBlocks(userId, this.worldId, batchItems); 
      } catch (e) {
        console.error('Batch placeBlocks failed.', e);
      }
    }
  }

  onTouchJump(e?: any): void {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    // Execute immediately
    this.doTouchJump();
    // Start interval for holding (repeat every 500ms)
    if (this.touchJumpHoldInterval) clearInterval(this.touchJumpHoldInterval);
    this.touchJumpHoldInterval = setInterval(() => {
      this.doTouchJump();
    }, 500);
  }

  private doTouchJump(): void {
    // Check if on ground or in water (can always jump from water like desktop does)
    if (this.onGround || this.isInWater) {
      if (this.isInWater) {
        this.velY = Math.max(this.velY ?? 0, 7.5);
      } else {
        this.velY = 9;
        this.onGround = false;
      }
    }
  }

  onTouchJumpRelease(): void {
    if (this.touchJumpHoldInterval) {
      clearInterval(this.touchJumpHoldInterval);
      this.touchJumpHoldInterval = null;
    }
  }

  onTouchAttack(): void {
    if (this.showInventory || this.showCrafting || this.showBonfirePanel || this.showChestPanel) return;
    // Execute immediately
    this.handleLeftClick();
    // Start interval for holding (repeat every 500ms)
    if (this.touchAttackHoldInterval) clearInterval(this.touchAttackHoldInterval);
    this.touchAttackHoldInterval = setInterval(() => {
      this.handleLeftClick();
    }, 500);
  }

  onTouchAttackRelease(): void {
    if (this.touchAttackHoldInterval) {
      clearInterval(this.touchAttackHoldInterval);
      this.touchAttackHoldInterval = null;
    }
  }

  onTouchPlace(): void {
    if (this.showInventory || this.showCrafting || this.showBonfirePanel || this.showChestPanel) return;
    // If left hand has item, use block; otherwise place
    if (this.leftHand && this.leftHand > 0) {
      this.handleBlock();
    } else {
      this.handleRightClick();
    }
    // Start interval for holding (repeat every 500ms)
    if (this.touchPlaceHoldInterval) clearInterval(this.touchPlaceHoldInterval);
    this.touchPlaceHoldInterval = setInterval(() => {
      if (this.leftHand && this.leftHand > 0) {
        this.handleBlock();
      } else {
        this.handleRightClick();
      }
    }, 500);
  }

  onTouchPlaceRelease(): void {
    if (this.touchPlaceHoldInterval) {
      clearInterval(this.touchPlaceHoldInterval);
      this.touchPlaceHoldInterval = null;
    }
    this.handleBlockRelease();
  }

  handleBlock(): void {
    if (!this.leftHand) return; // Need torch or shield equipped
    this.isDefending = true;
  }

  handleBlockRelease(): void {
    this.isDefending = false;
  }

  toggleLeftHand(itemId: number): void {
    // Toggle off if same item already equipped, otherwise switch to it
    if (this.leftHand === itemId) {
      this.leftHand = 0;
    } else {
      this.leftHand = itemId;
    }
  }

  requestPointerLock(): void {
    return requestPointerLock(this);
  }

  getGroundLevelBelow(): number {
    const gx = Math.floor(this.camX), gz = Math.floor(this.camZ);
    const startY = Math.min(Math.floor(this.camY - 1.6) + 2, WORLD_HEIGHT - 1);
    for (let y = startY; y >= 0; y--) {
      const b = this.getWorldBlock(gx, y, gz);
      if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LEAVES) return y;
    }
    return -1;
  }

  // Joystick knob transform delegates to shared handler
  getJoystickKnobTransform(): string {
    return getJoystickKnobTransform(this);
  }

  // Enqueue a block change for batched, throttled persistence
  private enqueuePlaceChange(item: { chunkX: number; chunkZ: number; localX: number; localY: number; localZ: number; blockId: number; waterLevel?: number; fluidIsSource?: boolean; previousBlockId?: number, aboveBlockId?: number, belowBlockId?: number, leftBlockId?: number, rightBlockId?: number }): void {
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
      // Capture pre-sync equipment durabilities for the current player
      const preEquip = this.getClientEquipmentSnapshot();
      const res = await this.digcraftService.placeBlocks(userId, this.worldId, itemsToSend, preEquip); 
      // If server returned authoritative equipment, apply updates (display breaks)
      if (res && (res as any).equipment) {
        this.applyServerEquipment((res as any).equipment, preEquip);  
      }
    } catch (e) { 
      console.error('DigCraft: flushPendingPlaceItems error', e);
    }
  }

  // Build a snapshot of the current player's equipment + durability for sending to server
  private getClientEquipmentSnapshot(): any {
    return {
      weapon: this.equippedWeapon || 0,
      weaponDur: typeof this.equippedWeaponDurability === 'number' ? this.equippedWeaponDurability : -1,
      helmet: this.equippedArmor.helmet || 0,
      helmetDur: typeof this.equippedArmorDurability.helmet === 'number' ? this.equippedArmorDurability.helmet : -1,
      chest: this.equippedArmor.chest || 0,
      chestDur: typeof this.equippedArmorDurability.chest === 'number' ? this.equippedArmorDurability.chest : -1,
      legs: this.equippedArmor.legs || 0,
      legsDur: typeof this.equippedArmorDurability.legs === 'number' ? this.equippedArmorDurability.legs : -1,
      boots: this.equippedArmor.boots || 0,
      bootsDur: typeof this.equippedArmorDurability.boots === 'number' ? this.equippedArmorDurability.boots : -1,
      leftHand: this.leftHand || 0,
      leftHandDur: -1
    };
  }

  // Apply server-provided equipment after a sync; compare with pre-snapshot to detect breaks
  private applyServerEquipment(serverEquip: any, preEquip: any): void {
    if (!serverEquip) return;
    // Weapon
    const prevWeapon = preEquip?.weapon || 0; const prevWDur = preEquip?.weaponDur ?? -1;
    const newWeapon = serverEquip.weapon || 0; const newWDur = (serverEquip.weaponDur !== undefined) ? serverEquip.weaponDur : (newWeapon > 0 ? this.equippedWeaponDurability : 0);
    if (prevWeapon > 0 && newWeapon === 0) {
      const name = this.getItemName(prevWeapon);
      this.showDamagePopup(`❌ ${name} broke!`, 2000);
    }
    this.equippedWeapon = newWeapon;
    if (typeof newWDur === 'number' && newWDur >= 0) this.equippedWeaponDurability = newWDur;

    // Armor pieces
    const armourSlots: Array<'helmet'|'chest'|'legs'|'boots'> = ['helmet','chest','legs','boots'];
    for (const slot of armourSlots) {
      const prevId = preEquip?.[slot] || 0;
      const newId = serverEquip?.[slot] || 0;
      const durKey = slot + 'Dur';
      const newDur = serverEquip?.[durKey] !== undefined ? serverEquip[durKey] : (newId > 0 ? this.equippedArmorDurability[slot] : 0);
      if (prevId > 0 && newId === 0) {
        const name = this.getItemName(prevId);
        this.showDamagePopup(`❌ ${name} broke!`, 2000);
      }
      this.equippedArmor[slot] = newId;
      if (typeof newDur === 'number' && newDur >= 0) this.equippedArmorDurability[slot] = newDur;
    }
  }

  private getArmorType(itemId: number): 'helmet' | 'chest' | 'legs' | 'boots' | null {
    switch (itemId) {
      case ItemId.LEATHER_HELMET: case ItemId.IRON_HELMET: case ItemId.DIAMOND_HELMET: case ItemId.NETHERITE_HELMET: case ItemId.COPPER_HELMET: case ItemId.GOLD_HELMET:
        return 'helmet';
      case ItemId.LEATHER_CHEST: case ItemId.IRON_CHEST: case ItemId.DIAMOND_CHEST: case ItemId.NETHERITE_CHEST: case ItemId.COPPER_CHEST: case ItemId.GOLD_CHEST:
        return 'chest';
      case ItemId.LEATHER_LEGS: case ItemId.IRON_LEGS: case ItemId.DIAMOND_LEGS: case ItemId.NETHERITE_LEGS: case ItemId.COPPER_LEGS: case ItemId.GOLD_LEGS:
        return 'legs';
      case ItemId.LEATHER_BOOTS: case ItemId.IRON_BOOTS: case ItemId.DIAMOND_BOOTS: case ItemId.NETHERITE_BOOTS: case ItemId.COPPER_BOOTS: case ItemId.GOLD_BOOTS:
        return 'boots';
      default:
        return null;
    }
  }

  isFoodItem(itemId: number): boolean {
    return !!FOOD_VALUES[itemId];
  }

  isArmorItem(itemId: number): boolean {
    return this.getArmorType(itemId) !== null;
  }

  // Weapon helpers
  isWeaponItem(itemId: number): boolean {
    return this.isSwordItem(itemId) || this.isPickaxeItem(itemId) || this.isAxeItem(itemId) || this.isBowItem(itemId) || this.isTorchItem(itemId);
  }

  isSwordItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_SWORD: case ItemId.STONE_SWORD: case ItemId.COPPER_SWORD: case ItemId.GOLD_SWORD: case ItemId.IRON_SWORD: case ItemId.DIAMOND_SWORD: case ItemId.NETHERITE_SWORD:
        return true;
      default: return false;
    }
  }

  isPickaxeItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_PICKAXE: case ItemId.STONE_PICKAXE: case ItemId.COPPER_PICKAXE: case ItemId.GOLD_PICKAXE: case ItemId.IRON_PICKAXE: case ItemId.DIAMOND_PICKAXE: case ItemId.NETHERITE_PICKAXE:
        return true;
      default: return false;
    }
  }

  isAxeItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_AXE: case ItemId.STONE_AXE: case ItemId.COPPER_AXE: case ItemId.GOLD_AXE: case ItemId.IRON_AXE: case ItemId.DIAMOND_AXE: case ItemId.NETHERITE_AXE:
        return true;
      default: return false;
    }
  }

  isBowItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.BOW:
        return true;
      default:
        return false;
    }
  }

  isTorchItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.TORCH:
        return true;
      case BlockId.TORCH:
        return true;
      default:
        return false;
    }
  }

  weaponTypeClass(): string {
    const id = this.equippedWeapon;
    if (!id) return '';
    if (this.isSwordItem(id)) return 'sword';
    if (this.isPickaxeItem(id)) return 'pickaxe';
    if (this.isAxeItem(id)) return 'axe';
    if (this.isBowItem(id)) return 'bow';
    if (this.isTorchItem(id)) return 'torch';
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

  unequipWeapon(skipSave = false): void {
    const itemId = this.equippedWeapon;
    if (!itemId || itemId === 0) return;
    const ok = this.addToInventory(itemId, 1);
    if (ok) this.equippedWeapon = 0;
    if (ok && !skipSave) {
      this.scheduleInventorySave();
    }
  }

  isLeftHandItem(itemId: number): boolean {
    if (!itemId) return false;
    return this.isTorchItem(itemId) || itemId === ItemId.SHIELD;
  }

  equipLeftHand(slotIndex: number): void {
    const slot = this.inventory[slotIndex];
    if (!slot || slot.quantity <= 0) return;
    if (!this.isLeftHandItem(slot.itemId)) return;

    const itemId = slot.itemId;
    const prevEquipped = this.leftHand;

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

    this.leftHand = itemId;
    this.scheduleInventorySave();
  }

  unequipLeftHand(skipSave = false): void {
    const itemId = this.leftHand;
    if (!itemId || itemId === 0) return;
    const ok = this.addToInventory(itemId, 1);
    if (ok) this.leftHand = 0;
    if (ok && !skipSave) {
      this.scheduleInventorySave();
    }
  }

  unequipArmor(slotType: 'helmet' | 'chest' | 'legs' | 'boots', skipSave = false): void {
    const itemId = this.equippedArmor[slotType];
    if (!itemId || itemId === 0) return;
    const ok = this.addToInventory(itemId, 1);
    if (ok) this.equippedArmor[slotType] = 0;
    if (ok && !skipSave) {
      this.scheduleInventorySave();
    }
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

  closeRespawnConfirm(reopenInventory = false): void {
    this.showRespawnConfirmPrompt = false;
    if (reopenInventory) {
      setTimeout(() => {
        this.openPanel('inventory');
      }, 50);
    } else {
      this.requestPointerLock();
    }
  }
  async closeLoginPanel() {
    this.isShowingLoginPanel = false;
    //this.parentRef?.closeOverlay();
    setTimeout(async () => {
      await this.ngOnInit();
      if (this.currentUser.id) {
        await this.joinWorld();
      }
    }, 50);
  }

  safeExit(e?: Event): void {
    if (e && typeof (e as Event).preventDefault === 'function') try { (e as Event).preventDefault(); } catch { }
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
  closeAllPanels(skipPointerLock: boolean = false): string[] {
    const closed: string[] = []; 
    if (this.showInventory) {
      this.showInventory = false;
      this.showFacePicker = false;
      this.showFaceCreator = false;
      this.isTypingMode = false;
      closed.push('inventory');
    }
    if (this.showCrafting) {
      this.showCrafting = false;
      closed.push('crafting');
    }
    if (this.showPlayersPanel) {
      this.showPlayersPanel = false;
      this.partyErrorMessage = '';
      this.stopInvitePolling();
      closed.push('players');
    }
    if (this.showWorldPanel) { this.showWorldPanel = false; closed.push('world'); }
    if (this.showBonfirePanel) { this.showBonfirePanel = false; closed.push('bonfire'); }
    if (this.showChestPanel) {
      this.selectedChest = null;
      this.showChestPanel = false;
      closed.push('chest');
    }
    if (this.isMenuPanelOpen) {
      this.isMenuPanelOpen = false;
      closed.push('menu');
    }
    
    if (!skipPointerLock) {
      this.canvasRef?.nativeElement?.requestPointerLock(); 
    }  
    return closed;
  }

  openPanel(panel: 'inventory' | 'crafting' | 'players' | 'world' | 'bonfire' | 'chest' | 'menu', e?: Event, craftingType?: 'general' | 'smithing' | 'furnace'): void {
    if (e && typeof (e as Event).preventDefault === 'function') try { (e as Event).preventDefault(); } catch { }

    const closed = this.closeAllPanels(true);
    if (closed.includes(panel)) {
      this.canvasRef?.nativeElement?.requestPointerLock(); 
      return;
    }
    setTimeout(() => {
      switch (panel) {
        case 'inventory': {
          this.showInventory = true;
          break;
        }
        case 'crafting': {
          this.craftingType = craftingType ?? 'general';
          this.craftingMode = 'crafting';
          this.updateAvailableRecipes();
          setTimeout(() => {
            this.showCrafting = true;
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
      this.exitPointerLock(); 
    }, 10);
  }


  closePanel(panel: 'inventory' | 'crafting' | 'players' | 'world' | 'bonfire' | 'chest' | 'menu' | 'chat'): void { 
    setTimeout(() => {
      switch (panel) {
        case 'inventory': {
          this.showInventory = false;
          this.showFacePicker = false;
          this.showFaceCreator = false;
          this.isTypingMode = false;
          break;
        }
        case 'players': {
          this.showPlayersPanel = false;
          this.partyErrorMessage = '';
          this.stopInvitePolling();
          break;
        }
        case 'crafting': this.showCrafting = false; break;
        case 'world': this.showWorldPanel = false; break;
        case 'bonfire': this.showBonfirePanel = false; break;
        case 'chest': { 
          if (this.chestLoading || this.chestSaving) {
            this.parentRef?.showNotification('Please wait...'); 
            return;
          }
          this.selectedChest = null;
          this.showChestPanel = false;
          break;
        }
        case 'menu': this.isMenuPanelOpen = false; break;
        case 'chat': {
          this.showChatPrompt = false;
          break;
        }
      }
      this.canvasRef?.nativeElement?.requestPointerLock();
    }, 10);
  }


  async pollPartyInvites(): Promise<void> {
    const myId = this.currentUser.id ?? 0;
    if (!myId) return; 
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
    this.isLoadingWorlds = true; 
    this.cdr.detectChanges();
    this.worlds = await this.digcraftService.getWorlds();
    this.isLoadingWorlds = false;
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
   
    // Switch the player to the requested world id
    await this.switchWorld(Number(this.editWorldId));
    this.showWorldPanel = false;
  }

  async switchWorld(newWorldId: number): Promise<void> {
    if (!confirm("Switch to world " + newWorldId + "?")) return;
    this.isSwitchingWorld = true;
    this.cdr.detectChanges();
      
    // clean up current game state
    this.cleanup();
    this.joined = false;
    this.loading = true;
    this.worldId = newWorldId;
    this.cdr.detectChanges();

    // join the new world
    await this.joinWorld(this.worldId);
    this.isSwitchingWorld = false;
    this.showWorldPanel = false;
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
            // Move from chest to inventory, try combining first
            const a = this.chestInventory[this.draggingIndex];
            if (a && a.itemId) {
              const combineResult = this.tryCombineItems(a, this.inventory, 0, 35);
              this.inventory = combineResult.targetArr.filter(s => s !== null) as InvSlot[];
              if (combineResult.remaining) {
                const emptyIdx = this.inventory.findIndex(s => !s || !s.itemId);
                if (emptyIdx >= 0) {
                  this.inventory[emptyIdx] = { itemId: combineResult.remaining.itemId, quantity: combineResult.remaining.quantity };
                  this.chestInventory[this.draggingIndex] = null;
                } else {
                  this.chestInventory[this.draggingIndex] = combineResult.remaining;
                }
              } else {
                this.chestInventory[this.draggingIndex] = null;
              }
            }
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
            // Swap inventory slot with chest slot, try combining first
            const a = this.inventory[this.draggingIndex];
            if (a && a.itemId) {
              // Try to combine with existing stacks in chest first
              const combineResult = this.tryCombineItems(a, this.chestInventory, 0, 26);
              this.chestInventory = combineResult.targetArr;
              if (combineResult.remaining) {
                // Still have remaining items, try to find empty slot
                const emptyIdx = this.chestInventory.findIndex(s => !s || !s.itemId);
                if (emptyIdx >= 0) {
                  this.chestInventory[emptyIdx] = { itemId: combineResult.remaining.itemId, quantity: combineResult.remaining.quantity };
                  this.inventory[this.draggingIndex] = { itemId: 0, quantity: 0 };
                } else {
                  // No empty slots, keep remaining in inventory
                  this.inventory[this.draggingIndex] = combineResult.remaining;
                }
              } else {
                // All items combined, clear source slot
                this.inventory[this.draggingIndex] = { itemId: 0, quantity: 0 };
              }
            } else {
              this.inventory[this.draggingIndex] = { itemId: 0, quantity: 0 };
            }
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
      // treat as click - move item directly between chest and inventory without dragging
      if (this.slotPointerDownIndex !== null) {
        if (this.dragSource === 'chest') {
          // Click on chest slot: move to inventory
          const chestSlot = this.chestInventory[this.slotPointerDownIndex];
          if (chestSlot && chestSlot.itemId) {
            const combineResult = this.tryCombineItems(chestSlot, this.inventory, 0, 35);
            this.inventory = combineResult.targetArr.filter(s => s !== null) as InvSlot[];
            if (combineResult.remaining) {
              const emptyIdx = this.inventory.findIndex(s => !s || !s.itemId);
              if (emptyIdx >= 0) {
                this.inventory[emptyIdx] = { itemId: combineResult.remaining.itemId, quantity: combineResult.remaining.quantity };
                this.chestInventory[this.slotPointerDownIndex] = null;
              } else {
                this.chestInventory[this.slotPointerDownIndex] = combineResult.remaining;
              }
            } else {
              this.chestInventory[this.slotPointerDownIndex] = null;
            }
            this.scheduleInventorySave();
          }
        } else if (this.showChestPanel) {
          // Click on inventory slot in chest panel: move to chest
          const invSlot = this.inventory[this.slotPointerDownIndex];
          if (invSlot && invSlot.itemId) {
            const combineResult = this.tryCombineItems(invSlot, this.chestInventory, 0, 26);
            this.chestInventory = combineResult.targetArr;
            if (combineResult.remaining) {
              const emptyIdx = this.chestInventory.findIndex(s => !s || !s.itemId);
              if (emptyIdx >= 0) {
                this.chestInventory[emptyIdx] = { itemId: combineResult.remaining.itemId, quantity: combineResult.remaining.quantity };
                this.inventory[this.slotPointerDownIndex] = { itemId: 0, quantity: 0 };
              } else {
                this.inventory[this.slotPointerDownIndex] = combineResult.remaining;
              }
            } else {
              this.inventory[this.slotPointerDownIndex] = { itemId: 0, quantity: 0 };
            }
            this.scheduleInventorySave();
          }
        } else if (this.showInventory) {
          // If inventory overlay is open, select the inventory slot for drop UI
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
      if (node.hasAttribute('data-chest-inv-index') || node.hasAttribute('data-index')) {
        return true;
      }
      if (node.hasAttribute('data-chest-index')) {
        return false;
      }
      node = node.parentElement as HTMLElement | null;
    }
    return false;
  }

  private tryCombineItems(source: { itemId: number; quantity: number } | null, targetArr: Array<{ itemId: number; quantity: number } | null>, targetStartIdx: number, targetEndIdx: number): { remaining: { itemId: number; quantity: number } | null, targetArr: Array<{ itemId: number; quantity: number } | null> } {
    if (!source || !source.itemId || source.quantity <= 0) {
      return { remaining: null, targetArr };
    }
    const remaining = { itemId: source.itemId, quantity: source.quantity };
    let newArr = [...targetArr];
    for (let i = targetStartIdx; i <= targetEndIdx && remaining.quantity > 0; i++) {
      const slot = newArr[i];
      if (!slot || slot.itemId !== source.itemId) continue;
      if (slot.quantity >= MAX_STACK_SIZE) continue;
      const canAdd = Math.min(remaining.quantity, MAX_STACK_SIZE - slot.quantity);
      newArr[i] = { itemId: slot.itemId, quantity: slot.quantity + canAdd };
      remaining.quantity -= canAdd;
    }
    return { remaining: remaining.quantity > 0 ? remaining : null, targetArr: newArr };
  }

  // Trigger a short first-person swing animation when the player clicks with a weapon
  triggerSwing(): void {
    // Allow punch animation even without a weapon (bare hands)
    // Swing for swords, pickaxes, and axes when equipped
    if (this.equippedWeapon && !this.isSwordItem(this.equippedWeapon) && !this.isPickaxeItem(this.equippedWeapon) && !this.isAxeItem(this.equippedWeapon)) return;
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

  async dropAllSelected(): Promise<void> {
    if (this.selectedInventoryIndex === null) return;
    const idx = this.selectedInventoryIndex;
    const slot = this.inventory[idx];
    const count = slot.quantity ?? 0;
    if (count > 0) {
      slot.quantity = 0;
      slot.itemId = 0;
      await this.saveInventory();
    }
  }

  async dropSelected(count?: number): Promise<void> {
    if (this.selectedInventoryIndex === null) return;
    const idx = this.selectedInventoryIndex;
    const slot = this.inventory[idx];
    if (!slot || slot.quantity <= 0) { this.selectedInventoryIndex = null; return; }
    const toDrop = count === undefined ? this.dropCount : Math.max(1, Math.min(slot.quantity, count));
    slot.quantity -= toDrop;
    if (slot.quantity <= 0) { slot.itemId = 0; slot.quantity = 0; }
    // persist immediately
    await this.saveInventory();
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
    const reach = 5;
    const reachSq = reach * reach;
    const eyeH = 1.6;
    const feetY = this.camY - eyeH;
    for (let bodyY = feetY; bodyY <= this.camY; bodyY += 0.8) {
      const dx = x - this.camX;
      const dy = y - bodyY;
      const dz = z - this.camZ;
      if (Math.abs(dx) <= reach && Math.abs(dy) <= reach && Math.abs(dz) <= reach) {
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= reachSq) return true;
      }
    }
    return false;
  }

  private findAimedPlayer(maxRange: number = this.getAttackRange()): DCPlayer | null {
    const myId = this.parentRef?.user?.id ?? 0;
    const look = this.getLookDirection();
    const dirX = look.x;
    const dirY = look.y;
    const dirZ = look.z;
    const hitRadius = 0.9;
    let best: DCPlayer | null = null;
    let bestPerp = Number.POSITIVE_INFINITY;
    const candidates = this.smoothedPlayers.length ? this.smoothedPlayers : this.otherPlayers;
    for (const p of candidates) {
      if (!p || p.userId === myId) continue;
      if (this.partyMembers.some(member => member.userId === p.userId)) continue; // don't target party members  
      const dx = p.posX - this.camX;
      const dy = (p.posY - 0.9) - this.camY;
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

  private findAimedMob(maxRange: number = this.getAttackRange()): any | null {
    const look = this.getLookDirection();
    const dirX = look.x;
    const dirY = look.y;
    const dirZ = look.z;
    const hitRadius = 0.9;
    let best: any | null = null;
    let bestPerp = Number.POSITIVE_INFINITY;
    const candidates = this.mobs || [];
    for (const m of candidates) {
      if (!m) continue;
      // Skip dead mobs
      if ((m as any).dead) continue;
      const mobY = (m.posY || 0) - 0.8;
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
      if (res.drops && Array.isArray(res.drops)) {
        for (const drop of res.drops) {
          if (drop && typeof drop.itemId === 'number' && typeof drop.quantity === 'number' && drop.quantity > 0) {
            this.addToInventory(drop.itemId, drop.quantity);
          }
        }
      }
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
  get availableEmojis(): string[] {
    const map = this.parentRef?.emojiMap;
    if (!map) return ['😊'];
    // Extract just the emoji values from the map, filtering out default faces
    return Object.values(map).slice(0, 200).filter(z => !this.availableFaces.find(e => e.label === z));
  }
  get creatorPaletteKeys(): string[] { return Object.keys(this.creatorPalette).filter(k => k !== '.'); }
  get myUserFaces(): { id: number; name: string; emoji: string; gridData: string; paletteData: string; creatorUserId?: number }[] {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return [];
    return this.userFaces.filter(f => f.creatorUserId === userId);
  }
  get editingUserFace(): { id: number; name: string; emoji: string; gridData: string; paletteData: string; creatorUserId?: number } | undefined {
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId) return undefined;
    const numericId = parseInt(this.playerFace, 10);
    if (isNaN(numericId)) return undefined;
    return this.userFaces.find(f => f.id === numericId && f.creatorUserId === userId);
  }

  private _targetNamePriority: number = 0;
  
  changeTargetName(name: string | null | undefined, priority: number = 0): void {
    if (priority < this._targetNamePriority && this.targetName) {
      return;
    }
    this._targetNamePriority = priority;
    if (name === null || name === undefined || name === '') {
      this.targetName = '';
      return;
    }
    this.targetName = name;
  }

  openFaceCreatorForEdit(): void {
    const face = this.editingUserFace;
    if (!face) return;
    this.creatorName = face.name || '';
    this.creatorEmoji = face.emoji || '😊';
    const grid = face.gridData || '';
    this.creatorGrid = grid.length === 64 ? grid.split('') : Array(64).fill('.');
    const palette: { [key: string]: string } = { '.': '' };
    const paletteParts = (face.paletteData || '').split(',');
    for (const part of paletteParts) {
      const [key, color] = part.split(':');
      if (key && color) palette[key] = color;
    }
    this.creatorPalette = palette;
    const keys = Object.keys(palette).filter(k => k !== '.');
    if (keys.length > 0) this.creatorSelectedColor = keys[0];
    else this.creatorSelectedColor = '1';
    this.showFaceCreator = true;
    try { this.cdr.detectChanges(); } catch { }
  }

  async deleteCurrentUserFace(): Promise<void> {
    const face = this.editingUserFace;
    if (!face) return;
    await this.deleteUserFace(face.id);
  }

  async deleteUserFace(faceId: number, e?: Event): Promise<void> {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const userId = this.parentRef?.user?.id ?? 0;
    if (!userId || !faceId) return;
    try {
      const res = await this.digcraftService.deleteUserFace(userId, faceId);
      if (res && res.success) {
        this.userFaces = this.userFaces.filter(f => f.id !== faceId);
        this.updateAvailableFacesWithUserFaces();
        // If currently using this face, reset to default
        if (this.playerFace === String(faceId)) {
          this.playerFace = 'default';
          this.onFaceSubmit('default');
        }
      }
    } catch (err) {
      console.error('DigCraft: deleteUserFace error', err);
    }
  }

  editUserFace(face: { id: number; name: string; emoji: string; gridData: string; paletteData: string; creatorUserId?: number }, e?: Event): void {
    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch { } }
    if (!face) return;
    this.creatorName = face.name || '';
    this.creatorEmoji = face.emoji || '😊';
    const grid = face.gridData || '';
    this.creatorGrid = (grid && grid.length === 64) ? grid.split('') : Array(64).fill('.');
    const palette: { [key: string]: string } = { '.': '' };
    const paletteParts = (face.paletteData || '').split(',');
    for (const part of paletteParts) {
      const [key, color] = part.split(':');
      if (key) palette[key] = color || '';
    }
    this.creatorPalette = palette;
    const keys = Object.keys(palette).filter(k => k !== '.');
    if (keys.length > 0) this.creatorSelectedColor = keys[0];
    else this.creatorSelectedColor = '1';
    this.showFaceCreator = true;
    this.isTypingMode = true;
    try { this.cdr.detectChanges(); } catch { }
  }

  get currentFaceEmoji(): string {
    // Check if playerFace is a numeric user face ID
    const numericId = parseInt(this.playerFace, 10);
    if (!isNaN(numericId)) {
      const userFace = this.userFaces.find(f => f.id === numericId);
      if (userFace) return userFace.emoji || '😊';
    }
    // Fall back to built-in face label
    const builtIn = this.availableFaces.find(f => f.id === this.playerFace);
    return builtIn?.label || '😐';
  }

  private isLavaNearby(wx: number, wz: number): boolean {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (this.getWorldBlock(wx + dx, y, wz + dz) === BlockId.LAVA) return true;
        }
      }
    }
    return false;
  }

  private isCaveBlock(wx: number, topY: number, wz: number): boolean {
    if (this.getWorldBlock(wx, topY, wz) !== BlockId.AIR) return false;
    for (let y = topY; y <= topY + 4 && y < WORLD_HEIGHT; y++) {
      const b = this.getWorldBlock(wx, y, wz);
      if (b !== BlockId.AIR && b !== BlockId.WATER) return true;
    }
    return false;
  }

  private exitPointerLock() {
    console.debug('[digcraft] exitPointerLock called', { pointerLockElement: document.pointerLockElement });  
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
}