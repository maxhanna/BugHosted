import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, CityMesh } from './grandtheft-renderer';
import { GrandtheftService } from '../../services/grandtheft.service';

const CHUNK_SIZE = 80;
const CAR_HEIGHT = 0.4;

const WEAPON_NAMES = ['Pistol', 'Rifle', 'Shotgun', 'Rocket Launcher'];
const WEAPON_COOLDOWNS = [300, 150, 800, 1500];
const WEAPON_DAMAGES = [15, 25, 8, 100];
const PLAYER_POLL_FAST_MS = 200;
const PLAYER_POLL_SLOW_MS = 1000;
const ENTER_CAR_DIST = 4;

interface ParkedCar {
  id: number;
  x: number; z: number; yaw: number;
  type: string;
  health: number;
  mesh: CityMesh | CityMesh[];
  colorR: number; colorG: number; colorB: number;
}

interface OtherPlayerState {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number;
  carSpeed: number;
  health: number; weapon: number;
  username: string;
  mesh: CityMesh | CityMesh[]; // Allow array
  modelUrl?: string;
  isShooting: boolean;
  camYaw: number;
  camPitch: number;
  remoteShootTimer: number;
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

interface Rocket {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; lifetime: number;
}

interface Explosion {
  x: number; y: number; z: number;
  age: number; lifetime: number;
}

interface BloodSplat {
  x: number; y: number; z: number;
  age: number; lifetime: number;
}

interface BloodPool {
  x: number; z: number;
  age: number; lifetime: number; maxRadius: number;
}

@Component({
  selector: 'app-grandtheft',
  templateUrl: './grandtheft.component.html',
  styleUrl: './grandtheft.component.css',
  standalone: false,
})
export class GrandTheftComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gtCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('gtMapCanvas', { static: false }) mapCanvasRef!: ElementRef<HTMLCanvasElement>;

  renderer!: GrandTheftRenderer;
  private animFrameId = 0;
  private lastTime = 0;
  private keys: Set<string> = new Set();

  carX = 0; carY = CAR_HEIGHT; carZ = 0;
  carVx = 0; carVz = 0; carVy = 0; // Added Y velocity for planes
  carYaw = 0; carSpeed = 0;
  carAngleVel = 0;

  carHealth = 100;
  isInCar = false;
  vehicleType: 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' = 'car';

  camYaw = 0; camPitch = 0.2;
  camDist = 4; camHeight = 2;
  firstPerson = false;

  private isPointerLocked = false;

  serverNPCs: { id: number; x: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; remoteShootTimer?: number }[] = [];
  serverPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; mesh: CityMesh | CityMesh[]; health: number }[] = [];
  private npcPollTimer: any = null;
  parkedCars: ParkedCar[] = [];

  hudSpeed = 0;
  score = 0;
  private scoreTimer = 0;

  isLoaded = false;
  showMap = false;
  showWeaponWheel = false;

  otherPlayers: OtherPlayerState[] = [];
  tracers: Tracer[] = [];
  muzzleFlashes: MuzzleFlash[] = [];
  rockets: Rocket[] = [];
  explosions: Explosion[] = [];
  bloodSplats: BloodSplat[] = [];
  bloodPools: BloodPool[] = [];
  deadNPCIds: Set<number> = new Set();
  stolenNpcIds: Set<number> = new Set();
  lookTargetHealth: number | null = null;
  lookTargetName: string = '';
  playerVehicleMesh: CityMesh | CityMesh[] | null = null;
  playerVehicleColor: [number, number, number] = [1, 1, 1];

  currentWeapon = 0;
  health = 100;
  wantedLevel = 0; // Wanted level state
  lastShootTime = 0;
  isShooting = false;
  private _pollTimer: any = null;
  private _destroyed = false;
  private autoFireTimer: any = null;

  weaponNames = WEAPON_NAMES;

  isMobile = false;
  private joystickActive = false;
  private joystickId = -1;
  private joystickX = 0;
  private joystickY = 0;
  private touchCamId = -1;
  private touchCamLastX = 0;
  private touchCamLastY = 0;
  private lastMouseMoveTime = 0;
  private walkYaw = 0;
  nearCar = false;

  private playerColors: [number, number, number][] = [
    [0.2, 0.5, 0.8], [0.8, 0.3, 0.2], [0.2, 0.7, 0.3],
    [0.9, 0.7, 0.1], [0.6, 0.2, 0.6], [1.0, 0.5, 0.0],
    [0.1, 0.6, 0.6], [0.5, 0.3, 0.1],
  ];

  constructor(private gtService: GrandtheftService) { super(); }

  ngOnInit() { }

  ngAfterViewInit() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.renderer = new GrandTheftRenderer(canvas);
    this.renderer.initPlayerModel('assets/grandtheft/maleNPC/scene.gltf');
    this.renderer.loadGLTF('assets/grandtheft/citylight/scene.gltf').then(lamps => {
      if (lamps) this.renderer.lampMesh = lamps;
    });
    this.renderer.loadGLTF('assets/grandtheft/jillValentine/scene.gltf').then(npc => {
      if (npc) this.renderer.npcMesh = npc;
    });
    // Load Vehicles 
    // Load Vehicles
    this.renderer.loadGLTF('assets/grandtheft/lambo/scene.gltf').then(car => {
      if (car) this.renderer.carMeshes.push(car);
    }); 
    // Load Police Car
    this.renderer.loadGLTF('assets/grandtheft/crownVic/scene.gltf').then(police => {
      if (police) this.renderer.policeCarMesh = police;
    });
    this.isLoaded = true;

    if (!this.isMobile) {
      canvas.addEventListener('click', () => {
        if (this.showWeaponWheel) return;
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
      if (e.code === 'Space') e.preventDefault(); // Prevent page scroll
      if (e.code === 'KeyE') this.toggleCar();
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'KeyM') this.showMap = !this.showMap;
      if (e.code === 'Tab' || e.code === 'KeyQ') {
        e.preventDefault();
        this.showWeaponWheel = !this.showWeaponWheel;
        if (this.isPointerLocked) document.exitPointerLock();
      }
      if (e.code === 'Escape') this.showWeaponWheel = false;
    });
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); });

    if (!this.isMobile) {
      document.addEventListener('mousemove', (e) => {
        if (!this.isPointerLocked) return;
        this.lastMouseMoveTime = performance.now();
        this.camYaw -= e.movementX * 0.002;
        this.camPitch += e.movementY * 0.002;
        this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
      });

      canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || this.showWeaponWheel) return;
        this.isShooting = true;
        this.shoot();
        this.startAutoFire();
      });
      canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) { this.isShooting = false; this.stopAutoFire(); }
      });
      canvas.addEventListener('mouseleave', () => { this.isShooting = false; this.stopAutoFire(); });
    }

    if (this.isMobile) this.initTouchControls(canvas);

    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
    this.startPolling();
    this.startNPCPolling();
  }

  ngOnDestroy() {
    this._destroyed = true;
    cancelAnimationFrame(this.animFrameId);
    this.stopPolling();
    this.stopNPCPolling();
    this.stopAutoFire();
    this.renderer?.clearCache();
  }

  selectWeapon(idx: number) {
    this.currentWeapon = idx;
    this.showWeaponWheel = false;
  }

  private initTouchControls(canvas: HTMLCanvasElement) {
    canvas.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2 && this.joystickId === -1) {
          this.joystickId = t.identifier; this.joystickActive = true; this.joystickX = 0; this.joystickY = 0;
        }
        if (t.clientX >= window.innerWidth / 2 && this.touchCamId === -1) {
          this.touchCamId = t.identifier; this.touchCamLastX = t.clientX; this.touchCamLastY = t.clientY;
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickId) {
          const dx = t.clientX - window.innerWidth / 4;
          const dy = t.clientY - window.innerHeight * 0.7;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 80) { this.joystickX = dx / dist; this.joystickY = dy / dist; }
          else { this.joystickX = dx / 80; this.joystickY = dy / 80; }
        }
        if (t.identifier === this.touchCamId) {
          this.lastMouseMoveTime = performance.now();
          this.camYaw -= (t.clientX - this.touchCamLastX) * 0.005;
          this.camPitch += (t.clientY - this.touchCamLastY) * 0.005;
          this.camPitch = Math.max(-1.2, Math.min(0.8, this.camPitch));
          this.touchCamLastX = t.clientX; this.touchCamLastY = t.clientY;
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickId) { this.joystickId = -1; this.joystickActive = false; this.joystickX = 0; this.joystickY = 0; }
        if (t.identifier === this.touchCamId) { this.touchCamId = -1; }
      }
    }, { passive: true });
  }

  mobileShoot() { this.isShooting = true; this.shoot(); this.startAutoFire(); }
  mobileShootEnd() { this.isShooting = false; this.stopAutoFire(); }

  toggleCar() {
    if (this.isInCar) this.exitCar();
    else this.enterCar();
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.camDist = this.firstPerson ? 0 : (this.isInCar ? 8 : 4);
    this.camHeight = this.firstPerson ? 0 : (this.isInCar ? 3 : 2);
  }

  private enterCar() {
    const userId = this.getUserId();
    if (!userId) return;

    const tryEnter = (list: any[], isParked: boolean = false) => {
      for (const v of list) {
        const dx = v.x - this.carX;
        const dz = v.z - this.carZ;
        if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
          this.carX = v.x; this.carZ = v.z; this.carYaw = v.yaw;
          this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
          this.isInCar = true;
          this.vehicleType = v.type || 'car';
          this.carHealth = v.health;

          // Save the exact mesh and color so it doesn't change
          this.playerVehicleMesh = v.mesh;
          this.playerVehicleColor = [v.colorR || 1, v.colorG || 1, v.colorB || 1];

          if (this.vehicleType === 'plane') { this.camDist = 12; this.camHeight = 5; }
          else if (this.vehicleType === 'motorcycle') { this.camDist = 6; this.camHeight = 2.5; }
          else { this.camDist = 8; this.camHeight = 3; }

          if (isParked) {
            this.parkedCars = this.parkedCars.filter(p => p.id !== v.id);
          } else {
            this.gtService.stealCar(v.id, userId);
            // Immediately remove from local state so it stops animating
            this.serverNPCs = this.serverNPCs.filter(npc => npc.id !== v.id);
            this.stolenNpcIds.add(v.id);
          }
          return true;
        }
      }
      return false;
    };

    if (tryEnter(this.serverNPCs)) return;
    if (tryEnter(this.parkedCars, true)) return;
  }

  private exitCar() {
    const exitDist = 2.5;
    const angle = this.carYaw + Math.PI / 2;

    const mesh = this.playerVehicleMesh;
    const color = this.playerVehicleColor;
    if (mesh) {
      const tempId = -Date.now();
      this.parkedCars.push({
        id: tempId,
        x: this.carX,
        z: this.carZ,
        yaw: this.carYaw,
        type: this.vehicleType,
        health: this.carHealth,
        mesh,
        colorR: color[0], colorG: color[1], colorB: color[2]
      });

      // Tell server to park the car, and update local ID when server responds
      this.gtService.parkCar(1, this.carX, this.carZ, this.carYaw, color[0], color[1], color[2]).then((res: any) => {
        const localCar = this.parkedCars.find(p => p.id === tempId);
        if (localCar && res && res.id) {
          localCar.id = res.id;
        }
      });
    }

    this.playerVehicleMesh = null;
    this.carX += Math.sin(angle) * exitDist;
    this.carZ += Math.cos(angle) * exitDist;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0; this.carY = CAR_HEIGHT;
    this.isInCar = false; this.vehicleType = 'car';
    this.camDist = 4; this.camHeight = 2;
  }

  private startPolling() { this.pollMultiplayer(); }
  private stopPolling() { if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; } }
  private startNPCPolling() { this.pollNPCs(); this.npcPollTimer = setInterval(() => this.pollNPCs(), 1000); } // Faster polling for smoothness
  private stopNPCPolling() { if (this.npcPollTimer) { clearInterval(this.npcPollTimer); this.npcPollTimer = null; } }

  private async pollNPCs(): Promise<void> {
    if (this._destroyed) return;
    const data = await this.gtService.getNPCs(1, this.carX, this.carZ, this.getUserId());
    if (!data) return;

    // Build a map of currently-known health so we don't overwrite local damage
    const prevCarHealth = new Map<number, number>();
    for (const c of this.serverNPCs) prevCarHealth.set(c.id, c.health);
    const prevPedHealth = new Map<number, number>();
    for (const p of this.serverPedestrians) prevPedHealth.set(p.id, p.health);
    const prevParkedHealth = new Map<number, number>();
    for (const p of this.parkedCars) prevParkedHealth.set(p.id, p.health);

    // Keep local police positions to avoid jitter 
    const existingPolice = new Map<number, any>();
    for (const p of this.serverNPCs) {
      if (p.type === 'police') existingPolice.set(p.id, p);
    }

    this.serverNPCs = data.cars
      .filter(c => !this.deadNPCIds.has(c.id) && !this.stolenNpcIds.has(c.id))
      .map(c => {
        const serverHp = c.health ?? 100;
        const localHp = prevCarHealth.get(c.id);
        // Use whichever is lower: local damage or server damage (other players)
        const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;

        let mesh;
        if (c.type === 'police') {
          mesh = this.renderer.getPoliceCarMesh();
        } else if (c.type === 'motorcycle') {
          mesh = this.renderer.getMotorcycleMesh([c.colorR, c.colorG, c.colorB]);
        } else {
          mesh = this.renderer.getNPCCarMesh([c.colorR, c.colorG, c.colorB]);
        }

        const existing = existingPolice.get(c.id);
        if (existing) {
          // Keep local x, z, yaw for smooth chasing
          return { ...existing, health, mesh };
        }

        return {
          id: c.id, x: c.posX, z: c.posZ, yaw: c.yaw,
          type: c.type || 'car',
          health,
          colorR: c.colorR, colorG: c.colorG, colorB: c.colorB,
          mesh,
          remoteShootTimer: 0
        };
      });

    this.serverPedestrians = data.pedestrians
      .filter(p => !this.deadNPCIds.has(p.id))
      .map(p => {
        const serverHp = p.health ?? 50;
        const localHp = prevPedHealth.get(p.id);
        const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;
        return {
          id: p.id, x: p.posX, z: p.posZ, yaw: p.yaw,
          gender: p.gender || 'male',
          health,
          mesh: this.renderer.npcMesh || this.renderer.getPedestrianMesh(p.gender || 'male')
        };
      });

    // Merge parked cars (preserve locally-exited ones)
    const serverParked = data.parkedCars;
    const serverParkedIds = new Set(serverParked.map(p => p.id));
    const localOnlyParked = this.parkedCars.filter(p => !serverParkedIds.has(p.id) && p.id < 0);

    this.parkedCars = [...serverParked.map(pc => {
      const existing = this.parkedCars.find(p => p.id === pc.id);
      const serverHp = pc.health ?? 100;
      const localHp = existing?.health ?? prevParkedHealth.get(pc.id);
      const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;
      if (existing) {
        existing.x = pc.posX; existing.z = pc.posZ; existing.yaw = pc.yaw; existing.health = health;
        return existing;
      }
      return {
        id: pc.id, x: pc.posX, z: pc.posZ, yaw: pc.yaw,
        type: pc.type || 'car', health,
        colorR: pc.colorR, colorG: pc.colorG, colorB: pc.colorB,
        mesh: pc.type === 'motorcycle'
          ? this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB])
          : this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB]),
      };
    }), ...localOnlyParked];
  }

  private startAutoFire() { this.stopAutoFire(); this.autoFireTimer = setInterval(() => this.shoot(), 50); }
  private stopAutoFire() { this.isShooting = false; if (this.autoFireTimer) { clearInterval(this.autoFireTimer); this.autoFireTimer = null; } }
  private getUserId(): number { return (this.parentRef as any)?.user?.id ?? 0; }

  private async pollMultiplayer(): Promise<void> {
    if (this._destroyed) return;
    const userId = this.getUserId();
    if (!userId) { this._pollTimer = setTimeout(() => this.pollMultiplayer(), PLAYER_POLL_SLOW_MS); return; }

    const res = await this.gtService.updatePosition(
      userId, 1, this.carX, this.carY, this.carZ,
      this.camYaw, this.camPitch, this.carYaw, this.carSpeed,
      this.health, this.currentWeapon, this.isShooting,
      this.renderer.currentModelUrl || undefined
    );

    if (res) {
      for (const p of res.players) {
        const existing = this.otherPlayers.find(op => op.userId === p.userId);
        if (existing) {
          existing.posX = p.posX; existing.posY = p.posY; existing.posZ = p.posZ;
          existing.yaw = p.carYaw; existing.carSpeed = p.carSpeed; existing.health = p.health; existing.weapon = p.weapon;
          existing.isShooting = p.isShooting; existing.camYaw = p.yaw; existing.camPitch = p.pitch;
          // Update model if remote player changed modelUrl
          if (p.modelUrl && p.modelUrl !== existing.modelUrl) {
            existing.modelUrl = p.modelUrl;
            (async () => {
              try {
                const loaded = await this.renderer.loadGLTF(p.modelUrl!);
                if (loaded && loaded.length > 0) existing.mesh = loaded;
              } catch (e) { /* ignore load errors */ }
            })();
          }
        } else {
          const color = this.playerColors[Math.abs(p.userId) % this.playerColors.length];
          const placeholderMesh = this.renderer.getOtherPlayerMesh(color);
          const newPlayer = {
            userId: p.userId, posX: p.posX, posY: p.posY, posZ: p.posZ,
            yaw: p.carYaw, carSpeed: p.carSpeed, health: p.health, weapon: p.weapon,
            username: p.username, mesh: placeholderMesh, modelUrl: p.modelUrl,
            isShooting: p.isShooting, camYaw: p.yaw, camPitch: p.pitch, remoteShootTimer: 0
          } as OtherPlayerState;
          this.otherPlayers.push(newPlayer);
          if (p.modelUrl) {
            (async () => {
              try {
                const loaded = await this.renderer.loadGLTF(p.modelUrl!);
                if (loaded && loaded.length > 0) newPlayer.mesh = loaded; // KEEP ALL MESHES
              } catch (e) { /* ignore */ }
            })();
          }
        }
      }
      const activeIds = new Set(res.players.map(p => p.userId));
      this.otherPlayers = this.otherPlayers.filter(op => activeIds.has(op.userId));
    }

    // Server-authoritative health update for local player
    if (res && res.yourHealth !== undefined) {
      // Visualize police shooting us if we take damage 
      if (res.yourHealth < this.health) {
        for (const npc of this.serverNPCs) {
          if (npc.type === 'police') {
            const dx = this.carX - npc.x;
            const dz = this.carZ - npc.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 30) {
              const targetY = this.carY + 1.0;
              const dy = targetY - 1.2;
              const d3 = Math.sqrt(dx * dx + dy * dy + dz * dz);
              this.tracers.push({
                originX: npc.x, originY: 1.2, originZ: npc.z,
                dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3,
                age: 0, lifetime: 0.1
              });
            }
          }
        }
      }
      this.health = res.yourHealth;
    }

    // Update Wanted Level
    if (res && res.wantedLevel !== undefined) {
      this.wantedLevel = res.wantedLevel;
    }

    this._pollTimer = setTimeout(() => this.pollMultiplayer(), this.otherPlayers.length > 0 ? PLAYER_POLL_FAST_MS : PLAYER_POLL_SLOW_MS);
  }

  private shoot() {
    const now = performance.now();
    if (now - this.lastShootTime < WEAPON_COOLDOWNS[this.currentWeapon]) return;
    this.lastShootTime = now;

    const userId = this.getUserId();
    if (!userId) return;

    const dirX = Math.sin(this.camYaw) * Math.cos(this.camPitch);
    const dirY = -Math.sin(this.camPitch);
    const dirZ = Math.cos(this.camYaw) * Math.cos(this.camPitch);

    const originX = this.carX;
    const originY = this.carY + (this.isInCar ? 0.5 : 1.2);
    const originZ = this.carZ;

    if (this.currentWeapon === 3) { // Rocket
      this.rockets.push({ x: originX, y: originY, z: originZ, vx: dirX * 40, vy: dirY * 40, vz: dirZ * 40, age: 0, lifetime: 3 });
    } else {
      const tracerLifetime = this.currentWeapon === 1 ? 0.15 : 0.3;
      this.tracers.push({ originX, originY, originZ, dirX, dirY, dirZ, age: 0, lifetime: tracerLifetime });
      this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, age: 0, lifetime: 0.1 });

      if (this.currentWeapon === 2) { // Shotgun
        for (let i = 1; i < 8; i++) {
          const spread = 0.08;
          this.tracers.push({ originX, originY, originZ, dirX: dirX + (Math.random() - 0.5) * spread, dirY: dirY + (Math.random() - 0.5) * spread, dirZ: dirZ + (Math.random() - 0.5) * spread, age: 0, lifetime: 0.2 });
        }
      }

      // Hit detection
      this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ);
    }
  }

  private checkBulletHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const checkTargets = (list: any[], isPlayer: boolean) => {
      for (const t of list) {
        const tx = t.posX || t.x;
        const ty = (t.posY || 0) + 1.0;
        const tz = t.posZ || t.z;

        const vx = tx - ox, vy = ty - oy, vz = tz - oz;
        const proj = vx * dx + vy * dy + vz * dz;
        if (proj < 0 || proj > 50) continue;

        const closestX = ox + dx * proj, closestY = oy + dy * proj, closestZ = oz + dz * proj;
        const distSq = (tx - closestX) ** 2 + (ty - closestY) ** 2 + (tz - closestZ) ** 2;

        if (distSq < 1.0) { // Hit radius
          this.spawnBlood(tx, ty, tz);
          if (isPlayer) {
            this.gtService.hit(this.getUserId(), t.userId, 1, WEAPON_DAMAGES[this.currentWeapon]);
          } else {
            // Deduct locally for instant visual feedback
            t.health = (t.health ?? 100) - WEAPON_DAMAGES[this.currentWeapon];
            // Tell the server to permanently apply the damage!
            this.gtService.hit(this.getUserId(), t.id, 1, WEAPON_DAMAGES[this.currentWeapon]);
            this.score += 10;
          }
          return true;
        }
      }
      return false;
    };
    checkTargets(this.otherPlayers, true);
    // Allow shooting both pedestrians AND NPC cars
    checkTargets(this.serverPedestrians, false);
    checkTargets(this.serverNPCs, false);
    checkTargets(this.parkedCars, false);
  }

  private spawnBlood(x: number, y: number, z: number) {
    for (let i = 0; i < 5; i++) {
      this.bloodSplats.push({ x, y, z, age: 0, lifetime: 0.5 });
    }
  }

  private spawnExplosion(x: number, y: number, z: number) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 1.0 });
    // Damage entities near explosion
    const checkExplosionHits = (list: any[], isPlayer: boolean) => {
      for (const t of list) {
        const tx = t.posX || t.x;
        const tz = t.posZ || t.z;
        const dx = tx - x, dz = tz - z;
        if (Math.sqrt(dx * dx + dz * dz) < 5) {
          if (isPlayer) this.gtService.hit(this.getUserId(), t.userId, 1, 50);
          else this.spawnBlood(tx, 1.0, tz);
        }
      }
    };
    checkExplosionHits(this.otherPlayers, true);
    checkExplosionHits(this.serverPedestrians, false);
  }

  private gameLoop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.isInCar && this.vehicleType === 'plane') this.updatePlane(dt);
    else if (this.isInCar && this.vehicleType === 'motorcycle') this.updateMotorcycle(dt);
    else if (this.isInCar) this.updateCar(dt);
    else this.updateWalking(dt);

    this.updateCamera(dt);
    this.updateScore(dt);
    this.updateProjectiles(dt);
    this.updateRemoteShooting(dt);
    this.checkNearCar();
    this.updateVehicleCollisions();
    this.findLookTarget();

    // Local Police AI Update
    for (const npc of this.serverNPCs) {
      if (npc.type === 'police') {
        const dx = this.carX - npc.x;
        const dz = this.carZ - npc.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 3) {
          const speed = 15 * dt;
          npc.x += (dx / dist) * speed;
          npc.z += (dz / dist) * speed;
          npc.yaw = Math.atan2(-dx, -dz);
        }
      }
    }

    for (const v of [...this.serverNPCs, ...this.parkedCars]) {
      if (v.health <= 0 && !this.deadNPCIds.has(v.id)) {
        this.deadNPCIds.add(v.id);
        this.spawnExplosion(v.x, 0.5, v.z);
      }
    }
    this.serverNPCs = this.serverNPCs.filter(v => v.health > 0);
    this.serverPedestrians = this.serverPedestrians.filter(p => p.health > 0);
    this.parkedCars = this.parkedCars.filter(pc => pc.health > 0);

    if (this.isInCar && this.carHealth <= 0) {
      this.spawnExplosion(this.carX, 0.5, this.carZ);
      this.exitCar();
      this.carHealth = 100;
    }

    if (this.showMap) this.drawMap();

    const canvas = this.canvasRef.nativeElement;
    const aspect = canvas.width / canvas.height;
    const targetX = this.carX, targetZ = this.carZ;
    // If walking, target Y is 1.2 (chest/head level). If in car, keep it low.
    let targetY = this.carY + (this.isInCar ? 0 : 1.2);
    let effectiveDist = this.camDist, effectiveHeight = this.camHeight;

    if (this.firstPerson) {
      effectiveDist = 0; effectiveHeight = 0;
      targetY = this.carY + (this.isInCar ? 0.3 : 1.5);
    }

    const camX = targetX - Math.sin(this.camYaw) * effectiveDist;
    const camZ = targetZ - Math.cos(this.camYaw) * effectiveDist;
    const camY = targetY + effectiveHeight;
    const renderMesh = this.isInCar ? this.playerVehicleMesh : (this.firstPerson ? null : this.renderer.playerMesh);

    this.renderer.render(
      camX, camY, camZ, this.camYaw, this.camPitch, aspect,
      targetX, this.carY, targetZ, this.carYaw,
      this.serverNPCs, this.otherPlayers, this.serverPedestrians, this.parkedCars,
      this.tracers, this.muzzleFlashes, this.rockets, this.explosions, this.bloodSplats,
      this.bloodPools,
      renderMesh
    );

    this.updateEntityLabels();
    this.hudSpeed = Math.abs(this.carSpeed) * (this.isInCar ? 3.6 : 1);
    this.animFrameId = requestAnimationFrame(this.gameLoop);
  };

  private updateWalking(dt: number) {
    let moveX = 0, moveZ = 0;

    if (this.isMobile && this.joystickActive) {
      moveX += this.joystickX; moveZ += this.joystickY;
    } else {
      if (this.keys.has('KeyW')) moveZ += 1;
      if (this.keys.has('KeyS')) moveZ -= 1;
      if (this.keys.has('KeyA')) moveX += 1;
      if (this.keys.has('KeyD')) moveX -= 1;
    }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0.01) {
      // Camera-relative movement
      const fX = Math.sin(this.camYaw), fZ = Math.cos(this.camYaw);
      const rX = Math.cos(this.camYaw), rZ = -Math.sin(this.camYaw);
      const worldX = moveX * rX + moveZ * fX;
      const worldZ = moveX * rZ + moveZ * fZ;
      const normLen = Math.sqrt(worldX * worldX + worldZ * worldZ) || 1;

      const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const targetSpeed = isSprinting ? 9 : 4;
      const targetVx = (worldX / normLen) * targetSpeed;
      const targetVz = (worldZ / normLen) * targetSpeed;

      // Smooth acceleration
      this.carVx += (targetVx - this.carVx) * Math.min(1, 15 * dt);
      this.carVz += (targetVz - this.carVz) * Math.min(1, 15 * dt);

      // Smoothly rotate character to face movement direction
      const targetYaw = Math.atan2(-worldX, -worldZ);
      let yawDiff = targetYaw - this.walkYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.walkYaw += yawDiff * Math.min(1, 20 * dt);
      this.carYaw = this.walkYaw;
    } else {
      // Smooth deceleration
      this.carVx *= Math.max(0, 1 - 15 * dt);
      this.carVz *= Math.max(0, 1 - 15 * dt);
    }

    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY = CAR_HEIGHT;
    this.carSpeed = Math.sqrt(this.carVx * this.carVx + this.carVz * this.carVz);
    this.pushOutOfBuildings();
  }

  private updateCar(dt: number) {
    let accelForce = 0;
    let isReversing = false;

    if (this.keys.has('KeyW')) accelForce = 25;
    if (this.keys.has('KeyS')) {
      if (this.carSpeed > 1) { accelForce = -45; } // Braking
      else { isReversing = true; accelForce = -15; } // Reverse
    }

    let steer = 0;
    if (this.keys.has('KeyA')) steer = 1;
    if (this.keys.has('KeyD')) steer = -1;

    // Steering effectiveness depends on speed
    const speedFactor = Math.min(1, Math.abs(this.carSpeed) / 5);
    const steerDir = this.carSpeed < -0.5 ? -1 : 1;
    this.carYaw += steer * 2.5 * dt * speedFactor * steerDir;

    const forwardX = -Math.sin(this.carYaw), forwardZ = -Math.cos(this.carYaw);
    const rightX = Math.cos(this.carYaw), rightZ = -Math.sin(this.carYaw);

    if (accelForce !== 0) {
      this.carVx += forwardX * accelForce * dt;
      this.carVz += forwardZ * accelForce * dt;
    }

    // Decompose velocity into forward and lateral components
    let fwdSpeed = this.carVx * forwardX + this.carVz * forwardZ;
    let latSpeed = this.carVx * rightX + this.carVz * rightZ;

    // Rolling friction
    fwdSpeed *= Math.max(0, 1 - 1.5 * dt);

    // Lateral grip (Handbrake reduces grip to allow drifting)
    const isHandbraking = this.keys.has('Space');
    const grip = isHandbraking ? 1.5 : 12.0;
    latSpeed *= Math.max(0, 1 - grip * dt);

    // Recompose velocity
    this.carVx = fwdSpeed * forwardX + latSpeed * rightX;
    this.carVz = fwdSpeed * forwardZ + latSpeed * rightZ;

    // Speed clamp
    const maxSpd = isReversing ? 15 : 55;
    const currentSpd = Math.hypot(this.carVx, this.carVz);
    if (currentSpd > maxSpd) {
      this.carVx = (this.carVx / currentSpd) * maxSpd;
      this.carVz = (this.carVz / currentSpd) * maxSpd;
    }

    this.carSpeed = fwdSpeed; // HUD Speed
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY = CAR_HEIGHT;
    this.pushOutOfBuildings();
  }

  private updateMotorcycle(dt: number) {
    let accelForce = 0;
    let isReversing = false;

    if (this.keys.has('KeyW')) accelForce = 35;
    if (this.keys.has('KeyS')) {
      if (this.carSpeed > 1) accelForce = -50;
      else { isReversing = true; accelForce = -10; }
    }

    let steer = 0;
    if (this.keys.has('KeyA')) steer = 1;
    if (this.keys.has('KeyD')) steer = -1;

    const speedFactor = Math.min(1, Math.abs(this.carSpeed) / 3);
    const steerDir = this.carSpeed < -0.5 ? -1 : 1;
    this.carYaw += steer * 3.0 * dt * speedFactor * steerDir;

    const forwardX = -Math.sin(this.carYaw), forwardZ = -Math.cos(this.carYaw);
    const rightX = Math.cos(this.carYaw), rightZ = -Math.sin(this.carYaw);

    if (accelForce !== 0) {
      this.carVx += forwardX * accelForce * dt;
      this.carVz += forwardZ * accelForce * dt;
    }

    let fwdSpeed = this.carVx * forwardX + this.carVz * forwardZ;
    let latSpeed = this.carVx * rightX + this.carVz * rightZ;

    fwdSpeed *= Math.max(0, 1 - 1.0 * dt);
    // Motorcycles have very high grip
    latSpeed *= Math.max(0, 1 - 20.0 * dt);

    this.carVx = fwdSpeed * forwardX + latSpeed * rightX;
    this.carVz = fwdSpeed * forwardZ + latSpeed * rightZ;

    const maxSpd = isReversing ? 10 : 70;
    const currentSpd = Math.hypot(this.carVx, this.carVz);
    if (currentSpd > maxSpd) {
      this.carVx = (this.carVx / currentSpd) * maxSpd;
      this.carVz = (this.carVz / currentSpd) * maxSpd;
    }

    this.carSpeed = fwdSpeed;
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY = CAR_HEIGHT;
    this.pushOutOfBuildings();
  }

  private updatePlane(dt: number) {
    const accel = 25, maxSpeed = 60, turnSpeed = 1.5;

    if (this.keys.has('KeyW')) this.carSpeed = Math.min(this.carSpeed + accel * dt, maxSpeed);
    if (this.keys.has('KeyS')) this.carSpeed = Math.max(this.carSpeed - accel * dt, 0);
    if (this.keys.has('KeyA')) this.carYaw += turnSpeed * dt;
    if (this.keys.has('KeyD')) this.carYaw -= turnSpeed * dt;

    // Pitch up/down with Space/Shift
    if (this.keys.has('Space')) this.carVy = Math.min(this.carVy + 10 * dt, 10);
    else if (this.keys.has('ShiftLeft')) this.carVy = Math.max(this.carVy - 10 * dt, -10);
    else this.carVy *= 0.95;

    const forwardX = -Math.sin(this.carYaw), forwardZ = -Math.cos(this.carYaw);
    this.carX += forwardX * this.carSpeed * dt;
    this.carZ += forwardZ * this.carSpeed * dt;
    this.carY += this.carVy * dt;

    if (this.carY < CAR_HEIGHT) { this.carY = CAR_HEIGHT; this.carVy = 0; }
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
    const GRID_PITCH = 40, BLOCK_SIZE = 30, blocksPerChunk = CHUNK_SIZE / GRID_PITCH;

    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = chunkCX * (CHUNK_SIZE / GRID_PITCH) + bx;
        const gz = chunkCZ * (CHUNK_SIZE / GRID_PITCH) + by;
        const blockCX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockCZ = gz * GRID_PITCH + GRID_PITCH / 2;

        if (rng() >= 0.75) continue;
        const hw = (6 + rng() * (BLOCK_SIZE - 14)) / 2 + margin;
        const hd = (6 + rng() * (BLOCK_SIZE - 14)) / 2 + margin;
        const dx = this.carX - blockCX, dz = this.carZ - blockCZ;

        if (Math.abs(dx) < hw && Math.abs(dz) < hd && this.carY < 15) {
          const overlapX = hw - Math.abs(dx), overlapZ = hd - Math.abs(dz);
          if (overlapX < overlapZ) { this.carX += dx > 0 ? overlapX : -overlapX; this.carVx *= -0.3; }
          else { this.carZ += dz > 0 ? overlapZ : -overlapZ; this.carVz *= -0.3; }
          this.carSpeed *= 0.5;
        }
      }
    }
  }

  private checkNearCar() {
    if (this.isInCar) { this.nearCar = false; return; }
    this.nearCar = [...this.serverNPCs, ...this.parkedCars].some(v => Math.sqrt((v.x - this.carX) ** 2 + (v.z - this.carZ) ** 2) < ENTER_CAR_DIST);
  }

  private findLookTarget() {
    const dirX = Math.sin(this.camYaw) * Math.cos(this.camPitch);
    const dirY = -Math.sin(this.camPitch);
    const dirZ = Math.cos(this.camYaw) * Math.cos(this.camPitch);
    const ox = this.carX, oy = this.carY + (this.isInCar ? 0.5 : 1.2), oz = this.carZ;
    const maxDist = 30;
    let bestDistSq = Infinity;
    let bestHealth: number | null = null;
    let bestName = '';

    const check = (tx: number, ty: number, tz: number, health: number, name: string) => {
      const vx = tx - ox, vy = ty - oy, vz = tz - oz;
      const proj = vx * dirX + vy * dirY + vz * dirZ;
      if (proj < 0 || proj > maxDist) return;
      const cx = ox + dirX * proj, cy = oy + dirY * proj, cz = oz + dirZ * proj;
      const dSq = (tx - cx) ** 2 + (ty - cy) ** 2 + (tz - cz) ** 2;
      if (dSq < 2.0 && dSq < bestDistSq) {
        bestDistSq = dSq;
        bestHealth = health;
        bestName = name;
      }
    };

    for (const v of this.serverNPCs) { check(v.x, 0.5, v.z, v.health, v.type === 'motorcycle' ? 'Motorcycle' : 'Car'); }
    for (const p of this.parkedCars) { check(p.x, 0.5, p.z, p.health, p.type === 'motorcycle' ? 'Motorcycle' : 'Car'); }
    for (const ped of this.serverPedestrians) { check(ped.x, 1.0, ped.z, ped.health, 'Pedestrian'); }
    for (const pl of this.otherPlayers) { check(pl.posX, pl.posY + 1.0, pl.posZ, pl.health, pl.username); }

    this.lookTargetHealth = bestHealth;
    this.lookTargetName = bestName;
  }

  private updateEntityLabels() {
    const container = document.getElementById('gt-world-labels');
    if (!container) return;
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.width, h = canvas.height;
    const range = 50;
    const parts: string[] = [];
    const add = (wx: number, wy: number, wz: number, name: string, health: number, color: string) => {
      const dx = wx - this.carX, dz = wz - this.carZ;
      if (dx * dx + dz * dz > range * range) return;
      const s = this.renderer.projectToScreen(wx, wy, wz, w, h);
      if (s) parts.push(`<div class="gt-label" style="left:${s.x}px;top:${s.y}px;color:${color}">${name} ${health}%</div>`);
    };
    for (const p of this.otherPlayers) add(p.posX, p.posY + 1.5, p.posZ, p.username, p.health, '#ff4444');
    for (const v of this.serverNPCs) add(v.x, 0.8, v.z, v.type === 'motorcycle' ? 'Motorcycle' : 'Car', v.health, '#ffaa00');
    for (const p of this.parkedCars) add(p.x, 0.8, p.z, p.type === 'motorcycle' ? 'Motorcycle' : 'Car', p.health, '#ffaa00');
    for (const ped of this.serverPedestrians) add(ped.x, 1.2, ped.z, 'Pedestrian', ped.health, '#ffffff');
    container.innerHTML = parts.join('');
  }

  private updateVehicleCollisions() {
    if (!this.isInCar || this.vehicleType === 'plane') return;

    const carRadius = 2.0;
    const collisionDamage = Math.abs(this.carSpeed) * 3;

    for (const v of [...this.serverNPCs, ...this.parkedCars]) {
      if (v.health <= 0) continue;
      const dx = this.carX - v.x;
      const dz = this.carZ - v.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = carRadius * 2;
      if (dist < minDist && dist > 0.01) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        this.carX += nx * overlap * 0.5;
        this.carVx *= -0.3; this.carVz *= -0.3;
        this.carSpeed *= 0.5;
        v.health -= collisionDamage;
        this.carHealth -= collisionDamage * 0.5;
      }
    }

    for (const ped of this.serverPedestrians) {
      if (ped.health <= 0) continue;
      const dx = this.carX - ped.x;
      const dz = this.carZ - ped.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 2.0) {
        const impactForce = Math.max(2, Math.abs(this.carSpeed) * 0.5);
        const angle = Math.atan2(ped.z - this.carZ, ped.x - this.carX);
        ped.x += Math.cos(angle) * impactForce;
        ped.z += Math.sin(angle) * impactForce;
        ped.health -= 25;
        this.spawnBlood(ped.x, 1.0, ped.z);
        this.score += 10;
        if (ped.health <= 0) {
          this.deadNPCIds.add(ped.id);
          this.bloodPools.push({ x: ped.x, z: ped.z, age: 0, lifetime: 8, maxRadius: 3 });
        }
      }
    }
  }

  private updateCamera(_dt: number) {
    // Only auto-center camera behind vehicle if driving and mouse hasn't moved recently
    if (this.isInCar && !this.firstPerson) {
      const timeSinceMouse = performance.now() - this.lastMouseMoveTime;
      if (timeSinceMouse > 1500) {
        const targetYaw = this.carYaw + Math.PI; // Camera sits behind car
        let yawDiff = targetYaw - this.camYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.camYaw += yawDiff * 0.05; // Gentle follow
      }
    }
  }

  private updateProjectiles(dt: number) {
    this.tracers = this.tracers.filter(t => (t.age += dt) < t.lifetime);
    this.muzzleFlashes = this.muzzleFlashes.filter(m => (m.age += dt) < m.lifetime);
    this.bloodSplats = this.bloodSplats.filter(b => (b.age += dt) < b.lifetime);

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      r.age += dt;

      let hit = false;
      if (r.y <= 0) hit = true;
      // Simple collision check with NPCs
      for (const npc of [...this.serverNPCs, ...this.parkedCars]) {
        if (Math.sqrt((npc.x - r.x) ** 2 + (npc.z - r.z) ** 2) < 2) { hit = true; break; }
      }

      if (hit || r.age >= r.lifetime) {
        this.spawnExplosion(r.x, r.y, r.z);
        this.rockets.splice(i, 1);
      }
    }

    this.explosions = this.explosions.filter(e => (e.age += dt) < e.lifetime);
    this.bloodPools = this.bloodPools.filter(bp => (bp.age += dt) < bp.lifetime);
  }

  private updateRemoteShooting(dt: number) {
    for (const p of this.otherPlayers) {
      if (!p.isShooting) { p.remoteShootTimer = 0; continue; }
      p.remoteShootTimer += dt;
      if (p.remoteShootTimer < 0.15) continue;
      p.remoteShootTimer = 0;

      if (p.weapon === 3) {
        const dirX = Math.sin(p.camYaw) * Math.cos(p.camPitch);
        const dirY = -Math.sin(p.camPitch);
        const dirZ = Math.cos(p.camYaw) * Math.cos(p.camPitch);
        this.rockets.push({ x: p.posX, y: p.posY + 0.5, z: p.posZ, vx: dirX * 40, vy: dirY * 40, vz: dirZ * 40, age: 0, lifetime: 3 });
      } else {
        this.tracers.push({ originX: p.posX, originY: p.posY + 0.5, originZ: p.posZ, dirX: Math.sin(p.camYaw) * Math.cos(p.camPitch), dirY: -Math.sin(p.camPitch), dirZ: Math.cos(p.camYaw) * Math.cos(p.camPitch), age: 0, lifetime: 0.3 });
      }
    }
  }

  private drawMap() {
    const canvas = this.mapCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 300, 300);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 300, 300);

    const scale = 0.5;
    const cx = 150, cy = 150;

    // Draw others
    ctx.fillStyle = '#ff0000';
    for (const p of this.otherPlayers) {
      ctx.beginPath(); ctx.arc(cx + (p.posX - this.carX) * scale, cy + (p.posZ - this.carZ) * scale, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Draw NPCs
    ctx.fillStyle = '#ffff00';
    for (const npc of [...this.serverNPCs, ...this.parkedCars]) {
      ctx.beginPath(); ctx.arc(cx + (npc.x - this.carX) * scale, cy + (npc.z - this.carZ) * scale, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Draw self
    ctx.fillStyle = '#00ff00';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  }

  private updateScore(dt: number) {
    if (this.isInCar && this.carSpeed > 5) {
      this.scoreTimer += dt;
      if (this.scoreTimer > 1) { this.score += Math.floor(this.carSpeed * 0.1); this.scoreTimer = 0; }
    }
  }
}