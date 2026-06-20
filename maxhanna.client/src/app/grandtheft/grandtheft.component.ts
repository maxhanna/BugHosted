import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, CityMesh } from './grandtheft-renderer';
import { GrandtheftService } from '../../services/grandtheft.service';
import { UserEventService } from '../../services/user-event.service';
import { User } from '../../services/datacontracts/user/user';

const CHUNK_SIZE = 80;
const CAR_HEIGHT = 0.4;

const WEAPON_NAMES = ['Pistol', 'Rifle', 'Shotgun', 'Rocket Launcher'];
const WEAPON_COOLDOWNS = [300, 150, 800, 1500];

const HOSPITAL_X = 40;
const HOSPITAL_Z = 40;
const HOSPITAL_SPAWN_X = HOSPITAL_X;
const HOSPITAL_SPAWN_Z = HOSPITAL_Z + 22;
const HOSPITAL_SPAWN_YAW = Math.PI;

const VENDING_MACHINE_INTERVAL = 10;
const VENDING_MACHINE_HEAL_DIST = 4;
const VENDING_MACHINE_OFFSET = 12;
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
  money: number;
  username: string;
  mesh: CityMesh | CityMesh[];
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
  dirX: number; dirY: number; dirZ: number;
  weapon: number;
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
  vx: number; vy: number; vz: number;
  size: number;
  age: number; lifetime: number;
}

interface BloodPool {
  x: number; z: number;
  age: number; lifetime: number; maxRadius: number;
  variant?: number;
}

interface VendingMachine {
  x: number; z: number;
  yaw: number;
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

  carX = HOSPITAL_SPAWN_X; carY = CAR_HEIGHT; carZ = HOSPITAL_SPAWN_Z;
  carYaw = HOSPITAL_SPAWN_YAW;
  carVx = 0; carVz = 0; carVy = 0;
  carSpeed = 0;
  carAngleVel = 0;

  carHealth = 100;
  isInCar = false;
  vehicleType: 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' | 'taxi' = 'car';

  camYaw = 0; camPitch = 0.2;
  camDist = 4; camHeight = 2;
  firstPerson = false;
  private isPointerLocked = false;
  serverNPCs: { id: number; x: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; remoteShootTimer?: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number }[] = [];
  serverPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; type?: string; mesh: CityMesh | CityMesh[]; health: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number }[] = [];
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
  private _respawnTimer: any = null;
  isLoaded = false;
  showMap = false;
  showWeaponWheel = false;
  showLeaderboard = false;
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
  vendingMachines: VendingMachine[] = [];
  nearVendingMachine = false;
  taxiMission: { state: 'pickup' | 'deliver'; passengerId: number; passengerGender: string; passengerMesh: CityMesh | CityMesh[]; passengerX: number; passengerZ: number; destinationX: number; destinationZ: number; fare: number; phase: number; timer: number } | null = null;
  private taxiSearchTimer = 0;
  taxiMarkers: { type: 'hail' | 'destination' | 'beam'; x: number; z: number; phase?: number }[] = [];
  taxiMode = false;
  taxiSearchCountdown = 0;
  taxiAttachedMeshes: { mesh: CityMesh | CityMesh[]; offsetX: number; offsetY: number; offsetZ: number; yaw: number; scale?: number }[] = [];
  private _lastVendingChunkX = 999;
  private _lastVendingChunkZ = 999;
  lookTargetHealth: number | null = null;
  lookTargetName: string = '';
  playerVehicleMesh: CityMesh | CityMesh[] | null = null;
  playerVehicleColor: [number, number, number] = [1, 1, 1];

  currentWeapon = 0;
  health = 100;
  wantedLevel = 0;
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
  private joystickThumbEl: HTMLElement | null = null;
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
    this.renderer.loadGLTF('assets/grandtheft/bus/scene.gltf').then(bus => {
      if (bus) this.renderer.busMesh = bus;
    });
    this.renderer.loadGLTF('assets/grandtheft/policeMan/scene.gltf').then(cop => {
      if (cop) this.renderer.copMesh = cop;
    });
    this.renderer.loadGLTF('assets/grandtheft/lambo/scene.gltf').then(car => {
      if (car) this.renderer.carMeshes.push(car);
    });

    this.renderer.loadGLTF('assets/grandtheft/pizzaMoped/scene.gltf').then(moto => {
      if (moto) this.renderer.motorcycleMeshes.push(moto);
    });
    this.renderer.loadGLTF('assets/grandtheft/crownVic/scene.gltf').then(police => {
      if (police) this.renderer.policeCarMesh = police;
    });
    this.renderer.loadGLTF('assets/grandtheft/hospital/scene.gltf').then(hospital => {
      if (hospital) this.renderer.hospitalMesh = hospital;
    });
    this.renderer.loadGLTF('assets/grandtheft/vendingMachine/scene.gltf').then(vm => {
      if (vm) this.renderer.vendingMachineMesh = vm;
    });
    this.renderer.loadGLTF('assets/grandtheft/taxi/scene.gltf').then(taxi => {
      if (taxi) this.renderer.taxiMesh = taxi;
    });
    this.renderer.loadGLTF('assets/grandtheft/rocket/scene.gltf').then(rkt => {
      if (rkt) this.renderer.rocketMesh = rkt;
    });
    this.renderer.loadGLTF('assets/grandtheft/trafficLight/scene.gltf').then(tl => {
      if (tl) this.renderer.trafficLightMesh = tl;
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
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyE') this.toggleCar();
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'KeyM') this.showMap = !this.showMap;
      if (e.code === 'KeyL') this.showLeaderboard = !this.showLeaderboard;
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
    this.trafficNodes = this.renderer.getRoadNodesInRadius(0, 0, 30);
    this.trafficEdges = this.renderer.getRoadEdges(this.trafficNodes);
    this.rebuildLanes();
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
    this.joystickThumbEl = document.getElementById('gt-joystick-thumb');

    const updateThumb = (x: number, y: number) => {
      if (!this.joystickThumbEl) return;
      const dx = x - window.innerWidth / 4;
      const dy = y - window.innerHeight * 0.7;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 80) {
        this.joystickX = dx / dist;
        this.joystickY = dy / dist;
      } else if (dist > 1) {
        this.joystickX = dx / 80;
        this.joystickY = dy / 80;
      } else {
        this.joystickX = 0;
        this.joystickY = 0;
      }
      const thumbOffset = Math.min(dist, 80);
      const tx = dist > 1 ? (dx / dist) * thumbOffset : 0;
      const ty = dist > 1 ? (dy / dist) * thumbOffset : 0;
      this.joystickThumbEl.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
    };

    canvas.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2 && this.joystickId === -1) {
          this.joystickId = t.identifier; this.joystickActive = true;
          updateThumb(t.clientX, t.clientY);
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
          updateThumb(t.clientX, t.clientY);
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
        if (t.identifier === this.joystickId) {
          this.joystickId = -1; this.joystickActive = false; this.joystickX = 0; this.joystickY = 0;
          if (this.joystickThumbEl) this.joystickThumbEl.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
        }
        if (t.identifier === this.touchCamId) { this.touchCamId = -1; }
      }
    }, { passive: true });
  }

  mobileShoot() { this.isShooting = true; this.shoot(); this.startAutoFire(); }
  mobileShootEnd() { this.isShooting = false; this.stopAutoFire(); }

  toggleCar() {
    if (this.isInCar) {
      this.exitCar();
    } else if (this.nearCar) {
      this.enterCar();
    } else if (this.nearVendingMachine) {
      // Use vending machine: heal to 100%
      this.health = 100;
    }
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

          this.playerVehicleMesh = v.mesh;
          this.playerVehicleColor = [v.colorR || 1, v.colorG || 1, v.colorB || 1];

          if (this.vehicleType === 'plane') { this.camDist = 12; this.camHeight = 5; }
          else if (this.vehicleType === 'motorcycle') { this.camDist = 6; this.camHeight = 2.5; }
          else { this.camDist = 8; this.camHeight = 3; }

          this.gtService.stealCar(v.id, userId);
          this.stolenNpcIds.add(v.id);

          if (isParked) {
            this.parkedCars = this.parkedCars.filter(p => p.id !== v.id);
          } else {
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
    // Abandon any active taxi mission. If we were mid-delivery, the
    // passenger is silently dropped (no fare) — they'd realistically
    // just get out and walk away too. The next time the player enters
    // a taxi, the search timer will start fresh.
    this.taxiMission = null;
    this.taxiMarkers = [];
    this.taxiAttachedMeshes = [];
    this.taxiSearchTimer = 0;
  }

  private startPolling() { this.pollMultiplayer(); }
  private stopPolling() { if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; } }
  private startNPCPolling() { this.pollNPCs(); this.npcPollTimer = setInterval(() => this.pollNPCs(), 1000); } // Faster polling for smoothness
  private stopNPCPolling() { if (this.npcPollTimer) { clearInterval(this.npcPollTimer); this.npcPollTimer = null; } }

  private async pollNPCs(): Promise<void> {
    if (this._destroyed) return;
    const data = await this.gtService.getNPCs(1, this.carX, this.carZ, this.getUserId());
    if (!data) return;

    const prevCarHealth = new Map<number, number>();
    for (const c of this.serverNPCs) prevCarHealth.set(c.id, c.health);
    const prevPedHealth = new Map<number, number>();
    for (const p of this.serverPedestrians) prevPedHealth.set(p.id, p.health);
    const prevParkedHealth = new Map<number, number>();
    for (const p of this.parkedCars) prevParkedHealth.set(p.id, p.health);

    const prevNPCState = new Map<number, any>();
    for (const c of this.serverNPCs) prevNPCState.set(c.id, c);
    const prevPedState = new Map<number, any>();
    for (const p of this.serverPedestrians) prevPedState.set(p.id, p);
    const pollTimestamp = performance.now();

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
        } else if (c.type === 'taxi') {
          mesh = this.renderer.getTaxiMesh();
        } else {
          mesh = this.renderer.getNPCCarMesh([c.colorR, c.colorG, c.colorB], c.id);
        }

        const JUMP_THRESHOLD = 50;
        const newX = c.posX, newZ = c.posZ, newYaw = c.yaw, newSpeed = c.speed ?? 0;
        const existing = prevNPCState.get(c.id) ?? existingPolice.get(c.id);
        const interp = (() => {
          if (!existing) {
            return { prevX: newX, prevZ: newZ, prevYaw: newYaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp };
          }
          const jumpDist = Math.hypot(newX - existing.x, newZ - existing.z);
          if (jumpDist > JUMP_THRESHOLD) {
            return { prevX: newX, prevZ: newZ, prevYaw: newYaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp };
          }
          return { prevX: existing.x, prevZ: existing.z, prevYaw: existing.yaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp };
        })();

        return {
          id: c.id,
          x: interp.prevX, z: interp.prevZ, yaw: interp.prevYaw,
          type: c.type || 'car',
          health,
          colorR: c.colorR, colorG: c.colorG, colorB: c.colorB,
          mesh,
          remoteShootTimer: 0,
          ...interp
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

        const JUMP_THRESHOLD = 50;
        const newX = p.posX, newZ = p.posZ, newYaw = p.yaw, newSpeed = p.speed ?? 0;
        const existing = prevPedState.get(p.id);
        const interp = (() => {
          if (!existing) {
            return { prevX: newX, prevZ: newZ, prevYaw: newYaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp };
          }
          const jumpDist = Math.hypot(newX - existing.x, newZ - existing.z);
          if (jumpDist > JUMP_THRESHOLD) {
            return { prevX: newX, prevZ: newZ, prevYaw: newYaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp };
          }
          return { prevX: existing.x, prevZ: existing.z, prevYaw: existing.yaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp };
        })();

        return {
          id: p.id,
          x: interp.prevX, z: interp.prevZ, yaw: interp.prevYaw,
          gender: p.gender || 'male',
          type: p.type,
          health,
          mesh,
          ...interp
        };
      });

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
            : pc.type === 'taxi'
              ? this.renderer.getTaxiMesh()
              : pc.type === 'police' || (pc.type === 'parked' && pc.colorR === 0.1 && pc.colorG === 0.1 && pc.colorB === 0.2)
                ? this.renderer.getPoliceCarMesh()
                : this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id),
        };
      }), ...localOnlyParked];

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
        } else if (db.type === 'taxi') {
          mesh = this.renderer.getTaxiMesh();
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
          existing.yaw = p.carYaw; existing.carSpeed = p.carSpeed; existing.health = p.health; existing.weapon = p.weapon; existing.money = p.money;
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
            yaw: p.carYaw, carSpeed: p.carSpeed, health: p.health, weapon: p.weapon, money: p.money,
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

    if (res && res.wantedLevel !== undefined) {
      this.wantedLevel = res.wantedLevel;
    }

    if (res && res.yourMoney !== undefined) {
      this.money = res.yourMoney;
    }

    const existingDeadIds = new Set(this.deadBodies.map(d => d.id));
    if (res && res.deadBodies) {
      for (const db of res.deadBodies) {
        if (existingDeadIds.has(db.id)) continue;
        let mesh: CityMesh | CityMesh[];
        const otherPlayer = this.otherPlayers.find(op => op.userId === db.userId);
        if (otherPlayer) {
          mesh = otherPlayer.mesh;
        } else {
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
      this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, dirX, dirY, dirZ, weapon: this.currentWeapon, age: 0, lifetime: 0.08 });

      if (this.currentWeapon === 2) { // Shotgun
        for (let i = 1; i < 8; i++) {
          const spread = 0.08;
          this.tracers.push({ originX, originY, originZ, dirX: dirX + (Math.random() - 0.5) * spread, dirY: dirY + (Math.random() - 0.5) * spread, dirZ: dirZ + (Math.random() - 0.5) * spread, age: 0, lifetime: 0.2 });
        }
      }
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

    checkTargets(this.serverPedestrians, false);
    checkTargets(this.serverNPCs, false);
    checkTargets(this.parkedCars, false);
  }

  private spawnBlood(x: number, y: number, z: number, dirX: number = 0, dirY: number = 0, dirZ: number = 0) {
    const dirLen = Math.hypot(dirX, dirY, dirZ);
    const nx = dirLen > 0.0001 ? dirX / dirLen : 0;
    const ny = dirLen > 0.0001 ? dirY / dirLen : 0;
    const nz = dirLen > 0.0001 ? dirZ / dirLen : 0;
    const PARTICLE_COUNT = 14;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.5 + Math.random() * 3.5;
      let vx = r * Math.sin(phi) * Math.cos(theta);
      let vy = r * Math.cos(phi);
      let vz = r * Math.sin(phi) * Math.sin(theta);

      if (dirLen > 0.0001) {
        const bias = 0.6;
        vx = vx * (1 - bias) + (-nx * r) * bias;
        vy = vy * (1 - bias) + (-ny * r) * bias + 1.5;
        vz = vz * (1 - bias) + (-nz * r) * bias;
      } else {
        vy += 1.5;
      }
      this.bloodSplats.push({
        x, y, z,
        vx, vy, vz,
        size: 0.08 + Math.random() * 0.12,
        age: 0,
        lifetime: 0.6 + Math.random() * 0.5,
      });
    }

    if (y < 1.6) {
      this.bloodPools.push({ x, z, age: 0, lifetime: 30, maxRadius: 1.5, variant: Math.floor(Math.random() * 4) });
    }
  }

  private spawnExplosion(x: number, y: number, z: number) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 1.0 });

    const BLAST_RADIUS = 10.0;
    const BLAST_MAX_DMG = 150;
    const BLAST_MIN_DMG = 30;
    const dmgAt = (dist: number) => {
      if (dist >= BLAST_RADIUS) return 0;
      const t = dist / BLAST_RADIUS;
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
          this.gtService.hit(this.getUserId(), t.userId, 1, dmg);
          this.spawnBlood(tx, 1.2, tz, dx, 0, dz);
        } else if (isCar) {
          t.health = (t.health ?? 100) - dmg;
          this.gtService.hit(this.getUserId(), t.id, 1, dmg);
        } else {
          t.health = (t.health ?? 100) - dmg;
          this.spawnBlood(tx, 1.0, tz, dx, 0, dz);
          this.gtService.hit(this.getUserId(), t.id, 1, dmg);
        }
      }
    };

    checkExplosionHits(this.otherPlayers, true);
    checkExplosionHits(this.serverPedestrians, false);
    checkExplosionHits(this.serverNPCs, false, true);
    checkExplosionHits(this.parkedCars, false, true);
    checkExplosionHits(this.trafficCars, false, true);
    checkExplosionHits(this.localPedestrians, false);

    const selfDx = this.carX - x, selfDz = this.carZ - z;
    const selfDist = Math.sqrt(selfDx * selfDx + selfDz * selfDz);
    const selfDmg = dmgAt(selfDist);
    if (selfDmg > 0) {
      if (this.isInCar) {
        this.carHealth = Math.max(0, this.carHealth - selfDmg);
        const passThrough = Math.round(selfDmg * 0.4);
        if (passThrough > 0) {
          this.health = Math.max(0, this.health - passThrough);
          this.gtService.hit(this.getUserId(), this.getUserId(), 1, passThrough);
          this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, selfDx, 0, selfDz);
        }
      } else {
        this.health = Math.max(0, this.health - selfDmg);
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

    // Update traffic light timers
    const lightPhase = Math.floor(performance.now() / 6000) % 2;
    const intersectionRadius = 14;
    const isRedForX = lightPhase === 0;


    if (Math.floor(this.carX / 80) !== this._lastTrafficChunkX || Math.floor(this.carZ / 80) !== this._lastTrafficChunkZ) {
      this._lastTrafficChunkX = Math.floor(this.carX / 80);
      this._lastTrafficChunkZ = Math.floor(this.carZ / 80);
      this.trafficNodes = this.renderer.getRoadNodesInRadius(this._lastTrafficChunkX, this._lastTrafficChunkZ, 25);
      this.trafficEdges = this.renderer.getRoadEdges(this.trafficNodes);
      this.rebuildLanes();
    }

    for (let ci = this.trafficCars.length - 1; ci >= 0; ci--) {
      const car = this.trafficCars[ci];
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

      const lane = this.trafficLanes.find(l => l.fromIdx === currIdx && l.toIdx === nextIdx);
      const laneOffX = lane ? lane.offsetX : 0;
      const laneOffZ = lane ? lane.offsetZ : 0;

      const currLaneX = currNode.x + laneOffX;
      const currLaneZ = currNode.z + laneOffZ;
      const distToCurr = Math.hypot(currLaneX - car.x, currLaneZ - car.z);

      const targetX = nextNode ? nextNode.x + laneOffX : currNode.x;
      const targetZ = nextNode ? nextNode.z + laneOffZ : currNode.z;
      const distToTarget = Math.hypot(targetX - car.x, targetZ - car.z);

      let approachingTurn = false;
      if (nextNode && distToTarget < 14 && car.pathIdx + 2 < car.path.length) {
        const afterIdx = car.path[car.pathIdx + 2];
        const afterNode = this.trafficNodes[afterIdx];
        if (afterNode) {
          const currToNextYaw = Math.atan2(nextNode.x - currNode.x, nextNode.z - currNode.z);
          const nextToAfterYaw = Math.atan2(afterNode.x - nextNode.x, afterNode.z - nextNode.z);
          let turnDiff = nextToAfterYaw - currToNextYaw;
          while (turnDiff > Math.PI) turnDiff -= Math.PI * 2;
          while (turnDiff < -Math.PI) turnDiff += Math.PI * 2;
          if (Math.abs(turnDiff) > 0.3) approachingTurn = true;
        }
      }

      if (nextNode && distToTarget < 10) {
        const ourDirX = nextNode.x - currNode.x;
        const ourDirZ = nextNode.z - currNode.z;
        const ourLen = Math.hypot(ourDirX, ourDirZ);
        if (ourLen > 0) {
          const ourDx = ourDirX / ourLen;
          const ourDz = ourDirZ / ourLen;
          for (const other of this.trafficCars) {
            if (other.id === car.id || other.health <= 0) continue;
            const otherDist = Math.hypot(other.x - nextNode.x, other.z - nextNode.z);
            if (otherDist < 12 && other.path && other.pathIdx + 1 < other.path.length) {
              const oCurr = this.trafficNodes[other.path[other.pathIdx]];
              const oNext = this.trafficNodes[other.path[other.pathIdx + 1]];
              const odx = oNext.x - oCurr.x;
              const odz = oNext.z - oCurr.z;
              const olen = Math.hypot(odx, odz);
              if (olen > 0) {
                const otherDx = odx / olen;
                const otherDz = odz / olen;
                const dot = Math.abs(ourDx * otherDx + ourDz * otherDz);
                if (dot < 0.3) { // perpendicular = cross traffic
                  car.state = 'stop';
                  car.stopTimer = 0.5;
                  car.nextYaw = car.yaw;
                  break;
                }
              }
            }
          }
          if (car.state === 'stop') continue;
        }
      }

      // --- Collision detection: look ahead for obstacles ---
      // Check other traffic cars, server NPCs, parked cars, lamp posts,
      // and pedestrians. If something is directly ahead within 3m, stop.
      // If within 6m, slow down.
      const carFwdX = Math.sin(car.yaw);
      const carFwdZ = Math.cos(car.yaw);
      let blocked = false;
      let slowDown = false;

      const checkObstacle = (ox: number, oz: number, closeR: number, farR: number) => {
        const dx = ox - car.x;
        const dz = oz - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist > farR) return;
        // Is it in front of the car? (dot product with forward direction)
        const dot = dx * carFwdX + dz * carFwdZ;
        if (dot < 0) return; // behind us, ignore
        if (dist < closeR) blocked = true;
        else slowDown = true;
      };

      // Other traffic cars
      for (const other of this.trafficCars) {
        if (other.id === car.id || other.health <= 0) continue;
        checkObstacle(other.x, other.z, 3.5, 7);
      }
      // Server NPCs (cars/buses)
      for (const npc of this.serverNPCs) {
        if (npc.health <= 0) continue;
        checkObstacle(npc.x, npc.z, 3.5, 7);
      }
      // Parked cars
      for (const pc of this.parkedCars) {
        if (pc.health <= 0) continue;
        checkObstacle(pc.x, pc.z, 3.5, 7);
      }
      // Lamp posts (thin — use smaller radius)
      const nearbyLamps = this.renderer.getLampsNear(car.x, car.z, 8);
      for (const lamp of nearbyLamps) {
        checkObstacle(lamp.x, lamp.z, 2, 5);
      }
      // Pedestrians — cars should slow down -> stop for peds in the road.
      // Use bigger radii than for cars so braking starts earlier: slow
      // from 6m, full stop at 3m. This gives the car visible deceleration
      // before stopping, rather than a sudden halt.
      // Local pedestrians (client-side spawned)
      for (const ped of this.localPedestrians) {
        if (ped.health <= 0) continue;
        checkObstacle(ped.x, ped.z, 3, 6);
      }
      // Server pedestrians (synced from server)
      for (const ped of this.serverPedestrians) {
        if (ped.health <= 0) continue;
        checkObstacle(ped.x, ped.z, 3, 6);
      }
      // Other players (human players connected to the server) — same
      // treatment as peds. Cars must not drive through human players.
      for (const op of this.otherPlayers) {
        if (op.health <= 0) continue;
        checkObstacle(op.posX, op.posZ, 3, 6);
      }

      if (blocked) {
        car.state = 'stop';
        car.stopTimer = 0.3;
        car.nextYaw = car.yaw;
        continue;
      }

      // --- Traffic light check ---
      // Stop if approaching an intersection where the light is red for
      // our direction. Horizontal roads (driving along X) stop when
      // light is red for X; vertical roads (driving along Z) stop when
      // red for Z. The phase alternates every 6s.
      if (nextNode && distToTarget < intersectionRadius) {
        const isHDir = Math.abs(nextNode.x - currNode.x) > Math.abs(nextNode.z - currNode.z);
        if ((isHDir && isRedForX) || (!isHDir && !isRedForX)) {
          car.state = 'stop';
          car.stopTimer = 0.5;
          car.nextYaw = car.yaw;
          continue;
        }
      }

      // --- Building collision for traffic cars ---
      // Push car back onto the road if it's overlapping a building.
      this.pushTrafficCarOutOfBuildings(car);

      // --- Advance to next node when we reach the intersection ---
      if (distToTarget < 2) {
        car.pathIdx++;
        if (car.pathIdx < car.path.length) {
          // SHARP TURN: snap yaw to the new segment direction.
          // This produces a crisp 90° turn at the intersection rather
          // than a gradual curve.
          const newTarget = this.trafficNodes[car.path[car.pathIdx]];
          car.yaw = Math.atan2(newTarget.x - currNode.x, newTarget.z - currNode.z);
        }
        continue;
      }

      let speedMult = 1.0;
      if (approachingTurn) speedMult *= 0.35;
      if (slowDown) speedMult *= 0.4;
      const tdx = targetX - car.x;
      const tdz = targetZ - car.z;
      const targetYaw = Math.atan2(tdx, tdz);
      let yawDiff2 = targetYaw - car.yaw;
      while (yawDiff2 > Math.PI) yawDiff2 -= Math.PI * 2;
      while (yawDiff2 < -Math.PI) yawDiff2 += Math.PI * 2;

      car.yaw += yawDiff2 * Math.min(1, 8 * dt);
      const speed = Math.min(distToTarget / dt, 12) * speedMult;
      car.x += Math.sin(car.yaw) * speed * dt;
      car.z += Math.cos(car.yaw) * speed * dt;
    }
    // Push server NPCs out of buildings too (they don't use the lane system)
    for (const npc of this.serverNPCs) this.pushTrafficCarOutOfBuildings(npc);
  }

  private pushTrafficCarOutOfBuildings(car: { x: number; z: number }) {
    const cx = Math.floor(car.x / CHUNK_SIZE);
    const cz = Math.floor(car.z / CHUNK_SIZE);
    const GRID_PITCH = 80, BLOCK_SIZE = 30, blocksPerChunk = CHUNK_SIZE / GRID_PITCH;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunkCX = cx + dx;
        const chunkCZ = cz + dz;
        const seed = (chunkCX * 100003 + chunkCZ * 70001) >>> 0;
        const m32 = (s: number) => { let seed2 = s | 0; return () => { seed2 = seed2 + 0x6D2B79F5 | 0; let t = Math.imul(seed2 ^ seed2 >>> 15, 1 | seed2); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
        const rng = m32(seed);
        // Skip the hospital chunk
        if (chunkCX === 0 && chunkCZ === 0) continue;

        for (let by = 0; by < blocksPerChunk; by++) {
          for (let bx = 0; bx < blocksPerChunk; bx++) {
            const gx = chunkCX * blocksPerChunk + bx;
            const gz = chunkCZ * blocksPerChunk + by;
            const blockCX = gx * GRID_PITCH + GRID_PITCH / 2;
            const blockCZ = gz * GRID_PITCH + GRID_PITCH / 2;

            if (rng() >= 0.75) continue;
            const maxDim = BLOCK_SIZE + 6;
            const hw = (14 + rng() * (maxDim - 14)) / 2 + 1;
            const hd = (14 + rng() * (maxDim - 14)) / 2 + 1;
            const cdx = car.x - blockCX, cdz = car.z - blockCZ;
            if (Math.abs(cdx) < hw && Math.abs(cdz) < hd) {
              const overlapX = hw - Math.abs(cdx);
              const overlapZ = hd - Math.abs(cdz);
              if (overlapX < overlapZ) car.x += cdx > 0 ? overlapX : -overlapX;
              else car.z += cdz > 0 ? overlapZ : -overlapZ;
            }
          }
        }
      }
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
    this.updateVendingMachines();
    this.checkNearCar();
    this.checkNearVendingMachine();
    this.updateVehicleCollisions();
    this.findLookTarget();
    this.updateTraffic(dt);
    this.updatePedestrians(dt);
    this.updateNPCInterpolation();
    this.updateTaxiMission(dt);

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

    if (this.health <= 0) {
      if (!this._wasDead) {
        this._wasDead = true;
        this.dropMoneyAt(this.carX, this.carZ, this.money);
        this.money = 0;
      }
      if (this._wasDead && !this._respawnTimer) {
        this._respawnTimer = setTimeout(() => {
          this.health = 100;
          this.carHealth = 100;
          if (this.isInCar) this.exitCar();
          this.carX = HOSPITAL_SPAWN_X;
          this.carZ = HOSPITAL_SPAWN_Z;
          this.carY = CAR_HEIGHT;
          this.carYaw = HOSPITAL_SPAWN_YAW;
          this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
          this.camYaw = HOSPITAL_SPAWN_YAW;
          this.camPitch = 0.2;
          this._wasDead = false;
          this._respawnTimer = null;
        }, 1500);
      }
    } else {
      this._wasDead = false;
    }

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
      this.vendingMachines,
      renderMesh,
      this.taxiMarkers,
      this.taxiAttachedMeshes,
      this.trafficNodes
    );

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
      const fX = Math.sin(this.camYaw), fZ = Math.cos(this.camYaw);
      const rX = Math.cos(this.camYaw), rZ = -Math.sin(this.camYaw);
      const worldX = moveX * rX + moveZ * fX;
      const worldZ = moveX * rZ + moveZ * fZ;
      const normLen = Math.sqrt(worldX * worldX + worldZ * worldZ) || 1;

      const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const targetSpeed = isSprinting ? 9 : 4;
      const targetVx = (worldX / normLen) * targetSpeed;
      const targetVz = (worldZ / normLen) * targetSpeed;

      this.carVx += (targetVx - this.carVx) * Math.min(1, 15 * dt);
      this.carVz += (targetVz - this.carVz) * Math.min(1, 15 * dt);

      const targetYaw = Math.atan2(worldX, worldZ);
      let yawDiff = targetYaw - this.walkYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.walkYaw += yawDiff * Math.min(1, 20 * dt);
      this.carYaw = this.walkYaw;
    } else {
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

  // Regenerate vending machine positions when the player moves to a new
  // 80m chunk. Vending machines are placed at grid intersections where
  // (gx % 10 === 0 && gz % 10 === 0), giving one per 800m × 800m area.
  private updateVendingMachines() {
    const chunkX = Math.floor(this.carX / 80);
    const chunkZ = Math.floor(this.carZ / 80);
    if (chunkX === this._lastVendingChunkX && chunkZ === this._lastVendingChunkZ) return;
    this._lastVendingChunkX = chunkX;
    this._lastVendingChunkZ = chunkZ;

    this.vendingMachines = [];
    const range = 3;  // generate in a 7x7 chunk area around the player
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const gx = chunkX + dx;
        const gz = chunkZ + dz;
        // Only place a vending machine at every 10th grid intersection
        if (((gx % VENDING_MACHINE_INTERVAL) + VENDING_MACHINE_INTERVAL) % VENDING_MACHINE_INTERVAL !== 0) continue;
        if (((gz % VENDING_MACHINE_INTERVAL) + VENDING_MACHINE_INTERVAL) % VENDING_MACHINE_INTERVAL !== 0) continue;
        // Place at the block corner (sidewalk edge), facing the road
        const baseX = gx * 80;
        const baseZ = gz * 80;
        // Offset to the sidewalk corner
        this.vendingMachines.push({
          x: baseX + VENDING_MACHINE_OFFSET,
          z: baseZ + VENDING_MACHINE_OFFSET,
          yaw: -Math.PI / 4,  // face toward the intersection
        });
      }
    }
  }

  private checkNearVendingMachine() {
    if (this.isInCar) { this.nearVendingMachine = false; return; }
    this.nearVendingMachine = this.vendingMachines.some(vm =>
      Math.sqrt((vm.x - this.carX) ** 2 + (vm.z - this.carZ) ** 2) < VENDING_MACHINE_HEAL_DIST
    );
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
    if (this.isInCar && !this.firstPerson && this.carSpeed < 0) {
      const timeSinceMouse = performance.now() - this.lastMouseMoveTime;
      if (timeSinceMouse > 1500) {
        const targetYaw = this.carYaw + Math.PI;
        let yawDiff = targetYaw - this.camYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.camYaw += yawDiff * 0.05;
      }
    }
  }

  private updateProjectiles(dt: number) {
    this.tracers = this.tracers.filter(t => (t.age += dt) < t.lifetime);
    this.muzzleFlashes = this.muzzleFlashes.filter(m => (m.age += dt) < m.lifetime);
    const GRAVITY = 9.8;
    for (const b of this.bloodSplats) {
      b.age += dt;
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
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


  /** --- NPC path smoothing ---
  
  pollNPCs() runs every 1s. Between polls, we lerp each NPC's
  rendered position from its `prev` (where it was at the last poll)
  to its `target` (where the server says it is now). After 1s
  elapses, we keep dead-reckoning along targetYaw at the NPC's
  server-reported speed until the next poll arrives — so a fast-
  moving police car stays roughly where it should be even with
  1s of network latency, instead of freezing in place.
  
  Yaw is interpolated through the shorter arc (angle-wrap aware)
  so a car turning from yaw=350° to yaw=10° rotates forward 20°
  instead of backward 340°.  */
  private updateNPCInterpolation() {
    const now = performance.now();
    // Must match the npcPollTimer interval in startNPCPolling().
    const POLL_INTERVAL = 1000;
    // Allow dead-reckoning to overshoot by up to 1 extra poll interval
    // before clamping — gives slow polls some slack without letting
    // NPCs fly off into infinity if the server stops responding.
    const MAX_T = 2.0;

    const interp = (npc: any) => {
      if (npc.lastUpdate === undefined) return;
      const elapsed = now - npc.lastUpdate;
      const t = Math.min(MAX_T, elapsed / POLL_INTERVAL);
      if (t <= 1) {
        // Linear interpolation between prev and target.
        npc.x = npc.prevX + (npc.targetX - npc.prevX) * t;
        npc.z = npc.prevZ + (npc.targetZ - npc.prevZ) * t;
        // Yaw: interpolate through the shorter arc.
        let yawDiff = npc.targetYaw - npc.prevYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        npc.yaw = npc.prevYaw + yawDiff * t;
      } else {
        // Dead-reckon beyond target using the server-reported speed.
        // Without this, a fast-moving car would freeze at its last
        // known position for up to 1s every poll, looking choppy.
        const overshootSec = (elapsed - POLL_INTERVAL) / 1000;
        const dist = (npc.speed || 0) * overshootSec;
        npc.x = npc.targetX + Math.sin(npc.targetYaw) * dist;
        npc.z = npc.targetZ + Math.cos(npc.targetYaw) * dist;
        npc.yaw = npc.targetYaw;
      }
    };

    for (const npc of this.serverNPCs) interp(npc);
    for (const ped of this.serverPedestrians) interp(ped);
  }

  /** --- Taxi mission implementation --- 
  State machine:
    idle    -> (every 4s, pick nearest ped within 60m) -> pickup
    pickup  -> (taxi within 5m and stopped)             -> deliver
    deliver -> (taxi within 6m of dest and stopped)     -> payout -> idle
    ANY     -> (player exits taxi / ped despawns)        -> idle
  
  Markers built each frame go into `this.taxiMarkers` which is
  consumed by render() (3D arrow + ground ring + beam) and drawMap()
  (minimap blip at the destination). 

  Live countdown for the HUD: ceil(4 - elapsed), clamped to 0.
  Computed every frame regardless of whether we're still in
  cooldown so the HUD always shows a sensible number.
  
  Keep the markers empty during the cooldown so the previous
  arrow disappears immediately after a payout.

  Find the nearest pedestrian (server + local) within 60m of
  the taxi. Server peds get priority because their positions
  are shared across multiplayer clients.
  
  We use a `findBest()` helper that RETURNS the candidate rather
  than mutating a `let best` variable. TypeScript's control-flow
  analysis narrows a `let x: T | null = null` to `null` after the
  initializer, and (with strict mode) doesn't always widen it
  back at use sites when the assignment happens inside a closure
  — leaving `best` typed as `never` inside `if (best) { ... }`.
  Returning the value from a function forces TS to treat the
  return type as the declared `T | null`, sidestepping the bug.
  */
  private updateTaxiMission(dt: number) {
    // Refresh the convenience flag for the template.
    this.taxiMode = this.isInCar && this.vehicleType === 'taxi';

    // If the player is no longer driving a taxi, drop everything.
    if (!this.taxiMode) {
      this.taxiMission = null;
      this.taxiMarkers = [];
      this.taxiAttachedMeshes = [];
      this.taxiSearchTimer = 0;
      return;
    }

    if (this.taxiMission === null) {
      // Hunt for a hailing pedestrian.
      this.taxiSearchTimer += dt;
      this.taxiSearchCountdown = Math.max(0, Math.ceil(4 - this.taxiSearchTimer));
      if (this.taxiSearchTimer < 4) {
        this.taxiMarkers = [];
        return;
      }
      const PICKUP_SCAN_RADIUS = 60;
      type TaxiCandidate = { id: number; x: number; z: number; mesh: CityMesh | CityMesh[]; gender: string; phase: number };
      const findBest = (): TaxiCandidate | null => {
        let result: TaxiCandidate | null = null;
        let resultDistSq = PICKUP_SCAN_RADIUS * PICKUP_SCAN_RADIUS;
        const consider = (id: number, x: number, z: number, mesh: CityMesh | CityMesh[], gender: string) => {
          // Don't pick up a ped we're already mid-mission with, and skip
          // cops (they're chasing the player, not commuting).
          if (this.stolenNpcIds.has(id)) return;
          const dx = x - this.carX, dz = z - this.carZ;
          const dSq = dx * dx + dz * dz;
          if (dSq < resultDistSq) {
            resultDistSq = dSq;
            result = { id, x, z, mesh, gender: gender || 'male', phase: Math.random() * Math.PI * 2 };
          }
        };
        for (const p of this.serverPedestrians) {
          if (p.type === 'cop') continue;
          consider(p.id, p.x, p.z, p.mesh, p.gender);
        }
        for (const p of this.localPedestrians) {
          if (p.type === 'cop') continue;
          consider(p.id, p.x, p.z, p.mesh, p.gender);
        }
        return result;
      };
      const best = findBest();

      if (best) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 200 + Math.random() * 200;
        let destX = this.carX + Math.sin(angle) * dist;
        let destZ = this.carZ + Math.cos(angle) * dist;

        const snapX = Math.round((destX - 40) / 80) * 80 + 40;
        const snapZ = Math.round((destZ - 40) / 80) * 80 + 40;
        const off = 18;

        destX = snapX + (destX >= snapX ? off : -off);
        destZ = snapZ + (destZ >= snapZ ? off : -off);

        const dx2 = destX - best.x, dz2 = destZ - best.z;
        const tripDist = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        const DENSITY_SCAN_RADIUS = 100;
        const DENSITY_SCAN_RADIUS_SQ = DENSITY_SCAN_RADIUS * DENSITY_SCAN_RADIUS;
        let nearbyTraffic = 0;
        for (const v of [...this.serverNPCs, ...this.trafficCars, ...this.parkedCars]) {
          if (v.type === 'police' || v.type === 'cop') continue;
          if (v.health <= 0) continue;
          const dvx = v.x - this.carX, dvz = v.z - this.carZ;
          if (dvx * dvx + dvz * dvz < DENSITY_SCAN_RADIUS_SQ) nearbyTraffic++;
        }
        const densityMultiplier = 1 + Math.min(1, nearbyTraffic * 0.05);
        const fare = Math.max(100, Math.round((50 + tripDist * 5) * densityMultiplier / 10) * 10);

        this.taxiMission = {
          state: 'pickup',
          passengerId: best.id,
          passengerGender: best.gender,
          passengerMesh: best.mesh,
          passengerX: best.x,
          passengerZ: best.z,
          destinationX: destX,
          destinationZ: destZ,
          fare,
          phase: best.phase,
          timer: 0,
        };
      }
      this.taxiSearchTimer = 0;
    }

    if (this.taxiMission) {
      const m = this.taxiMission;
      if (m.state === 'pickup') {
        const ped = this.serverPedestrians.find(p => p.id === m.passengerId)
          ?? this.localPedestrians.find(p => p.id === m.passengerId);
        if (!ped) {
          this.taxiMission = null;
          this.taxiMarkers = [];
          this.taxiAttachedMeshes = [];
          return;
        }
        m.passengerX = ped.x;
        m.passengerZ = ped.z;
        m.passengerMesh = ped.mesh;

        this.taxiMarkers = [{ type: 'hail', x: ped.x, z: ped.z, phase: m.phase }];

        const dx = ped.x - this.carX, dz = ped.z - this.carZ;
        const pickupDist = Math.sqrt(dx * dx + dz * dz);
        if (pickupDist < 5 && Math.abs(this.carSpeed) < 5) {
          this.stolenNpcIds.add(m.passengerId);
          this.localPedestrians = this.localPedestrians.filter(p => p.id !== m.passengerId);
          this.serverPedestrians = this.serverPedestrians.filter(p => p.id !== m.passengerId);
          m.state = 'deliver';
          m.timer = 90;
          this.taxiAttachedMeshes = [{
            mesh: m.passengerMesh,
            offsetX: 0.3,
            offsetY: 0.3,
            offsetZ: -1.0,
            yaw: 0,
            scale: 0.7,
          }];
        }
      } else if (m.state === 'deliver') {
        this.taxiMarkers = [
          { type: 'destination', x: m.destinationX, z: m.destinationZ },
          { type: 'beam', x: m.destinationX, z: m.destinationZ },
        ];

        // Timer countdown — fare gets out if it expires.
        m.timer = Math.max(0, m.timer - dt);
        if (m.timer <= 0) {
          // Fare leaves the cab — no payout, streak broken.
          const walkAngle = Math.random() * Math.PI * 2;
          const walkDist = 15;
          const pedId = --this.pedIdCounter;
          this.localPedestrians.push({
            id: pedId,
            x: this.carX + Math.sin(walkAngle + Math.PI) * 3,
            z: this.carZ + Math.cos(walkAngle + Math.PI) * 3,
            yaw: walkAngle,
            gender: m.passengerGender,
            mesh: m.passengerMesh,
            health: 100,
            targetX: this.carX + Math.sin(walkAngle) * walkDist,
            targetZ: this.carZ + Math.cos(walkAngle) * walkDist,
            waitTimer: 0,
          });
          this.stolenNpcIds.delete(m.passengerId);
          this.taxiMission = null;
          this.taxiMarkers = [];
          this.taxiAttachedMeshes = [];
          return;
        }

        // Drop-off check: taxi within 6m of destination and stopped.
        const dx = m.destinationX - this.carX, dz = m.destinationZ - this.carZ;
        const dropDist = Math.sqrt(dx * dx + dz * dz);
        if (dropDist < 6 && Math.abs(this.carSpeed) < 3) {
          // Payout!
          this.money += m.fare;
          // Spawn a money stack at the destination so it FEELS like
          // getting paid — the existing money-pickup logic will
          // collect it on the next frame.
          this.moneyStacks.push({
            x: m.destinationX, z: m.destinationZ,
            amount: m.fare,
            yaw: Math.random() * Math.PI * 2,
            age: 0, lifetime: 30,
          });
          // Drop the passenger at the destination — they walk away
          // from the cab for ~25m then despawn when out of range (the
          // existing localPedestrians distance cull handles that).
          const walkAngle = Math.random() * Math.PI * 2;
          const walkDist = 25;
          const pedId = --this.pedIdCounter;
          this.localPedestrians.push({
            id: pedId,
            x: m.destinationX, z: m.destinationZ,
            yaw: walkAngle,
            gender: m.passengerGender,
            mesh: m.passengerMesh,
            health: 100,
            targetX: m.destinationX + Math.sin(walkAngle) * walkDist,
            targetZ: m.destinationZ + Math.cos(walkAngle) * walkDist,
            waitTimer: 0,
          });
          // Reset for the next fare. The search timer makes the
          // player wait ~4s before the next ped spawns a hail marker,
          // which gives the dropped passenger time to walk away
          // without immediately being re-flagged as a target.
          this.taxiMission = null;
          this.taxiMarkers = [];
          this.taxiAttachedMeshes = [];
          this.taxiSearchTimer = 0;
        }
      }
    } else {
      this.taxiMarkers = [];
    }
  }


  get leaderboardData(): { user: User; money: number; health: number; carSpeed: number }[] {
    const all = [...this.otherPlayers];
    const selfUser = (this.parentRef as any)?.user;
    if (selfUser) {
      all.push({
        userId: selfUser.id ?? 0,
        posX: 0, posY: 0, posZ: 0,
        yaw: 0, carSpeed: this.carSpeed, health: this.health, weapon: this.currentWeapon,
        money: this.money,
        username: selfUser.username ?? 'You',
        mesh: [] as any, isShooting: false, camYaw: 0, camPitch: 0, remoteShootTimer: 0
      });
    }
    return all
      .sort((a, b) => b.money - a.money)
      .map(p => ({
        user: new User(p.userId, p.username),
        money: p.money,
        health: p.health,
        carSpeed: p.carSpeed
      }));
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

    // Taxi mission: draw the destination as a pulsing yellow ring + a
    // line from the player to the destination so it's easy to follow.
    if (this.taxiMission && this.taxiMission.state === 'deliver') {
      const m = this.taxiMission;
      const mx = cx + (m.destinationX - this.carX) * scale;
      const my = cy + (m.destinationZ - this.carZ) * scale;
      // Dashed line from player to destination
      ctx.strokeStyle = 'rgba(255, 220, 0, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
      ctx.setLineDash([]);
      // Pulsing ring
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      ctx.strokeStyle = '#ffdc00';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffdc00';
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Taxi mission: show the hailing pedestrian as a yellow exclamation
    // point on the minimap during the pickup phase.
    if (this.taxiMission && this.taxiMission.state === 'pickup') {
      const m = this.taxiMission;
      const mx = cx + (m.passengerX - this.carX) * scale;
      const my = cy + (m.passengerZ - this.carZ) * scale;
      ctx.fillStyle = '#ffdc00';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', mx, my);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
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


  async closeLoginPanel() {
    await this.ngOnInit();
  } 
}