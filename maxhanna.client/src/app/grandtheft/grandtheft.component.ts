import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, CityChunk, CityMesh } from './grandtheft-renderer';
import { GrandtheftService } from '../../services/grandtheft.service';

const CHUNK_SIZE = 80;
const GRAVITY = -15;
const CAR_HEIGHT = 0.4;
const WALK_SPEED = 5;

const WEAPON_NAMES = ['Pistol', 'Rifle', 'Shotgun'];
const WEAPON_COOLDOWNS = [300, 150, 800];
const WEAPON_DAMAGES = [15, 25, 8];
const PLAYER_POLL_FAST_MS = 200;
const PLAYER_POLL_SLOW_MS = 1000;
const ENTER_CAR_DIST = 3;

interface NPCar {
  x: number; z: number; yaw: number; speed: number;
  mesh: { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number };
  despawnTimer: number;
}

interface OtherPlayerState {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number;
  carYaw: number; carSpeed: number;
  health: number; weapon: number;
  username: string;
  mesh: CityMesh;
}

interface Tracer {
  originX: number; originY: number; originZ: number;
  dirX: number; dirY: number; dirZ: number;
  age: number; lifetime: number;
}

interface MuzzleFlash {
  x: number; y: number; z: number;
  age: number; lifetime: number;
}

@Component({
  selector: 'app-grandtheft',
  templateUrl: './grandtheft.component.html',
  styleUrl: './grandtheft.component.css',
  standalone: false,
})
export class GrandTheftComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gtCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  renderer!: GrandTheftRenderer;
  private animFrameId = 0;
  private lastTime = 0;
  private keys: Set<string> = new Set();

  // Shared position (car position when driving, player position when walking)
  carX = 0; carY = CAR_HEIGHT; carZ = 0;
  carVx = 0; carVz = 0;
  carYaw = 0; carSpeed = 0;
  carAngleVel = 0;

  // Mode
  isInCar = false;

  // Camera
  camYaw = 0; camPitch = -0.25;
  camDist = 4; camHeight = 2;

  // Mouse look
  private isPointerLocked = false;

  // NPCs
  npcs: NPCar[] = [];
  private npcSpawnTimer = 0;

  // HUD
  hudSpeed = 0;

  // Score
  score = 0;
  private scoreTimer = 0;

  // Loading state
  isLoaded = false;

  // Multiplayer
  otherPlayers: OtherPlayerState[] = [];
  tracers: Tracer[] = [];
  muzzleFlashes: MuzzleFlash[] = [];
  currentWeapon = 0;
  health = 100;
  lastShootTime = 0;
  private _pollTimer: any = null;
  private _destroyed = false;
  private autoFireTimer: any = null;

  weaponNames = WEAPON_NAMES;

  // Mobile
  isMobile = false;
  private joystickActive = false;
  private joystickId = -1;
  private joystickX = 0;
  private joystickY = 0;
  private touchCamId = -1;
  private touchCamLastX = 0;
  private touchCamLastY = 0;
  nearCar = false;

  private playerColors: [number, number, number][] = [
    [0.2, 0.5, 0.8], [0.8, 0.3, 0.2], [0.2, 0.7, 0.3],
    [0.9, 0.7, 0.1], [0.6, 0.2, 0.6], [1.0, 0.5, 0.0],
    [0.1, 0.6, 0.6], [0.5, 0.3, 0.1],
  ];

  private npcColors: [number, number, number][] = [
    [0.2, 0.2, 0.8], [0.1, 0.6, 0.1], [0.8, 0.8, 0.2], [1, 1, 1],
    [0.4, 0.4, 0.4], [0.8, 0.3, 0.5], [0.1, 0.5, 0.5], [0.5, 0.3, 0.1],
  ];

  constructor(private gtService: GrandtheftService) { super(); }

  ngOnInit() { }

  ngAfterViewInit() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.renderer = new GrandTheftRenderer(canvas);
    this.isLoaded = true;

    if (!this.isMobile) {
      canvas.addEventListener('click', () => {
        if (!this.isPointerLocked) canvas.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        this.isPointerLocked = document.pointerLockElement === canvas;
      });
    }

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      this.renderer.resize(canvas.width, canvas.height);
    });

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Digit1') this.currentWeapon = 0;
      if (e.code === 'Digit2') this.currentWeapon = 1;
      if (e.code === 'Digit3') this.currentWeapon = 2;
      if (e.code === 'KeyE') this.toggleCar();
    });
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); });

    if (!this.isMobile) {
      document.addEventListener('mousemove', (e) => {
        if (!this.isPointerLocked) return;
        this.camYaw -= e.movementX * 0.002;
        this.camPitch -= e.movementY * 0.002;
        this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
      });

      canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.shoot();
        if (this.currentWeapon === 1) this.startAutoFire();
      });
      canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.stopAutoFire();
      });
      canvas.addEventListener('mouseleave', () => this.stopAutoFire());
    }

    if (this.isMobile) {
      this.initTouchControls(canvas);
    }

    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
    this.startPolling();
  }

  ngOnDestroy() {
    this._destroyed = true;
    cancelAnimationFrame(this.animFrameId);
    this.stopPolling();
    this.stopAutoFire();
    this.renderer?.clearCache();
  }

  // ─── Touch controls ───
  private initTouchControls(canvas: HTMLCanvasElement) {
    canvas.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2 && this.joystickId === -1) {
          this.joystickId = t.identifier;
          this.joystickActive = true;
          this.joystickX = 0;
          this.joystickY = 0;
        }
        if (t.clientX >= window.innerWidth / 2 && this.touchCamId === -1) {
          this.touchCamId = t.identifier;
          this.touchCamLastX = t.clientX;
          this.touchCamLastY = t.clientY;
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickId) {
          const centerX = window.innerWidth / 4;
          const centerY = window.innerHeight * 0.7;
          const dx = t.clientX - centerX;
          const dy = t.clientY - centerY;
          const maxR = 80;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxR) { this.joystickX = dx / dist; this.joystickY = dy / dist; }
          else { this.joystickX = dx / maxR; this.joystickY = dy / maxR; }
        }
        if (t.identifier === this.touchCamId) {
          const dx = t.clientX - this.touchCamLastX;
          const dy = t.clientY - this.touchCamLastY;
          this.camYaw -= dx * 0.005;
          this.camPitch -= dy * 0.005;
          this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
          this.touchCamLastX = t.clientX;
          this.touchCamLastY = t.clientY;
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickId) {
          this.joystickId = -1;
          this.joystickActive = false;
          this.joystickX = 0;
          this.joystickY = 0;
        }
        if (t.identifier === this.touchCamId) {
          this.touchCamId = -1;
        }
      }
    }, { passive: true });
  }

  mobileShoot() {
    this.shoot();
    if (this.currentWeapon === 1) this.startAutoFire();
  }

  mobileShootEnd() {
    if (this.currentWeapon === 1) this.stopAutoFire();
  }

  // ─── Car enter/exit ───
  toggleCar() {
    if (this.isInCar) {
      this.exitCar();
    } else {
      this.enterCar();
    }
  }

  private enterCar() {
    for (const npc of this.npcs) {
      const dx = npc.x - this.carX;
      const dz = npc.z - this.carZ;
      if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
        this.carX = npc.x;
        this.carZ = npc.z;
        this.carYaw = npc.yaw;
        this.carVx = 0;
        this.carVz = 0;
        this.carSpeed = 0;
        this.isInCar = true;
        this.camDist = 8;
        this.camHeight = 3;
        const gl = this.renderer.gl;
        gl.deleteVertexArray(npc.mesh.vao);
        gl.deleteBuffer(npc.mesh.vbo);
        gl.deleteBuffer(npc.mesh.ibo);
        this.npcs.splice(this.npcs.indexOf(npc), 1);
        return;
      }
    }
  }

  private exitCar() {
    const exitDist = 2.5;
    const angle = this.carYaw + Math.PI / 2;
    this.carX += Math.sin(angle) * exitDist;
    this.carZ += Math.cos(angle) * exitDist;
    this.carVx = 0;
    this.carVz = 0;
    this.carSpeed = 0;
    this.isInCar = false;
    this.camDist = 4;
    this.camHeight = 2;
  }

  // ─── Polling ───
  private startPolling() {
    this.pollMultiplayer();
  }

  private stopPolling() {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
  }

  private startAutoFire() {
    this.stopAutoFire();
    this.autoFireTimer = setInterval(() => this.shoot(), 50);
  }

  private stopAutoFire() {
    if (this.autoFireTimer) { clearInterval(this.autoFireTimer); this.autoFireTimer = null; }
  }

  private getUserId(): number {
    return (this.parentRef as any)?.user?.id ?? 0;
  }

  private async pollMultiplayer(): Promise<void> {
    if (this._destroyed) return;
    const userId = this.getUserId();
    if (!userId) {
      this._pollTimer = setTimeout(() => this.pollMultiplayer(), PLAYER_POLL_SLOW_MS);
      return;
    }

    const res = await this.gtService.updatePosition(
      userId, 1,
      this.carX, this.carY, this.carZ,
      this.camYaw, this.camPitch,
      this.carYaw, this.carSpeed,
      this.health, this.currentWeapon,
    );

    if (res) {
      for (const p of res.players) {
        const existing = this.otherPlayers.find(op => op.userId === p.userId);
        if (existing) {
          existing.posX = p.posX; existing.posY = p.posY; existing.posZ = p.posZ;
          existing.yaw = p.carYaw; existing.carYaw = p.carYaw;
          existing.carSpeed = p.carSpeed; existing.health = p.health; existing.weapon = p.weapon;
        } else {
          const colorIdx = Math.abs(p.userId) % this.playerColors.length;
          const color = this.playerColors[colorIdx];
          const mesh = this.renderer.getOtherPlayerMesh(color);
          this.otherPlayers.push({
            userId: p.userId,
            posX: p.posX, posY: p.posY, posZ: p.posZ,
            yaw: p.carYaw, carYaw: p.carYaw, carSpeed: p.carSpeed,
            health: p.health, weapon: p.weapon, username: p.username, mesh,
          });
        }
      }

      const activeIds = new Set(res.players.map(p => p.userId));
      for (let i = this.otherPlayers.length - 1; i >= 0; i--) {
        if (!activeIds.has(this.otherPlayers[i].userId)) {
          this.otherPlayers.splice(i, 1);
        }
      }

      for (const shot of res.shots) {
        if (shot.shooterId !== userId) {
          this.tracers.push({
            originX: shot.originX, originY: shot.originY, originZ: shot.originZ,
            dirX: shot.dirX, dirY: shot.dirY, dirZ: shot.dirZ,
            age: 0, lifetime: 0.3,
          });
        }
      }
    }

    const hasOthers = this.otherPlayers.length > 0;
    const delay = hasOthers ? PLAYER_POLL_FAST_MS : PLAYER_POLL_SLOW_MS;
    this._pollTimer = setTimeout(() => this.pollMultiplayer(), delay);
  }

  private shoot() {
    const now = performance.now();
    const cooldown = WEAPON_COOLDOWNS[this.currentWeapon];
    if (now - this.lastShootTime < cooldown) return;
    this.lastShootTime = now;

    const userId = this.getUserId();
    if (!userId) return;

    const dirX = -Math.sin(this.camYaw) * Math.cos(this.camPitch);
    const dirY = -Math.sin(this.camPitch);
    const dirZ = -Math.cos(this.camYaw) * Math.cos(this.camPitch);

    const originX = this.carX;
    const originY = this.carY + (this.isInCar ? 0.5 : 1.2);
    const originZ = this.carZ;

    const tracerLifetime = this.currentWeapon === 1 ? 0.15 : 0.3;
    this.tracers.push({ originX, originY, originZ, dirX, dirY, dirZ, age: 0, lifetime: tracerLifetime });
    this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, age: 0, lifetime: 0.1 });

    if (this.currentWeapon === 2) {
      for (let i = 1; i < 8; i++) {
        const spread = 0.08;
        const sdx = dirX + (Math.random() - 0.5) * spread;
        const sdy = dirY + (Math.random() - 0.5) * spread;
        const sdz = dirZ + (Math.random() - 0.5) * spread;
        this.tracers.push({ originX, originY, originZ, dirX: sdx, dirY: sdy, dirZ: sdz, age: 0, lifetime: 0.2 });
      }
    }

    this.gtService.shoot(userId, 1, this.currentWeapon, originX, originY, originZ, dirX, dirY, dirZ);
  }

  private gameLoop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.isInCar) {
      this.updateCar(dt);
    } else {
      this.updateWalking(dt);
    }
    this.updateCamera(dt);
    this.updateNPCs(dt);
    this.spawnNPCs(now);
    this.updateScore(dt);
    this.updateTracersAndFlashes(dt);
    this.checkNearCar();

    const canvas = this.canvasRef.nativeElement;
    const aspect = canvas.width / canvas.height;

    const targetX = this.carX;
    const targetY = this.carY + (this.isInCar ? 0 : 0.8);
    const targetZ = this.carZ;

    const camX = targetX - Math.sin(this.camYaw) * this.camDist;
    const camZ = targetZ - Math.cos(this.camYaw) * this.camDist;
    const camY = targetY + this.camHeight;

    this.renderer.render(
      camX, camY, camZ, this.camYaw, this.camPitch, aspect,
      targetX, this.carY, targetZ, this.carYaw,
      this.npcs,
      this.otherPlayers.map(p => ({ x: p.posX, y: p.posY, z: p.posZ, yaw: p.yaw, mesh: p.mesh })),
      this.tracers,
      this.muzzleFlashes,
      this.isInCar ? null : this.renderer.playerMesh,
    );

    this.hudSpeed = Math.abs(this.carSpeed) * (this.isInCar ? 3.6 : 1);
    this.animFrameId = requestAnimationFrame(this.gameLoop);
  };

  private updateWalking(dt: number) {
    let moveX = 0, moveZ = 0;

    if (this.isMobile && this.joystickActive) {
      moveX += this.joystickX;
      moveZ += this.joystickY;
    } else {
      if (this.keys.has('KeyW')) { moveX += Math.sin(this.camYaw); moveZ += Math.cos(this.camYaw); }
      if (this.keys.has('KeyS')) { moveX -= Math.sin(this.camYaw); moveZ -= Math.cos(this.camYaw); }
      if (this.keys.has('KeyA')) { moveX += Math.sin(this.camYaw - Math.PI / 2); moveZ += Math.cos(this.camYaw - Math.PI / 2); }
      if (this.keys.has('KeyD')) { moveX += Math.sin(this.camYaw + Math.PI / 2); moveZ += Math.cos(this.camYaw + Math.PI / 2); }
    }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0.01) {
      moveX /= len;
      moveZ /= len;
      this.carVx = moveX * WALK_SPEED;
      this.carVz = moveZ * WALK_SPEED;
      this.carYaw = Math.atan2(moveX, moveZ);
    } else {
      this.carVx *= 0.85;
      this.carVz *= 0.85;
    }

    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY = CAR_HEIGHT;
    this.carSpeed = Math.sqrt(this.carVx * this.carVx + this.carVz * this.carVz);
    this.pushOutOfBuildings();
  }

  private updateCar(dt: number) {
    const accel = 15;
    const brake = 20;
    const friction = 3;
    const maxSpeed = 30;
    const turnSpeed = 2.5;

    let accelForce = 0;
    if (!this.isMobile) {
      if (this.keys.has('KeyW')) accelForce = accel;
      if (this.keys.has('KeyS')) accelForce = -brake;
    } else {
      if (this.joystickY < -0.2) accelForce = accel * Math.abs(this.joystickY);
      if (this.joystickY > 0.2) accelForce = -brake * this.joystickY;
    }

    if (!this.isMobile) {
      if (this.keys.has('KeyA') && Math.abs(this.carSpeed) > 0.5) {
        this.carYaw += turnSpeed * dt * Math.sign(this.carSpeed);
      }
      if (this.keys.has('KeyD') && Math.abs(this.carSpeed) > 0.5) {
        this.carYaw -= turnSpeed * dt * Math.sign(this.carSpeed);
      }
    } else {
      if (Math.abs(this.joystickX) > 0.2 && Math.abs(this.carSpeed) > 0.5) {
        this.carYaw -= this.joystickX * turnSpeed * dt * Math.sign(this.carSpeed);
      }
    }

    const forwardX = Math.sin(this.carYaw);
    const forwardZ = Math.cos(this.carYaw);

    if (accelForce !== 0) {
      this.carVx += forwardX * accelForce * dt;
      this.carVz += forwardZ * accelForce * dt;
    }

    const speed = Math.sqrt(this.carVx * this.carVx + this.carVz * this.carVz);
    if (speed > 0) {
      const fricFactor = Math.max(0, 1 - friction * dt / Math.max(speed, 0.01));
      this.carVx *= fricFactor;
      this.carVz *= fricFactor;
    }

    if (speed > maxSpeed) {
      this.carVx = (this.carVx / speed) * maxSpeed;
      this.carVz = (this.carVz / speed) * maxSpeed;
    }

    this.carSpeed = speed;
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY = CAR_HEIGHT;
    this.pushOutOfBuildings();
  }

  private pushOutOfBuildings() {
    const cx = Math.floor(this.carX / CHUNK_SIZE);
    const cz = Math.floor(this.carZ / CHUNK_SIZE);
    const margin = this.isInCar ? 1.5 : 0.5;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.renderer.getCityChunk(cx + dx, cz + dz);
        this.checkBuildingsInChunk(cx + dx, cz + dz, margin);
      }
    }
  }

  private checkBuildingsInChunk(chunkCX: number, chunkCZ: number, margin: number) {
    const seed = (chunkCX * 100003 + chunkCZ * 70001) >>> 0;
    const mulberry32 = (seed: number) => {
      let s = seed | 0;
      return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    };
    const rng = mulberry32(seed);
    const GRID_PITCH = 40;
    const BLOCK_SIZE = 30;
    const blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
    const worldCX = chunkCX * CHUNK_SIZE;
    const worldCZ = chunkCZ * CHUNK_SIZE;

    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = chunkCX * (CHUNK_SIZE / GRID_PITCH) + bx;
        const gz = chunkCZ * (CHUNK_SIZE / GRID_PITCH) + by;
        const blockCX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockCZ = gz * GRID_PITCH + GRID_PITCH / 2;
        const hasBuilding = rng() < 0.75;
        if (!hasBuilding) continue;
        const w = 6 + rng() * (BLOCK_SIZE - 14);
        const d = 6 + rng() * (BLOCK_SIZE - 14);
        const hw = w / 2 + margin;
        const hd = d / 2 + margin;
        const dx = this.carX - blockCX;
        const dz = this.carZ - blockCZ;
        if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
          const overlapX = hw - Math.abs(dx);
          const overlapZ = hd - Math.abs(dz);
          if (overlapX < overlapZ) {
            this.carX += dx > 0 ? overlapX : -overlapX;
            this.carVx *= -0.3;
          } else {
            this.carZ += dz > 0 ? overlapZ : -overlapZ;
            this.carVz *= -0.3;
          }
          this.carSpeed *= 0.5;
        }
      }
    }
  }

  private checkNearCar() {
    if (this.isInCar) { this.nearCar = false; return; }
    this.nearCar = false;
    for (const npc of this.npcs) {
      const dx = npc.x - this.carX;
      const dz = npc.z - this.carZ;
      if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
        this.nearCar = true;
        return;
      }
    }
  }

  private updateCamera(_dt: number) {
    const targetYaw = this.isInCar ? this.carYaw + Math.PI : this.camYaw;
    let yawDiff = targetYaw - this.camYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.camYaw += yawDiff * 0.05;
  }

  private updateTracersAndFlashes(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].age += dt;
      if (this.tracers[i].age >= this.tracers[i].lifetime) this.tracers.splice(i, 1);
    }
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].age += dt;
      if (this.muzzleFlashes[i].age >= this.muzzleFlashes[i].lifetime) this.muzzleFlashes.splice(i, 1);
    }
  }

  private spawnNPCs(now: number) {
    if (this._destroyed) return;
    this.npcSpawnTimer += 16;
    if (this.npcSpawnTimer > 2000 && this.npcs.length < 8) {
      this.npcSpawnTimer = 0;
      const side = Math.floor(Math.random() * 4);
      let x = this.carX, z = this.carZ, yaw = 0;
      const spawnDist = 50 + Math.random() * 30;
      switch (side) {
        case 0: x = this.carX + spawnDist; z = this.carZ + (Math.random() - 0.5) * 40; yaw = -Math.PI / 2; break;
        case 1: x = this.carX - spawnDist; z = this.carZ + (Math.random() - 0.5) * 40; yaw = Math.PI / 2; break;
        case 2: z = this.carZ + spawnDist; x = this.carX + (Math.random() - 0.5) * 40; yaw = 0; break;
        case 3: z = this.carZ - spawnDist; x = this.carX + (Math.random() - 0.5) * 40; yaw = Math.PI; break;
      }
      const color = this.npcColors[Math.floor(Math.random() * this.npcColors.length)];
      const mesh = this.renderer.buildNPCMesh(color);
      const speed = 3 + Math.random() * 5;
      this.npcs.push({ x, z, yaw: yaw + (Math.random() - 0.5) * 0.3, speed, mesh, despawnTimer: 15000 });
    }
  }

  private updateNPCs(dt: number) {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      npc.x += Math.sin(npc.yaw) * npc.speed * dt;
      npc.z += Math.cos(npc.yaw) * npc.speed * dt;
      npc.despawnTimer -= dt * 1000;

      if (this.isInCar) {
        const dx = npc.x - this.carX;
        const dz = npc.z - this.carZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5) {
          const force = (this.carSpeed + npc.speed) * 0.5;
          this.carVx += (dx / dist) * force * 0.3;
          this.carVz += (dz / dist) * force * 0.3;
          this.score += 10;
          const gl = this.renderer.gl;
          gl.deleteVertexArray(npc.mesh.vao);
          gl.deleteBuffer(npc.mesh.vbo);
          gl.deleteBuffer(npc.mesh.ibo);
          this.npcs.splice(i, 1);
          continue;
        }
      }

      const pdx = npc.x - this.carX;
      const pdz = npc.z - this.carZ;
      if (Math.sqrt(pdx * pdx + pdz * pdz) > 120 || npc.despawnTimer <= 0) {
        const gl = this.renderer.gl;
        gl.deleteVertexArray(npc.mesh.vao);
        gl.deleteBuffer(npc.mesh.vbo);
        gl.deleteBuffer(npc.mesh.ibo);
        this.npcs.splice(i, 1);
      }
    }
  }

  private updateScore(dt: number) {
    if (this.isInCar && this.carSpeed > 5) {
      this.scoreTimer += dt;
      if (this.scoreTimer > 1) {
        this.score += Math.floor(this.carSpeed * 0.1);
        this.scoreTimer = 0;
      }
    }
  }
}
