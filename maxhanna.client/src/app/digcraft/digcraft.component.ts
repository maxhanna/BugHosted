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

@Component({
  selector: 'app-digcraft',
  templateUrl: './digcraft.component.html',
  styleUrl: './digcraft.component.css',
  standalone: false,
})
export class DigCraftComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('joystick', { static: false }) joystickRef?: ElementRef<HTMLDivElement>;

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
  private syncInterval: ReturnType<typeof setInterval> | undefined;
  private playerPollInterval: ReturnType<typeof setInterval> | undefined;
  private inventorySaveTimeout: ReturnType<typeof setTimeout> | undefined;
  private chunkPollInterval: ReturnType<typeof setInterval> | undefined;
  private pollingChunks = false;

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

  // Bound handlers for cleanup
  private boundKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
  private boundKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);
  private boundMouseMove = (e: MouseEvent): void => this.onMouseMove(e);
  private boundMouseDown = (e: MouseEvent): void => this.onMouseDown(e);
  private boundContextMenu = (e: Event): void => e.preventDefault();
  private boundPointerLockChange = (): void => this.onPointerLockChange();
  private boundTouchStart = (e: TouchEvent): void => this.onTouchStart(e);
  private boundTouchMove = (e: TouchEvent): void => this.onTouchMove(e);
  private boundTouchEnd = (e: TouchEvent): void => this.onTouchEnd(e);

  constructor(private digcraftService: DigcraftService) {
    super();
    this.inventory = new Array(36).fill(null).map(() => ({ itemId: 0, quantity: 0 }));
  }

  ngOnInit(): void { }

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

    // Sync position to server every 2s
    this.syncInterval = setInterval(() => this.syncPosition(), 2000);
    // Poll other players every 3s
    this.playerPollInterval = setInterval(() => this.pollPlayers(), 3000);
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
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.playerPollInterval) clearInterval(this.playerPollInterval);
    if (this.chunkPollInterval) clearInterval(this.chunkPollInterval);
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

    // Draw block highlight
    if (this.targetBlock) {
      const aspect = (canvas?.width ?? 800) / (canvas?.height ?? 600);
      const mvp = buildMVP(this.camX, this.camY, this.camZ, this.yaw, this.pitch, aspect);
      this.renderer.drawHighlight(this.targetBlock.wx, this.targetBlock.wy, this.targetBlock.wz, mvp);
    }
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
      const ccx = Math.floor(this.camX / CHUNK_SIZE);
      const ccz = Math.floor(this.camZ / CHUNK_SIZE);
      const promises: Promise<void>[] = [];
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
          const cx = ccx + dx;
          const cz = ccz + dz;
          const key = `${cx},${cz}`;
          const chunk = this.chunks.get(key);
          if (chunk) {
            promises.push(this.fetchChunkChanges(cx, cz, chunk));
          }
        }
      }
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

  // ═══════════════════════════════════════
  // Input — Keyboard
  // ═══════════════════════════════════════
  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.code);

    if (e.code === 'Space' && this.onGround && !this.showInventory && !this.showCrafting) {
      this.velY = 7;
      this.onGround = false;
    }
    if (e.code === 'KeyE') {
      this.showInventory = !this.showInventory;
      this.showCrafting = false;
      if (this.showInventory && this.pointerLocked) document.exitPointerLock();
    }
    if (e.code === 'KeyC') {
      this.showCrafting = !this.showCrafting;
      this.showInventory = false;
      if (this.showCrafting) {
        this.updateAvailableRecipes();
        if (this.pointerLocked) document.exitPointerLock();
      }
    }
    if (e.code === 'Escape') {
      this.showInventory = false;
      this.showCrafting = false;
    }
    // Hotbar 1-9
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.replace('Digit', ''), 10);
      if (n >= 1 && n <= 9) this.selectedSlot = n - 1;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  // ═══════════════════════════════════════
  // Input — Mouse
  // ═══════════════════════════════════════
  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked) return;
    const sens = 0.002;
    // Invert mouse X so moving the mouse right turns right
    this.yaw -= e.movementX * sens;
    // Invert mouse Y so moving the mouse up looks up
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.pointerLocked) {
      this.canvasRef?.nativeElement?.requestPointerLock();
      return;
    }
    if (e.button === 0) this.breakBlock();
    if (e.button === 2) this.placeBlock();
  }

  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.canvasRef?.nativeElement;
  }

  // ═══════════════════════════════════════
  // Input — Touch
  // ═══════════════════════════════════════
  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const w = canvas.clientWidth;
    // If a joystick element exists, prefer touches inside its bounding rect.
    const h = canvas.clientHeight;
    const joystickRect = this.joystickRef?.nativeElement?.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (joystickRect && t.clientX >= joystickRect.left && t.clientX <= joystickRect.right && t.clientY >= joystickRect.top && t.clientY <= joystickRect.bottom && this.touchMoveId === null) {
        // Touch started on joystick — initialize start at joystick center so small drags register
        this.touchMoveId = t.identifier;
        this.touchStartX = joystickRect.left + joystickRect.width / 2;
        this.touchStartY = joystickRect.top + joystickRect.height / 2;
        this.touchMoveX = 0;
        this.touchMoveY = 0;
        this.touchStartedOnJoystick = true;
      } else if (t.clientX < w / 2 && t.clientY > h / 2 && this.touchMoveId === null) {
        // Fallback: bottom-left quadrant = joystick
        this.touchMoveId = t.identifier;
        this.touchStartX = t.clientX;
        this.touchStartY = t.clientY;
        this.touchMoveX = 0;
        this.touchMoveY = 0;
        this.touchStartedOnJoystick = true;
      } else if (this.touchLookId === null) {
        // Otherwise use touch to look around
        this.touchLookId = t.identifier;
        this.touchLookStartX = t.clientX;
        this.touchLookStartY = t.clientY;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.touchMoveId) {
        const dx = t.clientX - this.touchStartX;
        const dy = t.clientY - this.touchStartY;
        const deadzone = this.touchStartedOnJoystick ? 8 : 15;
        this.touchMoveX = Math.abs(dx) > deadzone ? Math.sign(dx) * Math.min(Math.abs(dx) / 60, 1) : 0;
        // Invert Y so dragging up moves forward
        this.touchMoveY = Math.abs(dy) > deadzone ? -Math.sign(dy) * Math.min(Math.abs(dy) / 60, 1) : 0;
      }
      if (t.identifier === this.touchLookId) {
        const dx = t.clientX - this.touchLookStartX;
        const dy = t.clientY - this.touchLookStartY;
        this.touchLookStartX = t.clientX;
        this.touchLookStartY = t.clientY;
        this.yaw += dx * 0.005;
        // Invert touch look Y to match mouse
        this.pitch -= dy * 0.005;
        this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.touchMoveId) {
        this.touchMoveId = null;
        this.touchMoveX = 0;
        this.touchMoveY = 0;
        this.touchStartedOnJoystick = false;
      }
      if (t.identifier === this.touchLookId) {
        this.touchLookId = null;
      }
    }
  }

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
    this.digcraftService.saveInventory(userId, this.worldId, slots);
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
  private async syncPosition(): Promise<void> {
    const userId = this.parentRef?.user?.id;
    if (!userId) return;
    await this.digcraftService.updatePosition(userId, this.worldId, this.camX, this.camY, this.camZ, this.yaw, this.pitch);
  }

  private async pollPlayers(): Promise<void> {
    try {
      const players = await this.digcraftService.getPlayers(this.worldId);
      this.otherPlayers = players;
      console.debug('DigCraft: polled players', players);
    } catch (err) {
      console.error('DigCraft: pollPlayers error', err);
      this.otherPlayers = [];
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
    this.canvasRef?.nativeElement?.requestPointerLock();
  } 

  // Compute knob transform for joystick visual based on touchMoveX/Y (-1..1)
  getJoystickKnobTransform(): string {
    const maxPx = 28; // max distance knob moves from center
    const x = (this.touchMoveX || 0) * maxPx;
    const y = -(this.touchMoveY || 0) * maxPx; // invert Y for visual coordinates
    return `translate(-50%,-50%) translate(${x}px, ${y}px)`;
  }
}
