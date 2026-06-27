import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { ChildComponent } from '../child.component';
import { GrandTheftRenderer, CityMesh, getBiome, getTerrainHeight } from './grandtheft-renderer';
import { GrandtheftService } from '../../services/grandtheft.service';
import { UserEventService } from '../../services/user-event.service';
import { User } from '../../services/datacontracts/user/user';
import { TodoService } from '../../services/todo.service';
import { FileService } from '../../services/file.service';

const CHUNK_SIZE = 80;
const CAR_HEIGHT = 0.4;

const WEAPON_NAMES = ['Unarmed', 'Pistol', 'Rifle', 'Shotgun', 'Rocket Launcher'];
const WEAPON_COOLDOWNS = [400, 300, 150, 800, 1500];

const HOSPITAL_X = 40;
const HOSPITAL_Z = 40;
const HOSPITAL_SPAWN_X = HOSPITAL_X;
const HOSPITAL_SPAWN_Z = HOSPITAL_Z + 22;
const HOSPITAL_SPAWN_YAW = Math.PI;
const HOME_BASE_X = 120;
const HOME_BASE_Z = 40;
const HOME_BASE_YAW = 0;
const GARAGE_ENTRANCE_X = 120;
const GARAGE_ENTRANCE_Z = 52;
const GARAGE_INTERIOR_X = 120;
const GARAGE_INTERIOR_Z = 42;
const GARAGE_DETECT_RADIUS = 18;
const GARAGE_DOOR_OPEN_SPEED = 3;

const VENDING_MACHINE_INTERVAL = 10;
const VENDING_MACHINE_HEAL_DIST = 4;
const VENDING_MACHINE_OFFSET = 12;
const WEAPON_DAMAGES = [10, 15, 25, 45, 100];
const PLAYER_POLL_FAST_MS = 200;
const PLAYER_POLL_SLOW_MS = 1000;
const ENTER_CAR_DIST = 4;
const HOOKER_SECLUDED_RADIUS = 50;
const HOOKER_HEAL_PER_SEC = 5;
const HOOKER_MONEY_PER_SEC = 1;
const HOOKER_MAX_MONEY = 80;

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
  fireStarted?: number;
  carFireX?: number; carFireZ?: number; carFireYaw?: number;
  submerged?: boolean;
  submergeStart?: number;
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
  isInCar: boolean;
  vehicleType?: string;
  carColorR?: number;
  carColorG?: number;
  carColorB?: number;
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
  carPitch = 0;
  carRoll = 0;

  carHealth = 400;
  isInCar = false;
  vehicleType: 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' | 'taxi' | 'boat' | 'helicopter' = 'car';
  isPassenger = false;
  passengerOfUserId = 0;
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
  serverNPCs: { id: number; x: number; y: number; z: number; yaw: number; type: string; mesh: CityMesh | CityMesh[]; health: number; colorR: number; colorG: number; colorB: number; remoteShootTimer?: number; prevX: number; prevZ: number; prevYaw: number; targetX: number; targetZ: number; targetYaw: number; speed: number; lastUpdate: number; gender?: string; hasDriver?: boolean; passengerCount?: number; isShootingAt?: boolean; isBurning?: boolean }[] = [];
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
  airportLotCars: { x: number; z: number; yaw: number; mesh: CityMesh | CityMesh[]; phase: number; dir: number; speed: number; p0: { x: number; z: number }; p1: { x: number; z: number } }[] = [];
  hudSpeed = 0;
  score = 0;
  private scoreTimer = 0;
  money = 1000;
  moneyStacks: { x: number; z: number; amount: number; yaw: number; age: number; lifetime: number }[] = [];
  private _wasDead = false;
  _carOnFire = false;
  _carFireStarted = 0;
  _carFireX = 0;
  _carFireZ = 0;
  _carFireYaw = 0;
  _carSubmerged = false;
  _carSubmergeStart = 0;
  private _respawnTimer: any = null;
  isLoaded = false;
  loadingAssets = 0;
  totalAssets = 0;
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
  private _hudUpdateTimer = 0;
  taxiMission: { state: 'pickup' | 'deliver'; passengerId: number; passengerGender: string; passengerMesh: CityMesh | CityMesh[]; passengerX: number; passengerZ: number; destinationX: number; destinationZ: number; fare: number; phase: number; timer: number } | null = null;
  private taxiSearchTimer = 0;
  taxiMarkers: { type: 'hail' | 'destination' | 'beam'; x: number; z: number; phase?: number }[] = [];
  taxiMode = false;
  taxiSearchCountdown = 0;
  taxiAttachedMeshes: { mesh: CityMesh | CityMesh[]; offsetX: number; offsetY: number; offsetZ: number; yaw: number; scale?: number }[] = [];
  private driverInCarMesh: { mesh: CityMesh | CityMesh[]; offsetX: number; offsetY: number; offsetZ: number; yaw: number; scale?: number } | null = null;

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
  showStealCarPrompt = false;
  showEnterPassengerPrompt = false;

  isChatOpen = false;
  chatInput = '';
  pendingChatMessage = '';
  chatMessages: { userId: number; username: string; message: string; timestamp: string }[] = [];
  private knownChatTimestamps: Set<string> = new Set();
  private carRockPhase = 0;
  private hookerMoneyDrained = 0;
  carRocking = false;
  garageDoorOpenness = 0;
  garageCar: { vehicleType: string; colorR: number; colorG: number; colorB: number; yaw: number } | null = null;
  private garageCarMesh: CityMesh | CityMesh[] | null = null;
  private garagePollTimer = 0;
  private wasInGarage = false;
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
  private uziSound: HTMLAudioElement | null = null;
  private rocketSound: HTMLAudioElement | null = null;
  private policeSirenSound: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private _pollTimer: any = null;
  private _destroyed = false;
  private autoFireTimer: any = null;
  weaponNames = WEAPON_NAMES;
  isMobile = false;
  damageAlpha = 0;
  vehicleName = '';
  vehicleBannerTimer = 0;
  radioOn = false;
  radioSongs: string[] = [];
  altUpPressed = false;
  altDownPressed = false;
  radioIndex = -1;
  radioSongTitle = '';
  private ytPlayer: any = null;
  private ytApiReady: Promise<void> | null = null;
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
  constructor(private gtService: GrandtheftService,
    private userEventService: UserEventService,
    private todoService: TodoService,
    private fileService: FileService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef) { super(); }

  ngOnInit() {
    this.userEventService.insertUserEvent(this.parentRef?.user?.id ?? 0, "grandtheft", "Started playing Grand Theft!");
  }

  ngAfterViewInit() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.renderer = new GrandTheftRenderer(canvas);

    // ── Build asset task list ──
    interface AssetTask { load: () => Promise<any>; }
    const tasks: AssetTask[] = [];

    tasks.push({ load: () => this.renderer.initPlayerModel('assets/grandtheft/franklin/scene.gltf', false).then(() => { }) });
    tasks.push({ load: () => this.renderer.loadGLTF('assets/grandtheft/citylight/scene.gltf').then(lamps => { if (lamps) this.renderer.lampMesh = lamps; }) });
    tasks.push({ load: () => this.renderer.loadGLTF('assets/grandtheft/skybox_skydays_3/scene.gltf', false).then(m => { if (m) this.renderer.skyboxMesh = m; }) });

    for (const cfg of [
      { path: 'assets/grandtheft/jillValentine/scene.gltf', needsFlip: false },
      { path: 'assets/grandtheft/jessica_jones/scene.gltf' },
      { path: 'assets/grandtheft/redneck/scene.gltf', needsFlip: false },
    ]) {
      tasks.push({ load: () => this.renderer.loadGLTF(cfg.path, false).then(npc => { if (npc) { if (cfg.needsFlip === false) for (const m of npc) m.needsFlip = false; this.renderer.npcMeshes.push(npc); } }) });
    }

    for (let ci = 1; ci <= 29; ci++) {
      if (ci === 27) continue;
      const ciStr = ci.toString();
      tasks.push({ load: () => this.renderer.loadGLTF(`assets/grandtheft/char${ciStr}/scene.gltf`, false).then(npc => { if (npc) this.renderer.npcMeshes.push(npc); }) });
    }

    const specialMeshes: { path: string; storeSkeleton: boolean; assign: (m: CityMesh[]) => void; scale?: number }[] = [
      { path: 'assets/grandtheft/star_wars_luxury_yacht/scene.gltf', storeSkeleton: false, assign: m => this.renderer.boatMeshes.push(m) },
      { path: 'assets/grandtheft/ultra-futuristic_luxury_yacht/scene.gltf', storeSkeleton: false, assign: m => this.renderer.boatMeshes.push(m) },
      { path: 'assets/grandtheft/bell_uh-1_iroquois_huey/scene.gltf', storeSkeleton: false, assign: m => this.renderer.helicopterMeshes.push(m) },
      { path: 'assets/grandtheft/bell_222_x/scene.gltf', storeSkeleton: false, assign: m => this.renderer.helicopterMeshes.push(m) },
      { path: 'assets/grandtheft/bell_ch-146_griffon/scene.gltf', storeSkeleton: false, assign: m => this.renderer.helicopterMeshes.push(m) },
      { path: 'assets/grandtheft/bell_206_jet_ranger/scene.gltf', storeSkeleton: false, assign: m => this.renderer.helicopterMeshes.push(m) },
      { path: 'assets/grandtheft/cirrus_sr_22/scene.gltf', storeSkeleton: false, assign: m => this.renderer.planeMeshes.push(m) },
      { path: 'assets/grandtheft/low_poly_11_ea18g_growler/scene.gltf', storeSkeleton: false, assign: m => this.renderer.planeMeshes.push(m) },
      { path: 'assets/grandtheft/low_poly_11_usaf_f22a_raptor/scene.gltf', storeSkeleton: false, assign: m => this.renderer.planeMeshes.push(m) },
      { path: 'assets/grandtheft/pizzaMoped/scene.gltf', storeSkeleton: false, assign: m => this.renderer.motorcycleMeshes.push(m) },
      { path: 'assets/grandtheft/crownVic/scene.gltf', storeSkeleton: false, assign: m => this.renderer.policeCarMesh = m },
      { path: 'assets/grandtheft/taxi/scene.gltf', storeSkeleton: false, assign: m => this.renderer.taxiMesh = m },
      { path: 'assets/grandtheft/hospital/scene.gltf', storeSkeleton: false, assign: m => this.renderer.hospitalMesh = m },
      { path: 'assets/grandtheft/japaneseShop/scene.gltf', storeSkeleton: false, assign: m => this.renderer.homeBaseMesh = m },
      { path: 'assets/grandtheft/vendingMachine/scene.gltf', storeSkeleton: false, assign: m => this.renderer.vendingMachineMesh = m },
      { path: 'assets/grandtheft/hooker/scene.gltf', storeSkeleton: false, assign: m => { for (const x of m) x.needsFlip = false; this.renderer.hookerMesh = m; } },
      { path: 'assets/grandtheft/rocket/scene.gltf', storeSkeleton: false, assign: m => this.renderer.rocketMesh = m },
      { path: 'assets/grandtheft/colt/scene.gltf', storeSkeleton: false, assign: m => this.renderer.coltMesh = m },
      { path: 'assets/grandtheft/money/scene.gltf', storeSkeleton: false, assign: m => this.renderer.moneyMesh = m },
      { path: 'assets/grandtheft/rocket_launcher/scene.gltf', storeSkeleton: false, assign: m => this.renderer.rocketLauncherMesh = m },
      { path: 'assets/grandtheft/m4a1_rifle/scene.gltf', storeSkeleton: false, assign: m => this.renderer.m4a1Mesh = m },
      { path: 'assets/grandtheft/shotgun/scene.gltf', storeSkeleton: false, assign: m => this.renderer.shotgunMesh = m },
      { path: 'assets/grandtheft/trafficLight/scene.gltf', storeSkeleton: false, assign: m => this.renderer.trafficLightMesh = m },
      { path: 'assets/grandtheft/wooden_bench/scene.gltf', storeSkeleton: false, assign: m => this.renderer.benchMeshes.push(m) },
      { path: 'assets/grandtheft/sm_prop_barrel_02__1__polygonbattleroyale_01_a_0/scene.gltf', storeSkeleton: false, assign: m => this.renderer.barrelMesh = m },
      { path: 'assets/grandtheft/chicken/scene.gltf', storeSkeleton: false, assign: m => this.renderer.chickenMesh = m },
      { path: 'assets/grandtheft/sm_env_tree_big_02__3__polygonmilitary_mat_01_a/scene.gltf', storeSkeleton: false, assign: m => this.renderer.palmTreeMesh = m },
      { path: 'assets/grandtheft/psx_tree_low_poly_no_black_background/scene.gltf', storeSkeleton: false, assign: m => this.renderer.cityTreeMesh = m, scale: 1.5 },
      { path: 'assets/grandtheft/cylindrical_tower/scene.gltf', storeSkeleton: false, assign: m => this.renderer.cylindricalTowerMesh = m, scale: 1.5 },
      { path: 'assets/grandtheft/airport_hangar/scene.gltf', storeSkeleton: false, assign: m => this.renderer.airportHangarMesh = m, scale: 1.5 },
      { path: 'assets/grandtheft/fatboys_diner/scene.gltf', storeSkeleton: false, assign: m => this.renderer.ruralShopMesh = m, scale: 1.2 },
      { path: 'assets/grandtheft/balloon/scene.gltf', storeSkeleton: false, assign: m => this.renderer.balloonMesh = m },
      { path: 'assets/grandtheft/tatami_room/scene.gltf', storeSkeleton: false, assign: (m => this.renderer.tatamiRoomMesh = m), scale: 2 },
      { path: 'assets/grandtheft/low_poly_wooden_cabine/scene.gltf', storeSkeleton: false, assign: m => this.renderer.woodenCabineMesh = m, scale: 1.5 },
    ];
    for (const cfg of specialMeshes) {
      const sc = cfg.scale;
      tasks.push({ load: () => this.renderer.loadGLTF(cfg.path, cfg.storeSkeleton).then(mesh => { if (mesh) { cfg.assign(mesh); if (sc) for (const m of mesh) m.renderScale = sc; } }) });
    }

    const carConfigs = [
      { path: 'assets/grandtheft/lambo/scene.gltf' },
      { path: 'assets/grandtheft/2024_lamborghini_countach_lp5000_qv_lbworks/scene.gltf' },
      { path: 'assets/grandtheft/1993_mazda_rx-7/scene.gltf' },
      { path: 'assets/grandtheft/mitsubishi/scene.gltf' },
      { path: 'assets/grandtheft/hilux/scene.gltf' },
      { path: 'assets/grandtheft/suv/scene.gltf' },
      { path: 'assets/grandtheft/psxlow_poly_pickup/scene.gltf', yawOffset: -Math.PI / 2 },
      { path: 'assets/grandtheft/vehicle_-_subaru_brz_rocket_bunny/scene.gltf' },
      { path: 'assets/grandtheft/1970_dodge_challenger_rt_lp/scene.gltf' },
      { path: 'assets/grandtheft/kenworth_t2000/scene.gltf', scale: 3 },
      { path: 'assets/grandtheft/truck_toyota_corsa_b/scene.gltf', scale: 2 },
      { path: 'assets/grandtheft/freightliner_century/scene.gltf', scale: 2 },
      { path: 'assets/grandtheft/monsterTruck/scene.gltf', scale: 2.25 },
      { path: 'assets/grandtheft/jeep/scene.gltf', scale: 1.5 },
    ];
    for (const cfg of carConfigs) {
      const sc = cfg.scale;
      const yo = cfg.yawOffset;
      tasks.push({ load: () => this.renderer.loadGLTF(cfg.path).then(car => { if (!car) return; if (sc) for (const m of car) m.renderScale = sc; if (yo) for (const m of car) m.yawOffset = yo; this.renderer.carMeshes.push(car); }) });
    }

    const armsOut: { animations?: any; skeleton?: any } = {};
    tasks.push({ load: () => this.renderer.loadGLTF('assets/grandtheft/first_person_arms/scene.gltf', true, armsOut).then(arms => { if (arms) { this.renderer.firstPersonArmsMesh = arms; this.renderer.firstPersonArmsSkeleton = armsOut.skeleton ?? null; this.renderer.firstPersonArmsAnimations = armsOut.animations ?? null; } }) });
    const m23Out: { animations?: any; skeleton?: any } = {};
    tasks.push({ load: () => this.renderer.loadGLTF('assets/grandtheft/first_person_mark23/scene.gltf', false, m23Out).then(m => { if (m) { this.renderer.mark23Mesh = m; this.renderer.mark23Skeleton = m23Out.skeleton ?? null; this.renderer.mark23Animations = m23Out.animations ?? null; } }) });

    // Building assets — tracked separately for cache clearing
    const buildingTasks: AssetTask[] = [];
    for (const name of GrandTheftRenderer.AIRPORT_BUILDING_NAMES) {
      buildingTasks.push({ load: () => this.renderer.loadGLTF(`assets/grandtheft/airport_buildings/${name}/scene.gltf`, false).then(m => { if (m) this.renderer.airportBuildingMeshes.push(m); }) });
    }
    for (const name of GrandTheftRenderer.CITY_BUILDING_NAMES) {
      buildingTasks.push({
        load: () => this.renderer.loadGLTF(`assets/grandtheft/${name}/scene.gltf`, false).then(m => {
          if (m) {
            if (name === 'buildingRandom') {
              for (const mm of m) { mm.renderScale = 0.75; }
            }
            else if (name === "okraglak_round_office_building_poznan") {
              for (const mm of m) { mm.renderScale = 3; }
            }
            else if (name === 'abandoned_building_gameready') {
              for (const mm of m) { mm.renderScale = 5; }
            }
            this.renderer.cityBuildingMeshes.push(m);
          }
        })
      });
    }
    for (const name of GrandTheftRenderer.SUBURB_BUILDING_NAMES) {
      buildingTasks.push({ load: () => this.renderer.loadGLTF(`assets/grandtheft/${name}/scene.gltf`, false).then(m => { if (m) this.renderer.suburbBuildingMeshes.push(m); }) });
    }
    const allTasks = [...tasks, ...buildingTasks];
    this.totalAssets = allTasks.length;
    this.loadingAssets = this.totalAssets;

    const BATCH_SIZE = this.isMobile ? 3 : 6;
    let idx = 0;
    const processNextBatch = () => {
      const batch = allTasks.slice(idx, idx + BATCH_SIZE);
      if (batch.length === 0) {
        this.renderer.clearChunkCache();
        this.isLoaded = true;
        this.loadingAssets = 0;
        return;
      }
      idx += batch.length;
      Promise.all(batch.map(t => t.load().catch(() => { }))).then(() => {
        this.loadingAssets = this.totalAssets - idx;
        processNextBatch();
      });
    };
    processNextBatch();

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

    this.initRadio();

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') { e.preventDefault(); this.altUpPressed = true; }
      if (e.code === 'ShiftLeft') this.altDownPressed = true;
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
      if (this.isInCar && !this.isMobile) {
        if (e.code === 'ArrowUp') { e.preventDefault(); this.stopRadio(); }
        if (e.code === 'ArrowDown') { e.preventDefault(); this.randomRadio(); }
        if (e.code === 'ArrowLeft') { e.preventDefault(); this.prevRadio(); }
        if (e.code === 'ArrowRight') { e.preventDefault(); this.nextRadio(); }
      }
      if (e.code === 'Tab' || e.code === 'KeyQ') {
        e.preventDefault();
        this.showWeaponWheel = !this.showWeaponWheel;
        if (this.isPointerLocked) document.exitPointerLock();
      }
      if (e.code === 'Escape') this.showWeaponWheel = false;
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.altUpPressed = false;
      if (e.code === 'ShiftLeft') this.altDownPressed = false;
    });

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
        this.unlockAudio();
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
      setTimeout(() => this.initTouchControls(canvas), 0);
    }
    this.ngZone.runOutsideAngular(() => {
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);
    });
    this.startPolling();
    this.startNPCPolling();
    this.initTraffic();
    setTimeout(() => this.trySpawnAirportLotCars(), 2000);
  }

  private initTraffic() {
    this.trafficNodes = this.renderer.getRoadNodesInRadius(0, 0, 30);
    this.trafficEdges = this.renderer.getRoadEdges(this.trafficNodes);
    this.rebuildLanes();
    for (let i = 0; i < 25; i++) {
      this.spawnTrafficCar();
    }
  }

  private trySpawnAirportLotCars() {
    if (this.renderer.carMeshes.length > 0) {
      this.spawnAirportLotCars();
    } else {
      setTimeout(() => this.trySpawnAirportLotCars(), 1000);
    }
  }
  private spawnAirportLotCars() {
    if (this.renderer.carMeshes.length === 0) return;
    const zones: { cx: number; cz: number }[] = [
      { cx: 1, cz: -3 }, { cx: 11, cz: -6 }, { cx: 26, cz: -8 }, { cx: 41, cz: -12 }, { cx: 39, cz: 14 },
    ];
    let spawned = 0;
    for (const z of zones) {
      if (spawned >= 2) break;
      const lotX = z.cx * 80 + 16;
      const lotZ = z.cz * 80 + 40;
      const color = [0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.5];
      this.airportLotCars.push({
        x: lotX, z: lotZ + 20, yaw: 0,
        mesh: this.renderer.getNPCCarMesh([color[0], color[1], color[2]], -(1000 + spawned)),
        phase: 0, dir: 1, speed: 6 + Math.random() * 4,
        p0: { x: lotX, z: lotZ + 20 },
        p1: { x: lotX, z: lotZ - 5 },
        hasDriver: false,
      } as any);
      spawned++;
    }
  }
  private updateAirportLotCars(dt: number) {
    for (const ac of this.airportLotCars) {
      ac.phase += dt * ac.dir * (ac.speed / Math.hypot(ac.p1.x - ac.p0.x, ac.p1.z - ac.p0.z));
      if (ac.phase >= 1) { ac.phase = 1; ac.dir = -1; }
      if (ac.phase <= 0) { ac.phase = 0; ac.dir = 1; }
      const t = ac.phase;
      ac.x = ac.p0.x + (ac.p1.x - ac.p0.x) * t;
      ac.z = ac.p0.z + (ac.p1.z - ac.p0.z) * t;
      ac.yaw = ac.dir > 0 ? 0 : Math.PI;
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
      const laneOffset = 4.0;
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

  selectNextWeapon() {
    for (let i = 1; i < this.weaponNames.length; i++) {
      const next = (this.currentWeapon + i) % this.weaponNames.length;
      if (this.ownedWeapons[next] && this.ammo[next] > 0) { this.selectWeapon(next); return; }
    }
  }
  selectWeapon(idx: number) {
    this.currentWeapon = idx;
    this.showWeaponWheel = false;
  }

  private initTouchControls(canvas: HTMLCanvasElement) {
    this.joystickThumbEl = document.getElementById('gt-joystick-thumb');

    const updateThumb = (x: number, y: number) => {
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
      if (this.joystickThumbEl) {
        const thumbOffset = Math.min(dist, 80);
        const tx = dist > 1 ? (dx / dist) * thumbOffset : 0;
        const ty = dist > 1 ? (dy / dist) * thumbOffset : 0;
        this.joystickThumbEl.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
      }
    };

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

    document.addEventListener('touchstart', (e) => {
      const target = e.target as HTMLElement;
      if (target && (target.id === 'gt-mobile-fire' || target.id === 'gt-mobile-car' || target.id === 'gt-mobile-view')) {
        return;
      }
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

  onButtonTouch(e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  toggleWeaponWheel() { this.showWeaponWheel = !this.showWeaponWheel; }

  toggleCar() {
    if (this.isPassenger) {
      this.exitPassenger();
      return;
    }
    if (this.isInCar) {
      if (!this.passenger && this.tryPickupPassenger()) {
        return;
      }
      this.exitCar();
    } else if (this.nearCar) {
      this.enterCar();
    } else {
      const side = this.getOtherPlayerCarSide();
      if (side === 'passenger') {
        this.tryEnterAsPassenger();
      } else if (side === 'driver') {
        this.enterCar();
      } else if (this.nearVendingMachine) {
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

  private canPickupPassenger(): boolean {
    if (!this.isInCar || this.passenger) return false;
    if (this.taxiMission) return false;
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
      mesh: ped.mesh,
      gender: ped.gender,
      type: ped.type,
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

  private dropPassenger(nearX: number, nearZ: number, carYaw: number) {
    if (!this.passenger) return;
    const p = this.passenger;
    const angle = carYaw - Math.PI / 2;
    const exitDist = 3.0;
    const px = nearX + Math.sin(angle) * exitDist;
    const pz = nearZ + Math.cos(angle) * exitDist;
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
      yaw: carYaw + Math.PI,
      gender: p.gender,
      type: p.type,
      mesh: p.mesh,
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
          this._carOnFire = false;
          this._carFireStarted = 0;
          this._carFireX = 0; this._carFireZ = 0; this._carFireYaw = 0;
          this._carSubmerged = false;
          this._carSubmergeStart = 0;

          this.playerVehicleMesh = v.mesh;
          this.playerVehicleColor = [v.colorR || 1, v.colorG || 1, v.colorB || 1];
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
          this.showVehicleBanner(this.vehicleType);
          if (!this.radioOn && this.radioSongs.length) this.randomRadio();

          if (this.vehicleType === 'plane') { this.camDist = 12; this.camHeight = 5; }
          else if (this.vehicleType === 'helicopter') { this.camDist = 10; this.camHeight = 4; }
          else if (this.vehicleType === 'boat') { this.camDist = 8; this.camHeight = 3; }
          else if (this.vehicleType === 'motorcycle') { this.camDist = 6; this.camHeight = 2.5; }
          else { this.camDist = 8; this.camHeight = 3; }

          this.gtService.stealCar(v.id, userId).then((stealRes: any) => {
            if (stealRes && stealRes.evictedNpcs) {
              for (const ep of stealRes.evictedNpcs) {
                this.serverPedestrians.push({
                  id: ep.id,
                  x: ep.posX, z: ep.posZ, yaw: ep.yaw,
                  gender: ep.gender || 'male',
                  type: ep.type,
                  mesh: this.renderer.getPedestrianMesh(ep.gender || 'male', ep.id),
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
    // Check decorative aircraft in nearby chunks' buildings
    {
      const cxa = Math.floor(this.carX / 80), cza = Math.floor(this.carZ / 80);
      for (let dza = -1; dza <= 1; dza++) {
        for (let dxa = -1; dxa <= 1; dxa++) {
          const chunk = this.renderer.getCityChunk(cxa + dxa, cza + dza);
          for (const da of chunk.decorativeAircraft) {
            const ddx = da.x - this.carX, ddz = da.z - this.carZ;
            if (Math.sqrt(ddx * ddx + ddz * ddz) < ENTER_CAR_DIST) {
              this.carX = da.x; this.carZ = da.z; this.carYaw = da.yaw;
              this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
              this.isInCar = true;
              this.vehicleType = da.type as 'car' | 'bus' | 'plane' | 'bike' | 'motorcycle' | 'taxi' | 'boat' | 'helicopter';
              this.carHealth = 200;
              this._carOnFire = false; this._carFireStarted = 0;
              this._carFireX = 0; this._carFireZ = 0; this._carFireYaw = 0;
              this._carSubmerged = false; this._carSubmergeStart = 0;
              if (da.type === 'helicopter') {
                this.playerVehicleMesh = this.renderer.getHelicopterMesh(0);
              } else {
                this.playerVehicleMesh = this.renderer.getPlaneMesh(0);
              }
              this.playerVehicleColor = [1, 1, 1];
              if (this.renderer.playerMesh) {
                this.driverInCarMesh = { mesh: this.renderer.playerMesh, offsetX: 0.3, offsetY: -0.3, offsetZ: 0.2, yaw: 0, scale: 0.85 };
              }
              this.showVehicleBanner(this.vehicleType);
              if (!this.radioOn && this.radioSongs.length) this.randomRadio();
              if (da.type === 'plane') { this.camDist = 12; this.camHeight = 5; }
              else { this.camDist = 10; this.camHeight = 4; }
              return;
            }
          }
        }
      }
    }
    if (this.tryCarjackPlayer(userId)) return;
  }
  displayNameFromPath(path: string): string {
    const name = path.replace('assets/grandtheft/', '').replace('/scene.gltf', '');
    return name
      .replace(/^[a-z]{2}_-_/, '')
      .replace(/^[a-z]{2}_/, '')
      .replace(/_-_/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/ Ps1| Lp| Rm X| Hpe\d+/g, '')
      .trim();
  }
  private tryCarjackPlayer(userId: number): boolean {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = op.posX - this.carX;
      const dz = op.posZ - this.carZ;
      if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
        this.carX = op.posX; this.carZ = op.posZ; this.carYaw = op.yaw;
        this.carVx = 0; this.carVz = 0; this.carSpeed = 0;
        this.isInCar = true;
        this.vehicleType = 'car';
        this.carHealth = 400;

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
        this.showVehicleBanner('car');
        this.gtService.stealCar(-op.userId, userId);

        op.isInCar = false;

        return true;
      }
    }
    return false;
  }

  private nearOtherPlayerCar(): boolean {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = op.posX - this.carX;
      const dz = op.posZ - this.carZ;
      if (dx * dx + dz * dz < ENTER_CAR_DIST * ENTER_CAR_DIST) return true;
    }
    return false;
  }

  private getOtherPlayerCarSide(): 'driver' | 'passenger' | null {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = this.carX - op.posX;
      const dz = this.carZ - op.posZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > ENTER_CAR_DIST * ENTER_CAR_DIST) continue;
      const rightX = Math.cos(op.yaw);
      const rightZ = -Math.sin(op.yaw);
      const dot = dx * rightX + dz * rightZ;
      return dot > 0 ? 'driver' : 'passenger';
    }
    return null;
  }

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

  private tryEnterAsPassenger(): boolean {
    for (const op of this.otherPlayers) {
      if (!op.isInCar) continue;
      const dx = op.posX - this.carX;
      const dz = op.posZ - this.carZ;
      if (Math.sqrt(dx * dx + dz * dz) < ENTER_CAR_DIST) {
        this.isPassenger = true;
        this.passengerOfUserId = op.userId;
        this.isInCar = false;
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

  private exitPassenger() {
    const host = this.otherPlayers.find(p => p.userId === this.passengerOfUserId);
    if (host) {
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

  private updatePassengerFollow() {
    if (!this.isPassenger) return;
    const host = this.otherPlayers.find(p => p.userId === this.passengerOfUserId);
    if (!host) {
      this.exitPassenger();
      return;
    }
    const now = performance.now();

    const hostMoved = (host.posX !== this.passengerHostLastX || host.posZ !== this.passengerHostLastZ || host.yaw !== this.passengerHostLastYaw);
    if (hostMoved && this.passengerHostLastTime > 0) {
      const dt = (now - this.passengerHostLastTime) / 1000;
      if (dt > 0.001) {
        this.passengerHostVelX = (host.posX - this.passengerHostLastX) / dt;
        this.passengerHostVelZ = (host.posZ - this.passengerHostLastZ) / dt;
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

    const timeSincePoll = (now - this.passengerHostLastTime) / 1000;
    const predictedX = this.passengerHostLastX + this.passengerHostVelX * timeSincePoll;
    const predictedZ = this.passengerHostLastZ + this.passengerHostVelZ * timeSincePoll;
    let predictedYaw = this.passengerHostLastYaw + this.passengerHostVelYaw * timeSincePoll;

    const lerpFactor = 0.15;
    this.carX += (predictedX - this.carX) * lerpFactor;
    this.carZ += (predictedZ - this.carZ) * lerpFactor;

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
        isBurning: this._carOnFire || undefined,
        fireStarted: this._carOnFire ? this._carFireStarted : undefined,
        carFireX: this._carOnFire ? this._carFireX : undefined,
        carFireZ: this._carOnFire ? this._carFireZ : undefined,
        carFireYaw: this._carOnFire ? this._carFireYaw : undefined,
        submerged: this._carSubmerged || undefined,
        submergeStart: this._carSubmerged ? this._carSubmergeStart : undefined,
        mesh,
        colorR: color[0], colorG: color[1], colorB: color[2]
      });

      this.gtService.parkCar(1, this.carX, this.carZ, this.carYaw, color[0], color[1], color[2], this.vehicleType).then((res: any) => {
        const localCar = this.parkedCars.find(p => p.id === tempId);
        if (localCar && res && res.id) {
          localCar.id = res.id;
        }
      });
    }

    this._carOnFire = false;
    this._carFireStarted = 0;
    this._carFireX = 0; this._carFireZ = 0; this._carFireYaw = 0;
    this._carSubmerged = false;
    this._carSubmergeStart = 0;

    this.playerVehicleMesh = null;
    this.driverInCarMesh = null;
    if (this.isInGarageInterior()) {
      const userId = this.getUserId();
      if (userId && mesh) {
        this.gtService.storeGarageCar(
          userId,
          this.vehicleType,
          color[0], color[1], color[2],
          this.carYaw
        );
        this.garageStoreCooldown = 10;
        this.garageCar = null;
        this.garageCarMesh = null;
        this.isInCar = false; this.vehicleType = 'car';
        this.carVx = 0; this.carVz = 0; this.carSpeed = 0; this.carY = CAR_HEIGHT;
        this.camDist = 4; this.camHeight = 2;
        this.carX = GARAGE_ENTRANCE_X;
        this.carZ = GARAGE_ENTRANCE_Z + 3;
        return;
      }
    }
    if (this.passenger) {
      this.dropPassenger(this.carX, this.carZ, this.carYaw);
    }
    this.carX += Math.sin(angle) * exitDist;
    this.carZ += Math.cos(angle) * exitDist;
    this.carVx = 0; this.carVz = 0; this.carSpeed = 0; this.carY = CAR_HEIGHT;
    this.isInCar = false; this.vehicleType = 'car';
    this.camDist = 4; this.camHeight = 2;
    this.taxiMission = null;
    this.taxiMarkers = [];
    this.taxiAttachedMeshes = [];
    this.taxiSearchTimer = 0;
    this.stopRadio();
  }

  private async initRadio() {
    const userId = this.getUserId();
    if (!userId) return;
    const todos = await this.todoService.getTodo(userId, 'Music');
    if (todos && Array.isArray(todos)) {
      this.radioSongs = todos
        .filter((s: any) => s.url && s.url.includes('youtube'))
        .map((s: any) => this.fileService.parseYoutubeId(s.url))
        .filter((id: string) => id.length > 0);
    }
    if (this.ytPlayer) return;
    this.ensureYtApi().then(() => {
      const div = document.getElementById('gt-yt-player');
      if (!div || this.ytPlayer) return;
      this.ytPlayer = new (window as any).YT.Player('gt-yt-player', {
        height: '0', width: '0',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => { },
          onStateChange: (e: any) => {
            if (e.data === 1) {
              this.ngZone.run(() => {
                this.radioSongTitle = this.ytPlayer?.getVideoData?.()?.title || '';
              });
            }
            if (e.data === 0) this.nextRadio();
          }
        }
      });
    });
  }

  private ensureYtApi(): Promise<void> {
    if (this.ytApiReady) return this.ytApiReady;
    this.ytApiReady = new Promise<void>((resolve) => {
      const w = window as any;
      if (w.YT?.Player) { resolve(); return; }
      w.onYouTubeIframeAPIReady = () => resolve();
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
      }
    });
    return this.ytApiReady;
  }

  private playRadio(index: number) {
    if (!this.ytPlayer || !this.radioSongs.length) return;
    this.radioIndex = (index + this.radioSongs.length) % this.radioSongs.length;
    const id = this.radioSongs[this.radioIndex];
    try {
      this.ytPlayer.loadVideoById(id);
      this.radioOn = true;
      this.ngZone.run(() => {
        this.radioSongTitle = this.ytPlayer?.getVideoData?.()?.title || '';
      });
    } catch { }
  }

  nextRadio() {
    if (!this.radioSongs.length) return;
    if (!this.radioOn) { this.randomRadio(); return; }
    this.playRadio(this.radioIndex + 1);
  }

  prevRadio() {
    if (!this.radioSongs.length) return;
    if (!this.radioOn) { this.randomRadio(); return; }
    this.playRadio(this.radioIndex - 1);
  }

  randomRadio() {
    if (!this.radioSongs.length) return;
    if (this.radioOn && this.ytPlayer) try { this.ytPlayer.stopVideo(); } catch { }
    this.playRadio(Math.floor(Math.random() * this.radioSongs.length));
  }

  private stopRadio() {
    this.radioOn = false;
    this.radioSongTitle = '';
    if (this.ytPlayer) try { this.ytPlayer.stopVideo(); } catch { }
  }

  private showVehicleBanner(type: string) {
    const m = this.playerVehicleMesh;
    const carName = m ? (Array.isArray(m) ? (m.length > 0 ? m[0].carName : undefined) : (m as CityMesh).carName) : undefined;
    if (carName) {
      this.vehicleName = this.displayNameFromPath(carName);
    } else {
      const nameMap: Record<string, string> = {
        taxi: 'Taxi', bus: 'Bus', bike: 'Motorcycle', motorcycle: 'Motorcycle',
        police: 'Police Cruiser', cop: 'Police Car',
        boat: 'Yacht', helicopter: 'Helicopter', plane: 'Airplane',
        car: 'Sports Car', aeroplane: 'Airplane'
      };
      this.vehicleName = nameMap[type] || type;
    }
    this.vehicleBannerTimer = 3;
  }

  private startPolling() { this.pollMultiplayer(); }
  private stopPolling() { if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; } }
  private startNPCPolling() { this.pollNPCs(); this.npcPollTimer = setInterval(() => this.pollNPCs(), 1000); }
  private stopNPCPolling() { if (this.npcPollTimer) { clearInterval(this.npcPollTimer); this.npcPollTimer = null; } }

  private async pollNPCs(): Promise<void> {
    if (this._destroyed) return;
    const data = await this.gtService.getNPCs(1, this.carX, this.carZ, this.getUserId());
    if (!data) return;

    const prevCarHealth = new Map<number, number>();
    for (const c of this.serverNPCs) prevCarHealth.set(c.id, c.health);
    const prevPedHealth = new Map<number, number>();
    for (const p of this.serverPedestrians) prevPedHealth.set(p.id, p.health);
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

    const allVehicles = [...data.cars, ...(data.aircraft || [])];
    this.serverNPCs = allVehicles
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
        } else if (c.type === 'helicopter') {
          mesh = this.renderer.getHelicopterMesh(c.id);
        } else if (c.type === 'plane') {
          mesh = this.renderer.getPlaneMesh(c.id);
        } else {
          mesh = this.renderer.getNPCCarMesh([c.colorR, c.colorG, c.colorB], c.id);
        }

        const JUMP_THRESHOLD = 50;
        const newX = c.posX, newZ = c.posZ, newYaw = c.yaw, newSpeed = c.speed ?? 0, newY = c.posY || 0;
        const existing = prevNPCState.get(c.id) ?? existingPolice.get(c.id);
        const interp = (() => {
          if (!existing) {
            return { prevX: newX, prevZ: newZ, prevYaw: newYaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp, prevY: newY, targetY: newY };
          }
          const jumpDist = Math.hypot(newX - existing.x, newZ - existing.z);
          if (jumpDist > JUMP_THRESHOLD) {
            return { prevX: newX, prevZ: newZ, prevYaw: newYaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp, prevY: newY, targetY: newY };
          }
          return { prevX: existing.x, prevZ: existing.z, prevYaw: existing.yaw, targetX: newX, targetZ: newZ, targetYaw: newYaw, speed: newSpeed, lastUpdate: pollTimestamp, prevY: existing.y ?? newY, targetY: newY };
        })();

        return {
          id: c.id,
          x: interp.prevX, y: interp.prevY, z: interp.prevZ, yaw: interp.prevYaw,
          type: c.type || 'car',
          health,
          colorR: c.colorR, colorG: c.colorG, colorB: c.colorB,
          mesh,
          remoteShootTimer: 0,
          gender: c.gender,
          hasDriver: c.hasDriver !== false,
          passengerCount: c.passengerCount ?? 0,
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
          if (pc.type === 'police')
            existing.mesh = this.renderer.getPoliceCarMesh();
          else if (pc.type === 'taxi')
            existing.mesh = this.renderer.getTaxiMesh();
          else if (pc.type === 'motorcycle')
            existing.mesh = this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
          else if (pc.type === 'bus' && this.renderer.busMesh)
            existing.mesh = this.renderer.busMesh;
          else if (pc.type === 'helicopter')
            existing.mesh = this.renderer.getHelicopterMesh(pc.id);
          else if (pc.type === 'plane')
            existing.mesh = this.renderer.getPlaneMesh(pc.id);
          else if (pc.type === 'boat')
            existing.mesh = this.renderer.getBoatMesh(pc.id);
          return existing;
        }
        let parkedMesh: CityMesh | CityMesh[];
        if (pc.type === 'motorcycle') parkedMesh = this.renderer.getMotorcycleMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
        else if (pc.type === 'taxi') parkedMesh = this.renderer.getTaxiMesh();
        else if (pc.type === 'police') parkedMesh = this.renderer.getPoliceCarMesh();
        else if (pc.type === 'bus') parkedMesh = this.renderer.busMesh || this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
        else if (pc.type === 'helicopter') parkedMesh = this.renderer.getHelicopterMesh(pc.id);
        else if (pc.type === 'plane') parkedMesh = this.renderer.getPlaneMesh(pc.id);
        else if (pc.type === 'boat') parkedMesh = this.renderer.getBoatMesh(pc.id);
        else parkedMesh = this.renderer.getNPCCarMesh([pc.colorR, pc.colorG, pc.colorB], pc.id);
        return {
          id: pc.id, x: pc.posX, z: pc.posZ, yaw: pc.yaw,
          type: pc.type || 'car', health,
          isBurning: pc.isBurning || false,
          colorR: pc.colorR, colorG: pc.colorG, colorB: pc.colorB,
          mesh: parkedMesh,
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
      this.isInCar,
      this.vehicleType,
      this.playerVehicleColor[0],
      this.playerVehicleColor[1],
      this.playerVehicleColor[2],
      this.isPassenger ? this.passengerOfUserId : 0,
      chatMsg
    );

    if (res && res.evicted && this.isInCar) {
      this.exitCar();
    }
    if (res && res.evicted && this.isPassenger) {
      this.exitPassenger();
    }
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

    if (res && res.droppedWeapons) {
      this.droppedWeapons = res.droppedWeapons;
    }
    if (res && res.ownedWeapons) {
      this.ownedWeapons = res.ownedWeapons;
      this.ammo = res.ammo;
    }

    if (res?.chatMessages) {
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
      this._lbDirty = true;
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
          if (p.modelUrl && p.modelUrl !== existing.modelUrl) {
            existing.modelUrl = p.modelUrl;
            (async () => {
              try {
                const loaded = await this.renderer.loadGLTF(p.modelUrl!);
                if (loaded && loaded.length > 0) existing.mesh = loaded;
              } catch (e) { }
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
                if (loaded && loaded.length > 0) newPlayer.mesh = loaded;
              } catch (e) { }
            })();
          }
        }
      }
      const activeIds = new Set(res.players.map(p => p.userId));
      this.otherPlayers = this.otherPlayers.filter(op => activeIds.has(op.userId));
    }

    if (res && res.yourHealth !== undefined) {
      if (res.yourHealth < this.health) {
        this.damageAlpha = 0.4;
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

    if (this.currentWeapon === 0) {
      this.punchTimer = 0.3;
      this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ, 3);
    } else if (this.currentWeapon === 4) {
      this.rockets.push({ x: originX, y: originY, z: originZ, vx: dirX * 40, vy: dirY * 40, vz: dirZ * 40, age: 0, lifetime: 3 });
      this.playWeaponSound(4);
    } else {
      const tracerLifetime = this.currentWeapon === 2 ? 0.15 : 0.3;
      this.tracers.push({ originX, originY, originZ, dirX, dirY, dirZ, age: 0, lifetime: tracerLifetime });
      this.muzzleFlashes.push({ x: originX, y: originY, z: originZ, dirX, dirY, dirZ, weapon: this.currentWeapon, age: 0, lifetime: 0.08 });

      if (this.currentWeapon === 3) {
        for (let i = 1; i < 8; i++) {
          const spread = 0.08;
          this.tracers.push({ originX, originY, originZ, dirX: dirX + (Math.random() - 0.5) * spread, dirY: dirY + (Math.random() - 0.5) * spread, dirZ: dirZ + (Math.random() - 0.5) * spread, age: 0, lifetime: 0.2 });
        }
      }
      this.checkBulletHit(originX, originY, originZ, dirX, dirY, dirZ);
      this.playWeaponSound(this.currentWeapon);
    }
  }

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
    } catch (e) { }
  }

  private playWeaponSound(weapon: number) {
    if (weapon === 0) return;
    try {
      let base: HTMLAudioElement | null = null;
      let vol = 0.3;
      if (weapon === 1) { base = this.uziSound; vol = 0.2; }
      else if (weapon === 2) { base = this.uziSound; vol = 0.3; }
      else if (weapon === 3) { base = this.uziSound; vol = 0.35; }
      else if (weapon === 4) { base = this.rocketSound; vol = 0.5; }
      if (!base) {
        if (weapon >= 1 && weapon <= 3) { this.uziSound = new Audio('assets/grandtheft/uzi.mp3'); base = this.uziSound; }
        else if (weapon === 4) { this.rocketSound = new Audio('assets/grandtheft/rocket.mp3'); base = this.rocketSound; }
      }
      if (!base) return;
      const clone = base.cloneNode(true) as HTMLAudioElement;
      clone.volume = vol * this.sfxVolume;
      clone.play().catch(() => { });
    } catch (e) { }
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

        if (distSq < 1.0) {
          this.spawnBlood(tx, ty, tz, dx, dy, dz);
          const dmg = WEAPON_DAMAGES[this.currentWeapon];
          if (isPlayer) {
            t.health = Math.max(0, (t.health ?? 100) - dmg);
            this.gtService.hit(this.getUserId(), t.userId, 1, dmg, ox, oz).then((res: any) => {
              if (res && res.targetHealth !== undefined) t.health = res.targetHealth;
            });
          } else {
            t.health = (t.health ?? 100) - dmg;
            this.gtService.hit(this.getUserId(), t.id, 1, dmg, ox, oz);
            this.score += 10;
          }
          return true;
        }
      }
      return false;
    };
    checkTargets(this.otherPlayers, true);

    checkTargets(this.serverPedestrians, false);
    checkTargets(this.localPedestrians, false);
    checkTargets(this.serverNPCs, false);
    checkTargets(this.parkedCars, false);

    // Check barrel hits
    const barrels = this.renderer.getNearbyBarrels(ox, oz, maxRange);
    for (const b of barrels) {
      const vx = b.x - ox, vz = b.z - oz;
      const proj = vx * dx + vz * dz;
      if (proj < 0 || proj > maxRange) continue;
      const closestX = ox + dx * proj, closestZ = oz + dz * proj;
      if (Math.hypot(b.x - closestX, b.z - closestZ) < 0.8) {
        const key = `${b.x},${b.z}`;
        if (!this.renderer.explodedBarrels.has(key)) {
          this.renderer.explodedBarrels.add(key);
          this.spawnExplosion(b.x, 0.5, b.z);
        }
        return;
      }
    }

    // Check gas station hits
    const gasStations = this.renderer.getNearbyGasStations(ox, oz, maxRange);
    for (const gs of gasStations) {
      const vx = gs.x - ox, vz = gs.z - oz;
      const proj = vx * dx + vz * dz;
      if (proj < 0 || proj > maxRange) continue;
      const closestX = ox + dx * proj, closestZ = oz + dz * proj;
      if (Math.hypot(gs.x - closestX, gs.z - closestZ) < 2.0) {
        const key = `${gs.x},${gs.z}`;
        if (!this.renderer.explodedGasStations.has(key)) {
          this.renderer.explodedGasStations.add(key);
          this.spawnBigExplosion(gs.x, 0.5, gs.z);
        }
        return;
      }
    }
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

  private updateExplosionJumps(dt: number) {
    const GRAVITY = 20.0;
    const applyJump = (car: any) => {
      if (car.jumpVel === undefined && car.pushVelX === undefined && car.pushVelZ === undefined) return;
      if (car.jumpVel !== undefined && car.jumpVel > 0) {
        car._expY = (car._expY ?? 0) + car.jumpVel * dt;
        car.jumpVel -= GRAVITY * dt;
        if (car.jumpVel < 0 && (car._expY ?? 0) <= 0) {
          car._expY = 0;
          car.jumpVel = 0;
        }
      }
      if (car.pushVelX !== undefined && Math.abs(car.pushVelX) > 0.01) {
        car.x = (car.x ?? 0) + car.pushVelX * dt;
        car.pushVelX *= 0.92;
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

  private updateGarage(dt: number) {
    if (this.garageStoreCooldown > 0) {
      this.garageStoreCooldown -= dt;
    }

    const dx = this.carX - GARAGE_ENTRANCE_X;
    const dz = this.carZ - GARAGE_ENTRANCE_Z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const nearGarage = dist < GARAGE_DETECT_RADIUS;

    if (nearGarage) {
      this.garageDoorOpenness = Math.min(1, this.garageDoorOpenness + GARAGE_DOOR_OPEN_SPEED * dt);
    } else {
      this.garageDoorOpenness = Math.max(0, this.garageDoorOpenness - GARAGE_DOOR_OPEN_SPEED * dt);
    }

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

    const inGarageInterior = this.isInGarageInterior();

    if (this.wasInGarage && !inGarageInterior && this.isInCar) {
      const userId = this.getUserId();
      if (userId) {
        this.gtService.removeGarageCar(userId).then(() => {
          this.garageCar = null;
          this.garageCarMesh = null;
        });
      }
    }

    if (nearGarage && !this.isInCar && !this.isPassenger && this.garageCar && this.garageCarMesh && this.garageStoreCooldown <= 0) {
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
      this.garageCar = null;
      this.garageCarMesh = null;
    }

    this.wasInGarage = inGarageInterior;
  }

  private isInGarageInterior(): boolean {
    const dx = this.carX - GARAGE_INTERIOR_X;
    const dz = this.carZ - GARAGE_INTERIOR_Z;
    return dx * dx + dz * dz < 10 * 10;
  }

  private spawnBigExplosion(x: number, y: number, z: number) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 2.0 });
    this.explosions.push({ x, y, z, age: 0, lifetime: 2.0 });
  }

  private spawnExplosion(x: number, y: number, z: number) {
    this.explosions.push({ x, y, z, age: 0, lifetime: 1.0 });

    const BLAST_RADIUS = 12.0;
    const BLAST_MAX_DMG = 200;
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
          this.damageAlpha = 0.5;
          this.gtService.hit(this.getUserId(), this.getUserId(), 1, passThrough, this.carX, this.carZ);
          this.spawnBlood(this.carX, this.carY + 1.0, this.carZ, selfDx, 0, selfDz);
        }
      } else {
        this.health = Math.max(0, this.health - selfDmg);
        this.damageAlpha = 0.5;
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
      const currNode = currIdx >= 0 && currIdx < this.trafficNodes.length ? this.trafficNodes[currIdx] : null;
      const nextNode = nextIdx >= 0 && nextIdx < this.trafficNodes.length ? this.trafficNodes[nextIdx] : null;
      if (!currNode || !nextNode) { this.trafficCars.splice(ci, 1); continue; }

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

      let crossBlocked = false;
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
                if (dot < 0.3) { crossBlocked = true; break; }
              }
            }
          }
        }
      }

      const carFwdX = Math.sin(car.yaw);
      const carFwdZ = Math.cos(car.yaw);
      let blocked = false;
      let slowDown = false;

      const checkObstacle = (ox: number, oz: number, closeR: number, farR: number) => {
        const dx = ox - car.x;
        const dz = oz - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist > farR) return;
        const dot = dx * carFwdX + dz * carFwdZ;
        if (dot < 0) return;
        if (dist < closeR) blocked = true;
        else slowDown = true;
      };

      for (const other of this.trafficCars) {
        if (other.id === car.id || other.health <= 0) continue;
        checkObstacle(other.x, other.z, 4.0, 8.0);
      }
      for (const npc of this.serverNPCs) {
        if (npc.health <= 0) continue;
        checkObstacle(npc.x, npc.z, 4.0, 8.0);
      }
      for (const pc of this.parkedCars) {
        if (pc.health <= 0) continue;
        checkObstacle(pc.x, pc.z, 4.0, 8.0);
      }
      const nearbyLamps = this.renderer.getLampsNear(car.x, car.z, 8);
      for (const lamp of nearbyLamps) {
        checkObstacle(lamp.x, lamp.z, 2, 5);
      }
      for (const ped of this.localPedestrians) {
        if (ped.health <= 0) continue;
        checkObstacle(ped.x, ped.z, 3, 6);
      }
      for (const ped of this.serverPedestrians) {
        if (ped.health <= 0) continue;
        checkObstacle(ped.x, ped.z, 3, 6);
      }
      for (const op of this.otherPlayers) {
        if (op.health <= 0) continue;
        checkObstacle(op.posX, op.posZ, 3, 6);
      }

      // FIX: Removed hard stop for blocked obstacles. 
      // Instead of entering a 0.3s 'stop' state (which caused stop-and-go rubber banding),
      // we just set speedMult to 0 so the car smoothly stops and resumes immediately.
      // if (blocked) {
      //   car.state = 'stop';
      //   car.stopTimer = 0.3;
      //   car.nextYaw = car.yaw;
      //   continue;
      // }

      let redLight = false;
      if (nextNode && distToTarget < intersectionRadius) {
        const isHDir = Math.abs(nextNode.x - currNode.x) > Math.abs(nextNode.z - currNode.z);
        if ((isHDir && isRedForX) || (!isHDir && !isRedForX)) redLight = true;
      }

      this.pushTrafficCarOutOfBuildings(car);

      if (distToTarget < 2) {
        car.pathIdx++;
        if (car.pathIdx < car.path.length) {
          const newTarget = this.trafficNodes[car.path[car.pathIdx]];
          car.yaw = Math.atan2(newTarget.x - currNode.x, newTarget.z - currNode.z);
          // FIX: Snap car to the intersection center to prevent corner cutting,
          // which previously caused cars to clip buildings and get pushed backwards.
          car.x = currNode.x + laneOffX;
          car.z = currNode.z + laneOffZ;
        }
        continue;
      }

      let speedMult = 1.0;
      if (approachingTurn) speedMult *= 0.35;
      if (slowDown) speedMult *= 0.4;
      if (blocked) speedMult *= 0.0;
      if (crossBlocked) speedMult *= 0.3;
      if (redLight) speedMult *= 0.1;

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

    for (const npc of this.serverNPCs) this.pushTrafficCarOutOfBuildings(npc);
  }

  private pushTrafficCarOutOfBuildings(car: { x: number; z: number }) {
    const cx = Math.floor(car.x / CHUNK_SIZE);
    const cz = Math.floor(car.z / CHUNK_SIZE);
    const margin = 1.0;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunkCX = cx + dx;
        const chunkCZ = cz + dz;
        if (chunkCX === 0 && chunkCZ === 0) continue;
        const chunk = this.renderer.getCityChunk(chunkCX, chunkCZ);
        for (const bld of chunk.buildings) {
          const models = Array.isArray(bld.model) ? bld.model : [bld.model];
          for (const m of models) {
            if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) continue;
            const rs = m.renderScale ?? 1;
            const sx = (bld.scale?.[0] ?? 1) * rs;
            const sz = (bld.scale?.[2] ?? 1) * rs;
            const hw = (m.maxX - m.minX) / 2 * sx + margin;
            const hd = (m.maxZ - m.minZ) / 2 * sz + margin;
            const rot = ((bld.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const swap = Math.abs(rot - Math.PI / 2) < 0.01 || Math.abs(rot - Math.PI * 3 / 2) < 0.01;
            const ehw = swap ? hd : hw;
            const ehd = swap ? hw : hd;
            const cdx = car.x - bld.x;
            const cdz = car.z - bld.z;
            if (Math.abs(cdx) < ehw && Math.abs(cdz) < ehd) {
              const overlapX = ehw - Math.abs(cdx);
              const overlapZ = ehd - Math.abs(cdz);
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
      this.updatePassengerFollow();
    } else if (this.isInCar && this.vehicleType === 'boat') this.updateBoat(dt);
    else if (this.isInCar && this.vehicleType === 'helicopter') this.updateHelicopter(dt);
    else if (this.isInCar && this.vehicleType === 'plane') this.updatePlane(dt);
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
    this.showPassengerPrompt = this.canPickupPassenger();
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
    this.updateAirportLotCars(dt);

    if (this.vehicleBannerTimer > 0) this.vehicleBannerTimer -= dt;
    if (this.damageAlpha > 0) this.damageAlpha = Math.max(0, this.damageAlpha - dt * 0.5);

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

    if (this.isInCar && this.carHealth > 0 && this.vehicleType !== 'boat') {
      const ocx = Math.floor(this.carX / 80), ocz = Math.floor(this.carZ / 80);
      // Land ranges include all biome zones (city, suburb, beach, aeroport, etc.)
      const inOcean = getBiome(ocx, ocz) === 'ocean';
      if (inOcean) {
        if (!this._carSubmerged) { this._carSubmerged = true; this._carSubmergeStart = performance.now() / 1000; }
        const subElapsed = (performance.now() / 1000) - this._carSubmergeStart;
        const subT = Math.min(subElapsed / 2.0, 1.0);
        this.carY = CAR_HEIGHT - subT * 3.4;
        if (subT >= 1.0 && !this._carOnFire) {
          this._carOnFire = true;
          this._carFireStarted = performance.now() / 1000;
        }
        if (this._carOnFire) {
          this._carFireX = this.carX;
          this._carFireZ = this.carZ;
          this._carFireYaw = this.carYaw;
          const fireElapsed = (performance.now() / 1000) - this._carFireStarted;
          if (fireElapsed >= 10.0) this.carHealth = 0;
        }
      } else {
        if (this._carSubmerged) { this._carSubmerged = false; this.carY = CAR_HEIGHT; }
        if (this.carHealth > 80) { this._carOnFire = false; this._carFireStarted = 0; }
      }
    }

    if (this.isInCar && this.carHealth > 0 && !this._carSubmerged && this.carHealth <= 80 && !this._carOnFire) {
      this._carOnFire = true;
      this._carFireStarted = performance.now() / 1000;
    }
    if (this.isInCar && this._carOnFire && !this._carSubmerged) {
      this._carFireX = this.carX;
      this._carFireZ = this.carZ;
      this._carFireYaw = this.carYaw;
      const fireElapsed = (performance.now() / 1000) - this._carFireStarted;
      if (fireElapsed >= 10.0) this.carHealth = 0;
    }

    if (this.isInCar && this.carHealth <= 0) {
      this.spawnExplosion(this.carX, 0.5, this.carZ);
      this._carOnFire = false;
      this._carFireStarted = 0;
      this._carSubmerged = false;
      this.exitCar();
      this.carHealth = 400;
      this.carY = CAR_HEIGHT;
    }

    for (let i = this.parkedCars.length - 1; i >= 0; i--) {
      const pc = this.parkedCars[i];
      if (!pc.isBurning) continue;
      const now = performance.now() / 1000;
      const elapsed = now - (pc.fireStarted ?? now);
      if (elapsed >= 10.0) {
        this.spawnExplosion(pc.x, 0.5, pc.z);
        this.parkedCars.splice(i, 1);
      }
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
    const allNPCs = [...this.serverNPCs, ...this.trafficCars, ...this.airportLotCars];
    const allPeds = [...this.serverPedestrians, ...this.localPedestrians];
    const rockOffset = this.getCarRockOffset();
    const carRoll = this.getCarRockRoll();

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
    this.renderer.droppedWeapons = this.droppedWeapons;
    this.renderer.garageDoorOpenness = this.garageDoorOpenness;
    this.renderer.garageCarMesh = this.garageCarMesh;
    this.renderer.armOverrideActive = (this.currentWeapon === 1) && !this.firstPerson;
    this.renderer.walkSpeed = this.isInCar ? 0 : this.carSpeed;
    this.renderer.punchTime = this.punchTimer;
    if (this.punchTimer > 0) this.punchTimer = Math.max(0, this.punchTimer - dt);

    try {
      this.renderer.droppedWeapons = this.droppedWeapons || [];
      this.renderer.carFireElapsed = this._carOnFire ? (performance.now() / 1000) - this._carFireStarted : 0;
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
        this._carOnFire, this._carFireX, this._carFireZ, this._carFireYaw,
        this.trafficNodes,
        this.viewDistance,
        !this.isMobile,
        carRoll
      );
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

    if (this.damageAlpha > 0) {
      this.damageAlpha = Math.max(0, this.damageAlpha - dt * 1.5);
    }

    this.hudSpeed = Math.abs(this.carSpeed) * (this.isInCar ? 3.6 : 1);
    this._hudUpdateTimer += dt;
    if (this._hudUpdateTimer > 0.1) {  // ~10 Hz
      this._hudUpdateTimer = 0;
      this.ngZone.run(() => {
        // These are the only properties the template needs frequently
        // Angular will run change detection just for these
      });
    }
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
    this.carY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ);
    this.carSpeed = Math.sqrt(this.carVx * this.carVx + this.carVz * this.carVz);
    this.pushOutOfBuildings();
    if (!this.isInCar) this.pushPedestrianOutOfCars();
  }

  private updateCar(dt: number) {
    let accelForce = 0;
    let isReversing = false;

    if (this.keys.has('KeyW')) accelForce = 25;
    if (this.keys.has('KeyS')) {
      if (this.carSpeed > 1) { accelForce = -45; }
      else { isReversing = true; accelForce = -15; }
    }

    let steer = 0;
    if (this.keys.has('KeyA')) steer = 1;
    if (this.keys.has('KeyD')) steer = -1;

    if (this.isMobile && this.joystickActive) {
      if (this.joystickY > 0.1) accelForce = 25 * this.joystickY;
      else if (this.joystickY < -0.1) {
        if (this.carSpeed > 1) { accelForce = -45 * (-this.joystickY); }
        else { isReversing = true; accelForce = -15 * (-this.joystickY); }
      }
      steer += -this.joystickX;
    }

    const speedFactor = Math.min(1, Math.abs(this.carSpeed) / 5);
    const steerDir = this.carSpeed < -0.5 ? -1 : 1;
    this.carYaw += steer * 2.5 * dt * speedFactor * steerDir;

    if (accelForce !== 0) {
      this.carVx += Math.sin(this.carYaw) * accelForce * dt;
      this.carVz += Math.cos(this.carYaw) * accelForce * dt;
    }

    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    const rightX = Math.cos(this.carYaw), rightZ = -Math.sin(this.carYaw);

    let fwdSpeed = this.carVx * forwardX + this.carVz * forwardZ;
    let latSpeed = this.carVx * rightX + this.carVz * rightZ;

    fwdSpeed *= Math.max(0, 1 - 1.5 * dt);

    const isHandbraking = this.keys.has('Space');
    const grip = isHandbraking ? 1.5 : 12.0;
    latSpeed *= Math.max(0, 1 - grip * dt);

    this.carVx = fwdSpeed * forwardX + latSpeed * rightX;
    this.carVz = fwdSpeed * forwardZ + latSpeed * rightZ;

    const maxSpd = isReversing ? 15 : 55;
    const currentSpd = Math.hypot(this.carVx, this.carVz);
    if (currentSpd > maxSpd) {
      this.carVx = (this.carVx / currentSpd) * maxSpd;
      this.carVz = (this.carVz / currentSpd) * maxSpd;
    }

    this.carSpeed = fwdSpeed;
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ);
    this.pushOutOfBuildings();
    this.checkPropCollision();
  }

  private checkPropCollision() {
    if (!this.isInCar) return;
    const spd = Math.hypot(this.carVx, this.carVz);
    if (spd < 3) return;
    const barrels = this.renderer.getNearbyBarrels(this.carX, this.carZ, 2);
    for (const b of barrels) {
      const key = `${b.x},${b.z}`;
      if (!this.renderer.explodedBarrels.has(key)) {
        this.renderer.explodedBarrels.add(key);
        this.spawnExplosion(b.x, 0.5, b.z);
      }
    }
    const gasStations = this.renderer.getNearbyGasStations(this.carX, this.carZ, 4);
    for (const gs of gasStations) {
      const key = `${gs.x},${gs.z}`;
      if (!this.renderer.explodedGasStations.has(key)) {
        this.renderer.explodedGasStations.add(key);
        this.spawnBigExplosion(gs.x, 0.5, gs.z);
      }
    }
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
    this.carY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ);
    this.pushOutOfBuildings();
    this.checkPropCollision();
  }

  private updateBoat(dt: number) {
    const accel = 15, maxSpeed = 35, turnSpeed = 1.5;
    const ocx = Math.floor(this.carX / 80), ocz = Math.floor(this.carZ / 80);
    const biome = getBiome(ocx, ocz);
    const onWater = biome === 'ocean' || biome === 'bridge';
    let accelForce = 0;
    if (this.keys.has('KeyW')) accelForce = accel;
    if (this.keys.has('KeyS')) accelForce = -accel;
    if (this.isMobile && this.joystickActive) {
      accelForce = accel * this.joystickY;
    }
    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    if (accelForce !== 0) {
      this.carVx += forwardX * accelForce * dt;
      this.carVz += forwardZ * accelForce * dt;
    }
    if (onWater) {
      let steer = 0;
      if (this.keys.has('KeyA')) steer = 1;
      if (this.keys.has('KeyD')) steer = -1;
      if (this.isMobile && this.joystickActive) steer += -this.joystickX;
      const spd = Math.hypot(this.carVx, this.carVz);
      if (spd > 0.5) this.carYaw += steer * turnSpeed * dt * Math.min(1, spd / 5);
      const drag = 0.3;
      this.carVx *= Math.max(0, 1 - drag * dt);
      this.carVz *= Math.max(0, 1 - drag * dt);
    } else {
      const spd = Math.hypot(this.carVx, this.carVz);
      if (spd > 0.5) {
        const glideFactor = Math.max(0, 1 - 2.0 * dt);
        this.carVx *= glideFactor;
        this.carVz *= glideFactor;
      } else {
        this.carVx = 0; this.carVz = 0;
      }
    }
    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carSpeed = Math.hypot(this.carVx, this.carVz);
    this.carY = CAR_HEIGHT;
  }

  private updateHelicopter(dt: number) {
    const maxSpeed = 35, climbRate = 12, yawSpeed = 2.0, turnSpeed = 2.5;

    if (this.keys.has('KeyA')) this.camYaw -= turnSpeed * dt;
    if (this.keys.has('KeyD')) this.camYaw += turnSpeed * dt;
    this.carYaw = this.camYaw;

    if (this.altUpPressed) this.carVy = Math.min(this.carVy + climbRate * dt, 10);
    else if (this.altDownPressed) this.carVy = Math.max(this.carVy - climbRate * dt, -10);
    else this.carVy *= 0.92;

    let fwdInput = 0;
    if (this.keys.has('KeyW')) fwdInput = 1;
    if (this.keys.has('KeyS')) fwdInput = -1;
    this.carPitch = -fwdInput * 0.25;

    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    const targetVx = forwardX * fwdInput * maxSpeed;
    const targetVz = forwardZ * fwdInput * maxSpeed;
    this.carVx += (targetVx - this.carVx) * Math.min(1, 3 * dt);
    this.carVz += (targetVz - this.carVz) * Math.min(1, 3 * dt);

    if (this.keys.has('KeyQ')) this.camYaw -= yawSpeed * dt;
    if (this.keys.has('KeyE')) this.camYaw += yawSpeed * dt;

    this.carX += this.carVx * dt;
    this.carZ += this.carVz * dt;
    this.carY += this.carVy * dt;
    this.carSpeed = Math.hypot(this.carVx, this.carVz);

    if (this.carY < CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ)) { this.carY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ); this.carVy = Math.max(0, this.carVy); }
  }

  private updatePlane(dt: number) {
    const maxSpeed = 70, minSpeed = 5, turnSpeed = 1.2;
    const pitchSpeed = 1.8, rollSpeed = 1.8, altClimbRate = 15;

    if (this.keys.has('KeyW')) this.carPitch = Math.max(-0.6, this.carPitch - pitchSpeed * dt);
    if (this.keys.has('KeyS')) this.carPitch = Math.min(0.6, this.carPitch + pitchSpeed * dt);
    if (!this.keys.has('KeyW') && !this.keys.has('KeyS') && !this.isPointerLocked) {
      this.carPitch *= 0.95;
    }

    if (this.isPointerLocked) {
      const pitchInput = -this.camPitch * 0.3;
      this.carPitch = Math.max(-0.6, Math.min(0.6, this.carPitch + pitchInput));
    }

    if (this.keys.has('KeyA')) this.carRoll = Math.max(-0.8, this.carRoll - rollSpeed * dt);
    if (this.keys.has('KeyD')) this.carRoll = Math.min(0.8, this.carRoll + rollSpeed * dt);
    if (!this.keys.has('KeyA') && !this.keys.has('KeyD')) {
      this.carRoll *= Math.max(0, 1 - 2.0 * dt);
    }

    const bankFactor = this.carRoll * 1.5;
    this.carYaw += bankFactor * turnSpeed * dt * Math.min(1, this.carSpeed / 20);

    const sinPitch = Math.sin(this.carPitch);
    const cosPitch = Math.cos(this.carPitch);

    const targetSpeed = maxSpeed * (0.5 + 0.5 * cosPitch);
    if (this.carSpeed < targetSpeed) this.carSpeed = Math.min(this.carSpeed + 12 * dt, targetSpeed);
    else if (this.carSpeed > targetSpeed) this.carSpeed = Math.max(this.carSpeed - 8 * dt, targetSpeed);

    const liftFactor = 0.006;
    const speed = this.carSpeed;
    const lift = speed * speed * cosPitch * liftFactor;
    const dragForce = speed * 0.02;
    const gravity = -5;
    const thrustVy = speed * sinPitch * 0.3;
    this.carVy += (lift + thrustVy + gravity - this.carVy * 0.5) * dt;
    this.carSpeed -= dragForce * dt;

    if (this.altUpPressed) this.carVy += altClimbRate * dt;
    if (this.altDownPressed) this.carVy -= altClimbRate * dt;

    if (speed < minSpeed && this.carPitch < -0.05) {
      this.carVy += (gravity * 1.5) * dt;
    }

    const forwardX = Math.sin(this.carYaw), forwardZ = Math.cos(this.carYaw);
    this.carX += forwardX * this.carSpeed * dt;
    this.carZ += forwardZ * this.carSpeed * dt;
    this.carY += this.carVy * dt;

    if (this.carY < CAR_HEIGHT) {
      if (this.carSpeed > minSpeed && Math.abs(this.carPitch) > 0.3) {
        this.carHealth -= 50 * dt;
      }
      this.carY = CAR_HEIGHT + getTerrainHeight(this.carX, this.carZ);
      this.carVy = Math.max(0, this.carVy);
      this.carPitch = 0;
      this.carRoll = 0;
    }
  }

  private pushOutOfBuildings() {
    const cx = Math.floor(this.carX / CHUNK_SIZE);
    const cz = Math.floor(this.carZ / CHUNK_SIZE);
    const margin = this.isInCar ? 1.5 : 0.5;

    const garageDx = this.carX - GARAGE_ENTRANCE_X;
    const garageDz = this.carZ - GARAGE_ENTRANCE_Z;
    const nearGarage = (garageDx * garageDx + garageDz * garageDz) < (GARAGE_DETECT_RADIUS * GARAGE_DETECT_RADIUS);

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunkCX = cx + dx;
        const chunkCZ = cz + dz;
        if (nearGarage && chunkCX === 1 && chunkCZ === 0) continue;
        this.renderer.getCityChunk(chunkCX, chunkCZ);
        this.checkBuildingsInChunk(chunkCX, chunkCZ, margin);
      }
    }
  }

  private pushPedestrianOutOfCars() {
    const margin = 1.2;
    for (const v of [...this.serverNPCs, ...this.parkedCars, ...this.trafficCars]) {
      if (v.health <= 0) continue;
      const dx = this.carX - v.x;
      const dz = this.carZ - v.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < margin && dist > 0.01) {
        const overlap = margin - dist;
        this.carX += (dx / dist) * overlap;
        this.carZ += (dz / dist) * overlap;
      }
    }
  }
  private checkBuildingsInChunk(chunkCX: number, chunkCZ: number, margin: number) {
    const chunk = this.renderer.getCityChunk(chunkCX, chunkCZ);
    for (const bld of chunk.buildings) {
      const models = Array.isArray(bld.model) ? bld.model : [bld.model];
      for (const m of models) {
        if (m.minX === undefined || m.maxX === undefined || m.minZ === undefined || m.maxZ === undefined) continue;
        const rs = m.renderScale ?? 1;
        const sx = (bld.scale?.[0] ?? 1) * rs;
        const sz = (bld.scale?.[2] ?? 1) * rs;
        const hw = (m.maxX - m.minX) / 2 * sx + margin;
        const hd = (m.maxZ - m.minZ) / 2 * sz + margin;
        const rot = ((bld.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const swap = Math.abs(rot - Math.PI / 2) < 0.01 || Math.abs(rot - Math.PI * 3 / 2) < 0.01;
        const ehw = swap ? hd : hw;
        const ehd = swap ? hw : hd;
        const dx = this.carX - bld.x;
        const dz = this.carZ - bld.z;
        if (Math.abs(dx) < ehw && Math.abs(dz) < ehd && this.carY < 15) {
          const overlapX = ehw - Math.abs(dx), overlapZ = ehd - Math.abs(dz);
          if (overlapX < overlapZ) { this.carX += dx > 0 ? overlapX : -overlapX; this.carVx *= -0.3; }
          else { this.carZ += dz > 0 ? overlapZ : -overlapZ; this.carVz *= -0.3; }
          this.carSpeed *= 0.5;
        }
      }
    }
  }

  private updateVendingMachines() {
    const chunkX = Math.floor(this.carX / 80);
    const chunkZ = Math.floor(this.carZ / 80);
    if (chunkX === this._lastVendingChunkX && chunkZ === this._lastVendingChunkZ) return;
    this._lastVendingChunkX = chunkX;
    this._lastVendingChunkZ = chunkZ;

    this.vendingMachines = [];
    const range = 3;
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const gx = chunkX + dx;
        const gz = chunkZ + dz;
        if (((gx % VENDING_MACHINE_INTERVAL) + VENDING_MACHINE_INTERVAL) % VENDING_MACHINE_INTERVAL !== 0) continue;
        if (((gz % VENDING_MACHINE_INTERVAL) + VENDING_MACHINE_INTERVAL) % VENDING_MACHINE_INTERVAL !== 0) continue;
        const baseX = gx * 80;
        const baseZ = gz * 80;
        this.vendingMachines.push({
          x: baseX + VENDING_MACHINE_OFFSET,
          z: baseZ + VENDING_MACHINE_OFFSET,
          yaw: -Math.PI / 4,
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
    if (!this.nearCar) {
      const cxa = Math.floor(this.carX / 80), cza = Math.floor(this.carZ / 80);
      for (let dza = -1; dza <= 1; dza++) {
        for (let dxa = -1; dxa <= 1; dxa++) {
          const chunk = this.renderer.getCityChunk(cxa + dxa, cza + dza);
          if (chunk.decorativeAircraft.some(da => Math.hypot(da.x - this.carX, da.z - this.carZ) < ENTER_CAR_DIST)) {
            this.nearCar = true;
            return;
          }
        }
      }
    }
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

    const meshName = (mesh: any) => {
      const arr = Array.isArray(mesh) ? mesh : [mesh];
      return arr[0]?.carName || '';
    };
    for (const v of this.serverNPCs) {
      const mn = meshName(v.mesh);
      check(v.x, 0.5, v.z, v.health, mn || (v.type === 'motorcycle' ? 'Motorcycle' : 'Car'));
    }
    for (const p of this.parkedCars) {
      const mn = meshName(p.mesh);
      check(p.x, 0.5, p.z, p.health, mn ? mn + ' (parked)' : (p.type === 'motorcycle' ? 'Motorcycle' : 'Car'));
    }
    for (const ped of this.serverPedestrians) { check(ped.x, 1.0, ped.z, ped.health, ped.type === 'cop' ? 'Police' : 'Pedestrian'); }
    for (const pl of this.otherPlayers) { check(pl.posX, pl.posY + 1.0, pl.posZ, pl.health, pl.username); }
    // Scan decorative aircraft for hover names
    const cxchunk = Math.floor(ox / 80), czchunk = Math.floor(oz / 80);
    for (let dzc = -1; dzc <= 1; dzc++) {
      for (let dxc = -1; dxc <= 1; dxc++) {
        const chunk = this.renderer.getCityChunk(cxchunk + dxc, czchunk + dzc);
        if (!chunk) continue;
        for (const da of chunk.decorativeAircraft) {
          check(da.x, 0.5, da.z, 200, da.type === 'helicopter' ? 'Helicopter' : 'Plane');
        }
      }
    }

    this.lookTargetHealth = bestHealth;
    this.lookTargetName = bestName;

    // Check supermarket robbery
    if (this.currentWeapon > 0 && !this.isInCar) {
      const sms = this.renderer.getNearbySupermarkets(ox, oz, maxDist);
      for (const sm of sms) {
        const vx = sm.x - ox, vz = sm.z - oz;
        const proj = vx * dirX + vz * dirZ;
        if (proj < 0 || proj > maxDist) continue;
        const cx = ox + dirX * proj, cz = oz + dirZ * proj;
        if (Math.hypot(sm.x - cx, sm.z - cz) < 4.0) {
          const key = `${sm.x},${sm.z}`;
          const now = Date.now();
          const last = this.renderer.supermarketLastPayout.get(key) || 0;
          if (now - last >= 600000) {
            this.renderer.supermarketLastPayout.set(key, now);
            const payout = 5000 + Math.floor(Math.random() * 5001);
            this.money += payout;
            this.moneyStacks.push({ x: sm.x, z: sm.z, amount: payout, yaw: 0, age: 0, lifetime: 5 });
          }
        }
      }
    }
  }

  private updateVehicleCollisions() {
    if (!this.isInCar || this.vehicleType === 'plane') return;

    const carRadius = 2.0;
    const actualSpeed = Math.hypot(this.carVx, this.carVz);
    const collisionDamage = actualSpeed < 2 ? 0 : actualSpeed * 3;

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
        this.carSpeed = Math.hypot(this.carVx, this.carVz);
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
        const impactForce = Math.max(2, actualSpeed * 0.5);
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

      const wasZero = p.remoteShootTimer === 0;
      p.remoteShootTimer += dt;
      if (!wasZero && p.remoteShootTimer < 0.15) continue;
      p.remoteShootTimer = 0;

      const rdirX = Math.sin(p.camYaw) * Math.cos(p.camPitch);
      const rdirY = -Math.sin(p.camPitch);
      const rdirZ = Math.cos(p.camYaw) * Math.cos(p.camPitch);

      const originY = p.posY + (p.isInCar ? 0.5 : 1.2);

      if (p.weapon === 4) {
        this.rockets.push({
          x: p.posX, y: originY, z: p.posZ,
          vx: rdirX * 40, vy: rdirY * 40, vz: rdirZ * 40,
          age: 0, lifetime: 3
        });
        this.playWeaponSound(4);
      } else {
        this.tracers.push({
          originX: p.posX, originY, originZ: p.posZ,
          dirX: rdirX, dirY: rdirY, dirZ: rdirZ,
          age: 0, lifetime: 0.3
        });
        this.muzzleFlashes.push({
          x: p.posX, y: originY, z: p.posZ,
          dirX: rdirX, dirY: rdirY, dirZ: rdirZ,
          weapon: p.weapon, age: 0, lifetime: 0.08
        });
        this.playWeaponSound(p.weapon);
      }
    }
  }

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
      if (this.isShooting) return { arms: 'finger_gun_fire', mark23: 'Shoot' };
      if (this._reloading) return { arms: 'finger_gun_fix', mark23: 'Reload' };
      if (this._pistolDrawTimer > 0) return { arms: 'finger_gun_idle', mark23: 'Draw' };
      return { arms: 'finger_gun_idle', mark23: 'Hide' };
    }
    if (this.punchTimer > 0) return { arms: 'jab.R', mark23: null };
    return { arms: 'relax', mark23: null };
  }

  private updatePassenger(dt: number) {
    this.carRocking = false;

    if (!this.isInCar || !this.passenger) {
      this.carRockPhase = 0;
      if (!this.passenger) this.hookerMoneyDrained = 0;
      return;
    }

    if (Math.abs(this.carSpeed) > 1) {
      this.carRockPhase = 0;
      return;
    }

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

    this.carRocking = true;
    this.carRockPhase += dt * 3;

    if (this.health < 100) {
      this.health = Math.min(100, this.health + HOOKER_HEAL_PER_SEC * dt);
    }

    if (this.money <= 0) {
      this.passenger = null;
      this.hookerMoneyDrained = 0;
      return;
    }
    if (this.hookerMoneyDrained < HOOKER_MAX_MONEY) {
      const drain = Math.min(
        HOOKER_MONEY_PER_SEC * dt,
        HOOKER_MAX_MONEY - this.hookerMoneyDrained,
        this.money
      );
      this.money -= Math.floor(drain);
      this.hookerMoneyDrained += drain;
    }
  }

  getCarRockOffset(): number {
    return 0;
  }
  getCarRockRoll(): number {
    if (!this.carRocking) return 0;
    const t = this.carRockPhase;
    return (Math.sin(t * 1.5) + Math.sin(t * 3.7) * 0.4) * 0.25;
  }

  private updateNPCInterpolation() {
    const lerpFactor = 0.15;

    for (const npc of this.serverNPCs) this.lerpNPC(npc, lerpFactor);
    for (const ped of this.serverPedestrians) this.lerpNPC(ped, lerpFactor);
  }

  private lerpNPC(npc: any, factor: number) {
    if (npc.lastUpdate === undefined || npc.targetX === undefined) return;
    npc.x += (npc.targetX - npc.x) * factor;
    npc.z += (npc.targetZ - npc.z) * factor;
    if (npc.targetY !== undefined) npc.y += (npc.targetY - npc.y) * factor;
    let yawDiff = npc.targetYaw - npc.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    npc.yaw += yawDiff * factor;
  }

  private updateTaxiMission(dt: number) {
    this.taxiMode = this.isInCar && this.vehicleType === 'taxi';

    if (!this.taxiMode) {
      this.taxiMission = null;
      this.taxiMarkers = [];
      this.taxiAttachedMeshes = [];
      this.taxiSearchTimer = 0;
      return;
    }

    if (this.taxiMission === null) {
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

        m.timer = Math.max(0, m.timer - dt);
        if (m.timer <= 0) {
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

        const dx = m.destinationX - this.carX, dz = m.destinationZ - this.carZ;
        const dropDist = Math.sqrt(dx * dx + dz * dz);
        if (dropDist < 6 && Math.abs(this.carSpeed) < 3) {
          this.money += m.fare;
          this.moneyStacks.push({
            x: m.destinationX, z: m.destinationZ,
            amount: m.fare,
            yaw: Math.random() * Math.PI * 2,
            age: 0, lifetime: 30,
          });
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

  private _lbCache: any[] = [];
  private _lbDirty = true;

  get leaderboardData() {
    if (!this._lbDirty) return this._lbCache;
    this._lbDirty = false;
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
    this._lbCache = all;
    return this._lbCache;
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

    ctx.fillStyle = '#ff0000';
    for (const p of this.otherPlayers) {
      ctx.beginPath(); ctx.arc(cx + (p.posX - this.carX) * scale, cy + (p.posZ - this.carZ) * scale, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#ffff00';
    for (const npc of [...this.serverNPCs, ...this.parkedCars]) {
      ctx.beginPath(); ctx.arc(cx + (npc.x - this.carX) * scale, cy + (npc.z - this.carZ) * scale, 2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#00ff00';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

    {
      const hbx = cx + (HOME_BASE_X - this.carX) * scale;
      const hby = cy + (HOME_BASE_Z - this.carZ) * scale;
      const pulse = 8 + Math.sin(performance.now() / 400) * 2;
      ctx.fillStyle = 'rgba(180, 100, 255, 0.3)';
      ctx.beginPath(); ctx.arc(hbx, hby, pulse, 0, Math.PI * 2); ctx.fill();
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
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', hbx, hby);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    if (this.taxiMission && this.taxiMission.state === 'deliver') {
      const m = this.taxiMission;
      const mx = cx + (m.destinationX - this.carX) * scale;
      const my = cy + (m.destinationZ - this.carZ) * scale;
      ctx.strokeStyle = 'rgba(255, 220, 0, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
      ctx.setLineDash([]);
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      ctx.strokeStyle = '#ffdc00';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffdc00';
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
    }
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