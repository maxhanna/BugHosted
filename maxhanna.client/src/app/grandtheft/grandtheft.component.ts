import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, CityMesh } from './grandtheft-renderer';
import { GrandtheftService } from '../../services/grandtheft.service';
import { UserEventService } from '../../services/user-event.service';
import { User } from '../../services/datacontracts/user/user';

const CHUNK_SIZE = 80;
const CAR_HEIGHT = 0.4;

const WEAPON_NAMES = ['Unarmed', 'Pistol', 'Rifle', 'Shotgun', 'Rocket Launcher'];
const WEAPON_COOLDOWNS = [400, 300, 150, 800, 1500];

const HOSPITAL_X = 40;
const HOSPITAL_Z = 40;
const HOSPITAL_SPAWN_X = HOSPITAL_X;
const HOSPITAL_SPAWN_Z = HOSPITAL_Z + 22;
const HOSPITAL_SPAWN_YAW = Math.PI;
// FIX: Home base (japaneseShop). Occupies the building slot at chunk (1,0)
// — one block east of the hospital. The procedural building for this chunk
// is suppressed in the renderer. Players who were inactive >30 min respawn here.
const HOME_BASE_X = 120;
const HOME_BASE_Z = 40;
const HOME_BASE_YAW = 0;
// FIX: Garage constants. The garage entrance is on the south side of the
// home base building (facing +Z). The garage interior is at the building
// center. The detection zone is a radius around the entrance — when the
// player enters it, the door opens and the stored car (if any) appears.
const GARAGE_ENTRANCE_X = 120;
const GARAGE_ENTRANCE_Z = 52;
const GARAGE_INTERIOR_X = 120;
const GARAGE_INTERIOR_Z = 42;
const GARAGE_DETECT_RADIUS = 18;
const GARAGE_DOOR_OPEN_SPEED = 3; // units per second

const VENDING_MACHINE_INTERVAL = 10;
const VENDING_MACHINE_HEAL_DIST = 4;
const VENDING_MACHINE_OFFSET = 12;
const WEAPON_DAMAGES = [10, 15, 25, 8, 100];
const PLAYER_POLL_FAST_MS = 200;
const PLAYER_POLL_SLOW_MS = 1000;
const ENTER_CAR_DIST = 4;
// NEW: Hooker "services" constants. When the player is in a car with a
// hooker passenger in a secluded area (no NPCs within this radius), the
// car rocks, health regenerates, and money drains.
const HOOKER_SECLUDED_RADIUS = 50;
const HOOKER_HEAL_PER_SEC = 5;     // health regained per second
const HOOKER_MONEY_PER_SEC = 10;   // money drained per second
const HOOKER_MAX_MONEY = 80;       // cap on total money drained per session

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
  isBurning?: boolean;
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
  // NEW (Feature 3): true while the remote player is driving a car.
  // Set from the server's IsInCar field (now explicitly sent by the client).
  isInCar: boolean;
  // FIX: Vehicle type + car color so the renderer can draw the correct
  // car model (taxi, bus, motorcycle, etc.) instead of always carMeshes[0].
  vehicleType?: string;
  carColorR?: number;
  carColorG?: number;
  carColorB?: number;
  // FIX: If this player is a passenger in another player's car, this is
  // the host player's userId. 0 = not a passenger. The renderer uses this
  // to draw the passenger inside the host's car instead of on foot.
  passengerOfUserId?: number;
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

  carHealth = 400;
  isInCar = false;
  vehicleType: 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' | 'taxi' = 'car';
  // NEW: Passenger state. When isPassenger is true, the player is riding
  // in another player's car. They can't control the car but move with it.
  // passengerOfUserId tracks whose car we're in so we can follow their
  // position updates. The passenger exits with the same E key.
  isPassenger = false;
  passengerOfUserId = 0;
  // FIX: Passenger path smoothing. Stores the host's last-known position,
  // the time it was received, and the computed velocity. Between polls
  // (every 200ms), we dead-reckon the host's position and lerp the
  // passenger toward it for smooth movement.
  private passengerHostLastX = 0;
  private passengerHostLastZ = 0;
  private passengerHostLastYaw = 0;
  private passengerHostLastTime = 0;
  private passengerHostVelX = 0;
  private passengerHostVelZ = 0;
  private passengerHostVelYaw = 0;
  private _reloading = false;
  private _pistolDrawTimer = 0;

  camYaw = 0; camPitch = 0.2;
  camDist = 4; camHeight = 2;
  firstPerson = false;
  private isPointerLocked = false;
  serverNPCs: { id: number; x: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; remoteShootTimer?: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number; gender?: string; hasDriver?: boolean; passengerCount?: number; isShootingAt?: boolean; isBurning?: boolean }[] = [];
  serverPedestrians: { id: number; x: number; z: number; yaw: number; gender: string; type?: string; mesh: CityMesh | CityMesh[]; health: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number }[] = [];
  private npcPollTimer: any = null;
  parkedCars: ParkedCar[] = [];
  trafficCars: { id: number; x: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; path: number[]; pathIdx: number; state: 'drive' | 'stop'; stopTimer: number; nextYaw: number; laneOffsetX: number; laneOffsetZ: number; hasDriver?: boolean; gender?: string; passengerCount?: number }[] = [];
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
  _carOnFire = false;
  _carFireStarted = 0;
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
  private driverInCarMesh: { mesh: CityMesh | CityMesh[]; offsetX: number; offsetY: number; offsetZ: number; yaw: number; scale?: number } | null = null;

  // NEW: Passenger riding in the player's vehicle. Generalises the
  // taxiMission.passengerMesh pattern to any vehicle. `mesh` is captured
  // at pickup time so the passenger's skin is preserved across the ride,
  // even if npcMeshes[] changes mid-ride (a la taxi mission line ~2250).
  // `kind: 'player'` is reserved for future MP passenger support.
  passenger: {
    kind: 'npc' | 'player';
    id: number;
    mesh: CityMesh | CityMesh[];
    gender: string;
    type?: string;
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    yaw: number;
    scale: number;
  } | null = null;
  showPassengerPrompt = false;
  // NEW: Prompts for interacting with other players' cars. Set each frame
  // by checkNearOtherPlayerCar(). Only one is true at a time.
  showStealCarPrompt = false;
  showEnterPassengerPrompt = false;

  // Chat state
  isChatOpen = false;
  chatInput = '';
  pendingChatMessage = '';
  chatMessages: { userId: number; username: string; message: string; timestamp: string }[] = [];
  private knownChatTimestamps: Set<string> = new Set();
  // NEW: Hooker "services" state. Tracks the car-rocking animation phase
  // and the total money drained in the current session (caps at HOOKER_MAX_MONEY).
  private carRockPhase = 0;
  private hookerMoneyDrained = 0;
  carRocking = false; // read by the renderer to apply the rocking offset
  // FIX: Garage state. The door animates open/closed (0 = closed, 1 = open).
  // garageCar holds the stored car's data (or null if empty). garageCarMesh
  // is the rendered mesh of the stored car inside the garage.
  garageDoorOpenness = 0; // 0 = closed, 1 = fully open
  garageCar: { vehicleType: string; colorR: number; colorG: number; colorB: number; yaw: number } | null = null;
  private garageCarMesh: CityMesh | CityMesh[] | null = null;
  private garagePollTimer = 0;
  private wasInGarage = false; // tracks if player was inside garage last frame
  // FIX: Cooldown to prevent auto-entering the stored car immediately
  // after storing it. Set to ~3 seconds when a car is stored; counts
  // down each frame. Auto-enter only fires when this reaches 0.
  private garageStoreCooldown = 0;

  private _lastVendingChunkX = 999;
  private _lastVendingChunkZ = 999;
  lookTargetHealth: number | null = null;
  lookTargetName: string = '';
  playerVehicleMesh: CityMesh | CityMesh[] | null = null;
  playerVehicleColor: [number, number, number] = [1, 1, 1];

  currentWeapon = 0;
  ownedWeapons: boolean[] = [true, false, false, false, false];
  ammo: number[] = [0, 0, 0, 0, 0];
  droppedWeapons: any[] = [];
  private pickupCooldown = 0;
  private punchTimer = 0;
  health = 100;
  wantedLevel = 0;
  lastShootTime = 0;
  isShooting = false;
  showMenuPanel = false;
  sfxVolume = 1.0;
  viewDistance = 500;
  // Sound effects for weapons. Loaded lazily on first use.
  private uziSound: HTMLAudioElement | null = null;
  private rocketSound: HTMLAudioElement | null = null;
  private policeSirenSound: HTMLAudioElement | null = null;
  private audioUnlocked = false;
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

  ngOnInit() { 
    if (!this.parentRef?.user?.id) {
      this.userEventService.insertUserEvent(this.parentRef?.user?.id ?? 0, "grandtheft", "Started playing Grand Theft!"); 
    } 
  }

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
    this.renderer.loadGLTF('assets/grandtheft/jillValentine/scene.gltf', false).then(npc => {
      if (npc) {
        for (const m of npc) m.needsFlip = false;
        this.renderer.npcMeshes.push(npc);
      }
    });
    this.renderer.loadGLTF('assets/grandtheft/redneck/scene.gltf', false).then(npc => {
      if (npc) {
        for (const m of npc) m.needsFlip = false;
        this.renderer.npcMeshes.push(npc);
      }
    });
    this.renderer.loadGLTF('assets/grandtheft/bus/scene.gltf').then(bus => {
      if (bus) this.renderer.busMesh = bus;
    });
    this.renderer.loadGLTF('assets/grandtheft/policeMan/scene.gltf', false).then(cop => {
      if (cop) this.renderer.copMesh = cop;
    });

    this.renderer.loadGLTF('assets/grandtheft/lambo/scene.gltf').then(car => {
      if (car) this.renderer.carMeshes.push(car);
    }); 
    this.renderer.loadGLTF('assets/grandtheft/mitsubishi/scene.gltf').then(car => {
      if (car) this.renderer.carMeshes.push(car);
    });
    this.renderer.loadGLTF('assets/grandtheft/hilux/scene.gltf').then(car => {
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
    // FIX: Load home base (japaneseShop) mesh
    this.renderer.loadGLTF('assets/grandtheft/japaneseShop/scene.gltf').then(shop => {
      if (shop) this.renderer.homeBaseMesh = shop;
    });
    this.renderer.loadGLTF('assets/grandtheft/vendingMachine/scene.gltf').then(vm => {
      if (vm) this.renderer.vendingMachineMesh = vm;
    });
    this.renderer.loadGLTF('assets/grandtheft/taxi/scene.gltf').then(taxi => {
      if (taxi) this.renderer.taxiMesh = taxi;
    });
    // NEW: Hooker NPC model. The hooker GLTF ships already-upright
    // (like redneck), so needsFlip=false. jillValentine ships
    // upside-down and needs needsFlip=true, but the hooker doesn't.
    this.renderer.loadGLTF('assets/grandtheft/hooker/scene.gltf', false).then(hooker => {
      if (hooker) {
        for (const m of hooker) m.needsFlip = false;
        this.renderer.hookerMesh = hooker;
      }
    });
    this.renderer.loadGLTF('assets/grandtheft/rocket/scene.gltf').then(rkt => {
      if (rkt) this.renderer.rocketMesh = rkt;
    });
    this.renderer.loadGLTF('assets/grandtheft/colt/scene.gltf').then(colt => {
      if (colt) this.renderer.coltMesh = colt;
    });
    this.renderer.loadGLTF('assets/grandtheft/money/scene.gltf', false).then(m => {
      if (m) this.renderer.moneyMesh = m;
    });
    // --- First-person weapon models (with animations) ---
    {
      const armsOut: { animations?: any; skeleton?: any } = {};
      this.renderer.loadGLTF('assets/grandtheft/first_person_arms/scene.gltf', true, armsOut).then(arms => {
        if (arms) {
          this.renderer.firstPersonArmsMesh = arms;
          this.renderer.firstPersonArmsSkeleton = armsOut.skeleton ?? null;
          this.renderer.firstPersonArmsAnimations = armsOut.animations ?? null;
          console.log('[FP ARMS] loaded',
            arms.length, 'primitives,',
            this.renderer.firstPersonArmsAnimations?.length ?? 0, 'animations:',
            (this.renderer.firstPersonArmsAnimations || []).map(a => a.name));
        }
      });
    }
    {
      const m23Out: { animations?: any; skeleton?: any } = {};
      this.renderer.loadGLTF('assets/grandtheft/first_person_mark23/scene.gltf', false, m23Out).then(m => {
        if (m) {
          this.renderer.mark23Mesh = m;
          this.renderer.mark23Skeleton = m23Out.skeleton ?? null;
          this.renderer.mark23Animations = m23Out.animations ?? null;
          console.log('[FP MARK23] loaded');
        }
      });
    }
    this.renderer.loadGLTF('assets/grandtheft/rocket_launcher/scene.gltf').then(rk => {
      if (rk) this.renderer.rocketLauncherMesh = rk;
    });
    this.renderer.loadGLTF('assets/grandtheft/m4a1_rifle/scene.gltf').then(m4 => {
      if (m4) this.renderer.m4a1Mesh = m4;
    });
    this.renderer.loadGLTF('assets/grandtheft/trafficLight/scene.gltf').then(tl => {
      if (tl) this.renderer.trafficLightMesh = tl;
    });
    // Load city + suburb building models, then clear chunk cache
    // so chunks regenerate WITH the models instead of falling back
    // to plain boxes (the old code cached chunks before models loaded).
    const buildingPromises: Promise<void>[] = [];
    for (const name of GrandTheftRenderer.CITY_BUILDING_NAMES) {
      buildingPromises.push(
        this.renderer.loadGLTF(`assets/grandtheft/${name}/scene.gltf`, false).then(m => {
          if (m) this.renderer.cityBuildingMeshes.push(m);
        })
      );
    }
    for (const name of GrandTheftRenderer.SUBURB_BUILDING_NAMES) {
      buildingPromises.push(
        this.renderer.loadGLTF(`assets/grandtheft/${name}/scene.gltf`, false).then(m => {
          if (m) this.renderer.suburbBuildingMeshes.push(m);
        })
      );
    }
    Promise.all(buildingPromises).then(() => {
      this.renderer.clearChunkCache();
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
      if (this.isChatOpen) {
        if (e.code === 'Enter') { this.sendChatMessage(); }
        if (e.code === 'Escape') { this.isChatOpen = false; this.chatInput = ''; }
        return;
      }
      if (e.code === 'Enter') { this.isChatOpen = true; this.chatInput = ''; e.preventDefault(); return; }
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
        this.unlockAudio(); // FIX: unlock audio on first user interaction
        this.isShooting = true;
        this.shoot();
        this.startAutoFire();
      });
      canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) { this.isShooting = false; this.stopAutoFire(); }
      });
      canvas.addEventListener('mouseleave', () => { this.isShooting = false; this.stopAutoFire(); });
    }

    if (this.isMobile) {
      // Defer initTouchControls so the *ngIf="isMobile" DOM has time to
      // render. Without this, document.getElementById('gt-joystick-thumb')
      // returns null because Angular hasn't processed the *ngIf yet.
      setTimeout(() => this.initTouchControls(canvas), 0);
    }

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
      hasDriver: true,
      gender: Math.random() < 0.5 ? 'male' : 'female',
      passengerCount: Math.random() < 0.2 ? 1 : 0,
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
    if (this.policeSirenSound) { this.policeSirenSound.pause(); this.policeSirenSound = null; }
    this.renderer?.clearCache();
  }

  selectWeapon(idx: number) {
    this.currentWeapon = idx;
    this.showWeaponWheel = false;
  }

  private initTouchControls(canvas: HTMLCanvasElement) {
    this.joystickThumbEl = document.getElementById('gt-joystick-thumb');

    const updateThumb = (x: number, y: number) => {
      // FIX: Set joystickX/Y FIRST, before the null check, so movement
      // works even if the thumb element isn't rendered yet.
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
      // Update the visual thumb position if the element exists.
      if (this.joystickThumbEl) {
        const thumbOffset = Math.min(dist, 80);
        const tx = dist > 1 ? (dx / dist) * thumbOffset : 0;
        const ty = dist > 1 ? (dy / dist) * thumbOffset : 0;
        this.joystickThumbEl.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
      }
    };

    // FIX: Remove { passive: true } so we can call preventDefault().
    // passive listeners cannot prevent the browser from scrolling/zooming,
    // which steals touch events on mobile.
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
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
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
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
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickId) {
          this.joystickId = -1; this.joystickActive = false; this.joystickX = 0; this.joystickY = 0;
          if (this.joystickThumbEl) this.joystickThumbEl.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
        }
        if (t.identifier === this.touchCamId) { this.touchCamId = -1; }
      }
    }, { passive: false });

    // FIX: Also listen on document for touchstart so we don't miss touches
    // that land on the #gt-mobile overlay (which sits on top of the canvas).
    // The overlay has pointer-events: none, but some browsers still route
    // touchstart to the topmost element. This ensures we always catch it.
    document.addEventListener('touchstart', (e) => {
      // If the touch landed on one of the mobile buttons (FIRE/CAR/V),
      // let Angular's (touchstart) binding handle it — don't interfere.
      const target = e.target as HTMLElement;
      if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
        return;
      }
      // Only handle touches that aren't already captured by the canvas
      // listener (i.e., touches on the overlay that didn't reach canvas).
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
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      const target = e.target as HTMLElement;
      if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
        return;
      }
      e.preventDefault();
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
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
      const target = e.target as HTMLElement;
      if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
        return;
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickId) {
          this.joystickId = -1; this.joystickActive = false; this.joystickX = 0; this.joystickY = 0;
          if (this.joystickThumbEl) this.joystickThumbEl.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
        }
        if (t.identifier === this.touchCamId) { this.touchCamId = -1; }
      }
    }, { passive: false });
  }

  mobileShoot() { this.unlockAudio(); this.isShooting = true; this.shoot(); this.startAutoFire(); }
  mobileShootEnd() { this.isShooting = false; this.stopAutoFire(); }

  /**
   * FIX: Called by the mobile button (touchstart) handlers. Prevents the
   * browser from also firing a click event 300ms later, and stops the
   * touch from propagating to the document/canvas touch listeners (which
   * would otherwise treat it as a joystick or camera-look touch).
   */
  onButtonTouch(e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  toggleCar() {
    // If we're a passenger in another player's car, E exits the car.
    if (this.isPassenger) {
      this.exitPassenger();
      return;
    }
    if (this.isInCar) {
      // If we're driving, have no passenger, are slow, and a
      // hooker is nearby, pick her up instead of exiting. Once we have
      // a passenger, E always exits the car (and drops her off too).
      if (!this.passenger && this.tryPickupPassenger()) {
        return;
      }
      this.exitCar();
    } else if (this.nearCar) {
      this.enterCar();
    } else {
      // NEW: Check which side of another player's car we're on.
      // Driver side → steal (ejects the other player).
      // Passenger side → enter as passenger (does NOT eject).
      const side = this.getOtherPlayerCarSide();
      if (side === 'passenger') {
        this.tryEnterAsPassenger();
      } else if (side === 'driver') {
        this.enterCar(); // carjack path — ejects the other player
      } else if (this.nearVendingMachine) {
        // Use vending machine: heal to 100%
        this.health = 100;
      }
    }
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.camDist = this.firstPerson ? 0 : (this.isInCar ? 8 : 4);
    this.camHeight = this.firstPerson ? 0 : (this.isInCar ? 3 : 2);
  }

  sendChatMessage() {
    const text = this.chatInput.trim();
    if (!text) { this.isChatOpen = false; return; }
    this.pendingChatMessage = text;
    this.chatInput = '';
    this.isChatOpen = false;
  }

  sendMobileChatMessage() {
    const text = this.chatInput.trim();
    if (!text) return;
    this.pendingChatMessage = text;
    this.chatInput = '';
  }

  /**
   * NEW: Returns true if a hooker is currently within pickup range of
   * the player's car. Used to drive the on-screen 'Press E' prompt.
   */
  private canPickupPassenger(): boolean {
    if (!this.isInCar || this.passenger) return false;
    if (this.taxiMission) return false; // don't conflict with an active taxi fare
    if (Math.abs(this.carSpeed) > 5) return false;
    const PICKUP_DIST_SQ = 5 * 5;
    const check = (arr: any[]): boolean => {
      for (const ped of arr) {
        if (ped.type !== 'hooker' && ped.gender !== 'hooker') continue;
        const dx = ped.x - this.carX;
        const dz = ped.z - this.carZ;
        if (dx * dx + dz * dz < PICKUP_DIST_SQ) return true;
      }
      return false;
    };
    return check(this.serverPedestrians) || check(this.localPedestrians);
  }

  /**
   * NEW: Pick up the nearest hooker NPC as a passenger. Mirrors the
   * taxi-mission pickup (lines ~2254-2270) but uses the front passenger
   * seat (offsetX=-0.3, mirror of the driver's +0.3). Captures ped.mesh
   * directly so the skin is preserved across the ride and on drop-off,
   * regardless of npcMeshes[] changes mid-ride. Returns true if a
   * passenger was picked up.
   */
  private tryPickupPassenger(): boolean {
    if (this.taxiMission) return false;
    if (Math.abs(this.carSpeed) > 5) return false;
    const PICKUP_DIST = 5;
    const allPeds = [...this.serverPedestrians, ...this.localPedestrians];
    let best: { ped: any; dist: number } | null = null;
    for (const ped of allPeds) {
      if (ped.type !== 'hooker' && ped.gender !== 'hooker') continue;
      const dx = ped.x - this.carX;
      const dz = ped.z - this.carZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < PICKUP_DIST && (!best || dist < best.dist)) {
        best = { ped, dist };
      }
    }
    if (!best) return false;
    const ped = best.ped;
    this.passenger = {
      kind: 'npc',
      id: ped.id,
      mesh: ped.mesh, // <-- preserve exact mesh instance (taxi pattern)
      gender: ped.gender,
      type: ped.type,
      // Front passenger seat: mirror of driver offset (driver uses +0.3 X).
      // Offset convention (see renderer lines ~1735-1747):
      //   +X = one side, -X = other side; +Z = forward; offsetY = above carY.
      offsetX: -0.3,
      offsetY: -0.3,
      offsetZ: 0.2,
      yaw: 0,
      scale: 0.85,
    };
    this.stolenNpcIds.add(ped.id);
    this.localPedestrians = this.localPedestrians.filter(p => p.id !== ped.id);
    this.serverPedestrians = this.serverPedestrians.filter(p => p.id !== ped.id);
    return true;
  }

  /**
   * NEW: Drop the current passenger as a pedestrian next to the car,
   * preserving the same skin mesh she had when picked up. Mirrors the
   * taxi-mission drop-off pattern (lines ~2323-2334). The passenger
   * exits on the OPPOSITE side of the car from the driver (driver exits
   * at carYaw + PI/2; passenger at carYaw - PI/2).
   */
  private dropPassenger(nearX: number, nearZ: number, carYaw: number) {
    if (!this.passenger) return;
    const p = this.passenger;
    const angle = carYaw - Math.PI / 2; // opposite side from driver
    const exitDist = 3.0;
    const px = nearX + Math.sin(angle) * exitDist;
    const pz = nearZ + Math.cos(angle) * exitDist;
    // Walk target: a random traffic node so she wanders off naturally.
    let tx = px + (Math.random() - 0.5) * 20;
    let tz = pz + (Math.random() - 0.5) * 20;
    if (this.trafficNodes.length > 0) {
      const node = this.trafficNodes[Math.floor(Math.random() * this.trafficNodes.length)];
      tx = node.x;
      tz = node.z;
    }
    this.localPedestrians.push({
      id: p.id,
      x: px,
      z: pz,
      yaw: carYaw + Math.PI, // face away from the car
      gender: p.gender,
      type: p.type,
      mesh: p.mesh, // <-- preserved skin
      health: 100,
      targetX: tx,
      targetZ: tz,
      waitTimer: 0,
    });
    this.passenger = null;
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
          // Attach the player character as a visible driver in the car
          if (this.renderer.playerMesh) {
            this.driverInCarMesh = {
              mesh: this.renderer.playerMesh,
              offsetX: 0.3,
              offsetY: -0.3,
              offsetZ: 0.2,
              yaw: 0,
              scale: 0.85,
            };
          }

          if (this.vehicleType === 'plane') { this.camDist = 12; this.camHeight = 5; }
          else if (this.vehicleType === 'motorcycle') { this.camDist = 6; this.camHeight = 2.5; }
          else { this.camDist = 8; this.camHeight = 3; }

          // NEW (Feature 2): Handle the StealCar response to add
          // evicted NPCs to serverPedestrians immediately, instead
          // of waiting ~1s for the next poll. The server returns
          // evictedNpcs (driver + passengers) in the response body.
          this.gtService.stealCar(v.id, userId).then((stealRes: any) => {
            if (stealRes && stealRes.evictedNpcs) {
              for (const ep of stealRes.evictedNpcs) {
                this.serverPedestrians.push({
                  id: ep.id,
                  x: ep.posX, z: ep.posZ, yaw: ep.yaw,
                  gender: ep.gender || 'male',
                  type: ep.type,
                  mesh: this.renderer.getPedestrianMesh(ep.gender || 'male', ep.id),
                  // FIX: Use full health (100) so evicted peds don't die
                  // immediately. The server now returns health=100.
                  health: ep.health ?? 100,
                  prevX: ep.posX, prevZ: ep.posZ, prevYaw: ep.yaw,
                  targetX: ep.posX, targetZ: ep.posZ, targetYaw: ep.yaw,
                  speed: ep.speed ?? 2.0,
                  lastUpdate: performance.now(),
                });
              }
            }
          });
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
    // NEW (Feature 3): Try to carjack another player's car.
    if (this.tryCarjackPlayer(userId)) return;
  }

  /**
   * NEW (Feature 3): Attempt to steal a car from another nearby
   * player who is currently driving. Calls the existing stealCar
   * endpoint with a NEGATIVE npcId (-userId) — the server interprets
   * this as a player-carjack and sets the eviction flag for the
   * target. The target's next UpdatePosition call will see
   * evicted=true and call exitCar() on their client.
   *
   * Locally, we take over the car position/yaw and use a default
   * car mesh (we don't know the other player's car model). The
   * other player is marked as not-in-car on our side so the
   * renderer stops drawing a car under them.
   */
  private tryCarjackPlayer(userId: number): boolean {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = op.posX - this.carX;
      const dz = op.posZ - this.carZ;
      if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
        // Take over the other player's car position
        this.carX = op.posX; this.carZ = op.posZ; this.carYaw = op.yaw;
        this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
        this.isInCar = true;
        this.vehicleType = 'car';
        this.carHealth = 400;

        // Use a default car mesh (we don't know the other player's model)
        const carMeshes = this.renderer.carMeshes;
        this.playerVehicleMesh = carMeshes.length > 0 ? carMeshes[0] : null;
        this.playerVehicleColor = [0.5, 0.5, 0.5];
        if (this.renderer.playerMesh) {
          this.driverInCarMesh = {
            mesh: this.renderer.playerMesh,
            offsetX: 0.3,
            offsetY: -0.3,
            offsetZ: 0.2,
            yaw: 0,
            scale: 0.85,
          };
        }

        this.camDist = 8; this.camHeight = 3;

        // Tell the server to evict the other player. Reuses the
        // existing stealCar service method with -userId convention.
        this.gtService.stealCar(-op.userId, userId);

        // Locally mark the other player as evicted so the renderer
        // stops drawing a car under them. The server will confirm
        // on the next poll when their IsInCar flips to false.
        op.isInCar = false;

        return true;
      }
    }
    return false;
  }

  /**
   * NEW (Feature 3): Returns true if any other player in a car is
   * within ENTER_CAR_DIST. Used by toggleCar() to decide whether
   * to attempt a carjack.
   */
  private nearOtherPlayerCar(): boolean {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = op.posX - this.carX;
      const dz = op.posZ - this.carZ;
      if (dx * dx + dz * dz < ENTER_CAR_DIST * ENTER_CAR_DIST) return true;
    }
    return false;
  }

  /**
   * NEW: Checks if the local player is near another player's car and on
   * which side. Returns:
   *   'driver'    — near the driver side (right side of car) → steal car
   *   'passenger' — near the passenger side (left side of car) → enter as passenger
   *   null        — not near any other player's car
   *
   * Side detection: the car's right direction (driver side, right-hand
   * drive) is (cos(yaw), -sin(yaw)). Dot the relative position vector
   * with this. Positive → driver side, negative → passenger side.
   */
  private getOtherPlayerCarSide(): 'driver' | 'passenger' | null {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = this.carX - op.posX; // player relative to car
      const dz = this.carZ - op.posZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > ENTER_CAR_DIST * ENTER_CAR_DIST) continue;
      // Car's right direction (driver side): perpendicular to forward (sin, cos).
      // Forward is (sin(yaw), cos(yaw)). Right is (cos(yaw), -sin(yaw)).
      const rightX = Math.cos(op.yaw);
      const rightZ = -Math.sin(op.yaw);
      const dot = dx * rightX + dz * rightZ;
      return dot > 0 ? 'driver' : 'passenger';
    }
    return null;
  }

  /**
   * NEW: Called every frame to update the steal-car / enter-passenger
   * prompts based on which side of another player's car the local
   * player is standing on.
   */
  private checkNearOtherPlayerCar() {
    if (this.isInCar || this.isPassenger) {
      this.showStealCarPrompt = false;
      this.showEnterPassengerPrompt = false;
      return;
    }
    const side = this.getOtherPlayerCarSide();
    this.showStealCarPrompt = (side === 'driver');
    this.showEnterPassengerPrompt = (side === 'passenger');
  }

  /**
   * Enter another player's car as a PASSENGER. Does NOT eject the host
   * player. The passenger follows the host's position each frame via
   * updatePassengerFollow(). The passenger can exit at any time with E
   * (via exitPassenger). The passenger cannot control the car.
   *
   * This is called from toggleCar() when the local player is on the
   * passenger side of the host's car. Returns true on success.
   */
  private tryEnterAsPassenger(): boolean {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = op.posX - this.carX;
      const dz = op.posZ - this.carZ;
      if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
        // Become a passenger — does NOT eject the host
        this.isPassenger = true;
        this.passengerOfUserId = op.userId;
        this.isInCar = false; // we're not the driver
        // Snap to the host's car position
        this.carX = op.posX;
        this.carZ = op.posZ;
        this.carYaw = op.yaw;
        this.carSpeed = op.carSpeed;
        this.camDist = 8;
        this.camHeight = 3;
        return true;
      }
    }
    return false;
  }

  /**
   * NEW: Exit the passenger seat. Places the player on foot next to the
   * host's car. Called when E is pressed while isPassenger is true.
   */
  private exitPassenger() {
    // Find the host to get the current car position
    const host = this.otherPlayers.find(p => p.userId === this.passengerOfUserId);
    if (host) {
      // Exit to the side of the car
      const angle = host.yaw + Math.PI / 2;
      this.carX = host.posX + Math.sin(angle) * 2.5;
      this.carZ = host.posZ + Math.cos(angle) * 2.5;
      this.carYaw = host.yaw;
    }
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0; this.carY = CAR_HEIGHT;
    this.isPassenger = false;
    this.passengerOfUserId = 0;
    this.camDist = 4;
    this.camHeight = 2;
  }

  /**
   * Called every frame when isPassenger is true. Follows the host
   * player's position/yaw from the otherPlayers array so the passenger
   * rides along without controlling the car.
   *
   * FIX: Uses velocity-based dead reckoning + lerp for smooth movement.
   * The host's position only updates every 200ms (poll interval). Without
   * smoothing, the passenger would snap to the new position every 200ms
   * and freeze in between — causing choppy movement. Instead, we:
   * 1. Track the host's position + velocity (computed from position delta
   *    between polls).
   * 2. Each frame, predict where the host should be now:
   *    predicted = lastKnown + velocity * timeSinceLastPoll
   * 3. Lerp the passenger's position toward the predicted position at
   *    15% per frame (~2 frames to catch up). This eliminates the snap
   *    while keeping the passenger close to the host.
   */
  private updatePassengerFollow() {
    if (!this.isPassenger) return;
    const host = this.otherPlayers.find(p => p.userId === this.passengerOfUserId);
    if (!host) {
      this.exitPassenger();
      return;
    }
    const now = performance.now();

    // Detect if the host's position was updated since last frame (new poll).
    // We compare against the stored last-known position. If it changed,
    // recompute velocity.
    const hostMoved = (host.posX !== this.passengerHostLastX || host.posZ !== this.passengerHostLastZ || host.yaw !== this.passengerHostLastYaw);
    if (hostMoved && this.passengerHostLastTime > 0) {
      const dt = (now - this.passengerHostLastTime) / 1000;
      if (dt > 0.001) {
        this.passengerHostVelX = (host.posX - this.passengerHostLastX) / dt;
        this.passengerHostVelZ = (host.posZ - this.passengerHostLastZ) / dt;
        // Yaw velocity: handle angle wrap
        let dyaw = host.yaw - this.passengerHostLastYaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.passengerHostVelYaw = dyaw / dt;
      }
      this.passengerHostLastX = host.posX;
      this.passengerHostLastZ = host.posZ;
      this.passengerHostLastYaw = host.yaw;
      this.passengerHostLastTime = now;
    } else if (this.passengerHostLastTime === 0) {
      // First frame — just store the position, no velocity yet
      this.passengerHostLastX = host.posX;
      this.passengerHostLastZ = host.posZ;
      this.passengerHostLastYaw = host.yaw;
      this.passengerHostLastTime = now;
      this.carX = host.posX;
      this.carZ = host.posZ;
      this.carYaw = host.yaw;
      this.carSpeed = host.carSpeed;
      this.carY = CAR_HEIGHT;
      return;
    }

    // Dead-reckon: predict where the host should be now based on velocity
    const timeSincePoll = (now - this.passengerHostLastTime) / 1000;
    const predictedX = this.passengerHostLastX + this.passengerHostVelX * timeSincePoll;
    const predictedZ = this.passengerHostLastZ + this.passengerHostVelZ * timeSincePoll;
    let predictedYaw = this.passengerHostLastYaw + this.passengerHostVelYaw * timeSincePoll;

    // Lerp the passenger toward the predicted position (15% per frame).
    // This smooths out the snap that would otherwise occur every 200ms.
    const lerpFactor = 0.15;
    this.carX += (predictedX - this.carX) * lerpFactor;
    this.carZ += (predictedZ - this.carZ) * lerpFactor;

    // Yaw: lerp through the shorter arc
    let yawDiff = predictedYaw - this.carYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.carYaw += yawDiff * lerpFactor;

    this.carSpeed = host.carSpeed;
    this.carY = CAR_HEIGHT;
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
      // FIX: Send the vehicleType so the server stores the actual type (not
      // just "parked"). This ensures other players render the correct car
      // model when they see the parked car.
      this.gtService.parkCar(1, this.carX, this.carZ, this.carYaw, color[0], color[1], color[2], this.vehicleType).then((res: any) => {
        const localCar = this.parkedCars.find(p => p.id === tempId);
        if (localCar && res && res.id) {
          localCar.id = res.id;
        }
      });
    }

    this.playerVehicleMesh = null;
    this.driverInCarMesh = null;
    // FIX: If exiting inside the garage, store the car to the garage DB
    // instead of parking it on the street. The car is saved with its
    // vehicle type + color so it can be restored when the player returns.
    // The player is left on foot outside the garage entrance.
    if (this.isInGarageInterior()) {
      const userId = this.getUserId();
      if (userId && mesh) {
        // Store the car to the server. Do NOT set garageCar/garageCarMesh
        // here — the poll will fetch it for rendering. Setting it here
        // would trigger auto-enter on the next frame.
        this.gtService.storeGarageCar(
          userId,
          this.vehicleType,
          color[0], color[1], color[2],
          this.carYaw
        );
        // FIX: Set a 10-second cooldown so the player isn't auto-entered
        // back into the car they just stored. The poll may re-fetch the
        // car within 2s, but the cooldown blocks auto-enter.
        this.garageStoreCooldown = 10;
        // Clear any existing garageCar state so the poll doesn't trigger
        // auto-enter before the cooldown elapses.
        this.garageCar = null;
        this.garageCarMesh = null;
        // Skip the normal parkCar call — the car goes into the garage, not the street
        this.isInCar = false; this.vehicleType = 'car';
        this.carVx = 0; this.carVz = 0; this.carSpeed = 0; this.carY = CAR_HEIGHT;
        this.camDist = 4; this.camHeight = 2;
        // Move player outside the garage entrance
        this.carX = GARAGE_ENTRANCE_X;
        this.carZ = GARAGE_ENTRANCE_Z + 3;
        return;
      }
    }
    // NEW: Drop off the passenger (if any) as a pedestrian next to the
    // car, preserving the same skin mesh she had when picked up.
    // Mirrors taxi-mission drop-off (lines ~2323-2334).
    if (this.passenger) {
      this.dropPassenger(this.carX, this.carZ, this.carYaw);
    }
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
    // FIX: Track peds that were recently added via StealCar eviction but
    // haven't appeared in the server's GetNPCs response yet. We preserve
    // them for up to 5 seconds after their lastUpdate time so they don't
    // disappear during the 1-second poll gap.
    const now = performance.now();
    const recentlyEvictedPeds = this.serverPedestrians.filter(p =>
      (now - (p.lastUpdate || 0)) < 5000 && !data.pedestrians.some((sp: any) => sp.id === p.id)
    );
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
          // NEW (Feature 1): capture driver info so the renderer
          // can draw a driver mesh inside the car.
          gender: c.gender,
          hasDriver: c.hasDriver !== false,
          passengerCount: c.passengerCount ?? 0,
          // NEW: Cop shooting flag for visualization + sound
          isShootingAt: c.isShootingAt || false,
          isBurning: c.isBurning || false,
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
          isShootingAt: p.isShootingAt || false,
          ...interp
        };
      });
    // FIX: Merge recently-evicted peds back in so they don't disappear
    // during the 1-second poll gap between StealCar and GetNPCs.
    if (recentlyEvictedPeds.length > 0) {
      this.serverPedestrians = [...this.serverPedestrians, ...recentlyEvictedPeds];
    }

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
          existing.x = pc.posX; existing.z = pc.posZ; existing.yaw = pc.yaw; existing.health = health; existing.isBurning = pc.isBurning || false;
          // Refresh mesh only for special types that may have been loading
          // async (police, taxi, bus, motorcycle). Regular cars keep their
          // existing mesh so exiting doesn't randomly change the model.
          if (pc.type === 'police')
            existing.mesh = this.renderer.getPoliceCarMesh();
          else if (pc.type === 'taxi')
            existing.mesh = this.renderer.getTaxiMesh();
          else if (pc.type === 'motorcycle')
            existing.mesh = this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
          else if (pc.type === 'bus' && this.renderer.busMesh)
            existing.mesh = this.renderer.busMesh;
          return existing;
        }
        return {
          id: pc.id, x: pc.posX, z: pc.posZ, yaw: pc.yaw,
          type: pc.type || 'car', health,
          isBurning: pc.isBurning || false,
          colorR: pc.colorR, colorG: pc.colorG, colorB: pc.colorB,
          // FIX: Server now sends the actual vehicle type (e.g. "car",
          // "taxi", "motorcycle", "police", "bus") instead of "parked".
          // Pick the correct mesh based on the type.
          mesh: pc.type === 'motorcycle'
            ? this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB], pc.id)
            : pc.type === 'taxi'
              ? this.renderer.getTaxiMesh()
              : pc.type === 'police'
                ? this.renderer.getPoliceCarMesh()
                : pc.type === 'bus'
                  ? (this.renderer.busMesh || this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id))
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

    const chatMsg = this.pendingChatMessage || undefined;
    this.pendingChatMessage = '';
    const res = await this.gtService.updatePosition(
      userId, 1, this.carX, this.carY, this.carZ,
      this.camYaw, this.camPitch, this.carYaw, this.carSpeed,
      this.health, this.currentWeapon, this.isShooting,
      this.renderer.currentModelUrl || undefined,
      this.money,
      // FIX: Send explicit isInCar + vehicle type + car color so other
      // players render the correct car. The old CarSpeed-based inference
      // failed when players stopped in their cars for >5 seconds.
      this.isInCar,
      this.vehicleType,
      this.playerVehicleColor[0],
      this.playerVehicleColor[1],
      this.playerVehicleColor[2],
      // FIX: Send passengerOfUserId so the host knows we're in their car.
      this.isPassenger ? this.passengerOfUserId : 0,
      chatMsg
    );

    // NEW (Feature 3): If the server says we were carjacked, exit
    // the car immediately. The carjacker's client has already taken
    // over our car position; we just need to stop driving.
    if (res && res.evicted && this.isInCar) {
      this.exitCar();
    }
    // NEW: If we were carjacked while a passenger, exit the passenger seat.
    if (res && res.evicted && this.isPassenger) {
      this.exitPassenger();
    }
    // FIX: If the server says we should respawn at home base (inactive
    // >30 min), teleport there immediately.
    if (res && res.respawnAtHome) {
      if (this.isInCar) this.exitCar();
      if (this.isPassenger) this.exitPassenger();
      this.carX = HOME_BASE_X;
      this.carZ = HOME_BASE_Z;
      this.carY = CAR_HEIGHT;
      this.carYaw = HOME_BASE_YAW;
      this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
      this.camYaw = HOME_BASE_YAW;
      this.camPitch = 0.2;
    }

    // Process dropped weapons from server
    if (res && res.droppedWeapons) {
      this.droppedWeapons = res.droppedWeapons;
    } 
    // Process player weapon inventory from server
    if (res && res.ownedWeapons) {
      this.ownedWeapons = res.ownedWeapons;
      this.ammo = res.ammo;
    }

    if (res?.chatMessages) {
      // Process incoming chat messages
      for (const msg of res.chatMessages) {
        const key = `${msg.userId}_${msg.timestamp}`;
        if (this.knownChatTimestamps.has(key)) continue;
        this.knownChatTimestamps.add(key);
        if (this.knownChatTimestamps.size > 500) {
          const iter = this.knownChatTimestamps.values().next();
          if (iter.value) this.knownChatTimestamps.delete(iter.value);
        }
        this.chatMessages.push(msg);
        if (this.chatMessages.length > 50) this.chatMessages.shift();
      } 
    }


    if (res) {
      for (const p of res.players) {
        const existing = this.otherPlayers.find(op => op.userId === p.userId);
        if (existing) {
          existing.posX = p.posX; existing.posY = p.posY; existing.posZ = p.posZ;
          existing.yaw = p.carYaw; existing.carSpeed = p.carSpeed; existing.health = p.health; existing.weapon = p.weapon; existing.money = p.money;
          existing.isShooting = p.isShooting; existing.camYaw = p.yaw; existing.camPitch = p.pitch;
          existing.isInCar = p.isInCar || false;
          existing.vehicleType = p.vehicleType || 'car';
          existing.carColorR = p.carColorR ?? 1;
          existing.carColorG = p.carColorG ?? 1;
          existing.carColorB = p.carColorB ?? 1;
          existing.passengerOfUserId = p.passengerOfUserId ?? 0;
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
          const placeholderMesh = this.renderer.playerMesh || this.renderer.getOtherPlayerMesh(color);
          const newPlayer = {
            userId: p.userId, posX: p.posX, posY: p.posY, posZ: p.posZ,
            yaw: p.carYaw, carSpeed: p.carSpeed, health: p.health, weapon: p.weapon, money: p.money,
            username: p.username, mesh: placeholderMesh, modelUrl: p.modelUrl,
            isShooting: p.isShooting, camYaw: p.yaw, camPitch: p.pitch, remoteShootTimer: 0,
            isInCar: p.isInCar || false,
            vehicleType: p.vehicleType || 'car',
            carColorR: p.carColorR ?? 1,
            carColorG: p.carColorG ?? 1,
            carColorB: p.carColorB ?? 1,
            passengerOfUserId: p.passengerOfUserId ?? 0
          } as OtherPlayerState;
          this.otherPlayers.push(newPlayer);

          // FIX: If our Franklin model hasn't loaded yet, we assigned the boxy fallback.
          // Check again in a moment to upgrade them to the real Franklin mesh.
          if (!this.renderer.playerMesh) {
            setTimeout(() => {
              if (this.renderer.playerMesh && newPlayer.mesh !== this.renderer.playerMesh) {
                newPlayer.mesh = this.renderer.playerMesh;
              }
            }, 2000);
          }
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
      // Visualize cop shooting us if we took damage. Cops are now
      // Type == "cop" (on foot), not "police" (in car). We check both
      // in case a police car is still chasing. The IsShootingAt flag
      // from the server is more reliable than the damage check, but
      // we keep the damage check as a fallback.
      if (res.yourHealth < this.health) {
        let foundShooter = false;
        const checkShooter = (npc: any) => {
          if (npc.type !== 'cop' && npc.type !== 'police') return;
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
            this.muzzleFlashes.push({
              x: npc.x, y: 1.2, z: npc.z,
              dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3,
              weapon: 0, age: 0, lifetime: 0.08
            });
            foundShooter = true;
          }
        };
        for (const npc of this.serverNPCs) checkShooter(npc);
        for (const ped of this.serverPedestrians) checkShooter(ped);
        // Play pistol sound if a cop shot us
        if (foundShooter) this.playWeaponSound(0);
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

    // Check ammo for non-unarmed weapons
    if (this.currentWeapon !== 0) {
      if (this.ammo[this.currentWeapon] <= 0) return;
      this.ammo[this.currentWeapon]--;
      if (this.ammo[this.currentWeapon] <= 0) {
        this.ownedWeapons[this.currentWeapon] = false;
        this.currentWeapon = 0;
      }
    }
    this.lastShootTime = now;

    const userId = this.getUserId();
    if (!userId) return;

    const dirX = Math.sin(this.camYaw) * Math.cos(this.camPitch);
    const dirY = -Math.sin(this.camPitch);
    const dirZ = Math.cos(this.camYaw) * Math.cos(this.camPitch);

    const originX = this.carX;
    const originY = this.carY + (this.isInCar ? 0.5 : 1.2);
    const originZ = this.carZ;

    if (this.currentWeapon === 0) { // Unarmed – punch
      this.punchTimer = 0.3;
      this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ, 3);
    } else if (this.currentWeapon === 4) { // Rocket
      this.rockets.push({ x: originX, y: originY, z: originZ, vx: dirX * 40, vy: dirY * 40, vz: dirZ * 40, age: 0, lifetime: 3 });
      this.playWeaponSound(4);
    } else {
      const tracerLifetime = this.currentWeapon === 2 ? 0.15 : 0.3;
      this.tracers.push({ originX, originY, originZ, dirX, dirY, dirZ, age: 0, lifetime: tracerLifetime });
      this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, dirX, dirY, dirZ, weapon: this.currentWeapon, age: 0, lifetime: 0.08 });

      if (this.currentWeapon === 3) { // Shotgun
        for (let i = 1; i < 8; i++) {
          const spread = 0.08;
          this.tracers.push({ originX, originY, originZ, dirX: dirX + (Math.random() - 0.5) * spread, dirY: dirY + (Math.random() - 0.5) * spread, dirZ: dirZ + (Math.random() - 0.5) * spread, age: 0, lifetime: 0.2 });
        }
      }
      this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ);
      this.playWeaponSound(this.currentWeapon);
    }
  }

  /**
   * FIX: Unlocks audio playback on the first user interaction. Browsers
   * block Audio.play() until the user has interacted with the page. We
   * create the Audio objects and call play() once (which may fail silently),
   * then set a flag so subsequent plays work. Called from mousedown and
   * mobileShoot (both are user gestures).
   */
  private unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    try {
      if (!this.uziSound) this.uziSound = new Audio('assets/grandtheft/uzi.mp3');
      if (!this.rocketSound) this.rocketSound = new Audio('assets/grandtheft/rocket.mp3');
      if (!this.policeSirenSound) { this.policeSirenSound = new Audio('assets/grandtheft/policeSiren.mp3'); this.policeSirenSound.loop = true; }
      [this.uziSound, this.rocketSound, this.policeSirenSound].forEach(a => {
        if (a) { a.volume = 0; a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 0.3; }).catch(() => { }); }
      });
    } catch (e) { /* ignore */ }
  }

  /**
   * Plays the appropriate weapon sound effect.
   * - Weapon 0 (Pistol): pistol.mp3
   * - Weapon 1 (Rifle): uzi.mp3
   * - Weapon 3 (Rocket Launcher): rocket.mp3
   * FIX: Clones the Audio element on each shot so rapid fire doesn't
   * cut off the previous sound. The clone shares the same audio buffer
   * (no re-download) but can play independently.
   */
  private playWeaponSound(weapon: number) {
    if (weapon === 0) return; // Unarmed – no sound
    try {
      let base: HTMLAudioElement | null = null;
      let vol = 0.3;
      if (weapon === 1) { base = this.uziSound; vol = 0.2; }    // Pistol → uzi
      else if (weapon === 2) { base = this.uziSound; vol = 0.3; }
      else if (weapon === 3) { base = this.uziSound; vol = 0.35; } // Shotgun → uzi
      else if (weapon === 4) { base = this.rocketSound; vol = 0.5; }
      if (!base) {
        if (weapon >= 1 && weapon <= 3) { this.uziSound = new Audio('assets/grandtheft/uzi.mp3'); base = this.uziSound; }
        else if (weapon === 4) { this.rocketSound = new Audio('assets/grandtheft/rocket.mp3'); base = this.rocketSound; }
      }
      if (!base) return;
      const clone = base.cloneNode(true) as HTMLAudioElement;
      clone.volume = vol * this.sfxVolume;
      clone.play().catch(() => { /* ignore autoplay errors */ });
    } catch (e) { /* ignore audio errors */ }
  }

  private checkBulletHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxRange: number = 50) {
    const checkTargets = (list: any[], isPlayer: boolean) => {
      for (const t of list) {
        const tx = t.posX || t.x;
        const ty = (t.posY || 0) + 1.0;
        const tz = t.posZ || t.z;

        const vx = tx - ox, vy = ty - oy, vz = tz - oz;
        const proj = vx * dx + vy * dy + vz * dz;
        if (proj < 0 || proj > maxRange) continue;

        const closestX = ox + dx * proj, closestY = oy + dy * proj, closestZ = oz + dz * proj;
        const distSq = (tx - closestX) ** 2 + (ty - closestY) ** 2 + (tz - closestZ) ** 2;

        if (distSq < 1.0) { // Hit radius
          this.spawnBlood(tx, ty, tz, dx, dy, dz);
          if (isPlayer) {
            this.gtService.hit(this.getUserId(), t.userId, 1, WEAPON_DAMAGES[this.currentWeapon], ox, oz);
          } else {
            // Deduct locally for instant visual feedback
            t.health = (t.health ?? 100) - WEAPON_DAMAGES[this.currentWeapon];
            // Tell the server to permanently apply the damage!
            this.gtService.hit(this.getUserId(), t.id, 1, WEAPON_DAMAGES[this.currentWeapon], ox, oz);
            this.score += 10;
          }
          return true;
        }
      }
      return false;
    };
    checkTargets(this.otherPlayers, true);

    checkTargets(this.serverPedestrians, false);
    // FIX: localPedestrians were missing from hit detection — bullets
    // passed right through them. They're the bulk of foot traffic, so
    // most peds appeared unhittable ("background" pedestrians).
    checkTargets(this.localPedestrians, false);
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

  /**
   * FIX: Applies explosion-induced jump + push velocities to parked and
   * traffic cars. Each car may have jumpVel, pushVelX, pushVelZ set by
   * spawnExplosion(). We apply gravity to jumpVel and move the car, then
   * decay the push velocity. When the car lands (y <= 0), we stop.
   * This makes cars visibly "pop" when an explosion hits near them.
   */
  private updateExplosionJumps(dt: number) {
    const GRAVITY = 20.0;
    const applyJump = (car: any) => {
      if (car.jumpVel === undefined && car.pushVelX === undefined && car.pushVelZ === undefined) return;
      // Apply upward velocity + gravity
      if (car.jumpVel !== undefined && car.jumpVel > 0) {
        car._expY = (car._expY ?? 0) + car.jumpVel * dt;
        car.jumpVel -= GRAVITY * dt;
        if (car.jumpVel < 0 && (car._expY ?? 0) <= 0) {
          car._expY = 0;
          car.jumpVel = 0;
        }
      }
      // Apply push velocity (horizontal)
      if (car.pushVelX !== undefined && Math.abs(car.pushVelX) > 0.01) {
        car.x = (car.x ?? 0) + car.pushVelX * dt;
        car.pushVelX *= 0.92; // friction
      }
      if (car.pushVelZ !== undefined && Math.abs(car.pushVelZ) > 0.01) {
        car.z = (car.z ?? 0) + car.pushVelZ * dt;
        car.pushVelZ *= 0.92;
      }
    };
    for (const pc of this.parkedCars) applyJump(pc);
    for (const tc of this.trafficCars) applyJump(tc);
    for (const sn of this.serverNPCs) applyJump(sn);
  }

  /**
   * FIX: Garage system. Each frame:
   * 1. Checks if the player is within GARAGE_DETECT_RADIUS of the entrance.
   * 2. If yes: opens the door (animates openness → 1). Polls the server
   *    for the stored car (every 2s) and renders it inside the garage.
   * 3. If no: closes the door (animates openness → 0).
   * 4. If the player just entered the garage on foot (not in a car),
   *    and there's a stored car, auto-enter it.
   * 5. If the player exits their car while inside the garage, store it.
   * 6. If the player drives the car out of the garage (past the entrance),
   *    remove it from the garage DB.
   */
  private updateGarage(dt: number) {
    // FIX: Count down the store cooldown so auto-enter is re-enabled
    // after a few seconds.
    if (this.garageStoreCooldown > 0) {
      this.garageStoreCooldown -= dt;
    }

    const dx = this.carX - GARAGE_ENTRANCE_X;
    const dz = this.carZ - GARAGE_ENTRANCE_Z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const nearGarage = dist < GARAGE_DETECT_RADIUS;

    // Animate door
    if (nearGarage) {
      this.garageDoorOpenness = Math.min(1, this.garageDoorOpenness + GARAGE_DOOR_OPEN_SPEED * dt);
    } else {
      this.garageDoorOpenness = Math.max(0, this.garageDoorOpenness - GARAGE_DOOR_OPEN_SPEED * dt);
    }

    // Poll server for stored car every 2 seconds when near garage.
    // FIX: Skip the poll entirely while the store cooldown is active —
    // otherwise the poll re-populates garageCar and after the cooldown
    // expires, auto-enter fires, putting the player back in the car.
    if (nearGarage && this.garageStoreCooldown <= 0) {
      this.garagePollTimer += dt;
      if (this.garagePollTimer > 2) {
        this.garagePollTimer = 0;
        const userId = this.getUserId();
        if (userId) {
          this.gtService.getGarageCar(userId).then((res: any) => {
            if (res && res.hasCar) {
              this.garageCar = {
                vehicleType: res.vehicleType || 'car',
                colorR: res.colorR ?? 1,
                colorG: res.colorG ?? 1,
                colorB: res.colorB ?? 1,
                yaw: res.yaw ?? 0,
              };
              // Build the mesh for the stored car
              const col: [number, number, number] = [this.garageCar.colorR, this.garageCar.colorG, this.garageCar.colorB];
              if (this.garageCar.vehicleType === 'taxi') {
                this.garageCarMesh = this.renderer.getTaxiMesh();
              } else if (this.garageCar.vehicleType === 'motorcycle') {
                this.garageCarMesh = this.renderer.motorcycleMeshes.length > 0
                  ? this.renderer.motorcycleMeshes[0]
                  : this.renderer.getNPCCarMesh(col, 0);
              } else if (this.garageCar.vehicleType === 'bus') {
                this.garageCarMesh = this.renderer.busMesh || this.renderer.getNPCCarMesh(col, 0);
              } else if (this.garageCar.vehicleType === 'police') {
                this.garageCarMesh = this.renderer.getPoliceCarMesh();
              } else {
                this.garageCarMesh = this.renderer.carMeshes.length > 0
                  ? this.renderer.carMeshes[0]
                  : this.renderer.getNPCCarMesh(col, 0);
              }
            } else {
              this.garageCar = null;
              this.garageCarMesh = null;
            }
          });
        }
      }
    }

    // Check if player is inside the garage interior
    const inGarageInterior = this.isInGarageInterior();

    // If the player just drove OUT of the garage (was inside, now not),
    // and they're in a car, remove it from the garage DB.
    if (this.wasInGarage && !inGarageInterior && this.isInCar) {
      const userId = this.getUserId();
      if (userId) {
        this.gtService.removeGarageCar(userId).then(() => {
          this.garageCar = null;
          this.garageCarMesh = null;
        });
      }
    }

    // If the player is on foot near the garage and there's a stored car,
    // auto-enter it — BUT only if the store cooldown has elapsed (prevents
    // instantly re-entering the car the player just stored).
    if (nearGarage && !this.isInCar && !this.isPassenger && this.garageCar && this.garageCarMesh && this.garageStoreCooldown <= 0) {
      // Place the player inside the stored car
      this.carX = GARAGE_INTERIOR_X;
      this.carZ = GARAGE_INTERIOR_Z;
      this.carYaw = this.garageCar.yaw;
      this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
      this.isInCar = true;
      this.vehicleType = this.garageCar.vehicleType as any;
      this.carHealth = 400;
      this.playerVehicleMesh = this.garageCarMesh;
      this.playerVehicleColor = [this.garageCar.colorR, this.garageCar.colorG, this.garageCar.colorB];
      if (this.renderer.playerMesh) {
        this.driverInCarMesh = {
          mesh: this.renderer.playerMesh,
          offsetX: 0.3,
          offsetY: -0.3,
          offsetZ: 0.2,
          yaw: 0,
          scale: 0.85,
        };
      }
      this.camDist = 8; this.camHeight = 3;
      // Clear the stored car locally (server removal happens when driven out)
      this.garageCar = null;
      this.garageCarMesh = null;
    }

    this.wasInGarage = inGarageInterior;
  }

  /** Returns true if the player is inside the garage interior zone. */
  private isInGarageInterior(): boolean {
    const dx = this.carX - GARAGE_INTERIOR_X;
    const dz = this.carZ - GARAGE_INTERIOR_Z;
    return dx * dx + dz * dz < 10 * 10; // 10-unit radius interior
  }

  private spawnExplosion(x: number, y: number, z: number) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 1.0 });

    const BLAST_RADIUS = 12.0; // FIX: Increased from 10 to 12 for chain reactions
    const BLAST_MAX_DMG = 200; // FIX: Increased so cars near the blast explode too
    const BLAST_MIN_DMG = 50;
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
          this.gtService.hit(this.getUserId(), t.userId, 1, dmg, this.carX, this.carZ);
          this.spawnBlood(tx, 1.2, tz, dx, 0, dz);
        } else if (isCar) {
          t.health = (t.health ?? 100) - dmg;
          const jumpForce = (1 - dist / BLAST_RADIUS) * 8;
          if (jumpForce > 0) {
            (t as any).jumpVel = Math.max((t as any).jumpVel ?? 0, jumpForce);
            if (dist > 0.01) {
              const pushForce = (1 - dist / BLAST_RADIUS) * 5;
              (t as any).pushVelX = ((t as any).pushVelX ?? 0) + (dx / dist) * pushForce;
              (t as any).pushVelZ = ((t as any).pushVelZ ?? 0) + (dz / dist) * pushForce;
            }
          }
          this.gtService.hit(this.getUserId(), t.id, 1, dmg, this.carX, this.carZ);
        } else {
          t.health = (t.health ?? 100) - dmg;
          this.spawnBlood(tx, 1.0, tz, dx, 0, dz);
          this.gtService.hit(this.getUserId(), t.id, 1, dmg, this.carX, this.carZ);
        }
      }
    };

    checkExplosionHits(this.otherPlayers, true);
    checkExplosionHits(this.serverPedestrians, false);
    checkExplosionHits(this.serverNPCs, false, true);
    checkExplosionHits(this.parkedCars, false, true);
    checkExplosionHits(this.trafficCars, false, true);
    checkExplosionHits(this.localPedestrians, false);

    // FIX: Also jump the player's own car if caught in the blast
    const selfDx = this.carX - x, selfDz = this.carZ - z;
    const selfDist = Math.sqrt(selfDx * selfDx + selfDz * selfDz);
    if (selfDist < BLAST_RADIUS && this.isInCar) {
      const jumpForce = (1 - selfDist / BLAST_RADIUS) * 8;
      this.carVy = Math.max(this.carVy ?? 0, jumpForce);
    }

    const selfDmg = dmgAt(selfDist);
    if (selfDmg > 0) {
      if (this.isInCar) {
        this.carHealth = Math.max(0, this.carHealth - selfDmg);
        const passThrough = Math.round(selfDmg * 0.4);
        if (passThrough > 0) {
          this.health = Math.max(0, this.health - passThrough);
          this.gtService.hit(this.getUserId(), this.getUserId(), 1, passThrough, this.carX, this.carZ);
          this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, selfDx, 0, selfDz);
        }
      } else {
        this.health = Math.max(0, this.health - selfDmg);
        this.gtService.hit(this.getUserId(), this.getUserId(), 1, selfDmg, this.carX, this.carZ);
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
        // Home base chunk (1,0) always acts as a full-block building
        // so NPCs are pushed out of the player's home area.
        if (chunkCX === 1 && chunkCZ === 0) {
          const blockCX = 1 * CHUNK_SIZE + CHUNK_SIZE / 2;
          const blockCZ = 0 * CHUNK_SIZE + CHUNK_SIZE / 2;
          const halfBlock = CHUNK_SIZE / 2 - 1;
          const cdx = car.x - blockCX, cdz = car.z - blockCZ;
          if (Math.abs(cdx) < halfBlock && Math.abs(cdz) < halfBlock) {
            const overlapX = halfBlock - Math.abs(cdx);
            const overlapZ = halfBlock - Math.abs(cdz);
            if (overlapX < overlapZ) car.x += cdx > 0 ? overlapX : -overlapX;
            else car.z += cdz > 0 ? overlapZ : -overlapZ;
          }
          continue;
        }

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

    const HOME_CHUNK_MIN_X = 1 * CHUNK_SIZE;
    const HOME_CHUNK_MAX_X = 1 * CHUNK_SIZE + CHUNK_SIZE;
    const HOME_CHUNK_MIN_Z = 0 * CHUNK_SIZE;
    const HOME_CHUNK_MAX_Z = 0 * CHUNK_SIZE + CHUNK_SIZE;
    const filteredNodes = sidewalkNodes.filter(
      n => n.x < HOME_CHUNK_MIN_X || n.x >= HOME_CHUNK_MAX_X || n.z < HOME_CHUNK_MIN_Z || n.z >= HOME_CHUNK_MAX_Z
    );

    if (this.pedSpawnTimer > 0.5 && this.localPedestrians.length < 50 && filteredNodes.length > 0) {
      this.pedSpawnTimer = 0;
      const srcNode = filteredNodes[Math.floor(Math.random() * filteredNodes.length)];
      const dstNode = filteredNodes[Math.floor(Math.random() * filteredNodes.length)];
      // NEW: ~15% of spawned peds are hookers (type='hooker',
      // gender='hooker'). Hookers use the dedicated hookerMesh and can
      // be picked up as passengers via E.
      const isHooker = Math.random() < 0.15;
      const gender = isHooker ? 'hooker' : (Math.random() < 0.5 ? 'male' : 'female');
      const type = isHooker ? 'hooker' : undefined;
      const pedId = --this.pedIdCounter;
      this.localPedestrians.push({
        id: pedId,
        x: srcNode.x,
        z: srcNode.z,
        yaw: Math.atan2(dstNode.x - srcNode.x, dstNode.z - srcNode.z),
        gender,
        type,
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

    if (this.isPassenger) {
      // NEW: Passenger follows the host's car — no movement input.
      this.updatePassengerFollow();
    } else if (this.isInCar && this.vehicleType === 'plane') this.updatePlane(dt);
    else if (this.isInCar && this.vehicleType === 'motorcycle') this.updateMotorcycle(dt);
    else if (this.isInCar) this.updateCar(dt);
    else this.updateWalking(dt);

    this.updateCamera(dt);
    this.updateScore(dt);
    this.updateProjectiles(dt);
    this.updateRemoteShooting(dt);
    this.updateCopShooting();
    this.updatePassenger(dt);
    this.updateVendingMachines();
    this.checkNearCar();
    this.checkNearVendingMachine();
    // NEW: Show the 'Press E to pick up' prompt when a hooker is in range.
    this.showPassengerPrompt = this.canPickupPassenger();
    // NEW: Update steal-car / enter-passenger prompts based on which side
    // of another player's car the local player is standing on.
    this.checkNearOtherPlayerCar();
    this.updateVehicleCollisions();
    this.updateExplosionJumps(dt);
    this.updateGarage(dt);
    this.findLookTarget();
    this.updateTraffic(dt);
    this.updatePedestrians(dt);
    this.updateNPCInterpolation();
    this.updatePoliceSiren();
    this.updateTaxiMission(dt);

    // FIX: Include trafficCars in the car-death explosion check so they
    // explode when destroyed (not just serverNPCs and parkedCars).
    for (const v of [...this.serverNPCs, ...this.parkedCars, ...this.trafficCars]) {
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

    // Player car fire system
    if (this.isInCar && this.carHealth > 0 && this.carHealth <= 80) {
      if (!this._carOnFire) {
        this._carOnFire = true;
        this._carFireStarted = performance.now() / 1000;
      }
      const fireElapsed = (performance.now() / 1000) - this._carFireStarted;
      if (fireElapsed >= 4.0) {
        this.carHealth = 0;
      }
    } else if (this.isInCar && this.carHealth > 80) {
      this._carOnFire = false;
      this._carFireStarted = 0;
    }

    if (this.isInCar && this.carHealth <= 0) {
      this.spawnExplosion(this.carX, 0.5, this.carZ);
      this.exitCar();
      this.carHealth = 400;
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
          this.carHealth = 400;
          this.wantedLevel = 0;
          if (this.isInCar) this.exitCar();
          // NEW: Reset passenger state on respawn
          if (this.isPassenger) this.exitPassenger();
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

    // NEW: Apply car-rocking offset (hooker service) to the render Y.
    const rockOffset = this.getCarRockOffset();

    // Weapon pickup collision
    if (this.pickupCooldown > 0) this.pickupCooldown -= dt;
    if (this.pickupCooldown <= 0 && this.droppedWeapons) {
      for (const dw of this.droppedWeapons) {
        const dx = this.carX - dw.posX;
        const dz = this.carZ - dw.posZ;
        if (dx * dx + dz * dz < 2.0) {
          this.pickupCooldown = 0.5;
          this.gtService.pickup(this.getUserId(), dw.id).then(r => {
            if (r && r.ok) {
              this.ownedWeapons[r.weaponType] = true;
              this.ammo[r.weaponType] = r.ammo;
              this.currentWeapon = r.weaponType;
              this.droppedWeapons = this.droppedWeapons.filter(x => x.id !== dw.id);
            }
          });
          break;
        }
      }
    }
    // Sync dropped weapons to renderer for drawing
    this.renderer.droppedWeapons = this.droppedWeapons;

    // FIX: Sync garage state to the renderer so it draws the door + car.
    this.renderer.garageDoorOpenness = this.garageDoorOpenness;
    this.renderer.garageCarMesh = this.garageCarMesh;
    // Activate arm bone override when pistol is equipped
    this.renderer.armOverrideActive = (this.currentWeapon === 1) && !this.firstPerson;
    // Feed walk animation state to renderer
    this.renderer.walkSpeed = this.isInCar ? 0 : this.carSpeed;
    this.renderer.punchTime = this.punchTimer;
    if (this.punchTimer > 0) this.punchTimer = Math.max(0, this.punchTimer - dt);

    try {
      // CRITICAL: renderer has its own droppedWeapons field. If we don't copy
      // the server's list into it every frame, render() has nothing to draw.
      this.renderer.droppedWeapons = this.droppedWeapons || [];
      // Uncomment the next line once to verify the array is populated:
      console.log('[PICKUPS]', this.droppedWeapons.length, this.droppedWeapons);
      this.renderer.render(
        camX, camY, camZ, this.camYaw, this.camPitch, aspect,
        targetX, this.carY - CAR_HEIGHT + rockOffset, targetZ, this.carYaw,
        allNPCs, this.otherPlayers, allPeds, this.parkedCars,
        this.tracers, this.muzzleFlashes, this.rockets, this.explosions, this.bloodSplats,
        this.bloodPools,
        this.moneyStacks,
        this.deadBodies,
        this.vendingMachines,
        renderMesh,
        this.taxiMarkers,
        // NEW: Assemble driver + passenger + taxi-attached meshes. The
        // renderer iterates these and draws each at targetX/Y/Z + a
        // yaw-rotated offset (renderer lines ~1735-1747), so the passenger
        // rides along in the front seat for free.
        (() => {
          const attached: any[] = [];
          if (this.driverInCarMesh) attached.push(this.driverInCarMesh);
          if (this.passenger) {
            attached.push({
              mesh: this.passenger.mesh,
              offsetX: this.passenger.offsetX,
              offsetY: this.passenger.offsetY,
              offsetZ: this.passenger.offsetZ,
              yaw: this.passenger.yaw,
              scale: this.passenger.scale,
            });
          }
        
          attached.push(...this.taxiAttachedMeshes);
          return attached;
        })(),
        this._carOnFire,
        this.trafficNodes,
        this.viewDistance
      );
      // First-person weapon overlay
      if (this.firstPerson && !this.isInCar) {
        const anims = this.pickFirstPersonAnims();
        this.renderer.renderFirstPersonWeapon(
          camX, camY, camZ,
          this.camYaw, this.camPitch,
          this.currentWeapon,
          anims.arms,
          anims.mark23,
          dt
        );
        if (this._pistolDrawTimer > 0) this._pistolDrawTimer = Math.max(0, this._pistolDrawTimer - dt);
      }
    } catch (e) {
      console.error('render error', e);
    }

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

    // Keyboard
    if (this.keys.has('KeyW')) accelForce = 25;
    if (this.keys.has('KeyS')) {
      if (this.carSpeed > 1) { accelForce = -45; } // Braking
      else { isReversing = true; accelForce = -15; } // Reverse
    }

    let steer = 0;
    if (this.keys.has('KeyA')) steer = 1;
    if (this.keys.has('KeyD')) steer = -1;

    // Mobile joystick: Y axis (forward/back) = accelerate/brake,
    // X axis (left/right) = steer.joystickY > 0 = push up = forward.
    if (this.isMobile && this.joystickActive) {
      if (this.joystickY > 0.1) accelForce = 25 * this.joystickY;
      else if (this.joystickY < -0.1) {
        if (this.carSpeed > 1) { accelForce = -45 * (-this.joystickY); }
        else { isReversing = true; accelForce = -15 * (-this.joystickY); }
      }
      steer += -this.joystickX; // joystickX > 0 = right = steer right (-1)
    }

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

    // Keyboard
    if (this.keys.has('KeyW')) accelForce = 35;
    if (this.keys.has('KeyS')) {
      if (this.carSpeed > 1) accelForce = -50;
      else { isReversing = true; accelForce = -10; }
    }

    let steer = 0;
    if (this.keys.has('KeyA')) steer = 1;
    if (this.keys.has('KeyD')) steer = -1;

    // Mobile joystick
    if (this.isMobile && this.joystickActive) {
      if (this.joystickY > 0.1) accelForce = 35 * this.joystickY;
      else if (this.joystickY < -0.1) {
        if (this.carSpeed > 1) { accelForce = -50 * (-this.joystickY); }
        else { isReversing = true; accelForce = -10 * (-this.joystickY); }
      }
      steer += -this.joystickX;
    }

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

    // Keyboard
    if (this.keys.has('KeyW')) this.carSpeed = Math.min(this.carSpeed + accel * dt, maxSpeed);
    if (this.keys.has('KeyS')) this.carSpeed = Math.max(this.carSpeed - accel * dt, 0);
    if (this.keys.has('KeyA')) this.carYaw += turnSpeed * dt;
    if (this.keys.has('KeyD')) this.carYaw -= turnSpeed * dt;

    // Mobile joystick: Y = throttle, X = yaw
    if (this.isMobile && this.joystickActive) {
      if (this.joystickY > 0.1) this.carSpeed = Math.min(this.carSpeed + accel * this.joystickY * dt, maxSpeed);
      else if (this.joystickY < -0.1) this.carSpeed = Math.max(this.carSpeed + accel * this.joystickY * dt, 0);
      this.carYaw += -this.joystickX * turnSpeed * dt;
    }

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

    // FIX: Skip building collision at the home base chunk (1, 0) when
    // near the garage. This allows the player to drive into the garage.
    // The home base building is replaced by the japaneseShop model, and
    // the garage entrance is on the south side. We disable collision for
    // the entire chunk when the player is within the garage detection
    // radius so they can drive in and out smoothly.
    const garageDx = this.carX - GARAGE_ENTRANCE_X;
    const garageDz = this.carZ - GARAGE_ENTRANCE_Z;
    const nearGarage = (garageDx * garageDx + garageDz * garageDz) < (GARAGE_DETECT_RADIUS * GARAGE_DETECT_RADIUS);

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunkCX = cx + dx;
        const chunkCZ = cz + dz;
        // Skip the home base chunk when near the garage
        if (nearGarage && chunkCX === 1 && chunkCZ === 0) continue;
        this.renderer.getCityChunk(chunkCX, chunkCZ);
        this.checkBuildingsInChunk(chunkCX, chunkCZ, margin);
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
    const speed = Math.abs(this.carSpeed);
    const collisionDamage = speed < 2 ? 1 : speed * 3;

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
        // Play rocket sound for remote player's rocket shot
        this.playWeaponSound(3);
      } else {
        const rdirX = Math.sin(p.camYaw) * Math.cos(p.camPitch);
        const rdirY = -Math.sin(p.camPitch);
        const rdirZ = Math.cos(p.camYaw) * Math.cos(p.camPitch);
        this.tracers.push({ originX: p.posX, originY: p.posY + 0.5, originZ: p.posZ, dirX: rdirX, dirY: rdirY, dirZ: rdirZ, age: 0, lifetime: 0.3 });
        // Spawn a muzzle flash for the remote shooter too — previously
        // missing, so other players appeared to shoot with no flash.
        this.muzzleFlashes.push({ x: p.posX, y: p.posY + 1.0, z: p.posZ, dirX: rdirX, dirY: rdirY, dirZ: rdirZ, weapon: p.weapon, age: 0, lifetime: 0.08 });
        // Play the appropriate sound based on the remote player's weapon.
        // Weapon 0 = Pistol, 1 = Rifle (uzi), 2 = Shotgun, 3 = Rocket (handled above).
        this.playWeaponSound(p.weapon);
      }
    }
  }

  /**
   * NEW: Per-frame check for cop shooting. The server sets isShootingAt
   * on cop NPCs when they fire at the player. We spawn a tracer from the
   * cop toward the local player and play a pistol sound. This runs every
   * frame so we catch every shot, not just when the player takes damage.
   */
  private updateCopShooting() {
    const checkNPC = (npc: any) => {
      if (npc.type !== 'cop' && npc.type !== 'police') return;
      if (!npc.isShootingAt) return;
      const dx = this.carX - npc.x;
      const dz = this.carZ - npc.z;
      const targetY = this.carY + 1.0;
      const dy = targetY - 1.2;
      const d3 = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d3 > 0.01) {
        this.tracers.push({
          originX: npc.x, originY: 1.2, originZ: npc.z,
          dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3,
          age: 0, lifetime: 0.1
        });
        this.muzzleFlashes.push({
          x: npc.x, y: 1.2, z: npc.z,
          dirX: dx / d3, dirY: dy / d3, dirZ: dz / d3,
          weapon: 0, age: 0, lifetime: 0.08
        });
      }
      this.playWeaponSound(0);
      npc.isShootingAt = false;
    };
    for (const npc of this.serverNPCs) checkNPC(npc);
    for (const ped of this.serverPedestrians) checkNPC(ped);
  }

  /**
   * Plays the police siren loop when any police NPC is near the player
   * and the wanted level is > 0. Volume attenuates with distance.
   */
  private updatePoliceSiren() {
    const siren = this.policeSirenSound;
    if (!siren) return;
    if (this.wantedLevel < 1) {
      if (!siren.paused) { siren.pause(); siren.currentTime = 0; }
      return;
    }
    let closestDistSq = Infinity;
    for (const npc of this.serverNPCs) {
      if (npc.type !== 'police') continue;
      const dx = npc.x - this.carX, dz = npc.z - this.carZ;
      const dSq = dx * dx + dz * dz;
      if (dSq < closestDistSq) closestDistSq = dSq;
    }
    for (const pc of this.parkedCars) {
      if (pc.type !== 'police') continue;
      const dx = pc.x - this.carX, dz = pc.z - this.carZ;
      const dSq = dx * dx + dz * dz;
      if (dSq < closestDistSq) closestDistSq = dSq;
    }
    const MAX_SIREN_DIST = 200;
    const dist = Math.sqrt(closestDistSq);
    const vol = Math.max(0, Math.min(1, 1 - dist / MAX_SIREN_DIST));
    if (vol > 0.01) {
      if (siren.paused) { siren.volume = 0; siren.play().catch(() => { }); }
      siren.volume = vol * 0.5;
    } else {
      if (!siren.paused) { siren.pause(); siren.currentTime = 0; }
    }
  }
  private pickFirstPersonAnims(): { arms: string; mark23: string | null } {
    if (this.currentWeapon === 1) {
      // Pistol
      if (this.isShooting) return { arms: 'finger_gun_fire', mark23: 'Shoot' };
      if (this._reloading) return { arms: 'finger_gun_fix', mark23: 'Reload' };
      // When you just switched to the pistol, play Draw once, then Hide after unequip.
      // Simple heuristic: use 'Draw' for the first 0.5s after switching, else 'Hide' pose.
      if (this._pistolDrawTimer > 0) return { arms: 'finger_gun_idle', mark23: 'Draw' };
      return { arms: 'finger_gun_idle', mark23: 'Hide' };
    }
    // Unarmed
    if (this.punchTimer > 0) return { arms: 'jab.R', mark23: null };
    return { arms: 'relax', mark23: null };
  }
  /**
   * NEW: Hooker "services" logic. If the player is in a car with a
   * hooker passenger and no other NPCs/pedestrians/players are nearby
   * (secluded area), the car starts rocking, the player's health
   * regenerates slowly, and their money drains (capped at $80 total
   * per session). The rocking is applied as a Y-offset oscillation
   * on carY, read by the renderer via the carRocking flag.
   */
  private updatePassenger(dt: number) {
    // Reset rocking state by default
    this.carRocking = false;

    if (!this.isInCar || !this.passenger) {
      this.carRockPhase = 0;
      // Reset the money-drained counter when the passenger leaves so
      // a new session can drain up to $80 again.
      if (!this.passenger) this.hookerMoneyDrained = 0;
      return;
    }

    // The car must be stopped (or nearly stopped) for the service to occur.
    if (Math.abs(this.carSpeed) > 1) {
      this.carRockPhase = 0;
      return;
    }

    // Check if the area is secluded: no NPCs, pedestrians, parked cars,
    // or other players within HOOKER_SECLUDED_RADIUS.
    const r = HOOKER_SECLUDED_RADIUS;
    const rSq = r * r;
    const isNear = (x: number, z: number) => {
      const dx = x - this.carX, dz = z - this.carZ;
      return dx * dx + dz * dz < rSq;
    };
    const hasNearbyNPCs =
      this.serverNPCs.some(n => isNear(n.x, n.z)) ||
      this.serverPedestrians.some(p => isNear(p.x, p.z)) ||
      this.localPedestrians.some(p => isNear(p.x, p.z)) ||
      this.parkedCars.some(c => isNear(c.x, c.z)) ||
      this.trafficCars.some(c => isNear(c.x, c.z)) ||
      this.otherPlayers.some(p => isNear(p.posX, p.posZ));

    if (hasNearbyNPCs) {
      this.carRockPhase = 0;
      return;
    }

    // Secluded + stopped + has hooker passenger → start rocking
    this.carRocking = true;
    this.carRockPhase += dt * 3; // rocking speed (3 rad/s ≈ ~2 rocks/sec)

    // Regenerate health (cap at 100)
    if (this.health < 100) {
      this.health = Math.min(100, this.health + HOOKER_HEAL_PER_SEC * dt);
    }

    // Drain money (cap at HOOKER_MAX_MONEY total per session)
    if (this.hookerMoneyDrained < HOOKER_MAX_MONEY && this.money > 0) {
      const drain = Math.min(
        HOOKER_MONEY_PER_SEC * dt,
        HOOKER_MAX_MONEY - this.hookerMoneyDrained,
        this.money // can't go below 0
      );
      this.money -= Math.floor(drain);
      this.hookerMoneyDrained += drain;
    }
  }

  /**
   * NEW: Returns the car-rocking Y-offset for the current frame.
   * Called by the renderer (or inline in the render call) to apply
   * a vertical bounce to the car while the hooker service is active.
   * Returns 0 when not rocking.
   */
  getCarRockOffset(): number {
    if (!this.carRocking) return 0;
    return Math.sin(this.carRockPhase) * 0.08; // ±8cm bounce
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
            offsetY: -0.3,
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
          this.stolenNpcIds.add(pedId);
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
          this.stolenNpcIds.add(pedId);
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


  get leaderboardData(): { userId: number; money: number; health: number; carSpeed: number }[] {
    const all = [...this.otherPlayers];
    const selfUser = (this.parentRef as any)?.user;
    if (selfUser) {
      all.push({
        userId: selfUser.id ?? 0,
        posX: 0, posY: 0, posZ: 0,
        yaw: 0, carSpeed: this.carSpeed, health: this.health, weapon: this.currentWeapon,
        money: this.money,
        username: selfUser.username ?? 'You',
        mesh: [] as any, isShooting: false, camYaw: 0, camPitch: 0, remoteShootTimer: 0,
        isInCar: this.isInCar
      });
    }
    return all
      .sort((a, b) => b.money - a.money)
      .map(p => ({
        userId: p.userId,
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

    // FIX: Draw home base (japaneseShop) as a special marker — a purple
    // diamond with "H" label so players can find their way back.
    {
      const hbx = cx + (HOME_BASE_X - this.carX) * scale;
      const hby = cy + (HOME_BASE_Z - this.carZ) * scale;
      // Pulsing glow
      const pulse = 8 + Math.sin(performance.now() / 400) * 2;
      ctx.fillStyle = 'rgba(180, 100, 255, 0.3)';
      ctx.beginPath(); ctx.arc(hbx, hby, pulse, 0, Math.PI * 2); ctx.fill();
      // Diamond marker
      ctx.fillStyle = '#b464ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hbx, hby - 6);
      ctx.lineTo(hbx + 6, hby);
      ctx.lineTo(hbx, hby + 6);
      ctx.lineTo(hbx - 6, hby);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', hbx, hby);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

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

  trackByLeaderboard(index: number, item: { userId: number }): number {
    return item.userId;
  }

  openMenuPanel() {
    this.showMenuPanel = true;
  }

  closeMenuPanel() {
    this.showMenuPanel = false;
  }

  setViewDistance(dist: number) {
    this.viewDistance = dist;
  }
}