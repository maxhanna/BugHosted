import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { ChildComponent } from '../child.component';
import { DigcraftService } from '../../services/digcraft.service';
import {
  BlockId, ItemId, CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE,
  InvSlot, RECIPES, CraftRecipe, BLOCK_DROPS, ITEM_NAMES, ITEM_COLORS,
  isPlaceable, getMiningSpeed, DCPlayer, DCBlockChange, DCJoinResponse
} from './digcraft-types';
import { Chunk, generateChunk, applyChanges } from './digcraft-world';
import { DigCraftRenderer, buildMVP } from './digcraft-renderer';
import { onKeyDown, onKeyUp, onMouseMove, onMouseDown, onPointerLockChange, onTouchStart, onTouchMove, onTouchEnd, getJoystickKnobTransform, requestPointerLock } from './digcraft-input';
import { PromptComponent } from '../prompt/prompt.component';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-digcraft',
  templateUrl: './digcraft.component.html',
  styleUrl: './digcraft.component.css',
  standalone: false,
})
export class DigCraftComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('joystick', { static: false }) joystickRef?: ElementRef<HTMLDivElement>;
  @ViewChild('chatPrompt', { static: false }) chatPrompt?: PromptComponent;

  Math = Math;

  // ─── State ───
  loading = true;
  joined = false;
  worldId = 1;
  seed = 42;
  playerId = 0;

  // Camera / player
  camX = 8; camY = 40; camZ = 8;
  yaw = 0; pitch = 0;
  velY = 0;
  onGround = false;

  // Inventory: 36 slots (0-8 = hotbar)
  inventory: InvSlot[] = [];
  selectedSlot = 0;
  showInventory = false;
  showCrafting = false;
  availableRecipes: CraftRecipe[] = [];

  // Health / hunger
  health = 20;
  hunger = 20;

  // Multiplayer
  otherPlayers: DCPlayer[] = [];

  // Block interaction
  targetBlock: { wx: number; wy: number; wz: number } | null = null;
  placementBlock: { wx: number; wy: number; wz: number } | null = null;
  breakingProgress = 0;
  breakingTarget: string | null = null;

  // Chunks
  chunks: Map<string, Chunk> = new Map();

  // Internal
  private renderer!: DigCraftRenderer;
  private animFrameId = 0;
  private lastTime = 0;
  private keys: Set<string> = new Set();
  private pointerLocked = false;

  // adaptive timeouts for polling players and chats (use setTimeout so we can vary frequency)
  private playerPollInterval: ReturnType<typeof setTimeout> | undefined;
  private inventorySaveTimeout: ReturnType<typeof setTimeout> | undefined;
  private chunkPollInterval: ReturnType<typeof setInterval> | undefined;
  private pollingChunks = false;
  // index used to round-robin poll loaded chunks to avoid flooding the server
  private chunkPollIndex = 0;
  private chatPollInterval: ReturnType<typeof setTimeout> | undefined;

  // Poll frequency settings (ms)
  private PLAYER_POLL_FAST_MS = 1000;
  private PLAYER_POLL_SLOW_MS = 5000;
  private CHAT_POLL_FAST_MS = 1000;
  private CHAT_POLL_SLOW_MS = 5000;
  showChatPrompt = false;
  isShowingLoginPanel = false;
  // active chat messages (client-side)
  private chatMessages: { userId: number; username?: string; text: string; expiresAt: number; createdAt?: string }[] = [];
  // cached bubble positions in pixels
  chatPositions: { [userId: number]: { left: number; top: number } } = {};
  // center-screen chat messages (stacked under crosshair)
  private centerChatMessages: { userId: number; username?: string; text: string; expiresAt: number; createdAt?: string }[] = [];

  // Cache of userId -> username to avoid repeated lookups
  private userNameCache: Map<number, string> = new Map();

  // Touch state
  private touchMoveId: number | null = null;
  private touchLookId: number | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchLookStartX = 0;
  private touchLookStartY = 0;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchStartedOnJoystick = false;

  // Bound handlers for cleanup (delegates moved to digcraft-input.ts)
  private boundKeyDown = (e: KeyboardEvent): void => onKeyDown(this, e);
  private boundKeyUp = (e: KeyboardEvent): void => onKeyUp(this, e);
  private boundMouseMove = (e: MouseEvent): void => onMouseMove(this, e);
  private boundMouseDown = (e: MouseEvent): void => onMouseDown(this, e);
  private boundContextMenu = (e: Event): void => e.preventDefault();
  private boundPointerLockChange = (): void => onPointerLockChange(this);
  private boundTouchStart = (e: TouchEvent): void => onTouchStart(this, e);
  private boundTouchMove = (e: TouchEvent): void => onTouchMove(this, e);
  private boundTouchEnd = (e: TouchEvent): void => onTouchEnd(this, e);

  constructor(private digcraftService: DigcraftService, private userService: UserService) {
    super();
    this.inventory = new Array(36).fill(null).map(() => ({ itemId: 0, quantity: 0 }));
  }

  ngOnInit(): void { 
    if (!this.parentRef?.user?.id) { 
      this.isShowingLoginPanel = true;
      this.parentRef?.showOverlay();
    }
  }

  ngAfterViewInit(): void {
    this.joinWorld();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ═══════════════════════════════════════
  // Join / Init
  // ═══════════════════════════════════════
  async joinWorld(): Promise<void> {
    const userId = this.parentRef?.user?.id;
    if (!userId) { this.loading = false; return; }

    const res: DCJoinResponse | null = await this.digcraftService.joinWorld(userId, this.worldId);
    if (!res) { this.loading = false; return; }

    this.seed = res.world.seed;
    this.playerId = res.player.id;
    this.camX = res.player.posX;
    this.camY = res.player.posY;
    this.camZ = res.player.posZ;
    this.yaw = res.player.yaw;
    this.pitch = res.player.pitch;
    this.health = res.player.health;
    this.hunger = res.player.hunger;

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
    }

    this.joined = true;
    this.loading = false;

    // Find a safe spawn height on the actual terrain
    this.findSafeSpawnHeight();

    // Wait for canvas to render
    setTimeout(() => this.initGame(), 50);
  }

  /** Generate the spawn chunk and place the player on top of the surface. */
  private findSafeSpawnHeight(): void {
    const spawnX = Math.floor(this.camX);
    const spawnZ = Math.floor(this.camZ);
    const cx = Math.floor(spawnX / CHUNK_SIZE);
    const cz = Math.floor(spawnZ / CHUNK_SIZE);
    const key = `${cx},${cz}`;

    // Ensure the spawn chunk exists
    if (!this.chunks.has(key)) {
      const chunk = generateChunk(this.seed, cx, cz);
      this.chunks.set(key, chunk);
    }
    const chunk = this.chunks.get(key)!;
    const lx = spawnX - cx * CHUNK_SIZE;
    const lz = spawnZ - cz * CHUNK_SIZE;

    // Small upward offset to reduce spawning inside nearby blocks
    const spawnRaise = 0.5; // blocks

    // Scan downward from the top to find the highest solid block
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const block = chunk.getBlock(lx, y, lz);
      if (block !== BlockId.AIR && block !== BlockId.WATER && block !== BlockId.LEAVES) {
        // Place player's eyes 1.6 blocks above the surface plus a small raise
        this.camY = y + 1 + 1.6 + spawnRaise;
        this.velY = 0;
        this.onGround = true;
        return;
      }
    }
    // Fallback — place on bedrock (with same raise)
    this.camY = 2 + 1.6 + spawnRaise;
    this.velY = 0;
    this.onGround = true;
  }

  private initGame(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    this.renderer = new DigCraftRenderer(canvas);

    // Generate initial chunks
    this.loadChunksAround(Math.floor(this.camX / CHUNK_SIZE), Math.floor(this.camZ / CHUNK_SIZE));

    // Bind input
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('mousemove', this.boundMouseMove);
    canvas.addEventListener('mousedown', this.boundMouseDown);
    canvas.addEventListener('contextmenu', this.boundContextMenu);
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    // Use document-level touch handlers so an overlay joystick (pointer-events: auto)
    // doesn't prevent the handlers from receiving events. Handlers will decide
    // if a touch is a joystick touch via bounding-rect checks.
    document.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);

    // Start game loop
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);

    // Player sync + pollPlayers runs in a single adaptive loop
    // Start adaptive polling loops for players and chat (each will schedule its next run)
    this.pollPlayers().catch(err => console.error('DigCraft: pollPlayers error', err));
    this.pollChats().catch(err => console.error('DigCraft: pollChats error', err));
    // Poll server for chunk changes periodically so remote block placements appear
    this.chunkPollInterval = setInterval(() => this.pollChunkChanges().catch(err => console.error('DigCraft: pollChunkChanges error', err)), 1000);
  }

  private cleanup(): void {
    cancelAnimationFrame(this.animFrameId);
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('mousedown', this.boundMouseDown);
      canvas.removeEventListener('contextmenu', this.boundContextMenu);
    }
    // remove document touch handlers
    document.removeEventListener('touchstart', this.boundTouchStart);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
    // remove pointer drag handlers
    document.removeEventListener('pointermove', this.boundSlotPointerMove as any);
    document.removeEventListener('pointerup', this.boundSlotPointerUp as any);
    if (this.playerPollInterval) clearTimeout(this.playerPollInterval);
    if (this.chunkPollInterval) clearInterval(this.chunkPollInterval);
    if (this.chatPollInterval) clearTimeout(this.chatPollInterval);
    if (this.inventorySaveTimeout) clearTimeout(this.inventorySaveTimeout);
    if (this.renderer) this.renderer.dispose();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ═══════════════════════════════════════
  // Game Loop
  // ═══════════════════════════════════════
  private gameLoop(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(dt);
    this.updateRaycast();
    this.renderFrame();
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // ═══════════════════════════════════════
  // Physics / Movement
  // ═══════════════════════════════════════
  private updatePhysics(dt: number): void {
    if (this.showInventory || this.showCrafting) return;

    const speed = 5.5;
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

    // Camera-relative using forward/right vectors (keeps movement aligned with raycast)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fx = -sinY; // forward.x
    const fz = -cosY; // forward.z
    const rx = cosY;  // right.x
    const rz = -sinY; // right.z
    const dx = (fx * mz + rx * mx) * speed * dt;
    const dz = (fz * mz + rz * mx) * speed * dt;

    // Gravity
    this.velY -= 20 * dt;
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
      this.camY = ny;
      this.onGround = false;
    } else {
      if (dy < 0) {
        // Snap feet to top of the solid block we collided with
        this.camY = Math.floor(ny - eyeH) + 1 + eyeH;
        this.onGround = true;
      }
      this.velY = 0;
    }

    // Don't fall below bedrock
    if (this.camY < 2) { this.camY = 2; this.velY = 0; this.onGround = true; }

    // Update chunks if moved far enough
    const ccx = Math.floor(this.camX / CHUNK_SIZE);
    const ccz = Math.floor(this.camZ / CHUNK_SIZE);
    this.loadChunksAround(ccx, ccz);
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
      if (b !== BlockId.AIR && b !== BlockId.WATER && b !== BlockId.LEAVES) return true;
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

    for (let i = 0; i < maxDist * 3; i++) {
      const block = this.getWorldBlock(bx, by, bz);
      if (block !== BlockId.AIR && block !== BlockId.WATER) {
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
    this.renderer.render(this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.otherPlayers, userId);

    // Update chat bubble positions after rendering
    this.updateChatPositions();

    // Draw block highlight
    if (this.targetBlock) {
      const aspect = (canvas?.width ?? 800) / (canvas?.height ?? 600);
      const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
      this.renderer.drawHighlight(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, mvp);
    }

    // Render first-person weapon using WebGL (on top of world/highlight)
    if (this.useGLFirstPersonWeapon && this.equippedWeapon && this.joined && !this.showInventory && !this.showCrafting) {
      try {
        this.renderer.renderFirstPersonWeapon(this.equippedWeapon, this.camX, this.camY, this.camZ, this.yaw, this.pitch, this.isWeaponBobbing, this.isSwinging, this.swingStartTime);
      } catch (err) {
        console.error('Error rendering first-person weapon', err);
      }
    }
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
    // Add local bubble immediately
    const now = Date.now();
    const createdNow = new Date().toISOString();
    this.chatMessages.push({ userId, text: text.trim(), expiresAt: now + 8000, createdAt: createdNow });
    // Also show centered chat stack for 10s
    this.centerChatMessages.push({ userId, text: text.trim(), expiresAt: now + 10000, createdAt: createdNow });
  }

  private async pollChats(): Promise<void> {
    try {
      const chats = await this.digcraftService.getChats(this.worldId);
      const now = Date.now();
      for (const c of chats) {
        // dedupe: match by userId + createdAt OR (userId + exact text)
        // This avoids duplicating a locally-posted message (which may have a different createdAt format)
        const exists = this.chatMessages.some(m => m.userId === c.userId && (m.createdAt === c.createdAt || m.text === c.message));
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
        }
      }
      // prune expired
      this.chatMessages = this.chatMessages.filter(m => m.expiresAt > now);
      // prune center stack expired (non-destructive for short-lived list)
      this.centerChatMessages = this.centerChatMessages.filter(m => m.expiresAt > now);

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
        const p = this.otherPlayers.find(x => x.userId === m.userId);
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
  }

  private transformVec4(m: Float32Array, v: number[]): number[] {
    // column-major multiplication: result = m * v
    const r = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      r[i] = m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3];
    }
    return r;
  }

  // Expose active messages for template
  get activeChatMessages() {
    const now = Date.now();
    return this.chatMessages.filter(m => m.expiresAt > now);
  }

  // ═══════════════════════════════════════
  // Chunk management
  // ═══════════════════════════════════════
  private loadChunksAround(ccx: number, ccz: number): void {
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = `${cx},${cz}`;
        if (!this.chunks.has(key)) {
          const chunk = generateChunk(this.seed, cx, cz);
          this.chunks.set(key, chunk);
          // Also fetch server changes for this chunk
          this.fetchChunkChanges(cx, cz, chunk);
        }
      }
    }
    // Build meshes for chunks that need it
    this.rebuildChunkMeshes();
  }

  private async fetchChunkChanges(cx: number, cz: number, chunk: Chunk): Promise<void> {
    const changes: DCBlockChange[] = await this.digcraftService.getChunkChanges(this.worldId, cx, cz);
    if (changes.length > 0) {
      applyChanges(chunk, changes);
      this.rebuildSingleChunkMesh(cx, cz);
    }
  }

  private rebuildChunkMeshes(): void {
    for (const [, chunk] of this.chunks) {
      const key = `${chunk.cx},${chunk.cz}`;
      if (!this.renderer.meshes.has(key)) {
        this.renderer.buildChunkMesh(chunk, (wx, wy, wz) => this.getWorldBlock(wx, wy, wz));
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

      // Limit the number of chunk requests per poll to avoid flooding the server.
      // We use a round-robin index so all loaded chunks are covered over time.
      const MAX_PER_POLL = 6; // tune this value as needed (requests per second)
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
    let lx = wx - cx * CHUNK_SIZE;
    let lz = wz - cz * CHUNK_SIZE;
    return chunk.getBlock(lx, wy, lz);
  }

  private setWorldBlock(wx: number, wy: number, wz: number, blockId: number): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, blockId);

    // Rebuild this chunk + adjacent if on edge
    this.rebuildSingleChunkMesh(cx, cz);
    if (lx === 0) this.rebuildSingleChunkMesh(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.rebuildSingleChunkMesh(cx + 1, cz);
    if (lz === 0) this.rebuildSingleChunkMesh(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.rebuildSingleChunkMesh(cx, cz + 1);

    // Persist to server
    const userId = this.parentRef?.user?.id;
    if (userId) {
      this.digcraftService.placeBlock(userId, this.worldId, cx, cz, lx, wy, lz, blockId);
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

    // Drop item into inventory
    const drop = BLOCK_DROPS[block];
    if (drop) {
      this.addToInventory(drop.itemId, drop.quantity);
    }

    // Remove block
    this.setWorldBlock(wx, wy, wz, BlockId.AIR);
  }

  placeBlock(): void {
    if (!this.placementBlock) return;
    const held = this.inventory[this.selectedSlot];
    if (!held || held.quantity <= 0 || !isPlaceable(held.itemId)) return;

    const { wx, wy, wz } = this.placementBlock;

    // Don't place inside player
    const dx = wx + 0.5 - this.camX;
    const dy = wy + 0.5 - this.camY;
    const dz = wz + 0.5 - this.camZ;
    if (Math.abs(dx) < 0.8 && Math.abs(dz) < 0.8 && dy > -2 && dy < 0.5) return;

    this.setWorldBlock(wx, wy, wz, held.itemId);
    held.quantity--;
    if (held.quantity <= 0) { held.itemId = 0; held.quantity = 0; }
    this.scheduleInventorySave();
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

  selectHotbarSlot(index: number): void {
    this.selectedSlot = index;
  }

  // ═══════════════════════════════════════
  // Crafting
  // ═══════════════════════════════════════
  updateAvailableRecipes(): void {
    this.availableRecipes = RECIPES.filter(r => this.canCraft(r));
  }

  canCraft(recipe: CraftRecipe): boolean {
    for (const ing of recipe.ingredients) {
      let have = 0;
      for (const slot of this.inventory) {
        if (slot.itemId === ing.itemId) have += slot.quantity;
      }
      if (have < ing.quantity) return false;
    }
    return true;
  }

  craft(recipe: CraftRecipe): void {
    if (!this.canCraft(recipe)) return;
    // Remove ingredients
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
    // Add result
    this.addToInventory(recipe.result.itemId, recipe.result.quantity);
    this.updateAvailableRecipes();
  }

  // ═══════════════════════════════════════
  // Multiplayer sync
  // ═══════════════════════════════════════


  private async pollPlayers(): Promise<void> {
    try {
      const userId = this.parentRef?.user?.id;
      let players = [] as DCPlayer[];
      if (!userId) {
        return
      } 

      this.otherPlayers = await this.digcraftService.syncPlayers(userId, this.worldId, this.camX, this.camY, this.camZ, this.yaw, this.pitch);;
      //console.debug('DigCraft: polled players', players);
      // consider other players only (exclude self) when deciding polling rate
      const myId = this.parentRef?.user?.id ?? 0;
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
  onTouchBreak(): void {
    this.breakBlock();
  }

  onTouchPlace(): void {
    this.placeBlock();
  }

  onTouchJump(): void {
    if (this.onGround) {
      this.velY = 7;
      this.onGround = false;
    }
  }

  requestPointerLock(): void {
    return requestPointerLock(this);
  }

  // Joystick knob transform delegates to shared handler
  getJoystickKnobTransform(): string {
    return getJoystickKnobTransform(this);
  }

  // Armor equipment (client-only slots)
  typeArmorSlots: Array<'helmet' | 'chest' | 'legs' | 'boots'> = ['helmet', 'chest', 'legs', 'boots'];
  equippedArmor: Record<'helmet' | 'chest' | 'legs' | 'boots', number> = { helmet: 0, chest: 0, legs: 0, boots: 0 };

  // Weapon equipment (client-only)
  equippedWeapon: number = 0;
  // whether the local player's first-person weapon should bob (movement)
  isWeaponBobbing: boolean = false;
  // whether a local swing animation is active
  isSwinging: boolean = false;
  // whether to render the first-person weapon using WebGL (true) or CSS overlay (false)
  // default to false to preserve the visible CSS overlay while GL-first-person is debugged
  useGLFirstPersonWeapon: boolean = true;
  // timestamp when the current swing started (ms)
  swingStartTime: number = 0;
  // whether the players popup panel is visible
  showPlayersPanel: boolean = false;

  // Inventory drag/drop state
  dragging = false;
  dragGhostX = 0;
  dragGhostY = 0;
  dragGhostItemId = 0;
  private slotPointerDownIndex: number | null = null;
  private slotPointerId: number | null = null;
  private slotPointerStartX = 0;
  private slotPointerStartY = 0;
  private boundSlotPointerMove = (e: PointerEvent) => this.onSlotPointerMove(e);
  private boundSlotPointerUp = (e: PointerEvent) => this.onSlotPointerUp(e);
  private draggingIndex: number | null = null;
  private dragTargetIndex: number | null = null;

  private getArmorType(itemId: number): 'helmet' | 'chest' | 'legs' | 'boots' | null {
    switch (itemId) {
      case ItemId.LEATHER_HELMET: case ItemId.IRON_HELMET: case ItemId.DIAMOND_HELMET:
        return 'helmet';
      case ItemId.LEATHER_CHEST: case ItemId.IRON_CHEST: case ItemId.DIAMOND_CHEST:
        return 'chest';
      case ItemId.LEATHER_LEGS: case ItemId.IRON_LEGS: case ItemId.DIAMOND_LEGS:
        return 'legs';
      case ItemId.LEATHER_BOOTS: case ItemId.IRON_BOOTS: case ItemId.DIAMOND_BOOTS:
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
      case ItemId.WOODEN_SWORD: case ItemId.STONE_SWORD: case ItemId.IRON_SWORD: case ItemId.DIAMOND_SWORD:
        return true;
      default: return false;
    }
  }

  isPickaxeItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_PICKAXE: case ItemId.STONE_PICKAXE: case ItemId.IRON_PICKAXE: case ItemId.DIAMOND_PICKAXE:
        return true;
      default: return false;
    }
  }

  isAxeItem(itemId: number): boolean {
    switch (itemId) {
      case ItemId.WOODEN_AXE: case ItemId.STONE_AXE: case ItemId.IRON_AXE:
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
    e.stopPropagation();
    this.slotPointerDownIndex = index;
    this.slotPointerId = e.pointerId;
    this.slotPointerStartX = e.clientX;
    this.slotPointerStartY = e.clientY;
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch (err) {}
    document.addEventListener('pointermove', this.boundSlotPointerMove);
    document.addEventListener('pointerup', this.boundSlotPointerUp);
  }

  closeLoginPanel() {
    this.isShowingLoginPanel = false;
    this.parentRef?.closeOverlay();
  }

  openPlayersPanel(e?: Event): void {
    if (e && typeof (e as Event).preventDefault === 'function') try { (e as Event).preventDefault(); } catch {}
    this.showPlayersPanel = true;
  }

  closePlayersPanel(): void {
    this.showPlayersPanel = false;
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
      this.dragGhostItemId = this.inventory[this.draggingIndex!]?.itemId ?? 0;
      this.dragGhostX = e.clientX;
      this.dragGhostY = e.clientY;
    }
    if (this.dragging) {
      this.dragGhostX = e.clientX;
      this.dragGhostY = e.clientY;
      // find element under pointer and locate data-index
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      let node = el;
      let found: number | null = null;
      while (node) {
        if (node.hasAttribute && node.hasAttribute('data-index')) {
          const v = node.getAttribute('data-index');
          if (v !== null) found = parseInt(v, 10);
          break;
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
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch (err) {}

    if (this.dragging) {
      if (this.draggingIndex !== null && this.dragTargetIndex !== null && this.draggingIndex !== this.dragTargetIndex) {
        // swap items
        const a = this.inventory[this.draggingIndex];
        this.inventory[this.draggingIndex] = this.inventory[this.dragTargetIndex];
        this.inventory[this.dragTargetIndex] = a;
        this.scheduleInventorySave();
      }
      // clear drag state
      this.dragging = false;
      this.draggingIndex = null;
      this.dragTargetIndex = null;
      this.dragGhostItemId = 0;
    } else {
      // treat as click
      if (this.slotPointerDownIndex !== null) this.selectHotbarSlot(this.slotPointerDownIndex);
    }

    this.slotPointerDownIndex = null;
    this.slotPointerId = null;
  }

  // Trigger a short first-person swing animation when the player clicks with a weapon
  triggerSwing(): void {
    // Only swing for swords and pickaxes
    if (!this.equippedWeapon) return;
    if (!this.isSwordItem(this.equippedWeapon) && !this.isPickaxeItem(this.equippedWeapon)) return;
    if (this.isSwinging) return; // avoid overlapping swings
    this.swingStartTime = performance.now();
    this.isSwinging = true;
    // Clear after animation duration (ms)
    setTimeout(() => { this.isSwinging = false; }, 380);
  }
}
