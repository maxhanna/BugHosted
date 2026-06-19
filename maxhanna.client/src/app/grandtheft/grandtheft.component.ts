import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, CityMesh } from './grandtheft-renderer';
import { GrandtheftService } from '../../services/grandtheft.service';
import { UserEventService } from '../../services/user-event.service';

const CHUNK_SIZE = 80;
const CAR_HEIGHT = 0.4;

const WEAPON_NAMES = ['Pistol', 'Rifle', 'Shotgun', 'Rocket Launcher'];
const WEAPON_COOLDOWNS = [300, 150, 800, 1500];
const WEAPON_DAMAGES = [15, 25, 8, 100];
const PLAYER_POLL_FAST_MS = 200;
const PLAYER_POLL_SLOW_MS = 1000;
const ENTER_CAR_DIST = 4;

interface DeadBody {
  id: number;
  x: number; z: number; yaw: number;
  type: string;
  gender?: string;
  mesh: CityMesh | CityMesh[];
  deathTime: number;
  lifetime: number;
  colorR?: number; colorG?: number; colorB?: number;
}

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
  dirX: number; dirY: number; dirZ: number;  // shoot direction (unit vec)
  weapon: number;                              // 0=pistol 1=rifle 2=shotgun 3=RPG
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
  vx: number; vy: number; vz: number;  // particle velocity (m/s)
  size: number;                         // particle scale
  age: number; lifetime: number;
}

interface BloodPool {
  x: number; z: number;
  age: number; lifetime: number; maxRadius: number;
  variant?: number;  // 0-3, picks which blob shape to use (default 0)
}

interface TrafficLane {
  fromIdx: number;
  toIdx: number;
  offsetX: number;
  offsetZ: number;
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
  serverPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; type?: string; mesh: CityMesh | CityMesh[]; health: number }[] = [];
  private npcPollTimer: any = null;
  parkedCars: ParkedCar[] = [];
  trafficCars: { id: number; x: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; path: number[]; pathIdx: number; state: 'drive' | 'stop'; stopTimer: number; nextYaw: number; laneOffsetX: number; laneOffsetZ: number }[] = [];
  private trafficNodes: { x: number; z: number }[] = [];
  private trafficEdges: [number, number][] = [];
  private trafficLanes: TrafficLane[] = [];
  private trafficNodeIdCounter = 10000;
  private trafficSpawnTimer = 0;
  localPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; type?: string; mesh: CityMesh | CityMesh[]; health: number; targetX: number; targetZ: number; waitTimer: number }[] = [];
  private pedSpawnTimer = 0;
  private pedIdCounter = 20000;

  hudSpeed = 0;
  score = 0;
  private scoreTimer = 0;
  money = 1000;
  moneyStacks: { x: number; z: number; amount: number; yaw: number; age: number; lifetime: number }[] = [];
  private _wasDead = false;

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
  deadBodies: DeadBody[] = [];
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

  constructor(private gtService: GrandtheftService, private userEventService: UserEventService) { super(); }

  ngOnInit() { this.userEventService.insertUserEvent(this.parentRef?.user?.id ?? 0, "grandtheft", "Started playing Grand Theft!"); }

  ngAfterViewInit() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.renderer = new GrandTheftRenderer(canvas);
    this.renderer.initPlayerModel('assets/grandtheft/franklin/scene.gltf', false);
    this.renderer.loadGLTF('assets/grandtheft/citylight/scene.gltf').then(lamps => {
      if (lamps) this.renderer.lampMesh = lamps;
    });
    this.renderer.loadGLTF('assets/grandtheft/jillValentine/scene.gltf').then(npc => {
      if (npc) {
        for (const m of npc) m.needsFlip = true;
        this.renderer.npcMeshes.push(npc);
      }
    });
    this.renderer.loadGLTF('assets/grandtheft/lisa/scene.gltf').then(npc => {
      if (npc) {
        for (const m of npc) m.needsFlip = true;
        this.renderer.npcMeshes.push(npc);
      }
    });
    this.renderer.loadGLTF('assets/grandtheft/redneck/scene.gltf').then(npc => {
      if (npc) {
        for (const m of npc) m.needsFlip = false;
        this.renderer.npcMeshes.push(npc);
      }
    });
    // Load Bus
    this.renderer.loadGLTF('assets/grandtheft/bus/scene.gltf').then(bus => {
      if (bus) this.renderer.busMesh = bus;
    });
    this.renderer.loadGLTF('assets/grandtheft/policeMan/scene.gltf').then(cop => {
      if (cop) this.renderer.copMesh = cop;
    });
    // Load Vehicles 
    // Load Vehicles
    this.renderer.loadGLTF('assets/grandtheft/lambo/scene.gltf').then(car => {
      if (car) this.renderer.carMeshes.push(car);
    });
    // Load pizzaMoped as the motorcycle skin. For now this is the only
    // motorcycle mesh, so every motorcycle in the game will look like a
    // pizza moped. Future motorcycle variants can be added by pushing more
    // entries to motorcycleMeshes.
    this.renderer.loadGLTF('assets/grandtheft/pizzaMoped/scene.gltf').then(moto => {
      if (moto) this.renderer.motorcycleMeshes.push(moto);
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
    this.initTraffic();
  }

  private initTraffic() {
    // Build road graph from renderer
    this.trafficNodes = this.renderer.getRoadNodesInRadius(0, 0, 30);
    this.trafficEdges = this.renderer.getRoadEdges(this.trafficNodes);
    this.rebuildLanes();
    // Spawn initial traffic cars
    for (let i = 0; i < 25; i++) {
      this.spawnTrafficCar();
    }
  }

  private spawnTrafficCar() {
    if (this.trafficNodes.length < 4 || this.trafficLanes.length === 0) return;
    const lane = this.trafficLanes[Math.floor(Math.random() * this.trafficLanes.length)];
    const endIdx = Math.floor(Math.random() * this.trafficNodes.length);
    const path = this.findPath(lane.fromIdx, endIdx);
    if (!path || path.length < 2) return;
    const startNode = this.trafficNodes[path[0]];
    const nextNode = this.trafficNodes[path[1]];
    const yaw = Math.atan2(nextNode.x - startNode.x, nextNode.z - startNode.z);
    const color = [0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5];
    const trafficId = --this.trafficNodeIdCounter;
    this.trafficCars.push({
      id: trafficId,
      x: startNode.x + lane.offsetX,
      z: startNode.z + lane.offsetZ,
      yaw,
      type: 'traffic',
      mesh: this.renderer.getNPCCarMesh([color[0], color[1], color[2]], trafficId),
      health: 1000, colorR: color[0], colorG: color[1], colorB: color[2],
      path, pathIdx: 0,
      state: 'drive', stopTimer: 0, nextYaw: yaw,
      laneOffsetX: lane.offsetX, laneOffsetZ: lane.offsetZ,
    });
  }

  private findPath(fromIdx: number, toIdx: number): number[] | null {
    const nodes = this.trafficNodes;
    const edges = this.trafficEdges;
    if (fromIdx === toIdx) return [fromIdx];
    const openSet = new Set<number>([fromIdx]);
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    gScore.set(fromIdx, 0);
    const fScore = new Map<number, number>();
    const h = (i: number, j: number) => Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
    fScore.set(fromIdx, h(fromIdx, toIdx));
    while (openSet.size > 0) {
      let current = -1, bestF = Infinity;
      for (const idx of openSet) {
        const f = fScore.get(idx) ?? Infinity;
        if (f < bestF) { bestF = f; current = idx; }
      }
      if (current === toIdx) {
        const result: number[] = [];
        let cur = current;
        while (cur !== undefined) { result.unshift(cur); cur = cameFrom.get(cur)!; }
        return result;
      }
      openSet.delete(current);
      for (const [ei, ej] of edges) {
        const neighbor = ei === current ? ej : (ej === current ? ei : -1);
        if (neighbor < 0) continue;
        const tentG = (gScore.get(current) ?? Infinity) + h(current, neighbor);
        if (tentG < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentG);
          fScore.set(neighbor, tentG + h(neighbor, toIdx));
          openSet.add(neighbor);
        }
      }
    }
    return null;
  }

  private rebuildLanes() {
    this.trafficLanes = [];
    for (const edge of this.trafficEdges) {
      const a = this.trafficNodes[edge[0]], b = this.trafficNodes[edge[1]];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len === 0) continue;
      const laneOffset = 12.5;
      const perpX = dz / len * laneOffset, perpZ = -dx / len * laneOffset;
      this.trafficLanes.push({ fromIdx: edge[0], toIdx: edge[1], offsetX: perpX, offsetZ: perpZ });
      this.trafficLanes.push({ fromIdx: edge[1], toIdx: edge[0], offsetX: -perpX, offsetZ: -perpZ });
    }
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
        if (v.health <= 0) continue;
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

          // Always tell the server to remove the NPC. The server's StealCar
          // endpoint works for any NPC type (traffic, parked, etc.).
          // Without this for parked cars, the server keeps broadcasting the
          // parked car and the next sync re-adds it, making it look duplicated
          // (once driven by the player, once still parked at the same spot).
          this.gtService.stealCar(v.id, userId);
          this.stolenNpcIds.add(v.id);

          if (isParked) {
            this.parkedCars = this.parkedCars.filter(p => p.id !== v.id);
          } else {
            // Immediately remove from local state so it stops animating
            this.serverNPCs = this.serverNPCs.filter(npc => npc.id !== v.id);
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
        const health = localHp !== undefined ? Math.min(localHp, serverHp) : serverHp;

        let mesh;
        if (c.type === 'cop') {
          mesh = this.renderer.copMesh || this.renderer.getPedestrianMesh('male', c.id);
        } else if (c.type === 'police') {
          mesh = this.renderer.getPoliceCarMesh();
        } else if (c.type === 'motorcycle') {
          mesh = this.renderer.getMotorcycleMesh([c.colorR, c.colorG, c.colorB], c.id);
        } else if (c.type === 'bus') {
          mesh = this.renderer.busMesh || this.renderer.getNPCCarMesh([c.colorR, c.colorG, c.colorB], c.id);
        } else {
          mesh = this.renderer.getNPCCarMesh([c.colorR, c.colorG, c.colorB], c.id);
        }
        const existing = existingPolice.get(c.id);
        if (existing && c.type === 'police') {
          return { ...existing, health, mesh, type: 'police' };
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
        let mesh;
        if (p.type === 'cop') {
          mesh = this.renderer.copMesh || this.renderer.getPedestrianMesh('male', p.id);
        } else {
          mesh = this.renderer.getPedestrianMesh(p.gender || 'male', p.id);
        }
        return {
          id: p.id, x: p.posX, z: p.posZ, yaw: p.yaw,
          gender: p.gender || 'male',
          type: p.type,
          health,
          mesh
        };
      });

    // Merge parked cars (preserve locally-exited ones)
    const serverParked = data.parkedCars;
    const serverParkedIds = new Set(serverParked.map(p => p.id));
    const localOnlyParked = this.parkedCars.filter(p => !serverParkedIds.has(p.id) && p.id < 0);

    this.parkedCars = [...serverParked
      .filter(pc => !this.stolenNpcIds.has(pc.id))
      .map(pc => {
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
            ? this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB], pc.id)
            : pc.type === 'police' || (pc.type === 'parked' && pc.colorR === 0.1 && pc.colorG === 0.1 && pc.colorB === 0.2)
              ? this.renderer.getPoliceCarMesh()
              : this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id),
        };
      }), ...localOnlyParked];

    // Process server dead bodies
    const existingDeadIds = new Set(this.deadBodies.map(d => d.id));
    if (data.deadBodies) {
      for (const db of data.deadBodies) {
        if (existingDeadIds.has(db.id)) continue;
        let mesh: CityMesh | CityMesh[];
        if (db.type === 'cop') {
          mesh = this.renderer.copMesh || this.renderer.getPedestrianMesh('male', db.id);
        } else if (db.type === 'ped_male' || db.type === 'ped_female') {
          mesh = this.renderer.getPedestrianMesh(db.gender || 'male', db.id);
        } else if (db.type === 'motorcycle') {
          mesh = this.renderer.getMotorcycleMesh([db.colorR || 0.5, db.colorG || 0.5, db.colorB || 0.5], db.id);
        } else if (db.type === 'police') {
          mesh = this.renderer.getPoliceCarMesh();
        } else if (db.type === 'bus') {
          mesh = this.renderer.busMesh || this.renderer.getNPCCarMesh([db.colorR || 0.5, db.colorG || 0.5, db.colorB || 0.5], db.id);
        } else if (db.type === 'parked' || db.type === 'car' || db.type === 'bike') {
          mesh = this.renderer.getNPCCarMesh([db.colorR || 0.5, db.colorG || 0.5, db.colorB || 0.5], db.id);
        } else {
          continue;
        }
        this.deadBodies.push({
          id: db.id,
          x: db.posX, z: db.posZ, yaw: db.yaw,
          type: db.type, gender: db.gender,
          mesh,
          deathTime: db.deathTime,
          lifetime: 30,
          colorR: db.colorR, colorG: db.colorG, colorB: db.colorB,
        });
        // Add blood pool for humanoid bodies
        if (db.type === 'ped_male' || db.type === 'ped_female' || db.type === 'cop') {
          this.bloodPools.push({ x: db.posX, z: db.posZ - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
        }
      }
    }
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
      this.renderer.currentModelUrl || undefined,
      this.money
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
          // Fallback to franklin (the local player mesh) so other human
          // players look like franklin too — not generic colored boxes.
          // Only NPCs (serverPedestrians) use the npcMeshes pool.
          const placeholderMesh = this.renderer.playerMesh || this.renderer.getOtherPlayerMesh(color);
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

    // Server-authoritative money
    if (res && res.yourMoney !== undefined) {
      this.money = res.yourMoney;
    }

    // Process player dead bodies from UpdatePosition
    const existingDeadIds = new Set(this.deadBodies.map(d => d.id));
    if (res && res.deadBodies) {
      for (const db of res.deadBodies) {
        if (existingDeadIds.has(db.id)) continue;
        // Find player mesh if available
        let mesh: CityMesh | CityMesh[];
        const otherPlayer = this.otherPlayers.find(op => op.userId === db.userId);
        if (otherPlayer) {
          mesh = otherPlayer.mesh;
        } else {
          // Dead player body — use franklin so it matches the live players.
          mesh = this.renderer.playerMesh || this.renderer.getOtherPlayerMesh([0.5, 0.5, 0.5]);
        }
        this.deadBodies.push({
          id: db.id,
          x: db.posX, z: db.posZ, yaw: db.yaw,
          type: 'player',
          mesh,
          deathTime: db.deathTime,
          lifetime: 30,
        });
        this.bloodPools.push({ x: db.posX, z: db.posZ - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
      }
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
      // Muzzle flash at the gun barrel. The renderer will offset it forward
      // along (dirX,dirY,dirZ) so it appears in front of the player, not
      // stuck inside their chest.
      this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, dirX, dirY, dirZ, weapon: this.currentWeapon, age: 0, lifetime: 0.08 });

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
          this.spawnBlood(tx, ty, tz, dx, dy, dz);
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

  private spawnBlood(x: number, y: number, z: number, dirX: number = 0, dirY: number = 0, dirZ: number = 0) {
    // 14-particle burst with random spread around the impact direction.
    // Backward bias (along -dir) makes blood spurt toward the shooter, like
    // a real ballistic exit wound.
    const dirLen = Math.hypot(dirX, dirY, dirZ);
    const nx = dirLen > 0.0001 ? dirX / dirLen : 0;
    const ny = dirLen > 0.0001 ? dirY / dirLen : 0;
    const nz = dirLen > 0.0001 ? dirZ / dirLen : 0;
    const PARTICLE_COUNT = 14;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Spherical random
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.5 + Math.random() * 3.5;  // 2.5–6 m/s initial speed
      let vx = r * Math.sin(phi) * Math.cos(theta);
      let vy = r * Math.cos(phi);
      let vz = r * Math.sin(phi) * Math.sin(theta);
      // Bias 60% of velocity along -dir (backward spurt) when a direction is provided.
      if (dirLen > 0.0001) {
        const bias = 0.6;
        vx = vx * (1 - bias) + (-nx * r) * bias;
        vy = vy * (1 - bias) + (-ny * r) * bias + 1.5; // upward bias for the spurt arc
        vz = vz * (1 - bias) + (-nz * r) * bias;
      } else {
        vy += 1.5; // still add a slight upward bias for an omnidirectional mist
      }
      this.bloodSplats.push({
        x, y, z,
        vx, vy, vz,
        size: 0.08 + Math.random() * 0.12,  // 0.08–0.20 m droplets
        age: 0,
        lifetime: 0.6 + Math.random() * 0.5,  // 0.6–1.1 s
      });
    }
    // Small persistent blood pool at the impact point (only if near ground)
    if (y < 1.6) {
      this.bloodPools.push({ x, z, age: 0, lifetime: 30, maxRadius: 1.5, variant: Math.floor(Math.random() * 4) });
    }
  }

  private spawnExplosion(x: number, y: number, z: number) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 1.0 });

    // RPG blast: 10m radius, falloff from 150 dmg (center) to 30 dmg (edge).
    const BLAST_RADIUS = 10.0;
    const BLAST_MAX_DMG = 150;
    const BLAST_MIN_DMG = 30;
    const dmgAt = (dist: number) => {
      if (dist >= BLAST_RADIUS) return 0;
      const t = dist / BLAST_RADIUS;  // 0 at center, 1 at edge
      return Math.round(BLAST_MAX_DMG - (BLAST_MAX_DMG - BLAST_MIN_DMG) * t);
    };

    const checkExplosionHits = (list: any[], isPlayer: boolean, isCar: boolean = false) => {
      for (const t of list) {
        const tx = t.posX !== undefined ? t.posX : t.x;
        const tz = t.posZ !== undefined ? t.posZ : t.z;
        const dx = tx - x, dz = tz - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const dmg = dmgAt(dist);
        if (dmg <= 0) continue;
        if (isPlayer) {
          // Tell the server the player took blast damage.
          this.gtService.hit(this.getUserId(), t.userId, 1, dmg);
          // Big blood burst at the victim — dir away from blast center.
          this.spawnBlood(tx, 1.2, tz, dx, 0, dz);
        } else if (isCar) {
          // Apply locally for instant feedback, then tell the server.
          t.health = (t.health ?? 100) - dmg;
          this.gtService.hit(this.getUserId(), t.id, 1, dmg);
        } else {
          // Pedestrian / NPC on foot — blood burst + server damage.
          t.health = (t.health ?? 100) - dmg;
          this.spawnBlood(tx, 1.0, tz, dx, 0, dz);
          this.gtService.hit(this.getUserId(), t.id, 1, dmg);
        }
      }
    };

    // Damage all nearby entity types.
    checkExplosionHits(this.otherPlayers, true);
    checkExplosionHits(this.serverPedestrians, false);
    checkExplosionHits(this.serverNPCs, false, true);
    checkExplosionHits(this.parkedCars, false, true);
    checkExplosionHits(this.trafficCars, false, true);
    checkExplosionHits(this.localPedestrians, false);

    // Self-damage: the local player can be caught in their own (or someone
    // else's) blast. This was previously missing entirely.
    const selfDx = this.carX - x, selfDz = this.carZ - z;
    const selfDist = Math.sqrt(selfDx * selfDx + selfDz * selfDz);
    const selfDmg = dmgAt(selfDist);
    if (selfDmg > 0) {
      // If in a vehicle, the vehicle shields a bit and takes most of the damage.
      if (this.isInCar) {
        this.carHealth = Math.max(0, this.carHealth - selfDmg);
        // Pass-through to player at 40% if inside the car.
        const passThrough = Math.round(selfDmg * 0.4);
        if (passThrough > 0) {
          this.gtService.hit(this.getUserId(), this.getUserId(), 1, passThrough);
          this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, selfDx, 0, selfDz);
        }
      } else {
        this.gtService.hit(this.getUserId(), this.getUserId(), 1, selfDmg);
        this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, selfDx, 0, selfDz);
      }
    }
  }

  private updateTraffic(dt: number) {
    this.trafficSpawnTimer += dt;
    if (this.trafficSpawnTimer > 3) {
      this.trafficSpawnTimer = 0;
      if (this.trafficCars.length < 35) this.spawnTrafficCar();
    }

    // Rebuild road graph near player periodically
    if (Math.floor(this.carX / 80) !== this._lastTrafficChunkX || Math.floor(this.carZ / 80) !== this._lastTrafficChunkZ) {
      this._lastTrafficChunkX = Math.floor(this.carX / 80);
      this._lastTrafficChunkZ = Math.floor(this.carZ / 80);
      this.trafficNodes = this.renderer.getRoadNodesInRadius(this._lastTrafficChunkX, this._lastTrafficChunkZ, 25);
      this.trafficEdges = this.renderer.getRoadEdges(this.trafficNodes);
      this.rebuildLanes();
    }

    for (let ci = this.trafficCars.length - 1; ci >= 0; ci--) {
      const car = this.trafficCars[ci];
      // Remove traffic cars too far from player
      if (Math.abs(car.x - this.carX) > 600 || Math.abs(car.z - this.carZ) > 600) {
        this.trafficCars.splice(ci, 1);
        continue;
      }

      if (car.state === 'stop') {
        car.stopTimer -= dt;
        if (car.stopTimer <= 0) {
          car.state = 'drive';
          car.yaw = car.nextYaw;
        }
        continue;
      }

      // If path is exhausted, pick a new one
      if (!car.path || car.pathIdx >= car.path.length) {
        const fromIdx = this.closestNode(car.x, car.z);
        const toIdx = Math.floor(Math.random() * this.trafficNodes.length);
        const newPath = this.findPath(fromIdx, toIdx);
        if (newPath && newPath.length > 1) {
          car.path = newPath;
          car.pathIdx = 0;
        } else {
          this.trafficCars.splice(ci, 1);
          continue;
        }
      }

      const currIdx = car.path[car.pathIdx];
      const nextIdx = car.pathIdx + 1 < car.path.length ? car.path[car.pathIdx + 1] : -1;
      const currNode = this.trafficNodes[currIdx];
      const nextNode = nextIdx >= 0 ? this.trafficNodes[nextIdx] : null;

      // Lane offset for the current road segment
      const lane = this.trafficLanes.find(l => l.fromIdx === currIdx && l.toIdx === nextIdx);
      const laneOffX = lane ? lane.offsetX : 0;
      const laneOffZ = lane ? lane.offsetZ : 0;

      // Lane-offset position of the current node (intersection entry point in our lane)
      const currLaneX = currNode.x + laneOffX;
      const currLaneZ = currNode.z + laneOffZ;
      const distToCurr = Math.hypot(currLaneX - car.x, currLaneZ - car.z);

      // Intersection check: trigger when car is near the current node's lane position
      if (distToCurr < 15 && nextNode) {
        const nextYaw = Math.atan2(nextNode.x - currNode.x, nextNode.z - currNode.z);
        const isTurning = Math.abs(nextYaw - car.yaw) > 0.1
          && Math.abs(nextYaw - car.yaw) < Math.PI - 0.1;

        // Check for cross traffic at intersection
        let crossTraffic = false;
        const ourDirX = nextNode.x - currNode.x;
        const ourDirZ = nextNode.z - currNode.z;
        const ourLen = Math.hypot(ourDirX, ourDirZ);
        if (ourLen > 0) {
          const ourDx = ourDirX / ourLen;
          const ourDz = ourDirZ / ourLen;
          for (const other of this.trafficCars) {
            if (other.id === car.id || other.health <= 0) continue;
            // Correct other car's position to road-center before measuring distance
            const otherRoadX = other.x - other.laneOffsetX;
            const otherRoadZ = other.z - other.laneOffsetZ;
            const otherDist = Math.hypot(otherRoadX - currNode.x, otherRoadZ - currNode.z);
            if (otherDist < 20) {
              if (other.path && other.pathIdx + 1 < other.path.length) {
                const oCurr = this.trafficNodes[other.path[other.pathIdx]];
                const oNext = this.trafficNodes[other.path[other.pathIdx + 1]];
                const odx = oNext.x - oCurr.x;
                const odz = oNext.z - oCurr.z;
                const olen = Math.hypot(odx, odz);
                if (olen > 0) {
                  const otherDx = odx / olen;
                  const otherDz = odz / olen;
                  const dot = Math.abs(ourDx * otherDx + ourDz * otherDz);
                  if (dot < 0.3) {
                    crossTraffic = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if (crossTraffic && distToCurr < 8) {
          car.state = 'stop';
          car.stopTimer = 0.5;
          car.nextYaw = nextYaw;
          continue;
        }

        if (isTurning && distToCurr < 8) {
          car.state = 'stop';
          car.stopTimer = 0.4;
          car.nextYaw = nextYaw;
          continue;
        }
      }

      // Target: drive toward the NEXT node's lane-offset position
      const targetX = nextNode ? nextNode.x + laneOffX : currNode.x;
      const targetZ = nextNode ? nextNode.z + laneOffZ : currNode.z;
      const distToTarget = Math.hypot(targetX - car.x, targetZ - car.z);

      // Advance to next node when we reach the lane-offset target
      if (distToTarget < 2) {
        car.pathIdx++;
        if (car.pathIdx < car.path.length) {
          const newTarget = this.trafficNodes[car.path[car.pathIdx]];
          car.yaw = Math.atan2(newTarget.x - currNode.x, newTarget.z - currNode.z);
        }
        continue;
      }

      // Drive toward lane-offset target
      const tdx = targetX - car.x;
      const tdz = targetZ - car.z;
      const targetYaw = Math.atan2(tdx, tdz);
      let yawDiff2 = targetYaw - car.yaw;
      while (yawDiff2 > Math.PI) yawDiff2 -= Math.PI * 2;
      while (yawDiff2 < -Math.PI) yawDiff2 += Math.PI * 2;
      car.yaw += yawDiff2 * Math.min(1, 4 * dt);
      const speed = Math.min(distToTarget / dt, 12);
      car.x += Math.sin(car.yaw) * speed * dt;
      car.z += Math.cos(car.yaw) * speed * dt;
    }
  }

  private updatePedestrians(dt: number) {
    this.pedSpawnTimer += dt;

    const sidewalkNodes: { x: number; z: number }[] = [];
    const playerCX = Math.floor(this.carX / CHUNK_SIZE);
    const playerCZ = Math.floor(this.carZ / CHUNK_SIZE);
    const viewRadius = 3;
    const _GRID_PITCH = 80;
    const _BLOCK_SIZE = 30;
    for (let dz = -viewRadius; dz <= viewRadius; dz++) {
      for (let dx = -viewRadius; dx <= viewRadius; dx++) {
        const cx = playerCX + dx;
        const cz = playerCZ + dz;
        const blocksPerChunk = CHUNK_SIZE / _GRID_PITCH;
        for (let by = 0; by < blocksPerChunk; by++) {
          for (let bx = 0; bx < blocksPerChunk; bx++) {
            const gx = cx * blocksPerChunk + bx;
            const gz = cz * blocksPerChunk + by;
            const bxCenter = gx * _GRID_PITCH + _GRID_PITCH / 2;
            const bzCenter = gz * _GRID_PITCH + _GRID_PITCH / 2;
            const halfSW = (_BLOCK_SIZE + 6) / 2;
            const inset = 1;
            sidewalkNodes.push(
              { x: bxCenter - halfSW + inset, z: bzCenter - halfSW + inset },
              { x: bxCenter + halfSW - inset, z: bzCenter - halfSW + inset },
              { x: bxCenter + halfSW - inset, z: bzCenter + halfSW - inset },
              { x: bxCenter - halfSW + inset, z: bzCenter + halfSW - inset },
            );
          }
        }
      }
    }

    if (this.pedSpawnTimer > 2 && this.localPedestrians.length < 20 && sidewalkNodes.length > 0) {
      this.pedSpawnTimer = 0;
      const srcNode = sidewalkNodes[Math.floor(Math.random() * sidewalkNodes.length)];
      const dstNode = sidewalkNodes[Math.floor(Math.random() * sidewalkNodes.length)];
      const gender = Math.random() < 0.5 ? 'male' : 'female';
      const pedId = --this.pedIdCounter;
      this.localPedestrians.push({
        id: pedId,
        x: srcNode.x,
        z: srcNode.z,
        yaw: Math.atan2(dstNode.x - srcNode.x, dstNode.z - srcNode.z),
        gender,
        mesh: this.renderer.getPedestrianMesh(gender, pedId),
        health: 100,
        targetX: dstNode.x, targetZ: dstNode.z,
        waitTimer: 0,
      });
    }

    for (let i = this.localPedestrians.length - 1; i >= 0; i--) {
      const ped = this.localPedestrians[i];
      if (ped.health <= 0) {
        this.deadBodies.push({
          id: -(this.deadBodies.length + 1000),
          x: ped.x, z: ped.z, yaw: ped.yaw,
          type: 'ped_male',
          gender: ped.gender,
          mesh: ped.mesh,
          deathTime: performance.now() / 1000,
          lifetime: 30,
        });
        this.bloodPools.push({ x: ped.x, z: ped.z - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
        this.localPedestrians.splice(i, 1);
        continue;
      }
      if (Math.abs(ped.x - this.carX) > 300 || Math.abs(ped.z - this.carZ) > 300) {
        this.localPedestrians.splice(i, 1); continue;
      }

      if (ped.waitTimer > 0) {
        ped.waitTimer -= dt;
        continue;
      }

      const dx = ped.targetX - ped.x;
      const dz = ped.targetZ - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.5) {
        if (sidewalkNodes.length > 0) {
          const dst = sidewalkNodes[Math.floor(Math.random() * sidewalkNodes.length)];
          ped.targetX = dst.x;
          ped.targetZ = dst.z;
          ped.yaw = Math.atan2(dst.x - ped.x, dst.z - ped.z);
          ped.waitTimer = 1 + Math.random() * 2;
        }
        continue;
      }

      const targetYaw = Math.atan2(dx, dz);
      let yawDiff = targetYaw - ped.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      ped.yaw += yawDiff * Math.min(1, 5 * dt);
      const speed = 2;
      ped.x += Math.sin(ped.yaw) * speed * dt;
      ped.z += Math.cos(ped.yaw) * speed * dt;
    }
  }

  private _lastTrafficChunkX = 0;
  private _lastTrafficChunkZ = 0;

  private closestNode(x: number, z: number): number {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < this.trafficNodes.length; i++) {
      const d = (this.trafficNodes[i].x - x) ** 2 + (this.trafficNodes[i].z - z) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
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
    this.updateTraffic(dt);
    this.updatePedestrians(dt);

    for (const v of [...this.serverNPCs, ...this.parkedCars]) {
      if (v.health <= 0 && !this.deadNPCIds.has(v.id)) {
        this.deadNPCIds.add(v.id);
        this.spawnExplosion(v.x, 0.5, v.z);
        this.dropMoneyAt(v.x, v.z, 100 + Math.floor(Math.random() * 900));
        this.deadBodies.push({
          id: v.id,
          x: v.x, z: v.z, yaw: v.yaw,
          type: v.type || 'car',
          mesh: v.mesh,
          deathTime: performance.now() / 1000,
          lifetime: 30,
          colorR: v.colorR, colorG: v.colorG, colorB: v.colorB,
        });
      }
    }
    for (const ped of this.serverPedestrians) {
      if (ped.health <= 0 && !this.deadNPCIds.has(ped.id)) {
        this.deadNPCIds.add(ped.id);
        this.dropMoneyAt(ped.x, ped.z, 50 + Math.floor(Math.random() * 150));
        this.deadBodies.push({
          id: ped.id,
          x: ped.x, z: ped.z, yaw: ped.yaw,
          type: ped.type || 'ped_male',
          gender: ped.gender,
          mesh: ped.mesh,
          deathTime: performance.now() / 1000,
          lifetime: 30,
        });
        this.bloodPools.push({ x: ped.x, z: ped.z - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
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

    // Player death: drop all money once
    if (this.health <= 0) {
      if (!this._wasDead) {
        this._wasDead = true;
        this.dropMoneyAt(this.carX, this.carZ, this.money);
        this.money = 0;
      }
    } else {
      this._wasDead = false;
    }

    // Collect nearby money stacks
    for (let i = this.moneyStacks.length - 1; i >= 0; i--) {
      const s = this.moneyStacks[i];
      s.age += dt;
      if (s.age > s.lifetime) { this.moneyStacks.splice(i, 1); continue; }
      const dx = this.carX - s.x, dz = this.carZ - s.z;
      if (Math.hypot(dx, dz) < 1.5) {
        this.money += s.amount;
        this.moneyStacks.splice(i, 1);
      }
    }

    if (this.showMap) this.drawMap();

    const canvas = this.canvasRef.nativeElement;
    const aspect = canvas.width / canvas.height;
    const targetX = this.carX, targetZ = this.carZ;
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
    // Merge traffic cars and local pedestrians for rendering
    const allNPCs = [...this.serverNPCs, ...this.trafficCars];
    const allPeds = [...this.serverPedestrians, ...this.localPedestrians];

    this.renderer.render(
      camX, camY, camZ, this.camYaw, this.camPitch, aspect,
      targetX, this.carY - CAR_HEIGHT, targetZ, this.carYaw,
      allNPCs, this.otherPlayers, allPeds, this.parkedCars,
      this.tracers, this.muzzleFlashes, this.rockets, this.explosions, this.bloodSplats,
      this.bloodPools,
      this.moneyStacks,
      this.deadBodies,
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
      const targetYaw = Math.atan2(worldX, worldZ);
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

    if (accelForce !== 0) {
      this.carVx += Math.sin(this.carYaw) * accelForce * dt;
      this.carVz += Math.cos(this.carYaw) * accelForce * dt;
    }

    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    const rightX = Math.cos(this.carYaw), rightZ = -Math.sin(this.carYaw);

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

    if (accelForce !== 0) {
      this.carVx += Math.sin(this.carYaw) * accelForce * dt;
      this.carVz += Math.cos(this.carYaw) * accelForce * dt;
    }

    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    const rightX = Math.cos(this.carYaw), rightZ = -Math.sin(this.carYaw);

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

    this.carX += Math.sin(this.carYaw) * this.carSpeed * dt;
    this.carZ += Math.cos(this.carYaw) * this.carSpeed * dt;
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
    const GRID_PITCH = 80, BLOCK_SIZE = 30, blocksPerChunk = CHUNK_SIZE / GRID_PITCH;

    for (let by = 0; by < blocksPerChunk; by++) {
      for (let bx = 0; bx < blocksPerChunk; bx++) {
        const gx = chunkCX * (CHUNK_SIZE / GRID_PITCH) + bx;
        const gz = chunkCZ * (CHUNK_SIZE / GRID_PITCH) + by;
        const blockCX = gx * GRID_PITCH + GRID_PITCH / 2;
        const blockCZ = gz * GRID_PITCH + GRID_PITCH / 2;

        if (rng() >= 0.75) continue;
        const maxDim = BLOCK_SIZE + 6;
        const hw = (14 + rng() * (maxDim - 14)) / 2 + margin;
        const hd = (14 + rng() * (maxDim - 14)) / 2 + margin;
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
    this.nearCar = [...this.serverNPCs, ...this.parkedCars].some(v => v.health > 0 && Math.sqrt((v.x - this.carX) ** 2 + (v.z - this.carZ) ** 2) < ENTER_CAR_DIST);
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
    for (const ped of this.serverPedestrians) { check(ped.x, 1.0, ped.z, ped.health, ped.type === 'cop' ? 'Police' : 'Pedestrian'); }
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
    for (const ped of this.serverPedestrians) add(ped.x, 1.2, ped.z, ped.type === 'cop' ? 'Police' : 'Pedestrian', ped.health, '#ffffff');
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
          this.deadBodies.push({
            id: ped.id,
            x: ped.x, z: ped.z, yaw: ped.yaw,
            type: ped.type || 'ped_male',
            gender: ped.gender,
            mesh: ped.mesh,
            deathTime: performance.now() / 1000,
            lifetime: 30,
          });
          this.bloodPools.push({ x: ped.x, z: ped.z - 1.0, age: 0, lifetime: 30, maxRadius: 3, variant: Math.floor(Math.random() * 4) });
          this.dropMoneyAt(ped.x, ped.z, 50 + Math.floor(Math.random() * 150));
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
    // Update blood particles: integrate velocity, apply gravity, ground clamp.
    const GRAVITY = 9.8;
    for (const b of this.bloodSplats) {
      b.age += dt;
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      // Splat on the ground: stop motion, leave a small pool, let the particle die naturally.
      if (b.y <= 0.02) {
        b.y = 0.02;
        b.vx = 0; b.vy = 0; b.vz = 0;
        // Only drop one pool per particle, and only if the particle has lived
        // long enough to have travelled (avoids 14 pools stacking at impact).
        if (b.age > 0.05 && b.age < 0.15 && Math.random() < 0.5) {
          this.bloodPools.push({ x: b.x, z: b.z, age: 0, lifetime: 30, maxRadius: 0.6, variant: Math.floor(Math.random() * 4) });
        }
      }
    }
    this.bloodSplats = this.bloodSplats.filter(b => b.age < b.lifetime);

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
    const now = performance.now() / 1000;
    this.deadBodies = this.deadBodies.filter(db => (now - db.deathTime) < db.lifetime);
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
        const rdirX = Math.sin(p.camYaw) * Math.cos(p.camPitch);
        const rdirY = -Math.sin(p.camPitch);
        const rdirZ = Math.cos(p.camYaw) * Math.cos(p.camPitch);
        this.tracers.push({ originX: p.posX, originY: p.posY + 0.5, originZ: p.posZ, dirX: rdirX, dirY: rdirY, dirZ: rdirZ, age: 0, lifetime: 0.3 });
        // Spawn a muzzle flash for the remote shooter too — previously
        // missing, so other players appeared to shoot with no flash.
        this.muzzleFlashes.push({ x: p.posX, y: p.posY + 1.0, z: p.posZ, dirX: rdirX, dirY: rdirY, dirZ: rdirZ, weapon: p.weapon, age: 0, lifetime: 0.08 });
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

  private dropMoneyAt(x: number, z: number, totalAmount: number) {
    const numStacks = Math.max(1, Math.floor(totalAmount / 1000));
    for (let s = 0; s < numStacks; s++) {
      this.moneyStacks.push({
        x: x + (Math.random() - 0.5) * 2,
        z: z + (Math.random() - 0.5) * 2,
        amount: 1000,
        yaw: Math.random() * Math.PI * 2,
        age: 0,
        lifetime: 30,
      });
    }
    const remainder = totalAmount - numStacks * 1000;
    if (remainder > 0) {
      this.moneyStacks.push({
        x: x + (Math.random() - 0.5) * 2,
        z: z + (Math.random() - 0.5) * 2,
        amount: remainder,
        yaw: Math.random() * Math.PI * 2,
        age: 0,
        lifetime: 30,
      });
    }
  }
}